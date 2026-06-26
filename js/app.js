/**
 * app.js v2 — 主流程
 */
(async function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { view: '1y', processed: null };

  // ── Loading ──
  function showLoad() { const e = $('loading-overlay'); if (e) e.classList.remove('hidden'); }
  function hideLoad() { const e = $('loading-overlay'); if (e) e.classList.add('hidden'); }
  function showErr(msg) {
    const e = $('error-banner');
    if (!e) return;
    e.innerHTML = `<div class="bg-red-900/50 border border-red-700 text-red-300 rounded-lg p-4 text-sm">⚠️ ${msg}</div>`;
    e.classList.remove('hidden');
  }

  // ── 数据处理 ──
  function processData(res) {
    const f = res.fund; if (!f || !f.length) throw new Error('基金数据为空');
    const navs = f.map(d => d.nav).filter(v => v != null);
    const dates = f.map(d => d.date);
    const dRets = Indicators.calcDailyReturns(navs);
    const rDates = dates.slice(1);

    const pr = Indicators.calcPeriodReturns(navs, dates);
    const aths = Indicators.findATHs(navs, dates);
    const isAth = Indicators.isATH(navs);
    const dd = Indicators.calcDrawdowns(navs);
    const mdd = Indicators.calcMaxDrawdown(dd, dates, navs);
    const cdd = Indicators.calcCurrentDrawdown(dd, dates);
    const streak = Indicators.calcStreak(dRets);
    const recovery = Indicators.calcRecoveryStats(navs, dates, 0.005);
    const wm = Indicators.calcWeekMonthReturns(navs, dates);

    // 各指数日收益
    function idxRets(data) {
      if (!data || !data.length) return [];
      const c = data.map(d => d.close);
      return Indicators.calcDailyReturns(c);
    }
    const shRets = idxRets(res.sh);
    const hs300Rets = idxRets(res.hs300);
    const zz500Rets = idxRets(res.zz500);
    const cybRets = idxRets(res.cyb);
    const bondRets = idxRets(res.bond);
    const zzConvRets = idxRets(res.zzConvert);

    // 国债ETF收益
    let bondETFRets = [];
    if (res.bondETF && res.bondETF.length > 1) {
      const n = res.bondETF.map(d => d.accNav || d.nav).filter(v => v != null);
      bondETFRets = Indicators.calcDailyReturns(n);
    }

    // 对齐相关性
    function align(r) {
      if (!r || !r.length) return [];
      const m = new Map();
      const bDates = (res[r._src] || []).slice(1).map(d => d.date);
      bDates.forEach((d, i) => m.set(d, r[i]));
      return rDates.map(d => m.get(d) || null);
    }
    // 不标记 _src 了，直接用简化方式
    function getValid(arr) { return (arr || []).filter(v => v != null); }
    const fR = getValid(dRets);
    const sR = getValid(shRets);
    const hR = getValid(hs300Rets);
    const zR = getValid(zz500Rets);
    const cR = getValid(cybRets);
    const bR = getValid(bondRets);
    const zcR = getValid(zzConvRets);
    const beR = getValid(bondETFRets);

    const corr = Analysis.corrMatrix({
      fundRets: fR, shRets: sR, hs300Rets: hR, zz500Rets: zR,
      cybRets: cR, bondRets: bR, zzConvRets: zcR, bondETFRets: beR
    });

    const ddPct = Analysis.ddPercentile(cdd.currentDD, dd);
    const rateInfo = Analysis.rateEnv(res.bond, res.bondETF);

    // 跷跷板（需要对齐日期）
    let seeSaw = '';
    try {
      // 简化：用已有日收益数据
      seeSaw = Analysis.stockBondSeeSaw(dRets, shRets, bondRets);
    } catch (_) {}

    const commentary = Analysis.generateCommentary({
      dailyReturn: dRets[dRets.length - 1] || 0,
      currentDD: cdd.currentDD,
      ddPercentile: ddPct,
      isAth, streak,
      rateEnvInfo: rateInfo,
      seeSaw,
      recoveryStats: recovery,
      lastDate: dates[dates.length - 1],
      nav: navs[navs.length - 1],
      weeklyReturn: wm.w5,
      monthlyReturn: wm.mtd,
      prevMonthReturn: wm.prevMonth
    });

    // 极端市场分析
    const todayIdx = (arr) => arr && arr.length > 0 ? arr[arr.length - 1] : null;
    const marketChg = {
      '上证指数': todayIdx(shRets),
      '沪深300': todayIdx(hs300Rets),
      '中证500': todayIdx(zz500Rets),
      '创业板指': todayIdx(cybRets),
      '国债指数': todayIdx(bondRets),
      '中证转债': todayIdx(zzConvRets)
    };
    const extreme = Analysis.extremeMarketAnalysis(marketChg);

    const portfolio = Analysis.inferPortfolio(corr);

    return {
      f, navs, dates, dRets, rDates,
      pr, aths, isAth, dd, mdd, cdd, streak, recovery, wm,
      shRets, hs300Rets, zz500Rets, cybRets, bondRets, zzConvRets, bondETFRets,
      corr, ddPct, rateInfo, seeSaw, commentary, marketChg, extreme, portfolio,
      res
    };
  }

  // ── 构建图表数据 ──
  function buildChartData(p, view) {
    let start = 0;
    const len = p.dates.length;
    if (view === '1y' && len > 252) start = len - 252;
    else if (view === '6m' && len > 126) start = len - 126;
    else if (view === '3m' && len > 63) start = len - 63;
    const sl = arr => arr ? arr.slice(start) : [];
    const sDates = p.dates.slice(start);

    // 净值图
    const navD = { dates: sDates, navs: sl(p.navs), aths: p.aths.filter(a => a.idx >= start) };

    // 回撤图
    const ddD = { dates: sDates, drawdowns: sl(p.dd), mdd: p.mdd.mdd };

    // 归一化对比
    function normComp(seriesDefs) {
      const maps = {};
      for (const [key, data, field] of seriesDefs) {
        if (!data || !data.length) return null;
        maps[key] = new Map(data.map(d => [d.date, field ? d[field] : d.close]));
      }
      const validDates = [], values = {};
      for (const key of Object.keys(maps)) values[key] = [];
      for (const d of sDates) {
        let ok = true;
        for (const [key] of seriesDefs) { if (!maps[key].has(d)) { ok = false; break; } }
        if (!ok) continue;
        validDates.push(d);
        for (const [key] of seriesDefs) values[key].push(maps[key].get(d));
      }
      if (validDates.length < 2) return null;
      function norm(arr) {
        const base = arr[0]; if (!base) return arr.map(() => 100);
        return arr.map(v => +(v / base * 100).toFixed(2));
      }
      const colors = ['#60a5fa', '#f87171', '#fbbf24', '#34d399', '#a78bfa', '#fb923c'];
      return {
        dates: validDates,
        series: Object.keys(values).map((key, i) => ({
          name: key, data: norm(values[key]),
          color: colors[i % colors.length],
          width: key === '交银安心收益' ? 2.5 : 1.2,
          dash: key !== '交银安心收益'
        }))
      };
    }

    const comp1 = normComp([
      ['交银安心收益', p.f, 'nav'],
      ['上证指数', p.res.sh],
      ['沪深300', p.res.hs300],
      ['中证500', p.res.zz500]
    ]);

    const comp2 = normComp([
      ['交银安心收益', p.f, 'nav'],
      ['国债指数', p.res.bond],
      ['中证转债', p.res.zzConvert],
      ['创业板指', p.res.cyb]
    ]);

    // 相关性热力图
    const heatLabels = ['安心收益', '上证指数', '沪深300', '中证500', '创业板', '国债指数', '中证转债'];
    const heatVals = [1, p.corr.sh, p.corr.hs300, p.corr.zz500, p.corr.cyb, p.corr.bond, p.corr.zzConvert];

    // 滚动相关性
    let rollCorr = null;
    try {
      const r1 = Analysis.rollingCorrelation(p.dRets, p.bondRets, p.rDates, 60);
      const r2 = Analysis.rollingCorrelation(p.dRets, p.hs300Rets, p.rDates, 60);
      const r3 = Analysis.rollingCorrelation(p.dRets, p.zzConvRets, p.rDates, 60);
      // 对齐到视图
      const allDates = [...new Set([...r1.map(d => d.date), ...r2.map(d => d.date), ...r3.map(d => d.date)])].sort();
      if (allDates.length > 0) {
        const dMap1 = new Map(r1.map(d => [d.date, d.value]));
        const dMap2 = new Map(r2.map(d => [d.date, d.value]));
        const dMap3 = new Map(r3.map(d => [d.date, d.value]));
        const vDates = allDates.filter(d => sDates.includes(d)).slice(-200);
        rollCorr = {
          dates: vDates,
          series: [
            { name: 'vs 国债指数', data: vDates.map(d => dMap1.has(d) ? +dMap1.get(d).toFixed(3) : null), color: '#34d399' },
            { name: 'vs 沪深300', data: vDates.map(d => dMap2.has(d) ? +dMap2.get(d).toFixed(3) : null), color: '#f87171' },
            { name: 'vs 中证转债', data: vDates.map(d => dMap3.has(d) ? +dMap3.get(d).toFixed(3) : null), color: '#fbbf24' }
          ]
        };
      }
    } catch (_) {}

    // 国债ETF走势
    let bondETFD = null;
    if (p.res.bondETF && p.res.bondETF.length) {
      const m = new Map(p.res.bondETF.map(d => [d.date, d.accNav || d.nav]));
      const vals = sDates.map(d => m.get(d)).filter(v => v != null);
      const vd = sDates.filter(d => m.has(d));
      if (vals.length > 0) bondETFD = { dates: vd, values: vals, name: '10年国债ETF', color: '#34d399' };
    }

    // 中证转债走势
    let zzConvD = null;
    if (p.res.zzConvert && p.res.zzConvert.length) {
      const m = new Map(p.res.zzConvert.map(d => [d.date, d.close]));
      const vals = sDates.map(d => m.get(d)).filter(v => v != null);
      const vd = sDates.filter(d => m.has(d));
      if (vals.length > 0) zzConvD = { dates: vd, values: vals, name: '中证转债', color: '#fbbf24' };
    }

    return { nav: navD, drawdown: ddD, comp1, comp2, heatmap: { labels: heatLabels, values: heatVals }, rollCorr, bondETF: bondETFD, zzConvert: zzConvD };
  }

  // ── UI 更新 ──
  function updateUI(p) {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    const html = (id, v) => { const e = $(id); if (e) e.innerHTML = v; };

    // Header
    const latestNav = p.navs[p.navs.length - 1];
    set('h-nav', latestNav.toFixed(4));
    set('h-date', '截至 ' + p.dates[p.dates.length - 1]);
    const dr = p.dRets[p.dRets.length - 1];
    const dEl = $('h-daily');
    if (dEl) {
      dEl.textContent = dr != null ? (dr >= 0 ? '+' : '') + (dr * 100).toFixed(2) + '%' : '--';
      dEl.className = dr >= 0 ? 'text-2xl font-bold text-emerald-400' : 'text-2xl font-bold text-red-400';
    }
    const badge = $('h-badge');
    if (badge) {
      if (p.isAth) { badge.textContent = '🔥 历史新高'; badge.className = 'px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium'; }
      else { badge.textContent = `回撤 ${(p.cdd.currentDD * 100).toFixed(2)}%`; badge.className = 'px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded-full'; }
    }

    // 收益卡片
    const cards = [['ret-1m', p.pr.m1], ['ret-3m', p.pr.m3], ['ret-6m', p.pr.m6], ['ret-1y', p.pr.y1], ['ret-ytd', p.pr.ytd]];
    cards.forEach(([id, v]) => {
      const e = $(id); if (!e) return;
      if (v != null && !isNaN(v)) {
        e.textContent = (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
        e.className = v >= 0 ? 'text-2xl font-bold text-emerald-400' : 'text-2xl font-bold text-red-400';
      } else { e.textContent = '--'; e.className = 'text-2xl font-bold text-gray-600'; }
    });

    // 回撤卡片
    set('dd-curr', (p.cdd.currentDD * 100).toFixed(2) + '%');
    set('dd-days', p.cdd.daysInDD + '天');
    set('dd-mdd', (p.mdd.mdd * 100).toFixed(2) + '%');
    set('dd-date', p.mdd.endDate);

    // 展望
    html('cm-sentiment', p.commentary.sentiment.replace(/\n/g, '<br/>'));
    html('cm-short', p.commentary.shortTerm);
    html('cm-medium', p.commentary.mediumTerm);
    html('cm-outlook', p.commentary.outlook.replace(/\n/g, '<br/>'));
    html('cm-history', p.commentary.history.replace(/\n/g, '<br/>'));
    html('cm-extreme', p.extreme.replace(/\n/g, '<br/>'));
    const box = $('cm-box');
    if (box) box.className = 'rounded-xl p-6 ' + (
      p.commentary.level === 'positive' ? 'bg-emerald-900/20 border border-emerald-800/50' :
      p.commentary.level === 'caution' ? 'bg-amber-900/20 border border-amber-800/50' :
      p.commentary.level === 'warning' ? 'bg-red-900/20 border border-red-800/50' :
      'bg-blue-900/20 border border-blue-800/50'
    );

    // 利率环境
    html('rate-detail', p.rateInfo.detail);

    // 持仓推断
    set('pf-type', p.portfolio.type);
    set('pf-detail', p.portfolio.detail);

    // 回撤修复统计
    if (p.recovery.count > 0) {
      set('rec-avg', p.recovery.avgDays + '天');
      set('rec-min', p.recovery.minDays + '天');
      set('rec-max', p.recovery.maxDays + '天');
      set('rec-cnt', p.recovery.count + '次');
    }

    // 大盘快照
    const snapItems = [];
    const mkts = [
      ['上证', p.res.sh, 'shToday'], ['沪深300', p.res.hs300, 'hs300Today'],
      ['中证500', p.res.zz500, 'zz500Today'], ['创业板', p.res.cyb, 'cybToday'],
      ['国债', p.res.bond, 'bondToday'], ['转债', p.res.zzConvert, 'zzConvToday']
    ];
    mkts.forEach(([name, data, _k]) => {
      if (!data || !data.length) return;
      const last = data[data.length - 1];
      const prev = data.length > 1 ? data[data.length - 2] : last;
      const chg = last.close / prev.close - 1;
      snapItems.push({ name, val: last.close.toFixed(0), chg });
    });
    const snapEl = $('market-snap');
    if (snapEl) {
      snapEl.innerHTML = snapItems.map(s => `
        <div class="text-center px-3 py-1">
          <div class="text-[10px] text-gray-500">${s.name}</div>
          <div class="text-xs font-mono font-bold text-gray-300">${s.val}</div>
          <div class="text-[10px] ${s.chg >= 0 ? 'text-emerald-400' : 'text-red-400'}">${s.chg >= 0 ? '+' : ''}${(s.chg*100).toFixed(2)}%</div>
        </div>
      `).join('');
    }
  }

  // ── 视图切换 ──
  function setupViewBtns() {
    document.querySelectorAll('.view-btn').forEach(b => {
      b.addEventListener('click', function () {
        document.querySelectorAll('.view-btn').forEach(x => { x.classList.remove('bg-blue-600', 'text-white'); x.classList.add('bg-gray-800', 'text-gray-400'); });
        this.classList.remove('bg-gray-800', 'text-gray-400');
        this.classList.add('bg-blue-600', 'text-white');
        state.view = this.dataset.range;
        if (state.processed) Charts.renderAll(buildChartData(state.processed, state.view));
      });
    });
  }

  // ── 刷新 ──
  function setupRefresh() {
    const btn = $('btn-refresh');
    if (btn) btn.addEventListener('click', () => { FundAPI.clearAllCache(); init(); });
  }

  // ── 入口 ──
  async function init() {
    showLoad();
    const errEl = $('error-banner'); if (errEl) errEl.classList.add('hidden');
    try {
      const { res, errs } = await FundAPI.loadAllData();
      if (!res.fund || !res.fund.length) throw new Error('基金数据加载失败，请稍后重试');
      state.processed = processData(res);
      updateUI(state.processed);
      Charts.renderAll(buildChartData(state.processed, state.view));
      hideLoad();
    } catch (e) {
      hideLoad();
      showErr(e.message || '加载失败');
    }
  }

  setupViewBtns();
  setupRefresh();
  init();
})();
