import assert from "node:assert/strict";
import test from "node:test";

import { membershipForInvitation } from "./invitation-state";

test("an invitation selects only the invited business", () => {
  const invited = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const other = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(membershipForInvitation([{ businessId: other }, { businessId: invited }], invited), invited);
  assert.equal(membershipForInvitation([{ businessId: other }], invited), null);
  assert.equal(membershipForInvitation([{ businessId: invited }], null), null);
});
