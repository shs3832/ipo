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
import { assessIpoDataQuality } from "@/lib/ipo-data-quality";
import { getIpoAdminMetadataBySlug } from "@/lib/jobs";
import { getCachedIpoDetail } from "@/lib/page-data";
import type { PublicIpoScoreRecord } from "@/lib/types";
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

const formatScoreValue = (value: number | null, withUnit = true) =>
  value == null ? null : `${value.toFixed(1)}${withUnit ? "점" : ""}`;

const formatAdjustmentScoreValue = (value: number | null) =>
  value == null ? unavailableLabel : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

const getPublicScoreStatusLabel = (score: PublicIpoScoreRecord | null) => {
  if (!score || score.status === "UNAVAILABLE" || score.status === "NOT_READY") {
    return "점수 준비 중";
  }

  if (score.status === "PARTIAL") {
    return "부분 산출";
  }

  if (score.status === "STALE") {
    return "재점검 중";
  }

  return score.coverageStatus === "SUFFICIENT" ? "점수 공개" : "보강 반영";
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
  const minimumDepositAmount = getMinimumDepositAmount(ipo);
  const dataQuality = assessIpoDataQuality(ipo);
  const publicScore = ipo.publicScore;
  const analysisSummary = publicScore?.totalScore != null
    ? `종합점수 ${formatScoreValue(publicScore.totalScore)}는 유통, 확약, 경쟁, 마켓 분석에 재무 보정을 더해 계산한 현재 기준 값입니다.`
    : publicScore?.explanations[0]
      ?? "현재는 확보된 공시와 청약 데이터를 바탕으로 종목 점수를 계산하고 있습니다.";
  const keyPoints = publicScore?.explanations.length
    ? publicScore.explanations
    : ipo.latestAnalysis.keyPoints.length
      ? ipo.latestAnalysis.keyPoints
      : ["핵심 지표는 계속 보강 중이며, 현재는 확인된 공시 사실 위주로 요약합니다."];
  const warnings = publicScore?.warnings.length
    ? publicScore.warnings
    : ipo.latestAnalysis.warnings.length
      ? ipo.latestAnalysis.warnings
      : ["최종 청약 결정 전 증권신고서와 주관사 공고를 함께 확인해 주세요."];
  const scoreBreakdown = [
    {
      label: "유통",
      value: formatScoreValue(publicScore?.supplyScore ?? null),
    },
    {
      label: "확약",
      value: formatScoreValue(publicScore?.lockupScore ?? null),
    },
    {
      label: "경쟁",
      value: formatScoreValue(publicScore?.competitionScore ?? null),
    },
    {
      label: "마켓",
      value: formatScoreValue(publicScore?.marketScore ?? null),
    },
  ];
  const scoreHelpText = publicScore?.totalScore != null
    ? `재무 보정 ${formatAdjustmentScoreValue(publicScore.financialAdjustmentScore)}가 현재 종합점수에 반영돼 있습니다.`
    : publicScore?.explanations[1]
      ?? "핵심 공급, 확약, 청약 데이터를 더 확보하면 종합점수가 계산됩니다.";
  const scoreDisclaimer = publicScore?.calculatedAt
    ? `${formatDateTime(publicScore.calculatedAt)} 기준 재계산된 점수입니다. 정정 공시나 일정 변경이 생기면 다시 산출합니다.`
    : "점수는 매일 최소 1회 재계산되며, 정정 공시나 일정 변경이 생기면 다시 산출합니다.";
  const scoreMetaLabel = publicScore?.totalScore != null
    ? `종합점수 ${formatScoreValue(publicScore.totalScore)}`
    : getPublicScoreStatusLabel(publicScore);
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
      label: "데이터 상태",
      value: dataQuality.label,
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
              <span className="status-pill status-pill-soft">데이터 {dataQuality.label}</span>
              <span className="status-pill status-pill-soft">{scoreMetaLabel}</span>
            </div>
          </div>

          <div className={styles.scoreCard}>
            <span className={styles.scoreLabel}>종합 점수</span>
            {publicScore?.totalScore != null ? (
              <strong>{formatScoreValue(publicScore.totalScore, false)}</strong>
            ) : (
              <strong className={styles.scoreValueMuted}>산출 대기</strong>
            )}
            <span className={styles.scoreRating}>{getPublicScoreStatusLabel(publicScore)}</span>
            <div className={styles.scoreBreakdownGrid}>
              {scoreBreakdown.map((item) => (
                <div className={styles.scoreBreakdownItem} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value ?? unavailableLabel}</strong>
                </div>
              ))}
            </div>
            <p className={styles.scoreHelpText}>{scoreHelpText}</p>
            <p className={styles.scoreDisclaimer}>{scoreDisclaimer}</p>
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
              <h2 className="section-title">공시 기반 체크 포인트</h2>
              <p className="section-copy">종합점수를 만든 핵심 근거와 주의 포인트를 함께 정리했습니다.</p>
            </div>
            <p className={styles.analysisSummary}>{analysisSummary}</p>
            <p className={styles.analysisDisclaimer}>세부 숫자는 아래 항목과 증권신고서 원문을 함께 확인해 주세요.</p>
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
