async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
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

function formatNumber(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
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
  const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
  if (match) return match[1];
  return repoUrl;
}

// Cache for AI summaries
const aiCache = new Map();

async function fetchAISummary(repoId) {
  if (aiCache.has(repoId)) return aiCache.get(repoId);
  const text = await fetchText(`/api/repo/${repoId}/ai`);
  aiCache.set(repoId, text);
  return text;
}

function getAIPreview(aiText) {
  if (!aiText) return '<span class="ai-preview no-data">No AI analysis</span>';
  // Get first two sentences or first 150 chars
  const sentences = aiText.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  const preview = sentences.length > 180 ? sentences.slice(0, 180) + '…' : sentences;
  return `<span class="ai-preview">${escapeHtml(preview)}</span>`;
}

function extractVerdict(aiText) {
  if (!aiText) return { icon: '⏳', class: 'pending', full: 'Pending analysis' };
  
  const verdictMatch = aiText.match(/Overall authenticity assessment:\s*(.+?)$/mi);
  if (!verdictMatch) return { icon: '⏳', class: 'pending', full: 'No assessment found' };
  
  const verdict = verdictMatch[1].trim();
  const isAuthentic = /consistent|authentic|legitimate/i.test(verdict);
  const isSuspicious = /suspicious|concern|flag|issue|question/i.test(verdict);
  
  if (isSuspicious) {
    return { icon: '⚠️', class: 'suspicious', full: verdict };
  } else if (isAuthentic) {
    return { icon: '✅', class: 'authentic', full: verdict };
  }
  return { icon: '➖', class: 'neutral', full: verdict };
}

function getVerdictBadge(aiText) {
  const verdict = extractVerdict(aiText);
  return `<span class="verdict-icon ${verdict.class}" title="${escapeHtml(verdict.full)}">${verdict.icon}</span>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function renderSummaryTable(rows) {
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
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div>No submissions match the current filters</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Render rows first with loading placeholders for AI
  filteredRows.forEach((row) => {
    const tr = document.createElement("tr");
    const repoId = row.repo_id || extractRepoName(row.repo);
    const displayName = row.repo_id || extractRepoName(row.repo);
    
    tr.innerHTML = `
      <td>
        <div class="repo-cell">
          <span class="repo-name">${escapeHtml(displayName)}</span>
          <span class="repo-url">${escapeHtml(row.repo)}</span>
        </div>
      </td>
      <td><span class="num-cell">${row.total_commits}</span></td>
      <td><span class="num-cell loc-add">+${formatNumber(row.total_loc_added)}</span></td>
      <td><span class="num-cell loc-del">−${formatNumber(row.total_loc_deleted)}</span></td>
      <td style="text-align:center">${flagChip(row.has_commits_before_t0)}</td>
      <td style="text-align:center">${flagChip(row.has_bulk_commits)}</td>
      <td style="text-align:center">${flagChip(row.has_large_initial_commit_after_t0)}</td>
      <td style="text-align:center">${flagChip(row.has_merge_commits)}</td>
      <td class="verdict-cell"><span class="verdict-icon pending">⏳</span></td>
      <td class="ai-cell"><span class="ai-preview no-data">Loading...</span></td>
    `;
    tr.dataset.repoId = repoId;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#summary-table tbody tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      openDrawer(repoId);
    });
    tbody.appendChild(tr);

    // Fetch AI summary async
    fetchAISummary(repoId).then(aiText => {
      const aiCell = tr.querySelector('.ai-cell');
      const verdictCell = tr.querySelector('.verdict-cell');
      if (aiCell) aiCell.innerHTML = getAIPreview(aiText);
      if (verdictCell) verdictCell.innerHTML = getVerdictBadge(aiText);
    });
  });
}

async function loadSummary() {
  const data = await fetchJSON("/api/summary");
  window.__summaryRows = data.rows || [];
  await renderSummaryTable(window.__summaryRows);
}

function formatJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

// Drawer functionality
function openDrawer(repoId) {
  const drawer = document.getElementById("details-drawer");
  const overlay = document.getElementById("drawer-overlay");
  
  drawer.classList.remove("hidden");
  overlay.classList.remove("hidden");
  
  // Trigger reflow for animation
  drawer.offsetHeight;
  
  drawer.classList.add("visible");
  overlay.classList.add("visible");
  
  loadDetails(repoId);
}

function closeDrawer() {
  const drawer = document.getElementById("details-drawer");
  const overlay = document.getElementById("drawer-overlay");
  
  drawer.classList.remove("visible");
  overlay.classList.remove("visible");
  
  setTimeout(() => {
    drawer.classList.add("hidden");
    overlay.classList.add("hidden");
  }, 250);
  
  document.querySelectorAll("#summary-table tbody tr").forEach((r) => r.classList.remove("selected"));
}

async function loadDetails(repoId) {
  document.getElementById("detail-title").textContent = repoId;
  
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
      fetchText(`/api/repo/${repoId}/ai`),
      fetchJSON(`/api/repo/${repoId}/commits`).catch(() => ({ rows: [] })),
    ]);
    
    summaryEl.textContent = formatJSON(metrics.summary || {});
    flagsEl.textContent = formatJSON(metrics.flags || {});
    timeEl.textContent = formatJSON(metrics.time_distribution || {});
    
    // Format AI output with verdict highlighting
    if (aiText) {
      const formattedAI = formatAIOutput(aiText);
      aiEl.innerHTML = formattedAI;
    } else {
      aiEl.textContent = "No AI analysis available for this submission.";
    }
    
    renderCommits(commitsData.rows || []);
  } catch (err) {
    summaryEl.textContent = `Error: ${err.message}`;
    flagsEl.textContent = "";
    timeEl.textContent = "";
    aiEl.textContent = "";
  }
}

function formatAIOutput(text) {
  // Convert bullet points and highlight the verdict
  let html = escapeHtml(text);
  
  // Look for authenticity assessment line
  const verdictMatch = html.match(/(Overall authenticity assessment:.*?)$/mi);
  if (verdictMatch) {
    const verdict = verdictMatch[1];
    const isSuspicious = /suspicious|concern|flag|issue|question/i.test(verdict);
    const isAuthentic = /consistent|authentic|legitimate/i.test(verdict);
    // Suspicious takes priority over authentic keywords
    const verdictClass = isSuspicious ? 'suspicious' : (isAuthentic ? 'authentic' : 'suspicious');
    html = html.replace(verdict, `<span class="verdict ${verdictClass}">${verdict}</span>`);
  }
  
  return html;
}

function renderCommits(rows) {
  const tbody = document.querySelector("#commits-table tbody");
  const countEl = document.querySelector(".commit-count");
  tbody.innerHTML = "";
  
  countEl.textContent = `(${rows.length})`;
  
  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--muted); padding: 20px;">
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
      <td style="font-size: 0.7rem; color: var(--muted); white-space: nowrap;">${row.author_time_iso}</td>
      <td><span class="num-cell loc-add">+${row.insertions}</span></td>
      <td><span class="num-cell loc-del">−${row.deletions}</span></td>
      <td><span class="num-cell">${row.files_changed}</span></td>
      <td style="text-align:center">${flagChip(row.flag_bulk_commit)}</td>
      <td style="text-align:center">${flagChip(row.is_before_t0)}</td>
      <td style="text-align:center">${flagChip(row.is_after_t1)}</td>
      <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(row.subject)}">${escapeHtml(row.subject)}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Filter handlers
  ["filter-preT0", "filter-bulk", "filter-merge"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      renderSummaryTable(window.__summaryRows || []);
    });
  });
  
  // Drawer close handlers
  document.getElementById("close-drawer").addEventListener("click", closeDrawer);
  document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
  
  // Load data
  loadSummary().catch((err) => {
    const tbody = document.querySelector("#summary-table tbody");
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div>Failed to load data: ${err.message}</div>
          </div>
        </td>
      </tr>
    `;
  });
});
