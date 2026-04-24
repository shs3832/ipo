import assert from "node:assert/strict";
import test from "node:test";

import { parseIpoSourceUrl } from "@/lib/env";

test("parseIpoSourceUrl only enforces https in production", () => {
  assert.equal(parseIpoSourceUrl("http://localhost:4000/ipos.json", "development"), "http://localhost:4000/ipos.json");
  assert.equal(parseIpoSourceUrl("http://localhost:4000/ipos.json", "test"), "http://localhost:4000/ipos.json");
  assert.equal(parseIpoSourceUrl("https://example.com/ipos.json", "production"), "https://example.com/ipos.json");
  assert.equal(parseIpoSourceUrl("http://example.com/ipos.json", "production"), "");
  assert.equal(parseIpoSourceUrl("not-a-url", "production"), "");
});
