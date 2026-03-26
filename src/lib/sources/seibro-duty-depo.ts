import { env } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";

export type SeibroDutyDepoMarketTypeCode = "11" | "12" | "13" | "14" | "50";

export type SeibroDutyDepoStatusItem = {
  stockKindCode: string | null;
  stockKindName: string | null;
  companyCount: number | null;
  issueCount: number | null;
  totalIssuedShares: number | null;
  dutyDepoShares: number | null;
  dutyDepoRatio: number | null;
};

export type SeibroDutyDepoReasonItem = {
  reasonCode: string | null;
  reasonName: string | null;
  dutyDepoCompanyCount: number | null;
  dutyDepoIssueCount: number | null;
  dutyDepoShares: number | null;
  safeDepoCompanyCount: number | null;
  safeDepoIssueCount: number | null;
  safeDepoShares: number | null;
};

export type SeibroDutyDepoSnapshot = {
  standardDate: string;
  marketTypeCode: SeibroDutyDepoMarketTypeCode;
  statusItems: SeibroDutyDepoStatusItem[];
  reasonItems: SeibroDutyDepoReasonItem[];
};

type FetchSeibroDutyDepoSnapshotOptions = {
  forceRefresh?: boolean;
};

const SEIBRO_DUTY_DEPO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SEIBRO_OK_RESULT_CODE = "00";
const SEIBRO_NO_DATA_RESULT_CODE = "03";

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const extractTagValue = (xml: string, tagName: string) =>
  decodeXml(xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"))?.[1] ?? "");

const parseInteger = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^\d-]/g, "");
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
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractItems = (xml: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

const readSeibroResultCode = (xml: string) => {
  const resultCode = extractTagValue(xml, "resultCode");
  return resultCode || null;
};

const assertSeibroResultOk = (xml: string) => {
  const resultCode = readSeibroResultCode(xml);
  const resultMessage = extractTagValue(xml, "resultMsg");

  if (!resultCode || resultCode === SEIBRO_OK_RESULT_CODE || resultCode === SEIBRO_NO_DATA_RESULT_CODE) {
    return resultCode !== SEIBRO_NO_DATA_RESULT_CODE;
  }

  throw new Error(`SEIBro request failed: ${resultCode} ${resultMessage}`.trim());
};

export const parseSeibroDutyDepoStatusResponse = (xml: string): SeibroDutyDepoStatusItem[] => {
  const hasData = assertSeibroResultOk(xml);
  if (!hasData) {
    return [];
  }

  return extractItems(xml).map((itemXml) => ({
    stockKindCode: extractTagValue(itemXml, "issuStkKindTpcd") || null,
    stockKindName: extractTagValue(itemXml, "issuStkKindTpnm") || null,
    companyCount: parseInteger(extractTagValue(itemXml, "cocnt")),
    issueCount: parseInteger(extractTagValue(itemXml, "secncnt")),
    totalIssuedShares: parseInteger(extractTagValue(itemXml, "issuStkqty")),
    dutyDepoShares: parseInteger(extractTagValue(itemXml, "stkDepoQty")),
    dutyDepoRatio: parseFloatNumber(extractTagValue(itemXml, "safedpRatioValue")),
  }));
};

export const parseSeibroDutyDepoReasonResponse = (xml: string): SeibroDutyDepoReasonItem[] => {
  const hasData = assertSeibroResultOk(xml);
  if (!hasData) {
    return [];
  }

  return extractItems(xml).map((itemXml) => ({
    reasonCode: extractTagValue(itemXml, "safedpRacd") || null,
    reasonName: extractTagValue(itemXml, "codevalueNm") || null,
    dutyDepoCompanyCount: parseInteger(extractTagValue(itemXml, "dutyDepoCocnt")),
    dutyDepoIssueCount: parseInteger(extractTagValue(itemXml, "dutyDepoSecncnt")),
    dutyDepoShares: parseInteger(extractTagValue(itemXml, "dutyDepoStkDepoQty")),
    safeDepoCompanyCount: parseInteger(extractTagValue(itemXml, "safedpCocnt")),
    safeDepoIssueCount: parseInteger(extractTagValue(itemXml, "safedpSecncnt")),
    safeDepoShares: parseInteger(extractTagValue(itemXml, "safedpStkDepoQty")),
  }));
};

const buildSeibroUrl = (
  path: string,
  params: Record<string, string>,
) => `${env.seibroBaseUrl.replace(/\/+$/, "")}${path}?${new URLSearchParams(params).toString()}`;

const fetchSeibroXml = async (
  path: string,
  params: Record<string, string>,
) => {
  const response = await fetch(buildSeibroUrl(path, params), { cache: "no-store" });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`SEIBro request failed: HTTP ${response.status}`);
  }

  return xml;
};

export const fetchSeibroDutyDepoSnapshot = async (
  standardDate: string,
  marketTypeCode: SeibroDutyDepoMarketTypeCode,
  { forceRefresh = false }: FetchSeibroDutyDepoSnapshotOptions = {},
): Promise<SeibroDutyDepoSnapshot | null> => {
  if (!env.seibroServiceKey) {
    return null;
  }

  return getCachedExternalData(
    {
      key: `seibro-duty-depo:${standardDate}:${marketTypeCode}`,
      source: "seibro-duty-depo",
      ttlMs: SEIBRO_DUTY_DEPO_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => {
      const commonParams = {
        ServiceKey: env.seibroServiceKey,
        stdDt: standardDate,
        listTpcd: marketTypeCode,
        numOfRows: "100",
        pageNo: "1",
      };

      const [statusXml, reasonXml] = await Promise.all([
        fetchSeibroXml("/StockSvc/getSafeDpDutyDepoStatusN1", commonParams),
        fetchSeibroXml("/StockSvc/getSafeDpDutyDepoRgtStatusN1", commonParams),
      ]);

      return {
        standardDate,
        marketTypeCode,
        statusItems: parseSeibroDutyDepoStatusResponse(statusXml),
        reasonItems: parseSeibroDutyDepoReasonResponse(reasonXml),
      } satisfies SeibroDutyDepoSnapshot;
    },
  );
};
