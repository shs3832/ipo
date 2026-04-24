import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { isDatabaseEnabled } from "@/lib/env";

export const ADMIN_LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_THROTTLE_SOURCE = "admin-login-throttle";
const ADMIN_LOGIN_THROTTLE_TTL_MS = Math.max(ADMIN_LOGIN_ATTEMPT_WINDOW_MS, ADMIN_LOGIN_LOCKOUT_MS);

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

export type AdminLoginThrottleStorageResult<T> = T & {
  storageMode: "database" | "memory";
  degraded: boolean;
};

export type AdminLoginThrottleStorage = {
  read: (cacheKey: string, now: Date) => Promise<AdminLoginThrottleState | null>;
  write: (cacheKey: string, state: AdminLoginThrottleState, expiresAt: Date) => Promise<void>;
  delete: (cacheKey: string) => Promise<void>;
};

declare global {
  var adminLoginThrottleStore: Map<string, AdminLoginThrottleState> | undefined;
}

const createEmptyAdminLoginThrottleState = (): AdminLoginThrottleState => ({
  failures: [],
  lockedUntil: null,
});

export const isAdminLoginThrottleState = (value: unknown): value is AdminLoginThrottleState =>
  typeof value === "object"
  && value !== null
  && Array.isArray((value as { failures?: unknown }).failures)
  && (value as { failures: unknown[] }).failures.every((timestamp) =>
    typeof timestamp === "number" && Number.isFinite(timestamp))
  && (
    (value as { lockedUntil?: unknown }).lockedUntil === null
    || (
      typeof (value as { lockedUntil?: unknown }).lockedUntil === "number"
      && Number.isFinite((value as { lockedUntil: number }).lockedUntil)
    )
  );

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

export const getAdminLoginThrottleCacheKey = (clientKey: string) =>
  `${ADMIN_LOGIN_THROTTLE_SOURCE}:${getAdminLoginAuditKey(clientKey)}`;

const prismaWithExternalCache = prisma as typeof prisma & {
  externalDataCache: {
    findUnique: (args: {
      where: { cacheKey: string };
    }) => Promise<{
      payload: unknown;
      expiresAt: Date;
    } | null>;
    upsert: (args: {
      where: { cacheKey: string };
      update: {
        source: string;
        payload: AdminLoginThrottleState;
        expiresAt: Date;
      };
      create: {
        cacheKey: string;
        source: string;
        payload: AdminLoginThrottleState;
        expiresAt: Date;
      };
    }) => Promise<unknown>;
    deleteMany: (args: { where: { cacheKey: string } }) => Promise<unknown>;
  };
};

export const databaseAdminLoginThrottleStorage: AdminLoginThrottleStorage = {
  read: async (cacheKey, now) => {
    if (!isDatabaseEnabled()) {
      return null;
    }

    const row = await prismaWithExternalCache.externalDataCache.findUnique({
      where: { cacheKey },
    });

    if (!row || row.expiresAt <= now || !isAdminLoginThrottleState(row.payload)) {
      return null;
    }

    return row.payload;
  },
  write: async (cacheKey, state, expiresAt) => {
    if (!isDatabaseEnabled()) {
      return;
    }

    await prismaWithExternalCache.externalDataCache.upsert({
      where: { cacheKey },
      update: {
        source: ADMIN_LOGIN_THROTTLE_SOURCE,
        payload: state,
        expiresAt,
      },
      create: {
        cacheKey,
        source: ADMIN_LOGIN_THROTTLE_SOURCE,
        payload: state,
        expiresAt,
      },
    });
  },
  delete: async (cacheKey) => {
    if (!isDatabaseEnabled()) {
      return;
    }

    await prismaWithExternalCache.externalDataCache.deleteMany({
      where: { cacheKey },
    });
  },
};

export const getAdminLoginThrottleStatusForClient = (clientKey: string, now = Date.now()) => {
  const store = getAdminLoginThrottleStore();
  const snapshot = getAdminLoginThrottleSnapshot(
    store.get(clientKey) ?? createEmptyAdminLoginThrottleState(),
    now,
  );

  persistAdminLoginThrottleState(clientKey, snapshot.state);
  return snapshot;
};

const getAdminLoginThrottleExpiresAt = (now: number) => new Date(now + ADMIN_LOGIN_THROTTLE_TTL_MS);

const getMemoryFallbackKey = (clientKey: string) => getAdminLoginThrottleCacheKey(clientKey);

export const getPersistentAdminLoginThrottleStatusForClient = async (
  clientKey: string,
  now = Date.now(),
  storage: AdminLoginThrottleStorage = databaseAdminLoginThrottleStorage,
): Promise<AdminLoginThrottleStorageResult<AdminLoginThrottleSnapshot>> => {
  const cacheKey = getAdminLoginThrottleCacheKey(clientKey);

  try {
    const snapshot = getAdminLoginThrottleSnapshot(
      (await storage.read(cacheKey, new Date(now))) ?? createEmptyAdminLoginThrottleState(),
      now,
    );
    await storage.write(cacheKey, snapshot.state, getAdminLoginThrottleExpiresAt(now));
    return {
      ...snapshot,
      storageMode: "database",
      degraded: false,
    };
  } catch {
    return {
      ...getAdminLoginThrottleStatusForClient(getMemoryFallbackKey(clientKey), now),
      storageMode: "memory",
      degraded: true,
    };
  }
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

export const registerPersistentAdminLoginFailureForClient = async (
  clientKey: string,
  now = Date.now(),
  storage: AdminLoginThrottleStorage = databaseAdminLoginThrottleStorage,
): Promise<AdminLoginThrottleStorageResult<AdminLoginThrottleSnapshot & { lockoutApplied: boolean }>> => {
  const cacheKey = getAdminLoginThrottleCacheKey(clientKey);

  try {
    const result = registerAdminLoginFailureState(
      (await storage.read(cacheKey, new Date(now))) ?? createEmptyAdminLoginThrottleState(),
      now,
    );
    await storage.write(cacheKey, result.state, getAdminLoginThrottleExpiresAt(now));
    return {
      ...result,
      storageMode: "database",
      degraded: false,
    };
  } catch {
    return {
      ...registerAdminLoginFailureForClient(getMemoryFallbackKey(clientKey), now),
      storageMode: "memory",
      degraded: true,
    };
  }
};

export const clearAdminLoginThrottleForClient = (clientKey: string) => {
  getAdminLoginThrottleStore().delete(clientKey);
};

export const clearPersistentAdminLoginThrottleForClient = async (
  clientKey: string,
  storage: AdminLoginThrottleStorage = databaseAdminLoginThrottleStorage,
) => {
  const cacheKey = getAdminLoginThrottleCacheKey(clientKey);

  try {
    await storage.delete(cacheKey);
  } catch {
    // The memory fallback is intentionally best-effort; a failed DB cleanup should not block login.
  }

  clearAdminLoginThrottleForClient(getMemoryFallbackKey(clientKey));
};

export const toAdminLoginRetryAfterSeconds = (remainingLockoutMs: number) =>
  Math.max(1, Math.ceil(remainingLockoutMs / 1000));
