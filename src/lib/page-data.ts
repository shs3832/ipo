import { unstable_cache } from "next/cache";

import type { IpoRecord, PublicHomeSnapshot, PublicIpoDetailRecord } from "@/lib/types";
import { getPublicHomeSnapshot, getPublicIpoBySlug } from "@/lib/jobs";

const getCachedPublicHomeSnapshot = unstable_cache(
  async () => getPublicHomeSnapshot(),
  ["public-home-snapshot"],
  {
    revalidate: 300,
  },
);

const getCachedPublicIpoBySlug = unstable_cache(
  async (slug: string) => getPublicIpoBySlug(slug),
  ["public-ipo-detail"],
  {
    revalidate: 300,
  },
);

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
};

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
    generatedAt: toDate(ipo.latestAnalysis.generatedAt) ?? new Date(),
  },
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

export const getCachedIpoDetail = async (slug: string) => revivePublicIpoDetailRecord(await getCachedPublicIpoBySlug(slug));
