import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SnapshotRecord, SourceRegistryEntry } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { crawlSources, parseCrawlArgs } from "../src/crawl.js";

describe("crawlSources", () => {
  it("writes snapshots and continues across success, 404, timeout, duplicate, and playwright pages", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "scpi-crawl-"));
    const fetchCalls = new Map<string, number>();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      fetchCalls.set(url, (fetchCalls.get(url) ?? 0) + 1);

      if (url.includes("timeout")) {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }

      if (url.includes("missing")) {
        return new Response("Not found", {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      return new Response(
        "<!doctype html><html><head><title>Unterassistenz Test</title></head><body><main><h1>Unterassistenz Innere Medizin</h1><p>Kontakt test@example.ch</p><a href='/apply'>Bewerbung</a></main></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    };

    const report = await crawlSources({
      sources: [
        source("success-source", "https://example.ch/success"),
        source("missing-source", "https://example.ch/missing"),
        source("timeout-source", "https://example.ch/timeout"),
        source("duplicate-source", "https://example.ch/success"),
        source("playwright-source", "https://example.ch/playwright", "playwright"),
      ],
      sourcesPath: "mocked-sources.yaml",
      outDir,
      fetchedAt: "2026-07-07T08:00:00.000Z",
      fetchImpl,
      maxRetries: 0,
    });

    expect(report).toMatchObject({
      sourceCount: 5,
      urlCount: 5,
      successCount: 1,
      failureCount: 3,
      skippedCount: 1,
      duplicateUrlCount: 1,
      fetchedUrls: [
        "https://example.ch/success",
        "https://example.ch/missing",
        "https://example.ch/timeout",
        "https://example.ch/playwright",
      ],
      skippedUrls: [
        {
          sourceId: "duplicate-source",
          url: "https://example.ch/success",
          reason: "Duplicate URL already crawled: https://example.ch/success",
        },
      ],
      parserWarnings: [],
    });
    expect(fetchCalls.get("https://example.ch/success")).toBe(1);
    expect(report.entries.map((entry) => entry.status)).toEqual([
      "success",
      "failed",
      "failed",
      "skipped-duplicate",
      "failed",
    ]);

    const files = await readdir(outDir);
    expect(files.filter((file) => file.endsWith(".snapshot.json"))).toHaveLength(4);
    expect(files).toContain("crawler-report.json");

    const successEntry = report.entries.find((entry) => entry.sourceId === "success-source");
    expect(successEntry?.snapshotPath).toBeTruthy();
    const successSnapshot = JSON.parse(
      await readFile(successEntry?.snapshotPath ?? "", "utf8"),
    ) as SnapshotRecord;
    expect(successSnapshot).toMatchObject({
      sourceId: "success-source",
      url: "https://example.ch/success",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      title: "Unterassistenz Test",
      fetchModeUsed: "html",
      error: null,
    });
    expect(successSnapshot.visibleText).toContain("Unterassistenz Innere Medizin");
    expect(successSnapshot.extractedEmails).toEqual(["test@example.ch"]);
    expect(successSnapshot.extractedLinks[0]).toMatchObject({
      text: "Bewerbung",
      href: "https://example.ch/apply",
    });

    const playwrightEntry = report.entries.find((entry) => entry.sourceId === "playwright-source");
    const playwrightSnapshot = JSON.parse(
      await readFile(playwrightEntry?.snapshotPath ?? "", "utf8"),
    ) as SnapshotRecord;
    expect(playwrightSnapshot).toMatchObject({
      fetchModeUsed: "playwright",
      error: "Playwright fetch mode is not implemented in fetchPage.",
    });
  });

  it("writes raw HTML only when configured", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "scpi-crawl-raw-"));
    const report = await crawlSources({
      sources: [source("success-source", "https://example.ch/success")],
      outDir,
      saveRawHtml: true,
      fetchImpl: async () =>
        new Response("<html><body><main>Unterassistenz</main></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });

    expect(report.entries[0]?.rawHtmlPath).toBeTruthy();
    expect(await readFile(report.entries[0]?.rawHtmlPath ?? "", "utf8")).toContain(
      "Unterassistenz",
    );
  });

  it("dry-runs without fetching or writing snapshots", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "scpi-crawl-dry-run-"));
    let fetchCount = 0;
    const report = await crawlSources({
      sources: [source("dry-run-source", "https://example.ch/dry-run")],
      outDir,
      dryRun: true,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response("<html></html>");
      },
    });

    expect(fetchCount).toBe(0);
    expect(report).toMatchObject({
      sourceCount: 1,
      urlCount: 1,
      successCount: 1,
      failureCount: 0,
      fetchedUrls: [],
      parserWarnings: [],
    });
    expect(report.entries[0]).toMatchObject({
      sourceId: "dry-run-source",
      status: "success",
      snapshotPath: null,
    });
    expect(await readdir(outDir)).toEqual(["crawler-report.json"]);
  });

  it("removes stale generated crawl files before writing a new report", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "scpi-crawl-clean-"));
    await writeFile(join(outDir, "old.snapshot.json"), "{}\n", "utf8");
    await writeFile(join(outDir, "old.raw.html"), "<html></html>", "utf8");
    await writeFile(join(outDir, "crawler-report.json"), "{}\n", "utf8");
    await writeFile(join(outDir, "keep.txt"), "keep", "utf8");

    await crawlSources({
      sources: [source("clean-source", "https://example.ch/clean")],
      outDir,
      dryRun: true,
      fetchImpl: async () => new Response("<html></html>"),
    });

    expect((await readdir(outDir)).sort()).toEqual(["crawler-report.json", "keep.txt"]);
  });

  it("limits live crawl attempts and respects delay between fetched URLs", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "scpi-crawl-limit-"));
    const delayed: number[] = [];
    const fetched: string[] = [];
    const report = await crawlSources({
      sources: [
        source("first-source", "https://example.ch/first"),
        source("second-source", "https://example.ch/second"),
        source("third-source", "https://example.ch/third"),
      ],
      outDir,
      limit: 2,
      respectDelayMs: 25,
      delayImpl: async (milliseconds) => {
        delayed.push(milliseconds);
      },
      fetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response("<html><body><main>Unterassistenz</main></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    });

    expect(fetched).toEqual(["https://example.ch/first", "https://example.ch/second"]);
    expect(delayed).toEqual([25]);
    expect(report).toMatchObject({
      urlCount: 3,
      successCount: 2,
      skippedCount: 1,
      fetchedUrls: ["https://example.ch/first", "https://example.ch/second"],
      skippedUrls: [
        {
          sourceId: "third-source",
          url: "https://example.ch/third",
          reason: "Skipped because --limit=2 was reached.",
        },
      ],
    });
    expect(report.entries.map((entry) => entry.status)).toEqual([
      "success",
      "success",
      "skipped-limit",
    ]);
  });
});

describe("parseCrawlArgs", () => {
  it("parses the crawl CLI arguments", () => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();

    expect(
      parseCrawlArgs([
        "--sources",
        "packages/sources/sources.yaml",
        "--out",
        "data/snapshots",
        "--save-raw-html",
        "--dry-run",
        "--limit",
        "2",
        "--respect-delay-ms",
        "25",
        "--timeout-ms",
        "1000",
        "--max-retries",
        "0",
      ]),
    ).toEqual({
      sourcesPath: resolve(baseDir, "packages/sources/sources.yaml"),
      outDir: resolve(baseDir, "data/snapshots"),
      saveRawHtml: true,
      dryRun: true,
      limit: 2,
      respectDelayMs: 25,
      timeoutMs: 1000,
      maxRetries: 0,
    });
  });
});

function source(
  id: string,
  url: string,
  fetchMode: SourceRegistryEntry["sourceUrls"][number]["fetchMode"] = "html",
): SourceRegistryEntry {
  return {
    id,
    institutionName: "Example Hospital",
    institutionType: "hospital",
    canton: "ZH",
    city: "Zürich",
    language: "de",
    country: "CH",
    sourceUrls: [
      {
        url,
        pageType: "hospital-placement-page",
        expectedParser: "generic",
        fetchMode,
      },
    ],
    notes: "Mock source for crawler tests.",
    priority: 1,
    status: "candidate",
  };
}
