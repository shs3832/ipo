import type { SourceIpoRecord } from "@/lib/types";
import { getKstMonthRange, getKstTodayKey } from "@/lib/date";
import { env } from "@/lib/env";
import { getCachedExternalData } from "@/lib/external-cache";
import { fetchLatestFinancialSnapshot } from "@/lib/sources/opendart-financials";
import {
  fetchOpendartProspectusDetails,
  type OpendartProspectusDetails,
} from "@/lib/sources/opendart-prospectus";

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

type DateRange = {
  key: string;
  label: string;
  bgnDe: string;
  endDe: string;
  start: Date;
  end: Date;
};

const OPENDART_OK_STATUS = "000";
const PAGE_SIZE = 100;
const DISCLOSURE_LOOKBACK_MONTHS = 2;
const DISCLOSURE_PAGE_FETCH_BATCH_SIZE = 10;
const OPENDART_SOURCE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
type FetchOpendartCurrentMonthIposOptions = {
  forceRefresh?: boolean;
};

type OpendartCurrentMonthIpoResult = {
  records: SourceIpoRecord[];
  excludedNonIpoNames: string[];
};

const buildUrl = (path: string, params: Record<string, string>) => {
  const baseUrl = env.opendartBaseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(params);
  return `${baseUrl}${path}?${search.toString()}`;
};

const shiftDay = (date: Date, offset: number) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
};

const toDateKey = (value: Date) =>
  `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;

const toDateRange = (start: Date, end: Date, label: string, key: string): DateRange => ({
  key,
  label,
  bgnDe: toDateKey(start),
  endDe: toDateKey(end),
  start,
  end,
});

export const buildOpendartIpoRanges = (date = new Date()) => {
  const currentMonth = getKstMonthRange(date, 0);
  const nextMonth = getKstMonthRange(date, 1);
  const lookbackMonth = getKstMonthRange(date, -DISCLOSURE_LOOKBACK_MONTHS);

  return {
    displayRange: toDateRange(
      currentMonth.start,
      nextMonth.end,
      `${currentMonth.label} ~ ${nextMonth.label}`,
      `${currentMonth.key}_${nextMonth.key}`,
    ),
    disclosureRange: toDateRange(
      lookbackMonth.start,
      currentMonth.end,
      `${lookbackMonth.label} ~ ${currentMonth.label}`,
      `${lookbackMonth.key}_${currentMonth.key}`,
    ),
  };
};

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

const parseSingleDate = (value: string | undefined) => {
  if (!value || value === "-") {
    return null;
  }

  const match = value.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
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

  const todayKey = getKstTodayKey();

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

const hasMeaningfulOpendartValue = (value: string | undefined | null) => {
  const normalized = value?.trim();
  return Boolean(normalized && normalized !== "-");
};

export const isLikelyNewListingGeneralRow = (general: Record<string, string>) =>
  !hasMeaningfulOpendartValue(general.asstd);

const isExcludedNonIpoResult = (
  record: SourceIpoRecord | { kind: "excluded_non_ipo"; name: string } | null,
): record is { kind: "excluded_non_ipo"; name: string } => Boolean(record && "kind" in record);

const byLatestReceipt = (left: { rcept_no: string }, right: { rcept_no: string }) =>
  right.rcept_no.localeCompare(left.rcept_no);

const byLatestReceiptRow = (left: Record<string, string>, right: Record<string, string>) =>
  (right.rcept_no ?? "").localeCompare(left.rcept_no ?? "");

const isDateWithinRange = (dateKey: string | null | undefined, range: DateRange) => {
  if (!dateKey) {
    return false;
  }

  return dateKey >= `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}-01`
    && dateKey <= `${range.end.getFullYear()}-${String(range.end.getMonth() + 1).padStart(2, "0")}-${String(range.end.getDate()).padStart(2, "0")}`;
};

const fetchDisclosurePage = async (range: DateRange, pageNo: number) => {
  const endpoint = buildUrl("/api/list.json", {
    crtfc_key: env.opendartApiKey,
    bgn_de: range.bgnDe,
    end_de: range.endDe,
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

const assertListResponseOk = (body: OpendartListResponse) => {
  if (body.status && body.status !== OPENDART_OK_STATUS) {
    if (body.status === "013") {
      return false;
    }

    throw new Error(`OpenDART list request failed: ${body.status} ${body.message ?? ""}`.trim());
  }

  return true;
};

export const fetchCandidateDisclosuresForRange = async (range: DateRange): Promise<OpendartDisclosureItem[]> => {
  const firstPage = await fetchDisclosurePage(range, 1);

  if (!assertListResponseOk(firstPage)) {
    return [];
  }

  const totalPages = firstPage.total_page ?? 1;
  const disclosures = [...(firstPage.list ?? [])];
  const remainingPages = Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) => index + 2);

  for (let index = 0; index < remainingPages.length; index += DISCLOSURE_PAGE_FETCH_BATCH_SIZE) {
    const pageBatch = remainingPages.slice(index, index + DISCLOSURE_PAGE_FETCH_BATCH_SIZE);
    const batchResponses = await Promise.all(pageBatch.map((pageNo) => fetchDisclosurePage(range, pageNo)));

    for (const nextPage of batchResponses) {
      if (!assertListResponseOk(nextPage)) {
        continue;
      }

      disclosures.push(...(nextPage.list ?? []));
    }
  }

  return disclosures.filter(isEquityIpoDisclosure);
};

const fetchEquitySecurityInfo = async (corpCode: string, range: DateRange) => {
  const detailBgnDe = toDateKey(shiftDay(range.start, -365));
  const detailEndDe = toDateKey(shiftDay(range.end, 62));
  const endpoint = buildUrl("/api/estkRs.json", {
    crtfc_key: env.opendartApiKey,
    corp_code: corpCode,
    bgn_de: detailBgnDe,
    end_de: detailEndDe,
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

const hasCoreProspectusDetails = (prospectus: OpendartProspectusDetails | null) =>
  Boolean(
    prospectus
    && prospectus.priceBandLow != null
    && prospectus.priceBandHigh != null
    && prospectus.minimumSubscriptionShares != null
    && prospectus.depositRate != null,
  );

const mergeProspectusDetails = (
  primary: OpendartProspectusDetails | null,
  fallback: OpendartProspectusDetails | null,
): OpendartProspectusDetails | null => {
  if (!primary && !fallback) {
    return null;
  }

  return {
    receiptNo: primary?.receiptNo ?? fallback?.receiptNo ?? "",
    priceBandLow: primary?.priceBandLow ?? fallback?.priceBandLow ?? null,
    priceBandHigh: primary?.priceBandHigh ?? fallback?.priceBandHigh ?? null,
    minimumSubscriptionShares: primary?.minimumSubscriptionShares ?? fallback?.minimumSubscriptionShares ?? null,
    depositRate: primary?.depositRate ?? fallback?.depositRate ?? null,
    demandCompetitionRate: primary?.demandCompetitionRate ?? fallback?.demandCompetitionRate ?? null,
    lockupRate: primary?.lockupRate ?? fallback?.lockupRate ?? null,
    financialSnapshot: primary?.financialSnapshot ?? fallback?.financialSnapshot ?? null,
  };
};

const fetchOpendartCurrentMonthIposUncached = async (
  displayRange: DateRange,
  disclosureRange: DateRange,
  { forceRefresh = false }: FetchOpendartCurrentMonthIposOptions = {},
): Promise<OpendartCurrentMonthIpoResult> => {
  const disclosures = await fetchCandidateDisclosuresForRange(disclosureRange);
  if (disclosures.length === 0) {
    return {
      records: [],
      excludedNonIpoNames: [],
    };
  }
  const uniqueDisclosures = [...new Map(disclosures.sort(byLatestReceipt).map((item) => [item.corp_code, item])).values()];

  const records: Array<SourceIpoRecord | { kind: "excluded_non_ipo"; name: string } | null> = await Promise.all(
    uniqueDisclosures.map(async (disclosure) => {
      const detail = await fetchEquitySecurityInfo(disclosure.corp_code, disclosureRange);
      if (!detail?.group?.length) {
        return null;
      }
      const [financialsFromApi, latestProspectus] = await Promise.all([
        fetchLatestFinancialSnapshot(disclosure.corp_code),
        fetchOpendartProspectusDetails(disclosure.rcept_no, { forceRefresh }).catch(() => null),
      ]);

      const generalRows = [...selectGroupRows(detail.group, "일반사항")].sort(byLatestReceiptRow);
      const securityRows = [...selectGroupRows(detail.group, "증권의종류")].sort(byLatestReceiptRow);
      const underwriterRows = [...selectGroupRows(detail.group, "인수인정보")].sort(byLatestReceiptRow);
      const sellerRows = [...selectGroupRows(detail.group, "매출인에관한사항")].sort(byLatestReceiptRow);

      const general = generalRows[0];
      const security = securityRows[0];

      if (!general || !security) {
        return null;
      }

      // Existing listed-company rights/public offering cases in estkRs expose an allotment
      // record date (`asstd`), while 신규 상장 건은 현재 수집 범위에서 `-`로 내려온다.
      if (!isLikelyNewListingGeneralRow(general)) {
        return {
          kind: "excluded_non_ipo" as const,
          name: disclosure.corp_name,
        };
      }

      const fallbackProspectusReceiptNo = general.rcept_no ?? security.rcept_no ?? null;
      const shouldFetchFallbackProspectus = Boolean(
        fallbackProspectusReceiptNo
        && fallbackProspectusReceiptNo !== disclosure.rcept_no
        && (!latestProspectus || !hasCoreProspectusDetails(latestProspectus) || (!financialsFromApi && !latestProspectus.financialSnapshot)),
      );
      const fallbackProspectus = (
        shouldFetchFallbackProspectus
      )
        ? await fetchOpendartProspectusDetails(fallbackProspectusReceiptNo!, { forceRefresh }).catch(() => null)
        : null;
      const prospectus = mergeProspectusDetails(latestProspectus, fallbackProspectus);
      const financials = financialsFromApi ?? prospectus?.financialSnapshot ?? null;

      const { start, end } = parseSubscriptionRange(general.sbd);
      if (!start || !end) {
        return null;
      }

      const refundDate = parseSingleDate(general.pymd);
      const listingDate = null;

      if (
        !isDateWithinRange(start, displayRange) &&
        !isDateWithinRange(end, displayRange) &&
        !isDateWithinRange(refundDate, displayRange) &&
        !isDateWithinRange(listingDate, displayRange)
      ) {
        return null;
      }

      const underwriters = [...new Set(underwriterRows.map((row) => row.actnmn).filter(Boolean))];
      const representative = underwriterRows.find((row) => row.actsen?.includes("대표"))?.actnmn ?? underwriters[0] ?? disclosure.flr_nm ?? disclosure.corp_name;
      const coManagers = underwriters.filter((name) => name !== representative);
      const totalOfferedShares = parseNumber(security.stkcnt);
      const insiderSalesShares = sellerRows.reduce((sum, row) => sum + (parseNumber(row.slstk) ?? 0), 0);
      const insiderSalesRatio =
        totalOfferedShares && insiderSalesShares ? Number(((insiderSalesShares / totalOfferedShares) * 100).toFixed(1)) : null;
      const newShares =
        totalOfferedShares != null
          ? Math.max(totalOfferedShares - insiderSalesShares, 0)
          : null;

      const notes = [
        `OpenDART ${disclosureRange.label} 공시 기준`,
        `표시 범위 ${displayRange.label}`,
        `접수일 ${disclosure.rcept_dt.slice(0, 4)}-${disclosure.rcept_dt.slice(4, 6)}-${disclosure.rcept_dt.slice(6, 8)}`,
        financials?.reportLabel ? `재무지표 기준 ${financials.reportLabel}` : null,
        prospectus?.demandCompetitionRate != null ? `증권신고서 기준 기관 수요예측 경쟁률 ${prospectus.demandCompetitionRate}:1` : null,
        prospectus?.lockupRate != null ? `증권신고서 기준 의무보유확약 비율 ${prospectus.lockupRate}%` : null,
      ].filter((value): value is string => Boolean(value));

      return {
        sourceKey: `opendart-estk:${displayRange.key}:${disclosure.corp_code}`,
        corpCode: disclosure.corp_code,
        stockCode: disclosure.stock_code?.trim() || null,
        latestDisclosureNo: disclosure.rcept_no,
        name: disclosure.corp_name,
        market: mapMarket(general.corp_cls || disclosure.corp_cls),
        leadManager: representative,
        coManagers,
        priceBandLow: prospectus?.priceBandLow ?? null,
        priceBandHigh: prospectus?.priceBandHigh ?? null,
        offerPrice: parseNumber(security.slprc),
        minimumSubscriptionShares: prospectus?.minimumSubscriptionShares ?? null,
        depositRate: prospectus?.depositRate ?? null,
        totalOfferedShares,
        newShares,
        secondaryShares: insiderSalesShares || null,
        listedShares: null,
        subscriptionStart: start,
        subscriptionEnd: end,
        // OpenDART estkRs exposes payment date (`pymd`) but not a stable refund date field.
        // We refresh this daily and use it as the closest available refund schedule until a better source is added.
        refundDate,
        listingDate,
        status: buildStatus(start, end),
        demandCompetitionRate: prospectus?.demandCompetitionRate ?? null,
        lockupRate: prospectus?.lockupRate ?? null,
        floatRatio: null,
        insiderSalesRatio,
        marketMoodScore: null,
        financialReportLabel: financials?.reportLabel ?? null,
        revenue: financials?.revenue ?? null,
        previousRevenue: financials?.previousRevenue ?? null,
        revenueGrowthRate: financials?.revenueGrowthRate ?? null,
        operatingIncome: financials?.operatingIncome ?? null,
        previousOperatingIncome: financials?.previousOperatingIncome ?? null,
        operatingMarginRate: financials?.operatingMarginRate ?? null,
        netIncome: financials?.netIncome ?? null,
        previousNetIncome: financials?.previousNetIncome ?? null,
        totalAssets: financials?.totalAssets ?? null,
        totalLiabilities: financials?.totalLiabilities ?? null,
        totalEquity: financials?.totalEquity ?? null,
        debtRatio: financials?.debtRatio ?? null,
        notes,
      } satisfies SourceIpoRecord;
    }),
  );

  return {
    records: records.filter((record): record is SourceIpoRecord => Boolean(record && "sourceKey" in record)),
    excludedNonIpoNames: records.filter(isExcludedNonIpoResult).map((record) => record.name),
  };
};

export const fetchOpendartCurrentMonthIpoResult = async ({
  forceRefresh = false,
}: FetchOpendartCurrentMonthIposOptions = {}): Promise<OpendartCurrentMonthIpoResult> => {
  if (!env.opendartApiKey) {
    return {
      records: [],
      excludedNonIpoNames: [],
    };
  }

  const { displayRange, disclosureRange } = buildOpendartIpoRanges();

  return getCachedExternalData(
    {
      key: `opendart-current-month-ipos:${displayRange.key}:${disclosureRange.key}`,
      source: "opendart-current-month-ipos",
      ttlMs: OPENDART_SOURCE_CACHE_TTL_MS,
      bypass: forceRefresh,
    },
    async () => fetchOpendartCurrentMonthIposUncached(displayRange, disclosureRange, { forceRefresh }),
  );
};

export const fetchOpendartCurrentMonthIpos = async ({
  forceRefresh = false,
}: FetchOpendartCurrentMonthIposOptions = {}): Promise<SourceIpoRecord[]> =>
  (await fetchOpendartCurrentMonthIpoResult({ forceRefresh })).records;
