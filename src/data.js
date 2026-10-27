export const PAIRS = [
  { id: "EUR/USD", yahoo: "EURUSD=X", base: "EUR", quote: "USD", name: "欧元 / 美元", mark: "EU", decimals: 5, spread: 0.00016 },
  { id: "GBP/USD", yahoo: "GBPUSD=X", base: "GBP", quote: "USD", name: "英镑 / 美元", mark: "GU", decimals: 5, spread: 0.00022 },
  { id: "USD/JPY", yahoo: "USDJPY=X", base: "USD", quote: "JPY", name: "美元 / 日元", mark: "UJ", decimals: 3, spread: 0.018 },
  { id: "AUD/USD", yahoo: "AUDUSD=X", base: "AUD", quote: "USD", name: "澳元 / 美元", mark: "AU", decimals: 5, spread: 0.0002 },
  { id: "USD/CAD", yahoo: "USDCAD=X", base: "USD", quote: "CAD", name: "美元 / 加元", mark: "UC", decimals: 5, spread: 0.00024 },
  { id: "USD/CHF", yahoo: "USDCHF=X", base: "USD", quote: "CHF", name: "美元 / 瑞郎", mark: "UF", decimals: 5, spread: 0.00024 },
  { id: "NZD/USD", yahoo: "NZDUSD=X", base: "NZD", quote: "USD", name: "纽元 / 美元", mark: "NU", decimals: 5, spread: 0.00026 },
];

export const TIMEFRAMES = [
  { id: "15m", label: "15分", minutes: 15 },
  { id: "1h", label: "1时", minutes: 60 },
  { id: "4h", label: "4时", minutes: 240 },
  { id: "1d", label: "1日", minutes: 1440 },
];

export const LEVERAGES = [1, 5, 10, 20];
