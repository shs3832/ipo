import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

const ADMIN_SESSION_COOKIE = "ipo_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

const getAdminPassword = () => env.adminAccessPassword || env.jobSecret;

const getSessionSecret = () => env.adminSessionSecret || env.jobSecret || "ipo-dev-session-secret";

const sign = (payload: string) => createHmac("sha256", getSessionSecret()).update(payload).digest("hex");

const encodeSession = (expiresAt: number) => {
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
};

const isValidSignature = (payload: string, signature: string) => {
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

export const hasAdminPassword = () => Boolean(getAdminPassword());

export const verifyAdminSession = (token: string | undefined | null) => {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  if (!isValidSignature(payload, signature)) {
    return false;
  }

  const expiresAt = Number.parseInt(payload, 10);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt > Date.now();
};

export const isAdminAuthenticated = async () => {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
};

export const isValidAdminPassword = (password: string) => {
  const expected = getAdminPassword();
  if (!expected) {
    return false;
  }

  const left = Buffer.from(password);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

export const createAdminSessionCookieValue = () => encodeSession(Date.now() + SESSION_MAX_AGE * 1000);

export const getAdminSessionCookieName = () => ADMIN_SESSION_COOKIE;

export const getAdminSessionMaxAge = () => SESSION_MAX_AGE;
