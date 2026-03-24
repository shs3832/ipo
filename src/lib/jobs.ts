import { createHash } from "node:crypto";

import {
  type AdminOverrideRecord,
  type AdminStatusSummary,
  type DashboardSnapshot,
  type DispatchResult,
  type IpoAdminMetadata,
  type IpoRecord,
  type OperationLogRecord,
  type NotificationDeliveryRecord,
  type NotificationJobRecord,
  type PreparedAlertsResult,
  type PublicHomeSnapshot,
  type PublicIpoDetailRecord,
  type RecipientRecord,
  type SchedulerStatusRecord,
  type SourceIpoRecord,
  type SyncResult,
} from "@/lib/types";
import { buildAnalysis, buildAnalysisScoreDisplay } from "@/lib/analysis";
import {
  atKstTime,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  getKstMonthRange,
  getKstTodayKey,
  isOnOrAfterKstDayOffset,
  isSameKstDate,
  kstDateKey,
  parseKstDate,
  shiftKstDateKey,
} from "@/lib/date";
import { prisma } from "@/lib/db";
import { env, isDatabaseEnabled, isEmailConfigured } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";
import { buildFallbackDashboard, buildFallbackPublicHomeSnapshot } from "@/lib/fallback-data";
import { getRecentOperationLogs, logOperation, toErrorContext } from "@/lib/ops-log";
import { fetchKindListingDates } from "@/lib/sources/kind-listings";
import { fetchKindOfferDetails } from "@/lib/sources/kind-offer-details";
import { fetchKindStockPriceSnapshot } from "@/lib/sources/kind-stock-prices";
import { fetchOpendartCurrentMonthIpos } from "@/lib/sources/opendart-ipo";
import nodemailer from "nodemailer";

let databaseReachableCache: { value: boolean; expiresAt: number } | null = null;
const IPO_SOURCE_URL_CACHE_TTL_MS = 1000 * 60 * 30;
const DATABASE_REACHABLE_CACHE_TTL_MS = 60_000;
const DATABASE_UNREACHABLE_CACHE_TTL_MS = 10_000;
const STALE_SOURCE_WITHDRAWAL_GRACE_DAYS = 2;
type SyncOptions = {
  forceRefresh?: boolean;
};

type SchedulerDefinition = {
  id: string;
  label: string;
  source: string;
  expectedHour: number;
  expectedMinute?: number;
};

type PreparedJobSeed = {
  id: string;
  ipoId: string;
  ipoSlug: string;
  alertType: NotificationJobRecord["alertType"];
  scheduledFor: Date;
  payload: NotificationJobRecord["payload"];
  status: NotificationJobRecord["status"];
  idempotencyKey: string;
};

type DispatchPreparedAlertsOptions = {
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

const SCHEDULER_EARLY_GRACE_MS = 5 * 60 * 1000;
const SCHEDULER_LATE_GRACE_MS = 30 * 60 * 1000;
const schedulerDefinitions: SchedulerDefinition[] = [
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

const CLOSING_TIME_HOUR = 16;
const CLOSING_SOON_ALERT_HOUR = 15;
const CLOSING_SOON_ALERT_MINUTE = 30;
const hasLiveIpoSource = () => Boolean(env.ipoSourceUrl || env.opendartApiKey);

const getDisplayRange = (date = new Date()) => {
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

const getDisplayRangeWhere = (date = new Date()) => {
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

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "")
    .replace(/-+/g, "-");

const normalizeCompanyNameForMatching = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|\(주\)|㈜/g, "")
    .replace(/기업인수목적|스팩|spac/gi, "")
    .replace(/제(?=\d+호)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");

const toListingOpenReturnRate = (offerPrice: number | null | undefined, listingOpenPrice: number | null | undefined) => {
  if (offerPrice == null || listingOpenPrice == null || offerPrice <= 0) {
    return null;
  }

  return Number((((listingOpenPrice - offerPrice) / offerPrice) * 100).toFixed(1));
};

const mergeKindListingMetadata = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: SyncOptions = {},
): Promise<SourceIpoRecord[]> => {
  if (records.length === 0) {
    return records;
  }

  const kindListings = await fetchKindListingDates({ forceRefresh });
  if (kindListings.length === 0) {
    return records;
  }

  const listingDateByName = new Map(
    kindListings.map(
      (listing) => [normalizeCompanyNameForMatching(listing.name), listing] as const,
    ),
  );

  return records.map((record) => {
    const kindListing = listingDateByName.get(normalizeCompanyNameForMatching(record.name));
    if (!kindListing) {
      return record;
    }

    const notes = record.notes ?? [];
    const kindNote = `KIND 신규상장기업현황 기준 상장예정일 ${kindListing.listingDate}`;

    return {
      ...record,
      kindIssueCode: kindListing.isurCd,
      kindBizProcessNo: kindListing.bzProcsNo,
      listingDate: kindListing.listingDate,
      notes: notes.includes(kindNote) ? notes : [...notes, kindNote],
    };
  });
};

const mergeOpendartScoringEnrichment = (
  records: SourceIpoRecord[],
  opendartRecords: SourceIpoRecord[],
): SourceIpoRecord[] => {
  if (records.length === 0 || opendartRecords.length === 0) {
    return records;
  }

  const opendartByName = new Map(
    opendartRecords.map((record) => [normalizeCompanyNameForMatching(record.name), record] as const),
  );

  return records.map((record) => {
    const opendart = opendartByName.get(normalizeCompanyNameForMatching(record.name));
    if (!opendart) {
      return record;
    }

    return {
      ...record,
      priceBandLow: record.priceBandLow ?? opendart.priceBandLow ?? null,
      priceBandHigh: record.priceBandHigh ?? opendart.priceBandHigh ?? null,
      minimumSubscriptionShares: record.minimumSubscriptionShares ?? opendart.minimumSubscriptionShares ?? null,
      depositRate: record.depositRate ?? opendart.depositRate ?? null,
      demandCompetitionRate: record.demandCompetitionRate ?? opendart.demandCompetitionRate ?? null,
      lockupRate: record.lockupRate ?? opendart.lockupRate ?? null,
      insiderSalesRatio: record.insiderSalesRatio ?? opendart.insiderSalesRatio ?? null,
      financialReportLabel: record.financialReportLabel ?? opendart.financialReportLabel ?? null,
      revenue: record.revenue ?? opendart.revenue ?? null,
      previousRevenue: record.previousRevenue ?? opendart.previousRevenue ?? null,
      revenueGrowthRate: record.revenueGrowthRate ?? opendart.revenueGrowthRate ?? null,
      operatingIncome: record.operatingIncome ?? opendart.operatingIncome ?? null,
      previousOperatingIncome: record.previousOperatingIncome ?? opendart.previousOperatingIncome ?? null,
      operatingMarginRate: record.operatingMarginRate ?? opendart.operatingMarginRate ?? null,
      netIncome: record.netIncome ?? opendart.netIncome ?? null,
      previousNetIncome: record.previousNetIncome ?? opendart.previousNetIncome ?? null,
      totalAssets: record.totalAssets ?? opendart.totalAssets ?? null,
      totalLiabilities: record.totalLiabilities ?? opendart.totalLiabilities ?? null,
      totalEquity: record.totalEquity ?? opendart.totalEquity ?? null,
      debtRatio: record.debtRatio ?? opendart.debtRatio ?? null,
      notes: [...new Set([...(record.notes ?? []), ...(opendart.notes ?? [])])],
    };
  });
};

const enrichKindOfferMetadata = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: SyncOptions = {},
): Promise<SourceIpoRecord[]> => {
  if (records.length === 0) {
    return records;
  }

  return Promise.all(
    records.map(async (record) => {
      if (!record.kindIssueCode || !record.kindBizProcessNo) {
        return record;
      }

      const kindDetails = await fetchKindOfferDetails(record.kindIssueCode, record.kindBizProcessNo, { forceRefresh })
        .catch(() => null);
      if (!kindDetails) {
        return record;
      }

      const notes = record.notes ?? [];
      const nextNotes = [...notes];

      if (kindDetails.offerPrice != null) {
        const kindNote = `KIND 신규상장기업 상세 기준 확정 공모가 ${kindDetails.offerPrice.toLocaleString("ko-KR")}원`;
        if (!nextNotes.includes(kindNote)) {
          nextNotes.push(kindNote);
        }
      }

      if (kindDetails.generalSubscriptionCompetitionRate != null) {
        const kindNote = `KIND 공모정보 기준 일반청약 경쟁률 ${kindDetails.generalSubscriptionCompetitionRate}:1`;
        if (!nextNotes.includes(kindNote)) {
          nextNotes.push(kindNote);
        }
      }

      if (kindDetails.floatRatio != null) {
        const kindNote = `KIND 회사개요 기준 유통가능물량 ${kindDetails.floatRatio}%`;
        if (!nextNotes.includes(kindNote)) {
          nextNotes.push(kindNote);
        }
      }

      return {
        ...record,
        offerPrice: kindDetails.offerPrice ?? record.offerPrice ?? null,
        generalSubscriptionCompetitionRate:
          kindDetails.generalSubscriptionCompetitionRate ?? record.generalSubscriptionCompetitionRate ?? null,
        irStart: kindDetails.irStart ?? record.irStart ?? null,
        irEnd: kindDetails.irEnd ?? record.irEnd ?? null,
        demandForecastStart: kindDetails.demandForecastStart ?? record.demandForecastStart ?? null,
        demandForecastEnd: kindDetails.demandForecastEnd ?? record.demandForecastEnd ?? null,
        tradableShares: kindDetails.tradableShares ?? record.tradableShares ?? null,
        floatRatio: kindDetails.floatRatio ?? record.floatRatio ?? null,
        refundDate: kindDetails.refundDate ?? record.refundDate ?? null,
        listingDate: kindDetails.listingDate ?? record.listingDate ?? null,
        notes: nextNotes,
      } satisfies SourceIpoRecord;
    }),
  );
};

const enrichListingOpenMetrics = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: SyncOptions = {},
): Promise<SourceIpoRecord[]> => {
  if (records.length === 0) {
    return records;
  }

  const todayKey = getKstTodayKey();
  const captureWindowStartKey = shiftKstDateKey(todayKey, -5);

  const enrichedRecords = await Promise.all(
    records.map(async (record) => {
      if (
        !record.kindIssueCode ||
        !record.listingDate ||
        record.listingDate >= todayKey ||
        record.listingDate < captureWindowStartKey
      ) {
        return record;
      }

      const snapshot = await fetchKindStockPriceSnapshot(record.kindIssueCode, { forceRefresh });
      if (snapshot.priceDate !== record.listingDate || snapshot.openingPrice == null) {
        return record;
      }

      const listingOpenReturnRate = toListingOpenReturnRate(record.offerPrice, snapshot.openingPrice);
      const notes = record.notes ?? [];
      const kindNote = `KIND 종가 기준(${snapshot.priceDate}) 시초가 ${snapshot.openingPrice.toLocaleString("ko-KR")}원`;

      return {
        ...record,
        listingOpenPrice: snapshot.openingPrice,
        listingOpenReturnRate,
        notes: notes.includes(kindNote) ? notes : [...notes, kindNote],
      };
    }),
  );

  return enrichedRecords;
};

const buildEvents = (record: SourceIpoRecord, ipoName: string) => [
  {
    type: "SUBSCRIPTION" as const,
    title: `${ipoName} 청약 마감`,
    eventDate: parseKstDate(record.subscriptionEnd),
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

const getMinimumDepositAmount = (ipo: IpoRecord) => {
  if (
    ipo.offerPrice == null ||
    ipo.minimumSubscriptionShares == null ||
    ipo.depositRate == null
  ) {
    return null;
  }

  return Math.round(ipo.offerPrice * ipo.minimumSubscriptionShares * ipo.depositRate);
};

const getDetailUrl = (slug: string) => {
  const baseUrl = env.appBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/ipos/${encodeURIComponent(slug)}`;
};

const getAnalysisSummaryLine = (ipo: IpoRecord) =>
  ipo.latestAnalysis.keyPoints[0]
  ?? "정량 점수는 비공개 상태이며, 공시 기반 핵심 근거와 주의 포인트만 제공합니다.";

const buildDecisionTags = (ipo: IpoRecord) => {
  const minimumDeposit = getMinimumDepositAmount(ipo);
  const tags: string[] = ["#공모주", "#청약마감", "#공시확인"];

  if (minimumDeposit != null) {
    tags.push("#증거금확인");
  }

  if (ipo.latestAnalysis.warnings.length > 0) {
    tags.push("#변동성주의");
  }

  return [...new Set(tags)];
};

// TODO: Re-enable public score and recommendation tags after validating the heuristic
// with additional data sources beyond OpenDART and live outcome checks.
const buildClosingDayAnalysisMessage = (ipo: IpoRecord): NotificationJobRecord["payload"] => ({
  subject: `[공모주] ${ipo.name} 오늘 청약 마감 - 10시 분석`,
  tags: buildDecisionTags(ipo),
  intro: `${ipo.name}의 청약 마감 당일 10시 기준 공시 기반 체크 포인트입니다.`,
  webUrl: getDetailUrl(ipo.slug),
  sections: [
    {
      label: "빠른 판단",
      lines: [
        `최소청약주수 ${ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주`,
        `최소청약금액 ${formatMoney(getMinimumDepositAmount(ipo))}`,
        "정량 점수 비공개",
        "OpenDART 단독 기준의 신뢰도 보강 전까지는 점수형 판단을 노출하지 않습니다.",
      ],
    },
    {
      label: "핵심 요약",
      lines: [
        `시장 ${ipo.market}`,
        `주관사 ${ipo.leadManager}${ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}`,
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
      label: "10시 분석",
      lines: [
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
  footer: [
    "정량 점수는 데이터 신뢰도 보강 전까지 비공개 상태입니다.",
    "최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.",
  ],
});

const buildClosingSoonReminderMessage = (ipo: IpoRecord): NotificationJobRecord["payload"] => ({
  subject: `[공모주] ${ipo.name} 오늘 청약 마감 임박 알림`,
  tags: buildDecisionTags(ipo),
  intro: `${ipo.name} 청약 마감이 임박했습니다. 최종 주문 전 공시 기반 핵심 정보를 다시 확인하세요.`,
  webUrl: getDetailUrl(ipo.slug),
  sections: [
    {
      label: "지금 확인할 항목",
      lines: [
        `청약 마감 오늘 16:00`,
        `최소청약주수 ${ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주`,
        `최소청약금액 ${formatMoney(getMinimumDepositAmount(ipo))}`,
        "정량 점수 비공개",
        "현재는 점수 대신 공시 기반 체크 포인트만 제공합니다.",
      ],
    },
    {
      label: "공모 정보",
      lines: [
        `시장 ${ipo.market}`,
        `주관사 ${ipo.leadManager}${ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}`,
        `확정 공모가 ${ipo.offerPrice?.toLocaleString("ko-KR") ?? "-"}원`,
        `증거금률 ${formatPercent(ipo.depositRate)}`,
      ],
    },
    {
      label: "빠른 리마인드",
      lines: [
        getAnalysisSummaryLine(ipo),
        ...ipo.latestAnalysis.keyPoints.slice(0, 2),
      ],
    },
    {
      label: "마감 전 체크",
      lines: ipo.latestAnalysis.warnings.length
        ? ipo.latestAnalysis.warnings
        : ["최종 청약 전 증권사 주문 가능 시간과 환불일, 상장 예정일을 함께 확인하세요."],
    },
  ],
  footer: [
    "마감 직전에는 증권사별 주문 마감이 조금 다를 수 있으니 최종 화면을 다시 확인해 주세요.",
    "정량 점수는 데이터 신뢰도 보강 전까지 비공개 상태입니다.",
    "최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.",
  ],
});

const toChecksum = (record: SourceIpoRecord) =>
  createHash("sha256").update(JSON.stringify(record)).digest("hex");

const getTodayClosingIpos = (dashboard: DashboardSnapshot, today: Date) =>
  dashboard.ipos.filter(
    (ipo) => isSameKstDate(ipo.subscriptionEnd, today) && ipo.status !== "WITHDRAWN",
  );

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

const getPersistedReadyJobsByIdempotencySuffix = async (
  suffix: string,
  {
    scheduledFrom,
    scheduledTo,
  }: {
    scheduledFrom: Date;
    scheduledTo: Date;
  },
) => {
  const jobs = await prisma.notificationJob.findMany({
    where: {
      status: "READY",
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

  return jobs.map(toNotificationJobRecord);
};

const parseSnapshotNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseSnapshotString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseSnapshotDate = (value: unknown) => {
  const dateKey = parseSnapshotString(value);
  return dateKey ? parseKstDate(dateKey) : null;
};

const getLatestSnapshotFields = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return {
      kindBizProcessNo: null,
      generalSubscriptionCompetitionRate: null,
      irStart: null,
      irEnd: null,
      demandForecastStart: null,
      demandForecastEnd: null,
      tradableShares: null,
      floatRatio: null,
      demandCompetitionRate: null,
      lockupRate: null,
      insiderSalesRatio: null,
      marketMoodScore: null,
      revenueGrowthRate: null,
      operatingIncome: null,
      netIncome: null,
      debtRatio: null,
      totalEquity: null,
    };
  }

  const record = payload as Record<string, unknown>;

  return {
    kindBizProcessNo: parseSnapshotString(record.kindBizProcessNo),
    generalSubscriptionCompetitionRate: parseSnapshotNumber(record.generalSubscriptionCompetitionRate),
    irStart: parseSnapshotDate(record.irStart),
    irEnd: parseSnapshotDate(record.irEnd),
    demandForecastStart: parseSnapshotDate(record.demandForecastStart),
    demandForecastEnd: parseSnapshotDate(record.demandForecastEnd),
    tradableShares: parseSnapshotNumber(record.tradableShares),
    floatRatio: parseSnapshotNumber(record.floatRatio),
    demandCompetitionRate: parseSnapshotNumber(record.demandCompetitionRate),
    lockupRate: parseSnapshotNumber(record.lockupRate),
    insiderSalesRatio: parseSnapshotNumber(record.insiderSalesRatio),
    marketMoodScore: parseSnapshotNumber(record.marketMoodScore),
    revenueGrowthRate: parseSnapshotNumber(record.revenueGrowthRate),
    operatingIncome: parseSnapshotNumber(record.operatingIncome),
    netIncome: parseSnapshotNumber(record.netIncome),
    debtRatio: parseSnapshotNumber(record.debtRatio),
    totalEquity: parseSnapshotNumber(record.totalEquity),
  };
};

const normalizeIpo = (record: SourceIpoRecord): IpoRecord => {
  const analysis = buildAnalysis(record);

  return {
    id: slugify(record.name),
    slug: slugify(record.name),
    name: record.name,
    market: record.market,
    leadManager: record.leadManager,
    coManagers: record.coManagers ?? [],
    kindIssueCode: record.kindIssueCode ?? null,
    kindBizProcessNo: record.kindBizProcessNo ?? null,
    priceBandLow: record.priceBandLow ?? null,
    priceBandHigh: record.priceBandHigh ?? null,
    offerPrice: record.offerPrice ?? null,
    listingOpenPrice: record.listingOpenPrice ?? null,
    listingOpenReturnRate: record.listingOpenReturnRate ?? null,
    minimumSubscriptionShares: record.minimumSubscriptionShares ?? null,
    depositRate: record.depositRate ?? null,
    generalSubscriptionCompetitionRate: record.generalSubscriptionCompetitionRate ?? null,
    irStart: record.irStart ? parseKstDate(record.irStart) : null,
    irEnd: record.irEnd ? parseKstDate(record.irEnd) : null,
    demandForecastStart: record.demandForecastStart ? parseKstDate(record.demandForecastStart) : null,
    demandForecastEnd: record.demandForecastEnd ? parseKstDate(record.demandForecastEnd) : null,
    tradableShares: record.tradableShares ?? null,
    floatRatio: record.floatRatio ?? null,
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

const fetchSourceRecords = async ({ forceRefresh = false }: SyncOptions = {}): Promise<SourceIpoRecord[]> => {
  if (!hasLiveIpoSource()) {
    throw new Error("No live IPO source is configured. Set IPO_SOURCE_URL or OPENDART_API_KEY.");
  }

  let sourceRecords: SourceIpoRecord[];

  if (env.ipoSourceUrl) {
    const cacheKey = createHash("sha256").update(env.ipoSourceUrl).digest("hex");

    sourceRecords = await getCachedExternalData(
      {
        key: `ipo-source-url:${cacheKey}`,
        source: "ipo-source-url",
        ttlMs: IPO_SOURCE_URL_CACHE_TTL_MS,
        bypass: forceRefresh,
      },
      async () => {
        const response = await fetch(env.ipoSourceUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`IPO source fetch failed: ${response.status}`);
        }

        return (await response.json()) as SourceIpoRecord[];
      },
    );
  } else if (env.opendartApiKey) {
    sourceRecords = await fetchOpendartCurrentMonthIpos({ forceRefresh });
  } else {
    throw new Error("No live IPO source is configured. Set IPO_SOURCE_URL or OPENDART_API_KEY.");
  }

  let recordsWithOpendartEnrichment = sourceRecords;

  if (env.opendartApiKey && env.ipoSourceUrl) {
    try {
      const opendartRecords = await fetchOpendartCurrentMonthIpos({ forceRefresh });
      recordsWithOpendartEnrichment = mergeOpendartScoringEnrichment(sourceRecords, opendartRecords);
    } catch (error) {
      await logOperation({
        level: "WARN",
        source: "job:daily-sync",
        action: "opendart_scoring_enrichment_failed",
        message: "외부 원본에 OpenDART 점수 보강을 적용하지 못해 원본 데이터만 사용합니다.",
        context: toErrorContext(error, {
          forceRefresh,
          sourceRecords: sourceRecords.length,
        }),
      });
      recordsWithOpendartEnrichment = sourceRecords;
    }
  }

  const recordsWithListingMetadata = await mergeKindListingMetadata(recordsWithOpendartEnrichment, { forceRefresh });
  const recordsWithKindOfferMetadata = await enrichKindOfferMetadata(recordsWithListingMetadata, { forceRefresh });
  return enrichListingOpenMetrics(recordsWithKindOfferMetadata, { forceRefresh });
};

const countActiveDisplayRangeIpos = async () => {
  const result = await prisma.ipo.count({
    where: getDisplayRangeWhere(),
  });

  return result;
};

const isSameAnalysis = (
  left: Pick<NotificationJobRecord["payload"], never> & {
    score: number;
    ratingLabel: string;
    summary: string;
    keyPoints: string[];
    warnings: string[];
  },
  right: {
    score: number;
    ratingLabel: string;
    summary: string;
    keyPoints: string[];
    warnings: string[];
  },
) =>
  left.score === right.score
  && left.ratingLabel === right.ratingLabel
  && left.summary === right.summary
  && JSON.stringify(left.keyPoints) === JSON.stringify(right.keyPoints)
  && JSON.stringify(left.warnings) === JSON.stringify(right.warnings);

const isMissingSchemaError = (error: unknown) =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: string }).code === "P2022";

const canUseDatabase = async () => {
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

const buildSchedulerStatuses = (
  logs: OperationLogRecord[],
  now = new Date(),
): SchedulerStatusRecord[] => {
  const todayKey = getKstTodayKey(now);

  return schedulerDefinitions.map((definition) => {
    const expectedAt = atKstTime(todayKey, definition.expectedHour, definition.expectedMinute ?? 0);
    const sourceLogs = logs.filter((log) => log.source === definition.source);
    const todayLogs = sourceLogs.filter((log) => kstDateKey(log.createdAt) === todayKey);
    const completionThreshold = expectedAt.getTime() - SCHEDULER_EARLY_GRACE_MS;
    const completedAfterThreshold = todayLogs.find(
      (log) => log.action === "completed" && log.createdAt.getTime() >= completionThreshold,
    );
    const failedAfterThreshold = todayLogs.find(
      (log) => log.action === "failed" && log.createdAt.getTime() >= completionThreshold,
    );
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
        detail: isLate
          ? `${expectedAtLabel} 기준으로 ${delayMinutes}분 늦게 실행됐습니다. 최근 성공 ${formatDateTime(completedAfterThreshold.createdAt)}.`
          : `예정 시각 ${expectedAtLabel} 기준으로 정상 실행됐습니다. 최근 성공 ${formatDateTime(completedAfterThreshold.createdAt)}.`,
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
        detail: `예정 시각 이후 실패 로그가 있고 성공 로그가 없습니다. 최근 실패 ${formatDateTime(failedAfterThreshold.createdAt)}.`,
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
        detail: `예정 전 실행 ${formatDateTime(earlyCompletion.createdAt)}만 확인됐고, ${expectedAtLabel} 이후 성공 로그는 없습니다.`,
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

const toIpoRecord = (ipo: {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string | null;
  coManagers: unknown;
  kindIssueCode: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  offerPrice: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  refundDate: Date | null;
  listingDate: Date | null;
  status: IpoRecord["status"];
  events: Array<{
    id: string;
    type: IpoRecord["events"][number]["type"];
    title: string;
    eventDate: Date;
  }>;
  analyses: Array<{
    score: number;
    ratingLabel: string;
    summary: string;
    keyPoints: unknown;
    warnings: unknown;
    generatedAt: Date;
  }>;
  sourceSnapshots: Array<{
    sourceKey: string;
    fetchedAt: Date;
    payload: unknown;
  }>;
}): IpoRecord => ({
  ...(() => {
    const snapshotFields = getLatestSnapshotFields(ipo.sourceSnapshots[0]?.payload);
    const {
      kindBizProcessNo,
      generalSubscriptionCompetitionRate,
      irStart,
      irEnd,
      demandForecastStart,
      demandForecastEnd,
      tradableShares,
      floatRatio,
    } = snapshotFields;

    return {
      id: ipo.id,
      slug: ipo.slug,
      name: ipo.name,
      market: ipo.market,
      leadManager: ipo.leadManager ?? "-",
      coManagers: Array.isArray(ipo.coManagers) ? (ipo.coManagers as string[]) : [],
      kindIssueCode: ipo.kindIssueCode,
      kindBizProcessNo,
      priceBandLow: ipo.priceBandLow,
      priceBandHigh: ipo.priceBandHigh,
      offerPrice: ipo.offerPrice,
      listingOpenPrice: ipo.listingOpenPrice,
      listingOpenReturnRate: ipo.listingOpenReturnRate,
      minimumSubscriptionShares: ipo.minimumSubscriptionShares,
      depositRate: ipo.depositRate,
      generalSubscriptionCompetitionRate,
      irStart,
      irEnd,
      demandForecastStart,
      demandForecastEnd,
      tradableShares,
      floatRatio,
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
        scoreDisplay: buildAnalysisScoreDisplay({
          offerPrice: ipo.offerPrice,
          priceBandLow: ipo.priceBandLow,
          priceBandHigh: ipo.priceBandHigh,
          demandCompetitionRate: snapshotFields.demandCompetitionRate,
          lockupRate: snapshotFields.lockupRate,
          floatRatio: snapshotFields.floatRatio,
          insiderSalesRatio: snapshotFields.insiderSalesRatio,
          marketMoodScore: snapshotFields.marketMoodScore,
          revenueGrowthRate: snapshotFields.revenueGrowthRate,
          operatingIncome: snapshotFields.operatingIncome,
          netIncome: snapshotFields.netIncome,
          debtRatio: snapshotFields.debtRatio,
          totalEquity: snapshotFields.totalEquity,
        }),
        generatedAt: ipo.analyses[0].generatedAt,
      },
      latestSourceKey: ipo.sourceSnapshots[0].sourceKey,
      sourceFetchedAt: ipo.sourceSnapshots[0].fetchedAt,
    };
  })(),
});

const toPublicIpoDetailRecord = (ipo: {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string | null;
  coManagers: unknown;
  kindIssueCode: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  offerPrice: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  refundDate: Date | null;
  listingDate: Date | null;
  status: IpoRecord["status"];
  events: Array<{
    id: string;
    type: IpoRecord["events"][number]["type"];
    title: string;
    eventDate: Date;
  }>;
  analyses: Array<{
    score: number;
    ratingLabel: string;
    summary: string;
    keyPoints: unknown;
    warnings: unknown;
    generatedAt: Date;
  }>;
  sourceSnapshots: Array<{
    payload: unknown;
  }>;
}): PublicIpoDetailRecord => ({
  ...(() => {
    const snapshotFields = getLatestSnapshotFields(ipo.sourceSnapshots[0]?.payload);
    const {
      kindBizProcessNo,
      generalSubscriptionCompetitionRate,
      irStart,
      irEnd,
      demandForecastStart,
      demandForecastEnd,
      tradableShares,
      floatRatio,
    } = snapshotFields;

    return {
      id: ipo.id,
      slug: ipo.slug,
      name: ipo.name,
      market: ipo.market,
      leadManager: ipo.leadManager ?? "-",
      coManagers: Array.isArray(ipo.coManagers) ? (ipo.coManagers as string[]) : [],
      kindIssueCode: ipo.kindIssueCode,
      kindBizProcessNo,
      priceBandLow: ipo.priceBandLow,
      priceBandHigh: ipo.priceBandHigh,
      offerPrice: ipo.offerPrice,
      listingOpenPrice: ipo.listingOpenPrice,
      listingOpenReturnRate: ipo.listingOpenReturnRate,
      minimumSubscriptionShares: ipo.minimumSubscriptionShares,
      depositRate: ipo.depositRate,
      generalSubscriptionCompetitionRate,
      irStart,
      irEnd,
      demandForecastStart,
      demandForecastEnd,
      tradableShares,
      floatRatio,
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
        scoreDisplay: buildAnalysisScoreDisplay({
          offerPrice: ipo.offerPrice,
          priceBandLow: ipo.priceBandLow,
          priceBandHigh: ipo.priceBandHigh,
          demandCompetitionRate: snapshotFields.demandCompetitionRate,
          lockupRate: snapshotFields.lockupRate,
          floatRatio: snapshotFields.floatRatio,
          insiderSalesRatio: snapshotFields.insiderSalesRatio,
          marketMoodScore: snapshotFields.marketMoodScore,
          revenueGrowthRate: snapshotFields.revenueGrowthRate,
          operatingIncome: snapshotFields.operatingIncome,
          netIncome: snapshotFields.netIncome,
          debtRatio: snapshotFields.debtRatio,
          totalEquity: snapshotFields.totalEquity,
        }),
        generatedAt: ipo.analyses[0].generatedAt,
      },
    };
  })(),
});

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

  return toIpoRecord(ipo);
};

const ensureAdminRecipient = async (): Promise<void> => {
  if (!(await canUseDatabase())) {
    return;
  }

  const email = env.adminEmail;
  if (!email) {
    throw new Error("ADMIN_EMAIL is not configured.");
  }

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

  await prisma.recipientChannel.deleteMany({
    where: {
      recipientId: recipient.id,
      type: "EMAIL",
      address: { not: email },
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

const createDeliveryIdempotencyKey = (jobIdempotencyKey: string, recipientId: string, channelAddress: string) =>
  `${jobIdempotencyKey}:${recipientId}:EMAIL:${encodeURIComponent(channelAddress.trim().toLowerCase())}`;

const markStaleDisplayRangeIpos = async (sourceRecords: SourceIpoRecord[]) => {
  const activeSlugs = sourceRecords.map((record) => slugify(record.name));
  const displayRangeWhere = getDisplayRangeWhere();
  const staleCandidates = await prisma.ipo.findMany({
    where: {
      ...displayRangeWhere,
      slug: {
        notIn: activeSlugs,
      },
    },
    select: {
      id: true,
      name: true,
      sourceSnapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: {
          fetchedAt: true,
        },
      },
    },
  });

  if (staleCandidates.length === 0) {
    return 0;
  }

  const protectedCandidates = staleCandidates.filter((ipo) => {
    const lastFetchedAt = ipo.sourceSnapshots[0]?.fetchedAt;
    return isOnOrAfterKstDayOffset(lastFetchedAt, -STALE_SOURCE_WITHDRAWAL_GRACE_DAYS);
  });
  const withdrawableIds = staleCandidates
    .filter((ipo) => !protectedCandidates.some((protectedIpo) => protectedIpo.id === ipo.id))
    .map((ipo) => ipo.id);

  if (protectedCandidates.length > 0) {
    await logOperation({
      level: "WARN",
      source: "job:daily-sync",
      action: "delayed_withdrawal",
      message:
        `라이브 소스에서 빠진 공모주 ${protectedCandidates.length}건의 WITHDRAWN 처리를 `
        + `${STALE_SOURCE_WITHDRAWAL_GRACE_DAYS}일 유예했습니다.`,
      context: {
        count: protectedCandidates.length,
        graceDays: STALE_SOURCE_WITHDRAWAL_GRACE_DAYS,
        names: protectedCandidates.map((ipo) => ipo.name),
      },
    });
  }

  if (withdrawableIds.length === 0) {
    return 0;
  }

  const result = await prisma.ipo.updateMany({
    where: {
      id: {
        in: withdrawableIds,
      },
    },
    data: {
      status: "WITHDRAWN",
    },
  });

  if (result.count > 0) {
    await logOperation({
      level: "WARN",
      source: "job:daily-sync",
      action: "marked_withdrawn",
      message: `표시 범위에서 사라진 공모주 ${result.count}건을 WITHDRAWN으로 표시했습니다.`,
      context: { count: result.count },
    });
  }

  return result.count;
};

const toRecipientRecord = (recipient: {
  id: string;
  name: string;
  status: RecipientRecord["status"];
  inviteState: RecipientRecord["inviteState"];
  consentedAt: Date | null;
  unsubscribedAt: Date | null;
  channels: RecipientRecord["channels"];
}): RecipientRecord => ({
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
});

const toNotificationJobRecord = (job: {
  id: string;
  ipoId: string;
  alertType: NotificationJobRecord["alertType"];
  scheduledFor: Date;
  payload: unknown;
  status: NotificationJobRecord["status"];
  idempotencyKey: string;
  ipo: {
    slug: string;
  };
}): NotificationJobRecord => ({
  id: job.id,
  ipoId: job.ipoId,
  ipoSlug: job.ipo.slug,
  alertType: job.alertType,
  scheduledFor: job.scheduledFor,
  payload: job.payload as NotificationJobRecord["payload"],
  status: job.status,
  idempotencyKey: job.idempotencyKey,
});

const toNotificationDeliveryRecord = (delivery: {
  id: string;
  jobId: string;
  recipientId: string;
  channelType: NotificationDeliveryRecord["channelType"];
  channelAddress: string;
  status: NotificationDeliveryRecord["status"];
  providerMessageId: string | null;
  errorMessage: string | null;
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
  sentAt: delivery.sentAt,
  idempotencyKey: delivery.idempotencyKey,
});

const toAdminOverrideRecord = (override: {
  id: string;
  slug: string | null;
  type: string;
  payload: unknown;
  isActive: boolean;
  note: string | null;
}): AdminOverrideRecord => ({
  id: override.id,
  slug: override.slug,
  type: override.type,
  payload: override.payload as AdminOverrideRecord["payload"],
  isActive: override.isActive,
  note: override.note,
});

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

const upsertDatabaseIpo = async (record: SourceIpoRecord) => {
  const slug = slugify(record.name);
  const latestSnapshot = await prisma.ipo.findUnique({
    where: { slug },
    include: {
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

  const effectiveOfferPrice = record.offerPrice ?? latestSnapshot?.offerPrice ?? null;
  const listingOpenPrice = record.listingOpenPrice ?? latestSnapshot?.listingOpenPrice ?? null;
  const persistedRecord = {
    ...record,
    kindIssueCode: record.kindIssueCode ?? latestSnapshot?.kindIssueCode ?? null,
    offerPrice: effectiveOfferPrice,
    listingOpenPrice,
    listingOpenReturnRate:
      record.listingOpenReturnRate
      ?? toListingOpenReturnRate(effectiveOfferPrice, listingOpenPrice)
      ?? latestSnapshot?.listingOpenReturnRate
      ?? null,
  } satisfies SourceIpoRecord;
  const seenAt = new Date();
  const checksum = toChecksum(persistedRecord);
  const analysis = buildAnalysis(persistedRecord);
  const targetStatus = persistedRecord.status ?? "UPCOMING";

  if (
    latestSnapshot?.sourceSnapshots[0]?.sourceKey === persistedRecord.sourceKey &&
    latestSnapshot.sourceSnapshots[0]?.checksum === checksum
  ) {
    const latestSourceSnapshotId = latestSnapshot.sourceSnapshots[0]?.id;

    if (latestSnapshot.id && latestSnapshot.status !== targetStatus) {
      await prisma.ipo.update({
        where: { id: latestSnapshot.id },
        data: {
          status: targetStatus,
        },
      });
    }

    if (latestSourceSnapshotId) {
      // Keep the latest unchanged snapshot "fresh" so stale-source withdrawal uses last-seen time.
      await prisma.ipoSourceSnapshot.update({
        where: { id: latestSourceSnapshotId },
        data: {
          fetchedAt: seenAt,
        },
      });
    }

    const latestAnalysis = latestSnapshot.analyses[0];
    const analysisChanged = !latestAnalysis
      || !isSameAnalysis(
        {
          score: latestAnalysis.score,
          ratingLabel: latestAnalysis.ratingLabel,
          summary: latestAnalysis.summary,
          keyPoints: Array.isArray(latestAnalysis.keyPoints) ? (latestAnalysis.keyPoints as string[]) : [],
          warnings: Array.isArray(latestAnalysis.warnings) ? (latestAnalysis.warnings as string[]) : [],
        },
        analysis,
      );

    if (analysisChanged && latestSnapshot.id) {
      await prisma.ipoAnalysis.create({
        data: {
          ipoId: latestSnapshot.id,
          score: analysis.score,
          ratingLabel: analysis.ratingLabel,
          summary: analysis.summary,
          keyPoints: analysis.keyPoints,
          warnings: analysis.warnings,
          generatedAt: analysis.generatedAt,
        },
      });
    }

    const unchanged = await toIpoRecordFromDb(slug);
    if (unchanged) {
      return unchanged;
    }
  }

  const ipo = await prisma.ipo.upsert({
    where: { slug },
    update: {
      name: persistedRecord.name,
      market: persistedRecord.market,
      leadManager: persistedRecord.leadManager,
      coManagers: persistedRecord.coManagers ?? [],
      kindIssueCode: persistedRecord.kindIssueCode ?? null,
      priceBandLow: persistedRecord.priceBandLow ?? null,
      priceBandHigh: persistedRecord.priceBandHigh ?? null,
      offerPrice: persistedRecord.offerPrice ?? null,
      listingOpenPrice: persistedRecord.listingOpenPrice ?? null,
      listingOpenReturnRate: persistedRecord.listingOpenReturnRate ?? null,
      minimumSubscriptionShares: persistedRecord.minimumSubscriptionShares ?? null,
      depositRate: persistedRecord.depositRate ?? null,
      subscriptionStart: parseKstDate(persistedRecord.subscriptionStart),
      subscriptionEnd: parseKstDate(persistedRecord.subscriptionEnd),
      refundDate: persistedRecord.refundDate ? parseKstDate(persistedRecord.refundDate) : null,
      listingDate: persistedRecord.listingDate ? parseKstDate(persistedRecord.listingDate) : null,
      status: persistedRecord.status ?? "UPCOMING",
    },
    create: {
      slug,
      name: persistedRecord.name,
      market: persistedRecord.market,
      leadManager: persistedRecord.leadManager,
      coManagers: persistedRecord.coManagers ?? [],
      kindIssueCode: persistedRecord.kindIssueCode ?? null,
      priceBandLow: persistedRecord.priceBandLow ?? null,
      priceBandHigh: persistedRecord.priceBandHigh ?? null,
      offerPrice: persistedRecord.offerPrice ?? null,
      listingOpenPrice: persistedRecord.listingOpenPrice ?? null,
      listingOpenReturnRate: persistedRecord.listingOpenReturnRate ?? null,
      minimumSubscriptionShares: persistedRecord.minimumSubscriptionShares ?? null,
      depositRate: persistedRecord.depositRate ?? null,
      subscriptionStart: parseKstDate(persistedRecord.subscriptionStart),
      subscriptionEnd: parseKstDate(persistedRecord.subscriptionEnd),
      refundDate: persistedRecord.refundDate ? parseKstDate(persistedRecord.refundDate) : null,
      listingDate: persistedRecord.listingDate ? parseKstDate(persistedRecord.listingDate) : null,
      status: persistedRecord.status ?? "UPCOMING",
    },
  });

  await prisma.ipoEvent.deleteMany({
    where: { ipoId: ipo.id },
  });

  await prisma.ipoEvent.createMany({
    data: buildEvents(persistedRecord, persistedRecord.name).map((event) => ({
      ipoId: ipo.id,
      type: event.type,
      title: event.title,
      eventDate: event.eventDate,
    })),
  });

  await prisma.ipoSourceSnapshot.create({
    data: {
      ipoId: ipo.id,
      sourceKey: persistedRecord.sourceKey,
      checksum,
      payload: persistedRecord,
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
    return buildFallbackDashboard();
  }

  try {
    const displayRange = getDisplayRange();

    const [ipos, recipients, jobs, deliveries, overrides, schedulerLogs] = await Promise.all([
      prisma.ipo.findMany({
        where: getDisplayRangeWhere(),
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
      getSchedulerValidationLogs(),
    ]);

    const operationLogs = await getRecentOperationLogs(24);

    return {
      mode: "database",
      generatedAt: new Date(),
      calendarMonth: displayRange.currentMonth.start,
      ipos: ipos.flatMap((ipo) => (ipo.analyses.length && ipo.sourceSnapshots.length ? [toIpoRecord(ipo)] : [])),
      recipients: recipients.map(toRecipientRecord),
      jobs: jobs.map(toNotificationJobRecord),
      deliveries: deliveries.map(toNotificationDeliveryRecord),
      overrides: overrides.map(toAdminOverrideRecord),
      operationLogs,
      schedulerStatuses: buildSchedulerStatuses(schedulerLogs),
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
        include: {
          events: { orderBy: { eventDate: "asc" } },
          analyses: { orderBy: { generatedAt: "desc" }, take: 1 },
          sourceSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
        },
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
      ipos: ipos.flatMap((ipo) => (ipo.analyses.length && ipo.sourceSnapshots.length ? [toIpoRecord(ipo)] : [])),
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
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, returning no public IPO detail.");
      return null;
    }

    throw error;
  }

  if (!ipo || ipo.analyses.length === 0) {
    return null;
  }

  return toPublicIpoDetailRecord(ipo);
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
    return await toIpoRecordFromDb(normalizedSlug);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn("Database schema is behind the Prisma model, returning no IPO detail.");
      return null;
    }

    throw error;
  }
};

export const runDailySync = async ({ forceRefresh = false }: SyncOptions = {}): Promise<SyncResult> => {
  await logOperation({
    level: "INFO",
    source: "job:daily-sync",
    action: "started",
    message: forceRefresh ? "공모주 일정 강제 새로고침 동기화를 시작했습니다." : "공모주 일정 동기화를 시작했습니다.",
    context: forceRefresh ? { forceRefresh } : null,
  });

  try {
    const sourceRecords = await fetchSourceRecords({ forceRefresh });

    if (!(await canUseDatabase())) {
      const result = {
        mode: "fallback" as const,
        synced: sourceRecords.length,
        ipos: sourceRecords.map(normalizeIpo),
        timestamp: new Date(),
      };

      await logOperation({
        level: "WARN",
        source: "job:daily-sync",
        action: "fallback_mode",
        message: `DB 연결이 없어 빈 fallback 기준으로 ${result.synced}건을 반환했습니다.`,
        context: { synced: result.synced, forceRefresh },
      });

      return result;
    }

    const activeDisplayRangeCount = await countActiveDisplayRangeIpos();

    if (sourceRecords.length === 0 && activeDisplayRangeCount > 0) {
      await logOperation({
        level: "WARN",
        source: "job:daily-sync",
        action: "empty_source_protected",
        message: "라이브 소스 응답이 0건이라 기존 표시 범위 공모주 데이터를 보존하고 동기화를 중단했습니다.",
        context: {
          forceRefresh,
          activeDisplayRangeCount,
          hasIpoSourceUrl: Boolean(env.ipoSourceUrl),
          hasOpendartApiKey: Boolean(env.opendartApiKey),
        },
      });
      throw new Error("Live IPO source returned 0 records while existing display-range IPOs are present.");
    }

    const ipos = await Promise.all(sourceRecords.map((record) => upsertDatabaseIpo(record)));
    const synced = ipos.filter(Boolean).length;
    const markedWithdrawn = await markStaleDisplayRangeIpos(sourceRecords);

    await logOperation({
      level: "INFO",
      source: "job:daily-sync",
      action: "completed",
      message: `공모주 일정 ${synced}건을 동기화했습니다.`,
      context: { synced, sourceRecords: sourceRecords.length, markedWithdrawn, forceRefresh },
    });

    return {
      mode: "database",
      synced,
      ipos: ipos.filter((ipo): ipo is IpoRecord => Boolean(ipo)),
      timestamp: new Date(),
    };
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "job:daily-sync",
      action: "failed",
      message: "공모주 일정 동기화에 실패했습니다.",
      context: toErrorContext(error),
    });
    throw error;
  }
};

export const prepareDailyAlerts = async (): Promise<PreparedAlertsResult> => {
  await logOperation({
    level: "INFO",
    source: "job:prepare-daily-alerts",
    action: "started",
    message: "10시 분석 알림 준비를 시작했습니다.",
  });

  try {
    if (await canUseDatabase()) {
      await ensureAdminRecipient();
    }

    const dashboard = await getDashboardSnapshot();
    const todayKey = getKstTodayKey();
    const today = parseKstDate(todayKey);
    const closingIpos = getTodayClosingIpos(dashboard, today);

    const jobs: PreparedJobSeed[] = closingIpos.map((ipo) => ({
      id: `prepared-${ipo.id}-closing-day-analysis`,
      ipoId: ipo.id,
      ipoSlug: ipo.slug,
      alertType: "CLOSING_DAY_ANALYSIS" as const,
      scheduledFor: atKstTime(todayKey, 10),
      payload: buildClosingDayAnalysisMessage(ipo),
      status: "READY" as const,
      idempotencyKey: `${ipo.id}:${todayKey}:closing-day-analysis`,
    }));

    if (!(await canUseDatabase())) {
      await logOperation({
        level: "WARN",
        source: "job:prepare-daily-alerts",
        action: "fallback_mode",
        message: `DB 연결이 없어 fallback 상태에서 알림 ${jobs.length}건을 준비했습니다.`,
        context: { jobs: jobs.length },
      });

      return {
        mode: "fallback",
        timestamp: new Date(),
        jobs,
      };
    }

    const storedJobs = await persistPreparedJobs(jobs);

    await logOperation({
      level: "INFO",
      source: "job:prepare-daily-alerts",
      action: "completed",
      message: `10시 분석 알림 ${storedJobs.length}건을 준비했습니다.`,
      context: { jobs: storedJobs.length },
    });

    return {
      mode: "database",
      timestamp: new Date(),
      jobs: storedJobs,
    };
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "job:prepare-daily-alerts",
      action: "failed",
      message: "10시 분석 알림 준비에 실패했습니다.",
      context: toErrorContext(error),
    });
    throw error;
  }
};

export const prepareClosingSoonAlerts = async (): Promise<PreparedAlertsResult> => {
  await logOperation({
    level: "INFO",
    source: "job:prepare-closing-alerts",
    action: "started",
    message: "마감 30분 전 알림 준비를 시작했습니다.",
  });

  try {
    if (await canUseDatabase()) {
      await ensureAdminRecipient();
    }

    const now = new Date();
    const todayKey = getKstTodayKey(now);
    const closingCutoffAt = atKstTime(todayKey, CLOSING_TIME_HOUR);
    const today = parseKstDate(todayKey);
    const dashboard = await getDashboardSnapshot();
    const closingIpos = now < closingCutoffAt ? getTodayClosingIpos(dashboard, today) : [];

    const jobs: PreparedJobSeed[] = closingIpos.map((ipo) => ({
      id: `prepared-${ipo.id}-closing-soon-reminder`,
      ipoId: ipo.id,
      ipoSlug: ipo.slug,
      alertType: "CLOSING_DAY_ANALYSIS" as const,
      scheduledFor: atKstTime(todayKey, CLOSING_SOON_ALERT_HOUR, CLOSING_SOON_ALERT_MINUTE),
      payload: buildClosingSoonReminderMessage(ipo),
      status: "READY" as const,
      idempotencyKey: `${ipo.id}:${todayKey}:closing-soon-reminder`,
    }));

    if (!(await canUseDatabase())) {
      await logOperation({
        level: "WARN",
        source: "job:prepare-closing-alerts",
        action: "fallback_mode",
        message: `DB 연결이 없어 fallback 상태에서 마감 30분 전 알림 ${jobs.length}건을 준비했습니다.`,
        context: { jobs: jobs.length, afterClose: now >= closingCutoffAt },
      });

      return {
        mode: "fallback",
        timestamp: new Date(),
        jobs,
      };
    }

    const storedJobs = await persistPreparedJobs(jobs);

    await logOperation({
      level: "INFO",
      source: "job:prepare-closing-alerts",
      action: "completed",
      message: `마감 30분 전 알림 ${storedJobs.length}건을 준비했습니다.`,
      context: { jobs: storedJobs.length, afterClose: now >= closingCutoffAt },
    });

    return {
      mode: "database",
      timestamp: new Date(),
      jobs: storedJobs,
    };
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "job:prepare-closing-alerts",
      action: "failed",
      message: "마감 30분 전 알림 준비에 실패했습니다.",
      context: toErrorContext(error),
    });
    throw error;
  }
};

const resolveRecipients = async (): Promise<RecipientRecord[]> => {
  if (!(await canUseDatabase())) {
    return [];
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

  return recipients
    .map((recipient) => {
      const verifiedEmailChannels = recipient.channels.filter(
        (channel) => channel.type === "EMAIL" && channel.isVerified,
      );
      const primaryVerifiedEmails = verifiedEmailChannels.filter((channel) => channel.isPrimary);
      const selectedEmailChannels = primaryVerifiedEmails.length ? primaryVerifiedEmails : verifiedEmailChannels;

      return {
        id: recipient.id,
        name: recipient.name,
        status: recipient.status,
        inviteState: recipient.inviteState,
        consentedAt: recipient.consentedAt,
        unsubscribedAt: recipient.unsubscribedAt,
        channels: selectedEmailChannels.map((channel) => ({
          id: channel.id,
          type: channel.type,
          address: channel.address,
          isPrimary: channel.isPrimary,
          isVerified: channel.isVerified,
        })),
      } satisfies RecipientRecord;
    })
    .filter((recipient) => recipient.channels.length > 0);
};

const dispatchPreparedAlerts = async ({
  source,
  startedMessage,
  completionMessage,
  failureMessage,
  prepare,
  isDispatchable = () => true,
  loadPersistedReadyJobs,
}: DispatchPreparedAlertsOptions): Promise<DispatchResult> => {
  await logOperation({
    level: "INFO",
    source,
    action: "started",
    message: startedMessage,
  });

  try {
    const useDatabase = await canUseDatabase();
    const recipients = await resolveRecipients();
    const now = new Date();
    const prepared = await prepare();
    const persistedReadyJobs =
      useDatabase && loadPersistedReadyJobs
        ? await loadPersistedReadyJobs(now)
        : [];
    const jobsById = new Map<string, NotificationJobRecord>();

    for (const job of prepared.jobs) {
      jobsById.set(job.id, job);
    }

    for (const job of persistedReadyJobs) {
      jobsById.set(job.id, job);
    }

    const dueJobs = Array.from(jobsById.values()).filter((job) => job.scheduledFor <= now);
    const readyJobs = dueJobs.filter((job) => isDispatchable(job, now));
    const staleJobs = dueJobs.filter((job) => !isDispatchable(job, now));
    const staleSkippedCount = staleJobs.length;
    const deliveries: NotificationDeliveryRecord[] = [];

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
          if (channel.type !== "EMAIL") {
            continue;
          }

          const idempotencyKey = createDeliveryIdempotencyKey(job.idempotencyKey, recipient.id, channel.address);

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
                status: "SKIPPED",
                providerMessageId: existing.providerMessageId,
                errorMessage: existing.errorMessage,
                sentAt: existing.sentAt,
                idempotencyKey: existing.idempotencyKey,
              });
              jobDeliveries.push("SKIPPED");
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

            await logOperation({
              level: "ERROR",
              source,
              action: "delivery_failed",
              message: "메일 발송에 실패했습니다.",
              context: toErrorContext(error, {
                jobId: job.id,
                recipientId: recipient.id,
                channelAddress: channel.address,
              }),
            });

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
      context: { attempted: readyJobs.length, sentCount, failedCount, skippedCount, staleSkippedCount },
    });

    return {
      mode: useDatabase ? "database" : "fallback",
      timestamp: now,
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
    startedMessage: "10시 분석 메일 발송을 시작했습니다.",
    completionMessage: ({ sentCount, failedCount, skippedCount }) =>
      `10시 분석 메일 발송을 마쳤습니다. 신규 발송 ${sentCount}건, 실패 ${failedCount}건, 중복 건너뜀 ${skippedCount}건입니다.`,
    failureMessage: "10시 분석 메일 발송 작업이 실패했습니다.",
    prepare: prepareDailyAlerts,
  });

export const dispatchClosingSoonAlerts = async (): Promise<DispatchResult> =>
  dispatchPreparedAlerts({
    source: "job:dispatch-closing-alerts",
    startedMessage: "마감 30분 전 알림 메일 발송을 시작했습니다.",
    completionMessage: ({ sentCount, failedCount, skippedCount, staleSkippedCount }) =>
      `마감 30분 전 알림 메일 발송을 마쳤습니다. 신규 발송 ${sentCount}건, 실패 ${failedCount}건, 중복 건너뜀 ${skippedCount}건, 마감 후 차단 ${staleSkippedCount}건입니다.`,
    failureMessage: "마감 30분 전 알림 메일 발송 작업이 실패했습니다.",
    prepare: prepareClosingSoonAlerts,
    loadPersistedReadyJobs: async (now) => {
      const todayKey = getKstTodayKey(now);
      const dayStart = atKstTime(todayKey, 0);
      const nextDayStart = atKstTime(shiftKstDateKey(todayKey, 1), 0);

      return getPersistedReadyJobsByIdempotencySuffix(":closing-soon-reminder", {
        scheduledFrom: dayStart,
        scheduledTo: nextDayStart,
      });
    },
    isDispatchable: (job, now) => {
      const todayKey = kstDateKey(job.scheduledFor);
      return now < atKstTime(todayKey, CLOSING_TIME_HOUR);
    },
  });
