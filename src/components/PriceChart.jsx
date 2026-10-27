import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LoaderCircle } from "lucide-react";

function formatTime(time, withDate = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    ...(withDate ? { month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(time));
}

function ChartTooltip({ active, payload, decimals }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span>{formatTime(point.time, true)}</span>
      <strong>{Number(point.price).toFixed(decimals)}</strong>
    </div>
  );
}

export default function PriceChart({ data, pair, quote, timeframe, loading }) {
  const visibleData = useMemo(() => {
    if (!data.length) return [];
    if (timeframe.minutes >= 1440) return data;
    const latest = data.at(-1).time;
    const cutoff = latest - timeframe.minutes * 60 * 1000;
    const filtered = data.filter((point) => point.time >= cutoff);
    return filtered.length > 1 ? filtered : data.slice(-2);
  }, [data, timeframe]);

  const rising = (quote?.change ?? 0) >= 0;
  const color = rising ? "#e25353" : "#149873";
  const gradientId = `price-gradient-${pair.base}-${pair.quote}`;

  if (loading && !data.length) {
    return (
      <div className="chart-state">
        <LoaderCircle className="spin" size={24} />
        <span>正在连接真实市场行情</span>
      </div>
    );
  }

  if (!visibleData.length) {
    return (
      <div className="chart-state chart-state-error">
        <strong>暂无可展示的日内行情</strong>
        <span>请稍后刷新，应用不会使用模拟价格补齐图表。</span>
      </div>
    );
  }

  const prices = visibleData.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = Math.max((max - min) * 0.12, pair.id.includes("JPY") ? 0.01 : 0.0001);

  return (
    <div className="price-chart" aria-label={`${pair.id} 真实日内价格走势图`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={visibleData} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="90%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eceef4" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(time) => formatTime(time)}
            tick={{ fill: "#969bab", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={52}
            dy={8}
          />
          <YAxis
            domain={[min - padding, max + padding]}
            tickFormatter={(price) => Number(price).toFixed(pair.decimals)}
            tick={{ fill: "#969bab", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            orientation="right"
            width={68}
            tickCount={5}
          />
          <Tooltip content={<ChartTooltip decimals={pair.decimals} />} cursor={{ stroke: "#c8ccd8", strokeDasharray: "4 4" }} />
          {quote?.previousClose > 0 && (
            <ReferenceLine y={quote.previousClose} stroke="#b7bdca" strokeDasharray="4 5" />
          )}
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 4, fill: color, stroke: "#ffffff", strokeWidth: 2 }}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
