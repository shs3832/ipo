import assert from "node:assert/strict";
import test from "node:test";

import { buildIpoDetailViewModel, getMinimumDepositAmount } from "@/app/ipos/[slug]/page-helpers";
import type { PublicIpoDetailRecord } from "@/lib/types";

const createIpo = (
  overrides: Partial<PublicIpoDetailRecord> = {},
): PublicIpoDetailRecord => ({
  id: overrides.id !== undefined ? overrides.id : "ipo-1",
  slug: overrides.slug !== undefined ? overrides.slug : "ipo-1",
  name: overrides.name !== undefined ? overrides.name : "테스트공모",
  market: overrides.market !== undefined ? overrides.market : "KOSDAQ",
  leadManager: overrides.leadManager !== undefined ? overrides.leadManager : "미래에셋증권",
  coManagers: overrides.coManagers !== undefined ? overrides.coManagers : [],
  kindIssueCode: overrides.kindIssueCode !== undefined ? overrides.kindIssueCode : "A001",
  kindBizProcessNo: overrides.kindBizProcessNo !== undefined ? overrides.kindBizProcessNo : "1001",
  priceBandLow: overrides.priceBandLow !== undefined ? overrides.priceBandLow : 9000,
  priceBandHigh: overrides.priceBandHigh !== undefined ? overrides.priceBandHigh : 11000,
  offerPrice: overrides.offerPrice !== undefined ? overrides.offerPrice : 10000,
  listingOpenPrice: overrides.listingOpenPrice !== undefined ? overrides.listingOpenPrice : 13000,
  listingOpenReturnRate: overrides.listingOpenReturnRate !== undefined ? overrides.listingOpenReturnRate : 30,
  minimumSubscriptionShares: overrides.minimumSubscriptionShares !== undefined ? overrides.minimumSubscriptionShares : 10,
  depositRate: overrides.depositRate !== undefined ? overrides.depositRate : 0.5,
  generalSubscriptionCompetitionRate: overrides.generalSubscriptionCompetitionRate !== undefined
    ? overrides.generalSubscriptionCompetitionRate
    : 1234.5,
  irStart: overrides.irStart !== undefined ? overrides.irStart : new Date("2026-03-10T00:00:00.000Z"),
  irEnd: overrides.irEnd !== undefined ? overrides.irEnd : new Date("2026-03-11T00:00:00.000Z"),
  demandForecastStart: overrides.demandForecastStart !== undefined
    ? overrides.demandForecastStart
    : new Date("2026-03-12T00:00:00.000Z"),
  demandForecastEnd: overrides.demandForecastEnd !== undefined
    ? overrides.demandForecastEnd
    : new Date("2026-03-13T00:00:00.000Z"),
  tradableShares: overrides.tradableShares !== undefined ? overrides.tradableShares : 500000,
  floatRatio: overrides.floatRatio !== undefined ? overrides.floatRatio : 42.6,
  subscriptionStart: overrides.subscriptionStart !== undefined
    ? overrides.subscriptionStart
    : new Date("2026-03-20T00:00:00.000Z"),
  subscriptionEnd: overrides.subscriptionEnd !== undefined
    ? overrides.subscriptionEnd
    : new Date("2026-03-21T00:00:00.000Z"),
  refundDate: overrides.refundDate !== undefined ? overrides.refundDate : new Date("2026-03-23T00:00:00.000Z"),
  listingDate: overrides.listingDate !== undefined ? overrides.listingDate : new Date("2026-03-28T00:00:00.000Z"),
  status: overrides.status !== undefined ? overrides.status : "CLOSED",
  events: overrides.events !== undefined ? overrides.events : [],
  latestAnalysis: overrides.latestAnalysis !== undefined ? overrides.latestAnalysis : {
    score: 72,
    ratingLabel: "보통",
    summary: "요약",
    keyPoints: ["수요예측 흥행", "유통가능물량 부담 완화"],
    warnings: ["의무보유확약은 확인 필요"],
    scoreDisplay: {
      isVisible: false,
      evidenceLabels: [],
      evidenceCount: 0,
      demandSupplyEvidenceCount: 0,
      financialEvidenceCount: 0,
      helpText: "점수 비공개",
      policyNote: "정책 메모",
      disclaimer: "안내",
    },
    generatedAt: new Date("2026-03-15T01:00:00.000Z"),
  },
  publicScore: overrides.publicScore !== undefined ? overrides.publicScore : {
    scoreVersion: "v2",
    status: "READY",
    coverageStatus: "SUFFICIENT",
    totalScore: 74.3,
    supplyScore: 70.2,
    lockupScore: 66.1,
    competitionScore: 80.4,
    marketScore: 61.9,
    financialAdjustmentScore: 2.4,
    warnings: [],
    explanations: ["기관 수요예측 수요가 강했습니다.", "재무 보정이 일부 반영됐습니다."],
    calculatedAt: new Date("2026-03-15T02:00:00.000Z"),
  },
});

test("getMinimumDepositAmount returns null unless all required inputs exist", () => {
  assert.equal(getMinimumDepositAmount({ offerPrice: 10000, minimumSubscriptionShares: 10, depositRate: 0.5 }), 50000);
  assert.equal(getMinimumDepositAmount({ offerPrice: null, minimumSubscriptionShares: 10, depositRate: 0.5 }), null);
  assert.equal(getMinimumDepositAmount({ offerPrice: 10000, minimumSubscriptionShares: null, depositRate: 0.5 }), null);
  assert.equal(getMinimumDepositAmount({ offerPrice: 10000, minimumSubscriptionShares: 10, depositRate: null }), null);
});

test("buildIpoDetailViewModel centralizes score, quick fact, and listing state derivation", () => {
  const view = buildIpoDetailViewModel(createIpo(), "2026-04-04");

  assert.equal(view.dataQualityLabel, "검증 완료");
  assert.equal(view.isListedYet, true);
  assert.equal(view.scoreMetaLabel, "종합점수 74.3점");
  assert.equal(view.scoreStatusLabel, "점수 공개");
  assert.deepEqual(view.scoreReasons, ["기관 수요예측 수요가 강했습니다.", "재무 보정이 일부 반영됐습니다."]);
  assert.deepEqual(view.quickFacts.slice(0, 3), [
    { label: "확정 공모가", value: "₩10,000", emphasis: true },
    { label: "최소청약금액", value: "₩50,000", emphasis: true },
    { label: "환불일", value: "2026.03.23" },
  ]);
  assert.deepEqual(view.listingFacts, [
    { label: "상장일 시초가", value: "₩13,000" },
    { label: "공모가 대비 수익률", value: "+30%" },
  ]);
});

test("buildIpoDetailViewModel keeps fallback copy when public score or analysis details are missing", () => {
  const view = buildIpoDetailViewModel(createIpo({
    latestAnalysis: {
      score: 0,
      ratingLabel: "대기",
      summary: "요약",
      keyPoints: [],
      warnings: [],
      scoreDisplay: {
        isVisible: false,
        evidenceLabels: [],
        evidenceCount: 0,
        demandSupplyEvidenceCount: 0,
        financialEvidenceCount: 0,
        helpText: "점수 비공개",
        policyNote: "정책 메모",
        disclaimer: "안내",
      },
      generatedAt: new Date("2026-03-15T01:00:00.000Z"),
    },
    publicScore: {
      scoreVersion: "v2",
      status: "NOT_READY",
      coverageStatus: "EMPTY",
      totalScore: null,
      supplyScore: null,
      lockupScore: null,
      competitionScore: null,
      marketScore: null,
      financialAdjustmentScore: null,
      warnings: [],
      explanations: [],
      calculatedAt: null,
    },
    listingDate: new Date("2026-04-10T00:00:00.000Z"),
    listingOpenPrice: null,
    listingOpenReturnRate: null,
  }), "2026-04-04");

  assert.equal(view.isListedYet, false);
  assert.equal(view.analysisSummary, "현재는 확보된 공시와 청약 데이터를 바탕으로 체크 포인트를 정리하고 있습니다.");
  assert.deepEqual(view.keyPoints, ["핵심 지표는 계속 보강 중이며, 현재는 확인된 공시 사실 위주로 요약합니다."]);
  assert.deepEqual(view.warnings, ["최종 청약 결정 전 증권신고서와 주관사 공고를 함께 확인해 주세요."]);
  assert.equal(view.scoreMetaLabel, "정량 점수 비공개");
  assert.equal(view.scoreStatusLabel, "점수 준비 중");
  assert.equal(view.scoreHelpText, "정량 점수는 현재 비공개 상태이며, 공개 여부는 추후 다시 판단합니다.");
  assert.equal(view.scoreDisclaimer, "정량 점수는 현재 공개하지 않고, 공시 기반 체크 포인트 중심으로 안내합니다.");
  assert.deepEqual(view.listingFacts, [
    { label: "상장일 시초가", value: null },
    { label: "공모가 대비 수익률", value: null },
  ]);
});
