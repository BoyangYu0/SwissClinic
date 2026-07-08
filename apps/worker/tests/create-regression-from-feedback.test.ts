import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRegressionFromFeedback } from "../src/create-regression-from-feedback.js";

const acceptedFeedback = {
  id: "feedback-1",
  placementId: "placement-1",
  sourceId: "source-1",
  submittedAt: "2026-07-08T10:00:00.000Z",
  submittedByRole: "medical-student",
  feedbackType: "parser-bug",
  institutionName: "Example Hospital",
  departmentNormalized: "internal-medicine",
  currentValue: "available",
  suggestedValue: "fully-booked-until 2027-12",
  evidenceType: "official-source",
  evidenceUrl: "https://example.ch/placement",
  evidenceNote: "Public page says fully booked.\nPrivate email screenshot was also mentioned.",
  confidenceSuggested: "low",
  status: "accepted",
  reviewerNote: "Accepted because the official public page contradicts the parser output.",
};

describe("createRegressionFromFeedback", () => {
  it("creates a public fixture skeleton from accepted feedback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scpi-feedback-"));
    const feedbackPath = join(dir, "feedback.json");
    const outDir = join(dir, "fixtures");

    await writeFile(feedbackPath, JSON.stringify(acceptedFeedback), "utf8");

    const result = await createRegressionFromFeedback({
      feedbackPath,
      outDir,
      publicSnippet: "<main>Fully booked until December 2027.</main>",
      parserName: "generic",
    });

    const feedbackJson = await readFile(join(result.fixtureDir, "feedback.json"), "utf8");
    const snippet = await readFile(join(result.fixtureDir, "source-snippet.html"), "utf8");
    const expected = await readFile(join(result.fixtureDir, "expected-placement.json"), "utf8");
    const readme = await readFile(join(result.fixtureDir, "README.md"), "utf8");

    expect(result.fixtureDir).toContain("parser-bug-placement-1");
    expect(snippet).toContain("Fully booked until December 2027.");
    expect(expected).toContain("Replace this skeleton with concrete expected parser output");
    expect(readme).toContain("Do not add private emails");
    expect(feedbackJson).not.toContain("Private email screenshot");
  });

  it("rejects feedback that has not been accepted with maintainer notes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scpi-feedback-"));
    const feedbackPath = join(dir, "feedback.json");

    await writeFile(
      feedbackPath,
      JSON.stringify({ ...acceptedFeedback, status: "accepted", reviewerNote: "" }),
      "utf8",
    );

    await expect(createRegressionFromFeedback({ feedbackPath, outDir: dir })).rejects.toThrow(
      "accepted feedback requires a reviewerNote",
    );
  });
});
