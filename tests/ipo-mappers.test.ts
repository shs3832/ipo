import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestSnapshotFields,
  mapDbIpoToIpoRecord,
  mapDbIpoToPublicIpoDetailRecord,
  normalizeSourceIpoRecord,
} from "@/lib/server/ipo-mappers";
import type { SourceIpoRecord } from "@/lib/types";

const createDbIpo = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "ipo-1",
    slug: "ipo-1",
    name: "테스트 종목",
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    coManagers: ["미래에셋증권"],
    kindIssueCode: "12345",
    priceBandLow: 10_000,
    priceBandHigh: 12_000,
    offerPrice: 11_000,
    listingOpenPrice: 15_000,
    listingOpenReturnRate: 36.4,
    minimumSubscriptionShares: 10,
    depositRate: 0.5,
    subscriptionStart: new Date("2026-03-24T00:00:00.000Z"),
    subscriptionEnd: new Date("2026-03-25T00:00:00.000Z"),
    refundDate: new Date("2026-03-27T00:00:00.000Z"),
    listingDate: new Date("2026-03-30T00:00:00.000Z"),
    status: "OPEN",
    events: [
      {
        id: "event-1",
        type: "SUBSCRIPTION",
        title: "테스트 종목 청약 마감",
        eventDate: new Date("2026-03-25T00:00:00.000Z"),
      },
    ],
    analyses: [
      {
        score: 68,
        ratingLabel: "중립",
        summary: "요약",
        keyPoints: ["핵심 포인트"],
        warnings: ["주의 포인트"],
        generatedAt: new Date("2026-03-24T12:00:00.000Z"),
      },
    ],
    sourceSnapshots: [
      {
        sourceKey: "source-1",
        fetchedAt: new Date("2026-03-24T12:00:00.000Z"),
        payload: {
          kindBizProcessNo: "BP-1",
          generalSubscriptionCompetitionRate: 321.1,
          irStart: "2026-03-18",
          irEnd: "2026-03-19",
          demandForecastStart: "2026-03-17",
          demandForecastEnd: "2026-03-18",
          tradableShares: 123456,
          floatRatio: 22.5,
          demandCompetitionRate: 1222.2,
          lockupRate: 18.4,
          insiderSalesRatio: 4.2,
          marketMoodScore: 61,
          revenueGrowthRate: 14.1,
          operatingIncome: 100000000,
          netIncome: 75000000,
          debtRatio: 55.2,
          totalEquity: 300000000,
        },
      },
    ],
    ...overrides,
  }) as unknown as Parameters<typeof mapDbIpoToIpoRecord>[0];

test("getLatestSnapshotFields parses only valid snapshot values", () => {
  const fields = getLatestSnapshotFields({
    kindBizProcessNo: " BP-9 ",
    generalSubscriptionCompetitionRate: 123.4,
    irStart: "2026-03-18",
    irEnd: "",
    tradableShares: "12345",
    floatRatio: 27.5,
    demandCompetitionRate: 900.1,
    lockupRate: null,
  });

  assert.equal(fields.kindBizProcessNo, "BP-9");
  assert.equal(fields.generalSubscriptionCompetitionRate, 123.4);
  assert.ok(fields.irStart instanceof Date);
  assert.equal(fields.irEnd, null);
  assert.equal(fields.tradableShares, null);
  assert.equal(fields.floatRatio, 27.5);
  assert.equal(fields.demandCompetitionRate, 900.1);
  assert.equal(fields.lockupRate, null);
});

test("db ipo mappers share the same core fields while only full records keep source metadata", () => {
  const dbIpo = createDbIpo();
  const full = mapDbIpoToIpoRecord(dbIpo);
  const detail = mapDbIpoToPublicIpoDetailRecord(dbIpo);

  assert.equal(full.kindBizProcessNo, "BP-1");
  assert.equal(detail.kindBizProcessNo, "BP-1");
  assert.equal(full.generalSubscriptionCompetitionRate, 321.1);
  assert.equal(detail.generalSubscriptionCompetitionRate, 321.1);
  assert.equal(full.latestSourceKey, "source-1");
  assert.ok(full.sourceFetchedAt instanceof Date);
  assert.equal("latestSourceKey" in detail, false);
  assert.equal("sourceFetchedAt" in detail, false);
  assert.deepEqual(full.latestAnalysis.keyPoints, ["핵심 포인트"]);
  assert.deepEqual(detail.latestAnalysis.warnings, ["주의 포인트"]);
});

test("normalizeSourceIpoRecord derives slugged ids and event records from source payload", () => {
  const sourceRecord: SourceIpoRecord = {
    sourceKey: "source-raw",
    name: "테스트 종목",
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    subscriptionStart: "2026-03-24",
    subscriptionEnd: "2026-03-25",
    refundDate: "2026-03-27",
    listingDate: "2026-03-30",
    offerPrice: 11_000,
    minimumSubscriptionShares: 10,
    depositRate: 0.5,
    status: "OPEN",
  };

  const normalized = normalizeSourceIpoRecord(sourceRecord);

  assert.equal(normalized.id, "테스트-종목");
  assert.equal(normalized.slug, "테스트-종목");
  assert.equal(normalized.latestSourceKey, "source-raw");
  assert.equal(normalized.publicScore, null);
  assert.equal(normalized.events.length, 3);
  assert.equal(normalized.events[0].id, "테스트-종목-subscription");
});
