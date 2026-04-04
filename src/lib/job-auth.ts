import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export const hasJobSecret = () => Boolean(env.jobSecret);
export const hasCronSecret = () => Boolean(env.cronSecret);

type JobAuthorizationRequest = {
  headers: Headers;
  nextUrl: {
    searchParams: URLSearchParams;
  };
};
type JobAuthorizationSecrets = {
  cronSecret?: string;
  jobSecret?: string;
};

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
      method: "vercel-cron-secret" | "job-secret-header";
      context: JobAuthorizationContext;
    }
  | {
      authorized: false;
      reason: "unauthorized" | "misconfigured";
      context: JobAuthorizationContext;
    };

const matchesSecret = (provided: string | null, expected: string | undefined) => {
  if (!expected || typeof provided !== "string") {
    return false;
  }

  const left = Buffer.from(provided);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

const getBearerToken = (authorizationHeader: string | null) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
};

export const getJobAuthorizationWithSecrets = (
  request: JobAuthorizationRequest,
  { cronSecret, jobSecret }: JobAuthorizationSecrets,
): JobAuthorizationResult => {
  const authorizationHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-job-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const cronSecretConfigured = Boolean(cronSecret);
  const jobSecretConfigured = Boolean(jobSecret);
  const context = {
    cronSecretConfigured,
    jobSecretConfigured,
    hasAuthorizationHeader: Boolean(authorizationHeader),
    hasJobSecretHeader: Boolean(headerSecret),
    hasQuerySecret: Boolean(querySecret),
    hasVercelCronHeader: Boolean(request.headers.get("x-vercel-cron")),
  };

  if (cronSecretConfigured && matchesSecret(getBearerToken(authorizationHeader), cronSecret)) {
    return {
      authorized: true,
      reason: "authorized",
      method: "vercel-cron-secret",
      context,
    };
  }

  if (jobSecretConfigured && matchesSecret(headerSecret, jobSecret)) {
    return {
      authorized: true,
      reason: "authorized",
      method: "job-secret-header",
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

export const getJobAuthorization = (request: NextRequest) =>
  getJobAuthorizationWithSecrets(request, {
    cronSecret: env.cronSecret,
    jobSecret: env.jobSecret,
  });
