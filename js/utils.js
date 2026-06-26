/**
 * utils.js — 工具函数模块
 * 日期处理、数值格式化、数据对齐等
 */

// ==================== 日期工具 ====================

/**
 * 解析日期字符串为 Date 对象（兼容 yyyy-MM-dd）
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return new Date(dateStr);
}

/**
 * 格式化 Date 为 yyyy-MM-dd
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取两个日期之间的交易日天数（近似：总天数 * 5/7）
 */
function tradingDaysBetween(d1, d2) {
  const diff = Math.abs(parseDate(d2) - parseDate(d1));
  return Math.round(diff / (1000 * 60 * 60 * 24) * 5 / 7);
}

/**
 * 获取 N 个交易日前的大致日期
 * @param {Date} from - 基准日期
 * @param {number} tradingDays - 交易天数
 */
function dateBeforeTradingDays(from, tradingDays) {
  const calendarDays = Math.ceil(tradingDays * 7 / 5) + 5; // 加点缓冲
  const d = new Date(from);
  d.setDate(d.getDate() - calendarDays);
  return d;
}

// ==================== 数值格式化 ====================

/**
 * 格式化为百分比字符串
 */
function fmtPercent(val, decimals = 2) {
  if (val == null || isNaN(val)) return '--';
  const sign = val >= 0 ? '+' : '';
  return sign + (val * 100).toFixed(decimals) + '%';
}

/**
 * 格式化为带符号的百分比
 */
function fmtPercentAbs(val, decimals = 2) {
  if (val == null || isNaN(val)) return '--';
  return (val * 100).toFixed(decimals) + '%';
}

/**
 * 格式化为4位小数的净值
 */
function fmtNav(val) {
  if (val == null || isNaN(val)) return '--';
  return val.toFixed(4);
}

/**
 * 格式化为2位小数
 */
function fmtNum(val, decimals = 2) {
  if (val == null || isNaN(val)) return '--';
  return val.toFixed(decimals);
}

/**
 * 格式化大数字
 */
function fmtLargeNum(val) {
  if (val == null || isNaN(val)) return '--';
  if (Math.abs(val) >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (Math.abs(val) >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(0);
}

// ==================== 数据对齐 ====================

/**
 * 在两个数据序列之间取日期交集，返回对齐后的数组
 * @param {Array} arr1 - [{ date, ... }]
 * @param {Array} arr2 - [{ date, ... }]
 * @returns {{ a1: Array, a2: Array }}
 */
function alignByDate(arr1, arr2) {
  const map2 = new Map(arr2.map(d => [d.date, d]));
  const a1 = [];
  const a2 = [];
  for (const item of arr1) {
    if (map2.has(item.date)) {
      a1.push(item);
      a2.push(map2.get(item.date));
    }
  }
  return { a1, a2 };
}

/**
 * 在多组数据序列之间取日期交集
 * @param  {...Array} arrays
 * @returns {Array<Array>}
 */
function alignMultipleByDate(...arrays) {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return [arrays[0]];

  // 构建日期交集
  let commonDates = new Set(arrays[0].map(d => d.date));
  for (let i = 1; i < arrays.length; i++) {
    const dates = new Set(arrays[i].map(d => d.date));
    commonDates = new Set([...commonDates].filter(d => dates.has(d)));
  }

  const sorted = [...commonDates].sort();
  return arrays.map(arr => {
    const map = new Map(arr.map(d => [d.date, d]));
    return sorted.map(date => map.get(date)).filter(Boolean);
  });
}

/**
 * 从一个日期映射的数组中提取数值序列
 */
function extractValues(arr, field) {
  return arr.map(d => d[field]).filter(v => v != null && !isNaN(v));
}

// ==================== 颜色工具 ====================

const COLORS = {
  primary: '#3b82f6',     // blue-500
  success: '#10b981',     // emerald-500
  danger: '#ef4444',      // red-500
  warning: '#f59e0b',     // amber-500
  info: '#06b6d4',        // cyan-500
  purple: '#8b5cf6',      // violet-500
  pink: '#ec4899',        // pink-500
  gray: '#6b7280',        // gray-500
  orange: '#f97316',      // orange-500
  lime: '#84cc16',        // lime-500

  // 图表专用配色
  chart: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
};

// ==================== 统计工具 ====================

/**
 * 求和
 */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * 均值
 */
function mean(arr) {
  if (arr.length === 0) return NaN;
  return sum(arr) / arr.length;
}

/**
 * 标准差
 */
function stdDev(arr) {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map(v => (v - m) ** 2)) / (arr.length - 1));
}

/**
 * 协方差
 */
function covariance(arr1, arr2) {
  if (arr1.length !== arr2.length || arr1.length < 2) return NaN;
  const m1 = mean(arr1);
  const m2 = mean(arr2);
  return sum(arr1.map((v, i) => (v - m1) * (arr2[i] - m2))) / (arr1.length - 1);
}

/**
 * 皮尔逊相关系数
 */
function pearsonCorrelation(arr1, arr2) {
  if (arr1.length !== arr2.length || arr1.length < 3) return NaN;
  const sd1 = stdDev(arr1);
  const sd2 = stdDev(arr2);
  if (sd1 === 0 || sd2 === 0) return NaN;
  return covariance(arr1, arr2) / (sd1 * sd2);
}

/**
 * 线性回归：y = slope * x + intercept
 */
function linearRegression(xArr, yArr) {
  const n = xArr.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN };

  const xMean = mean(xArr);
  const yMean = mean(yArr);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xArr[i] - xMean) * (yArr[i] - yMean);
    den += (xArr[i] - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;

  // R²
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xArr[i] + intercept;
    ssRes += (yArr[i] - pred) ** 2;
    ssTot += (yArr[i] - yMean) ** 2;
  }
  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : NaN;

  return { slope, intercept, r2 };
}

// ==================== 年化计算 ====================

/**
 * 年化收益率
 * @param {number} totalReturn - 区间总收益
 * @param {number} tradingDays - 交易天数
 * @returns {number}
 */
function annualizedReturn(totalReturn, tradingDays) {
  if (tradingDays <= 0) return NaN;
  return Math.pow(1 + totalReturn, 252 / tradingDays) - 1;
}

/**
 * 年化波动率
 * @param {Array} dailyReturns - 日收益率序列
 */
function annualizedVolatility(dailyReturns) {
  const sd = stdDev(dailyReturns);
  return sd * Math.sqrt(252);
}

/**
 * 夏普比率
 * @param {number} annReturn - 年化收益率
 * @param {number} annVol - 年化波动率
 * @param {number} riskFree - 无风险利率（年化）
 */
function sharpeRatio(annReturn, annVol, riskFree = 0.025) {
  if (!annVol || annVol === 0) return NaN;
  return (annReturn - riskFree) / annVol;
}

// 导出
window.Utils = {
  parseDate, formatDate, tradingDaysBetween, dateBeforeTradingDays,
  fmtPercent, fmtPercentAbs, fmtNav, fmtNum, fmtLargeNum,
  alignByDate, alignMultipleByDate, extractValues,
  COLORS, sum, mean, stdDev, covariance, pearsonCorrelation,
  linearRegression, annualizedReturn, annualizedVolatility, sharpeRatio
};
