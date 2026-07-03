(function () {
  "use strict";

  const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:8765" : "";
  const els = {
    app: document.getElementById("app"),
    quick: document.getElementById("quickList"),
    symbol: document.getElementById("symbolInput"),
    list: document.getElementById("symbolList"),
    market: document.getElementById("marketSelect"),
    period: document.getElementById("periodSelect"),
    date: document.getElementById("dateInput"),
    run: document.getElementById("runBtn"),
    refresh: document.getElementById("refreshBtn")
  };
  const LAST_KEY = "czsc:last-query:v1";
  let candidates = [];
  let capabilities = null;
  let signalsCatalog = null;

  function todayISO() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[ch]));
  }

  function fmt(x, digits = 2) {
    const n = Number(x);
    return Number.isFinite(n) ? n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "-";
  }

  function pct(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "-";
    return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
  }

  function marketClass(market) {
    // 市场类型是分类信息，不使用涨跌语义色
    return market === "指数" ? "mono" : "";
  }

  function readLast() {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function writeLast(symbol, period, date) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ symbol, period, date }));
    } catch (_) {}
  }

  function api(path, params) {
    const qs = new URLSearchParams(params || {});
    return fetch(`${API_BASE}${path}?${qs.toString()}`, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  function renderCandidates(items) {
    candidates = items || [];
    els.list.innerHTML = candidates.map(s => {
      const label = `${s.symbol || s.code} | ${s.name || ""} | ${s.market || ""}`;
      return `<option value="${esc(s.symbol || s.code)}" label="${esc(label)}"></option>`;
    }).join("");
    els.quick.innerHTML = candidates.slice(0, 24).map(s => (
      `<button type="button" data-symbol="${esc(s.symbol || s.code)}">${esc(s.name || s.code)} <span class="mono">${esc(s.code || "")}</span></button>`
    )).join("");
  }

  function loadCandidates(q = "") {
    return api("/api/chanlun/search", { q, market: els.market.value || "all" })
      .then(data => renderCandidates(data.items || []))
      .catch(() => renderCandidates([]));
  }

  function loadCzscMeta() {
    return Promise.all([
      api("/api/chanlun/capabilities", {}),
      api("/api/chanlun/signals", { limit: 12 })
    ]).then(([cap, sig]) => {
      capabilities = cap;
      signalsCatalog = sig;
    }).catch(() => {
      capabilities = null;
      signalsCatalog = null;
    });
  }

  function drawChart(data) {
    const bars = data.bars || [];
    const an = data.analysis || {};
    if (!bars.length) return "";
    const W = 1180, H = 660, L = 48, R = 54, T = 22, B = 40;
    const MACD_H = 104, GAP = 26;
    const plotW = W - L - R, plotH = H - T - B - MACD_H - GAP;
    const highs = bars.map(b => Number(b.high));
    const lows = bars.map(b => Number(b.low));
    const maxP = Math.max(...highs);
    const minP = Math.min(...lows);
    const pad = Math.max((maxP - minP) * 0.06, 0.01);
    const hi = maxP + pad, lo = minP - pad;
    const x = i => L + (plotW / Math.max(1, bars.length - 1)) * i;
    const y = v => T + ((hi - Number(v)) / (hi - lo)) * plotH;
    const slot = plotW / Math.max(1, bars.length);
    const cw = Math.max(2, Math.min(8, slot * 0.58));
    const priceTicks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4);

    const candles = bars.map((b, i) => {
      const up = Number(b.close) >= Number(b.open);
      const cls = up ? "up" : "down";
      const yy = y(Math.max(b.open, b.close));
      const hh = Math.max(1.2, Math.abs(y(b.open) - y(b.close)));
      return `<line class="wick-${cls}" x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}"></line>
        <rect class="candle-${cls}" x="${x(i) - cw / 2}" y="${yy}" width="${cw}" height="${hh}"></rect>`;
    }).join("");

    const biLines = (an.bis || []).map(bi => (
      `<line class="bi-line" x1="${x(bi.fromK)}" y1="${y(bi.fxA.price)}" x2="${x(bi.toK)}" y2="${y(bi.fxB.price)}"></line>`
    )).join("");

    const fxs = (an.fxs || []).map(f => {
      const cy = y(f.price);
      const cls = f.type === "bottom" ? "fx-bottom" : "fx-top";
      const txtY = f.type === "bottom" ? cy + 18 : cy - 10;
      return `<circle class="${cls}" cx="${x(f.kIdx)}" cy="${cy}" r="4"></circle>
        <text class="axis" x="${x(f.kIdx)}" y="${txtY}" text-anchor="middle">${f.type === "bottom" ? "D" : "G"}</text>`;
    }).join("");

    const zs = (an.zs || []).map((z, idx) => {
      const x1 = x(z.startK), x2 = x(z.endK);
      const y1 = y(z.zg), y2 = y(z.zd);
      return `<rect class="zs-box" x="${x1}" y="${y1}" width="${Math.max(8, x2 - x1)}" height="${Math.max(3, y2 - y1)}"></rect>
        <text class="axis" x="${x1 + 6}" y="${y1 - 5}">ZS${idx + 1}</text>`;
    }).join("");

    // 买卖点标记：B 系列在低点下方向上，S 系列在高点上方向下；形成中的信号用虚线描边
    const sigMarks = (an.signals || []).map(s => {
      const cx = x(s.kIdx);
      const buy = String(s.kind || "").startsWith("B");
      const cy = y(s.price);
      const dyTip = buy ? cy + 8 : cy - 8;
      const dyBase = buy ? cy + 20 : cy - 20;
      const dyText = buy ? cy + 34 : cy - 26;
      const cls = buy ? "sig-buy" : "sig-sell";
      const dash = s.forming ? ' stroke-dasharray="3 2"' : "";
      return `<polygon class="${cls}"${dash} points="${cx},${dyTip} ${cx - 5.5},${dyBase} ${cx + 5.5},${dyBase}"></polygon>
        <text class="sig-label ${cls}" x="${cx}" y="${dyText}" text-anchor="middle">${esc(s.kind)}${s.forming ? "?" : ""}</text>`;
    }).join("");

    const grids = priceTicks.map(v => (
      `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line>
       <text class="axis" x="${W - R + 8}" y="${y(v) + 4}">${fmt(v)}</text>`
    )).join("");

    // ── MACD 副图（dif/dea 线 + 柱），背驰比较区段高亮 ──
    const macd = an.macd || {};
    const histArr = (macd.hist || []).slice(0, bars.length);
    const difArr = (macd.dif || []).slice(0, bars.length);
    const deaArr = (macd.dea || []).slice(0, bars.length);
    const mTop = T + plotH + GAP;
    const mMax = Math.max(1e-9, ...histArr.map(Math.abs), ...difArr.map(Math.abs), ...deaArr.map(Math.abs));
    const my = v => mTop + MACD_H / 2 - (v / mMax) * (MACD_H / 2 - 4);
    const mHist = histArr.map((v, i) => (
      `<line class="${v >= 0 ? "macd-hist-up" : "macd-hist-down"}" x1="${x(i)}" x2="${x(i)}" y1="${my(0)}" y2="${my(v)}"></line>`
    )).join("");
    const linePath = arr => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${my(v).toFixed(1)}`).join("");
    const div = an.divergence || null;
    const divBands = (div && div.detected) ? [
      [div.bFromK, div.bToK], [div.cFromK, div.cToK]
    ].map(([k1, k2]) => (
      `<rect class="div-band" x="${x(k1)}" y="${mTop}" width="${Math.max(4, x(k2) - x(k1))}" height="${MACD_H}"></rect>`
    )).join("") : "";
    const macdPane = `
      <line class="grid" x1="${L}" x2="${W - R}" y1="${my(0)}" y2="${my(0)}"></line>
      ${divBands}${mHist}
      <path class="macd-dif" d="${linePath(difArr)}"></path>
      <path class="macd-dea" d="${linePath(deaArr)}"></path>
      <text class="axis" x="${L}" y="${mTop - 6}">MACD (12,26,9)${div && div.detected ? ` · ${esc(div.type)} 面积比 ${fmt(div.ratio, 2)}` : ""}</text>`;

    const dateEvery = Math.max(1, Math.floor(bars.length / 8));
    const dates = bars.map((b, i) => i % dateEvery === 0 ? (
      `<text class="axis" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(String(b.date).slice(5))}</text>`
    ) : "").join("");

    return `<div class="card chart-wrap">
      <h2>CZSC 结构图</h2>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="CZSC K线结构图">
        ${grids}${dates}${zs}${candles}${biLines}${fxs}${sigMarks}${macdPane}
      </svg>
    </div>`;
  }

  function rows(items, columns, emptyText) {
    if (!items || !items.length) return `<p class="empty">${esc(emptyText)}</p>`;
    return `<table><thead><tr>${columns.map(c => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>
      ${items.map(item => `<tr>${columns.map(c => {
        const value = c.render ? c.render(item) : item[c.key];
        return `<td class="${c.num ? "num" : ""}">${value}</td>`;
      }).join("")}</tr>`).join("")}
    </tbody></table>`;
  }

  function render(data) {
    const meta = data.meta || {};
    const stock = data.stock || {};
    const bars = data.bars || [];
    const an = data.analysis || {};
    const stats = an.stats || {};
    const last = bars[bars.length - 1] || {};
    const prev = bars[bars.length - 2] || last;
    const chg = prev.close ? (Number(last.close) - Number(prev.close)) / Number(prev.close) : 0;
    const v = data.verdict || {};
    const cap = (an.capabilities || capabilities || {});
    const features = cap.features || [];
    const multi = an.multiLevel || {};
    const sigItems = (signalsCatalog && signalsCatalog.items) || (cap.signals && cap.signals.sample) || [];
    const generatedSignals = (an.generatedSignals && an.generatedSignals.items) || [];
    const linkParams = new URLSearchParams({
      symbol: stock.symbol || stock.code || currentSymbol() || "sh000001",
      period: meta.period || els.period.value || "day",
      date: meta.requestedDate || els.date.value || todayISO()
    });
    const echartsUrl = `${API_BASE}/api/chanlun/visualize?${linkParams.toString()}&format=echarts`;
    const plotlyUrl = `${API_BASE}/api/chanlun/visualize?${linkParams.toString()}&format=plotly`;

    if (meta.dataStatus === "error") {
      els.app.innerHTML = `<div class="empty"><b>分析失败</b><br>${esc(meta.message || meta.error || "CZSC 分析不可用")}</div>`;
      return;
    }

    els.app.innerHTML = `
      <section class="card hero">
        <div>
          <div class="title-row">
            <h1>${esc(stock.name || stock.symbol || "CZSC")}</h1>
            <span class="pill code">${esc(stock.code || stock.symbol || "")}</span>
            <span class="pill ${marketClass(stock.market)}">${esc(stock.market || "")}</span>
            <span class="pill">${esc(meta.period || "day")} · ${bars.length} 根K线</span>
          </div>
          <p class="verdict">${esc(v.headline || "CZSC 结构分析已生成。")}</p>
          <p class="verdict">${esc(v.body || "")}</p>
          <p class="risk">${esc(v.risk || "仅供学习研究和复盘，不构成投资建议。")}</p>
        </div>
        <div class="stats">
          <div class="stat"><b>${stats.fxs || 0}</b><span>分型</span></div>
          <div class="stat"><b>${stats.bis || 0}</b><span>笔</span></div>
          <div class="stat"><b>${stats.zs || 0}</b><span>中枢</span></div>
          <div class="stat"><b>${stats.signals || 0}</b><span>买卖点</span></div>
          <div class="stat"><b class="${chg >= 0 ? "up" : "down"}">${pct(chg)}</b><span>末日涨跌</span></div>
        </div>
      </section>

      <section class="card">
        <h2>运行状态</h2>
        <div class="stats">
          <div class="stat"><b>${esc(meta.dataProvider || "-")}</b><span>行情源</span></div>
          <div class="stat"><b>${esc(meta.tradeDate || "-")}</b><span>实际分析日</span></div>
          <div class="stat"><b>${esc(an.engine && an.engine.module || "rs_czsc")}</b><span>CZSC 引擎</span></div>
          <div class="stat"><b>${esc(meta.cacheHit ? "是" : "否")}</b><span>缓存命中</span></div>
        </div>
      </section>

      ${drawChart(data)}

      <section class="card">
        <h2>买卖点信号</h2>
        ${rows(an.signals || [], [
          { name: "信号", render: s => `<b class="${String(s.kind || "").startsWith("B") ? "up" : "down"}">${esc(s.label || s.kind)}</b>` },
          { name: "日期", render: s => esc(s.date || "-") },
          { name: "价位", num: true, render: s => fmt(s.price) },
          { name: "状态", render: s => s.forming ? '<span class="pill">形成中</span>' : '<span class="pill up">已确认</span>' },
          { name: "依据", render: s => {
              const f = s.facts || {};
              if (f.div) return `${esc(f.div.type)}，MACD 面积比 ${fmt(f.div.ratio, 2)}`;
              if (f.pivot) return `突破中枢 [${fmt(f.pivot.zd)} - ${fmt(f.pivot.zg)}] 后回抽不回区间`;
              if (f.ref) return `回抽不破前${String(s.kind).startsWith("B") ? "低" : "高"}点 ${fmt(f.ref.price)}`;
              return "-";
            } }
        ], "当前结构未检出一二三类买卖点（规则口径：背驰 + 中枢突破回抽）")}
      </section>

      <section class="card">
        <div class="section-line">
          <h2>可视化导出</h2>
          <div class="actions">
            <a class="action-btn" target="_blank" href="${esc(echartsUrl)}">ECharts HTML</a>
            <a class="action-btn" target="_blank" href="${esc(plotlyUrl)}">Plotly HTML</a>
          </div>
        </div>
      </section>

      <section class="table-grid">
        <div class="card">
          <h2>K线合成与多级别分析</h2>
          ${multi.enabled ? rows(multi.levels || [], [
            { name: "周期", key: "freq" },
            { name: "K线", key: "bars", num: true },
            { name: "分型", num: true, render: x => esc((x.stats || {}).fxs ?? "-") },
            { name: "笔", num: true, render: x => esc((x.stats || {}).bis ?? "-") },
            { name: "中枢", num: true, render: x => esc((x.stats || {}).zs ?? "-") },
            { name: "最新", render: x => esc(x.latest ? x.latest.date : "-") }
          ], "暂无多级别数据") : `<p class="empty">${esc(multi.message || "多级别合成不可用")}</p>`}
        </div>
        <div class="card">
          <h2>CZSC 能力接入状态</h2>
          ${rows(features, [
            { name: "能力", key: "name" },
            { name: "状态", render: x => `<span class="pill ${x.status === "ok" ? "up" : x.status === "missing" ? "down" : ""}">${esc(x.status)}</span>` },
            { name: "说明", key: "detail" }
          ], "未读取到能力状态")}
        </div>
      </section>

      <section class="table-grid">
        <div class="card">
          <h2>分型 FX</h2>
          ${rows((an.fxs || []).slice(-24), [
            { name: "日期", key: "date" },
            { name: "类型", render: x => esc(x.name) },
            { name: "价位", num: true, render: x => fmt(x.price) },
            { name: "强度", render: x => esc(x.power || "-") }
          ], "暂无分型")}
        </div>
        <div class="card">
          <h2>笔 BI</h2>
          ${rows((an.bis || []).slice(-24), [
            { name: "#", key: "index", num: true },
            { name: "方向", render: x => esc(x.direction) },
            { name: "区间", render: x => `${esc(x.sdt)} ~ ${esc(x.edt)}` },
            { name: "力度", num: true, render: x => fmt(x.power) },
            { name: "R²", num: true, render: x => fmt(x.rsq, 4) }
          ], "CZSC 尚未成笔")}
        </div>
      </section>

      <section class="table-grid">
        <div class="card">
          <h2>中枢候选 ZS</h2>
          ${rows(an.zs || [], [
            { name: "#", key: "index", num: true },
            { name: "区间", render: x => `${esc(x.sdt)} ~ ${esc(x.edt)}` },
            { name: "ZG", num: true, render: x => fmt(x.zg) },
            { name: "ZD", num: true, render: x => fmt(x.zd) },
            { name: "中轴", num: true, render: x => fmt(x.zz) }
          ], "暂无有效中枢候选")}
        </div>
        <div class="card">
          <h2>最后一根 K 线</h2>
          <div class="stats">
            <div class="stat"><b>${fmt(last.close)}</b><span>收盘</span></div>
            <div class="stat"><b>${fmt(last.high)}</b><span>最高</span></div>
            <div class="stat"><b>${fmt(last.low)}</b><span>最低</span></div>
            <div class="stat"><b>${fmt(last.volume, 0)}</b><span>成交量</span></div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>generate_czsc_signals 兼容输出</h2>
        ${rows(generatedSignals, [
          { name: "信号", key: "name" },
          { name: "值", key: "value" },
          { name: "V1", key: "v1" },
          { name: "V2", key: "v2" },
          { name: "说明", key: "detail" }
        ], "暂无生成信号")}
      </section>

      <section class="card">
        <h2>Rust 信号目录预览</h2>
        ${rows(sigItems, [
          { name: "名称", key: "name" },
          { name: "命名空间", key: "namespace" },
          { name: "类别", key: "category" },
          { name: "参数模板", key: "param_template" }
        ], "当前运行环境未暴露信号目录")}
      </section>

      <details class="card">
        <summary>查看 CZSC JSON 输出</summary>
        <pre class="json-box">${esc(JSON.stringify(an, null, 2))}</pre>
      </details>
    `;
  }

  function currentSymbol() {
    const raw = els.symbol.value.trim();
    const matched = candidates.find(s => raw === s.symbol || raw === s.code || raw === s.name);
    return matched ? matched.symbol : raw;
  }

  function analyze(force) {
    const symbol = currentSymbol() || "sh000001";
    const period = els.period.value || "day";
    const date = els.date.value || todayISO();
    els.app.innerHTML = `<div class="loading">正在拉取行情并运行 CZSC 结构识别...</div>`;
    els.run.disabled = true;
    els.refresh.disabled = true;
    writeLast(symbol, period, date);
    return api("/api/chanlun/analyze", { symbol, period, date, refresh: force ? "1" : "0" })
      .then(render)
      .catch(err => {
        els.app.innerHTML = `<div class="empty"><b>数据加载失败</b><br>${esc(err.message || err)}</div>`;
      })
      .finally(() => {
        els.run.disabled = false;
        els.refresh.disabled = false;
      });
  }

  function init() {
    const last = readLast();
    els.symbol.value = last.symbol || "sh000001";
    els.period.value = last.period || "day";
    els.date.value = last.date || todayISO();
    Promise.all([loadCandidates(""), loadCzscMeta()]).then(() => analyze(false));
  }

  let searchTimer = null;
  els.symbol.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadCandidates(els.symbol.value.trim()), 220);
  });
  els.market.addEventListener("change", () => loadCandidates(els.symbol.value.trim()));
  els.quick.addEventListener("click", e => {
    const btn = e.target.closest("button[data-symbol]");
    if (!btn) return;
    els.symbol.value = btn.dataset.symbol;
    analyze(false);
  });
  els.run.addEventListener("click", () => analyze(false));
  els.refresh.addEventListener("click", () => analyze(true));
  init();
})();
