import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type ChangeRecord,
  ChangeRecordArraySchema,
  type LeadTimeReport,
  LeadTimeReportArraySchema,
  type LeadTimeSummary,
  LeadTimeSummaryArraySchema,
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SourceRegistryEntry,
  SourceRegistrySchema,
  type VerificationEvidence,
  VerificationEvidenceArraySchema,
} from "@scpi/schema";
import { buildReliabilitySummaries } from "./community-evidence.js";
import {
  renderCoverageReportsPage,
  renderMarkdownReportPage,
  renderPlacementIndexPage,
  renderReviewQueuePage,
  renderSourceDetailPage,
} from "./render.js";

export interface BuildSiteOptions {
  dataDir: string;
  exportsDir: string;
  outDir: string;
}

export interface BuildSiteResult {
  indexPath: string;
  placementCount: number;
  sourceCount: number;
  sourcePageCount: number;
}

export async function buildSite(options: BuildSiteOptions): Promise<BuildSiteResult> {
  const sources = await readSources(join(options.dataDir, "sources.json"));
  const placements = fillPlacementLocationsFromSources(
    await readPlacements(join(options.dataDir, "placements.json")),
    sources,
  );
  const changes = await readChanges(join(options.dataDir, "changes.json"));
  const leadTimeSummaries = await readLeadTimeSummaries(
    join(options.dataDir, "lead-time-summary.json"),
  );
  const verificationEvidence = await readVerificationEvidence(
    join(options.dataDir, "verification-evidence.json"),
  );
  const leadTimeReports = await readLeadTimeReports(
    join(options.dataDir, "lead-time-reports.json"),
  );
  const reliabilitySummaries = buildReliabilitySummaries(
    placements,
    verificationEvidence,
    leadTimeReports,
  );
  const currentDataOut = join(options.outDir, "data", "current");
  const exportsOut = join(options.outDir, "data", "exports");
  await mkdir(currentDataOut, { recursive: true });
  await mkdir(exportsOut, { recursive: true });

  await writeJson(join(currentDataOut, "placements.json"), placements);
  await copyFile(join(options.dataDir, "sources.json"), join(currentDataOut, "sources.json"));
  await writeJson(join(currentDataOut, "changes.json"), changes);
  await copyIfExists(
    join(options.dataDir, "review-needed.md"),
    join(currentDataOut, "review-needed.md"),
  );
  await copyIfExists(
    join(options.dataDir, "source-coverage.json"),
    join(currentDataOut, "source-coverage.json"),
  );
  await copyIfExists(
    join(options.dataDir, "source-coverage.md"),
    join(currentDataOut, "source-coverage.md"),
  );
  await copyIfExists(
    join(options.dataDir, "institution-coverage.json"),
    join(currentDataOut, "institution-coverage.json"),
  );
  await copyIfExists(
    join(options.dataDir, "institution-coverage.md"),
    join(currentDataOut, "institution-coverage.md"),
  );
  await copyIfExists(
    join(options.dataDir, "record-coverage.json"),
    join(currentDataOut, "record-coverage.json"),
  );
  await copyIfExists(
    join(options.dataDir, "record-coverage.md"),
    join(currentDataOut, "record-coverage.md"),
  );
  await copyIfExists(
    join(options.dataDir, "missing-sources.md"),
    join(currentDataOut, "missing-sources.md"),
  );
  await copyIfExists(
    join(options.dataDir, "coverage-by-baseline.md"),
    join(currentDataOut, "coverage-by-baseline.md"),
  );
  await copyIfExists(
    join(options.dataDir, "reliability-audit.json"),
    join(currentDataOut, "reliability-audit.json"),
  );
  await copyIfExists(
    join(options.dataDir, "reliability-audit.md"),
    join(currentDataOut, "reliability-audit.md"),
  );
  await copyIfExists(
    join(options.dataDir, "lead-time-evidence.json"),
    join(currentDataOut, "lead-time-evidence.json"),
  );
  await copyIfExists(
    join(options.dataDir, "lead-time-summary.json"),
    join(currentDataOut, "lead-time-summary.json"),
  );
  await copyIfExists(
    join(options.dataDir, "verification-evidence.json"),
    join(currentDataOut, "verification-evidence.json"),
  );
  await copyIfExists(
    join(options.dataDir, "lead-time-reports.json"),
    join(currentDataOut, "lead-time-reports.json"),
  );
  await writeJson(join(currentDataOut, "reliability-summary.json"), reliabilitySummaries);
  await copyFile(join(options.exportsDir, "placements.csv"), join(exportsOut, "placements.csv"));

  const indexPath = join(options.outDir, "index.html");
  const html = renderPlacementIndexPage({
    placements,
    sources,
    leadTimeSummaries,
    reliabilitySummaries,
    csvHref: "data/exports/placements.csv",
    dataHref: "data/current/placements.json",
  });
  await writeFile(indexPath, html, "utf8");
  await writeFile(
    join(options.outDir, "review-queue.html"),
    renderReviewQueuePage({
      placements,
      sources,
      leadTimeSummaries,
      reliabilitySummaries,
      csvHref: "data/exports/placements.csv",
      dataHref: "data/current/placements.json",
    }),
    "utf8",
  );
  await writeFile(
    join(options.outDir, "coverage.html"),
    renderCoverageReportsPage({
      indexHref: "index.html",
      reports: [
        {
          title: "Source coverage",
          sourceHref: "data/current/source-coverage.md",
          markdown: await readOptionalText(join(options.dataDir, "source-coverage.md")),
        },
        {
          title: "Institution coverage",
          sourceHref: "data/current/institution-coverage.md",
          markdown: await readOptionalText(join(options.dataDir, "institution-coverage.md")),
        },
        {
          title: "Record coverage",
          sourceHref: "data/current/record-coverage.md",
          markdown: await readOptionalText(join(options.dataDir, "record-coverage.md")),
        },
        {
          title: "Coverage by baseline",
          sourceHref: "data/current/coverage-by-baseline.md",
          markdown: await readOptionalText(join(options.dataDir, "coverage-by-baseline.md")),
        },
      ],
    }),
    "utf8",
  );
  await writeFile(
    join(options.outDir, "missing.html"),
    renderMarkdownReportPage({
      indexHref: "index.html",
      title: "Missing Sources",
      subtitle:
        "Candidate source gaps from the generated baseline comparison. Items here need manual verification before they are treated as real coverage gaps.",
      sourceHref: "data/current/missing-sources.md",
      markdown: await readOptionalText(join(options.dataDir, "missing-sources.md")),
    }),
    "utf8",
  );
  await writeSourcePages(options.outDir, sources, placements, changes);

  return {
    indexPath,
    placementCount: placements.length,
    sourceCount: sources.length,
    sourcePageCount: sources.length,
  };
}

export function parseBuildSiteArgs(argv: string[]): BuildSiteOptions {
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
    dataDir: resolve(baseDir, stringArg(args, "data", "data/current")),
    exportsDir: resolve(baseDir, stringArg(args, "exports", "data/exports")),
    outDir: resolve(baseDir, stringArg(args, "out", "apps/web/dist/site")),
  };
}

async function readPlacements(path: string): Promise<PlacementRecord[]> {
  return PlacementRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readSources(path: string): Promise<SourceRegistryEntry[]> {
  return SourceRegistrySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readChanges(path: string): Promise<ChangeRecord[]> {
  try {
    return ChangeRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readLeadTimeSummaries(path: string): Promise<LeadTimeSummary[]> {
  try {
    return LeadTimeSummaryArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readVerificationEvidence(path: string): Promise<VerificationEvidence[]> {
  try {
    return VerificationEvidenceArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readLeadTimeReports(path: string): Promise<LeadTimeReport[]> {
  try {
    return LeadTimeReportArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function fillPlacementLocationsFromSources(
  placements: PlacementRecord[],
  sources: SourceRegistryEntry[],
): PlacementRecord[] {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  return placements.map((placement) => {
    const source = sourcesById.get(placement.sourceId);

    if (source?.institutionType !== "hospital" || (placement.canton && placement.city)) {
      return placement;
    }

    return {
      ...placement,
      canton: placement.canton ?? source.canton,
      city: placement.city ?? source.city,
    };
  });
}

async function writeSourcePages(
  outDir: string,
  sources: SourceRegistryEntry[],
  placements: PlacementRecord[],
  changes: ChangeRecord[],
): Promise<void> {
  for (const source of sources) {
    const sourceDir = join(outDir, "sources", sourcePageSegment(source.id));
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      join(sourceDir, "index.html"),
      renderSourceDetailPage({
        source,
        placements: placements.filter((record) => record.sourceId === source.id),
        changes: changes.filter((change) => change.sourceId === source.id),
        indexHref: "../../index.html",
      }),
      "utf8",
    );
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function sourcePageSegment(sourceId: string): string {
  return encodeURIComponent(sourceId);
}

function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

async function main(): Promise<void> {
  const result = await buildSite(parseBuildSiteArgs(process.argv.slice(2)));
  console.log(
    `Built ${result.placementCount} placements from ${result.sourceCount} sources and ${result.sourcePageCount} source pages.`,
  );
  console.log(`Static site: ${result.indexPath}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("build-site.js")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
