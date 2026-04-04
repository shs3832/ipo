import assert from "node:assert/strict";
import test from "node:test";

import { getJobAuthorizationWithSecrets } from "@/lib/job-auth";

const createJobRequest = (url: string, headers?: HeadersInit) =>
  ({
    headers: new Headers(headers),
    nextUrl: new URL(url),
  });

test("getJobAuthorizationWithSecrets accepts the Vercel cron bearer token", () => {
  const result = getJobAuthorizationWithSecrets(
    createJobRequest("https://example.com/api/jobs/daily-sync", {
      authorization: "Bearer cron-secret",
    }),
    {
      cronSecret: "cron-secret",
      jobSecret: "job-secret",
    },
  );

  assert.equal(result.authorized, true);
  if (result.authorized) {
    assert.equal(result.method, "vercel-cron-secret");
  }
});

test("getJobAuthorizationWithSecrets accepts the manual job header secret", () => {
  const result = getJobAuthorizationWithSecrets(
    createJobRequest("https://example.com/api/jobs/daily-sync", {
      "x-job-secret": "job-secret",
    }),
    {
      jobSecret: "job-secret",
    },
  );

  assert.equal(result.authorized, true);
  if (result.authorized) {
    assert.equal(result.method, "job-secret-header");
  }
});

test("getJobAuthorizationWithSecrets rejects query-string secrets", () => {
  const result = getJobAuthorizationWithSecrets(
    createJobRequest("https://example.com/api/jobs/daily-sync?secret=job-secret"),
    {
      jobSecret: "job-secret",
    },
  );

  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.reason, "unauthorized");
    assert.equal(result.context.hasQuerySecret, true);
  }
});

test("getJobAuthorizationWithSecrets reports misconfigured when no secrets are configured", () => {
  const result = getJobAuthorizationWithSecrets(
    createJobRequest("https://example.com/api/jobs/daily-sync"),
    {},
  );

  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.reason, "misconfigured");
  }
});
