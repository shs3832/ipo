import { createHash } from "node:crypto";

import { buildAnalysis } from "@/lib/analysis";
import {
  getKstMinutesOfDay,
  getKstTodayKey,
  isOnOrAfterKstDayOffset,
  parseKstDate,
  shiftKstDateKey,
} from "@/lib/date";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import {
  IPO_SOURCE_URL_CACHE_TTL_MS,
  STALE_SOURCE_WITHDRAWAL_GRACE_DAYS,
  type SourceFetchResult,
  type SyncOptions,
  buildSourceStatus,
  canUseDatabase,
  getDisplayRangeWhere,
  hasLiveIpoSource,
  normalizeCompanyNameForMatching,
  slugify,
  toChecksum,
  toListingOpenReturnRate,
  toPrismaJsonValue,
} from "@/lib/server/job-shared";
import { buildEvents, normalizeSourceIpoRecord } from "@/lib/server/ipo-mappers";
import { getIpoRecordBySlugFromDb } from "@/lib/server/ipo-read-service";
import { enrichBrokerSubscriptionMetadata } from "@/lib/sources/broker-subscription";
import { fetchKindListingDates } from "@/lib/sources/kind-listings";
import { fetchKindListingSchedule } from "@/lib/sources/kind-listing-schedule";
import { fetchKindOfferDetails } from "@/lib/sources/kind-offer-details";
import { fetchKindStockPriceSnapshot } from "@/lib/sources/kind-stock-prices";
import { fetchOpendartCurrentMonthIpoResult, fetchOpendartCurrentMonthIpos } from "@/lib/sources/opendart-ipo";
import {
  fetchSeibroDutyDepoSnapshot,
  type SeibroDutyDepoMarketTypeCode,
  type SeibroDutyDepoSnapshot,
  type SeibroDutyDepoStatusItem,
} from "@/lib/sources/seibro-duty-depo";
import type {
  IpoRecord,
  SourceIpoRecord,
  SyncResult,
} from "@/lib/types";

const isSameAnalysis = (
  left: {
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

const mergeKindListingMetadata = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: SyncOptions = {},
): Promise<SourceIpoRecord[]> => {
  const [kindListings, kindListingSchedules] = await Promise.all([
    fetchKindListingDates({ forceRefresh }),
    fetchKindListingSchedule({ forceRefresh }),
  ]);

  if (records.length === 0 && kindListings.length === 0 && kindListingSchedules.length === 0) {
    return records;
  }

  const listingByName = new Map(
    kindListings.map(
      (listing) => [normalizeCompanyNameForMatching(listing.name), listing] as const,
    ),
  );
  const listingScheduleByName = new Map(
    kindListingSchedules.map(
      (schedule) => [normalizeCompanyNameForMatching(schedule.name), schedule] as const,
    ),
  );

  const mergedRecords = records.map((record) => {
    const normalizedName = normalizeCompanyNameForMatching(record.name);
    const kindListing = listingByName.get(normalizedName);
    const kindListingSchedule = listingScheduleByName.get(normalizedName);

    if (!kindListing && !kindListingSchedule) {
      return record;
    }

    const notes = record.notes ?? [];
    const nextNotes = [...notes];

    if (kindListingSchedule) {
      const kindScheduleNote = `KIND 공모일정 기준 상장예정일 ${kindListingSchedule.listingDate}`;
      if (!nextNotes.includes(kindScheduleNote)) {
        nextNotes.push(kindScheduleNote);
      }
    } else if (kindListing) {
      const kindListingNote = `KIND 신규상장기업현황 기준 상장예정일 ${kindListing.listingDate}`;
      if (!nextNotes.includes(kindListingNote)) {
        nextNotes.push(kindListingNote);
      }
    }

    return {
      ...record,
      kindIssueCode: kindListing?.isurCd ?? record.kindIssueCode ?? null,
      kindBizProcessNo: kindListingSchedule?.bizProcessNo ?? kindListing?.bzProcsNo ?? record.kindBizProcessNo ?? null,
      listingDate: kindListingSchedule?.listingDate ?? kindListing?.listingDate ?? record.listingDate ?? null,
      notes: nextNotes,
    };
  });

  const existingNameKeys = new Set(mergedRecords.map((record) => normalizeCompanyNameForMatching(record.name)));
  const missingKindSchedules = kindListingSchedules.filter(
    (schedule) => !existingNameKeys.has(normalizeCompanyNameForMatching(schedule.name)),
  );

  const kindOnlyRecords: Array<SourceIpoRecord | null> = await Promise.all(
    missingKindSchedules.map(async (schedule) => {
      const kindListing = listingByName.get(normalizeCompanyNameForMatching(schedule.name));
      if (!kindListing) {
        return null;
      }

      const kindDetails = await fetchKindOfferDetails(kindListing.isurCd, schedule.bizProcessNo, { forceRefresh })
        .catch(() => null);
      if (!kindDetails?.subscriptionStart || !kindDetails.subscriptionEnd) {
        return null;
      }

      return {
        sourceKey: `kind-listing-schedule:${schedule.listingDate}:${kindListing.isurCd}:${schedule.bizProcessNo}`,
        name: kindDetails.name ?? schedule.name,
        market: kindDetails.market ?? "기타법인",
        leadManager: kindDetails.leadManager ?? "-",
        coManagers: kindDetails.coManagers,
        kindIssueCode: kindListing.isurCd,
        kindBizProcessNo: schedule.bizProcessNo,
        priceBandLow: null,
        priceBandHigh: null,
        offerPrice: kindDetails.offerPrice,
        minimumSubscriptionShares: null,
        depositRate: null,
        generalSubscriptionCompetitionRate: kindDetails.generalSubscriptionCompetitionRate,
        irStart: kindDetails.irStart,
        irEnd: kindDetails.irEnd,
        demandForecastStart: kindDetails.demandForecastStart,
        demandForecastEnd: kindDetails.demandForecastEnd,
        totalOfferedShares: null,
        newShares: null,
        secondaryShares: null,
        listedShares: kindDetails.listedShares,
        tradableShares: kindDetails.tradableShares,
        floatRatio: kindDetails.floatRatio,
        subscriptionStart: kindDetails.subscriptionStart,
        subscriptionEnd: kindDetails.subscriptionEnd,
        refundDate: kindDetails.refundDate,
        listingDate: schedule.listingDate ?? kindDetails.listingDate,
        status: buildSourceStatus(kindDetails.subscriptionStart, kindDetails.subscriptionEnd),
        demandCompetitionRate: null,
        lockupRate: null,
        insiderSalesRatio: null,
        marketMoodScore: null,
        financialReportLabel: null,
        revenue: null,
        previousRevenue: null,
        revenueGrowthRate: null,
        operatingIncome: null,
        previousOperatingIncome: null,
        operatingMarginRate: null,
        netIncome: null,
        previousNetIncome: null,
        totalAssets: null,
        totalLiabilities: null,
        totalEquity: null,
        debtRatio: null,
        notes: [
          `KIND 공모일정 기준 상장예정일 ${schedule.listingDate}`,
          `KIND 공모기업현황 상세 기준 공모청약일정 ${kindDetails.subscriptionStart} ~ ${kindDetails.subscriptionEnd}`,
        ],
      } satisfies SourceIpoRecord;
    }),
  );

  return [...mergedRecords, ...kindOnlyRecords.filter((record): record is SourceIpoRecord => record !== null)];
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
      corpCode: record.corpCode ?? opendart.corpCode ?? null,
      stockCode: record.stockCode ?? opendart.stockCode ?? null,
      latestDisclosureNo: record.latestDisclosureNo ?? opendart.latestDisclosureNo ?? null,
      priceBandLow: record.priceBandLow ?? opendart.priceBandLow ?? null,
      priceBandHigh: record.priceBandHigh ?? opendart.priceBandHigh ?? null,
      minimumSubscriptionShares: record.minimumSubscriptionShares ?? opendart.minimumSubscriptionShares ?? null,
      depositRate: record.depositRate ?? opendart.depositRate ?? null,
      totalOfferedShares: record.totalOfferedShares ?? opendart.totalOfferedShares ?? null,
      newShares: record.newShares ?? opendart.newShares ?? null,
      secondaryShares: record.secondaryShares ?? opendart.secondaryShares ?? null,
      listedShares: record.listedShares ?? opendart.listedShares ?? null,
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
        market: kindDetails.market ?? record.market,
        offerPrice: kindDetails.offerPrice ?? record.offerPrice ?? null,
        generalSubscriptionCompetitionRate:
          kindDetails.generalSubscriptionCompetitionRate ?? record.generalSubscriptionCompetitionRate ?? null,
        irStart: kindDetails.irStart ?? record.irStart ?? null,
        irEnd: kindDetails.irEnd ?? record.irEnd ?? null,
        demandForecastStart: kindDetails.demandForecastStart ?? record.demandForecastStart ?? null,
        demandForecastEnd: kindDetails.demandForecastEnd ?? record.demandForecastEnd ?? null,
        listedShares: kindDetails.listedShares ?? record.listedShares ?? null,
        tradableShares: kindDetails.tradableShares ?? record.tradableShares ?? null,
        floatRatio: kindDetails.floatRatio ?? record.floatRatio ?? null,
        refundDate: kindDetails.refundDate ?? record.refundDate ?? null,
        listingDate: record.listingDate ?? kindDetails.listingDate ?? null,
        notes: nextNotes,
      } satisfies SourceIpoRecord;
    }),
  );
};

const seibroMarketLabels: Record<SeibroDutyDepoMarketTypeCode, string> = {
  "11": "유가증권시장",
  "12": "코스닥시장",
  "13": "K-OTC시장",
  "14": "코넥스시장",
  "50": "기타비상장",
};

type SeibroLockupContext = {
  source: "SEIBRO";
  standardDate: string;
  marketTypeCode: SeibroDutyDepoMarketTypeCode;
  marketLabel: string;
  summary: {
    stockKindName: string | null;
    companyCount: number | null;
    issueCount: number | null;
    totalIssuedShares: number | null;
    dutyDepoShares: number | null;
    dutyDepoRatio: number | null;
  } | null;
  reasonBreakdown: Array<{
    reasonCode: string | null;
    reasonName: string | null;
    shares: number | null;
    companyCount: number | null;
    issueCount: number | null;
  }>;
};

const toSeibroMarketTypeCode = (market: string): SeibroDutyDepoMarketTypeCode => {
  switch (market) {
    case "KOSPI":
      return "11";
    case "KOSDAQ":
      return "12";
    case "KONEX":
      return "14";
    default:
      return "50";
  }
};

const toCompactDateKey = (value: string) => value.replace(/-/g, "");

const formatCompactDateKey = (value: string) =>
  value.length === 8
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;

const getSeibroReferenceDate = (record: SourceIpoRecord) => {
  const todayKey = getKstTodayKey();
  const referenceDate = record.subscriptionEnd ?? record.listingDate ?? record.subscriptionStart ?? null;
  if (!referenceDate || referenceDate > todayKey) {
    return null;
  }

  return referenceDate;
};

const pickPreferredSeibroStatusItem = (items: SeibroDutyDepoStatusItem[]) =>
  items.find((item) => item.stockKindName === "보통주")
  ?? items.find((item) => item.stockKindCode === "01")
  ?? items[0]
  ?? null;

const buildSeibroLockupContext = (snapshot: SeibroDutyDepoSnapshot): SeibroLockupContext => {
  const summary = pickPreferredSeibroStatusItem(snapshot.statusItems);
  const reasons = [...snapshot.reasonItems]
    .sort(
      (left, right) =>
        (right.safeDepoShares ?? right.dutyDepoShares ?? 0) - (left.safeDepoShares ?? left.dutyDepoShares ?? 0),
    )
    .slice(0, 3)
    .map((reason) => ({
      reasonCode: reason.reasonCode,
      reasonName: reason.reasonName,
      shares: reason.safeDepoShares ?? reason.dutyDepoShares,
      companyCount: reason.safeDepoCompanyCount ?? reason.dutyDepoCompanyCount,
      issueCount: reason.safeDepoIssueCount ?? reason.dutyDepoIssueCount,
    }));

  return {
    source: "SEIBRO",
    standardDate: snapshot.standardDate,
    marketTypeCode: snapshot.marketTypeCode,
    marketLabel: seibroMarketLabels[snapshot.marketTypeCode],
    summary:
      summary == null
        ? null
        : {
            stockKindName: summary.stockKindName,
            companyCount: summary.companyCount,
            issueCount: summary.issueCount,
            totalIssuedShares: summary.totalIssuedShares,
            dutyDepoShares: summary.dutyDepoShares,
            dutyDepoRatio: summary.dutyDepoRatio,
          },
    reasonBreakdown: reasons,
  };
};

const enrichSeibroLockupMetadata = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: SyncOptions = {},
): Promise<SourceIpoRecord[]> => {
  if (records.length === 0 || !env.seibroServiceKey) {
    return records;
  }

  return Promise.all(
    records.map(async (record) => {
      const standardDate = getSeibroReferenceDate(record);
      if (!standardDate) {
        return record;
      }

      const marketTypeCode = toSeibroMarketTypeCode(record.market);

      const snapshot = await fetchSeibroDutyDepoSnapshot(toCompactDateKey(standardDate), marketTypeCode, {
        forceRefresh,
      }).catch(() => null);

      if (!snapshot || snapshot.statusItems.length === 0) {
        return record;
      }

      const lockupContext = buildSeibroLockupContext(snapshot);
      const summary = lockupContext.summary;
      const topReason = lockupContext.reasonBreakdown[0] ?? null;

      const nextNotes = [...(record.notes ?? [])];
      const summaryNote = summary
        ? `SEIBro 의무보호예수 시장현황(${seibroMarketLabels[marketTypeCode]}, ${formatCompactDateKey(snapshot.standardDate)}) 보호예수비율 ${summary.dutyDepoRatio ?? "-"}%`
        : null;
      const reasonNote =
        topReason?.reasonName && topReason.shares != null
          ? `SEIBro 사유별 상위 ${topReason.reasonName} ${topReason.shares.toLocaleString("ko-KR")}주`
          : null;

      if (summaryNote && !nextNotes.includes(summaryNote)) {
        nextNotes.push(summaryNote);
      }

      if (reasonNote && !nextNotes.includes(reasonNote)) {
        nextNotes.push(reasonNote);
      }

      return {
        ...record,
        lockupDetailJson: {
          ...(record.lockupDetailJson ?? {}),
          seibroMarketContext: lockupContext,
        },
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
  const currentKstMinutes = getKstMinutesOfDay();
  const captureWindowStartKey = shiftKstDateKey(todayKey, -5);

  const enrichedRecords = await Promise.all(
    records.map(async (record) => {
      const isListingToday = record.listingDate === todayKey;

      if (
        !record.kindIssueCode
        || !record.listingDate
        || record.listingDate > todayKey
        || (isListingToday && currentKstMinutes < 10 * 60)
        || record.listingDate < captureWindowStartKey
      ) {
        return record;
      }

      const snapshot = await fetchKindStockPriceSnapshot(record.kindIssueCode, {
        forceRefresh: forceRefresh || isListingToday,
      });
      if (snapshot.priceDate !== record.listingDate || snapshot.openingPrice == null) {
        return record;
      }

      const listingOpenReturnRate = toListingOpenReturnRate(record.offerPrice, snapshot.openingPrice);
      const notes = record.notes ?? [];
      const asOfLabel = snapshot.priceAsOf ?? snapshot.priceDate ?? record.listingDate;
      const kindNote = `KIND 시세 기준(${asOfLabel}) 시초가 ${snapshot.openingPrice.toLocaleString("ko-KR")}원`;

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

const syncScoringArtifactsSafely = async ({
  legacyIpoId,
  slug,
}: {
  legacyIpoId: string;
  slug: string;
  record: SourceIpoRecord;
  sourceChecksum: string;
  seenAt: Date;
}) => {
  void legacyIpoId;
  void slug;
};

const runScoringAuditSafely = async (legacyIpoIds: string[]) => {
  void legacyIpoIds;

  return {
    processed: 0,
    createdSnapshots: 0,
    failed: 0,
  };
};

const fetchSourceRecords = async ({ forceRefresh = false }: SyncOptions = {}): Promise<SourceFetchResult> => {
  if (!hasLiveIpoSource()) {
    throw new Error("No live IPO source is configured. Set IPO_SOURCE_URL or OPENDART_API_KEY.");
  }

  let sourceRecords: SourceIpoRecord[];
  let excludedNonIpoSlugs: string[] = [];

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
    const opendartResult = await fetchOpendartCurrentMonthIpoResult({ forceRefresh });
    sourceRecords = opendartResult.records;
    excludedNonIpoSlugs = opendartResult.excludedNonIpoNames.map((name) => slugify(name));
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
  const recordsWithSeibroLockupMetadata = await enrichSeibroLockupMetadata(recordsWithKindOfferMetadata, {
    forceRefresh,
  });
  let recordsWithBrokerSubscriptionMetadata = recordsWithSeibroLockupMetadata;

  try {
    recordsWithBrokerSubscriptionMetadata = await enrichBrokerSubscriptionMetadata(recordsWithSeibroLockupMetadata, {
      forceRefresh,
    });
  } catch (error) {
    await logOperation({
      level: "WARN",
      source: "job:daily-sync",
      action: "broker_subscription_enrichment_failed",
      message: "증권사 청약 안내 보강을 적용하지 못해 기존 공시/KIND 데이터만 사용합니다.",
      context: toErrorContext(error, {
        forceRefresh,
        sourceRecords: recordsWithSeibroLockupMetadata.length,
      }),
    });
  }

  return {
    records: await enrichListingOpenMetrics(recordsWithBrokerSubscriptionMetadata, { forceRefresh }),
    excludedNonIpoSlugs,
  };
};

const countActiveDisplayRangeIpos = async () => {
  const result = await prisma.ipo.count({
    where: getDisplayRangeWhere(),
  });

  return result;
};

const markStaleDisplayRangeIpos = async (
  sourceRecords: SourceIpoRecord[],
  { immediateWithdrawSlugs = [] }: { immediateWithdrawSlugs?: string[] } = {},
) => {
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

  const immediateWithdrawSlugSet = new Set(immediateWithdrawSlugs);

  const protectedCandidates = staleCandidates.filter((ipo) => {
    if (immediateWithdrawSlugSet.has(slugify(ipo.name))) {
      return false;
    }

    const lastFetchedAt = ipo.sourceSnapshots[0]?.fetchedAt;
    return isOnOrAfterKstDayOffset(lastFetchedAt, -STALE_SOURCE_WITHDRAWAL_GRACE_DAYS);
  });
  const withdrawableIds = staleCandidates
    .filter((ipo) => immediateWithdrawSlugSet.has(slugify(ipo.name)) || !protectedCandidates.some((protectedIpo) => protectedIpo.id === ipo.id))
    .map((ipo) => ipo.id);

  if (immediateWithdrawSlugSet.size > 0) {
    await logOperation({
      level: "WARN",
      source: "job:daily-sync",
      action: "withdrew_non_ipo_records",
      message: `실권주/배정형 비IPO로 판정된 ${immediateWithdrawSlugSet.size}건을 캘린더에서 제외했습니다.`,
      context: {
        count: immediateWithdrawSlugSet.size,
        names: staleCandidates
          .filter((ipo) => immediateWithdrawSlugSet.has(slugify(ipo.name)))
          .map((ipo) => ipo.name),
      },
    });
  }

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
    latestSnapshot?.sourceSnapshots[0]?.sourceKey === persistedRecord.sourceKey
    && latestSnapshot.sourceSnapshots[0]?.checksum === checksum
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

    if (latestSnapshot.id) {
      await syncScoringArtifactsSafely({
        legacyIpoId: latestSnapshot.id,
        slug,
        record: persistedRecord,
        sourceChecksum: checksum,
        seenAt,
      });
    }

    const unchanged = await getIpoRecordBySlugFromDb(slug);
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
      payload: toPrismaJsonValue(persistedRecord),
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

  await syncScoringArtifactsSafely({
    legacyIpoId: ipo.id,
    slug,
    record: persistedRecord,
    sourceChecksum: checksum,
    seenAt,
  });

  return getIpoRecordBySlugFromDb(slug);
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
    const { records: sourceRecords, excludedNonIpoSlugs } = await fetchSourceRecords({ forceRefresh });

    if (!(await canUseDatabase())) {
      const result = {
        mode: "fallback" as const,
        synced: sourceRecords.length,
        ipos: sourceRecords.map(normalizeSourceIpoRecord),
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
    const markedWithdrawn = await markStaleDisplayRangeIpos(sourceRecords, {
      immediateWithdrawSlugs: excludedNonIpoSlugs,
    });
    const syncedLegacyIpoIds = ipos
      .filter((ipo): ipo is IpoRecord => Boolean(ipo))
      .map((ipo) => ipo.id);
    const scoreRecalcResult = await runScoringAuditSafely(syncedLegacyIpoIds);

    await logOperation({
      level: "INFO",
      source: "job:daily-sync",
      action: "completed",
      message: `공모주 일정 ${synced}건을 동기화했습니다.`,
      context: {
        synced,
        sourceRecords: sourceRecords.length,
        markedWithdrawn,
        forceRefresh,
        scoreRecalcProcessed: scoreRecalcResult?.processed ?? 0,
        scoreSnapshotsCreated: scoreRecalcResult?.createdSnapshots ?? 0,
        scoreRecalcFailed: scoreRecalcResult?.failed ?? 0,
      },
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
