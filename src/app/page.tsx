import Link from "next/link";

import { formatDate, formatDateTime, getMonthDays, kstDateKey } from "@/lib/date";
import { HomeContent } from "@/app/home-content";
import { PullToRefresh } from "@/app/pull-to-refresh";
import { getCachedHomeSnapshot } from "@/lib/page-data";
import { getUsableListingDate } from "@/lib/ipo-schedule";
import styles from "@/app/page.module.scss";

export const revalidate = 300;

type EventType = "SUBSCRIPTION" | "REFUND" | "LISTING";

export default async function Home() {
  const snapshot = await getCachedHomeSnapshot();
  const monthDays = getMonthDays(snapshot.calendarMonth);
  const currentMonthKey = formatDate(snapshot.calendarMonth, "yyyy-MM");
  const eventsByDate = new Map<string, { title: string; slug: string; type: EventType }[]>();
  let eventCount = 0;

  snapshot.ipos.forEach((ipo) => {
    ipo.events.forEach((event) => {
      if (
        event.type === "LISTING"
        && !getUsableListingDate({
          listingDate: event.eventDate,
          subscriptionEnd: ipo.subscriptionEnd,
        })
      ) {
        return;
      }

      const key = kstDateKey(event.eventDate);
      const list = eventsByDate.get(key) ?? [];
      list.push({
        title: ipo.name,
        slug: ipo.slug,
        type: event.type,
      });
      eventsByDate.set(key, list);
      eventCount += 1;
    });
  });

  return (
    <main className="page-shell">
      <PullToRefresh />
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div className={styles.heroBody}>
              <p className="page-eyebrow">IPO Calendar Alerts</p>
              <h1 className="page-title">다가오는 공모주 일정을 빠르게 확인하세요.</h1>
              <p className="page-copy">
                청약 마감, 환불, 상장 일정을 한눈에 보고 마감일 오전 10시 분석 알림으로 이어집니다.
              </p>
            </div>

            <div className={styles.heroActionGroup}>
              <a className={`button-primary ${styles.heroDesktopAction}`} href="#calendar-panel">
                캘린더 보기
              </a>
              <a className={`button-primary ${styles.heroMobileAction}`} href="#tracked-ipos">
                가까운 일정 보기
              </a>
              <Link className={styles.adminLink} href="/admin">
                관리자
              </Link>
            </div>
          </div>

          <dl className={styles.statusStrip} aria-label="공모주 일정 현황">
            <div>
              <dt>최근 갱신</dt>
              <dd>{formatDateTime(snapshot.generatedAt, "MM.dd HH:mm")}</dd>
            </div>
            <div>
              <dt>표시 범위</dt>
              <dd>{formatDate(snapshot.calendarMonth, "MM월")} + 다음 달</dd>
            </div>
            <div>
              <dt>추적 종목</dt>
              <dd>{snapshot.ipos.length}개</dd>
            </div>
            <div>
              <dt>전체 일정</dt>
              <dd>{eventCount}개</dd>
            </div>
            <div className={styles.timezoneItem}>
              <dt>기준</dt>
              <dd>Asia/Seoul</dd>
            </div>
          </dl>
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
            subscriptionStart: ipo.subscriptionStart.toISOString(),
            subscriptionEnd: ipo.subscriptionEnd.toISOString(),
            listingDate: ipo.listingDate?.toISOString() ?? null,
            priceBandLow: ipo.priceBandLow,
            priceBandHigh: ipo.priceBandHigh,
            offerPrice: ipo.offerPrice,
            minimumSubscriptionShares: ipo.minimumSubscriptionShares,
            depositRate: ipo.depositRate,
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
