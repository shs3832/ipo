import { parseKstDate } from "@/lib/date";
import { buildEvents } from "@/lib/server/ipo-mappers";
import { toListingOpenReturnRate } from "@/lib/server/job-shared";
import type { IpoRecord, SourceIpoRecord } from "@/lib/types";

export type LatestIpoSnapshotState = {
  id: string;
  kindIssueCode: string | null;
  offerPrice: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  status: IpoRecord["status"];
  analyses: Array<{
    score: number;
    ratingLabel: string;
    summary: string;
    keyPoints: unknown;
    warnings: unknown;
    generatedAt: Date;
  }>;
  sourceSnapshots: Array<{
    id: string;
    sourceKey: string;
    checksum: string;
  }>;
} | null;

export const buildPersistedSourceIpoRecord = (
  record: SourceIpoRecord,
  latestSnapshot: LatestIpoSnapshotState,
): SourceIpoRecord => {
  const effectiveOfferPrice = record.offerPrice ?? latestSnapshot?.offerPrice ?? null;
  const listingOpenPrice = record.listingOpenPrice ?? latestSnapshot?.listingOpenPrice ?? null;

  return {
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
};

export const buildIpoWriteData = (record: SourceIpoRecord) => ({
  name: record.name,
  market: record.market,
  leadManager: record.leadManager,
  coManagers: record.coManagers ?? [],
  kindIssueCode: record.kindIssueCode ?? null,
  priceBandLow: record.priceBandLow ?? null,
  priceBandHigh: record.priceBandHigh ?? null,
  offerPrice: record.offerPrice ?? null,
  listingOpenPrice: record.listingOpenPrice ?? null,
  listingOpenReturnRate: record.listingOpenReturnRate ?? null,
  minimumSubscriptionShares: record.minimumSubscriptionShares ?? null,
  depositRate: record.depositRate ?? null,
  subscriptionStart: parseKstDate(record.subscriptionStart),
  subscriptionEnd: parseKstDate(record.subscriptionEnd),
  refundDate: record.refundDate ? parseKstDate(record.refundDate) : null,
  listingDate: record.listingDate ? parseKstDate(record.listingDate) : null,
  status: record.status ?? "UPCOMING",
});

export const buildIpoEventCreateManyData = (ipoId: string, record: SourceIpoRecord) =>
  buildEvents(record, record.name).map((event) => ({
    ipoId,
    type: event.type,
    title: event.title,
    eventDate: event.eventDate,
  }));
