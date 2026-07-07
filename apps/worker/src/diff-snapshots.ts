import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type ChangeRecord,
  ChangeRecordArraySchema,
  type ChangeRecordInput,
  ChangeRecordSchema,
  makeChangeId,
  type PlacementRecord,
  PlacementRecordArraySchema,
  type SnapshotRecord,
  SnapshotRecordSchema,
} from "@scpi/schema";
import { diffPlacementRecords } from "@scpi/utils";

export interface DiffSnapshotsOptions {
  previousDir: string;
  currentDir: string;
  detectedAt?: string;
}

export interface DiffSnapshotsResult {
  changes: ChangeRecord[];
  outputPath: string;
}

interface SnapshotSummary {
  sourceId: string;
  url: string;
  statusCode: number | null;
  rawHash: string;
  textHash: string;
  error: string | null;
}

export async function diffSnapshots(options: DiffSnapshotsOptions): Promise<DiffSnapshotsResult> {
  const detectedAt = options.detectedAt ?? new Date().toISOString();
  const previousSnapshots = await readSnapshots(options.previousDir);
  const currentSnapshots = await readSnapshots(options.currentDir);
  const previousSnapshotByKey = new Map(
    previousSnapshots.map((snapshot) => [snapshotKey(snapshot), snapshot]),
  );
  const changes: ChangeRecord[] = [];

  for (const currentSnapshot of currentSnapshots) {
    const previousSnapshot = previousSnapshotByKey.get(snapshotKey(currentSnapshot));

    if (!previousSnapshot) {
      changes.push(
        makeChange({
          sourceId: currentSnapshot.sourceId,
          url: currentSnapshot.url,
          detectedAt,
          changeType: "new-source",
          severity: "info",
          before: null,
          after: summarizeSnapshot(currentSnapshot),
          message: `New page crawled: ${currentSnapshot.url}.`,
        }),
      );
    }

    if (isFailedSnapshot(currentSnapshot)) {
      changes.push(
        makeChange({
          sourceId: currentSnapshot.sourceId,
          url: currentSnapshot.url,
          detectedAt,
          changeType: "error",
          severity: "review",
          before: previousSnapshot ? summarizeSnapshot(previousSnapshot) : null,
          after: summarizeSnapshot(currentSnapshot),
          message: `Page crawl failed for ${currentSnapshot.url}: ${
            currentSnapshot.error ?? `HTTP ${currentSnapshot.statusCode}`
          }.`,
        }),
      );
      continue;
    }

    if (previousSnapshot && previousSnapshot.textHash !== currentSnapshot.textHash) {
      changes.push(
        makeChange({
          sourceId: currentSnapshot.sourceId,
          url: currentSnapshot.url,
          detectedAt,
          changeType: "content-changed",
          severity: "review",
          before: summarizeSnapshot(previousSnapshot),
          after: summarizeSnapshot(currentSnapshot),
          message: `Cleaned page text changed for ${currentSnapshot.url}.`,
        }),
      );
    }
  }

  changes.push(
    ...diffPlacementRecords(
      await readPlacements(options.previousDir),
      await readPlacements(options.currentDir),
    ),
  );

  const parsedChanges = ChangeRecordArraySchema.parse(sortChanges(dedupeChanges(changes)));
  const outputPath = join(options.currentDir, "changes.json");
  await mkdir(options.currentDir, { recursive: true });
  await writeJson(outputPath, parsedChanges);

  return {
    changes: parsedChanges,
    outputPath,
  };
}

export function parseDiffSnapshotsArgs(argv: string[]): DiffSnapshotsOptions {
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

  const previousDir = args.get("previous");
  const currentDir = args.get("current");

  if (typeof previousDir !== "string" || typeof currentDir !== "string") {
    throw new Error(
      "Usage: pnpm diff:snapshots -- --previous data/previous --current data/current",
    );
  }

  return {
    previousDir: resolve(baseDir, previousDir),
    currentDir: resolve(baseDir, currentDir),
  };
}

async function readSnapshots(dir: string): Promise<SnapshotRecord[]> {
  if (!(await pathExists(dir))) {
    return [];
  }

  const files = await readdir(dir);
  const snapshots: SnapshotRecord[] = [];

  for (const file of files.filter((entry) => entry.endsWith(".snapshot.json")).sort()) {
    const raw = await readFile(join(dir, file), "utf8");
    snapshots.push(SnapshotRecordSchema.parse(JSON.parse(raw)));
  }

  return snapshots;
}

async function readPlacements(dir: string): Promise<PlacementRecord[]> {
  const path = join(dir, "placements.json");

  if (!(await pathExists(path))) {
    return [];
  }

  return PlacementRecordArraySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function makeChange(input: Omit<ChangeRecordInput, "id">): ChangeRecord {
  return ChangeRecordSchema.parse({ id: makeChangeId(input), ...input });
}

function snapshotKey(snapshot: Pick<SnapshotRecord, "sourceId" | "url">): string {
  return `${snapshot.sourceId}\n${snapshot.url}`;
}

function isFailedSnapshot(snapshot: SnapshotRecord): boolean {
  return snapshot.error !== null || (snapshot.statusCode !== null && snapshot.statusCode >= 400);
}

function summarizeSnapshot(snapshot: SnapshotRecord): SnapshotSummary {
  return {
    sourceId: snapshot.sourceId,
    url: snapshot.url,
    statusCode: snapshot.statusCode,
    rawHash: snapshot.rawHash,
    textHash: snapshot.textHash,
    error: snapshot.error,
  };
}

function dedupeChanges(changes: ChangeRecord[]): ChangeRecord[] {
  return [...new Map(changes.map((change) => [change.id, change])).values()];
}

function sortChanges(changes: ChangeRecord[]): ChangeRecord[] {
  return changes.sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      left.changeType.localeCompare(right.changeType) ||
      left.id.localeCompare(right.id),
  );
}

function severityRank(severity: ChangeRecord["severity"]): number {
  switch (severity) {
    case "critical":
      return 3;
    case "review":
      return 2;
    case "info":
      return 1;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    try {
      await readdir(path);
      return true;
    } catch {
      return false;
    }
  }
}

async function main(): Promise<void> {
  const result = await diffSnapshots(parseDiffSnapshotsArgs(process.argv.slice(2)));
  console.log(`Detected ${result.changes.length} changes.`);
  console.log(`Changes: ${result.outputPath}`);
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
