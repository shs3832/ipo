import { NextRequest, NextResponse } from "next/server";

import { getJobAuthorization } from "@/lib/job-auth";
import { prepareClosingSoonAlerts } from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";

export async function GET(request: NextRequest) {
  const auth = getJobAuthorization(request);

  if (!auth.authorized) {
    if (auth.reason === "misconfigured") {
      await logOperation({
        level: "ERROR",
        source: "api:prepare-closing-alerts",
        action: "misconfigured",
        message: "JOB_SECRET 누락으로 prepare-closing-alerts 호출을 차단했습니다.",
        context: { path: request.nextUrl.pathname },
      });
      return NextResponse.json({ error: "Job secret is not configured" }, { status: 500 });
    }

    await logOperation({
      level: "WARN",
      source: "api:prepare-closing-alerts",
      action: "unauthorized",
      message: "인증되지 않은 prepare-closing-alerts 호출을 차단했습니다.",
      context: { path: request.nextUrl.pathname },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prepareClosingSoonAlerts();
    await logOperation({
      level: "INFO",
      source: "api:prepare-closing-alerts",
      action: "completed",
      message: `prepare-closing-alerts API 호출을 정상 처리했습니다. jobs=${result.jobs.length}`,
      context: { path: request.nextUrl.pathname, mode: result.mode, jobs: result.jobs.length },
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
