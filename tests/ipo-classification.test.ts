import assert from "node:assert/strict";
import test from "node:test";

import { isSpacIpo, partitionAlertEligibleIpos } from "@/lib/ipo-classification";

test("isSpacIpo detects Korean and English SPAC naming patterns", () => {
  assert.equal(isSpacIpo({ name: "엔에이치스팩33호" }), true);
  assert.equal(isSpacIpo({ name: "신한제18호기업인수목적" }), true);
  assert.equal(isSpacIpo({ name: "Future SPAC Holdings" }), true);
  assert.equal(isSpacIpo({ name: "아이엠바이오로직스" }), false);
});

test("partitionAlertEligibleIpos excludes SPACs and preserves non-SPAC order", () => {
  const ipos = [
    { id: "spac-a", name: "엔에이치스팩33호" },
    { id: "regular-a", name: "아이엠바이오로직스" },
    { id: "spac-b", name: "Future SPAC Holdings" },
    { id: "regular-b", name: "바이오비쥬" },
  ];

  const result = partitionAlertEligibleIpos(ipos);

  assert.deepEqual(result.included.map((ipo) => ipo.id), ["regular-a", "regular-b"]);
  assert.deepEqual(result.excludedSpacs.map((ipo) => ipo.id), ["spac-a", "spac-b"]);
});
