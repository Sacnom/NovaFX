import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  Compass,
  Gamepad2,
  History,
  LineChart,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import PriceChart from "./components/PriceChart";
import { LEVERAGES, PAIRS, TIMEFRAMES } from "./data";
import {
  calculateFee,
  calculatePnl,
  calculateUnits,
  getLevel,
  getMaxMargin,
  INITIAL_BALANCE,
  roundMoney,
} from "./trading";

const STORAGE_KEY = "novafx-account-v1";
const MISSIONS = [
  { id: "explore", title: "市场侦察", description: "查看 3 个不同货币对", target: 3, reward: 30 },
  { id: "open", title: "进入赛场", description: "完成 1 笔模拟开仓", target: 1, reward: 50 },
  { id: "close", title: "完成闭环", description: "完成 1 次模拟平仓", target: 1, reward: 80 },
];

const MARK_COLORS = {
  EUR: ["#eeedff", "#6857d9"],
  GBP: ["#fff0ee", "#d16b58"],
  USD: ["#eaf4ff", "#397cb9"],
  AUD: ["#eaf7f2", "#25866c"],
  NZD: ["#f1edff", "#8264bd"],
};

function todayKey(date = new Date()) {
  const now = date;
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyDaily() {
  return { date: todayKey(), explored: [], opens: 0, closes: 0, claimed: [] };
}

function createDefaultAccount() {
  return {
    version: 1,
    balance: INITIAL_BALANCE,
    positions: [],
    activities: [],
    xp: 0,
    totalOpened: 0,
    totalClosed: 0,
    daily: emptyDaily(),
  };
}

function loadAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && Number.isFinite(saved.balance)) {
      return {
        ...createDefaultAccount(),
        ...saved,
        positions: Array.isArray(saved.positions) ? saved.positions : [],
        activities: Array.isArray(saved.activities) ? saved.activities : [],
        daily: saved.daily?.date === todayKey() ? saved.daily : emptyDaily(),
      };
    }
  } catch {
    // A damaged local save should not prevent the simulator from starting.
  }
  return createDefaultAccount();
}

function withToday(account) {
  return account.daily?.date === todayKey() ? account : { ...account, daily: emptyDaily() };
}

function missionProgress(daily, id) {
  if (id === "explore") return daily.explored?.length || 0;
  if (id === "open") return daily.opens || 0;
  return daily.closes || 0;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatNfx(value, signed = false) {
  if (!Number.isFinite(value)) return "--";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)} NFX`;
}

function formatPrice(value, pair) {
  return Number.isFinite(value) ? value.toFixed(pair.decimals) : "--";
}

function formatClock(value) {
  if (!value) return "--:--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatRecordTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function PairMark({ pair, small = false }) {
  const colors = MARK_COLORS[pair.base] || ["#eeedff", "#6857d9"];
  return (
    <span
      className={`pair-mark ${small ? "pair-mark-small" : ""}`}
      style={{ background: colors[0], color: colors[1] }}
      aria-hidden="true"
    >
      {pair.mark}
    </span>
  );
}

function ChangeValue({ value, suffix = "", className = "" }) {
  const positive = (value || 0) >= 0;
  return (
    <span className={`${positive ? "price-up" : "price-down"} ${className}`}>
      {positive ? "+" : ""}{formatNumber(value)}{suffix}
    </span>
  );
}

export default function App() {
  const [account, setAccount] = useState(loadAccount);
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [quotes, setQuotes] = useState({});
  const [chartData, setChartData] = useState([]);
  const [timeframeId, setTimeframeId] = useState("1h");
  const [dataStatus, setDataStatus] = useState("loading");
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketOpen, setMarketOpen] = useState(true);
  const [partialErrors, setPartialErrors] = useState([]);
  const [direction, setDirection] = useState("buy");
  const [marginInput, setMarginInput] = useState("1000");
  const [leverage, setLeverage] = useState(10);
  const [activeTab, setActiveTab] = useState("positions");
  const [toast, setToast] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const pair = PAIRS.find((item) => item.id === selectedPair) || PAIRS[0];
  const quote = quotes[selectedPair];
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId) || TIMEFRAMES[1];
  const level = getLevel(account.xp);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  }, [account]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    async function loadMarket() {
      setIsSyncing(true);
      try {
        const response = await fetch(`/api/market?chart=${encodeURIComponent(selectedPair)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "行情连接失败");
        if (disposed) return;

        const nextQuotes = {};
        payload.quotes.forEach((item) => { nextQuotes[item.id] = item; });
        setQuotes((previous) => ({ ...previous, ...nextQuotes }));
        setChartData(payload.chart?.pair === selectedPair ? payload.chart.points || [] : []);
        setMarketOpen(payload.marketOpen);
        setPartialErrors(payload.errors || []);
        setLastUpdated(Math.max(...payload.quotes.map((item) => item.timestamp || 0)));
        setDataStatus("live");
      } catch (error) {
        if (error.name !== "AbortError" && !disposed) setDataStatus("error");
      } finally {
        if (!disposed) setIsSyncing(false);
      }
    }

    loadMarket();
    const timer = window.setInterval(loadMarket, 10000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selectedPair, refreshIndex]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const daily = account.daily;
    const completed = MISSIONS.find(
      (mission) => missionProgress(daily, mission.id) >= mission.target && !daily.claimed?.includes(mission.id),
    );
    if (!completed) return;

    setAccount((previous) => {
      const current = withToday(previous);
      if (current.daily.claimed.includes(completed.id)) return current;
      return {
        ...current,
        xp: current.xp + completed.reward,
        daily: { ...current.daily, claimed: [...current.daily.claimed, completed.id] },
      };
    });
    setToast({ type: "reward", title: "挑战完成", message: `${completed.title} · +${completed.reward} XP` });
  }, [account.daily]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setGuideOpen(false);
        setResetOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const positionMetrics = useMemo(() => account.positions.map((position) => {
    const positionPair = PAIRS.find((item) => item.id === position.pair);
    const positionQuote = quotes[position.pair];
    const currentPrice = positionQuote
      ? position.direction === "buy" ? positionQuote.bid : positionQuote.ask
      : null;
    const pnl = currentPrice ? calculatePnl(position, currentPrice, quotes) : null;
    return { position, pair: positionPair, quote: positionQuote, currentPrice, pnl };
  }), [account.positions, quotes]);

  const usedMargin = account.positions.reduce((total, position) => total + position.margin, 0);
  const unrealized = positionMetrics.reduce((total, item) => total + (item.pnl || 0), 0);
  const equity = account.balance + unrealized;
  const available = account.balance - usedMargin;
  const todayRealized = account.activities
    .filter((item) => item.type === "close" && todayKey(new Date(item.time)) === todayKey())
    .reduce((total, item) => total + (item.realized || 0), 0);

  const margin = Number(marginInput) || 0;
  const notional = margin * leverage;
  const openFee = calculateFee(margin, leverage);
  const executionPrice = direction === "buy" ? quote?.ask : quote?.bid;

  let orderError = "";
  if (!quote) orderError = "等待真实行情";
  else if (quote.stale || dataStatus === "error") orderError = "行情中断，暂不能开仓";
  else if (!marketOpen) orderError = "市场休市";
  else if (margin < 10) orderError = "最低 10 NFX";
  else if (margin + openFee > available) orderError = "超过可用资金";

  function selectPair(id) {
    if (id !== selectedPair) {
      setSelectedPair(id);
      setChartData([]);
    }
    setAccount((previous) => {
      const current = withToday(previous);
      if (current.daily.explored.includes(id)) return current;
      return {
        ...current,
        daily: { ...current.daily, explored: [...current.daily.explored, id] },
      };
    });
  }

  function openPosition() {
    if (orderError) {
      setToast({ type: "error", title: "暂时无法下单", message: orderError });
      return;
    }

    const price = direction === "buy" ? quote.ask : quote.bid;
    let units;
    try {
      units = calculateUnits(selectedPair, notional, price);
    } catch (error) {
      setToast({ type: "error", title: "订单计算失败", message: error.message });
      return;
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const position = {
      id,
      pair: selectedPair,
      direction,
      margin,
      leverage,
      notional,
      units,
      entryPrice: price,
      openFee,
      openedAt: Date.now(),
    };
    const activity = {
      id: `${id}-open`,
      type: "open",
      pair: selectedPair,
      direction,
      margin,
      notional,
      price,
      fee: openFee,
      time: Date.now(),
    };

    setAccount((previous) => {
      const current = withToday(previous);
      return {
        ...current,
        balance: roundMoney(current.balance - openFee),
        positions: [position, ...current.positions],
        activities: [activity, ...current.activities].slice(0, 100),
        xp: current.xp + 10,
        totalOpened: current.totalOpened + 1,
        daily: { ...current.daily, opens: current.daily.opens + 1 },
      };
    });
    setActiveTab("positions");
    setToast({
      type: "success",
      title: "订单已成交",
      message: `${direction === "buy" ? "买入" : "卖出"} ${selectedPair} · ${formatPrice(price, pair)} · +10 XP`,
    });
  }

  function closePosition(position) {
    const currentQuote = quotes[position.pair];
    const positionPair = PAIRS.find((item) => item.id === position.pair);
    if (!currentQuote || currentQuote.stale || dataStatus === "error") {
      setToast({ type: "error", title: "暂时无法平仓", message: "等待真实行情恢复后再试。" });
      return;
    }
    if (!marketOpen) {
      setToast({ type: "error", title: "市场当前休市", message: "请在交易市场开放后平仓。" });
      return;
    }

    const price = position.direction === "buy" ? currentQuote.bid : currentQuote.ask;
    const grossPnl = calculatePnl(position, price, quotes);
    if (!Number.isFinite(grossPnl)) {
      setToast({ type: "error", title: "暂时无法结算", message: "缺少盈亏折算所需的货币对行情。" });
      return;
    }
    const closeFee = calculateFee(position.margin, position.leverage);
    const realized = grossPnl - closeFee;
    const activity = {
      id: `${position.id}-close`,
      type: "close",
      pair: position.pair,
      direction: position.direction,
      margin: position.margin,
      notional: position.notional,
      price,
      grossPnl,
      fee: closeFee,
      realized,
      time: Date.now(),
    };

    setAccount((previous) => {
      const current = withToday(previous);
      return {
        ...current,
        balance: roundMoney(current.balance + realized),
        positions: current.positions.filter((item) => item.id !== position.id),
        activities: [activity, ...current.activities].slice(0, 100),
        xp: current.xp + 20,
        totalClosed: current.totalClosed + 1,
        daily: { ...current.daily, closes: current.daily.closes + 1 },
      };
    });
    setToast({
      type: realized >= 0 ? "success" : "info",
      title: "平仓已结算",
      message: `${position.pair} · 已实现 ${formatNfx(realized, true)} · +20 XP`,
    });
    if (!positionPair) return;
  }

  function resetAccount() {
    setAccount(createDefaultAccount());
    setResetOpen(false);
    setMarginInput("1000");
    setLeverage(10);
    setDirection("buy");
    setToast({ type: "success", title: "训练账户已重置", message: "虚拟资金已恢复为 100,000 NFX。" });
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => scrollToSection("chart-panel")} aria-label="NovaFX 首页">
            <span className="brand-symbol"><BarChart3 size={21} strokeWidth={2.4} /></span>
            <span className="brand-name">Nova<span>FX</span></span>
            <span className="brand-badge">SIMULATOR</span>
          </button>

          <div className="market-session">
            <span className={`session-dot ${marketOpen ? "is-open" : ""}`} />
            <span>{marketOpen ? "全球市场开放" : "周末市场休市"}</span>
            <span className="session-divider" />
            <span className="session-time">24H / 5D</span>
          </div>

          <div className="header-actions">
            <div className="header-equity">
              <span>账户净值</span>
              <strong>{formatNfx(equity)}</strong>
            </div>
            <div className="level-pill" title={`${level.current} / ${level.target} XP`}>
              <span><Trophy size={14} /> Lv.{level.level}</span>
              <i><b style={{ width: `${level.progress}%` }} /></i>
            </div>
            <button className="icon-button" onClick={() => setGuideOpen(true)} title="新手指南" aria-label="新手指南">
              <CircleHelp size={19} />
            </button>
            <button className="icon-button desktop-action" onClick={() => setResetOpen(true)} title="重置训练账户" aria-label="重置训练账户">
              <RotateCcw size={18} />
            </button>
            <div className="avatar">N</div>
          </div>
        </div>
      </header>

      <div className="workspace">
        {dataStatus === "error" && (
          <div className="data-banner" role="alert">
            <AlertTriangle size={17} />
            <span>真实行情连接中断，当前保留最后成功数据，新开仓已暂停。</span>
            <button onClick={() => setRefreshIndex((value) => value + 1)}>重新连接</button>
          </div>
        )}
        {partialErrors.length > 0 && dataStatus === "live" && (
          <div className="data-banner data-banner-subtle" role="status">
            <AlertTriangle size={16} />
            <span>{partialErrors.length} 个货币对暂未更新，其余行情正常。</span>
          </div>
        )}

        <div className="terminal-grid">
          <aside className="panel market-panel" id="market-panel">
            <div className="panel-heading market-heading">
              <div>
                <span className="eyebrow">WATCHLIST</span>
                <h2>市场行情</h2>
              </div>
              <button
                className={`icon-button small ${isSyncing ? "is-syncing" : ""}`}
                onClick={() => setRefreshIndex((value) => value + 1)}
                aria-label="刷新行情"
                title="刷新行情"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            <div className="market-labels"><span>货币对</span><span>最新价 / 日涨跌</span></div>
            <div className="watchlist">
              {PAIRS.map((item) => {
                const itemQuote = quotes[item.id];
                const active = selectedPair === item.id;
                const rising = (itemQuote?.change || 0) >= 0;
                return (
                  <button
                    className={`watch-item ${active ? "active" : ""}`}
                    key={item.id}
                    onClick={() => selectPair(item.id)}
                  >
                    <span className="watch-main">
                      <PairMark pair={item} small />
                      <span><strong>{item.id}</strong><small>{item.name}</small></span>
                    </span>
                    <span className="watch-price">
                      <strong>{formatPrice(itemQuote?.mid, item)}</strong>
                      <small className={rising ? "price-up" : "price-down"}>
                        {rising ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {formatNumber(Math.abs(itemQuote?.changePercent || 0))}%
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="market-source-card">
              <div><ShieldCheck size={17} /><strong>真实行情，虚拟交易</strong></div>
              <p>数据源 Yahoo Finance，分钟级参考报价。页面每 10 秒同步，可能存在延迟。</p>
              <span>最近报价 {formatClock(lastUpdated)}</span>
            </div>
          </aside>

          <main className="center-column">
            <section className="panel chart-panel" id="chart-panel">
              <div className="chart-header">
                <div className="instrument-title">
                  <PairMark pair={pair} />
                  <div>
                    <div className="instrument-code"><h1>{pair.id}</h1><span>主要货币对</span></div>
                    <p>{pair.name} · 现货参考汇率</p>
                  </div>
                </div>
                <div className="headline-price">
                  <strong>{formatPrice(quote?.mid, pair)}</strong>
                  <div>
                    <ChangeValue value={quote?.change || 0} />
                    <ChangeValue value={quote?.changePercent || 0} suffix="%" />
                  </div>
                </div>
              </div>

              <div className="chart-toolbar">
                <div className="timeframes">
                  {TIMEFRAMES.map((item) => (
                    <button
                      key={item.id}
                      className={timeframeId === item.id ? "active" : ""}
                      onClick={() => setTimeframeId(item.id)}
                    >{item.label}</button>
                  ))}
                </div>
                <div className="live-quote-status">
                  <span className={`live-dot ${dataStatus === "live" ? "active" : ""}`} />
                  {dataStatus === "live" ? "行情已连接" : dataStatus === "loading" ? "连接中" : "连接异常"}
                </div>
              </div>

              <PriceChart
                data={chartData}
                pair={pair}
                quote={quote}
                timeframe={timeframe}
                loading={dataStatus === "loading"}
              />

              <div className="chart-stats">
                <div><span>日内最高</span><strong>{formatPrice(quote?.dayHigh, pair)}</strong></div>
                <div><span>日内最低</span><strong>{formatPrice(quote?.dayLow, pair)}</strong></div>
                <div><span>模拟点差</span><strong>{formatPrice(pair.spread, pair)}</strong></div>
                <div><span>报价时间</span><strong>{formatClock(quote?.timestamp)}</strong></div>
              </div>
            </section>

            <section className="account-grid" aria-label="虚拟账户概览">
              <div className="account-card featured">
                <span className="account-icon"><Wallet size={18} /></span>
                <div><span>账户净值</span><strong>{formatNfx(equity)}</strong><small>今日已实现 <ChangeValue value={todayRealized} suffix=" NFX" /></small></div>
              </div>
              <div className="account-card">
                <span className="account-icon"><Coins size={18} /></span>
                <div><span>可用资金</span><strong>{formatNfx(available)}</strong><small>可用于新开仓</small></div>
              </div>
              <div className="account-card">
                <span className="account-icon"><LockKeyhole size={18} /></span>
                <div><span>已用保证金</span><strong>{formatNfx(usedMargin)}</strong><small>{account.positions.length} 笔持仓占用</small></div>
              </div>
              <div className="account-card">
                <span className="account-icon"><Activity size={18} /></span>
                <div><span>浮动盈亏</span><strong className={unrealized >= 0 ? "price-up" : "price-down"}>{formatNfx(unrealized, true)}</strong><small>随真实行情变动</small></div>
              </div>
            </section>

            <section className="panel positions-panel" id="positions-panel">
              <div className="positions-header">
                <div className="tab-list" role="tablist">
                  <button className={activeTab === "positions" ? "active" : ""} onClick={() => setActiveTab("positions")}>
                    当前持仓 <span>{account.positions.length}</span>
                  </button>
                  <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>
                    交易记录 <span>{account.activities.length}</span>
                  </button>
                </div>
                <span className="settlement-note">盈亏按 NFX 计价</span>
              </div>

              {activeTab === "positions" ? (
                positionMetrics.length ? (
                  <div className="positions-table">
                    <div className="positions-head">
                      <span>货币对 / 方向</span><span>保证金 / 杠杆</span><span>开仓价</span><span>当前平仓价</span><span>浮动盈亏</span><span>操作</span>
                    </div>
                    {positionMetrics.map(({ position, pair: itemPair, currentPrice, pnl }) => (
                      <div className="position-row" key={position.id}>
                        <div className="position-pair">
                          <PairMark pair={itemPair} small />
                          <div><strong>{position.pair}</strong><span className={position.direction === "buy" ? "direction-tag buy" : "direction-tag sell"}>{position.direction === "buy" ? "买入 · 多" : "卖出 · 空"}</span></div>
                        </div>
                        <div className="position-cell" data-label="保证金 / 杠杆"><strong>{formatNumber(position.margin, 0)} NFX</strong><small>{position.leverage}× · {formatNumber(position.notional, 0)} 名义规模</small></div>
                        <div className="position-cell" data-label="开仓价"><strong>{formatPrice(position.entryPrice, itemPair)}</strong><small>{formatRecordTime(position.openedAt)}</small></div>
                        <div className="position-cell" data-label="当前平仓价"><strong>{formatPrice(currentPrice, itemPair)}</strong><small>{position.direction === "buy" ? "卖出平仓" : "买入平仓"}</small></div>
                        <div className={`position-pnl ${(pnl || 0) >= 0 ? "price-up" : "price-down"}`} data-label="浮动盈亏">
                          <strong>{formatNfx(pnl, true)}</strong>
                          <small>{position.margin ? `${(pnl || 0) >= 0 ? "+" : ""}${formatNumber(((pnl || 0) / position.margin) * 100)}%` : "--"}</small>
                        </div>
                        <button className="close-button" onClick={() => closePosition(position)}>平仓</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span><LineChart size={25} /></span>
                    <h3>还没有持仓</h3>
                    <p>选择货币对与方向，用虚拟资金完成第一笔交易。</p>
                    <button onClick={() => scrollToSection("order-panel")}>去下单 <ArrowRight size={15} /></button>
                  </div>
                )
              ) : account.activities.length ? (
                <div className="history-list">
                  <div className="history-head"><span>时间 / 类型</span><span>货币对</span><span>成交价格</span><span>手续费</span><span>已实现盈亏</span></div>
                  {account.activities.map((item) => {
                    const itemPair = PAIRS.find((entry) => entry.id === item.pair);
                    return (
                      <div className="history-row" key={item.id}>
                        <div><strong>{formatRecordTime(item.time)}</strong><span className={`record-type ${item.type}`}>{item.type === "open" ? "开仓" : "平仓"}</span></div>
                        <div><strong>{item.pair}</strong><small>{item.direction === "buy" ? "买入 · 多" : "卖出 · 空"}</small></div>
                        <strong>{formatPrice(item.price, itemPair)}</strong>
                        <span>{formatNfx(item.fee)}</span>
                        <strong className={item.type === "close" ? (item.realized >= 0 ? "price-up" : "price-down") : "muted"}>
                          {item.type === "close" ? formatNfx(item.realized, true) : "待平仓"}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state compact">
                  <span><History size={24} /></span>
                  <h3>暂无交易记录</h3>
                  <p>开仓与平仓成交后会自动记录在这里。</p>
                </div>
              )}
            </section>
          </main>

          <aside className="right-column">
            <section className="panel order-panel" id="order-panel">
              <div className="panel-heading order-heading">
                <div><span className="eyebrow">PAPER TRADE</span><h2>模拟下单</h2></div>
                <span className="order-type">市价单</span>
              </div>

              <div className="selected-instrument">
                <span><PairMark pair={pair} small />{pair.id}</span>
                <button onClick={() => scrollToSection("market-panel")}>切换 <ChevronRight size={13} /></button>
              </div>

              <div className="quote-ticket">
                <button className={`sell-quote ${direction === "sell" ? "active" : ""}`} onClick={() => setDirection("sell")}>
                  <span>卖出 / 做空</span>
                  <strong>{formatPrice(quote?.bid, pair)}</strong>
                  <small>看跌报价</small>
                </button>
                <div className="spread-divider"><span>点差</span><i /></div>
                <button className={`buy-quote ${direction === "buy" ? "active" : ""}`} onClick={() => setDirection("buy")}>
                  <span>买入 / 做多</span>
                  <strong>{formatPrice(quote?.ask, pair)}</strong>
                  <small>看涨报价</small>
                </button>
              </div>

              <div className="field-block">
                <div className="field-label"><label htmlFor="margin-input">投入保证金</label><span>可用 {formatNumber(available)} NFX</span></div>
                <div className="amount-input">
                  <input
                    id="margin-input"
                    type="number"
                    min="10"
                    step="10"
                    value={marginInput}
                    onChange={(event) => setMarginInput(event.target.value)}
                    inputMode="decimal"
                  />
                  <span>NFX</span>
                </div>
                <div className="quick-amounts">
                  {[100, 500, 1000, 5000].map((amount) => (
                    <button key={amount} className={margin === amount ? "active" : ""} onClick={() => setMarginInput(String(amount))}>{amount >= 1000 ? `${amount / 1000}k` : amount}</button>
                  ))}
                  <button onClick={() => setMarginInput(String(Math.floor(getMaxMargin(Math.max(0, available), leverage) / 2)))}>50%</button>
                </div>
              </div>

              <div className="field-block leverage-block">
                <div className="field-label"><span>杠杆倍数</span><small>放大规模，也放大波动</small></div>
                <div className="leverage-options">
                  {LEVERAGES.map((value) => (
                    <button key={value} className={leverage === value ? "active" : ""} onClick={() => setLeverage(value)}>{value}×</button>
                  ))}
                </div>
              </div>

              <div className="order-summary">
                <div><span>预计成交价</span><strong>{formatPrice(executionPrice, pair)}</strong></div>
                <div><span>名义交易规模</span><strong>{formatNfx(notional)}</strong></div>
                <div><span>开仓手续费（0.02%）</span><strong>{formatNfx(openFee)}</strong></div>
                <div className="summary-total"><span>本次占用</span><strong>{formatNfx(margin + openFee)}</strong></div>
              </div>

              {orderError && margin > 0 && <div className="order-error"><AlertTriangle size={14} />{orderError}</div>}
              <button className={`submit-order ${direction}`} onClick={openPosition} disabled={Boolean(orderError)}>
                {isSyncing && !quote ? <LoaderCircle className="spin" size={18} /> : <Zap size={18} />}
                {orderError || `${direction === "buy" ? "买入" : "卖出"} ${pair.id}`}
              </button>
              <p className="order-disclaimer"><ShieldCheck size={13} />仅使用虚拟代币，不涉及真实资金或真实订单。</p>
            </section>

            <section className="panel challenge-panel" id="challenge-panel">
              <div className="challenge-top">
                <div className="challenge-level"><span><Gamepad2 size={20} /></span><div><small>交易员等级</small><strong>Lv.{level.level} · {level.level >= 5 ? "市场大师" : level.level >= 3 ? "策略探索者" : "新秀交易员"}</strong></div></div>
                <span className="xp-total">{account.xp} XP</span>
              </div>
              <div className="level-progress"><i style={{ width: `${level.progress}%` }} /></div>
              <div className="level-caption"><span>当前 {level.current} XP</span><span>再获 {level.target - level.current} XP 升级</span></div>

              <div className="challenge-title"><span><Target size={16} />今日挑战</span><small>每日 00:00 重置</small></div>
              <div className="mission-list">
                {MISSIONS.map((mission) => {
                  const progress = Math.min(missionProgress(account.daily, mission.id), mission.target);
                  const complete = progress >= mission.target;
                  return (
                    <div className={`mission ${complete ? "complete" : ""}`} key={mission.id}>
                      <span className="mission-icon">{complete ? <Check size={16} /> : mission.id === "explore" ? <Compass size={16} /> : mission.id === "open" ? <Zap size={16} /> : <Trophy size={16} />}</span>
                      <div><strong>{mission.title}</strong><small>{mission.description}</small><i><b style={{ width: `${(progress / mission.target) * 100}%` }} /></i></div>
                      <span className="mission-reward">{complete ? "已领取" : `+${mission.reward} XP`}<small>{progress}/{mission.target}</small></span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="training-note">
              <span><Sparkles size={16} /></span>
              <div><strong>练习，而不是冒险</strong><p>1 NFX 按 1 USD 模拟计价。盈亏仅用于学习与游戏进度。</p></div>
              <button className="training-reset" onClick={() => setResetOpen(true)}>重置账户</button>
            </div>
          </aside>
        </div>

        <footer className="app-footer">
          <span>NovaFX Simulator · 真实市场参考数据，虚拟交易体验</span>
          <span>行情可能存在延迟，模拟结果不代表真实交易表现，不构成投资建议。</span>
        </footer>
      </div>

      <nav className="mobile-nav" aria-label="移动端快捷导航">
        <button onClick={() => scrollToSection("market-panel")}><Compass size={19} /><span>行情</span></button>
        <button onClick={() => scrollToSection("chart-panel")}><LineChart size={19} /><span>图表</span></button>
        <button className="mobile-trade" onClick={() => scrollToSection("order-panel")}><Zap size={20} /><span>交易</span></button>
        <button onClick={() => { setActiveTab("positions"); scrollToSection("positions-panel"); }}><Wallet size={19} /><span>持仓</span></button>
        <button onClick={() => setGuideOpen(true)}><BookOpen size={19} /><span>指南</span></button>
      </nav>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <span className="toast-icon">{toast.type === "error" ? <AlertTriangle size={19} /> : toast.type === "reward" ? <Trophy size={19} /> : <Check size={19} />}</span>
          <div><strong>{toast.title}</strong><p>{toast.message}</p></div>
          <button onClick={() => setToast(null)} aria-label="关闭提示"><X size={16} /></button>
        </div>
      )}

      {guideOpen && (
        <div className="modal-backdrop" onMouseDown={() => setGuideOpen(false)}>
          <section className="modal guide-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <button className="modal-close" onClick={() => setGuideOpen(false)} aria-label="关闭指南"><X size={19} /></button>
            <span className="modal-hero"><Gamepad2 size={27} /></span>
            <span className="eyebrow">QUICK START</span>
            <h2 id="guide-title">三分钟了解模拟交易</h2>
            <p className="modal-intro">真实行情与虚拟资金结合，用游戏化方式熟悉汇率波动。</p>
            <div className="guide-steps">
              <div><span>01</span><div><strong>选择货币对与方向</strong><p>买入（做多）表示关注上涨空间；卖出（做空）表示关注下跌空间。买入按卖价成交，卖出按买价成交。</p></div></div>
              <div><span>02</span><div><strong>设置保证金与杠杆</strong><p>1 NFX 按 1 USD 模拟计价。杠杆同时放大名义规模和盈亏波动，不代表建议使用的真实杠杆。</p></div></div>
              <div><span>03</span><div><strong>跟踪持仓并平仓</strong><p>多头按买入价开、卖出价平，空头相反。非美元报价货币的盈亏按最新汇率折算为 NFX。</p></div></div>
            </div>
            <div className="guide-rule"><Coins size={18} /><span>开仓与平仓各收取一次模拟手续费：名义规模 × 0.02%。所有行情均保留数据源与报价时间。</span></div>
            <button className="modal-primary" onClick={() => setGuideOpen(false)}>开始训练 <ArrowRight size={16} /></button>
          </section>
        </div>
      )}

      {resetOpen && (
        <div className="modal-backdrop" onMouseDown={() => setResetOpen(false)}>
          <section className="modal reset-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <button className="modal-close" onClick={() => setResetOpen(false)} aria-label="关闭重置窗口"><X size={19} /></button>
            <span className="modal-hero reset"><RotateCcw size={24} /></span>
            <h2 id="reset-title">重置训练账户？</h2>
            <p className="modal-intro">这会清除本机保存的全部持仓、交易记录、等级和每日任务进度，并恢复 100,000 NFX 初始资金。</p>
            <div className="reset-actions"><button onClick={() => setResetOpen(false)}>保留账户</button><button onClick={resetAccount}>确认重置</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
