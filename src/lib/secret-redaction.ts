const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|authorization|cookie|crtfc[_-]?key|database[_-]?url|password|secret|smtp[_-]?pass|token)/i;
const REDACTED = "[REDACTED]";

const collectConfiguredSecrets = () =>
  [
    process.env.ADMIN_ACCESS_PASSWORD,
    process.env.ADMIN_SESSION_SECRET,
    process.env.CRON_SECRET,
    process.env.DATABASE_URL,
    process.env.JOB_SECRET,
    process.env.OPENDART_API_KEY,
    process.env.SEIBRO_API_KEY,
    process.env.SEIBRO_SERVICE_KEY,
    process.env.SMTP_PASS,
  ].filter((value): value is string => Boolean(value && value.length >= 4));

const redactUrlSearchParams = (value: string) => {
  try {
    const url = new URL(value);
    let changed = false;

    url.searchParams.forEach((_, key) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, REDACTED);
        changed = true;
      }
    });

    return changed ? url.toString() : value;
  } catch {
    return value;
  }
};

const redactString = (value: string) => {
  let redacted = redactUrlSearchParams(value);

  for (const secret of collectConfiguredSecrets()) {
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted;
};

export const redactSecrets = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSecrets(nestedValue),
    ]),
  );
};

export const redactSecretString = (value: string) => redactString(value);
