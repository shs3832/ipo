import { NextRequest, NextResponse } from "next/server";

import { getJobAuthorization } from "@/lib/job-auth";
import { logOperation } from "@/lib/ops-log";
import { runKindAccessProbes } from "@/lib/sources/kind-access-probe";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = getJobAuthorization(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason === "misconfigured" ? "Job auth is not configured" : "Unauthorized" }, {
      status: auth.reason === "misconfigured" ? 503 : 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const diagnostics = await runKindAccessProbes();
  await logOperation({
    level: "INFO",
    source: "diagnostic:kind",
    action: "access_probe_completed",
    message: "KIND 고정 경로 GET/POST 비교 진단을 완료했습니다. 진단 완료는 수집 복구를 의미하지 않습니다.",
    context: diagnostics,
  });
  return NextResponse.json(diagnostics, { headers: { "Cache-Control": "no-store" } });
}
