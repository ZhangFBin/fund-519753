/**
 * indicators.js v2 — 精简版
 * 回撤计算 / 收益计算 / ATH / 日收益
 */

// ── 回撤 ──
function calcDrawdowns(navs) {
  const dd = new Array(navs.length).fill(0);
  if (!navs.length) return dd;
  let peak = navs[0];
  for (let i = 0; i < navs.length; i++) {
    if (navs[i] > peak) peak = navs[i];
    dd[i] = (navs[i] - peak) / peak;
  }
  return dd;
}

function calcMaxDrawdown(drawdowns, dates, navs) {
  if (!drawdowns.length) return { mdd: 0, peakDate: '', endDate: '' };
  let mdd = 0, idx = 0;
  for (let i = 0; i < drawdowns.length; i++) {
    if (drawdowns[i] < mdd) { mdd = drawdowns[i]; idx = i; }
  }
  let peakIdx = idx;
  for (let i = idx - 1; i >= 0; i--) { if (drawdowns[i] === 0) { peakIdx = i; break; } }
  return { mdd, peakDate: dates[peakIdx] || '', endDate: dates[idx] || '' };
}

function calcCurrentDrawdown(drawdowns, dates) {
  const last = drawdowns.length - 1;
  if (last < 0) return { currentDD: 0, daysInDD: 0, peakDate: '' };
  let peakIdx = last;
  for (let i = last; i >= 0; i--) { if (drawdowns[i] === 0) { peakIdx = i; break; } }
  return { currentDD: drawdowns[last], daysInDD: last - peakIdx, peakDate: dates[peakIdx] || '' };
}

// ── 日收益率 ──
function calcDailyReturns(navs) {
  const r = [];
  for (let i = 1; i < navs.length; i++) r.push(navs[i] / navs[i - 1] - 1);
  return r;
}

// ── 区间收益 ──
function calcPeriodReturns(navs, dates) {
  if (navs.length < 2) return { m1: null, m3: null, m6: null, y1: null, ytd: null };
  const lastDate = dates[dates.length - 1];
  const lastNav = navs[navs.length - 1];

  function findBefore(days) {
    const t = new Date(lastDate); t.setDate(t.getDate() - Math.ceil(days * 7 / 5));
    const ts = t.toISOString().slice(0, 10);
    for (let i = dates.length - 1; i >= 0; i--) { if (dates[i] <= ts) return navs[i]; }
    return navs[0];
  }

  const year = lastDate.slice(0, 4);
  let ytdIdx = 0;
  for (let i = dates.length - 1; i >= 0; i--) { if (dates[i] < year + '-01-01') { ytdIdx = i; break; } }

  return {
    m1: lastNav / findBefore(30) - 1,
    m3: lastNav / findBefore(90) - 1,
    m6: lastNav / findBefore(180) - 1,
    y1: lastNav / findBefore(365) - 1,
    ytd: lastNav / navs[ytdIdx] - 1,
    ytdStart: dates[ytdIdx]
  };
}

// ── ATH ──
function findATHs(navs, dates) {
  const aths = []; let peak = -Infinity;
  for (let i = 0; i < navs.length; i++) {
    if (navs[i] > peak) { peak = navs[i]; aths.push({ date: dates[i], nav: navs[i], idx: i }); }
  }
  return aths;
}

function isATH(navs, tol = 0.0005) {
  if (!navs.length) return false;
  return navs[navs.length - 1] >= Math.max(...navs) * (1 - tol);
}

// ── 连涨/连跌天数 ──
function calcStreak(dailyReturns) {
  if (!dailyReturns.length) return { dir: 0, days: 0 };
  let dir = dailyReturns[dailyReturns.length - 1] >= 0 ? 1 : -1;
  let days = 1;
  for (let i = dailyReturns.length - 2; i >= 0; i--) {
    if ((dir === 1 && dailyReturns[i] >= 0) || (dir === -1 && dailyReturns[i] < 0)) days++;
    else break;
  }
  return { dir, days };
}

// ── 回撤修复统计 ──
function calcRecoveryStats(navs, dates, threshold = 0.005) {
  const dd = calcDrawdowns(navs);
  const recoveries = [];
  let inDD = false, start = 0, peak = navs[0];
  for (let i = 0; i < navs.length; i++) {
    if (navs[i] > peak) {
      peak = navs[i];
      if (inDD) {
        const maxD = Math.min(...dd.slice(start, i + 1));
        if (maxD < -threshold) recoveries.push({ days: i - start, maxDD: maxD, startDate: dates[start], endDate: dates[i] });
        inDD = false;
      }
    } else if (!inDD && dd[i] < -threshold) { inDD = true; start = i; }
  }
  if (!recoveries.length) return { count: 0, avgDays: 0, maxDays: 0, minDays: 0, recoveries: [] };
  const days = recoveries.map(r => r.days);
  return { count: recoveries.length, avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length), maxDays: Math.max(...days), minDays: Math.min(...days), recoveries };
}

// ── 周度/月度收益 ──
function calcWeekMonthReturns(navs, dates) {
  const last = dates.length - 1;
  const lastDate = dates[last];

  // 本周（过去5个交易日）
  const w5 = navs[last] / navs[Math.max(0, last - 5)] - 1;

  // 本月
  const month = lastDate.slice(0, 7);
  let monthStart = 0;
  for (let i = last; i >= 0; i--) { if (dates[i] < month + '-01') { monthStart = i; break; } }
  const mtd = navs[last] / navs[monthStart] - 1;

  // 上月
  const prevMonth = new Date(lastDate); prevMonth.setMonth(prevMonth.getMonth() - 1);
  const pmStr = prevMonth.toISOString().slice(0, 7);
  let pmStart = 0, pmEnd = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= pmStr + '-01' && pmStart === 0) pmStart = i;
    if (dates[i] >= month + '-01' && pmEnd === 0) pmEnd = i - 1;
  }
  if (pmEnd < pmStart) pmEnd = monthStart;
  const prevM = pmEnd > pmStart ? navs[pmEnd] / navs[pmStart] - 1 : null;

  return { w5, mtd, prevMonth: prevM };
}

window.Indicators = {
  calcDrawdowns, calcMaxDrawdown, calcCurrentDrawdown,
  calcDailyReturns, calcPeriodReturns,
  findATHs, isATH, calcStreak, calcRecoveryStats, calcWeekMonthReturns
};
