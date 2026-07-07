import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type ChangeRecord,
  ChangeRecordArraySchema,
  type LeadTimeSummary,
  LeadTimeSummaryArraySchema,
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SourceRegistryEntry,
  SourceRegistrySchema,
} from "@scpi/schema";
import { renderPlacementIndexPage, renderSourceDetailPage } from "./render.js";

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
  const placements = await readPlacements(join(options.dataDir, "placements.json"));
  const sources = await readSources(join(options.dataDir, "sources.json"));
  const changes = await readChanges(join(options.dataDir, "changes.json"));
  const leadTimeSummaries = await readLeadTimeSummaries(
    join(options.dataDir, "lead-time-summary.json"),
  );
  const currentDataOut = join(options.outDir, "data", "current");
  const exportsOut = join(options.outDir, "data", "exports");
  await mkdir(currentDataOut, { recursive: true });
  await mkdir(exportsOut, { recursive: true });

  await copyFile(join(options.dataDir, "placements.json"), join(currentDataOut, "placements.json"));
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
  await copyFile(join(options.exportsDir, "placements.csv"), join(exportsOut, "placements.csv"));

  const indexPath = join(options.outDir, "index.html");
  const html = renderPlacementIndexPage({
    placements,
    sources,
    leadTimeSummaries,
    csvHref: "data/exports/placements.csv",
    dataHref: "data/current/placements.json",
  });
  await writeFile(indexPath, html, "utf8");
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
