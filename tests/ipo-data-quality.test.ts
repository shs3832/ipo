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
    priceBandLow: null,
    priceBandHigh: null,
    offerPrice: null,
    minimumSubscriptionShares: null,
    depositRate: null,
    generalSubscriptionCompetitionRate: null,
    refundDate: null,
    listingDate: null,
    subscriptionEnd: parseKstDate("2026-05-14"),
    floatRatio: null,
  });

  assert.equal(summary.status, "BLOCKED");
  assert.equal(summary.shouldSendAlert, false);
  assert.deepEqual(summary.criticalMissing, ["공모가 또는 희망밴드", "환불일", "주관사"]);
});

test("assessIpoDataQuality allows partial alerts when only the price band is available", () => {
  const summary = assessIpoDataQuality({
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    kindIssueCode: "40847",
    kindBizProcessNo: "20250527000093",
    priceBandLow: 12_500,
    priceBandHigh: 15_000,
    offerPrice: null,
    minimumSubscriptionShares: 10,
    depositRate: 0.5,
    generalSubscriptionCompetitionRate: null,
    refundDate: parseKstDate("2026-05-15"),
    listingDate: null,
    subscriptionEnd: parseKstDate("2026-05-14"),
    floatRatio: null,
  });

  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.shouldSendAlert, true);
  assert.deepEqual(summary.criticalMissing, []);
  assert.equal(summary.optionalMissing.includes("확정 공모가"), true);
  assert.equal(summary.confirmedFacts.includes("희망 공모가"), true);
});

test("assessIpoDataQuality does not block alerts when listing date is missing", () => {
  const summary = assessIpoDataQuality({
    market: "기타법인",
    leadManager: "한국투자증권",
    kindIssueCode: "40847",
    kindBizProcessNo: "20250527000093",
    priceBandLow: 18_000,
    priceBandHigh: 20_000,
    offerPrice: 19000,
    minimumSubscriptionShares: null,
    depositRate: null,
    generalSubscriptionCompetitionRate: 1671.46,
    refundDate: parseKstDate("2026-03-19"),
    listingDate: null,
    subscriptionEnd: parseKstDate("2026-03-18"),
    floatRatio: 25.2,
  });

  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.shouldSendAlert, true);
  assert.equal(summary.marketLabel, "미확인");
  assert.deepEqual(summary.optionalMissing, ["상장 예정일", "시장구분", "최소청약주수", "증거금률"]);
});

test("assessIpoDataQuality marks fully verified IPOs as verified", () => {
  const summary = assessIpoDataQuality({
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    kindIssueCode: "49328",
    kindBizProcessNo: "20250324000286",
    priceBandLow: 23_000,
    priceBandHigh: 26_000,
    offerPrice: 26000,
    minimumSubscriptionShares: 20,
    depositRate: 0.5,
    generalSubscriptionCompetitionRate: 1805.8,
    refundDate: parseKstDate("2026-03-16"),
    listingDate: parseKstDate("2026-03-20"),
    subscriptionEnd: parseKstDate("2026-03-14"),
    floatRatio: 14,
  });

  assert.equal(summary.status, "VERIFIED");
  assert.equal(summary.shouldSendAlert, true);
  assert.equal(summary.label, "검증 완료");
  assert.deepEqual(summary.optionalMissing, []);
});

test("assessIpoDataQuality marks listing dates before subscription close as review-needed optional data", () => {
  const summary = assessIpoDataQuality({
    market: "KOSDAQ",
    leadManager: "한국투자증권",
    kindIssueCode: "49328",
    kindBizProcessNo: "20250324000286",
    priceBandLow: 23_000,
    priceBandHigh: 26_000,
    offerPrice: 26000,
    minimumSubscriptionShares: 20,
    depositRate: 0.5,
    generalSubscriptionCompetitionRate: 1805.8,
    refundDate: parseKstDate("2026-06-15"),
    listingDate: parseKstDate("2026-06-11"),
    subscriptionEnd: parseKstDate("2026-06-12"),
    floatRatio: 14,
  });

  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.shouldSendAlert, true);
  assert.equal(summary.optionalMissing.includes("상장 예정일 검증"), true);
  assert.equal(summary.sourceChecks.includes("상장 예정일 확인 필요"), true);
});
