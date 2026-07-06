import { describe, expect, it } from "vitest";
import { SnapshotRecordSchema } from "../src/snapshot.js";

const realFixture = {
  sourceId: "ksw-winterthur-unterassistenz-famulatur-wahlstudienjahr",
  url: "https://www.ksw.ch/jobs-karriere/ausbildung/unterassistenz-famulatur-wahlstudienjahr/",
  fetchedAt: "2026-07-06T20:00:00.000Z",
  statusCode: 200,
  contentType: "text/html; charset=UTF-8",
  rawHash: "sha256:raw-ksw-fixture",
  textHash: "sha256:text-ksw-fixture",
  title: "Unterassistenz, Famulatur, Wahlstudienjahr",
  visibleText: "Unterassistenz, Famulatur und Wahlstudienjahr am Kantonsspital Winterthur.",
  extractedLinks: [
    {
      text: "KSW Ausbildung",
      href: "https://www.ksw.ch/jobs-karriere/ausbildung/",
    },
  ],
  extractedEmails: ["ausbildung@example.org"],
  fetchModeUsed: "html",
  error: null,
};

describe("SnapshotRecordSchema", () => {
  it("validates a real-world style source snapshot fixture", () => {
    const parsed = SnapshotRecordSchema.parse(realFixture);

    expect(parsed.sourceId).toBe("ksw-winterthur-unterassistenz-famulatur-wahlstudienjahr");
  });

  it("rejects invalid extracted links", () => {
    const result = SnapshotRecordSchema.safeParse({
      ...realFixture,
      extractedLinks: [{ text: "Broken", href: "not-a-url" }],
    });

    expect(result.success).toBe(false);
  });
});
