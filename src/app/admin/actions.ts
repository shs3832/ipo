"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { runDailySync } from "@/lib/jobs";
import { ADMIN_HOME_PATH } from "@/lib/admin-navigation";
import { logOperation, toErrorContext } from "@/lib/ops-log";
import { PUBLIC_HOME_SNAPSHOT_TAG, PUBLIC_IPO_DETAIL_TAG } from "@/lib/page-data";
import { ensureAdminAuthenticated, revalidateAdminPaths } from "@/lib/server/admin-surface";

export async function triggerManualSyncAction() {
  await ensureAdminAuthenticated(ADMIN_HOME_PATH);

  let redirectTarget = `${ADMIN_HOME_PATH}?sync=error`;

  try {
    await logOperation({
      level: "INFO",
      source: "admin:daily-sync",
      action: "requested",
      message: "관리자가 최신 공모주 데이터를 수동으로 동기화했습니다.",
      context: { forceRefresh: true },
    });

    const result = await runDailySync({ forceRefresh: true });

    await logOperation({
      level: "INFO",
      source: "admin:daily-sync",
      action: "completed",
      message: `관리자 수동 동기화를 완료했습니다. synced=${result.synced}`,
      context: {
        forceRefresh: true,
        mode: result.mode,
        synced: result.synced,
      },
    });

    updateTag(PUBLIC_HOME_SNAPSHOT_TAG);
    updateTag(PUBLIC_IPO_DETAIL_TAG);
    revalidateAdminPaths(ADMIN_HOME_PATH);
    redirectTarget = `${ADMIN_HOME_PATH}?sync=success&synced=${result.synced}`;
  } catch (error) {
    await logOperation({
      level: "ERROR",
      source: "admin:daily-sync",
      action: "failed",
      message: "관리자 수동 동기화 요청 처리에 실패했습니다.",
      context: toErrorContext(error, { forceRefresh: true }),
    });
  }

  redirect(redirectTarget);
}
