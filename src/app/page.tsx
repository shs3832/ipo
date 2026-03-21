import Link from "next/link";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { formatDate, getMonthDays, kstDateKey } from "@/lib/date";
import { getDashboardSnapshot } from "@/lib/jobs";
import { HomeContent } from "@/app/home-content";

export const dynamic = "force-dynamic";

type EventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

export default async function Home() {
  const isAdmin = await isAdminAuthenticated();
  const snapshot = await getDashboardSnapshot();
  const monthDays = getMonthDays(snapshot.calendarMonth);
  const currentMonthKey = formatDate(snapshot.calendarMonth, "yyyy-MM");
  const eventsByDate = new Map<string, { title: string; slug: string; type: EventType }[]>();

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
          <Link className="button-primary" href={isAdmin ? "/admin" : "/login?next=/admin"}>
            {isAdmin ? "관리자 화면" : "관리자 로그인"}
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

      <HomeContent
        calendarMonthLabel={formatDate(snapshot.calendarMonth, "yyyy년 MM월")}
        currentMonthKey={currentMonthKey}
        eventsByDate={Object.fromEntries(eventsByDate)}
        ipos={snapshot.ipos.map((ipo) => ({
          id: ipo.id,
          slug: ipo.slug,
          name: ipo.name,
          market: ipo.market,
          leadManager: ipo.leadManager,
          score: ipo.latestAnalysis.score,
          subscriptionEnd: ipo.subscriptionEnd.toISOString(),
          offerPrice: ipo.offerPrice,
          ratingLabel: ipo.latestAnalysis.ratingLabel,
        }))}
        monthDays={monthDays.map((day) => day.toISOString())}
      />
    </main>
  );
}
