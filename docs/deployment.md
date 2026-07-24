# Deployment Guide

This project deploys as a static site. The recommended first deployment target is GitHub Pages because it can publish the checked-in static dataset without adding a backend.

Do not deploy publicly until the manual checks in this document are complete.

## Build Locally

Install dependencies and run the same validation used in CI:

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm data:validate -- --data data/current
pnpm build
```

The static output is written to:

```txt
apps/web/dist/site/
```

The site build copies the current JSON and CSV exports into the static output so the frontend can be hosted without a server.

## Data Locations

Current public data lives in:

```txt
data/current/
data/exports/
```

Important review artifacts:

```txt
data/current/review-needed.md
data/current/source-coverage.md
data/current/reliability-audit.md
data/current/scheduled-quality-report.json
data/current/lead-time-evidence.json
data/current/lead-time-summary.json
data/snapshots/current-run/crawler-report.json
```

Crawler snapshots are kept separately under:

```txt
data/snapshots/
```

Do not publish raw snapshots if they contain unexpected private or irrelevant content.

## GitHub Pages Deployment

The workflow is:

```txt
.github/workflows/deploy.yml
```

It is manual-only via `workflow_dispatch`. It:

1. checks out the repository
2. installs dependencies
3. validates `data/current`
4. runs typecheck and tests
5. builds the static site
6. uploads `apps/web/dist/site`
7. deploys to GitHub Pages

Before the first run, configure GitHub Pages in repository settings to use GitHub Actions as the source.

## Crawl Updates

The crawl workflow is:

```txt
.github/workflows/crawl.yml
```

It runs daily at 04:17 UTC and can also be started manually. Runs are serialized and limited to 60 minutes so a slow crawl cannot overlap the next update.

The crawl workflow:

1. validates the source registry with a dry-run crawl
2. crawls official source pages with a conservative delay
3. builds static data
4. generates lead-time, review-needed, source-coverage, and reliability reports
5. validates generated data
6. builds the static site
7. enforces crawl-failure, record-drop, identifier, source-reference, availability-consistency, and review-status quality gates
8. uploads the static site, reports, crawler report, and raw snapshots as a workflow artifact
9. opens or updates a review pull request containing only `data/current` and `data/exports`

The 2026-07-24 local full-crawl baseline is 61 registry URLs, 61 successful snapshots, 0 crawl failures, 0 duplicate URLs, and 55 extracted records. A future crawl can still legitimately produce failed pages if an official site changes, times out, or blocks access; review the crawler report and generated review reports before merging.

Recommended early operation:

```txt
Daily crawl -> automated quality gate -> review generated PR/artifact -> merge if sane -> run deploy workflow manually
```

Do not push crawler outputs directly to the default branch without review.

Before merging a generated data PR, check:

- `data/snapshots/current-run/crawler-report.json` has expected success/failure counts.
- `data/current/parser-health.json` explains parser warnings and failed pages.
- `data/current/scheduled-quality-report.json` passed and any warnings are understood.
- `data/current/review-needed.md` lists low-confidence and sparse records.
- `data/current/reliability-audit.md` does not show risky auto-published multilingual records.
- `data/current/lead-time-summary.json` does not present low-confidence estimates as facts.

When rerunning crawls locally or in Actions, the crawler clears generated files in the output directory before writing new snapshots. This prevents stale snapshot files from being included in later static data builds.

## Rollback

To rollback a bad deployment:

1. Revert the commit that changed `data/current`, `data/exports`, parser code, or frontend code.
2. Run CI and confirm `pnpm build` passes.
3. Run the manual GitHub Pages deployment workflow again from the reverted commit.

For an urgent rollback, redeploy the last known-good commit from GitHub Actions or revert the generated data PR before deploying again.

## Disable Crawler Quickly

If crawling needs to stop immediately:

1. Comment out or remove the `schedule` block in `.github/workflows/crawl.yml`.
2. Disable the `Crawl Data Refresh` workflow in GitHub Actions repository settings if needed.
3. Cancel any running crawl workflow.
4. Set source entries to `blocked` or `inactive` when a public page should no longer be fetched.
5. Remove or lower priority for sources that need manual review before another crawl.

Disabling the workflow in GitHub Actions is the fastest emergency stop and does not affect the published static site.

## Manual Checks Before Public Deployment

- Review the liability disclaimer and make clear the site is not an official hospital availability guarantee.
- Review data accuracy for the first 20-30 records.
- Review `source-coverage.md`, `reliability-audit.md`, and `review-needed.md`.
- Confirm German, French, Italian, English, and mixed-language records are labeled with the correct confidence and review status.
- Confirm lead-time values distinguish `explicitly stated by source` from estimates or public page history.
- Ask at least two medical students to test search, filtering, and detail pages.
- Confirm no login-only pages, private emails, private documents, or private screenshots were used.
- Spot-check source links from the deployed site.
