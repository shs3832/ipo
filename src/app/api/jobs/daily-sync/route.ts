import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedJobRequest } from "@/lib/job-auth";
import { runDailySync } from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";

export async function GET(request: NextRequest) {
  if (!isAuthorizedJobRequest(request)) {
    await logOperation({
      level: "WARN",
      source: "api:daily-sync",
      action: "unauthorized",
      message: "인증되지 않은 daily-sync 호출을 차단했습니다.",
      context: { path: request.nextUrl.pathname },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailySync();
    await logOperation({
      level: "INFO",
      source: "api:daily-sync",
      action: "completed",
      message: `daily-sync API 호출을 정상 처리했습니다. synced=${result.synced}`,
      context: { path: request.nextUrl.pathname, mode: result.mode, synced: result.synced },
    });
    return NextResponse.json(result);
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "api:daily-sync",
      action: "failed",
      message: "daily-sync API 호출 처리에 실패했습니다.",
      context: toErrorContext(error, { path: request.nextUrl.pathname }),
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
