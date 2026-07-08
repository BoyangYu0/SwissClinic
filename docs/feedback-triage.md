# Feedback Triage

Structured feedback is collected through pre-filled GitHub issue URLs from the static site. There is no backend, login, or private storage.

Feedback records should validate against `FeedbackRecordSchema` before they are used for fixtures or future imports. The schema intentionally does not include names, email addresses, or other identity fields.

## Triage Flow

1. Confirm the issue includes the generated JSON metadata block.
2. Open the official source URL from the metadata.
3. Classify the feedback:
   - `wrong availability`: parser/date/availability phrase issue.
   - `wrong department`: department alias or normalization issue.
   - `wrong application link`: source link extraction or registry URL issue.
   - `missing hospital/source`: source registry coverage issue.
   - `irrelevant source`: source should be downgraded, removed, or excluded.
   - `broken source URL`: registry URL or crawler handling issue.
   - `wrong language/region`: source registry metadata or language detection issue.
   - `parser bug`: parser fixture and extraction logic issue.
   - `other`: manually classify before changing data.
4. Decide whether the official source supports the requested correction.
5. Avoid copying private emails, patient data, or unredacted screenshots into fixtures or reports.

## Converting Accepted Feedback

For parser bugs or extraction corrections:

1. Save the accepted feedback JSON from the issue.
2. Run `pnpm feedback:regression -- --feedback path/to/feedback.json --parser generic`.
3. Replace the generated `source-snippet.html` with a minimal public official-source fixture.
4. Replace `expected-placement.json` with concrete expected parser output.
5. Add or update a parser test that reproduces the reported issue.
6. Fix the parser or language pack.
7. Run parser tests, then rebuild static data.

For source registry updates:

1. Update `packages/sources/sources.yaml`.
2. Set candidate or needs-review status unless the source is manually verified.
3. Add notes explaining the feedback and official URL.
4. Run source validation, crawl a small local sample if needed, and rebuild reports.

For coverage report corrections:

1. Check whether the report issue is caused by source registry metadata, baseline matching, or extracted records.
2. Update the baseline example only if the baseline entry itself is wrong.
3. Update matching logic only when multiple examples show the same normalization problem.
4. Regenerate `pnpm coverage:report`.

## Closing Issues

Close accepted feedback after the relevant fixture, source registry, parser, or report update is merged. If the official page is unclear, label the issue as needs-manual-verification instead of guessing.
