/* 轮动监控 · 行业轮动与资金流向仪表盘
   数据来自统一后端 /api/rotation（WeStock 优先 / AKShare 兜底，按日期缓存），
   支持按日期拉取与忽略缓存重新拉取。 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const API_BASE = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
  const DATE_KEY = 'rotation:last-date:v1';

  const fmtPct = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%');
  const fmtYi = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '亿');
  const fmtAmt = (v) => (v == null ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '亿');
  const cls = (v) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* ── ① 指数条 + 资金主线 ── */
  function renderOverview(data) {
    const meta = data.meta || {};
    const back = meta.requestedDate && meta.tradeDate && meta.requestedDate !== meta.tradeDate
      ? ` · 已回退自 ${meta.requestedDate}` : '';
    $('#asOf').textContent = `行情日 ${meta.tradeDate || '—'}${back} · 更新 ${meta.asOf || '—'}`;

    const cells = (data.indices || []).map((i) => `
      <div class="idx-cell ${cls(i.change_pct)}">
        <div class="nm">${esc(i.name)}</div>
        <div class="px">${(i.current ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        <div class="chg ${cls(i.change_pct)}">${fmtPct(i.change_pct)}</div>
        <div class="sub">${i.amount != null ? '额 ' + i.amount.toLocaleString('zh-CN') + ' 亿' : '—'}</div>
      </div>`);
    if (data.total_amount != null) {
      const chg = data.amount_change_pct;
      cells.push(`
        <div class="idx-cell ${cls(chg)}">
          <div class="nm">两市成交</div>
          <div class="px">${data.total_amount.toLocaleString('zh-CN')} <span style="font-size:12px">亿</span></div>
          <div class="chg ${cls(chg)}">${chg != null ? fmtPct(chg) + '较昨' : '—'}</div>
          <div class="sub">${chg == null ? '无昨日对比' : chg > 3 ? '较昨放量' : chg < -3 ? '较昨缩量' : '量能持平'}</div>
        </div>`);
    }
    $('#indexStrip').innerHTML = cells.join('');

    const m = data.mainline || {};
    $('#mainline').innerHTML = `
      <div class="mainline-title">TODAY'S ROTATION · 今日轮动主线</div>
      <div class="mainline-text">${m.text || '当日轮动主线数据不足。'}</div>
      <div class="mainline-chips">${(m.chips || []).map((c) => `<span class="ml-chip ${esc(c.kind)}"><i></i>${esc(c.label)}</span>`).join('')}</div>`;
  }

  /* ── ② 热力网格：涨红跌绿，深浅表强度 ── */
  function heatBg(chg, maxAbs) {
    if (chg == null) return 'rgba(139, 147, 161, 0.08)';
    const t = Math.min(1, Math.max(0.12, Math.abs(chg) / (maxAbs || 1)));
    if (chg > 0) return `rgba(224, 82, 74, ${(0.10 + 0.42 * t).toFixed(3)})`;
    if (chg < 0) return `rgba(53, 179, 126, ${(0.10 + 0.42 * t).toFixed(3)})`;
    return 'rgba(139, 147, 161, 0.10)';
  }
  function renderHeat(data) {
    const industries = data.industries || [];
    const known = industries.filter((d) => d.chg != null);
    const maxAbs = Math.max(0.5, ...known.map((d) => Math.abs(d.chg)));
    const showFlow = !!(data.fund_flow && data.fund_flow.available);
    const cells = industries.map((d) => `
      <div class="heat-cell" style="background:${heatBg(d.chg, maxAbs)}">
        <div class="hn">${esc(d.name)}</div>
        <div class="hv ${cls(d.chg)}">${fmtPct(d.chg)}</div>
        <div class="hm"><span>5日 ${fmtPct(d.d5)}</span><span>20日 ${fmtPct(d.d20)}</span></div>
        <div class="hf">成交 ${fmtAmt(d.amount)}${showFlow && d.flow != null ? ` · 主力 ${fmtYi(d.flow)}` : ''}</div>
      </div>`).join('');
    const legend = `
      <div class="heat-legend">
        <span>强跌</span>
        <span class="swatches">
          <i style="background:rgb(var(--down-rgb))"></i><i style="background:rgba(var(--down-rgb),0.55)"></i><i style="background:rgba(var(--down-rgb),0.28)"></i>
        </span>
        <span>弱跌</span>
        <span style="flex:0 0 14px"></span>
        <span>弱涨</span>
        <span class="swatches">
          <i style="background:rgba(var(--up-rgb),0.28)"></i><i style="background:rgba(var(--up-rgb),0.55)"></i><i style="background:rgb(var(--up-rgb))"></i>
        </span>
        <span>强涨</span>
        <span style="flex:1"></span>
        <span>颜色按当日涨跌幅强度映射</span>
      </div>`;
    $('#heatWrap').innerHTML = `<div class="heat-grid">${cells}</div>${legend}`;
  }

  /* ── ③ 风格轮动天平（分类强弱用蓝紫色中性表达，不占用涨跌语义） ── */
  function renderStyles(data) {
    const styles = data.styles || [];
    if (!styles.length) {
      $('#styleCard').innerHTML = '<div class="style-foot">风格指数行情不足，暂无法计算风格天平。</div>';
      return;
    }
    const rows = styles.map((s) => {
      const rightStrong = s.pos >= 0;
      const half = Math.abs(s.pos) * 50;
      const fill = rightStrong
        ? `<span class="fill" style="left:50%; width:${half}%"></span>`
        : `<span class="fill left" style="right:50%; width:${half}%"></span>`;
      const dotLeft = 50 + s.pos * 50;
      const strongName = rightStrong ? s.right : s.left;
      const deltaText = s.delta5 == null
        ? '5 日前数据不足，无位移对比'
        : s.delta5 >= 0
          ? `较5日前 +${s.delta5.toFixed(2)}（向「${esc(s.right)}」偏移）`
          : `较5日前 ${s.delta5.toFixed(2)}（向「${esc(s.left)}」回摆）`;
      return `<div class="style-row">
        <div class="labels">
          <span class="${rightStrong ? '' : 'strong-side'}">${esc(s.left)}</span>
          <span class="val">${esc(strongName)}占优 ${s.pos >= 0 ? '+' : ''}${s.pos.toFixed(2)}</span>
          <span class="${rightStrong ? 'strong-side' : ''}">${esc(s.right)}</span>
        </div>
        <div class="style-track">${fill}<span class="mid"></span><span class="dot" style="left:${dotLeft}%"></span></div>
        <div class="delta">${deltaText}</div>
      </div>`;
    }).join('');
    $('#styleCard').innerHTML = rows + `
      <div class="style-foot">天平位置 = 两侧指数 20 日收益差 ÷ 15%，截断至 [-1, +1]，0 为均衡。风格强弱为分类信息，用蓝紫色中性表达，不使用涨跌色。</div>`;
  }

  /* ── ④ 主力资金双向条形 ── */
  function renderFlowRank(data) {
    const fundFlow = data.fund_flow || {};
    const section = $('#flowSection');
    if (!fundFlow.available) {
      section.hidden = true;
      $('#flowRank').innerHTML = '';
      $('#judgeNo').textContent = '④';
      return;
    }
    const withFlow = (data.industries || []).filter((d) => d.flow != null);
    if (!withFlow.length) {
      section.hidden = true;
      $('#flowRank').innerHTML = '';
      $('#judgeNo').textContent = '④';
      return;
    }
    section.hidden = false;
    $('#judgeNo').textContent = '⑤';
    const sorted = [...withFlow].sort((a, b) => b.flow - a.flow);
    const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.flow)), 0.1);
    const missing = (data.industries || []).length - withFlow.length;
    $('#flowRank').innerHTML = sorted.map((d) => {
      const pct = (Math.abs(d.flow) / maxAbs) * 48;
      const bar = d.flow >= 0
        ? `<span class="bar pos" style="width:${pct}%"></span>`
        : `<span class="bar neg" style="width:${pct}%"></span>`;
      return `<div class="flow-row">
        <span class="fn">${esc(d.name)}</span>
        <span class="flow-track"><span class="axis"></span>${bar}</span>
        <span class="fv ${cls(d.flow)}">${fmtYi(d.flow)}</span>
      </div>`;
    }).join('') + (missing > 0 ? `<div class="flow-note">另有 ${missing} 个板块当日真实资金数据缺失，未参与排行。</div>` : '');
  }

  /* ── ⑥ 三条研判 ── */
  function renderJudges(data) {
    $('#judgeGrid').innerHTML = (data.judges || []).map((j, i) => `
      <div class="judge-card">
        <div class="judge-head">
          <span class="judge-no">研判${['一', '二', '三'][i] || i + 1}</span>
          <span class="judge-tag ${esc(j.tag)}">${esc(j.tagText)}</span>
        </div>
        <div class="judge-title">${esc(j.title)}</div>
        <div class="judge-body">${j.body}</div>
      </div>`).join('');
  }

  function renderBadge(meta) {
    const badge = $('#srcBadge');
    if (meta.error) {
      badge.textContent = '加载失败';
      badge.style.color = 'var(--err)';
      badge.style.borderColor = 'var(--err)';
      return;
    }
    const p = meta.providers || {};
    const parts = Object.values(p)
      .filter((v) => v && v !== 'unavailable')
      .flatMap((v) => String(v).split('+'));
    const src = [...new Set(parts)].join('+') || '—';
    badge.textContent = `${src}${meta.cacheHit ? ' · 缓存' : ' · 实时拉取'}`;
    badge.style.color = '';
    badge.style.borderColor = '';
  }

  function render(data) {
    const meta = data.meta || {};
    if (meta.error) {
      renderBadge(meta);
      $('#flowSection').hidden = true;
      $('#judgeNo').textContent = '④';
      $('#mainline').innerHTML = `<div class="mainline-title" style="color:var(--err)">加载失败</div>
        <div class="mainline-text">${esc(meta.message || meta.error)}</div>`;
      return;
    }
    renderBadge(meta);
    renderOverview(data);
    renderHeat(data);
    renderStyles(data);
    renderFlowRank(data);
    renderJudges(data);
  }

  function setLoading(on) {
    $('#loadBtn').disabled = on;
    $('#refreshBtn').disabled = on;
    if (on) {
      $('#srcBadge').textContent = '拉取中…';
      $('#mainline').innerHTML = '<div class="mainline-title">LOADING</div><div class="mainline-text">正在拉取行情、同源行业板块与风格指数…（首次拉取约 20–60 秒，之后命中缓存瞬间返回）</div>';
    }
  }

  function load(force) {
    const date = $('#dateInput').value || todayISO();
    try { localStorage.setItem(DATE_KEY, date); } catch (_) {}
    setLoading(true);
    fetch(`${API_BASE}/api/rotation?date=${encodeURIComponent(date)}&refresh=${force ? '1' : '0'}`, { cache: 'no-store' })
      .then((r) => {
        if (r.status === 404) throw new Error('HTTP 404：服务端没有 /api/rotation 接口——正在运行的 server.py 可能是旧版本进程，请重启后重试');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(render)
      .catch((err) => render({ meta: { error: 'FetchError', message: String(err.message || err) } }))
      .finally(() => setLoading(false));
  }

  function init() {
    let last = '';
    try { last = localStorage.getItem(DATE_KEY) || ''; } catch (_) {}
    $('#dateInput').value = /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : todayISO();
    $('#dateInput').max = todayISO();
    $('#loadBtn').addEventListener('click', () => load(false));
    $('#refreshBtn').addEventListener('click', () => load(true));
    load(false);
  }

  init();
})();
