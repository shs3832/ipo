import { getKstDayOfWeek, getKstTodayKey, kstDateKey, parseKstDate, shiftKstDateKey } from "@/lib/date";
import { isSpacIpo } from "@/lib/ipo-classification";

export { isSpacIpo };

export type CalendarEventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

export type CalendarEntry = {
  title: string;
  slug: string;
  type: CalendarEventType;
};

export type CalendarEventFilters = Record<CalendarEventType, boolean>;

export type StoredCalendarFilters = CalendarEventFilters & {
  includeSpac?: boolean;
};

export type HomeIpoSummary = {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string;
  subscriptionStart: string;
  subscriptionEnd: string;
  offerPrice: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
  publicScore: {
    totalScore: number | null;
    status: "NOT_READY" | "PARTIAL" | "READY" | "STALE" | "UNAVAILABLE";
    coverageStatus: "EMPTY" | "PARTIAL" | "SUFFICIENT" | "UNAVAILABLE";
  } | null;
};

export type OverviewFilterKey = "ALL" | "THIS_WEEK" | "THIS_MONTH" | "OPEN_NOW" | "PAST";
export type OverviewSortKey = "DEADLINE" | "NAME" | "DEPOSIT_LOW";
export type OverviewSectionId = "THIS_WEEK" | "UPCOMING" | "PAST";

export type OverviewTiming = {
  todayKey: string;
  weekEndKey: string;
  monthKey: string;
};

export type OverviewSection = {
  id: OverviewSectionId;
  title: string;
  description: string;
  items: HomeIpoSummary[];
};

export const overviewFilterItems: Array<{ key: OverviewFilterKey; label: string }> = [
  { key: "ALL", label: "전체" },
  { key: "THIS_WEEK", label: "이번주 마감" },
  { key: "THIS_MONTH", label: "이번달" },
  { key: "OPEN_NOW", label: "청약중" },
  { key: "PAST", label: "지난 종목" },
];

export const overviewSortItems: Array<{ key: OverviewSortKey; label: string }> = [
  { key: "DEADLINE", label: "청약 마감순" },
  { key: "NAME", label: "종목명순" },
  { key: "DEPOSIT_LOW", label: "최소청약금액 낮은순" },
];

const calendarEventTypes: CalendarEventType[] = ["SUBSCRIPTION", "REFUND", "LISTING"];

export const defaultCalendarFilters: CalendarEventFilters = {
  SUBSCRIPTION: true,
  REFUND: true,
  LISTING: true,
};

const nameCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

const normalizeSearchValue = (value: string) => value.trim().toLocaleLowerCase("ko-KR");
const getSubscriptionStartKey = (ipo: HomeIpoSummary) => kstDateKey(new Date(ipo.subscriptionStart));
const getSubscriptionEndKey = (ipo: HomeIpoSummary) => kstDateKey(new Date(ipo.subscriptionEnd));
const isCalendarEntrySpac = (entry: CalendarEntry) => isSpacIpo({ name: entry.title });

export const isStoredCalendarFilters = (value: unknown): value is StoredCalendarFilters =>
  typeof value === "object"
  && value !== null
  && calendarEventTypes.every((type) => typeof (value as Record<string, unknown>)[type] === "boolean")
  && (!("includeSpac" in (value as Record<string, unknown>))
    || typeof (value as Record<string, unknown>).includeSpac === "boolean");

export const getCalendarEventCounts = (eventsByDate: Record<string, CalendarEntry[]>) => {
  const counts: Record<CalendarEventType, number> = {
    SUBSCRIPTION: 0,
    REFUND: 0,
    LISTING: 0,
  };

  Object.values(eventsByDate).forEach((entries) => {
    entries.forEach((entry) => {
      counts[entry.type] += 1;
    });
  });

  return counts;
};

const getCalendarEntriesForVisibleDays = (
  eventsByDate: Record<string, CalendarEntry[]>,
  visibleDayKeys: string[],
) => visibleDayKeys.flatMap((dayKey) => eventsByDate[dayKey] ?? []);

const getDistinctEntrySlugCount = (entries: CalendarEntry[]) => new Set(entries.map((entry) => entry.slug)).size;
const getVisibleCalendarEntries = (
  eventsByDate: Record<string, CalendarEntry[]>,
  visibleDayKeys: string[],
  filters: CalendarEventFilters,
  includeSpac: boolean,
) => getCalendarEntriesForVisibleDays(eventsByDate, visibleDayKeys).filter((entry) =>
  filters[entry.type] && (includeSpac || !isCalendarEntrySpac(entry)));

export const getVisibleCalendarEventIpoCounts = (
  eventsByDate: Record<string, CalendarEntry[]>,
  visibleDayKeys: string[],
  filters: CalendarEventFilters,
  includeSpac: boolean,
) => calendarEventTypes.reduce<Record<CalendarEventType, number>>((counts, type) => {
  counts[type] = getDistinctEntrySlugCount(
    getVisibleCalendarEntries(eventsByDate, visibleDayKeys, filters, includeSpac).filter((entry) =>
      entry.type === type),
  );
  return counts;
}, {
  SUBSCRIPTION: 0,
  REFUND: 0,
  LISTING: 0,
});

export const getVisibleCalendarSpacIpoCount = (
  eventsByDate: Record<string, CalendarEntry[]>,
  visibleDayKeys: string[],
  filters: CalendarEventFilters,
  includeSpac: boolean,
) => getDistinctEntrySlugCount(getVisibleCalendarEntries(eventsByDate, visibleDayKeys, filters, includeSpac).filter(
  (entry) => isCalendarEntrySpac(entry),
));

export const filterCalendarEntries = (
  entries: CalendarEntry[],
  filters: CalendarEventFilters,
  includeSpac: boolean,
) => entries.filter((entry) => filters[entry.type] && (includeSpac || !isCalendarEntrySpac(entry)));

export const getVisibleCalendarEventCount = (
  eventsByDate: Record<string, CalendarEntry[]>,
  visibleDayKeys: string[],
  filters: CalendarEventFilters,
  includeSpac: boolean,
) => getVisibleCalendarEntries(eventsByDate, visibleDayKeys, filters, includeSpac).length;

export const buildOverviewTiming = (todayKey = getKstTodayKey()): OverviewTiming => {
  const currentDayOfWeek = getKstDayOfWeek(parseKstDate(todayKey));

  return {
    todayKey,
    weekEndKey: shiftKstDateKey(todayKey, 6 - currentDayOfWeek),
    monthKey: todayKey.slice(0, 7),
  };
};

export const getMinimumDepositAmount = ({
  offerPrice,
  minimumSubscriptionShares,
  depositRate,
}: Pick<HomeIpoSummary, "offerPrice" | "minimumSubscriptionShares" | "depositRate">) => {
  if (offerPrice == null || minimumSubscriptionShares == null || depositRate == null) {
    return null;
  }

  return Math.round(offerPrice * minimumSubscriptionShares * depositRate);
};

export const matchesOverviewSearch = (ipo: HomeIpoSummary, query: string) => {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return [
    ipo.name,
    ipo.leadManager,
    ipo.market,
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
};

export const matchesOverviewFilter = (
  ipo: HomeIpoSummary,
  filterKey: OverviewFilterKey,
  timing = buildOverviewTiming(),
) => {
  if (filterKey === "ALL") {
    return true;
  }

  const subscriptionStartKey = getSubscriptionStartKey(ipo);
  const subscriptionEndKey = getSubscriptionEndKey(ipo);

  switch (filterKey) {
    case "THIS_WEEK":
      return subscriptionEndKey >= timing.todayKey && subscriptionEndKey <= timing.weekEndKey;
    case "THIS_MONTH":
      return subscriptionEndKey >= timing.todayKey && subscriptionEndKey.startsWith(timing.monthKey);
    case "OPEN_NOW":
      return subscriptionStartKey <= timing.todayKey && subscriptionEndKey >= timing.todayKey;
    case "PAST":
      return subscriptionEndKey < timing.todayKey;
    default:
      return true;
  }
};

export const getOverviewFilterCounts = (
  ipos: HomeIpoSummary[],
  timing = buildOverviewTiming(),
) => overviewFilterItems.reduce<Record<OverviewFilterKey, number>>((counts, item) => {
  counts[item.key] = ipos.filter((ipo) => matchesOverviewFilter(ipo, item.key, timing)).length;
  return counts;
}, {
  ALL: 0,
  THIS_WEEK: 0,
  THIS_MONTH: 0,
  OPEN_NOW: 0,
  PAST: 0,
});

const compareByName = (left: HomeIpoSummary, right: HomeIpoSummary) => nameCollator.compare(left.name, right.name);

const compareByMinimumDeposit = (left: HomeIpoSummary, right: HomeIpoSummary) => {
  const leftAmount = getMinimumDepositAmount(left);
  const rightAmount = getMinimumDepositAmount(right);

  if (leftAmount == null && rightAmount == null) {
    return compareByName(left, right);
  }

  if (leftAmount == null) {
    return 1;
  }

  if (rightAmount == null) {
    return -1;
  }

  if (leftAmount !== rightAmount) {
    return leftAmount - rightAmount;
  }

  return compareByName(left, right);
};

const sortOverviewSectionItems = (
  items: HomeIpoSummary[],
  sortKey: OverviewSortKey,
  sectionId: OverviewSectionId,
) => [...items].sort((left, right) => {
  if (sortKey === "NAME") {
    return compareByName(left, right);
  }

  if (sortKey === "DEPOSIT_LOW") {
    return compareByMinimumDeposit(left, right);
  }

  const leftEndDate = new Date(left.subscriptionEnd).getTime();
  const rightEndDate = new Date(right.subscriptionEnd).getTime();

  if (leftEndDate !== rightEndDate) {
    return sectionId === "PAST"
      ? rightEndDate - leftEndDate
      : leftEndDate - rightEndDate;
  }

  return compareByName(left, right);
});

export const buildOverviewSections = (
  ipos: HomeIpoSummary[],
  sortKey: OverviewSortKey,
  timing = buildOverviewTiming(),
): OverviewSection[] => {
  const thisWeek: HomeIpoSummary[] = [];
  const upcoming: HomeIpoSummary[] = [];
  const past: HomeIpoSummary[] = [];

  ipos.forEach((ipo) => {
    const subscriptionEndKey = getSubscriptionEndKey(ipo);

    if (subscriptionEndKey < timing.todayKey) {
      past.push(ipo);
      return;
    }

    if (subscriptionEndKey <= timing.weekEndKey) {
      thisWeek.push(ipo);
      return;
    }

    upcoming.push(ipo);
  });

  return [
    {
      id: "THIS_WEEK" as const,
      title: "이번 주 마감",
      description: "오늘부터 이번 주 안에 청약이 끝나는 종목입니다.",
      items: sortOverviewSectionItems(thisWeek, sortKey, "THIS_WEEK"),
    },
    {
      id: "UPCOMING" as const,
      title: "그다음 일정",
      description: "이번 주 이후에 이어지는 종목입니다.",
      items: sortOverviewSectionItems(upcoming, sortKey, "UPCOMING"),
    },
    {
      id: "PAST" as const,
      title: "지난 종목",
      description: "청약 마감이 지난 종목입니다.",
      items: sortOverviewSectionItems(past, sortKey, "PAST"),
    },
  ].filter((section) => section.items.length > 0);
};
