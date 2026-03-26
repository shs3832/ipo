import Link from "next/link";

import { formatDate, getMonthDays, kstDateKey } from "@/lib/date";
import { HomeContent } from "@/app/home-content";
import { getCachedHomeSnapshot } from "@/lib/page-data";
import styles from "@/app/page.module.scss";

export const revalidate = 300;

type EventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

export default async function Home() {
  const snapshot = await getCachedHomeSnapshot();
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
    <main className="page-shell">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">IPO Calendar Alerts</p>
            <h1 className="page-title">공모주 일정을 한 화면에서 읽고, 마감일엔 오전 10시 분석 메일로 이어집니다.</h1>
            <p className="page-copy">
              캘린더, 종목 개요, 운영용 상태를 하나의 흐름으로 묶어 매일 업데이트되는 일정과
              알림 파이프라인을 빠르게 확인할 수 있게 설계했습니다.
            </p>
            <div className={styles.heroMetaRow}>
              <span className="status-pill">기준 시간대 Asia/Seoul</span>
              <span className="status-pill status-pill-soft">일정 표시는 청약 마감일 중심</span>
            </div>
          </div>

          <div className={styles.heroAside}>
            <article className={styles.heroMetricCard}>
              <span className={styles.cardLabel}>운영 모드</span>
              <strong className={styles.cardValue}>
                {snapshot.mode === "database" ? "Database" : "Fallback"}
              </strong>
              <p className={styles.cardCopy}>실데이터가 없을 때는 가짜 종목 없이 빈 fallback 상태로 안전하게 전환됩니다.</p>
            </article>

            <article className={styles.heroMetricCard}>
              <span className={styles.cardLabel}>표시 범위</span>
              <strong className={styles.cardValue}>{formatDate(snapshot.calendarMonth, "MM월")} + 다음 달</strong>
              <p className={styles.cardCopy}>실제 청약, 환불, 상장 이벤트가 있는 종목만 화면에 노출합니다.</p>
            </article>

            <div className={styles.heroActionGroup}>
              <Link className="button-primary" href="/admin">
                관리자 화면
              </Link>
              <a className="button-secondary" href="#calendar-panel">
                일정 바로 보기
              </a>
            </div>
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>추적 중인 공모주</span>
            <strong className={styles.summaryValue}>{snapshot.ipos.length}</strong>
            <p className={styles.cardCopy}>이번 달과 다음 달 일정 범위에 포함된 종목 수입니다.</p>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>활성 수신자</span>
            <strong className={styles.summaryValue}>{snapshot.recipientCount}</strong>
            <p className={styles.cardCopy}>현재 구조는 단일 관리자 기준이지만 다중 수신자로 확장 가능합니다.</p>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.cardLabel}>준비된 알림 잡</span>
            <strong className={styles.summaryValue}>{snapshot.jobCount}</strong>
            <p className={styles.cardCopy}>당일 오전 10시 발송을 위해 준비된 분석 메일 작업입니다.</p>
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
            subscriptionEnd: ipo.subscriptionEnd.toISOString(),
            offerPrice: ipo.offerPrice,
            listingOpenPrice: ipo.listingOpenPrice,
            listingOpenReturnRate: ipo.listingOpenReturnRate,
            publicScore: ipo.publicScore
              ? {
                  totalScore: ipo.publicScore.totalScore,
                  status: ipo.publicScore.status,
                  coverageStatus: ipo.publicScore.coverageStatus,
                }
              : null,
          }))}
          monthDays={monthDays.map((day) => day.toISOString())}
        />
      </div>
    </main>
  );
}
