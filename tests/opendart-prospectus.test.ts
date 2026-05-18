import assert from "node:assert/strict";
import test from "node:test";

import {
  extractConfirmedOfferPrice,
  extractLockupRateFromXmlTables,
} from "@/lib/sources/opendart-prospectus";

test("extractConfirmedOfferPrice parses explicit confirmed offer price copy", () => {
  assert.equal(
    extractConfirmedOfferPrice("확정 공모가액은 15,000원으로 결정되었습니다."),
    15_000,
  );
  assert.equal(
    extractConfirmedOfferPrice("공모가격을 13,500원으로 확정하였습니다."),
    13_500,
  );
  assert.equal(
    extractConfirmedOfferPrice("희망공모가격은 12,500 ~ 15,000 원입니다."),
    null,
  );
});

test("extractLockupRateFromXmlTables calculates issuer lockup rate from demand forecast quantity table", () => {
  const xml = `
    <DOCUMENT>
      <TABLE>
        <TR>
          <TD>구분</TD>
          <TD>운용사(집합) 공모</TD>
          <TD>운용사(집합) 공모</TD>
          <TD>운용사(집합) 사모</TD>
          <TD>운용사(집합) 사모</TD>
        </TR>
        <TR>
          <TD>구분</TD>
          <TD>건수</TD>
          <TD>수량</TD>
          <TD>건수</TD>
          <TD>수량</TD>
        </TR>
        <TR>
          <TD>6개월 확약</TD>
          <TD>10</TD>
          <TD>100,000</TD>
          <TD>5</TD>
          <TD>50,000</TD>
        </TR>
        <TR>
          <TD>3개월 확약</TD>
          <TD>4</TD>
          <TD>25,000</TD>
          <TD>3</TD>
          <TD>25,000</TD>
        </TR>
        <TR>
          <TD>미확약</TD>
          <TD>30</TD>
          <TD>200,000</TD>
          <TD>10</TD>
          <TD>100,000</TD>
        </TR>
        <TR>
          <TD>합 계</TD>
          <TD>49</TD>
          <TD>325,000</TD>
          <TD>18</TD>
          <TD>175,000</TD>
        </TR>
      </TABLE>
    </DOCUMENT>
  `;

  assert.equal(extractLockupRateFromXmlTables(xml), 40);
});

test("extractLockupRateFromXmlTables ignores explanatory lockup tables without issuer total rows", () => {
  const xml = `
    <DOCUMENT>
      <TABLE>
        <TR>
          <TD>구분</TD>
          <TD>배정 원칙</TD>
        </TR>
        <TR>
          <TD>15일 확약</TD>
          <TD>우선 배정 가능</TD>
        </TR>
        <TR>
          <TD>미확약</TD>
          <TD>일반 배정</TD>
        </TR>
      </TABLE>
    </DOCUMENT>
  `;

  assert.equal(extractLockupRateFromXmlTables(xml), null);
});
