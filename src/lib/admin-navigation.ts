export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_RECIPIENTS_PATH = "/admin/recipients";

export type AdminLoginError = "invalid" | "not-configured" | "rate-limited";

const ADMIN_PATH_PREFIX = `${ADMIN_HOME_PATH}/`;
const LOCAL_ORIGIN = "http://localhost";

const isAllowedAdminPath = (pathname: string) =>
  pathname === ADMIN_HOME_PATH || pathname.startsWith(ADMIN_PATH_PREFIX);

export const normalizeAdminNextPath = (
  value: string | null | undefined,
  fallback = ADMIN_HOME_PATH,
) => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const nextUrl = new URL(value, LOCAL_ORIGIN);
    const normalizedPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;

    return nextUrl.origin === LOCAL_ORIGIN && isAllowedAdminPath(nextUrl.pathname)
      ? normalizedPath
      : fallback;
  } catch {
    return fallback;
  }
};

export const buildAdminLoginPath = (
  nextPath: string,
  error?: AdminLoginError,
  retryAfterSeconds?: number,
) => {
  const searchParams = new URLSearchParams({
    next: normalizeAdminNextPath(nextPath),
  });

  if (error) {
    searchParams.set("error", error);
  }

  if (retryAfterSeconds && retryAfterSeconds > 0) {
    searchParams.set("retryAfter", String(retryAfterSeconds));
  }

  return `/login?${searchParams.toString()}`;
};
