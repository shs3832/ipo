import { formatMoney } from "@/lib/date";
import type { IpoAnalysisRecord, SourceIpoRecord } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

  if (record.notes?.length) {
    keyPoints.push(...record.notes.slice(0, 1));
  }

  const boundedScore = clamp(score, 0, 100);
  const ratingLabel =
    boundedScore >= 80 ? "우수" : boundedScore >= 65 ? "양호" : boundedScore >= 50 ? "보통" : "신중";

  const summaryParts = [
    `공모가 ${formatMoney(record.offerPrice)}`,
    record.demandCompetitionRate ? `기관 경쟁률 ${record.demandCompetitionRate.toFixed(1)}:1` : null,
    record.floatRatio != null ? `유통 가능 물량 ${record.floatRatio}%` : null,
  ].filter(Boolean);

  return {
    score: boundedScore,
    ratingLabel,
    summary: `${ratingLabel} 의견. ${summaryParts.join(" / ")}`,
    keyPoints: keyPoints.slice(0, 3),
    warnings: warnings.slice(0, 2),
    generatedAt: new Date(),
  };
};
