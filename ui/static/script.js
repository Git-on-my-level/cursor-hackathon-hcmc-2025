async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function flagChip(value) {
  const v = Number(value);
  if (v === 0 || value === false) return '<span class="flag ok">No</span>';
  return '<span class="flag danger">Yes</span>';
}

function hasAnyFlag(row) {
  return (
    Number(row.has_commits_before_t0) > 0 ||
    Number(row.has_bulk_commits) > 0 ||
    Number(row.has_large_initial_commit_after_t0) > 0 ||
    Number(row.has_merge_commits) > 0
  );
}

function updateStats(rows) {
  const total = rows.length;
  const flagged = rows.filter(hasAnyFlag).length;
  const clean = total - flagged;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-flagged").textContent = flagged;
  document.getElementById("stat-clean").textContent = clean;
}

function extractRepoName(repoUrl) {
  // Extract owner/repo from URL like https://github.com/owner/repo.git
  const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
  if (match) return match[1];
  return repoUrl;
}

function renderSummaryTable(rows) {
  const tbody = document.querySelector("#summary-table tbody");
  tbody.innerHTML = "";
  const filterPre = document.querySelector("#filter-preT0").checked;
  const filterBulk = document.querySelector("#filter-bulk").checked;
  const filterMerge = document.querySelector("#filter-merge").checked;

  const filteredRows = rows.filter((r) => {
    if (filterPre && Number(r.has_commits_before_t0) === 0) return false;
    if (filterBulk && Number(r.has_bulk_commits) === 0) return false;
    if (filterMerge && Number(r.has_merge_commits) === 0) return false;
    return true;
  });

  updateStats(rows);

  if (filteredRows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div>No submissions match the current filters</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filteredRows.forEach((row) => {
    const tr = document.createElement("tr");
    const repoId = row.repo_id || extractRepoName(row.repo);
    const displayName = row.repo_id || extractRepoName(row.repo);
    
    tr.innerHTML = `
      <td>
        <div class="repo-cell">
          <span class="repo-name" title="${displayName}">${displayName}</span>
          <span class="repo-url" title="${row.repo}">${row.repo}</span>
        </div>
      </td>
      <td><span class="num-cell">${row.total_commits}</span></td>
      <td>${flagChip(row.has_commits_before_t0)}</td>
      <td>${flagChip(row.has_bulk_commits)}</td>
      <td>${flagChip(row.has_large_initial_commit_after_t0)}</td>
      <td>${flagChip(row.has_merge_commits)}</td>
    `;
    tr.dataset.repoId = repoId;
    tr.addEventListener("click", () => {
      // Update selected state
      document.querySelectorAll("#summary-table tbody tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      loadDetails(repoId);
    });
    tbody.appendChild(tr);
  });
}

async function loadSummary() {
  const data = await fetchJSON("/api/summary");
  window.__summaryRows = data.rows || [];
  renderSummaryTable(window.__summaryRows);
}

function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

function showDetailsPanel() {
  document.getElementById("details").hidden = false;
}

async function loadDetails(repoId) {
  showDetailsPanel();
  document.getElementById("detail-title").textContent = repoId;
  
  // Clear previous content and show loading state
  const summaryEl = document.getElementById("metrics-summary");
  const flagsEl = document.getElementById("metrics-flags");
  const timeEl = document.getElementById("metrics-time");
  const aiEl = document.getElementById("ai-output");
  
  summaryEl.textContent = "Loading...";
  flagsEl.textContent = "Loading...";
  timeEl.textContent = "Loading...";
  aiEl.textContent = "Loading...";
  
  try {
    const [metrics, aiText, commitsData] = await Promise.all([
      fetchJSON(`/api/repo/${repoId}/metrics`),
      fetchText(`/api/repo/${repoId}/ai`).catch(() => "No AI analysis available."),
      fetchJSON(`/api/repo/${repoId}/commits`).catch(() => ({ rows: [] })),
    ]);
    
    summaryEl.textContent = formatJSON(metrics.summary || {});
    flagsEl.textContent = formatJSON(metrics.flags || {});
    timeEl.textContent = formatJSON(metrics.time_distribution || {});
    aiEl.textContent = aiText;
    renderCommits(commitsData.rows || []);
  } catch (err) {
    summaryEl.textContent = `Error loading data: ${err.message}`;
    flagsEl.textContent = "";
    timeEl.textContent = "";
    aiEl.textContent = "";
  }
}

function renderCommits(rows) {
  const tbody = document.querySelector("#commits-table tbody");
  tbody.innerHTML = "";
  
  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--muted); padding: 24px;">
          No commits data available
        </td>
      </tr>
    `;
    return;
  }
  
  rows.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="num-cell">${row.seq_index}</span></td>
      <td><span class="muted" style="font-size: 0.75rem;">${row.author_time_iso}</span></td>
      <td><span class="num-cell" style="color: var(--ok);">+${row.insertions}</span></td>
      <td><span class="num-cell" style="color: var(--danger);">-${row.deletions}</span></td>
      <td><span class="num-cell">${row.files_changed}</span></td>
      <td>${flagChip(row.flag_bulk_commit)}</td>
      <td>${flagChip(row.is_before_t0)}</td>
      <td>${flagChip(row.is_after_t1)}</td>
      <td><span style="max-width: 250px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${row.subject}">${row.subject}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ["filter-preT0", "filter-bulk", "filter-merge"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      renderSummaryTable(window.__summaryRows || []);
    });
  });
  
  loadSummary().catch((err) => {
    const tbody = document.querySelector("#summary-table tbody");
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div>Failed to load data: ${err.message}</div>
          </div>
        </td>
      </tr>
    `;
  });
});
