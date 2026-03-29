import { buildAnalysis, buildAnalysisScoreDisplay } from "@/lib/analysis";
import { parseKstDate } from "@/lib/date";
import {
  type AdminOverrideRecord,
  type IpoRecord,
  type NotificationDeliveryRecord,
  type NotificationJobRecord,
  type PublicIpoDetailRecord,
  type PublicIpoScoreRecord,
  type RecipientRecord,
  type SourceIpoRecord,
} from "@/lib/types";
import { type IpoReadModel, slugify } from "@/lib/server/job-shared";

const parseSnapshotNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseSnapshotString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseSnapshotDate = (value: unknown) => {
  const dateKey = parseSnapshotString(value);
  return dateKey ? parseKstDate(dateKey) : null;
};

export const getLatestSnapshotFields = (payload: unknown) => {
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

export const buildEvents = (record: SourceIpoRecord, ipoName: string) => [
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

export const normalizeSourceIpoRecord = (record: SourceIpoRecord): IpoRecord => {
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
    publicScore: null,
    latestSourceKey: record.sourceKey,
    sourceFetchedAt: new Date(),
  };
};

const buildBaseDbIpoRecord = (ipo: IpoReadModel, publicScore: PublicIpoScoreRecord | null) => {
  const snapshotFields = getLatestSnapshotFields(ipo.sourceSnapshots[0]?.payload);

  return {
    id: ipo.id,
    slug: ipo.slug,
    name: ipo.name,
    market: ipo.market,
    leadManager: ipo.leadManager ?? "-",
    coManagers: Array.isArray(ipo.coManagers) ? (ipo.coManagers as string[]) : [],
    kindIssueCode: ipo.kindIssueCode,
    kindBizProcessNo: snapshotFields.kindBizProcessNo,
    priceBandLow: ipo.priceBandLow,
    priceBandHigh: ipo.priceBandHigh,
    offerPrice: ipo.offerPrice,
    listingOpenPrice: ipo.listingOpenPrice,
    listingOpenReturnRate: ipo.listingOpenReturnRate,
    minimumSubscriptionShares: ipo.minimumSubscriptionShares,
    depositRate: ipo.depositRate,
    generalSubscriptionCompetitionRate: snapshotFields.generalSubscriptionCompetitionRate,
    irStart: snapshotFields.irStart,
    irEnd: snapshotFields.irEnd,
    demandForecastStart: snapshotFields.demandForecastStart,
    demandForecastEnd: snapshotFields.demandForecastEnd,
    tradableShares: snapshotFields.tradableShares,
    floatRatio: snapshotFields.floatRatio,
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
    publicScore,
  };
};

export const mapDbIpoToIpoRecord = (ipo: IpoReadModel, publicScore: PublicIpoScoreRecord | null = null): IpoRecord => ({
  ...buildBaseDbIpoRecord(ipo, publicScore),
  latestSourceKey: ipo.sourceSnapshots[0].sourceKey,
  sourceFetchedAt: ipo.sourceSnapshots[0].fetchedAt,
});

export const mapDbIpoToPublicIpoDetailRecord = (
  ipo: IpoReadModel,
  publicScore: PublicIpoScoreRecord | null = null,
): PublicIpoDetailRecord => buildBaseDbIpoRecord(ipo, publicScore);

export const toRecipientRecord = (recipient: {
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

export const toNotificationJobRecord = (job: {
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

export const toNotificationDeliveryRecord = (delivery: {
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

export const toAdminOverrideRecord = (override: {
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
