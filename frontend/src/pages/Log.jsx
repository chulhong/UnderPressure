import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createRecord, updateRecord, getRecord, getSettings } from '../api';

const LAST_DEVICE_KEY = 'underpressure-last-device';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

const emptyPayload = () => ({
  morning_sbp: '',
  morning_dbp: '',
  evening_sbp: '',
  evening_dbp: '',
  note: '',
  device: '',
});

function toPayload(record) {
  if (!record) return emptyPayload();
  return {
    morning_sbp: record.morning_sbp ?? '',
    morning_dbp: record.morning_dbp ?? '',
    evening_sbp: record.evening_sbp ?? '',
    evening_dbp: record.evening_dbp ?? '',
    note: record.note ?? '',
    device: record.device ?? '',
  };
}

function toBody(partial) {
  const dev = partial.device;
  return {
    morning_sbp: partial.morning_sbp === '' || partial.morning_sbp === undefined ? null : Number(partial.morning_sbp),
    morning_dbp: partial.morning_dbp === '' || partial.morning_dbp === undefined ? null : Number(partial.morning_dbp),
    evening_sbp: partial.evening_sbp === '' || partial.evening_sbp === undefined ? null : Number(partial.evening_sbp),
    evening_dbp: partial.evening_dbp === '' || partial.evening_dbp === undefined ? null : Number(partial.evening_dbp),
    note: String(partial.note ?? ''),
    device: dev === '' || dev == null ? null : String(dev).trim(),
  };
}

export default function Log() {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const today = toDateStr(new Date());
  const [date, setDate] = useState(dateParam || today);
  const [payload, setPayload] = useState(emptyPayload());
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => setDevices(Array.isArray(s.devices) ? s.devices : []))
      .catch(() => setDevices([]));
  }, []);

  const loadRecord = (targetDate) => {
    setLoadingRecord(true);
    getRecord(targetDate)
      .then((r) => {
        const p = toPayload(r);
        if (p.device === '' && typeof window !== 'undefined') {
          try {
            const last = localStorage.getItem(LAST_DEVICE_KEY);
            if (last) p.device = last;
          } catch (_) {}
        }
        setPayload(p);
        setIsEdit(true);
      })
      .catch(() => {
        let p = emptyPayload();
        try {
          const last = localStorage.getItem(LAST_DEVICE_KEY);
          if (last) p.device = last;
        } catch (_) {}
        setPayload(p);
        setIsEdit(false);
      })
      .finally(() => setLoadingRecord(false));
  };

  useEffect(() => {
    const targetDate = dateParam || today;
    setDate(targetDate);
    loadRecord(targetDate);
  }, [dateParam, today]);

  const update = (field, value) => setPayload((p) => ({ ...p, [field]: value }));

  const saveMorning = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLoading(true);
    try {
      const body = toBody({
        ...payload,
        evening_sbp: payload.evening_sbp,
        evening_dbp: payload.evening_dbp,
      });
      if (isEdit) {
        await updateRecord(date, body);
        setMessage({ type: 'success', text: 'Morning entry saved.' });
      } else {
        await createRecord(body, date);
        setMessage({ type: 'success', text: 'Morning entry saved.' });
      }
      if (body.device != null && body.device !== '') {
        try { localStorage.setItem(LAST_DEVICE_KEY, body.device); } catch (_) {}
      }
      loadRecord(date);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save.' });
    } finally {
      setLoading(false);
    }
  };

  const saveEvening = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLoading(true);
    try {
      const body = toBody({
        ...payload,
        morning_sbp: payload.morning_sbp,
        morning_dbp: payload.morning_dbp,
      });
      if (isEdit) {
        await updateRecord(date, body);
        setMessage({ type: 'success', text: 'Evening entry saved.' });
      } else {
        await createRecord(body, date);
        setMessage({ type: 'success', text: 'Evening entry saved.' });
      }
      if (body.device != null && body.device !== '') {
        try { localStorage.setItem(LAST_DEVICE_KEY, body.device); } catch (_) {}
      }
      loadRecord(date);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save.' });
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 min-h-[44px] sm:min-h-0';

  const hasMorning = payload.morning_sbp !== '' || payload.morning_dbp !== '';
  const hasEvening = payload.evening_sbp !== '' || payload.evening_dbp !== '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Log Entry</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">
          Log morning and evening blood pressure separately. Pick a date, then save each when ready.
        </p>
      </div>

      {/* Shared date and device */}
      <div className="card p-4 sm:p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              setDate(d);
              loadRecord(d);
            }}
            className={`${inputCls} sm:w-48`}
            disabled={loadingRecord}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Device</label>
          <select
            value={payload.device}
            onChange={(e) => update('device', e.target.value)}
            className={`${inputCls} sm:w-56`}
            disabled={loadingRecord}
          >
            <option value="">Unknown</option>
            {devices.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Last selection is remembered for the next entry.</p>
        </div>
      </div>

      {message.text && (
        <p
          className={`text-sm font-medium ${message.type === 'error' ? 'text-red-600' : 'text-teal-600'}`}
          role="status"
        >
          {message.text}
        </p>
      )}

      {/* Morning – separate form */}
      <section className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Morning</h2>
        <form onSubmit={saveMorning} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500">SBP</label>
              <input
                type="number"
                min={40}
                max={250}
                placeholder="120"
                value={payload.morning_sbp}
                onChange={(e) => update('morning_sbp', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">DBP</label>
              <input
                type="number"
                min={40}
                max={250}
                placeholder="80"
                value={payload.morning_dbp}
                onChange={(e) => update('morning_dbp', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || loadingRecord}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors min-h-[44px] sm:min-h-0"
          >
            {loading ? 'Saving…' : hasMorning && isEdit ? 'Update morning' : 'Save morning'}
          </button>
        </form>
      </section>

      {/* Evening – separate form */}
      <section className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Evening</h2>
        <form onSubmit={saveEvening} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500">SBP</label>
              <input
                type="number"
                min={40}
                max={250}
                placeholder="118"
                value={payload.evening_sbp}
                onChange={(e) => update('evening_sbp', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">DBP</label>
              <input
                type="number"
                min={40}
                max={250}
                placeholder="78"
                value={payload.evening_dbp}
                onChange={(e) => update('evening_dbp', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || loadingRecord}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors min-h-[44px] sm:min-h-0"
          >
            {loading ? 'Saving…' : hasEvening && isEdit ? 'Update evening' : 'Save evening'}
          </button>
        </form>
      </section>

      {/* Shared note – saved with either morning or evening */}
      <div className="card p-4 sm:p-5">
        <label className="block text-sm font-medium text-slate-700">Note (optional)</label>
        <p className="mt-0.5 text-xs text-slate-500 mb-2">Saved when you save morning or evening.</p>
        <input
          type="text"
          placeholder="e.g. After exercise"
          value={payload.note}
          onChange={(e) => update('note', e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}
