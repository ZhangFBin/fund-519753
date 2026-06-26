/**
 * api.js — 数据源请求模块 v2
 * 修复：天天基金 content 已改为纯文本格式，不再使用 HTML 解析
 */

const CACHE_PREFIX = 'fd2_';
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (Date.now() - e.ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_PREFIX + key); return null; }
    return e.data;
  } catch (_) { return null; }
}

function cacheSet(key, data) {
  try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}

function clearAllCache() {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k);
  }
}

// ── fetch 带超时 ──
async function fetchJSON(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── 天天基金 JSONP ──
function loadScriptJSONP(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeout);
    function cleanup() { clearTimeout(timer); if (script.parentNode) script.parentNode.removeChild(script); }
    script.src = url;
    script.onload = () => {
      setTimeout(() => {
        cleanup();
        if (typeof apidata !== 'undefined' && apidata) {
          const d = apidata; apidata = null; resolve(d);
        } else { reject(new Error('no apidata')); }
      }, 50);
    };
    script.onerror = () => { cleanup(); reject(new Error('script error')); };
    document.head.appendChild(script);
  });
}

// ═══════════════════════════════════════════
// 基金净值解析 — 修复版
// 天天基金 content 现在是纯文本：
// "净值日期单位净值累计净值日增长率申购状态赎回状态分红送配2026-06-251.14801.36700.12%开放申购开放赎回..."
// ═══════════════════════════════════════════
function parseFundNavText(text) {
  const rows = [];
  // 格式：日期(10位) + 单位净值(X.XXXX) + 累计净值(X.XXXX) + 日增长率(X.XX%)
  // 天天基金 content 为无分隔纯文本
  const re = /(\d{4}-\d{2}-\d{2})(\d+\.\d{4})(\d+\.\d{4})(-?\d+\.\d{2})%/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    rows.push({
      date: m[1],
      nav: parseFloat(m[2]),
      accNav: parseFloat(m[3]),
      dailyReturn: parseFloat(m[4]) / 100
    });
  }
  return rows.reverse(); // 天天基金默认降序 → 升序
}

async function loadFundNav(code, per = 1000) {
  const ck = `nav_${code}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  let all = [];
  let page = 1, total = 0;

  while (true) {
    const data = await loadScriptJSONP(
      `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=${page}&per=${per}`
    );
    if (!data || !data.content) throw new Error(`${code} 无数据`);
    const rows = parseFundNavText(data.content);
    all = all.concat(rows);
    if (total === 0 && data.records) total = parseInt(data.records);
    if (all.length >= total || rows.length < per || page >= 10) break;
    page++;
  }

  // 去重排序
  const seen = new Set();
  const uniq = [];
  for (const r of all) { if (!seen.has(r.date)) { seen.add(r.date); uniq.push(r); } }
  uniq.sort((a, b) => a.date.localeCompare(b.date));
  cacheSet(ck, uniq);
  return uniq;
}

// ═══════════════════════════════════════════
// 腾讯财经 K线 — 指数数据
// ═══════════════════════════════════════════
function parseKLine(raw) {
  if (!raw || raw.code !== 0 || !raw.data) return [];
  const key = Object.keys(raw.data)[0];
  if (!key || !raw.data[key].day) return [];
  return raw.data[key].day
    .map(r => ({ date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4], volume: +r[5] || 0 }))
    .filter(d => d.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function loadIndex(marketCode, count = 1500) {
  const ck = `idx_${marketCode}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,${count},qfq`;
  const raw = await fetchJSON(url);
  const data = parseKLine(raw);
  cacheSet(ck, data);
  return data;
}

// ═══════════════════════════════════════════
// 批量加载
// ═══════════════════════════════════════════
async function loadAllData() {
  const res = {};
  const errs = {};

  // 并行 fetch（腾讯财经 CORS 友好）
  const idxTasks = [
    loadIndex('sh000001').then(d => res.sh = d).catch(e => errs.sh = e),
    loadIndex('sh000300').then(d => res.hs300 = d).catch(e => errs.hs300 = e),
    loadIndex('sh000905').then(d => res.zz500 = d).catch(e => errs.zz500 = e),
    loadIndex('sz399006').then(d => res.cyb = d).catch(e => errs.cyb = e),
    loadIndex('sh000012').then(d => res.bond = d).catch(e => errs.bond = e),
    loadIndex('sh000832').then(d => res.zzConvert = d).catch(e => errs.zzConvert = e),
  ];
  await Promise.allSettled(idxTasks);

  // 天天基金 JSONP（顺序加载避免全局变量冲突）
  try { res.fund = await loadFundNav('519753'); } catch (e) { errs.fund = e; }
  try { res.bondProxy = await loadFundNav('003376'); } catch (e) { errs.bondProxy = e; }
  try { res.bondETF = await loadFundNav('511010'); } catch (e) { errs.bondETF = e; }

  return { res, errs };
}

window.FundAPI = { loadFundNav, loadIndex, loadAllData, clearAllCache };
