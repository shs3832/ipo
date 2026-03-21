import type { SourceIpoRecord } from "@/lib/types";
import { env } from "@/lib/env";

type OpendartListResponse = {
  status?: string;
  message?: string;
  total_count?: number;
  total_page?: number;
  page_no?: number;
  page_count?: number;
  list?: OpendartDisclosureItem[];
};

type OpendartDisclosureItem = {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
  corp_cls: string;
  report_nm: string;
  rcept_no: string;
  flr_nm?: string;
  rcept_dt: string;
  rm?: string;
};

type OpendartEquityResponse = {
  status?: string;
  message?: string;
  group?: Array<{
    title: string;
    list?: Array<Record<string, string>>;
  }>;
};

type MonthWindow = {
  key: string;
  label: string;
  bgnDe: string;
  endDe: string;
};

const OPENDART_OK_STATUS = "000";
const PAGE_SIZE = 100;
const MAX_LOOKBACK_MONTHS = 18;
const MAX_DISCLOSURE_PAGES = 5;

const buildUrl = (path: string, params: Record<string, string>) => {
  const baseUrl = env.opendartBaseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(params);
  return `${baseUrl}${path}?${search.toString()}`;
};

const toMonthWindow = (date: Date): MonthWindow => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  const key = `${year}-${pad(month + 1)}`;
  const toDateKey = (value: Date) => `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;

  return {
    key,
    label: `${year}년 ${pad(month + 1)}월`,
    bgnDe: toDateKey(monthStart),
    endDe: toDateKey(monthEnd),
  };
};

const shiftMonth = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

const parseNumber = (value: string | undefined) => {
  if (!value || value === "-") {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSubscriptionRange = (value: string | undefined) => {
  if (!value || value === "-") {
    return { start: null, end: null };
  }

  const matches = [...value.matchAll(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/g)];
  if (matches.length === 0) {
    return { start: null, end: null };
  }

  const first = `${matches[0][1]}-${matches[0][2]}-${matches[0][3]}`;
  const last = `${matches[matches.length - 1][1]}-${matches[matches.length - 1][2]}-${matches[matches.length - 1][3]}`;
  return { start: first, end: last };
};

const mapMarket = (corpCls: string) => {
  switch (corpCls) {
    case "Y":
      return "KOSPI";
    case "K":
      return "KOSDAQ";
    case "N":
      return "KONEX";
    default:
      return "기타법인";
  }
};

const buildStatus = (start: string | null, end: string | null) => {
  if (!start || !end) {
    return "UPCOMING" as const;
  }

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  if (todayKey < start) {
    return "UPCOMING" as const;
  }

  if (todayKey > end) {
    return "CLOSED" as const;
  }

  return "OPEN" as const;
};

const isEquityIpoDisclosure = (item: OpendartDisclosureItem) =>
  item.report_nm.includes("증권신고서(지분증권)");

const byLatestReceipt = (left: { rcept_no: string }, right: { rcept_no: string }) =>
  right.rcept_no.localeCompare(left.rcept_no);

const byLatestReceiptRow = (left: Record<string, string>, right: Record<string, string>) =>
  (right.rcept_no ?? "").localeCompare(left.rcept_no ?? "");

const fetchDisclosurePage = async (window: MonthWindow, pageNo: number) => {
  const endpoint = buildUrl("/api/list.json", {
    crtfc_key: env.opendartApiKey,
    bgn_de: window.bgnDe,
    end_de: window.endDe,
    pblntf_ty: "C",
    pblntf_detail_ty: "C001",
    last_reprt_at: "Y",
    page_no: String(pageNo),
    page_count: String(PAGE_SIZE),
  });

  const response = await fetch(endpoint, { cache: "no-store" });
  const body = (await response.json()) as OpendartListResponse;

  if (!response.ok) {
    throw new Error(`OpenDART list request failed: HTTP ${response.status}`);
  }

  return body;
};

const fetchCandidateDisclosuresForMonth = async (window: MonthWindow): Promise<OpendartDisclosureItem[]> => {
  const firstPage = await fetchDisclosurePage(window, 1);

  if (firstPage.status && firstPage.status !== OPENDART_OK_STATUS) {
    if (firstPage.status === "013") {
      return [];
    }

    throw new Error(`OpenDART list request failed: ${firstPage.status} ${firstPage.message ?? ""}`.trim());
  }

  const totalPages = Math.min(firstPage.total_page ?? 1, MAX_DISCLOSURE_PAGES);
  const disclosures = [...(firstPage.list ?? [])];

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchDisclosurePage(window, page);
    disclosures.push(...(nextPage.list ?? []));
  }

  return disclosures.filter(isEquityIpoDisclosure);
};

const pickMonthWithIpoDisclosures = async () => {
  for (let offset = 0; offset < MAX_LOOKBACK_MONTHS; offset += 1) {
    const window = toMonthWindow(shiftMonth(new Date(), -offset));
    const disclosures = await fetchCandidateDisclosuresForMonth(window);

    if (disclosures.length > 0) {
      return { window, disclosures, usedFallback: offset > 0 };
    }
  }

  return null;
};

const fetchEquitySecurityInfo = async (corpCode: string, window: MonthWindow) => {
  const endpoint = buildUrl("/api/estkRs.json", {
    crtfc_key: env.opendartApiKey,
    corp_code: corpCode,
    bgn_de: window.bgnDe,
    end_de: window.endDe,
  });

  const response = await fetch(endpoint, { cache: "no-store" });
  const body = (await response.json()) as OpendartEquityResponse;

  if (!response.ok) {
    throw new Error(`OpenDART estkRs request failed: HTTP ${response.status}`);
  }

  if (body.status && body.status !== OPENDART_OK_STATUS) {
    if (body.status === "013") {
      return null;
    }

    throw new Error(`OpenDART estkRs request failed: ${body.status} ${body.message ?? ""}`.trim());
  }

  return body;
};

const selectGroupRows = (groups: OpendartEquityResponse["group"], title: string) =>
  groups?.find((group) => group.title === title)?.list ?? [];

export const fetchOpendartCurrentMonthIpos = async (): Promise<SourceIpoRecord[]> => {
  if (!env.opendartApiKey) {
    return [];
  }

  const selected = await pickMonthWithIpoDisclosures();
  if (!selected) {
    return [];
  }

  const { window, disclosures, usedFallback } = selected;
  const uniqueDisclosures = [...new Map(disclosures.sort(byLatestReceipt).map((item) => [item.corp_code, item])).values()];

  const records: Array<SourceIpoRecord | null> = await Promise.all(
    uniqueDisclosures.map(async (disclosure) => {
      const detail = await fetchEquitySecurityInfo(disclosure.corp_code, window);
      if (!detail?.group?.length) {
        return null;
      }

      const generalRows = [...selectGroupRows(detail.group, "일반사항")].sort(byLatestReceiptRow);
      const securityRows = [...selectGroupRows(detail.group, "증권의종류")].sort(byLatestReceiptRow);
      const underwriterRows = [...selectGroupRows(detail.group, "인수인정보")].sort(byLatestReceiptRow);
      const sellerRows = [...selectGroupRows(detail.group, "매출인에관한사항")].sort(byLatestReceiptRow);

      const general = generalRows[0];
      const security = securityRows[0];

      if (!general || !security) {
        return null;
      }

      const { start, end } = parseSubscriptionRange(general.sbd);
      if (!start || !end) {
        return null;
      }

      const underwriters = [...new Set(underwriterRows.map((row) => row.actnmn).filter(Boolean))];
      const representative = underwriterRows.find((row) => row.actsen?.includes("대표"))?.actnmn ?? underwriters[0] ?? disclosure.flr_nm ?? disclosure.corp_name;
      const coManagers = underwriters.filter((name) => name !== representative);
      const totalOfferedShares = parseNumber(security.stkcnt);
      const insiderSalesShares = sellerRows.reduce((sum, row) => sum + (parseNumber(row.slstk) ?? 0), 0);
      const insiderSalesRatio =
        totalOfferedShares && insiderSalesShares ? Number(((insiderSalesShares / totalOfferedShares) * 100).toFixed(1)) : null;

      const notes = [
        `OpenDART ${window.label} 증권신고서 기준`,
        usedFallback ? `현재달 공시가 없어 가장 최근 월(${window.label}) 데이터를 표시합니다.` : null,
        `접수일 ${disclosure.rcept_dt.slice(0, 4)}-${disclosure.rcept_dt.slice(4, 6)}-${disclosure.rcept_dt.slice(6, 8)}`,
      ].filter((value): value is string => Boolean(value));

      return {
        sourceKey: `opendart-estk:${window.key}:${disclosure.corp_code}`,
        name: disclosure.corp_name,
        market: mapMarket(general.corp_cls || disclosure.corp_cls),
        leadManager: representative,
        coManagers,
        priceBandLow: null,
        priceBandHigh: null,
        offerPrice: parseNumber(security.slprc),
        minimumSubscriptionShares: null,
        depositRate: null,
        subscriptionStart: start,
        subscriptionEnd: end,
        refundDate: null,
        listingDate: null,
        status: buildStatus(start, end),
        demandCompetitionRate: null,
        lockupRate: null,
        floatRatio: null,
        insiderSalesRatio,
        marketMoodScore: null,
        notes,
      } satisfies SourceIpoRecord;
    }),
  );

  return records.filter((record): record is SourceIpoRecord => record !== null);
};
