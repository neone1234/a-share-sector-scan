const { useState, useEffect, useCallback, useRef } = React;

const API = '/api/review';
const HISTORY_API = '/api/review/history';

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString('zh-CN'); }
function fmtPct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtAmt(n) { return n == null ? '—' : Number(n).toLocaleString('zh-CN') + ' 亿'; }
function cls(n) { return n > 0 ? 'up' : n < 0 ? 'down' : ''; }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function initialDate() {
  const value = new URLSearchParams(window.location.search).get('date') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= todayStr() ? value : todayStr();
}
function fmtElapsed(sec) {
  if (sec < 60) return sec + ' 秒';
  return Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒';
}
function fmtClock(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function estimateDuration(history) {
  const values = (history || []).map(h => Number(h.duration_seconds)).filter(n => n > 1 && n < 600).sort((a, b) => a - b);
  if (!values.length) return 45;
  return Math.max(15, Math.round(values[Math.floor(values.length / 2)]));
}
function sourceSummary(meta) {
  const sources = meta && meta.data_sources ? meta.data_sources : {};
  const names = Object.values(sources).map(item => item && item.provider).filter(Boolean).filter(name => name !== 'none');
  return [...new Set(names)].join(' + ') || '数据源不可用';
}

// 信号灯配色对齐 A 股涨红跌绿：green(可进攻)=红、yellow(观察)=金、red(防守)=绿。
// 后端状态键名 green/yellow/red 保留不动，仅在展示层重新映射颜色。
const STATUS_COLOR = { green: 'var(--up)', yellow: 'var(--violet)', red: 'var(--down)' };

function SignalGauge({ signal }) {
  if (!signal) return null;
  const { score, temperature, status, label, guidance, reasons } = signal;
  const r = 48, C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = C - (pct / 100) * C;
  const color = STATUS_COLOR[status] || 'var(--violet)';

  return (
    <div className="signal-hero">
      <div className="signal-gauge">
        <svg viewBox="0 0 120 120">
          <circle className="track" cx="60" cy="60" r={r} />
          <circle className="bar" cx="60" cy="60" r={r}
            style={{ stroke: color }} strokeDasharray={C} strokeDashoffset={offset} />
        </svg>
        <div className="signal-score">
          <span className="num" style={{ color }}>{score}</span>
          <span className="of">/ 100</span>
        </div>
      </div>
      <div className="signal-body">
        <span className={`temp-label ${status}`}>{temperature}</span>
        <div className="action-label">{label}</div>
        <div className="guidance">{guidance}</div>
        <div className="signal-reasons">
          {(reasons || []).map((r, i) => <span key={i} className="pill">{r}</span>)}
        </div>
      </div>
    </div>
  );
}

function SectionHead({ no, title, hint }) {
  return (
    <div className="sec-head">
      <span className="sec-no">{no}</span>
      <span className="sec-title">{title}</span>
      {hint && <span className="sec-hint">{hint}</span>}
      <span className="sec-rule" />
    </div>
  );
}

function IndexGrid({ indices }) {
  if (!indices || !indices.length) return null;
  return (
    <div className="index-grid">
      {indices.map(idx => (
        <div key={idx.code} className="index-card">
          <span className="idx-name">{idx.name}</span>
          <span className="idx-price">{fmt(idx.current)}</span>
          <span className={`idx-chg ${cls(idx.change_pct)}`}>
            {fmtPct(idx.change_pct)}
            <small style={{ opacity: 0.7, marginLeft: 4 }}>{idx.change >= 0 ? '+' : ''}{fmt(idx.change)}</small>
          </span>
          <div className="idx-meta">
            <span>开 {fmt(idx.open)}</span>
            <span>高 {fmt(idx.high)}</span>
            <span>低 {fmt(idx.low)}</span>
            <span>额 {fmtAmt(idx.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BreadthSection({ breadth }) {
  if (!breadth) return null;
  const { up_count, down_count, flat_count, limit_up_count, limit_down_count, total_amount } = breadth;
  const flatAvailable = breadth.flat_available !== false;
  const up = Number(up_count) || 0, down = Number(down_count) || 0, flat = flatAvailable ? (Number(flat_count) || 0) : 0;
  const total = up + down + flat;
  const upW = total > 0 ? (up / total * 100) : 50;
  const flatW = total > 0 ? (flat / total * 100) : 0;
  const downW = total > 0 ? (down / total * 100) : 50;
  const sampleText = breadth.coverage != null
    ? `样本 ${fmt(breadth.sample_size)} / ${fmt(breadth.universe_size)} · 覆盖 ${breadth.coverage}%`
    : `样本 ${fmt(breadth.sample_size)}`;
  const amountChangeText = breadth.amount_change_pct == null ? '' : ` · 较前日 ${fmtPct(Number(breadth.amount_change_pct))}`;

  return (
    <React.Fragment>
      <div className="breadth-row">
        <div className="breadth-card">
          <div className="bc-label">上涨股票</div>
          <div className="bc-val" style={{ color: 'var(--up)' }}>{fmt(up_count)}</div>
          <div className="bc-sub">涨停 {fmt(limit_up_count)}</div>
        </div>
        <div className="breadth-card">
          <div className="bc-label">平盘股票</div>
          <div className="bc-val">{flatAvailable ? fmt(flat_count) : '—'}</div>
          <div className="bc-sub">成交额 {fmtAmt(total_amount)}{amountChangeText}</div>
        </div>
        <div className="breadth-card">
          <div className="bc-label">下跌股票</div>
          <div className="bc-val" style={{ color: 'var(--down)' }}>{fmt(down_count)}</div>
          <div className="bc-sub">跌停 {fmt(limit_down_count)}</div>
        </div>
      </div>
      <div className="breadth-bar-wrap">
        <div className="breadth-stacked">
          <div className="seg up-seg" style={{ width: upW + '%' }}>{up_count}</div>
          {flatAvailable && <div className="seg flat-seg" style={{ width: flatW + '%' }}>{flat_count}</div>}
          <div className="seg down-seg" style={{ width: downW + '%' }}>{down_count}</div>
        </div>
        <div className="breadth-legend">
          <span>上涨 {upW.toFixed(1)}%</span>
          {flatAvailable && <span>平盘 {flatW.toFixed(1)}%</span>}
          <span>下跌 {downW.toFixed(1)}%</span>
        </div>
        <div className="breadth-source">{sampleText} · {breadth.turnover_scope || breadth.scope || '股票涨跌统计'}</div>
      </div>
    </React.Fragment>
  );
}

function sectorRows(sectors) {
  if (!sectors) return [];
  const hasFullList = Array.isArray(sectors.all) && sectors.all.length;
  const raw = hasFullList ? sectors.all : [...(sectors.top || []), ...(sectors.bottom || [])];
  const seen = new Set();
  const rows = raw.filter(item => {
    const key = item && (item.symbol || item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return hasFullList ? rows : rows.sort((a, b) => Number(b.change_pct || 0) - Number(a.change_pct || 0));
}

function SectorRankings({ sectors }) {
  const rows = sectorRows(sectors);
  if (!rows.length) return null;
  return (
    <div className="sector-list full">
      <div className="sector-table-head">
        <span>排名</span>
        <span>板块</span>
        <span>当日</span>
        <span>5日</span>
        <span>20日</span>
        <span>成交额</span>
      </div>
      {rows.map((s, i) => {
        const change = s.change_pct == null ? null : Number(s.change_pct);
        const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
        return (
          <div key={s.symbol || s.name} className="sr-row">
            <span className="sr-rank">{i + 1}</span>
            <span className="sr-name">
              {s.name}
              {s.classification && <small>{s.classification}</small>}
            </span>
            <span className={`sr-pct ${changeClass}`}>{fmtPct(change)}</span>
            <span className="sr-subpct">{fmtPct(s.d5)}</span>
            <span className="sr-subpct">{fmtPct(s.d20)}</span>
            <span className="sr-amount">{fmtAmt(s.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}

const SECTION_ICONS = {
  '盘面总览': '\u{1F4CA}',
  '指数结构': '\u{1F4C8}',
  '板块主线': '\u{1F3AF}',
  '资金与情绪': '\u{1F4B0}',
  '消息催化': '\u{1F4E2}',
  '明日交易计划': '\u{1F4CB}',
  '风险提示': '\u{26A0}',
};

function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*?<\/li>)+/gs, m => {
    if (m.match(/^\s*\d/)) return '<ol>' + m + '</ol>';
    return '<ul>' + m + '</ul>';
  });
  return '<p>' + html + '</p>';
}

function ReportSections({ sections }) {
  if (!sections || !sections.length) return null;
  return (
    <div className="report-sections">
      {sections.map((sec, i) => {
        const icon = SECTION_ICONS[sec.title] || '\u{1F4DD}';
        return (
          <div key={i} className="report-card">
            <div className="rc-head">
              <span className="rc-icon">{icon}</span>
              <span className="rc-title">{sec.title}</span>
            </div>
            <div className="rc-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.content) }} />
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ history, onSelect, activeDate }) {
  if (!history || !history.length) return <div style={{ color: 'var(--ink2)', fontSize: 13 }}>暂无历史记录</div>;
  return (
    <div className="history-list">
      {history.map(h => {
        const sc = h.signal_score;
        const st = sc >= 60 ? 'green' : sc >= 40 ? 'yellow' : 'red';
        return (
          <div key={h.date} className="history-item"
            style={h.date === activeDate ? { borderColor: 'var(--accent)' } : {}}
            onClick={() => onSelect(h.date)}>
            <span className="hi-date">{h.date}</span>
            {sc != null && <span className={`hi-score ${st}`}>{sc}</span>}
            <span className="hi-label">{h.signal_label || ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function CompletionStrip({ meta }) {
  if (!meta) return null;
  const sources = meta.data_sources || {};
  const sourceEntries = Object.entries(sources);
  const completedAt = meta.completed_at || meta.generated_at;
  return (
    <div className="completion-strip" role="status">
      <div className="completion-main">
        <span className="completion-check">✓</span>
        <div>
          <strong>{meta.cached ? '历史复盘已加载' : '复盘计算完成'}</strong>
          <span>
            {completedAt ? `完成于 ${fmtClock(completedAt)}` : '已完成'}
            {meta.duration_seconds ? ` · 耗时 ${fmtElapsed(Math.round(meta.duration_seconds))}` : ''}
            {meta.trade_date ? ` · 行情日 ${meta.trade_date}` : ''}
          </span>
        </div>
      </div>
      <div className="health-list" aria-label="调用状态">
        {sourceEntries.map(([key, item]) => (
          <span key={key} className={`health-chip ${item.status || 'unavailable'}`} title={(item.errors || []).join('\n')}>
            <i />{key === 'indices' ? '指数' : key === 'breadth' ? '宽度' : key === 'sectors' ? '板块' : '资讯'} · {item.provider || 'none'}
          </span>
        ))}
        <span className={`health-chip ${meta.llm_status === 'ok' ? 'ok' : 'fallback'}`} title={meta.llm_error || ''}>
          <i />LLM · {meta.llm_status === 'ok' ? meta.llm_model : '模板降级'}
        </span>
      </div>
    </div>
  );
}

function LoadingOverlay({ date, estimateSeconds }) {
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  useEffect(() => {
    setElapsed(0);
    setStartedAt(Date.now());
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [date]);

  const expectedAt = new Date(startedAt + estimateSeconds * 1000);

  const steps = [
    { label: '数据采集', threshold: 0 },
    { label: '涨跌统计', threshold: 5 },
    { label: 'LLM 分析', threshold: 12 },
    { label: '报告生成', threshold: 25 },
  ];
  const activeIdx = steps.reduce((ai, s, i) => elapsed >= s.threshold ? i : ai, 0);

  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <div className="loading-state active">
          <div className="mark">R</div>
          <h2>正在复盘 {date}</h2>
          <div className="loading-steps">
            {steps.map((s, i) => (
              <span key={i} className={'ls-step' + (i < activeIdx ? ' done' : i === activeIdx ? ' active' : '')}>
                {i < activeIdx ? '✓ ' : i === activeIdx ? '▶ ' : '○ '}{s.label}
              </span>
            ))}
          </div>
          <p className="loading-elapsed">已用时 {fmtElapsed(elapsed)}</p>
          <p className="loading-eta">预计 {fmtClock(expectedAt)} 完成，数据源降级时可能稍有延迟</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [loadingDate, setLoadingDate] = useState(null);
  const loadingRef = useRef(false);

  const fetchReview = useCallback(async (date, force = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadingDate(date);
    setError(null);
    if (!force) setData(null);
    try {
      let url = API + '?date=' + date;
      if (force) url += '&refresh=1';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setSelectedDate(date);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingDate(null);
      loadingRef.current = false;
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(HISTORY_API);
      if (!res.ok) return;
      const h = await res.json();
      setHistory(h.history || []);
    } catch (e) {}
  }, []);

  const handleDateChange = useCallback((date) => {
    setSelectedDate(date);
    window.history.replaceState(null, '', '/review?date=' + date);
    fetchReview(date).then(fetchHistory);
  }, [fetchReview, fetchHistory]);

  const handleRefresh = useCallback(() => {
    fetchReview(selectedDate, true).then(fetchHistory);
  }, [selectedDate, fetchReview, fetchHistory]);

  useEffect(() => { fetchReview(selectedDate).then(fetchHistory); }, []);

  const showOverlay = loading && loadingDate;
  const expectedSeconds = estimateDuration(history);

  if (!data && loading) {
    return (
      <React.Fragment>
        <Header selectedDate={selectedDate} onDateChange={handleDateChange} />
        <div className="page">
          <LoadingOverlay date={selectedDate} estimateSeconds={expectedSeconds} />
        </div>
      </React.Fragment>
    );
  }

  if (error && !data) {
    return (
      <React.Fragment>
        <Header selectedDate={selectedDate} onDateChange={handleDateChange} />
        <div className="page">
          <div className="loading-state">
            <div className="mark">!</div>
            <h2>加载失败</h2>
            <p>{error}</p>
            <button className="mini-btn primary" onClick={() => fetchReview(selectedDate)}>重试</button>
          </div>
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Header
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        loading={loading}
        cached={data && data.meta && data.meta.cached}
        onRefresh={handleRefresh}
      />
      {showOverlay && <LoadingOverlay date={loadingDate} estimateSeconds={expectedSeconds} />}
      <div className="page">
        <CompletionStrip meta={data.meta} />
        <SignalGauge signal={data.signal} />

        <SectionHead no="1" title="指数行情" hint={`主要宽基指数 · 行情日 ${data.meta?.trade_date || data.date}`} />
        <IndexGrid indices={data.indices} />

        <SectionHead no="2" title="市场温度" hint={`${data.breadth?.scope || '股票涨跌统计'} · 股票上涨/下跌数量`} />
        <BreadthSection breadth={data.breadth} />

        <SectionHead no="3" title="板块轮动" hint="全行业指数涨跌幅完整列表" />
        <SectorRankings sectors={data.sectors} />

        <SectionHead no="4" title="复盘报告" hint={data.meta ? `模型: ${data.meta.llm_model || 'template'}` : ''} />
        <ReportSections sections={data.report_sections} />

        <SectionHead no="5" title="历史复盘" />
        <HistoryList history={history} onSelect={handleDateChange} activeDate={selectedDate} />

        <footer className="foot">
          <p>
            <strong>大盘复盘</strong>
            数据来源 {sourceSummary(data.meta)} · 报告由 LLM 或本地模板生成，仅供参考
            {data.meta && data.meta.generated_at &&
              <span style={{ marginLeft: 12 }}>生成于 {data.meta.generated_at.replace('T', ' ').slice(0, 19)}</span>
            }
          </p>
        </footer>
      </div>
    </React.Fragment>
  );
}

function Header({ selectedDate, onDateChange, loading, cached, onRefresh }) {
  return (
    <header className="top">
      <a className="brand" href="/sector">
        <span className="brand-mark">复</span>
        <span className="brand-text">
          <strong>A股分析终端</strong>
          <small>MARKET REVIEW · 大盘复盘</small>
        </span>
      </a>
      <nav className="module-tabs" aria-label="功能模块">
        <a href="/sector">板块扫描</a>
        <a href="/decision">决策看板</a>
        <a className="active" href="/review">大盘复盘</a>
        <a href="/rotation">轮动监控</a>
        <a href="/help">帮助</a>
      </nav>
      <div className="top-actions">
        <label className="date-control" title="选择复盘日期">
          <span>日期</span>
          <input type="date" value={selectedDate} max={todayStr()}
            disabled={loading}
            onChange={e => onDateChange(e.target.value)} />
        </label>
        {cached && <span style={{ fontSize: 11, color: 'var(--ink2)' }}>已缓存</span>}
        {onRefresh && (
          <button className="mini-btn primary" onClick={onRefresh} disabled={loading}>
            {loading ? '复盘中…' : '重新生成'}
          </button>
        )}
      </div>
    </header>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
