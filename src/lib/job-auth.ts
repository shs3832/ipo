import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const hasJobSecret = () => Boolean(env.jobSecret);

export const getJobAuthorization = (request: NextRequest) => {
  if (!env.jobSecret) {
    return { authorized: false, reason: "misconfigured" as const };
  }

  if (request.headers.get("x-vercel-cron")) {
    return { authorized: true, reason: "authorized" as const };
  }

  const headerSecret = request.headers.get("x-job-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return {
    authorized: headerSecret === env.jobSecret || querySecret === env.jobSecret,
    reason: headerSecret === env.jobSecret || querySecret === env.jobSecret ? ("authorized" as const) : ("unauthorized" as const),
  };
};
