export const DEFAULT_USER_AGENT =
  "SwissClinicalPlacementIndex/0.1 (+https://github.com/open-data-swiss-clinical-placement-index; contact: maintainers)";

const transientStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504]);

export type FetchMode = "html" | "playwright" | "pdf" | "manual";

export interface FetchPageOptions {
  fetchMode?: FetchMode;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  userAgent?: string;
}

export interface FetchPageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  fetchModeUsed: FetchMode;
  error: string | null;
}

export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<FetchPageResult> {
  const fetchMode = options.fetchMode ?? "html";

  if (fetchMode === "manual") {
    return emptyResult(url, fetchMode, "Manual fetch mode does not perform network requests.");
  }

  if (fetchMode === "playwright") {
    return emptyResult(url, fetchMode, "Playwright fetch mode is not implemented in fetchPage.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: fetchMode === "pdf" ? "application/pdf,*/*;q=0.8" : "text/html,*/*;q=0.8",
          "User-Agent": userAgent,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      const result: FetchPageResult = {
        url,
        finalUrl: response.url || url,
        status: response.status,
        ok: response.ok,
        headers: headersToRecord(response.headers),
        body: await response.text(),
        fetchModeUsed: fetchMode,
        error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
      };

      if (!shouldRetryStatus(response.status) || attempt === maxRetries) {
        return result;
      }

      await delay(retryDelayMs);
    } catch (error) {
      lastError = formatFetchError(error);

      if (!isTransientFetchError(error) || attempt === maxRetries) {
        return emptyResult(url, fetchMode, lastError);
      }

      await delay(retryDelayMs);
    }
  }

  return emptyResult(url, fetchMode, lastError ?? "Fetch failed.");
}

function shouldRetryStatus(status: number): boolean {
  return transientStatusCodes.has(status);
}

function isTransientFetchError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function emptyResult(url: string, fetchModeUsed: FetchMode, error: string): FetchPageResult {
  return {
    url,
    finalUrl: url,
    status: null,
    ok: false,
    headers: {},
    body: "",
    fetchModeUsed,
    error,
  };
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
