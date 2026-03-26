import { createHash } from "node:crypto";

import type {
  ScoreComponentResult,
  ScoreCoverageStatus,
  ScoreSnapshotStatus,
  V1FinancialFact,
  V1ScoreContext,
  V1ScoreSnapshot,
  V1SupplyFact,
} from "@/lib/scoring/types";

export const V1_COMPONENT_WEIGHTS = {
  supply: 0.6,
  lockup: 0.4,
} as const;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const round = (value: number) => Math.round(value * 10) / 10;
export const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export const toChecksum = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue)),
    )
    .digest("hex");

export const createMissingComponent = (
  key: ScoreComponentResult["key"],
  reason: string,
): ScoreComponentResult => ({
  key,
  score: null,
  status: "MISSING",
  reasons: [reason],
  warnings: [],
  evidence: [],
});

export const calculateSupplyScore = (supply: V1SupplyFact | null): ScoreComponentResult => {
  if (!supply || (supply.floatRatio == null && supply.insiderSalesRatio == null)) {
    return createMissingComponent("supply", "유통 분석에 필요한 핵심 공급 데이터가 아직 부족합니다.");
  }

  let score = 50;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const evidence: ScoreComponentResult["evidence"] = [];
  let signalCount = 0;

  if (supply.floatRatio != null) {
    signalCount += 1;
    evidence.push({
      field: "floatRatio",
      label: "유통가능물량",
      value: supply.floatRatio,
      source: supply.source,
    });

    if (supply.floatRatio <= 15) {
      score += 25;
      reasons.push("유통가능물량이 매우 낮아 상장 초반 수급 구조가 유리한 편입니다.");
    } else if (supply.floatRatio <= 25) {
      score += 18;
      reasons.push("유통가능물량이 낮은 편이라 수급 부담이 크지 않습니다.");
    } else if (supply.floatRatio <= 35) {
      score += 10;
      reasons.push("유통가능물량이 통제 가능한 수준입니다.");
    } else if (supply.floatRatio >= 55) {
      score -= 24;
      warnings.push("유통가능물량 비중이 높아 상장 초반 매도 압력이 커질 수 있습니다.");
    } else if (supply.floatRatio >= 45) {
      score -= 15;
      warnings.push("유통가능물량이 다소 높아 단기 수급 변동성을 확인할 필요가 있습니다.");
    }
  }

  if (supply.insiderSalesRatio != null) {
    signalCount += 1;
    evidence.push({
      field: "insiderSalesRatio",
      label: "구주매출 비중",
      value: supply.insiderSalesRatio,
      source: supply.source,
    });

    if (supply.insiderSalesRatio <= 5) {
      score += 12;
      reasons.push("구주매출 비중이 매우 낮아 신규 자금 유입 성격이 강합니다.");
    } else if (supply.insiderSalesRatio <= 10) {
      score += 8;
      reasons.push("구주매출 비중이 낮아 차익 실현 성격이 상대적으로 약합니다.");
    } else if (supply.insiderSalesRatio >= 30) {
      score -= 20;
      warnings.push("구주매출 비중이 높아 기존 주주 차익 실현 성격을 점검할 필요가 있습니다.");
    } else if (supply.insiderSalesRatio >= 20) {
      score -= 10;
      warnings.push("구주매출 비중이 적지 않아 상장 직후 매도 압력 가능성을 봐야 합니다.");
    }
  }

  return {
    key: "supply",
    score: round(clamp(score, 0, 100)),
    status: signalCount >= 2 ? "READY" : "PARTIAL",
    reasons,
    warnings,
    evidence,
  };
};

export const calculateLockupScore = (supply: V1SupplyFact | null): ScoreComponentResult => {
  if (!supply || supply.lockupRatio == null) {
    return createMissingComponent("lockup", "확약 분석에 필요한 보호예수 비율 데이터가 아직 없습니다.");
  }

  let score = 50;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const evidence: ScoreComponentResult["evidence"] = [
    {
      field: "lockupRatio",
      label: "의무보유확약 비율",
      value: supply.lockupRatio,
      source: supply.source,
    },
  ];

  if (supply.lockupRatio >= 35) {
    score += 30;
    reasons.push("의무보유확약 비율이 매우 높아 초기 유통 부담을 크게 낮춰 줍니다.");
  } else if (supply.lockupRatio >= 20) {
    score += 20;
    reasons.push("의무보유확약 비율이 높아 상장 직후 매도 압력 완화가 기대됩니다.");
  } else if (supply.lockupRatio >= 10) {
    score += 10;
    reasons.push("의무보유확약 비율이 무난한 편입니다.");
  } else if (supply.lockupRatio < 1) {
    score -= 28;
    warnings.push("의무보유확약 비율이 거의 없어 상장 직후 수급 부담이 큽니다.");
  } else if (supply.lockupRatio < 3) {
    score -= 18;
    warnings.push("의무보유확약 비율이 낮아 단기 차익 매도 압력을 주의해야 합니다.");
  } else if (supply.lockupRatio < 5) {
    score -= 10;
    warnings.push("의무보유확약 비율이 낮은 편이라 보호예수 효과가 제한적입니다.");
  }

  return {
    key: "lockup",
    score: round(clamp(score, 0, 100)),
    status: "READY",
    reasons,
    warnings,
    evidence,
  };
};

export const calculateFinancialAdjustment = (financials: V1FinancialFact | null): ScoreComponentResult => {
  if (
    !financials
    || (
      financials.revenueGrowthRate == null
      && financials.operatingIncome == null
      && financials.netIncome == null
      && financials.debtRatio == null
      && financials.totalEquity == null
    )
  ) {
    return createMissingComponent("financialAdjustment", "재무 보정에 필요한 최신 재무 지표가 아직 부족합니다.");
  }

  let adjustment = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const evidence: ScoreComponentResult["evidence"] = [];
  let signalCount = 0;
  const source = financials.reportLabel ? `${financials.source}:${financials.reportLabel}` : financials.source;

  if (financials.revenueGrowthRate != null) {
    signalCount += 1;
    evidence.push({
      field: "revenueGrowthRate",
      label: "매출 성장률",
      value: financials.revenueGrowthRate,
      source,
    });

    if (financials.revenueGrowthRate >= 25) {
      adjustment += 4;
      reasons.push("매출 성장률이 높아 외형 확장 흐름이 강합니다.");
    } else if (financials.revenueGrowthRate >= 10) {
      adjustment += 2;
      reasons.push("매출 성장률이 양호해 재무 보정에 우호적입니다.");
    } else if (financials.revenueGrowthRate <= -25) {
      adjustment -= 6;
      warnings.push("매출 감소 폭이 커서 재무 보정에서 감점 요인입니다.");
    } else if (financials.revenueGrowthRate <= -10) {
      adjustment -= 4;
      warnings.push("매출 성장률이 둔화돼 수요 지속성을 보수적으로 봐야 합니다.");
    }
  }

  if (financials.operatingIncome != null) {
    signalCount += 1;
    evidence.push({
      field: "operatingIncome",
      label: "영업이익",
      value: financials.operatingIncome,
      source,
    });

    if (financials.operatingIncome > 0) {
      adjustment += 3;
      reasons.push("영업이익 흑자가 확인돼 본업 수익성이 방어되고 있습니다.");
    } else if (financials.operatingIncome < 0) {
      adjustment -= 4;
      warnings.push("영업이익 적자 상태라 재무 보정에서 보수적으로 반영합니다.");
    }
  }

  if (financials.netIncome != null) {
    signalCount += 1;
    evidence.push({
      field: "netIncome",
      label: "순이익",
      value: financials.netIncome,
      source,
    });

    if (financials.netIncome > 0) {
      adjustment += 2;
      reasons.push("순이익 흑자로 재무 체력이 완전히 약하진 않습니다.");
    } else if (financials.netIncome < 0) {
      adjustment -= 3;
      warnings.push("순이익 적자가 재무 보정 감점 요인입니다.");
    }
  }

  if (financials.debtRatio != null) {
    signalCount += 1;
    evidence.push({
      field: "debtRatio",
      label: "부채비율",
      value: financials.debtRatio,
      source,
    });

    if (financials.debtRatio <= 100) {
      adjustment += 2;
      reasons.push("부채비율이 낮아 재무 안정성이 상대적으로 양호합니다.");
    } else if (financials.debtRatio <= 200) {
      adjustment += 1;
    } else if (financials.debtRatio >= 300) {
      adjustment -= 3;
      warnings.push("부채비율이 높아 재무 안정성 보정에서 감점됩니다.");
    } else if (financials.debtRatio >= 200) {
      adjustment -= 2;
      warnings.push("부채비율이 높아 상장 후 재무 부담을 확인할 필요가 있습니다.");
    }
  }

  if (financials.totalEquity != null) {
    signalCount += 1;
    evidence.push({
      field: "totalEquity",
      label: "자본총계",
      value: financials.totalEquity,
      source,
    });

    if (financials.totalEquity <= 0) {
      adjustment -= 6;
      warnings.push("자본총계가 낮거나 음수 구간이라 재무 구조 리스크가 큽니다.");
    }
  }

  return {
    key: "financialAdjustment",
    score: round(clamp(adjustment, -10, 10)),
    status: signalCount >= 3 ? "READY" : "PARTIAL",
    reasons,
    warnings,
    evidence,
  };
};

export const buildV1ScoreSnapshot = (context: V1ScoreContext): V1ScoreSnapshot => {
  const supply = calculateSupplyScore(context.supply);
  const lockup = calculateLockupScore(context.supply);
  const financialAdjustment = calculateFinancialAdjustment(context.financials);
  const competition = createMissingComponent("competition", "V2 전까지 경쟁 점수는 계산하지 않습니다.");
  const market = createMissingComponent("market", "V3 전까지 마켓 점수는 계산하지 않습니다.");

  const baseComponents = [
    supply.score != null ? { score: supply.score, weight: V1_COMPONENT_WEIGHTS.supply } : null,
    lockup.score != null ? { score: lockup.score, weight: V1_COMPONENT_WEIGHTS.lockup } : null,
  ];
  const readyBaseComponents = baseComponents.filter(
    (component): component is NonNullable<(typeof baseComponents)[number]> => component !== null,
  );

  const baseWeight = readyBaseComponents.reduce((sum, component) => sum + component.weight, 0);
  const baseScore =
    baseWeight > 0
      ? readyBaseComponents.reduce((sum, component) => sum + component.score * component.weight, 0) / baseWeight
      : null;
  const totalScore =
    baseScore == null
      ? null
      : round(clamp(baseScore + (financialAdjustment.score ?? 0), 0, 100));

  const coverageStatus: ScoreCoverageStatus =
    supply.score == null && lockup.score == null
      ? "EMPTY"
      : supply.status === "READY" && lockup.status === "READY"
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
    ...financialAdjustment.reasons,
  ]).slice(0, 6);
  const warnings = unique([
    ...supply.warnings,
    ...lockup.warnings,
    ...financialAdjustment.warnings,
  ]).slice(0, 6);

  return {
    scoreVersion: "v1",
    status,
    coverageStatus,
    supplyScore: supply.score,
    lockupScore: lockup.score,
    competitionScore: null,
    marketScore: null,
    financialAdjustmentScore: financialAdjustment.score,
    totalScore,
    componentWeights: {
      supply: V1_COMPONENT_WEIGHTS.supply,
      lockup: V1_COMPONENT_WEIGHTS.lockup,
      competition: 0,
      market: 0,
    },
    inputsChecksum: toChecksum({
      scoreVersion: "v1",
      supply: context.supply,
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
