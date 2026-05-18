import assert from "node:assert/strict";
import test from "node:test";

import { parseAppBaseUrl, parseIpoSourceUrl } from "@/lib/env";

test("parseIpoSourceUrl only enforces https in production", () => {
  assert.equal(parseIpoSourceUrl("http://localhost:4000/ipos.json", "development"), "http://localhost:4000/ipos.json");
  assert.equal(parseIpoSourceUrl("http://localhost:4000/ipos.json", "test"), "http://localhost:4000/ipos.json");
  assert.equal(parseIpoSourceUrl("https://example.com/ipos.json", "production"), "https://example.com/ipos.json");
  assert.equal(parseIpoSourceUrl("http://example.com/ipos.json", "production"), "");
  assert.equal(parseIpoSourceUrl("not-a-url", "production"), "");
});

test("parseAppBaseUrl normalizes approved app origins and requires https in production", () => {
  assert.equal(parseAppBaseUrl(undefined, "development"), "http://localhost:3000");
  assert.equal(parseAppBaseUrl("http://localhost:3000/app/", "development"), "http://localhost:3000/app");
  assert.equal(parseAppBaseUrl("https://ipo.example/app/", "production"), "https://ipo.example/app");
  assert.equal(parseAppBaseUrl("http://ipo.example", "production"), "");
  assert.equal(parseAppBaseUrl("javascript:alert(1)", "production"), "");
});
