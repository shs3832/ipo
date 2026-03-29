import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getKstMonthRange, getKstTodayKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import { env, isDatabaseEnabled } from "@/lib/env";
import type { NotificationJobRecord, PreparedAlertsResult, SourceIpoRecord } from "@/lib/types";

let databaseReachableCache: { value: boolean; expiresAt: number } | null = null;

export const IPO_SOURCE_URL_CACHE_TTL_MS = 1000 * 60 * 30;
const DATABASE_REACHABLE_CACHE_TTL_MS = 60_000;
const DATABASE_UNREACHABLE_CACHE_TTL_MS = 10_000;
export const STALE_SOURCE_WITHDRAWAL_GRACE_DAYS = 2;
export const ALERT_DATA_FRESHNESS_MS = 90 * 60 * 1000;

export type SyncOptions = {
  forceRefresh?: boolean;
};

export type SourceFetchResult = {
  records: SourceIpoRecord[];
  excludedNonIpoSlugs: string[];
};

type SchedulerDefinition = {
  id: string;
  label: string;
  source: string;
  expectedHour: number;
  expectedMinute?: number;
};

export type PreparedJobSeed = {
  id: string;
  ipoId: string;
  ipoSlug: string;
  alertType: NotificationJobRecord["alertType"];
  scheduledFor: Date;
  payload: NotificationJobRecord["payload"];
  status: NotificationJobRecord["status"];
  idempotencyKey: string;
};

export type DispatchPreparedAlertsOptions = {
  source: string;
  startedMessage: string;
  completionMessage: (counts: {
    attempted: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    staleSkippedCount: number;
  }) => string;
  failureMessage: string;
  prepare: () => Promise<PreparedAlertsResult>;
  isDispatchable?: (job: NotificationJobRecord, now: Date) => boolean;
  loadPersistedReadyJobs?: (now: Date) => Promise<NotificationJobRecord[]>;
};

export const SCHEDULER_EARLY_GRACE_MS = 5 * 60 * 1000;
export const SCHEDULER_LATE_GRACE_MS = 30 * 60 * 1000;
export const schedulerDefinitions: SchedulerDefinition[] = [
  {
    id: "daily-sync",
    label: "공모주 데이터 동기화",
    source: "job:daily-sync",
    expectedHour: 6,
  },
  {
    id: "prepare-daily-alerts",
    label: "10시 분석 메일 준비",
    source: "job:prepare-daily-alerts",
    expectedHour: 9,
  },
  {
    id: "dispatch-alerts",
    label: "10시 분석 메일 발송",
    source: "job:dispatch-alerts",
    expectedHour: 10,
  },
  {
    id: "prepare-closing-alerts",
    label: "마감 30분 전 메일 준비",
    source: "job:prepare-closing-alerts",
    expectedHour: 15,
    expectedMinute: 25,
  },
  {
    id: "dispatch-closing-alerts",
    label: "마감 30분 전 메일 발송",
    source: "job:dispatch-closing-alerts",
    expectedHour: 15,
    expectedMinute: 30,
  },
];

export const CLOSING_TIME_HOUR = 16;
export const CLOSING_SOON_ALERT_HOUR = 15;
export const CLOSING_SOON_ALERT_MINUTE = 30;
export const ADMIN_RECIPIENT_ID = "admin-recipient";

export const IPO_READ_INCLUDE = Prisma.validator<Prisma.IpoInclude>()({
  events: { orderBy: { eventDate: "asc" } },
  analyses: { orderBy: { generatedAt: "desc" }, take: 1 },
  sourceSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
});

export type IpoReadModel = Prisma.IpoGetPayload<{
  include: typeof IPO_READ_INCLUDE;
}>;

export const hasLiveIpoSource = () => Boolean(env.ipoSourceUrl || env.opendartApiKey);

export const normalizeEmailAddress = (value: string) => value.trim().toLowerCase();

export const getDisplayRange = (date = new Date()) => {
  const currentMonth = getKstMonthRange(date, 0);
  const nextMonth = getKstMonthRange(date, 1);

  return {
    currentMonth,
    start: currentMonth.start,
    end: nextMonth.end,
    startKey: currentMonth.startKey,
    endKey: nextMonth.endKey,
  };
};

export const getDisplayRangeWhere = (date = new Date()) => {
  const range = getDisplayRange(date);
  const inDisplayRange = {
    gte: range.start,
    lte: range.end,
  };

  return {
    status: { not: "WITHDRAWN" as const },
    OR: [
      {
        subscriptionStart: inDisplayRange,
      },
      {
        subscriptionEnd: inDisplayRange,
      },
      {
        refundDate: inDisplayRange,
      },
      {
        listingDate: inDisplayRange,
      },
    ],
  };
};

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .replace(/-+/g, "-");

export const normalizeCompanyNameForMatching = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|\(주\)|㈜/g, "")
    .replace(/기업인수목적|스팩|spac/gi, "")
    .replace(/제(?=\d+호)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");

export const toListingOpenReturnRate = (
  offerPrice: number | null | undefined,
  listingOpenPrice: number | null | undefined,
) => {
  if (offerPrice == null || listingOpenPrice == null || offerPrice <= 0) {
    return null;
  }

  return Number((((listingOpenPrice - offerPrice) / offerPrice) * 100).toFixed(1));
};

export const buildSourceStatus = (start: string | null, end: string | null) => {
  if (!start || !end) {
    return "UPCOMING" as const;
  }

  const todayKey = getKstTodayKey();

  if (todayKey < start) {
    return "UPCOMING" as const;
  }

  if (todayKey > end) {
    return "CLOSED" as const;
  }

  return "OPEN" as const;
};

export const toChecksum = (record: SourceIpoRecord) =>
  createHash("sha256").update(JSON.stringify(record)).digest("hex");

export const toPrismaJsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export const isMissingSchemaError = (error: unknown) =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: string }).code === "P2022";

export const canUseDatabase = async () => {
  if (!isDatabaseEnabled()) {
    return false;
  }

  if (databaseReachableCache && databaseReachableCache.expiresAt > Date.now()) {
    return databaseReachableCache.value;
  }

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    databaseReachableCache = {
      value: true,
      expiresAt: Date.now() + DATABASE_REACHABLE_CACHE_TTL_MS,
    };
    return true;
  } catch (error) {
    databaseReachableCache = {
      value: false,
      expiresAt: Date.now() + DATABASE_UNREACHABLE_CACHE_TTL_MS,
    };
    const message = error instanceof Error ? error.message : "Unknown database connection error";
    console.warn(`Database unavailable, falling back to empty state: ${message}`);
    return false;
  }
};
