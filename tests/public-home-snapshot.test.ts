import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackPublicHomeSnapshot } from "@/lib/fallback-data";
import { toPublicHomeSnapshot } from "@/lib/public-home-snapshot";

test("toPublicHomeSnapshot strips admin-only telemetry fields from mixed inputs", () => {
  const snapshot = toPublicHomeSnapshot({
    mode: "database",
    generatedAt: new Date("2026-04-04T00:00:00.000Z"),
    calendarMonth: new Date("2026-04-01T00:00:00.000Z"),
    ipos: [],
    recipients: [{ id: "recipient-1" }],
    jobs: [{ id: "job-1" }],
    operationLogs: [{ id: "log-1" }],
    schedulerStatuses: [{ id: "scheduler-1" }],
  }) as Record<string, unknown>;

  assert.deepEqual(Object.keys(snapshot).sort(), ["calendarMonth", "generatedAt", "ipos", "mode"]);
  assert.equal("recipients" in snapshot, false);
  assert.equal("jobs" in snapshot, false);
  assert.equal("operationLogs" in snapshot, false);
  assert.equal("schedulerStatuses" in snapshot, false);
});

test("buildFallbackPublicHomeSnapshot exposes only public home fields", () => {
  const snapshot = buildFallbackPublicHomeSnapshot() as Record<string, unknown>;

  assert.deepEqual(Object.keys(snapshot).sort(), ["calendarMonth", "generatedAt", "ipos", "mode"]);
  assert.equal(snapshot.mode, "fallback");
  assert.equal("recipients" in snapshot, false);
  assert.equal("jobs" in snapshot, false);
  assert.equal("deliveries" in snapshot, false);
  assert.equal("overrides" in snapshot, false);
  assert.equal("operationLogs" in snapshot, false);
  assert.equal("schedulerStatuses" in snapshot, false);
  assert.equal("ipoScoreSummaries" in snapshot, false);
});
