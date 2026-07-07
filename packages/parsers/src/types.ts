import type { PlacementRecord } from "@scpi/schema";
import type { ExtractedLink, ExtractedTable } from "@scpi/utils";

export interface ParsedPage {
  sourceId: string;
  url: string;
  title: string | null;
  html: string;
  visibleText: string;
  links: ExtractedLink[];
  emails: string[];
  tables: ExtractedTable[];
  fetchedAt: string;
  expectedParser?: string | null;
  sourceLanguage?: "de" | "fr" | "it" | "en" | "mixed" | "unknown";
  region?: "de-CH" | "fr-CH" | "it-CH" | "mixed" | "unknown";
}

export interface ParserResult {
  records: PlacementRecord[];
  warnings: string[];
  parserName: string;
  confidence: "high" | "medium" | "low";
}

export interface SourceParser {
  id: string;
  match(input: ParsedPage): boolean;
  parse(input: ParsedPage): Promise<ParserResult>;
}
