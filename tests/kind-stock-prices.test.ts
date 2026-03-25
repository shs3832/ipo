import assert from "node:assert/strict";
import test from "node:test";

import { extractStockPriceSnapshot } from "@/lib/sources/kind-stock-prices";

test("extractStockPriceSnapshot parses KIND delayed quote timestamp format", () => {
  const html = `
    <input type="hidden" id="repIsuSrtCd" name="repIsuSrtCd" value="A279570" />
    <table>
      <tbody>
        <tr>
          <th scope="row">현재가</th>
          <td><strong>6320</strong></td>
          <th scope="row">전일가</th>
          <td>6120</td>
        </tr>
        <tr>
          <th scope="row">시가</th>
          <td>6200</td>
        </tr>
      </tbody>
    </table>
    <em>* 2026-03-25 15:30:10 기준</em>
  `;

  assert.deepEqual(extractStockPriceSnapshot(html, "27957"), {
    issueCode: "27957",
    shortCode: "A279570",
    priceDate: "2026-03-25",
    priceAsOf: "2026-03-25 15:30:10",
    openingPrice: 6200,
    currentPrice: 6320,
    previousClosePrice: 6120,
  });
});

test("extractStockPriceSnapshot still supports legacy 종가 기준 labels", () => {
  const html = `
    <input type="hidden" id="repIsuSrtCd" name="repIsuSrtCd" value="A493280" />
    <table>
      <tbody>
        <tr>
          <th scope="row">현재가</th>
          <td><strong>104000</strong></td>
          <th scope="row">전일가</th>
          <td>26000</td>
        </tr>
        <tr>
          <th scope="row">시가</th>
          <td>104000</td>
        </tr>
      </tbody>
    </table>
    <em>* 2026-03-20 종가 기준</em>
  `;

  assert.deepEqual(extractStockPriceSnapshot(html, "49328"), {
    issueCode: "49328",
    shortCode: "A493280",
    priceDate: "2026-03-20",
    priceAsOf: "2026-03-20",
    openingPrice: 104000,
    currentPrice: 104000,
    previousClosePrice: 26000,
  });
});
