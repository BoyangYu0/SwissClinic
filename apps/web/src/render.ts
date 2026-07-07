import type {
  ChangeRecord,
  LeadTimeSummary,
  PlacementRecord,
  SourceRegistryEntry,
} from "@scpi/schema";
import { createPlacementIndexViewModel } from "./placement-index.js";

export interface RenderPlacementIndexOptions {
  placements: PlacementRecord[];
  sources: SourceRegistryEntry[];
  leadTimeSummaries?: LeadTimeSummary[];
  csvHref: string;
  dataHref: string;
  sourceDetailBaseHref?: string;
}

export interface RenderSourceDetailOptions {
  source: SourceRegistryEntry | null;
  placements: PlacementRecord[];
  changes: ChangeRecord[];
  indexHref: string;
}

export function renderPlacementIndexPage(options: RenderPlacementIndexOptions): string {
  const viewModel = createPlacementIndexViewModel(options.placements, options.sources);
  const sourceDetailBaseHref = options.sourceDetailBaseHref ?? "sources";
  const initialState = escapeScriptJson({
    placements: viewModel.placements,
    sources: viewModel.sources,
    leadTimeSummaries: options.leadTimeSummaries ?? [],
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Swiss Clinical Placement Index</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f8;
        --panel: #ffffff;
        --ink: #17202a;
        --muted: #5f6c7b;
        --line: #d7dde4;
        --accent: #c62828;
        --accent-soft: #fff0f0;
        --blue: #1f5eff;
        --green: #1f7a4d;
        --amber: #9b6500;
        --radius: 8px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
      }

      a {
        color: var(--blue);
      }

      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      }

      .sidebar {
        background: #20242b;
        color: #ffffff;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
      }

      .mark {
        width: 42px;
        height: 42px;
        border-radius: var(--radius);
        display: grid;
        place-items: center;
        background: var(--accent);
        color: #ffffff;
        font-weight: 800;
      }

      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
        letter-spacing: 0;
      }

      .meta {
        margin: 4px 0 0;
        color: #cbd3dd;
        font-size: 13px;
      }

      .stats {
        display: grid;
        gap: 8px;
      }

      .stat {
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: var(--radius);
        padding: 10px 12px;
      }

      .stat strong {
        display: block;
        font-size: 22px;
      }

      .stat span {
        color: #cbd3dd;
        font-size: 12px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .button {
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: var(--radius);
        background: #ffffff;
        color: #20242b;
        min-height: 38px;
        padding: 8px 12px;
        text-decoration: none;
        font-weight: 700;
        font-size: 14px;
      }

      .main {
        min-width: 0;
        padding: 20px;
      }

      .toolbar {
        display: grid;
        grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(130px, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .filters {
        display: grid;
        grid-template-columns: repeat(7, minmax(120px, 1fr));
        gap: 10px;
        margin-bottom: 16px;
      }

      label {
        display: grid;
        gap: 5px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      input,
      select {
        width: 100%;
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
        color: var(--ink);
        padding: 8px 10px;
        font: inherit;
        font-size: 14px;
      }

      .table-wrap {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
      }

      table {
        width: 100%;
        min-width: 1050px;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }

      th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #eef1f5;
        color: #364150;
        font-size: 12px;
        text-transform: uppercase;
      }

      tbody tr {
        cursor: pointer;
      }

      tbody tr:hover {
        background: #f7fafc;
      }

      .primary-cell {
        min-width: 220px;
      }

      .cell-title {
        display: block;
        font-weight: 800;
      }

      .cell-subtitle {
        color: var(--muted);
        font-size: 13px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 3px 8px;
        border-radius: var(--radius);
        border: 1px solid var(--line);
        background: #f8fafc;
        color: #364150;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .badge.high,
      .badge.available {
        border-color: #b6dec8;
        background: #effaf4;
        color: var(--green);
      }

      .badge.medium,
      .badge.review,
      .badge.application-only {
        border-color: #f1d390;
        background: #fff8e8;
        color: var(--amber);
      }

      .badge.low,
      .badge.needs-human-review,
      .badge.not-specified,
      .badge.unclear {
        border-color: #f0b7b7;
        background: var(--accent-soft);
        color: var(--accent);
      }

      .empty {
        display: none;
        border: 1px dashed var(--line);
        border-radius: var(--radius);
        padding: 24px;
        color: var(--muted);
        background: var(--panel);
      }

      .drawer {
        position: fixed;
        inset: 0 0 0 auto;
        width: min(560px, 100vw);
        background: var(--panel);
        border-left: 1px solid var(--line);
        box-shadow: -16px 0 32px rgba(0, 0, 0, 0.18);
        transform: translateX(104%);
        transition: transform 160ms ease;
        z-index: 10;
        overflow: auto;
      }

      .drawer.open {
        transform: translateX(0);
      }

      .drawer-head {
        position: sticky;
        top: 0;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 18px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }

      .icon-button {
        width: 38px;
        height: 38px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: #ffffff;
        color: var(--ink);
        font-size: 22px;
        cursor: pointer;
      }

      .drawer-body {
        padding: 18px;
        display: grid;
        gap: 18px;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .detail-field {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 10px;
      }

      .detail-field span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
      }

      .warning-list {
        margin: 0;
        padding-left: 18px;
        color: var(--accent);
      }

      .snippet {
        margin: 0;
        color: #364150;
        line-height: 1.5;
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          padding: 16px;
        }

        .toolbar,
        .filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 620px) {
        .main {
          padding: 12px;
        }

        .toolbar,
        .filters,
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark" aria-hidden="true">CH</div>
          <div>
            <h1>Swiss Clinical Placement Index</h1>
            <p class="meta">Last checked: ${escapeHtml(formatDate(viewModel.summary.lastChecked))}</p>
          </div>
        </div>
        <div class="stats" aria-label="Dataset summary">
          <div class="stat"><strong>${viewModel.summary.totalPlacements}</strong><span>placement records</span></div>
          <div class="stat"><strong>${viewModel.summary.sourceCount}</strong><span>official source pages</span></div>
          <div class="stat"><strong>${viewModel.summary.needingReview}</strong><span>records needing review</span></div>
        </div>
        <div class="actions">
          <a class="button" href="${escapeHtml(options.csvHref)}" download>CSV</a>
          <a class="button" href="${escapeHtml(options.dataHref)}">JSON</a>
        </div>
      </aside>
      <main class="main">
        <form id="filters" aria-label="Placement filters">
          <div class="toolbar">
            ${renderInput("query", "Search", "Institution, department, notes")}
            ${renderSelect("canton", "Canton", viewModel.filters.cantons)}
            ${renderSelect("city", "City", viewModel.filters.cities)}
            ${renderSelect("institutionName", "Institution", viewModel.filters.institutions)}
          </div>
          <div class="filters">
            ${renderSelect("department", "Department", viewModel.filters.departments)}
            ${renderSelect("roleType", "Role", viewModel.filters.roleTypes)}
            ${renderSelect("availabilityStatus", "Availability", viewModel.filters.availabilityStatuses)}
            ${renderSelect("availableFrom", "Available from", viewModel.filters.availableFromMonths)}
            ${renderSelect("confidence", "Confidence", viewModel.filters.confidences)}
            ${renderSelect("language", "Language", viewModel.filters.languages)}
            ${renderSelect("region", "Region", viewModel.filters.regions)}
          </div>
        </form>
        <section class="table-wrap" aria-live="polite">
          <table>
            <thead>
              <tr>
                <th>Placement</th>
                <th>Location</th>
                <th>Availability</th>
                <th>Duration</th>
                <th>Language</th>
                <th>Application</th>
                <th>Confidence</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody id="placement-rows"></tbody>
          </table>
        </section>
        <p id="empty-state" class="empty">No placement records match the selected filters.</p>
      </main>
    </div>
    <aside id="record-detail" class="drawer" aria-hidden="true" aria-label="Placement detail">
      <div class="drawer-head">
        <div>
          <strong id="detail-title">Placement detail</strong>
          <p id="detail-subtitle" class="meta"></p>
        </div>
        <button class="icon-button" type="button" id="detail-close" aria-label="Close detail">x</button>
      </div>
      <div id="detail-body" class="drawer-body"></div>
    </aside>
    <script id="placement-data" type="application/json">${initialState}</script>
    <script>
      const state = JSON.parse(document.getElementById("placement-data").textContent);
      const records = state.placements;
      const leadTimeSummaries = state.leadTimeSummaries || [];
      const rows = document.getElementById("placement-rows");
      const form = document.getElementById("filters");
      const empty = document.getElementById("empty-state");
      const drawer = document.getElementById("record-detail");
      const detailTitle = document.getElementById("detail-title");
      const detailSubtitle = document.getElementById("detail-subtitle");
      const detailBody = document.getElementById("detail-body");
      const closeButton = document.getElementById("detail-close");

      function text(value) {
        return value === null || value === undefined || value === "" ? "Not specified" : String(value);
      }

      function displayLabel(value) {
        const labels = {
          "application-only": "Application only",
          "auto-published": "Auto published",
          "available-from": "Available from",
          "fully-booked-until": "Fully booked until",
          "generic-parser": "Generic parser",
          "hospital-confirmed": "Hospital confirmed",
          "needs-human-review": "Needs human review",
          "not-specified": "Not specified",
          "site-parser": "Site parser"
        };
        return labels[value] || text(value);
      }

      function escapeHtml(value) {
        return text(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function badge(value, extraClass) {
        const className = String(value).replaceAll("_", "-").replaceAll(" ", "-");
        return '<span class="badge ' + className + ' ' + (extraClass || "") + '">' + escapeHtml(displayLabel(value)) + '</span>';
      }

      function normalized(value) {
        return value === null || value === undefined ? "" : String(value).toLowerCase();
      }

      function getFilters() {
        return Object.fromEntries(new FormData(form).entries());
      }

      function matches(value, filterValue) {
        return !filterValue || value === filterValue;
      }

      function searchText(record) {
        return [
          record.institutionName,
          record.department,
          record.departmentNormalized,
          record.roleType,
          record.canton,
          record.city,
          record.availabilityStatus,
          record.availableFrom,
          record.contactEmail,
          record.contactName,
          record.eligibilityNotes,
          record.extractedSnippet
        ].filter(Boolean).join(" ").toLowerCase();
      }

      function filteredRecords() {
        const filters = getFilters();
        const query = normalized(filters.query).trim();
        return records.filter((record) => {
          if (query && !searchText(record).includes(query)) return false;
          return matches(record.canton, filters.canton)
            && matches(record.city, filters.city)
            && matches(record.institutionName, filters.institutionName)
            && matches(record.departmentNormalized || record.department, filters.department)
            && matches(record.roleType, filters.roleType)
            && matches(record.availabilityStatus, filters.availabilityStatus)
            && matches(record.availableFrom, filters.availableFrom)
            && matches(record.confidence, filters.confidence)
            && matches(record.language, filters.language)
            && matches(record.region, filters.region);
        });
      }

      function renderRows() {
        const visible = filteredRecords();
        rows.innerHTML = visible.map((record) => {
          const duration = record.durationMinWeeks && record.durationMaxWeeks
            ? record.durationMinWeeks + "-" + record.durationMaxWeeks + " weeks"
            : text(record.durationMinWeeks ? record.durationMinWeeks + " weeks" : null);
          const apply = record.applicationUrl
            ? '<a href="' + escapeHtml(record.applicationUrl) + '">' + escapeHtml(record.applicationMethod) + '</a>'
            : escapeHtml(record.applicationMethod);
          return '<tr tabindex="0" data-record-id="' + escapeHtml(record.id) + '">'
            + '<td class="primary-cell"><span class="cell-title">' + escapeHtml(record.institutionName) + '</span><span class="cell-subtitle">' + escapeHtml(record.originalDepartmentName || record.department) + " / " + escapeHtml(record.departmentNormalized) + " / " + escapeHtml(record.roleTypeOriginal || record.roleType) + '</span></td>'
            + '<td>' + escapeHtml([record.canton, record.city].filter(Boolean).join(" / ")) + '</td>'
            + '<td>' + badge(record.availabilityStatus) + '<br><span class="cell-subtitle">' + escapeHtml(record.availableFrom || record.fullyBookedUntil) + '</span></td>'
            + '<td>' + escapeHtml(duration) + '</td>'
            + '<td>' + badge(record.extractionLanguage || record.language) + '<br><span class="cell-subtitle">' + escapeHtml(record.region) + '</span></td>'
            + '<td>' + apply + '</td>'
            + '<td>' + badge(record.confidence) + '<br>' + badge(record.reviewStatus) + '</td>'
            + '<td><a href="' + escapeHtml(record.sourceUrl) + '">Official source</a><br><a href="${escapeHtml(sourceDetailBaseHref)}/' + encodeURIComponent(record.sourceId) + '/">Source detail</a><br><span class="cell-subtitle">' + escapeHtml(record.lastChecked.slice(0, 10)) + '</span></td>'
            + '</tr>';
        }).join("");
        empty.style.display = visible.length === 0 ? "block" : "none";
      }

      function detailField(label, value) {
        return '<div class="detail-field"><span>' + escapeHtml(label) + '</span>' + escapeHtml(displayLabel(value)) + '</div>';
      }

      function leadTimeSummaryFor(record) {
        return record.leadTimeSummaryId
          ? leadTimeSummaries.find((summary) => summary.id === record.leadTimeSummaryId)
          : null;
      }

      function leadTimeDetailHtml(record) {
        const summary = leadTimeSummaryFor(record);
        const fields = [];

        if (record.explicitApplicationLeadTimeMonths !== null && record.explicitApplicationLeadTimeMonths !== undefined) {
          fields.push(detailField("Explicit lead time", record.explicitApplicationLeadTimeMonths + " months ahead (explicitly stated by source)"));
        }

        if (record.observedMonthsAhead !== null && record.observedMonthsAhead !== undefined) {
          fields.push(detailField("Observed lead time", record.observedMonthsAhead + " months ahead (estimated from public page history)"));
        }

        if (summary && (summary.confidence === "medium" || summary.confidence === "high") && summary.recommendedApplyAheadMinMonths !== null) {
          const max = summary.recommendedApplyAheadMaxMonths === summary.recommendedApplyAheadMinMonths
            ? ""
            : "-" + summary.recommendedApplyAheadMaxMonths;
          fields.push(detailField("Recommended apply-ahead window", summary.recommendedApplyAheadMinMonths + max + " months (" + summary.label + ")"));
        } else if (summary && summary.confidence === "low") {
          fields.push(detailField("Lead-time estimate", summary.label + " Warning: low confidence estimate."));
        }

        return fields.length
          ? '<div><strong>Lead time</strong><div class="detail-grid">' + fields.join("") + '</div></div>'
          : '<div><strong>Lead time</strong><p>No explicit or historical lead-time evidence yet.</p></div>';
      }

      function openDetail(record) {
        detailTitle.textContent = record.institutionName;
        detailSubtitle.textContent = [record.department || record.departmentNormalized, record.roleType].filter(Boolean).join(" / ");
        detailBody.innerHTML = '<div class="detail-grid">'
          + detailField("Availability", record.availabilityStatus)
          + detailField("Available from", record.availableFrom)
          + detailField("Fully booked until", record.fullyBookedUntil)
          + detailField("Application", record.applicationMethod)
          + detailField("Original department", record.originalDepartmentName || record.department)
          + detailField("Normalized department", record.departmentNormalized)
          + detailField("Extraction language", record.extractionLanguage || record.language)
          + detailField("Region", record.region)
          + detailField("Contact", record.contactEmail || record.contactName)
          + detailField("Last checked", record.lastChecked.slice(0, 10))
          + '</div>'
          + leadTimeDetailHtml(record)
          + '<div><strong>Source</strong><p><a href="' + escapeHtml(record.sourceUrl) + '">' + escapeHtml(record.sourceUrl) + '</a></p></div>'
          + '<div><strong>Warnings</strong>' + (record.warnings.length ? '<ul class="warning-list">' + record.warnings.map((warning) => '<li>' + escapeHtml(warning) + '</li>').join("") + '</ul>' : '<p>No parser warnings.</p>') + '</div>'
          + '<div><strong>Source snippet</strong><p class="snippet">' + escapeHtml(record.extractedSnippet) + '</p></div>';
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }

      rows.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-record-id]");
        if (!row) return;
        const record = records.find((item) => item.id === row.dataset.recordId);
        if (record) openDetail(record);
      });

      rows.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const row = event.target.closest("tr[data-record-id]");
        if (!row) return;
        const record = records.find((item) => item.id === row.dataset.recordId);
        if (record) openDetail(record);
      });

      closeButton.addEventListener("click", () => {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      });

      form.addEventListener("input", renderRows);
      renderRows();
    </script>
  </body>
</html>`;
}

export function renderSourceDetailPage(options: RenderSourceDetailOptions): string {
  if (!options.source) {
    return renderMissingSourcePage(options.indexHref);
  }

  const source = options.source;
  const lastChecked = newestDate(options.placements.map((record) => record.lastChecked));
  const extractionMethods = unique(options.placements.map((record) => record.extractionMethod));
  const parserStatuses = parserStatusLabels(options.placements);
  const warnings = unique(options.placements.flatMap((record) => record.warnings));
  const sourceUrls = source.sourceUrls.map((sourceUrl) => sourceUrl.url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(source.institutionName)} provenance</title>
    ${renderDetailStyles()}
  </head>
  <body>
    <main class="page">
      <nav class="topline">
        <a href="${escapeHtml(options.indexHref)}">All placements</a>
        <span>${escapeHtml(source.id)}</span>
      </nav>
      <header class="source-head">
        <div>
          <h1>${escapeHtml(source.institutionName)}</h1>
          <p>${escapeHtml([source.institutionType, source.canton, source.city].filter(Boolean).join(" / "))}</p>
        </div>
        <div class="status-stack">
          ${parserStatuses.map((status) => badge(status)).join("")}
        </div>
      </header>
      <section class="summary-grid" aria-label="Source provenance summary">
        ${detailMetric("Last checked", formatDate(lastChecked))}
        ${detailMetric("Extraction method", extractionMethods.join(", ") || "No records extracted")}
        ${detailMetric("Related records", String(options.placements.length))}
        ${detailMetric("Recent changes", String(options.changes.length))}
      </section>
      <section class="section">
        <h2>Source URLs</h2>
        <ul class="link-list">
          ${sourceUrls.map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join("")}
        </ul>
      </section>
      <section class="section">
        <h2>Related Placement Records</h2>
        ${renderSourcePlacementTable(options.placements)}
      </section>
      <section class="section">
        <h2>Recent Changes</h2>
        ${renderChangeList(options.changes)}
      </section>
      <section class="section">
        <h2>Known Warnings</h2>
        ${
          warnings.length
            ? `<ul class="warning-list">${warnings
                .map((warning) => `<li>${escapeHtml(warning)}</li>`)
                .join("")}</ul>`
            : "<p>No parser warnings for this source.</p>"
        }
      </section>
    </main>
  </body>
</html>`;
}

function renderMissingSourcePage(indexHref: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Source not found</title>
    ${renderDetailStyles()}
  </head>
  <body>
    <main class="page">
      <nav class="topline"><a href="${escapeHtml(indexHref)}">All placements</a></nav>
      <section class="empty-panel">
        <h1>Source not found</h1>
        <p>This source is not present in the current static dataset.</p>
      </section>
    </main>
  </body>
</html>`;
}

function renderSourcePlacementTable(placements: PlacementRecord[]): string {
  if (placements.length === 0) {
    return '<p class="muted">No placement records were extracted from this source.</p>';
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Department</th>
          <th>Role</th>
          <th>Availability</th>
          <th>Confidence</th>
          <th>Last checked</th>
        </tr>
      </thead>
      <tbody>
        ${placements
          .map(
            (record) => `<tr>
              <td>${escapeHtml(record.department ?? record.departmentNormalized ?? "Not specified")}</td>
              <td>${escapeHtml(record.roleType)}</td>
              <td>${badge(record.availabilityStatus)} ${escapeHtml(
                record.availableFrom ?? record.fullyBookedUntil ?? "",
              )}</td>
              <td>${badge(record.confidence)} ${badge(record.reviewStatus)}</td>
              <td>${escapeHtml(record.lastChecked.slice(0, 10))}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function renderChangeList(changes: ChangeRecord[]): string {
  if (changes.length === 0) {
    return '<p class="muted">No recent changes recorded for this source.</p>';
  }

  return `<ol class="change-list">
    ${changes
      .map(
        (change) => `<li>
          <div>${badge(change.severity)} ${badge(change.changeType)}</div>
          <strong>${escapeHtml(change.detectedAt.slice(0, 10))}</strong>
          <p>${escapeHtml(change.message)}</p>
          <a href="${escapeHtml(change.url)}">Changed URL</a>
        </li>`,
      )
      .join("")}
  </ol>`;
}

function renderDetailStyles(): string {
  return `<style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #5f6c7b;
      --line: #d7dde4;
      --accent: #c62828;
      --accent-soft: #fff0f0;
      --blue: #1f5eff;
      --green: #1f7a4d;
      --amber: #9b6500;
      --radius: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
    }

    a {
      color: var(--blue);
    }

    .page {
      width: min(1180px, 100%);
      margin: 0 auto;
      padding: 20px;
      display: grid;
      gap: 18px;
    }

    .topline {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 14px;
    }

    .source-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 16px;
    }

    h1,
    h2,
    p {
      margin-top: 0;
    }

    h1 {
      margin-bottom: 6px;
      font-size: 28px;
      letter-spacing: 0;
    }

    h2 {
      font-size: 18px;
      letter-spacing: 0;
    }

    .status-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .metric,
    .section,
    .empty-panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel);
      padding: 14px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    .metric strong {
      display: block;
      margin-top: 4px;
      font-size: 16px;
    }

    .link-list,
    .warning-list {
      margin: 0;
      padding-left: 18px;
    }

    .warning-list {
      color: var(--accent);
    }

    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius);
    }

    table {
      width: 100%;
      min-width: 760px;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }

    th {
      background: #eef1f5;
      color: #364150;
      font-size: 12px;
      text-transform: uppercase;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      background: #f8fafc;
      color: #364150;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }

    .badge.high,
    .badge.available,
    .badge.info {
      border-color: #b6dec8;
      background: #effaf4;
      color: var(--green);
    }

    .badge.medium,
    .badge.review,
    .badge.application-only {
      border-color: #f1d390;
      background: #fff8e8;
      color: var(--amber);
    }

    .badge.low,
    .badge.critical,
    .badge.needs-human-review,
    .badge.not-specified,
    .badge.unclear,
    .badge.error {
      border-color: #f0b7b7;
      background: var(--accent-soft);
      color: var(--accent);
    }

    .change-list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding-left: 22px;
    }

    .change-list li {
      padding-left: 4px;
    }

    .change-list p {
      margin: 6px 0;
      color: #364150;
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 760px) {
      .page {
        padding: 12px;
      }

      .source-head,
      .topline {
        display: grid;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }

      .status-stack {
        justify-content: flex-start;
      }
    }
  </style>`;
}

function detailMetric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value,
  )}</strong></div>`;
}

function badge(value: string): string {
  const className = value.replaceAll("_", "-").replaceAll(" ", "-");
  return `<span class="badge ${escapeHtml(className)}">${escapeHtml(displayLabel(value))}</span>`;
}

function parserStatusLabels(placements: PlacementRecord[]): string[] {
  if (placements.length === 0) {
    return ["no-records"];
  }

  if (placements.some((record) => record.reviewStatus === "needs-human-review")) {
    return ["needs-human-review"];
  }

  return ["parsed"];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function newestDate(values: string[]): string | null {
  const newest = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];

  return newest === undefined ? null : new Date(newest).toISOString();
}

function renderInput(name: string, label: string, placeholder: string): string {
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" type="search" placeholder="${escapeHtml(
    placeholder,
  )}"></label>`;
}

function renderSelect(
  name: string,
  label: string,
  options: Array<{ value: string; label: string }>,
): string {
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}"><option value="">All</option>${options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    )
    .join("")}</select></label>`;
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "Not checked";
}

function displayLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    "application-only": "Application only",
    "auto-published": "Auto published",
    "available-from": "Available from",
    "fully-booked-until": "Fully booked until",
    "generic-parser": "Generic parser",
    "hospital-confirmed": "Hospital confirmed",
    "needs-human-review": "Needs human review",
    "not-specified": "Not specified",
    "site-parser": "Site parser",
  };

  return value ? (labels[value] ?? value) : "Not specified";
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
