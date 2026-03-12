import { useEffect, useState } from 'react';
import {
  getSettings,
  putSettings,
  exportData,
  backupSendEmail,
  restoreFromJson,
} from '../api';

function Section({ title, children }) {
  return (
    <section className="card p-4 sm:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Message({ type, text }) {
  if (!text) return null;
  return (
    <p
      className={`text-sm font-medium ${type === 'error' ? 'text-red-600' : 'text-teal-600'}`}
      role="status"
    >
      {text}
    </p>
  );
}

export default function Admin() {
  const [settings, setSettings] = useState({
    receiver_email: '',
    auto_backup_enabled: true,
    devices: [],
    sbp_high: 135,
    dbp_high: 85,
  });
  const [newDeviceName, setNewDeviceName] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ type: '', text: '' });

  const [exportSending, setExportSending] = useState(false);
  const [exportDownloading, setExportDownloading] = useState(false);
  const [exportMessage, setExportMessage] = useState({ type: '', text: '' });

  const [file, setFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    getSettings()
      .then((s) => setSettings({
        receiver_email: s.receiver_email ?? '',
        auto_backup_enabled: s.auto_backup_enabled !== false,
        devices: Array.isArray(s.devices) ? s.devices : [],
        sbp_high: typeof s.sbp_high === 'number' ? s.sbp_high : 135,
        dbp_high: typeof s.dbp_high === 'number' ? s.dbp_high : 85,
      }))
      .catch(() => setSettings({ receiver_email: '', auto_backup_enabled: true, devices: [], sbp_high: 135, dbp_high: 85 }))
      .finally(() => setSettingsLoading(false));
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsMessage({ type: '', text: '' });
    setSettingsSaving(true);
    try {
      const updated = await putSettings({
        receiver_email: settings.receiver_email,
        auto_backup_enabled: settings.auto_backup_enabled,
        devices: settings.devices,
        sbp_high: settings.sbp_high,
        dbp_high: settings.dbp_high,
      });
      setSettings(updated);
      setSettingsMessage({ type: 'success', text: 'Settings saved.' });
    } catch (err) {
      setSettingsMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSendEmail = async () => {
    setExportMessage({ type: '', text: '' });
    setExportSending(true);
    try {
      const res = await backupSendEmail();
      setExportMessage({
        type: res.success ? 'success' : 'error',
        text: res.message || (res.success ? 'Email sent.' : 'Send failed.'),
      });
    } catch (err) {
      setExportMessage({ type: 'error', text: err.message || 'Send failed.' });
    } finally {
      setExportSending(false);
    }
  };

  const handleDownloadJson = async () => {
    setExportMessage({ type: '', text: '' });
    setExportDownloading(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'data.json';
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage({ type: 'success', text: 'Download started.' });
    } catch (err) {
      setExportMessage({ type: 'error', text: err.message || 'Download failed.' });
    } finally {
      setExportDownloading(false);
    }
  };

  const handleFileChange = (e) => {
    const chosen = e.target.files?.[0];
    setFile(chosen || null);
    setRestoreMessage({ type: '', text: '' });
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    setRestoreMessage({ type: '', text: '' });
    if (!file) {
      setRestoreMessage({ type: 'error', text: 'Choose a JSON file first.' });
      return;
    }
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !Array.isArray(data.records)) {
        setRestoreMessage({
          type: 'error',
          text: 'File must contain a "records" array (e.g. { "records": [...], "meta": {} }).',
        });
        setRestoreLoading(false);
        return;
      }
      const res = await restoreFromJson(data);
      setRestoreMessage({
        type: 'success',
        text: res.message || `Restored ${data.records.length} records.`,
      });
      setFile(null);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setRestoreMessage({ type: 'error', text: 'Invalid JSON in file.' });
      } else {
        setRestoreMessage({ type: 'error', text: err.message || 'Restore failed.' });
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Admin</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">
          System settings, backup email, export, and restore.
        </p>
      </div>

      {/* 0) System settings + 1) Automatic backup */}
      <Section title="System settings">
        {settingsLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Receiver email</label>
              <input
                type="email"
                value={settings.receiver_email}
                onChange={(e) => setSettings((s) => ({ ...s, receiver_email: e.target.value }))}
                placeholder="e.g. you@example.com"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used for automatic backup and &quot;Send to email&quot; export.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_backup_enabled}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, auto_backup_enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700">Automatic backup</span>
              </label>
              <p className="mt-1 ml-7 text-xs text-slate-500">
                When on, send an email whenever an entry is added or updated in the Log tab (to the receiver above).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">High zone (mmHg)</label>
              <p className="text-xs text-slate-500 mb-2">
                Thresholds for &quot;elevated&quot; readings. Used in Dashboard, Statistics, and PDF report.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SBP ≥</label>
                  <input
                    type="number"
                    min={90}
                    max={200}
                    value={settings.sbp_high}
                    onChange={(e) => setSettings((s) => ({ ...s, sbp_high: Number(e.target.value) || 135 }))}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">DBP ≥</label>
                  <input
                    type="number"
                    min={60}
                    max={120}
                    value={settings.dbp_high}
                    onChange={(e) => setSettings((s) => ({ ...s, dbp_high: Number(e.target.value) || 85 }))}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">BP devices</label>
              <p className="text-xs text-slate-500 mb-2">
                Add device names to choose from in the Log tab. Order is preserved.
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. Omron M2"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = newDeviceName.trim();
                      if (name && !settings.devices.includes(name)) {
                        setSettings((s) => ({ ...s, devices: [...s.devices, name] }));
                        setNewDeviceName('');
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = newDeviceName.trim();
                    if (name && !settings.devices.includes(name)) {
                      setSettings((s) => ({ ...s, devices: [...s.devices, name] }));
                      setNewDeviceName('');
                    }
                  }}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 transition-colors"
                >
                  Add
                </button>
              </div>
              {settings.devices.length > 0 && (
                <ul className="space-y-1">
                  {settings.devices.map((name) => (
                    <li key={name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, devices: s.devices.filter((d) => d !== name) }))}
                        className="text-red-600 hover:text-red-700 font-medium"
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Message type={settingsMessage.type} text={settingsMessage.text} />
            <button
              type="submit"
              disabled={settingsSaving}
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {settingsSaving ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        )}
      </Section>

      {/* 2) Export */}
      <Section title="Export data">
        <p className="text-sm text-slate-600">
          Export all records as JSON. Send to the receiver email or download a file.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={exportSending || !settings.receiver_email}
            className="rounded-lg bg-slate-700 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {exportSending ? 'Sending…' : 'Send to email'}
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={exportDownloading}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {exportDownloading ? 'Preparing…' : 'Download JSON file'}
          </button>
        </div>
        {!settings.receiver_email && (
          <p className="text-xs text-amber-600">Set receiver email above to use &quot;Send to email&quot;.</p>
        )}
        <Message type={exportMessage.type} text={exportMessage.text} />
      </Section>

      {/* 3) Restore */}
      <Section title="Restore from file">
        <p className="text-sm text-slate-600">
          Upload a JSON backup file to replace all current records. This overwrites existing data.
        </p>
        <form onSubmit={handleRestore} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Backup JSON file</label>
            <input
              key={file ? 'has-file' : 'no-file'}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100"
            />
            {file && <p className="mt-2 text-sm text-slate-500">Selected: {file.name}</p>}
            <p className="mt-1 text-xs text-slate-500">
              Object with &quot;records&quot; (array), optional &quot;meta&quot;, and optional &quot;settings&quot; (restores devices, etc.).
            </p>
          </div>
          <Message type={restoreMessage.type} text={restoreMessage.text} />
          <button
            type="submit"
            disabled={restoreLoading || !file}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {restoreLoading ? 'Restoring…' : 'Restore (replace all data)'}
          </button>
        </form>
      </Section>
    </div>
  );
}
