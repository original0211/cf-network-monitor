// src/dashboard/public/app.js
// 纯前端，不依赖任何构建工具，直接调用 /api 接口

const apiBaseInput = document.getElementById('apiBase');
const adminTokenInput = document.getElementById('adminToken');
const autoRefreshCheckbox = document.getElementById('autoRefresh');
const manualProbeBtn = document.getElementById('manualProbeBtn');
const sortSelect = document.getElementById('sortSelect');
const tableBody = document.getElementById('nodeTableBody');
const lastUpdatedEl = document.getElementById('lastUpdated');

let refreshTimer = null;

function statusClass(status) {
  if (status === 'online') return 'status-online';
  if (status === 'degraded') return 'status-degraded';
  if (status === 'offline') return 'status-offline';
  return 'status-unknown';
}

async function fetchPing() {
  const base = apiBaseInput.value.replace(/\/$/, '');
  const sort = sortSelect.value;
  const resp = await fetch(`${base}/api/ping?sort=${encodeURIComponent(sort)}`);
  if (!resp.ok) throw new Error(`ping_failed_${resp.status}`);
  return resp.json();
}

function renderRows(nodes) {
  tableBody.innerHTML = '';
  for (const node of nodes) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(node.name)}</td>
      <td>${escapeHtml(node.region_label)}</td>
      <td>${node.avg_latency_ms !== null ? node.avg_latency_ms + ' ms' : '--'}</td>
      <td>${node.availability_pct}%</td>
      <td class="${statusClass(node.status)}">${node.status}</td>
      <td>${node.score.total_score} / 300</td>
      <td>${node.last_checked_at ? new Date(node.last_checked_at + 'Z').toLocaleTimeString() : '--'}</td>
    `;
    tableBody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function refresh() {
  try {
    const data = await fetchPing();
    renderRows(data.nodes);
    lastUpdatedEl.textContent = `最后刷新：${new Date(data.generated_at).toLocaleString()}`;
  } catch (err) {
    lastUpdatedEl.textContent = `刷新失败：${err.message}`;
  }
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (autoRefreshCheckbox.checked) {
    refreshTimer = setInterval(refresh, 10000);
  }
}

manualProbeBtn.addEventListener('click', async () => {
  const base = apiBaseInput.value.replace(/\/$/, '');
  const token = adminTokenInput.value;
  if (!token) {
    alert('手动测速需要管理 Token');
    return;
  }
  manualProbeBtn.disabled = true;
  try {
    const resp = await fetch(`${base}/api/probe/run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`probe_run_failed_${resp.status}`);
    await refresh();
  } catch (err) {
    alert(`手动测速失败：${err.message}`);
  } finally {
    manualProbeBtn.disabled = false;
  }
});

sortSelect.addEventListener('change', refresh);
autoRefreshCheckbox.addEventListener('change', scheduleAutoRefresh);

refresh();
scheduleAutoRefresh();
