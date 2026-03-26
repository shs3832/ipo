import assert from "node:assert/strict";
import test from "node:test";

import { buildV1ScoreSnapshot, buildV2ScoreSnapshot } from "@/lib/scoring";

test("buildV1ScoreSnapshot produces a ready V1 score when supply and lockup facts are present", () => {
  const snapshot = buildV1ScoreSnapshot({
    ipoId: "ipo-1",
    slug: "test-ipo",
    supply: {
      source: "INTERNAL:test",
      floatRatio: 18.4,
      insiderSalesRatio: 4.5,
      lockupRatio: 22.1,
      totalOfferedShares: 1_000_000,
      newShares: 900_000,
      secondaryShares: 100_000,
      listedShares: 5_000_000,
      tradableShares: 920_000,
    },
    financials: {
      source: "OPENDART:corp",
      reportLabel: "2025 사업보고서 (연결)",
      revenueGrowthRate: 24.8,
      operatingIncome: 12_000_000_000,
      netIncome: 8_000_000_000,
      debtRatio: 82.4,
      totalEquity: 55_000_000_000,
    },
  });

  assert.equal(snapshot.scoreVersion, "v1");
  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.coverageStatus, "SUFFICIENT");
  assert.ok(snapshot.supplyScore != null && snapshot.supplyScore > 70);
  assert.ok(snapshot.lockupScore != null && snapshot.lockupScore > 60);
  assert.ok(snapshot.financialAdjustmentScore != null && snapshot.financialAdjustmentScore > 0);
  assert.ok(snapshot.totalScore != null && snapshot.totalScore > 70);
});

test("buildV1ScoreSnapshot stays partial when lockup data is missing", () => {
  const snapshot = buildV1ScoreSnapshot({
    ipoId: "ipo-2",
    slug: "partial-ipo",
    supply: {
      source: "INTERNAL:test",
      floatRatio: 48,
      insiderSalesRatio: 28,
      lockupRatio: null,
      totalOfferedShares: null,
      newShares: null,
      secondaryShares: null,
      listedShares: null,
      tradableShares: null,
    },
    financials: null,
  });

  assert.equal(snapshot.status, "PARTIAL");
  assert.equal(snapshot.coverageStatus, "PARTIAL");
  assert.equal(snapshot.lockupScore, null);
  assert.ok(snapshot.totalScore != null);
  assert.ok(snapshot.warnings.length > 0);
});

test("buildV1ScoreSnapshot returns not-ready when no scoring facts exist", () => {
  const snapshot = buildV1ScoreSnapshot({
    ipoId: "ipo-3",
    slug: "empty-ipo",
    supply: null,
    financials: null,
  });

  assert.equal(snapshot.status, "NOT_READY");
  assert.equal(snapshot.coverageStatus, "EMPTY");
  assert.equal(snapshot.totalScore, null);
  assert.equal(snapshot.supplyScore, null);
  assert.equal(snapshot.lockupScore, null);
});

test("buildV2ScoreSnapshot becomes ready when supply and competition signals are both available", () => {
  const snapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-4",
    slug: "competition-ready-ipo",
    supply: {
      source: "KIND:test",
      floatRatio: 22.4,
      insiderSalesRatio: null,
      lockupRatio: null,
      totalOfferedShares: null,
      newShares: null,
      secondaryShares: null,
      listedShares: null,
      tradableShares: null,
    },
    demand: {
      source: "OPENDART:test",
      institutionalCompetitionRate: 1325.8,
      priceBandTopAcceptanceRatio: null,
      priceBandExceedRatio: null,
      participatingInstitutions: null,
    },
    subscriptions: [
      {
        source: "KIND:test:subscription:broker-a",
        brokerName: "한국투자증권",
        generalCompetitionRate: 1840.1,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 10,
        maximumSubscriptionShares: null,
        depositRate: 0.5,
        subscriptionFee: null,
        hasOnlineOnlyCondition: false,
      },
    ],
    financials: null,
  });

  assert.equal(snapshot.scoreVersion, "v2.4");
  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.coverageStatus, "SUFFICIENT");
  assert.ok(snapshot.competitionScore != null && snapshot.competitionScore >= 80);
  assert.ok(snapshot.totalScore != null && snapshot.totalScore >= 70);
});

test("buildV2ScoreSnapshot stays partial when only retail competition is available", () => {
  const snapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-5",
    slug: "competition-partial-ipo",
    supply: null,
    demand: null,
    subscriptions: [
      {
        source: "KIND:test:subscription:broker-a",
        brokerName: "미래에셋증권",
        generalCompetitionRate: 88.2,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 20,
        maximumSubscriptionShares: null,
        depositRate: 0.5,
        subscriptionFee: null,
        hasOnlineOnlyCondition: false,
      },
    ],
    financials: null,
  });

  assert.equal(snapshot.scoreVersion, "v2.4");
  assert.equal(snapshot.status, "PARTIAL");
  assert.equal(snapshot.coverageStatus, "PARTIAL");
  assert.ok(snapshot.competitionScore != null);
  assert.equal(snapshot.lockupScore, null);
});

test("buildV2ScoreSnapshot rewards low fee and generous broker limit when broker facts are present", () => {
  const snapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-6",
    slug: "broker-detail-ipo",
    supply: null,
    demand: {
      source: "OPENDART:test",
      institutionalCompetitionRate: 840.2,
      priceBandTopAcceptanceRatio: null,
      priceBandExceedRatio: null,
      participatingInstitutions: null,
    },
    subscriptions: [
      {
        source: "BROKER:broker-web:한국투자증권:test",
        brokerName: "한국투자증권",
        generalCompetitionRate: 912.3,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 10,
        maximumSubscriptionShares: 33_000,
        depositRate: 0.5,
        subscriptionFee: 2_000,
        hasOnlineOnlyCondition: false,
      },
      {
        source: "BROKER:broker-web:신한투자증권:test",
        brokerName: "신한투자증권",
        generalCompetitionRate: 905.7,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 10,
        maximumSubscriptionShares: null,
        depositRate: 0.5,
        subscriptionFee: 0,
        hasOnlineOnlyCondition: false,
      },
    ],
    financials: null,
  });

  assert.equal(snapshot.scoreVersion, "v2.4");
  assert.equal(snapshot.status, "PARTIAL");
  assert.equal(snapshot.evidenceSummary.competition.status, "READY");
  assert.ok(snapshot.competitionScore != null && snapshot.competitionScore >= 75);
  assert.ok(snapshot.explanations.some((line) => line.includes("청약 수수료") || line.includes("최고청약한도")));
});

test("buildV2ScoreSnapshot reflects online-only subscription restrictions in competition analysis", () => {
  const baseSnapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-7a",
    slug: "broker-open-access-ipo",
    supply: null,
    demand: null,
    subscriptions: [
      {
        source: "BROKER:broker-web:KB증권:test",
        brokerName: "KB증권",
        generalCompetitionRate: 420.5,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 10,
        maximumSubscriptionShares: null,
        depositRate: 0.5,
        subscriptionFee: 1_500,
        hasOnlineOnlyCondition: false,
      },
    ],
    financials: null,
  });

  const restrictedSnapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-7b",
    slug: "broker-online-only-ipo",
    supply: null,
    demand: null,
    subscriptions: [
      {
        source: "BROKER:broker-web:KB증권:test",
        brokerName: "KB증권",
        generalCompetitionRate: 420.5,
        allocatedShares: null,
        equalAllocatedShares: null,
        proportionalAllocatedShares: null,
        minimumSubscriptionShares: 10,
        maximumSubscriptionShares: null,
        depositRate: 0.5,
        subscriptionFee: 1_500,
        hasOnlineOnlyCondition: true,
      },
    ],
    financials: null,
  });

  assert.equal(restrictedSnapshot.scoreVersion, "v2.4");
  assert.ok(baseSnapshot.competitionScore != null);
  assert.ok(restrictedSnapshot.competitionScore != null);
  assert.ok(restrictedSnapshot.competitionScore < baseSnapshot.competitionScore);
  assert.ok(restrictedSnapshot.evidenceSummary.competition.warnings.some((line) => line.includes("온라인")));
});

test("buildV2ScoreSnapshot uses allocation pool signals from broker notice data", () => {
  const snapshot = buildV2ScoreSnapshot({
    ipoId: "ipo-8",
    slug: "broker-allocation-ipo",
    supply: null,
    demand: null,
    subscriptions: [
      {
        source: "BROKER:broker-web:대신증권:test",
        brokerName: "대신증권",
        generalCompetitionRate: 1411.14,
        allocatedShares: 55_000,
        equalAllocatedShares: 27_500,
        proportionalAllocatedShares: 27_500,
        minimumSubscriptionShares: null,
        maximumSubscriptionShares: null,
        depositRate: null,
        subscriptionFee: 2_000,
        hasOnlineOnlyCondition: false,
      },
    ],
    financials: null,
  });

  assert.equal(snapshot.scoreVersion, "v2.4");
  assert.equal(snapshot.evidenceSummary.competition.status, "READY");
  assert.ok(snapshot.competitionScore != null && snapshot.competitionScore >= 70);
  assert.ok(snapshot.explanations.some((line) => line.includes("균등 배정물량") || line.includes("일반청약 배정물량")));
});
