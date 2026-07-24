import { dePack } from "./de.js";
import { enPack } from "./en.js";
import { frPack } from "./fr.js";
import { itPack } from "./it.js";
import type { DepartmentAlias, LanguagePack, PackLanguage } from "./types.js";

export type { DepartmentAlias, LanguagePack, PackLanguage };

export const languagePacks = [dePack, frPack, itPack, enPack] as const;

export function getLanguagePack(language: PackLanguage): LanguagePack {
  return languagePacks.find((pack) => pack.language === language) ?? dePack;
}

export function detectLanguageFromText(text: string): PackLanguage {
  const normalized = normalizeForMatching(text);
  const scores = languagePacks.map((pack) => ({
    language: pack.language,
    score:
      countMatches(normalized, pack.roleKeywords) +
      countMatches(normalized, pack.applicationKeywords) +
      countMatches(normalized, pack.availabilityKeywords) +
      countMatches(normalized, pack.unavailableKeywords) +
      pack.departmentAliases.reduce(
        (total, alias) => total + countMatches(normalized, alias.names),
        0,
      ),
  }));

  return scores.sort((left, right) => right.score - left.score)[0]?.language ?? "de";
}

export function allDepartmentAliases(): DepartmentAlias[] {
  const aliases = new Map<string, DepartmentAlias>();

  for (const pack of languagePacks) {
    for (const alias of pack.departmentAliases) {
      const existing = aliases.get(alias.normalized);
      aliases.set(alias.normalized, {
        normalized: alias.normalized,
        names: [...(existing?.names ?? []), ...alias.names],
      });
    }
  }

  return [...aliases.values()];
}

export function normalizeDepartmentName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeForMatching(value);
  const alias = allDepartmentAliases().find((candidate) =>
    candidate.names.some((name) => normalizeForMatching(name) === normalizedValue),
  );

  if (alias) {
    return alias.normalized;
  }

  return normalizedValue.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => text.includes(normalizeForMatching(keyword))).length;
}
