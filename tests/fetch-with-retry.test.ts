import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithRetry } from "@/lib/fetch-with-retry";

test("fetchWithRetry retries retryable HTTP responses", async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return new Response(calls === 1 ? "busy" : "ok", {
      status: calls === 1 ? 503 : 200,
    });
  };

  try {
    const response = await fetchWithRetry("https://example.com", {
      retryDelayMs: 1,
      timeoutMs: 1000,
    });

    assert.equal(calls, 2);
    assert.equal(await response.text(), "ok");
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchWithRetry does not retry non-retryable HTTP responses", async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return new Response("missing", { status: 404 });
  };

  try {
    await assert.rejects(
      () => fetchWithRetry("https://example.com", { retryDelayMs: 1, timeoutMs: 1000 }),
      /HTTP 404/,
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
