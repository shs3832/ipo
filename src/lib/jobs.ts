import { createHash } from "node:crypto";

import {
  type AdminOverrideRecord,
  type DashboardSnapshot,
  type DispatchResult,
  type IpoRecord,
  type NotificationDeliveryRecord,
  type NotificationJobRecord,
  type PreparedAlertsResult,
  type RecipientRecord,
  type SourceIpoRecord,
  type SyncResult,
} from "@/lib/types";
import { buildAnalysis } from "@/lib/analysis";
import { atKstTime, formatDate, formatDateTime, isSameKstDate, kstDateKey, parseKstDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { env, isDatabaseEnabled, isEmailConfigured } from "@/lib/env";
import { buildSampleDashboard, sampleIpos, sampleRecipients, sampleSourceRecords } from "@/lib/mock-data";
import nodemailer from "nodemailer";

let databaseReachableCache: boolean | null = null;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .replace(/-+/g, "-");

const buildEvents = (record: SourceIpoRecord, ipoName: string) => [
  {
    type: "SUBSCRIPTION" as const,
    title: `${ipoName} 청약`,
    eventDate: parseKstDate(record.subscriptionStart),
  },
  ...(record.refundDate
    ? [
        {
          type: "REFUND" as const,
          title: `${ipoName} 환불`,
          eventDate: parseKstDate(record.refundDate),
        },
      ]
    : []),
  ...(record.listingDate
    ? [
        {
          type: "LISTING" as const,
          title: `${ipoName} 상장`,
          eventDate: parseKstDate(record.listingDate),
        },
      ]
    : []),
];

const buildMessage = (ipo: IpoRecord): NotificationJobRecord["payload"] => ({
  subject: `[공모주] ${ipo.name} 오늘 청약 마감 - 10시 분석`,
  intro: `${ipo.name}의 청약 마감 당일 10시 기준 분석 요약입니다.`,
  sections: [
    {
      label: "종목 개요",
      lines: [
        `시장 ${ipo.market}`,
        `주관사 ${ipo.leadManager}${ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}`,
        `청약 마감 ${formatDate(ipo.subscriptionEnd)} 16:00`,
      ],
    },
    {
      label: "가격과 일정",
      lines: [
        `희망 밴드 ${ipo.priceBandLow?.toLocaleString("ko-KR") ?? "-"}원 ~ ${ipo.priceBandHigh?.toLocaleString("ko-KR") ?? "-"}원`,
        `확정 공모가 ${ipo.offerPrice?.toLocaleString("ko-KR") ?? "-"}원`,
        `환불일 ${ipo.refundDate ? formatDate(ipo.refundDate) : "-"}`,
        `상장 예정일 ${ipo.listingDate ? formatDate(ipo.listingDate) : "-"}`,
      ],
    },
    {
      label: "10시 분석",
      lines: [
        `점수 ${ipo.latestAnalysis.score}점 (${ipo.latestAnalysis.ratingLabel})`,
        ipo.latestAnalysis.summary,
        ...ipo.latestAnalysis.keyPoints,
      ],
    },
    {
      label: "주의 포인트",
      lines: ipo.latestAnalysis.warnings.length
        ? ipo.latestAnalysis.warnings
        : ["특별한 경고 신호는 없지만 최종 판단은 공시와 증권사 안내를 함께 확인하세요."],
    },
  ],
  footer: ["투자 참고용 요약이며 확정 수익을 보장하지 않습니다."],
});

const toChecksum = (record: SourceIpoRecord) =>
  createHash("sha256").update(JSON.stringify(record)).digest("hex");

const normalizeIpo = (record: SourceIpoRecord): IpoRecord => {
  const analysis = buildAnalysis(record);

  return {
    id: slugify(record.name),
    slug: slugify(record.name),
    name: record.name,
    market: record.market,
    leadManager: record.leadManager,
    coManagers: record.coManagers ?? [],
    priceBandLow: record.priceBandLow ?? null,
    priceBandHigh: record.priceBandHigh ?? null,
    offerPrice: record.offerPrice ?? null,
    subscriptionStart: parseKstDate(record.subscriptionStart),
    subscriptionEnd: parseKstDate(record.subscriptionEnd),
    refundDate: record.refundDate ? parseKstDate(record.refundDate) : null,
    listingDate: record.listingDate ? parseKstDate(record.listingDate) : null,
    status: record.status ?? "UPCOMING",
    events: buildEvents(record, record.name).map((event) => ({
      id: `${slugify(record.name)}-${event.type.toLowerCase()}`,
      ...event,
    })),
    latestAnalysis: analysis,
    latestSourceKey: record.sourceKey,
    sourceFetchedAt: new Date(),
  };
};

const fetchSourceRecords = async (): Promise<SourceIpoRecord[]> => {
  if (!env.ipoSourceUrl) {
    return sampleSourceRecords;
  }

  const response = await fetch(env.ipoSourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`IPO source fetch failed: ${response.status}`);
  }

  return (await response.json()) as SourceIpoRecord[];
};

const canUseDatabase = async () => {
  if (!isDatabaseEnabled()) {
    return false;
  }

  if (databaseReachableCache != null) {
    return databaseReachableCache;
  }

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    databaseReachableCache = true;
    return true;
  } catch (error) {
    databaseReachableCache = false;
    const message = error instanceof Error ? error.message : "Unknown database connection error";
    console.warn(`Database unavailable, falling back to sample mode: ${message}`);
    return false;
  }
};

const toIpoRecordFromDb = async (slug: string): Promise<IpoRecord | null> => {
  const ipo = await prisma.ipo.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { eventDate: "asc" },
      },
      analyses: {
        orderBy: { generatedAt: "desc" },
        take: 1,
      },
      sourceSnapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!ipo || ipo.analyses.length === 0 || ipo.sourceSnapshots.length === 0) {
    return null;
  }

  return {
    id: ipo.id,
    slug: ipo.slug,
    name: ipo.name,
    market: ipo.market,
    leadManager: ipo.leadManager ?? "-",
    coManagers: Array.isArray(ipo.coManagers) ? (ipo.coManagers as string[]) : [],
    priceBandLow: ipo.priceBandLow,
    priceBandHigh: ipo.priceBandHigh,
    offerPrice: ipo.offerPrice,
    subscriptionStart: ipo.subscriptionStart ?? new Date(),
    subscriptionEnd: ipo.subscriptionEnd ?? new Date(),
    refundDate: ipo.refundDate,
    listingDate: ipo.listingDate,
    status: ipo.status,
    events: ipo.events.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      eventDate: event.eventDate,
    })),
    latestAnalysis: {
      score: ipo.analyses[0].score,
      ratingLabel: ipo.analyses[0].ratingLabel,
      summary: ipo.analyses[0].summary,
      keyPoints: Array.isArray(ipo.analyses[0].keyPoints) ? (ipo.analyses[0].keyPoints as string[]) : [],
      warnings: Array.isArray(ipo.analyses[0].warnings) ? (ipo.analyses[0].warnings as string[]) : [],
      generatedAt: ipo.analyses[0].generatedAt,
    },
    latestSourceKey: ipo.sourceSnapshots[0].sourceKey,
    sourceFetchedAt: ipo.sourceSnapshots[0].fetchedAt,
  };
};

const ensureAdminRecipient = async (): Promise<void> => {
  if (!(await canUseDatabase())) {
    return;
  }

  const email = env.adminEmail;
  const recipient = await prisma.recipient.upsert({
    where: { id: "admin-recipient" },
    update: {
      name: "관리자",
      status: "ACTIVE",
      inviteState: "INTERNAL",
      consentedAt: new Date(),
      unsubscribedAt: null,
    },
    create: {
      id: "admin-recipient",
      name: "관리자",
      status: "ACTIVE",
      inviteState: "INTERNAL",
      consentedAt: new Date(),
    },
  });

  await prisma.recipientChannel.upsert({
    where: {
      recipientId_type_address: {
        recipientId: recipient.id,
        type: "EMAIL",
        address: email,
      },
    },
    update: {
      isPrimary: true,
      isVerified: true,
    },
    create: {
      recipientId: recipient.id,
      type: "EMAIL",
      address: email,
      isPrimary: true,
      isVerified: true,
    },
  });

  await prisma.recipientChannel.upsert({
    where: {
      recipientId_type_address: {
        recipientId: recipient.id,
        type: "TELEGRAM",
        address: "@placeholder",
      },
    },
    update: {},
    create: {
      recipientId: recipient.id,
      type: "TELEGRAM",
      address: "@placeholder",
      isPrimary: false,
      isVerified: false,
      metadata: { enabled: false },
    },
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      recipientId: recipient.id,
      alertType: "CLOSING_DAY_ANALYSIS",
    },
  });

  if (!existingSubscription) {
    await prisma.subscription.create({
      data: {
        recipientId: recipient.id,
        alertType: "CLOSING_DAY_ANALYSIS",
        scope: { mode: "ALL_IPOS" },
        isActive: true,
      },
    });
  }
};

const createTransporter = () =>
  nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

const renderMessageText = (payload: NotificationJobRecord["payload"]) =>
  [
    payload.subject,
    "",
    payload.intro,
    "",
    ...payload.sections.flatMap((section) => [section.label, ...section.lines, ""]),
    ...payload.footer,
  ].join("\n");

const sendEmail = async (to: string, payload: NotificationJobRecord["payload"]) => {
  if (!isEmailConfigured()) {
    console.log(`EMAIL PREVIEW -> ${to}\n${renderMessageText(payload)}`);
    return { providerMessageId: "console-preview" };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: payload.subject,
    text: renderMessageText(payload),
  });

  return { providerMessageId: info.messageId };
};

const upsertDatabaseIpo = async (record: SourceIpoRecord) => {
  const slug = slugify(record.name);
  const analysis = buildAnalysis(record);
  const ipo = await prisma.ipo.upsert({
    where: { slug },
    update: {
      name: record.name,
      market: record.market,
      leadManager: record.leadManager,
      coManagers: record.coManagers ?? [],
      priceBandLow: record.priceBandLow ?? null,
      priceBandHigh: record.priceBandHigh ?? null,
      offerPrice: record.offerPrice ?? null,
      subscriptionStart: parseKstDate(record.subscriptionStart),
      subscriptionEnd: parseKstDate(record.subscriptionEnd),
      refundDate: record.refundDate ? parseKstDate(record.refundDate) : null,
      listingDate: record.listingDate ? parseKstDate(record.listingDate) : null,
      status: record.status ?? "UPCOMING",
    },
    create: {
      slug,
      name: record.name,
      market: record.market,
      leadManager: record.leadManager,
      coManagers: record.coManagers ?? [],
      priceBandLow: record.priceBandLow ?? null,
      priceBandHigh: record.priceBandHigh ?? null,
      offerPrice: record.offerPrice ?? null,
      subscriptionStart: parseKstDate(record.subscriptionStart),
      subscriptionEnd: parseKstDate(record.subscriptionEnd),
      refundDate: record.refundDate ? parseKstDate(record.refundDate) : null,
      listingDate: record.listingDate ? parseKstDate(record.listingDate) : null,
      status: record.status ?? "UPCOMING",
    },
  });

  await prisma.ipoEvent.deleteMany({
    where: { ipoId: ipo.id },
  });

  await prisma.ipoEvent.createMany({
    data: buildEvents(record, record.name).map((event) => ({
      ipoId: ipo.id,
      type: event.type,
      title: event.title,
      eventDate: event.eventDate,
    })),
  });

  await prisma.ipoSourceSnapshot.create({
    data: {
      ipoId: ipo.id,
      sourceKey: record.sourceKey,
      checksum: toChecksum(record),
      payload: record,
    },
  });

  await prisma.ipoAnalysis.create({
    data: {
      ipoId: ipo.id,
      score: analysis.score,
      ratingLabel: analysis.ratingLabel,
      summary: analysis.summary,
      keyPoints: analysis.keyPoints,
      warnings: analysis.warnings,
      generatedAt: analysis.generatedAt,
    },
  });

  return toIpoRecordFromDb(slug);
};

export const getDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  if (!(await canUseDatabase())) {
    return buildSampleDashboard();
  }

  await ensureAdminRecipient();

  const [ipos, recipients, jobs, deliveries, overrides] = await Promise.all([
    prisma.ipo.findMany({
      orderBy: { subscriptionEnd: "asc" },
      include: {
        events: { orderBy: { eventDate: "asc" } },
        analyses: { orderBy: { generatedAt: "desc" }, take: 1 },
        sourceSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
      },
    }),
    prisma.recipient.findMany({
      orderBy: { createdAt: "asc" },
      include: { channels: true },
    }),
    prisma.notificationJob.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 12,
      include: { ipo: true },
    }),
    prisma.notificationDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.adminOverride.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    mode: "database",
    generatedAt: new Date(),
    calendarMonth: new Date(),
    ipos: ipos.flatMap((ipo) => {
      if (!ipo.analyses.length || !ipo.sourceSnapshots.length) {
        return [];
      }

      return [
        {
          id: ipo.id,
          slug: ipo.slug,
          name: ipo.name,
          market: ipo.market,
          leadManager: ipo.leadManager ?? "-",
          coManagers: Array.isArray(ipo.coManagers) ? (ipo.coManagers as string[]) : [],
          priceBandLow: ipo.priceBandLow,
          priceBandHigh: ipo.priceBandHigh,
          offerPrice: ipo.offerPrice,
          subscriptionStart: ipo.subscriptionStart ?? new Date(),
          subscriptionEnd: ipo.subscriptionEnd ?? new Date(),
          refundDate: ipo.refundDate,
          listingDate: ipo.listingDate,
          status: ipo.status,
          events: ipo.events.map((event) => ({
            id: event.id,
            type: event.type,
            title: event.title,
            eventDate: event.eventDate,
          })),
          latestAnalysis: {
            score: ipo.analyses[0].score,
            ratingLabel: ipo.analyses[0].ratingLabel,
            summary: ipo.analyses[0].summary,
            keyPoints: Array.isArray(ipo.analyses[0].keyPoints) ? (ipo.analyses[0].keyPoints as string[]) : [],
            warnings: Array.isArray(ipo.analyses[0].warnings) ? (ipo.analyses[0].warnings as string[]) : [],
            generatedAt: ipo.analyses[0].generatedAt,
          },
          latestSourceKey: ipo.sourceSnapshots[0].sourceKey,
          sourceFetchedAt: ipo.sourceSnapshots[0].fetchedAt,
        },
      ];
    }),
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      status: recipient.status,
      inviteState: recipient.inviteState,
      consentedAt: recipient.consentedAt,
      unsubscribedAt: recipient.unsubscribedAt,
      channels: recipient.channels.map((channel) => ({
        id: channel.id,
        type: channel.type,
        address: channel.address,
        isPrimary: channel.isPrimary,
        isVerified: channel.isVerified,
      })),
    })),
    jobs: jobs.map((job) => ({
      id: job.id,
      ipoId: job.ipoId,
      ipoSlug: job.ipo.slug,
      alertType: job.alertType,
      scheduledFor: job.scheduledFor,
      payload: job.payload as NotificationJobRecord["payload"],
      status: job.status,
      idempotencyKey: job.idempotencyKey,
    })),
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      jobId: delivery.jobId,
      recipientId: delivery.recipientId,
      channelType: delivery.channelType,
      channelAddress: delivery.channelAddress,
      status: delivery.status,
      providerMessageId: delivery.providerMessageId,
      errorMessage: delivery.errorMessage,
      sentAt: delivery.sentAt,
      idempotencyKey: delivery.idempotencyKey,
    })),
    overrides: overrides.map((override) => ({
      id: override.id,
      slug: override.slug,
      type: override.type,
      payload: override.payload as AdminOverrideRecord["payload"],
      isActive: override.isActive,
      note: override.note,
    })),
  };
};

export const getIpoBySlug = async (slug: string): Promise<IpoRecord | null> => {
  const normalizedSlug = decodeURIComponent(slug);

  if (!(await canUseDatabase())) {
    return sampleIpos.find((ipo) => ipo.slug === normalizedSlug) ?? null;
  }

  return toIpoRecordFromDb(normalizedSlug);
};

export const runDailySync = async (): Promise<SyncResult> => {
  const sourceRecords = await fetchSourceRecords();

  if (!(await canUseDatabase())) {
    return {
      mode: "sample",
      synced: sourceRecords.length,
      ipos: sourceRecords.map(normalizeIpo),
      timestamp: new Date(),
    };
  }

  await ensureAdminRecipient();

  const ipos = await Promise.all(sourceRecords.map((record) => upsertDatabaseIpo(record)));

  return {
    mode: "database",
    synced: ipos.filter(Boolean).length,
    ipos: ipos.filter((ipo): ipo is IpoRecord => Boolean(ipo)),
    timestamp: new Date(),
  };
};

export const prepareDailyAlerts = async (): Promise<PreparedAlertsResult> => {
  const dashboard = await getDashboardSnapshot();
  const today = new Date();
  const closingIpos = dashboard.ipos.filter((ipo) => isSameKstDate(ipo.subscriptionEnd, today) && ipo.status !== "WITHDRAWN");

  const jobs = closingIpos.map((ipo) => ({
    id: `prepared-${ipo.id}`,
    ipoId: ipo.id,
    ipoSlug: ipo.slug,
    alertType: "CLOSING_DAY_ANALYSIS" as const,
    scheduledFor: atKstTime(kstDateKey(today), 10),
    payload: buildMessage(ipo),
    status: "READY" as const,
    idempotencyKey: `${ipo.id}:${kstDateKey(today)}:closing-day-analysis`,
  }));

  if (!(await canUseDatabase())) {
    return {
      mode: "sample",
      timestamp: new Date(),
      jobs,
    };
  }

  const storedJobs = await Promise.all(
    jobs.map(async (job) => {
      const saved = await prisma.notificationJob.upsert({
        where: { idempotencyKey: job.idempotencyKey },
        update: {
          scheduledFor: job.scheduledFor,
          payload: job.payload,
          status: "READY",
        },
        create: {
          ipoId: job.ipoId,
          alertType: job.alertType,
          scheduledFor: job.scheduledFor,
          payload: job.payload,
          status: "READY",
          idempotencyKey: job.idempotencyKey,
        },
        include: {
          ipo: true,
        },
      });

      return {
        id: saved.id,
        ipoId: saved.ipoId,
        ipoSlug: saved.ipo.slug,
        alertType: saved.alertType,
        scheduledFor: saved.scheduledFor,
        payload: saved.payload as NotificationJobRecord["payload"],
        status: saved.status,
        idempotencyKey: saved.idempotencyKey,
      };
    }),
  );

  return {
    mode: "database",
    timestamp: new Date(),
    jobs: storedJobs,
  };
};

const resolveRecipients = async (): Promise<RecipientRecord[]> => {
  if (!(await canUseDatabase())) {
    return sampleRecipients;
  }

  await ensureAdminRecipient();

  const recipients = await prisma.recipient.findMany({
    where: {
      status: "ACTIVE",
      unsubscribedAt: null,
      subscriptions: {
        some: {
          alertType: "CLOSING_DAY_ANALYSIS",
          isActive: true,
        },
      },
    },
    include: {
      channels: true,
    },
  });

  return recipients.map((recipient) => ({
    id: recipient.id,
    name: recipient.name,
    status: recipient.status,
    inviteState: recipient.inviteState,
    consentedAt: recipient.consentedAt,
    unsubscribedAt: recipient.unsubscribedAt,
    channels: recipient.channels.map((channel) => ({
      id: channel.id,
      type: channel.type,
      address: channel.address,
      isPrimary: channel.isPrimary,
      isVerified: channel.isVerified,
    })),
  }));
};

export const dispatchAlerts = async (): Promise<DispatchResult> => {
  const useDatabase = await canUseDatabase();
  const recipients = await resolveRecipients();
  const now = new Date();
  const prepared = await prepareDailyAlerts();
  const readyJobs = prepared.jobs.filter((job) => job.scheduledFor <= now);
  const deliveries: NotificationDeliveryRecord[] = [];

  for (const job of readyJobs) {
    const jobDeliveries: Array<"SENT" | "FAILED" | "PENDING" | "SKIPPED"> = [];

    for (const recipient of recipients) {
      for (const channel of recipient.channels) {
        if (channel.type !== "EMAIL") {
          continue;
        }

        const idempotencyKey = `${job.idempotencyKey}:${recipient.id}:${channel.type}`;

        if (useDatabase) {
          const existing = await prisma.notificationDelivery.findUnique({
            where: { idempotencyKey },
          });

          if (existing?.status === "SENT") {
            deliveries.push({
              id: existing.id,
              jobId: existing.jobId,
              recipientId: existing.recipientId,
              channelType: existing.channelType,
              channelAddress: existing.channelAddress,
              status: existing.status,
              providerMessageId: existing.providerMessageId,
              errorMessage: existing.errorMessage,
              sentAt: existing.sentAt,
              idempotencyKey: existing.idempotencyKey,
            });
            jobDeliveries.push("SENT");
            continue;
          }
        }

        try {
          const response = await sendEmail(channel.address, job.payload);
          const sentAt = new Date();

          if (useDatabase) {
            const delivery = await prisma.notificationDelivery.upsert({
              where: { idempotencyKey },
              update: {
                status: "SENT",
                providerMessageId: response.providerMessageId,
                sentAt,
                errorMessage: null,
              },
              create: {
                jobId: job.id,
                recipientId: recipient.id,
                channelType: "EMAIL",
                channelAddress: channel.address,
                status: "SENT",
                providerMessageId: response.providerMessageId,
                sentAt,
                idempotencyKey,
              },
            });

            deliveries.push({
              id: delivery.id,
              jobId: delivery.jobId,
              recipientId: delivery.recipientId,
              channelType: delivery.channelType,
              channelAddress: delivery.channelAddress,
              status: delivery.status,
              providerMessageId: delivery.providerMessageId,
              errorMessage: delivery.errorMessage,
              sentAt: delivery.sentAt,
              idempotencyKey: delivery.idempotencyKey,
            });
          } else {
            deliveries.push({
              id: `delivery-${recipient.id}-${job.id}`,
              jobId: job.id,
              recipientId: recipient.id,
              channelType: "EMAIL",
              channelAddress: channel.address,
              status: "SENT",
              providerMessageId: response.providerMessageId,
              errorMessage: null,
              sentAt,
              idempotencyKey,
            });
          }

          jobDeliveries.push("SENT");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown delivery failure";

          if (useDatabase) {
            await prisma.notificationDelivery.upsert({
              where: { idempotencyKey },
              update: {
                status: "FAILED",
                errorMessage: message,
              },
              create: {
                jobId: job.id,
                recipientId: recipient.id,
                channelType: "EMAIL",
                channelAddress: channel.address,
                status: "FAILED",
                errorMessage: message,
                idempotencyKey,
              },
            });
          }

          deliveries.push({
            id: `delivery-failed-${recipient.id}-${job.id}`,
            jobId: job.id,
            recipientId: recipient.id,
            channelType: "EMAIL",
            channelAddress: channel.address,
            status: "FAILED",
            providerMessageId: null,
            errorMessage: message,
            sentAt: null,
            idempotencyKey,
          });
          jobDeliveries.push("FAILED");
        }
      }
    }

    if (useDatabase) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: jobDeliveries.every((status) => status === "SENT") ? "SENT" : "PARTIAL_FAILURE",
        },
      });
    }
  }

  return {
    mode: useDatabase ? "database" : "sample",
    timestamp: now,
    attempted: readyJobs.length,
    deliveries,
  };
};

export const getRecentStatusSummary = async () => {
  const dashboard = await getDashboardSnapshot();
  return {
    mode: dashboard.mode,
    generatedAt: formatDateTime(dashboard.generatedAt),
    ipoCount: dashboard.ipos.length,
    recipientCount: dashboard.recipients.length,
    jobCount: dashboard.jobs.length,
    deliveryCount: dashboard.deliveries.length,
  };
};
