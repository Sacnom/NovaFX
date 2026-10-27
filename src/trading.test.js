import test from "node:test";
import assert from "node:assert/strict";
import { calculateFee, calculatePnl, calculateUnits, getLevel, getMaxMargin } from "./trading.js";

test("美元报价货币对的持仓单位和多头盈亏", () => {
  const units = calculateUnits("EUR/USD", 10000, 1.1);
  const pnl = calculatePnl({ pair: "EUR/USD", direction: "buy", units, entryPrice: 1.1 }, 1.11, {});
  assert.ok(Math.abs(units - 9090.9090909) < 0.0001);
  assert.ok(Math.abs(pnl - 90.9090909) < 0.0001);
});

test("美元基础货币对的空头盈亏按日元折算", () => {
  const units = calculateUnits("USD/JPY", 10000, 150);
  const pnl = calculatePnl(
    { pair: "USD/JPY", direction: "sell", units, entryPrice: 150 },
    149,
    { "USD/JPY": { mid: 149 } },
  );
  assert.equal(units, 10000);
  assert.ok(Math.abs(pnl - 67.11409396) < 0.0001);
});

test("手续费、最大保证金和等级计算", () => {
  assert.equal(calculateFee(1000, 10), 2);
  assert.ok(Math.abs(getMaxMargin(1002, 10) - 1000) < 0.0001);
  assert.equal(getLevel(0).level, 1);
  assert.equal(getLevel(250).level, 2);
});
