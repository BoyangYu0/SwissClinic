# Swiss Clinical Placement Index — Codex Execution Plan

This document is designed for step-by-step execution by Codex. It describes how to build an open-source, TypeScript-first platform for collecting, normalizing, validating, displaying, and maintaining Swiss medical clinical placement information for Wahlstudienjahr / Unterassistenz / PJ / Famulatur.

The project starts as a static, no-server open-data index and can later evolve into a university/student-association-backed platform with user feedback, verified corrections, and hospital-confirmed official records.

---

## 0. Project Principles

### Product scope

Build a public index of clinical placement information from official hospital/university pages.

Do **not** build a review community, social network, or replacement for official hospital communication. Every record must link back to the source page and show confidence/source status.

### Technical principles

1. **TypeScript-first**: use one language for crawler, schemas, tests, frontend, and backend.
2. **Rule-based parsers first**: use deterministic parsers and regression tests.
3. **LLM only as optional fallback**: never depend on LLM output for production truth.
4. **Source transparency**: every extracted value must be traceable to a source URL and ideally a text snippet.
5. **Confidence-aware display**: never imply guaranteed availability unless hospital-confirmed.
6. **Snapshot everything important**: store raw HTML/text snapshots for reproducibility.
7. **Human review gates**: ambiguous data must be marked for review, not silently published as high confidence.
8. **Open governance-ready**: design so a student organization or university can later adopt the project.

---

## 1. Suggested Codex Skills / Tooling Capabilities

Ask Codex to add or use these skills progressively, not all at once.

### Essential from the start

- TypeScript monorepo setup
- Node package management with `pnpm`
- Zod schema validation
- Cheerio HTML parsing
- Playwright browser automation fallback
- Vitest unit testing
- GitHub Actions CI
- Static site generation
- JSON/CSV data export

### Useful after MVP

- Postgres + Drizzle ORM
- Auth.js or simple magic-link authentication
- Admin review workflow
- Full-text search
- Email/RSS/Telegram change notifications
- Cloudflare Pages / Vercel / university VM deployment
- GDPR / Swiss FADP-aware data handling

### Optional later

- LLM-assisted parser suggestion
- Browser-based visual diff checks
- Hospital official feed ingestion: JSON/YAML/CSV
- SWITCH edu-ID integration, if an institutional partner provides access

---

## 2. Target Repository Structure

Codex should create this structure gradually.

```txt
swiss-clinical-placement-index/
  README.md
  PROJECT_PLAN.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  .env.example

  apps/
    web/
      package.json
      src/
      public/
      tests/

    worker/
      package.json
      src/
        crawl.ts
        build-static-data.ts
        diff-snapshots.ts
      tests/

  packages/
    schema/
      package.json
      src/
        placement.ts
        source.ts
        leadTime.ts
        feedback.ts
        index.ts
      tests/

    parsers/
      package.json
      src/
        index.ts
        generic.ts
        luks.ts
        usz.ts
        inselspital.ts
        language-packs/
      fixtures/
        luks/
        usz/
        inselspital/
      tests/

    sources/
      package.json
      sources.yaml
      src/
        loadSources.ts
      tests/

    utils/
      package.json
      src/
        html.ts
        date.ts
        hash.ts
        text.ts
        csv.ts
      tests/

  data/
    current/
      placements.json
      sources.json
      changes.json
      parser-health.json
      source-coverage.json
      source-coverage.md
      reliability-audit.json
      reliability-audit.md
      lead-time-evidence.json
      lead-time-summary.json
      review-needed.md
    snapshots/
      .gitkeep
    exports/
      placements.csv

  docs/
    data-model.md
    parser-guide.md
    source-onboarding.md
    manual-review-guide.md
    deployment.md
    governance.md

  .github/
    workflows/
      ci.yml
      crawl.yml
      deploy.yml
```

---

## 3. Execution Protocol for Codex

Codex must follow this protocol.

### Per-step execution

For every step:

1. Explain the intended code change briefly.
2. Modify only the files relevant to the step.
3. Add or update tests.
4. Run automated tests.
5. Report:
   - files changed
   - tests run
   - test result
   - manual checks needed
   - known limitations

### Stop conditions

Codex must pause and request human review after these steps:

- after creating the first data schema
- after collecting the first 20 source URLs
- after implementing the first hospital-specific parser
- after publishing the first static dataset
- before enabling scheduled crawling
- before collecting user feedback
- before deploying anything public
- before contacting any university/student organization/hospital

### Commit style

Use small commits:

```txt
feat(schema): add placement record schema
feat(sources): add initial Bern and Zurich hospital source registry
feat(parser): add LUKS parser with fixtures
test(parser): add regression tests for unavailable placement wording
feat(web): add placement table and filters
ci: add scheduled crawler workflow
```

---

# Phase A — Discovery and URL Collection

## Step A1. Define source collection template

### Goal

Create a structured file for manually curated source URLs.

### Codex tasks

Create `packages/sources/sources.yaml` with a minimal schema-compatible structure.

Example entries:

```yaml
- id: luks-luzern-medizin
  institutionName: "Luzerner Kantonsspital"
  institutionType: "hospital"
  canton: "LU"
  city: "Luzern"
  language: "de"
  sourceLanguage: "de"
  region: "de-CH"
  country: "CH"
  sourceUrls:
    - url: "https://example.org/path"
      pageType: "hospital-placement-page"
      expectedParser: "generic"
      fetchMode: "html"
  notes: "Initial placeholder; verify manually."
  priority: 1
  status: "candidate"
```

Create a Zod schema in `packages/schema/src/source.ts`.

Fields:

- `id`
- `institutionName`
- `institutionType`
- `canton`
- `city`
- `language`
- `sourceLanguage`
- `region`
- `country`
- `sourceUrls`
- `notes`
- `priority`
- `status`

Allowed `status`:

- `candidate`
- `verified`
- `inactive`
- `blocked`
- `needs-review`

Allowed `fetchMode`:

- `html`
- `playwright`
- `pdf`
- `manual`

Allowed `sourceLanguage`:

- `de`
- `fr`
- `it`
- `en`
- `mixed`
- `unknown`

Allowed `region`:

- `de-CH`
- `fr-CH`
- `it-CH`
- `mixed`
- `unknown`

### Automated tests

Create tests for:

- valid source registry entry
- invalid URL
- invalid canton code
- duplicate source IDs
- empty `sourceUrls`

### Manual checks

- Confirm the fields are understandable to non-developer student contributors.
- Confirm the registry can represent hospitals, university catalogues, and student association pages.
- Confirm the registry can represent German, French, Italian, English, and mixed-language official sources.

---

## Step A2. Collect initial URL candidates

### Goal

Collect the first 20–30 URLs for German-speaking Switzerland, starting with Bern, Zurich, Basel, Luzern, Aargau, St. Gallen, Winterthur, and major cantonal hospitals.

### Codex tasks

Populate `packages/sources/sources.yaml` with candidate records.

Prioritize:

- Inselspital / Universitätsspital Bern
- University of Bern medical student resources
- Universitätsspital Zürich
- Stadtspital Zürich
- Kantonsspital Winterthur
- Luzerner Kantonsspital
- Universitätsspital Basel
- Kantonsspital Aarau
- Kantonsspital Baden
- Kantonsspital St. Gallen
- Kantonsspital Graubünden
- Solothurner Spitäler
- Spital Thurgau
- Spital Uster
- Hirslanden pages, only if official and placement-relevant

Search terms to use manually or with web search:

```txt
site:<hospital-domain> Unterassistenz Medizinstudierende
site:<hospital-domain> Wahlstudienjahr Medizin
site:<hospital-domain> Unterassistentinnen Unterassistenten
site:<hospital-domain> Praktisches Jahr PJ Schweiz
site:<hospital-domain> Medizinstudenten Bewerbung Unterassistenz
```

### Automated tests

- YAML parses successfully.
- All URLs are syntactically valid.
- No duplicate source IDs.
- No duplicate URLs unless explicitly justified.
- All `candidate` entries contain notes explaining why they are included.

### Manual checks

For each URL, check:

- Is it an official hospital, university, or student association page?
- Does it mention Unterassistenz / Wahlstudienjahr / PJ / medical students?
- Is availability shown directly, or only application/contact information?
- Is the page public and not behind login?
- Does the page appear crawlable without violating obvious access restrictions?
- Should it be `html`, `playwright`, `pdf`, or `manual`?

---

## Step A3. Add source registry loader

### Goal

Load and validate source registry at runtime.

### Codex tasks

Create:

```txt
packages/sources/src/loadSources.ts
```

Function:

```ts
export async function loadSources(path?: string): Promise<SourceRegistryEntry[]>
```

Requirements:

- Read YAML.
- Validate with Zod.
- Check duplicate IDs.
- Check duplicate URLs.
- Return typed records.
- Throw readable validation errors.

### Automated tests

- Loading valid fixture succeeds.
- Loading duplicate IDs fails.
- Loading invalid YAML fails.
- Loading missing file fails with readable message.

### Manual checks

- Error messages should be understandable to student maintainers.

---

# Phase B — Core Data Schema

## Step B1. Define placement schema

### Goal

Create the canonical data model for normalized placement records.

### Codex tasks

Create `packages/schema/src/placement.ts`.

Define `PlacementRecordSchema` with fields:

```ts
{
  id: string;
  sourceId: string;
  institutionName: string;
  department: string | null;
  departmentNormalized: string | null;
  roleType: "Unterassistenz" | "Wahlstudienjahr" | "PJ" | "Famulatur" | "ClinicalPlacement" | "Unknown";
  country: "CH";
  canton: string | null;
  city: string | null;
  language: "de" | "fr" | "it" | "en" | "unknown";
  sourceLanguage: "de" | "fr" | "it" | "en" | "mixed" | "unknown";
  region: "de-CH" | "fr-CH" | "it-CH" | "mixed" | "unknown";

  availabilityStatus:
    | "available"
    | "available-from"
    | "fully-booked-until"
    | "not-specified"
    | "application-only"
    | "unclear";

  availableFrom: string | null;       // ISO month: YYYY-MM, or ISO date if exact
  fullyBookedUntil: string | null;    // ISO month/date if known
  durationMinWeeks: number | null;
  durationMaxWeeks: number | null;
  applicationLeadTimeMonths: number | null;
  explicitApplicationLeadTimeMonths: number | null;
  observedMonthsAhead: number | null;
  leadTimeSummaryId: string | null;

  applicationMethod:
    | "online-form"
    | "email"
    | "contact-form"
    | "external-platform"
    | "postal"
    | "not-specified"
    | "unknown";

  applicationUrl: string | null;
  contactEmail: string | null;
  contactName: string | null;

  originalDepartmentName: string | null;
  roleTypeOriginal: string | null;
  eligibilityNotes: string | null;
  languageRequirement: string | null;
  compensation: string | null;
  housing: "yes" | "no" | "unknown" | null;

  sourceUrl: string;
  sourceTitle: string | null;
  extractedSnippet: string | null;
  sourceLastModified: string | null;
  lastChecked: string;

  extractionMethod:
    | "site-parser"
    | "generic-parser"
    | "manual"
    | "hospital-confirmed"
    | "student-feedback"
    | "llm-suggested";

  extractionLanguage: "de" | "fr" | "it" | "en" | "unknown";
  confidence: "high" | "medium" | "low";
  reviewStatus:
    | "auto-published"
    | "needs-human-review"
    | "human-verified"
    | "hospital-confirmed"
    | "deprecated";

  warnings: string[];
}
```

Also define:

- `PlacementRecord`
- `PlacementRecordInput`
- `PlacementRecordArraySchema`
- helper `makePlacementId(record)`

### Automated tests

Test:

- valid minimum record
- invalid `availableFrom`
- invalid URL
- invalid confidence value
- ID generation stable across repeated calls
- warning required when confidence is low

### Manual checks

- Confirm fields match medical student needs.
- Ask at least one Swiss medical student whether missing fields matter:
  - priority for local university?
  - minimum duration?
  - language level?
  - salary?
  - accommodation?
  - application documents?
  - whether foreign medical students are accepted?

---

## Step B2. Define snapshot and change schema

### Goal

Represent raw crawl outputs and diffs.

### Codex tasks

Create:

```txt
packages/schema/src/snapshot.ts
packages/schema/src/change.ts
```

Snapshot fields:

```ts
{
  sourceId: string;
  url: string;
  fetchedAt: string;
  statusCode: number | null;
  contentType: string | null;
  rawHash: string;
  textHash: string;
  title: string | null;
  visibleText: string;
  extractedLinks: { text: string; href: string }[];
  extractedEmails: string[];
  fetchModeUsed: "html" | "playwright" | "pdf" | "manual";
  error: string | null;
}
```

Change fields:

```ts
{
  id: string;
  sourceId: string;
  url: string;
  detectedAt: string;
  changeType:
    | "new-source"
    | "content-changed"
    | "parser-output-changed"
    | "record-added"
    | "record-removed"
    | "availability-changed"
    | "error";
  severity: "info" | "review" | "critical";
  before: unknown | null;
  after: unknown | null;
  message: string;
}
```

### Automated tests

- Snapshot schema validates real fixture.
- Change ID generation is deterministic.
- `availability-changed` requires `before` and `after`.

### Manual checks

- Confirm diffs are useful enough for maintainers.
- Confirm sensitive data is not stored unnecessarily.

---

# Phase C — Repository and Tooling Setup

## Step C1. Initialize TypeScript monorepo

### Goal

Create a working TypeScript monorepo.

### Codex tasks

Set up:

- `pnpm-workspace.yaml`
- root `package.json`
- root `tsconfig.base.json`
- packages for `schema`, `sources`, `utils`, `parsers`
- apps for `worker`, `web`
- ESLint or Biome
- Vitest

Recommended scripts:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "format": "biome format --write .",
    "crawl": "pnpm --filter @scpi/worker crawl",
    "build:data": "pnpm --filter @scpi/worker build:data"
  }
}
```

### Automated tests

- `pnpm install`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

### Manual checks

- A new contributor can install and run tests from README.

---

## Step C2. Add CI workflow

### Goal

Run type checks and tests on every pull request.

### Codex tasks

Create:

```txt
.github/workflows/ci.yml
```

CI jobs:

- checkout
- setup Node
- setup pnpm
- install dependencies
- typecheck
- lint
- test
- build

### Automated tests

Codex cannot fully run GitHub-hosted CI locally, but should run all equivalent commands locally.

### Manual checks

- After pushing to GitHub, verify CI passes.
- Confirm workflows are not overcomplicated.

---

# Phase D — Utility Layer

## Step D1. HTML fetcher

### Goal

Fetch pages safely and politely.

### Codex tasks

Create:

```txt
packages/utils/src/fetchPage.ts
```

Requirements:

- Use standard `fetch` or `undici`.
- Set a clear User-Agent identifying the open-source project.
- Timeout support.
- Retry only for transient errors.
- Do not hammer servers.
- Return status, headers, body, final URL.
- Respect per-source fetch mode.

### Automated tests

Use mocked fetch responses:

- 200 HTML page
- redirect
- timeout
- 404
- 500 with retry
- non-HTML content type

### Manual checks

- Confirm User-Agent text is appropriate.
- Confirm request rate is conservative.

---

## Step D2. HTML cleaner

### Goal

Extract stable visible text, links, emails, title, and tables.

### Codex tasks

Create:

```txt
packages/utils/src/html.ts
```

Functions:

```ts
extractTitle(html: string): string | null
extractVisibleText(html: string): string
extractLinks(html: string, baseUrl: string): ExtractedLink[]
extractEmails(text: string): string[]
extractTables(html: string): ExtractedTable[]
normalizeWhitespace(text: string): string
```

Use Cheerio.

Remove:

- script
- style
- nav
- footer
- cookie banners where detectable
- hidden content where obvious

### Automated tests

Create fixture HTML with:

- title
- headings
- links
- email addresses
- tables
- navigation noise
- footer noise

Assert extracted results.

### Manual checks

- Inspect extracted text for 3 real hospital pages.
- Confirm no obvious navigation spam dominates the text.

---

## Step D3. Date and availability parser utilities

### Goal

Parse common German/French/Italian availability expressions deterministically.

### Codex tasks

Create:

```txt
packages/utils/src/date.ts
packages/utils/src/availability.ts
```

Support phrases:

German:

```txt
ab Juli 2027
ab 01.07.2027
ab sofort
nach Vereinbarung
keine freien Plätze bis Ende 2026
ausgebucht bis Dezember 2027
Bewerbungen 12 Monate im Voraus
Bewerbungen ein Jahr im Voraus
Bewerbungen 18 Monate im Voraus
Bewerbungen frühestens 12 Monate vor Beginn
Bewerbungen spätestens 18 Monate vor Beginn
für mindestens 4 Wochen
1 bis 4 Monate
```

French:

```txt
dès juillet 2027
à partir du 01.07.2027
complet jusqu'à fin 2026
candidature 12 mois à l'avance
candidature un an à l'avance
candidature 18 mois avant le début
```

Italian:

```txt
da luglio 2027
a partire dal 01.07.2027
occupato fino a fine 2026
candidatura con 12 mesi di anticipo
candidatura un anno prima
candidatura 18 mesi prima dell'inizio
```

Functions:

```ts
parseMonthExpression(text: string, language?: string): string | null
parseLeadTimeMonths(text: string): number | null
monthsBetweenObservedAndTarget(observedAt: string, targetMonthOrDate: string): number | null
parseDurationWeeks(text: string): { minWeeks: number | null; maxWeeks: number | null }
parseAvailabilityStatus(text: string): AvailabilityParseResult
```

### Automated tests

Use table-driven tests with at least 40 phrases.

Important negative tests:

- Do not treat `bis Ende 2026 ausgebucht` as available from 2026.
- Do not convert `nach Vereinbarung` into a date.
- Do not infer exact date when only month is given.
- Do not mark application deadline as availability date.

### Manual checks

- Ask a German-speaking medical student to review phrase coverage.
- Later ask French/Italian speakers to improve language coverage.

---

## Step D4. Hashing and diff utilities

### Goal

Detect page changes and parser output changes.

### Codex tasks

Create:

```txt
packages/utils/src/hash.ts
packages/utils/src/diff.ts
```

Functions:

```ts
hashString(input: string): string
hashObject(input: unknown): string
diffPlacementRecords(before, after): ChangeRecord[]
```

### Automated tests

- Same input produces same hash.
- Whitespace-normalized text hash ignores irrelevant whitespace.
- Availability status change produces `availability-changed`.
- New placement record produces `record-added`.

### Manual checks

- Confirm diff messages are readable.

---

# Phase E — Parser System

## Step E1. Define parser interface

### Goal

Make parsers plugin-like and easy to maintain.

### Codex tasks

Create:

```txt
packages/parsers/src/types.ts
```

Interface:

```ts
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
```

Create parser registry:

```ts
export const parsers: SourceParser[] = [...]
export async function parsePage(input: ParsedPage): Promise<ParserResult>
```

Parser selection:

1. site-specific parser if `match` true
2. source-config specified parser
3. generic parser fallback
4. if no record found, return low-confidence review item

### Automated tests

- Parser registry selects site parser.
- Generic parser is fallback.
- Empty page returns no high-confidence records.

### Manual checks

- Parser output should always contain source URL and extracted snippet.

---

## Step E2. Generic parser

### Goal

Extract low/medium confidence records from unknown pages.

### Codex tasks

Implement `packages/parsers/src/generic.ts`.

Generic parser should:

- detect role type keywords
- detect departments near headings
- detect availability phrases
- detect application links
- detect emails
- create one or more records
- mark confidence low/medium unless fields are explicit

Keywords:

```txt
Unterassistenz
Unterassistent
Unterassistentin
Wahlstudienjahr
Praktisches Jahr
PJ
Famulatur
Medizinstudierende
freie Plätze
verfügbar
ausgebucht
Bewerbung
Kontakt
stage
sous-assistant
étudiant en médecine
candidature
```

### Automated tests

Use synthetic fixtures:

- page with one department and explicit date
- page with multiple departments
- page with only contact information
- page with irrelevant hospital career jobs
- page with "not available" wording

Expected:

- explicit department/date => medium
- contact-only => low
- irrelevant jobs => zero records or low review warning
- fully booked wording => correctly classified

### Manual checks

- Run generic parser on 5 real candidate pages.
- Manually inspect false positives.

---

## Step E3. First hospital-specific parser

### Goal

Implement one high-value parser end-to-end.

### Codex tasks

Pick one hospital page with clear structure.

Create:

```txt
packages/parsers/src/luks.ts
packages/parsers/fixtures/luks/current.html
packages/parsers/tests/luks.test.ts
```

Parser requirements:

- Extract institution
- Extract department sections
- Extract availability date/status
- Extract duration if available
- Extract application method/link/contact
- Extract eligibility notes
- Include source snippets
- Return high confidence only for explicitly stated values

### Automated tests

Tests must cover:

- current fixture extracts expected records
- unavailable wording parsed correctly
- changed fixture with missing availability does not fabricate date
- fixture with multiple departments returns multiple records
- every record passes `PlacementRecordSchema`

### Manual checks

- Compare parser output with live source page.
- Ask Swiss medical student whether records match how they interpret the page.
- Confirm no private or non-public information is included.

### Codex stop

Pause after this step for human review.

---

## Step E4. Parser regression test framework

### Goal

Make it easy to add fixtures when users report errors.

### Codex tasks

Create helper:

```ts
runParserFixtureTest({
  parser,
  fixturePath,
  expectedRecords,
  expectedWarnings,
})
```

Add docs:

```txt
docs/parser-guide.md
```

Include instructions:

- how to save a problematic HTML snippet
- how to add a regression fixture
- how to assert the correct parsed output
- how to mark known ambiguity

### Automated tests

- Helper works on generic parser fixture.
- Helper reports readable diffs.

### Manual checks

- Confirm a non-expert contributor can follow `parser-guide.md`.

---

## Step E5. Add 5–10 institution parsers

### Goal

Increase precision for the most important sources.

### Codex tasks

Add parsers one at a time.

Suggested order:

1. LUKS
2. Inselspital / Bern
3. USZ
4. Universitätsspital Basel
5. Kantonsspital Winterthur
6. Kantonsspital Aarau
7. Kantonsspital St. Gallen
8. Spital Uster
9. CHUV
10. HUG

For each parser:

- add fixture
- add parser
- add tests
- add source registry mapping
- add docs if source has unusual structure

### Automated tests

For each parser:

- valid records
- correct availability status
- no fabricated dates
- source snippets exist
- confidence rules respected

### Manual checks

For each parser:

- compare with source page
- check whether multiple departments are correctly separated
- check whether application URL points to the correct page
- check if source page says students from certain universities have priority

---

# Phase F — Crawler and Static Data Pipeline

## Step F1. Crawler command

### Goal

Fetch all sources and generate snapshots.

### Codex tasks

Create:

```txt
apps/worker/src/crawl.ts
```

Command:

```bash
pnpm crawl --sources packages/sources/sources.yaml --out data/snapshots
```

Requirements:

- load source registry
- fetch each URL
- clean HTML
- create snapshot object
- save snapshot as JSON
- save raw HTML only if configured
- continue on individual failures
- produce `crawler-report.json`

### Automated tests

Use mocked sources and mocked fetch:

- one successful page
- one 404
- one timeout
- one duplicate URL
- one Playwright-marked page, mocked if necessary

### Manual checks

- Run against 3 real URLs.
- Check request volume.
- Check snapshot output readability.
- Confirm no credentials or private content are stored.

---

## Step F2. Build static placement dataset

### Goal

Parse snapshots into public JSON and CSV.

### Codex tasks

Create:

```txt
apps/worker/src/build-static-data.ts
```

Command:

```bash
pnpm build:data --snapshots data/snapshots --out data/current
```

Outputs:

```txt
data/current/placements.json
data/current/sources.json
data/current/changes.json
data/current/parser-health.json
data/exports/placements.csv
```

Requirements:

- validate every record with Zod
- deduplicate records
- mark low-confidence records as `needs-human-review`
- generate parser health metrics:
  - pages crawled
  - pages failed
  - records extracted
  - high/medium/low confidence counts
  - records needing review

### Automated tests

- synthetic snapshots produce expected JSON
- invalid parser output fails build
- duplicate records deduplicated
- CSV generated with expected headers
- low-confidence records not marked high

### Manual checks

- Open `placements.json`.
- Open CSV in spreadsheet viewer.
- Confirm the output is understandable to a medical student.

---

## Step F3. Change detection

### Goal

Detect meaningful changes across crawl runs.

### Codex tasks

Create:

```txt
apps/worker/src/diff-snapshots.ts
```

Command:

```bash
pnpm diff:snapshots --previous data/previous --current data/current
```

Generate:

```txt
data/current/changes.json
```

Detect:

- new page
- failed page
- page text changed
- parser output changed
- placement added
- placement removed
- availability changed

### Automated tests

- old vs new availability date produces critical/review change
- changed footer only does not create critical change
- new source creates info change
- parser failure creates review change

### Manual checks

- Review changes after running two real crawls one day apart.
- Confirm change messages are not noisy.

---

# Phase G — Static Web MVP

## Step G1. Build static frontend

### Goal

Display searchable placement records with no backend.

### Codex tasks

Use either Astro or Next.js static export.

Build:

- homepage
- placement table
- filters
- detail drawer/page
- source link
- confidence badge
- review status badge
- last checked date
- CSV download link

Filters:

- canton
- city
- institution
- department
- role type
- availability status
- available from month
- confidence
- language

### Automated tests

- component renders sample data
- filters work
- empty state works
- low-confidence records display warning
- source URL is shown for every record

### Manual checks

- A Swiss medical student can answer:
  - Where can I apply?
  - From when?
  - Which department?
  - How reliable is this information?
  - Where is the original source?
- Check mobile layout.

---

## Step G2. Add source detail pages

### Goal

Show data provenance.

### Codex tasks

For each source/institution page show:

- institution name
- source URLs
- last checked
- extraction method
- parser status
- related placement records
- recent changes
- known warnings

### Automated tests

- source page renders
- missing source handled gracefully
- changes are displayed

### Manual checks

- Confirm transparency is sufficient for liability reduction.
- Confirm no page implies official endorsement unless confirmed.

---

## Step G3. Add manual review dashboard as static file

### Goal

Let maintainers review low-confidence records even before backend exists.

### Codex tasks

Create a static admin-like page or generated Markdown report:

```txt
data/current/review-needed.md
```

Include:

- low-confidence records
- parser warnings
- failed pages
- changed pages
- records with missing source snippets
- records with unavailable/ambiguous wording

### Automated tests

- generated report contains low-confidence records
- high-confidence records are excluded unless changed

### Manual checks

- Maintainers can use the report to triage issues weekly.

---

# Phase G4 — Multilingual Source Registry and Parser Support

## Step G4.1. Extend schemas for language-aware records

### Goal

Support German, French, Italian, English, mixed-language, and unknown-language sources without changing the static architecture.

### Codex tasks

Extend source and placement schemas with backward-compatible fields:

- `sourceLanguage`: `de | fr | it | en | mixed | unknown`
- `region`: `de-CH | fr-CH | it-CH | mixed | unknown`
- `originalDepartmentName`
- `departmentNormalized`
- `roleTypeOriginal`
- `extractionLanguage`

Keep defaults for existing data so older records still validate.

### Automated tests

- Source schema accepts German/French/Italian/English/mixed metadata.
- Placement schema defaults new fields for older records.
- Non-German checked-in sources must declare concrete `sourceLanguage` and `region`.

### Manual checks

- Confirm labels make sense to maintainers who are not developers.
- Confirm mixed-language cantons and national pages can be represented without forcing a single language.

---

## Step G4.2. Add multilingual parser language packs

### Goal

Make deterministic parsing language-aware for Swiss German, French, Italian, and English pages.

### Codex tasks

Add language packs under:

```txt
packages/parsers/src/language-packs/
```

Each pack should contain:

- role keywords
- application keywords
- availability keywords
- fully-booked/unavailable keywords
- month names
- duration patterns
- lead-time patterns
- department aliases

Normalize common departments across languages:

- Innere Medizin / Médecine interne / Medicina interna → `internal-medicine`
- Chirurgie / Chirurgie / Chirurgia → `surgery`
- Pädiatrie / Pédiatrie / Pediatria → `pediatrics`
- Gynäkologie / Gynécologie / Ginecologia → `gynecology`
- Psychiatrie / Psychiatrie / Psichiatria → `psychiatry`
- Anästhesie / Anesthésiologie / Anestesia → `anesthesiology`
- Notfallmedizin / Urgences / Pronto soccorso → `emergency-medicine`

### Automated tests

- Table-driven German/French/Italian month parsing.
- Generic parser fixture tests for one German, one French, and one Italian synthetic page.
- Department normalization display tests.

### Manual checks

- Ask native or fluent French/Italian speakers to review phrase coverage before treating real pages as reliable.

---

## Step G4.3. Expand official source registry nationally

### Goal

Broaden source coverage from German-speaking Switzerland to official sources across German-, French-, Italian-, English-, and mixed-language contexts.

### Codex tasks

Update `packages/sources/sources.yaml` with official hospital, university, and student-association candidates only.

Every source must include:

- `sourceLanguage`
- `region`
- `expectedParser`
- `fetchMode`
- `priority`
- `status`
- notes explaining why it is included

Do not scrape or include:

- login-only pages
- private documents
- email-only information not publicly posted
- unofficial pages
- pages where placement relevance cannot be explained in notes

### Automated tests

- Duplicate IDs fail.
- Duplicate URLs fail.
- Invalid canton/language/region fails.
- Candidate sources require notes.
- Non-German sources require `sourceLanguage` and `region`.

### Manual checks

For every new official source:

- Is it public?
- Is it official?
- Is medical-student placement relevance plausible?
- Is the fetch mode correct?
- Should the source remain `candidate` or `needs-review`?

---

## Step G4.4. Add source coverage report

### Goal

Make registry coverage auditable before broad crawling starts.

### Codex tasks

Generate:

```txt
data/current/source-coverage.json
data/current/source-coverage.md
```

Reports must include:

- counts by canton
- counts by `sourceLanguage`
- counts by `region`
- counts by `status`
- counts by `priority`
- manual verification list
- special fetch mode list

Expose report artifacts in static output if easy.

### Automated tests

- Report generator summarizes source counts correctly.
- Manual/PDF/Playwright fetch modes appear in the special fetch mode list.

### Manual checks

- Maintainer can use the report as a source-review checklist.

---

# Phase G5 — Multilingual Reliability and Sparse-Information Audit

## Step G5.1. Add reliability audit report

### Goal

Prevent broad multilingual source coverage from looking more reliable than it is.

### Codex tasks

Generate:

```txt
data/current/reliability-audit.json
data/current/reliability-audit.md
```

The report must compare the full source registry against generated placement records and include:

- phase A-G status checks
- source counts by language and region
- placement counts by language and region
- source-only language groups
- sparse placement counts
- risky auto-published counts
- manual verification counts

Rules:

- Non-German real sources should remain source-only until crawled fixtures/native-language checks exist.
- Low-confidence and sparse records must remain review-needed.
- No source should be promoted to verified just because it is official.

### Automated tests

- Synthetic multilingual source-only case is reported.
- Sparse placement records are flagged.
- Risky auto-published records are counted.

### Manual checks

- Review `reliability-audit.md` before enabling scheduled crawling.
- Confirm French/Italian/mixed sources are clearly labeled as pending manual verification until checked.

---

## Step G5.2. Standardize user-facing labels

### Goal

Keep machine-readable enum values stable while making UI/report labels readable and consistent.

### Codex tasks

Display values like:

- `not-specified` → `Not specified`
- `needs-human-review` → `Needs human review`
- `available-from` → `Available from`
- `fully-booked-until` → `Fully booked until`

Do not change the underlying JSON enum values.

### Automated tests

- Filter option keeps `value="not-specified"` but displays `Not specified`.
- Badges and detail fields use display labels.

### Manual checks

- Scan static HTML for inconsistent user-facing casing.

---

# Phase G6 — Application Lead-Time Intelligence

## Step G6.1. Add lead-time schemas

### Goal

Track how far before a desired start month students usually need to apply, without presenting estimates as facts.

### Codex tasks

Add:

- `LeadTimeEvidenceSchema`
- `LeadTimeSummarySchema`

Support evidence types:

- `explicit-source`
- `historical-observed`
- `student-reported`
- `hospital-confirmed`
- `estimated`

Add placement fields only if necessary and keep them backward compatible:

- `explicitApplicationLeadTimeMonths`
- `observedMonthsAhead`
- `leadTimeSummaryId`

### Automated tests

- Lead-time evidence validates.
- Lead-time summary validates.
- Older placement records still validate.

### Manual checks

- Confirm maintainers understand the difference between evidence and recommendation.

---

## Step G6.2. Parse multilingual explicit lead-time phrases

### Goal

Extract explicit application lead-time statements from public source text.

### Codex tasks

Support phrases such as:

German:

- `ein Jahr im Voraus`
- `12 Monate im Voraus`
- `18 Monate im Voraus`
- `Bewerbungen frühestens/spätestens X Monate vor Beginn`

French:

- `12 mois à l'avance`
- `un an à l'avance`
- `18 mois avant le début`

Italian:

- `12 mesi di anticipo`
- `un anno prima`
- `18 mesi prima dell'inizio`

### Automated tests

- Table-driven multilingual lead-time phrase parsing.
- Negative cases where no lead time is present.

### Manual checks

- Native-language review for French/Italian wording before relying on real pages.

---

## Step G6.3. Generate historical lead-time evidence and summaries

### Goal

Use dated availability observations as low-confidence evidence, not as recommendations by themselves.

### Codex tasks

For records with `availableFrom` or `fullyBookedUntil`:

- compute months between `lastChecked`/`observedAt` and target start month
- store as `LeadTimeEvidence` with `evidenceType = historical-observed`
- do not overinterpret one observation as a recommendation

For each stable placement key, summarize evidence:

- `hospital-confirmed` overrides all
- `explicit-source` has highest normal priority
- historical observations provide median/range
- student-reported evidence is lower confidence
- estimated values must be low confidence

Generate:

```txt
data/current/lead-time-evidence.json
data/current/lead-time-summary.json
```

### Automated tests

- Month difference calculation.
- Historical observation evidence generation.
- Summarizer priority rules.
- Fewer than 3 historical observations remain low confidence.

### Manual checks

- Check that empty lead-time files are acceptable when current records have no evidence.
- Confirm no estimated lead-time recommendation appears as a fact.

---

## Step G6.4. Display lead-time evidence in frontend and review reports

### Goal

Show lead-time information carefully and visibly mark estimate quality.

### Codex tasks

On placement detail pages show:

- explicit lead time if the source states it
- observed months ahead if derived from availability history
- recommended apply-ahead window only if confidence is medium/high
- labels such as `explicitly stated by source` or `estimated from public page history`

Review-needed should flag:

- lead time greater than 24 months
- availability date in the past
- source says fully booked but parser marks available
- estimated recommendation based on fewer than 3 observations

### Automated tests

- Frontend renders explicit and estimated lead time differently.
- Low-confidence estimates are warning-labeled.
- Review report includes lead-time warnings.

### Manual checks

- Students should not mistake low-confidence estimates for hospital guidance.
- Do not enable user-submitted lead-time reports yet.

---

# Phase H — GitHub Actions Automation

## Step H1. CI workflow

Already covered in Step C2. Ensure it runs:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm source:coverage -- --sources packages/sources/sources.yaml --out data/current
pnpm reliability:audit -- --data data/current --sources packages/sources/sources.yaml --out data/current
pnpm lead-time:build -- --data data/current
```

CI must treat generated report commands as validation of report code, but it should not automatically commit generated data during pull-request checks.

---

## Step H2. Scheduled crawl workflow

### Goal

Run crawler on schedule and publish updated static data.

### Codex tasks

Create:

```txt
.github/workflows/crawl.yml
```

Triggers:

- manual `workflow_dispatch`
- scheduled weekly run initially
- later daily run if stable

Workflow:

1. checkout
2. setup Node/pnpm
3. install
4. run tests
5. validate source registry
6. generate source coverage report
7. run crawler
8. build data
9. generate lead-time evidence and summary
10. generate review-needed report
11. generate reliability audit
12. build static site
13. commit updated data or upload artifact
14. optionally open PR instead of pushing directly

Recommended early behavior:

- open PR with data changes
- human reviews PR
- merge after sanity check
- never push directly to the default branch from a scheduled crawl

### Automated tests

Local equivalent:

```bash
pnpm test
pnpm crawl --dry-run
pnpm build:data
pnpm lead-time:build -- --data data/current
pnpm review:report -- --data data/current --out data/current/review-needed.md
pnpm source:coverage -- --sources packages/sources/sources.yaml --out data/current
pnpm reliability:audit -- --data data/current --sources packages/sources/sources.yaml --out data/current
```

### Manual checks

Before enabling schedule:

- Confirm crawl frequency is conservative.
- Confirm all scheduled-crawled source pages are public and official.
- Confirm non-German and mixed-language sources have native-language/manual review coverage.
- Confirm source-only languages remain clearly labeled if they have no parsed records.
- Confirm lead-time estimates are not displayed as fact.
- Confirm generated PR is understandable.
- Confirm failed sources do not break the whole run.
- Confirm `reliability-audit.md`, `source-coverage.md`, and `review-needed.md` are usable by maintainers.

### Codex stop

Pause before enabling scheduled crawl.

---

## Step H3. Static deployment

### Goal

Deploy public static site.

### Codex tasks

Support one of:

- GitHub Pages
- Cloudflare Pages
- Vercel static export

Create docs:

```txt
docs/deployment.md
```

Deployment must include:

- how to build
- where data is stored
- how crawl updates trigger frontend updates
- how to rollback
- how to disable crawler quickly

### Automated tests

- `pnpm build` passes
- generated static output exists
- links are valid if link checker is available

### Manual checks

Before public deployment:

- Review liability disclaimer.
- Review data accuracy for first 20–30 records.
- Review source coverage and reliability audit for all languages represented.
- Review lead-time display labels for explicit vs estimated data.
- Ask at least 2 medical students to test.
- Confirm no login-only or private data was used.
- Confirm source links work.

---

# Phase I — User Feedback System

## Step I1. GitHub Issues feedback template

### Goal

Start with no backend.

### Codex tasks

Create issue templates:

```txt
.github/ISSUE_TEMPLATE/report-wrong-data.yml
.github/ISSUE_TEMPLATE/add-source.yml
.github/ISSUE_TEMPLATE/parser-bug.yml
```

Wrong data fields:

- source record URL or ID
- institution
- department
- current displayed value
- corrected value
- evidence type
- source URL / screenshot description
- whether contributor is a medical student
- whether they want public attribution

### Automated tests

- Not applicable beyond YAML validity.
- Add a script if useful to validate issue template YAML.

### Manual checks

- Form is easy enough for students.
- Does not request unnecessary personal data.
- Warns users not to upload private emails/screenshots with personal data unless redacted.

---

## Step I2. Feedback data model

### Goal

Prepare for backend without implementing it yet.

### Codex tasks

Create `packages/schema/src/feedback.ts`.

Fields:

```ts
{
  id: string;
  placementId: string | null;
  sourceId: string | null;
  submittedAt: string;
  submittedByRole: "anonymous" | "student" | "maintainer" | "hospital" | "unknown";
  feedbackType:
    | "wrong-availability"
    | "wrong-department"
    | "wrong-application-link"
    | "missing-source"
    | "source-updated"
    | "parser-bug"
    | "other";
  currentValue: string | null;
  suggestedValue: string | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  status: "new" | "triaged" | "accepted" | "rejected" | "needs-evidence";
  reviewerNote: string | null;
}
```

### Automated tests

- valid feedback
- invalid personal data fields if added accidentally
- accepted feedback requires reviewer note

### Manual checks

- Confirm privacy implications.

---

## Step I3. Convert accepted feedback into regression tests

### Goal

Make user corrections improve parsers.

### Codex tasks

Create docs and helper script:

```txt
docs/manual-review-guide.md
apps/worker/src/create-regression-from-feedback.ts
```

Workflow:

1. maintainer reviews issue
2. saves relevant public HTML snippet as fixture
3. writes expected parser output
4. test fails
5. parser fixed
6. test passes
7. record updated

### Automated tests

- script creates fixture skeleton
- generated test fails until expected values are added
- no private attachments included

### Manual checks

- Maintainer can reproduce the process with one real feedback item.

---

# Phase J — Backend Upgrade Path

Do not implement this until static MVP has real users.

## Step J1. Add database schema

### Goal

Move from static JSON to persistent records.

### Codex tasks

Use Postgres + Drizzle.

Tables:

- `sources`
- `source_urls`
- `snapshots`
- `placement_records`
- `placement_record_versions`
- `changes`
- `feedback`
- `users`
- `review_actions`
- `hospital_confirmations`

Important:

- store record versions
- keep audit log
- keep source provenance
- support official hospital-confirmed override

### Automated tests

- migrations run on test DB
- insert source
- insert placement
- update placement creates version
- feedback accepted creates review action
- hospital-confirmed record takes precedence in query

### Manual checks

- Confirm database schema is not overcomplicated.
- Confirm export to JSON/CSV still works.

---

## Step J2. Add simple backend API

### Goal

Support dynamic feedback and admin review.

### Codex tasks

Use Next.js API routes, Hono, or FastAPI only if project later reintroduces Python. Prefer TypeScript.

Endpoints:

```txt
GET  /api/placements
GET  /api/sources
POST /api/feedback
GET  /api/admin/review-queue
POST /api/admin/review/:id/accept
POST /api/admin/review/:id/reject
POST /api/hospital/confirm
```

### Automated tests

- API returns filtered placements
- invalid feedback rejected
- admin endpoints require auth
- public endpoints expose no private reviewer data

### Manual checks

- Confirm abuse/spam protections.
- Confirm privacy policy.

---

## Step J3. Authentication

### Goal

Differentiate anonymous users, verified students, maintainers, and hospital contacts.

### Codex tasks

Implement only when needed.

Options:

- magic link
- university email domain allowlist
- GitHub login for maintainers
- hospital email verification
- SWITCH edu-ID only if institution provides support

Roles:

- anonymous
- student
- maintainer
- hospital-admin
- institutional-admin

### Automated tests

- unauthenticated user can submit public feedback
- student can submit verified feedback
- hospital admin can only confirm their institution
- maintainer can review all feedback

### Manual checks

- Verify with legal/institutional partner before collecting user accounts.
- Avoid collecting more personal data than necessary.

---

# Phase K — Hospital Official Information Mode

## Step K1. Define hospital official feed schema

### Goal

Allow hospitals to provide structured information without scraping.

### Codex tasks

Create `docs/hospital-feed-schema.md`.

Support JSON/YAML/CSV.

Minimal YAML:

```yaml
institutionName: "Spital Example"
institutionId: "spital-example"
lastConfirmed: "2026-07-06"
confirmedByRole: "education coordinator"
placements:
  - department: "Innere Medizin"
    roleType: "Unterassistenz"
    availabilityStatus: "available-from"
    availableFrom: "2027-07"
    durationMinWeeks: 4
    durationMaxWeeks: 16
    applicationMethod: "email"
    applicationUrl: "https://example.org/apply"
    contactEmail: "education@example.org"
    eligibilityNotes: "Swiss medical students preferred."
```

### Automated tests

- official feed validates
- official feed imports into placement records
- official records override scraped records in display
- invalid feed produces readable errors

### Manual checks

- Ask one hospital contact or medical education office whether this is too much work.
- Simplify fields if necessary.

---

## Step K2. Hospital confirmation form

### Goal

Let hospitals confirm or update records with minimal effort.

### Codex tasks

Only after backend exists.

Build form:

- confirm current information
- mark fully booked until date/month
- update application link
- update contact email
- add note
- set next review date

### Automated tests

- confirmation updates record version
- audit log created
- hospital role required
- confirmation expires or becomes stale after configured period

### Manual checks

- Confirm hospitals are not asked to maintain duplicate complex profiles.
- Confirm each confirmation has a timestamp and role.

---

# Phase L — Governance, Legal, and Partnership Readiness

## Step L1. Add public disclaimers

### Goal

Reduce liability and set expectations.

### Codex tasks

Create:

```txt
docs/governance.md
docs/data-policy.md
apps/web/src/components/Disclaimer.tsx
```

Disclaimer text should say:

- platform indexes public and community-confirmed information
- it does not replace official hospital communication
- students must verify final availability with hospital
- records have source and confidence labels
- errors can be reported
- private/personal data should not be submitted

### Automated tests

- Disclaimer component appears on homepage and record detail pages.

### Manual checks

- Ask legally knowledgeable person or institutional partner to review before public launch.

---

## Step L2. Partnership packet

### Goal

Prepare to approach student organizations and universities.

### Codex tasks

Create:

```txt
docs/partnership-packet.md
```

Include:

- problem statement
- screenshots
- data model
- example records
- source transparency
- maintenance process
- student feedback workflow
- privacy approach
- what support is requested
- what is not requested
- roadmap to hospital official confirmation

Potential partners:

- local Fachschaft / medical student associations
- Bern medical student association
- swimsa or national medical student organization
- faculty study coordination
- hospital education coordinators

### Automated tests

None.

### Manual checks

- Ask Swiss medical student to edit language.
- Keep tone non-commercial and infrastructure-oriented.
- Avoid claiming official status before it exists.

---

# Phase M — Quality Gates and Release Criteria

## Release 0.1 — Local prototype

Must have:

- 20 candidate source URLs
- source registry validation
- placement schema
- generic parser
- 1 hospital-specific parser
- tests passing
- CSV/JSON export

Manual validation:

- at least 1 Swiss medical student reviews output
- at least 10 records manually checked against source pages

---

## Release 0.2 — Static public demo

Must have:

- 30–50 official source URLs across German/French/Italian/mixed-language regions where possible
- 5 hospital-specific parsers
- multilingual schema fields and parser language packs
- static frontend
- confidence badges
- source detail pages
- review-needed report
- source coverage report
- reliability audit report
- lead-time evidence/summary files, even if empty
- GitHub issue feedback templates
- CI passing
- scheduled crawl disabled or PR-only

Manual validation:

- 2–3 medical students test UX
- maintainer reviews all high-confidence records
- maintainer reviews all non-German source-only coverage labels
- native/fluent reviewer checks at least representative French and Italian source wording before publishing extracted records from those languages
- no private/non-public data included
- no lead-time estimate is shown as a hospital fact

---

## Release 0.3 — Scheduled index

Must have:

- scheduled GitHub Actions crawl
- conservative crawl frequency
- generated PR workflow
- change detection
- parser health report
- source coverage report
- reliability audit report
- lead-time report generation
- at least 10 parser regression tests based on real pages
- deployment docs

Manual validation:

- monitor 2–4 scheduled runs
- check noise level in changes
- check source pages are not hit too often
- confirm generated PRs make multilingual/source-only/review-needed status obvious
- confirm lead-time evidence remains low confidence unless explicit or hospital-confirmed

---

## Release 0.4 — Community feedback

Must have:

- structured feedback via GitHub Issues or form
- schema support for future student-reported lead-time evidence
- manual review guide
- feedback-to-regression-test workflow
- public changelog
- contributor guide

Manual validation:

- process 3 test feedback items
- confirm no personal/private data is exposed

---

## Release 1.0 — Partnership-ready

Must have:

- stable static or backend deployment
- governance docs
- data policy
- partnership packet
- documented maintainer workflow
- source onboarding guide
- hospital feed schema draft
- hospital-confirmed lead-time evidence path
- audit trail for corrections
- exportable open dataset

Manual validation:

- student association reviews
- institutional contact reviews data policy
- hospital education contact reviews official feed format

---

# Phase N — Codex Prompt Templates

Use these prompts one by one.

## Prompt 1 — Initialize repo

```txt
Set up the TypeScript monorepo structure described in PROJECT_PLAN.md through Phase C1 only. Use pnpm workspaces, Vitest, Zod, and basic package boundaries. Do not implement crawler logic yet. Add minimal tests proving the schema package builds and tests run. Then run typecheck and tests.
```

## Prompt 2 — Add source schema

```txt
Implement Phase A1 and A3. Add the source registry Zod schema, YAML loader, duplicate ID/URL checks, tests, and a small fixture. Do not add real hospital URLs yet. Ensure error messages are readable for non-developer maintainers.
```

## Prompt 3 — Collect initial URLs

```txt
Implement Phase A2 by adding candidate German-speaking Swiss medical placement source URLs to packages/sources/sources.yaml. Keep status as candidate unless the page clearly contains placement information. Add notes explaining why each source is included. Run source validation tests.
```

## Prompt 4 — Add placement schema

```txt
Implement Phase B1 and B2. Add placement, snapshot, and change schemas with tests. Add stable ID generation. Do not implement crawlers or parsers yet.
```

## Prompt 5 — Add utilities

```txt
Implement Phase D1–D4. Add fetch, HTML extraction, date/availability parsing, hashing, and diff utilities. Use fixture-based and table-driven tests, especially for German availability phrases. Do not scrape live websites in unit tests.
```

## Prompt 6 — Add parser framework

```txt
Implement Phase E1 and E2. Add parser interfaces, parser registry, and generic parser. Add synthetic HTML fixtures and tests for role detection, date parsing, application links, and false positives.
```

## Prompt 7 — Add first hospital parser

```txt
Implement Phase E3 for one selected hospital source. Save a public HTML fixture, write a site-specific parser, and add regression tests. Ensure every extracted placement has a source snippet and passes PlacementRecordSchema. Stop after tests pass and summarize manual checks needed.
```

## Prompt 8 — Add crawler

```txt
Implement Phase F1. Add a crawler command that reads sources.yaml, fetches pages, extracts visible text/links/emails/tables, writes snapshots, and continues on individual failures. Add mocked tests. Do not enable scheduled GitHub Actions yet.
```

## Prompt 9 — Add static data builder

```txt
Implement Phase F2 and F3. Parse snapshots into placements.json, sources.json, changes.json, parser-health.json, and placements.csv. Add tests with synthetic snapshots. Include low-confidence records in review-needed output but do not mark them high confidence.
```

## Prompt 10 — Add static frontend

```txt
Implement Phase G1–G3. Build a static frontend that loads data/current/placements.json and shows filters, source links, confidence badges, record detail, and review warnings. Add component tests with sample data.
```

## Prompt 11 — Add multilingual support and source expansion

```txt
Implement Phase G4. Add multilingual schema fields, parser language packs for German/French/Italian/English, department normalization across languages, expanded official source registry coverage, source validation tests, and source coverage reports. Use synthetic parser fixtures; do not add scheduled crawling or LLM extraction.
```

## Prompt 12 — Add multilingual reliability audit

```txt
Implement Phase G5. Add a reliability audit comparing the full source registry against generated placement data. Flag source-only languages, sparse placement records, risky auto-published records, and manual verification queues. Standardize user-facing enum labels while keeping JSON enum values unchanged. Run typecheck, lint, tests, and build.
```

## Prompt 13 — Add lead-time intelligence

```txt
Implement Phase G6. Add lead-time evidence and summary schemas, multilingual explicit lead-time parsing, historical observed lead-time evidence generation, lead-time summary files, frontend labels for explicit vs estimated lead time, and review-needed warnings. Do not enable user-submitted lead-time reports or scheduled crawling.
```

## Prompt 14 — Add CI and scheduled crawl PR workflow

```txt
Implement Phase H1 and H2. Add CI and a scheduled crawl workflow, but configure scheduled crawl to open a PR or upload artifacts rather than pushing directly. Include manual workflow_dispatch. Keep crawl frequency conservative. The workflow must generate source coverage, lead-time files, review-needed, reliability audit, and static site artifacts. Pause before enabling any scheduled trigger.
```

## Prompt 15 — Add deployment

```txt
Implement Phase H3. Add static deployment configuration and docs for GitHub Pages or Cloudflare Pages. Include rollback instructions and a way to disable scheduled crawling quickly.
```

## Prompt 16 — Add feedback templates

```txt
Implement Phase I1–I3. Add GitHub issue templates, feedback schema, and docs for converting accepted feedback into parser regression tests. Do not add backend or user accounts yet.
```

## Prompt 17 — Prepare partnership docs

```txt
Implement Phase L1 and L2. Add public disclaimer, data policy, governance notes, and partnership packet. Keep language careful: this is an open index of public and community-confirmed information, not an official placement guarantee.
```

## Prompt 18 — Backend planning only

```txt
Create a backend-upgrade design document based on Phase J and K. Do not implement backend. Include database schema draft, API routes, auth roles, and hospital official feed import workflow.
```

---

# Phase O — Human Review Checklist

Use this checklist before any public release.

## Data accuracy

- [ ] Every high-confidence record checked against source.
- [ ] Every record has source URL.
- [ ] Every date/status has extracted snippet.
- [ ] Fully booked wording is not misclassified as available.
- [ ] Contact-only pages are not displayed as available placements.
- [ ] Old/outdated pages are marked.
- [ ] University-specific priority notes are preserved.
- [ ] Non-German extracted records have native/fluent language review or remain needs-review.
- [ ] Source-only languages are clearly labeled and not implied to have parsed coverage.
- [ ] Lead-time estimates are labeled as explicit, historical observed, hospital-confirmed, student-reported, or estimated.
- [ ] Estimated lead-time recommendations based on fewer than 3 observations are not displayed as medium/high confidence.

## Legal/privacy

- [ ] No login-only data.
- [ ] No private email screenshots.
- [ ] No unnecessary personal data.
- [ ] Disclaimer visible.
- [ ] Source attribution visible.
- [ ] robots/access concerns checked.
- [ ] User-Agent identifies project.

## Technical

- [ ] Tests pass.
- [ ] CI passes.
- [ ] Crawl frequency conservative.
- [ ] Parser health report acceptable.
- [ ] Source coverage report acceptable.
- [ ] Reliability audit acceptable.
- [ ] Lead-time evidence and summary files validate.
- [ ] Generated data validates.
- [ ] Deployment rollback documented.

## Product

- [ ] Swiss medical student can use the table without explanation.
- [ ] Search/filter works on mobile.
- [ ] Confidence and review status are understandable.
- [ ] Language/region filters are understandable.
- [ ] `Not specified` and other enum labels are displayed consistently.
- [ ] Feedback path is obvious.
- [ ] CSV export works.

---

# Final Notes for Codex

Do not optimize prematurely. The correct order is:

```txt
source registry
→ schema
→ utilities
→ generic parser
→ one site parser
→ snapshots
→ static data
→ static frontend
→ multilingual source expansion
→ source coverage and reliability audit
→ lead-time intelligence
→ CI
→ cautious scheduled crawl
→ feedback
→ partnership docs
→ backend only when needed
```

The most important engineering property is not crawler sophistication. It is **maintainability under changing hospital websites**. Therefore every parser bug should become a fixture and every user correction should become a regression test.
