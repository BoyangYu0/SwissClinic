# Local Testing Workflow

This project has two local testing paths:

- fixture and dry-run checks that never contact live websites
- a tiny opt-in live crawl using `packages/sources/sources.local.example.yaml`

Do not use the full source registry for routine local crawling. The local example registry is intentionally limited to a few public, official pages and must not include login-only pages, private documents, screenshots, or private emails.

## Fixture Parser Tests

Parser tests use checked-in fixtures and synthetic pages. They are the safest way to verify multilingual parsing and extraction logic without network access:

```sh
pnpm --filter @scpi/parsers test
```

Run the worker tests for crawler and data pipeline behavior. Crawler unit tests mock `fetch` and do not hit live websites:

```sh
pnpm --filter @scpi/worker test
```

## Source Validation

The source package validates both the full checked-in registry and the tiny local testing registry:

```sh
pnpm --filter @scpi/sources test
```

Before adding a source to `packages/sources/sources.local.example.yaml`, check that it is public, official, and safe to fetch locally.

## Dry Run

Use dry-run mode to verify CLI arguments, source loading, limits, and report generation without making network requests:

```sh
pnpm crawl -- --sources packages/sources/sources.local.example.yaml --out data/local/dry-run --dry-run --limit 3
```

The dry-run writes `data/local/dry-run/crawler-report.json`. In dry-run mode, `fetchedUrls` should be empty and each in-limit URL should appear as a planned success entry.

The shortcut below runs lint, tests, and the same dry-run crawl:

```sh
pnpm check:local
```

## Tiny Live Crawl

Only run the tiny live crawl when you intentionally want to contact the public example pages:

```sh
pnpm crawl:local
```

This uses:

- `packages/sources/sources.local.example.yaml`
- `data/local/snapshots`
- `--limit 3`
- `--respect-delay-ms 1000`

The report is written to `data/local/snapshots/crawler-report.json` and includes success/failure counts, fetched URLs, skipped URLs, and parser warnings.

## Static Data Build

After a tiny live crawl, build local static data from those local snapshots:

```sh
pnpm build:data:local
```

Validate the generated data directory:

```sh
pnpm validate:data:local
```

The validation command checks `placements.json`, `sources.json`, `parser-health.json`, optional lead-time files, and that `review-needed.md` exists.

You can also validate any generated data directory directly:

```sh
pnpm data:validate -- --data data/current
```

## Full Local Pipeline

The local pipeline intentionally uses the tiny local registry, not the full registry:

```sh
pnpm pipeline:local
```

It runs the tiny crawl, builds static data, builds lead-time summaries, regenerates review/source/reliability reports, validates the local data, and builds a static frontend under `data/local/site`.

## Frontend Local Run

For a local static build against tiny local data:

```sh
pnpm --filter @scpi/web build -- --data data/local/current --exports data/local/exports --out data/local/site
```

Inspect `data/local/site/index.html` in a browser after the build completes. If you need the app's normal development server, use the existing web package workflow, but keep the data path pointed at the local test output when checking crawler changes.

## Manual Inspection Checklist

- Confirm `crawler-report.json` only lists URLs from `sources.local.example.yaml`.
- Confirm `fetchedUrls`, `skippedUrls`, failures, and warnings match the expected run mode.
- Review `data/local/current/review-needed.md` before trusting extracted sparse information.
- Review `data/local/current/reliability-audit.md` and `source-coverage.md` when present.
- Check low-confidence and multilingual records for visible warnings in the frontend.
- Confirm lead-time estimates are labeled as estimates and are not presented as facts.
- Do not copy generated local records into the published dataset without manual source review.
