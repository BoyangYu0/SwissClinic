import { type PlacementRecord, PlacementRecordSchema } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import {
  ksaParser,
  ksgrParser,
  kssgParser,
  kswParser,
  parsePage,
  uszParser,
} from "../src/index.js";
import { runParserFixtureTest } from "./helpers/runParserFixtureTest.js";

describe("institution parsers", () => {
  it("extracts USZ neuroradiology availability and application links", async () => {
    const result = await runParserFixtureTest({
      parser: uszParser,
      fixturePath: new URL("../fixtures/usz/neuroradiologie.html", import.meta.url),
      sourceId: "usz-zuerich-neuroradiologie-unterassistenzen-famulatur",
      url: "https://www.usz.ch/bildung/aerzte/medizinstudium/unterassistenzen-famulatur-der-klinik-fuer-neuroradiologie/",
      expectedResult: {
        parserName: "usz",
        confidence: "high",
      },
      expectedRecords: [
        {
          institutionName: "Universitätsspital Zürich",
          department: "Neuroradiologie",
          originalDepartmentName: "Neuroradiologie",
          departmentNormalized: "neuroradiology",
          roleType: "Unterassistenz",
          canton: "ZH",
          city: "Zürich",
          availabilityStatus: "available",
          availableFrom: null,
          fullyBookedUntil: null,
          durationMinWeeks: 4,
          durationMaxWeeks: 16,
          applicationMethod: "external-platform",
          applicationUrl: "https://job.usz.ch/job-invite/50370/",
          contactEmail: "barbara.gilgen@usz.ch",
          contactName: "Barbara Gilgen",
          housing: "yes",
          confidence: "high",
          reviewStatus: "auto-published",
        },
      ],
    });

    expectUsableRecords(result.records);
  });

  it.each([
    ["medizin", "Unterassistenzen Medizin", "Innere Medizin", "internal-medicine"],
    ["chirurgie", "Unterassistenzen Chirurgie", "Chirurgie", "surgery"],
    ["anaesthesiologie", "Unterassistenzen Anästhesiologie", "Anästhesiologie", "anesthesiology"],
    ["frauenheilkunde", "Unterassistenzen Frauenheilkunde", "Frauenheilkunde", "gynecology"],
    ["radiologie", "Unterassistenzen Radiologie", "Radiologie", "radiology"],
  ])("maps the USZ %s page to its own normalized department", async (path, title, department, departmentNormalized) => {
    const result = await uszParser.parse({
      sourceId: `usz-zuerich-${path}-medizinstudium`,
      url: `https://www.usz.ch/bildung/aerzte/medizinstudium/${path}/`,
      title,
      html: `<html><body>${title}</body></html>`,
      visibleText: `${title}. Unterassistenz im Wahlstudienjahr.`,
      links: [],
      emails: [],
      tables: [],
      fetchedAt: "2026-07-24T08:00:00.000Z",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      department,
      originalDepartmentName: department,
      departmentNormalized,
    });
  });

  it("does not turn the USZ medical-studies overview into a department record", async () => {
    const result = await uszParser.parse({
      sourceId: "usz-zuerich-medizinstudium-overview",
      url: "https://www.usz.ch/bildung/aerzte/medizinstudium/",
      title: "Medizinstudium",
      html: "<html><body>Medizinstudium und Unterassistenz</body></html>",
      visibleText: "Medizinstudium und Unterassistenz am Universitätsspital Zürich.",
      links: [],
      emails: [],
      tables: [],
      fetchedAt: "2026-07-24T08:00:00.000Z",
    });

    expect(result.records).toEqual([]);
  });

  it("extracts KSW department records without fabricated availability", async () => {
    const result = await runParserFixtureTest({
      parser: kswParser,
      fixturePath: new URL("../fixtures/ksw/current.html", import.meta.url),
      sourceId: "ksw-winterthur-unterassistenz-famulatur-wahlstudienjahr",
      url: "https://www.ksw.ch/jobs-karriere/ausbildung/unterassistenz-famulatur-wahlstudienjahr/",
      expectedResult: {
        parserName: "ksw",
        confidence: "medium",
      },
      expectedRecords: [
        { department: "Anästhesiologie", availabilityStatus: "not-specified" },
        { department: "Augenheilkunde", availabilityStatus: "application-only" },
        { department: "Frauenheilkunde", availabilityStatus: "application-only" },
        { department: "Chirurgie", availabilityStatus: "not-specified" },
        { department: "Innere Medizin", availabilityStatus: "not-specified" },
        { department: "Radiologie", availabilityStatus: "not-specified" },
        { department: "Pädiatrie", availabilityStatus: "application-only" },
        { department: "Orthopädie", availabilityStatus: "not-specified" },
      ],
      expectedWarnings: [/ksw parser output .* needs human review/],
    });

    expect(result.records.every((record) => record.availableFrom === null)).toBe(true);
    expect(result.records.every((record) => record.fullyBookedUntil === null)).toBe(true);
    expect(result.records.every((record) => record.confidence === "medium")).toBe(true);
    expect(
      result.records.every((record) => record.applicationUrl?.includes("offene-stellen")),
    ).toBe(true);
    expectUsableRecords(result.records);
  });

  it("extracts KSA general rules as low-confidence non-departmental context", async () => {
    const result = await runParserFixtureTest({
      parser: ksaParser,
      fixturePath: new URL("../fixtures/ksa/informationen.html", import.meta.url),
      sourceId: "ksa-aarau-unterassistenz-informationen",
      url: "https://www.ksa.ch/de/kantonsspital-aarau/karriere-bildung/bildung/aerztliche-aus-und-weiterbildung/unterassistenz-stellen/allgemeine-informationen-ua",
      expectedResult: {
        parserName: "ksa",
        confidence: "low",
      },
      expectedRecords: [
        {
          institutionName: "Kantonsspital Aarau",
          department: null,
          availabilityStatus: "not-specified",
          availableFrom: null,
          fullyBookedUntil: null,
          durationMinWeeks: null,
          durationMaxWeeks: null,
          compensation: "CHF 1’500.",
          housing: "yes",
          confidence: "low",
          reviewStatus: "needs-human-review",
        },
      ],
      expectedWarnings: [/ksa parser output .* needs human review/],
    });

    expect(result.records[0]?.eligibilityNotes).toContain("4. Jahr des Medizin-Studiums");
    expectUsableRecords(result.records);
  });

  it("extracts KSSG/H-OCH orthopaedics free positions", async () => {
    const result = await runParserFixtureTest({
      parser: kssgParser,
      fixturePath: new URL("../fixtures/kssg/orthopaedie.html", import.meta.url),
      sourceId: "kssg-stgallen-h-och-orthopaedie-unterassistenzstellen",
      url: "https://www.h-och.ch/orthopaedie-traumatologie/karriere/unterassistenzstellen/",
      expectedResult: {
        parserName: "kssg",
        confidence: "high",
      },
      expectedRecords: [
        {
          institutionName: "Kantonsspital St. Gallen",
          department: "Orthopädie",
          availabilityStatus: "available",
          durationMinWeeks: 4,
          durationMaxWeeks: null,
          applicationMethod: "external-platform",
          applicationUrl: "https://jobs.h-och.ch/job/St_-Gallen-Unterassistentin-2026/1012025401/",
          contactEmail: "klinikmanagerinrahel.vogler@h-och.ch",
          confidence: "high",
          reviewStatus: "auto-published",
        },
      ],
    });

    expectUsableRecords(result.records);
  });

  it("extracts KSGR department records and only department-matched documents", async () => {
    const result = await runParserFixtureTest({
      parser: ksgrParser,
      fixturePath: new URL("../fixtures/ksgr/current.html", import.meta.url),
      sourceId: "ksgr-chur-blockstudenten-unterassistenten",
      url: "https://www.ksgr.ch/aus-und-weiterbildung/blockstudenten-und-unterassistenten",
      expectedResult: {
        parserName: "ksgr",
        confidence: "medium",
      },
      expectedRecords: [
        { department: "Chirurgie" },
        { department: "Innere Medizin" },
        { department: "Pädiatrie", applicationUrl: null },
        { department: "Frauenheilkunde" },
        { department: "Radiologie", applicationUrl: null },
        { department: "Anästhesiologie" },
      ],
      expectedWarnings: [/ksgr parser output .* needs human review/],
    });

    expect(result.records.every((record) => record.availableFrom === null)).toBe(true);
    expect(result.records.every((record) => record.confidence === "medium")).toBe(true);
    expectApplicationUrl(result.records, "Chirurgie", /chirurgie-ksgr\.pdf$/);
    expectApplicationUrl(result.records, "Innere Medizin", /medizin-ksgr\.pdf$/);
    expectApplicationUrl(result.records, "Frauenheilkunde", /frauenklinik-ksgr\.pdf$/);
    expectApplicationUrl(result.records, "Anästhesiologie", /anir-ksgr\.pdf$/);
    expect(
      result.records.find((record) => record.department === "Pädiatrie")?.applicationUrl,
    ).toBeNull();
    expect(
      result.records.find((record) => record.department === "Radiologie")?.applicationUrl,
    ).toBeNull();
    expectUsableRecords(result.records);
  });

  it("selects E5 institution parsers from the default registry", async () => {
    const parsed = await parsePage({
      sourceId: "usz-zuerich-neuroradiologie-unterassistenzen-famulatur",
      url: "https://www.usz.ch/bildung/aerzte/medizinstudium/unterassistenzen-famulatur-der-klinik-fuer-neuroradiologie/",
      title: "Unterassistenzen / Famulatur der Klinik für Neuroradiologie – USZ",
      html: "<html><body>Unterassistenz Neuroradiologie Bewerbung für das Jahr 2027</body></html>",
      visibleText: "Unterassistenz Neuroradiologie Bewerbung für das Jahr 2027",
      links: [{ text: "Bewerbung für das Jahr 2027", href: "https://job.usz.ch/job-invite/1/" }],
      emails: [],
      tables: [],
      fetchedAt: "2026-07-07T08:00:00.000Z",
    });

    expect(parsed.parserName).toBe("usz");
  });
});

function expectUsableRecords(records: PlacementRecord[]): void {
  for (const record of records) {
    expect(() => PlacementRecordSchema.parse(record)).not.toThrow();
    expect(record.extractedSnippet).toBeTruthy();
    expect(record.extractionMethod).toBe("site-parser");
  }
}

function expectApplicationUrl(
  records: PlacementRecord[],
  department: string,
  expected: RegExp,
): void {
  const record = records.find((candidate) => candidate.department === department);
  expect(record?.applicationUrl).toMatch(expected);
}
