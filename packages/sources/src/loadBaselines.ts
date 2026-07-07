import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCollection, parseDocument } from "yaml";

export interface BaselineEntry {
  id: string;
  name: string;
  canton: string;
  city: string;
  type: string;
  sourceUrl: string;
  baselineSource: string;
  notes: string;
}

const defaultBaselinesPath = fileURLToPath(new URL("../baselines", import.meta.url));

export async function loadBaselines(path = defaultBaselinesPath): Promise<BaselineEntry[]> {
  let files: string[];

  try {
    files = await readdir(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw new Error(`Could not read baseline directory at "${path}": ${formatError(error)}`);
  }

  const baselineFiles = files.filter((file) => file.endsWith(".yaml")).sort();
  const entries: BaselineEntry[] = [];

  for (const file of baselineFiles) {
    entries.push(...(await readBaselineFile(join(path, file))));
  }

  return entries;
}

async function readBaselineFile(path: string): Promise<BaselineEntry[]> {
  const document = parseDocument(await readFile(path, "utf8"), { prettyErrors: true });

  if (document.errors.length > 0) {
    const messages = document.errors.map((error) => error.message).join("; ");
    throw new Error(`Baseline YAML could not be parsed at "${path}": ${messages}`);
  }

  if (!isCollection(document.contents)) {
    throw new Error(`Baseline YAML at "${path}" must contain a list.`);
  }

  const entries = document.toJS() as unknown;

  if (!Array.isArray(entries)) {
    throw new Error(`Baseline YAML at "${path}" must contain a list.`);
  }

  return entries.map((entry, index) => validateBaselineEntry(entry, path, index));
}

function validateBaselineEntry(entry: unknown, path: string, index: number): BaselineEntry {
  if (!isRecord(entry)) {
    throw new Error(`Baseline entry ${index + 1} in "${path}" must be an object.`);
  }

  const requiredFields: Array<keyof BaselineEntry> = [
    "id",
    "name",
    "canton",
    "city",
    "type",
    "sourceUrl",
    "baselineSource",
    "notes",
  ];

  for (const field of requiredFields) {
    if (typeof entry[field] !== "string" || entry[field].trim().length === 0) {
      throw new Error(`Baseline entry ${index + 1} in "${path}" is missing ${field}.`);
    }
  }

  return entry as unknown as BaselineEntry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
