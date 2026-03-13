/**
 * API client for BP-Track-Pi backend.
 * Assumes Vite proxy: /api -> http://127.0.0.1:8000
 */

const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail || (Array.isArray(j.detail) ? j.detail.map(d => d.msg || d).join(', ') : text);
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) return res.json();
  return res.blob();
}

export async function getRecords(params = {}) {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  const q = sp.toString();
  return request(`/records${q ? `?${q}` : ''}`);
}

export async function getRecord(date) {
  return request(`/records/${date}`);
}

export async function createRecord(payload, date = null) {
  const q = date ? `?date=${date}` : '';
  return request(`/records${q}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRecord(date, payload) {
  return request(`/records/${date}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteRecord(date) {
  return request(`/records/${date}`, { method: 'DELETE' });
}

export async function getAggregated(params = {}) {
  const sp = new URLSearchParams();
  if (params.period) sp.set('period', params.period);
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  const q = sp.toString();
  return request(`/aggregated${q ? `?${q}` : ''}`);
}

export async function getBadges() {
  return request('/badges');
}

export async function getReportPdf(fromDate, toDate) {
  const res = await fetch(`${API_BASE}/reports/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromDate, to: toDate }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Report failed: ${res.status}`);
  }
  return res.blob();
}

export async function getBackupStatus() {
  return request('/backup/status');
}

export async function importExcel(file, strategy = 'import_wins') {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/import?strategy=${encodeURIComponent(strategy)}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Import failed: ${res.status}`);
  }
  return res.json();
}

/**
 * System settings (Admin).
 */
export async function getSettings() {
  return request('/settings');
}

export async function putSettings(body) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Export: full data for download (records + meta).
 */
export async function exportData() {
  return request('/export');
}

/**
 * Send current data as email to configured receiver.
 */
export async function backupSendEmail() {
  return request('/backup/send-email', { method: 'POST' });
}

/**
 * Restore all records from JSON (full data.json shape: { records: [...], meta?: {} }).
 * Replaces existing data.
 */
export async function restoreFromJson(data) {
  return request('/restore', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getInsights(body) {
  return request('/insights', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
