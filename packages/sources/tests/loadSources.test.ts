import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSources } from "../src/loadSources.js";

const validYaml = `
- id: luks-luzern-medizin
  institutionName: "Luzerner Kantonsspital"
  institutionType: "hospital"
  canton: "LU"
  city: "Luzern"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "https://example.org/unterassistenz"
      pageType: "hospital-placement-page"
      expectedParser: "generic"
      fetchMode: "html"
  notes: "Initial placeholder; verify manually."
  priority: 1
  status: "candidate"
`;

describe("loadSources", () => {
  it("loads the checked-in candidate source registry", async () => {
    const sources = await loadSources();
    const urlCount = sources.reduce((count, source) => count + source.sourceUrls.length, 0);

    expect(urlCount).toBeGreaterThanOrEqual(45);
  });

  it("requires candidate entries in the checked-in registry to explain why they are included", async () => {
    const sources = await loadSources();
    const candidatesWithoutUsefulNotes = sources.filter(
      (source) => source.status === "candidate" && source.notes.trim().length < 20,
    );

    expect(candidatesWithoutUsefulNotes).toEqual([]);
  });

  it("requires non-German checked-in sources to include concrete language and region metadata", async () => {
    const sources = await loadSources();
    const nonGermanWithoutMetadata = sources.filter(
      (source) =>
        source.language !== "de" &&
        (source.sourceLanguage === "unknown" || source.region === "unknown"),
    );

    expect(nonGermanWithoutMetadata).toEqual([]);
  });

  it("fails with readable messages for invalid language and region metadata", async () => {
    const invalidYaml = validYaml
      .replace('language: "de"', 'language: "es"')
      .replace('region: "de-CH"', 'region: "es-CH"');
    const filePath = await writeFixture("invalid-language-region.yaml", invalidYaml);

    await expect(loadSources(filePath)).rejects.toThrow(/language|region/);
  });

  it("loads a valid source registry fixture", async () => {
    const filePath = await writeFixture("valid.yaml", validYaml);

    await expect(loadSources(filePath)).resolves.toHaveLength(1);
  });

  it("fails with a readable message for duplicate IDs", async () => {
    const filePath = await writeFixture("duplicate-ids.yaml", `${validYaml}\n${validYaml}`);

    await expect(loadSources(filePath)).rejects.toThrow(/Duplicate source id/);
  });

  it("fails with a readable message for duplicate URLs", async () => {
    const duplicateUrlYaml = `
- id: luks-luzern-medizin
  institutionName: "Luzerner Kantonsspital"
  institutionType: "hospital"
  canton: "LU"
  city: "Luzern"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "https://example.org/unterassistenz"
      pageType: "hospital-placement-page"
      expectedParser: "generic"
      fetchMode: "html"
  notes: "Initial placeholder; verify manually."
  priority: 1
  status: "candidate"
- id: usz-zuerich-medizin
  institutionName: "Universitaetsspital Zuerich"
  institutionType: "hospital"
  canton: "ZH"
  city: "Zuerich"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "https://example.org/unterassistenz"
      pageType: "hospital-placement-page"
      expectedParser: "generic"
      fetchMode: "html"
  notes: "Second placeholder with duplicate URL for validation."
  priority: 1
  status: "candidate"
`;
    const filePath = await writeFixture("duplicate-urls.yaml", duplicateUrlYaml);

    await expect(loadSources(filePath)).rejects.toThrow(/Duplicate source URL/);
  });

  it("describes nested validation paths in maintainer-friendly language", async () => {
    const invalidUrlYaml = validYaml.replace(
      "https://example.org/unterassistenz",
      "not-a-valid-url",
    );
    const filePath = await writeFixture("invalid-url.yaml", invalidUrlYaml);

    await expect(loadSources(filePath)).rejects.toThrow(/entry 1\.sourceUrls\.URL 1\.url/);
  });

  it("fails with a readable message for invalid YAML", async () => {
    const filePath = await writeFixture("invalid.yaml", "- id: broken\n  institutionName: [");

    await expect(loadSources(filePath)).rejects.toThrow(/YAML could not be parsed/);
  });

  it("fails with a readable message for missing files", async () => {
    await expect(loadSources(join(tmpdir(), "missing-source-registry.yaml"))).rejects.toThrow(
      /Could not read source registry/,
    );
  });
});

async function writeFixture(fileName: string, contents: string): Promise<string> {
  const directory = join(tmpdir(), `scpi-sources-tests-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const filePath = join(directory, fileName);
  await writeFile(filePath, contents.trimStart(), "utf8");
  return filePath;
}
