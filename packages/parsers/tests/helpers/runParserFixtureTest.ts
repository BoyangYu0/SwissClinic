import { readFile } from "node:fs/promises";
import { inspect } from "node:util";
import { type PlacementRecord, PlacementRecordSchema } from "@scpi/schema";
import {
  extractEmails,
  extractLinks,
  extractTables,
  extractTitle,
  extractVisibleText,
} from "@scpi/utils";
import { expect } from "vitest";
import type { ParsedPage, ParserResult, SourceParser } from "../../src/types.js";

export interface ParserFixtureTestOptions {
  parser: SourceParser;
  fixturePath: string | URL;
  sourceId?: string;
  url?: string;
  fetchedAt?: string;
  page?: Partial<ParsedPage>;
  expectedRecords?: Array<Partial<PlacementRecord>>;
  expectedWarnings?: Array<string | RegExp>;
  expectedResult?: Partial<Pick<ParserResult, "parserName" | "confidence">>;
}

export async function runParserFixtureTest(
  options: ParserFixtureTestOptions,
): Promise<ParserResult> {
  const html = await readFile(options.fixturePath, "utf8");
  const url = options.url ?? "https://example.ch/parser-fixture";
  const visibleText = extractVisibleText(html);
  const page: ParsedPage = {
    sourceId: options.sourceId ?? "fixture-source",
    url,
    title: extractTitle(html),
    html,
    visibleText,
    links: extractLinks(html, url),
    emails: extractEmails(visibleText),
    tables: extractTables(html),
    fetchedAt: options.fetchedAt ?? "2026-07-07T08:00:00.000Z",
    ...options.page,
  };

  const result = await options.parser.parse(page);
  const records = result.records.map((record) => PlacementRecordSchema.parse(record));

  try {
    if (options.expectedResult) {
      expect(result).toMatchObject(options.expectedResult);
    }

    if (options.expectedRecords) {
      expect(records).toHaveLength(options.expectedRecords.length);
      for (const [index, expectedRecord] of options.expectedRecords.entries()) {
        expect(records[index]).toMatchObject(expectedRecord);
      }
    }

    if (options.expectedWarnings) {
      for (const expectedWarning of options.expectedWarnings) {
        if (typeof expectedWarning === "string") {
          expect(result.warnings).toContain(expectedWarning);
        } else {
          expect(result.warnings.some((warning) => expectedWarning.test(warning))).toBe(true);
        }
      }
    }
  } catch (error) {
    throw new Error(formatFixtureFailure(options, result, records), { cause: error });
  }

  return { ...result, records };
}

function formatFixtureFailure(
  options: ParserFixtureTestOptions,
  result: ParserResult,
  records: PlacementRecord[],
): string {
  return [
    `Parser fixture mismatch for ${String(options.fixturePath)} using ${options.parser.id}.`,
    `Result: ${inspect({ parserName: result.parserName, confidence: result.confidence, warnings: result.warnings }, { depth: null })}`,
    `Records: ${inspect(records.map(summarizeRecord), { depth: null })}`,
  ].join("\n");
}

function summarizeRecord(record: PlacementRecord): Record<string, unknown> {
  return {
    sourceId: record.sourceId,
    department: record.department,
    roleType: record.roleType,
    availabilityStatus: record.availabilityStatus,
    availableFrom: record.availableFrom,
    fullyBookedUntil: record.fullyBookedUntil,
    durationMinWeeks: record.durationMinWeeks,
    durationMaxWeeks: record.durationMaxWeeks,
    applicationMethod: record.applicationMethod,
    applicationUrl: record.applicationUrl,
    contactEmail: record.contactEmail,
    confidence: record.confidence,
    warnings: record.warnings,
  };
}
