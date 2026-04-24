import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LOGIN_ATTEMPT_WINDOW_MS,
  ADMIN_LOGIN_LOCKOUT_MS,
  ADMIN_LOGIN_MAX_FAILURES,
  type AdminLoginThrottleStorage,
  type AdminLoginThrottleState,
  getAdminLoginClientKey,
  getAdminLoginThrottleCacheKey,
  getAdminLoginThrottleSnapshot,
  getPersistentAdminLoginThrottleStatusForClient,
  isAdminLoginThrottleState,
  registerPersistentAdminLoginFailureForClient,
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

test("isAdminLoginThrottleState validates persisted throttle payloads", () => {
  assert.equal(isAdminLoginThrottleState({ failures: [1, 2], lockedUntil: null }), true);
  assert.equal(isAdminLoginThrottleState({ failures: [1], lockedUntil: 10 }), true);
  assert.equal(isAdminLoginThrottleState({ failures: ["1"], lockedUntil: null }), false);
  assert.equal(isAdminLoginThrottleState({ failures: [], lockedUntil: "10" }), false);
});

test("persistent admin login throttle shares state through storage", async () => {
  const rows = new Map<string, AdminLoginThrottleState>();
  const storage: AdminLoginThrottleStorage = {
    read: async (cacheKey) => rows.get(cacheKey) ?? null,
    write: async (cacheKey, state) => {
      rows.set(cacheKey, state);
    },
    delete: async (cacheKey) => {
      rows.delete(cacheKey);
    },
  };
  const clientKey = "203.0.113.20";
  const now = Date.UTC(2026, 3, 4, 1, 0, 0);

  await registerPersistentAdminLoginFailureForClient(clientKey, now, storage);
  const snapshot = await getPersistentAdminLoginThrottleStatusForClient(clientKey, now + 1, storage);

  assert.equal(snapshot.storageMode, "database");
  assert.equal(snapshot.degraded, false);
  assert.equal(snapshot.failureCount, 1);
  assert.ok(rows.has(getAdminLoginThrottleCacheKey(clientKey)));
});

test("persistent admin login throttle falls back to memory when storage fails", async () => {
  const storage: AdminLoginThrottleStorage = {
    read: async () => {
      throw new Error("storage unavailable");
    },
    write: async () => {
      throw new Error("storage unavailable");
    },
    delete: async () => {
      throw new Error("storage unavailable");
    },
  };
  const clientKey = "203.0.113.21";
  const now = Date.UTC(2026, 3, 4, 1, 0, 0);

  const failed = await registerPersistentAdminLoginFailureForClient(clientKey, now, storage);
  const snapshot = await getPersistentAdminLoginThrottleStatusForClient(clientKey, now + 1, storage);

  assert.equal(failed.storageMode, "memory");
  assert.equal(failed.degraded, true);
  assert.equal(snapshot.storageMode, "memory");
  assert.equal(snapshot.failureCount, 1);
});
