import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { sendAdminTestWebPush } from "@/lib/server/web-push-service";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendAdminTestWebPush();
    const ok = result.failedCount === 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "api:admin-web-push",
      action: "test_failed",
      message: "관리자 Web Push 테스트 API 호출에 실패했습니다.",
      context: toErrorContext(error, { path: request.nextUrl.pathname }),
    });
    const message = error instanceof Error ? error.message : "Web Push 테스트에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
