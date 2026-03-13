/**
 * Compute all statistics from aggregated daily data (period=day).
 * data: array of { morning_sbp, morning_dbp, evening_sbp, evening_dbp, label, ... }
 * rangeFrom, rangeTo: date strings (YYYY-MM-DD) for the selected range; used for daysInRange and measurementRatio.
 * sbpHigh, dbpHigh: thresholds for "high zone"
 *
 * COMPUTATION LOGIC (caller must pass data already filtered to [rangeFrom, rangeTo] when range is set):
 *
 * — daysInRange: Calendar days from rangeFrom to rangeTo inclusive. Uses noon UTC to avoid DST skew.
 * — periodsWithData: data.length (number of days in the filtered data that have at least one reading).
 * — measurementRatio: (periodsWithData / daysInRange) * 100 — % of days in range with at least one reading.
 * — totalReadings: Sum over all days of (1 per SBP value + 1 per DBP value); each morning/evening pair can add up to 2.
 * — highZoneRatio: % of those total readings where SBP >= sbpHigh or DBP >= dbpHigh.
 * — normalZoneRatio: 100 - highZoneRatio.
 * — avgSbp / avgDbp: Mean of all SBP/DBP values in the period.
 * — minSbp, maxSbp, minDbp, maxDbp: Min/max over all SBP/DBP values.
 * — stdDevSbp / stdDevDbp: Population standard deviation of SBP/DBP values.
 * — morningAvgSbp/Dbp, eveningAvgSbp/Dbp: Mean of morning/evening values only.
 * — morningEveningDiffSbp/Dbp: evening average − morning average.
 * — avgPulsePressure, minPulsePressure, maxPulsePressure: From (SBP − DBP) per reading where both present.
 * — firstHalfAvgSbp/Dbp, secondHalfAvgSbp/Dbp: Mean over first/second half of data (by order of days).
 * — trendSbp/Dbp: second half average − first half average.
 * — bestPeriodSbp/Dbp, worstPeriodSbp/Dbp: Day with lowest/highest daily average SBP/DBP.
 * — periodsWithHigh: Number of days that have at least one reading in the high zone.
 * — periodsAllInRange: Number of days that have at least one reading and all readings below threshold.
 * — pctPeriodsAllInRange: (periodsAllInRange / periodsWithData) * 100.
 */
function stdDev(arr) {
  if (!arr.length) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sqDiffs = arr.map((x) => (x - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function computeAllStats(data, rangeFrom, rangeTo, sbpHigh, dbpHigh) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

  const allSbp = [];
  const allDbp = [];
  let totalReadings = 0;
  let highReadings = 0;
  let sbpSum = 0;
  let dbpSum = 0;
  let sbpCount = 0;
  let dbpCount = 0;
  let periodsWithHigh = 0;
  const morningSbpHalf = [];
  const morningDbpHalf = [];
  const eveningSbpHalf = [];
  const eveningDbpHalf = [];
  const pulsePressures = [];
  let periodsAllInRange = 0;
  const periodRows = []; // { label, avgSbp, avgDbp } per day

  for (const d of data) {
    const vals = [
      [num(d.morning_sbp), num(d.morning_dbp)],
      [num(d.evening_sbp), num(d.evening_dbp)],
    ];
    let pointHigh = false;
    let pointAllInRange = true;
    let periodSbpSum = 0;
    let periodSbpCount = 0;
    let periodDbpSum = 0;
    let periodDbpCount = 0;

    for (const [sbp, dbp] of vals) {
      if (sbp != null) {
        totalReadings += 1;
        allSbp.push(sbp);
        sbpSum += sbp;
        sbpCount += 1;
        periodSbpSum += sbp;
        periodSbpCount += 1;
        if (sbp >= sbpHigh) {
          highReadings += 1;
          pointHigh = true;
          pointAllInRange = false;
        }
      }
      if (dbp != null) {
        totalReadings += 1;
        allDbp.push(dbp);
        dbpSum += dbp;
        dbpCount += 1;
        periodDbpSum += dbp;
        periodDbpCount += 1;
        if (dbp >= dbpHigh) {
          highReadings += 1;
          pointHigh = true;
          pointAllInRange = false;
        }
      }
      if (sbp != null && dbp != null) {
        pulsePressures.push(sbp - dbp);
      }
    }

    if (pointHigh) periodsWithHigh += 1;
    if (pointAllInRange && (num(d.morning_sbp) != null || num(d.evening_sbp) != null)) periodsAllInRange += 1;

    if (num(d.morning_sbp) != null) morningSbpHalf.push(num(d.morning_sbp));
    if (num(d.morning_dbp) != null) morningDbpHalf.push(num(d.morning_dbp));
    if (num(d.evening_sbp) != null) eveningSbpHalf.push(num(d.evening_sbp));
    if (num(d.evening_dbp) != null) eveningDbpHalf.push(num(d.evening_dbp));

    const avgSbpHere = periodSbpCount > 0 ? periodSbpSum / periodSbpCount : null;
    const avgDbpHere = periodDbpCount > 0 ? periodDbpSum / periodDbpCount : null;
    if (avgSbpHere != null || avgDbpHere != null) {
      periodRows.push({ label: d.label, avgSbp: avgSbpHere, avgDbp: avgDbpHere });
    }
  }

  // Use noon UTC to avoid DST making a calendar day count as 23 or 25 hours
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInRange =
    rangeFrom && rangeTo
      ? Math.max(1, Math.round((new Date(rangeTo + 'T12:00:00') - new Date(rangeFrom + 'T12:00:00')) / msPerDay) + 1)
      : null;
  const measurementRatio = daysInRange != null && daysInRange > 0 ? (data.length / daysInRange) * 100 : null;
  const highZoneRatio = totalReadings > 0 ? (highReadings / totalReadings) * 100 : 0;
  const normalZoneRatio = totalReadings > 0 ? ((totalReadings - highReadings) / totalReadings) * 100 : 0;
  const pctPeriodsAllInRange = data.length > 0 ? (periodsAllInRange / data.length) * 100 : 0;

  const avgSbp = sbpCount > 0 ? Math.round((sbpSum / sbpCount) * 10) / 10 : null;
  const avgDbp = dbpCount > 0 ? Math.round((dbpSum / dbpCount) * 10) / 10 : null;
  const avgPulsePressure =
    pulsePressures.length > 0 ? Math.round(mean(pulsePressures) * 10) / 10 : null;
  const minPulsePressure = pulsePressures.length > 0 ? Math.min(...pulsePressures) : null;
  const maxPulsePressure = pulsePressures.length > 0 ? Math.max(...pulsePressures) : null;

  const morningAvgSbp = morningSbpHalf.length > 0 ? Math.round(mean(morningSbpHalf) * 10) / 10 : null;
  const morningAvgDbp = morningDbpHalf.length > 0 ? Math.round(mean(morningDbpHalf) * 10) / 10 : null;
  const eveningAvgSbp = eveningSbpHalf.length > 0 ? Math.round(mean(eveningSbpHalf) * 10) / 10 : null;
  const eveningAvgDbp = eveningDbpHalf.length > 0 ? Math.round(mean(eveningDbpHalf) * 10) / 10 : null;
  const morningEveningDiffSbp =
    morningAvgSbp != null && eveningAvgSbp != null ? Math.round((eveningAvgSbp - morningAvgSbp) * 10) / 10 : null;
  const morningEveningDiffDbp =
    morningAvgDbp != null && eveningAvgDbp != null ? Math.round((eveningAvgDbp - morningAvgDbp) * 10) / 10 : null;

  const half = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, half);
  const secondHalf = data.slice(half);
  const firstHalfSbp = [];
  const firstHalfDbp = [];
  const secondHalfSbp = [];
  const secondHalfDbp = [];
  firstHalf.forEach((d) => {
    if (num(d.morning_sbp) != null) firstHalfSbp.push(num(d.morning_sbp));
    if (num(d.evening_sbp) != null) firstHalfSbp.push(num(d.evening_sbp));
    if (num(d.morning_dbp) != null) firstHalfDbp.push(num(d.morning_dbp));
    if (num(d.evening_dbp) != null) firstHalfDbp.push(num(d.evening_dbp));
  });
  secondHalf.forEach((d) => {
    if (num(d.morning_sbp) != null) secondHalfSbp.push(num(d.morning_sbp));
    if (num(d.evening_sbp) != null) secondHalfSbp.push(num(d.evening_sbp));
    if (num(d.morning_dbp) != null) secondHalfDbp.push(num(d.morning_dbp));
    if (num(d.evening_dbp) != null) secondHalfDbp.push(num(d.evening_dbp));
  });
  const firstHalfAvgSbp = firstHalfSbp.length > 0 ? Math.round(mean(firstHalfSbp) * 10) / 10 : null;
  const firstHalfAvgDbp = firstHalfDbp.length > 0 ? Math.round(mean(firstHalfDbp) * 10) / 10 : null;
  const secondHalfAvgSbp = secondHalfSbp.length > 0 ? Math.round(mean(secondHalfSbp) * 10) / 10 : null;
  const secondHalfAvgDbp = secondHalfDbp.length > 0 ? Math.round(mean(secondHalfDbp) * 10) / 10 : null;
  const trendSbp =
    firstHalfAvgSbp != null && secondHalfAvgSbp != null
      ? Math.round((secondHalfAvgSbp - firstHalfAvgSbp) * 10) / 10
      : null;
  const trendDbp =
    firstHalfAvgDbp != null && secondHalfAvgDbp != null
      ? Math.round((secondHalfAvgDbp - firstHalfAvgDbp) * 10) / 10
      : null;

  let bestPeriodSbp = null;
  let bestPeriodDbp = null;
  let worstPeriodSbp = null;
  let worstPeriodDbp = null;
  const sbpRows = periodRows.filter((r) => r.avgSbp != null);
  const dbpRows = periodRows.filter((r) => r.avgDbp != null);
  if (sbpRows.length > 0) {
    const best = sbpRows.reduce((a, b) => (a.avgSbp < b.avgSbp ? a : b));
    const worst = sbpRows.reduce((a, b) => (a.avgSbp > b.avgSbp ? a : b));
    bestPeriodSbp = { label: best.label, value: Math.round(best.avgSbp * 10) / 10 };
    worstPeriodSbp = { label: worst.label, value: Math.round(worst.avgSbp * 10) / 10 };
  }
  if (dbpRows.length > 0) {
    const best = dbpRows.reduce((a, b) => (a.avgDbp < b.avgDbp ? a : b));
    const worst = dbpRows.reduce((a, b) => (a.avgDbp > b.avgDbp ? a : b));
    bestPeriodDbp = { label: best.label, value: Math.round(best.avgDbp * 10) / 10 };
    worstPeriodDbp = { label: worst.label, value: Math.round(worst.avgDbp * 10) / 10 };
  }

  return {
    totalReadings,
    highReadings,
    highZoneRatio,
    normalZoneRatio,
    avgSbp,
    avgDbp,
    periodsWithData: data.length,
    periodsWithHigh,
    periodsAllInRange,
    pctPeriodsAllInRange,
    measurementRatio,
    daysInRange,
    stdDevSbp: allSbp.length > 1 ? Math.round(stdDev(allSbp) * 10) / 10 : null,
    stdDevDbp: allDbp.length > 1 ? Math.round(stdDev(allDbp) * 10) / 10 : null,
    minSbp: allSbp.length > 0 ? Math.min(...allSbp) : null,
    maxSbp: allSbp.length > 0 ? Math.max(...allSbp) : null,
    minDbp: allDbp.length > 0 ? Math.min(...allDbp) : null,
    maxDbp: allDbp.length > 0 ? Math.max(...allDbp) : null,
    avgPulsePressure,
    minPulsePressure,
    maxPulsePressure,
    morningAvgSbp,
    morningAvgDbp,
    eveningAvgSbp,
    eveningAvgDbp,
    morningEveningDiffSbp,
    morningEveningDiffDbp,
    firstHalfAvgSbp,
    secondHalfAvgSbp,
    firstHalfAvgDbp,
    secondHalfAvgDbp,
    trendSbp,
    trendDbp,
    bestPeriodSbp,
    worstPeriodSbp,
    bestPeriodDbp,
    worstPeriodDbp,
  };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Compute fun measurement-habit statistics from daily aggregated data.
 * data: array of { label, morning_sbp, morning_dbp, evening_sbp, evening_dbp } (period=day).
 * Returns { maxConsecutiveDays, currentStreak, byDayOfWeek, byMonth, longestGapDays, busiestWeekday, busiestMonth }.
 *
 * COMPUTATION LOGIC:
 * — maxConsecutiveDays: Max run of consecutive calendar days that have at least one reading (label dates sorted).
 * — currentStreak: Consecutive days with a reading ending on the most recent reading date, only if that date is today or yesterday.
 * — byDayOfWeek: For each weekday (0–6), count of days with at least one reading.
 * — byMonth: For each month (1–12), count of days with data (in the given data set).
 * — longestGapDays: Max (calendar days − 1) between two consecutive measurement days.
 * — busiestWeekday / busiestMonth: Weekday or month with the highest count of days with data.
 */
export function computeMeasurementHabits(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const dates = data
    .map((d) => d.label)
    .filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l))
    .sort();
  if (dates.length === 0) return null;

  const toDate = (s) => new Date(s + 'T12:00:00');
  const toDay = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  };
  const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / (24 * 60 * 60 * 1000));

  // Max consecutive days with at least one measurement
  let maxConsecutiveDays = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = dayDiff(dates[i - 1], dates[i]);
    if (diff === 1) run += 1;
    else run = 1;
    maxConsecutiveDays = Math.max(maxConsecutiveDays, run);
  }

  // Current streak: from today backwards (only if latest measurement is today or yesterday)
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastDate = dates[dates.length - 1];
  const lastToToday = dayDiff(lastDate, todayStr);
  let currentStreak = 0;
  if (lastToToday <= 1) {
    currentStreak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      if (dayDiff(dates[i], dates[i + 1]) === 1) currentStreak += 1;
      else break;
    }
  }

  // By day of week (0=Sun .. 6=Sat): count of days with data
  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  const readingsByDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  for (const d of data) {
    if (!d.label || !/^\d{4}-\d{2}-\d{2}$/.test(d.label)) continue;
    const dayOfWeek = toDate(d.label).getDay();
    byDayOfWeek[dayOfWeek] += 1;
    let readings = 0;
    if (num(d.morning_sbp) != null || num(d.morning_dbp) != null) readings += 1;
    if (num(d.evening_sbp) != null || num(d.evening_dbp) != null) readings += 1;
    readingsByDayOfWeek[dayOfWeek] += Math.max(1, readings);
  }

  // By month (1–12): count of days with data
  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = 0;
  for (const label of dates) {
    const m = parseInt(label.slice(5, 7), 10);
    if (m >= 1 && m <= 12) byMonth[m] = (byMonth[m] || 0) + 1;
  }

  // Longest gap (days) between two consecutive measurement days
  let longestGapDays = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = dayDiff(dates[i - 1], dates[i]) - 1;
    if (gap > longestGapDays) longestGapDays = gap;
  }

  const dayOfWeekCounts = byDayOfWeek.map((count, i) => ({ name: WEEKDAY_NAMES[i], count, readings: readingsByDayOfWeek[i] }));
  const busiestWeekday = dayOfWeekCounts.reduce((a, b) => (a.count >= b.count ? a : b), { name: '—', count: 0 });
  const monthCounts = Object.entries(byMonth).map(([m, count]) => ({
    month: parseInt(m, 10),
    name: MONTH_NAMES[parseInt(m, 10) - 1],
    count,
  }));
  const busiestMonth = monthCounts.reduce((a, b) => (a.count >= b.count ? a : b), { name: '—', count: 0 });

  return {
    maxConsecutiveDays,
    currentStreak: currentStreak > 0 ? currentStreak : null,
    byDayOfWeek: dayOfWeekCounts,
    byMonth: monthCounts,
    longestGapDays: dates.length > 1 ? longestGapDays : null,
    busiestWeekday: busiestWeekday.count > 0 ? busiestWeekday : null,
    busiestMonth: busiestMonth.count > 0 ? busiestMonth : null,
    totalMeasurementDays: dates.length,
  };
}

/**
 * Compute per-device statistics from raw records.
 * Records with no device (null/empty) are grouped as "Unknown".
 * sbpHigh, dbpHigh: thresholds for high-zone ratio.
 * Returns array of { device, count, readingCount, avgSbp, avgDbp, highReadings, highZoneRatio }.
 *
 * COMPUTATION LOGIC:
 * — count: Number of records (one per calendar day) for that device.
 * — readingCount: Total SBP + DBP values (each morning/evening SBP or DBP counts as 1).
 * — avgSbp / avgDbp: Mean of all SBP/DBP values for that device.
 * — highReadings: Number of (SBP, DBP) pairs where SBP >= sbpHigh or DBP >= dbpHigh.
 * — highZoneRatio: (highReadings / readingCount) * 100 (readings are pairs; ratio is per reading pair when both present).
 */
export function computeDeviceStats(records, sbpHigh = 135, dbpHigh = 85) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  const byDevice = new Map();

  for (const r of records) {
    const device = (r.device && String(r.device).trim()) || 'Unknown';
    if (!byDevice.has(device)) {
      byDevice.set(device, {
        device,
        sbpSum: 0,
        sbpCount: 0,
        dbpSum: 0,
        dbpCount: 0,
        highReadings: 0,
        recordCount: 0,
      });
    }
    const row = byDevice.get(device);
    row.recordCount += 1;
    const vals = [
      [num(r.morning_sbp), num(r.morning_dbp)],
      [num(r.evening_sbp), num(r.evening_dbp)],
    ];
    for (const [sbp, dbp] of vals) {
      if (sbp != null) {
        row.sbpSum += sbp;
        row.sbpCount += 1;
      }
      if (dbp != null) {
        row.dbpSum += dbp;
        row.dbpCount += 1;
      }
      if (sbp != null && dbp != null) {
        if (sbp >= sbpHigh || dbp >= dbpHigh) row.highReadings += 1;
      }
    }
  }

  return Array.from(byDevice.values()).map((row) => {
    const totalReadings = row.sbpCount + row.dbpCount;
    const avgSbp = row.sbpCount > 0 ? Math.round((row.sbpSum / row.sbpCount) * 10) / 10 : null;
    const avgDbp = row.dbpCount > 0 ? Math.round((row.dbpSum / row.dbpCount) * 10) / 10 : null;
    const highZoneRatio = totalReadings > 0 ? Math.round((row.highReadings / totalReadings) * 100) : 0;
    return {
      device: row.device,
      count: row.recordCount,
      readingCount: totalReadings,
      avgSbp,
      avgDbp,
      highReadings: row.highReadings,
      highZoneRatio,
    };
  });
}
