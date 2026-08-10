import assert from "node:assert/strict";
import test from "node:test";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

test("admin exige role admin e flag is_admin simultaneamente", () => {
  assert.equal(isAdminProfile({ role: "admin", is_admin: true }), true);
  assert.equal(isAdminProfile({ role: "admin", is_admin: false }), false);
  assert.equal(isAdminProfile({ role: "user", is_admin: true }), false);
  assert.equal(isAdminProfile({ role: " ADMIN ", is_admin: true }), true);
  assert.equal(isAdminProfile(null), false);
});
