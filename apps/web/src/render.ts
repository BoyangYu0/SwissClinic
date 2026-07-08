import type {
  ChangeRecord,
  LeadTimeSummary,
  PlacementRecord,
  ReliabilitySummary,
  SourceRegistryEntry,
} from "@scpi/schema";
import {
  canonicalAvailabilityStatus,
  canonicalDepartment,
  canonicalRoleType,
  createPlacementIndexViewModel,
  createReviewQueue,
  displayLabel as displayPlacementLabel,
  type ReviewQueueItem,
} from "./placement-index.js";
import {
  buildFeedbackIssueUrl,
  type FeedbackType,
  feedbackLabel,
  feedbackTypes,
  REVIEW_ISSUE_URL,
} from "./review-mode.js";

export interface RenderPlacementIndexOptions {
  placements: PlacementRecord[];
  sources: SourceRegistryEntry[];
  leadTimeSummaries?: LeadTimeSummary[];
  reliabilitySummaries?: ReliabilitySummary[];
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
    reliabilitySummaries: options.reliabilitySummaries ?? [],
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

      .coverage-note {
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: var(--radius);
        padding: 10px 12px;
        color: #dce3eb;
        font-size: 12px;
        line-height: 1.45;
      }

      .coverage-note p {
        margin: 0 0 6px;
      }

      .coverage-note p:last-child {
        margin-bottom: 0;
      }

      .button {
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: var(--radius);
        background: #ffffff;
        color: #20242b;
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 12px;
        text-decoration: none;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
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
      select,
      textarea {
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

      textarea {
        min-height: 92px;
        resize: vertical;
      }

      .review-panel {
        border: 1px solid #b8c7dc;
        border-radius: var(--radius);
        background: #f7fbff;
        padding: 12px;
        display: grid;
        gap: 12px;
      }

      .review-panel h3 {
        margin: 0;
        font-size: 16px;
        letter-spacing: 0;
      }

      .review-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .review-actions a,
      .review-actions button {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: #ffffff;
        color: var(--ink);
        min-height: 36px;
        padding: 8px 10px;
        font: inherit;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
      }

      .review-json {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 140px;
      }

      .feedback-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .feedback-link {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: #ffffff;
        color: var(--blue);
        display: inline-flex;
        align-items: center;
        width: fit-content;
        min-height: 32px;
        padding: 6px 8px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.2;
      }

      .source-cell {
        display: grid;
        justify-items: start;
        gap: 6px;
      }

      .source-cell .cell-subtitle {
        margin-top: 2px;
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

      .placement-meta {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      .department-highlight {
        background: #eaf2ff;
        border: 1px solid #bfd5f2;
        border-radius: 4px;
        color: #123c69;
        display: inline-flex;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.2;
        padding: 3px 6px;
      }

      .role-label {
        color: #4c5664;
        font-size: 13px;
        font-weight: 700;
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
          <a class="button" href="data/current/coverage-by-baseline.md">Coverage</a>
          <a class="button" href="data/current/missing-sources.md">Missing</a>
          <a class="button" href="review-queue.html">Review queue</a>
          <a class="button" href="https://github.com/BoyangYu0/SwissClinic">GitHub</a>
          <a class="button" href="mailto:karl_ychen@outlook.com">Email</a>
        </div>
        <div class="coverage-note">
          <p>Record count is not national clinic coverage.</p>
          <p>Coverage is measured against selected baselines.</p>
          <p>Candidate sources may not yet be verified.</p>
          <p>Some hospitals may not publish placement availability online.</p>
          <p>Project: <a href="https://github.com/BoyangYu0/SwissClinic">GitHub</a> / <a href="mailto:karl_ychen@outlook.com">karl_ychen@outlook.com</a></p>
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
      const sources = state.sources || [];
      const leadTimeSummaries = state.leadTimeSummaries || [];
      const reliabilitySummaries = state.reliabilitySummaries || [];
      const reviewIssueUrl = ${escapeScriptJson(REVIEW_ISSUE_URL)};
      const feedbackTypes = ${escapeScriptJson(feedbackTypes)};
      const feedbackLabels = ${escapeScriptJson(
        Object.fromEntries(feedbackTypes.map((type) => [type, feedbackLabel(type)])),
      )};
      const rows = document.getElementById("placement-rows");
      const form = document.getElementById("filters");
      const empty = document.getElementById("empty-state");
      const drawer = document.getElementById("record-detail");
      const detailTitle = document.getElementById("detail-title");
      const detailSubtitle = document.getElementById("detail-subtitle");
      const detailBody = document.getElementById("detail-body");
      const closeButton = document.getElementById("detail-close");
      let activeRecord = null;
      let reviewModeEnabled = new URLSearchParams(window.location.search).get("review") === "1";

      function text(value) {
        return value === null || value === undefined || value === "" ? "Not specified" : String(value);
      }

      function displayLabel(value) {
        const labels = {
          "application-only": "Application only",
          "auto-published": "Auto published",
          "available-from": "Available from",
          "clinical-elective": "Clinical elective",
          "fully-booked-until": "Fully booked until",
          "generic-parser": "Generic parser",
          "hospital-confirmed": "Hospital confirmed",
          "student-checked": "Student checked",
          "multiple-student-checked": "Multiple student checked",
          "conflicting-reports": "Conflicting reports",
          "unverified": "Unverified",
          "needs-human-review": "Needs human review",
          "not-specified": "Not specified",
          "site-parser": "Site parser"
        };
        return labels[value] || text(value);
      }

      const departmentLabels = {
        "anesthesie": ["anesthesiology", "Anesthesiology"],
        "anaesthesie": ["anesthesiology", "Anesthesiology"],
        "anesthesiologie": ["anesthesiology", "Anesthesiology"],
        "anästhesiologie": ["anesthesiology", "Anesthesiology"],
        "anesthesiology": ["anesthesiology", "Anesthesiology"],
        "augenheilkunde": ["ophthalmology", "Ophthalmology"],
        "chirurgie": ["surgery", "Surgery"],
        "chirurgia": ["surgery", "Surgery"],
        "emergency-medicine": ["emergency-medicine", "Emergency medicine"],
        "frauenheilkunde": ["gynecology", "Gynecology"],
        "gynecology": ["gynecology", "Gynecology"],
        "gynakologie": ["gynecology", "Gynecology"],
        "gynaekologie": ["gynecology", "Gynecology"],
        "gynäkologie": ["gynecology", "Gynecology"],
        "gynécologie": ["gynecology", "Gynecology"],
        "ginecologia": ["gynecology", "Gynecology"],
        "innere-medizin": ["internal-medicine", "Internal medicine"],
        "internal-medicine": ["internal-medicine", "Internal medicine"],
        "medecine-interne": ["internal-medicine", "Internal medicine"],
        "médecine-interne": ["internal-medicine", "Internal medicine"],
        "medicina-interna": ["internal-medicine", "Internal medicine"],
        "neuroradiologie": ["neuroradiology", "Neuroradiology"],
        "neuroradiology": ["neuroradiology", "Neuroradiology"],
        "notfallmedizin": ["emergency-medicine", "Emergency medicine"],
        "pronto-soccorso": ["emergency-medicine", "Emergency medicine"],
        "urgences": ["emergency-medicine", "Emergency medicine"],
        "ophthalmology": ["ophthalmology", "Ophthalmology"],
        "orthopadie": ["orthopedics", "Orthopedics"],
        "orthopaedie": ["orthopedics", "Orthopedics"],
        "orthopädie": ["orthopedics", "Orthopedics"],
        "orthopedics": ["orthopedics", "Orthopedics"],
        "padiatrie": ["pediatrics", "Pediatrics"],
        "paediatrie": ["pediatrics", "Pediatrics"],
        "pediatrics": ["pediatrics", "Pediatrics"],
        "pediatria": ["pediatrics", "Pediatrics"],
        "pediatrie": ["pediatrics", "Pediatrics"],
        "pédiatrie": ["pediatrics", "Pediatrics"],
        "pädiatrie": ["pediatrics", "Pediatrics"],
        "psychiatrie": ["psychiatry", "Psychiatry"],
        "psychiatry": ["psychiatry", "Psychiatry"],
        "psichiatria": ["psychiatry", "Psychiatry"],
        "radiologie": ["radiology", "Radiology"],
        "radiologia": ["radiology", "Radiology"],
        "radiology": ["radiology", "Radiology"],
        "surgery": ["surgery", "Surgery"],
        "traumatologie": ["orthopedics", "Orthopedics"]
      };

      function departmentKey(value) {
        return text(value)
          .normalize("NFKD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .toLowerCase()
          .replace(/&/g, " and ")
          .replace(/[^a-z0-9äöüéèàùç]+/gi, "-")
          .replace(/^-+|-+$/g, "");
      }

      function titleCase(value) {
        return text(value).replaceAll("-", " ").replace(/\\w\\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
      }

      function departmentDisplay(record) {
        const raw = record.departmentNormalized || record.department || record.originalDepartmentName || "not-specified";
        const mapped = departmentLabels[departmentKey(raw)];
        if (mapped) return { value: mapped[0], label: mapped[1] };
        if (raw === "not-specified") return { value: "not-specified", label: "Not specified" };
        return { value: departmentKey(raw) || "not-specified", label: raw.includes("-") ? titleCase(raw) : raw };
      }

      function roleDisplay(record) {
        if (record.roleType === "Unterassistenz" || record.roleType === "Wahlstudienjahr" || record.roleType === "ClinicalPlacement" || /\\b(stage|sous-assistant|tirocinio)\\b/i.test(record.roleTypeOriginal || "")) {
          return { value: "clinical-elective", label: "Clinical elective" };
        }
        if (record.roleType === "Unknown") return { value: "not-specified", label: "Not specified" };
        return { value: record.roleType, label: displayLabel(record.roleType) };
      }

      function availabilityDisplay(record) {
        if (record.availabilityStatus === "unclear" || record.availabilityStatus === "not-specified") {
          return { value: "not-specified", label: "Not specified" };
        }
        return { value: record.availabilityStatus, label: displayLabel(record.availabilityStatus) };
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
          departmentDisplay(record).label,
          record.roleType,
          roleDisplay(record).label,
          record.canton,
          record.city,
          record.availabilityStatus,
          availabilityDisplay(record).label,
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
            && matches(departmentDisplay(record).value, filters.department)
            && matches(roleDisplay(record).value, filters.roleType)
            && matches(availabilityDisplay(record).value, filters.availabilityStatus)
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
          const reliability = reliabilitySummaryFor(record)?.reliabilityLabel || "unverified";
          const department = departmentDisplay(record);
          const role = roleDisplay(record);
          const availability = availabilityDisplay(record);
          return '<tr tabindex="0" data-record-id="' + escapeHtml(record.id) + '">'
            + '<td class="primary-cell"><span class="cell-title">' + escapeHtml(record.institutionName) + '</span><span class="placement-meta"><strong class="department-highlight">' + escapeHtml(department.label) + '</strong><span class="role-label">' + escapeHtml(role.label) + '</span></span></td>'
            + '<td>' + escapeHtml([record.canton, record.city].filter(Boolean).join(" / ")) + '</td>'
            + '<td>' + badge(availability.value) + '<br><span class="cell-subtitle">' + escapeHtml(record.availableFrom || record.fullyBookedUntil) + '</span></td>'
            + '<td>' + escapeHtml(duration) + '</td>'
            + '<td>' + badge(record.extractionLanguage || record.language) + '<br><span class="cell-subtitle">' + escapeHtml(record.region) + '</span></td>'
            + '<td>' + apply + '</td>'
            + '<td>' + badge(record.confidence) + '<br>' + badge(record.reviewStatus) + '<br>' + badge(reliability) + '</td>'
            + '<td><div class="source-cell"><a href="' + escapeHtml(record.sourceUrl) + '">Official source</a><a href="${escapeHtml(sourceDetailBaseHref)}/' + encodeURIComponent(record.sourceId) + '/">Source detail</a><a class="feedback-link" target="_blank" rel="noopener" href="' + escapeHtml(reportErrorLink(record, "other")) + '">Report error</a><span class="cell-subtitle">' + escapeHtml(record.lastChecked.slice(0, 10)) + '</span></div></td>'
            + '</tr>';
        }).join("");
        empty.style.display = visible.length === 0 ? "block" : "none";
      }

      function detailField(label, value) {
        return '<div class="detail-field"><span>' + escapeHtml(label) + '</span>' + escapeHtml(displayLabel(value)) + '</div>';
      }

      function sourceFor(record) {
        return sources.find((source) => source.id === record.sourceId) || null;
      }

      function reliabilitySummaryFor(record) {
        return reliabilitySummaries.find((summary) => summary.recordId === record.id) || null;
      }

      function feedbackMetadataForRecord(record) {
        const source = sourceFor(record);
        return {
          record: {
            id: record.id,
            sourceId: record.sourceId,
            institutionName: record.institutionName,
            departmentNormalized: record.departmentNormalized,
            availabilityStatus: record.availabilityStatus,
            availableFrom: record.availableFrom,
            fullyBookedUntil: record.fullyBookedUntil,
            applicationUrl: record.applicationUrl,
            sourceLanguage: record.sourceLanguage,
            region: record.region,
            confidence: record.confidence,
            extractionMethod: record.extractionMethod,
            sourceUrl: record.sourceUrl,
            lastChecked: record.lastChecked
          },
          source: source ? {
            id: source.id,
            institutionName: source.institutionName,
            canton: source.canton,
            city: source.city,
            sourceLanguage: source.sourceLanguage,
            region: source.region,
            status: source.status,
            urls: source.sourceUrls.map((sourceUrl) => sourceUrl.url)
          } : undefined
        };
      }

      function feedbackIssueHref(feedbackType, metadata) {
        const titleSubject = metadata.record?.id || metadata.source?.id || metadata.coverageReport?.reportPath || "static-feedback";
        const params = new URLSearchParams();
        params.set("title", "[Feedback] " + feedbackLabels[feedbackType] + ": " + titleSubject);
        params.set("body", [
          "Structured static feedback submission.",
          "",
          "Feedback type: " + feedbackLabels[feedbackType] + " (" + feedbackType + ")",
          "",
          "Please describe what should change:",
          "",
          "\`\`\`json",
          JSON.stringify({ feedbackType, ...metadata }, null, 2),
          "\`\`\`",
          "",
          "Please do not paste private emails, patient information, or unredacted screenshots."
        ].join("\\n"));
        return reviewIssueUrl + "?" + params.toString();
      }

      function reportErrorLink(record, feedbackType) {
        return feedbackIssueHref(feedbackType, feedbackMetadataForRecord(record));
      }

      function feedbackLinksHtml(record) {
        const metadata = feedbackMetadataForRecord(record);
        return '<section class="review-panel feedback-panel"><h3>Report error</h3><div class="feedback-links">'
          + feedbackTypes.map((type) => '<a class="feedback-link" target="_blank" rel="noopener" href="' + escapeHtml(feedbackIssueHref(type, metadata)) + '">' + escapeHtml(feedbackLabels[type]) + '</a>').join("")
          + '</div></section>';
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

      function communityReliabilityHtml(record) {
        const summary = reliabilitySummaryFor(record);
        const label = summary ? summary.reliabilityLabel : "unverified";
        const leadTimeLine = !summary || summary.leadTimeReportCount === 0
          ? "No community lead-time reports yet."
          : summary.communityLeadTimeMedianMonthsAhead !== null
            ? "Unofficial community reports: median " + summary.communityLeadTimeMedianMonthsAhead + " months ahead (range " + summary.communityLeadTimeRangeMinMonthsAhead + "-" + summary.communityLeadTimeRangeMaxMonthsAhead + ")."
            : "Unofficial community reports are present, but not enough for a recommendation.";
        const warningLines = summary && summary.warnings.length
          ? '<ul class="warning-list">' + summary.warnings.map((warning) => '<li>' + escapeHtml(warning) + '</li>').join("") + '</ul>'
          : "";

        return '<div><strong>Community verification</strong><div class="detail-grid">'
          + detailField("Reliability", displayLabel(label))
          + detailField("Verification reports", summary ? summary.verificationCount : 0)
          + detailField("Positive reports", summary ? summary.positiveReports : 0)
          + detailField("Negative reports", summary ? summary.negativeReports : 0)
          + detailField("Latest verification", summary ? summary.latestVerificationDate : null)
          + '</div><p>' + escapeHtml(leadTimeLine) + '</p>'
          + warningLines
          + '<p class="cell-subtitle">Community evidence is unofficial. Verify current requirements with the hospital before applying.</p></div>';
      }

      function reviewSelect(name, label, options, selectedValue) {
        return '<label>' + escapeHtml(label) + '<select name="' + escapeHtml(name) + '">'
          + options.map((option) => '<option value="' + escapeHtml(option.value) + '"' + (option.value === selectedValue ? " selected" : "") + '>' + escapeHtml(option.label) + '</option>').join("")
          + '</select></label>';
      }

      function reviewPanelHtml(record) {
        if (!reviewModeEnabled) return "";
        const source = sourceFor(record);
        const answerOptions = [
          { value: "unsure", label: "Unsure" },
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" }
        ];
        return '<section class="review-panel verification-panel" data-review-record-id="' + escapeHtml(record.id) + '">'
          + '<h3>Verify this record</h3>'
          + '<p class="cell-subtitle">No login is used. Generate a GitHub issue URL or copy the JSON block after checking the official source page.</p>'
          + '<div class="detail-grid">'
          + reviewSelect("reviewerRole", "Reviewer role", [
            { value: "unknown", label: "Not specified" },
            { value: "medical-student", label: "Medical student" },
            { value: "resident", label: "Resident" },
            { value: "doctor", label: "Doctor" },
            { value: "administrator", label: "Administrator" },
            { value: "other", label: "Other" }
          ], "unknown")
          + reviewSelect("reviewerRegion", "Reviewer region", [
            { value: "unknown", label: "Not specified" },
            { value: "de-CH", label: "German-speaking Switzerland" },
            { value: "fr-CH", label: "French-speaking Switzerland" },
            { value: "it-CH", label: "Italian-speaking Switzerland" },
            { value: "mixed", label: "Mixed" }
          ], "unknown")
          + reviewSelect("verdict", "Verdict", [
            { value: "unknown", label: "Unknown" },
            { value: "correct", label: "Correct" },
            { value: "partly-wrong", label: "Partly wrong" },
            { value: "wrong", label: "Wrong" },
            { value: "not-relevant", label: "Not relevant" }
          ], "unknown")
          + reviewSelect("officialSourceCorrect", "Official source correct", answerOptions, "unsure")
          + reviewSelect("departmentCorrect", "Department correct", answerOptions, "unsure")
          + reviewSelect("availabilityCorrect", "Availability correct", answerOptions, "unsure")
          + reviewSelect("applicationLinkCorrect", "Application link correct", answerOptions, "unsure")
          + reviewSelect("confidenceSuggested", "Suggested confidence", [
            { value: "unknown", label: "Unknown" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" }
          ], "unknown")
          + '</div>'
          + '<label>Optional comment<textarea name="comment" placeholder="Do not paste private emails or unredacted screenshots."></textarea></label>'
          + '<p class="cell-subtitle">Submit via GitHub issue opens a pre-filled GitHub page in a new tab. Review the text there, sign in if GitHub asks, then click Submit new issue on GitHub. Nothing is sent until you submit it there.</p>'
          + '<div class="review-actions"><a class="review-issue-link" target="_blank" rel="noopener">Submit via GitHub issue</a><button type="button" class="review-copy">Copy JSON instead</button></div>'
          + '<textarea class="review-json" readonly aria-label="Copyable JSON review block"></textarea>'
          + '<p class="cell-subtitle">Official source pages remain authoritative.</p>'
          + '<input type="hidden" name="sourceId" value="' + escapeHtml(record.sourceId) + '">'
          + '<input type="hidden" name="currentParserType" value="' + escapeHtml(source ? source.sourceUrls.map((url) => url.expectedParser).join(", ") : record.extractionMethod) + '">'
          + '</section>';
      }

      function reviewEntryHtml() {
        if (reviewModeEnabled) return "";
        return '<section class="review-panel review-entry-panel">'
          + '<h3>Add reviews</h3>'
          + '<p class="cell-subtitle">Open the structured review forms for this placement. The site has no backend, so submissions are sent through pre-filled GitHub issues or copied as JSON.</p>'
          + '<div class="review-actions"><button type="button" class="add-reviews-button">Add reviews</button></div>'
          + '</section>';
      }

      function leadTimeReportPanelHtml(record) {
        if (!reviewModeEnabled) return "";
        return '<section class="review-panel leadtime-report-panel" data-leadtime-record-id="' + escapeHtml(record.id) + '">'
          + '<h3>Report application lead time</h3>'
          + '<p class="cell-subtitle">Use this for your own application timing or clearly labelled second-hand evidence. This stays separate from official scraped data.</p>'
          + '<div class="detail-grid">'
          + '<label>Desired start month<input type="month" name="desiredStartMonth"></label>'
          + '<label>Application month<input type="month" name="applicationMonth"></label>'
          + reviewSelect("outcome", "Outcome", [
            { value: "unknown", label: "Unknown" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected-full", label: "Rejected: full" },
            { value: "waitlisted", label: "Waitlisted" },
            { value: "no-response", label: "No response" },
            { value: "told-apply-later", label: "Told to apply later" }
          ], "unknown")
          + reviewSelect("evidenceType", "Evidence type", [
            { value: "own-application", label: "Own application" },
            { value: "hospital-email-reported", label: "Hospital email reported" },
            { value: "classmate-report", label: "Classmate report" },
            { value: "official-source", label: "Official source" },
            { value: "estimate", label: "Estimate" }
          ], "own-application")
          + reviewSelect("reviewerRegion", "Reviewer region", [
            { value: "unknown", label: "Not specified" },
            { value: "de-CH", label: "German-speaking Switzerland" },
            { value: "fr-CH", label: "French-speaking Switzerland" },
            { value: "it-CH", label: "Italian-speaking Switzerland" },
            { value: "mixed", label: "Mixed" }
          ], "unknown")
          + '<label>Display anonymously<select name="canDisplayAnonymously"><option value="true" selected>Yes</option><option value="false">No</option></select></label>'
          + '</div>'
          + '<p class="cell-subtitle leadtime-computed">Computed months ahead: not available until both months are entered.</p>'
          + '<label>Optional comment<textarea name="comment" placeholder="Do not include private emails or identifying details."></textarea></label>'
          + '<p class="cell-subtitle">Submit via GitHub issue opens a pre-filled GitHub page in a new tab. Review it there before submitting.</p>'
          + '<div class="review-actions"><a class="leadtime-issue-link" target="_blank" rel="noopener">Submit via GitHub issue</a><button type="button" class="leadtime-copy">Copy JSON instead</button></div>'
          + '<textarea class="leadtime-json" readonly aria-label="Copyable JSON lead-time report"></textarea>'
          + '<p class="cell-subtitle">Unofficial reports are reviewed before they affect recommendations. Always verify with the hospital.</p>'
          + '</section>';
      }

      function reviewAnswers(panel) {
        const data = {};
        panel.querySelectorAll("select, textarea").forEach((field) => {
          if (field.name) data[field.name] = field.value;
        });
        return {
          reviewerRole: data.reviewerRole || "unknown",
          reviewerRegion: data.reviewerRegion || "unknown",
          verdict: data.verdict || "unknown",
          officialSourceCorrect: data.officialSourceCorrect || "unsure",
          departmentCorrect: data.departmentCorrect || "unsure",
          availabilityCorrect: data.availabilityCorrect || "unsure",
          applicationLinkCorrect: data.applicationLinkCorrect || "unsure",
          confidenceSuggested: data.confidenceSuggested || "unknown",
          comment: data.comment || ""
        };
      }

      function buildReviewPayload(record, panel) {
        const answers = reviewAnswers(panel);
        return {
          recordId: record.id,
          sourceId: record.sourceId,
          institutionName: record.institutionName,
          departmentNormalized: record.departmentNormalized,
          reviewerRole: answers.reviewerRole,
          reviewerRegion: answers.reviewerRegion,
          verdict: answers.verdict,
          officialSourceCorrect: answers.officialSourceCorrect,
          departmentCorrect: answers.departmentCorrect,
          availabilityCorrect: answers.availabilityCorrect,
          applicationLinkCorrect: answers.applicationLinkCorrect,
          confidenceSuggested: answers.confidenceSuggested,
          comment: answers.comment,
          createdAt: new Date().toISOString(),
          currentExtractedValues: {
            availabilityStatus: record.availabilityStatus,
            availableFrom: record.availableFrom,
            fullyBookedUntil: record.fullyBookedUntil,
            applicationUrl: record.applicationUrl,
            confidence: record.confidence,
            extractionMethod: record.extractionMethod,
            sourceUrl: record.sourceUrl,
            lastChecked: record.lastChecked
          }
        };
      }

      function reviewIssueHref(payload) {
        const params = new URLSearchParams();
        params.set("title", "Placement review: " + payload.recordId);
        params.set("body", [
          "Static medical-student review submission.",
          "",
          "Please do not paste private emails or unredacted screenshots.",
          "",
          "\`\`\`json",
          JSON.stringify(payload, null, 2),
          "\`\`\`"
        ].join("\\n"));
        return reviewIssueUrl + "?" + params.toString();
      }

      function communityEvidenceIssueHref(evidenceKind, payload) {
        const params = new URLSearchParams();
        params.set("title", (evidenceKind === "verification" ? "Record verification: " : "Lead-time report: ") + payload.recordId);
        params.set("body", [
          "Structured community evidence submission for the static beta.",
          "",
          "This is not stored by the website. Maintainers review accepted evidence before it affects public data.",
          "",
          "Please do not paste private emails, patient information, or unredacted screenshots.",
          "",
          "\`\`\`json",
          JSON.stringify({ evidenceKind, ...payload }, null, 2),
          "\`\`\`"
        ].join("\\n"));
        return reviewIssueUrl + "?" + params.toString();
      }

      function monthValue(panel, name) {
        return panel.querySelector('[name="' + name + '"]')?.value || "";
      }

      function computeMonthsAhead(applicationMonth, desiredStartMonth) {
        if (!applicationMonth || !desiredStartMonth) return null;
        const application = applicationMonth.split("-").map(Number);
        const desired = desiredStartMonth.split("-").map(Number);
        return (desired[0] - application[0]) * 12 + (desired[1] - application[1]);
      }

      function buildLeadTimeReportPayload(record, panel) {
        const desiredStartMonth = monthValue(panel, "desiredStartMonth");
        const applicationMonth = monthValue(panel, "applicationMonth");
        return {
          recordId: record.id,
          sourceId: record.sourceId,
          institutionName: record.institutionName,
          departmentNormalized: record.departmentNormalized,
          desiredStartMonth,
          applicationMonth,
          computedMonthsAhead: computeMonthsAhead(applicationMonth, desiredStartMonth),
          outcome: panel.querySelector('[name="outcome"]').value,
          evidenceType: panel.querySelector('[name="evidenceType"]').value,
          reviewerRegion: panel.querySelector('[name="reviewerRegion"]').value,
          comment: panel.querySelector('[name="comment"]').value || "",
          createdAt: new Date().toISOString(),
          canDisplayAnonymously: panel.querySelector('[name="canDisplayAnonymously"]').value === "true",
          currentExtractedValues: {
            availabilityStatus: record.availabilityStatus,
            availableFrom: record.availableFrom,
            fullyBookedUntil: record.fullyBookedUntil,
            explicitApplicationLeadTimeMonths: record.explicitApplicationLeadTimeMonths,
            observedMonthsAhead: record.observedMonthsAhead,
            sourceUrl: record.sourceUrl,
            lastChecked: record.lastChecked
          }
        };
      }

      function updateReviewPanel(panel, record) {
        const payload = buildReviewPayload(record, panel);
        const json = JSON.stringify(payload, null, 2);
        panel.querySelector(".review-json").value = json;
        panel.querySelector(".review-issue-link").href = communityEvidenceIssueHref("verification", payload);
      }

      function updateLeadTimeReportPanel(panel, record) {
        const payload = buildLeadTimeReportPayload(record, panel);
        const json = JSON.stringify(payload, null, 2);
        const computedLabel = payload.computedMonthsAhead === null
          ? "Computed months ahead: not available until both months are entered."
          : "Computed months ahead: " + payload.computedMonthsAhead;
        panel.querySelector(".leadtime-computed").textContent = computedLabel;
        panel.querySelector(".leadtime-json").value = json;
        panel.querySelector(".leadtime-issue-link").href = communityEvidenceIssueHref("lead-time-report", payload);
      }

      function bindReviewPanel(record) {
        const panel = detailBody.querySelector(".verification-panel");
        if (!panel) return;
        updateReviewPanel(panel, record);
        panel.addEventListener("input", () => updateReviewPanel(panel, record));
        panel.querySelector(".review-copy").addEventListener("click", async () => {
          updateReviewPanel(panel, record);
          const json = panel.querySelector(".review-json").value;
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(json);
          }
        });
      }

      function bindLeadTimeReportPanel(record) {
        const panel = detailBody.querySelector(".leadtime-report-panel");
        if (!panel) return;
        updateLeadTimeReportPanel(panel, record);
        panel.addEventListener("input", () => updateLeadTimeReportPanel(panel, record));
        panel.querySelector(".leadtime-copy").addEventListener("click", async () => {
          updateLeadTimeReportPanel(panel, record);
          const json = panel.querySelector(".leadtime-json").value;
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(json);
          }
        });
      }

      function openDetail(record) {
        activeRecord = record;
        const department = departmentDisplay(record);
        const role = roleDisplay(record);
        const availability = availabilityDisplay(record);
        detailTitle.textContent = record.institutionName;
        detailSubtitle.textContent = [department.label, role.label].filter(Boolean).join(" / ");
        detailBody.innerHTML = '<div class="detail-grid">'
          + detailField("Availability", availability.value)
          + detailField("Available from", record.availableFrom)
          + detailField("Fully booked until", record.fullyBookedUntil)
          + detailField("Application", record.applicationMethod)
          + detailField("Department", department.label)
          + detailField("Original department", record.originalDepartmentName || record.department)
          + detailField("Role", role.label)
          + detailField("Extraction language", record.extractionLanguage || record.language)
          + detailField("Region", record.region)
          + detailField("Contact", record.contactEmail || record.contactName)
          + detailField("Last checked", record.lastChecked.slice(0, 10))
          + '</div>'
          + leadTimeDetailHtml(record)
          + communityReliabilityHtml(record)
          + '<div><strong>Source</strong><p><a href="' + escapeHtml(record.sourceUrl) + '">' + escapeHtml(record.sourceUrl) + '</a></p></div>'
          + '<div><strong>Warnings</strong>' + (record.warnings.length ? '<ul class="warning-list">' + record.warnings.map((warning) => '<li>' + escapeHtml(warning) + '</li>').join("") + '</ul>' : '<p>No parser warnings.</p>') + '</div>'
          + '<div><strong>Source snippet</strong><p class="snippet">' + escapeHtml(record.extractedSnippet) + '</p></div>'
          + reviewEntryHtml()
          + feedbackLinksHtml(record)
          + reviewPanelHtml(record)
          + leadTimeReportPanelHtml(record);
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
        bindReviewPanel(record);
        bindLeadTimeReportPanel(record);
      }

      function enableReviewMode() {
        reviewModeEnabled = true;
        const url = new URL(window.location.href);
        url.searchParams.set("review", "1");
        window.history.replaceState({}, "", url);
        if (activeRecord) openDetail(activeRecord);
      }

      rows.addEventListener("click", (event) => {
        if (event.target.closest("a, button, input, select, textarea")) return;
        const row = event.target.closest("tr[data-record-id]");
        if (!row) return;
        const record = records.find((item) => item.id === row.dataset.recordId);
        if (record) openDetail(record);
      });

      rows.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        if (event.target.closest("a, button, input, select, textarea")) return;
        const row = event.target.closest("tr[data-record-id]");
        if (!row) return;
        const record = records.find((item) => item.id === row.dataset.recordId);
        if (record) openDetail(record);
      });

      closeButton.addEventListener("click", () => {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      });

      detailBody.addEventListener("click", (event) => {
        if (!event.target.closest(".add-reviews-button")) return;
        enableReviewMode();
      });

      form.addEventListener("input", renderRows);
      renderRows();
    </script>
  </body>
</html>`;
}

export function renderReviewQueuePage(options: RenderPlacementIndexOptions): string {
  const queue = createReviewQueue(options.placements, options.sources);
  const initialState = escapeScriptJson({
    queue: queue.map((item) => ({
      ...item,
      record: item.record,
    })),
  });
  const filters = reviewQueueFilters(queue);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Medical Student Review Queue</title>
    ${renderDetailStyles()}
  </head>
  <body>
    <main class="page">
      <nav class="topline">
        <a href="index.html?review=1">All placements in review mode</a>
        <span>Static beta review queue</span>
      </nav>
      <header class="source-head">
        <div>
          <h1>Medical Student Review Queue</h1>
          <p>Prioritized by low confidence, generic parsing, non-German sources, availability dates, and lead-time evidence.</p>
        </div>
        <div class="status-stack">${badge("needs-human-review")}</div>
      </header>
      <section class="section">
        <form id="queue-filters" class="summary-grid" aria-label="Review queue filters">
          ${renderSelect("canton", "Canton", filters.cantons)}
          ${renderSelect("language", "Language", filters.languages)}
          ${renderSelect("confidence", "Confidence", filters.confidences)}
          ${renderSelect("parserType", "Parser type", filters.parserTypes)}
        </form>
      </section>
      <section class="section">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Placement</th>
                <th>Language</th>
                <th>Confidence</th>
                <th>Parser</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody id="queue-rows"></tbody>
          </table>
        </div>
        <p id="queue-empty" class="muted" style="display: none;">No records match the selected queue filters.</p>
      </section>
    </main>
    <script id="review-queue-data" type="application/json">${initialState}</script>
    <script>
      const queueState = JSON.parse(document.getElementById("review-queue-data").textContent);
      const queueItems = queueState.queue;
      const queueRows = document.getElementById("queue-rows");
      const queueEmpty = document.getElementById("queue-empty");
      const queueFilters = document.getElementById("queue-filters");

      function queueEscape(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function queueMatches(value, filterValue) {
        return !filterValue || value === filterValue;
      }

      const queueDepartmentLabels = ${escapeScriptJson(
        Object.fromEntries(
          Object.entries({
            "internal-medicine": "Internal medicine",
            surgery: "Surgery",
            pediatrics: "Pediatrics",
            gynecology: "Gynecology",
            psychiatry: "Psychiatry",
            anesthesiology: "Anesthesiology",
            "emergency-medicine": "Emergency medicine",
            radiology: "Radiology",
            neuroradiology: "Neuroradiology",
            ophthalmology: "Ophthalmology",
            orthopedics: "Orthopedics",
          }),
        ),
      )};

      function queueRole(record) {
        if (record.roleType === "Unterassistenz" || record.roleType === "Wahlstudienjahr" || record.roleType === "ClinicalPlacement" || /\\b(stage|sous-assistant|tirocinio)\\b/i.test(record.roleTypeOriginal || "")) {
          return { value: "clinical-elective", label: "Clinical elective" };
        }
        if (record.roleType === "Unknown") return { value: "not-specified", label: "Not specified" };
        return { value: record.roleType, label: record.roleType };
      }

      function queueDepartment(record) {
        const key = record.departmentNormalized || record.department || "not-specified";
        return { value: key, label: queueDepartmentLabels[key] || key };
      }

      function renderQueueRows() {
        const filters = Object.fromEntries(new FormData(queueFilters).entries());
        const visible = queueItems.filter((item) =>
          queueMatches(item.record.canton, filters.canton)
            && queueMatches(item.record.language, filters.language)
            && queueMatches(item.record.confidence, filters.confidence)
            && queueMatches(item.parserType, filters.parserType)
        );

        queueRows.innerHTML = visible.map((item) => {
          const record = item.record;
          return '<tr>'
            + '<td>' + queueEscape(item.priorityScore) + '<br><span class="muted">' + queueEscape(item.priorityReasons.join(", ")) + '</span></td>'
            + '<td><strong>' + queueEscape(record.institutionName) + '</strong><br><span class="muted">' + queueEscape(queueDepartment(record).label) + " / " + queueEscape(queueRole(record).label) + '</span></td>'
            + '<td>' + queueEscape(record.language) + '<br><span class="muted">' + queueEscape(record.region) + '</span></td>'
            + '<td>' + queueEscape(record.confidence) + '</td>'
            + '<td>' + queueEscape(item.parserType) + '</td>'
            + '<td><a href="index.html?review=1#' + encodeURIComponent(record.id) + '">Open in review mode</a></td>'
            + '</tr>';
        }).join("");
        queueEmpty.style.display = visible.length === 0 ? "block" : "none";
      }

      queueFilters.addEventListener("input", renderQueueRows);
      renderQueueRows();
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
          <p><a class="feedback-link" href="${escapeHtml(
            sourceFeedbackUrl(source, "other"),
          )}">Report error</a></p>
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
        <h2>Report Error</h2>
        <div class="feedback-links">
          ${sourceFeedbackTypes()
            .map(
              (type) =>
                `<a class="feedback-link" href="${escapeHtml(sourceFeedbackUrl(source, type))}">${escapeHtml(
                  feedbackLabel(type),
                )}</a>`,
            )
            .join("")}
        </div>
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
              <td>${escapeHtml(canonicalDepartment(record).label)}</td>
              <td>${escapeHtml(canonicalRoleType(record).label)}</td>
              <td>${badge(canonicalAvailabilityStatus(record).value)} ${escapeHtml(
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

    .feedback-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .feedback-link {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #ffffff;
      color: var(--blue);
      display: inline-flex;
      min-height: 32px;
      padding: 6px 8px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 800;
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

function sourceFeedbackTypes(): FeedbackType[] {
  return [
    "irrelevant-source",
    "broken-source-url",
    "wrong-language-region",
    "parser-bug",
    "missing-hospital-source",
    "other",
  ];
}

function sourceFeedbackUrl(source: SourceRegistryEntry, feedbackType: FeedbackType): string {
  return buildFeedbackIssueUrl(feedbackType, {
    source: {
      id: source.id,
      institutionName: source.institutionName,
      canton: source.canton,
      city: source.city,
      sourceLanguage: source.sourceLanguage,
      region: source.region,
      status: source.status,
      urls: source.sourceUrls.map((sourceUrl) => sourceUrl.url),
    },
  });
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

function reviewQueueFilters(queue: ReviewQueueItem[]): {
  cantons: Array<{ value: string; label: string }>;
  languages: Array<{ value: string; label: string }>;
  confidences: Array<{ value: string; label: string }>;
  parserTypes: Array<{ value: string; label: string }>;
} {
  return {
    cantons: toFilterOptions(queue.map((item) => item.record.canton)),
    languages: toFilterOptions(queue.map((item) => item.record.language)),
    confidences: toFilterOptions(queue.map((item) => item.record.confidence)),
    parserTypes: toFilterOptions(queue.map((item) => item.parserType)),
  };
}

function toFilterOptions(values: Array<string | null>): Array<{ value: string; label: string }> {
  return [...new Set(values.filter((value): value is string => value !== null && value !== ""))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: displayLabel(value) }));
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "Not checked";
}

function displayLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    "application-only": "Application only",
    "auto-published": "Auto published",
    "available-from": "Available from",
    "clinical-elective": "Clinical elective",
    "fully-booked-until": "Fully booked until",
    "generic-parser": "Generic parser",
    "hospital-confirmed": "Hospital confirmed",
    "student-checked": "Student checked",
    "multiple-student-checked": "Multiple student checked",
    "conflicting-reports": "Conflicting reports",
    unverified: "Unverified",
    "needs-human-review": "Needs human review",
    "not-specified": "Not specified",
    "site-parser": "Site parser",
  };

  return value ? (labels[value] ?? displayPlacementLabel(value)) : "Not specified";
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
