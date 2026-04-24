import type {
  IpoRecord,
  PublicHomeIpoSummary,
  PublicHomeSnapshot,
  PublicIpoDetailRecord,
} from "@/lib/types";

const fallbackScoreDisplay: IpoRecord["latestAnalysis"]["scoreDisplay"] = {
  isVisible: false,
  evidenceLabels: [],
  evidenceCount: 0,
  demandSupplyEvidenceCount: 0,
  financialEvidenceCount: 0,
  helpText: "점수 정보를 다시 계산하는 중입니다. 잠시 후 새로고침해 주세요.",
  policyNote: "핵심 수급 지표와 재무 지표가 충분히 확보된 종목만 점수를 표시합니다.",
  disclaimer: "점수는 투자 판단을 돕기 위한 참고용 정보이며, 최종 청약 결정 전 증권신고서와 공식 공고를 함께 확인해 주세요.",
};

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
};

const hasScoreDisplay = (value: unknown): value is IpoRecord["latestAnalysis"]["scoreDisplay"] =>
  typeof value === "object"
  && value !== null
  && "isVisible" in value
  && typeof (value as { isVisible?: unknown }).isVisible === "boolean";

export const reviveIpoRecord = <T extends IpoRecord | PublicIpoDetailRecord>(ipo: T): T => ({
  ...ipo,
  subscriptionStart: toDate(ipo.subscriptionStart) ?? new Date(),
  subscriptionEnd: toDate(ipo.subscriptionEnd) ?? new Date(),
  irStart: toDate(ipo.irStart),
  irEnd: toDate(ipo.irEnd),
  demandForecastStart: toDate(ipo.demandForecastStart),
  demandForecastEnd: toDate(ipo.demandForecastEnd),
  refundDate: toDate(ipo.refundDate),
  listingDate: toDate(ipo.listingDate),
  events: ipo.events.map((event) => ({
    ...event,
    eventDate: toDate(event.eventDate) ?? new Date(),
  })),
  latestAnalysis: {
    ...ipo.latestAnalysis,
    scoreDisplay: hasScoreDisplay(ipo.latestAnalysis.scoreDisplay)
      ? ipo.latestAnalysis.scoreDisplay
      : fallbackScoreDisplay,
    generatedAt: toDate(ipo.latestAnalysis.generatedAt) ?? new Date(),
  },
  publicScore: ipo.publicScore
    ? {
        ...ipo.publicScore,
        calculatedAt: toDate(ipo.publicScore.calculatedAt),
      }
    : null,
  ...("sourceFetchedAt" in ipo
    ? {
        sourceFetchedAt: toDate(ipo.sourceFetchedAt) ?? new Date(),
      }
    : {}),
}) as T;

export const revivePublicHomeIpoSummary = (ipo: PublicHomeIpoSummary): PublicHomeIpoSummary => ({
  id: ipo.id,
  slug: ipo.slug,
  name: ipo.name,
  market: ipo.market,
  leadManager: ipo.leadManager,
  subscriptionStart: toDate(ipo.subscriptionStart) ?? new Date(),
  subscriptionEnd: toDate(ipo.subscriptionEnd) ?? new Date(),
  offerPrice: ipo.offerPrice,
  minimumSubscriptionShares: ipo.minimumSubscriptionShares,
  depositRate: ipo.depositRate,
  listingOpenPrice: ipo.listingOpenPrice,
  listingOpenReturnRate: ipo.listingOpenReturnRate,
  events: ipo.events.map((event) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    eventDate: toDate(event.eventDate) ?? new Date(),
  })),
  publicScore: ipo.publicScore
    ? {
        totalScore: ipo.publicScore.totalScore,
        status: ipo.publicScore.status,
        coverageStatus: ipo.publicScore.coverageStatus,
      }
    : null,
});

export const revivePublicHomeSnapshot = (snapshot: PublicHomeSnapshot): PublicHomeSnapshot => ({
  ...snapshot,
  generatedAt: toDate(snapshot.generatedAt) ?? new Date(),
  calendarMonth: toDate(snapshot.calendarMonth) ?? new Date(),
  ipos: snapshot.ipos.map((ipo) => revivePublicHomeIpoSummary(ipo)),
});

export const revivePublicIpoDetailRecord = (ipo: PublicIpoDetailRecord | null) =>
  ipo ? reviveIpoRecord(ipo) : null;
