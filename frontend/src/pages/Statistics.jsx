import { useState, useEffect } from 'react';
import { getAggregated, getRecords, getSettings } from '../api';
import { computeAllStats, computeDeviceStats, computeMeasurementHabits } from '../utils/stats';

const TIME_RANGES = [
  { value: '', label: 'All data', days: null },
  { value: 'week', label: 'Last week', days: 7 },
  { value: 'month', label: 'Last month', days: 30 },
  { value: 'quarter', label: 'Last quarter', days: 90 },
  { value: 'year', label: 'Last year', days: 365 },
];

function getRangeForTimeRange(timeRangeKey) {
  const tr = TIME_RANGES.find((r) => r.value === timeRangeKey);
  if (!tr || tr.days == null) return { from: null, to: null };
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - tr.days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function StatCard({ title, value, subtitle, variant = 'default' }) {
  const bg =
    variant === 'highlight'
      ? 'bg-teal-50 border-teal-200'
      : variant === 'warning'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-slate-50 border-slate-100';
  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${bg}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function Statistics() {
  const [timeRange, setTimeRange] = useState('');
  const [sbpHigh, setSbpHigh] = useState(135);
  const [dbpHigh, setDbpHigh] = useState(85);
  const [data, setData] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const { from: rangeFrom, to: rangeTo } = getRangeForTimeRange(timeRange);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (typeof s.sbp_high === 'number' && s.sbp_high >= 90 && s.sbp_high <= 200) setSbpHigh(s.sbp_high);
        if (typeof s.dbp_high === 'number' && s.dbp_high >= 60 && s.dbp_high <= 120) setDbpHigh(s.dbp_high);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { period: 'day' };
    if (rangeFrom) params.from = rangeFrom;
    if (rangeTo) params.to = rangeTo;
    const aggPromise = getAggregated(params).then((res) => Array.isArray(res) ? res : []).catch(() => []);
    const recParams = rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : {};
    const recPromise = getRecords(recParams).then((res) => Array.isArray(res) ? res : []).catch(() => []);
    Promise.all([aggPromise, recPromise])
      .then(([agg, rec]) => {
        setData(agg);
        setRecords(rec);
      })
      .finally(() => setLoading(false));
  }, [rangeFrom, rangeTo]);

  const stats = computeAllStats(data, rangeFrom, rangeTo, sbpHigh, dbpHigh);
  const deviceStats = computeDeviceStats(records, sbpHigh, dbpHigh);
  const habitStats = computeMeasurementHabits(data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Statistics</h1>
        <p className="mt-1 text-slate-600 text-sm sm:text-base">
          Summary and trends for your blood pressure. High zone thresholds are set in Admin.
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
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-500">Loading…</div>
      ) : !stats || data.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No data for the selected range. Log some entries to see statistics.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Overview */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Overview</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.measurementRatio != null && (
                <StatCard
                  title="Measurement ratio"
                  value={`${stats.measurementRatio.toFixed(1)}%`}
                  subtitle="of days with at least one reading"
                />
              )}
              <StatCard
                title="Total readings"
                value={String(stats.totalReadings)}
                subtitle="individual SBP/DBP values"
              />
              <StatCard
                title="Days with data"
                value={`${stats.periodsWithData}${stats.daysInRange != null ? ` / ${stats.daysInRange}` : ''}`}
                subtitle="days in selected range"
              />
            </div>
          </section>

          {/* Averages & variability */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Averages & variability</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Average SBP"
                value={stats.avgSbp != null ? `${stats.avgSbp} mmHg` : '—'}
                subtitle="systolic average"
                variant="highlight"
              />
              <StatCard
                title="Average DBP"
                value={stats.avgDbp != null ? `${stats.avgDbp} mmHg` : '—'}
                subtitle="diastolic average"
                variant="highlight"
              />
              <StatCard
                title="SBP range"
                value={
                  stats.minSbp != null && stats.maxSbp != null ? `${stats.minSbp} – ${stats.maxSbp}` : '—'
                }
                subtitle="min – max mmHg"
              />
              <StatCard
                title="DBP range"
                value={
                  stats.minDbp != null && stats.maxDbp != null ? `${stats.minDbp} – ${stats.maxDbp}` : '—'
                }
                subtitle="min – max mmHg"
              />
              {stats.stdDevSbp != null && (
                <StatCard title="SBP variability" value={`± ${stats.stdDevSbp}`} subtitle="standard deviation" />
              )}
              {stats.stdDevDbp != null && (
                <StatCard title="DBP variability" value={`± ${stats.stdDevDbp}`} subtitle="standard deviation" />
              )}
            </div>
          </section>

          {/* Morning vs evening */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Morning vs evening</h2>
            {(stats.morningAvgSbp != null || stats.eveningAvgSbp != null) && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">Average comparison (mmHg)</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-1">Morning</p>
                    <div className="flex gap-2 items-end">
                      <div
                        className="h-8 rounded bg-teal-500 min-w-[2rem]"
                        style={{
                          width: stats.morningAvgSbp != null ? `${Math.max(10, (stats.morningAvgSbp / 180) * 100)}%` : '2rem',
                        }}
                        title={stats.morningAvgSbp != null ? `SBP ${stats.morningAvgSbp}` : ''}
                      />
                      <div
                        className="h-6 rounded bg-teal-400 min-w-[2rem]"
                        style={{
                          width: stats.morningAvgDbp != null ? `${Math.max(10, (stats.morningAvgDbp / 120) * 100)}%` : '2rem',
                        }}
                        title={stats.morningAvgDbp != null ? `DBP ${stats.morningAvgDbp}` : ''}
                      />
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {stats.morningAvgSbp != null && stats.morningAvgDbp != null
                        ? `${stats.morningAvgSbp} / ${stats.morningAvgDbp}`
                        : stats.morningAvgSbp != null
                          ? `SBP ${stats.morningAvgSbp}`
                          : stats.morningAvgDbp != null
                            ? `DBP ${stats.morningAvgDbp}`
                            : '—'}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-1">Evening</p>
                    <div className="flex gap-2 items-end">
                      <div
                        className="h-8 rounded bg-violet-500 min-w-[2rem]"
                        style={{
                          width: stats.eveningAvgSbp != null ? `${Math.max(10, (stats.eveningAvgSbp / 180) * 100)}%` : '2rem',
                        }}
                        title={stats.eveningAvgSbp != null ? `SBP ${stats.eveningAvgSbp}` : ''}
                      />
                      <div
                        className="h-6 rounded bg-violet-400 min-w-[2rem]"
                        style={{
                          width: stats.eveningAvgDbp != null ? `${Math.max(10, (stats.eveningAvgDbp / 120) * 100)}%` : '2rem',
                        }}
                        title={stats.eveningAvgDbp != null ? `DBP ${stats.eveningAvgDbp}` : ''}
                      />
                    </div>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {stats.eveningAvgSbp != null && stats.eveningAvgDbp != null
                        ? `${stats.eveningAvgSbp} / ${stats.eveningAvgDbp}`
                        : stats.eveningAvgSbp != null
                          ? `SBP ${stats.eveningAvgSbp}`
                          : stats.eveningAvgDbp != null
                            ? `DBP ${stats.eveningAvgDbp}`
                            : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Morning average"
                value={
                  stats.morningAvgSbp != null && stats.morningAvgDbp != null
                    ? `${stats.morningAvgSbp} / ${stats.morningAvgDbp}`
                    : '—'
                }
                subtitle="SBP / DBP mmHg"
              />
              <StatCard
                title="Evening average"
                value={
                  stats.eveningAvgSbp != null && stats.eveningAvgDbp != null
                    ? `${stats.eveningAvgSbp} / ${stats.eveningAvgDbp}`
                    : '—'
                }
                subtitle="SBP / DBP mmHg"
              />
              <StatCard
                title="Evening − morning (SBP)"
                value={
                  stats.morningEveningDiffSbp != null
                    ? `${stats.morningEveningDiffSbp >= 0 ? '+' : ''}${stats.morningEveningDiffSbp} mmHg`
                    : '—'
                }
                subtitle="positive = evening higher"
              />
              <StatCard
                title="Evening − morning (DBP)"
                value={
                  stats.morningEveningDiffDbp != null
                    ? `${stats.morningEveningDiffDbp >= 0 ? '+' : ''}${stats.morningEveningDiffDbp} mmHg`
                    : '—'
                }
                subtitle="positive = evening higher"
              />
            </div>
          </section>

          {/* Pulse pressure */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Pulse pressure (SBP − DBP)</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                title="Average"
                value={stats.avgPulsePressure != null ? `${stats.avgPulsePressure} mmHg` : '—'}
                subtitle="typical difference"
              />
              <StatCard
                title="Min – max"
                value={
                  stats.minPulsePressure != null && stats.maxPulsePressure != null
                    ? `${stats.minPulsePressure} – ${stats.maxPulsePressure} mmHg`
                    : '—'
                }
                subtitle="range in period"
              />
            </div>
          </section>

          {/* Trend (first vs second half) */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Trend in period</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="First half avg (SBP)"
                value={stats.firstHalfAvgSbp != null ? `${stats.firstHalfAvgSbp} mmHg` : '—'}
              />
              <StatCard
                title="Second half avg (SBP)"
                value={stats.secondHalfAvgSbp != null ? `${stats.secondHalfAvgSbp} mmHg` : '—'}
              />
              <StatCard
                title="SBP trend"
                value={
                  stats.trendSbp != null
                    ? `${stats.trendSbp >= 0 ? '+' : ''}${stats.trendSbp} mmHg`
                    : '—'
                }
                subtitle="second half − first half"
                variant={stats.trendSbp != null && stats.trendSbp < 0 ? 'highlight' : 'default'}
              />
              <StatCard
                title="DBP trend"
                value={
                  stats.trendDbp != null
                    ? `${stats.trendDbp >= 0 ? '+' : ''}${stats.trendDbp} mmHg`
                    : '—'
                }
                subtitle="second half − first half"
                variant={stats.trendDbp != null && stats.trendDbp < 0 ? 'highlight' : 'default'}
              />
            </div>
          </section>

          {/* Best / worst period */}
          {(stats.bestPeriodSbp || stats.worstPeriodSbp) && (
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Best & worst days</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stats.bestPeriodSbp && (
                  <StatCard
                    title="Lowest SBP day"
                    value={stats.bestPeriodSbp.value}
                    subtitle={stats.bestPeriodSbp.label}
                    variant="highlight"
                  />
                )}
                {stats.worstPeriodSbp && (
                  <StatCard title="Highest SBP day" value={stats.worstPeriodSbp.value} subtitle={stats.worstPeriodSbp.label} />
                )}
                {stats.bestPeriodDbp && (
                  <StatCard
                    title="Lowest DBP day"
                    value={stats.bestPeriodDbp.value}
                    subtitle={stats.bestPeriodDbp.label}
                    variant="highlight"
                  />
                )}
                {stats.worstPeriodDbp && (
                  <StatCard title="Highest DBP day" value={stats.worstPeriodDbp.value} subtitle={stats.worstPeriodDbp.label} />
                )}
              </div>
            </section>
          )}

          {/* By device */}
          {deviceStats.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-3">By device</h2>
              <p className="text-sm text-slate-600 mb-3">
                Statistics per device. Records without a device are shown as &quot;Unknown&quot;.
              </p>
              <div className="space-y-4">
                {deviceStats.map((d) => (
                  <div key={d.device} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2">{d.device}</h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                      <div>
                        <span className="text-slate-500">Entries</span>
                        <span className="ml-2 font-medium text-slate-900">{d.count}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Readings</span>
                        <span className="ml-2 font-medium text-slate-900">{d.readingCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Avg SBP/DBP</span>
                        <span className="ml-2 font-medium text-slate-900 tabular-nums">
                          {d.avgSbp != null && d.avgDbp != null ? `${d.avgSbp} / ${d.avgDbp}` : d.avgSbp != null ? `SBP ${d.avgSbp}` : d.avgDbp != null ? `DBP ${d.avgDbp}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">High zone</span>
                        <span className="ml-2 font-medium text-slate-900">{d.highZoneRatio}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Goal / high zone */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">High zone & goals</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="High zone ratio"
                value={`${stats.highZoneRatio.toFixed(1)}%`}
                subtitle="readings at or above threshold"
                variant={stats.highZoneRatio > 20 ? 'warning' : 'default'}
              />
              <StatCard
                title="Normal zone ratio"
                value={`${stats.normalZoneRatio.toFixed(1)}%`}
                subtitle="readings below threshold"
              />
              <StatCard
                title="Periods with high reading"
                value={`${stats.periodsWithHigh} / ${stats.periodsWithData}`}
                subtitle="days with at least one high reading"
              />
              <StatCard
                title="Days all in range"
                value={`${stats.pctPeriodsAllInRange.toFixed(0)}%`}
                subtitle={`${stats.periodsAllInRange} days with all readings below threshold`}
                variant={stats.pctPeriodsAllInRange >= 80 ? 'highlight' : 'default'}
              />
            </div>
          </section>

          {/* Measurement habits */}
          {habitStats && (
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Measurement habits</h2>
              <p className="text-sm text-slate-600 mb-4">
                Fun stats about when and how often you measure.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                <StatCard
                  title="Longest streak"
                  value={habitStats.maxConsecutiveDays}
                  subtitle="most consecutive days with a measurement"
                  variant="highlight"
                />
                {habitStats.currentStreak != null && habitStats.currentStreak > 0 && (
                  <StatCard
                    title="Current streak"
                    value={habitStats.currentStreak}
                    subtitle="consecutive days up to today"
                    variant="highlight"
                  />
                )}
                {habitStats.longestGapDays != null && (
                  <StatCard
                    title="Longest gap"
                    value={`${habitStats.longestGapDays} day${habitStats.longestGapDays !== 1 ? 's' : ''}`}
                    subtitle="between two measurement days"
                  />
                )}
                {habitStats.busiestWeekday && (
                  <StatCard
                    title="Busiest weekday"
                    value={habitStats.busiestWeekday.name}
                    subtitle={`${habitStats.busiestWeekday.count} measurement day${habitStats.busiestWeekday.count !== 1 ? 's' : ''}`}
                  />
                )}
                {habitStats.busiestMonth && (
                  <StatCard
                    title="Busiest month"
                    value={habitStats.busiestMonth.name}
                    subtitle={`${habitStats.busiestMonth.count} day${habitStats.busiestMonth.count !== 1 ? 's' : ''} in range`}
                  />
                )}
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Measurements by day of week</p>
                  <div className="space-y-2">
                    {habitStats.byDayOfWeek.map(({ name, count, readings }) => {
                      const max = Math.max(...habitStats.byDayOfWeek.map((d) => d.count), 1);
                      const pct = (count / max) * 100;
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-sm text-slate-600 w-24 shrink-0">{name.slice(0, 3)}</span>
                          <div className="flex-1 h-5 bg-slate-200 rounded overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded min-w-[2px] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-800 tabular-nums w-8 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Number of days with at least one reading per weekday.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Measurements by month</p>
                  <div className="space-y-2">
                    {habitStats.byMonth
                      .filter((m) => m.count > 0)
                      .map(({ name, count }) => {
                        const max = Math.max(...habitStats.byMonth.map((d) => d.count), 1);
                        const pct = (count / max) * 100;
                        return (
                          <div key={name} className="flex items-center gap-2">
                            <span className="text-sm text-slate-600 w-12 shrink-0">{name.slice(0, 3)}</span>
                            <div className="flex-1 h-5 bg-slate-200 rounded overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded min-w-[2px] transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-slate-800 tabular-nums w-8 text-right">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Days with data per month (in selected range).</p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
