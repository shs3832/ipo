import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_HOME_PATH,
  buildAdminLoginPath,
  normalizeAdminNextPath,
} from "@/lib/admin-navigation";

test("normalizeAdminNextPath keeps internal admin paths and falls back for invalid input", () => {
  assert.equal(normalizeAdminNextPath("/admin/recipients"), "/admin/recipients");
  assert.equal(normalizeAdminNextPath(undefined), ADMIN_HOME_PATH);
  assert.equal(normalizeAdminNextPath(null), ADMIN_HOME_PATH);
  assert.equal(normalizeAdminNextPath("https://example.com/admin"), ADMIN_HOME_PATH);
  assert.equal(normalizeAdminNextPath("admin"), ADMIN_HOME_PATH);
});

test("buildAdminLoginPath always encodes a normalized next path and optional error", () => {
  assert.equal(buildAdminLoginPath("/admin/recipients"), "/login?next=%2Fadmin%2Frecipients");
  assert.equal(
    buildAdminLoginPath("https://example.com/admin", "invalid"),
    "/login?next=%2Fadmin&error=invalid",
  );
});
