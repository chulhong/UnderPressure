import { useState, useEffect } from 'react';
import { getReportPdf, getBackupStatus } from '../api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Report() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [backupStatus, setBackupStatus] = useState(null);

  useEffect(() => {
    getBackupStatus().then(setBackupStatus).catch(() => setBackupStatus(null));
  }, []);

  const handleDownload = async (e) => {
    e.preventDefault();
    const from = fromDate || toDate;
    const to = toDate || fromDate;
    if (!from || !to) {
      setMessage({ type: 'error', text: 'Please select date range.' });
      return;
    }
    if (from > to) {
      setMessage({ type: 'error', text: 'From date must be before or equal to To date.' });
      return;
    }
    setMessage({ type: '', text: '' });
    setLoading(true);
    try {
      const blob = await getReportPdf(from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bp-report-${from}-to-${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Report downloaded.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to generate report.' });
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:py-2 text-base text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 min-h-[44px] sm:min-h-0';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">PDF Report</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">
          Generate a doctor-friendly report with summary table and weekly averages.
        </p>
      </div>

      <form onSubmit={handleDownload} className="card p-4 sm:p-6 max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">From date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">To date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputCls}
          />
        </div>
        {message.text && (
          <p
            className={`text-sm font-medium ${message.type === 'error' ? 'text-red-600' : 'text-teal-600'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-teal-600 px-5 py-2.5 sm:py-2 text-white font-medium shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors min-h-[44px] sm:min-h-0"
        >
          {loading ? 'Generating…' : 'Download PDF'}
        </button>
      </form>

      {backupStatus && backupStatus.message != null && (
        <p className="text-sm text-slate-500">
          Last backup: {backupStatus.success ? 'OK' : 'Failed'} — {backupStatus.message}
        </p>
      )}
    </div>
  );
}
