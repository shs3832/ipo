import assert from "node:assert/strict";
import test from "node:test";

import { extractCompanyIdentity } from "@/lib/sources/kind-offer-details";

test("extractCompanyIdentity parses name and market from KIND company overview icon src", () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <th scope="row">회사명</th>
          <td>
            <img align='absmiddle' src='/images/common/icn_t_yu.gif'/>
            케이뱅크
          </td>
        </tr>
      </tbody>
    </table>
  `;

  assert.deepEqual(extractCompanyIdentity(html), {
    name: "케이뱅크",
    market: "KOSPI",
  });
});

test("extractCompanyIdentity still supports KIND market alt labels", () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <th scope="row">회사명</th>
          <td>
            <img src='/images/common/icn_t_ko.gif' alt='코스닥' />
            에스팀
          </td>
        </tr>
      </tbody>
    </table>
  `;

  assert.deepEqual(extractCompanyIdentity(html), {
    name: "에스팀",
    market: "KOSDAQ",
  });
});
