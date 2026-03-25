import { getCachedExternalData } from "@/lib/external-cache";

type KindStockPriceSnapshot = {
  issueCode: string;
  shortCode: string | null;
  priceDate: string | null;
  priceAsOf: string | null;
  openingPrice: number | null;
  currentPrice: number | null;
  previousClosePrice: number | null;
};

type FetchKindStockPriceSnapshotOptions = {
  forceRefresh?: boolean;
};

const KIND_BASE_URL = "https://kind.krx.co.kr";
const KIND_STOCK_PRICE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const stripTags = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const parseNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!normalized || normalized === "-") {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractPriceAsOf = (html: string) =>
  html.match(/\*\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)\s*(?:종가\s*)?기준/)?.[1] ?? null;

export const extractStockPriceSnapshot = (html: string, issueCode: string): KindStockPriceSnapshot => {
  const shortCode = html.match(/id="repIsuSrtCd"[^>]*value="([^"]+)"/)?.[1] ?? null;
  const priceAsOf = extractPriceAsOf(html);
  const priceDate = priceAsOf?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const labelValuePairs = new Map<string, string>();

  for (const match of html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g)) {
    labelValuePairs.set(stripTags(match[1]), stripTags(match[2]));
  }

  return {
    issueCode,
    shortCode,
    priceDate,
    priceAsOf,
    openingPrice: parseNumber(labelValuePairs.get("시가")),
    currentPrice: parseNumber(labelValuePairs.get("현재가")),
    previousClosePrice: parseNumber(labelValuePairs.get("전일가")),
  };
};

const fetchKindStockPriceSnapshotUncached = async (issueCode: string): Promise<KindStockPriceSnapshot> => {
  const response = await fetch(
    `${KIND_BASE_URL}/common/stockprices.do?method=searchStockPricesMain&isurCd=${encodeURIComponent(issueCode)}`,
    {
      cache: "no-store",
    },
  );

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`KIND stock price request failed: HTTP ${response.status}`);
  }

  if (html.includes("KRX 홈페이지 시스템 점검 안내")) {
    throw new Error("KIND stock price request failed: maintenance page returned");
  }

  return extractStockPriceSnapshot(html, issueCode);
};

export const fetchKindStockPriceSnapshot = async (
  issueCode: string,
  { forceRefresh = false }: FetchKindStockPriceSnapshotOptions = {},
): Promise<KindStockPriceSnapshot> =>
  getCachedExternalData(
    {
      key: `kind-stock-price:${issueCode}`,
      source: "kind-stock-price",
      ttlMs: KIND_STOCK_PRICE_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => fetchKindStockPriceSnapshotUncached(issueCode),
  );
