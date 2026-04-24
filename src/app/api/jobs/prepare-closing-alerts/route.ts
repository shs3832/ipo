import { NextRequest, NextResponse } from "next/server";

import { getJobAuthorization } from "@/lib/job-auth";
import { prepareClosingSoonAlerts } from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { CLOSING_SOON_ALERTS_ENABLED, canUseDatabase } from "@/lib/server/job-shared";

export async function GET(request: NextRequest) {
  const auth = getJobAuthorization(request);

  if (!auth.authorized) {
    if (auth.reason === "misconfigured") {
      await logOperation({
        level: "ERROR",
        source: "api:prepare-closing-alerts",
        action: "misconfigured",
        message: "CRON_SECRET과 JOB_SECRET이 모두 없어 prepare-closing-alerts 호출을 차단했습니다.",
        context: { path: request.nextUrl.pathname, ...auth.context },
      });
      return NextResponse.json(
        { error: "Neither CRON_SECRET nor JOB_SECRET is configured" },
        { status: 500 },
      );
    }

    await logOperation({
      level: "WARN",
      source: "api:prepare-closing-alerts",
      action: "unauthorized",
      message: "인증되지 않은 prepare-closing-alerts 호출을 차단했습니다.",
      context: { path: request.nextUrl.pathname, ...auth.context },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CLOSING_SOON_ALERTS_ENABLED) {
    const timestamp = new Date();
    await logOperation({
      level: "INFO",
      source: "api:prepare-closing-alerts",
      action: "disabled",
      message: "prepare-closing-alerts API 호출을 비활성화 상태로 건너뛰었습니다.",
      context: { path: request.nextUrl.pathname },
    });
    return NextResponse.json({
      disabled: true,
      mode: (await canUseDatabase()) ? "database" : "fallback",
      timestamp,
      jobs: [],
    });
  }

  try {
    const result = await prepareClosingSoonAlerts();
    await logOperation({
      level: "INFO",
      source: "api:prepare-closing-alerts",
      action: "completed",
      message: `prepare-closing-alerts API 호출을 정상 처리했습니다. jobs=${result.jobs.length}`,
      context: {
        path: request.nextUrl.pathname,
        mode: result.mode,
        jobs: result.jobs.length,
        authMethod: auth.method,
        ...auth.context,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "api:prepare-closing-alerts",
      action: "failed",
      message: "prepare-closing-alerts API 호출 처리에 실패했습니다.",
      context: toErrorContext(error, { path: request.nextUrl.pathname }),
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
