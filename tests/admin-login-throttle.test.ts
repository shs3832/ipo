import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_ATTEMPT_WINDOW_MS,
  ADMIN_LOGIN_LOCKOUT_MS,
  ADMIN_LOGIN_MAX_FAILURES,
  type AdminLoginThrottleState,
  getAdminLoginClientKey,
  getAdminLoginThrottleSnapshot,
  registerAdminLoginFailureState,
} from "@/lib/admin-login-throttle";

test("registerAdminLoginFailureState locks after repeated failures within the throttle window", () => {
  let state: AdminLoginThrottleState = {
    failures: [],
    lockedUntil: null,
  };
  const now = Date.UTC(2026, 3, 4, 1, 0, 0);

  for (let attempt = 1; attempt < ADMIN_LOGIN_MAX_FAILURES; attempt += 1) {
    const result = registerAdminLoginFailureState(state, now + attempt);
    state = result.state;
    assert.equal(result.isLocked, false);
    assert.equal(result.lockoutApplied, false);
    assert.equal(result.failureCount, attempt);
  }

  const locked = registerAdminLoginFailureState(state, now + ADMIN_LOGIN_MAX_FAILURES);

  assert.equal(locked.lockoutApplied, true);
  assert.equal(locked.isLocked, true);
  assert.equal(locked.failureCount, ADMIN_LOGIN_MAX_FAILURES);
  assert.equal(locked.remainingLockoutMs, ADMIN_LOGIN_LOCKOUT_MS);
});

test("getAdminLoginThrottleSnapshot prunes stale failures after the rolling window", () => {
  const now = Date.UTC(2026, 3, 4, 1, 0, 0);
  const snapshot = getAdminLoginThrottleSnapshot(
    {
      failures: [now - ADMIN_LOGIN_ATTEMPT_WINDOW_MS - 1, now - 1000],
      lockedUntil: null,
    },
    now,
  );

  assert.deepEqual(snapshot.state.failures, [now - 1000]);
  assert.equal(snapshot.failureCount, 1);
  assert.equal(snapshot.isLocked, false);
});

test("getAdminLoginClientKey prefers the first forwarded client address", () => {
  const clientKey = getAdminLoginClientKey(
    new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.2",
      "x-real-ip": "198.51.100.99",
    }),
  );

  assert.equal(clientKey, "203.0.113.10");
});
