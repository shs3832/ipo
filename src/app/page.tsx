import Link from "next/link";

import { formatDate, formatMoney, getMonthDays, kstDateKey } from "@/lib/date";
import { getDashboardSnapshot } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const eventLabel = {
  SUBSCRIPTION: "청약",
  REFUND: "환불",
  LISTING: "상장",
};

export default async function Home() {
  const snapshot = await getDashboardSnapshot();
  const monthDays = getMonthDays(snapshot.calendarMonth);
  const eventsByDate = new Map<string, { title: string; slug: string; type: keyof typeof eventLabel }[]>();

  snapshot.ipos.forEach((ipo) => {
    ipo.events.forEach((event) => {
      const key = kstDateKey(event.eventDate);
      const list = eventsByDate.get(key) ?? [];
      list.push({
        title: ipo.name,
        slug: ipo.slug,
        type: event.type,
      });
      eventsByDate.set(key, list);
    });
  });

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">IPO Calendar Alerts</p>
          <h1>공모주 일정이 매일 반영되고, 마감 당일 오전 10시에 분석 메일이 발송됩니다.</h1>
          <p className="hero-copy">
            내부 캘린더로 청약, 환불, 상장 일정을 추적하고 단일 관리자 기준 알림 파이프라인을
            다중 수신자 구조로 확장 가능하게 설계했습니다.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button-primary" href="/admin">
            관리자 화면
          </Link>
          <span className="pill">현재 모드: {snapshot.mode === "database" ? "Database" : "Sample"}</span>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span>공모주 수</span>
          <strong>{snapshot.ipos.length}</strong>
          <p>이번 달 기준 일정과 분석이 연결된 종목</p>
        </article>
        <article className="summary-card">
          <span>수신자</span>
          <strong>{snapshot.recipients.length}</strong>
          <p>향후 다중 채널 확장을 고려한 구독 대상</p>
        </article>
        <article className="summary-card">
          <span>알림 잡</span>
          <strong>{snapshot.jobs.length}</strong>
          <p>당일 10시 분석 발송용 준비 상태</p>
        </article>
      </section>

      <section className="content-grid">
        <article className="calendar-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Monthly View</p>
              <h2>{formatDate(snapshot.calendarMonth, "yyyy년 MM월")} 일정</h2>
            </div>
          </div>
          <div className="weekday-row">
            {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {monthDays.map((day) => {
              const entries = eventsByDate.get(kstDateKey(day)) ?? [];

              return (
                <div className="calendar-cell" key={day.toISOString()}>
                  <div className="calendar-date">{formatDate(day, "d")}</div>
                  <div className="calendar-events">
                    {entries.length ? (
                      entries.map((entry) => (
                        <Link className={`event-chip event-${entry.type.toLowerCase()}`} href={`/ipos/${entry.slug}`} key={`${entry.slug}-${entry.type}`}>
                          <span>{eventLabel[entry.type]}</span>
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
            </div>
          </div>
          <div className="ipo-list">
            {snapshot.ipos.map((ipo) => (
              <Link className="ipo-card" href={`/ipos/${ipo.slug}`} key={ipo.id}>
                <div className="ipo-card-head">
                  <div>
                    <h3>{ipo.name}</h3>
                    <p>
                      {ipo.market} · {ipo.leadManager}
                    </p>
                  </div>
                  <span className="score-badge">{ipo.latestAnalysis.score}점</span>
                </div>
                <dl>
                  <div>
                    <dt>청약</dt>
                    <dd>{formatDate(ipo.subscriptionEnd)}</dd>
                  </div>
                  <div>
                    <dt>공모가</dt>
                    <dd>{formatMoney(ipo.offerPrice)}</dd>
                  </div>
                  <div>
                    <dt>판단</dt>
                    <dd>{ipo.latestAnalysis.ratingLabel}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
