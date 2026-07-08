# Manual Review Guide

This project is a static beta. Reviews and feedback arrive through pre-filled GitHub issues or copied JSON blocks, not through a backend.

## Review Priorities

Start with:

1. low-confidence records in `review-queue.html`
2. non-German or mixed-language records
3. generic-parser records with availability dates
4. lead-time estimates or community evidence
5. source and coverage reports that have no extracted records

## Triage A Feedback Issue

1. Confirm the issue contains generated metadata or enough public source context.
2. Open the official source URL.
3. Decide whether the issue is a source registry problem, parser bug, frontend display problem, or coverage/baseline problem.
4. Do not copy private emails, patient data, login-only pages, or unredacted screenshots into the repository.
5. If the official page is unclear, keep the record in review-needed status instead of guessing.

## Convert Accepted Feedback To A Regression Fixture

Save the accepted JSON payload from the issue to a local file, then run:

```sh
pnpm feedback:regression -- --feedback path/to/feedback.json --parser generic
```

Optional flags:

```sh
pnpm feedback:regression -- --feedback path/to/feedback.json --out packages/parsers/fixtures/feedback --snippet "<main>public source snippet</main>"
```

The helper creates:

- `feedback.json`
- `source-snippet.html`
- `expected-placement.json`
- `README.md`

Replace the skeleton expected output with concrete parser expectations, add or update the parser test, then fix the parser.

## Source Registry Corrections

For missing, broken, or irrelevant sources:

1. Update `packages/sources/sources.yaml`.
2. Use the official institution name and public source URL.
3. Keep unclear entries as `candidate` or `needs-review`.
4. Add notes explaining why the source is included or excluded.
5. Regenerate data and coverage reports before closing the issue.

## Closing Criteria

Close accepted feedback only after:

- the parser fixture or source registry change is committed
- generated data has been rebuilt if public output changes
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass
- the issue has a short maintainer note explaining what changed
