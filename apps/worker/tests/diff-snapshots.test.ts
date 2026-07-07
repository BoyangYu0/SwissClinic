import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  makePlacementId,
  type PlacementRecord,
  type PlacementRecordInput,
  type SnapshotRecord,
} from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { diffSnapshots, parseDiffSnapshotsArgs } from "../src/diff-snapshots.js";

const checkedAt = "2026-07-07T08:00:00.000Z";

describe("diffSnapshots", () => {
  it("writes a review change when a placement availability date changes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-availability-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    const previousPlacement = placement({ availableFrom: "2027-07" });
    const currentPlacement = placement({ availableFrom: "2027-08" });
    await writePlacements(previousDir, [previousPlacement]);
    await writePlacements(currentDir, [currentPlacement]);

    const result = await diffSnapshots({
      previousDir,
      currentDir,
      detectedAt: checkedAt,
    });

    expect(result.outputPath).toBe(join(currentDir, "changes.json"));
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: "availability-changed",
      severity: "review",
      sourceId: "example-source",
      before: {
        availabilityStatus: "available-from",
        availableFrom: "2027-07",
        fullyBookedUntil: null,
      },
      after: {
        availabilityStatus: "available-from",
        availableFrom: "2027-08",
        fullyBookedUntil: null,
      },
    });
    expect(JSON.parse(await readFile(join(currentDir, "changes.json"), "utf8"))).toEqual(
      result.changes,
    );
  });

  it("detects parser output changes without treating lastChecked churn as meaningful", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-parser-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    const previousPlacement = placement({ applicationMethod: "email" });
    const currentPlacement = placement({
      applicationMethod: "online-form",
      lastChecked: "2026-07-08T08:00:00.000Z",
    });
    await writePlacements(previousDir, [previousPlacement]);
    await writePlacements(currentDir, [currentPlacement]);

    const result = await diffSnapshots({ previousDir, currentDir, detectedAt: checkedAt });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: "parser-output-changed",
      severity: "review",
      sourceId: "example-source",
    });
  });

  it("does not create a critical change when only raw footer content changes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-footer-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    await writeSnapshot(
      previousDir,
      snapshot({
        rawHash: "raw-before-footer",
        textHash: "same-visible-placement-text",
      }),
    );
    await writeSnapshot(
      currentDir,
      snapshot({
        rawHash: "raw-after-footer",
        textHash: "same-visible-placement-text",
      }),
    );

    const result = await diffSnapshots({ previousDir, currentDir, detectedAt: checkedAt });

    expect(result.changes).toHaveLength(0);
    expect(result.changes.some((change) => change.severity === "critical")).toBe(false);
  });

  it("creates an info change for a newly crawled source page", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-new-source-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    await writeSnapshot(
      currentDir,
      snapshot({
        sourceId: "new-source",
        url: "https://example.ch/new",
      }),
    );

    const result = await diffSnapshots({ previousDir, currentDir, detectedAt: checkedAt });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: "new-source",
      severity: "info",
      sourceId: "new-source",
      url: "https://example.ch/new",
    });
  });

  it("creates a review change for a failed current crawl", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-failed-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    await writeSnapshot(previousDir, snapshot());
    await writeSnapshot(
      currentDir,
      snapshot({
        statusCode: 500,
        error: "HTTP 500",
      }),
    );

    const result = await diffSnapshots({ previousDir, currentDir, detectedAt: checkedAt });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      changeType: "error",
      severity: "review",
      sourceId: "example-source",
      after: {
        statusCode: 500,
        error: "HTTP 500",
      },
    });
  });

  it("detects added and removed placement records", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "scpi-diff-added-removed-"));
    const previousDir = join(workspace, "previous");
    const currentDir = join(workspace, "current");
    await writePlacements(previousDir, [
      placement({
        sourceId: "removed-source",
        sourceUrl: "https://example.ch/removed",
      }),
    ]);
    await writePlacements(currentDir, [
      placement({
        sourceId: "added-source",
        sourceUrl: "https://example.ch/added",
      }),
    ]);

    const result = await diffSnapshots({ previousDir, currentDir, detectedAt: checkedAt });

    expect(result.changes.map((change) => change.changeType).sort()).toEqual([
      "record-added",
      "record-removed",
    ]);
  });
});

describe("parseDiffSnapshotsArgs", () => {
  it("parses and resolves the diff:snapshots CLI arguments", () => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();

    expect(
      parseDiffSnapshotsArgs(["--previous", "data/previous", "--current", "data/current"]),
    ).toEqual({
      previousDir: resolve(baseDir, "data/previous"),
      currentDir: resolve(baseDir, "data/current"),
    });
  });
});

function placement(overrides: Partial<PlacementRecordInput> = {}): PlacementRecord {
  const input: PlacementRecordInput = {
    id: "temporary",
    sourceId: "example-source",
    institutionName: "Example Hospital",
    department: "Innere Medizin",
    departmentNormalized: "Innere Medizin",
    roleType: "Unterassistenz",
    country: "CH",
    canton: "ZH",
    city: "Zuerich",
    language: "de",
    availabilityStatus: "available-from",
    availableFrom: "2027-07",
    fullyBookedUntil: null,
    durationMinWeeks: 4,
    durationMaxWeeks: 16,
    applicationLeadTimeMonths: null,
    applicationMethod: "email",
    applicationUrl: "https://example.ch/placement",
    contactEmail: "placement@example.ch",
    contactName: null,
    eligibilityNotes: null,
    languageRequirement: null,
    compensation: null,
    housing: null,
    sourceUrl: "https://example.ch/placement",
    sourceTitle: "Synthetic placement",
    extractedSnippet: "Unterassistenz Innere Medizin ab Juli 2027.",
    sourceLastModified: null,
    lastChecked: checkedAt,
    extractionMethod: "site-parser",
    confidence: "high",
    reviewStatus: "auto-published",
    warnings: [],
    ...overrides,
  };

  return { ...input, id: makePlacementId(input) } as PlacementRecord;
}

function snapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    sourceId: "example-source",
    url: "https://example.ch/placement",
    fetchedAt: checkedAt,
    statusCode: 200,
    contentType: "text/html",
    rawHash: "raw-placement-page",
    textHash: "text-placement-page",
    title: "Synthetic placement",
    visibleText: "Unterassistenz Innere Medizin ab Juli 2027. Bewerbung online.",
    extractedLinks: [{ text: "Bewerbung", href: "https://example.ch/placement" }],
    extractedEmails: ["placement@example.ch"],
    fetchModeUsed: "html",
    error: null,
    ...overrides,
  };
}

async function writeSnapshot(dir: string, record: SnapshotRecord): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${record.sourceId}.snapshot.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

async function writePlacements(dir: string, records: PlacementRecord[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "placements.json"), `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
