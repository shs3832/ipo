import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BrokerChipList } from "@/components/broker-chip";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatSignedPercentValue,
  getKstTodayKey,
  kstDateKey,
} from "@/lib/date";
import { getIpoAdminMetadataBySlug } from "@/lib/jobs";
import { getCachedIpoDetail } from "@/lib/page-data";
import styles from "@/app/ipos/[slug]/page.module.scss";

export const dynamic = "force-dynamic";

const unavailableLabel = "데이터 미확보";
const pendingListingLabel = "상장 후 반영";

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
  SUBSCRIPTION: "청약",
  REFUND: "환불",
  LISTING: "상장",
};

const renderValue = (value: string | null | undefined, className?: string) =>
  value ? value : <span className={className}>{unavailableLabel}</span>;

const renderDateValue = (date: Date | null, className?: string) =>
  date ? formatDate(date) : <span className={className}>{unavailableLabel}</span>;

const renderDateRangeValue = (
  start: Date | null,
  end: Date | null,
  className?: string,
): ReactNode => {
  if (start && end) {
    return `${formatDate(start)} ~ ${formatDate(end)}`;
  }

  if (start) {
    return `${formatDate(start)} ~ ${unavailableLabel}`;
  }

  if (end) {
    return `${unavailableLabel} ~ ${formatDate(end)}`;
  }

  return <span className={className}>{unavailableLabel}</span>;
};

const renderPriceBandValue = (
  low: number | null,
  high: number | null,
  className?: string,
) => {
  if (low != null && high != null) {
    return `${formatMoney(low)} ~ ${formatMoney(high)}`;
  }

  if (low != null) {
    return `${formatMoney(low)} ~ ${unavailableLabel}`;
  }

  if (high != null) {
    return `${unavailableLabel} ~ ${formatMoney(high)}`;
  }

  return <span className={className}>{unavailableLabel}</span>;
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
  const isListedYet = ipo.listingDate ? kstDateKey(ipo.listingDate) < getKstTodayKey() : false;
  const listingOpenValue = ipo.listingOpenPrice != null
    ? formatMoney(ipo.listingOpenPrice)
    : (
        <span className={styles.unavailableValue}>
          {isListedYet ? unavailableLabel : pendingListingLabel}
        </span>
      );
  const listingReturnValue = ipo.listingOpenReturnRate != null
    ? formatSignedPercentValue(ipo.listingOpenReturnRate)
    : (
        <span className={styles.unavailableValue}>
          {isListedYet ? unavailableLabel : pendingListingLabel}
        </span>
      );

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
            <BrokerChipList className={styles.heroBrokerList} names={[ipo.leadManager, ...ipo.coManagers]} />
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
                <dd>{renderDateValue(ipo.refundDate, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>상장 예정일</dt>
                <dd>{renderDateValue(ipo.listingDate, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>수요예측 일정</dt>
                <dd>{renderDateRangeValue(ipo.demandForecastStart, ipo.demandForecastEnd, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>IR 일정</dt>
                <dd>{renderDateRangeValue(ipo.irStart, ipo.irEnd, styles.unavailableValue)}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">공모 정보</h2>
              <p className="section-copy">공모가, 경쟁률, 유통가능물량까지 한 번에 읽을 수 있게 묶었습니다.</p>
            </div>
            <dl className={styles.statList}>
              <div>
                <dt>희망 공모가</dt>
                <dd>{renderPriceBandValue(ipo.priceBandLow, ipo.priceBandHigh, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>확정 공모가</dt>
                <dd>{renderValue(ipo.offerPrice != null ? formatMoney(ipo.offerPrice) : null, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>상장일 시초가</dt>
                <dd>{listingOpenValue}</dd>
              </div>
              <div>
                <dt>공모가 대비 수익률</dt>
                <dd>{listingReturnValue}</dd>
              </div>
              <div>
                <dt>최소청약주수</dt>
                <dd>
                  {renderValue(
                    ipo.minimumSubscriptionShares != null
                      ? `${ipo.minimumSubscriptionShares.toLocaleString("ko-KR")}주`
                      : null,
                    styles.unavailableValue,
                  )}
                </dd>
              </div>
              <div>
                <dt>최소청약금액</dt>
                <dd>{renderValue(formatMoney(getMinimumDepositAmount(ipo)) !== "-" ? formatMoney(getMinimumDepositAmount(ipo)) : null, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>증거금률</dt>
                <dd>{renderValue(formatPercent(ipo.depositRate) !== "-" ? formatPercent(ipo.depositRate) : null, styles.unavailableValue)}</dd>
              </div>
              <div>
                <dt>일반청약 경쟁률</dt>
                <dd>
                  {renderValue(
                    ipo.generalSubscriptionCompetitionRate != null
                      ? `${ipo.generalSubscriptionCompetitionRate.toLocaleString("ko-KR")}:1`
                      : null,
                    styles.unavailableValue,
                  )}
                </dd>
              </div>
              <div>
                <dt>유통가능주식수</dt>
                <dd>
                  {renderValue(
                    ipo.tradableShares != null
                      ? `${ipo.tradableShares.toLocaleString("ko-KR")}주`
                      : null,
                    styles.unavailableValue,
                  )}
                </dd>
              </div>
              <div>
                <dt>유통가능물량</dt>
                <dd>{renderValue(formatPercent(ipo.floatRatio) !== "-" ? formatPercent(ipo.floatRatio) : null, styles.unavailableValue)}</dd>
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
