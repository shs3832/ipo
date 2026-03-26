import { env } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";
import type { OpendartFinancialSnapshot } from "@/lib/sources/opendart-financials";
import { inflateRawSync } from "node:zlib";

export type OpendartProspectusDetails = {
  receiptNo: string;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  minimumSubscriptionShares: number | null;
  depositRate: number | null;
  demandCompetitionRate: number | null;
  lockupRate: number | null;
  financialSnapshot: OpendartFinancialSnapshot | null;
};

type FetchOpendartProspectusDetailsOptions = {
  forceRefresh?: boolean;
};

type ParsedTable = {
  headers: string[];
  rows: string[][];
};

const OPENDART_PROSPECTUS_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const PROSPECTUS_FINANCIAL_AMOUNT_SCALE = 1_000_000;

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

const parseSignedAmount = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.+)\)$/, "-$1");

  if (!normalized || normalized === "-") {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const scaleAmount = (value: number | null, multiplier: number) =>
  value == null ? null : value * multiplier;

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

const extractDemandCompetitionRate = (texts: string[]) => {
  const patterns = [
    /기관(?:투자자)?\s*(?:수요예측\s*)?경쟁률[^\d]{0,20}([\d,.]+)\s*[:：]\s*1/gi,
    /수요예측\s*경쟁률[^\d]{0,20}([\d,.]+)\s*[:：]\s*1/gi,
    /기관(?:투자자)?\s*경쟁률[^\d]{0,20}([\d,.]+)\s*[:：]\s*1/gi,
  ];

  for (const text of texts) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (!match) {
        continue;
      }

      const parsed = parseFloatNumber(match[1]);
      if (parsed != null) {
        return parsed;
      }
    }
  }

  return null;
};

const extractLockupRate = (texts: string[]) => {
  const patterns = [
    /기관투자자[^\d%]{0,120}?의무보유\s*확약(?:\s*비율)?[^\d]{0,20}([\d,.]+)\s*%/gi,
    /의무보유\s*확약(?:기관투자자)?(?:\s*참여수량)?\s*비율[^\d]{0,20}([\d,.]+)\s*%/gi,
    /의무보유\s*확약[^\d%]{0,20}기관투자자[^\d]{0,20}([\d,.]+)\s*%/gi,
  ];

  for (const text of texts) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (!match) {
        continue;
      }

      const parsed = parseFloatNumber(match[1]);
      if (parsed != null) {
        return parsed;
      }
    }
  }

  return null;
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

const parseXmlRows = (tableXml: string) =>
  [...tableXml.matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)]
    .map((match) =>
      [...match[1].matchAll(/<T[DH]\b[^>]*>([\s\S]*?)<\/T[DH]>/gi)]
        .map((cell) => normalizeText(cell[1]))
        .filter(Boolean),
    )
    .filter((row) => row.length > 1);

const parseXmlTable = (tableXml: string): ParsedTable | null => {
  const rows = parseXmlRows(tableXml);

  if (rows.length < 2) {
    return null;
  }

  return {
    headers: rows[0] ?? [],
    rows: rows.slice(1),
  };
};

const extractTableAfterTitle = (xml: string, titlePatterns: RegExp[]) => {
  for (const pattern of titlePatterns) {
    const match = pattern.exec(xml);
    if (!match) {
      continue;
    }

    const tables = xml.slice(match.index + match[0].length).matchAll(/<TABLE\b[\s\S]*?<\/TABLE>/gi);
    for (const tableMatch of tables) {
      const parsedTable = parseXmlTable(tableMatch[0]);
      if (parsedTable) {
        return parsedTable;
      }
    }
  }

  return null;
};

const LOCKUP_TOTAL_LABEL_PATTERN = /^(?:합\s*계|총\s*계)$/;
const LOCKUP_UNCOMMITTED_LABEL_PATTERN = /^(?:미확약|확약\s*없음|미확정)$/;
const LOCKUP_COMMITMENT_LABEL_PATTERN =
  /(?:\d+\s*(?:개월|일)\s*확약|확약\s*\d+\s*(?:개월|일)|상장\s*후\s*\d+\s*(?:개월|일)|자발적\s*확약|의무보유\s*확약)/;

const isLockupTotalLabel = (value: string) => LOCKUP_TOTAL_LABEL_PATTERN.test(value.replace(/\s+/g, ""));

const isLockupUncommittedLabel = (value: string) =>
  LOCKUP_UNCOMMITTED_LABEL_PATTERN.test(value.replace(/\s+/g, ""));

const isLockupCommitmentLabel = (value: string) =>
  !isLockupUncommittedLabel(value) && LOCKUP_COMMITMENT_LABEL_PATTERN.test(value);

const buildCompositeHeaders = (headerRows: string[][], columnCount: number) =>
  Array.from({ length: columnCount }, (_, index) => {
    const parts = headerRows
      .map((row) => row[index] ?? "")
      .filter(Boolean)
      .filter((cell, partIndex, cells) => cell !== cells[partIndex - 1]);

    return parts.join(" ");
  });

const sumQuantityCells = (row: string[], quantityColumnIndexes: number[]) =>
  quantityColumnIndexes.reduce((sum, columnIndex) => sum + (parseInteger(row[columnIndex]) ?? 0), 0);

export const extractLockupRateFromXmlTables = (xml: string) => {
  const tableMatches = xml.matchAll(/<TABLE\b[\s\S]*?<\/TABLE>/gi);

  for (const tableMatch of tableMatches) {
    const rows = parseXmlRows(tableMatch[0]);
    if (rows.length < 4) {
      continue;
    }

    const dataStartIndex = rows.findIndex((row) => {
      const label = row[0] ?? "";
      return isLockupCommitmentLabel(label) || isLockupUncommittedLabel(label) || isLockupTotalLabel(label);
    });
    if (dataStartIndex < 1) {
      continue;
    }

    const headerRows = rows.slice(0, dataStartIndex);
    const dataRows = rows.slice(dataStartIndex);
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (columnCount < 2) {
      continue;
    }

    const compositeHeaders = buildCompositeHeaders(headerRows, columnCount);
    const quantityColumnIndexes = compositeHeaders
      .map((header, index) => (index > 0 && /수량/.test(header) ? index : -1))
      .filter((index) => index > 0);

    if (quantityColumnIndexes.length === 0) {
      continue;
    }

    const commitmentRows = dataRows.filter((row) => isLockupCommitmentLabel(row[0] ?? ""));
    const uncommittedRows = dataRows.filter((row) => isLockupUncommittedLabel(row[0] ?? ""));
    const totalRow = dataRows.find((row) => isLockupTotalLabel(row[0] ?? ""));

    if (commitmentRows.length === 0 || !totalRow || (uncommittedRows.length === 0 && commitmentRows.length < 2)) {
      continue;
    }

    const committedQuantity = commitmentRows.reduce(
      (sum, row) => sum + sumQuantityCells(row, quantityColumnIndexes),
      0,
    );
    const totalQuantity = sumQuantityCells(totalRow, quantityColumnIndexes);

    if (committedQuantity <= 0 || totalQuantity <= 0 || committedQuantity > totalQuantity) {
      continue;
    }

    return Number(((committedQuantity / totalQuantity) * 100).toFixed(1));
  }

  return null;
};

const choosePreferredColumnIndex = (headers: string[]) => {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < headers.length; index += 1) {
    const header = headers[index] ?? "";
    let score = index;

    if (/3Q|3분기|분기/.test(header)) {
      score += 100;
    }

    if (/업종평균|평균|추정|예상|\(E\)/.test(header)) {
      score -= 100;
    }

    const year = header.match(/(20\d{2})/)?.[1];
    if (year) {
      score += Number.parseInt(year, 10);
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const extractMetricFromTable = (
  table: ParsedTable | null,
  rowLabelPatterns: RegExp[],
  parser: (value: string | null | undefined) => number | null,
) => {
  if (!table) {
    return null;
  }

  const columnIndex = choosePreferredColumnIndex(table.headers);
  if (columnIndex < 1) {
    return null;
  }

  const row = table.rows.find((cells) =>
    rowLabelPatterns.some((pattern) => pattern.test(cells[0] ?? "")),
  );
  if (!row) {
    return null;
  }

  return parser(row[columnIndex]);
};

const extractFinancialSnapshot = (incomeSummaryTable: ParsedTable | null, stabilityTable: ParsedTable | null) => {
  const operatingIncome = scaleAmount(
    extractMetricFromTable(incomeSummaryTable, [/영업이익\(손실\)/, /영업이익/], parseSignedAmount),
    PROSPECTUS_FINANCIAL_AMOUNT_SCALE,
  );
  const netIncome = scaleAmount(
    extractMetricFromTable(incomeSummaryTable, [/당기순이익\(손실\)/, /당기순이익/], parseSignedAmount),
    PROSPECTUS_FINANCIAL_AMOUNT_SCALE,
  );
  const debtRatio = extractMetricFromTable(stabilityTable, [/부채비율/], parseFloatNumber);

  if (operatingIncome == null && netIncome == null && debtRatio == null) {
    return null;
  }

  const snapshot = {
    reportLabel: "증권신고서 요약 재무지표",
    revenue: null,
    previousRevenue: null,
    revenueGrowthRate: null,
    operatingIncome,
    previousOperatingIncome: null,
    operatingMarginRate: null,
    netIncome,
    previousNetIncome: null,
    totalAssets: null,
    totalLiabilities: null,
    totalEquity: null,
    debtRatio,
  } satisfies OpendartFinancialSnapshot;

  const hasAnyMetric = Object.entries(snapshot).some(([key, value]) => key !== "reportLabel" && value != null);
  return hasAnyMetric ? snapshot : null;
};

const extractZipFile = (archive: Buffer) => {
  const endOfCentralDirectoryOffset = archive.lastIndexOf(
    Buffer.from([
      ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE & 0xff,
      (ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE >> 8) & 0xff,
      (ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE >> 16) & 0xff,
      (ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE >> 24) & 0xff,
    ]),
  );
  if (endOfCentralDirectoryOffset < 0) {
    throw new Error("OpenDART document archive is missing a central directory");
  }

  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);
  if (archive.readUInt32LE(centralDirectoryOffset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
    throw new Error("OpenDART document archive has an invalid central directory");
  }

  const compressionMethod = archive.readUInt16LE(centralDirectoryOffset + 10);
  const compressedSize = archive.readUInt32LE(centralDirectoryOffset + 20);
  const fileNameLength = archive.readUInt16LE(centralDirectoryOffset + 28);
  const extraFieldLength = archive.readUInt16LE(centralDirectoryOffset + 30);
  const commentLength = archive.readUInt16LE(centralDirectoryOffset + 32);
  const localHeaderOffset = archive.readUInt32LE(centralDirectoryOffset + 42);

  if (archive.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("OpenDART document archive has an invalid local file header");
  }

  const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const localExtraFieldLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
  const dataEnd = dataStart + compressedSize;
  const compressedPayload = archive.subarray(dataStart, dataEnd);

  if (archive.length < dataEnd + commentLength + fileNameLength + extraFieldLength) {
    throw new Error("OpenDART document archive is truncated");
  }

  return {
    compressionMethod,
    compressedPayload,
  };
};

const fetchOpendartProspectusDetailsUncached = async (
  receiptNo: string,
): Promise<OpendartProspectusDetails> => {
  const endpoint = `${env.opendartBaseUrl.replace(/\/+$/, "")}/api/document.xml?${new URLSearchParams({
    crtfc_key: env.opendartApiKey,
    rcept_no: receiptNo,
  }).toString()}`;
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`OpenDART document request failed: HTTP ${response.status}`);
  }

  const archive = Buffer.from(await response.arrayBuffer());
  const archiveText = archive.toString("utf8", 0, Math.min(archive.length, 200));
  if (!archive.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error(`OpenDART document request did not return a zip archive: ${archiveText.trim()}`);
  }

  const { compressionMethod, compressedPayload } = extractZipFile(archive);
  const xmlBuffer =
    compressionMethod === 0
      ? compressedPayload
      : compressionMethod === 8
        ? inflateRawSync(compressedPayload)
        : null;

  if (!xmlBuffer) {
    throw new Error(`OpenDART document compression method ${compressionMethod} is not supported`);
  }

  const xml = xmlBuffer.toString("utf8");
  const normalizedXmlText = normalizeText(xml);
  const incomeSummaryTable = extractTableAfterTitle(xml, [/\[최근 3개년 및 당해 분기 요약 손익계산서\]/]);
  const stabilityTable = extractTableAfterTitle(xml, [/\[주요 재무안정성 지표\]/]);
  const scoringTexts = [normalizedXmlText];
  const { priceBandLow, priceBandHigh } = extractPriceBand(normalizedXmlText);
  const lockupRateFromTables = extractLockupRateFromXmlTables(xml);

  return {
    receiptNo,
    priceBandLow,
    priceBandHigh,
    minimumSubscriptionShares: extractMinimumSubscriptionShares(normalizedXmlText),
    depositRate: extractDepositRate(normalizedXmlText),
    demandCompetitionRate: extractDemandCompetitionRate(scoringTexts),
    lockupRate: lockupRateFromTables ?? extractLockupRate(scoringTexts),
    financialSnapshot: extractFinancialSnapshot(incomeSummaryTable, stabilityTable),
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
      demandCompetitionRate: null,
      lockupRate: null,
      financialSnapshot: null,
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
