"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import {
  buildOverviewSections,
  buildOverviewTiming,
  getMinimumDepositAmount,
  type HomeIpoSummary,
  getOverviewFilterCounts,
  isSpacIpo,
  matchesOverviewFilter,
  matchesOverviewSearch,
  overviewFilterItems,
  overviewSortItems,
  type OverviewFilterKey,
  type OverviewSortKey,
} from "@/app/home-content-helpers";
import { BrokerChipList } from "@/components/broker-chip";
import styles from "@/app/home-content.module.scss";
import { formatDate, formatMoney, formatSignedPercentValue, getKstDayOfWeek, getKstTodayKey, kstDateKey } from "@/lib/date";

type EventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

type CalendarEntry = {
  title: string;
  slug: string;
  type: EventType;
};

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

type Props = {
  calendarMonthLabel: string;
  currentMonthKey: string;
  monthDays: string[];
  eventsByDate: Record<string, CalendarEntry[]>;
  ipos: HomeIpoSummary[];
};

const eventLabel: Record<EventType, string> = {
  SUBSCRIPTION: "청약",
  REFUND: "환불",
  LISTING: "상장",
};

const filterItems: Array<{ type: EventType; label: string }> = [
  { type: "SUBSCRIPTION", label: "청약" },
  { type: "REFUND", label: "환불" },
  { type: "LISTING", label: "상장" },
];

// Keep the source data intact so weekend columns can be restored later by toggling this flag.
const SHOW_WEEKEND_COLUMNS = false;

const badgeClassNames: Record<EventType, string> = {
  SUBSCRIPTION: styles.eventBadgeSubscription,
  REFUND: styles.eventBadgeRefund,
  LISTING: styles.eventBadgeListing,
};

const chipClassNames: Record<EventType, string> = {
  SUBSCRIPTION: styles.eventChipSubscription,
  REFUND: styles.eventChipRefund,
  LISTING: styles.eventChipListing,
};

const calendarNotice =
  "일정 데이터는 매일 오전 6시 기준으로 갱신되고, 상장일 시초가는 오전 10:10과 10:30에 추가 확인합니다. 환불·상장 일정은 최종 공고를 함께 확인해 주세요.";
const calendarFilterStorageKey = "ipo-calendar-event-filters";
const defaultFilters: Record<EventType, boolean> = {
  SUBSCRIPTION: true,
  REFUND: true,
  LISTING: true,
};
const overviewCompactMediaQuery = "(max-width: 1024px)";
const overviewMobileSectionLimit = 4;

const isStoredFilters = (value: unknown): value is Record<EventType, boolean> =>
  typeof value === "object"
  && value !== null
  && ["SUBSCRIPTION", "REFUND", "LISTING"].every(
    (type) => typeof (value as Record<string, unknown>)[type] === "boolean",
  );

const formatScoreValue = (value: number | null) => (value == null ? "산출 대기" : `${value.toFixed(1)}점`);

const getScoreStatusLabel = (score: HomeIpoSummary["publicScore"]) => {
  if (!score || score.status === "UNAVAILABLE" || score.status === "NOT_READY") {
    return "점수 준비 중";
  }

  if (score.status === "PARTIAL") {
    return "부분 산출";
  }

  if (score.status === "STALE") {
    return "재점검 중";
  }

  return score.coverageStatus === "SUFFICIENT" ? "점수 공개" : "보강 반영";
};

const getScoreBadgeToneClassName = (score: HomeIpoSummary["publicScore"]) => {
  if (!score || score.status === "UNAVAILABLE" || score.status === "NOT_READY") {
    return styles.ipoScoreBadgePending;
  }

  if (score.status === "PARTIAL" || score.status === "STALE") {
    return styles.ipoScoreBadgePartial;
  }

  if ((score.totalScore ?? 0) >= 70) {
    return styles.ipoScoreBadgeStrong;
  }

  return styles.ipoScoreBadgeReady;
};

export function HomeContent({
  calendarMonthLabel,
  currentMonthKey,
  monthDays,
  eventsByDate,
  ipos,
}: Props) {
  const [filters, setFilters] = useState<Record<EventType, boolean>>(defaultFilters);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [overviewQuery, setOverviewQuery] = useState("");
  const deferredOverviewQuery = useDeferredValue(overviewQuery);
  const [selectedOverviewFilter, setSelectedOverviewFilter] = useState<OverviewFilterKey>("ALL");
  const [selectedOverviewSort, setSelectedOverviewSort] = useState<OverviewSortKey>("DEADLINE");
  const [includeSpac, setIncludeSpac] = useState(false);
  const [isPastSectionExpanded, setIsPastSectionExpanded] = useState(false);
  const [showAllMobileSections, setShowAllMobileSections] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(calendarFilterStorageKey);
      if (!storedValue) {
        setHasRestoredFilters(true);
        return;
      }

      const parsed = JSON.parse(storedValue) as unknown;
      if (isStoredFilters(parsed)) {
        setFilters(parsed);
      }
    } catch {
      window.localStorage.removeItem(calendarFilterStorageKey);
    } finally {
      setHasRestoredFilters(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredFilters) {
      return;
    }

    window.localStorage.setItem(calendarFilterStorageKey, JSON.stringify(filters));
  }, [filters, hasRestoredFilters]);

  useEffect(() => {
    const syncTodayKey = () => {
      setTodayKey(kstDateKey(new Date()));
    };

    syncTodayKey();

    const intervalId = window.setInterval(syncTodayKey, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(overviewCompactMediaQuery) as LegacyMediaQueryList;
    const syncViewportState = () => {
      setIsCompactViewport(mediaQuery.matches);
    };

    syncViewportState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewportState);
      return () => mediaQuery.removeEventListener("change", syncViewportState);
    }

    mediaQuery.addListener?.(syncViewportState);
    return () => mediaQuery.removeListener?.(syncViewportState);
  }, []);

  useEffect(() => {
    setShowAllMobileSections(false);
  }, [overviewQuery, selectedOverviewFilter, selectedOverviewSort]);

  const eventCounts: Record<EventType, number> = {
    SUBSCRIPTION: 0,
    REFUND: 0,
    LISTING: 0,
  };

  Object.values(eventsByDate).forEach((entries) => {
    entries.forEach((entry) => {
      eventCounts[entry.type] += 1;
    });
  });

  const visibleEventCount = Object.entries(eventCounts).reduce((count, [type, value]) => {
    if (!filters[type as EventType]) {
      return count;
    }

    return count + value;
  }, 0);

  const toggleFilter = (type: EventType) => {
    setFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  const visibleWeekdayLabels = ["일", "월", "화", "수", "목", "금", "토"].filter((_, index) =>
    SHOW_WEEKEND_COLUMNS ? true : index !== 0 && index !== 6,
  );

  const visibleMonthDays = monthDays.filter((dayValue) => {
    if (SHOW_WEEKEND_COLUMNS) {
      return true;
    }

    const dayOfWeek = getKstDayOfWeek(new Date(dayValue));
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  });

  const overviewTiming = buildOverviewTiming(todayKey ?? getKstTodayKey());
  const searchMatchedIpos = ipos.filter((ipo) => matchesOverviewSearch(ipo, deferredOverviewQuery));
  const spacCount = searchMatchedIpos.filter((ipo) => isSpacIpo(ipo)).length;
  const overviewBaseIpos = includeSpac ? searchMatchedIpos : searchMatchedIpos.filter((ipo) => !isSpacIpo(ipo));
  const overviewFilterCounts = getOverviewFilterCounts(overviewBaseIpos, overviewTiming);
  const filteredIpos = overviewBaseIpos.filter((ipo) => matchesOverviewFilter(ipo, selectedOverviewFilter, overviewTiming));
  const overviewSections = buildOverviewSections(filteredIpos, selectedOverviewSort, overviewTiming);
  const hasNonPastOverviewSection = overviewSections.some((section) => section.id !== "PAST");
  const hasPastOverviewSection = overviewSections.some((section) => section.id === "PAST");
  const isPastSectionForcedOpen = selectedOverviewFilter === "PAST" || (hasPastOverviewSection && !hasNonPastOverviewSection);
  const isPastSectionOpen = isPastSectionForcedOpen || isPastSectionExpanded;
  const renderedOverviewSections = overviewSections.map((section) => {
    const isPastSection = section.id === "PAST";
    const isCollapsed = isPastSection && !isPastSectionOpen;
    const visibleItems = isCollapsed
      ? []
      : (
          isCompactViewport && !showAllMobileSections
            ? section.items.slice(0, overviewMobileSectionLimit)
            : section.items
        );

    return {
      ...section,
      isCollapsed,
      visibleItems,
      hiddenCount: Math.max(section.items.length - visibleItems.length, 0),
    };
  });
  const hiddenOverviewCount = renderedOverviewSections.reduce((count, section) => {
    if (section.isCollapsed) {
      return count;
    }

    return count + section.hiddenCount;
  }, 0);
  const hasMoreOverviewItems = isCompactViewport && !showAllMobileSections && hiddenOverviewCount > 0;
  const filteredOverviewLabel = `${filteredIpos.length} / ${ipos.length}개 종목`;
  const resetOverviewControls = () => {
    setOverviewQuery("");
    setSelectedOverviewFilter("ALL");
    setSelectedOverviewSort("DEADLINE");
    setIncludeSpac(false);
    setIsPastSectionExpanded(false);
    setShowAllMobileSections(false);
  };

  return (
    <section className={styles.layout}>
      <article className={styles.calendarPanel} id="calendar-panel">
        <div className={styles.panelHeader}>
          <div>
            <p className="page-eyebrow">Monthly View</p>
            <h2 className="section-title">{calendarMonthLabel} 일정</h2>
            <p className="section-copy">이번 달과 다음 달에 실제 일정이 있는 종목만 묶어서 보여주고 있습니다.</p>
          </div>
          <span className="status-pill">{visibleEventCount}개 이벤트</span>
        </div>

        <p className={styles.calendarNotice}>{calendarNotice}</p>

        <div className={styles.filterRow} aria-label="캘린더 일정 필터">
          {filterItems.map((item) => (
            <label
              className={`${styles.filterChip} ${filters[item.type] ? styles.filterChipActive : ""}`}
              data-type={item.type}
              key={item.type}
            >
              <input
                className={styles.filterInput}
                checked={filters[item.type]}
                onChange={() => toggleFilter(item.type)}
                type="checkbox"
              />
              <span aria-hidden="true" className={styles.filterCheck}>
                <svg
                  className={styles.filterCheckIcon}
                  fill="none"
                  viewBox="0 0 16 16"
                >
                  <path
                    className={styles.filterCheckIconPath}
                    d="M3.5 8.5 6.6 11.4 12.5 4.9"
                  />
                </svg>
              </span>
              <span className={styles.filterChipLabel}>{item.label}</span>
              <strong className={styles.filterChipCount}>{eventCounts[item.type]}</strong>
            </label>
          ))}
        </div>

        <div className={`${styles.weekdayRow} ${SHOW_WEEKEND_COLUMNS ? "" : styles.weekdaysOnly}`}>
          {visibleWeekdayLabels.map((label) => (
            <span
              className={styles.weekdayLabel}
              key={label}
            >
              {label}
            </span>
          ))}
        </div>

        <div className={`${styles.calendarGrid} ${SHOW_WEEKEND_COLUMNS ? "" : styles.weekdaysOnly}`}>
          {visibleMonthDays.map((dayValue) => {
            const day = new Date(dayValue);
            const dayKey = kstDateKey(day);
            const entries = (eventsByDate[dayKey] ?? []).filter((entry) => filters[entry.type]);
            const dayOfWeek = getKstDayOfWeek(day);
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const isCurrentMonth = formatDate(day, "yyyy-MM") === currentMonthKey;
            const isToday = todayKey === dayKey;

            return (
              <div
                aria-current={isToday ? "date" : undefined}
                className={`${styles.calendarCell} ${isSunday ? styles.calendarSunday : ""} ${isSaturday ? styles.calendarSaturday : ""} ${isCurrentMonth ? "" : styles.calendarOtherMonth} ${isToday ? styles.calendarToday : ""}`}
                key={dayValue}
              >
                <div
                  className={styles.calendarDateRow}
                >
                  <div
                    className={`${styles.calendarDate} ${isSunday ? styles.calendarDateSunday : ""} ${isSaturday ? styles.calendarDateSaturday : ""} ${isToday ? styles.calendarDateToday : ""}`}
                  >
                    {formatDate(day, "d")}
                  </div>
                  {isToday ? <span className={styles.todayBadge}>오늘</span> : null}
                </div>
                <div className={styles.calendarEvents}>
                  {entries.length ? (
                    entries.map((entry) => (
                      <Link
                        className={`${styles.eventChip} ${chipClassNames[entry.type]}`}
                        href={`/ipos/${entry.slug}`}
                        key={`${entry.slug}-${entry.type}`}
                      >
                        <span className={`${styles.eventBadge} ${badgeClassNames[entry.type]}`}>{eventLabel[entry.type]}</span>
                        <strong>{entry.title}</strong>
                      </Link>
                    ))
                  ) : (
                    <span className={styles.eventEmpty}>일정 없음</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <article className={styles.sidePanel} id="tracked-ipos">
        <div className={styles.panelHeader}>
          <div>
            <p className="page-eyebrow">Tracked IPOs</p>
            <h2 className="section-title">종목 개요</h2>
            <p className="section-copy">청약 마감일 기준으로 일정, 공모가, 주관사 같은 공시 기반 핵심 정보만 빠르게 훑는 영역입니다.</p>
          </div>
          <span className="status-pill status-pill-soft">{filteredOverviewLabel}</span>
        </div>
        <div className={styles.overviewToolbar}>
          <div className={styles.overviewControlRow}>
            <label className={styles.overviewSearchField}>
              <span className={styles.overviewControlLabel}>검색</span>
              <div className={styles.overviewSearchInputWrap}>
                <span aria-hidden="true" className={styles.overviewSearchIcon}>
                  <svg fill="none" viewBox="0 0 20 20">
                    <path d="M8.5 4.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 12l3.5 3.5" />
                  </svg>
                </span>
                <input
                  className={styles.overviewSearchInput}
                  onChange={(event) => setOverviewQuery(event.target.value)}
                  placeholder="종목명, 주관사, 시장 검색"
                  type="search"
                  value={overviewQuery}
                />
                {overviewQuery ? (
                  <button
                    className={styles.overviewSearchClear}
                    onClick={() => setOverviewQuery("")}
                    type="button"
                  >
                    지우기
                  </button>
                ) : null}
              </div>
            </label>

            <label className={styles.overviewSortField}>
              <span className={styles.overviewControlLabel}>정렬</span>
              <select
                className={styles.overviewSortSelect}
                onChange={(event) => setSelectedOverviewSort(event.target.value as OverviewSortKey)}
                value={selectedOverviewSort}
              >
                {overviewSortItems.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.overviewFilterRow} aria-label="종목 개요 필터">
            {overviewFilterItems.map((item) => (
              <button
                className={`${styles.overviewFilterChip} ${selectedOverviewFilter === item.key ? styles.overviewFilterChipActive : ""}`}
                key={item.key}
                onClick={() => setSelectedOverviewFilter(item.key)}
                type="button"
              >
                <span>{item.label}</span>
                <strong>{overviewFilterCounts[item.key]}</strong>
              </button>
            ))}
            <label
              className={`${styles.overviewOptionToggle} ${includeSpac ? styles.overviewOptionToggleActive : ""}`}
            >
              <input
                checked={includeSpac}
                className={styles.overviewOptionInput}
                onChange={(event) => setIncludeSpac(event.target.checked)}
                type="checkbox"
              />
              <span aria-hidden="true" className={styles.overviewOptionIndicator}>
                <svg className={styles.overviewOptionIndicatorIcon} fill="none" viewBox="0 0 16 16">
                  <path
                    className={styles.overviewOptionIndicatorPath}
                    d="M3.5 8.5 6.6 11.4 12.5 4.9"
                  />
                </svg>
              </span>
              <span className={styles.overviewOptionLabel}>스팩 포함</span>
              <strong className={styles.overviewOptionCount}>{spacCount}</strong>
            </label>
          </div>
        </div>

        {renderedOverviewSections.length ? (
          <div className={styles.overviewSections}>
            {renderedOverviewSections.map((section) => (
              <section className={styles.overviewSection} key={section.id}>
                <div className={styles.overviewSectionHeader}>
                  <div>
                    <h3 className={styles.overviewSectionTitle}>{section.title}</h3>
                    <p className={styles.overviewSectionCopy}>{section.description}</p>
                  </div>
                  <div className={styles.overviewSectionMeta}>
                    <span className={styles.overviewSectionCount}>{section.items.length}개</span>
                    {section.id === "PAST" && !isPastSectionForcedOpen ? (
                      <button
                        aria-expanded={!section.isCollapsed}
                        className={styles.overviewSectionToggle}
                        onClick={() => setIsPastSectionExpanded((current) => !current)}
                        type="button"
                      >
                        {section.isCollapsed ? "펴보기" : "접기"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {section.isCollapsed ? null : (
                  <div className={styles.ipoList}>
                    {section.visibleItems.map((ipo) => {
                      const minimumDepositAmount = getMinimumDepositAmount(ipo);

                      return (
                        <Link className={styles.ipoCard} href={`/ipos/${ipo.slug}`} key={ipo.id}>
                          <div className={styles.ipoCardHead}>
                            <div>
                              <h3>{ipo.name}</h3>
                              <p>{ipo.market}</p>
                              <BrokerChipList className={styles.ipoBrokerList} names={[ipo.leadManager]} size="sm" />
                            </div>
                            <span className={`${styles.ipoScoreBadge} ${getScoreBadgeToneClassName(ipo.publicScore)} ${styles.scoreHidden}`}>
                              {getScoreStatusLabel(ipo.publicScore)}
                            </span>
                          </div>
                          <dl className={styles.ipoStats}>
                            <div>
                              <dt>청약</dt>
                              <dd>{formatDate(new Date(ipo.subscriptionEnd))}</dd>
                            </div>
                            <div>
                              <dt>공모가</dt>
                              <dd>{formatMoney(ipo.offerPrice)}</dd>
                            </div>
                            <div>
                              <dt>최소청약주수</dt>
                              <dd>{ipo.minimumSubscriptionShares != null ? `${ipo.minimumSubscriptionShares.toLocaleString("ko-KR")}주` : "-"}</dd>
                            </div>
                            <div>
                              <dt>최소청약금액</dt>
                              <dd>{formatMoney(minimumDepositAmount)}</dd>
                            </div>
                            <div className={styles.scoreHidden}>
                              <dt>종합점수</dt>
                              <dd>{formatScoreValue(ipo.publicScore?.totalScore ?? null)}</dd>
                            </div>
                            {ipo.listingOpenPrice != null ? (
                              <>
                                <div>
                                  <dt>시초가</dt>
                                  <dd>{formatMoney(ipo.listingOpenPrice)}</dd>
                                </div>
                                <div>
                                  <dt>공모가 대비</dt>
                                  <dd>{formatSignedPercentValue(ipo.listingOpenReturnRate)}</dd>
                                </div>
                              </>
                            ) : null}
                          </dl>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}

            {hasMoreOverviewItems ? (
              <button
                className={styles.overviewMoreButton}
                onClick={() => setShowAllMobileSections(true)}
                type="button"
              >
                숨겨진 종목 {hiddenOverviewCount}개 더 보기
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.overviewEmptyState}>
            <p>조건에 맞는 종목이 없습니다. 검색어 또는 필터를 바꿔 보세요.</p>
            <button
              className={styles.overviewResetButton}
              onClick={resetOverviewControls}
              type="button"
            >
              필터 초기화
            </button>
          </div>
        )}
      </article>
    </section>
  );
}
