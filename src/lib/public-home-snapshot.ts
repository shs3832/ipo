import type { IpoRecord, PublicHomeIpoSummary, PublicHomeSnapshot } from "@/lib/types";

type PublicHomeSnapshotInput = {
  mode: PublicHomeSnapshot["mode"];
  generatedAt: PublicHomeSnapshot["generatedAt"];
  calendarMonth: PublicHomeSnapshot["calendarMonth"];
  ipos: Array<IpoRecord | PublicHomeIpoSummary>;
  [key: string]: unknown;
};

export const toPublicHomeIpoSummary = (ipo: IpoRecord | PublicHomeIpoSummary): PublicHomeIpoSummary => ({
  id: ipo.id,
  slug: ipo.slug,
  name: ipo.name,
  market: ipo.market,
  leadManager: ipo.leadManager,
  subscriptionStart: ipo.subscriptionStart,
  subscriptionEnd: ipo.subscriptionEnd,
  offerPrice: ipo.offerPrice,
  minimumSubscriptionShares: ipo.minimumSubscriptionShares,
  depositRate: ipo.depositRate,
  listingOpenPrice: ipo.listingOpenPrice,
  listingOpenReturnRate: ipo.listingOpenReturnRate,
  events: ipo.events.map((event) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    eventDate: event.eventDate,
  })),
  publicScore: ipo.publicScore
    ? {
        totalScore: ipo.publicScore.totalScore,
        status: ipo.publicScore.status,
        coverageStatus: ipo.publicScore.coverageStatus,
      }
    : null,
});

export const toPublicHomeSnapshot = ({
  mode,
  generatedAt,
  calendarMonth,
  ipos,
}: PublicHomeSnapshotInput): PublicHomeSnapshot => ({
  mode,
  generatedAt,
  calendarMonth,
  ipos: ipos.map(toPublicHomeIpoSummary),
});
