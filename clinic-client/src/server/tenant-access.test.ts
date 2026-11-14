import assert from "node:assert/strict";
import test from "node:test";

import { TenantAccessError, resolveBusinessAccess } from "./tenant-access.ts";

const membershipId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

test("returns the membership business id", () => {
  assert.equal(
    resolveBusinessAccess({ membershipBusinessId: membershipId }),
    membershipId,
  );
});

test("accepts a browser id only when it matches the membership", () => {
  assert.equal(
    resolveBusinessAccess({
      membershipBusinessId: membershipId,
      browserBusinessId: membershipId,
    }),
    membershipId,
  );
});

test("rejects a browser id that differs from the membership", () => {
  assert.throws(
    () =>
      resolveBusinessAccess({
        membershipBusinessId: membershipId,
        browserBusinessId: otherId,
      }),
    TenantAccessError,
  );
});

test("rejects a missing membership even when the browser sends an id", () => {
  assert.throws(
    () =>
      resolveBusinessAccess({
        membershipBusinessId: null,
        browserBusinessId: otherId,
      }),
    TenantAccessError,
  );
  assert.throws(
    () => resolveBusinessAccess({ membershipBusinessId: "  " }),
    TenantAccessError,
  );
});
