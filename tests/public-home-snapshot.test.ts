import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackPublicHomeSnapshot } from "@/lib/fallback-data";
import { toPublicHomeSnapshot } from "@/lib/public-home-snapshot";

test("toPublicHomeSnapshot strips admin-only telemetry fields from mixed inputs", () => {
  const snapshot = toPublicHomeSnapshot({
    mode: "database",
    generatedAt: new Date("2026-04-04T00:00:00.000Z"),
    calendarMonth: new Date("2026-04-01T00:00:00.000Z"),
    ipos: [],
    recipients: [{ id: "recipient-1" }],
    jobs: [{ id: "job-1" }],
    operationLogs: [{ id: "log-1" }],
    schedulerStatuses: [{ id: "scheduler-1" }],
  }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(snapshot).sort(), ["calendarMonth", "generatedAt", "ipos", "mode"]);
  assert.equal("recipients" in snapshot, false);
  assert.equal("jobs" in snapshot, false);
  assert.equal("operationLogs" in snapshot, false);
  assert.equal("schedulerStatuses" in snapshot, false);
});

test("toPublicHomeSnapshot strips nested source metadata from public IPO summaries", () => {
  const snapshot = toPublicHomeSnapshot({
    mode: "database",
    generatedAt: new Date("2026-04-04T00:00:00.000Z"),
    calendarMonth: new Date("2026-04-01T00:00:00.000Z"),
    ipos: [
      {
        id: "ipo-1",
        slug: "ipo-1",
        name: "테스트공모",
        market: "KOSDAQ",
        leadManager: "미래에셋증권",
        coManagers: ["한국투자증권"],
        kindIssueCode: "A001",
        kindBizProcessNo: "1001",
        priceBandLow: 9000,
        priceBandHigh: 11000,
        offerPrice: 10000,
        listingOpenPrice: null,
        listingOpenReturnRate: null,
        minimumSubscriptionShares: 10,
        depositRate: 0.5,
        generalSubscriptionCompetitionRate: null,
        irStart: null,
        irEnd: null,
        demandForecastStart: null,
        demandForecastEnd: null,
        tradableShares: null,
        floatRatio: null,
        subscriptionStart: new Date("2026-04-01T00:00:00.000Z"),
        subscriptionEnd: new Date("2026-04-02T00:00:00.000Z"),
        refundDate: null,
        listingDate: null,
        status: "OPEN",
        events: [],
        latestAnalysis: {
          score: 0,
          ratingLabel: "대기",
          summary: "",
          keyPoints: [],
          warnings: [],
          scoreDisplay: {
            isVisible: false,
            evidenceLabels: [],
            evidenceCount: 0,
            demandSupplyEvidenceCount: 0,
            financialEvidenceCount: 0,
            helpText: "",
            policyNote: "",
            disclaimer: "",
          },
          generatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        publicScore: null,
        latestSourceKey: "admin-source-key",
        sourceFetchedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    ],
  }) as Record<string, unknown>;
  const publicIpo = (snapshot.ipos as Array<Record<string, unknown>>)[0];

  assert.ok(publicIpo);
  assert.equal("latestSourceKey" in publicIpo, false);
  assert.equal("sourceFetchedAt" in publicIpo, false);
  assert.equal("latestAnalysis" in publicIpo, false);
  assert.equal("coManagers" in publicIpo, false);
});

test("buildFallbackPublicHomeSnapshot exposes only public home fields", () => {
  const snapshot = buildFallbackPublicHomeSnapshot() as Record<string, unknown>;

  assert.deepEqual(Object.keys(snapshot).sort(), ["calendarMonth", "generatedAt", "ipos", "mode"]);
  assert.equal(snapshot.mode, "fallback");
  assert.equal("recipients" in snapshot, false);
  assert.equal("jobs" in snapshot, false);
  assert.equal("deliveries" in snapshot, false);
  assert.equal("overrides" in snapshot, false);
  assert.equal("operationLogs" in snapshot, false);
  assert.equal("schedulerStatuses" in snapshot, false);
  assert.equal("ipoScoreSummaries" in snapshot, false);
});
