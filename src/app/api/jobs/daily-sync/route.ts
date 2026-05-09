import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { getJobAuthorization } from "@/lib/job-auth";
import { runDailySync } from "@/lib/jobs";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { PUBLIC_HOME_SNAPSHOT_TAG, PUBLIC_IPO_DETAIL_TAG } from "@/lib/public-cache-tags";

export async function GET(request: NextRequest) {
  const auth = getJobAuthorization(request);

  if (!auth.authorized) {
    if (auth.reason === "misconfigured") {
      await logOperation({
        level: "ERROR",
        source: "api:daily-sync",
        action: "misconfigured",
        message: "CRON_SECRET과 JOB_SECRET이 모두 없어 daily-sync 호출을 차단했습니다.",
        context: { path: request.nextUrl.pathname, ...auth.context },
      });
      return NextResponse.json(
        { error: "Neither CRON_SECRET nor JOB_SECRET is configured" },
        { status: 500 },
      );
    }

    await logOperation({
      level: "WARN",
      source: "api:daily-sync",
      action: "unauthorized",
      message: "인증되지 않은 daily-sync 호출을 차단했습니다.",
      context: { path: request.nextUrl.pathname, ...auth.context },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "force"
      || request.nextUrl.searchParams.get("bypassCache") === "1";
    const result = await runDailySync({ forceRefresh });
    revalidateTag(PUBLIC_HOME_SNAPSHOT_TAG, { expire: 0 });
    revalidateTag(PUBLIC_IPO_DETAIL_TAG, { expire: 0 });
    await logOperation({
      level: "INFO",
      source: "api:daily-sync",
      action: "completed",
      message: `daily-sync API 호출을 정상 처리했습니다. synced=${result.synced}`,
      context: {
        path: request.nextUrl.pathname,
        mode: result.mode,
        synced: result.synced,
        forceRefresh,
        authMethod: auth.method,
        ...auth.context,
      },
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
