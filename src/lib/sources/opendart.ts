import { env } from "@/lib/env";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { getKstTodayKey } from "@/lib/date";
import { redactSecretString } from "@/lib/secret-redaction";

const OPENDART_OK_STATUS = "000";
const OPENDART_EMPTY_RESULT_STATUS = "013";

export type OpendartHealthCheckResult = {
  ok: boolean;
  endpoint: string;
  status: string | null;
  message: string | null;
  usingKey: boolean;
};

const redactOpendartEndpoint = (endpoint: string) => redactSecretString(endpoint);

export const buildOpendartUrl = (path: string, params: Record<string, string>) => {
  const baseUrl = env.opendartBaseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams(params);
  return `${baseUrl}${path}?${search.toString()}`;
};

export const checkOpendartApiKey = async (): Promise<OpendartHealthCheckResult> => {
  const opendartApiKey = process.env.OPENDART_API_KEY ?? env.opendartApiKey;

  if (!opendartApiKey) {
    return {
      ok: false,
      endpoint: redactOpendartEndpoint(buildOpendartUrl("/api/list.json", { crtfc_key: "missing" })),
      status: null,
      message: "OPENDART_API_KEY is not set",
      usingKey: false,
    };
  }

  const dateKey = getKstTodayKey().replaceAll("-", "");

  const endpoint = buildOpendartUrl("/api/list.json", {
    crtfc_key: opendartApiKey,
    bgn_de: dateKey,
    end_de: dateKey,
    page_no: "1",
    page_count: "1",
  });

  const response = await fetchWithRetry(endpoint, { cache: "no-store" });
  const body = (await response.json()) as {
    status?: string;
    message?: string;
  };
  const status = body.status ?? null;
  const message = body.message ?? null;

  if (!response.ok) {
    return {
      ok: false,
      endpoint: redactOpendartEndpoint(endpoint),
      status,
      message: message ?? `HTTP ${response.status}`,
      usingKey: true,
    };
  }

  return {
    ok: status === OPENDART_OK_STATUS || status === OPENDART_EMPTY_RESULT_STATUS,
    endpoint: redactOpendartEndpoint(endpoint),
    status,
    message,
    usingKey: true,
  };
};
