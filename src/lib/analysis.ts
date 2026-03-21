import { formatMoney } from "@/lib/date";
import type { IpoAnalysisRecord, SourceIpoRecord } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatSignedRate = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const SCORE_VISIBILITY_POLICY_NOTE = "핵심 수급 지표와 재무 지표가 충분히 확보된 종목만 점수를 표시합니다.";
const SCORE_REFERENCE_DISCLAIMER =
  "점수는 투자 판단을 돕기 위한 참고용 정보이며, 최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.";
const MIN_TOTAL_EVIDENCE = 4;
const MIN_SUPPLY_DEMAND_EVIDENCE = 2;
const MIN_FINANCIAL_EVIDENCE = 1;

type ScoreEvidenceCategory = "SUPPLY_DEMAND" | "FINANCIAL";

type ScoreEvidenceSource = Pick<
  SourceIpoRecord,
  | "offerPrice"
  | "priceBandLow"
  | "priceBandHigh"
  | "demandCompetitionRate"
  | "lockupRate"
  | "floatRatio"
  | "insiderSalesRatio"
  | "marketMoodScore"
  | "revenueGrowthRate"
  | "operatingIncome"
  | "netIncome"
  | "debtRatio"
  | "totalEquity"
>;

type ScoreEvidence = {
  label: string;
  category: ScoreEvidenceCategory;
};

const getScoreEvidence = (record: ScoreEvidenceSource): ScoreEvidence[] => {
  const evidence: ScoreEvidence[] = [];

  if (record.offerPrice != null && record.priceBandLow != null && record.priceBandHigh != null) {
    evidence.push({ label: "확정 공모가 위치", category: "SUPPLY_DEMAND" });
  }

  if (record.demandCompetitionRate != null) {
    evidence.push({ label: "기관 수요예측 경쟁률", category: "SUPPLY_DEMAND" });
  }

  if (record.lockupRate != null) {
    evidence.push({ label: "의무보유확약 비율", category: "SUPPLY_DEMAND" });
  }

  if (record.floatRatio != null) {
    evidence.push({ label: "유통가능물량", category: "SUPPLY_DEMAND" });
  }

  if (record.insiderSalesRatio != null) {
    evidence.push({ label: "구주매출 비중", category: "SUPPLY_DEMAND" });
  }

  if (record.marketMoodScore != null) {
    evidence.push({ label: "최근 신규상장 분위기", category: "SUPPLY_DEMAND" });
  }

  if (record.revenueGrowthRate != null) {
    evidence.push({ label: "매출 성장률", category: "FINANCIAL" });
  }

  if (record.operatingIncome != null) {
    evidence.push({ label: "영업이익", category: "FINANCIAL" });
  }

  if (record.netIncome != null) {
    evidence.push({ label: "순이익", category: "FINANCIAL" });
  }

  if (record.debtRatio != null) {
    evidence.push({ label: "부채비율", category: "FINANCIAL" });
  }

  if (record.totalEquity != null) {
    evidence.push({ label: "자본총계", category: "FINANCIAL" });
  }

  return evidence;
};

const formatEvidenceSummary = (labels: string[]) => {
  if (labels.length === 0) {
    return "반영 가능한 평가 지표가 아직 없습니다.";
  }

  const preview = labels.slice(0, 3).join(", ");
  return labels.length > 3
    ? `반영 지표: ${preview} 등 ${labels.length}개.`
    : `반영 지표: ${preview}.`;
};

const getHiddenReason = ({
  evidenceCount,
  demandSupplyEvidenceCount,
  financialEvidenceCount,
}: {
  evidenceCount: number;
  demandSupplyEvidenceCount: number;
  financialEvidenceCount: number;
}) => {
  if (evidenceCount === 0) {
    return "점수를 계산할 핵심 수급·재무 데이터가 아직 없어 평가를 보류합니다.";
  }

  const missingGroups: string[] = [];

  if (demandSupplyEvidenceCount < MIN_SUPPLY_DEMAND_EVIDENCE) {
    missingGroups.push("수급");
  }

  if (financialEvidenceCount < MIN_FINANCIAL_EVIDENCE) {
    missingGroups.push("재무");
  }

  const target =
    missingGroups.length === 2
      ? "핵심 수급·재무 데이터"
      : `${missingGroups[0] ?? "평가 근거"} 데이터`;

  return `${target}가 부족해 점수를 표시하지 않습니다. 현재 반영 가능한 지표 ${evidenceCount}개입니다.`;
};

export const buildAnalysisScoreDisplay = (record: ScoreEvidenceSource): IpoAnalysisRecord["scoreDisplay"] => {
  const evidence = getScoreEvidence(record);
  const evidenceLabels = evidence.map((item) => item.label);
  const demandSupplyEvidenceCount = evidence.filter((item) => item.category === "SUPPLY_DEMAND").length;
  const financialEvidenceCount = evidence.filter((item) => item.category === "FINANCIAL").length;
  const isVisible =
    evidence.length >= MIN_TOTAL_EVIDENCE
    && demandSupplyEvidenceCount >= MIN_SUPPLY_DEMAND_EVIDENCE
    && financialEvidenceCount >= MIN_FINANCIAL_EVIDENCE;

  return {
    isVisible,
    evidenceLabels,
    evidenceCount: evidence.length,
    demandSupplyEvidenceCount,
    financialEvidenceCount,
    helpText: isVisible
      ? `참고용 점수입니다. ${formatEvidenceSummary(evidenceLabels)}`
      : getHiddenReason({
          evidenceCount: evidence.length,
          demandSupplyEvidenceCount,
          financialEvidenceCount,
        }),
    policyNote: SCORE_VISIBILITY_POLICY_NOTE,
    disclaimer: SCORE_REFERENCE_DISCLAIMER,
  };
};

export const buildAnalysis = (record: SourceIpoRecord): IpoAnalysisRecord => {
  let score = 50;
  const keyPoints: string[] = [];
  const warnings: string[] = [];

  const bandPosition =
    record.offerPrice != null && record.priceBandLow != null && record.priceBandHigh != null
      ? (record.offerPrice - record.priceBandLow) / Math.max(record.priceBandHigh - record.priceBandLow, 1)
      : null;

  if (bandPosition != null) {
    if (bandPosition >= 0.95) {
      score += 12;
      keyPoints.push("확정 공모가가 희망 밴드 상단에 가까워 수요가 견조한 편입니다.");
    } else if (bandPosition <= 0.2) {
      score -= 8;
      warnings.push("확정 공모가가 밴드 하단에 가까워 가격 매력 판단이 엇갈릴 수 있습니다.");
    }
  }

  if (record.demandCompetitionRate != null) {
    if (record.demandCompetitionRate >= 1200) {
      score += 18;
      keyPoints.push("기관 수요예측 경쟁률이 매우 높아 초반 수급 기대감이 큽니다.");
    } else if (record.demandCompetitionRate >= 700) {
      score += 10;
      keyPoints.push("기관 수요예측 경쟁률이 양호한 편입니다.");
    } else if (record.demandCompetitionRate < 300) {
      score -= 10;
      warnings.push("기관 수요예측 경쟁률이 낮아 초기 수급이 약할 수 있습니다.");
    }
  }

  if (record.lockupRate != null) {
    if (record.lockupRate >= 18) {
      score += 12;
      keyPoints.push("의무보유확약 비율이 높아 상장 직후 매도 압력 완화가 기대됩니다.");
    } else if (record.lockupRate < 5) {
      score -= 8;
      warnings.push("의무보유확약 비율이 낮아 단기 차익 물량 부담을 확인할 필요가 있습니다.");
    }
  }

  if (record.floatRatio != null) {
    if (record.floatRatio <= 25) {
      score += 14;
      keyPoints.push("유통 가능 물량이 적어 수급 측면에서 유리합니다.");
    } else if (record.floatRatio >= 45) {
      score -= 12;
      warnings.push("유통 가능 물량 비율이 높아 상장 초반 변동성이 커질 수 있습니다.");
    }
  }

  if (record.insiderSalesRatio != null) {
    if (record.insiderSalesRatio >= 30) {
      score -= 10;
      warnings.push("구주매출 비중이 높아 차익 실현 성격을 점검할 필요가 있습니다.");
    } else if (record.insiderSalesRatio <= 10) {
      score += 6;
      keyPoints.push("구주매출 비중이 낮아 신규 자금 유입 성격이 상대적으로 강합니다.");
    }
  }

  if (record.marketMoodScore != null) {
    score += record.marketMoodScore;
    if (record.marketMoodScore >= 6) {
      keyPoints.push("최근 신규 상장주 분위기가 우호적입니다.");
    } else if (record.marketMoodScore <= -6) {
      warnings.push("최근 신규 상장주 분위기가 약해 보수적으로 접근할 필요가 있습니다.");
    }
  }

  if (record.revenueGrowthRate != null) {
    if (record.revenueGrowthRate >= 20) {
      score += 8;
      keyPoints.push(`최근 매출 성장률이 ${formatSignedRate(record.revenueGrowthRate)}로 높아 외형 확장이 확인됩니다.`);
    } else if (record.revenueGrowthRate >= 5) {
      score += 4;
      keyPoints.push(`최근 매출이 ${formatSignedRate(record.revenueGrowthRate)} 성장해 실적 흐름이 무난합니다.`);
    } else if (record.revenueGrowthRate <= -10) {
      score -= 8;
      warnings.push(`최근 매출 성장률이 ${formatSignedRate(record.revenueGrowthRate)}로 둔화돼 수요 지속성을 점검할 필요가 있습니다.`);
    }
  }

  if (record.operatingIncome != null) {
    if (record.operatingIncome > 0) {
      score += 8;
      keyPoints.push("최근 영업이익이 흑자라 본업 수익성이 확인됩니다.");
    } else if (record.operatingIncome < 0) {
      score -= 10;
      warnings.push("최근 영업이익이 적자라 상장 후 기대감만으로 보기엔 부담이 있습니다.");
    }
  }

  if (record.netIncome != null) {
    if (record.netIncome > 0) {
      score += 5;
      keyPoints.push("당기순이익이 흑자로 순이익 기준 체력이 나쁘지 않습니다.");
    } else if (record.netIncome < 0) {
      score -= 7;
      warnings.push("당기순이익이 적자라 밸류에이션 해석에 보수적인 접근이 필요합니다.");
    }
  }

  if (record.debtRatio != null) {
    if (record.debtRatio <= 100) {
      score += 6;
      keyPoints.push(`부채비율이 ${record.debtRatio.toFixed(1)}%로 재무 안정성이 양호한 편입니다.`);
    } else if (record.debtRatio >= 200) {
      score -= 8;
      warnings.push(`부채비율이 ${record.debtRatio.toFixed(1)}%로 높아 재무 부담을 함께 확인할 필요가 있습니다.`);
    }
  }

  if (record.totalEquity != null && record.totalEquity <= 0) {
    score -= 12;
    warnings.push("자본총계가 낮거나 음수 구간이라 재무 구조를 특히 주의해서 봐야 합니다.");
  }

  if (record.notes?.length && keyPoints.length < 3) {
    keyPoints.push(...record.notes.slice(0, 1));
  }

  const boundedScore = clamp(score, 0, 100);
  const ratingLabel =
    boundedScore >= 80 ? "우수" : boundedScore >= 65 ? "양호" : boundedScore >= 50 ? "보통" : "신중";

  const summaryParts = [
    `공모가 ${formatMoney(record.offerPrice)}`,
    record.demandCompetitionRate ? `기관 경쟁률 ${record.demandCompetitionRate.toFixed(1)}:1` : null,
    record.floatRatio != null ? `유통 가능 물량 ${record.floatRatio}%` : null,
    record.revenueGrowthRate != null ? `매출 성장 ${formatSignedRate(record.revenueGrowthRate)}` : null,
    record.debtRatio != null ? `부채비율 ${record.debtRatio.toFixed(1)}%` : null,
  ].filter(Boolean);

  return {
    score: boundedScore,
    ratingLabel,
    summary: `${ratingLabel} 의견. ${summaryParts.join(" / ")}`,
    keyPoints: keyPoints.slice(0, 3),
    warnings: warnings.slice(0, 3),
    scoreDisplay: buildAnalysisScoreDisplay(record),
    generatedAt: new Date(),
  };
};
