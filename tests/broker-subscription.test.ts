import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBrokerName } from "@/lib/broker-brand";
import {
  parseDaishinNoticeDetail,
  parseDaishinNoticeList,
  parseDaishinPdfText,
  parseHanaSecuritiesGuide,
  parseKbSecuritiesGuide,
  parseKoreaInvestmentGuide,
  parseKoreaInvestmentIpoCatalog,
  parseMiraeAssetGuide,
  parseSamsungSecuritiesGuide,
  parseShinhanInvestmentGuide,
} from "@/lib/sources/broker-subscription";

test("parseKoreaInvestmentGuide extracts the standard online subscription fee", () => {
  const html = `
    <table>
      <caption>공모주 청약 매체 및 수수료 안내</caption>
      <thead>
        <tr>
          <th>구분</th>
          <th>VIP</th>
          <th>골드</th>
          <th>프라임</th>
          <th>패밀리</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>온라인</td>
          <td>무료</td>
          <td>무료</td>
          <td>무료</td>
          <td>2,000원</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseKoreaInvestmentGuide(html);

  assert.equal(guide.brokerName, "한국투자증권");
  assert.equal(guide.subscriptionFee, 2000);
});

test("parseShinhanInvestmentGuide extracts the retail online subscription fee", () => {
  const html = `
    <table>
      <caption>청약 수수료</caption>
      <thead>
        <tr>
          <th>*등급</th>
          <th>영업점/유선</th>
          <th>*온라인/ARS</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>클래식</td>
          <td>2,000원</td>
          <td>1,000원</td>
        </tr>
        <tr>
          <td>일반</td>
          <td>2,000원</td>
          <td>2,000원</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseShinhanInvestmentGuide(html);

  assert.equal(guide.brokerName, "신한투자증권");
  assert.equal(guide.subscriptionFee, 2000);
});

test("parseKbSecuritiesGuide extracts the standard online subscription fee and online-only restriction", () => {
  const html = `
    <div>온라인 청약만 가능, 영업점(유선포함)/고객센터 청약불가</div>
    <div>* 단, 65세 이상 고객은 온라인/오프라인 모두 가능</div>
    <table>
      <caption>일반배정고객분 청약수수료</caption>
      <thead>
        <tr>
          <th>구분</th>
          <th>VVIP/VIP/그랜드</th>
          <th>베스트</th>
          <th>패밀리(일반)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>오프라인</th>
          <td rowspan="2">무료</td>
          <td colspan="2">4,000원</td>
        </tr>
        <tr>
          <th>온라인</th>
          <td>무료</td>
          <td>1,500원</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseKbSecuritiesGuide(html);

  assert.equal(guide.brokerName, "KB증권");
  assert.equal(guide.subscriptionFee, 1500);
  assert.equal(guide.hasOnlineOnlyCondition, true);
  assert.match(guide.notes.join(" "), /온라인 청약만 가능/);
});

test("parseMiraeAssetGuide extracts the standard online subscription fee", () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <th rowspan="4">공모주 청약(일반)</th>
          <th>영업점, STM</th>
          <td>면제</td>
          <td>면제</td>
          <td colspan="3">5,000원</td>
        </tr>
        <tr>
          <th>온라인<br/>(홈페이지, HTS 등)</th>
          <td>면제</td>
          <td>면제</td>
          <td>면제</td>
          <td>면제</td>
          <td>2,000원<br/>(미 배정시 면제)</td>
        </tr>
        <tr>
          <th>청약 수수료 징구일</th>
          <td colspan="5">환불일</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseMiraeAssetGuide(html);

  assert.equal(guide.brokerName, "미래에셋증권");
  assert.equal(guide.subscriptionFee, 2000);
  assert.equal(guide.hasOnlineOnlyCondition, false);
  assert.match(guide.notes.join(" "), /미배정이면 수수료를 면제/);
});

test("parseSamsungSecuritiesGuide extracts free online subscription fee", () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <td rowspan="2">공모주 청약</td>
          <td>지점</td>
          <td>무료</td>
          <td>5,000원</td>
          <td>5,000원</td>
        </tr>
        <tr>
          <td>온라인</td>
          <td>무료</td>
          <td>무료</td>
          <td>무료</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseSamsungSecuritiesGuide(html);

  assert.equal(guide.brokerName, "삼성증권");
  assert.equal(guide.subscriptionFee, 0);
  assert.match(guide.notes.join(" "), /무료/);
});

test("parseHanaSecuritiesGuide extracts the online subscription fee", () => {
  const html = `
    <table>
      <caption>업무수수료</caption>
      <tbody>
        <tr>
          <th rowspan="2">공모주청약</th>
          <th>영업점</th>
          <td>4,000원</td>
          <td>4,000원</td>
        </tr>
        <tr>
          <th>온라인(HTS/MTS/홈페이지/ARS)</th>
          <td>2,000원</td>
          <td>2,000원</td>
        </tr>
      </tbody>
    </table>
  `;

  const guide = parseHanaSecuritiesGuide(html);

  assert.equal(guide.brokerName, "하나증권");
  assert.equal(guide.subscriptionFee, 2000);
});

test("normalizeBrokerName canonicalizes Korean broker aliases used by source data", () => {
  assert.equal(normalizeBrokerName("케이비증권"), "kb증권");
  assert.equal(normalizeBrokerName("엔에이치투자증권"), "nh투자증권");
});

test("parseKoreaInvestmentIpoCatalog extracts public maximum subscription limits per issuer", () => {
  const html = `
    <table>
      <caption>청약종목안내 테이블 입니다.</caption>
      <thead>
        <tr>
          <th>분류</th>
          <th>기업명</th>
          <th>대표주관회사</th>
          <th>청약기간</th>
          <th>환불일</th>
          <th>최고청약한도</th>
          <th>확정발행가</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>코스닥시장</td>
          <td>(주)아이엠바이오로직스</td>
          <td>한국투자증권</td>
          <td>2026.03.11~2026.03.12</td>
          <td>2026.03.16</td>
          <td>33,000주</td>
          <td>26,000</td>
        </tr>
        <tr>
          <td>코스닥시장</td>
          <td>한패스(주)</td>
          <td>한국투자증권</td>
          <td>2026.03.16~2026.03.17</td>
          <td>2026.03.19</td>
          <td>21,000주</td>
          <td>19,000</td>
        </tr>
      </tbody>
    </table>
  `;

  const entries = parseKoreaInvestmentIpoCatalog(html);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    name: "(주)아이엠바이오로직스",
    normalizedName: "아이엠바이오로직스",
    subscriptionStart: "2026-03-11",
    subscriptionEnd: "2026-03-12",
    refundDate: "2026-03-16",
    maximumSubscriptionShares: 33000,
    offerPrice: 26000,
  });
});

test("parseDaishinNoticeList extracts current issue notice entries", () => {
  const html = `
    <li>
      <a id='_18047' href='./DM_Basic_Read.aspx?seq=18047&page=1&m=3817&boardseq=114'>
        <p>한패스㈜ 배정주식 및 환불 결과 안내</p>
        <div class="date_area"><span class="date">2026.03.18</span></div>
      </a>
    </li>
  `;

  const entries = parseDaishinNoticeList(html);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.seq, "18047");
  assert.equal(entries[0]?.publishedDate, "2026-03-18");
  assert.match(entries[0]?.url ?? "", /seq=18047/);
});

test("parseDaishinNoticeDetail extracts body metrics and attachment urls", () => {
  const html = `
    <script>
      function goMTSNoticePdfUrl(){ location.href='http://money2.daishin.com/html/Notice/2026/downloads/hanpass0325.pdf';}
    </script>
    <div class="listArticle">
      <p>한패스㈜ 배정주식 및 환불 결과 안내</p>
    </div>
    <div class="detail_area">
      <ul class="dotConList">
        <li><strong>총경쟁률</strong> : 1,411.14 : 1 (중복청약자제외)</li>
        <li><strong>환불∙납입일</strong> : 2026. 03. 19 (목)</li>
      </ul>
    </div>
    <div class="bottom_btn"></div>
  `;

  const detail = parseDaishinNoticeDetail(html);

  assert.equal(detail.title, "한패스㈜ 배정주식 및 환불 결과 안내");
  assert.match(detail.bodyText, /1,411\.14 : 1/);
  assert.deepEqual(detail.attachmentUrls, ["https://money2.daishin.com/html/Notice/2026/downloads/hanpass0325.pdf"]);
});

test("parseDaishinPdfText extracts allocation pool and competition metrics from result pdf text", () => {
  const text = `
    한패스㈜ 배정 및 환불 안내
    주1) 당사는 일반배정물량 55,000주를 균등배정 27,500주(50.0%), 비례배정 27,500주(50.0%)으로 배정하였습니다.
    한패스㈜ 19,000원 107,009건 1,411.14 대 1 2,822.27 대 1
  `;

  const detail = parseDaishinPdfText(text);

  assert.equal(detail.generalCompetitionRate, 1411.14);
  assert.equal(detail.allocatedShares, 55000);
  assert.equal(detail.equalAllocatedShares, 27500);
  assert.equal(detail.proportionalAllocatedShares, 27500);
});
