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

const renderRatioPercent = (value: number | null | undefined) => {
  if (value == null) {
    return null;
  }

  return `${value.toLocaleString("ko-KR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
};

const renderNumericValue = (
  value: string | null,
  emphasis = false,
) => (
  value
    ? <span className={emphasis ? styles.primaryValue : undefined}>{value}</span>
    : <span className={styles.unavailableValue}>{unavailableLabel}</span>
);

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
  const scoreDisplay = ipo.latestAnalysis.scoreDisplay;
  const visibleScore = scoreDisplay.isVisible;
  const analysisSummary = visibleScore
    ? ipo.latestAnalysis.summary
    : `평가 보류. ${scoreDisplay.helpText}`;
  const keyPoints = ipo.latestAnalysis.keyPoints.length
    ? ipo.latestAnalysis.keyPoints
    : [visibleScore ? "세부 근거 데이터가 추가되면 분석 요약이 더 구체화됩니다." : scoreDisplay.policyNote];
  const warnings = ipo.latestAnalysis.warnings.length
    ? ipo.latestAnalysis.warnings
    : ["최종 청약 결정 전 증권신고서와 주관사 공고를 함께 확인해 주세요."];
  const minimumDepositAmount = getMinimumDepositAmount(ipo);
  const quickFacts = [
    {
      label: "확정 공모가",
      value: ipo.offerPrice != null ? formatMoney(ipo.offerPrice) : null,
      emphasis: true,
    },
    {
      label: "최소청약금액",
      value: minimumDepositAmount != null ? formatMoney(minimumDepositAmount) : null,
      emphasis: true,
    },
    {
      label: "환불일",
      value: ipo.refundDate ? formatDate(ipo.refundDate) : null,
    },
    {
      label: "상장 예정일",
      value: ipo.listingDate ? formatDate(ipo.listingDate) : null,
    },
    {
      label: "유통가능물량",
      value: renderRatioPercent(ipo.floatRatio),
    },
    {
      label: "주관사",
      value: ipo.coManagers.length ? `${ipo.leadManager} / ${ipo.coManagers.join(", ")}` : ipo.leadManager,
    },
  ];
  const detailFacts = [
    {
      label: "희망 공모가",
      value: renderPriceBandValue(ipo.priceBandLow, ipo.priceBandHigh, styles.unavailableValue),
    },
    {
      label: "최소청약주수",
      value: ipo.minimumSubscriptionShares != null ? `${ipo.minimumSubscriptionShares.toLocaleString("ko-KR")}주` : null,
    },
    {
      label: "증거금률",
      value: formatPercent(ipo.depositRate) !== "-" ? formatPercent(ipo.depositRate) : null,
    },
    {
      label: "일반청약 경쟁률",
      value: ipo.generalSubscriptionCompetitionRate != null
        ? `${ipo.generalSubscriptionCompetitionRate.toLocaleString("ko-KR")}:1`
        : null,
    },
    {
      label: "유통가능주식수",
      value: ipo.tradableShares != null ? `${ipo.tradableShares.toLocaleString("ko-KR")}주` : null,
    },
    {
      label: "청약 기간",
      value: renderDateRangeValue(ipo.subscriptionStart, ipo.subscriptionEnd, styles.unavailableValue),
    },
    {
      label: "수요예측 일정",
      value: renderDateRangeValue(ipo.demandForecastStart, ipo.demandForecastEnd, styles.unavailableValue),
    },
    {
      label: "IR 일정",
      value: renderDateRangeValue(ipo.irStart, ipo.irEnd, styles.unavailableValue),
    },
  ];
  const listingFacts = [
    {
      label: "상장일 시초가",
      value: listingOpenValue,
    },
    {
      label: "공모가 대비 수익률",
      value: listingReturnValue,
    },
  ];

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
                {visibleScore ? `참고 점수 ${ipo.latestAnalysis.score}점` : "평가 보류"}
              </span>
            </div>
          </div>

          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>{visibleScore ? "현재 점수" : "평가 상태"}</span>
            <strong className={visibleScore ? "" : styles.scoreValueMuted}>
              {visibleScore ? ipo.latestAnalysis.score : "평가 보류"}
            </strong>
            <span className={styles.scoreRating}>{visibleScore ? ipo.latestAnalysis.ratingLabel : "데이터 보강 대기"}</span>
            <p className={styles.scoreHelpText}>{scoreDisplay.helpText}</p>
            <p className={styles.scoreDisclaimer}>{scoreDisplay.disclaimer}</p>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">지금 판단용</h2>
              <p className="section-copy">청약 결정을 위해 가장 먼저 확인할 항목만 위로 올렸습니다.</p>
            </div>
            <div className={styles.quickGrid}>
              {quickFacts.map((fact) => (
                <div className={styles.quickItem} key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{renderNumericValue(fact.value, fact.emphasis)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">분석 요약</h2>
              <p className="section-copy">핵심 근거와 주의 포인트를 먼저 보고, 세부 숫자는 아래에서 확인합니다.</p>
            </div>
            <p className={styles.analysisSummary}>{analysisSummary}</p>
            <p className={styles.analysisDisclaimer}>{scoreDisplay.policyNote}</p>
            <div className={styles.analysisColumns}>
              <div className={styles.analysisBlock}>
                <h3>핵심 근거</h3>
                <ul className={styles.bulletList}>
                  {keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.analysisBlock}>
                <h3>주의 포인트</h3>
                <ul className={styles.bulletList}>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">청약 일정</h2>
              <p className="section-copy">핵심 일정은 간단하게, 일정 범위형 데이터는 여기서 확인합니다.</p>
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
            </dl>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className="section-title">상세 데이터</h2>
              <p className="section-copy">판단에 직접 쓰이지 않는 보조 수치는 아래로 정리했습니다.</p>
            </div>
            <dl className={styles.statList}>
              {detailFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{typeof fact.value === "string" ? renderValue(fact.value, styles.unavailableValue) : fact.value}</dd>
                </div>
              ))}
              {isListedYet ? listingFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              )) : null}
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
        </section>
      </div>
    </main>
  );
}
