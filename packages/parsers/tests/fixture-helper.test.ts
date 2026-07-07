import { describe, expect, it } from "vitest";
import { genericParser } from "../src/index.js";
import { runParserFixtureTest } from "./helpers/runParserFixtureTest.js";

const genericFixture = new URL("../fixtures/generic/explicit-date.html", import.meta.url);

describe("runParserFixtureTest", () => {
  it("works on a generic parser fixture", async () => {
    const result = await runParserFixtureTest({
      parser: genericParser,
      fixturePath: genericFixture,
      sourceId: "generic-explicit-date",
      url: "https://example.ch/unterassistenz",
      expectedResult: {
        parserName: "generic",
        confidence: "medium",
      },
      expectedRecords: [
        {
          sourceId: "generic-explicit-date",
          institutionName: "Spital Beispiel",
          department: "Innere Medizin",
          roleType: "Unterassistenz",
          availabilityStatus: "available-from",
          availableFrom: "2027-07",
          applicationMethod: "online-form",
          applicationUrl: "https://example.ch/bewerbung",
          confidence: "medium",
          reviewStatus: "needs-human-review",
        },
      ],
      expectedWarnings: [/Generic parser output .* needs human review/],
    });

    expect(result.records[0]?.extractedSnippet).toContain("Innere Medizin");
  });

  it("reports readable diffs when fixture expectations miss", async () => {
    let thrown: unknown;

    try {
      await runParserFixtureTest({
        parser: genericParser,
        fixturePath: genericFixture,
        expectedRecords: [
          {
            department: "Chirurgie",
          },
        ],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Parser fixture mismatch");
    expect((thrown as Error).message).toContain("generic");
    expect((thrown as Error).message).toContain("Records:");
    expect((thrown as Error).message).toContain("Innere Medizin");
  });
});
