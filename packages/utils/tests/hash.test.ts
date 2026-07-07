import { describe, expect, it } from "vitest";
import { hashObject, hashString } from "../src/hash.js";

describe("hash utilities", () => {
  it("produces the same hash for the same string input", () => {
    expect(hashString("Unterassistenz Innere Medizin")).toBe(
      hashString("Unterassistenz Innere Medizin"),
    );
  });

  it("normalizes whitespace before hashing text", () => {
    expect(hashString("Unterassistenz\n\nInnere\tMedizin")).toBe(
      hashString(" Unterassistenz Innere Medizin "),
    );
  });

  it("hashes objects independent of key order", () => {
    expect(hashObject({ status: "available", department: "Medizin" })).toBe(
      hashObject({ department: "Medizin", status: "available" }),
    );
  });

  it("changes object hashes when values change", () => {
    expect(hashObject({ status: "available" })).not.toBe(
      hashObject({ status: "fully-booked-until" }),
    );
  });
});
