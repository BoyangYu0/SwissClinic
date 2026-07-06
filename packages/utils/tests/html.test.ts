import { describe, expect, it } from "vitest";
import {
  extractEmails,
  extractLinks,
  extractTables,
  extractTitle,
  extractVisibleText,
  normalizeWhitespace,
} from "../src/html.js";

const fixtureHtml = `
<!doctype html>
<html lang="de">
  <head>
    <title> Unterassistenz Innere Medizin | Spital Beispiel </title>
    <style>.hidden { display: none; }</style>
    <script>window.analytics = true;</script>
  </head>
  <body>
    <header>Was suchen Sie? Folgen Sie uns auf Social Media</header>
    <nav>
      <a href="/start">Startseite</a>
      <a href="/jobs">Jobs</a>
    </nav>
    <div class="breadcrumb navigation">Startseite Karriere Bildung</div>
    <div id="cookie-banner">Cookies akzeptieren</div>
    <main>
      <h1>Unterassistenz Innere Medizin</h1>
      <p>
        Bewerbungen fuer das Wahlstudienjahr sind ab Juli 2027 moeglich.
        Kontakt: ua.koordination@example-spital.ch.
      </p>
      <p style="display: none">Versteckter interner Hinweis</p>
      <p hidden>Unsichtbarer Text</p>
      <p aria-hidden="true">Screenreader versteckter Text</p>
      <a href="/studium/unterassistenz">Bewerbungsinformationen</a>
      <a href="https://example-spital.ch/kontakt#team">Team Kontakt</a>
      <a href="mailto:ua.koordination@example-spital.ch">E-Mail</a>
      <table>
        <caption>Verfuegbarkeit</caption>
        <thead>
          <tr>
            <th>Departement</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Innere Medizin</td>
            <td>ab Juli 2027</td>
          </tr>
          <tr>
            <td>Chirurgie</td>
            <td>ausgebucht</td>
          </tr>
        </tbody>
      </table>
    </main>
    <footer>Impressum Datenschutz Newsletter</footer>
  </body>
</html>
`;

describe("html utilities", () => {
  it("extracts and normalizes the document title", () => {
    expect(extractTitle(fixtureHtml)).toBe("Unterassistenz Innere Medizin | Spital Beispiel");
  });

  it("returns null when no title text exists", () => {
    expect(extractTitle("<html><head><title> </title></head></html>")).toBeNull();
  });

  it("extracts visible text while removing navigation, footer, scripts, cookies, and hidden content", () => {
    const text = extractVisibleText(fixtureHtml);

    expect(text).toContain("Unterassistenz Innere Medizin");
    expect(text).toContain("Bewerbungen fuer das Wahlstudienjahr");
    expect(text).toContain("Innere Medizin ab Juli 2027");
    expect(text).not.toContain("Startseite");
    expect(text).not.toContain("Was suchen Sie?");
    expect(text).not.toContain("Karriere Bildung");
    expect(text).not.toContain("Cookies akzeptieren");
    expect(text).not.toContain("Versteckter interner Hinweis");
    expect(text).not.toContain("Impressum Datenschutz Newsletter");
    expect(text).not.toContain("window.analytics");
  });

  it("resolves HTTP links against a base URL and skips mailto links", () => {
    expect(extractLinks(fixtureHtml, "https://example-spital.ch/bildung/")).toEqual([
      {
        text: "Bewerbungsinformationen",
        href: "https://example-spital.ch/studium/unterassistenz",
      },
      {
        text: "Team Kontakt",
        href: "https://example-spital.ch/kontakt",
      },
    ]);
  });

  it("extracts unique lowercase email addresses from text", () => {
    expect(
      extractEmails(
        "Kontakt UA.Koordination@Example-Spital.ch oder ua.koordination@example-spital.ch.",
      ),
    ).toEqual(["ua.koordination@example-spital.ch"]);
  });

  it("extracts simple table captions, headers, and rows", () => {
    expect(extractTables(fixtureHtml)).toEqual([
      {
        caption: "Verfuegbarkeit",
        headers: ["Departement", "Status"],
        rows: [
          ["Innere Medizin", "ab Juli 2027"],
          ["Chirurgie", "ausgebucht"],
        ],
      },
    ]);
  });

  it("normalizes repeated whitespace and non-breaking spaces", () => {
    expect(normalizeWhitespace("  Unterassistenz\u00a0\n\t Innere   Medizin  ")).toBe(
      "Unterassistenz Innere Medizin",
    );
  });
});
