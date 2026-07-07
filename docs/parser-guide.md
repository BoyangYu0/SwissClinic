# Parser Guide

This guide explains how to add or fix parser fixtures when a hospital page changes or a maintainer reports a parser bug.

## What To Save

Save only public source material from official hospital, university, or student-association pages.

Use the smallest fixture that still reproduces the parser behavior:

- Prefer a short public HTML snippet for a bug report.
- Save a full public page only when page structure matters.
- Do not save screenshots, private emails, login-only pages, application submissions, or personal data.
- Keep the source URL in the test so the output remains traceable.

Recommended fixture paths:

```txt
packages/parsers/fixtures/<parser-id>/<case-name>.html
packages/parsers/fixtures/generic/<case-name>.html
```

Use `current.html` for the latest public page fixture of a site-specific parser.

## Add A Regression Fixture

Create the fixture file first, then add or update a parser test. Use `runParserFixtureTest` for normal HTML fixtures:

```ts
import { genericParser } from "../src/index.js";
import { runParserFixtureTest } from "./helpers/runParserFixtureTest.js";

await runParserFixtureTest({
  parser: genericParser,
  fixturePath: new URL("../fixtures/generic/example.html", import.meta.url),
  sourceId: "example-source",
  url: "https://example.ch/unterassistenz",
  expectedResult: {
    parserName: "generic",
    confidence: "medium",
  },
  expectedRecords: [
    {
      department: "Innere Medizin",
      availabilityStatus: "available-from",
      availableFrom: "2027-07",
    },
  ],
});
```

The helper builds a `ParsedPage` from the fixture using the shared HTML utilities, runs the parser, validates every record with `PlacementRecordSchema`, and compares the expected record fields.

## Assert The Correct Output

Assert only fields that the fixture clearly supports. Good fields to assert:

- `department`
- `roleType`
- `availabilityStatus`
- `availableFrom` or `fullyBookedUntil`
- `durationMinWeeks` and `durationMaxWeeks`
- `applicationMethod`
- `applicationUrl`
- `contactEmail` or `contactName`
- `eligibilityNotes`
- `languageRequirement`
- `compensation`
- `housing`
- `confidence`
- `reviewStatus`

Always add a test for the bug itself. For example, if fully booked wording was misread as available, assert:

```ts
expectedRecords: [
  {
    availabilityStatus: "fully-booked-until",
    fullyBookedUntil: "2026-12",
    availableFrom: null,
  },
]
```

## Mark Known Ambiguity

When the source page is ambiguous, keep the record conservative:

- Use `availabilityStatus: "not-specified"`, `"application-only"`, or `"unclear"`.
- Use `confidence: "low"` or `"medium"`.
- Use `reviewStatus: "needs-human-review"`.
- Add a warning that explains what could not be safely inferred.
- Do not create dates from application deadlines or general duration text.

Example:

```ts
expectedRecords: [
  {
    availabilityStatus: "application-only",
    availableFrom: null,
    fullyBookedUntil: null,
    confidence: "medium",
    reviewStatus: "needs-human-review",
  },
]
```

## Readable Failures

When expectations miss, `runParserFixtureTest` reports:

- fixture path
- parser id
- parser result confidence and warnings
- a compact summary of extracted records

Use that summary to update the parser or adjust the expected fields. If the page genuinely changed, keep the old fixture as a regression case and add a new fixture for the current page.

## Contributor Checklist

- The fixture is public and official.
- The test includes the source URL.
- Every extracted record has a source snippet.
- Every record validates with `PlacementRecordSchema`.
- Ambiguous fields remain conservative.
- The test fails before the parser fix and passes after it.
