import assert from "node:assert/strict";
import test from "node:test";

import { buildKindFailureDiagnostics } from "@/lib/sources/kind-response-diagnostics";

test("KIND diagnostics preserve the rejection reason without headers or HTML secrets", () => {
  const response = new Response(null, {
    status: 403,
    headers: {
      "content-type": "text/html",
      server: "gateway",
      "retry-after": "60",
      "set-cookie": "session=private-session",
      authorization: "Bearer private-credential",
      location: "https://example.com/?token=private-token",
    },
  });
  const html = `<html><script>private-script</script><style>private-style</style>
    <!-- private-comment --><input value="private-input">
    <h1>Access Denied</h1><p>Cloud network blocked. 203.0.113.1 test@example.com</p>
    <p>https://example.com/?secret=private-url token=private-body</p>
    <p>authorization: Bearer private-bearer</p></html>`;
  const result = buildKindFailureDiagnostics(response, html, "pubofrschdl.do", "icn1");

  assert.equal(result.status, 403);
  assert.equal(result.region, "icn1");
  assert.match(result.bodyExcerpt, /Access Denied.*Cloud network blocked/);
  assert.deepEqual(result.responseHeaders, {
    "content-type": "text/html", server: "gateway", "retry-after": "60",
  });
  assert.doesNotMatch(JSON.stringify(result), /private-|203\.0\.113\.1|test@example/);
});

test("KIND diagnostics bound the stored excerpt and sanitize IPv6", () => {
  const result = buildKindFailureDiagnostics(
    new Response(null, { status: 403 }),
    `Client 2001:db8::1 blocked ${"x".repeat(2000)}`,
    "listingcompany.do",
    "iad1",
  );
  assert.equal(result.bodyExcerpt.length, 1200);
  assert.equal(result.excerptTruncated, true);
  assert.doesNotMatch(result.bodyExcerpt, /2001:db8/);
  assert.equal(result.endpoint, "listingcompany.do");
});
