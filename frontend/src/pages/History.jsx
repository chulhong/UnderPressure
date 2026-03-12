import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRecords, deleteRecord } from '../api';

export default function History() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  const load = () => {
    setLoading(true);
    getRecords()
      .then(setRecords)
      .catch(() => setMessage({ type: 'error', text: 'Failed to load history.' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (date) => {
    if (!window.confirm(`Delete entry for ${date}?`)) return;
    setMessage({ type: '', text: '' });
    try {
      await deleteRecord(date);
      setMessage({ type: 'success', text: 'Entry deleted.' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Delete failed.' });
    }
  };

  const formatBP = (sbp, dbp) => {
    if (sbp != null && dbp != null) return `${sbp}/${dbp}`;
    if (sbp != null) return `SBP ${sbp}`;
    if (dbp != null) return `DBP ${dbp}`;
    return '—';
  };

  if (loading && records.length === 0) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">History</h1>
        <p className="mt-2 text-slate-600">Loading…</p>
      </div>
    );
  }

  const reversed = [...records].reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">History</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">View and edit previous entries.</p>
      </div>

      {message.text && (
        <p
          className={`text-sm font-medium ${message.type === 'error' ? 'text-red-600' : 'text-teal-600'}`}
          role="status"
        >
          {message.text}
        </p>
      )}

      {records.length === 0 ? (
        <div className="card p-6 sm:p-8 text-center text-slate-500">
          No entries yet.{' '}
          <Link to="/log" className="text-teal-600 font-medium hover:text-teal-700 underline">
            Log your first entry
          </Link>
          .
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-3">
            {reversed.map((r) => (
              <div key={r.date} className="card p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-semibold text-slate-900">{r.date}</span>
                  <div className="flex gap-2">
                    <Link
                      to={`/log?date=${r.date}`}
                      className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 min-h-[44px] flex items-center justify-center"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.date)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 min-h-[44px]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-slate-500">Morning</dt>
                  <dd className="text-slate-900 font-medium">{formatBP(r.morning_sbp, r.morning_dbp)}</dd>
                  <dt className="text-slate-500">Evening</dt>
                  <dd className="text-slate-900 font-medium">{formatBP(r.evening_sbp, r.evening_dbp)}</dd>
                  <dt className="text-slate-500">Device</dt>
                  <dd className="text-slate-600">{r.device || '—'}</dd>
                  {r.note && (
                    <>
                      <dt className="text-slate-500">Note</dt>
                      <dd className="text-slate-600 truncate" title={r.note}>{r.note}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Morning</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Evening</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Device</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Note</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {reversed.map((r) => (
                    <tr key={r.date} className="hover:bg-slate-50/80 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{r.date}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatBP(r.morning_sbp, r.morning_dbp)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatBP(r.evening_sbp, r.evening_dbp)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{r.device || '—'}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-sm text-slate-600" title={r.note}>{r.note || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <Link
                          to={`/log?date=${r.date}`}
                          className="text-teal-600 font-medium hover:text-teal-700 hover:underline"
                        >
                          Edit
                        </Link>
                        <span className="text-slate-300 mx-2">·</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.date)}
                          className="text-red-600 font-medium hover:text-red-700 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
