import * as cheerio from "cheerio";

export interface ExtractedLink {
  text: string;
  href: string;
}

export interface ExtractedTable {
  caption: string | null;
  headers: string[];
  rows: string[][];
}

export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("title").first().text());
  return title.length > 0 ? title : null;
}

export function extractVisibleText(html: string): string {
  const $ = loadCleanDocument(html);
  return normalizeWhitespace($("body").text());
}

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const $ = loadCleanDocument(html);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const rawHref = $(element).attr("href")?.trim();
    const text = normalizeWhitespace($(element).text());

    if (!rawHref || !text) {
      return;
    }

    const href = resolveHttpUrl(rawHref, baseUrl);

    if (!href || seen.has(href)) {
      return;
    }

    seen.add(href);
    links.push({ text, href });
  });

  return links;
}

export function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const emails = new Set<string>();

  for (const match of matches) {
    const email = match.replace(/[),.;:]+$/g, "").toLowerCase();

    if (isLikelyAssetPath(email)) {
      continue;
    }

    emails.add(email);
  }

  return [...emails].sort();
}

export function extractTables(html: string): ExtractedTable[] {
  const $ = loadCleanDocument(html);
  const tables: ExtractedTable[] = [];

  $("table").each((_, table) => {
    const tableElement = $(table);
    const caption = nullableText(tableElement.find("caption").first().text());
    const firstRow = tableElement.find("tr").first();
    const headers = firstRow
      .find("th")
      .toArray()
      .map((header) => normalizeWhitespace($(header).text()))
      .filter(Boolean);
    const rows: string[][] = [];

    tableElement.find("tr").each((_, row) => {
      const rowElement = $(row);
      const cells = rowElement
        .find("td")
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()))
        .filter(Boolean);

      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    if (caption || headers.length > 0 || rows.length > 0) {
      tables.push({ caption, headers, rows });
    }
  });

  return tables;
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadCleanDocument(html: string): cheerio.CheerioAPI {
  const $ = cheerio.load(html);

  $("script, style, noscript, template, nav, footer, header, aside").remove();
  $("[hidden], [aria-hidden='true'], [role='navigation'], [role='banner']").remove();
  $("[style]").each((_, element) => {
    const style = $(element).attr("style")?.toLowerCase() ?? "";

    if (style.includes("display:none") || style.includes("display: none")) {
      $(element).remove();
      return;
    }

    if (style.includes("visibility:hidden") || style.includes("visibility: hidden")) {
      $(element).remove();
    }
  });

  $("*").each((_, element) => {
    if (!("tagName" in element)) {
      return;
    }

    const elementName = element.tagName.toLowerCase();

    if (["html", "body", "main", "article"].includes(elementName)) {
      return;
    }

    if ($(element).find("main, article").length > 0) {
      return;
    }

    const marker = [
      $(element).attr("id"),
      $(element).attr("class"),
      $(element).attr("role"),
      $(element).attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (shouldRemoveChromeElement($, element, marker)) {
      $(element).remove();
    }
  });

  return $;
}

function shouldRemoveChromeElement(
  $: cheerio.CheerioAPI,
  element: Parameters<cheerio.CheerioAPI>[0],
  marker: string,
): boolean {
  if (marker.includes("cookie") || marker.includes("consent") || marker.includes("tracking")) {
    return true;
  }

  if (!isChromeMarker(marker)) {
    return false;
  }

  return normalizeWhitespace($(element).text()).length <= 1_200;
}

function isChromeMarker(marker: string): boolean {
  return ["breadcrumb", "main-menu", "navigation", "navbar", "site-menu"].some((term) =>
    marker.includes(term),
  );
}

function resolveHttpUrl(rawHref: string, baseUrl: string): string | null {
  try {
    const url = new URL(rawHref, baseUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function nullableText(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  return normalized.length > 0 ? normalized : null;
}

function isLikelyAssetPath(value: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(value);
}
