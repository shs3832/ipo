import assert from "node:assert/strict";
import test from "node:test";

import { isOnOrAfterKstDayOffset } from "@/lib/date";
import { buildOpendartIpoRanges, fetchCandidateDisclosuresForRange } from "@/lib/sources/opendart-ipo";

test("buildOpendartIpoRanges keeps a wider disclosure lookback for upcoming IPO coverage", () => {
  const { displayRange, disclosureRange } = buildOpendartIpoRanges(new Date("2026-03-24T12:00:00+09:00"));

  assert.equal(displayRange.key, "2026-03_2026-04");
  assert.equal(disclosureRange.key, "2026-01_2026-03");
});

test("fetchCandidateDisclosuresForRange crawls every disclosure page instead of truncating after page 8", async () => {
  const originalFetch = global.fetch;
  const seenPages: number[] = [];

  global.fetch = async (input) => {
    const url = new URL(String(input));
    const pageNo = Number(url.searchParams.get("page_no"));
    seenPages.push(pageNo);

    const targetOnPageNine = pageNo === 9;
    const list = targetOnPageNine
      ? [
          {
            corp_code: "01859500",
            corp_name: "아이엠바이오로직스",
            stock_code: "493280",
            corp_cls: "K",
            report_nm: "[발행조건확정]증권신고서(지분증권)",
            rcept_no: "20260310002450",
            rcept_dt: "20260310",
          },
        ]
      : [
          {
            corp_code: `corp-${pageNo}`,
            corp_name: `테스트종목${pageNo}`,
            stock_code: "",
            corp_cls: "E",
            report_nm: "투자설명서",
            rcept_no: `2026032400${String(pageNo).padStart(4, "0")}`,
            rcept_dt: "20260324",
          },
        ];

    return new Response(
      JSON.stringify({
        status: "000",
        message: "정상",
        page_no: pageNo,
        page_count: 100,
        total_count: 1200,
        total_page: 12,
        list,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  try {
    const results = await fetchCandidateDisclosuresForRange({
      key: "2026-03_2026-04",
      label: "2026년 01월 ~ 2026년 03월",
      bgnDe: "20260101",
      endDe: "20260331",
      start: new Date("2026-01-01T09:00:00+09:00"),
      end: new Date("2026-03-31T09:00:00+09:00"),
    });

    assert.equal(seenPages.length, 12);
    assert.equal(Math.max(...seenPages), 12);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.corp_name, "아이엠바이오로직스");
  } finally {
    global.fetch = originalFetch;
  }
});

test("isOnOrAfterKstDayOffset protects recently seen records across KST day boundaries", () => {
  assert.equal(
    isOnOrAfterKstDayOffset(
      new Date("2026-03-22T09:00:00+09:00"),
      -2,
      new Date("2026-03-24T12:00:00+09:00"),
    ),
    true,
  );
  assert.equal(
    isOnOrAfterKstDayOffset(
      new Date("2026-03-21T23:59:59+09:00"),
      -2,
      new Date("2026-03-24T12:00:00+09:00"),
    ),
    false,
  );
});
