import assert from "node:assert/strict";
import test from "node:test";

import { type IpoDataQualitySummary } from "@/lib/ipo-data-quality";
import {
  buildAlertPreparationLogEntry,
  buildAlertPreparationSummary,
  buildClosingDayAnalysisMessage,
  buildDispatchSelectionLogEntry,
  buildDispatchSelectionSummary,
  createDeliveryIdempotencyKey,
  renderMessageHtml,
} from "@/lib/server/alert-service";
import type { IpoRecord, NotificationJobRecord, RecipientRecord } from "@/lib/types";

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

const partialQuality: IpoDataQualitySummary = {
  ...verifiedQuality,
  status: "PARTIAL",
  label: "일부 미확인",
  detail: "일부 항목은 추가 검증 중입니다.",
  optionalMissing: ["상장 예정일"],
};

const blockedQuality: IpoDataQualitySummary = {
  ...verifiedQuality,
  status: "BLOCKED",
  label: "발송 보류",
  detail: "핵심 정보가 부족합니다.",
  shouldSendAlert: false,
  criticalMissing: ["환불일"],
};

const createNotificationJob = (overrides: Partial<NotificationJobRecord> = {}): NotificationJobRecord => ({
  id: overrides.id ?? "job-1",
  ipoId: overrides.ipoId ?? "ipo-1",
  ipoSlug: overrides.ipoSlug ?? "ipo-1",
  alertType: overrides.alertType ?? "CLOSING_DAY_ANALYSIS",
  scheduledFor: overrides.scheduledFor ?? new Date("2026-04-01T01:00:00.000Z"),
  payload: overrides.payload ?? {
    subject: "[공모주] 테스트 종목 오늘 청약 마감 - 10시 분석",
    tags: [],
    intro: "intro",
    webUrl: null,
    sections: [],
    footer: [],
  },
  status: overrides.status ?? "READY",
  idempotencyKey: overrides.idempotencyKey ?? "job-1:key",
});

const createRecipient = (overrides: Partial<RecipientRecord> = {}): RecipientRecord => ({
  id: overrides.id ?? "recipient-1",
  name: overrides.name ?? "관리자",
  status: overrides.status ?? "ACTIVE",
  inviteState: overrides.inviteState ?? "INTERNAL",
  consentedAt: overrides.consentedAt ?? null,
  unsubscribedAt: overrides.unsubscribedAt ?? null,
  channels: overrides.channels ?? [
    {
      id: "channel-1",
      type: "EMAIL",
      address: "shs3832@gmail.com",
      isPrimary: true,
      isVerified: true,
    },
  ],
});

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

test("buildAlertPreparationSummary and log entry explain why no alerts were prepared", () => {
  const todayClosingIpo = createIpo({ name: "테스트 종목 A" });
  const spacIpo = createIpo({ id: "ipo-2", slug: "spac-ipo", name: "테스트스팩", leadManager: "미래에셋증권" });
  const blockedIpo = createIpo({ id: "ipo-3", slug: "blocked-ipo", name: "테스트 종목 B" });
  const partialIpo = createIpo({ id: "ipo-4", slug: "partial-ipo", name: "테스트 종목 C" });

  const summary = buildAlertPreparationSummary(
    [todayClosingIpo, spacIpo, blockedIpo, partialIpo],
    [spacIpo],
    [
      { ipo: todayClosingIpo, dataQuality: verifiedQuality },
      { ipo: blockedIpo, dataQuality: blockedQuality },
      { ipo: partialIpo, dataQuality: partialQuality },
    ],
  );
  const logEntry = buildAlertPreparationLogEntry("10시 분석 알림", summary);

  assert.deepEqual(summary.totalClosingIpoNames, ["테스트 종목 A", "테스트스팩", "테스트 종목 B", "테스트 종목 C"]);
  assert.equal(summary.excludedSpacCount, 1);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.partialCount, 1);
  assert.equal(summary.readyCount, 2);
  assert.equal(logEntry.action, "alert_candidate_summary");
  assert.equal(logEntry.message, "10시 분석 알림 후보 4건 중 준비 2건, 스팩 제외 1건, 발송 보류 1건입니다.");
});

test("buildDispatchSelectionSummary and log entry distinguish zero-send runs from real deliveries", () => {
  const dueJob = createNotificationJob();
  const summary = buildDispatchSelectionSummary({
    preparedJobs: [],
    persistedReadyJobs: [],
    mergedJobs: [],
    dueJobs: [],
    dispatchableJobs: [],
    staleJobs: [],
    recipients: [createRecipient()],
  });
  const emptyLogEntry = buildDispatchSelectionLogEntry("10시 분석 메일", summary);

  assert.equal(emptyLogEntry.action, "no_dispatchable_jobs");
  assert.equal(emptyLogEntry.message, "10시 분석 메일 발송 시점에 준비된 메일이 없어 실제 전송을 하지 않았습니다.");

  const readySummary = buildDispatchSelectionSummary({
    preparedJobs: [dueJob],
    persistedReadyJobs: [],
    mergedJobs: [dueJob],
    dueJobs: [dueJob],
    dispatchableJobs: [dueJob],
    staleJobs: [],
    recipients: [createRecipient(), createRecipient({
      id: "recipient-2",
      channels: [
        {
          id: "channel-2",
          type: "EMAIL",
          address: "shs3832@naver.com",
          isPrimary: true,
          isVerified: true,
        },
      ],
    })],
  });
  const readyLogEntry = buildDispatchSelectionLogEntry("10시 분석 메일", readySummary);

  assert.equal(readyLogEntry.action, "dispatch_selection_summary");
  assert.equal(readyLogEntry.message, "10시 분석 메일 발송 대상 1건, 수신자 2명, 이메일 채널 2개를 확인했습니다.");
  assert.deepEqual(readySummary.dispatchableJobs, [
    {
      id: "job-1",
      ipoSlug: "ipo-1",
      subject: "[공모주] 테스트 종목 오늘 청약 마감 - 10시 분석",
      scheduledFor: "2026-04-01T01:00:00.000Z",
      status: "READY",
    },
  ]);
});
