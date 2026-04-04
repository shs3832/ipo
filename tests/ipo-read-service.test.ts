import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSchedulerStatuses,
  filterReadableIpos,
  hasReadableIpoArtifacts,
} from "@/lib/server/ipo-read-service";
import type { OperationLogRecord } from "@/lib/types";

const createLog = (overrides: Partial<OperationLogRecord>): OperationLogRecord => ({
  id: overrides.id ?? "log-1",
  level: overrides.level ?? "INFO",
  source: overrides.source ?? "job:dispatch-alerts",
  action: overrides.action ?? "completed",
  message: overrides.message ?? "10시 분석 메일 발송을 마쳤습니다.",
  context: overrides.context ?? null,
  createdAt: overrides.createdAt ?? new Date("2026-04-01T01:22:38.761Z"),
});

type ReadableCandidate = {
  id: string;
  analyses: unknown[];
  sourceSnapshots: unknown[];
};

const createReadableCandidate = (overrides: Partial<ReadableCandidate> = {}): ReadableCandidate => ({
  id: overrides.id ?? "ipo-1",
  analyses: overrides.analyses ?? [{ id: "analysis-1" }],
  sourceSnapshots: overrides.sourceSnapshots ?? [{ id: "snapshot-1" }],
});

test("hasReadableIpoArtifacts returns true only when analysis and source snapshot are both present", () => {
  assert.equal(hasReadableIpoArtifacts(createReadableCandidate()), true);
  assert.equal(hasReadableIpoArtifacts(createReadableCandidate({ analyses: [] })), false);
  assert.equal(hasReadableIpoArtifacts(createReadableCandidate({ sourceSnapshots: [] })), false);
  assert.equal(hasReadableIpoArtifacts(createReadableCandidate({ analyses: [], sourceSnapshots: [] })), false);
  assert.equal(hasReadableIpoArtifacts(null), false);
  assert.equal(hasReadableIpoArtifacts(undefined), false);
});

test("filterReadableIpos excludes legacy rows without snapshots and preserves original order", () => {
  const readableFirst = createReadableCandidate({ id: "readable-first" });
  const legacyWithoutSnapshot = createReadableCandidate({ id: "legacy-no-snapshot", sourceSnapshots: [] });
  const unreadableWithoutAnalysis = createReadableCandidate({ id: "no-analysis", analyses: [] });
  const readableLast = createReadableCandidate({ id: "readable-last" });

  const filtered = filterReadableIpos([
    readableFirst,
    legacyWithoutSnapshot,
    unreadableWithoutAnalysis,
    readableLast,
  ]);

  assert.deepEqual(
    filtered.map((ipo) => ipo.id),
    ["readable-first", "readable-last"],
  );
});

test("scheduler status uses the earliest completion after the expected time when multiple reruns exist", () => {
  const statuses = buildSchedulerStatuses(
    [
      createLog({
        id: "dispatch-rerun",
        createdAt: new Date("2026-04-01T01:58:00.000Z"),
        message: "10시 분석 메일 수동 재실행을 마쳤습니다.",
      }),
      createLog({
        id: "dispatch-scheduled",
        createdAt: new Date("2026-04-01T01:22:00.000Z"),
        message: "10시 분석 메일 발송 대상이 없어 실제 메일은 보내지 않았습니다.",
      }),
    ],
    new Date("2026-04-01T03:00:00.000Z"),
  );

  const dispatchStatus = statuses.find((status) => status.id === "dispatch-alerts");

  assert.ok(dispatchStatus);
  assert.equal(dispatchStatus.status, "HEALTHY");
  assert.equal(dispatchStatus.lastCompletedAt?.toISOString(), "2026-04-01T01:58:00.000Z");
  assert.match(dispatchStatus.detail, /최근 성공 2026\.04\.01 10:22/);
  assert.match(dispatchStatus.detail, /실제 메일은 보내지 않았습니다/);
});
