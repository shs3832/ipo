import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config";

test("next config applies global security headers and service worker headers", async () => {
  if (!nextConfig.headers) {
    throw new Error("expected next config headers");
  }

  const headerRules = await nextConfig.headers();
  const globalRule = headerRules.find((rule) => rule.source === "/(.*)");
  const serviceWorkerRule = headerRules.find((rule) => rule.source === "/sw.js");

  assert.ok(globalRule);
  assert.ok(serviceWorkerRule);

  const globalHeaders = new Map(globalRule.headers.map((header) => [header.key, header.value]));
  assert.match(globalHeaders.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(globalHeaders.get("Content-Security-Policy") ?? "", /object-src 'none'/);
  assert.equal(globalHeaders.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(globalHeaders.get("X-Content-Type-Options"), "nosniff");
  assert.equal(globalHeaders.get("X-Frame-Options"), "DENY");
  assert.match(globalHeaders.get("Permissions-Policy") ?? "", /geolocation=\(\)/);

  const serviceWorkerHeaders = new Map(serviceWorkerRule.headers.map((header) => [header.key, header.value]));
  assert.equal(serviceWorkerHeaders.get("Content-Type"), "application/javascript; charset=utf-8");
  assert.equal(serviceWorkerHeaders.get("Cache-Control"), "no-cache, no-store, must-revalidate");
  assert.match(serviceWorkerHeaders.get("Content-Security-Policy") ?? "", /script-src 'self'/);
});
