import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSeibroDutyDepoReasonResponse,
  parseSeibroDutyDepoStatusResponse,
} from "@/lib/sources/seibro-duty-depo";

test("parseSeibroDutyDepoStatusResponse parses market-wide duty depo status rows", () => {
  const xml = `
    <response>
      <header>
        <resultCode>00</resultCode>
        <resultMsg>NORMAL SERVICE.</resultMsg>
      </header>
      <body>
        <items>
          <item>
            <cocnt>119</cocnt>
            <issuStkKindTpcd>01</issuStkKindTpcd>
            <issuStkKindTpnm>보통주</issuStkKindTpnm>
            <issuStkqty>8550999746</issuStkqty>
            <safedpRatioValue>11</safedpRatioValue>
            <secncnt>119</secncnt>
            <stkDepoQty>1023695404</stkDepoQty>
          </item>
        </items>
      </body>
    </response>
  `;

  assert.deepEqual(parseSeibroDutyDepoStatusResponse(xml), [
    {
      stockKindCode: "01",
      stockKindName: "보통주",
      companyCount: 119,
      issueCount: 119,
      totalIssuedShares: 8550999746,
      dutyDepoShares: 1023695404,
      dutyDepoRatio: 11,
    },
  ]);
});

test("parseSeibroDutyDepoReasonResponse parses duty depo reason rows", () => {
  const xml = `
    <response>
      <header>
        <resultCode>00</resultCode>
        <resultMsg>NORMAL SERVICE.</resultMsg>
      </header>
      <body>
        <items>
          <item>
            <codevalueNm>최대주주(상장)</codevalueNm>
            <dutyDepoCocnt>47</dutyDepoCocnt>
            <dutyDepoSecncnt>48</dutyDepoSecncnt>
            <dutyDepoStkDepoQty>117506079</dutyDepoStkDepoQty>
            <safedpCocnt>10</safedpCocnt>
            <safedpRacd>03</safedpRacd>
            <safedpSecncnt>10</safedpSecncnt>
            <safedpStkDepoQty>84586168</safedpStkDepoQty>
          </item>
        </items>
      </body>
    </response>
  `;

  assert.deepEqual(parseSeibroDutyDepoReasonResponse(xml), [
    {
      reasonCode: "03",
      reasonName: "최대주주(상장)",
      dutyDepoCompanyCount: 47,
      dutyDepoIssueCount: 48,
      dutyDepoShares: 117506079,
      safeDepoCompanyCount: 10,
      safeDepoIssueCount: 10,
      safeDepoShares: 84586168,
    },
  ]);
});

test("parseSeibroDutyDepoStatusResponse throws on non-success result code", () => {
  const xml = `
    <response>
      <header>
        <resultCode>99</resultCode>
        <resultMsg>ERROR</resultMsg>
      </header>
    </response>
  `;

  assert.throws(() => parseSeibroDutyDepoStatusResponse(xml), /SEIBro request failed: 99 ERROR/);
});
