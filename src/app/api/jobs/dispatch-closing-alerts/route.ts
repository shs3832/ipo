import { NextRequest, NextResponse } from "next/server";

import { getJobAuthorization } from "@/lib/job-auth";
import { dispatchClosingSoonAlerts } from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { CLOSING_SOON_ALERTS_ENABLED, canUseDatabase } from "@/lib/server/job-shared";

export async function GET(request: NextRequest) {
  if (!CLOSING_SOON_ALERTS_ENABLED) {
    const timestamp = new Date();
    await logOperation({
      level: "INFO",
      source: "api:dispatch-closing-alerts",
      action: "disabled",
      message: "dispatch-closing-alerts API 호출을 비활성화 상태로 건너뛰었습니다.",
      context: { path: request.nextUrl.pathname },
    });
    return NextResponse.json({
      disabled: true,
      mode: (await canUseDatabase()) ? "database" : "fallback",
      timestamp,
      attempted: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      staleSkippedCount: 0,
      deliveries: [],
    });
  }

  const auth = getJobAuthorization(request);

  if (!auth.authorized) {
    if (auth.reason === "misconfigured") {
      await logOperation({
        level: "ERROR",
        source: "api:dispatch-closing-alerts",
        action: "misconfigured",
        message: "CRON_SECRET과 JOB_SECRET이 모두 없어 dispatch-closing-alerts 호출을 차단했습니다.",
        context: { path: request.nextUrl.pathname, ...auth.context },
      });
      return NextResponse.json(
        { error: "Neither CRON_SECRET nor JOB_SECRET is configured" },
        { status: 500 },
      );
    }

    await logOperation({
      level: "WARN",
      source: "api:dispatch-closing-alerts",
      action: "unauthorized",
      message: "인증되지 않은 dispatch-closing-alerts 호출을 차단했습니다.",
      context: { path: request.nextUrl.pathname, ...auth.context },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchClosingSoonAlerts();
    const status = result.failedCount > 0 ? 500 : 200;
    await logOperation({
      level: result.failedCount > 0 ? "WARN" : "INFO",
      source: "api:dispatch-closing-alerts",
      action: result.failedCount > 0 ? "completed_with_failures" : "completed",
      message:
        result.failedCount > 0
          ? `dispatch-closing-alerts API 호출은 완료됐지만 발송 실패가 있습니다. attempted=${result.attempted}, failed=${result.failedCount}`
          : `dispatch-closing-alerts API 호출을 정상 처리했습니다. attempted=${result.attempted}`,
      context: {
        path: request.nextUrl.pathname,
        mode: result.mode,
        attempted: result.attempted,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        staleSkippedCount: result.staleSkippedCount,
        authMethod: auth.method,
        ...auth.context,
      },
    });
    return NextResponse.json(result, { status });
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "api:dispatch-closing-alerts",
      action: "failed",
      message: "dispatch-closing-alerts API 호출 처리에 실패했습니다.",
      context: toErrorContext(error, { path: request.nextUrl.pathname }),
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
