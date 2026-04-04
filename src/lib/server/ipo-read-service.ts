import {
  getAdminIpoScoreSummaries,
} from "@/lib/ipo-score-store";
import {
  atKstTime,
  formatDateTime,
  getKstTodayKey,
  kstDateKey,
  shiftKstDateKey,
} from "@/lib/date";
import { prisma } from "@/lib/db";
import { buildFallbackDashboard, buildFallbackPublicHomeSnapshot } from "@/lib/fallback-data";
import { getRecentOperationLogs } from "@/lib/ops-log";
import {
  IPO_READ_INCLUDE,
  SCHEDULER_EARLY_GRACE_MS,
  SCHEDULER_LATE_GRACE_MS,
  canUseDatabase,
  getDisplayRange,
  getDisplayRangeWhere,
  isMissingSchemaError,
  schedulerDefinitions,
} from "@/lib/server/job-shared";
import {
  mapDbIpoToIpoRecord,
  mapDbIpoToPublicIpoDetailRecord,
  toAdminOverrideRecord,
  toNotificationDeliveryRecord,
  toNotificationJobRecord,
  toRecipientRecord,
} from "@/lib/server/ipo-mappers";
import type {
  AdminStatusSummary,
  DashboardSnapshot,
  IpoAdminMetadata,
  IpoRecord,
  OperationLogRecord,
  PublicHomeSnapshot,
  PublicIpoDetailRecord,
  SchedulerStatusRecord,
} from "@/lib/types";

type ReadableIpoArtifacts = {
  analyses: readonly unknown[];
  sourceSnapshots: readonly unknown[];
};

const getSchedulerValidationLogs = async (date = new Date()): Promise<OperationLogRecord[]> => {
  const sources = schedulerDefinitions.map((definition) => definition.source);
  const since = atKstTime(shiftKstDateKey(getKstTodayKey(date), -1), 0);

  const logs = await prisma.operationLog.findMany({
    where: {
      source: { in: sources },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  return logs.map((log) => ({
    id: log.id,
    level: log.level as OperationLogRecord["level"],
    source: log.source,
    action: log.action,
    message: log.message,
    context:
      log.context && typeof log.context === "object" && !Array.isArray(log.context)
        ? (log.context as Record<string, unknown>)
        : null,
    createdAt: log.createdAt,
  }));
};

const getFirstLogAfterThreshold = (
  logs: OperationLogRecord[],
  action: "completed" | "failed",
  thresholdMs: number,
) => logs
  .filter((log) => log.action === action && log.createdAt.getTime() >= thresholdMs)
  .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];

export const buildSchedulerStatuses = (
  logs: OperationLogRecord[],
  now = new Date(),
): SchedulerStatusRecord[] => {
  const todayKey = getKstTodayKey(now);
  const appendLogMessage = (detail: string, log: OperationLogRecord | undefined) =>
    log?.message ? `${detail} ${log.message}` : detail;

  return schedulerDefinitions.map((definition) => {
    const expectedAt = atKstTime(todayKey, definition.expectedHour, definition.expectedMinute ?? 0);
    const sourceLogs = logs.filter((log) => log.source === definition.source);
    const todayLogs = sourceLogs.filter((log) => kstDateKey(log.createdAt) === todayKey);
    const completionThreshold = expectedAt.getTime() - SCHEDULER_EARLY_GRACE_MS;
    const completedAfterThreshold = getFirstLogAfterThreshold(todayLogs, "completed", completionThreshold);
    const failedAfterThreshold = getFirstLogAfterThreshold(todayLogs, "failed", completionThreshold);
    const earlyCompletion = todayLogs.find(
      (log) => log.action === "completed" && log.createdAt.getTime() < completionThreshold,
    );
    const lastCompletedAt = sourceLogs.find((log) => log.action === "completed")?.createdAt ?? null;
    const expectedAtLabel = formatDateTime(expectedAt, "yyyy.MM.dd HH:mm");
    const lastCompletedAtLabel = lastCompletedAt ? formatDateTime(lastCompletedAt) : null;

    if (now.getTime() < expectedAt.getTime()) {
      return {
        id: definition.id,
        label: definition.label,
        status: "PENDING",
        statusLabel: "대기",
        expectedAt,
        expectedAtLabel,
        lastCompletedAt,
        lastCompletedAtLabel,
        detail: lastCompletedAtLabel
          ? `예정 시각은 ${expectedAtLabel}이며 최근 성공은 ${lastCompletedAtLabel}입니다.`
          : `예정 시각은 ${expectedAtLabel}이며 아직 성공 이력이 없습니다.`,
      };
    }

    if (completedAfterThreshold) {
      const delayMs = completedAfterThreshold.createdAt.getTime() - expectedAt.getTime();
      const isLate = delayMs > SCHEDULER_LATE_GRACE_MS;
      const delayMinutes = Math.max(0, Math.round(delayMs / 60000));

      return {
        id: definition.id,
        label: definition.label,
        status: isLate ? "LATE" : "HEALTHY",
        statusLabel: isLate ? "지연" : "정상",
        expectedAt,
        expectedAtLabel,
        lastCompletedAt,
        lastCompletedAtLabel,
        detail: appendLogMessage(
          isLate
            ? `${expectedAtLabel} 기준으로 ${delayMinutes}분 늦게 실행됐습니다. 최근 성공 ${formatDateTime(completedAfterThreshold.createdAt)}.`
            : `예정 시각 ${expectedAtLabel} 기준으로 정상 실행됐습니다. 최근 성공 ${formatDateTime(completedAfterThreshold.createdAt)}.`,
          completedAfterThreshold,
        ),
      };
    }

    if (failedAfterThreshold) {
      return {
        id: definition.id,
        label: definition.label,
        status: "FAILED",
        statusLabel: "실패",
        expectedAt,
        expectedAtLabel,
        lastCompletedAt,
        lastCompletedAtLabel,
        detail: appendLogMessage(
          `예정 시각 이후 실패 로그가 있고 성공 로그가 없습니다. 최근 실패 ${formatDateTime(failedAfterThreshold.createdAt)}.`,
          failedAfterThreshold,
        ),
      };
    }

    if (earlyCompletion) {
      return {
        id: definition.id,
        label: definition.label,
        status: "MISSED",
        statusLabel: "미실행",
        expectedAt,
        expectedAtLabel,
        lastCompletedAt,
        lastCompletedAtLabel,
        detail: appendLogMessage(
          `예정 전 실행 ${formatDateTime(earlyCompletion.createdAt)}만 확인됐고, ${expectedAtLabel} 이후 성공 로그는 없습니다.`,
          earlyCompletion,
        ),
      };
    }

    return {
      id: definition.id,
      label: definition.label,
      status: "MISSED",
      statusLabel: "미실행",
      expectedAt,
      expectedAtLabel,
      lastCompletedAt,
      lastCompletedAtLabel,
      detail: lastCompletedAtLabel
        ? `오늘 ${expectedAtLabel} 기준 성공 로그가 없습니다. 최근 성공은 ${lastCompletedAtLabel}입니다.`
        : `오늘 ${expectedAtLabel} 기준 성공 로그가 없습니다.`,
    };
  });
};

export const hasReadableIpoArtifacts = <T extends ReadableIpoArtifacts>(
  ipo: T | null | undefined,
): ipo is T => Boolean(ipo && ipo.analyses.length > 0 && ipo.sourceSnapshots.length > 0);

export const filterReadableIpos = <T extends ReadableIpoArtifacts>(ipos: T[]) =>
  ipos.filter((ipo): ipo is T => hasReadableIpoArtifacts(ipo));

export const getIpoRecordBySlugFromDb = async (slug: string): Promise<IpoRecord | null> => {
  const ipo = await prisma.ipo.findUnique({
    where: { slug },
    include: IPO_READ_INCLUDE,
  });

  if (!hasReadableIpoArtifacts(ipo)) {
    return null;
  }

  return mapDbIpoToIpoRecord(ipo);
};

export const getDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  if (!(await canUseDatabase())) {
    return buildFallbackDashboard();
  }

  try {
    const displayRange = getDisplayRange();

    const [ipos, recipients, jobs, deliveries, overrides, schedulerLogs] = await Promise.all([
      prisma.ipo.findMany({
        where: getDisplayRangeWhere(),
        orderBy: { subscriptionEnd: "asc" },
        include: IPO_READ_INCLUDE,
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
      getSchedulerValidationLogs(),
    ]);
    const ipoScoreSummaries = await getAdminIpoScoreSummaries(
      ipos.map((ipo) => ({
        legacyIpoId: ipo.id,
        slug: ipo.slug,
        name: ipo.name,
      })),
    );
    const operationLogs = await getRecentOperationLogs(24);

    return {
      mode: "database",
      generatedAt: new Date(),
      calendarMonth: displayRange.currentMonth.start,
      ipos: filterReadableIpos(ipos).map((ipo) => mapDbIpoToIpoRecord(ipo)),
      recipients: recipients.map(toRecipientRecord),
      jobs: jobs.map(toNotificationJobRecord),
      deliveries: deliveries.map(toNotificationDeliveryRecord),
      overrides: overrides.map(toAdminOverrideRecord),
      operationLogs,
      schedulerStatuses: buildSchedulerStatuses(schedulerLogs),
      ipoScoreSummaries,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, falling back to dashboard fallback state.");
      return buildFallbackDashboard();
    }

    throw error;
  }
};

export const getPublicHomeSnapshot = async (): Promise<PublicHomeSnapshot> => {
  if (!(await canUseDatabase())) {
    return buildFallbackPublicHomeSnapshot();
  }

  try {
    const displayRange = getDisplayRange();

    const [ipos, recipientCount, jobCount] = await Promise.all([
      prisma.ipo.findMany({
        where: getDisplayRangeWhere(),
        orderBy: { subscriptionEnd: "asc" },
        include: IPO_READ_INCLUDE,
      }),
      prisma.recipient.count({
        where: {
          status: "ACTIVE",
          unsubscribedAt: null,
        },
      }),
      prisma.notificationJob.count({
        where: {
          status: "READY",
        },
      }),
    ]);

    return {
      mode: "database",
      generatedAt: new Date(),
      calendarMonth: displayRange.currentMonth.start,
      ipos: filterReadableIpos(ipos).map((ipo) => mapDbIpoToIpoRecord(ipo)),
      recipientCount,
      jobCount,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, falling back to public home fallback state.");
      return buildFallbackPublicHomeSnapshot();
    }

    throw error;
  }
};

export const buildAdminStatusSummary = (dashboard: DashboardSnapshot): AdminStatusSummary => {
  const errorCount = dashboard.operationLogs.filter((log) => log.level === "ERROR").length;
  const warnCount = dashboard.operationLogs.filter((log) => log.level === "WARN").length;

  return {
    mode: dashboard.mode,
    generatedAt: formatDateTime(dashboard.generatedAt),
    ipoCount: dashboard.ipos.length,
    recipientCount: dashboard.recipients.length,
    jobCount: dashboard.jobs.length,
    deliveryCount: dashboard.deliveries.length,
    errorCount,
    warnCount,
  };
};

export const getPublicIpoBySlug = async (slug: string): Promise<PublicIpoDetailRecord | null> => {
  const normalizedSlug = decodeURIComponent(slug);

  if (!(await canUseDatabase())) {
    return null;
  }

  let ipo;
  try {
    ipo = await prisma.ipo.findUnique({
      where: { slug: normalizedSlug },
      include: IPO_READ_INCLUDE,
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, returning no public IPO detail.");
      return null;
    }

    throw error;
  }

  if (!hasReadableIpoArtifacts(ipo)) {
    return null;
  }

  return mapDbIpoToPublicIpoDetailRecord(ipo);
};

export const getIpoAdminMetadataBySlug = async (slug: string): Promise<IpoAdminMetadata | null> => {
  const normalizedSlug = decodeURIComponent(slug);

  if (!(await canUseDatabase())) {
    return null;
  }

  let latestSnapshot;
  try {
    latestSnapshot = await prisma.ipoSourceSnapshot.findFirst({
      where: {
        ipo: {
          slug: normalizedSlug,
        },
      },
      orderBy: {
        fetchedAt: "desc",
      },
      select: {
        sourceKey: true,
        fetchedAt: true,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, returning no admin metadata.");
      return null;
    }

    throw error;
  }

  if (!latestSnapshot) {
    return null;
  }

  return {
    latestSourceKey: latestSnapshot.sourceKey,
    sourceFetchedAt: latestSnapshot.fetchedAt,
  };
};

export const getIpoBySlug = async (slug: string): Promise<IpoRecord | null> => {
  const normalizedSlug = decodeURIComponent(slug);

  if (!(await canUseDatabase())) {
    return null;
  }

  try {
    return await getIpoRecordBySlugFromDb(normalizedSlug);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, returning no IPO detail.");
      return null;
    }

    throw error;
  }
};
