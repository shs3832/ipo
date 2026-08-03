import assert from "node:assert/strict";
import test from "node:test";

import {
  assessIpoSourceFreshness,
  buildAdminIpoQualityOverview,
  getAdminIpoSourceLabel,
  type AdminIpoQualityInput,
} from "@/lib/admin-ipo-quality";
import { parseKstDate } from "@/lib/date";

const createIpo = (
  name: string,
  overrides: Partial<AdminIpoQualityInput> = {},
): AdminIpoQualityInput => ({
  id: `ipo-${name}`,
  slug: name,
  name,
  market: "KOSDAQ",
  leadManager: "한국투자증권",
  kindIssueCode: "49328",
  kindBizProcessNo: "20260803000001",
  priceBandLow: 23_000,
  priceBandHigh: 26_000,
  offerPrice: 26_000,
  minimumSubscriptionShares: 20,
  depositRate: 0.5,
  generalSubscriptionCompetitionRate: 1805.8,
  refundDate: parseKstDate("2026-08-05"),
  listingDate: parseKstDate("2026-08-10"),
  subscriptionEnd: parseKstDate("2026-08-03"),
  floatRatio: 14,
  latestSourceKey: "opendart-estk:2026-08:00123456",
  sourceFetchedAt: new Date("2026-08-02T21:05:00.000Z"),
  ...overrides,
});

test("assessIpoSourceFreshness uses the most recent 06:00 KST sync cycle", () => {
  const nowAfterDailySync = new Date("2026-08-03T01:00:00.000Z");

  assert.equal(
    assessIpoSourceFreshness(new Date("2026-08-02T21:05:00.000Z"), nowAfterDailySync).status,
    "FRESH",
  );
  assert.equal(
    assessIpoSourceFreshness(new Date("2026-08-01T21:05:00.000Z"), nowAfterDailySync).status,
    "NEEDS_REFRESH",
  );
  assert.equal(
    assessIpoSourceFreshness(new Date("2026-08-01T20:59:00.000Z"), nowAfterDailySync).status,
    "STALE",
  );
});

test("getAdminIpoSourceLabel presents stable provider labels without exposing raw keys", () => {
  assert.equal(getAdminIpoSourceLabel("opendart-estk:2026-08:00123456"), "OpenDART");
  assert.equal(getAdminIpoSourceLabel("kind-listing-schedule:2026-08-10:1234"), "KIND");
  assert.equal(getAdminIpoSourceLabel("seibro-duty-depo:2026-08"), "SEIBro");
  assert.equal(getAdminIpoSourceLabel("broker-web:한국투자증권:테스트"), "증권사 자료");
  assert.equal(getAdminIpoSourceLabel("custom-source:2026-08"), "외부 수집원");
});

test("assessIpoSourceFreshness accepts the previous day cycle before 06:00 KST", () => {
  const nowBeforeDailySync = new Date("2026-08-02T20:30:00.000Z");
  const freshness = assessIpoSourceFreshness(
    new Date("2026-08-01T21:05:00.000Z"),
    nowBeforeDailySync,
  );

  assert.equal(freshness.status, "FRESH");
  assert.equal(freshness.expectedSyncAt.toISOString(), "2026-08-01T21:00:00.000Z");
});

test("buildAdminIpoQualityOverview aggregates alert quality and freshness counts", () => {
  const now = new Date("2026-08-03T01:00:00.000Z");
  const overview = buildAdminIpoQualityOverview([
    createIpo("검증완료"),
    createIpo("일부미확인", {
      offerPrice: null,
      sourceFetchedAt: new Date("2026-08-01T21:05:00.000Z"),
    }),
    createIpo("발송보류", {
      leadManager: "-",
      refundDate: null,
      offerPrice: null,
      priceBandLow: null,
      priceBandHigh: null,
      sourceFetchedAt: new Date("2026-08-01T20:59:00.000Z"),
    }),
  ], now);

  assert.deepEqual(overview.counts, {
    total: 3,
    active: 3,
    eligible: 3,
    excludedSpac: 0,
    verified: 1,
    partial: 1,
    blocked: 1,
    fresh: 1,
    needsRefresh: 1,
    stale: 1,
    closingToday: 3,
    sendableClosingToday: 2,
    blockedClosingToday: 1,
    excludedSpacClosingToday: 0,
  });
  assert.deepEqual(
    overview.records.map((record) => record.dataQuality.status),
    ["BLOCKED", "PARTIAL", "VERIFIED"],
  );
});

test("buildAdminIpoQualityOverview excludes SPACs from alert readiness counts", () => {
  const now = new Date("2026-08-03T01:00:00.000Z");
  const overview = buildAdminIpoQualityOverview([
    createIpo("일반 종목"),
    createIpo("엔에이치기업인수목적34호", {
      sourceFetchedAt: new Date("2026-08-01T20:59:00.000Z"),
    }),
  ], now);

  assert.equal(overview.counts.active, 2);
  assert.equal(overview.counts.eligible, 1);
  assert.equal(overview.counts.excludedSpac, 1);
  assert.equal(overview.counts.verified, 1);
  assert.equal(overview.counts.stale, 0);
  assert.equal(overview.counts.closingToday, 2);
  assert.equal(overview.counts.sendableClosingToday, 1);
  assert.equal(overview.counts.blockedClosingToday, 0);
  assert.equal(overview.counts.excludedSpacClosingToday, 1);
  assert.equal(
    overview.records.find((record) => !record.isAlertEligible)?.name,
    "엔에이치기업인수목적34호",
  );
});

test("buildAdminIpoQualityOverview prioritizes today, upcoming, and recent past schedules", () => {
  const now = new Date("2026-08-03T01:00:00.000Z");
  const overview = buildAdminIpoQualityOverview([
    createIpo("먼과거", { subscriptionEnd: parseKstDate("2026-08-01") }),
    createIpo("예정", { subscriptionEnd: parseKstDate("2026-08-04") }),
    createIpo("최근과거", { subscriptionEnd: parseKstDate("2026-08-02") }),
    createIpo("오늘"),
  ], now);

  assert.deepEqual(
    overview.records.map((record) => record.name),
    ["오늘", "예정", "최근과거", "먼과거"],
  );
  assert.deepEqual(
    overview.records.map((record) => record.scheduleStatus),
    ["TODAY", "UPCOMING", "PAST", "PAST"],
  );
  assert.equal(overview.counts.total, 4);
  assert.equal(overview.counts.active, 2);
  assert.equal(overview.counts.eligible, 2);
  assert.equal(overview.counts.fresh, 2);
});

test("buildAdminIpoQualityOverview excludes past records from operational attention counts", () => {
  const now = new Date("2026-08-03T01:00:00.000Z");
  const overview = buildAdminIpoQualityOverview([
    createIpo("예정", { subscriptionEnd: parseKstDate("2026-08-04") }),
    createIpo("지난보류", {
      subscriptionEnd: parseKstDate("2026-08-02"),
      leadManager: "-",
      refundDate: null,
      offerPrice: null,
      priceBandLow: null,
      priceBandHigh: null,
      sourceFetchedAt: new Date("2026-08-01T20:59:00.000Z"),
    }),
  ], now);

  assert.equal(overview.counts.total, 2);
  assert.equal(overview.counts.active, 1);
  assert.equal(overview.counts.verified, 1);
  assert.equal(overview.counts.blocked, 0);
  assert.equal(overview.counts.stale, 0);
});

test("buildAdminIpoQualityOverview handles an empty fallback-style list", () => {
  const now = new Date("2026-08-03T01:00:00.000Z");
  const overview = buildAdminIpoQualityOverview([], now);

  assert.equal(overview.records.length, 0);
  assert.equal(overview.counts.total, 0);
  assert.equal(overview.counts.active, 0);
  assert.equal(overview.counts.eligible, 0);
  assert.equal(overview.counts.excludedSpac, 0);
  assert.equal(overview.counts.blockedClosingToday, 0);
  assert.equal(overview.counts.excludedSpacClosingToday, 0);
});
