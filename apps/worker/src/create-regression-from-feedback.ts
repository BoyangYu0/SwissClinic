import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type FeedbackRecord, FeedbackRecordSchema } from "@scpi/schema";

export interface CreateRegressionFromFeedbackOptions {
  feedbackPath: string;
  outDir: string;
  publicSnippet?: string;
  parserName?: string;
}

export interface RegressionSkeletonResult {
  fixtureDir: string;
  files: string[];
}

export async function createRegressionFromFeedback(
  options: CreateRegressionFromFeedbackOptions,
): Promise<RegressionSkeletonResult> {
  const feedback = FeedbackRecordSchema.parse(
    JSON.parse(await readFile(options.feedbackPath, "utf8")),
  );
  const fixtureName = feedbackFixtureName(feedback);
  const fixtureDir = join(options.outDir, fixtureName);
  const snippet = options.publicSnippet ?? "";
  const files = [
    join(fixtureDir, "feedback.json"),
    join(fixtureDir, "source-snippet.html"),
    join(fixtureDir, "expected-placement.json"),
    join(fixtureDir, "README.md"),
  ];

  await mkdir(fixtureDir, { recursive: true });
  await writeFile(
    files[0] ?? "",
    `${JSON.stringify(redactFeedbackForFixture(feedback), null, 2)}\n`,
    "utf8",
  );
  await writeFile(files[1] ?? "", snippet, "utf8");
  await writeFile(
    files[2] ?? "",
    `${JSON.stringify(expectedPlacementSkeleton(feedback), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    files[3] ?? "",
    regressionReadme(feedback, options.parserName ?? "generic"),
    "utf8",
  );

  return { fixtureDir, files };
}

export function parseCreateRegressionArgs(argv: string[]): CreateRegressionFromFeedbackOptions {
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

  const feedbackPath = requiredPath(baseDir, args, "feedback");

  return {
    feedbackPath,
    outDir:
      optionalPath(baseDir, args.get("out")) ??
      resolve(baseDir, "packages/parsers/fixtures/feedback"),
    publicSnippet: optionalString(args.get("snippet")),
    parserName: optionalString(args.get("parser")),
  };
}

function feedbackFixtureName(feedback: FeedbackRecord): string {
  const subject = feedback.placementId ?? feedback.sourceId ?? "missing-source";
  return `${slug(feedback.feedbackType)}-${slug(subject)}`;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function redactFeedbackForFixture(feedback: FeedbackRecord): FeedbackRecord {
  return {
    ...feedback,
    evidenceNote: stripPrivateAttachmentReferences(feedback.evidenceNote),
  };
}

function stripPrivateAttachmentReferences(value: string | null): string | null {
  if (!value) {
    return value;
  }

  return value
    .split(/\r?\n/)
    .filter((line) => !/private|unredacted|screenshot|attachment|email/i.test(line))
    .join("\n")
    .trim();
}

function expectedPlacementSkeleton(feedback: FeedbackRecord): Record<string, unknown> {
  return {
    placementId: feedback.placementId,
    sourceId: feedback.sourceId,
    feedbackType: feedback.feedbackType,
    institutionName: feedback.institutionName,
    departmentNormalized: feedback.departmentNormalized,
    expectedCorrection: feedback.suggestedValue,
    confidenceSuggested: feedback.confidenceSuggested,
    todo: "Replace this skeleton with concrete expected parser output before enabling a regression test.",
  };
}

function regressionReadme(feedback: FeedbackRecord, parserName: string): string {
  return [
    `# Feedback Regression: ${feedback.feedbackType}`,
    "",
    `Source ID: ${feedback.sourceId ?? "not specified"}`,
    `Placement ID: ${feedback.placementId ?? "not specified"}`,
    `Suggested parser: ${parserName}`,
    "",
    "Maintainer steps:",
    "",
    "1. Replace `source-snippet.html` with the shortest public source fixture that reproduces the issue.",
    "2. Replace `expected-placement.json` with concrete expected parser output.",
    "3. Add or update the parser test that loads this fixture.",
    "4. Fix the parser or source metadata.",
    "5. Rebuild data and confirm the original issue can be closed.",
    "",
    "Do not add private emails, patient data, login-only pages, or unredacted screenshots.",
    "",
  ].join("\n");
}

function requiredPath(baseDir: string, args: Map<string, string | true>, name: string): string {
  const value = args.get(name);

  if (typeof value !== "string") {
    throw new Error(`Missing required --${name} path.`);
  }

  return resolve(baseDir, value);
}

function optionalPath(baseDir: string, value: string | true | undefined): string | undefined {
  return typeof value === "string" ? resolve(baseDir, value) : undefined;
}

function optionalString(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const result = await createRegressionFromFeedback(
    parseCreateRegressionArgs(process.argv.slice(2)),
  );
  console.log(`Created feedback regression skeleton: ${result.fixtureDir}`);
  for (const file of result.files) {
    console.log(`- ${basename(file)}`);
  }
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
