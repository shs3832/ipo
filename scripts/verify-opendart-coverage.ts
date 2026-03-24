import { buildOpendartIpoRanges, fetchOpendartCurrentMonthIpos } from "@/lib/sources/opendart-ipo";
import { env } from "@/lib/env";

type DisclosureRange = ReturnType<typeof buildOpendartIpoRanges>["disclosureRange"];
type DisplayRange = ReturnType<typeof buildOpendartIpoRanges>["displayRange"];

type RawDisclosureItem = {
  corp_code: string;
  corp_name: string;
  corp_cls: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
};

type RawListResponse = {
  status?: string;
  message?: string;
  total_page?: number;
  page_no?: number;
  list?: RawDisclosureItem[];
};

type OpendartEquityResponse = {
  status?: string;
  message?: string;
  group?: Array<{
    title: string;
    list?: Array<Record<string, string>>;
  }>;
};

const OPENDART_OK_STATUS = "000";
const PAGE_SIZE = 100;
const PAGE_BATCH_SIZE = 10;

const buildUrl = (path: string, params: Record<string, string>) => {
  const baseUrl = env.opendartBaseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(params);
  return `${baseUrl}${path}?${search.toString()}`;
};

const byLatestReceipt = (left: { rcept_no: string }, right: { rcept_no: string }) =>
  right.rcept_no.localeCompare(left.rcept_no);

const byLatestReceiptRow = (left: Record<string, string>, right: Record<string, string>) =>
  (right.rcept_no ?? "").localeCompare(left.rcept_no ?? "");

const isEquityIpoDisclosure = (item: RawDisclosureItem) =>
  item.report_nm.includes("증권신고서(지분증권)");

const assertListResponseOk = (body: RawListResponse) => {
  if (body.status && body.status !== OPENDART_OK_STATUS) {
    if (body.status === "013") {
      return false;
    }

    throw new Error(`OpenDART list request failed: ${body.status} ${body.message ?? ""}`.trim());
  }

  return true;
};

const assertEquityResponseOk = (body: OpendartEquityResponse) => {
  if (body.status && body.status !== OPENDART_OK_STATUS) {
    if (body.status === "013") {
      return false;
    }

    throw new Error(`OpenDART estkRs request failed: ${body.status} ${body.message ?? ""}`.trim());
  }

  return true;
};

const fetchDisclosurePage = async (range: DisclosureRange, pageNo: number) => {
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
  if (!response.ok) {
    throw new Error(`OpenDART list request failed: HTTP ${response.status}`);
  }

  return (await response.json()) as RawListResponse;
};

const fetchAllDisclosures = async (range: DisclosureRange) => {
  const firstPage = await fetchDisclosurePage(range, 1);
  if (!assertListResponseOk(firstPage)) {
    return [];
  }

  const disclosures = [...(firstPage.list ?? [])];
  const totalPages = firstPage.total_page ?? 1;
  const remainingPages = Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) => index + 2);

  for (let index = 0; index < remainingPages.length; index += PAGE_BATCH_SIZE) {
    const pageBatch = remainingPages.slice(index, index + PAGE_BATCH_SIZE);
    const batchResponses = await Promise.all(pageBatch.map((pageNo) => fetchDisclosurePage(range, pageNo)));

    for (const page of batchResponses) {
      if (!assertListResponseOk(page)) {
        continue;
      }

      disclosures.push(...(page.list ?? []));
    }
  }

  return disclosures.filter(isEquityIpoDisclosure);
};

const selectGroupRows = (groups: OpendartEquityResponse["group"], title: string) =>
  groups?.find((group) => group.title === title)?.list ?? [];

const parseSubscriptionRange = (value: string | undefined) => {
  if (!value || value === "-") {
    return { start: null, end: null };
  }

  const matches = [...value.matchAll(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/g)];
  if (matches.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: `${matches[0][1]}-${matches[0][2]}-${matches[0][3]}`,
    end: `${matches[matches.length - 1][1]}-${matches[matches.length - 1][2]}-${matches[matches.length - 1][3]}`,
  };
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

const isDateWithinRange = (dateKey: string | null | undefined, range: DisplayRange) => {
  if (!dateKey) {
    return false;
  }

  return dateKey >= `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}-01`
    && dateKey <= `${range.end.getFullYear()}-${String(range.end.getMonth() + 1).padStart(2, "0")}-${String(range.end.getDate()).padStart(2, "0")}`;
};

const shiftDay = (date: Date, offset: number) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
};

const toDateKey = (value: Date) =>
  `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;

const fetchEquitySecurityInfo = async (corpCode: string, range: DisclosureRange) => {
  const endpoint = buildUrl("/api/estkRs.json", {
    crtfc_key: env.opendartApiKey,
    corp_code: corpCode,
    bgn_de: toDateKey(shiftDay(range.start, -365)),
    end_de: toDateKey(shiftDay(range.end, 62)),
  });

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`OpenDART estkRs request failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as OpendartEquityResponse;
  if (!assertEquityResponseOk(body)) {
    return null;
  }

  return body;
};

const extractCorpCodeFromSourceKey = (sourceKey: string) => sourceKey.split(":").at(-1) ?? "";

const main = async () => {
  if (!env.opendartApiKey) {
    throw new Error("OPENDART_API_KEY is not configured.");
  }

  const { displayRange, disclosureRange } = buildOpendartIpoRanges();
  const [sourceRecords, allDisclosures] = await Promise.all([
    fetchOpendartCurrentMonthIpos({ forceRefresh: true }),
    fetchAllDisclosures(disclosureRange),
  ]);

  const uniqueDisclosures = [
    ...new Map(allDisclosures.sort(byLatestReceipt).map((item) => [item.corp_code, item])).values(),
  ];
  const expectedCandidates = await Promise.all(
    uniqueDisclosures.map(async (disclosure) => {
      const detail = await fetchEquitySecurityInfo(disclosure.corp_code, disclosureRange);
      if (!detail?.group?.length) {
        return null;
      }

      const generalRows = [...selectGroupRows(detail.group, "일반사항")].sort(byLatestReceiptRow);
      const general = generalRows[0];
      if (!general) {
        return null;
      }

      const { start, end } = parseSubscriptionRange(general.sbd);
      const refundDate = parseSingleDate(general.pymd);
      if (!start || !end) {
        return null;
      }

      if (
        !isDateWithinRange(start, displayRange) &&
        !isDateWithinRange(end, displayRange) &&
        !isDateWithinRange(refundDate, displayRange)
      ) {
        return null;
      }

      return {
        corpCode: disclosure.corp_code,
        name: disclosure.corp_name,
        subscriptionStart: start,
        subscriptionEnd: end,
        refundDate,
      };
    }),
  );

  const expected = expectedCandidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const expectedCorpCodes = new Set(expected.map((candidate) => candidate.corpCode));
  const sourceCorpCodes = new Set(sourceRecords.map((record) => extractCorpCodeFromSourceKey(record.sourceKey)));

  const missing = expected.filter((candidate) => !sourceCorpCodes.has(candidate.corpCode));
  const unexpected = sourceRecords
    .map((record) => ({
      corpCode: extractCorpCodeFromSourceKey(record.sourceKey),
      name: record.name,
    }))
    .filter((candidate) => candidate.corpCode && !expectedCorpCodes.has(candidate.corpCode));

  const summary = {
    displayRange: displayRange.label,
    disclosureRange: disclosureRange.label,
    fetchedDisclosures: allDisclosures.length,
    uniqueDisclosureCompanies: uniqueDisclosures.length,
    expectedDisplayRangeCompanies: expected.length,
    sourceRecordCount: sourceRecords.length,
    missing,
    unexpected,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (missing.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
