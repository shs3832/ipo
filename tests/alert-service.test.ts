import assert from "node:assert/strict";
import test from "node:test";

import { type IpoDataQualitySummary } from "@/lib/ipo-data-quality";
import {
  buildClosingDayAnalysisMessage,
  createDeliveryIdempotencyKey,
  renderMessageHtml,
} from "@/lib/server/alert-service";
import type { IpoRecord } from "@/lib/types";

const createIpo = (overrides: Partial<IpoRecord> = {}): IpoRecord => ({
  id: "ipo-1",
  slug: overrides.slug ?? "ipo-1",
  name: overrides.name ?? "테스트 종목",
  market: overrides.market ?? "KOSDAQ",
  leadManager: overrides.leadManager ?? "한국투자증권",
  coManagers: overrides.coManagers ?? ["미래에셋증권"],
  kindIssueCode: overrides.kindIssueCode ?? "12345",
  kindBizProcessNo: overrides.kindBizProcessNo ?? "BP-1",
  priceBandLow: overrides.priceBandLow ?? 10_000,
  priceBandHigh: overrides.priceBandHigh ?? 12_000,
  offerPrice: overrides.offerPrice ?? 11_000,
  listingOpenPrice: overrides.listingOpenPrice ?? null,
  listingOpenReturnRate: overrides.listingOpenReturnRate ?? null,
  minimumSubscriptionShares: overrides.minimumSubscriptionShares ?? 10,
  depositRate: overrides.depositRate ?? 0.5,
  generalSubscriptionCompetitionRate: overrides.generalSubscriptionCompetitionRate ?? 321.1,
  irStart: overrides.irStart ?? null,
  irEnd: overrides.irEnd ?? null,
  demandForecastStart: overrides.demandForecastStart ?? null,
  demandForecastEnd: overrides.demandForecastEnd ?? null,
  tradableShares: overrides.tradableShares ?? 100000,
  floatRatio: overrides.floatRatio ?? 22.5,
  subscriptionStart: overrides.subscriptionStart ?? new Date("2026-03-24T00:00:00.000Z"),
  subscriptionEnd: overrides.subscriptionEnd ?? new Date("2026-03-25T00:00:00.000Z"),
  refundDate: overrides.refundDate ?? new Date("2026-03-27T00:00:00.000Z"),
  listingDate: overrides.listingDate ?? new Date("2026-03-30T00:00:00.000Z"),
  status: overrides.status ?? "OPEN",
  events: overrides.events ?? [],
  latestAnalysis: overrides.latestAnalysis ?? {
    score: 68,
    ratingLabel: "중립",
    summary: "요약",
    keyPoints: ["공시 기반 체크 포인트"],
    warnings: ["변동성 유의"],
    scoreDisplay: {
      isVisible: false,
      evidenceLabels: [],
      evidenceCount: 0,
      demandSupplyEvidenceCount: 0,
      financialEvidenceCount: 0,
      helpText: "정량 점수 비공개",
      policyNote: "정책 안내",
      disclaimer: "면책 안내",
    },
    generatedAt: new Date("2026-03-24T12:00:00.000Z"),
  },
  publicScore: overrides.publicScore ?? null,
  latestSourceKey: overrides.latestSourceKey ?? "source-1",
  sourceFetchedAt: overrides.sourceFetchedAt ?? new Date("2026-03-24T12:00:00.000Z"),
});

const verifiedQuality: IpoDataQualitySummary = {
  status: "VERIFIED",
  label: "검증 완료",
  detail: "핵심 정보와 주요 일정 정보를 확인했습니다.",
  shouldSendAlert: true,
  criticalMissing: [],
  optionalMissing: [],
  confirmedFacts: ["확정 공모가", "환불일"],
  sourceChecks: ["공모가 확인", "환불일 확인"],
  marketLabel: "KOSDAQ",
  leadManagerLabel: "한국투자증권",
};

test("createDeliveryIdempotencyKey normalizes email casing, spaces, and encoding", () => {
  const key = createDeliveryIdempotencyKey("job-key", "recipient-1", " Foo+Bar@Test.com ");

  assert.equal(key, "job-key:recipient-1:EMAIL:foo%2Bbar%40test.com");
});

test("buildClosingDayAnalysisMessage keeps score-hidden copy and renderMessageHtml escapes unsafe text", () => {
  const ipo = createIpo({
    name: "<테스트 종목>",
    latestAnalysis: {
      ...createIpo().latestAnalysis,
      keyPoints: ["<script>alert(1)</script>"],
      warnings: [],
    },
  });

  const message = buildClosingDayAnalysisMessage(ipo, verifiedQuality);
  const html = renderMessageHtml(message);

  assert.equal(message.footer.includes("정량 점수는 현재 비공개 상태입니다."), true);
  assert.equal(message.sections[0]?.lines.some((line) => line.includes("정량 점수는 현재 비공개 상태입니다.")), true);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
  assert.equal(html.includes("&lt;테스트 종목&gt;"), true);
});
