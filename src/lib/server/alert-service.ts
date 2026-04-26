import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";

import { assessIpoDataQuality, type IpoDataQualitySummary } from "@/lib/ipo-data-quality";
import { partitionAlertEligibleIpos } from "@/lib/ipo-classification";
import {
  atKstTime,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  getKstTodayKey,
  isSameKstDate,
  kstDateKey,
  parseKstDate,
  shiftKstDateKey,
} from "@/lib/date";
import { prisma } from "@/lib/db";
import { env, isEmailConfigured } from "@/lib/env";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { createDeliveryIdempotencyKey } from "@/lib/server/alert-delivery";
import { getDashboardSnapshot } from "@/lib/server/ipo-read-service";
import {
  ALERT_DISPATCH_LATE_GRACE_MS,
  ALERT_DISPATCH_MAX_ADVANCE_WAIT_MS,
  ALERT_DATA_FRESHNESS_MS,
  CLOSING_SOON_ALERTS_ENABLED,
  CLOSING_SOON_ALERT_HOUR,
  CLOSING_SOON_ALERT_MINUTE,
  CLOSING_TIME_HOUR,
  DAILY_ALERT_HOUR,
  DAILY_ALERT_MINUTE,
  type DispatchPreparedAlertsOptions,
  type PreparedJobSeed,
  canUseDatabase,
} from "@/lib/server/job-shared";
import {
  ensureAdminRecipient,
  resolveAlertRecipients,
} from "@/lib/server/recipient-service";
import { runDailySync } from "@/lib/server/ipo-sync-service";
import {
  buildWebPushPayloadFromJob,
  parseWebPushSubscriptionMetadata,
  sendWebPushNotification,
} from "@/lib/server/web-push-service";
import type {
  ChannelType,
  DispatchResult,
  IpoRecord,
  NotificationDeliveryRecord,
  NotificationJobRecord,
  PreparedAlertsResult,
  RecipientRecord,
} from "@/lib/types";

const DAILY_SYNC_IN_PROGRESS_STALE_MS = 20 * 60 * 1000;
const DAILY_SYNC_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
const DAILY_SYNC_WAIT_POLL_MS = 5_000;
const DAILY_SYNC_WAIT_TIMEOUT_MS = 90_000;
const DELIVERY_PENDING_STALE_MS = 15 * 60 * 1000;

let inFlightAlertSourceRefresh: Promise<void> | null = null;

type DailySyncLogAction = "started" | "completed" | "failed";

const isExpiredWebPushSubscriptionError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
};

type DailySyncLogEvent = {
  action: DailySyncLogAction;
  createdAt: Date;
};

type DailySyncTerminalLogEvent = {
  action: Exclude<DailySyncLogAction, "started">;
  createdAt: Date;
};

type AlertSourceRefreshDecision =
  | "skip_recent_success"
  | "wait_for_in_progress"
  | "cooldown_after_failure"
  | "start_refresh";

const getMinimumDepositAmount = (ipo: IpoRecord) => {
  if (
    ipo.offerPrice == null
    || ipo.minimumSubscriptionShares == null
    || ipo.depositRate == null
  ) {
    return null;
  }

  return Math.round(ipo.offerPrice * ipo.minimumSubscriptionShares * ipo.depositRate);
};

const getDetailUrl = (slug: string) => {
  const baseUrl = env.appBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/ipos/${encodeURIComponent(slug)}`;
};

const getAnalysisKeyPoints = (ipo: IpoRecord) =>
  ipo.latestAnalysis.keyPoints;

const getAnalysisWarnings = (ipo: IpoRecord) =>
  ipo.latestAnalysis.warnings;

const getAnalysisSummaryLine = (ipo: IpoRecord) =>
  ipo.latestAnalysis.keyPoints[0]
  ?? "현재는 확보된 공시와 청약 데이터를 바탕으로 체크 포인트를 정리하고 있습니다.";

const buildPublicScoreQuickLines = (ipo: IpoRecord) => [
  "정량 점수는 현재 비공개 상태입니다.",
  getAnalysisSummaryLine(ipo),
];

const buildDataQualityLines = (dataQuality: IpoDataQualitySummary) => {
  const lines = [
    `상태 ${dataQuality.label}`,
    dataQuality.detail,
  ];

  if (dataQuality.confirmedFacts.length > 0) {
    lines.push(`확인된 항목 ${dataQuality.confirmedFacts.join(", ")}`);
  }

  if (dataQuality.optionalMissing.length > 0) {
    lines.push(`추가 확인 중 ${dataQuality.optionalMissing.join(", ")}`);
  }

  if (dataQuality.sourceChecks.length > 0) {
    lines.push(`검증 경로 ${dataQuality.sourceChecks.join(" / ")}`);
  }

  return lines;
};

const buildDecisionTags = (ipo: IpoRecord, dataQuality: IpoDataQualitySummary) => {
  const minimumDeposit = getMinimumDepositAmount(ipo);
  const tags: string[] = ["#공모주", "#청약마감", "#공시확인"];

  if (minimumDeposit != null) {
    tags.push("#증거금확인");
  }

  if (getAnalysisWarnings(ipo).length > 0) {
    tags.push("#변동성주의");
  }

  if (dataQuality.status === "VERIFIED") {
    tags.push("#일정검증");
  } else if (dataQuality.status === "PARTIAL") {
    tags.push("#일부미확인");
  }

  return [...new Set(tags)];
};

export const buildClosingDayAnalysisMessage = (
  ipo: IpoRecord,
  dataQuality: IpoDataQualitySummary,
): NotificationJobRecord["payload"] => ({
  subject: `[공모주] ${ipo.name} 오늘 청약 마감 - 10시 분석`,
  tags: buildDecisionTags(ipo, dataQuality),
  intro:
    `${ipo.name}의 청약 마감 당일 10시 기준 공시 기반 체크 포인트입니다. `
    + `${dataQuality.status === "VERIFIED" ? "핵심 일정과 공모가는 검증된 값만 사용합니다." : "일부 항목은 추가 검증 상태를 함께 표시합니다."}`,
  webUrl: getDetailUrl(ipo.slug),
  sections: [
    {
      label: "빠른 판단",
      lines: [
        `최소청약주수 ${ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주`,
        `최소청약금액 ${formatMoney(getMinimumDepositAmount(ipo))}`,
        ...buildPublicScoreQuickLines(ipo),
      ],
    },
    {
      label: "핵심 요약",
      lines: [
        `시장 ${dataQuality.marketLabel}`,
        `주관사 ${dataQuality.leadManagerLabel}${ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}`,
        `청약 마감 ${formatDate(ipo.subscriptionEnd)} 16:00`,
        getAnalysisSummaryLine(ipo),
      ],
    },
    {
      label: "가격과 일정",
      lines: [
        `희망 밴드 ${ipo.priceBandLow?.toLocaleString("ko-KR") ?? "-"}원 ~ ${ipo.priceBandHigh?.toLocaleString("ko-KR") ?? "-"}원`,
        `확정 공모가 ${ipo.offerPrice?.toLocaleString("ko-KR") ?? "-"}원`,
        `증거금률 ${formatPercent(ipo.depositRate)}`,
        `환불일 ${ipo.refundDate ? formatDate(ipo.refundDate) : "-"}`,
        `상장 예정일 ${ipo.listingDate ? formatDate(ipo.listingDate) : "-"}`,
      ],
    },
    {
      label: "데이터 상태",
      lines: buildDataQualityLines(dataQuality),
    },
    {
      label: "10시 분석",
      lines: [
        ...getAnalysisKeyPoints(ipo),
      ],
    },
    {
      label: "주의 포인트",
      lines: getAnalysisWarnings(ipo).length
        ? getAnalysisWarnings(ipo)
        : ["특별한 경고 신호는 없지만 최종 판단은 공시와 증권사 안내를 함께 확인하세요."],
    },
  ],
  footer: [
    `데이터 상태: ${dataQuality.label}`,
    "정량 점수는 현재 비공개 상태입니다.",
    "최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.",
  ],
});

export const buildClosingSoonReminderMessage = (
  ipo: IpoRecord,
  dataQuality: IpoDataQualitySummary,
): NotificationJobRecord["payload"] => ({
  subject: `[공모주] ${ipo.name} 오늘 청약 마감 임박 알림`,
  tags: buildDecisionTags(ipo, dataQuality),
  intro: `${ipo.name} 청약 마감이 임박했습니다. 최종 주문 전 공시 기반 핵심 정보를 다시 확인하세요.`,
  webUrl: getDetailUrl(ipo.slug),
  sections: [
    {
      label: "지금 확인할 항목",
      lines: [
        `청약 마감 오늘 16:00`,
        `최소청약주수 ${ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주`,
        `최소청약금액 ${formatMoney(getMinimumDepositAmount(ipo))}`,
        ...buildPublicScoreQuickLines(ipo),
      ],
    },
    {
      label: "공모 정보",
      lines: [
        `시장 ${dataQuality.marketLabel}`,
        `주관사 ${dataQuality.leadManagerLabel}${ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}`,
        `확정 공모가 ${ipo.offerPrice?.toLocaleString("ko-KR") ?? "-"}원`,
        `증거금률 ${formatPercent(ipo.depositRate)}`,
      ],
    },
    {
      label: "데이터 상태",
      lines: buildDataQualityLines(dataQuality),
    },
    {
      label: "빠른 리마인드",
      lines: [
        getAnalysisSummaryLine(ipo),
        ...getAnalysisKeyPoints(ipo).slice(0, 2),
      ],
    },
    {
      label: "마감 전 체크",
      lines: getAnalysisWarnings(ipo).length
        ? getAnalysisWarnings(ipo)
        : ["최종 청약 전 증권사 주문 가능 시간과 환불일, 상장 예정일을 함께 확인하세요."],
    },
  ],
  footer: [
    `데이터 상태: ${dataQuality.label}`,
    "마감 직전에는 증권사별 주문 마감이 조금 다를 수 있으니 최종 화면을 다시 확인해 주세요.",
    "정량 점수는 현재 비공개 상태입니다.",
    "최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.",
  ],
});

const getTodayClosingIpos = (dashboard: Awaited<ReturnType<typeof getDashboardSnapshot>>, today: Date) =>
  dashboard.ipos.filter(
    (ipo) => isSameKstDate(ipo.subscriptionEnd, today) && ipo.status !== "WITHDRAWN",
  );

type AlertCandidateAssessment = {
  ipo: IpoRecord;
  dataQuality: IpoDataQualitySummary;
};

type PreparedAlertJobVariant = {
  jobIdSuffix: string;
  scheduledHour: number;
  scheduledMinute?: number;
  idempotencySuffix: string;
  buildPayload: (
    ipo: IpoRecord,
    dataQuality: IpoDataQualitySummary,
  ) => NotificationJobRecord["payload"];
};

type AlertPreparationWindow = {
  todayKey: string;
  todayClosingIpos: IpoRecord[];
  completionContext?: Record<string, unknown>;
};

type PrepareAlertsOptions = {
  source: string;
  alertLabel: string;
  startedMessage: string;
  fallbackBlockedMessage: string;
  completionMessage: (storedJobCount: number) => string;
  failureMessage: string;
  jobVariant: PreparedAlertJobVariant;
  resolveWindow: (
    dashboard: Awaited<ReturnType<typeof getDashboardSnapshot>>,
    now: Date,
  ) => AlertPreparationWindow;
  captureNowBeforeDashboard?: boolean;
};

const buildAlertCandidates = (ipos: IpoRecord[]): AlertCandidateAssessment[] =>
  ipos.map((ipo) => ({
    ipo,
    dataQuality: assessIpoDataQuality(ipo),
  }));

const toIpoNames = (ipos: Array<Pick<IpoRecord, "name">>) => ipos.map((ipo) => ipo.name);

export const buildAlertPreparationSummary = (
  todayClosingIpos: IpoRecord[],
  excludedSpacs: IpoRecord[],
  candidates: AlertCandidateAssessment[],
) => {
  const blocked = candidates.filter((candidate) => !candidate.dataQuality.shouldSendAlert);
  const partial = candidates.filter((candidate) => candidate.dataQuality.status === "PARTIAL");
  const ready = candidates.filter((candidate) => candidate.dataQuality.shouldSendAlert);

  return {
    totalClosingCount: todayClosingIpos.length,
    totalClosingIpoNames: toIpoNames(todayClosingIpos),
    eligibleCount: candidates.length,
    eligibleIpoNames: candidates.map((candidate) => candidate.ipo.name),
    excludedSpacCount: excludedSpacs.length,
    excludedSpacNames: toIpoNames(excludedSpacs),
    blockedCount: blocked.length,
    blockedIpos: blocked.map(({ ipo, dataQuality }) => ({
      name: ipo.name,
      criticalMissing: dataQuality.criticalMissing,
    })),
    partialCount: partial.length,
    partialIpos: partial.map(({ ipo, dataQuality }) => ({
      name: ipo.name,
      optionalMissing: dataQuality.optionalMissing,
    })),
    readyCount: ready.length,
    readyIpoNames: ready.map(({ ipo }) => ipo.name),
  };
};

export const buildAlertPreparationLogEntry = (
  alertLabel: string,
  summary: ReturnType<typeof buildAlertPreparationSummary>,
) => ({
  action: summary.totalClosingCount === 0 ? "no_alert_candidates" : "alert_candidate_summary",
  message:
    summary.totalClosingCount === 0
      ? `${alertLabel} 대상 청약 마감 종목이 없어 준비된 메일이 없습니다.`
      : `${alertLabel} 후보 ${summary.totalClosingCount}건 중 준비 ${summary.readyCount}건, 스팩 제외 ${summary.excludedSpacCount}건, 발송 보류 ${summary.blockedCount}건입니다.`,
  context: summary,
});

const toJobLogPreview = (job: NotificationJobRecord) => ({
  id: job.id,
  ipoSlug: job.ipoSlug,
  subject: job.payload.subject,
  scheduledFor: job.scheduledFor.toISOString(),
  status: job.status,
});

export const buildDispatchSelectionSummary = ({
  preparedJobs,
  persistedReadyJobs,
  mergedJobs,
  dueJobs,
  dispatchableJobs,
  staleJobs,
  recipients,
}: {
  preparedJobs: NotificationJobRecord[];
  persistedReadyJobs: NotificationJobRecord[];
  mergedJobs: NotificationJobRecord[];
  dueJobs: NotificationJobRecord[];
  dispatchableJobs: NotificationJobRecord[];
  staleJobs: NotificationJobRecord[];
  recipients: RecipientRecord[];
}) => {
  const recipientEmailAddresses = recipients.flatMap((recipient) =>
    recipient.channels
      .filter((channel) => channel.type === "EMAIL")
      .map((channel) => channel.address),
  );
  const recipientWebPushCount = recipients.reduce(
    (count, recipient) =>
      count + recipient.channels.filter((channel) => channel.type === "WEB_PUSH").length,
    0,
  );

  return {
    preparedJobCount: preparedJobs.length,
    persistedReadyJobCount: persistedReadyJobs.length,
    mergedJobCount: mergedJobs.length,
    dueJobCount: dueJobs.length,
    dispatchableJobCount: dispatchableJobs.length,
    staleJobCount: staleJobs.length,
    recipientCount: recipients.length,
    recipientEmailCount: recipientEmailAddresses.length,
    recipientWebPushCount,
    recipientEmailAddresses,
    dueJobs: dueJobs.map(toJobLogPreview),
    dispatchableJobs: dispatchableJobs.map(toJobLogPreview),
    staleJobs: staleJobs.map(toJobLogPreview),
  };
};

export const buildDispatchSelectionLogEntry = (
  alertLabel: string,
  summary: ReturnType<typeof buildDispatchSelectionSummary>,
) => ({
  action: summary.dispatchableJobCount === 0 ? "no_dispatchable_jobs" : "dispatch_selection_summary",
  message:
    summary.dispatchableJobCount === 0
      ? summary.dueJobCount === 0
        ? `${alertLabel} 발송 시점에 준비된 메일이 없어 실제 전송을 하지 않았습니다.`
        : `${alertLabel} 준비 메일 ${summary.dueJobCount}건 중 실제 전송 가능한 메일이 없어 발송을 건너뛰었습니다.`
      : `${alertLabel} 발송 대상 ${summary.dispatchableJobCount}건, 수신자 ${summary.recipientCount}명, 이메일 채널 ${summary.recipientEmailCount}개를 확인했습니다.`,
  context: summary,
});

const logExcludedSpacAlerts = async (
  source: string,
  alertLabel: string,
  ipos: IpoRecord[],
) => {
  if (ipos.length === 0) {
    return;
  }

  await logOperation({
    level: "INFO",
    source,
    action: "skipped_spac_ipos",
    message: `스팩 ${ipos.length}건은 ${alertLabel} 대상에서 제외했습니다.`,
    context: {
      count: ipos.length,
      ipos: ipos.map((ipo) => ipo.name),
    },
  });
};

const persistPreparedJobs = async (jobs: PreparedJobSeed[]) => {
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
      } satisfies NotificationJobRecord;
    }),
  );

  return storedJobs;
};

const getPersistedJobsByIdempotencySuffix = async (
  suffix: string,
  {
    scheduledFrom,
    scheduledTo,
    statuses = ["READY"],
  }: {
    scheduledFrom: Date;
    scheduledTo: Date;
    statuses?: NotificationJobRecord["status"][];
  },
) => {
  const jobs = await prisma.notificationJob.findMany({
    where: {
      status: {
        in: statuses,
      },
      idempotencyKey: {
        endsWith: suffix,
      },
      scheduledFor: {
        gte: scheduledFrom,
        lt: scheduledTo,
      },
    },
    orderBy: {
      scheduledFor: "asc",
    },
    include: {
      ipo: true,
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    ipoId: job.ipoId,
    ipoSlug: job.ipo.slug,
    alertType: job.alertType,
    scheduledFor: job.scheduledFor,
    payload: job.payload as NotificationJobRecord["payload"],
    status: job.status,
    idempotencyKey: job.idempotencyKey,
  }));
};

const getTodayReadyJobWindow = (now: Date) => {
  const todayKey = getKstTodayKey(now);

  return {
    scheduledFrom: atKstTime(todayKey, 0),
    scheduledTo: atKstTime(shiftKstDateKey(todayKey, 1), 0),
  };
};

const getRecentSuccessfulDailySync = async (now = new Date()) =>
  prisma.operationLog.findFirst({
    where: {
      source: "job:daily-sync",
      action: "completed",
      createdAt: {
        gte: new Date(now.getTime() - ALERT_DATA_FRESHNESS_MS),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

const getLatestDailySyncEvent = async (now = new Date()): Promise<DailySyncLogEvent | null> =>
  prisma.operationLog.findFirst({
    where: {
      source: "job:daily-sync",
      action: {
        in: ["started", "completed", "failed"],
      },
      createdAt: {
        gte: new Date(now.getTime() - Math.max(ALERT_DATA_FRESHNESS_MS, DAILY_SYNC_IN_PROGRESS_STALE_MS)),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      action: true,
      createdAt: true,
    },
  }) as Promise<DailySyncLogEvent | null>;

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isUniqueConstraintError = (error: unknown) =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && String((error as Prisma.PrismaClientKnownRequestError).code) === "P2002";

export const getDispatchWaitMs = ({
  now,
  scheduledFor,
  maxAdvanceWaitMs = ALERT_DISPATCH_MAX_ADVANCE_WAIT_MS,
}: {
  now: Date;
  scheduledFor: Date;
  maxAdvanceWaitMs?: number;
}) => {
  const waitMs = scheduledFor.getTime() - now.getTime();

  if (waitMs <= 0 || waitMs > maxAdvanceWaitMs) {
    return 0;
  }

  return waitMs;
};

export const isWithinDispatchGraceWindow = ({
  now,
  scheduledFor,
  lateGraceMs = ALERT_DISPATCH_LATE_GRACE_MS,
}: {
  now: Date;
  scheduledFor: Date;
  lateGraceMs?: number;
}) => now.getTime() <= scheduledFor.getTime() + lateGraceMs;

const waitForDailySyncSettlement = async (
  startedAt: Date,
  timeoutMs = DAILY_SYNC_WAIT_TIMEOUT_MS,
): Promise<DailySyncTerminalLogEvent | null> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(DAILY_SYNC_WAIT_POLL_MS);

    const terminalEvent = await prisma.operationLog.findFirst({
      where: {
        source: "job:daily-sync",
        action: {
          in: ["completed", "failed"],
        },
        createdAt: {
          gt: startedAt,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        action: true,
        createdAt: true,
      },
    }) as DailySyncTerminalLogEvent | null;

    if (terminalEvent) {
      return terminalEvent;
    }
  }

  return null;
};

export const decideAlertSourceRefreshAction = ({
  now,
  recentSuccessAt,
  latestDailySyncEvent,
}: {
  now: Date;
  recentSuccessAt?: Date | null;
  latestDailySyncEvent?: DailySyncLogEvent | null;
}): AlertSourceRefreshDecision => {
  if (recentSuccessAt && recentSuccessAt.getTime() >= now.getTime() - ALERT_DATA_FRESHNESS_MS) {
    return "skip_recent_success";
  }

  if (
    latestDailySyncEvent?.action === "started"
    && latestDailySyncEvent.createdAt.getTime() >= now.getTime() - DAILY_SYNC_IN_PROGRESS_STALE_MS
  ) {
    return "wait_for_in_progress";
  }

  if (
    latestDailySyncEvent?.action === "failed"
    && latestDailySyncEvent.createdAt.getTime() >= now.getTime() - DAILY_SYNC_RETRY_COOLDOWN_MS
  ) {
    return "cooldown_after_failure";
  }

  return "start_refresh";
};

export const shouldPrepareAlertsBeforeDispatch = ({
  useDatabase,
  persistedJobCount,
}: {
  useDatabase: boolean;
  persistedJobCount: number;
}) => !useDatabase || persistedJobCount === 0;

const ensureFreshAlertSourceData = async (source: string, now = new Date()) => {
  const recentSuccess = await getRecentSuccessfulDailySync(now);

  if (recentSuccess) {
    return false;
  }

  if (inFlightAlertSourceRefresh) {
    await logOperation({
      level: "INFO",
      source,
      action: "awaiting_source_refresh",
      message: "이미 진행 중인 알림용 일정 새로고침이 있어 완료를 기다립니다.",
      context: {
        waitTimeoutSeconds: DAILY_SYNC_WAIT_TIMEOUT_MS / 1000,
      },
    });

    await inFlightAlertSourceRefresh;
    return false;
  }

  const latestDailySyncEvent = await getLatestDailySyncEvent(now);
  const refreshDecision = decideAlertSourceRefreshAction({
    now,
    recentSuccessAt: null,
    latestDailySyncEvent,
  });

  if (refreshDecision === "wait_for_in_progress" && latestDailySyncEvent) {
    await logOperation({
      level: "INFO",
      source,
      action: "awaiting_source_refresh",
      message: "이미 진행 중인 공모주 동기화가 있어 완료를 기다립니다.",
      context: {
        startedAt: latestDailySyncEvent.createdAt,
        waitTimeoutSeconds: DAILY_SYNC_WAIT_TIMEOUT_MS / 1000,
      },
    });

    const settled = await waitForDailySyncSettlement(latestDailySyncEvent.createdAt);
    if (settled?.action === "completed") {
      return false;
    }

    if (settled?.action === "failed") {
      throw new Error("Concurrent daily-sync refresh failed while waiting for fresh alert source data.");
    }

    throw new Error("Timed out waiting for the in-progress daily-sync refresh to finish.");
  }

  if (refreshDecision === "cooldown_after_failure" && latestDailySyncEvent) {
    throw new Error(
      `Recent daily-sync refresh failed at ${latestDailySyncEvent.createdAt.toISOString()}; `
      + "skipping an immediate duplicate refresh attempt.",
    );
  }

  await logOperation({
    level: "INFO",
    source,
    action: "refresh_source_data",
    message: "알림 발송 전 최신 일정 검증을 위해 공모주 데이터를 다시 동기화합니다.",
    context: {
      freshnessMinutes: ALERT_DATA_FRESHNESS_MS / (60 * 1000),
    },
  });

  const refreshPromise = (async () => {
    await runDailySync({ forceRefresh: true });
  })();
  inFlightAlertSourceRefresh = refreshPromise;

  try {
    await refreshPromise;
  } finally {
    if (inFlightAlertSourceRefresh === refreshPromise) {
      inFlightAlertSourceRefresh = null;
    }
  }

  return true;
};

const logAlertQualitySignals = async (
  source: string,
  alertLabel: string,
  candidates: Array<{ ipo: IpoRecord; dataQuality: IpoDataQualitySummary }>,
) => {
  const blocked = candidates.filter((candidate) => !candidate.dataQuality.shouldSendAlert);
  const partial = candidates.filter((candidate) => candidate.dataQuality.status === "PARTIAL");

  if (blocked.length > 0) {
    await logOperation({
      level: "WARN",
      source,
      action: "skipped_unverified_ipos",
      message: `핵심 정보가 부족한 공모주 ${blocked.length}건의 ${alertLabel} 생성을 보류했습니다.`,
      context: {
        count: blocked.length,
        ipos: blocked.map((candidate) => ({
          name: candidate.ipo.name,
          criticalMissing: candidate.dataQuality.criticalMissing,
        })),
      },
    });
  }

  if (partial.length > 0) {
    await logOperation({
      level: "INFO",
      source,
      action: "partial_alert_data",
      message: `일부 항목이 미확인인 공모주 ${partial.length}건은 상태를 표시한 채 ${alertLabel}을 준비합니다.`,
      context: {
        count: partial.length,
        ipos: partial.map((candidate) => ({
          name: candidate.ipo.name,
          optionalMissing: candidate.dataQuality.optionalMissing,
        })),
      },
    });
  }
};

export { createDeliveryIdempotencyKey } from "@/lib/server/alert-delivery";

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
    payload.tags.length ? payload.tags.join(" ") : null,
    payload.tags.length ? "" : null,
    payload.intro,
    payload.webUrl ? "" : null,
    payload.webUrl ? `웹에서 보기: ${payload.webUrl}` : null,
    "",
    ...payload.sections.flatMap((section) => [section.label, ...section.lines, ""]),
    ...payload.footer,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderMessageHtml = (payload: NotificationJobRecord["payload"]) => {
  const tags = payload.tags.length
    ? `<p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#8f3410;">${payload.tags
        .map((tag) => escapeHtml(tag))
        .join(" ")}</p>`
    : "";

  const link = payload.webUrl
    ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(payload.webUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#cf5b2f;color:#ffffff;text-decoration:none;font-weight:700;">웹에서 보기</a></p>`
    : "";

  const sections = payload.sections
    .map(
      (section) => `
        <section style="margin:0 0 18px;">
          <h2 style="margin:0 0 8px;font-size:16px;color:#26140c;">${escapeHtml(section.label)}</h2>
          ${section.lines
            .map(
              (line) =>
                `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#49352a;">${escapeHtml(line)}</p>`,
            )
            .join("")}
        </section>
      `,
    )
    .join("");

  const footer = payload.footer
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#6c5548;">${escapeHtml(line)}</p>`,
    )
    .join("");

  return `
    <div style="max-width:640px;margin:0 auto;padding:28px 20px;background:#f8f2eb;font-family:Arial,Helvetica,sans-serif;color:#26140c;">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${escapeHtml(payload.subject)}</h1>
      ${tags}
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#49352a;">${escapeHtml(payload.intro)}</p>
      ${link}
      ${sections}
      <hr style="border:none;border-top:1px solid #e7d7cb;margin:24px 0;" />
      ${footer}
    </div>
  `;
};

const sendEmail = async (to: string, payload: NotificationJobRecord["payload"]) => {
  if (!isEmailConfigured()) {
    throw new Error("SMTP email settings are not configured.");
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: env.smtpFrom,
    to,
    subject: payload.subject,
    text: renderMessageText(payload),
    html: renderMessageHtml(payload),
  });

  return { providerMessageId: info.messageId };
};

const toNotificationDeliveryRecord = (delivery: {
  id: string;
  jobId: string;
  recipientId: string;
  channelType: NotificationDeliveryRecord["channelType"];
  channelAddress: string;
  status: NotificationDeliveryRecord["status"];
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
  idempotencyKey: string;
}): NotificationDeliveryRecord => ({
  id: delivery.id,
  jobId: delivery.jobId,
  recipientId: delivery.recipientId,
  channelType: delivery.channelType,
  channelAddress: delivery.channelAddress,
  status: delivery.status,
  providerMessageId: delivery.providerMessageId,
  errorMessage: delivery.errorMessage,
  createdAt: delivery.createdAt,
  sentAt: delivery.sentAt,
  idempotencyKey: delivery.idempotencyKey,
});

const claimNotificationDelivery = async ({
  jobId,
  recipientId,
  channelType,
  channelAddress,
  idempotencyKey,
  now,
}: {
  jobId: string;
  recipientId: string;
  channelType: ChannelType;
  channelAddress: string;
  idempotencyKey: string;
  now: Date;
}) => {
  const createPendingDelivery = async () =>
    prisma.notificationDelivery.create({
      data: {
        jobId,
        recipientId,
        channelType,
        channelAddress,
        status: "PENDING",
        idempotencyKey,
      },
    });

  try {
    await createPendingDelivery();
    return { action: "SEND" as const };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const existing = await prisma.notificationDelivery.findUnique({
    where: { idempotencyKey },
  });

  if (!existing) {
    try {
      await createPendingDelivery();
      return { action: "SEND" as const };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const raced = await prisma.notificationDelivery.findUnique({
      where: { idempotencyKey },
    });

    if (!raced) {
      return { action: "SEND" as const };
    }

    if (raced.status === "SENT") {
      return { action: "SKIP_SENT" as const, delivery: toNotificationDeliveryRecord(raced) };
    }

    return { action: "SKIP_IN_PROGRESS" as const, delivery: toNotificationDeliveryRecord(raced) };
  }

  if (existing.status === "SENT") {
    return { action: "SKIP_SENT" as const, delivery: toNotificationDeliveryRecord(existing) };
  }

  if (
    existing.status === "PENDING"
    && existing.createdAt.getTime() >= now.getTime() - DELIVERY_PENDING_STALE_MS
  ) {
    return { action: "SKIP_IN_PROGRESS" as const, delivery: toNotificationDeliveryRecord(existing) };
  }

  const reclaimed = await prisma.notificationDelivery.updateMany({
    where: {
      idempotencyKey,
      status: existing.status === "PENDING" ? "PENDING" : "FAILED",
      ...(existing.status === "PENDING"
        ? {
            createdAt: {
              lt: new Date(now.getTime() - DELIVERY_PENDING_STALE_MS),
            },
          }
        : {}),
    },
    data: {
      status: "PENDING",
      providerMessageId: null,
      sentAt: null,
      errorMessage:
        existing.status === "PENDING"
          ? "Stale pending delivery was reclaimed for retry."
          : null,
    },
  });

  if (reclaimed.count === 0) {
    const raced = await prisma.notificationDelivery.findUnique({
      where: { idempotencyKey },
    });

    if (!raced) {
      return { action: "SEND" as const };
    }

    if (raced.status === "SENT") {
      return { action: "SKIP_SENT" as const, delivery: toNotificationDeliveryRecord(raced) };
    }

    return { action: "SKIP_IN_PROGRESS" as const, delivery: toNotificationDeliveryRecord(raced) };
  }

  return { action: "SEND" as const };
};

const MISSING_VERIFIED_RECIPIENT_ERROR =
  "발송할 verified 알림 채널이 없습니다. /admin/recipients에서 이메일 또는 앱푸시 채널을 설정해 주세요.";

export const buildPreparedJobsForCandidates = (
  candidates: AlertCandidateAssessment[],
  todayKey: string,
  variant: PreparedAlertJobVariant,
): PreparedJobSeed[] => candidates.map(({ ipo, dataQuality }) => ({
  id: `prepared-${ipo.id}-${variant.jobIdSuffix}`,
  ipoId: ipo.id,
  ipoSlug: ipo.slug,
  alertType: "CLOSING_DAY_ANALYSIS" as const,
  scheduledFor: atKstTime(todayKey, variant.scheduledHour, variant.scheduledMinute ?? 0),
  payload: variant.buildPayload(ipo, dataQuality),
  status: "READY" as const,
  idempotencyKey: `${ipo.id}:${todayKey}:${variant.idempotencySuffix}`,
}));

const prepareAlerts = async ({
  source,
  alertLabel,
  startedMessage,
  fallbackBlockedMessage,
  completionMessage,
  failureMessage,
  jobVariant,
  resolveWindow,
  captureNowBeforeDashboard = false,
}: PrepareAlertsOptions): Promise<PreparedAlertsResult> => {
  await logOperation({
    level: "INFO",
    source,
    action: "started",
    message: startedMessage,
  });

  try {
    const useDatabase = await canUseDatabase();
    if (!useDatabase) {
      await logOperation({
        level: "WARN",
        source,
        action: "fallback_mode_blocked",
        message: fallbackBlockedMessage,
      });

      return {
        mode: "fallback",
        timestamp: new Date(),
        jobs: [],
      };
    }

    const persistedReadyJobs = await getPersistedJobsByIdempotencySuffix(
      `:${jobVariant.idempotencySuffix}`,
      {
        ...getTodayReadyJobWindow(new Date()),
        statuses: ["READY"],
      },
    );

    if (persistedReadyJobs.length > 0) {
      await logOperation({
        level: "INFO",
        source,
        action: "reuse_prepared_jobs",
        message: `기존 READY ${alertLabel} ${persistedReadyJobs.length}건을 재사용해 prepare 단계를 건너뜁니다.`,
        context: {
          jobs: persistedReadyJobs.length,
        },
      });

      return {
        mode: "database",
        timestamp: new Date(),
        jobs: persistedReadyJobs,
      };
    }

    await ensureFreshAlertSourceData(source);
    await ensureAdminRecipient();

    if ((await resolveAlertRecipients()).length === 0) {
      throw new Error(MISSING_VERIFIED_RECIPIENT_ERROR);
    }

    const capturedNow = captureNowBeforeDashboard ? new Date() : null;
    const dashboard = await getDashboardSnapshot();
    const { todayKey, todayClosingIpos, completionContext } = resolveWindow(
      dashboard,
      capturedNow ?? new Date(),
    );
    const { included: alertTargetIpos, excludedSpacs } = partitionAlertEligibleIpos(
      todayClosingIpos,
    );
    await logExcludedSpacAlerts(source, alertLabel, excludedSpacs);
    const candidates = buildAlertCandidates(alertTargetIpos);
    await logAlertQualitySignals(source, alertLabel, candidates);
    const readyCandidates = candidates.filter((candidate) => candidate.dataQuality.shouldSendAlert);
    const preparationSummary = buildAlertPreparationSummary(todayClosingIpos, excludedSpacs, candidates);

    await logOperation({
      level: "INFO",
      source,
      ...buildAlertPreparationLogEntry(alertLabel, preparationSummary),
    });

    const storedJobs = await persistPreparedJobs(
      buildPreparedJobsForCandidates(readyCandidates, todayKey, jobVariant),
    );

    await logOperation({
      level: "INFO",
      source,
      action: "completed",
      message: completionMessage(storedJobs.length),
      context: {
        jobs: storedJobs.length,
        ...(completionContext ?? {}),
        totalClosingCount: preparationSummary.totalClosingCount,
        excludedSpacCount: preparationSummary.excludedSpacCount,
        blockedCount: preparationSummary.blockedCount,
        partialCount: preparationSummary.partialCount,
      },
    });

    return {
      mode: "database",
      timestamp: new Date(),
      jobs: storedJobs,
    };
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source,
      action: "failed",
      message: failureMessage,
      context: toErrorContext(error),
    });
    throw error;
  }
};

export const prepareDailyAlerts = async (): Promise<PreparedAlertsResult> =>
  prepareAlerts({
    source: "job:prepare-daily-alerts",
    alertLabel: "10시 분석 알림",
    startedMessage: "10시 분석 알림 준비를 시작했습니다.",
    fallbackBlockedMessage: "DB 연결이 없어 10시 분석 알림 준비를 보류했습니다.",
    completionMessage: (storedJobCount) => (
      storedJobCount
        ? `10시 분석 알림 ${storedJobCount}건을 준비했습니다.`
        : "10시 분석 알림 대상이 없어 준비된 메일이 없습니다."
    ),
    failureMessage: "10시 분석 알림 준비에 실패했습니다.",
    jobVariant: {
      jobIdSuffix: "closing-day-analysis",
      scheduledHour: DAILY_ALERT_HOUR,
      scheduledMinute: DAILY_ALERT_MINUTE,
      idempotencySuffix: "closing-day-analysis",
      buildPayload: buildClosingDayAnalysisMessage,
    },
    resolveWindow: (dashboard, now) => {
      const todayKey = getKstTodayKey(now);
      const today = parseKstDate(todayKey);

      return {
        todayKey,
        todayClosingIpos: getTodayClosingIpos(dashboard, today),
      };
    },
  });

export const prepareClosingSoonAlerts = async (): Promise<PreparedAlertsResult> =>
  CLOSING_SOON_ALERTS_ENABLED
    ? prepareAlerts({
        source: "job:prepare-closing-alerts",
        alertLabel: "마감 30분 전 알림",
        startedMessage: "마감 30분 전 알림 준비를 시작했습니다.",
        fallbackBlockedMessage: "DB 연결이 없어 마감 30분 전 알림 준비를 보류했습니다.",
        completionMessage: (storedJobCount) => (
          storedJobCount
            ? `마감 30분 전 알림 ${storedJobCount}건을 준비했습니다.`
            : "마감 30분 전 알림 대상이 없어 준비된 메일이 없습니다."
        ),
        failureMessage: "마감 30분 전 알림 준비에 실패했습니다.",
        jobVariant: {
          jobIdSuffix: "closing-soon-reminder",
          scheduledHour: CLOSING_SOON_ALERT_HOUR,
          scheduledMinute: CLOSING_SOON_ALERT_MINUTE,
          idempotencySuffix: "closing-soon-reminder",
          buildPayload: buildClosingSoonReminderMessage,
        },
        captureNowBeforeDashboard: true,
        resolveWindow: (dashboard, now) => {
          const todayKey = getKstTodayKey(now);
          const closingCutoffAt = atKstTime(todayKey, CLOSING_TIME_HOUR);
          const today = parseKstDate(todayKey);

          return {
            todayKey,
            todayClosingIpos: now < closingCutoffAt ? getTodayClosingIpos(dashboard, today) : [],
            completionContext: {
              afterClose: now >= closingCutoffAt,
            },
          };
        },
      })
    : (async () => {
        const timestamp = new Date();
        await logOperation({
          level: "INFO",
          source: "job:prepare-closing-alerts",
          action: "disabled",
          message: "마감 30분 전 알림 준비는 현재 비활성화돼 실행하지 않습니다.",
        });
        return {
          mode: (await canUseDatabase()) ? "database" : "fallback",
          timestamp,
          jobs: [],
        };
      })();

const dispatchPreparedAlerts = async ({
  source,
  selectionLabel,
  startedMessage,
  completionMessage,
  failureMessage,
  prepare,
  isDispatchable = () => true,
  loadPersistedJobs,
}: DispatchPreparedAlertsOptions): Promise<DispatchResult> => {
  await logOperation({
    level: "INFO",
    source,
    action: "started",
    message: startedMessage,
  });

  try {
    const useDatabase = await canUseDatabase();
    let now = new Date();
    const persistedJobs =
      useDatabase && loadPersistedJobs
        ? await loadPersistedJobs(now)
        : [];
    const persistedReadyJobs = persistedJobs.filter((job) => job.status === "READY");
    const shouldPrepare = shouldPrepareAlertsBeforeDispatch({
      useDatabase,
      persistedJobCount: persistedJobs.length,
    });
    const prepared: PreparedAlertsResult = shouldPrepare
      ? await prepare()
      : {
          mode: "database",
          timestamp: now,
          jobs: [],
        };

    if (!shouldPrepare) {
      const finalizedJobCount = persistedJobs.length - persistedReadyJobs.length;
      await logOperation({
        level: "INFO",
        source,
        action: persistedReadyJobs.length > 0 ? "reuse_prepared_jobs" : "skip_prepare_existing_jobs",
        message:
          persistedReadyJobs.length > 0
            ? `기존 READY ${selectionLabel} ${persistedReadyJobs.length}건을 재사용해 prepare 단계를 건너뜁니다.`
            : `오늘 ${selectionLabel} job ${finalizedJobCount}건이 이미 처리돼 prepare 단계를 건너뜁니다.`,
        context: {
          readyJobs: persistedReadyJobs.length,
          finalizedJobs: finalizedJobCount,
        },
      });
    }
    const jobsById = new Map<string, NotificationJobRecord>();

    for (const job of prepared.jobs) {
      jobsById.set(job.id, job);
    }

    for (const job of persistedReadyJobs) {
      jobsById.set(job.id, job);
    }

    const mergedJobs = Array.from(jobsById.values());
    const nextScheduledFor = mergedJobs.reduce<Date | null>(
      (earliest, job) =>
        earliest && earliest.getTime() <= job.scheduledFor.getTime() ? earliest : job.scheduledFor,
      null,
    );

    if (nextScheduledFor) {
      const waitMs = getDispatchWaitMs({ now, scheduledFor: nextScheduledFor });

      if (waitMs > 0) {
        await logOperation({
          level: "INFO",
          source,
          action: "await_scheduled_dispatch",
          message: `${selectionLabel} 예약 시각 ${formatDateTime(nextScheduledFor)}까지 기다린 뒤 발송합니다.`,
          context: {
            waitSeconds: Math.round(waitMs / 1000),
            scheduledFor: nextScheduledFor,
          },
        });

        await sleep(waitMs);
        now = new Date();
      }
    }

    const recipients = await resolveAlertRecipients();
    const dueJobs = mergedJobs.filter((job) => job.scheduledFor <= now);
    const readyJobs = dueJobs.filter((job) => isDispatchable(job, now));
    const staleJobs = dueJobs.filter((job) => !isDispatchable(job, now));
    const staleSkippedCount = staleJobs.length;
    const deliveries: NotificationDeliveryRecord[] = [];

    await logOperation({
      level: "INFO",
      source,
      ...buildDispatchSelectionLogEntry(
        selectionLabel,
        buildDispatchSelectionSummary({
          preparedJobs: prepared.jobs,
          persistedReadyJobs,
          mergedJobs,
          dueJobs,
          dispatchableJobs: readyJobs,
          staleJobs,
          recipients,
        }),
      ),
    });

    if (readyJobs.length > 0 && recipients.length === 0) {
      throw new Error("No active verified email recipients are configured for alert delivery.");
    }

    if (useDatabase && staleJobs.length > 0) {
      await prisma.notificationJob.updateMany({
        where: {
          id: {
            in: staleJobs.map((job) => job.id),
          },
          status: "READY",
        },
        data: {
          status: "PARTIAL_FAILURE",
        },
      });
    }

    for (const job of readyJobs) {
      const jobDeliveries: Array<"SENT" | "FAILED" | "PENDING" | "SKIPPED"> = [];

      for (const recipient of recipients) {
        for (const channel of recipient.channels) {
          if (channel.type !== "EMAIL" && channel.type !== "WEB_PUSH") {
            continue;
          }

          const channelType = channel.type;
          const idempotencyKey = createDeliveryIdempotencyKey(
            job.idempotencyKey,
            recipient.id,
            channel.address,
            channelType,
          );

          if (useDatabase) {
            const claim = await claimNotificationDelivery({
              jobId: job.id,
              recipientId: recipient.id,
              channelType,
              channelAddress: channel.address,
              idempotencyKey,
              now,
            });

            if (claim.action === "SKIP_SENT") {
              deliveries.push({
                ...claim.delivery,
                status: "SKIPPED",
              });
              jobDeliveries.push("SKIPPED");
              continue;
            }

            if (claim.action === "SKIP_IN_PROGRESS") {
              deliveries.push(claim.delivery);
              jobDeliveries.push("PENDING");
              continue;
            }
          }

          try {
            const response =
              channelType === "EMAIL"
                ? await sendEmail(channel.address, job.payload)
                : await sendWebPushNotification({
                    subscription: (() => {
                      const subscription = parseWebPushSubscriptionMetadata(channel.metadata);
                      if (!subscription) {
                        throw new Error("저장된 Web Push 구독 정보가 올바르지 않습니다.");
                      }
                      return subscription;
                    })(),
                    payload: buildWebPushPayloadFromJob(job),
                  });
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
                  channelType,
                  channelAddress: channel.address,
                  status: "SENT",
                  providerMessageId: response.providerMessageId,
                  sentAt,
                  idempotencyKey,
                },
              });

              deliveries.push(toNotificationDeliveryRecord(delivery));
            } else {
              deliveries.push({
                id: `delivery-${recipient.id}-${job.id}`,
                jobId: job.id,
                recipientId: recipient.id,
                channelType,
                channelAddress: channel.address,
                status: "SENT",
                providerMessageId: response.providerMessageId,
                errorMessage: null,
                createdAt: sentAt,
                sentAt,
                idempotencyKey,
              });
            }

            jobDeliveries.push("SENT");
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown delivery failure";

            if (useDatabase && channelType === "WEB_PUSH" && isExpiredWebPushSubscriptionError(error)) {
              await prisma.recipientChannel.update({
                where: { id: channel.id },
                data: {
                  isVerified: false,
                  metadata: Prisma.JsonNull,
                },
              });
            }

            await logOperation({
              level: "ERROR",
              source,
              action: "delivery_failed",
              message: `${channelType === "EMAIL" ? "메일" : "앱푸시"} 발송에 실패했습니다.`,
              context: toErrorContext(error, {
                jobId: job.id,
                recipientId: recipient.id,
                channelType,
                channelAddress: channel.address,
              }),
            });

            if (useDatabase) {
              const delivery = await prisma.notificationDelivery.upsert({
                where: { idempotencyKey },
                update: {
                  status: "FAILED",
                  errorMessage: message,
                },
                create: {
                  jobId: job.id,
                  recipientId: recipient.id,
                  channelType,
                  channelAddress: channel.address,
                  status: "FAILED",
                  errorMessage: message,
                  idempotencyKey,
                },
              });

              deliveries.push(toNotificationDeliveryRecord(delivery));
            } else {
              deliveries.push({
                id: `delivery-failed-${recipient.id}-${job.id}`,
                jobId: job.id,
                recipientId: recipient.id,
                channelType,
                channelAddress: channel.address,
                status: "FAILED",
                providerMessageId: null,
                errorMessage: message,
                createdAt: new Date(),
                sentAt: null,
                idempotencyKey,
              });
            }
            jobDeliveries.push("FAILED");
          }
        }
      }

      if (useDatabase && !jobDeliveries.includes("PENDING")) {
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: jobDeliveries.every((status) => status === "SENT" || status === "SKIPPED")
              ? "SENT"
              : "PARTIAL_FAILURE",
          },
        });
      }
    }

    const sentCount = deliveries.filter((delivery) => delivery.status === "SENT").length;
    const failedCount = deliveries.filter((delivery) => delivery.status === "FAILED").length;
    const skippedCount = deliveries.filter((delivery) => delivery.status === "SKIPPED").length;
    const completedAt = new Date();

    await logOperation({
      level: failedCount > 0 ? "WARN" : "INFO",
      source,
      action: "completed",
      message: completionMessage({
        attempted: readyJobs.length,
        sentCount,
        failedCount,
        skippedCount,
        staleSkippedCount,
      }),
      context: {
        attempted: readyJobs.length,
        sentCount,
        failedCount,
        skippedCount,
        staleSkippedCount,
      },
    });

    return {
      mode: useDatabase ? "database" : "fallback",
      timestamp: completedAt,
      attempted: readyJobs.length,
      sentCount,
      failedCount,
      skippedCount,
      staleSkippedCount,
      deliveries,
    };
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source,
      action: "failed",
      message: failureMessage,
      context: toErrorContext(error),
    });
    throw error;
  }
};

export const dispatchAlerts = async (): Promise<DispatchResult> =>
  dispatchPreparedAlerts({
    source: "job:dispatch-alerts",
    selectionLabel: "10시 분석 알림",
    startedMessage: "10시 분석 알림 발송을 시작했습니다.",
    completionMessage: ({ attempted, sentCount, failedCount, skippedCount }) =>
      attempted === 0
        ? "10시 분석 알림 발송 대상이 없어 실제 알림은 보내지 않았습니다."
        : `10시 분석 알림 발송을 마쳤습니다. 신규 발송 ${sentCount}건, 실패 ${failedCount}건, 중복 건너뜀 ${skippedCount}건입니다.`,
    failureMessage: "10시 분석 알림 발송 작업이 실패했습니다.",
    prepare: prepareDailyAlerts,
    loadPersistedJobs: async (now) =>
      getPersistedJobsByIdempotencySuffix(":closing-day-analysis", {
        ...getTodayReadyJobWindow(now),
        statuses: ["READY", "SENT", "PARTIAL_FAILURE"],
      }),
    isDispatchable: (job, now) =>
      isWithinDispatchGraceWindow({
        now,
        scheduledFor: job.scheduledFor,
      }),
  });

export const dispatchClosingSoonAlerts = async (): Promise<DispatchResult> =>
  CLOSING_SOON_ALERTS_ENABLED
    ? dispatchPreparedAlerts({
        source: "job:dispatch-closing-alerts",
        selectionLabel: "마감 30분 전 알림 메일",
        startedMessage: "마감 30분 전 알림 메일 발송을 시작했습니다.",
        completionMessage: ({ attempted, sentCount, failedCount, skippedCount, staleSkippedCount }) =>
          attempted === 0
            ? "마감 30분 전 알림 메일 대상이 없어 실제 메일은 보내지 않았습니다."
            : `마감 30분 전 알림 메일 발송을 마쳤습니다. 신규 발송 ${sentCount}건, 실패 ${failedCount}건, 중복 건너뜀 ${skippedCount}건, 마감 후 차단 ${staleSkippedCount}건입니다.`,
        failureMessage: "마감 30분 전 알림 메일 발송 작업이 실패했습니다.",
        prepare: prepareClosingSoonAlerts,
        loadPersistedJobs: async (now) =>
          getPersistedJobsByIdempotencySuffix(":closing-soon-reminder", {
            ...getTodayReadyJobWindow(now),
            statuses: ["READY", "SENT", "PARTIAL_FAILURE"],
          }),
        isDispatchable: (job, now) => {
          const todayKey = kstDateKey(job.scheduledFor);
          return (
            isWithinDispatchGraceWindow({
              now,
              scheduledFor: job.scheduledFor,
            })
            && now < atKstTime(todayKey, CLOSING_TIME_HOUR)
          );
        },
      })
    : (async () => {
        const timestamp = new Date();
        await logOperation({
          level: "INFO",
          source: "job:dispatch-closing-alerts",
          action: "disabled",
          message: "마감 30분 전 알림 발송은 현재 비활성화돼 실행하지 않습니다.",
        });
        return {
          mode: (await canUseDatabase()) ? "database" : "fallback",
          timestamp,
          attempted: 0,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          staleSkippedCount: 0,
          deliveries: [],
        };
      })();
