import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ADMIN_HOME_PATH, buildAdminLoginPath } from "@/lib/admin-navigation";

export const ensureAdminAuthenticated = async (nextPath = ADMIN_HOME_PATH) => {
  if (!(await isAdminAuthenticated())) {
    redirect(buildAdminLoginPath(nextPath));
  }
};

export const revalidateAdminPaths = (...paths: string[]) => {
  new Set([ADMIN_HOME_PATH, ...paths]).forEach((path) => {
    revalidatePath(path);
  });
};
