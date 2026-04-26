import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { upsertAdminWebPushSubscription } from "@/lib/server/web-push-service";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await upsertAdminWebPushSubscription({
      subscription: body.subscription,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "api:admin-web-push",
      action: "subscribe_failed",
      message: "관리자 Web Push 구독 저장에 실패했습니다.",
      context: toErrorContext(error, { path: request.nextUrl.pathname }),
    });
    const message = error instanceof Error ? error.message : "Web Push 구독 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
