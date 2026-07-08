import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const templateDir = join(process.cwd(), "..", "..", ".github", "ISSUE_TEMPLATE");
const requiredTemplates = [
  "structured-feedback.yml",
  "report-wrong-data.yml",
  "add-source.yml",
  "parser-bug.yml",
];
const feedbackLabels = [
  "Wrong availability",
  "Wrong department",
  "Wrong application link",
  "Missing hospital/source",
  "Irrelevant source",
  "Broken source URL",
  "Wrong language/region",
  "Parser bug",
  "Other",
];

describe("GitHub issue templates", () => {
  it("defines the static feedback templates used by Phase I", async () => {
    const files = await readdir(templateDir);

    for (const template of requiredTemplates) {
      expect(files).toContain(template);
    }
  });

  it("keeps all structured feedback categories available", async () => {
    const template = await readFile(join(templateDir, "structured-feedback.yml"), "utf8");

    for (const label of feedbackLabels) {
      expect(template).toContain(`- ${label}`);
    }
  });

  it("keeps templates valid enough for GitHub issue forms and privacy-safe", async () => {
    for (const template of requiredTemplates) {
      const content = await readFile(join(templateDir, template), "utf8");

      expect(content).toContain("name:");
      expect(content).toContain("description:");
      expect(content).toContain("body:");
      expect(content).toContain("validations:");
      expect(content).not.toMatch(/\t/);
      expect(content).not.toMatch(/email address|phone number|full name/i);
      expect(content).toMatch(/Do not (paste|submit|include) private/i);
    }
  });
});
