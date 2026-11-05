import { logOperation } from "@/lib/ops-log";
import { redactSecretString } from "@/lib/secret-redaction";

type KindEndpoint = "listingcompany.do" | "pubofrschdl.do";

const DIAGNOSTIC_HEADERS = ["content-type", "server", "via", "retry-after", "x-cache", "cf-mitigated"];
const EXCERPT_LIMIT = 1200;

const sanitizeResponseText = (value: string) => redactSecretString(value)
  .replace(/https?:\/\/[^\s<>"']+/gi, "[URL]")
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[EMAIL]")
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]")
  .replace(/\b(?:[a-f\d]{0,4}:){2,}[a-f\d:]*\b/gi, "[IP]")
  .replace(/\b(?:authorization|cookie|token|password|secret|api[_-]?key)\s*[:=]\s*(?:Bearer\s+)?\S+/gi, "[REDACTED]");

export const buildKindFailureDiagnostics = (
  response: Response,
  html: string,
  endpoint: KindEndpoint,
  region = process.env.VERCEL_REGION ?? "local",
) => {
  const visibleText = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeText = sanitizeResponseText(visibleText);

  return {
    endpoint,
    method: "POST",
    status: response.status,
    region,
    redirected: response.redirected,
    responseHeaders: Object.fromEntries(DIAGNOSTIC_HEADERS.flatMap((name) => {
      const value = response.headers.get(name);
      return value ? [[name, sanitizeResponseText(value).slice(0, 200)]] : [];
    })),
    responseBodyCharacters: html.length,
    bodyExcerpt: safeText.slice(0, EXCERPT_LIMIT),
    excerptTruncated: safeText.length > EXCERPT_LIMIT,
  };
};

export const logKindHttpFailure = async (response: Response, html: string, endpoint: KindEndpoint) => {
  await logOperation({
    level: "WARN",
    source: "source:kind",
    action: "http_response_rejected",
    message: `KIND ${endpoint} 조회가 HTTP ${response.status}로 거절됐습니다.`,
    context: buildKindFailureDiagnostics(response, html, endpoint),
  });
};
