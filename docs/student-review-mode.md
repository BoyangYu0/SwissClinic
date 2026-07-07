# Student Review Mode

Swiss Clinical Placement Index is a static GitHub Pages beta. Review mode helps medical students verify extracted placement records without requiring a login, database, or backend.

## Enable Review Mode

- Open the static site and click **Enable review mode**.
- Or open the index with `?review=1`, for example `index.html?review=1`.
- Open any placement row. The placement detail drawer will include a compact **Medical student review** panel.

## How To Verify A Record

1. Open the linked official source page.
2. Compare the extracted institution, department, availability, application link, and confidence warning against the official page.
3. Fill the structured yes/no/unsure fields.
4. Choose a verdict:
   - `correct`: the extracted record matches the official source.
   - `partly-wrong`: some fields are right, but at least one important field needs correction.
   - `wrong`: the extracted record is misleading or mostly incorrect.
   - `not-relevant`: the page is not a medical-student placement source.
   - `unknown`: you cannot verify it from the available page.
5. Add an optional comment if it helps maintainers understand the issue.
6. Use **Open GitHub issue** or **Copy JSON**.

## Review Queue

Open `review-queue.html` to work through records in priority order. The queue prioritizes:

- low-confidence records
- records from generic or non-site-specific parsers
- non-German records
- records with availability dates
- records with explicit or observed lead-time evidence

The queue can be filtered by canton, language, confidence, and parser type.

## Privacy And Source Rules

- Do not paste private emails, phone numbers, personal names, private application replies, or unredacted screenshots.
- Do not include patient information or hospital-internal material.
- Official source pages remain authoritative. Student review mode is a verification workflow, not a replacement for the official hospital or university page.
- If the official source is unclear, select `unknown` or `unsure` instead of guessing.
