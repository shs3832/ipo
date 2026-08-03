import {
  atKstTime,
  getKstTodayKey,
  kstDateKey,
  shiftKstDateKey,
} from "@/lib/date";
import {
  assessIpoDataQuality,
  type IpoDataQualityInput,
  type IpoDataQualitySummary,
} from "@/lib/ipo-data-quality";
import { isSpacIpo } from "@/lib/ipo-classification";
import type { IpoRecord } from "@/lib/types";

const DAILY_SYNC_HOUR_KST = 6;

export type AdminIpoQualityInput = IpoDataQualityInput & Pick<
  IpoRecord,
  "id" | "slug" | "name" | "latestSourceKey" | "sourceFetchedAt"
>;

export type IpoSourceFreshnessStatus = "FRESH" | "NEEDS_REFRESH" | "STALE";
export type AdminIpoScheduleStatus = "TODAY" | "UPCOMING" | "PAST";

export type IpoSourceFreshnessSummary = {
  status: IpoSourceFreshnessStatus;
  label: string;
  detail: string;
  expectedSyncAt: Date;
};

export type AdminIpoQualityRecord = {
  id: string;
  slug: string;
  name: string;
  subscriptionEnd: Date;
  scheduleStatus: AdminIpoScheduleStatus;
  isClosingToday: boolean;
  isAlertEligible: boolean;
  dataQuality: IpoDataQualitySummary;
  sourceFreshness: IpoSourceFreshnessSummary;
  latestSourceKey: string;
  sourceFetchedAt: Date;
};

export type AdminIpoQualityOverview = {
  generatedAt: Date;
  records: AdminIpoQualityRecord[];
  counts: {
    total: number;
    active: number;
    eligible: number;
    excludedSpac: number;
    verified: number;
    partial: number;
    blocked: number;
    fresh: number;
    needsRefresh: number;
    stale: number;
    closingToday: number;
    sendableClosingToday: number;
    blockedClosingToday: number;
    excludedSpacClosingToday: number;
  };
};

export const getAdminIpoSourceLabel = (sourceKey: string) => {
  const normalizedSourceKey = sourceKey.toLowerCase();

  if (normalizedSourceKey.includes("opendart")) {
    return "OpenDART";
  }

  if (normalizedSourceKey.includes("kind")) {
    return "KIND";
  }

  if (normalizedSourceKey.includes("seibro")) {
    return "SEIBro";
  }

  if (normalizedSourceKey.includes("broker")) {
    return "증권사 자료";
  }

  if (normalizedSourceKey.includes("fallback")) {
    return "Fallback";
  }

  return "외부 수집원";
};

const getLatestExpectedDailySyncAt = (now: Date) => {
  const todayKey = getKstTodayKey(now);
  const todaySyncAt = atKstTime(todayKey, DAILY_SYNC_HOUR_KST);

  return now >= todaySyncAt
    ? todaySyncAt
    : atKstTime(shiftKstDateKey(todayKey, -1), DAILY_SYNC_HOUR_KST);
};

export const assessIpoSourceFreshness = (
  sourceFetchedAt: Date,
  now = new Date(),
): IpoSourceFreshnessSummary => {
  const expectedSyncAt = getLatestExpectedDailySyncAt(now);
  const previousExpectedSyncAt = atKstTime(
    shiftKstDateKey(kstDateKey(expectedSyncAt), -1),
    DAILY_SYNC_HOUR_KST,
  );

  if (sourceFetchedAt >= expectedSyncAt) {
    return {
      status: "FRESH",
      label: "최신",
      detail: "가장 최근 06:00 동기화 주기 이후 수집된 데이터입니다.",
      expectedSyncAt,
    };
  }

  if (sourceFetchedAt >= previousExpectedSyncAt) {
    return {
      status: "NEEDS_REFRESH",
      label: "갱신 필요",
      detail: "가장 최근 06:00 동기화 주기 이후 갱신되지 않았습니다.",
      expectedSyncAt,
    };
  }

  return {
    status: "STALE",
    label: "오래됨",
    detail: "두 번 이상의 06:00 동기화 주기 동안 갱신되지 않았습니다.",
    expectedSyncAt,
  };
};

const getScheduleStatus = (subscriptionEnd: Date, todayKey: string): AdminIpoScheduleStatus => {
  const subscriptionEndKey = kstDateKey(subscriptionEnd);

  if (subscriptionEndKey === todayKey) {
    return "TODAY";
  }

  return subscriptionEndKey > todayKey ? "UPCOMING" : "PAST";
};

const scheduleStatusOrder: Record<AdminIpoScheduleStatus, number> = {
  TODAY: 0,
  UPCOMING: 1,
  PAST: 2,
};

const qualityStatusOrder: Record<IpoDataQualitySummary["status"], number> = {
  BLOCKED: 0,
  PARTIAL: 1,
  VERIFIED: 2,
};

const freshnessStatusOrder: Record<IpoSourceFreshnessStatus, number> = {
  STALE: 0,
  NEEDS_REFRESH: 1,
  FRESH: 2,
};

const compareAdminIpoQualityRecords = (
  left: AdminIpoQualityRecord,
  right: AdminIpoQualityRecord,
) => {
  const scheduleDifference = scheduleStatusOrder[left.scheduleStatus]
    - scheduleStatusOrder[right.scheduleStatus];

  if (scheduleDifference !== 0) {
    return scheduleDifference;
  }

  const dateDifference = left.subscriptionEnd.getTime() - right.subscriptionEnd.getTime();
  if (dateDifference !== 0) {
    return left.scheduleStatus === "PAST" ? -dateDifference : dateDifference;
  }

  const qualityDifference = qualityStatusOrder[left.dataQuality.status]
    - qualityStatusOrder[right.dataQuality.status];
  if (qualityDifference !== 0) {
    return qualityDifference;
  }

  const freshnessDifference = freshnessStatusOrder[left.sourceFreshness.status]
    - freshnessStatusOrder[right.sourceFreshness.status];
  if (freshnessDifference !== 0) {
    return freshnessDifference;
  }

  return left.name.localeCompare(right.name, "ko-KR");
};

export const buildAdminIpoQualityOverview = (
  ipos: AdminIpoQualityInput[],
  now = new Date(),
): AdminIpoQualityOverview => {
  const todayKey = getKstTodayKey(now);
  const records = ipos.map((ipo): AdminIpoQualityRecord => {
    const scheduleStatus = getScheduleStatus(ipo.subscriptionEnd, todayKey);

    return {
      id: ipo.id,
      slug: ipo.slug,
      name: ipo.name,
      subscriptionEnd: ipo.subscriptionEnd,
      scheduleStatus,
      isClosingToday: scheduleStatus === "TODAY",
      isAlertEligible: !isSpacIpo(ipo),
      dataQuality: assessIpoDataQuality(ipo),
      sourceFreshness: assessIpoSourceFreshness(ipo.sourceFetchedAt, now),
      latestSourceKey: ipo.latestSourceKey,
      sourceFetchedAt: ipo.sourceFetchedAt,
    };
  }).sort(compareAdminIpoQualityRecords);
  const activeRecords = records.filter((record) => record.scheduleStatus !== "PAST");
  const eligibleRecords = activeRecords.filter((record) => record.isAlertEligible);

  return {
    generatedAt: now,
    records,
    counts: {
      total: records.length,
      active: activeRecords.length,
      eligible: eligibleRecords.length,
      excludedSpac: activeRecords.length - eligibleRecords.length,
      verified: eligibleRecords.filter((record) => record.dataQuality.status === "VERIFIED").length,
      partial: eligibleRecords.filter((record) => record.dataQuality.status === "PARTIAL").length,
      blocked: eligibleRecords.filter((record) => record.dataQuality.status === "BLOCKED").length,
      fresh: eligibleRecords.filter((record) => record.sourceFreshness.status === "FRESH").length,
      needsRefresh: eligibleRecords.filter((record) => record.sourceFreshness.status === "NEEDS_REFRESH").length,
      stale: eligibleRecords.filter((record) => record.sourceFreshness.status === "STALE").length,
      closingToday: activeRecords.filter((record) => record.isClosingToday).length,
      sendableClosingToday: eligibleRecords.filter(
        (record) => record.isClosingToday && record.dataQuality.shouldSendAlert,
      ).length,
      blockedClosingToday: eligibleRecords.filter(
        (record) => record.isClosingToday && !record.dataQuality.shouldSendAlert,
      ).length,
      excludedSpacClosingToday: activeRecords.filter(
        (record) => record.isClosingToday && !record.isAlertEligible,
      ).length,
    },
  };
};
