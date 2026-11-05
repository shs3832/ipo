import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { POST } from "@/app/api/jobs/diagnose-kind/route";
import { buildKindAccessProbes, readKindProbeBody, runKindAccessProbes } from "@/lib/sources/kind-access-probe";

test("KIND probes compare identical parameters in GET and POST using the KST month", () => {
  const probes = buildKindAccessProbes(new Date("2026-10-31T16:00:00Z"));
  assert.equal(probes.length, 5);
  assert.equal(probes[1].parameters, probes[2].parameters);
  assert.equal(probes[3].parameters, probes[4].parameters);
  assert.equal(new URLSearchParams(probes[3].parameters).get("selMonth"), "11");
});

test("KIND probes use fixed hosts without credentials, redirects, retries or writes", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls += 1;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://kind.krx.co.kr");
    assert.equal(options?.redirect, "manual");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal);
    const headers = new Headers(options?.headers);
    assert.equal(headers.has("cookie"), false);
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("x-job-secret"), false);
    if (calls === 2) throw new Error("sensitive upstream error");
    return new Response('<h1>Access Denied</h1> https://errors.edgesuite.net/18.abc?token=secret', {
      status: 403, headers: { "set-cookie": "private-cookie" },
    });
  };
  const result = await runKindAccessProbes({ fetcher });
  assert.equal(calls, 5);
  assert.equal(result.results[1].status, null);
  assert.equal(result.results[4].status, 403);
  assert.equal(result.results[4].accessDenied, true);
  assert.doesNotMatch(JSON.stringify(result), /sensitive upstream|private-cookie|token=secret/);
});

test("KIND probes do not mistake a 200 access denial for usable content", async () => {
  const result = await runKindAccessProbes({ fetcher: async () => new Response("Access Denied") });
  assert.equal(result.results[0].status, 200);
  assert.equal(result.results[0].accessDenied, true);
  assert.equal(result.results[0].containsCalendar, false);
});

test("KIND probe body reads are bounded and cancel the remaining stream", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); },
    cancel() { cancelled = true; },
  }));
  const body = await readKindProbeBody(response);
  assert.equal(body.bytesRead, 128 * 1024);
  assert.equal(body.bodyTruncated, true);
  assert.equal(cancelled, true);
});

test("unauthenticated diagnostic requests cannot trigger any upstream probes", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Upstream must not be called"); };
  try {
    const response = await POST(new NextRequest("https://example.com/api/jobs/diagnose-kind"));
    assert.ok([401, 503].includes(response.status));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  } finally {
    global.fetch = originalFetch;
  }
});
