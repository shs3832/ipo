import { buildAnalysis } from "@/lib/analysis";
import { atKstTime, parseKstDate } from "@/lib/date";
import type {
  AdminOverrideRecord,
  DashboardSnapshot,
  IpoRecord,
  NotificationDeliveryRecord,
  NotificationJobRecord,
  OperationLogRecord,
  RecipientRecord,
  SourceIpoRecord,
} from "@/lib/types";

const buildSampleRecords = (): SourceIpoRecord[] => {
  const today = new Date();
  const baseDate = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const year = baseDate.getUTCFullYear();
  const month = `${baseDate.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${baseDate.getUTCDate()}`.padStart(2, "0");
  const todayKey = `${year}-${month}-${day}`;
  const tomorrow = new Date(`${todayKey}T09:00:00+09:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const listed = new Date(`${todayKey}T09:00:00+09:00`);
  listed.setDate(listed.getDate() + 4);
  const listedKey = listed.toISOString().slice(0, 10);

  return [
    {
      sourceKey: "sample-source",
      name: "에이블데이터",
      market: "KOSDAQ",
      leadManager: "한국투자증권",
      coManagers: ["NH투자증권"],
      priceBandLow: 11000,
      priceBandHigh: 13000,
      offerPrice: 13000,
      minimumSubscriptionShares: 10,
      depositRate: 0.5,
      subscriptionStart: todayKey,
      subscriptionEnd: todayKey,
      refundDate: tomorrowKey,
      listingDate: listedKey,
      status: "OPEN",
      demandCompetitionRate: 1325.4,
      lockupRate: 22.4,
      floatRatio: 24,
      insiderSalesRatio: 8,
      marketMoodScore: 6,
      notes: ["AI 데이터 인프라 테마로 비교 기업 관심도가 높습니다."],
    },
    {
      sourceKey: "sample-source",
      name: "로보헬스",
      market: "KOSDAQ",
      leadManager: "미래에셋증권",
      coManagers: ["삼성증권"],
      priceBandLow: 18000,
      priceBandHigh: 21000,
      offerPrice: 18500,
      minimumSubscriptionShares: 10,
      depositRate: 0.5,
      subscriptionStart: tomorrowKey,
      subscriptionEnd: tomorrowKey,
      refundDate: listedKey,
      listingDate: listedKey,
      status: "UPCOMING",
      demandCompetitionRate: 522.1,
      lockupRate: 9.8,
      floatRatio: 38,
      insiderSalesRatio: 16,
      marketMoodScore: 1,
      notes: ["의료 자동화 수요는 견조하지만 밸류 논쟁이 남아 있습니다."],
    },
  ];
};

export const sampleSourceRecords = buildSampleRecords();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .replace(/-+/g, "-");

export const sampleIpos: IpoRecord[] = sampleSourceRecords.map((record, index) => {
  const slug = slugify(record.name);
  const analysis = buildAnalysis(record);

  return {
    id: `sample-ipo-${index + 1}`,
    slug,
    name: record.name,
    market: record.market,
    leadManager: record.leadManager,
    coManagers: record.coManagers ?? [],
    priceBandLow: record.priceBandLow ?? null,
    priceBandHigh: record.priceBandHigh ?? null,
    offerPrice: record.offerPrice ?? null,
    minimumSubscriptionShares: record.minimumSubscriptionShares ?? null,
    depositRate: record.depositRate ?? null,
    subscriptionStart: parseKstDate(record.subscriptionStart),
    subscriptionEnd: parseKstDate(record.subscriptionEnd),
    refundDate: record.refundDate ? parseKstDate(record.refundDate) : null,
    listingDate: record.listingDate ? parseKstDate(record.listingDate) : null,
    status: record.status ?? "UPCOMING",
    events: [
      {
        id: `${slug}-subscription`,
        type: "SUBSCRIPTION",
        title: `${record.name} 청약 마감`,
        eventDate: parseKstDate(record.subscriptionEnd),
      },
      ...(record.refundDate
        ? [
            {
              id: `${slug}-refund`,
              type: "REFUND" as const,
              title: `${record.name} 환불`,
              eventDate: parseKstDate(record.refundDate),
            },
          ]
        : []),
      ...(record.listingDate
        ? [
            {
              id: `${slug}-listing`,
              type: "LISTING" as const,
              title: `${record.name} 상장`,
              eventDate: parseKstDate(record.listingDate),
            },
          ]
        : []),
    ],
    latestAnalysis: analysis,
    latestSourceKey: record.sourceKey,
    sourceFetchedAt: new Date(),
  };
});

export const sampleRecipients: RecipientRecord[] = [
  {
    id: "recipient-admin",
    name: "관리자",
    status: "ACTIVE",
    inviteState: "INTERNAL",
    consentedAt: new Date(),
    unsubscribedAt: null,
    channels: [
      {
        id: "channel-admin-email",
        type: "EMAIL",
        address: "me@example.com",
        isPrimary: true,
        isVerified: true,
      },
      {
        id: "channel-admin-telegram",
        type: "TELEGRAM",
        address: "@ipo-alerts",
        isPrimary: false,
        isVerified: false,
      },
    ],
  },
];

export const sampleJobs = (ipos: IpoRecord[]): NotificationJobRecord[] => {
  const closing = ipos.filter((ipo) => ipo.status === "OPEN");

  return closing.map((ipo) => ({
    id: `job-${ipo.id}`,
    ipoId: ipo.id,
    ipoSlug: ipo.slug,
    alertType: "CLOSING_DAY_ANALYSIS",
    scheduledFor: atKstTime(ipo.subscriptionEnd.toISOString().slice(0, 10), 10),
    payload: {
      subject: `[공모주] ${ipo.name} 오늘 청약 마감 - 10시 분석`,
      tags: ["#샘플", "#청약추천", "#균등추천"],
      intro: `${ipo.name}의 청약 마감 당일 10시 기준 분석 요약입니다.`,
      webUrl: null,
      sections: [
        {
          label: "종목 정보",
          lines: [`시장 ${ipo.market}`, `주관사 ${ipo.leadManager}`],
        },
        {
          label: "분석 요약",
          lines: [
            `점수 ${ipo.latestAnalysis.score}점 (${ipo.latestAnalysis.ratingLabel})`,
            ...ipo.latestAnalysis.keyPoints,
          ],
        },
      ],
      footer: ["투자 참고용 요약이며 확정 수익을 보장하지 않습니다."],
    },
    status: "READY",
    idempotencyKey: `sample:${ipo.id}:closing-day`,
  }));
};

export const sampleDeliveries = (jobs: NotificationJobRecord[]): NotificationDeliveryRecord[] =>
  jobs.slice(0, 1).map((job) => ({
    id: `delivery-${job.id}`,
    jobId: job.id,
    recipientId: "recipient-admin",
    channelType: "EMAIL",
    channelAddress: "me@example.com",
    status: "SENT",
    providerMessageId: "sample-preview",
    errorMessage: null,
    sentAt: new Date(),
    idempotencyKey: `${job.id}:recipient-admin:EMAIL`,
  }));

export const sampleOverrides: AdminOverrideRecord[] = [
  {
    id: "override-1",
    slug: "에이블데이터",
    type: "NOTE",
    payload: {
      summary: "주관사 웹 페이지 기준 환불일 확인 필요",
    },
    isActive: true,
    note: "샘플 모드 수동 보정 예시",
  },
];

export const sampleOperationLogs: OperationLogRecord[] = [
  {
    id: "log-sync-success",
    level: "INFO",
    source: "job:daily-sync",
    action: "sync_completed",
    message: "공모주 일정 2건을 성공적으로 동기화했습니다.",
    context: { synced: 2, mode: "sample" },
    createdAt: new Date(),
  },
  {
    id: "log-alert-success",
    level: "INFO",
    source: "job:dispatch-alerts",
    action: "dispatch_completed",
    message: "10시 분석 메일 1건을 정상 발송했습니다.",
    context: { attempted: 1, sent: 1 },
    createdAt: new Date(),
  },
  {
    id: "log-source-warning",
    level: "WARN",
    source: "system:source",
    action: "sample_mode",
    message: "외부 소스가 비어 있어 샘플 데이터를 사용 중입니다.",
    context: { sourceKey: "sample-source" },
    createdAt: new Date(),
  },
];

export const buildSampleDashboard = (): DashboardSnapshot => {
  const jobs = sampleJobs(sampleIpos);
  const deliveries = sampleDeliveries(jobs);

  return {
    mode: "sample",
    generatedAt: new Date(),
    calendarMonth: new Date(),
    ipos: sampleIpos,
    recipients: sampleRecipients,
    jobs,
    deliveries,
    overrides: sampleOverrides,
    operationLogs: sampleOperationLogs,
  };
};
