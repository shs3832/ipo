import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOverviewSections,
  buildOverviewTiming,
  defaultCalendarFilters,
  filterCalendarEntries,
  getCalendarEventCounts,
  getVisibleCalendarEventIpoCounts,
  getVisibleCalendarEventCount,
  getVisibleCalendarSpacIpoCount,
  getMinimumDepositAmount,
  getOverviewFilterCounts,
  isSpacIpo,
  isStoredCalendarFilters,
  matchesOverviewFilter,
  matchesOverviewSearch,
  type CalendarEntry,
  type HomeIpoSummary,
} from "@/app/home-content-helpers";

const createIpo = (overrides: Partial<HomeIpoSummary>): HomeIpoSummary => ({
  id: overrides.id ?? "ipo",
  slug: overrides.slug ?? "ipo",
  name: overrides.name ?? "테스트 종목",
  market: overrides.market ?? "KOSDAQ",
  leadManager: overrides.leadManager ?? "한국투자증권",
  subscriptionStart: overrides.subscriptionStart ?? "2026-03-24T00:00:00.000Z",
  subscriptionEnd: overrides.subscriptionEnd ?? "2026-03-27T00:00:00.000Z",
  offerPrice: "offerPrice" in overrides ? overrides.offerPrice ?? null : 10_000,
  minimumSubscriptionShares: "minimumSubscriptionShares" in overrides ? overrides.minimumSubscriptionShares ?? null : 10,
  depositRate: "depositRate" in overrides ? overrides.depositRate ?? null : 0.5,
  listingOpenPrice: "listingOpenPrice" in overrides ? overrides.listingOpenPrice ?? null : null,
  listingOpenReturnRate: "listingOpenReturnRate" in overrides ? overrides.listingOpenReturnRate ?? null : null,
  publicScore: "publicScore" in overrides ? overrides.publicScore ?? null : null,
});

const createCalendarEntry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  title: overrides.title ?? "테스트 종목",
  slug: overrides.slug ?? "ipo",
  type: overrides.type ?? "SUBSCRIPTION",
});

test("overview search matches ipo name, broker, and market", () => {
  const ipo = createIpo({
    name: "에이직랜드",
    market: "KOSPI",
    leadManager: "삼성증권",
  });

  assert.equal(matchesOverviewSearch(ipo, "에이직"), true);
  assert.equal(matchesOverviewSearch(ipo, "삼성"), true);
  assert.equal(matchesOverviewSearch(ipo, "kospi"), true);
  assert.equal(matchesOverviewSearch(ipo, "없는검색어"), false);
});

test("spac detection covers common Korean and English naming patterns", () => {
  assert.equal(isSpacIpo(createIpo({ name: "엔에이치스팩33호" })), true);
  assert.equal(isSpacIpo(createIpo({ name: "신한제18호기업인수목적" })), true);
  assert.equal(isSpacIpo(createIpo({ name: "Future SPAC Holdings" })), true);
  assert.equal(isSpacIpo(createIpo({ name: "아이엠바이오로직스" })), false);
});

test("stored calendar filter validator accepts legacy and extended payloads", () => {
  assert.equal(isStoredCalendarFilters(defaultCalendarFilters), true);
  assert.equal(isStoredCalendarFilters({ ...defaultCalendarFilters, includeSpac: false }), true);
  assert.equal(isStoredCalendarFilters({ ...defaultCalendarFilters, includeSpac: "no" }), false);
  assert.equal(isStoredCalendarFilters({ SUBSCRIPTION: true, REFUND: true }), false);
});

test("calendar event helpers count visible IPOs and hide SPAC entries unless requested", () => {
  const eventsByDate = {
    "2026-03-25": [
      createCalendarEntry({ title: "일반 공모주", slug: "common-ipo", type: "SUBSCRIPTION" }),
      createCalendarEntry({ title: "엔에이치스팩33호", slug: "spac-ipo", type: "SUBSCRIPTION" }),
      createCalendarEntry({ title: "미래반도체", slug: "future-chip", type: "LISTING" }),
    ],
    "2026-03-26": [
      createCalendarEntry({ title: "Future SPAC Holdings", slug: "future-spac", type: "REFUND" }),
    ],
  } satisfies Record<string, CalendarEntry[]>;
  const visibleDayKeys = ["2026-03-25"];

  assert.deepEqual(getCalendarEventCounts(eventsByDate), {
    SUBSCRIPTION: 2,
    REFUND: 1,
    LISTING: 1,
  });
  assert.deepEqual(getVisibleCalendarEventIpoCounts(eventsByDate, visibleDayKeys, defaultCalendarFilters, false), {
    SUBSCRIPTION: 1,
    REFUND: 0,
    LISTING: 1,
  });
  assert.deepEqual(getVisibleCalendarEventIpoCounts(eventsByDate, visibleDayKeys, defaultCalendarFilters, true), {
    SUBSCRIPTION: 2,
    REFUND: 0,
    LISTING: 1,
  });
  assert.equal(getVisibleCalendarSpacIpoCount(eventsByDate, visibleDayKeys, defaultCalendarFilters, false), 0);
  assert.equal(getVisibleCalendarSpacIpoCount(eventsByDate, visibleDayKeys, defaultCalendarFilters, true), 1);
  assert.equal(getVisibleCalendarEventCount(eventsByDate, visibleDayKeys, defaultCalendarFilters, false), 2);
  assert.equal(getVisibleCalendarEventCount(eventsByDate, visibleDayKeys, defaultCalendarFilters, true), 3);
  assert.deepEqual(
    getVisibleCalendarEventIpoCounts(
      eventsByDate,
      visibleDayKeys,
      { ...defaultCalendarFilters, SUBSCRIPTION: false },
      true,
    ),
    {
      SUBSCRIPTION: 0,
      REFUND: 0,
      LISTING: 1,
    },
  );
  assert.equal(
    getVisibleCalendarSpacIpoCount(
      eventsByDate,
      visibleDayKeys,
      { ...defaultCalendarFilters, SUBSCRIPTION: false },
      true,
    ),
    0,
  );
  assert.deepEqual(
    filterCalendarEntries(eventsByDate["2026-03-25"], defaultCalendarFilters, false).map((entry) => entry.slug),
    ["common-ipo", "future-chip"],
  );
  assert.deepEqual(
    filterCalendarEntries(eventsByDate["2026-03-25"], defaultCalendarFilters, true).map((entry) => entry.slug),
    ["common-ipo", "spac-ipo", "future-chip"],
  );
});

test("overview filter counts reflect current-week, current-month, open-now, and past buckets", () => {
  const timing = buildOverviewTiming("2026-03-25");
  const ipos = [
    createIpo({
      id: "open-now",
      slug: "open-now",
      name: "열림",
      subscriptionStart: "2026-03-24T00:00:00.000Z",
      subscriptionEnd: "2026-03-27T00:00:00.000Z",
    }),
    createIpo({
      id: "this-week",
      slug: "this-week",
      name: "이번주",
      subscriptionStart: "2026-03-26T00:00:00.000Z",
      subscriptionEnd: "2026-03-28T00:00:00.000Z",
    }),
    createIpo({
      id: "this-month",
      slug: "this-month",
      name: "이번달",
      subscriptionStart: "2026-03-29T00:00:00.000Z",
      subscriptionEnd: "2026-03-31T00:00:00.000Z",
    }),
    createIpo({
      id: "past-a",
      slug: "past-a",
      name: "지난A",
      subscriptionStart: "2026-03-21T00:00:00.000Z",
      subscriptionEnd: "2026-03-24T00:00:00.000Z",
    }),
    createIpo({
      id: "past-b",
      slug: "past-b",
      name: "지난B",
      subscriptionStart: "2026-03-17T00:00:00.000Z",
      subscriptionEnd: "2026-03-20T00:00:00.000Z",
    }),
  ];

  const counts = getOverviewFilterCounts(ipos, timing);

  assert.deepEqual(counts, {
    ALL: 5,
    THIS_WEEK: 2,
    THIS_MONTH: 3,
    OPEN_NOW: 1,
    PAST: 2,
  });
  assert.equal(matchesOverviewFilter(ipos[0], "OPEN_NOW", timing), true);
  assert.equal(matchesOverviewFilter(ipos[4], "PAST", timing), true);
});

test("overview sections keep upcoming soon first and sort past items by most recent deadline", () => {
  const timing = buildOverviewTiming("2026-03-25");
  const sections = buildOverviewSections([
    createIpo({
      id: "upcoming",
      slug: "upcoming",
      name: "다음일정",
      subscriptionStart: "2026-03-29T00:00:00.000Z",
      subscriptionEnd: "2026-04-03T00:00:00.000Z",
    }),
    createIpo({
      id: "past-older",
      slug: "past-older",
      name: "지난오래전",
      subscriptionStart: "2026-03-15T00:00:00.000Z",
      subscriptionEnd: "2026-03-20T00:00:00.000Z",
    }),
    createIpo({
      id: "this-week",
      slug: "this-week",
      name: "이번주마감",
      subscriptionStart: "2026-03-26T00:00:00.000Z",
      subscriptionEnd: "2026-03-28T00:00:00.000Z",
    }),
    createIpo({
      id: "past-recent",
      slug: "past-recent",
      name: "지난최근",
      subscriptionStart: "2026-03-21T00:00:00.000Z",
      subscriptionEnd: "2026-03-24T00:00:00.000Z",
    }),
  ], "DEADLINE", timing);

  assert.deepEqual(sections.map((section) => section.id), ["THIS_WEEK", "UPCOMING", "PAST"]);
  assert.deepEqual(sections[0].items.map((ipo) => ipo.id), ["this-week"]);
  assert.deepEqual(sections[1].items.map((ipo) => ipo.id), ["upcoming"]);
  assert.deepEqual(sections[2].items.map((ipo) => ipo.id), ["past-recent", "past-older"]);
});

test("overview deposit sort places the lowest minimum deposit first and null values last", () => {
  const timing = buildOverviewTiming("2026-03-25");
  const sections = buildOverviewSections([
    createIpo({
      id: "cheapest",
      slug: "cheapest",
      name: "저가",
      subscriptionStart: "2026-03-29T00:00:00.000Z",
      subscriptionEnd: "2026-04-03T00:00:00.000Z",
      offerPrice: 5_000,
      minimumSubscriptionShares: 10,
      depositRate: 0.5,
    }),
    createIpo({
      id: "expensive",
      slug: "expensive",
      name: "고가",
      subscriptionStart: "2026-03-29T00:00:00.000Z",
      subscriptionEnd: "2026-04-02T00:00:00.000Z",
      offerPrice: 20_000,
      minimumSubscriptionShares: 10,
      depositRate: 0.5,
    }),
    createIpo({
      id: "missing-deposit",
      slug: "missing-deposit",
      name: "미정",
      subscriptionStart: "2026-03-29T00:00:00.000Z",
      subscriptionEnd: "2026-04-04T00:00:00.000Z",
      offerPrice: null,
      minimumSubscriptionShares: null,
      depositRate: null,
    }),
  ], "DEPOSIT_LOW", timing);

  assert.equal(getMinimumDepositAmount(sections[0].items[0]), 25_000);
  assert.deepEqual(sections[0].items.map((ipo) => ipo.id), ["cheapest", "expensive", "missing-deposit"]);
});
