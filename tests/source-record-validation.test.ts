import assert from "node:assert/strict";
import test from "node:test";

import { validateSourceIpoRecords } from "@/lib/source-record-validation";
import type { SourceIpoRecord } from "@/lib/types";

const validRecord: SourceIpoRecord = {
  sourceKey: "source-1",
  name: "테스트공모",
  market: "KOSDAQ",
  leadManager: "미래에셋증권",
  subscriptionStart: "2026-04-01",
  subscriptionEnd: "2026-04-02",
};

test("validateSourceIpoRecords keeps valid source records", () => {
  const result = validateSourceIpoRecords([validRecord]);

  assert.equal(result.validRecords.length, 1);
  assert.equal(result.skippedRecords.length, 0);
});

test("validateSourceIpoRecords skips invalid source records without throwing", () => {
  const result = validateSourceIpoRecords([
    validRecord,
    {
      ...validRecord,
      sourceKey: "",
      subscriptionStart: "20260401",
    },
  ]);

  assert.equal(result.validRecords.length, 1);
  assert.equal(result.skippedRecords.length, 1);
  assert.equal(result.skippedRecords[0]?.index, 1);
});
