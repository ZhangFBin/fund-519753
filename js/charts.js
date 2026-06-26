/**
 * charts.js v2 — 暗色主题图表
 */

const DARK_THEME = {
  textStyle: { color: '#9ca3af' },
  legend: { textStyle: { color: '#9ca3af' } }
};

function initChart(domId) {
  const dom = document.getElementById(domId);
  if (!dom) return null;
  const existing = echarts.getInstanceByDom(dom);
  if (existing) existing.dispose();
  const chart = echarts.init(dom, null, { renderer: 'canvas' });
  window.addEventListener('resize', () => chart.resize());
  return chart;
}

function darkGrid() {
  return { left: '3%', right: '4%', top: 35, bottom: '3%', containLabel: true };
}

function darkXAxis(dates) {
  return {
    type: 'category', data: dates,
    axisLine: { lineStyle: { color: '#374151' } },
    axisTick: { show: false },
    axisLabel: {
      color: '#6b7280', fontSize: 10,
      formatter: v => v.slice(5),
      interval: Math.floor(dates.length / 8) || 1
    }
  };
}

function darkYAxis() {
  return {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: '#1f2937' } },
    axisLabel: { color: '#6b7280', fontSize: 10 }
  };
}

// ═══════════════════════════
// 1. 净值走势图（纯净，无均线）
// ═══════════════════════════
function chartNav(domId, data) {
  const c = initChart(domId); if (!c) return;
  const { dates, navs, aths } = data;
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      formatter: ps => {
        let h = `<b>${ps[0].axisValue}</b><br/>`;
        ps.forEach(p => { if (p.value != null) h += `${p.marker} ${p.seriesName}: <b>${(+p.value).toFixed(4)}</b><br/>`; });
        return h;
      }
    },
    legend: { show: false },
    grid: darkGrid(),
    xAxis: darkXAxis(dates),
    yAxis: { ...darkYAxis(), scale: true, axisLabel: { ...darkYAxis().axisLabel, formatter: v => v.toFixed(2) } },
    series: [{
      type: 'line', data: navs, smooth: true, symbol: 'none',
      lineStyle: { color: '#60a5fa', width: 2.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(96,165,250,0.25)' },
          { offset: 1, color: 'rgba(96,165,250,0.02)' }
        ])
      },
      markPoint: {
        data: aths.map(a => ({
          name: 'ATH', coord: [a.date, a.nav], value: a.nav.toFixed(4),
          symbol: 'pin', symbolSize: 35,
          itemStyle: { color: '#f87171' },
          label: { show: false }
        })),
        animation: false
      }
    }]
  });
  return c;
}

// ═══════════════════════════
// 2. 回撤图
// ═══════════════════════════
function chartDrawdown(domId, data) {
  const c = initChart(domId); if (!c) return;
  const { dates, drawdowns, mdd } = data;
  const ddPct = drawdowns.map(v => +(v * 100).toFixed(2));
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: ps => `${ps[0].axisValue}<br/>回撤: <b style="color:#f87171">${ps[0].value}%</b>`
    },
    grid: { ...darkGrid(), top: 20 },
    xAxis: darkXAxis(dates),
    yAxis: {
      type: 'value', max: 0,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1f2937' } },
      axisLabel: { color: '#6b7280', fontSize: 10, formatter: v => v + '%' }
    },
    series: [{
      type: 'line', data: ddPct, symbol: 'none',
      lineStyle: { color: '#f87171', width: 1.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(248,113,113,0.35)' },
          { offset: 1, color: 'rgba(248,113,113,0.02)' }
        ])
      },
      markLine: {
        silent: true, symbol: 'none',
        data: [{
          yAxis: +(mdd * 100).toFixed(2),
          label: { formatter: `MDD ${(mdd*100).toFixed(2)}%`, position: 'insideStartTop', color: '#fca5a5', fontSize: 10 },
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }
        }],
        animation: false
      }
    }]
  });
  return c;
}

// ═══════════════════════════
// 3. 归一化对比图（通用）
// ═══════════════════════════
function chartComparison(domId, data) {
  const c = initChart(domId); if (!c) return;
  const { dates, series } = data;
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: ps => {
        let h = `<b>${ps[0].axisValue}</b><br/>`;
        ps.forEach(p => { h += `${p.marker} ${p.seriesName}: <b>${(+p.value).toFixed(1)}</b><br/>`; });
        return h;
      }
    },
    legend: {
      data: series.map(s => s.name), top: 0,
      textStyle: { color: '#9ca3af', fontSize: 10 }
    },
    grid: darkGrid(),
    xAxis: darkXAxis(dates),
    yAxis: { ...darkYAxis(), axisLabel: { ...darkYAxis().axisLabel, formatter: v => v.toFixed(0) } },
    series: series.map(s => ({
      name: s.name, type: 'line', data: s.data, smooth: true, symbol: 'none',
      lineStyle: { color: s.color, width: s.width || 1.5 },
      ...(s.dash ? { lineStyle: { ...s.lineStyle, type: 'dashed' } } : {})
    }))
  });
  return c;
}

// ═══════════════════════════
// 4. 相关性热力图
// ═══════════════════════════
function chartHeatmap(domId, labels, values) {
  const c = initChart(domId); if (!c) return;
  const data = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < labels.length; j++) {
      data.push([j, i, values[i] && values[j] && i !== j ? +(values[i] || 0).toFixed(3) : (i === j ? 1 : 0)]);
    }
  }
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: p => `${labels[p.value[1]]} vs ${labels[p.value[0]]}: <b>${p.value[2].toFixed(3)}</b>`
    },
    grid: { left: '18%', right: '5%', top: 5, bottom: '12%' },
    xAxis: {
      type: 'category', data: labels, position: 'top',
      axisLabel: { color: '#6b7280', fontSize: 10, rotate: 35 },
      axisLine: { lineStyle: { color: '#374151' } }
    },
    yAxis: {
      type: 'category', data: labels,
      axisLabel: { color: '#6b7280', fontSize: 10 },
      axisLine: { lineStyle: { color: '#374151' } }
    },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: 'horizontal',
      left: 'center', bottom: 0,
      textStyle: { color: '#9ca3af' },
      inRange: { color: ['#3b82f6', '#111827', '#ef4444'] }
    },
    series: [{
      type: 'heatmap', data,
      label: { show: true, formatter: p => p.value[2].toFixed(2), fontSize: 9, color: '#d1d5db' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } }
    }]
  });
  return c;
}

// ═══════════════════════════
// 5. 滚动相关性
// ═══════════════════════════
function chartRollingCorr(domId, data) {
  const c = initChart(domId); if (!c) return;
  const { dates, series } = data;
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' }
    },
    legend: {
      data: series.map(s => s.name), top: 0,
      textStyle: { color: '#9ca3af', fontSize: 10 }
    },
    grid: darkGrid(),
    xAxis: darkXAxis(dates),
    yAxis: { ...darkYAxis(), min: -1, max: 1 },
    series: series.map(s => ({
      name: s.name, type: 'line', data: s.data, smooth: true, symbol: 'none',
      lineStyle: { color: s.color, width: 1.5 }
    }))
  });
  return c;
}

// ═══════════════════════════
// 6. 简单走势（国债ETF / 转债）
// ═══════════════════════════
function chartSimpleLine(domId, data) {
  const c = initChart(domId); if (!c) return;
  const { dates, values, name, color } = data;
  c.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17,24,39,0.95)',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: ps => `${ps[0].axisValue}<br/>${name}: <b>${(+ps[0].value).toFixed(4)}</b>`
    },
    grid: { ...darkGrid(), top: 20 },
    xAxis: darkXAxis(dates),
    yAxis: { ...darkYAxis(), scale: true, axisLabel: { ...darkYAxis().axisLabel, formatter: v => v.toFixed(3) } },
    series: [{
      type: 'line', data: values, smooth: true, symbol: 'none',
      lineStyle: { color: color || '#34d399', width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: (color || '#34d399').replace(')', ',0.15)').replace('rgb', 'rgba') },
          { offset: 1, color: 'rgba(0,0,0,0)' }
        ])
      }
    }]
  });
  return c;
}

// ═══════════════════════════
// 统一管理
// ═══════════════════════════
let charts = {};

function disposeAll() {
  Object.values(charts).forEach(c => { try { c.dispose(); } catch (_) {} });
  charts = {};
}

function renderAll(cd) {
  disposeAll();
  if (cd.nav) charts.nav = chartNav('chart-nav', cd.nav);
  if (cd.drawdown) charts.dd = chartDrawdown('chart-drawdown', cd.drawdown);
  if (cd.comp1) charts.comp1 = chartComparison('chart-comp1', cd.comp1);
  if (cd.comp2) charts.comp2 = chartComparison('chart-comp2', cd.comp2);
  if (cd.heatmap) charts.heat = chartHeatmap('chart-heatmap', cd.heatmap.labels, cd.heatmap.values);
  if (cd.rollCorr) charts.roll = chartRollingCorr('chart-roll-corr', cd.rollCorr);
  if (cd.bondETF) charts.betf = chartSimpleLine('chart-bond-etf', cd.bondETF);
  if (cd.zzConvert) charts.zzc = chartSimpleLine('chart-zzconvert', cd.zzConvert);

  // 响应式
  window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));
}

window.Charts = { chartNav, chartDrawdown, chartComparison, chartHeatmap, chartRollingCorr, chartSimpleLine, renderAll, disposeAll };
