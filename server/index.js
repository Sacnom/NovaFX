import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAIRS } from "../src/data.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const cache = new Map();
const CACHE_TTL = 8000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isFxMarketOpen(date = new Date()) {
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 22) return false;
  if (day === 0 && hour < 22) return false;
  return true;
}

async function fetchPair(pair) {
  const cached = cache.get(pair.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair.yahoo)}?interval=1m&range=1d&includePrePost=true`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NovaFX-Demo/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`上游行情返回 ${response.status}`);
    const payload = await response.json();
    if (payload.chart?.error) throw new Error(payload.chart.error.description || "上游行情错误");
    const result = payload.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) throw new Error("行情响应缺少最新价格");

    const meta = result.meta;
    const rawTimes = result.timestamp || [];
    const rawCloses = result.indicators?.quote?.[0]?.close || [];
    const points = rawTimes
      .map((time, index) => ({ time: time * 1000, price: rawCloses[index] }))
      .filter((point) => Number.isFinite(point.price))
      .slice(-720);

    const marketTime = meta.regularMarketTime * 1000;
    if (marketTime && (!points.length || points.at(-1).time < marketTime - 30000)) {
      points.push({ time: marketTime, price: meta.regularMarketPrice });
    }

    const mid = meta.regularMarketPrice;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? points[0]?.price ?? mid;
    const change = mid - previousClose;
    const prices = points.map((point) => point.price);
    const data = {
      id: pair.id,
      mid,
      bid: mid - pair.spread / 2,
      ask: mid + pair.spread / 2,
      previousClose,
      change,
      changePercent: previousClose ? (change / previousClose) * 100 : 0,
      dayHigh: prices.length ? Math.max(...prices) : mid,
      dayLow: prices.length ? Math.min(...prices) : mid,
      timestamp: marketTime || Date.now(),
      source: "Yahoo Finance",
      stale: false,
      points,
    };
    cache.set(pair.id, { data, fetchedAt: Date.now() });
    return data;
  } catch (error) {
    if (cached) return { ...cached.data, stale: true };
    throw error;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, marketOpen: isFxMarketOpen(), time: new Date().toISOString() });
});

app.get("/api/market", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const chartPair = PAIRS.find((pair) => pair.id === req.query.chart) || PAIRS[0];
  const results = await Promise.allSettled(PAIRS.map(fetchPair));
  const quotes = [];
  const errors = [];
  let chart = null;

  results.forEach((result, index) => {
    const pair = PAIRS[index];
    if (result.status === "fulfilled") {
      const { points, ...quote } = result.value;
      quotes.push(quote);
      if (pair.id === chartPair.id) {
        chart = { pair: pair.id, points, timestamp: result.value.timestamp, stale: result.value.stale };
      }
    } else {
      errors.push({ pair: pair.id, message: result.reason?.message || "行情暂不可用" });
    }
  });

  if (!quotes.length) {
    res.status(503).json({ message: "真实行情暂时无法连接，请稍后重试。", errors });
    return;
  }

  res.json({
    source: "Yahoo Finance",
    receivedAt: Date.now(),
    marketOpen: isFxMarketOpen(),
    quotes,
    chart,
    errors,
  });
});

const distPath = path.resolve(__dirname, "../dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`NovaFX market server listening on http://localhost:${port}`);
});
