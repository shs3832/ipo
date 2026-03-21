import { env } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";

type OpendartProspectusDetails = {
  receiptNo: string;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
};

type FetchOpendartProspectusDetailsOptions = {
  forceRefresh?: boolean;
};

const OPENDART_BASE_URL = "https://dart.fss.or.kr";
const OPENDART_PROSPECTUS_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " "));

const normalizeText = (value: string) => stripTags(value).replace(/\s+/g, " ").trim();

const parseInteger = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseFloatNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractViewerArgs = (html: string) => {
  const initialViewMatch = html.match(
    /viewDoc\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]*)"\)/,
  );

  if (!initialViewMatch) {
    return null;
  }

  return {
    receiptNo: initialViewMatch[1],
    documentNo: initialViewMatch[2],
    elementId: initialViewMatch[3],
    offset: initialViewMatch[4],
    length: initialViewMatch[5],
    dtd: initialViewMatch[6],
  };
};

const extractPriceBand = (text: string) => {
  const patterns = [
    /희망\s*공모가(?:액)?(?:\s*밴드|\s*범위)?[^\d]{0,40}(\d[\d,]*)\s*원?\s*[~\-]\s*(\d[\d,]*)\s*원/g,
    /희망가액[^\d]{0,40}(\d[\d,]*)\s*원?\s*[~\-]\s*(\d[\d,]*)\s*원/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const low = parseInteger(match[1]);
      const high = parseInteger(match[2]);
      if (low != null && high != null && low <= high) {
        return { priceBandLow: low, priceBandHigh: high };
      }
    }
  }

  return { priceBandLow: null, priceBandHigh: null };
};

const extractDepositRate = (text: string) => {
  const patterns = [
    /일반청약자의\s*청약증거금(?:은)?\s*청약금액의\s*(\d+(?:\.\d+)?)\s*%/g,
    /청약증거금(?:은|:)?\s*청약금액의\s*(\d+(?:\.\d+)?)\s*%/g,
    /증거금율[^\d]{0,40}(\d+(?:\.\d+)?)\s*%/g,
    /증거금률[^\d]{0,40}(\d+(?:\.\d+)?)\s*%/g,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const parsed = parseFloatNumber(match[1]);
      if (parsed != null) {
        return parsed / 100;
      }
    }
  }

  return null;
};

const extractMinimumSubscriptionShares = (text: string) => {
  const directPatterns = [
    /최소\s*청약(?:주수|수량)?[^\d]{0,20}(\d[\d,]*)\s*주/g,
    /청약단위[^\d]{0,40}(\d[\d,]*)\s*주\s*이상/g,
  ];

  for (const pattern of directPatterns) {
    const matches = [...text.matchAll(pattern)]
      .map((match) => parseInteger(match[1]))
      .filter((value): value is number => value != null && value > 0);

    if (matches.length > 0) {
      return Math.min(...matches);
    }
  }

  const rangeMatches = [...text.matchAll(/청약단위[\s\S]{0,200}?(\d[\d,]*)\s*주\s*이상/g)]
    .map((match) => parseInteger(match[1]))
    .filter((value): value is number => value != null && value > 0);

  return rangeMatches.length > 0 ? Math.min(...rangeMatches) : null;
};

const fetchViewerDocumentHtml = async (receiptNo: string) => {
  const mainHtml = await (await fetch(`${OPENDART_BASE_URL}/dsaf001/main.do?rcpNo=${encodeURIComponent(receiptNo)}`, {
    cache: "no-store",
  })).text();

  const viewerArgs = extractViewerArgs(mainHtml);
  if (!viewerArgs) {
    throw new Error(`OpenDART viewer args not found for receipt ${receiptNo}`);
  }

  const viewerUrl = new URL(`${OPENDART_BASE_URL}/report/viewer.do`);
  viewerUrl.searchParams.set("rcpNo", viewerArgs.receiptNo);
  viewerUrl.searchParams.set("dcmNo", viewerArgs.documentNo);
  viewerUrl.searchParams.set("eleId", viewerArgs.elementId);
  viewerUrl.searchParams.set("offset", viewerArgs.offset);
  viewerUrl.searchParams.set("length", viewerArgs.length);
  viewerUrl.searchParams.set("dtd", viewerArgs.dtd);

  const response = await fetch(viewerUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`OpenDART viewer request failed: HTTP ${response.status}`);
  }

  return response.text();
};

const fetchOpendartProspectusDetailsUncached = async (
  receiptNo: string,
): Promise<OpendartProspectusDetails> => {
  const viewerHtml = await fetchViewerDocumentHtml(receiptNo);
  const normalizedText = normalizeText(viewerHtml);
  const { priceBandLow, priceBandHigh } = extractPriceBand(normalizedText);

  return {
    receiptNo,
    priceBandLow,
    priceBandHigh,
    minimumSubscriptionShares: extractMinimumSubscriptionShares(normalizedText),
    depositRate: extractDepositRate(normalizedText),
  };
};

export const fetchOpendartProspectusDetails = async (
  receiptNo: string,
  { forceRefresh = false }: FetchOpendartProspectusDetailsOptions = {},
): Promise<OpendartProspectusDetails> => {
  if (!env.opendartApiKey) {
    return {
      receiptNo,
      priceBandLow: null,
      priceBandHigh: null,
      minimumSubscriptionShares: null,
      depositRate: null,
    };
  }

  return getCachedExternalData(
    {
      key: `opendart-prospectus:${receiptNo}`,
      source: "opendart-prospectus",
      ttlMs: OPENDART_PROSPECTUS_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => fetchOpendartProspectusDetailsUncached(receiptNo),
  );
};
