"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionMaxAge,
  hasAdminPassword,
  isValidAdminPassword,
} from "@/lib/admin-auth";

const normalizeNext = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/admin";
  }

  return value;
};

export async function loginAction(formData: FormData) {
  const next = normalizeNext(formData.get("next"));
  const password = String(formData.get("password") ?? "");

  if (!hasAdminPassword()) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=not-configured`);
  }

  if (!isValidAdminPassword(password)) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=invalid`);
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
