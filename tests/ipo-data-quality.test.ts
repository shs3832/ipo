import assert from "node:assert/strict";
import test from "node:test";

import { parseKstDate } from "@/lib/date";
import { assessIpoDataQuality } from "@/lib/ipo-data-quality";

test("assessIpoDataQuality blocks alerts when critical facts are missing", () => {
  const summary = assessIpoDataQuality({
    market: "기타법인",
    leadManager: "-",
    kindIssueCode: null,
    kindBizProcessNo: null,
    offerPrice: null,
    minimumSubscriptionShares: null,
    depositRate: null,
    generalSubscriptionCompetitionRate: null,
    refundDate: null,
    listingDate: null,
    floatRatio: null,
  });

  assert.equal(summary.status, "BLOCKED");
  assert.equal(summary.shouldSendAlert, false);
  assert.deepEqual(summary.criticalMissing, ["확정 공모가", "환불일", "상장 예정일", "주관사"]);
});

test("assessIpoDataQuality marks partially verified IPOs without blocking send", () => {
  const summary = assessIpoDataQuality({
    market: "기타법인",
    leadManager: "한국투자증권",
    kindIssueCode: "40847",
    kindBizProcessNo: "20250527000093",
    offerPrice: 19000,
    minimumSubscriptionShares: null,
    depositRate: null,
    generalSubscriptionCompetitionRate: 1671.46,
    refundDate: parseKstDate("2026-03-19"),
    listingDate: parseKstDate("2026-03-25"),
    floatRatio: 25.2,
  });

  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.shouldSendAlert, true);
  assert.equal(summary.marketLabel, "미확인");
  assert.deepEqual(summary.optionalMissing, ["시장구분", "최소청약주수", "증거금률"]);
});

test("assessIpoDataQuality marks fully verified IPOs as verified", () => {
  const summary = assessIpoDataQuality({
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    kindIssueCode: "49328",
    kindBizProcessNo: "20250324000286",
    offerPrice: 26000,
    minimumSubscriptionShares: 20,
    depositRate: 0.5,
    generalSubscriptionCompetitionRate: 1805.8,
    refundDate: parseKstDate("2026-03-16"),
    listingDate: parseKstDate("2026-03-20"),
    floatRatio: 14,
  });

  assert.equal(summary.status, "VERIFIED");
  assert.equal(summary.shouldSendAlert, true);
  assert.equal(summary.label, "검증 완료");
  assert.deepEqual(summary.optionalMissing, []);
});
