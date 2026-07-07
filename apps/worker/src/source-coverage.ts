import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SourceRegistryEntry, SourceUrl } from "@scpi/schema";
import { loadSources } from "@scpi/sources";

export interface SourceCoverageOptions {
  sourcesPath?: string;
  outDir: string;
  generatedAt?: string;
}

export interface SourceCoverageItem {
  id: string;
  institutionName: string;
  canton: string;
  city: string;
  sourceLanguage: string;
  region: string;
  status: string;
  priority: number;
  notes: string;
  urls: string[];
  fetchModes: string[];
}

export interface SourceCoverageReport {
  generatedAt: string;
  sourceCount: number;
  urlCount: number;
  countsByCanton: Record<string, number>;
  countsByLanguage: Record<string, number>;
  countsByRegion: Record<string, number>;
  countsByStatus: Record<string, number>;
  countsByPriority: Record<string, number>;
  manualVerificationSources: SourceCoverageItem[];
  specialFetchModeSources: SourceCoverageItem[];
}

export async function generateSourceCoverage(
  options: SourceCoverageOptions,
): Promise<SourceCoverageReport> {
  const sources = await loadSources(options.sourcesPath);
  const report = buildSourceCoverageReport(
    sources,
    options.generatedAt ?? new Date().toISOString(),
  );

  await mkdir(options.outDir, { recursive: true });
  await writeFile(
    join(options.outDir, "source-coverage.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(options.outDir, "source-coverage.md"),
    renderCoverageMarkdown(report),
    "utf8",
  );

  return report;
}

export function buildSourceCoverageReport(
  sources: SourceRegistryEntry[],
  generatedAt: string,
): SourceCoverageReport {
  return {
    generatedAt,
    sourceCount: sources.length,
    urlCount: sources.reduce((count, source) => count + source.sourceUrls.length, 0),
    countsByCanton: countBy(sources, (source) => source.canton),
    countsByLanguage: countBy(sources, (source) => source.sourceLanguage),
    countsByRegion: countBy(sources, (source) => source.region),
    countsByStatus: countBy(sources, (source) => source.status),
    countsByPriority: countBy(sources, (source) => String(source.priority)),
    manualVerificationSources: sources
      .filter((source) => source.status === "candidate" || source.status === "needs-review")
      .map(toCoverageItem),
    specialFetchModeSources: sources
      .filter((source) => source.sourceUrls.some((sourceUrl) => sourceUrl.fetchMode !== "html"))
      .map(toCoverageItem),
  };
}

export function parseSourceCoverageArgs(argv: string[]): SourceCoverageOptions {
  const args = new Map<string, string | true>();
  const baseDir = process.env.INIT_CWD ?? process.cwd();

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

  return {
    sourcesPath: optionalPath(baseDir, args.get("sources")),
    outDir: resolve(baseDir, stringArg(args, "out", "data/current")),
  };
}

function renderCoverageMarkdown(report: SourceCoverageReport): string {
  return `# Source Coverage

Generated at: ${report.generatedAt}

## Summary

- Sources: ${report.sourceCount}
- URLs: ${report.urlCount}

${renderCountSection("Count by canton", report.countsByCanton)}
${renderCountSection("Count by language", report.countsByLanguage)}
${renderCountSection("Count by region", report.countsByRegion)}
${renderCountSection("Count by status", report.countsByStatus)}
${renderCountSection("Count by priority", report.countsByPriority)}

## Sources Needing Manual Verification

${renderSourceList(report.manualVerificationSources)}

## Manual/PDF/Playwright Fetch Modes

${renderSourceList(report.specialFetchModeSources)}
`;
}

function renderCountSection(title: string, counts: Record<string, number>): string {
  return `## ${title}

${Object.entries(counts)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}
`;
}

function renderSourceList(sources: SourceCoverageItem[]): string {
  if (sources.length === 0) {
    return "No sources in this category.";
  }

  return sources
    .map(
      (source) => `- \`${source.id}\` ${source.institutionName} (${source.canton}, ${
        source.sourceLanguage
      }, ${source.region}, priority ${source.priority}, ${source.status})
  URLs: ${source.urls.join(", ")}
  Fetch modes: ${source.fetchModes.join(", ")}
  Notes: ${source.notes}`,
    )
    .join("\n");
}

function toCoverageItem(source: SourceRegistryEntry): SourceCoverageItem {
  return {
    id: source.id,
    institutionName: source.institutionName,
    canton: source.canton,
    city: source.city,
    sourceLanguage: source.sourceLanguage,
    region: source.region,
    status: source.status,
    priority: source.priority,
    notes: source.notes,
    urls: source.sourceUrls.map((sourceUrl) => sourceUrl.url),
    fetchModes: unique(source.sourceUrls.map((sourceUrl) => sourceUrl.fetchMode)),
  };
}

function countBy<T>(values: T[], keyFor: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function unique(values: SourceUrl["fetchMode"][]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

function optionalPath(baseDir: string, value: string | true | undefined): string | undefined {
  return typeof value === "string" ? resolve(baseDir, value) : undefined;
}

async function main(): Promise<void> {
  const options = parseSourceCoverageArgs(process.argv.slice(2));
  const report = await generateSourceCoverage(options);
  console.log(
    `Generated source coverage for ${report.sourceCount} sources and ${report.urlCount} URLs.`,
  );
  console.log(`Coverage JSON: ${join(options.outDir, "source-coverage.json")}`);
  console.log(`Coverage Markdown: ${join(options.outDir, "source-coverage.md")}`);
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
