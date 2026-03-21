import { env } from "@/lib/env";
import { getKstDateParts } from "@/lib/date";

type OpendartFinancialResponse = {
  status?: string;
  message?: string;
  list?: OpendartFinancialRow[];
};

type OpendartFinancialRow = {
  account_nm: string;
  sj_nm: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
};

type FinancialAttempt = {
  year: number;
  reportCode: string;
  label: string;
};

export type OpendartFinancialSnapshot = {
  reportLabel: string;
  revenue: number | null;
  previousRevenue: number | null;
  revenueGrowthRate: number | null;
  operatingIncome: number | null;
  previousOperatingIncome: number | null;
  operatingMarginRate: number | null;
  netIncome: number | null;
  previousNetIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  debtRatio: number | null;
};

const OPENDART_OK_STATUS = "000";
const OPENDART_NO_DATA_STATUS = "013";

const REPORT_CODE_LABEL: Record<string, string> = {
  "11011": "사업보고서",
  "11012": "반기보고서",
  "11013": "1분기보고서",
  "11014": "3분기보고서",
};

const buildUrl = (path: string, params: Record<string, string>) => {
  const baseUrl = env.opendartBaseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(params);
  return `${baseUrl}${path}?${search.toString()}`;
};

const parseAmount = (value: string | undefined) => {
  if (!value || value === "-") {
    return null;
  }

  const normalized = value
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/\(([^)]+)\)/g, "-$1");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const findFirstMatchingRow = (rows: OpendartFinancialRow[], patterns: RegExp[]) =>
  rows.find((row) => patterns.some((pattern) => pattern.test(`${row.sj_nm} ${row.account_nm}`))) ?? null;

const calculateGrowthRate = (current: number | null, previous: number | null) => {
  if (current == null || previous == null || previous === 0) {
    return null;
  }

  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
};

const calculateMarginRate = (numerator: number | null, denominator: number | null) => {
  if (numerator == null || denominator == null || denominator === 0) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
};

const calculateDebtRatio = (liabilities: number | null, equity: number | null) => {
  if (liabilities == null || equity == null || equity === 0) {
    return null;
  }

  return Number(((liabilities / equity) * 100).toFixed(1));
};

const buildFinancialAttempts = () => {
  const { year: currentYear } = getKstDateParts();

  return [
    { year: currentYear - 1, reportCode: "11011", label: `${currentYear - 1} 사업보고서` },
    { year: currentYear - 1, reportCode: "11014", label: `${currentYear - 1} 3분기보고서` },
    { year: currentYear - 1, reportCode: "11012", label: `${currentYear - 1} 반기보고서` },
    { year: currentYear - 1, reportCode: "11013", label: `${currentYear - 1} 1분기보고서` },
    { year: currentYear - 2, reportCode: "11011", label: `${currentYear - 2} 사업보고서` },
  ] satisfies FinancialAttempt[];
};

const fetchFinancialRows = async (corpCode: string, attempt: FinancialAttempt, fsDiv: "CFS" | "OFS") => {
  const endpoint = buildUrl("/api/fnlttSinglAcnt.json", {
    crtfc_key: env.opendartApiKey,
    corp_code: corpCode,
    bsns_year: String(attempt.year),
    reprt_code: attempt.reportCode,
    fs_div: fsDiv,
  });

  const response = await fetch(endpoint, { cache: "no-store" });
  const body = (await response.json()) as OpendartFinancialResponse;

  if (!response.ok) {
    throw new Error(`OpenDART financial request failed: HTTP ${response.status}`);
  }

  if (body.status && body.status !== OPENDART_OK_STATUS) {
    if (body.status === OPENDART_NO_DATA_STATUS) {
      return null;
    }

    throw new Error(`OpenDART financial request failed: ${body.status} ${body.message ?? ""}`.trim());
  }

  return body.list ?? [];
};

const toSnapshot = (rows: OpendartFinancialRow[], label: string): OpendartFinancialSnapshot | null => {
  const revenueRow = findFirstMatchingRow(rows, [
    /손익계산서 .*매출액/,
    /손익계산서 .*수익\(매출액\)/,
    /손익계산서 .*영업수익/,
  ]);
  const operatingIncomeRow = findFirstMatchingRow(rows, [/손익계산서 .*영업이익/, /손익계산서 .*영업이익\(손실\)/]);
  const netIncomeRow = findFirstMatchingRow(rows, [/손익계산서 .*당기순이익/, /손익계산서 .*당기순이익\(손실\)/]);
  const assetsRow = findFirstMatchingRow(rows, [/재무상태표 .*자산총계/]);
  const liabilitiesRow = findFirstMatchingRow(rows, [/재무상태표 .*부채총계/]);
  const equityRow = findFirstMatchingRow(rows, [/재무상태표 .*자본총계/]);

  const revenue = parseAmount(revenueRow?.thstrm_amount);
  const previousRevenue = parseAmount(revenueRow?.frmtrm_amount);
  const operatingIncome = parseAmount(operatingIncomeRow?.thstrm_amount);
  const previousOperatingIncome = parseAmount(operatingIncomeRow?.frmtrm_amount);
  const netIncome = parseAmount(netIncomeRow?.thstrm_amount);
  const previousNetIncome = parseAmount(netIncomeRow?.frmtrm_amount);
  const totalAssets = parseAmount(assetsRow?.thstrm_amount);
  const totalLiabilities = parseAmount(liabilitiesRow?.thstrm_amount);
  const totalEquity = parseAmount(equityRow?.thstrm_amount);

  const snapshot = {
    reportLabel: label,
    revenue,
    previousRevenue,
    revenueGrowthRate: calculateGrowthRate(revenue, previousRevenue),
    operatingIncome,
    previousOperatingIncome,
    operatingMarginRate: calculateMarginRate(operatingIncome, revenue),
    netIncome,
    previousNetIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    debtRatio: calculateDebtRatio(totalLiabilities, totalEquity),
  } satisfies OpendartFinancialSnapshot;

  const hasAnyMetric = Object.entries(snapshot).some(([key, value]) => key !== "reportLabel" && value != null);
  return hasAnyMetric ? snapshot : null;
};

export const fetchLatestFinancialSnapshot = async (corpCode: string): Promise<OpendartFinancialSnapshot | null> => {
  if (!env.opendartApiKey) {
    return null;
  }

  for (const attempt of buildFinancialAttempts()) {
    for (const fsDiv of ["CFS", "OFS"] as const) {
      const rows = await fetchFinancialRows(corpCode, attempt, fsDiv);
      if (!rows?.length) {
        continue;
      }

      const reportLabel = `${attempt.label} (${fsDiv === "CFS" ? "연결" : "별도"})`;
      const snapshot = toSnapshot(rows, reportLabel);
      if (snapshot) {
        return snapshot;
      }
    }
  }

  return null;
};

export const getReportCodeLabel = (reportCode: string) => REPORT_CODE_LABEL[reportCode] ?? reportCode;
