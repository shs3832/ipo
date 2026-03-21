import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const isAuthorizedJobRequest = (request: NextRequest) => {
  if (!env.jobSecret) {
    return true;
  }

  if (request.headers.get("x-vercel-cron")) {
    return true;
  }

  const headerSecret = request.headers.get("x-job-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return headerSecret === env.jobSecret || querySecret === env.jobSecret;
};
