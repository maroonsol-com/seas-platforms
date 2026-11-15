import assert from "node:assert/strict";
import test from "node:test";

import { canAssignRole, classifyInvitation } from "./invitations";

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

test("a current invitation is valid", () => {
  assert.equal(classifyInvitation({ expiresAt: future, acceptedAt: null, revokedAt: null }), "valid");
});

test("an expired invitation cannot be used", () => {
  assert.equal(classifyInvitation({ expiresAt: past, acceptedAt: null, revokedAt: null }), "expired");
});

test("an accepted invitation cannot be used again", () => {
  assert.equal(classifyInvitation({ expiresAt: future, acceptedAt: new Date(), revokedAt: null }), "accepted");
});

test("a revoked invitation cannot be used", () => {
  assert.equal(classifyInvitation({ expiresAt: future, acceptedAt: null, revokedAt: new Date() }), "revoked");
});

test("a missing invitation is invalid", () => {
  assert.equal(classifyInvitation(null), "invalid");
});

test("only a Super Admin can assign Super Admin", () => {
  assert.equal(canAssignRole(["SUPER_ADMIN"], "SUPER_ADMIN"), true);
  assert.equal(canAssignRole(["SUPPORT"], "SUPER_ADMIN"), false);
  assert.equal(canAssignRole(["SUPPORT"], "SUPPORT"), true);
});
