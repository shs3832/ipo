import Link from "next/link";
import { notFound } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/date";
import { getIpoAdminMetadataBySlug } from "@/lib/jobs";
import { getCachedIpoDetail } from "@/lib/page-data";
import styles from "@/app/ipos/[slug]/page.module.scss";

export const dynamic = "force-dynamic";

const getMinimumDepositAmount = ({
  offerPrice,
  minimumSubscriptionShares,
  depositRate,
}: {
  offerPrice: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
}) => {
  if (offerPrice == null || minimumSubscriptionShares == null || depositRate == null) {
    return null;
  }

  return Math.round(offerPrice * minimumSubscriptionShares * depositRate);
};

const eventLabel = {
  SUBSCRIPTION: "청약마감",
  REFUND: "환불",
  LISTING: "상장",
};

export default async function IpoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const isAdmin = await isAdminAuthenticated();
  const ipo = await getCachedIpoDetail(slug);

  if (!ipo) {
    notFound();
  }

  const adminMetadata = isAdmin ? await getIpoAdminMetadataBySlug(slug) : null;

  return (
    <main className="page-shell">
      <div className={styles.page}>
        <Link className="inline-link" href="/">
          캘린더로 돌아가기
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroBody}>
            <p className="page-eyebrow">{ipo.market}</p>
            <h1 className="page-title">{ipo.name}</h1>
            <p className="page-copy">
              {ipo.leadManager}
              {ipo.coManagers.length ? ` / 공동주관 ${ipo.coManagers.join(", ")}` : ""}
            </p>
            <div className={styles.metaRow}>
              <span className="status-pill">청약 마감 {formatDate(ipo.subscriptionEnd)}</span>
              <span className="status-pill status-pill-soft">
                이벤트 {ipo.events.length}건 · 기준 점수 {ipo.latestAnalysis.score}점
              </span>
            </div>
          </div>

          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>현재 점수</span>
            <strong>{ipo.latestAnalysis.score}</strong>
            <span className={styles.scoreRating}>{ipo.latestAnalysis.ratingLabel}</span>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">핵심 일정</h2>
              <p className="section-copy">캘린더와 메일 발송에 직접 영향을 주는 일정을 우선 노출합니다.</p>
            </div>
            <dl className={styles.statList}>
              <div>
                <dt>청약 시작</dt>
                <dd>{formatDate(ipo.subscriptionStart)}</dd>
              </div>
              <div>
                <dt>청약 마감</dt>
                <dd>{formatDate(ipo.subscriptionEnd)}</dd>
              </div>
              <div>
                <dt>환불일</dt>
                <dd>{ipo.refundDate ? formatDate(ipo.refundDate) : "-"}</dd>
              </div>
              <div>
                <dt>상장 예정일</dt>
                <dd>{ipo.listingDate ? formatDate(ipo.listingDate) : "-"}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">가격 정보</h2>
              <p className="section-copy">청약 최소금액까지 한 번에 읽을 수 있게 묶었습니다.</p>
            </div>
            <dl className={styles.statList}>
              <div>
                <dt>희망 공모가</dt>
                <dd>
                  {formatMoney(ipo.priceBandLow)} ~ {formatMoney(ipo.priceBandHigh)}
                </dd>
              </div>
              <div>
                <dt>확정 공모가</dt>
                <dd>{formatMoney(ipo.offerPrice)}</dd>
              </div>
              <div>
                <dt>최소청약주수</dt>
                <dd>{ipo.minimumSubscriptionShares?.toLocaleString("ko-KR") ?? "-"}주</dd>
              </div>
              <div>
                <dt>최소청약금액</dt>
                <dd>{formatMoney(getMinimumDepositAmount(ipo))}</dd>
              </div>
              <div>
                <dt>증거금률</dt>
                <dd>{formatPercent(ipo.depositRate)}</dd>
              </div>
              {isAdmin ? (
                <>
                  <div>
                    <dt>최근 수집 시각</dt>
                    <dd>{adminMetadata ? formatDateTime(adminMetadata.sourceFetchedAt) : "-"}</dd>
                  </div>
                  <div>
                    <dt>소스 키</dt>
                    <dd>{adminMetadata?.latestSourceKey ?? "-"}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">분석 요약</h2>
              <p className="section-copy">현재 스코어가 어떤 근거와 주의사항 위에 놓여 있는지 분리해 보여줍니다.</p>
            </div>
            <p className={styles.analysisSummary}>{ipo.latestAnalysis.summary}</p>
            <div className={styles.analysisColumns}>
              <div className={styles.analysisBlock}>
                <h3>핵심 근거</h3>
                <ul className={styles.bulletList}>
                  {ipo.latestAnalysis.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.analysisBlock}>
                <h3>주의 포인트</h3>
                <ul className={styles.bulletList}>
                  {ipo.latestAnalysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">이벤트 타임라인</h2>
              <p className="section-copy">발생 순서대로 이벤트를 따라가며 전체 일정을 빠르게 파악합니다.</p>
            </div>
            <div className={styles.timeline}>
              {ipo.events.map((event) => (
                <div className={styles.timelineItem} key={event.id}>
                  <span className={styles.timelineTag}>{eventLabel[event.type]}</span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{formatDate(event.eventDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
