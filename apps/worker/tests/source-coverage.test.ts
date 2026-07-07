import type { SourceRegistryEntry } from "@scpi/schema";
import { describe, expect, it } from "vitest";
import { buildSourceCoverageReport } from "../src/source-coverage.js";

describe("source coverage report", () => {
  it("summarizes source registry coverage and manual verification queues", () => {
    const report = buildSourceCoverageReport(
      [
        source({
          id: "de-source",
          canton: "ZH",
          language: "de",
          sourceLanguage: "de",
          region: "de-CH",
          status: "candidate",
          priority: 1,
        }),
        source({
          id: "fr-source",
          canton: "VD",
          language: "fr",
          sourceLanguage: "fr",
          region: "fr-CH",
          status: "needs-review",
          priority: 2,
          fetchMode: "pdf",
        }),
      ],
      "2026-07-07T08:00:00.000Z",
    );

    expect(report).toMatchObject({
      sourceCount: 2,
      urlCount: 2,
      countsByCanton: {
        VD: 1,
        ZH: 1,
      },
      countsByLanguage: {
        de: 1,
        fr: 1,
      },
      countsByRegion: {
        "de-CH": 1,
        "fr-CH": 1,
      },
      countsByStatus: {
        candidate: 1,
        "needs-review": 1,
      },
      countsByPriority: {
        "1": 1,
        "2": 1,
      },
    });
    expect(report.manualVerificationSources).toHaveLength(2);
    expect(report.specialFetchModeSources).toHaveLength(1);
    expect(report.specialFetchModeSources[0]?.fetchModes).toEqual(["pdf"]);
  });
});

function source(
  overrides: Partial<SourceRegistryEntry> & {
    id: string;
    canton: SourceRegistryEntry["canton"];
    language: SourceRegistryEntry["language"];
    sourceLanguage: SourceRegistryEntry["sourceLanguage"];
    region: SourceRegistryEntry["region"];
    status: SourceRegistryEntry["status"];
    priority: SourceRegistryEntry["priority"];
    fetchMode?: SourceRegistryEntry["sourceUrls"][number]["fetchMode"];
  },
): SourceRegistryEntry {
  return {
    id: overrides.id,
    institutionName: "Example Hospital",
    institutionType: "hospital",
    canton: overrides.canton,
    city: "Example",
    language: overrides.language,
    sourceLanguage: overrides.sourceLanguage,
    region: overrides.region,
    country: "CH",
    sourceUrls: [
      {
        url: `https://example.ch/${overrides.id}`,
        pageType: "hospital-placement-page",
        expectedParser: "generic",
        fetchMode: overrides.fetchMode ?? "html",
      },
    ],
    notes: "Synthetic source for coverage report tests.",
    priority: overrides.priority,
    status: overrides.status,
    ...overrides,
  };
}
