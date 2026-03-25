import type { IpoRecord } from "@/lib/types";

type QualityStatus = "VERIFIED" | "PARTIAL" | "BLOCKED";

type QualityInput = Pick<
  IpoRecord,
  | "market"
  | "leadManager"
  | "kindIssueCode"
  | "kindBizProcessNo"
  | "offerPrice"
  | "minimumSubscriptionShares"
  | "depositRate"
  | "generalSubscriptionCompetitionRate"
  | "refundDate"
  | "listingDate"
  | "floatRatio"
>;

export type IpoDataQualitySummary = {
  status: QualityStatus;
  label: string;
  detail: string;
  shouldSendAlert: boolean;
  criticalMissing: string[];
  optionalMissing: string[];
  confirmedFacts: string[];
  sourceChecks: string[];
  marketLabel: string;
  leadManagerLabel: string;
};

const isKnownLeadManager = (value: string | null | undefined) =>
  Boolean(value && value.trim() && value.trim() !== "-");

const isKnownMarket = (value: string | null | undefined) =>
  Boolean(value && value.trim() && value.trim() !== "기타법인");

const formatMissingPreview = (values: string[]) =>
  values.length <= 3 ? values.join(", ") : `${values.slice(0, 3).join(", ")} 외 ${values.length - 3}개`;

export const assessIpoDataQuality = (ipo: QualityInput): IpoDataQualitySummary => {
  const criticalMissing: string[] = [];
  const optionalMissing: string[] = [];
  const confirmedFacts: string[] = [];
  const sourceChecks: string[] = [];

  if (ipo.offerPrice == null) {
    criticalMissing.push("확정 공모가");
  } else {
    confirmedFacts.push("확정 공모가");
  }

  if (!ipo.refundDate) {
    criticalMissing.push("환불일");
  } else {
    confirmedFacts.push("환불일");
    sourceChecks.push("환불일 확인");
  }

  if (!ipo.listingDate) {
    optionalMissing.push("상장 예정일");
  } else {
    confirmedFacts.push("상장 예정일");
    sourceChecks.push("상장 예정일 확인");
  }

  if (!isKnownLeadManager(ipo.leadManager)) {
    criticalMissing.push("주관사");
  } else {
    confirmedFacts.push("주관사");
    sourceChecks.push("주관사 확인");
  }

  if (!isKnownMarket(ipo.market)) {
    optionalMissing.push("시장구분");
  } else {
    confirmedFacts.push("시장구분");
  }

  if (ipo.minimumSubscriptionShares == null) {
    optionalMissing.push("최소청약주수");
  }

  if (ipo.depositRate == null) {
    optionalMissing.push("증거금률");
  }

  if (ipo.generalSubscriptionCompetitionRate == null) {
    optionalMissing.push("일반청약 경쟁률");
  }

  if (ipo.floatRatio == null) {
    optionalMissing.push("유통가능물량");
  }

  if (ipo.kindIssueCode && ipo.kindBizProcessNo) {
    sourceChecks.push("KIND 일정/상세 연동");
  } else {
    optionalMissing.push("KIND 일정 연동");
  }

  if (ipo.offerPrice != null) {
    sourceChecks.push("공모가 확인");
  }

  if (ipo.minimumSubscriptionShares != null && ipo.depositRate != null) {
    sourceChecks.push("최소청약금액 계산 가능");
  }

  if (criticalMissing.length > 0) {
    return {
      status: "BLOCKED",
      label: "발송 보류",
      detail: `핵심 정보 ${formatMissingPreview(criticalMissing)}이(가) 없어 자동 메일 발송을 보류합니다.`,
      shouldSendAlert: false,
      criticalMissing,
      optionalMissing,
      confirmedFacts,
      sourceChecks: [...new Set(sourceChecks)],
      marketLabel: isKnownMarket(ipo.market) ? ipo.market : "미확인",
      leadManagerLabel: isKnownLeadManager(ipo.leadManager) ? ipo.leadManager.trim() : "미확인",
    };
  }

  if (optionalMissing.length > 0) {
    return {
      status: "PARTIAL",
      label: "일부 미확인",
      detail: `자동 발송 기준 핵심 정보는 확인했지만 ${formatMissingPreview(optionalMissing)}은(는) 아직 추가 검증 중입니다.`,
      shouldSendAlert: true,
      criticalMissing,
      optionalMissing,
      confirmedFacts,
      sourceChecks: [...new Set(sourceChecks)],
      marketLabel: isKnownMarket(ipo.market) ? ipo.market : "미확인",
      leadManagerLabel: ipo.leadManager.trim(),
    };
  }

  return {
    status: "VERIFIED",
    label: "검증 완료",
    detail: "자동 발송 기준 핵심 정보와 주요 일정 정보를 확인했습니다.",
    shouldSendAlert: true,
    criticalMissing,
    optionalMissing,
    confirmedFacts,
    sourceChecks: [...new Set(sourceChecks)],
    marketLabel: ipo.market,
    leadManagerLabel: ipo.leadManager.trim(),
  };
};
