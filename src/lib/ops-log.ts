import { prisma } from "@/lib/db";
import { isDatabaseEnabled } from "@/lib/env";
import type { OperationLogLevel, OperationLogRecord } from "@/lib/types";

type LogInput = {
  level: OperationLogLevel;
  source: string;
  action: string;
  message: string;
  context?: Record<string, unknown> | null;
};

const prismaWithLogs = prisma as typeof prisma & {
  operationLog: {
    create: (args: {
      data: {
        level: string;
        source: string;
        action: string;
        message: string;
        context?: Record<string, unknown> | null;
      };
    }) => Promise<unknown>;
    findMany: (args: {
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<
      Array<{
        id: string;
        level: string;
        source: string;
        action: string;
        message: string;
        context: unknown;
        createdAt: Date;
      }>
    >;
  };
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
};

export const toErrorContext = (
  error: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...extra,
  error: serializeError(error),
});

export const logOperation = async ({
  level,
  source,
  action,
  message,
  context = null,
}: LogInput): Promise<void> => {
  const line = `[${level}] ${source}:${action} ${message}`;

  if (level === "ERROR") {
    console.error(line, context ?? {});
  } else if (level === "WARN") {
    console.warn(line, context ?? {});
  } else {
    console.log(line, context ?? {});
  }

  if (!isDatabaseEnabled()) {
    return;
  }

  try {
    await prismaWithLogs.operationLog.create({
      data: {
        level,
        source,
        action,
        message,
        context,
      },
    });
  } catch (error) {
    console.error("[ERROR] system:operation-log failed_to_persist", serializeError(error));
  }
};

export const getRecentOperationLogs = async (limit = 20): Promise<OperationLogRecord[]> => {
  if (!isDatabaseEnabled()) {
    return [];
  }

  try {
    const logs = await prismaWithLogs.operationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      level: log.level as OperationLogLevel,
      source: log.source,
      action: log.action,
      message: log.message,
      context:
        log.context && typeof log.context === "object" && !Array.isArray(log.context)
          ? (log.context as Record<string, unknown>)
          : null,
      createdAt: log.createdAt,
    }));
  } catch (error) {
    console.error("[ERROR] system:operation-log failed_to_fetch", serializeError(error));
    return [];
  }
};
