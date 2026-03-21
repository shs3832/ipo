import { getKstMonthRange } from "@/lib/date";
import { getCachedExternalData } from "@/lib/external-cache";

type KindListingRecord = {
  name: string;
  listingDate: string;
  isurCd: string;
  bzProcsNo: string;
};

type FetchKindListingDatesOptions = {
  forceRefresh?: boolean;
};

const KIND_BASE_URL = "https://kind.krx.co.kr";
const KIND_SOURCE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const LISTING_PAGE_SIZE = 3000;

const buildDisplayRange = () => {
  const currentMonth = getKstMonthRange(new Date(), 0);
  const nextMonth = getKstMonthRange(new Date(), 1);

  return {
    key: `${currentMonth.key}_${nextMonth.key}`,
    fromDate: currentMonth.startKey,
    toDate: nextMonth.endKey,
  };
};

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const extractRows = (html: string) => {
  const rowPattern = /<tr\b[^>]*onclick="fnDetailView\('([^']*)','([^']*)'\)"[^>]*>([\s\S]*?)<\/tr>/g;
  const records: KindListingRecord[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const isurCd = match[1]?.trim();
    const bzProcsNo = match[2]?.trim();
    const rowHtml = match[3];
    const cellMatches = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];

    if (!isurCd || !bzProcsNo || cellMatches.length < 2) {
      continue;
    }

    const firstCellAttrs = cellMatches[0][1];
    const nameFromTitle = firstCellAttrs.match(/title="([^"]+)"/)?.[1] ?? null;
    const name = nameFromTitle ? decodeHtml(nameFromTitle).trim() : stripTags(cellMatches[0][2]);
    const listingDate = stripTags(cellMatches[1][2]);

    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(listingDate)) {
      continue;
    }

    records.push({
      name,
      listingDate,
      isurCd,
      bzProcsNo,
    });
  }

  return records;
};

const fetchKindListingDatesUncached = async (
  fromDate: string,
  toDate: string,
): Promise<KindListingRecord[]> => {
  const body = new URLSearchParams({
    method: "searchListingTypeSub",
    forward: "listingtype_sub",
    currentPageSize: String(LISTING_PAGE_SIZE),
    pageIndex: "1",
    orderMode: "1",
    orderStat: "D",
    marketType: "",
    country: "",
    industry: "",
    repMajAgntComp: "",
    designAdvserComp: "",
    fromDate,
    toDate,
    listTypeArrStr: "01|",
    choicTypeArrStr: "",
    secuGrpArrStr: "0|ST|FS|MF|SC|RT|IF|DR|",
    searchCorpName: "",
  });

  const response = await fetch(`${KIND_BASE_URL}/listinvstg/listingcompany.do`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
    cache: "no-store",
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`KIND listing request failed: HTTP ${response.status}`);
  }

  if (html.includes("KRX 홈페이지 시스템 점검 안내")) {
    throw new Error("KIND listing request failed: maintenance page returned");
  }

  return extractRows(html);
};

export const fetchKindListingDates = async ({
  forceRefresh = false,
}: FetchKindListingDatesOptions = {}): Promise<KindListingRecord[]> => {
  const displayRange = buildDisplayRange();

  return getCachedExternalData(
    {
      key: `kind-listing-dates:${displayRange.key}`,
      source: "kind-listing-dates",
      ttlMs: KIND_SOURCE_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => fetchKindListingDatesUncached(displayRange.fromDate, displayRange.toDate),
  );
};
