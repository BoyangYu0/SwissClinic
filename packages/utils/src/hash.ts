import { createHash } from "node:crypto";

export function hashString(input: string): string {
  return sha256(normalizeHashText(input));
}

export function hashObject(input: unknown): string {
  return sha256(stableStringify(input));
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeHashText(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
