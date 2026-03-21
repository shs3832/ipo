import { getCachedExternalData } from "@/lib/external-cache";

type KindOfferDetails = {
  issueCode: string;
  bizProcessNo: string;
  offerPrice: number | null;
  listingDate: string | null;
  refundDate: string | null;
  generalSubscriptionCompetitionRate: number | null;
  irStart: string | null;
  irEnd: string | null;
  demandForecastStart: string | null;
  demandForecastEnd: string | null;
  tradableShares: number | null;
  floatRatio: number | null;
};

type FetchKindOfferDetailsOptions = {
  forceRefresh?: boolean;
};

const KIND_BASE_URL = "https://kind.krx.co.kr";
const KIND_OFFER_DETAILS_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const parseInteger = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^\d]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseFloatNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDateValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const parseDateRangeValue = (value: string | null | undefined) => {
  if (!value) {
    return { start: null, end: null };
  }

  const matches = [...value.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]);
  if (matches.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: matches[0] ?? null,
    end: matches[matches.length - 1] ?? null,
  };
};

const parseRatio = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const match = value.match(/([\d,.]+)\s*:\s*1/);
  return match ? parseFloatNumber(match[1]) : null;
};

const extractLabelValuePairs = (html: string) => {
  const pairs = new Map<string, string>();

  for (const match of html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g)) {
    pairs.set(stripTags(match[1]), stripTags(match[2]));
  }

  return pairs;
};

const fetchKindDetailHtml = async (method: string, issueCode: string, bizProcessNo: string) => {
  const response = await fetch(
    `${KIND_BASE_URL}/listinvstg/listcomdetail.do?method=${encodeURIComponent(method)}&isurCd=${encodeURIComponent(issueCode)}&bzProcsNo=${encodeURIComponent(bizProcessNo)}`,
    {
      cache: "no-store",
    },
  );

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`KIND detail request failed: HTTP ${response.status}`);
  }

  if (html.includes("KRX 홈페이지 시스템 점검 안내")) {
    throw new Error("KIND detail request failed: maintenance page returned");
  }

  return html;
};

const fetchKindOfferDetailsUncached = async (
  issueCode: string,
  bizProcessNo: string,
): Promise<KindOfferDetails> => {
  const [overviewHtml, offerHtml] = await Promise.all([
    fetchKindDetailHtml("searchListComOvrvwDetail", issueCode, bizProcessNo),
    fetchKindDetailHtml("searchListComPubofrDetail", issueCode, bizProcessNo),
  ]);

  const overviewPairs = extractLabelValuePairs(overviewHtml);
  const offerPairs = extractLabelValuePairs(offerHtml);
  const tradableShares = parseInteger(overviewPairs.get("유통가능주식수"));
  const listedShares = parseInteger(overviewPairs.get("상장주식수"));
  const irSchedule = parseDateRangeValue(offerPairs.get("IR일정"));
  const demandSchedule = parseDateRangeValue(offerPairs.get("수요예측일정"));

  return {
    issueCode,
    bizProcessNo,
    offerPrice: parseInteger(offerPairs.get("공모가격")),
    listingDate: parseDateValue(offerPairs.get("상장일")),
    refundDate: parseDateValue(offerPairs.get("납입일")),
    generalSubscriptionCompetitionRate: parseRatio(offerPairs.get("청약경쟁률")),
    irStart: irSchedule.start,
    irEnd: irSchedule.end,
    demandForecastStart: demandSchedule.start,
    demandForecastEnd: demandSchedule.end,
    tradableShares,
    floatRatio:
      tradableShares != null && listedShares != null && listedShares > 0
        ? Number(((tradableShares / listedShares) * 100).toFixed(1))
        : null,
  };
};

export const fetchKindOfferDetails = async (
  issueCode: string,
  bizProcessNo: string,
  { forceRefresh = false }: FetchKindOfferDetailsOptions = {},
): Promise<KindOfferDetails> =>
  getCachedExternalData(
    {
      key: `kind-offer-details:${issueCode}:${bizProcessNo}`,
      source: "kind-offer-details",
      ttlMs: KIND_OFFER_DETAILS_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => fetchKindOfferDetailsUncached(issueCode, bizProcessNo),
  );
