import { createHash } from "node:crypto";

export const ADMIN_LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_MAX_FAILURES = 5;

export type AdminLoginThrottleState = {
  failures: number[];
  lockedUntil: number | null;
};

export type AdminLoginThrottleSnapshot = {
  state: AdminLoginThrottleState;
  isLocked: boolean;
  failureCount: number;
  remainingLockoutMs: number;
};

declare global {
  var adminLoginThrottleStore: Map<string, AdminLoginThrottleState> | undefined;
}

const createEmptyAdminLoginThrottleState = (): AdminLoginThrottleState => ({
  failures: [],
  lockedUntil: null,
});

const getAdminLoginThrottleStore = () => {
  global.adminLoginThrottleStore ??= new Map<string, AdminLoginThrottleState>();
  return global.adminLoginThrottleStore;
};

const persistAdminLoginThrottleState = (clientKey: string, state: AdminLoginThrottleState) => {
  const store = getAdminLoginThrottleStore();

  if (state.failures.length === 0 && state.lockedUntil == null) {
    store.delete(clientKey);
    return;
  }

  store.set(clientKey, state);
};

export const normalizeAdminLoginThrottleState = (
  state: AdminLoginThrottleState,
  now = Date.now(),
): AdminLoginThrottleState => ({
  failures: state.failures.filter((timestamp) => now - timestamp <= ADMIN_LOGIN_ATTEMPT_WINDOW_MS),
  lockedUntil: state.lockedUntil && state.lockedUntil > now ? state.lockedUntil : null,
});

export const getAdminLoginThrottleSnapshot = (
  state: AdminLoginThrottleState,
  now = Date.now(),
): AdminLoginThrottleSnapshot => {
  const normalized = normalizeAdminLoginThrottleState(state, now);
  const remainingLockoutMs = normalized.lockedUntil ? normalized.lockedUntil - now : 0;

  return {
    state: normalized,
    isLocked: remainingLockoutMs > 0,
    failureCount: normalized.failures.length,
    remainingLockoutMs: Math.max(0, remainingLockoutMs),
  };
};

export const registerAdminLoginFailureState = (
  state: AdminLoginThrottleState,
  now = Date.now(),
): AdminLoginThrottleSnapshot & { lockoutApplied: boolean } => {
  const snapshot = getAdminLoginThrottleSnapshot(state, now);

  if (snapshot.isLocked) {
    return {
      ...snapshot,
      lockoutApplied: false,
    };
  }

  const failures = [...snapshot.state.failures, now];
  const shouldLock = failures.length >= ADMIN_LOGIN_MAX_FAILURES;
  const nextState = {
    failures,
    lockedUntil: shouldLock ? now + ADMIN_LOGIN_LOCKOUT_MS : null,
  };

  return {
    ...getAdminLoginThrottleSnapshot(nextState, now),
    lockoutApplied: shouldLock,
  };
};

export const getAdminLoginClientKey = (headersList: Headers) => {
  const forwardedFor = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headersList.get("x-real-ip")?.trim();
  const cloudflareIp = headersList.get("cf-connecting-ip")?.trim();

  return cloudflareIp || forwardedFor || realIp || "unknown-client";
};

export const getAdminLoginAuditKey = (clientKey: string) =>
  createHash("sha256").update(clientKey).digest("hex").slice(0, 12);

export const getAdminLoginThrottleStatusForClient = (clientKey: string, now = Date.now()) => {
  const store = getAdminLoginThrottleStore();
  const snapshot = getAdminLoginThrottleSnapshot(
    store.get(clientKey) ?? createEmptyAdminLoginThrottleState(),
    now,
  );

  persistAdminLoginThrottleState(clientKey, snapshot.state);
  return snapshot;
};

export const registerAdminLoginFailureForClient = (clientKey: string, now = Date.now()) => {
  const store = getAdminLoginThrottleStore();
  const result = registerAdminLoginFailureState(
    store.get(clientKey) ?? createEmptyAdminLoginThrottleState(),
    now,
  );

  persistAdminLoginThrottleState(clientKey, result.state);
  return result;
};

export const clearAdminLoginThrottleForClient = (clientKey: string) => {
  getAdminLoginThrottleStore().delete(clientKey);
};

export const toAdminLoginRetryAfterSeconds = (remainingLockoutMs: number) =>
  Math.max(1, Math.ceil(remainingLockoutMs / 1000));
