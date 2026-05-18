import { unstable_cache } from "next/cache";

import { getPublicHomeSnapshot, getPublicIpoBySlug } from "@/lib/jobs";
import { revivePublicHomeSnapshot, revivePublicIpoDetailRecord } from "@/lib/page-data-revival";
import { PUBLIC_HOME_SNAPSHOT_TAG, PUBLIC_IPO_DETAIL_TAG } from "@/lib/public-cache-tags";

const getCachedPublicHomeSnapshot = unstable_cache(
  async () => getPublicHomeSnapshot(),
  ["public-home-snapshot-v3"],
  {
    revalidate: 300,
    tags: [PUBLIC_HOME_SNAPSHOT_TAG],
  },
);

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
