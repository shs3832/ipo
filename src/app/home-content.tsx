"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrokerChipList } from "@/components/broker-chip";
import { formatDate, formatMoney, formatSignedPercentValue, getKstDayOfWeek, kstDateKey } from "@/lib/date";
import styles from "@/app/home-content.module.scss";

type EventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

type CalendarEntry = {
  title: string;
  slug: string;
  type: EventType;
};

type HomeIpoSummary = {
  id: string;
  slug: string;
  name: string;
  market: string;
  leadManager: string;
  subscriptionEnd: string;
  offerPrice: number | null;
  listingOpenPrice: number | null;
  listingOpenReturnRate: number | null;
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

const isStoredFilters = (value: unknown): value is Record<EventType, boolean> =>
  typeof value === "object"
  && value !== null
  && ["SUBSCRIPTION", "REFUND", "LISTING"].every(
    (type) => typeof (value as Record<string, unknown>)[type] === "boolean",
  );

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

      <article className={styles.sidePanel}>
        <div className={styles.panelHeader}>
          <div>
            <p className="page-eyebrow">Tracked IPOs</p>
            <h2 className="section-title">종목 개요</h2>
            <p className="section-copy">청약 마감일 기준으로 일정, 공모가, 주관사 같은 공시 기반 핵심 정보만 빠르게 훑는 영역입니다.</p>
          </div>
          <span className="status-pill status-pill-soft">{ipos.length}개 종목</span>
        </div>
        <div className={styles.ipoList}>
          {ipos.map((ipo) => (
            <Link className={styles.ipoCard} href={`/ipos/${ipo.slug}`} key={ipo.id}>
              <div className={styles.ipoCardHead}>
                <div>
                  <h3>{ipo.name}</h3>
                  <p>{ipo.market}</p>
                  <BrokerChipList className={styles.ipoBrokerList} names={[ipo.leadManager]} size="sm" />
                </div>
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
                ) : (
                  <div>
                    <dt>정량 점수</dt>
                    <dd>비공개</dd>
                  </div>
                )}
              </dl>
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
