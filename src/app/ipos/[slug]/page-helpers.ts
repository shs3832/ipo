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
import type { PublicIpoDetailRecord, PublicIpoScoreRecord } from "@/lib/types";

export const unavailableLabel = "데이터 미확보";

export type IpoDetailFact = {
  label: string;
  value: string | null;
  emphasis?: boolean;
};

export type IpoDetailViewModel = {
  dataQualityLabel: string;
  isListedYet: boolean;
  analysisSummary: string;
  keyPoints: string[];
  warnings: string[];
  scoreMetaLabel: string;
  scoreStatusLabel: string;
  scoreReasons: string[];
  scoreBreakdown: Array<{ label: string; value: string | null }>;
  scoreHelpText: string;
  scoreDisclaimer: string;
  quickFacts: IpoDetailFact[];
  scheduleFacts: IpoDetailFact[];
  detailFacts: IpoDetailFact[];
  listingFacts: IpoDetailFact[];
};

export const getMinimumDepositAmount = ({
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

const formatDateRangeSummary = (start: Date | null, end: Date | null) => {
  if (start && end) {
    return `${formatDate(start)} ~ ${formatDate(end)}`;
  }

  if (start) {
    return `${formatDate(start)} ~ ${unavailableLabel}`;
  }

  if (end) {
    return `${unavailableLabel} ~ ${formatDate(end)}`;
  }

  return null;
};

const formatPriceBandSummary = (low: number | null, high: number | null) => {
  if (low != null && high != null) {
    return `${formatMoney(low)} ~ ${formatMoney(high)}`;
  }

  if (low != null) {
    return `${formatMoney(low)} ~ ${unavailableLabel}`;
  }

  if (high != null) {
    return `${unavailableLabel} ~ ${formatMoney(high)}`;
  }

  return null;
};

const formatRatioPercent = (value: number | null | undefined) => {
  if (value == null) {
    return null;
  }

  return `${value.toLocaleString("ko-KR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
};

const formatScoreValue = (value: number | null, withUnit = true) =>
  value == null ? null : `${value.toFixed(1)}${withUnit ? "점" : ""}`;

const formatAdjustmentScoreValue = (value: number | null) =>
  value == null ? unavailableLabel : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

export const getPublicScoreStatusLabel = (score: PublicIpoScoreRecord | null) => {
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

export const buildIpoDetailViewModel = (
  ipo: PublicIpoDetailRecord,
  todayKey = getKstTodayKey(),
): IpoDetailViewModel => {
  const isListedYet = ipo.listingDate ? kstDateKey(ipo.listingDate) < todayKey : false;
  const minimumDepositAmount = getMinimumDepositAmount(ipo);
  const dataQuality = assessIpoDataQuality(ipo);
  const publicScore = ipo.publicScore;
  const analysisSummary = ipo.latestAnalysis.keyPoints[0]
    ?? "현재는 확보된 공시와 청약 데이터를 바탕으로 체크 포인트를 정리하고 있습니다.";
  const keyPoints = ipo.latestAnalysis.keyPoints.length
    ? ipo.latestAnalysis.keyPoints
    : ["핵심 지표는 계속 보강 중이며, 현재는 확인된 공시 사실 위주로 요약합니다."];
  const warnings = ipo.latestAnalysis.warnings.length
    ? ipo.latestAnalysis.warnings
    : ["최종 청약 결정 전 증권신고서와 주관사 공고를 함께 확인해 주세요."];
  const scoreReasons = (
    publicScore?.explanations.length
      ? publicScore.explanations
      : ipo.latestAnalysis.keyPoints.length
        ? ipo.latestAnalysis.keyPoints
        : ["현재 확보된 공시와 청약 데이터를 기준으로 핵심 포인트를 정리하고 있습니다."]
  ).slice(0, 3);
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
      ?? "정량 점수는 현재 비공개 상태이며, 공개 여부는 추후 다시 판단합니다.";
  const scoreDisclaimer = publicScore?.calculatedAt
    ? `${formatDateTime(publicScore.calculatedAt)} 기준 재계산된 점수입니다. 정정 공시나 일정 변경이 생기면 다시 산출합니다.`
    : "정량 점수는 현재 공개하지 않고, 공시 기반 체크 포인트 중심으로 안내합니다.";
  const scoreMetaLabel = publicScore?.totalScore != null
    ? `종합점수 ${formatScoreValue(publicScore.totalScore)}`
    : "정량 점수 비공개";

  return {
    dataQualityLabel: dataQuality.label,
    isListedYet,
    analysisSummary,
    keyPoints,
    warnings,
    scoreMetaLabel,
    scoreStatusLabel: getPublicScoreStatusLabel(publicScore),
    scoreReasons,
    scoreBreakdown,
    scoreHelpText,
    scoreDisclaimer,
    quickFacts: [
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
        value: formatRatioPercent(ipo.floatRatio),
      },
      {
        label: "주관사",
        value: ipo.coManagers.length ? `${ipo.leadManager} / ${ipo.coManagers.join(", ")}` : ipo.leadManager,
      },
    ],
    scheduleFacts: [
      {
        label: "청약 시작",
        value: formatDate(ipo.subscriptionStart),
      },
      {
        label: "청약 마감",
        value: formatDate(ipo.subscriptionEnd),
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
        label: "수요예측 일정",
        value: formatDateRangeSummary(ipo.demandForecastStart, ipo.demandForecastEnd),
      },
    ],
    detailFacts: [
      {
        label: "희망 공모가",
        value: formatPriceBandSummary(ipo.priceBandLow, ipo.priceBandHigh),
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
        value: formatDateRangeSummary(ipo.subscriptionStart, ipo.subscriptionEnd),
      },
      {
        label: "수요예측 일정",
        value: formatDateRangeSummary(ipo.demandForecastStart, ipo.demandForecastEnd),
      },
      {
        label: "IR 일정",
        value: formatDateRangeSummary(ipo.irStart, ipo.irEnd),
      },
    ],
    listingFacts: [
      {
        label: "상장일 시초가",
        value: ipo.listingOpenPrice != null ? formatMoney(ipo.listingOpenPrice) : null,
      },
      {
        label: "공모가 대비 수익률",
        value: ipo.listingOpenReturnRate != null ? formatSignedPercentValue(ipo.listingOpenReturnRate) : null,
      },
    ],
  };
};
