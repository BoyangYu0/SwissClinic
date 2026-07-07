import { genericParser } from "./generic.js";
import { ksaParser } from "./ksa.js";
import { ksbParser } from "./ksb.js";
import { ksgrParser } from "./ksgr.js";
import { kssgParser } from "./kssg.js";
import { kswParser } from "./ksw.js";
import type { ParsedPage, ParserResult, SourceParser } from "./types.js";
import { uszParser } from "./usz.js";

export const parsers: SourceParser[] = [
  uszParser,
  kswParser,
  ksaParser,
  ksbParser,
  kssgParser,
  ksgrParser,
  genericParser,
];

export function selectParser(
  input: ParsedPage,
  availableParsers: SourceParser[] = parsers,
): SourceParser {
  const generic = findParser("generic", availableParsers) ?? genericParser;
  const siteParser = availableParsers.find(
    (parser) =>
      parser.id !== "generic" && parser.id !== input.expectedParser && parser.match(input),
  );

  if (siteParser) {
    return siteParser;
  }

  if (input.expectedParser) {
    const configuredParser = findParser(input.expectedParser, availableParsers);

    if (configuredParser) {
      return configuredParser;
    }
  }

  return generic;
}

export async function parsePage(
  input: ParsedPage,
  availableParsers: SourceParser[] = parsers,
): Promise<ParserResult> {
  const parser = selectParser(input, availableParsers);
  const result = await parser.parse(input);

  if (result.records.length > 0) {
    return result;
  }

  return {
    ...result,
    confidence: "low",
    warnings:
      result.warnings.length > 0
        ? result.warnings
        : [
            `Parser ${parser.id} returned no placement records for ${input.url}; human review is needed.`,
          ],
  };
}

function findParser(id: string, availableParsers: SourceParser[]): SourceParser | undefined {
  return availableParsers.find((parser) => parser.id === id);
}
