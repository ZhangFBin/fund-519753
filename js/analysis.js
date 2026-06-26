/**
 * analysis.js v2 — 增强市场展望引擎
 * 多维度规则引擎 + 历史统计 + 利率环境 + 股债跷跷板
 */

// ── 相关性 ──
function corrMatrix(data) {
  const { fundRets, shRets, hs300Rets, zz500Rets, cybRets, bondRets, zzConvRets, bondETFRets } = data;
  const c = (a, b) => {
    if (!a || !b) return NaN;
    const n = Math.min(a.length, b.length);
    if (n < 3) return NaN;
    return Utils.pearsonCorrelation(a.slice(-n), b.slice(-n));
  };
  return {
    sh: c(fundRets, shRets),
    hs300: c(fundRets, hs300Rets),
    zz500: c(fundRets, zz500Rets),
    cyb: c(fundRets, cybRets),
    bond: c(fundRets, bondRets),
    zzConvert: c(fundRets, zzConvRets),
    bondETF: c(fundRets, bondETFRets)
  };
}

function rollingCorrelation(a, b, dates, window = 60) {
  if (!a || !b) return [];
  const res = [];
  const n = Math.min(a.length, b.length);
  for (let i = window - 1; i < n; i++) {
    const v = Utils.pearsonCorrelation(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1));
    if (!isNaN(v)) res.push({ date: dates[i], value: v });
  }
  return res;
}

// ── 回撤分位数 ──
function ddPercentile(currentDD, allDDs) {
  const sorted = [...allDDs].sort((a, b) => a - b);
  const rank = sorted.findIndex(v => v >= currentDD);
  return rank >= 0 ? rank / sorted.length : 1;
}

// ── 利率环境判断 ──
function rateEnv(bondIdxData, bondETFData) {
  // 国债指数近20日趋势
  let trend = 'stable';
  let detail = '';
  if (bondIdxData && bondIdxData.length >= 20) {
    const recent = bondIdxData.slice(-20).map(d => d.close);
    const change = recent[recent.length - 1] / recent[0] - 1;
    if (change > 0.005) { trend = 'down'; detail = `国债指数近20日上涨${(change*100).toFixed(2)}%，利率下行，利好债基`; }
    else if (change < -0.005) { trend = 'up'; detail = `国债指数近20日下跌${Math.abs(change*100).toFixed(2)}%，利率上行，对债基构成压力`; }
    else { detail = `国债指数近20日基本持平（${(change*100).toFixed(2)}%），利率环境稳定`; }
  }
  // 补充国债ETF信息
  if (bondETFData && bondETFData.length >= 20) {
    const etf = bondETFData.slice(-20);
    const etfNavs = etf.map(d => d.accNav || d.nav).filter(v => v != null);
    if (etfNavs.length >= 2) {
      const etfChg = etfNavs[etfNavs.length - 1] / etfNavs[0] - 1;
      detail += ` | 10年国债ETF同期${etfChg >= 0 ? '+' : ''}${(etfChg*100).toFixed(2)}%`;
    }
  }
  return { trend, detail };
}

// ── 股债跷跷板 ──
function stockBondSeeSaw(fundDailyRets, shDailyRets, bondDailyRets) {
  if (!fundDailyRets || !shDailyRets || !bondDailyRets) return '';
  const n = Math.min(fundDailyRets.length, shDailyRets.length, bondDailyRets.length);
  // 近60个交易日中股跌债涨的天数
  let stockDownBondUp = 0, totalBoth = 0;
  for (let i = n - 60; i < n; i++) {
    if (i < 0) continue;
    if (shDailyRets[i] != null && bondDailyRets[i] != null) {
      totalBoth++;
      if (shDailyRets[i] < 0 && bondDailyRets[i] > 0) stockDownBondUp++;
    }
  }
  if (totalBoth === 0) return '';
  const ratio = stockDownBondUp / totalBoth;
  if (ratio > 0.6) return `近60个交易日中，${(ratio*100).toFixed(0)}%的时间呈现"股跌债涨"的跷跷板效应，说明债券资产在当前市场环境下发挥了较好的对冲作用。`;
  if (ratio > 0.4) return `近60个交易日中，股债跷跷板效应较明显（${(ratio*100).toFixed(0)}%），债券资产具有一定的分散化价值。`;
  return `近期股债跷跷板效应偏弱（${(ratio*100).toFixed(0)}%），市场可能受共同因素驱动，分散化效果有限。`;
}

// ═══════════════════════════════════════════
// 核心：安抚与展望评语引擎
// ═══════════════════════════════════════════
function generateCommentary(ctx) {
  const {
    dailyReturn, currentDD, ddPercentile, isAth, streak,
    rateEnvInfo, seeSaw, recoveryStats, lastDate, nav,
    weeklyReturn, monthlyReturn, prevMonthReturn
  } = ctx;

  let level = 'normal'; // positive | caution | warning | normal
  let sentiment = '';
  let outlook = '';
  let shortTerm = '';
  let mediumTerm = '';

  const absRet = Math.abs(dailyReturn || 0);

  // ── 规则1: 创历史新高 ──
  if (isAth) {
    level = 'positive';
    sentiment = `🎉 **净值再创历史新高！** 截至 ${lastDate}，单位净值达到 ${nav.toFixed(4)}，持有体验优秀。`;
    if (streak.days >= 3) sentiment += `\n\n净值已连续上涨 ${streak.days} 个交易日，短期动能充沛。`;
    shortTerm = '当前处于历史最优轨道，短期维持强势概率较高。不过新高之后出现小幅回踩也属正常，不必过度担忧。';
    mediumTerm = '中长期来看，创新高意味着此前的每一次回撤都已被修复。只要底层资产质量不变，持有策略依然有效。';
  }

  // ── 规则2: 连续下跌 ──
  else if (streak.dir === -1 && streak.days >= 3) {
    level = 'caution';
    sentiment = `⚠️ 净值已连续下跌 **${streak.days}** 个交易日，累计回调幅度值得关注。`;
    if (currentDD != null) sentiment += `\n\n当前距前高回撤 ${(currentDD * 100).toFixed(2)}%。`;
    shortTerm = '连续下跌往往意味着短期情绪或利率因素扰动。历史数据显示，连续下跌后的反弹概率较高，但时点难以精确预测。';
    if (recoveryStats && recoveryStats.count > 0) {
      mediumTerm = `历史上类似幅度的回撤平均 ${recoveryStats.avgDays} 个交易日修复，最长 ${recoveryStats.maxDays} 天。建议保持耐心。`;
    } else {
      mediumTerm = '建议关注10年期国债收益率走势和货币政策信号，确认利率方向后再做决策。';
    }
  }

  // ── 规则3: 单日大跌 (>0.3%) ──
  else if (dailyReturn != null && dailyReturn < -0.003) {
    level = 'caution';
    sentiment = `📉 今日净值回调 **${(dailyReturn * 100).toFixed(2)}%**，对于债券基金而言属于较明显的单日波动。`;
    if (currentDD != null) sentiment += `\n\n当前距前高回撤 ${(currentDD * 100).toFixed(2)}%。`;
    shortTerm = '债券基金单日波动超过0.3%通常意味着利率出现了较大变动。建议查看今日国债期货/现券市场表现。';
    if (rateEnvInfo && rateEnvInfo.trend === 'up') {
      mediumTerm = '结合近期利率上行趋势，短期压力可能延续。但利率上行空间通常有限，超调后往往迎来修复。';
    } else {
      mediumTerm = '单日波动不必过度解读，关注未来几个交易日能否企稳。债券基金的长期回报来源于票息和利率波段，短期波动不影响长期逻辑。';
    }
  }

  // ── 规则4: 回撤接近历史极值 ──
  else if (currentDD != null && ddPercentile != null && ddPercentile < 0.1) {
    level = 'warning';
    sentiment = `🔴 当前回撤 ${(currentDD * 100).toFixed(2)}% 处于历史最深的 **${(ddPercentile * 100).toFixed(0)}%** 分位，已接近极端水平。`;
    sentiment += `\n\n这意味着历史上只有 ${(ddPercentile * 100).toFixed(0)}% 的时间回撤比现在更深。`;
    shortTerm = '接近历史极值意味着进一步下行空间可能有限，但也需要警惕"这次不一样"的风险。';
    mediumTerm = '建议检视底层资产质量。若为利率上行导致，关注央行政策拐点；若为信用事件，需评估个券风险。';
  }

  // ── 规则5: 单日大涨 (>0.2%) ──
  else if (dailyReturn != null && dailyReturn > 0.002) {
    level = 'positive';
    sentiment = `📈 今日净值上涨 **${(dailyReturn * 100).toFixed(2)}%**，表现亮眼。`;
    if (streak.days >= 2 && streak.dir === 1) sentiment += ` 已连续上涨 ${streak.days} 天。`;
    shortTerm = '短期表现良好，但债券基金的高单日涨幅往往也意味着利率出现了有利变动，需关注是否可持续。';
    mediumTerm = '债券基金的收益更多来自时间的积累而非单日爆发，保持持有、享受复利是最好的策略。';
  }

  // ── 默认 ──
  else {
    level = 'normal';
    const ddStr = currentDD != null ? `，当前距前高回撤 ${(currentDD * 100).toFixed(2)}%` : '';
    sentiment = `✅ 今日净值变化不大${ddStr}，运行平稳。`;
    if (dailyReturn != null && dailyReturn > 0) sentiment = `✅ 今日净值微涨 ${(dailyReturn * 100).toFixed(2)}%${ddStr}。`;
    shortTerm = '短期波动在正常范围内，无需特别关注。';
    mediumTerm = '交银安心收益作为固收+策略基金，整体波动可控。建议以季度为周期审视持仓，避免过度关注日度波动。';
  }

  // ── 附加：利率环境 ──
  if (rateEnvInfo && rateEnvInfo.detail) {
    outlook += `\n\n**利率环境：** ${rateEnvInfo.detail}`;
  }

  // ── 附加：股债跷跷板 ──
  if (seeSaw) {
    outlook += `\n\n**股债关系：** ${seeSaw}`;
  }

  // ── 附加：周/月表现 ──
  if (weeklyReturn != null) {
    outlook += `\n\n**近期表现：** 本周累计 ${(weeklyReturn * 100).toFixed(2)}%，本月以来 ${(monthlyReturn * 100).toFixed(2)}%。`;
    if (prevMonthReturn != null) {
      outlook += ` 上月 ${(prevMonthReturn * 100).toFixed(2)}%。`;
    }
  }

  // ── 历史回撤参考 ──
  let history = '';
  if (recoveryStats && recoveryStats.count > 0) {
    history = `📋 **历史回撤修复参考**（超过0.5%的回撤）\n\n`;
    history += `| 统计次数 | 平均修复 | 最快修复 | 最长修复 |\n`;
    history += `|---------|---------|---------|----------|\n`;
    history += `| ${recoveryStats.count}次 | ${recoveryStats.avgDays}天 | ${recoveryStats.minDays}天 | ${recoveryStats.maxDays}天 |`;
  }

  return { level, sentiment, shortTerm, mediumTerm, outlook, history };
}

// ── 市场极端变化分析 ──
function extremeMarketAnalysis(marketChanges) {
  const parts = [];
  for (const [name, chg] of Object.entries(marketChanges)) {
    if (chg == null) continue;
    if (Math.abs(chg) > 0.03) {
      parts.push(`🔥 **${name}** ${chg > 0 ? '暴涨' : '暴跌'} ${(chg*100).toFixed(2)}%`);
    } else if (Math.abs(chg) > 0.015) {
      parts.push(`⚠️ **${name}** ${chg > 0 ? '大涨' : '大跌'} ${(chg*100).toFixed(2)}%`);
    }
  }
  if (!parts.length) return '今日各市场表现平稳，无极端波动。';
  return parts.join('\n') + '\n\n极端行情下，建议保持冷静，避免情绪化操作。债券基金的波动远小于权益，短期的市场恐慌往往是中长期布局的机会。';
}

// ── 持仓推断 ──
function inferPortfolio(corr) {
  const items = [
    { label: '利率债敏感度', value: Math.abs(corr.bond || 0), detail: (corr.bond || 0) > 0.2 ? '较高' : '一般' },
    { label: '权益敏感度', value: Math.abs(corr.hs300 || 0), detail: (corr.hs300 || 0) > 0.15 ? '有一定敞口' : '较低' },
    { label: '可转债敏感度', value: Math.abs(corr.zzConvert || 0), detail: (corr.zzConvert || 0) > 0.2 ? '值得关注' : '较低' },
    { label: '中小盘联动', value: Math.abs(corr.zz500 || 0), detail: (corr.zz500 || 0) > 0.15 ? '有一定联动' : '较低' },
  ];

  const maxCorr = Math.max(...items.map(i => i.value));
  let type, detail;
  if (maxCorr < 0.1) {
    type = '低波动策略'; detail = '基金净值与各指数相关性均较低，推测以信用债/短久期策略为主，追求稳健绝对收益。';
  } else if (items[0].value > items[1].value) {
    type = '利率债为主'; detail = '基金净值与国债指数相关性最高，推测配置以利率债为主，对利率下行环境敏感。';
  } else {
    type = '混合配置'; detail = '基金净值与股债指数均有相关性，推测采用多元化策略，兼顾稳健与弹性。';
  }
  return { type, detail, items };
}

window.Analysis = {
  corrMatrix, rollingCorrelation, ddPercentile,
  rateEnv, stockBondSeeSaw,
  generateCommentary, extremeMarketAnalysis, inferPortfolio
};
