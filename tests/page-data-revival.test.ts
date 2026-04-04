import assert from "node:assert/strict";
import test from "node:test";

import {
  reviveIpoRecord,
  revivePublicHomeSnapshot,
  revivePublicIpoDetailRecord,
} from "@/lib/page-data-revival";
import type { IpoRecord, PublicHomeSnapshot } from "@/lib/types";

const createSerializedIpo = () =>
  ({
    id: "ipo-1",
    slug: "ipo-1",
    name: "테스트공모",
    market: "KOSDAQ",
    leadManager: "미래에셋증권",
    coManagers: [],
    kindIssueCode: "A001",
    kindBizProcessNo: "1001",
    priceBandLow: 9000,
    priceBandHigh: 11000,
    offerPrice: 10000,
    listingOpenPrice: 13000,
    listingOpenReturnRate: 30,
    minimumSubscriptionShares: 10,
    depositRate: 0.5,
    generalSubscriptionCompetitionRate: 1234.5,
    irStart: "2026-03-10T00:00:00.000Z",
    irEnd: "2026-03-11T00:00:00.000Z",
    demandForecastStart: "2026-03-12T00:00:00.000Z",
    demandForecastEnd: "2026-03-13T00:00:00.000Z",
    tradableShares: 500000,
    floatRatio: 42.6,
    subscriptionStart: "2026-03-20T00:00:00.000Z",
    subscriptionEnd: "2026-03-21T00:00:00.000Z",
    refundDate: "2026-03-23T00:00:00.000Z",
    listingDate: "2026-03-28T00:00:00.000Z",
    status: "CLOSED",
    events: [
      {
        id: "event-1",
        type: "SUBSCRIPTION",
        title: "청약",
        eventDate: "2026-03-20T00:00:00.000Z",
      },
    ],
    latestAnalysis: {
      score: 72,
      ratingLabel: "보통",
      summary: "요약",
      keyPoints: ["수요예측 흥행"],
      warnings: ["상세 공시 확인 필요"],
      scoreDisplay: null,
      generatedAt: "2026-03-15T01:00:00.000Z",
    },
    publicScore: {
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
      explanations: ["기관 수요예측 수요가 강했습니다."],
      calculatedAt: "2026-03-15T02:00:00.000Z",
    },
    latestSourceKey: "source-1",
    sourceFetchedAt: "2026-03-15T03:00:00.000Z",
  }) as unknown as IpoRecord;

test("reviveIpoRecord restores serialized dates and fills a fallback score display", () => {
  const revived = reviveIpoRecord(createSerializedIpo());

  assert.ok(revived.subscriptionStart instanceof Date);
  assert.ok(revived.events[0]?.eventDate instanceof Date);
  assert.ok(revived.latestAnalysis.generatedAt instanceof Date);
  assert.ok(revived.publicScore?.calculatedAt instanceof Date);
  assert.ok(revived.sourceFetchedAt instanceof Date);
  assert.equal(revived.latestAnalysis.scoreDisplay.isVisible, false);
  assert.match(revived.latestAnalysis.scoreDisplay.helpText, /다시 계산하는 중/);
});

test("revivePublicHomeSnapshot restores top-level cache dates and nested ipo records", () => {
  const snapshot = revivePublicHomeSnapshot({
    mode: "database",
    generatedAt: "2026-03-15T04:00:00.000Z",
    calendarMonth: "2026-03-01T00:00:00.000Z",
    ipos: [createSerializedIpo()],
    recipientCount: 3,
    jobCount: 4,
  } as unknown as PublicHomeSnapshot);

  assert.ok(snapshot.generatedAt instanceof Date);
  assert.ok(snapshot.calendarMonth instanceof Date);
  assert.ok(snapshot.ipos[0]?.subscriptionEnd instanceof Date);
});

test("revivePublicIpoDetailRecord keeps null and revives detail payloads", () => {
  assert.equal(revivePublicIpoDetailRecord(null), null);
  assert.ok(revivePublicIpoDetailRecord(createSerializedIpo())?.listingDate instanceof Date);
});
