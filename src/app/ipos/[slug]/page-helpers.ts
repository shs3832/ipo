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
import {
  getLeadManagerDisplay,
  getMarketDisplay,
  getRefundDateDisplay,
  getUsableListingDate,
  ipoUnavailableLabel,
} from "@/lib/ipo-schedule";
import {
  getIpoPriceDisplay,
  getMinimumDepositAmount as getConfirmedMinimumDepositAmount,
  getMinimumDepositDisplay,
} from "@/lib/ipo-price";
import type { PublicIpoDetailRecord, PublicIpoScoreRecord } from "@/lib/types";

export const unavailableLabel = ipoUnavailableLabel;

export type IpoDetailFact = {
  label: string;
  value: string | null;
  emphasis?: boolean;
};

export type IpoDetailViewModel = {
  marketLabel: string;
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
  contextFacts: IpoDetailFact[];
  additionalFacts: IpoDetailFact[];
  hasCoreDataGap: boolean;
};

export const getMinimumDepositAmount = ({
  offerPrice,
  minimumSubscriptionShares,
  depositRate,
}: {
  offerPrice: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
}) => getConfirmedMinimumDepositAmount({ offerPrice, minimumSubscriptionShares, depositRate });

const formatDateRangeSummary = (start: Date | null, end: Date | null) => {
  if (start && end) {
    return `${formatDate(start)} ~ ${formatDate(end)}`;
  }

  return null;
};

const formatPriceBandSummary = (low: number | null, high: number | null) => {
  if (low != null && high != null) {
    return `${formatMoney(low)} ~ ${formatMoney(high)}`;
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

const formatCompetitionRate = (value: number | null | undefined) => {
  if (value == null || value < 0) {
    return null;
  }

  return `${value.toLocaleString("ko-KR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}:1`;
};

const formatShareCount = (value: number | null | undefined) => (
  value != null && value > 0 ? `${value.toLocaleString("ko-KR")}주` : null
);

const formatOfferingComposition = ({
  totalOfferedShares,
  newShares,
  secondaryShares,
}: Pick<PublicIpoDetailRecord, "totalOfferedShares" | "newShares" | "secondaryShares">) => {
  if (totalOfferedShares == null || totalOfferedShares <= 0) {
    return null;
  }

  const resolvedNewShares = newShares
    ?? (secondaryShares != null ? totalOfferedShares - secondaryShares : null);
  const resolvedSecondaryShares = secondaryShares
    ?? (resolvedNewShares != null ? totalOfferedShares - resolvedNewShares : null);

  if (
    resolvedNewShares == null
    || resolvedSecondaryShares == null
    || resolvedNewShares < 0
    || resolvedSecondaryShares < 0
    || Math.abs(resolvedNewShares + resolvedSecondaryShares - totalOfferedShares) > 1
  ) {
    return null;
  }

  const formatCompositionRatio = (shares: number) => `${((shares / totalOfferedShares) * 100).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;

  return `신주 ${formatCompositionRatio(resolvedNewShares)} · 구주 ${formatCompositionRatio(resolvedSecondaryShares)}`;
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
  const listingDate = getUsableListingDate({
    listingDate: ipo.listingDate,
    subscriptionEnd: ipo.subscriptionEnd,
  });
  const isListedYet = listingDate ? kstDateKey(listingDate) < todayKey : false;
  const priceDisplay = getIpoPriceDisplay(ipo);
  const minimumDepositDisplay = getMinimumDepositDisplay(ipo);
  const refundDateDisplay = getRefundDateDisplay({
    refundDate: ipo.refundDate,
    status: ipo.status,
  });
  const marketDisplay = getMarketDisplay(ipo.market);
  const leadManagerDisplay = getLeadManagerDisplay({
    leadManager: ipo.leadManager,
    coManagers: ipo.coManagers,
  });
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
  const minimumSubscriptionSharesDisplay = ipo.minimumSubscriptionShares != null
    ? `${ipo.minimumSubscriptionShares.toLocaleString("ko-KR")}주`
    : null;
  const subscriptionPeriodDisplay = formatDateRangeSummary(ipo.subscriptionStart, ipo.subscriptionEnd);
  const hasCoreDataGap = (
    priceDisplay.value == null
    || minimumDepositDisplay.value == null
    || minimumSubscriptionSharesDisplay == null
    || ipo.refundDate == null
  );
  const additionalFacts = [
    {
      label: isListedYet ? "상장일" : "상장 예정일",
      value: listingDate ? formatDate(listingDate) : null,
    },
    {
      label: "희망 공모가",
      value: ipo.offerPrice != null ? formatPriceBandSummary(ipo.priceBandLow, ipo.priceBandHigh) : null,
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
      label: "기관 경쟁률",
      value: formatCompetitionRate(ipo.demandCompetitionRate),
    },
    {
      label: "의무보유확약률",
      value: formatRatioPercent(ipo.lockupRate),
    },
    {
      label: "총 공모주식수",
      value: formatShareCount(ipo.totalOfferedShares),
    },
    {
      label: "신주·구주 비중",
      value: formatOfferingComposition(ipo),
    },
    {
      label: "유통가능물량",
      value: formatRatioPercent(ipo.floatRatio),
    },
    {
      label: "유통가능주식수",
      value: ipo.tradableShares != null ? `${ipo.tradableShares.toLocaleString("ko-KR")}주` : null,
    },
    {
      label: "수요예측 일정",
      value: formatDateRangeSummary(ipo.demandForecastStart, ipo.demandForecastEnd),
    },
    {
      label: "IR 일정",
      value: formatDateRangeSummary(ipo.irStart, ipo.irEnd),
    },
    ...(
      isListedYet
        ? [
            {
              label: "상장일 시초가",
              value: ipo.listingOpenPrice != null ? formatMoney(ipo.listingOpenPrice) : null,
            },
            {
              label: "공모가 대비 수익률",
              value: ipo.listingOpenReturnRate != null ? formatSignedPercentValue(ipo.listingOpenReturnRate) : null,
            },
          ]
        : []
    ),
  ].filter((fact) => fact.value != null);

  return {
    marketLabel: marketDisplay.value,
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
    hasCoreDataGap,
    quickFacts: [
      {
        label: priceDisplay.label,
        value: priceDisplay.value,
      },
      {
        label: minimumDepositDisplay.label,
        value: minimumDepositDisplay.value,
        emphasis: true,
      },
      {
        label: "최소청약주수",
        value: minimumSubscriptionSharesDisplay,
      },
      {
        label: "환불일",
        value: refundDateDisplay.value,
      },
    ],
    contextFacts: [
      {
        label: "청약 기간",
        value: subscriptionPeriodDisplay,
      },
      {
        label: "주관사",
        value: leadManagerDisplay.value,
      },
    ],
    additionalFacts,
  };
};
