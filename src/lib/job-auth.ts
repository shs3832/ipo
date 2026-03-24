import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const hasJobSecret = () => Boolean(env.jobSecret);
export const hasCronSecret = () => Boolean(env.cronSecret);

type JobAuthorizationContext = {
  cronSecretConfigured: boolean;
  jobSecretConfigured: boolean;
  hasAuthorizationHeader: boolean;
  hasJobSecretHeader: boolean;
  hasQuerySecret: boolean;
  hasVercelCronHeader: boolean;
};

type JobAuthorizationResult =
  | {
      authorized: true;
      reason: "authorized";
      method: "vercel-cron-secret" | "job-secret-header" | "job-secret-query";
      context: JobAuthorizationContext;
    }
  | {
      authorized: false;
      reason: "unauthorized" | "misconfigured";
      context: JobAuthorizationContext;
    };

export const getJobAuthorization = (request: NextRequest): JobAuthorizationResult => {
  const authorizationHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-job-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const cronSecretConfigured = Boolean(env.cronSecret);
  const jobSecretConfigured = Boolean(env.jobSecret);
  const context = {
    cronSecretConfigured,
    jobSecretConfigured,
    hasAuthorizationHeader: Boolean(authorizationHeader),
    hasJobSecretHeader: Boolean(headerSecret),
    hasQuerySecret: Boolean(querySecret),
    hasVercelCronHeader: Boolean(request.headers.get("x-vercel-cron")),
  };

  if (cronSecretConfigured && authorizationHeader === `Bearer ${env.cronSecret}`) {
    return {
      authorized: true,
      reason: "authorized",
      method: "vercel-cron-secret",
      context,
    };
  }

  if (jobSecretConfigured && headerSecret === env.jobSecret) {
    return {
      authorized: true,
      reason: "authorized",
      method: "job-secret-header",
      context,
    };
  }

  if (jobSecretConfigured && querySecret === env.jobSecret) {
    return {
      authorized: true,
      reason: "authorized",
      method: "job-secret-query",
      context,
    };
  }

  if (!cronSecretConfigured && !jobSecretConfigured) {
    return {
      authorized: false,
      reason: "misconfigured",
      context,
    };
  }

  return {
    authorized: false,
    reason: "unauthorized",
    context,
  };
};
