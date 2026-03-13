import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getAggregated, getSettings } from '../api';

const PERIODS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'Yearly' },
];

const TIME_RANGES = [
  { value: '', label: 'All data', days: null },
  { value: 'week', label: 'Last week', days: 7 },
  { value: 'month', label: 'Last month', days: 30 },
  { value: 'quarter', label: 'Last quarter', days: 90 },
  { value: 'year', label: 'Last year', days: 365 },
];

const VIEW_MODES = [
  { value: 'morning', label: 'Morning only' },
  { value: 'evening', label: 'Evening only' },
  { value: 'both', label: 'Both (separate)' },
  { value: 'all', label: 'All (merged)' },
];

const Y_DOMAIN = [50, 190];

/** Format date as local YYYY-MM-DD so range matches user's calendar and stored record dates. */
function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRangeForTimeRange(timeRangeKey) {
  const tr = TIME_RANGES.find((r) => r.value === timeRangeKey);
  if (!tr || tr.days == null) return { from: null, to: null };
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - tr.days);
  return {
    from: toLocalDateString(from),
    to: toLocalDateString(to),
  };
}

// Coerce to number so chart works even if API returns string numbers
const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

// Waterfall-style: each bar goes from DBP (base) to SBP (base + segment). Add base + segment for stacked Bar.
function getRangeSeries(data, viewMode) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const hasVal = (d, getLow, getHigh) => {
    const low = num(getLow(d));
    const high = num(getHigh(d));
    return low != null && high != null && high >= low;
  };
  const addStack = (point, low, high) => {
    if (low != null && high != null && high >= low) {
      point.base = low;
      point.segment = high - low;
    } else {
      point.base = 0;
      point.segment = 0;
    }
  };
  return data.map((d, i) => {
    const point = { ...d, index: i };
    if (viewMode === 'morning') {
      if (hasVal(d, (x) => x.morning_dbp, (x) => x.morning_sbp)) {
        point.rangeLow = num(d.morning_dbp);
        point.rangeHigh = num(d.morning_sbp);
      }
      addStack(point, point.rangeLow, point.rangeHigh);
      return point;
    }
    if (viewMode === 'evening') {
      if (hasVal(d, (x) => x.evening_dbp, (x) => x.evening_sbp)) {
        point.rangeLow = num(d.evening_dbp);
        point.rangeHigh = num(d.evening_sbp);
      }
      addStack(point, point.rangeLow, point.rangeHigh);
      return point;
    }
    if (viewMode === 'all') {
      const lows = [d.morning_dbp, d.evening_dbp].map(num).filter((v) => v != null);
      const highs = [d.morning_sbp, d.evening_sbp].map(num).filter((v) => v != null);
      if (lows.length && highs.length) {
        point.rangeLow = Math.min(...lows);
        point.rangeHigh = Math.max(...highs);
      }
      addStack(point, point.rangeLow, point.rangeHigh);
      return point;
    }
    // both: morning and evening as separate stacks per period
    if (hasVal(d, (x) => x.morning_dbp, (x) => x.morning_sbp)) {
      point.morningLow = num(d.morning_dbp);
      point.morningHigh = num(d.morning_sbp);
    }
    if (hasVal(d, (x) => x.evening_dbp, (x) => x.evening_sbp)) {
      point.eveningLow = num(d.evening_dbp);
      point.eveningHigh = num(d.evening_sbp);
    }
    addStack(point, point.morningLow, point.morningHigh); // for morning bar we use morning base/segment
    point.eveningBase = point.eveningLow ?? 0;
    point.eveningSegment = (point.eveningHigh != null && point.eveningLow != null) ? point.eveningHigh - point.eveningLow : 0;
    return point;
  });
}

function RangeChart({ data, viewMode, sbpHigh, dbpHigh }) {
  const series = getRangeSeries(data, viewMode);

  if (viewMode === 'both') {
    const tooltipMorning = ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const p = payload[0].payload;
      if (p.morningHigh != null) return (
        <div className="rounded bg-white p-2 shadow border text-sm">{p.label}: {p.morningLow}–{p.morningHigh} mmHg</div>
      );
      return null;
    };
    const tooltipEvening = ({ active, payload }) => {
      if (!active || !payload?.length) return null;
      const p = payload[0].payload;
      if (p.eveningHigh != null) return (
        <div className="rounded bg-white p-2 shadow border text-sm">{p.label}: {p.eveningLow}–{p.eveningHigh} mmHg</div>
      );
      return null;
    };
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-medium text-slate-500 mb-2">Morning (SBP–DBP)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="index" tick={{ fontSize: 11 }} tickFormatter={(i) => series[i]?.label ?? ''} />
              <YAxis domain={Y_DOMAIN} tick={{ fontSize: 11 }} />
              <ReferenceLine y={sbpHigh} stroke="#eab308" strokeDasharray="3 3" />
              <ReferenceLine y={dbpHigh} stroke="#dc2626" strokeDasharray="3 3" />
              <Tooltip content={tooltipMorning} />
              <Bar dataKey="base" stackId="m" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="segment" stackId="m" fill="#0ea5e9" fillOpacity={0.85} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="text-xs font-medium text-slate-500 mb-2">Evening (SBP–DBP)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="index" tick={{ fontSize: 11 }} tickFormatter={(i) => series[i]?.label ?? ''} />
              <YAxis domain={Y_DOMAIN} tick={{ fontSize: 11 }} />
              <ReferenceLine y={sbpHigh} stroke="#eab308" strokeDasharray="3 3" />
              <ReferenceLine y={dbpHigh} stroke="#dc2626" strokeDasharray="3 3" />
              <Tooltip content={tooltipEvening} />
              <Bar dataKey="eveningBase" stackId="e" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="eveningSegment" stackId="e" fill="#8b5cf6" fillOpacity={0.85} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  const color =
    viewMode === 'morning' ? '#0ea5e9' : viewMode === 'evening' ? '#8b5cf6' : '#64748b';
  const label =
    viewMode === 'morning' ? 'Morning' : viewMode === 'evening' ? 'Evening' : 'Merged (all values)';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="index" tick={{ fontSize: 11 }} tickFormatter={(i) => series[i]?.label ?? ''} />
        <YAxis domain={Y_DOMAIN} tick={{ fontSize: 11 }} />
        <ReferenceLine y={sbpHigh} stroke="#eab308" strokeDasharray="3 3" />
        <ReferenceLine y={dbpHigh} stroke="#dc2626" strokeDasharray="3 3" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            if (p.rangeHigh != null)
              return (
                <div className="rounded bg-white p-2 shadow border text-sm">
                  {p.label}: {p.rangeLow}–{p.rangeHigh} mmHg ({label})
                </div>
              );
            return null;
          }}
        />
        <Legend />
        <Bar dataKey="base" stackId="bp" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="segment" stackId="bp" fill={color} fillOpacity={0.85} name="SBP–DBP" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('week');
  const [timeRange, setTimeRange] = useState('quarter');
  const [viewMode, setViewMode] = useState('all');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sbpHighNum, setSbpHighNum] = useState(135);
  const [dbpHighNum, setDbpHighNum] = useState(85);

  const { from: rangeFrom, to: rangeTo } = getRangeForTimeRange(timeRange);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (typeof s.sbp_high === 'number' && s.sbp_high >= 90 && s.sbp_high <= 200) setSbpHighNum(s.sbp_high);
        if (typeof s.dbp_high === 'number' && s.dbp_high >= 60 && s.dbp_high <= 120) setDbpHighNum(s.dbp_high);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { period };
    if (rangeFrom) params.from = rangeFrom;
    if (rangeTo) params.to = rangeTo;
    getAggregated(params)
      .then((res) => setData(Array.isArray(res) ? res : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period, timeRange, rangeFrom, rangeTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Dashboard</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">
          Blood pressure as SBP–DBP range. High zone uses thresholds set in Admin.
        </p>
      </div>

      <div className="card p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-2">Time range</p>
          <div className="flex flex-wrap gap-2">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value || 'all'}
                type="button"
                onClick={() => setTimeRange(r.value)}
                className={`rounded-lg px-3 py-2 sm:py-2.5 text-sm font-medium transition-colors ${
                  timeRange === r.value ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500 mb-2">Period</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`rounded-lg px-3 py-2 sm:py-2.5 text-sm font-medium transition-colors ${
                  period === p.value ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500 mb-2">Show</p>
          <div className="flex flex-wrap gap-2">
            {VIEW_MODES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setViewMode(v.value)}
                className={`rounded-lg px-3 py-2 sm:py-2.5 text-sm font-medium transition-colors ${
                  viewMode === v.value ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No data for the selected period. Log some entries to see trends.
        </div>
      ) : (
        <div className="card p-4 sm:p-5 overflow-hidden">
          <RangeChart data={data} viewMode={viewMode} sbpHigh={sbpHighNum} dbpHigh={dbpHighNum} />
        </div>
      )}
    </div>
  );
}
