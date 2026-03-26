import { createHash } from "node:crypto";

import {
  Prisma,
  type IpoFactSourceType,
  type ScoreQueueStatus,
  type ScoreRecalcReason,
} from "@prisma/client";

import { normalizeBrokerName as normalizeBrokerKey } from "@/lib/broker-brand";
import { parseKstDate, getKstTodayKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { buildScoreSnapshot } from "@/lib/scoring";
import type { AdminIpoScoreRecord, PublicIpoScoreRecord, SourceIpoRecord } from "@/lib/types";

const SCORE_VERSION = "v2.4";
const SCORE_SOURCE_PRIORITY_VERSION = "v1:opendart+kind";
const SCORE_RECALC_MAX_ATTEMPTS = 5;
const SCORE_RECALC_BASE_RETRY_DELAY_MS = 5 * 60 * 1000;
const SCORING_TABLE_NAMES = [
  "ipo_master",
  "ipo_supply",
  "ipo_demand",
  "ipo_subscription",
  "issuer_financials",
  "ipo_score_snapshot",
  "ipo_recalc_queue",
];
const SCORING_DELEGATE_NAMES = [
  "ipoMaster",
  "ipoSupply",
  "ipoDemand",
  "ipoSubscription",
  "issuerFinancial",
  "ipoScoreSnapshot",
  "ipoScoreRecalcQueue",
] as const;

let scoringTablesAvailable: boolean | null = null;

type SyncScoringArtifactsInput = {
  legacyIpoId: string;
  slug: string;
  record: SourceIpoRecord;
  sourceChecksum: string;
  seenAt?: Date;
};

type ProcessScoreQueueResult = {
  processed: number;
  createdSnapshots: number;
  skippedSnapshots: number;
  failed: number;
};

const isScoringTableError = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);

  return (
    code === "P2021"
    || code === "P2022"
    || message.includes("Cannot read properties of undefined")
    || SCORING_TABLE_NAMES.some((tableName) => message.includes(tableName))
  );
};

const hasScoringDelegates = () => {
  const prismaClient = prisma as unknown as Record<string, unknown>;

  return SCORING_DELEGATE_NAMES.every((delegateName) => {
    const delegate = prismaClient[delegateName];

    return typeof delegate === "object" && delegate !== null && "findMany" in delegate;
  });
};

const withScoringTables = async <T>(label: string, operation: () => Promise<T>): Promise<T | null> => {
  if (scoringTablesAvailable === false) {
    return null;
  }

  if (!hasScoringDelegates()) {
    scoringTablesAvailable = false;
    console.warn(`[WARN] scoring-store:${label} prisma delegate unavailable`, {
      missingDelegates: SCORING_DELEGATE_NAMES.filter((delegateName) => !(delegateName in (prisma as unknown as Record<string, unknown>))),
    });
    return null;
  }

  try {
    const result = await operation();
    scoringTablesAvailable = true;
    return result;
  } catch (error) {
    if (isScoringTableError(error)) {
      scoringTablesAvailable = false;
      console.warn(`[WARN] scoring-store:${label} unavailable`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    throw error;
  }
};

const toSourceType = (record: SourceIpoRecord): IpoFactSourceType => {
  if (record.sourceKey.startsWith("opendart")) {
    return "OPENDART";
  }

  if (record.sourceKey.startsWith("kind")) {
    return "KIND";
  }

  return "INTERNAL";
};

const toBigIntOrNull = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return BigInt(Math.trunc(value));
};

const toDateOrNull = (value: string | null | undefined) => (value ? parseKstDate(value) : null);

const toJsonChecksum = (value: unknown) =>
  JSON.stringify(value, (_, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue));

const buildChecksum = (value: unknown) => createHash("sha256").update(toJsonChecksum(value)).digest("hex");

const toPrismaJsonValue = (value: Record<string, unknown> | null | undefined) =>
  value == null
    ? Prisma.DbNull
    : (JSON.parse(toJsonChecksum(value)) as Prisma.InputJsonValue);

const normalizeManagerValue = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized && normalized !== "-" ? normalized : null;
};

const normalizeBrokerLabel = (value: string | null | undefined) => normalizeManagerValue(value);

const collectBrokerNames = (record: SourceIpoRecord) => {
  const brokerNames = [record.leadManager, ...(record.coManagers ?? [])]
    .map((value) => normalizeBrokerLabel(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(brokerNames)];
};

const buildMasterPayload = ({
  legacyIpoId,
  slug,
  record,
  seenAt,
}: {
  legacyIpoId: string;
  slug: string;
  record: SourceIpoRecord;
  seenAt: Date;
}) => ({
  legacyIpoId,
  slug,
  issuerName: record.name,
  market: record.market,
  corpCode: record.corpCode ?? null,
  stockCode: record.stockCode ?? null,
  kindIssueCode: record.kindIssueCode ?? null,
  kindBizProcessNo: record.kindBizProcessNo ?? null,
  leadManager: normalizeManagerValue(record.leadManager),
  coManagers: record.coManagers ?? [],
  priceBandLow: record.priceBandLow ?? null,
  priceBandHigh: record.priceBandHigh ?? null,
  offerPrice: record.offerPrice ?? null,
  subscriptionStart: toDateOrNull(record.subscriptionStart),
  subscriptionEnd: toDateOrNull(record.subscriptionEnd),
  refundDate: toDateOrNull(record.refundDate),
  listingDate: toDateOrNull(record.listingDate),
  status: record.status ?? "UPCOMING",
  latestDisclosureNo: record.latestDisclosureNo ?? null,
  sourcePriorityVersion: SCORE_SOURCE_PRIORITY_VERSION,
  lastSourceSeenAt: seenAt,
  lastFactRefreshedAt: seenAt,
});

const buildSupplyPayload = (record: SourceIpoRecord) => ({
  sourceType: toSourceType(record),
  sourceKey: `${record.sourceKey}:supply`,
  sourceRef: record.latestDisclosureNo ?? record.kindBizProcessNo ?? record.kindIssueCode ?? null,
  asOfDate: toDateOrNull(record.listingDate ?? record.subscriptionEnd ?? record.subscriptionStart),
  totalOfferedShares: toBigIntOrNull(record.totalOfferedShares),
  newShares: toBigIntOrNull(record.newShares),
  secondaryShares: toBigIntOrNull(record.secondaryShares),
  listedShares: toBigIntOrNull(record.listedShares),
  tradableShares: toBigIntOrNull(record.tradableShares),
  floatRatio: record.floatRatio ?? null,
  insiderSalesRatio: record.insiderSalesRatio ?? null,
  lockupConfirmedShares: null,
  lockupRatio: record.lockupRate ?? null,
  lockupDetailJson: toPrismaJsonValue(record.lockupDetailJson),
  confidence: buildFieldConfidence([
    record.floatRatio,
    record.insiderSalesRatio,
    record.lockupRate,
    record.tradableShares,
  ]),
});

const buildFinancialPayload = (record: SourceIpoRecord) => ({
  corpCode: record.corpCode ?? null,
  reportReceiptNo: record.latestDisclosureNo ?? null,
  reportCode: null,
  reportLabel: record.financialReportLabel ?? "OpenDART 재무 보강",
  statementType: parseStatementType(record.financialReportLabel),
  fiscalYear: parseFiscalYear(record.financialReportLabel),
  fiscalPeriod: parseFiscalPeriod(record.financialReportLabel),
  revenue: toBigIntOrNull(record.revenue),
  previousRevenue: toBigIntOrNull(record.previousRevenue),
  revenueGrowthRate: record.revenueGrowthRate ?? null,
  operatingIncome: toBigIntOrNull(record.operatingIncome),
  previousOperatingIncome: toBigIntOrNull(record.previousOperatingIncome),
  operatingMarginRate: record.operatingMarginRate ?? null,
  netIncome: toBigIntOrNull(record.netIncome),
  previousNetIncome: toBigIntOrNull(record.previousNetIncome),
  totalAssets: toBigIntOrNull(record.totalAssets),
  totalLiabilities: toBigIntOrNull(record.totalLiabilities),
  totalEquity: toBigIntOrNull(record.totalEquity),
  debtRatio: record.debtRatio ?? null,
  sourceKey: `${record.sourceKey}:financial`,
});

const buildDemandPayload = (record: SourceIpoRecord) => ({
  sourceType: toSourceType(record),
  sourceKey: `${record.sourceKey}:demand`,
  sourceRef: record.latestDisclosureNo ?? record.kindBizProcessNo ?? record.kindIssueCode ?? null,
  demandForecastStart: toDateOrNull(record.demandForecastStart),
  demandForecastEnd: toDateOrNull(record.demandForecastEnd),
  institutionalCompetitionRate: record.demandCompetitionRate ?? null,
  priceBandTopAcceptanceRatio: null,
  priceBandExceedRatio: null,
  participatingInstitutions: null,
  orderQuantity: null,
  bidDistributionJson: Prisma.DbNull,
  confidence: buildFieldConfidence([
    record.demandCompetitionRate,
  ]),
});

const buildSubscriptionPayloads = (record: SourceIpoRecord) => {
  const explicitDetails = new Map(
    (record.brokerSubscriptionDetails ?? []).map((detail) => [normalizeBrokerKey(detail.brokerName), detail] as const),
  );
  const brokerNames = [
    ...collectBrokerNames(record),
    ...(record.brokerSubscriptionDetails ?? []).map((detail) => detail.brokerName),
  ].filter(Boolean);

  return [...new Set(brokerNames.map((brokerName) => normalizeBrokerKey(brokerName)).filter(Boolean))]
    .map((normalizedBrokerName) => {
      const explicitDetail = explicitDetails.get(normalizedBrokerName) ?? null;
      const brokerName =
        explicitDetail?.brokerName
        ?? collectBrokerNames(record).find((value) => normalizeBrokerKey(value) === normalizedBrokerName)
        ?? normalizedBrokerName;

      return {
        brokerName,
        brokerCode: explicitDetail?.brokerCode ?? null,
        sourceType: explicitDetail ? "BROKER" : toSourceType(record),
        sourceKey: explicitDetail?.sourceKey ?? `${record.sourceKey}:subscription:${brokerName}`,
        sourceRef: explicitDetail?.sourceRef ?? record.kindBizProcessNo ?? record.kindIssueCode ?? record.latestDisclosureNo ?? null,
        subscriptionStart: toDateOrNull(record.subscriptionStart),
        subscriptionEnd: toDateOrNull(record.subscriptionEnd),
        generalCompetitionRate: explicitDetail?.generalCompetitionRate ?? record.generalSubscriptionCompetitionRate ?? null,
        allocatedShares: toBigIntOrNull(explicitDetail?.allocatedShares ?? null),
        equalAllocatedShares: toBigIntOrNull(explicitDetail?.equalAllocatedShares ?? null),
        proportionalAllocatedShares: toBigIntOrNull(explicitDetail?.proportionalAllocatedShares ?? null),
        minimumSubscriptionShares: explicitDetail?.minimumSubscriptionShares ?? record.minimumSubscriptionShares ?? null,
        maximumSubscriptionShares: explicitDetail?.maximumSubscriptionShares ?? null,
        depositRate: explicitDetail?.depositRate ?? record.depositRate ?? null,
        subscriptionFee: explicitDetail?.subscriptionFee ?? null,
        hasOnlineOnlyCondition: explicitDetail?.hasOnlineOnlyCondition ?? false,
        confidence: buildFieldConfidence([
          explicitDetail?.generalCompetitionRate ?? record.generalSubscriptionCompetitionRate ?? null,
          explicitDetail?.minimumSubscriptionShares ?? record.minimumSubscriptionShares ?? null,
          explicitDetail?.maximumSubscriptionShares ?? null,
          explicitDetail?.depositRate ?? record.depositRate ?? null,
          explicitDetail?.subscriptionFee ?? null,
          explicitDetail?.allocatedShares ?? null,
          explicitDetail?.equalAllocatedShares ?? null,
          explicitDetail?.proportionalAllocatedShares ?? null,
        ]),
      };
    });
};

const buildFieldConfidence = (values: Array<number | null | undefined>) => {
  const available = values.filter((value) => value != null).length;
  return Number((available / Math.max(values.length, 1)).toFixed(2));
};

const parseFiscalYear = (label: string | null | undefined) => {
  const year = label?.match(/(\d{4})/)?.[1];
  return year ? Number.parseInt(year, 10) : null;
};

const parseFiscalPeriod = (label: string | null | undefined) => {
  if (!label) {
    return null;
  }

  if (label.includes("사업보고서")) {
    return "ANNUAL";
  }

  if (label.includes("반기")) {
    return "HALF";
  }

  if (label.includes("1분기")) {
    return "Q1";
  }

  if (label.includes("3분기")) {
    return "Q3";
  }

  return null;
};

const parseStatementType = (label: string | null | undefined) => {
  if (!label) {
    return null;
  }

  if (label.includes("연결")) {
    return "CFS";
  }

  if (label.includes("별도")) {
    return "OFS";
  }

  return null;
};

const hasAnySupplyValue = (record: SourceIpoRecord) =>
  [
    record.totalOfferedShares,
    record.newShares,
    record.secondaryShares,
    record.listedShares,
    record.tradableShares,
    record.floatRatio,
    record.insiderSalesRatio,
    record.lockupRate,
    record.lockupDetailJson,
  ].some((value) => value != null);

const hasAnyFinancialValue = (record: SourceIpoRecord) =>
  [
    record.revenue,
    record.previousRevenue,
    record.revenueGrowthRate,
    record.operatingIncome,
    record.previousOperatingIncome,
    record.operatingMarginRate,
    record.netIncome,
    record.previousNetIncome,
    record.totalAssets,
    record.totalLiabilities,
    record.totalEquity,
    record.debtRatio,
  ].some((value) => value != null);

const hasAnyDemandValue = (record: SourceIpoRecord) =>
  [
    record.demandForecastStart,
    record.demandForecastEnd,
    record.demandCompetitionRate,
  ].some((value) => value != null);

const hasAnySubscriptionValue = (record: SourceIpoRecord) =>
  [
    record.generalSubscriptionCompetitionRate,
    record.minimumSubscriptionShares,
    record.depositRate,
    ...(record.brokerSubscriptionDetails ?? []).flatMap((detail) => [
      detail.generalCompetitionRate,
      detail.minimumSubscriptionShares,
      detail.maximumSubscriptionShares,
      detail.depositRate,
      detail.subscriptionFee,
      detail.allocatedShares,
      detail.equalAllocatedShares,
      detail.proportionalAllocatedShares,
    ]),
  ].some((value) => value != null)
  && (collectBrokerNames(record).length > 0 || (record.brokerSubscriptionDetails?.length ?? 0) > 0);

const sameJson = (left: unknown, right: unknown) => toJsonChecksum(left) === toJsonChecksum(right);

const touchLatestFact = async <T extends { id: string }>(
  model: {
    update: (args: {
      where: { id: string };
      data: { collectedAt: Date; isLatest?: boolean };
    }) => Promise<T>;
  },
  id: string,
  seenAt: Date,
) =>
  model.update({
    where: { id },
    data: {
      collectedAt: seenAt,
      isLatest: true,
    },
  });

const upsertSupplyFact = async (ipoId: string, record: SourceIpoRecord, seenAt: Date) => {
  const latest = await prisma.ipoSupply.findFirst({
    where: { ipoId, isLatest: true },
    orderBy: { collectedAt: "desc" },
  });

  if (!hasAnySupplyValue(record)) {
    if (latest) {
      await touchLatestFact(prisma.ipoSupply, latest.id, seenAt);
    }
    return false;
  }

  const payload = buildSupplyPayload(record);
  const checksum = buildChecksum(payload);

  if (latest?.checksum === checksum) {
    await touchLatestFact(prisma.ipoSupply, latest.id, seenAt);
    return false;
  }

  const existingChecksumMatch = await prisma.ipoSupply.findFirst({
    where: { ipoId, sourceKey: payload.sourceKey, checksum },
  });

  await prisma.$transaction(async (tx) => {
    await tx.ipoSupply.updateMany({
      where: { ipoId, isLatest: true },
      data: { isLatest: false },
    });

    if (existingChecksumMatch) {
      await tx.ipoSupply.update({
        where: { id: existingChecksumMatch.id },
        data: {
          isLatest: true,
          collectedAt: seenAt,
          asOfDate: payload.asOfDate,
          confidence: payload.confidence,
        },
      });
      return;
    }

    await tx.ipoSupply.create({
      data: {
        ipoId,
        ...payload,
        checksum,
        collectedAt: seenAt,
      },
    });
  });

  return true;
};

const upsertFinancialFact = async (ipoId: string, record: SourceIpoRecord, seenAt: Date) => {
  const latest = await prisma.issuerFinancial.findFirst({
    where: { ipoId, isLatest: true },
    orderBy: { collectedAt: "desc" },
  });

  if (!hasAnyFinancialValue(record)) {
    if (latest) {
      await touchLatestFact(prisma.issuerFinancial, latest.id, seenAt);
    }
    return false;
  }

  const payload = buildFinancialPayload(record);
  const checksum = buildChecksum(payload);

  if (latest?.checksum === checksum) {
    await touchLatestFact(prisma.issuerFinancial, latest.id, seenAt);
    return false;
  }

  const existingChecksumMatch = await prisma.issuerFinancial.findFirst({
    where: { ipoId, sourceKey: payload.sourceKey, checksum },
  });

  await prisma.$transaction(async (tx) => {
    await tx.issuerFinancial.updateMany({
      where: { ipoId, isLatest: true },
      data: { isLatest: false },
    });

    if (existingChecksumMatch) {
      await tx.issuerFinancial.update({
        where: { id: existingChecksumMatch.id },
        data: {
          isLatest: true,
          collectedAt: seenAt,
          reportLabel: payload.reportLabel,
        },
      });
      return;
    }

    await tx.issuerFinancial.create({
      data: {
        ipoId,
        ...payload,
        checksum,
        collectedAt: seenAt,
      },
    });
  });

  return true;
};

const upsertDemandFact = async (ipoId: string, record: SourceIpoRecord, seenAt: Date) => {
  const latest = await prisma.ipoDemand.findFirst({
    where: { ipoId, isLatest: true },
    orderBy: { collectedAt: "desc" },
  });

  if (!hasAnyDemandValue(record)) {
    if (latest) {
      await touchLatestFact(prisma.ipoDemand, latest.id, seenAt);
    }
    return false;
  }

  const payload = buildDemandPayload(record);
  const checksum = buildChecksum(payload);

  if (latest?.checksum === checksum) {
    await touchLatestFact(prisma.ipoDemand, latest.id, seenAt);
    return false;
  }

  const existingChecksumMatch = await prisma.ipoDemand.findFirst({
    where: { ipoId, sourceKey: payload.sourceKey, checksum },
  });

  await prisma.$transaction(async (tx) => {
    await tx.ipoDemand.updateMany({
      where: { ipoId, isLatest: true },
      data: { isLatest: false },
    });

    if (existingChecksumMatch) {
      await tx.ipoDemand.update({
        where: { id: existingChecksumMatch.id },
        data: {
          isLatest: true,
          collectedAt: seenAt,
          demandForecastStart: payload.demandForecastStart,
          demandForecastEnd: payload.demandForecastEnd,
          confidence: payload.confidence,
        },
      });
      return;
    }

    await tx.ipoDemand.create({
      data: {
        ipoId,
        ...payload,
        checksum,
        collectedAt: seenAt,
      },
    });
  });

  return true;
};

const upsertSubscriptionFacts = async (ipoId: string, record: SourceIpoRecord, seenAt: Date) => {
  const latest = await prisma.ipoSubscription.findMany({
    where: { ipoId, isLatest: true },
    orderBy: { collectedAt: "desc" },
  });

  if (!hasAnySubscriptionValue(record)) {
    if (latest.length > 0) {
      await Promise.all(latest.map((row) => touchLatestFact(prisma.ipoSubscription, row.id, seenAt)));
    }
    return false;
  }

  const payloads = buildSubscriptionPayloads(record);
  const nextChecksums = payloads.map((payload) => buildChecksum(payload));
  const latestComparable = latest
    .map((row) => ({
      brokerName: row.brokerName,
      sourceKey: row.sourceKey,
      checksum: row.checksum,
    }))
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  const nextComparable = payloads
    .map((payload, index) => ({
      brokerName: payload.brokerName,
      sourceKey: payload.sourceKey,
      checksum: nextChecksums[index]!,
    }))
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

  if (sameJson(latestComparable, nextComparable)) {
    await Promise.all(latest.map((row) => touchLatestFact(prisma.ipoSubscription, row.id, seenAt)));
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ipoSubscription.updateMany({
      where: { ipoId, isLatest: true },
      data: { isLatest: false },
    });

    for (const [index, payload] of payloads.entries()) {
      const checksum = nextChecksums[index]!;
      const existingChecksumMatch = await tx.ipoSubscription.findFirst({
        where: { ipoId, brokerName: payload.brokerName, sourceKey: payload.sourceKey, checksum },
      });

      if (existingChecksumMatch) {
        await tx.ipoSubscription.update({
          where: { id: existingChecksumMatch.id },
          data: {
            isLatest: true,
            collectedAt: seenAt,
            subscriptionStart: payload.subscriptionStart,
            subscriptionEnd: payload.subscriptionEnd,
            confidence: payload.confidence,
          },
        });
        continue;
      }

      await tx.ipoSubscription.create({
        data: {
          ipoId,
          ...payload,
          checksum,
          collectedAt: seenAt,
        },
      });
    }
  });

  return true;
};

const enqueueScoreRecalc = async ({
  ipoId,
  reason,
  triggerSource,
  triggerPayload,
  dedupeKey,
  runAfter = new Date(),
}: {
  ipoId: string;
  reason: ScoreRecalcReason;
  triggerSource: string;
  triggerPayload?: Prisma.InputJsonValue | null;
  dedupeKey: string;
  runAfter?: Date;
}) => {
  const refreshExistingQueueItem = async (existing: {
    id: string;
    status: ScoreQueueStatus;
    runAfter: Date;
  }) => {
    if (existing.status === "FAILED") {
      await prisma.ipoScoreRecalcQueue.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          triggerSource,
          triggerPayload: triggerPayload ?? Prisma.DbNull,
          runAfter: existing.runAfter <= runAfter ? existing.runAfter : runAfter,
          attempts: 0,
          lastError: null,
          processedAt: null,
        },
      });
      return;
    }

    if (existing.status === "PENDING" && existing.runAfter > runAfter) {
      await prisma.ipoScoreRecalcQueue.update({
        where: { id: existing.id },
        data: {
          runAfter,
        },
      });
    }
  };

  const existing = await prisma.ipoScoreRecalcQueue.findUnique({
    where: { dedupeKey },
    select: {
      id: true,
      status: true,
      runAfter: true,
    },
  });

  if (existing) {
    await refreshExistingQueueItem(existing);
    return;
  }

  try {
    await prisma.ipoScoreRecalcQueue.create({
      data: {
        ipoId,
        reason,
        triggerSource,
        triggerPayload: triggerPayload ?? Prisma.DbNull,
        dedupeKey,
        runAfter,
      },
    });
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && String(error.code) === "P2002"
    ) {
      const racedExisting = await prisma.ipoScoreRecalcQueue.findUnique({
        where: { dedupeKey },
        select: {
          id: true,
          status: true,
          runAfter: true,
        },
      });

      if (!racedExisting) {
        return;
      }

      await refreshExistingQueueItem(racedExisting);
      return;
    }

    throw error;
  }
};

const toNumberOrNull = (value: bigint | number | null | undefined) => {
  if (value == null) {
    return null;
  }

  return typeof value === "bigint" ? Number(value) : value;
};

const getRetryDelayMs = (attempts: number) =>
  SCORE_RECALC_BASE_RETRY_DELAY_MS * Math.max(1, Math.min(8, 2 ** Math.max(attempts - 1, 0)));

export const syncIpoScoringArtifacts = async ({
  legacyIpoId,
  slug,
  record,
  sourceChecksum,
  seenAt = new Date(),
}: SyncScoringArtifactsInput) =>
  withScoringTables("sync", async () => {
    const existingMaster = await prisma.ipoMaster.findUnique({
      where: { legacyIpoId },
      select: {
        legacyIpoId: true,
        slug: true,
        issuerName: true,
        market: true,
        corpCode: true,
        stockCode: true,
        kindIssueCode: true,
        kindBizProcessNo: true,
        leadManager: true,
        coManagers: true,
        priceBandLow: true,
        priceBandHigh: true,
        offerPrice: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        refundDate: true,
        listingDate: true,
        status: true,
        latestDisclosureNo: true,
        sourcePriorityVersion: true,
      },
    });

    const masterPayload = buildMasterPayload({
      legacyIpoId,
      slug,
      record,
      seenAt,
    });
    const comparableMasterPayload = {
      ...masterPayload,
      lastSourceSeenAt: null,
      lastFactRefreshedAt: null,
    };
    const comparableExistingMaster = existingMaster
      ? {
          ...existingMaster,
          lastSourceSeenAt: null,
          lastFactRefreshedAt: null,
        }
      : null;
    const masterChanged = !sameJson(comparableExistingMaster, comparableMasterPayload);

    const master = await prisma.ipoMaster.upsert({
      where: { legacyIpoId },
      update: masterPayload,
      create: masterPayload,
    });

    const [supplyChanged, financialChanged, demandChanged, subscriptionChanged] = await Promise.all([
      upsertSupplyFact(master.id, record, seenAt),
      upsertFinancialFact(master.id, record, seenAt),
      upsertDemandFact(master.id, record, seenAt),
      upsertSubscriptionFacts(master.id, record, seenAt),
    ]);

    if (masterChanged || supplyChanged || financialChanged || demandChanged || subscriptionChanged) {
      await enqueueScoreRecalc({
        ipoId: master.id,
        reason: "SOURCE_REFRESH",
        triggerSource: "job:daily-sync",
        triggerPayload: {
          legacyIpoId,
          slug,
          scoreVersion: SCORE_VERSION,
          sourceChecksum,
          masterChanged,
          supplyChanged,
          financialChanged,
          demandChanged,
          subscriptionChanged,
        },
        dedupeKey: `source-refresh:${master.id}:${sourceChecksum}:${SCORE_VERSION}`,
        runAfter: seenAt,
      });
    }

    return {
      masterId: master.id,
      masterChanged,
      supplyChanged,
      financialChanged,
      demandChanged,
      subscriptionChanged,
    };
  });

export const enqueueDailyScoreAuditForLegacyIpos = async (legacyIpoIds: string[], triggerSource: string) =>
  withScoringTables("enqueue-daily-audit", async () => {
    if (legacyIpoIds.length === 0) {
      return 0;
    }

    const masters = await prisma.ipoMaster.findMany({
      where: {
        legacyIpoId: {
          in: legacyIpoIds,
        },
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      masters.map((master) =>
        enqueueScoreRecalc({
          ipoId: master.id,
          reason: "DAILY_AUDIT",
          triggerSource,
          triggerPayload: {
            auditDateKey: getKstTodayKey(),
            scoreVersion: SCORE_VERSION,
          },
          dedupeKey: `daily-audit:${master.id}:${getKstTodayKey()}:${SCORE_VERSION}`,
        }),
      ),
    );

    return masters.length;
  });

export const getAdminIpoScoreSummaries = async (
  legacyIpos: Array<{ legacyIpoId: string; slug: string; name: string }>,
): Promise<AdminIpoScoreRecord[]> => {
  if (legacyIpos.length === 0) {
    return [];
  }

  const masters = await withScoringTables("admin-score-summaries", async () =>
    prisma.ipoMaster.findMany({
      where: {
        legacyIpoId: {
          in: legacyIpos.map((ipo) => ipo.legacyIpoId),
        },
      },
      include: {
        scoreSnapshots: {
          orderBy: { calculatedAt: "desc" },
          take: 1,
        },
        recalcQueue: {
          where: {
            status: {
              in: ["PENDING", "PROCESSING", "FAILED"],
            },
          },
          orderBy: [
            { updatedAt: "desc" },
            { createdAt: "desc" },
          ],
          take: 1,
        },
      },
    }),
  );

  if (!masters) {
    return legacyIpos.map((ipo) => ({
      legacyIpoId: ipo.legacyIpoId,
      slug: ipo.slug,
      name: ipo.name,
      scoreVersion: null,
      status: "UNAVAILABLE",
      coverageStatus: "UNAVAILABLE",
      totalScore: null,
      supplyScore: null,
      lockupScore: null,
      competitionScore: null,
      marketScore: null,
      financialAdjustmentScore: null,
      warnings: [],
      explanations: [],
      calculatedAt: null,
      queueStatus: null,
      queueReason: null,
      queueAttempts: 0,
    }));
  }

  const masterByLegacyIpoId = new Map(masters.map((master) => [master.legacyIpoId, master] as const));

  return legacyIpos.map((ipo) => {
    const master = masterByLegacyIpoId.get(ipo.legacyIpoId);
    const latestSnapshot = master?.scoreSnapshots[0] ?? null;
    const queue = master?.recalcQueue[0] ?? null;

    return {
      legacyIpoId: ipo.legacyIpoId,
      slug: ipo.slug,
      name: ipo.name,
      scoreVersion: latestSnapshot?.scoreVersion ?? null,
      status: latestSnapshot?.status ?? "NOT_READY",
      coverageStatus: latestSnapshot?.coverageStatus ?? "EMPTY",
      totalScore: latestSnapshot?.totalScore ?? null,
      supplyScore: latestSnapshot?.supplyScore ?? null,
      lockupScore: latestSnapshot?.lockupScore ?? null,
      competitionScore: latestSnapshot?.competitionScore ?? null,
      marketScore: latestSnapshot?.marketScore ?? null,
      financialAdjustmentScore: latestSnapshot?.financialAdjustmentScore ?? null,
      warnings: Array.isArray(latestSnapshot?.warnings) ? (latestSnapshot?.warnings as string[]) : [],
      explanations: Array.isArray(latestSnapshot?.explanations) ? (latestSnapshot?.explanations as string[]) : [],
      calculatedAt: latestSnapshot?.calculatedAt ?? null,
      queueStatus: queue?.status ?? null,
      queueReason: queue?.reason ?? null,
      queueAttempts: queue?.attempts ?? 0,
    };
  });
};

const toPublicIpoScoreRecord = (snapshot: {
  scoreVersion: string;
  status: PublicIpoScoreRecord["status"];
  coverageStatus: PublicIpoScoreRecord["coverageStatus"];
  totalScore: number | null;
  supplyScore: number | null;
  lockupScore: number | null;
  competitionScore: number | null;
  marketScore: number | null;
  financialAdjustmentScore: number | null;
  warnings: unknown;
  explanations: unknown;
  calculatedAt: Date;
} | null): PublicIpoScoreRecord => ({
  scoreVersion: snapshot?.scoreVersion ?? null,
  status: snapshot?.status ?? "NOT_READY",
  coverageStatus: snapshot?.coverageStatus ?? "EMPTY",
  totalScore: snapshot?.totalScore ?? null,
  supplyScore: snapshot?.supplyScore ?? null,
  lockupScore: snapshot?.lockupScore ?? null,
  competitionScore: snapshot?.competitionScore ?? null,
  marketScore: snapshot?.marketScore ?? null,
  financialAdjustmentScore: snapshot?.financialAdjustmentScore ?? null,
  warnings: Array.isArray(snapshot?.warnings) ? (snapshot.warnings as string[]) : [],
  explanations: Array.isArray(snapshot?.explanations) ? (snapshot.explanations as string[]) : [],
  calculatedAt: snapshot?.calculatedAt ?? null,
});

export const getPublicIpoScoreMap = async (legacyIpoIds: string[]): Promise<Map<string, PublicIpoScoreRecord>> => {
  if (legacyIpoIds.length === 0) {
    return new Map();
  }

  const masters = await withScoringTables("public-score-summaries", async () =>
    prisma.ipoMaster.findMany({
      where: {
        legacyIpoId: {
          in: legacyIpoIds,
        },
      },
      include: {
        scoreSnapshots: {
          orderBy: { calculatedAt: "desc" },
          take: 1,
        },
      },
    }),
  );

  if (!masters) {
    return new Map();
  }

  return new Map(
    masters.map((master) => [master.legacyIpoId, toPublicIpoScoreRecord(master.scoreSnapshots[0] ?? null)] as const),
  );
};

export const processPendingIpoScoreRecalcQueue = async (
  triggerSource: string,
  limit = 100,
): Promise<ProcessScoreQueueResult> => {
  const emptyResult = {
    processed: 0,
    createdSnapshots: 0,
    skippedSnapshots: 0,
    failed: 0,
  } satisfies ProcessScoreQueueResult;

  const queueItems = await withScoringTables("process-queue", async () =>
    prisma.ipoScoreRecalcQueue.findMany({
      where: {
        status: "PENDING",
        runAfter: {
          lte: new Date(),
        },
      },
      orderBy: [
        { runAfter: "asc" },
        { createdAt: "asc" },
      ],
      take: limit,
      include: {
        ipo: {
          include: {
            supplyFacts: {
              where: { isLatest: true },
              orderBy: { collectedAt: "desc" },
              take: 1,
            },
            demandFacts: {
              where: { isLatest: true },
              orderBy: { collectedAt: "desc" },
              take: 1,
            },
            subscriptionFacts: {
              where: { isLatest: true },
              orderBy: [
                { brokerName: "asc" },
                { collectedAt: "desc" },
              ],
            },
            financials: {
              where: { isLatest: true },
              orderBy: { collectedAt: "desc" },
              take: 1,
            },
            scoreSnapshots: {
              orderBy: { calculatedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
  );

  if (!queueItems || queueItems.length === 0) {
    return emptyResult;
  }

  await logOperation({
    level: "INFO",
    source: triggerSource,
    action: "score_recalc_started",
    message: `IPO 점수 재계산을 시작했습니다. queued=${queueItems.length}`,
    context: {
      queued: queueItems.length,
      scoreVersion: SCORE_VERSION,
    },
  });

  let createdSnapshots = 0;
  let skippedSnapshots = 0;
  let failed = 0;

  for (const queueItem of queueItems) {
    try {
      await prisma.ipoScoreRecalcQueue.update({
        where: { id: queueItem.id },
        data: {
          status: "PROCESSING",
          attempts: {
            increment: 1,
          },
          lastError: null,
        },
      });

      const latestSupply = queueItem.ipo.supplyFacts[0] ?? null;
      const latestDemand = queueItem.ipo.demandFacts[0] ?? null;
      const latestFinancial = queueItem.ipo.financials[0] ?? null;
      const snapshot = buildScoreSnapshot({
        ipoId: queueItem.ipo.id,
        slug: queueItem.ipo.slug,
        supply: latestSupply
          ? {
              source: `${latestSupply.sourceType}:${latestSupply.sourceKey}`,
              floatRatio: latestSupply.floatRatio,
              insiderSalesRatio: latestSupply.insiderSalesRatio,
              lockupRatio: latestSupply.lockupRatio,
              totalOfferedShares: toNumberOrNull(latestSupply.totalOfferedShares),
              newShares: toNumberOrNull(latestSupply.newShares),
              secondaryShares: toNumberOrNull(latestSupply.secondaryShares),
              listedShares: toNumberOrNull(latestSupply.listedShares),
              tradableShares: toNumberOrNull(latestSupply.tradableShares),
            }
          : null,
        demand: latestDemand
          ? {
              source: `${latestDemand.sourceType}:${latestDemand.sourceKey}`,
              institutionalCompetitionRate: latestDemand.institutionalCompetitionRate,
              priceBandTopAcceptanceRatio: latestDemand.priceBandTopAcceptanceRatio,
              priceBandExceedRatio: latestDemand.priceBandExceedRatio,
              participatingInstitutions: latestDemand.participatingInstitutions,
            }
          : null,
        subscriptions: queueItem.ipo.subscriptionFacts.map((subscription) => ({
          source: `${subscription.sourceType}:${subscription.sourceKey}`,
          brokerName: subscription.brokerName,
          generalCompetitionRate: subscription.generalCompetitionRate,
          allocatedShares: toNumberOrNull(subscription.allocatedShares),
          equalAllocatedShares: toNumberOrNull(subscription.equalAllocatedShares),
          proportionalAllocatedShares: toNumberOrNull(subscription.proportionalAllocatedShares),
          minimumSubscriptionShares: subscription.minimumSubscriptionShares,
          maximumSubscriptionShares: subscription.maximumSubscriptionShares,
          depositRate: subscription.depositRate,
          subscriptionFee: subscription.subscriptionFee,
          hasOnlineOnlyCondition: subscription.hasOnlineOnlyCondition,
        })),
        financials: latestFinancial
          ? {
              source: latestFinancial.corpCode ? `OPENDART:${latestFinancial.corpCode}` : "OPENDART",
              reportLabel: latestFinancial.reportLabel,
              revenueGrowthRate: latestFinancial.revenueGrowthRate,
              operatingIncome: toNumberOrNull(latestFinancial.operatingIncome),
              netIncome: toNumberOrNull(latestFinancial.netIncome),
              debtRatio: latestFinancial.debtRatio,
              totalEquity: toNumberOrNull(latestFinancial.totalEquity),
            }
          : null,
      });

      const latestSnapshot = queueItem.ipo.scoreSnapshots[0] ?? null;

      if (latestSnapshot?.inputsChecksum !== snapshot.inputsChecksum) {
        await prisma.ipoScoreSnapshot.create({
          data: {
            ipoId: queueItem.ipo.id,
            scoreVersion: snapshot.scoreVersion,
            status: snapshot.status,
            coverageStatus: snapshot.coverageStatus,
            supplyScore: snapshot.supplyScore,
            lockupScore: snapshot.lockupScore,
            competitionScore: snapshot.competitionScore,
            marketScore: snapshot.marketScore,
            financialAdjustmentScore: snapshot.financialAdjustmentScore,
            totalScore: snapshot.totalScore,
            componentWeights: snapshot.componentWeights,
            inputsChecksum: snapshot.inputsChecksum,
            evidenceSummary: snapshot.evidenceSummary,
            warnings: snapshot.warnings,
            explanations: snapshot.explanations,
            calculatedAt: snapshot.calculatedAt,
          },
        });
        createdSnapshots += 1;
      } else {
        skippedSnapshots += 1;
      }

      await prisma.$transaction([
        prisma.ipoMaster.update({
          where: { id: queueItem.ipo.id },
          data: {
            lastScoreCalculatedAt: snapshot.calculatedAt,
          },
        }),
        prisma.ipoScoreRecalcQueue.update({
          where: { id: queueItem.id },
          data: {
            status: "COMPLETED",
            processedAt: snapshot.calculatedAt,
            lastError: null,
          },
        }),
      ]);
    } catch (error) {
      failed += 1;
      const attempts = queueItem.attempts + 1;
      const shouldRetry = attempts < SCORE_RECALC_MAX_ATTEMPTS;
      const retryAt = new Date(Date.now() + getRetryDelayMs(attempts));

      await prisma.ipoScoreRecalcQueue.update({
        where: { id: queueItem.id },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          runAfter: shouldRetry ? retryAt : queueItem.runAfter,
          lastError: error instanceof Error ? error.message : String(error),
          processedAt: shouldRetry ? null : new Date(),
        },
      });

      await logOperation({
        level: shouldRetry ? "WARN" : "ERROR",
        source: triggerSource,
        action: shouldRetry ? "score_recalc_retry_scheduled" : "score_recalc_failed",
        message: shouldRetry
          ? `IPO 점수 재계산이 실패해 재시도를 예약했습니다. ipo=${queueItem.ipo.slug}`
          : `IPO 점수 재계산에 실패했습니다. ipo=${queueItem.ipo.slug}`,
        context: toErrorContext(error, {
          ipoId: queueItem.ipo.id,
          slug: queueItem.ipo.slug,
          queueId: queueItem.id,
          attempts,
          shouldRetry,
          retryAt: shouldRetry ? retryAt.toISOString() : null,
        }),
      });
    }
  }

  const result = {
    processed: queueItems.length,
    createdSnapshots,
    skippedSnapshots,
    failed,
  } satisfies ProcessScoreQueueResult;

  await logOperation({
    level: failed > 0 ? "WARN" : "INFO",
    source: triggerSource,
    action: "score_recalc_completed",
    message:
      failed > 0
        ? `IPO 점수 재계산이 부분 실패로 끝났습니다. processed=${result.processed}, failed=${failed}`
        : `IPO 점수 재계산을 완료했습니다. processed=${result.processed}`,
    context: {
      ...result,
      scoreVersion: SCORE_VERSION,
    },
  });

  return result;
};
