import { unstable_cache } from "next/cache";

import type { IpoRecord, PublicHomeSnapshot, PublicIpoDetailRecord } from "@/lib/types";
import { getPublicHomeSnapshot, getPublicIpoBySlug } from "@/lib/jobs";

export const PUBLIC_HOME_SNAPSHOT_TAG = "public-home-snapshot";
export const PUBLIC_IPO_DETAIL_TAG = "public-ipo-detail";

const getCachedPublicHomeSnapshot = unstable_cache(
  async () => getPublicHomeSnapshot(),
  ["public-home-snapshot"],
  {
    revalidate: 300,
    tags: [PUBLIC_HOME_SNAPSHOT_TAG],
  },
);

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
};

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

const hasScoreDisplay = (value: unknown): value is IpoRecord["latestAnalysis"]["scoreDisplay"] =>
  typeof value === "object"
  && value !== null
  && "isVisible" in value
  && typeof (value as { isVisible?: unknown }).isVisible === "boolean";

const reviveIpoRecord = <T extends IpoRecord | PublicIpoDetailRecord>(ipo: T): T => ({
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

const revivePublicHomeSnapshot = (snapshot: PublicHomeSnapshot): PublicHomeSnapshot => ({
  ...snapshot,
  generatedAt: toDate(snapshot.generatedAt) ?? new Date(),
  calendarMonth: toDate(snapshot.calendarMonth) ?? new Date(),
  ipos: snapshot.ipos.map((ipo) => reviveIpoRecord(ipo)),
});

const revivePublicIpoDetailRecord = (ipo: PublicIpoDetailRecord | null) =>
  ipo ? reviveIpoRecord(ipo) : null;

export const getCachedHomeSnapshot = async () => revivePublicHomeSnapshot(await getCachedPublicHomeSnapshot());

export const getCachedIpoDetail = async (slug: string) => {
  const getCachedPublicIpoBySlug = unstable_cache(
    async () => getPublicIpoBySlug(slug),
    [PUBLIC_IPO_DETAIL_TAG, slug],
    {
      revalidate: 300,
      tags: [PUBLIC_IPO_DETAIL_TAG],
    },
  );

  return revivePublicIpoDetailRecord(await getCachedPublicIpoBySlug());
};
