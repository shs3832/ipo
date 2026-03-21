import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedJobRequest } from "@/lib/job-auth";
import { prepareDailyAlerts } from "@/lib/jobs";

export async function GET(request: NextRequest) {
  if (!isAuthorizedJobRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await prepareDailyAlerts();
  return NextResponse.json(result);
}
