"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate, formatMoney, kstDateKey } from "@/lib/date";
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
  score: number;
  subscriptionEnd: string;
  offerPrice: number | null;
  ratingLabel: string;
};

type Props = {
  calendarMonthLabel: string;
  currentMonthKey: string;
  monthDays: string[];
  eventsByDate: Record<string, CalendarEntry[]>;
  ipos: HomeIpoSummary[];
};

const eventLabel: Record<EventType, string> = {
  SUBSCRIPTION: "청약마감",
  REFUND: "환불",
  LISTING: "상장",
};

const filterItems: Array<{ type: EventType; label: string }> = [
  { type: "SUBSCRIPTION", label: "청약마감" },
  { type: "REFUND", label: "환불" },
  { type: "LISTING", label: "상장" },
];

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

export function HomeContent({
  calendarMonthLabel,
  currentMonthKey,
  monthDays,
  eventsByDate,
  ipos,
}: Props) {
  const [filters, setFilters] = useState<Record<EventType, boolean>>({
    SUBSCRIPTION: true,
    REFUND: true,
    LISTING: true,
  });

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

        <div className={styles.filterRow} aria-label="캘린더 일정 필터">
          {filterItems.map((item) => (
            <label
              className={`${styles.filterChip} ${filters[item.type] ? styles.filterChipActive : ""}`}
              key={item.type}
            >
              <input
                checked={filters[item.type]}
                onChange={() => toggleFilter(item.type)}
                type="checkbox"
              />
              <span className={`${styles.eventBadge} ${badgeClassNames[item.type]}`}>{item.label}</span>
              <strong>{eventCounts[item.type]}</strong>
            </label>
          ))}
        </div>

        <div className={styles.weekdayRow}>
          {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => (
            <span
              className={`${styles.weekdayLabel} ${index === 0 ? styles.weekdaySunday : ""} ${index === 6 ? styles.weekdaySaturday : ""}`}
              key={label}
            >
              {label}
            </span>
          ))}
        </div>

        <div className={styles.calendarGrid}>
          {monthDays.map((dayValue) => {
            const day = new Date(dayValue);
            const entries = (eventsByDate[kstDateKey(day)] ?? []).filter((entry) => filters[entry.type]);
            const dayOfWeek = day.getDay();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const isCurrentMonth = formatDate(day, "yyyy-MM") === currentMonthKey;

            return (
              <div
                className={`${styles.calendarCell} ${isSunday ? styles.calendarSunday : ""} ${isSaturday ? styles.calendarSaturday : ""} ${isCurrentMonth ? "" : styles.calendarOtherMonth}`}
                key={dayValue}
              >
                <div
                  className={`${styles.calendarDate} ${isSunday ? styles.calendarDateSunday : ""} ${isSaturday ? styles.calendarDateSaturday : ""}`}
                >
                  {formatDate(day, "d")}
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
            <p className="section-copy">청약 마감일 기준으로 공모가와 현재 판단 점수를 빠르게 훑는 영역입니다.</p>
          </div>
          <span className="status-pill status-pill-soft">{ipos.length}개 종목</span>
        </div>
        <div className={styles.ipoList}>
          {ipos.map((ipo) => (
            <Link className={styles.ipoCard} href={`/ipos/${ipo.slug}`} key={ipo.id}>
              <div className={styles.ipoCardHead}>
                <div>
                  <h3>{ipo.name}</h3>
                  <p>
                    {ipo.market} · {ipo.leadManager}
                  </p>
                </div>
                <span className={styles.scoreBadge}>{ipo.score}점</span>
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
                  <dt>판단</dt>
                  <dd>{ipo.ratingLabel}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
