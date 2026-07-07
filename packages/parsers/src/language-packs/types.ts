export type PackLanguage = "de" | "fr" | "it" | "en";

export interface DepartmentAlias {
  normalized: string;
  names: string[];
}

export interface LanguagePack {
  language: PackLanguage;
  roleKeywords: string[];
  applicationKeywords: string[];
  availabilityKeywords: string[];
  unavailableKeywords: string[];
  monthNames: Record<string, string>;
  durationPatterns: RegExp[];
  leadTimePatterns: RegExp[];
  departmentAliases: DepartmentAlias[];
}
