import { normalizeBrokerName } from "@/lib/broker-brand";
import { getCachedExternalData } from "@/lib/external-cache";
import type { SourceBrokerSubscriptionDetail, SourceIpoRecord } from "@/lib/types";

export type BrokerSubscriptionGuide = {
  brokerName: string;
  sourceRef: string;
  subscriptionFee: number | null;
  hasOnlineOnlyCondition: boolean;
  notes: string[];
};

export type KoreaInvestmentIpoEntry = {
  name: string;
  normalizedName: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  refundDate: string | null;
  maximumSubscriptionShares: number | null;
  offerPrice: number | null;
};

export type DaishinNoticeEntry = {
  seq: string;
  title: string;
  normalizedTitle: string;
  publishedDate: string | null;
  url: string;
};

export type DaishinNoticeDetail = {
  seq: string;
  title: string;
  publishedDate: string | null;
  sourceRefs: string[];
  generalCompetitionRate: number | null;
  maximumSubscriptionShares: number | null;
  subscriptionFee: number | null;
  allocatedShares: number | null;
  equalAllocatedShares: number | null;
  proportionalAllocatedShares: number | null;
  notes: string[];
};

type FetchBrokerSubscriptionOptions = {
  forceRefresh?: boolean;
};

type BrokerGuideSource = {
  cacheKey: string;
  url: string;
  parser: (html: string) => BrokerSubscriptionGuide;
};

type BrokerSubscriptionReferenceData = {
  guideByBroker: Map<string, BrokerSubscriptionGuide>;
  koreaInvestmentCatalog: KoreaInvestmentIpoEntry[];
  daishinNoticeEntries: DaishinNoticeEntry[];
};

type ParsedDaishinNoticeMetrics = {
  generalCompetitionRate: number | null;
  maximumSubscriptionShares: number | null;
  subscriptionFee: number | null;
  allocatedShares: number | null;
  equalAllocatedShares: number | null;
  proportionalAllocatedShares: number | null;
};

const BROKER_REFERENCE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const BROKER_PDF_TEXT_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const KOREA_INVESTMENT_GUIDE_URL = "https://www.truefriend.com/main/customer/tradetransfer/_static/TF04db020000.shtm";
const KOREA_INVESTMENT_IPO_URL = "https://www.truefriend.com/main/research/corporate/ipo/Ipo.jsp?cmd=TF09ad020000";
const SHINHAN_INVESTMENT_GUIDE_URL = "https://open.shinhansec.com/mobilealpha/html/CS/guidePOSS.html";
const KB_SECURITIES_GUIDE_URL = "https://www.kbsec.com/go.able?linkcd=m50010005";
const MIRAE_ASSET_GUIDE_URL = "https://trading.securities.miraeasset.com/hki/hki3095/n08.do";
const SAMSUNG_SECURITIES_GUIDE_URL = "https://www.samsungpop.com/ux/kor/customer/notice/notice/noticeViewContent.do?MenuSeqNo=16565";
const HANA_SECURITIES_GUIDE_URL = "https://www.hanaw.com/main/customer/cm/CS_060200_T1.jsp";
const DAISHIN_NOTICE_LIST_URL = "https://money2.daishin.com/E5/MBoard/PType_Basic/Mobile_Notice/DM_Basic_List.aspx?boardseq=114&m=3817";
const DAISHIN_NOTICE_BASE_URL = "https://money2.daishin.com/E5/MBoard/PType_Basic/Mobile_Notice/";

const CHARSET_ALIASES: Record<string, string> = {
  "utf-8": "utf-8",
  utf8: "utf-8",
  "euc-kr": "euc-kr",
  euckr: "euc-kr",
  cp949: "euc-kr",
  ms949: "euc-kr",
  "ks_c_5601-1987": "euc-kr",
  ksc5601: "euc-kr",
};

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const stripTags = (value: string) => normalizeWhitespace(decodeHtml(value.replace(/<[^>]+>/g, " ")));

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

const parseLocalizedFloat = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] ?? null;
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseFeeValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const explicitAmount = parseInteger(value);
  if (explicitAmount != null) {
    return explicitAmount;
  }

  return /(무료|면제)/.test(value) ? 0 : null;
};

const formatFeeLabel = (value: number | null) => {
  if (value == null) {
    return null;
  }

  return value === 0 ? "무료" : `${value.toLocaleString("ko-KR")}원`;
};

const parseLatestFeeFromRow = (row: string[]) =>
  row
    .map((cell) => parseFeeValue(cell))
    .filter((value): value is number => value != null)
    .at(-1) ?? null;

const normalizeCompanyNameForMatching = (value: string) =>
  value
    .replace(/주식회사|\(주\)|㈜/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

const normalizeFreeTextForMatching = (value: string) =>
  value
    .replace(/주식회사|\(주\)|㈜/g, "")
    .replace(/[^\p{Script=Hangul}A-Za-z0-9]/gu, "")
    .toLowerCase();

const parseDateRangeValue = (value: string) => {
  const matches = [...value.matchAll(/(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/g)].map(
    (match) => `${match[1]}-${match[2]}-${match[3]}`,
  );

  return {
    start: matches[0] ?? null,
    end: matches[matches.length - 1] ?? null,
  };
};

const parseDotDate = (value: string | null | undefined) => {
  const match = value?.match(/(20\d{2})\.(\d{2})\.(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const extractHtmlRows = (html: string) =>
  [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cellMatch) => stripTags(cellMatch[1]))
        .filter(Boolean),
    )
    .filter((row) => row.length > 0);

const extractTables = (html: string) =>
  [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]);

const extractTableByCaption = (html: string, captionPattern: RegExp) => {
  for (const table of extractTables(html)) {
    const caption = stripTags(table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? "");
    if (captionPattern.test(caption)) {
      return table;
    }
  }

  return null;
};

const extractSectionRows = (rows: string[][], sectionPattern: RegExp, size = 4) => {
  const sectionIndex = rows.findIndex((row) => row.some((cell) => sectionPattern.test(cell.replace(/\s+/g, ""))));
  return sectionIndex >= 0 ? rows.slice(sectionIndex, sectionIndex + size) : [];
};

const normalizeCharset = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return CHARSET_ALIASES[value.trim().toLowerCase()] ?? null;
};

const detectCharset = (contentType: string | null, preview: string) => {
  const headerCharset = normalizeCharset(contentType?.match(/charset=([^;]+)/i)?.[1] ?? null);
  if (headerCharset) {
    return headerCharset;
  }

  const metaCharset =
    normalizeCharset(preview.match(/<meta[^>]+charset=["']?\s*([a-z0-9_-]+)/i)?.[1] ?? null)
    ?? normalizeCharset(preview.match(/<meta[^>]+content=["'][^"']*charset=([a-z0-9_-]+)/i)?.[1] ?? null);

  return metaCharset ?? "utf-8";
};

const fetchBytes = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Broker subscription request failed: HTTP ${response.status} for ${url}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
};

const fetchText = async (url: string) => {
  const { bytes, contentType } = await fetchBytes(url);
  const preview = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const charset = detectCharset(contentType, preview);

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};

const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const extractFirstInteger = (value: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const parsed = parseInteger(match?.[1] ?? null);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
};

const extractFirstFloat = (value: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const parsed = parseLocalizedFloat(match?.[1] ?? null);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
};

const extractCompetitionRateFallback = (value: string) => {
  const rates = [...value.matchAll(/([\d,]+(?:\.\d+)?)\s*대\s*1/gi)]
    .map((match) => parseLocalizedFloat(match[1] ?? null))
    .filter((rate): rate is number => rate != null);

  return rates.length > 0 ? Math.min(...rates) : null;
};

const parseDaishinNoticeMetrics = (value: string): ParsedDaishinNoticeMetrics => ({
  generalCompetitionRate:
    extractFirstFloat(value, [
      /총\s*경쟁률[^0-9]{0,20}([\d,]+(?:\.\d+)?)\s*(?:대|:)\s*1/i,
      /총경쟁률\s*([\d,]+(?:\.\d+)?)\s*(?:대|:)\s*1/i,
    ])
    ?? extractCompetitionRateFallback(value),
  maximumSubscriptionShares: extractFirstInteger(value, [
    /일반고객\s*최고청약한도[^0-9]{0,40}([\d,]+)\s*주/i,
    /최고청약한도[^0-9]{0,20}([\d,]+)\s*주/i,
  ]),
  subscriptionFee: extractFirstInteger(value, [
    /청약\s*시\s*건당\s*([\d,]+)원/i,
    /온라인\s*청약\s*수수료[^0-9]{0,20}([\d,]+)원/i,
  ]),
  allocatedShares: extractFirstInteger(value, [
    /일반배정물량\s*([\d,]+)\s*주/i,
  ]),
  equalAllocatedShares: extractFirstInteger(value, [
    /균등배정\s*([\d,]+)\s*주/i,
  ]),
  proportionalAllocatedShares: extractFirstInteger(value, [
    /비례배정\s*([\d,]+)\s*주/i,
  ]),
});

const mergeDaishinMetrics = (
  primary: ParsedDaishinNoticeMetrics,
  fallback: ParsedDaishinNoticeMetrics,
): ParsedDaishinNoticeMetrics => ({
  generalCompetitionRate: primary.generalCompetitionRate ?? fallback.generalCompetitionRate,
  maximumSubscriptionShares: primary.maximumSubscriptionShares ?? fallback.maximumSubscriptionShares,
  subscriptionFee: primary.subscriptionFee ?? fallback.subscriptionFee,
  allocatedShares: primary.allocatedShares ?? fallback.allocatedShares,
  equalAllocatedShares: primary.equalAllocatedShares ?? fallback.equalAllocatedShares,
  proportionalAllocatedShares: primary.proportionalAllocatedShares ?? fallback.proportionalAllocatedShares,
});

const buildDaishinNotes = (detail: ParsedDaishinNoticeMetrics) => {
  const notes: string[] = [];

  if (detail.generalCompetitionRate != null) {
    notes.push(`대신증권 공지 기준 일반청약 경쟁률 ${detail.generalCompetitionRate.toLocaleString("ko-KR")}대1`);
  }

  if (detail.maximumSubscriptionShares != null) {
    notes.push(`대신증권 공지 기준 일반고객 최고청약한도 ${detail.maximumSubscriptionShares.toLocaleString("ko-KR")}주`);
  }

  if (detail.subscriptionFee != null) {
    notes.push(`대신증권 공지 기준 온라인 청약 수수료 ${formatFeeLabel(detail.subscriptionFee)}`);
  }

  if (detail.allocatedShares != null) {
    notes.push(`대신증권 공지 기준 일반배정물량 ${detail.allocatedShares.toLocaleString("ko-KR")}주`);
  }

  if (detail.equalAllocatedShares != null && detail.proportionalAllocatedShares != null) {
    notes.push(
      `대신증권 공지 기준 균등 ${detail.equalAllocatedShares.toLocaleString("ko-KR")}주 / 비례 ${detail.proportionalAllocatedShares.toLocaleString("ko-KR")}주`,
    );
  }

  return notes;
};

const buildDaishinUrl = (value: string) => {
  const absoluteUrl = new URL(value, DAISHIN_NOTICE_BASE_URL).toString();
  return absoluteUrl.replace(/^http:\/\//i, "https://");
};

const extractPdfUrls = (html: string) =>
  uniqueStrings(
    [...html.matchAll(/https?:\/\/[^"' )]+\.pdf/gi)].map((match) => buildDaishinUrl(match[0])),
  );

const extractDaishinPdfText = async (url: string, forceRefresh = false) =>
  getCachedExternalData(
    {
      key: `broker-subscription:pdf:${Buffer.from(url).toString("base64url")}`,
      source: "broker-subscription",
      ttlMs: BROKER_PDF_TEXT_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => {
      const { bytes } = await fetchBytes(url);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await pdfjs.getDocument({
        data: bytes,
      } as Parameters<typeof pdfjs.getDocument>[0]).promise;

      let text = "";

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        text += "\n";
      }

      return normalizeWhitespace(text);
    },
  );

export const parseKoreaInvestmentGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable = extractTableByCaption(html, /공모주\s*청약\s*매체\s*및\s*수수료/);
  const feeRows = extractHtmlRows(feeTable ?? "");
  const onlineRow = feeRows.find((row) => (row[0] ?? "").includes("온라인")) ?? [];
  const standardOnlineFee = parseLatestFeeFromRow(onlineRow);

  return {
    brokerName: "한국투자증권",
    sourceRef: KOREA_INVESTMENT_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition: false,
    notes:
      standardOnlineFee != null
        ? [`한국투자증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`]
        : [],
  };
};

export const parseShinhanInvestmentGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable = extractTableByCaption(html, /청약\s*수수료/);
  const feeRows = extractHtmlRows(feeTable ?? "");
  const generalRow =
    feeRows.find((row) => (row[0] ?? "").replace(/\s+/g, "").startsWith("일반")) ?? [];
  const standardOnlineFee = parseFeeValue(generalRow[2]);

  return {
    brokerName: "신한투자증권",
    sourceRef: SHINHAN_INVESTMENT_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition: false,
    notes:
      standardOnlineFee != null
        ? [`신한투자증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`]
        : [],
  };
};

export const parseKbSecuritiesGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable = extractTableByCaption(html, /일반배정고객분\s*청약수수료/);
  const feeRows = extractHtmlRows(feeTable ?? "");
  const onlineRow = feeRows.find((row) => (row[0] ?? "").includes("온라인")) ?? [];
  const standardOnlineFee = parseLatestFeeFromRow(onlineRow);
  const hasOnlineOnlyCondition = /온라인\s*청약만\s*가능/.test(stripTags(html));
  const notes = [
    ...(standardOnlineFee != null ? [`KB증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`] : []),
    ...(hasOnlineOnlyCondition ? ["KB증권 일반 고객은 온라인 청약만 가능하며 65세 이상은 오프라인 청약 예외가 있습니다."] : []),
  ];

  return {
    brokerName: "KB증권",
    sourceRef: KB_SECURITIES_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition,
    notes,
  };
};

export const parseMiraeAssetGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable =
    extractTables(html).find((table) =>
      extractHtmlRows(table).some((row) => row.some((cell) => cell.includes("공모주 청약(일반)"))),
    ) ?? null;
  const feeRows = extractHtmlRows(feeTable ?? "");
  const publicOfferingSectionRows = extractSectionRows(feeRows, /공모주청약\(일반\)|공모주청약\(일반\)|공모주청약|공모주청약일반|공모주청약\(일반\)/, 4);
  const onlineRow = publicOfferingSectionRows.find((row) => row.some((cell) => cell.includes("온라인"))) ?? [];
  const standardOnlineFee = parseLatestFeeFromRow(onlineRow);
  const waivesIfUnallocated = onlineRow.some((cell) => cell.includes("미 배정시 면제"));
  const notes = [
    ...(standardOnlineFee != null
      ? [`미래에셋증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`]
      : []),
    ...(waivesIfUnallocated ? ["미래에셋증권은 일반 공모주 온라인 청약 시 미배정이면 수수료를 면제합니다."] : []),
  ];

  return {
    brokerName: "미래에셋증권",
    sourceRef: MIRAE_ASSET_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition: false,
    notes,
  };
};

export const parseSamsungSecuritiesGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable =
    [...extractTables(html)]
      .reverse()
      .find((table) => extractHtmlRows(table).some((row) => row.some((cell) => cell.includes("공모주 청약"))))
    ?? null;
  const feeRows = extractHtmlRows(feeTable ?? "");
  const publicOfferingSectionRows = extractSectionRows(feeRows, /공모주청약/, 4);
  const onlineRow = publicOfferingSectionRows.find((row) => row.some((cell) => cell.includes("온라인"))) ?? [];
  const standardOnlineFee = parseLatestFeeFromRow(onlineRow);

  return {
    brokerName: "삼성증권",
    sourceRef: SAMSUNG_SECURITIES_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition: false,
    notes:
      standardOnlineFee != null
        ? [`삼성증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`]
        : [],
  };
};

export const parseHanaSecuritiesGuide = (html: string): BrokerSubscriptionGuide => {
  const feeTable =
    extractTableByCaption(html, /업무수수료/)
    ?? extractTables(html).find((table) => extractHtmlRows(table).some((row) => row.some((cell) => cell.includes("공모주청약"))))
    ?? null;
  const feeRows = extractHtmlRows(feeTable ?? "");
  const publicOfferingSectionRows = extractSectionRows(feeRows, /공모주청약/, 3);
  const onlineRow = publicOfferingSectionRows.find((row) => row.some((cell) => cell.includes("온라인"))) ?? [];
  const fallbackOnlineRowHtml =
    html.match(/<tr\b[^>]*>[\s\S]*?공모주청약[\s\S]*?<\/tr>\s*<tr\b[^>]*>([\s\S]*?)<\/tr>/i)?.[1]
    ?? "";
  const fallbackOnlineRowValues = stripTags(fallbackOnlineRowHtml).match(/(?:[\d,]+원|무료|면제)/g) ?? [];
  const standardOnlineFee = parseLatestFeeFromRow(onlineRow) ?? parseLatestFeeFromRow(fallbackOnlineRowValues);

  return {
    brokerName: "하나증권",
    sourceRef: HANA_SECURITIES_GUIDE_URL,
    subscriptionFee: standardOnlineFee,
    hasOnlineOnlyCondition: false,
    notes:
      standardOnlineFee != null
        ? [`하나증권 가이드 기준 온라인 청약 수수료 ${formatFeeLabel(standardOnlineFee)}`]
        : [],
  };
};

export const parseKoreaInvestmentIpoCatalog = (html: string): KoreaInvestmentIpoEntry[] => {
  const catalogTable = extractTableByCaption(html, /청약종목안내/);
  const rows = extractHtmlRows(catalogTable ?? "");

  return rows
    .filter((row) => row.length >= 7 && /시장$/.test(row[0] ?? ""))
    .map((row) => {
      const schedule = parseDateRangeValue(row[3] ?? "");

      return {
        name: row[1] ?? "",
        normalizedName: normalizeCompanyNameForMatching(row[1] ?? ""),
        subscriptionStart: schedule.start,
        subscriptionEnd: schedule.end,
        refundDate: parseDateRangeValue(row[4] ?? "").start,
        maximumSubscriptionShares: parseInteger(row[5]),
        offerPrice: parseInteger(row[6]),
      } satisfies KoreaInvestmentIpoEntry;
    })
    .filter((entry) => Boolean(entry.name));
};

export const parseDaishinNoticeList = (html: string): DaishinNoticeEntry[] =>
  [...html.matchAll(
    /<a[^>]+id=['"]_?(\d+)['"][^>]+href=['"]([^'"]*DM_Basic_Read\.aspx\?seq=(\d+)[^'"]*)['"][^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<span class="date">([^<]+)<\/span>/gi,
  )]
    .map((match) => {
      const seq = match[3] ?? match[1] ?? "";
      const title = stripTags(match[4] ?? "");

      return {
        seq,
        title,
        normalizedTitle: normalizeFreeTextForMatching(title),
        publishedDate: parseDotDate(match[5] ?? null),
        url: buildDaishinUrl(match[2] ?? ""),
      } satisfies DaishinNoticeEntry;
    })
    .filter((entry) => Boolean(entry.seq) && Boolean(entry.title));

export const parseDaishinNoticeDetail = (html: string) => {
  const title = stripTags(html.match(/<div class="listArticle[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  const detailHtml =
    html.match(/<div class="detail_area"[\s\S]*?<div class="bottom_btn/gi)?.[0]
    ?? html;

  return {
    title,
    bodyText: stripTags(detailHtml),
    attachmentUrls: extractPdfUrls(html),
  };
};

export const parseDaishinPdfText = (text: string): ParsedDaishinNoticeMetrics =>
  parseDaishinNoticeMetrics(normalizeWhitespace(text));

const GUIDE_SOURCES: BrokerGuideSource[] = [
  {
    cacheKey: "broker-subscription:guide:korea-investment",
    url: KOREA_INVESTMENT_GUIDE_URL,
    parser: parseKoreaInvestmentGuide,
  },
  {
    cacheKey: "broker-subscription:guide:shinhan-investment",
    url: SHINHAN_INVESTMENT_GUIDE_URL,
    parser: parseShinhanInvestmentGuide,
  },
  {
    cacheKey: "broker-subscription:guide:kb-securities",
    url: KB_SECURITIES_GUIDE_URL,
    parser: parseKbSecuritiesGuide,
  },
  {
    cacheKey: "broker-subscription:guide:mirae-asset",
    url: MIRAE_ASSET_GUIDE_URL,
    parser: parseMiraeAssetGuide,
  },
  {
    cacheKey: "broker-subscription:guide:samsung-securities",
    url: SAMSUNG_SECURITIES_GUIDE_URL,
    parser: parseSamsungSecuritiesGuide,
  },
  {
    cacheKey: "broker-subscription:guide:hana-securities",
    url: HANA_SECURITIES_GUIDE_URL,
    parser: parseHanaSecuritiesGuide,
  },
];

const fetchBrokerSubscriptionReferenceData = async (
  { forceRefresh = false }: FetchBrokerSubscriptionOptions = {},
): Promise<BrokerSubscriptionReferenceData> => {
  const [guideResults, koreaInvestmentCatalogResults, daishinNoticeListResults] = await Promise.all([
    Promise.allSettled(
      GUIDE_SOURCES.map((source) =>
        getCachedExternalData(
          {
            key: source.cacheKey,
            source: "broker-subscription",
            ttlMs: BROKER_REFERENCE_CACHE_TTL_MS,
            bypass: forceRefresh,
          },
          async () => source.parser(await fetchText(source.url)),
        ),
      ),
    ),
    Promise.allSettled([
      getCachedExternalData(
        {
          key: "broker-subscription:catalog:korea-investment",
          source: "broker-subscription",
          ttlMs: BROKER_REFERENCE_CACHE_TTL_MS,
          bypass: forceRefresh,
        },
        async () => parseKoreaInvestmentIpoCatalog(await fetchText(KOREA_INVESTMENT_IPO_URL)),
      ),
    ]),
    Promise.allSettled([
      getCachedExternalData(
        {
          key: "broker-subscription:list:daishin",
          source: "broker-subscription",
          ttlMs: BROKER_REFERENCE_CACHE_TTL_MS,
          bypass: forceRefresh,
        },
        async () => parseDaishinNoticeList(await fetchText(DAISHIN_NOTICE_LIST_URL)),
      ),
    ]),
  ]);

  const koreaInvestmentCatalogResult = koreaInvestmentCatalogResults[0];
  const daishinNoticeListResult = daishinNoticeListResults[0];
  const guides = guideResults
    .filter((result): result is PromiseFulfilledResult<BrokerSubscriptionGuide> => result.status === "fulfilled")
    .map((result) => result.value);

  return {
    guideByBroker: new Map(
      guides.map((guide) => [normalizeBrokerName(guide.brokerName), guide] as const),
    ),
    koreaInvestmentCatalog: koreaInvestmentCatalogResult.status === "fulfilled" ? koreaInvestmentCatalogResult.value : [],
    daishinNoticeEntries: daishinNoticeListResult.status === "fulfilled" ? daishinNoticeListResult.value : [],
  };
};

const collectBrokerNames = (record: SourceIpoRecord) =>
  [record.leadManager, ...(record.coManagers ?? [])]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value !== "-"));

const findKoreaInvestmentCatalogEntry = (
  record: SourceIpoRecord,
  entries: KoreaInvestmentIpoEntry[],
) => {
  const normalizedName = normalizeCompanyNameForMatching(record.name);

  return (
    entries.find(
      (entry) =>
        entry.normalizedName === normalizedName
        && entry.subscriptionStart === record.subscriptionStart
        && entry.subscriptionEnd === record.subscriptionEnd,
    )
    ?? entries.find((entry) => entry.normalizedName === normalizedName)
    ?? null
  );
};

const findDaishinNoticeEntries = (record: SourceIpoRecord, entries: DaishinNoticeEntry[]) => {
  const normalizedName = normalizeCompanyNameForMatching(record.name);

  return entries
    .filter((entry) => entry.normalizedTitle.includes(normalizedName))
    .sort((left, right) => {
      const keywordRank = (value: string) => {
        if (/배정|환불/.test(value)) {
          return 0;
        }

        if (/청약/.test(value)) {
          return 1;
        }

        return 2;
      };

      return (
        keywordRank(left.title) - keywordRank(right.title)
        || (right.publishedDate ?? "").localeCompare(left.publishedDate ?? "")
        || right.seq.localeCompare(left.seq)
      );
    });
};

const loadDaishinNoticeDetail = async (
  entry: DaishinNoticeEntry,
  { forceRefresh = false }: FetchBrokerSubscriptionOptions = {},
): Promise<DaishinNoticeDetail> =>
  getCachedExternalData(
    {
      key: `broker-subscription:detail:daishin:${entry.seq}`,
      source: "broker-subscription",
      ttlMs: BROKER_REFERENCE_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => {
      const html = await fetchText(entry.url);
      const parsedDetail = parseDaishinNoticeDetail(html);
      const htmlMetrics = parseDaishinNoticeMetrics(parsedDetail.bodyText);
      const firstPdfUrl = parsedDetail.attachmentUrls[0] ?? null;
      const pdfMetrics =
        firstPdfUrl != null
          ? parseDaishinPdfText(await extractDaishinPdfText(firstPdfUrl, forceRefresh))
          : null;
      const mergedMetrics = pdfMetrics ? mergeDaishinMetrics(htmlMetrics, pdfMetrics) : htmlMetrics;

      return {
        seq: entry.seq,
        title: parsedDetail.title || entry.title,
        publishedDate: entry.publishedDate,
        sourceRefs: uniqueStrings([entry.url, ...(firstPdfUrl ? [firstPdfUrl] : [])]),
        generalCompetitionRate: mergedMetrics.generalCompetitionRate,
        maximumSubscriptionShares: mergedMetrics.maximumSubscriptionShares,
        subscriptionFee: mergedMetrics.subscriptionFee,
        allocatedShares: mergedMetrics.allocatedShares,
        equalAllocatedShares: mergedMetrics.equalAllocatedShares,
        proportionalAllocatedShares: mergedMetrics.proportionalAllocatedShares,
        notes: buildDaishinNotes(mergedMetrics),
      } satisfies DaishinNoticeDetail;
    },
  );

const mergeDaishinNoticeDetails = (details: DaishinNoticeDetail[]) => {
  const merged = details.reduce<DaishinNoticeDetail>(
    (current, detail) => ({
      seq: current.seq || detail.seq,
      title: current.title || detail.title,
      publishedDate: current.publishedDate || detail.publishedDate,
      sourceRefs: uniqueStrings([...current.sourceRefs, ...detail.sourceRefs]),
      generalCompetitionRate: current.generalCompetitionRate ?? detail.generalCompetitionRate,
      maximumSubscriptionShares: current.maximumSubscriptionShares ?? detail.maximumSubscriptionShares,
      subscriptionFee: current.subscriptionFee ?? detail.subscriptionFee,
      allocatedShares: current.allocatedShares ?? detail.allocatedShares,
      equalAllocatedShares: current.equalAllocatedShares ?? detail.equalAllocatedShares,
      proportionalAllocatedShares: current.proportionalAllocatedShares ?? detail.proportionalAllocatedShares,
      notes: uniqueStrings([...current.notes, ...detail.notes]),
    }),
    {
      seq: "",
      title: "",
      publishedDate: null,
      sourceRefs: [],
      generalCompetitionRate: null,
      maximumSubscriptionShares: null,
      subscriptionFee: null,
      allocatedShares: null,
      equalAllocatedShares: null,
      proportionalAllocatedShares: null,
      notes: [],
    },
  );

  return merged.sourceRefs.length > 0 ? merged : null;
};

const mergeBrokerNotes = (record: SourceIpoRecord, details: SourceBrokerSubscriptionDetail[]) =>
  [...new Set([...(record.notes ?? []), ...details.flatMap((detail) => detail.notes ?? [])])];

export const enrichBrokerSubscriptionMetadata = async (
  records: SourceIpoRecord[],
  { forceRefresh = false }: FetchBrokerSubscriptionOptions = {},
): Promise<SourceIpoRecord[]> => {
  if (records.length === 0) {
    return records;
  }

  const referenceData = await fetchBrokerSubscriptionReferenceData({ forceRefresh });

  return Promise.all(
    records.map(async (record) => {
      const brokerDetailResults: Array<SourceBrokerSubscriptionDetail | null> = await Promise.all(
        collectBrokerNames(record).map(async (brokerName) => {
            try {
              const normalizedBroker = normalizeBrokerName(brokerName);
              const guide = referenceData.guideByBroker.get(normalizedBroker) ?? null;
              const notes = [...(guide?.notes ?? [])];
              let sourceRef = guide?.sourceRef ?? null;
              let maximumSubscriptionShares: number | null = null;
              let generalCompetitionRate: number | null = null;
              let allocatedShares: number | null = null;
              let equalAllocatedShares: number | null = null;
              let proportionalAllocatedShares: number | null = null;
              let subscriptionFee: number | null = guide?.subscriptionFee ?? null;

              if (normalizedBroker === normalizeBrokerName("한국투자증권")) {
                const catalogEntry = findKoreaInvestmentCatalogEntry(record, referenceData.koreaInvestmentCatalog);
                if (catalogEntry?.maximumSubscriptionShares != null) {
                  maximumSubscriptionShares = catalogEntry.maximumSubscriptionShares;
                  sourceRef = KOREA_INVESTMENT_IPO_URL;
                  notes.push(`한국투자증권 청약종목안내 기준 최고청약한도 ${catalogEntry.maximumSubscriptionShares.toLocaleString("ko-KR")}주`);
                }
              }

              if (normalizedBroker === normalizeBrokerName("대신증권")) {
                const daishinEntries = findDaishinNoticeEntries(record, referenceData.daishinNoticeEntries);
                if (daishinEntries.length > 0) {
                  const detailResults = await Promise.allSettled(
                    daishinEntries.slice(0, 3).map((entry) => loadDaishinNoticeDetail(entry, { forceRefresh })),
                  );
                  const mergedDaishinDetail = mergeDaishinNoticeDetails(
                    detailResults
                      .filter((result): result is PromiseFulfilledResult<DaishinNoticeDetail> => result.status === "fulfilled")
                      .map((result) => result.value),
                  );

                  if (mergedDaishinDetail) {
                    sourceRef = mergedDaishinDetail.sourceRefs.join(" | ");
                    generalCompetitionRate = mergedDaishinDetail.generalCompetitionRate;
                    maximumSubscriptionShares = maximumSubscriptionShares ?? mergedDaishinDetail.maximumSubscriptionShares;
                    allocatedShares = mergedDaishinDetail.allocatedShares;
                    equalAllocatedShares = mergedDaishinDetail.equalAllocatedShares;
                    proportionalAllocatedShares = mergedDaishinDetail.proportionalAllocatedShares;
                    subscriptionFee = subscriptionFee ?? mergedDaishinDetail.subscriptionFee;
                    notes.push(...mergedDaishinDetail.notes);
                  }
                }
              }

              if (
                !guide
                && maximumSubscriptionShares == null
                && generalCompetitionRate == null
                && allocatedShares == null
                && equalAllocatedShares == null
                && proportionalAllocatedShares == null
                && subscriptionFee == null
              ) {
                return null;
              }

              return {
                brokerName,
                brokerCode: null,
                sourceKey: `broker-web:${normalizedBroker}:${normalizeCompanyNameForMatching(record.name)}:${record.subscriptionEnd}`,
                sourceRef,
                generalCompetitionRate,
                allocatedShares,
                equalAllocatedShares,
                proportionalAllocatedShares,
                minimumSubscriptionShares: null,
                maximumSubscriptionShares,
                depositRate: null,
                subscriptionFee,
                hasOnlineOnlyCondition: guide?.hasOnlineOnlyCondition ?? false,
                notes: uniqueStrings(notes),
              } satisfies SourceBrokerSubscriptionDetail;
            } catch (error) {
              console.warn("[WARN] broker-subscription:broker-detail-failed", {
                recordName: record.name,
                brokerName,
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            }
          }),
      );
      const brokerDetails = brokerDetailResults.filter(
        (detail): detail is SourceBrokerSubscriptionDetail => detail !== null,
      );

      if (brokerDetails.length === 0) {
        return record;
      }

      return {
        ...record,
        brokerSubscriptionDetails: brokerDetails,
        notes: mergeBrokerNotes(record, brokerDetails),
      } satisfies SourceIpoRecord;
    }),
  );
};
