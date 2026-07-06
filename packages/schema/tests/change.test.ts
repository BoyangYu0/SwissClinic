import { describe, expect, it } from "vitest";
import type { ChangeRecordInput } from "../src/change.js";
import { ChangeRecordSchema, makeChangeId } from "../src/change.js";

const availabilityChange = {
  sourceId: "ksw-winterthur-unterassistenz-famulatur-wahlstudienjahr",
  url: "https://www.ksw.ch/jobs-karriere/ausbildung/unterassistenz-famulatur-wahlstudienjahr/",
  detectedAt: "2026-07-06T20:00:00.000Z",
  changeType: "availability-changed",
  severity: "review",
  before: { availabilityStatus: "not-specified" },
  after: { availabilityStatus: "available-from", availableFrom: "2027-07" },
  message: "Availability changed from not specified to available from 2027-07.",
} satisfies Omit<ChangeRecordInput, "id">;

describe("ChangeRecordSchema", () => {
  it("accepts an availability change with before and after values", () => {
    const parsed = ChangeRecordSchema.parse({
      ...availabilityChange,
      id: makeChangeId(availabilityChange),
    });

    expect(parsed.changeType).toBe("availability-changed");
  });

  it("generates deterministic change IDs", () => {
    expect(makeChangeId(availabilityChange)).toBe(makeChangeId(availabilityChange));
    expect(makeChangeId(availabilityChange)).toMatch(/^change-[a-f0-9]{16}$/);
  });

  it("requires before and after for availability-changed records", () => {
    const result = ChangeRecordSchema.safeParse({
      ...availabilityChange,
      id: "change-missing-before-after",
      before: null,
      after: null,
    });

    expect(result.success).toBe(false);
  });
});
