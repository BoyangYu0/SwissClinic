import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type SourceRegistryEntry, SourceRegistrySchema } from "@scpi/schema";
import { isCollection, parseDocument } from "yaml";

const defaultSourcesPath = fileURLToPath(new URL("../sources.yaml", import.meta.url));

export async function loadSources(path = defaultSourcesPath): Promise<SourceRegistryEntry[]> {
  let fileContents: string;

  try {
    fileContents = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Could not read source registry at "${path}": ${formatError(error)}`);
  }

  const parsedYaml = parseYamlRegistry(fileContents, path);
  const validationResult = SourceRegistrySchema.safeParse(parsedYaml);

  if (!validationResult.success) {
    const messages = validationResult.error.issues
      .map((issue) => `- ${formatPath(issue.path)}: ${issue.message}`)
      .join("\n");
    throw new Error(`Source registry validation failed for "${path}":\n${messages}`);
  }

  return validationResult.data;
}

function parseYamlRegistry(fileContents: string, path: string): unknown {
  const document = parseDocument(fileContents, { prettyErrors: true });

  if (document.errors.length > 0) {
    const messages = document.errors.map((error) => error.message).join("; ");
    throw new Error(`Source registry YAML could not be parsed at "${path}": ${messages}`);
  }

  if (!isCollection(document.contents)) {
    throw new Error(`Source registry YAML at "${path}" must contain a list of source entries.`);
  }

  return document.toJS();
}

function formatPath(path: Array<PropertyKey>): string {
  if (path.length === 0) {
    return "registry";
  }

  return path
    .map((part, index) => {
      if (typeof part !== "number") {
        return String(part);
      }

      return path[index - 1] === "sourceUrls" ? `URL ${part + 1}` : `entry ${part + 1}`;
    })
    .join(".");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
