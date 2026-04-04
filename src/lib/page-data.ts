import { unstable_cache } from "next/cache";

import { getPublicHomeSnapshot, getPublicIpoBySlug } from "@/lib/jobs";
import { revivePublicHomeSnapshot, revivePublicIpoDetailRecord } from "@/lib/page-data-revival";

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
