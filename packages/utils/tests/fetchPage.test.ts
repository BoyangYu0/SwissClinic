import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_AGENT, fetchPage } from "../src/fetchPage.js";

describe("fetchPage", () => {
  it("fetches a 200 HTML page with a clear User-Agent", async () => {
    const fetchImpl = mockFetch([
      response("<html><title>Placement</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ]);

    const result = await fetchPage("https://example.org/placement", { fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.body).toContain("Placement");
    expect(result.headers["content-type"]).toBe("text/html");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.org/placement",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": DEFAULT_USER_AGENT }),
      }),
    );
  });

  it("returns the final URL after redirects", async () => {
    const fetchImpl = mockFetch([
      response("redirected", { status: 200, url: "https://example.org/final" }),
    ]);

    const result = await fetchPage("https://example.org/start", { fetchImpl });

    expect(result.finalUrl).toBe("https://example.org/final");
  });

  it("times out and reports a readable error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof fetch;

    const result = await fetchPage("https://example.org/slow", {
      fetchImpl,
      maxRetries: 0,
      timeoutMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toContain("timeout");
  });

  it("does not retry 404 responses", async () => {
    const fetchImpl = mockFetch([response("missing", { status: 404, statusText: "Not Found" })]);

    const result = await fetchPage("https://example.org/missing", { fetchImpl, maxRetries: 2 });

    expect(result.status).toBe(404);
    expect(result.error).toBe("HTTP 404 Not Found");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 500 response once", async () => {
    const fetchImpl = mockFetch([
      response("server error", { status: 500, statusText: "Server Error" }),
      response("ok", { status: 200 }),
    ]);

    const result = await fetchPage("https://example.org/flaky", {
      fetchImpl,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.body).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("accepts non-HTML content when fetch mode is pdf", async () => {
    const fetchImpl = mockFetch([
      response("%PDF-1.7", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    ]);

    const result = await fetchPage("https://example.org/file.pdf", {
      fetchImpl,
      fetchMode: "pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.fetchModeUsed).toBe("pdf");
    expect(result.headers["content-type"]).toBe("application/pdf");
    expect(result.body).toBe("%PDF-1.7");
  });

  it("does not perform network requests for manual fetch mode", async () => {
    const fetchImpl = mockFetch([]);

    const result = await fetchPage("https://example.org/manual", {
      fetchImpl,
      fetchMode: "manual",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Manual fetch mode");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function mockFetch(responses: Response[]): typeof fetch {
  return vi.fn(async () => {
    const next = responses.shift();

    if (!next) {
      throw new Error("Unexpected fetch call.");
    }

    return next;
  }) as unknown as typeof fetch;
}

function response(
  body: string,
  init: ResponseInit & { url?: string; statusText?: string } = {},
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", {
    value: init.url ?? "https://example.org/placement",
  });

  return response;
}
