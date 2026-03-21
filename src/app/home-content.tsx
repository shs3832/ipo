"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate, formatMoney, kstDateKey } from "@/lib/date";

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

  const toggleFilter = (type: EventType) => {
    setFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  return (
    <section className="content-grid">
      <article className="calendar-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Monthly View</p>
            <h2>{calendarMonthLabel} 일정</h2>
            <p className="panel-copy">이번 달과 다음 달에 실제 일정이 있는 종목만 묶어서 보여주고 있습니다.</p>
          </div>
        </div>

        <div className="calendar-filter-row" aria-label="캘린더 일정 필터">
          {filterItems.map((item) => (
            <label className={`calendar-filter ${filters[item.type] ? "calendar-filter-active" : ""}`} key={item.type}>
              <input
                checked={filters[item.type]}
                onChange={() => toggleFilter(item.type)}
                type="checkbox"
              />
              <span className={`event-badge event-badge-${item.type.toLowerCase()}`}>{item.label}</span>
              <strong>{eventCounts[item.type]}</strong>
            </label>
          ))}
        </div>

        <div className="weekday-row">
          {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => (
            <span
              className={`weekday-label ${index === 0 ? "weekday-sunday" : ""} ${index === 6 ? "weekday-saturday" : ""}`}
              key={label}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="calendar-grid">
          {monthDays.map((dayValue) => {
            const day = new Date(dayValue);
            const entries = (eventsByDate[kstDateKey(day)] ?? []).filter((entry) => filters[entry.type]);
            const dayOfWeek = day.getDay();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const isCurrentMonth = formatDate(day, "yyyy-MM") === currentMonthKey;

            return (
              <div
                className={`calendar-cell ${isSunday ? "calendar-sunday" : ""} ${isSaturday ? "calendar-saturday" : ""} ${isCurrentMonth ? "" : "calendar-other-month"}`}
                key={dayValue}
              >
                <div className={`calendar-date ${isSunday ? "calendar-date-sunday" : ""} ${isSaturday ? "calendar-date-saturday" : ""}`}>
                  {formatDate(day, "d")}
                </div>
                <div className="calendar-events">
                  {entries.length ? (
                    entries.map((entry) => (
                      <Link className={`event-chip event-${entry.type.toLowerCase()}`} href={`/ipos/${entry.slug}`} key={`${entry.slug}-${entry.type}`}>
                        <span className={`event-badge event-badge-${entry.type.toLowerCase()}`}>{eventLabel[entry.type]}</span>
                        <strong>{entry.title}</strong>
                      </Link>
                    ))
                  ) : (
                    <span className="event-empty">일정 없음</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <article className="side-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Tracked IPOs</p>
            <h2>종목 개요</h2>
            <p className="panel-copy">이번 달과 다음 달 청약 기준으로 공모가와 현재 판단 점수를 빠르게 훑는 영역입니다.</p>
          </div>
        </div>
        <div className="ipo-list">
          {ipos.map((ipo) => (
            <Link className="ipo-card" href={`/ipos/${ipo.slug}`} key={ipo.id}>
              <div className="ipo-card-head">
                <div>
                  <h3>{ipo.name}</h3>
                  <p>
                    {ipo.market} · {ipo.leadManager}
                  </p>
                </div>
                <span className="score-badge">{ipo.score}점</span>
              </div>
              <dl>
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
