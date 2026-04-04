"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  isAdminAuthConfigured,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import {
  clearAdminLoginThrottleForClient,
  getAdminLoginAuditKey,
  getAdminLoginClientKey,
  getAdminLoginThrottleStatusForClient,
  registerAdminLoginFailureForClient,
  toAdminLoginRetryAfterSeconds,
} from "@/lib/admin-login-throttle";
import { ADMIN_HOME_PATH, buildAdminLoginPath, normalizeAdminNextPath } from "@/lib/admin-navigation";
import { logOperation } from "@/lib/ops-log";

export async function loginAction(formData: FormData) {
  const nextValue = formData.get("next");
  const next = normalizeAdminNextPath(typeof nextValue === "string" ? nextValue : null, ADMIN_HOME_PATH);
  const password = String(formData.get("password") ?? "");
  const headersList = await headers();
  const clientKey = getAdminLoginClientKey(headersList);
  const clientAuditKey = getAdminLoginAuditKey(clientKey);
  const throttleStatus = getAdminLoginThrottleStatusForClient(clientKey);

  if (!isAdminAuthConfigured()) {
    redirect(buildAdminLoginPath(next, "not-configured"));
  }

  if (throttleStatus.isLocked) {
    redirect(
      buildAdminLoginPath(
        next,
        "rate-limited",
        toAdminLoginRetryAfterSeconds(throttleStatus.remainingLockoutMs),
      ),
    );
  }

  if (!isValidAdminPassword(password)) {
    const failedAttempt = registerAdminLoginFailureForClient(clientKey);
    const retryAfterSeconds = failedAttempt.lockoutApplied
      ? toAdminLoginRetryAfterSeconds(failedAttempt.remainingLockoutMs)
      : undefined;

    await logOperation({
      level: "WARN",
      source: "admin:login",
      action: failedAttempt.lockoutApplied ? "rate_limited" : "invalid_password",
      message: failedAttempt.lockoutApplied
        ? "관리자 로그인 시도가 과도해 일시적으로 차단했습니다."
        : "잘못된 관리자 비밀번호가 제출됐습니다.",
      context: {
        clientAuditKey,
        nextPath: next,
        failureCount: failedAttempt.failureCount,
        retryAfterSeconds: retryAfterSeconds ?? null,
      },
    });

    redirect(
      buildAdminLoginPath(
        next,
        failedAttempt.lockoutApplied ? "rate-limited" : "invalid",
        retryAfterSeconds,
      ),
    );
  }

  clearAdminLoginThrottleForClient(clientKey);

  const cookieStore = await cookies();
  cookieStore.set({
    name: getAdminSessionCookieName(),
    value: createAdminSessionCookieValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAdminSessionMaxAge(),
  });

  await logOperation({
    level: "INFO",
    source: "admin:login",
    action: "authenticated",
    message: "관리자 로그인을 완료했습니다.",
    context: {
      clientAuditKey,
      nextPath: next,
    },
  });

  redirect(next);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(getAdminSessionCookieName());
  redirect("/login");
}
