import { prisma } from "@/lib/db";
import { isDatabaseEnabled } from "@/lib/env";

type CacheConfig = {
  key: string;
  source: string;
  ttlMs: number;
  bypass?: boolean;
};

type MemoryEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, MemoryEntry<unknown>>();
const inFlightLoads = new Map<string, Promise<unknown>>();
let persistentCacheAvailable: boolean | null = null;

const prismaWithExternalDataCache = prisma as typeof prisma & {
  externalDataCache: {
    findUnique: (args: {
      where: { cacheKey: string };
    }) => Promise<{
      cacheKey: string;
      payload: unknown;
      expiresAt: Date;
    } | null>;
    upsert: (args: {
      where: { cacheKey: string };
      update: {
        source: string;
        payload: unknown;
        expiresAt: Date;
      };
      create: {
        cacheKey: string;
        source: string;
        payload: unknown;
        expiresAt: Date;
      };
    }) => Promise<unknown>;
  };
};

const readMemoryCache = <T>(key: string, now = Date.now()): T | null => {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value as T;
};

const isMissingCacheTableError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("ExternalDataCache") || error.message.includes("external_data_cache");
};

const writeMemoryCache = <T>(key: string, value: T, expiresAt: Date) => {
  memoryCache.set(key, {
    value,
    expiresAt: expiresAt.getTime(),
  });
};

const readDatabaseCache = async <T>(key: string, now: Date): Promise<T | null> => {
  if (!isDatabaseEnabled() || persistentCacheAvailable === false) {
    return null;
  }

  try {
    const entry = await prismaWithExternalDataCache.externalDataCache.findUnique({
      where: { cacheKey: key },
    });
    persistentCacheAvailable = true;

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= now) {
      return null;
    }

    writeMemoryCache(key, entry.payload as T, entry.expiresAt);
    return entry.payload as T;
  } catch (error) {
    if (isMissingCacheTableError(error)) {
      persistentCacheAvailable = false;
      return null;
    }

    console.error("[WARN] external-cache:read_failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const writeDatabaseCache = async <T>(config: CacheConfig, value: T, expiresAt: Date) => {
  if (!isDatabaseEnabled() || persistentCacheAvailable === false) {
    return;
  }

  try {
    await prismaWithExternalDataCache.externalDataCache.upsert({
      where: { cacheKey: config.key },
      update: {
        source: config.source,
        payload: value,
        expiresAt,
      },
      create: {
        cacheKey: config.key,
        source: config.source,
        payload: value,
        expiresAt,
      },
    });
    persistentCacheAvailable = true;
  } catch (error) {
    if (isMissingCacheTableError(error)) {
      persistentCacheAvailable = false;
      return;
    }

    console.error("[WARN] external-cache:write_failed", {
      key: config.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getCachedExternalData = async <T>(
  config: CacheConfig,
  loader: () => Promise<T>,
): Promise<T> => {
  if (config.bypass) {
    const value = await loader();
    const expiresAt = new Date(Date.now() + config.ttlMs);

    writeMemoryCache(config.key, value, expiresAt);
    await writeDatabaseCache(config, value, expiresAt);

    return value;
  }

  const memoryValue = readMemoryCache<T>(config.key);
  if (memoryValue != null) {
    return memoryValue;
  }

  const now = new Date();
  const databaseValue = await readDatabaseCache<T>(config.key, now);
  if (databaseValue != null) {
    return databaseValue;
  }

  const existingLoad = inFlightLoads.get(config.key);
  if (existingLoad) {
    return existingLoad as Promise<T>;
  }

  const loadPromise = (async () => {
    const value = await loader();
    const expiresAt = new Date(Date.now() + config.ttlMs);

    writeMemoryCache(config.key, value, expiresAt);
    await writeDatabaseCache(config, value, expiresAt);

    return value;
  })();

  inFlightLoads.set(config.key, loadPromise);

  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(config.key);
  }
};
