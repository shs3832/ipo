import { createHash, randomUUID } from "node:crypto";

import { getKstMonthRange } from "@/lib/date";
import { buildKindFailureDiagnostics } from "@/lib/sources/kind-response-diagnostics";

const KIND_ORIGIN = "https://kind.krx.co.kr";
const RESPONSE_BYTE_LIMIT = 128 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export const buildKindAccessProbes = (now = new Date()) => {
  const current = getKstMonthRange(now);
  const next = getKstMonthRange(now, 1);
  const listing = new URLSearchParams({
    method: "searchListingTypeSub", forward: "listingtype_sub", currentPageSize: "3000",
    pageIndex: "1", orderMode: "1", orderStat: "D", marketType: "", country: "", industry: "",
    repMajAgntComp: "", designAdvserComp: "", fromDate: current.startKey, toDate: next.endKey,
    listTypeArrStr: "01|", choicTypeArrStr: "", secuGrpArrStr: "0|ST|FS|MF|SC|RT|IF|DR|", searchCorpName: "",
  });
  const schedule = new URLSearchParams({
    method: "searchPubofrScholCalnd", forward: "pubofrSchol_sub", marketType: "", scholType: "2",
    selYear: String(current.year), selMonth: String(current.month).padStart(2, "0"),
  });

  return [
    { id: "homepage-get", endpoint: "/", path: "/", method: "GET", parameters: "" },
    { id: "listing-get", endpoint: "listingcompany.do", path: "/listinvstg/listingcompany.do", method: "GET", parameters: listing.toString() },
    { id: "listing-post", endpoint: "listingcompany.do", path: "/listinvstg/listingcompany.do", method: "POST", parameters: listing.toString() },
    { id: "schedule-get", endpoint: "pubofrschdl.do", path: "/listinvstg/pubofrschdl.do", method: "GET", parameters: schedule.toString() },
    { id: "schedule-post", endpoint: "pubofrschdl.do", path: "/listinvstg/pubofrschdl.do", method: "POST", parameters: schedule.toString() },
  ] as const;
};

export const readKindProbeBody = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    return { text: "", bytesRead: 0, bodyTruncated: false };
  }
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let bodyTruncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = RESPONSE_BYTE_LIMIT - bytesRead;
      chunks.push(value.subarray(0, remaining));
      bytesRead += Math.min(remaining, value.byteLength);
      if (bytesRead >= RESPONSE_BYTE_LIMIT) {
        bodyTruncated = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytesRead, bodyTruncated };
};

export const runKindAccessProbes = async ({
  now = new Date(),
  fetcher = fetch,
}: {
  now?: Date;
  fetcher?: typeof fetch;
} = {}) => {
  const results = [];
  for (const probe of buildKindAccessProbes(now)) {
    const started = Date.now();
    const url = new URL(probe.path, KIND_ORIGIN);
    if (probe.method === "GET") url.search = probe.parameters;
    const parametersHash = createHash("sha256").update(probe.parameters).digest("hex").slice(0, 16);
    try {
      const response = await fetcher(url, {
        method: probe.method,
        ...(probe.method === "POST" ? {
          headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: probe.parameters,
        } : {}),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await readKindProbeBody(response);
      const diagnostics = buildKindFailureDiagnostics(response, body.text, probe.endpoint, undefined, probe.method);
      results.push({
        id: probe.id,
        parametersHash,
        elapsedMs: Date.now() - started,
        ...diagnostics,
        bytesRead: body.bytesRead,
        bodyTruncated: body.bodyTruncated,
        accessDenied: /access\s+denied/i.test(diagnostics.bodyExcerpt),
        containsListingRows: /fnDetailView\('/.test(body.text),
        containsCalendar: /<table\b/i.test(body.text) && /달력/.test(body.text),
        requestError: null,
      });
    } catch (error) {
      results.push({
        id: probe.id,
        parametersHash,
        elapsedMs: Date.now() - started,
        endpoint: probe.endpoint,
        method: probe.method,
        status: null,
        requestError: error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : "RequestError",
      });
    }
  }
  return {
    runId: randomUUID(),
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? "local",
    nodeVersion: process.version,
    results,
  };
};
