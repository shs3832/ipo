import { getKstMonthRange } from "@/lib/date";
import { getCachedExternalData } from "@/lib/external-cache";

type KindListingScheduleRecord = {
  name: string;
  listingDate: string;
  bizProcessNo: string;
};

type FetchKindListingScheduleOptions = {
  forceRefresh?: boolean;
};

const KIND_BASE_URL = "https://kind.krx.co.kr";
const KIND_LISTING_SCHEDULE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

export const extractKindListingScheduleEntries = (
  html: string,
  year: string,
  month: string,
): KindListingScheduleRecord[] => {
  const cellPattern = /<td\b[^>]*>\s*(\d{1,2})\s*<ul>([\s\S]*?)<\/ul>\s*<\/td>/g;
  const entryPattern = /<li>\s*<a\b[^>]*onclick="fnDetailView\('([^']*)'\)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g;
  const monthKey = month.padStart(2, "0");
  const records: KindListingScheduleRecord[] = [];

  for (const [, day, listHtml] of html.matchAll(cellPattern)) {
    const dayKey = String(day).padStart(2, "0");

    for (const entryMatch of listHtml.matchAll(entryPattern)) {
      const bizProcessNo = entryMatch[1]?.trim();
      const name = stripTags(entryMatch[2]);

      if (!bizProcessNo || !name) {
        continue;
      }

      records.push({
        name,
        listingDate: `${year}-${monthKey}-${dayKey}`,
        bizProcessNo,
      });
    }
  }

  return records;
};

const fetchKindListingScheduleMonth = async (year: string, month: string): Promise<KindListingScheduleRecord[]> => {
  const body = new URLSearchParams({
    method: "searchPubofrScholCalnd",
    forward: "pubofrSchol_sub",
    marketType: "",
    scholType: "2",
    selYear: year,
    selMonth: month.padStart(2, "0"),
  });

  const response = await fetch(`${KIND_BASE_URL}/listinvstg/pubofrschdl.do`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
    cache: "no-store",
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`KIND listing schedule request failed: HTTP ${response.status}`);
  }

  if (html.includes("페이지 오류") || html.includes("KRX 홈페이지 시스템 점검 안내")) {
    throw new Error("KIND listing schedule request failed: invalid calendar response returned");
  }

  return extractKindListingScheduleEntries(html, year, month);
};

const buildScheduleRange = (date = new Date()) => {
  const currentMonth = getKstMonthRange(date, 0);
  const nextMonth = getKstMonthRange(date, 1);

  return {
    key: `${currentMonth.key}_${nextMonth.key}`,
    months: [currentMonth, nextMonth],
  };
};

export const fetchKindListingSchedule = async ({
  forceRefresh = false,
}: FetchKindListingScheduleOptions = {}): Promise<KindListingScheduleRecord[]> => {
  const range = buildScheduleRange();

  return getCachedExternalData(
    {
      key: `kind-listing-schedule:${range.key}`,
      source: "kind-listing-schedule",
      ttlMs: KIND_LISTING_SCHEDULE_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => {
      const monthResults = await Promise.all(
        range.months.map((month) =>
          fetchKindListingScheduleMonth(String(month.start.getFullYear()), String(month.start.getMonth() + 1)),
        ),
      );

      return [
        ...new Map(
          monthResults
            .flat()
            .map((record) => [`${record.bizProcessNo}:${record.listingDate}`, record] as const),
        ).values(),
      ];
    },
  );
};
