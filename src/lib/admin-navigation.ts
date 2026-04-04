export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_RECIPIENTS_PATH = "/admin/recipients";

export type AdminLoginError = "invalid" | "not-configured";

export const normalizeAdminNextPath = (
  value: string | null | undefined,
  fallback = ADMIN_HOME_PATH,
) => {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }

  return value;
};

export const buildAdminLoginPath = (nextPath: string, error?: AdminLoginError) => {
  const searchParams = new URLSearchParams({
    next: normalizeAdminNextPath(nextPath),
  });

  if (error) {
    searchParams.set("error", error);
  }

  return `/login?${searchParams.toString()}`;
};
