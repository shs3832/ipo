import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIpoEventCreateManyData,
  buildIpoWriteData,
  buildPersistedSourceIpoRecord,
} from "@/lib/server/ipo-sync-service";
import type { SourceIpoRecord } from "@/lib/types";

const createSourceRecord = (overrides: Partial<SourceIpoRecord> = {}): SourceIpoRecord => ({
  sourceKey: overrides.sourceKey ?? "source-1",
  name: overrides.name ?? "테스트 종목",
  market: overrides.market ?? "KOSDAQ",
  leadManager: overrides.leadManager ?? "한국투자증권",
  coManagers: overrides.coManagers ?? ["미래에셋증권"],
  kindIssueCode: "kindIssueCode" in overrides ? overrides.kindIssueCode ?? null : null,
  priceBandLow: overrides.priceBandLow ?? 10_000,
  priceBandHigh: overrides.priceBandHigh ?? 12_000,
  offerPrice: "offerPrice" in overrides ? overrides.offerPrice ?? null : null,
  listingOpenPrice: "listingOpenPrice" in overrides ? overrides.listingOpenPrice ?? null : null,
  listingOpenReturnRate: "listingOpenReturnRate" in overrides ? overrides.listingOpenReturnRate ?? null : null,
  minimumSubscriptionShares: overrides.minimumSubscriptionShares ?? 10,
  depositRate: overrides.depositRate ?? 0.5,
  subscriptionStart: overrides.subscriptionStart ?? "2026-03-24",
  subscriptionEnd: overrides.subscriptionEnd ?? "2026-03-25",
  refundDate: "refundDate" in overrides ? overrides.refundDate ?? null : "2026-03-27",
  listingDate: "listingDate" in overrides ? overrides.listingDate ?? null : "2026-03-30",
  status: "status" in overrides ? overrides.status ?? undefined : "OPEN",
});

test("buildPersistedSourceIpoRecord preserves latest persisted fields when source values are missing", () => {
  const persisted = buildPersistedSourceIpoRecord(
    createSourceRecord({
      offerPrice: null,
      listingOpenPrice: null,
      listingOpenReturnRate: null,
      kindIssueCode: null,
    }),
    {
      id: "ipo-1",
      kindIssueCode: "12345",
      offerPrice: 11_000,
      listingOpenPrice: 15_000,
      listingOpenReturnRate: 36.4,
      status: "OPEN",
      analyses: [],
      sourceSnapshots: [],
    },
  );

  assert.equal(persisted.kindIssueCode, "12345");
  assert.equal(persisted.offerPrice, 11_000);
  assert.equal(persisted.listingOpenPrice, 15_000);
  assert.equal(persisted.listingOpenReturnRate, 36.4);
});

test("buildPersistedSourceIpoRecord recomputes opening return rate from latest offer and opening prices", () => {
  const persisted = buildPersistedSourceIpoRecord(
    createSourceRecord({
      offerPrice: null,
      listingOpenPrice: 16_500,
      listingOpenReturnRate: null,
    }),
    {
      id: "ipo-1",
      kindIssueCode: null,
      offerPrice: 11_000,
      listingOpenPrice: null,
      listingOpenReturnRate: null,
      status: "OPEN",
      analyses: [],
      sourceSnapshots: [],
    },
  );

  assert.equal(persisted.offerPrice, 11_000);
  assert.equal(persisted.listingOpenPrice, 16_500);
  assert.equal(persisted.listingOpenReturnRate, 50);
});

test("buildIpoWriteData converts date strings to dates and keeps current status fallback", () => {
  const writeData = buildIpoWriteData(createSourceRecord({
    status: undefined,
    refundDate: null,
    listingDate: null,
  }));

  assert.ok(writeData.subscriptionStart instanceof Date);
  assert.ok(writeData.subscriptionEnd instanceof Date);
  assert.equal(writeData.refundDate, null);
  assert.equal(writeData.listingDate, null);
  assert.equal(writeData.status, "UPCOMING");
});

test("buildIpoEventCreateManyData derives the expected event rows for persistence", () => {
  const events = buildIpoEventCreateManyData("ipo-1", createSourceRecord());

  assert.deepEqual(
    events.map((event) => ({
      ipoId: event.ipoId,
      type: event.type,
      title: event.title,
      date: event.eventDate.toISOString(),
    })),
    [
      {
        ipoId: "ipo-1",
        type: "SUBSCRIPTION",
        title: "테스트 종목 청약 마감",
        date: new Date("2026-03-25T00:00:00.000Z").toISOString(),
      },
      {
        ipoId: "ipo-1",
        type: "REFUND",
        title: "테스트 종목 환불",
        date: new Date("2026-03-27T00:00:00.000Z").toISOString(),
      },
      {
        ipoId: "ipo-1",
        type: "LISTING",
        title: "테스트 종목 상장",
        date: new Date("2026-03-30T00:00:00.000Z").toISOString(),
      },
    ],
  );
});
