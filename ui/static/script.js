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

function renderSummaryTable(rows) {
  const tbody = document.querySelector("#summary-table tbody");
  tbody.innerHTML = "";
  const filterPre = document.querySelector("#filter-preT0").checked;
  const filterBulk = document.querySelector("#filter-bulk").checked;
  const filterMerge = document.querySelector("#filter-merge").checked;

  rows
    .filter((r) => {
      if (filterPre && Number(r.has_commits_before_t0) === 0) return false;
      if (filterBulk && Number(r.has_bulk_commits) === 0) return false;
      if (filterMerge && Number(r.has_merge_commits) === 0) return false;
      return true;
    })
    .forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${row.repo_id || row.repo}</strong><br><span class="muted">${row.repo}</span></td>
        <td>${row.total_commits}</td>
        <td>${flagChip(row.has_commits_before_t0)}</td>
        <td>${flagChip(row.has_bulk_commits)}</td>
        <td>${flagChip(row.has_large_initial_commit_after_t0)}</td>
        <td>${flagChip(row.has_merge_commits)}</td>
      `;
      tr.addEventListener("click", () => loadDetails(row.repo_id));
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
  try {
    const [metrics, aiText, commitsData] = await Promise.all([
      fetchJSON(`/api/repo/${repoId}/metrics`),
      fetchText(`/api/repo/${repoId}/ai`).catch(() => "No AI output."),
      fetchJSON(`/api/repo/${repoId}/commits`).catch(() => ({ rows: [] })),
    ]);
    document.getElementById("metrics-summary").textContent = formatJSON(metrics.summary || {});
    document.getElementById("metrics-flags").textContent = formatJSON(metrics.flags || {});
    document.getElementById("metrics-time").textContent = formatJSON(metrics.time_distribution || {});
    document.getElementById("ai-output").textContent = aiText;
    renderCommits(commitsData.rows || []);
  } catch (err) {
    document.getElementById("metrics-summary").textContent = `Error: ${err}`;
  }
}

function renderCommits(rows) {
  const tbody = document.querySelector("#commits-table tbody");
  tbody.innerHTML = "";
  rows.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.seq_index}</td>
      <td>${row.author_time_iso}</td>
      <td>${row.insertions}</td>
      <td>${row.deletions}</td>
      <td>${row.files_changed}</td>
      <td>${flagChip(row.flag_bulk_commit)}</td>
      <td>${flagChip(row.is_before_t0)}</td>
      <td>${flagChip(row.is_after_t1)}</td>
      <td>${row.subject}</td>
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
    tbody.innerHTML = `<tr><td colspan="6">Failed to load summary: ${err}</td></tr>`;
  });
});
