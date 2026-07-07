import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SnapshotRecordSchema, type SourceRegistryEntry } from "@scpi/schema";
import { loadSources } from "@scpi/sources";
import {
  extractEmails,
  extractLinks,
  extractTitle,
  extractVisibleText,
  type FetchPageOptions,
  fetchPage,
  hashString,
} from "@scpi/utils";

type FetchMode = SourceRegistryEntry["sourceUrls"][number]["fetchMode"];

export interface CrawlOptions {
  sourcesPath: string;
  outDir: string;
  saveRawHtml?: boolean;
  fetchedAt?: string;
  fetchImpl?: FetchPageOptions["fetchImpl"];
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CrawlReportEntry {
  sourceId: string;
  url: string;
  fetchMode: FetchMode;
  status: "success" | "failed" | "skipped-duplicate";
  statusCode: number | null;
  snapshotPath: string | null;
  rawHtmlPath: string | null;
  error: string | null;
}

export interface CrawlReport {
  generatedAt: string;
  sourcesPath: string;
  outDir: string;
  sourceCount: number;
  urlCount: number;
  successCount: number;
  failureCount: number;
  duplicateUrlCount: number;
  entries: CrawlReportEntry[];
}

interface CrawlSourcesOptions extends Omit<CrawlOptions, "sourcesPath"> {
  sources: SourceRegistryEntry[];
  sourcesPath?: string;
}

export async function crawlFromRegistry(options: CrawlOptions): Promise<CrawlReport> {
  const sources = await loadSources(options.sourcesPath);
  return crawlSources({ ...options, sources });
}

export async function crawlSources(options: CrawlSourcesOptions): Promise<CrawlReport> {
  const generatedAt = options.fetchedAt ?? new Date().toISOString();
  const entries: CrawlReportEntry[] = [];
  const seenUrls = new Set<string>();
  let urlCount = 0;

  await mkdir(options.outDir, { recursive: true });

  for (const source of options.sources) {
    for (const [urlIndex, sourceUrl] of source.sourceUrls.entries()) {
      urlCount += 1;
      const snapshotPath = join(
        options.outDir,
        snapshotFileName(source.id, urlIndex, sourceUrl.url),
      );

      if (seenUrls.has(sourceUrl.url)) {
        entries.push({
          sourceId: source.id,
          url: sourceUrl.url,
          fetchMode: sourceUrl.fetchMode,
          status: "skipped-duplicate",
          statusCode: null,
          snapshotPath: null,
          rawHtmlPath: null,
          error: `Duplicate URL already crawled: ${sourceUrl.url}`,
        });
        continue;
      }

      seenUrls.add(sourceUrl.url);

      const fetched = await fetchPage(sourceUrl.url, {
        fetchMode: sourceUrl.fetchMode,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
      });
      const visibleText = fetched.ok ? extractVisibleText(fetched.body) : "";
      const snapshot = SnapshotRecordSchema.parse({
        sourceId: source.id,
        url: fetched.finalUrl,
        fetchedAt: generatedAt,
        statusCode: fetched.status,
        contentType: fetched.headers["content-type"] ?? null,
        rawHash: exactHash(fetched.body),
        textHash: hashString(visibleText),
        title: fetched.ok ? extractTitle(fetched.body) : null,
        visibleText,
        extractedLinks: fetched.ok ? extractLinks(fetched.body, fetched.finalUrl) : [],
        extractedEmails: fetched.ok ? extractEmails(fetched.body) : [],
        fetchModeUsed: fetched.fetchModeUsed,
        error: fetched.error,
      });
      const rawHtmlPath =
        options.saveRawHtml && fetched.body
          ? join(options.outDir, rawHtmlFileName(source.id, urlIndex, sourceUrl.url))
          : null;

      await writeJson(snapshotPath, snapshot);

      if (rawHtmlPath) {
        await writeFile(rawHtmlPath, fetched.body, "utf8");
      }

      entries.push({
        sourceId: source.id,
        url: sourceUrl.url,
        fetchMode: sourceUrl.fetchMode,
        status: fetched.ok ? "success" : "failed",
        statusCode: fetched.status,
        snapshotPath,
        rawHtmlPath,
        error: fetched.error,
      });
    }
  }

  const report: CrawlReport = {
    generatedAt,
    sourcesPath: options.sourcesPath ?? "<in-memory>",
    outDir: options.outDir,
    sourceCount: options.sources.length,
    urlCount,
    successCount: entries.filter((entry) => entry.status === "success").length,
    failureCount: entries.filter((entry) => entry.status === "failed").length,
    duplicateUrlCount: entries.filter((entry) => entry.status === "skipped-duplicate").length,
    entries,
  };

  await writeJson(join(options.outDir, "crawler-report.json"), report);
  return report;
}

export function parseCrawlArgs(argv: string[]): CrawlOptions {
  const args = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  const sourcesPath = args.get("sources");
  const outDir = args.get("out");

  if (typeof sourcesPath !== "string" || typeof outDir !== "string") {
    throw new Error(
      "Usage: pnpm crawl -- --sources packages/sources/sources.yaml --out data/snapshots [--save-raw-html]",
    );
  }

  return {
    sourcesPath,
    outDir,
    saveRawHtml: args.has("save-raw-html"),
    timeoutMs: numberArg(args.get("timeout-ms")),
    maxRetries: numberArg(args.get("max-retries")),
  };
}

async function main(): Promise<void> {
  const options = parseCrawlArgs(process.argv.slice(2));
  const report = await crawlFromRegistry(options);
  console.log(
    `Crawled ${report.successCount}/${report.urlCount} URLs with ${report.failureCount} failures and ${report.duplicateUrlCount} duplicates.`,
  );
  console.log(`Report: ${join(options.outDir, "crawler-report.json")}`);
}

function snapshotFileName(sourceId: string, urlIndex: number, url: string): string {
  return `${sourceId}-${urlIndex + 1}-${shortHash(url)}.snapshot.json`;
}

function rawHtmlFileName(sourceId: string, urlIndex: number, url: string): string {
  return `${sourceId}-${urlIndex + 1}-${shortHash(url)}.raw.html`;
}

function shortHash(input: string): string {
  return exactHash(input).slice(0, 10);
}

function exactHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function numberArg(value: string | true | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isCliEntrypoint(): boolean {
  const invokedPath = process.argv[1];

  if (!invokedPath) {
    return false;
  }

  return pathToFileURL(resolve(invokedPath)).href === import.meta.url;
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
