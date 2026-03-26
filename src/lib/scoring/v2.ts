import type {
  ScoreComponentResult,
  ScoreCoverageStatus,
  ScoreSnapshotStatus,
  V2DemandFact,
  V2ScoreContext,
  V2ScoreSnapshot,
  V2SubscriptionFact,
} from "@/lib/scoring/types";
import {
  calculateFinancialAdjustment,
  calculateLockupScore,
  calculateSupplyScore,
  clamp,
  createMissingComponent,
  round,
  toChecksum,
  unique,
} from "@/lib/scoring/v1";

const V2_COMPONENT_WEIGHTS = {
  supply: 0.35,
  lockup: 0.25,
  competition: 0.4,
  market: 0,
} as const;
const V2_SCORE_VERSION = "v2.4" as const;

const getMedian = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middleIndex] ?? null;
  }

  const left = sorted[middleIndex - 1];
  const right = sorted[middleIndex];

  if (left == null || right == null) {
    return null;
  }

  return (left + right) / 2;
};

const calculateCompetitionScore = (
  demand: V2DemandFact | null,
  subscriptions: V2SubscriptionFact[],
): ScoreComponentResult => {
  const meaningfulSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.generalCompetitionRate != null
      || subscription.allocatedShares != null
      || subscription.equalAllocatedShares != null
      || subscription.proportionalAllocatedShares != null
      || subscription.minimumSubscriptionShares != null
      || subscription.maximumSubscriptionShares != null
      || subscription.depositRate != null
      || subscription.subscriptionFee != null,
  );

  if (
    !demand
    && meaningfulSubscriptions.length === 0
  ) {
    return createMissingComponent("competition", "경쟁 분석에 필요한 기관·청약 경쟁률 데이터가 아직 부족합니다.");
  }

  let score = 50;
  let coreSignalCount = 0;
  let signalCount = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const evidence: ScoreComponentResult["evidence"] = [];

  if (demand?.institutionalCompetitionRate != null) {
    coreSignalCount += 1;
    signalCount += 1;
    evidence.push({
      field: "institutionalCompetitionRate",
      label: "기관 수요예측 경쟁률",
      value: demand.institutionalCompetitionRate,
      source: demand.source,
    });

    if (demand.institutionalCompetitionRate >= 1500) {
      score += 26;
      reasons.push("기관 수요예측 경쟁률이 매우 높아 초기 수요 강도가 강하게 확인됩니다.");
    } else if (demand.institutionalCompetitionRate >= 1000) {
      score += 22;
      reasons.push("기관 수요예측 경쟁률이 높아 수요예측 분위기가 우호적입니다.");
    } else if (demand.institutionalCompetitionRate >= 500) {
      score += 14;
      reasons.push("기관 수요예측 경쟁률이 양호해 경쟁 분석에 플러스 요인입니다.");
    } else if (demand.institutionalCompetitionRate < 50) {
      score -= 22;
      warnings.push("기관 수요예측 경쟁률이 매우 낮아 밴드 수요 강도를 보수적으로 봐야 합니다.");
    } else if (demand.institutionalCompetitionRate < 100) {
      score -= 14;
      warnings.push("기관 수요예측 경쟁률이 낮아 기관 수요 열기가 강하다고 보긴 어렵습니다.");
    } else if (demand.institutionalCompetitionRate < 200) {
      score -= 7;
      warnings.push("기관 수요예측 경쟁률이 평이해 경쟁 과열 구간은 아닙니다.");
    }
  }

  if (demand?.priceBandTopAcceptanceRatio != null) {
    signalCount += 1;
    evidence.push({
      field: "priceBandTopAcceptanceRatio",
      label: "밴드 상단 이상 수용 비율",
      value: demand.priceBandTopAcceptanceRatio,
      source: demand.source,
    });

    if (demand.priceBandTopAcceptanceRatio >= 75) {
      score += 8;
      reasons.push("기관 주문이 밴드 상단 이상에 집중돼 가격 수용도가 높습니다.");
    } else if (demand.priceBandTopAcceptanceRatio < 40) {
      score -= 8;
      warnings.push("밴드 상단 이상 수용 비율이 낮아 가격 수용 강도가 약합니다.");
    }
  }

  if (demand?.priceBandExceedRatio != null) {
    signalCount += 1;
    evidence.push({
      field: "priceBandExceedRatio",
      label: "밴드 초과 비율",
      value: demand.priceBandExceedRatio,
      source: demand.source,
    });

    if (demand.priceBandExceedRatio >= 15) {
      score += 6;
      reasons.push("밴드 초과 주문 비율이 높아 기관 투자심리가 강합니다.");
    } else if (demand.priceBandExceedRatio <= 1) {
      score -= 4;
      warnings.push("밴드 초과 주문이 거의 없어 공격적 수요는 제한적으로 보입니다.");
    }
  }

  const generalCompetitionRates = meaningfulSubscriptions
    .map((subscription) => subscription.generalCompetitionRate)
    .filter((value): value is number => value != null);
  const representativeGeneralCompetitionRate = getMedian(generalCompetitionRates);

  if (representativeGeneralCompetitionRate != null) {
    coreSignalCount += 1;
    signalCount += 1;
    evidence.push({
      field: "generalCompetitionRate",
      label: "일반청약 경쟁률",
      value: representativeGeneralCompetitionRate,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (representativeGeneralCompetitionRate >= 1500) {
      score += 20;
      reasons.push("일반청약 경쟁률도 매우 높아 리테일 수요가 강하게 확인됩니다.");
    } else if (representativeGeneralCompetitionRate >= 800) {
      score += 16;
      reasons.push("일반청약 경쟁률이 높아 청약 참여 열기가 강한 편입니다.");
    } else if (representativeGeneralCompetitionRate >= 300) {
      score += 10;
      reasons.push("일반청약 경쟁률이 양호해 경쟁 분석에 우호적입니다.");
    } else if (representativeGeneralCompetitionRate < 20) {
      score -= 20;
      warnings.push("일반청약 경쟁률이 매우 낮아 리테일 수요가 약합니다.");
    } else if (representativeGeneralCompetitionRate < 50) {
      score -= 12;
      warnings.push("일반청약 경쟁률이 낮아 흥행 강도가 크지 않습니다.");
    } else if (representativeGeneralCompetitionRate < 100) {
      score -= 6;
      warnings.push("일반청약 경쟁률이 평이해 단기 과열 기대는 제한적입니다.");
    }
  }

  if (meaningfulSubscriptions.length > 0) {
    signalCount += 1;
    evidence.push({
      field: "brokerCount",
      label: "청약 가능 증권사 수",
      value: meaningfulSubscriptions.length,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (meaningfulSubscriptions.length >= 3) {
      score += 4;
      reasons.push("청약 창구가 여러 곳이라 리테일 접근성이 좋은 편입니다.");
    }
  }

  const minimumSubscriptionShares = meaningfulSubscriptions
    .map((subscription) => subscription.minimumSubscriptionShares)
    .filter((value): value is number => value != null);
  const bestMinimumSubscriptionShares =
    minimumSubscriptionShares.length > 0 ? Math.min(...minimumSubscriptionShares) : null;

  if (bestMinimumSubscriptionShares != null) {
    signalCount += 1;
    evidence.push({
      field: "minimumSubscriptionShares",
      label: "최소청약주수",
      value: bestMinimumSubscriptionShares,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (bestMinimumSubscriptionShares <= 10) {
      score += 4;
      reasons.push("최소청약주수가 낮아 리테일 참여 진입장벽이 낮습니다.");
    } else if (bestMinimumSubscriptionShares <= 20) {
      score += 2;
      reasons.push("최소청약주수가 무난한 편이라 참여 부담이 크지 않습니다.");
    } else if (bestMinimumSubscriptionShares >= 100) {
      score -= 4;
      warnings.push("최소청약주수가 높아 리테일 참여 문턱이 있습니다.");
    }
  }

  const maximumSubscriptionShares = meaningfulSubscriptions
    .map((subscription) => subscription.maximumSubscriptionShares)
    .filter((value): value is number => value != null);
  const bestMaximumSubscriptionShares =
    maximumSubscriptionShares.length > 0 ? Math.max(...maximumSubscriptionShares) : null;

  if (bestMaximumSubscriptionShares != null) {
    signalCount += 1;
    evidence.push({
      field: "maximumSubscriptionShares",
      label: "최고청약한도",
      value: bestMaximumSubscriptionShares,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (bestMaximumSubscriptionShares >= 30_000) {
      score += 4;
      reasons.push("최고청약한도가 넉넉해 비례 청약 전략을 쓰기 쉬운 편입니다.");
    } else if (bestMaximumSubscriptionShares >= 10_000) {
      score += 2;
      reasons.push("최고청약한도가 무난해 청약 전략 선택 폭이 넓습니다.");
    } else if (bestMaximumSubscriptionShares <= 2_000) {
      score -= 2;
      warnings.push("최고청약한도가 낮아 비례 청약 전략 운용 폭이 제한적입니다.");
    }
  }

  const depositRates = meaningfulSubscriptions
    .map((subscription) => subscription.depositRate)
    .filter((value): value is number => value != null);
  const lowestDepositRate = depositRates.length > 0 ? Math.min(...depositRates) : null;

  if (lowestDepositRate != null) {
    signalCount += 1;
    evidence.push({
      field: "depositRate",
      label: "최저 증거금률",
      value: lowestDepositRate,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (lowestDepositRate <= 0.5) {
      score += 3;
      reasons.push("증거금률이 50% 수준이라 청약 자금 부담이 상대적으로 낮습니다.");
    } else if (lowestDepositRate >= 1) {
      score -= 2;
      warnings.push("증거금률이 100%라 청약 자금 부담이 다소 큽니다.");
    }
  }

  const allocatedShares = meaningfulSubscriptions
    .map((subscription) => subscription.allocatedShares)
    .filter((value): value is number => value != null);
  const totalAllocatedShares =
    allocatedShares.length > 0 ? allocatedShares.reduce((sum, value) => sum + value, 0) : null;

  if (totalAllocatedShares != null) {
    signalCount += 1;
    evidence.push({
      field: "allocatedShares",
      label: "일반청약 배정물량",
      value: totalAllocatedShares,
      source: meaningfulSubscriptions
        .filter((subscription) => subscription.allocatedShares != null)
        .map((subscription) => subscription.source)
        .join(", "),
    });

    if (totalAllocatedShares >= 100_000) {
      score += 3;
      reasons.push("일반청약 배정물량이 커서 리테일 물량 자체는 비교적 넉넉한 편입니다.");
    } else if (totalAllocatedShares >= 50_000) {
      score += 2;
      reasons.push("일반청약 배정물량이 적지 않아 리테일 확보 가능 물량은 무난한 편입니다.");
    } else if (totalAllocatedShares <= 20_000) {
      score -= 2;
      warnings.push("일반청약 배정물량이 적어 체감 가능한 물량은 제한적일 수 있습니다.");
    }
  }

  const equalAllocatedShares = meaningfulSubscriptions
    .map((subscription) => subscription.equalAllocatedShares)
    .filter((value): value is number => value != null);
  const totalEqualAllocatedShares =
    equalAllocatedShares.length > 0 ? equalAllocatedShares.reduce((sum, value) => sum + value, 0) : null;

  if (totalEqualAllocatedShares != null) {
    signalCount += 1;
    evidence.push({
      field: "equalAllocatedShares",
      label: "균등 배정물량",
      value: totalEqualAllocatedShares,
      source: meaningfulSubscriptions
        .filter((subscription) => subscription.equalAllocatedShares != null)
        .map((subscription) => subscription.source)
        .join(", "),
    });

    if (totalEqualAllocatedShares >= 25_000) {
      score += 2;
      reasons.push("균등 배정물량도 확인돼 소액 청약자 몫이 분명합니다.");
    } else if (totalEqualAllocatedShares <= 5_000) {
      score -= 2;
      warnings.push("균등 배정물량이 작아 소액 청약자 체감 배정은 제한적일 수 있습니다.");
    }
  }

  const subscriptionFees = meaningfulSubscriptions
    .map((subscription) => subscription.subscriptionFee)
    .filter((value): value is number => value != null);
  const lowestSubscriptionFee = subscriptionFees.length > 0 ? Math.min(...subscriptionFees) : null;

  if (lowestSubscriptionFee != null) {
    signalCount += 1;
    evidence.push({
      field: "subscriptionFee",
      label: "최저 청약 수수료",
      value: lowestSubscriptionFee,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (lowestSubscriptionFee === 0) {
      score += 3;
      reasons.push("청약 수수료가 면제돼 리테일 참여 비용이 낮습니다.");
    } else if (lowestSubscriptionFee <= 1_000) {
      score += 2;
      reasons.push("청약 수수료가 낮아 참여 부담이 비교적 적습니다.");
    } else if (lowestSubscriptionFee >= 3_000) {
      score -= 2;
      warnings.push("청약 수수료가 높은 편이라 소액 청약 체감 비용이 큽니다.");
    }
  }

  const onlineOnlyBrokerCount = meaningfulSubscriptions.filter(
    (subscription) => subscription.hasOnlineOnlyCondition,
  ).length;

  if (onlineOnlyBrokerCount > 0) {
    signalCount += 1;
    evidence.push({
      field: "onlineOnlyBrokerCount",
      label: "온라인 전용 제한 증권사 수",
      value: onlineOnlyBrokerCount,
      source: meaningfulSubscriptions.map((subscription) => subscription.source).join(", "),
    });

    if (onlineOnlyBrokerCount === meaningfulSubscriptions.length) {
      score -= 4;
      warnings.push("청약 가능한 증권사가 모두 온라인 중심이라 오프라인 접근성은 제한적으로 봐야 합니다.");
    } else {
      score -= 2;
      warnings.push("일부 증권사는 온라인 전용 조건이 있어 청약 경로 제약이 있습니다.");
    }
  }

  if (signalCount === 0) {
    return createMissingComponent("competition", "경쟁 분석에 필요한 기관·청약 경쟁률 데이터가 아직 부족합니다.");
  }

  const hasRetailCompetitionCore =
    representativeGeneralCompetitionRate != null
    && (
      bestMinimumSubscriptionShares != null
      || lowestDepositRate != null
      || totalAllocatedShares != null
      || totalEqualAllocatedShares != null
      || meaningfulSubscriptions.length >= 2
    );

  return {
    key: "competition",
    score: round(clamp(score, 0, 100)),
    status: coreSignalCount >= 2 || hasRetailCompetitionCore ? "READY" : "PARTIAL",
    reasons,
    warnings,
    evidence,
  };
};

export const buildV2ScoreSnapshot = (context: V2ScoreContext): V2ScoreSnapshot => {
  const supply = calculateSupplyScore(context.supply);
  const lockup = calculateLockupScore(context.supply);
  const competition = calculateCompetitionScore(context.demand, context.subscriptions);
  const financialAdjustment = calculateFinancialAdjustment(context.financials);
  const market = createMissingComponent("market", "V3 전까지 마켓 점수는 계산하지 않습니다.");

  const baseComponents = [
    supply.score != null ? { component: supply, score: supply.score, weight: V2_COMPONENT_WEIGHTS.supply } : null,
    lockup.score != null ? { component: lockup, score: lockup.score, weight: V2_COMPONENT_WEIGHTS.lockup } : null,
    competition.score != null
      ? { component: competition, score: competition.score, weight: V2_COMPONENT_WEIGHTS.competition }
      : null,
  ];
  const availableBaseComponents = baseComponents.filter(
    (component): component is NonNullable<(typeof baseComponents)[number]> => component !== null,
  );
  const readyBaseCount = availableBaseComponents.filter((component) => component.component.status === "READY").length;
  const partialBaseCount = availableBaseComponents.filter(
    (component) => component.component.status === "PARTIAL",
  ).length;

  const baseWeight = availableBaseComponents.reduce((sum, component) => sum + component.weight, 0);
  const baseScore =
    baseWeight > 0
      ? availableBaseComponents.reduce((sum, component) => sum + component.score * component.weight, 0) / baseWeight
      : null;
  const totalScore =
    baseScore == null
      ? null
      : round(clamp(baseScore + (financialAdjustment.score ?? 0), 0, 100));

  const coverageStatus: ScoreCoverageStatus =
    availableBaseComponents.length === 0
      ? "EMPTY"
      : readyBaseCount >= 2 || (readyBaseCount >= 1 && partialBaseCount >= 1)
        ? "SUFFICIENT"
        : "PARTIAL";
  const status: ScoreSnapshotStatus =
    totalScore == null
      ? "NOT_READY"
      : coverageStatus === "SUFFICIENT"
        ? "READY"
        : "PARTIAL";

  const explanations = unique([
    ...supply.reasons,
    ...lockup.reasons,
    ...competition.reasons,
    ...financialAdjustment.reasons,
  ]).slice(0, 6);
  const warnings = unique([
    ...supply.warnings,
    ...lockup.warnings,
    ...competition.warnings,
    ...financialAdjustment.warnings,
  ]).slice(0, 6);

  return {
    scoreVersion: V2_SCORE_VERSION,
    status,
    coverageStatus,
    supplyScore: supply.score,
    lockupScore: lockup.score,
    competitionScore: competition.score,
    marketScore: null,
    financialAdjustmentScore: financialAdjustment.score,
    totalScore,
    componentWeights: {
      supply: V2_COMPONENT_WEIGHTS.supply,
      lockup: V2_COMPONENT_WEIGHTS.lockup,
      competition: V2_COMPONENT_WEIGHTS.competition,
      market: V2_COMPONENT_WEIGHTS.market,
    },
    inputsChecksum: toChecksum({
      scoreVersion: V2_SCORE_VERSION,
      supply: context.supply,
      demand: context.demand,
      subscriptions: context.subscriptions,
      financials: context.financials,
    }),
    evidenceSummary: {
      supply,
      lockup,
      competition,
      market,
      financialAdjustment,
    },
    warnings,
    explanations,
    calculatedAt: new Date(),
  };
};

export const buildScoreSnapshot = buildV2ScoreSnapshot;
