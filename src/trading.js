export const FEE_RATE = 0.0002;
export const INITIAL_BALANCE = 100000;
export const XP_PER_LEVEL = 250;

export function calculateFee(margin, leverage) {
  return margin * leverage * FEE_RATE;
}

export function calculateUnits(pair, notional, entryPrice) {
  const [base, quote] = pair.split("/");
  const baseInUsd = base === "USD" ? 1 : quote === "USD" ? entryPrice : Number.NaN;
  if (!Number.isFinite(baseInUsd) || baseInUsd <= 0 || notional <= 0) {
    throw new Error("无法计算该货币对的持仓单位");
  }
  return notional / baseInUsd;
}

export function getQuoteConversionRate(currency, quotes) {
  if (currency === "USD") return 1;
  const inversePair = quotes[`USD/${currency}`]?.mid;
  if (inversePair > 0) return 1 / inversePair;
  const directPair = quotes[`${currency}/USD`]?.mid;
  if (directPair > 0) return directPair;
  return null;
}

export function calculatePnl(position, closePrice, quotes) {
  if (!(closePrice > 0) || !(position.units > 0)) return null;
  const conversionRate = getQuoteConversionRate(position.pair.split("/")[1], quotes);
  if (!(conversionRate > 0)) return null;
  const direction = position.direction === "buy" ? 1 : -1;
  return (closePrice - position.entryPrice) * position.units * direction * conversionRate;
}

export function getLevel(xp) {
  const safeXp = Math.max(0, xp || 0);
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  return {
    level,
    current: safeXp % XP_PER_LEVEL,
    target: XP_PER_LEVEL,
    progress: ((safeXp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100,
  };
}

export function getMaxMargin(available, leverage) {
  return Math.max(0, available / (1 + leverage * FEE_RATE));
}

export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
