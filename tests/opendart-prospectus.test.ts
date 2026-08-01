import assert from "node:assert/strict";
import test from "node:test";

import {
  extractConfirmedOfferPrice,
  extractLockupRateFromXmlTables,
  extractProspectusLeadManager,
  extractProspectusMarket,
  extractProspectusSchedule,
  isNewListingProspectus,
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

test("extractProspectusSchedule prefers the latest corrected subscription and payment dates", () => {
  const text = [
    "정정 전 일반청약자 청약일: 2026년 7월 23일 ~ 2026년 7월 24일 납 입 기 일 2026년 07월 28일",
    "정정 후 일반청약자 청약일: 2026년 7월 30일 ~ 2026년 7월 31일 납 입 기 일 2026년 08월 04일",
    "일반청약자 청약일: 2026년 7월 30일 ~ 2026년 7월 31일 납입기일인 2026년 8월 4일",
  ].join(" ");

  assert.deepEqual(extractProspectusSchedule(text), {
    subscriptionStart: "2026-07-30",
    subscriptionEnd: "2026-07-31",
    paymentDate: "2026-08-04",
  });
});

test("prospectus identity helpers parse depositary receipt IPO manager and market", () => {
  const text = [
    "대표주관회사 삼성증권 증권예탁증권 5,000,000DR",
    "본 주식은 코스닥시장 상장을 목적으로 모집합니다.",
  ].join(" ");

  assert.equal(extractProspectusLeadManager(text), "삼성증권");
  assert.equal(extractProspectusMarket(text), "KOSDAQ");
  assert.equal(isNewListingProspectus("코스닥시장 신규상장 예비심사 승인을 받았습니다."), true);
  assert.equal(isNewListingProspectus("기존 상장회사의 일반공모입니다."), false);
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
