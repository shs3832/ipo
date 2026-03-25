import assert from "node:assert/strict";
import test from "node:test";

import { extractKindListingScheduleEntries } from "@/lib/sources/kind-listing-schedule";

test("extractKindListingScheduleEntries parses listing calendar cells into company events", () => {
  const html = `
    <table>
      <tbody>
        <tr>
          <td>5
            <ul>
              <li style="background:#EBF6F8;color:#0390AA;text-align:center"><strong>상장</strong></li>
              <li>
                <a href="#" onclick="fnDetailView('20250728000549')" style='cursor:pointer'>
                  <img src='../images/common/icn_t_yu.gif' class='vmiddle' alt='유가증권' />
                  케이뱅크
                </a>
              </li>
            </ul>
          </td>
          <td>27
            <ul>
              <li style="background:#EBF6F8;color:#0390AA;text-align:center"><strong>상장</strong></li>
              <li>
                <a href="#" onclick="fnDetailView('20251103000255')" style='cursor:pointer'>
                  <img src='../images/common/icn_t_ko.gif' class='vmiddle' alt='코스닥' />
                  엔에이치스팩33호
                </a>
              </li>
              <li>
                <a href="#" onclick="fnDetailView('20250827000564')" style='cursor:pointer'>
                  <img src='../images/common/icn_t_ko.gif' class='vmiddle' alt='코스닥' />
                  코스모로보틱스
                </a>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
  `;

  assert.deepEqual(
    extractKindListingScheduleEntries(html, "2026", "03"),
    [
      {
        name: "케이뱅크",
        listingDate: "2026-03-05",
        bizProcessNo: "20250728000549",
      },
      {
        name: "엔에이치스팩33호",
        listingDate: "2026-03-27",
        bizProcessNo: "20251103000255",
      },
      {
        name: "코스모로보틱스",
        listingDate: "2026-03-27",
        bizProcessNo: "20250827000564",
      },
    ],
  );
});
