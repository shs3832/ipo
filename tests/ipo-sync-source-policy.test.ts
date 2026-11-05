import assert from "node:assert/strict";
import test from "node:test";

import { loadOptionalIpoSource, shouldWithdrawMissingIpo } from "@/lib/server/ipo-sync-source-policy";

test("an optional source rejection does not discard a successful sibling source", async () => {
  const errors: unknown[] = [];
  const [listings, schedules] = await Promise.all([
    loadOptionalIpoSource("listings", async () => [{ name: "confirmed IPO" }]),
    loadOptionalIpoSource("schedules", async () => { throw new Error("HTTP 403"); }, async (error) => { errors.push(error); }),
  ]);
  assert.deepEqual(listings, { value: [{ name: "confirmed IPO" }], failed: false });
  assert.deepEqual(schedules, { value: null, failed: true });
  assert.equal(errors.length, 1);
});

test("a successful empty source is distinct from an unavailable source", async () => {
  assert.deepEqual(await loadOptionalIpoSource("listings", async () => []), { value: [], failed: false });
});

test("incomplete source coverage never withdraws an IPO merely missing from the results", () => {
  for (const recentlySeen of [false, true]) {
    assert.equal(shouldWithdrawMissingIpo({ explicitlyExcluded: false, sourceCoverageComplete: false, recentlySeen }), false);
  }
  assert.equal(shouldWithdrawMissingIpo({ explicitlyExcluded: true, sourceCoverageComplete: false, recentlySeen: false }), true);
  assert.equal(shouldWithdrawMissingIpo({ explicitlyExcluded: false, sourceCoverageComplete: true, recentlySeen: true }), false);
  assert.equal(shouldWithdrawMissingIpo({ explicitlyExcluded: false, sourceCoverageComplete: true, recentlySeen: false }), true);
});
