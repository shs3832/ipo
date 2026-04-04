"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  isAdminAuthConfigured,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { ADMIN_HOME_PATH, buildAdminLoginPath, normalizeAdminNextPath } from "@/lib/admin-navigation";

export async function loginAction(formData: FormData) {
  const nextValue = formData.get("next");
  const next = normalizeAdminNextPath(typeof nextValue === "string" ? nextValue : null, ADMIN_HOME_PATH);
  const password = String(formData.get("password") ?? "");

  if (!isAdminAuthConfigured()) {
    redirect(buildAdminLoginPath(next, "not-configured"));
  }

  if (!isValidAdminPassword(password)) {
    redirect(buildAdminLoginPath(next, "invalid"));
  }

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

  redirect(next);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(getAdminSessionCookieName());
  redirect("/login");
}
