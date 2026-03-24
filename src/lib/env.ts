import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const parsePort = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) ? port : null;
};

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  jobSecret: process.env.JOB_SECRET ?? "",
  adminAccessPassword: process.env.ADMIN_ACCESS_PASSWORD ?? "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parsePort(process.env.SMTP_PORT) ?? 587,
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "IPO Calendar <alerts@example.com>",
  ipoSourceUrl: process.env.IPO_SOURCE_URL ?? "",
  opendartApiKey: process.env.OPENDART_API_KEY ?? "",
  opendartBaseUrl: process.env.OPENDART_BASE_URL ?? "https://opendart.fss.or.kr",
};

export const isDatabaseEnabled = () => Boolean(env.databaseUrl);
export const isEmailConfigured = () =>
  Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.smtpFrom);
