// Prediction Parser — Turn natural language predictions into structured market params
//
// "BTC will hit $110k by March 1" → structured market question
// "Lakers will beat Celtics in Game 7" → structured market question
// "NVDA will be above $800 by end of Q1" → structured market question

import { CONFIG, type Category, type Call } from "../config.ts";
import { randomUUID } from "crypto";

// Price target patterns
const PRICE_PATTERNS = [
  // "$110k", "$110,000", "$110000", "$4000"
  /\$(\d+(?:,\d{3})*(?:\.\d+)?[kKmMbB]?)\b/,
  // "110k dollars", "110000 USD"
  /(\d+(?:,\d{3})*(?:\.\d+)?[kKmMbB]?)\s*(?:dollars?|USD|usd)/i,
];

// Direction patterns
const UP_PATTERNS = [
  /will\s+(?:hit|reach|exceed|surpass|break|top|go\s+(?:above|over|past))/i,
  /(?:above|over|higher\s+than|more\s+than|at\s+least)\s+\$/i,
  /(?:pump|moon|surge|rally|spike|soar|climb)/i,
  /(?:bullish|long|buy|call)/i,
];

const DOWN_PATTERNS = [
  /will\s+(?:drop|fall|crash|dump|tank|dip|decline)\s+(?:to|below|under)/i,
  /(?:below|under|less\s+than|lower\s+than|at\s+most)\s+\$/i,
  /(?:dump|crash|tank|collapse|plunge|crater)/i,
  /(?:bearish|short|sell|put)/i,
];

// Date/time patterns
const DATE_PATTERNS = [
  // "by March 1", "by March 1st", "by March 1, 2026", "by April"
  /by\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s*,?\s*(\d{4}))?/i,
  // "end of Q1", "end of Q2 2026"
  /end\s+of\s+(Q[1-4])(?:\s+(\d{4}))?/i,
  // "next week", "next month"
  /next\s+(week|month|quarter|year)/i,
  // "in 7 days", "within 30 days"
  /(?:in|within)\s+(\d+)\s+(days?|weeks?|months?)/i,
  // "before April", "before 2026-04-01"
  /before\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s*,?\s*(\d{4}))?/i,
  // "this week", "this month"
  /this\s+(week|month|quarter)/i,
];

// Asset/ticker patterns
// Map: alias → { ticker, name } for canonical display
interface AssetInfo { ticker: string; name: string }
const CRYPTO_TICKERS = new Map<string, AssetInfo>([
  ["btc", { ticker: "BTC", name: "Bitcoin" }], ["bitcoin", { ticker: "BTC", name: "Bitcoin" }],
  ["eth", { ticker: "ETH", name: "Ethereum" }], ["ethereum", { ticker: "ETH", name: "Ethereum" }],
  ["sol", { ticker: "SOL", name: "Solana" }], ["solana", { ticker: "SOL", name: "Solana" }],
  ["bnb", { ticker: "BNB", name: "BNB" }], ["xrp", { ticker: "XRP", name: "XRP" }],
  ["ada", { ticker: "ADA", name: "Cardano" }], ["doge", { ticker: "DOGE", name: "Dogecoin" }],
  ["dot", { ticker: "DOT", name: "Polkadot" }], ["avax", { ticker: "AVAX", name: "Avalanche" }],
  ["link", { ticker: "LINK", name: "Chainlink" }], ["matic", { ticker: "MATIC", name: "Polygon" }],
  ["uni", { ticker: "UNI", name: "Uniswap" }], ["atom", { ticker: "ATOM", name: "Cosmos" }],
  ["near", { ticker: "NEAR", name: "NEAR Protocol" }], ["arb", { ticker: "ARB", name: "Arbitrum" }],
  ["op", { ticker: "OP", name: "Optimism" }], ["sui", { ticker: "SUI", name: "Sui" }],
  ["apt", { ticker: "APT", name: "Aptos" }], ["sei", { ticker: "SEI", name: "Sei" }],
  ["jup", { ticker: "JUP", name: "Jupiter" }], ["jto", { ticker: "JTO", name: "Jito" }],
  ["bonk", { ticker: "BONK", name: "Bonk" }], ["wif", { ticker: "WIF", name: "dogwifhat" }],
  ["pepe", { ticker: "PEPE", name: "Pepe" }],
]);

const STOCK_TICKERS = new Map<string, AssetInfo>([
  ["nvda", { ticker: "NVDA", name: "NVIDIA" }], ["nvidia", { ticker: "NVDA", name: "NVIDIA" }],
  ["aapl", { ticker: "AAPL", name: "Apple" }], ["apple", { ticker: "AAPL", name: "Apple" }],
  ["msft", { ticker: "MSFT", name: "Microsoft" }], ["microsoft", { ticker: "MSFT", name: "Microsoft" }],
  ["googl", { ticker: "GOOGL", name: "Alphabet" }], ["goog", { ticker: "GOOGL", name: "Alphabet" }], ["google", { ticker: "GOOGL", name: "Alphabet" }],
  ["amzn", { ticker: "AMZN", name: "Amazon" }], ["amazon", { ticker: "AMZN", name: "Amazon" }],
  ["meta", { ticker: "META", name: "Meta" }], ["tsla", { ticker: "TSLA", name: "Tesla" }], ["tesla", { ticker: "TSLA", name: "Tesla" }],
]);

// Sports patterns
const SPORTS_PATTERNS = [
  /\b(Lakers|Celtics|Warriors|Bucks|76ers|Heat|Nuggets|Suns|Nets|Knicks|Clippers|Mavericks|Grizzlies|Cavaliers|Kings|Timberwolves|Thunder|Pelicans|Hawks|Bulls|Raptors|Pacers|Magic|Hornets|Pistons|Wizards|Spurs|Trail\s*Blazers|Jazz|Rockets)\b/i,
  /\b(Patriots|Chiefs|Eagles|49ers|Bills|Cowboys|Dolphins|Ravens|Bengals|Lions|Packers|Seahawks|Chargers|Jaguars|Texans|Vikings|Steelers|Broncos|Raiders|Commanders|Bears|Saints|Falcons|Browns|Rams|Jets|Panthers|Giants|Buccaneers|Colts|Titans|Cardinals)\b/i,
  /\b(Super\s*Bowl|NBA\s*Finals|World\s*Series|Stanley\s*Cup|Champions\s*League|World\s*Cup|Olympics)\b/i,
  /\bGame\s+[1-7]\b/i,
  /will\s+(?:beat|defeat|win\s+against|lose\s+to|dominate)/i,
];

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parsePrice(text: string): number | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let raw = match[1].replace(/,/g, "");
      const suffix = raw.slice(-1).toLowerCase();
      if (suffix === "k") return parseFloat(raw.slice(0, -1)) * 1_000;
      if (suffix === "m") return parseFloat(raw.slice(0, -1)) * 1_000_000;
      if (suffix === "b") return parseFloat(raw.slice(0, -1)) * 1_000_000_000;
      return parseFloat(raw);
    }
  }
  return null;
}

function parseDate(text: string): Date | null {
  const now = new Date();
  const year = now.getFullYear();

  // "by March 1" / "before April 15" / "by April" (no day → last day of month)
  for (const pattern of [DATE_PATTERNS[0], DATE_PATTERNS[4]]) {
    const match = text.match(pattern);
    if (match) {
      const month = MONTH_MAP[match[1].toLowerCase()];
      const yr = match[3] ? parseInt(match[3]) : year;
      const day = match[2] ? parseInt(match[2]) : new Date(yr, month + 1, 0).getDate(); // Last day of month if no day
      return new Date(yr, month, day);
    }
  }

  // "end of Q1"
  const qMatch = text.match(DATE_PATTERNS[1]);
  if (qMatch) {
    const quarter = parseInt(qMatch[1][1]);
    const yr = qMatch[2] ? parseInt(qMatch[2]) : year;
    const endMonth = quarter * 3;
    return new Date(yr, endMonth, 0); // Last day of quarter
  }

  // "next week/month"
  const nextMatch = text.match(DATE_PATTERNS[2]);
  if (nextMatch) {
    const d = new Date(now);
    switch (nextMatch[1].toLowerCase()) {
      case "week": d.setDate(d.getDate() + 7); break;
      case "month": d.setMonth(d.getMonth() + 1); break;
      case "quarter": d.setMonth(d.getMonth() + 3); break;
      case "year": d.setFullYear(d.getFullYear() + 1); break;
    }
    return d;
  }

  // "in 7 days"
  const inMatch = text.match(DATE_PATTERNS[3]);
  if (inMatch) {
    const num = parseInt(inMatch[1]);
    const d = new Date(now);
    switch (inMatch[2].toLowerCase().replace(/s$/, "")) {
      case "day": d.setDate(d.getDate() + num); break;
      case "week": d.setDate(d.getDate() + num * 7); break;
      case "month": d.setMonth(d.getMonth() + num); break;
    }
    return d;
  }

  // "this week/month"
  const thisMatch = text.match(DATE_PATTERNS[5]);
  if (thisMatch) {
    const d = new Date(now);
    switch (thisMatch[1].toLowerCase()) {
      case "week": {
        const dayOfWeek = d.getDay();
        d.setDate(d.getDate() + (7 - dayOfWeek)); // End of this week (Sunday)
        break;
      }
      case "month": {
        d.setMonth(d.getMonth() + 1, 0); // Last day of this month
        break;
      }
      case "quarter": {
        const q = Math.floor(d.getMonth() / 3) + 1;
        d.setMonth(q * 3, 0);
        break;
      }
    }
    return d;
  }

  // Default: 7 days from now if no date found
  return null;
}

function detectCategory(text: string): Category {
  const lower = text.toLowerCase();

  // Check crypto tickers (word boundary to avoid false matches)
  for (const [alias] of CRYPTO_TICKERS) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) return "crypto";
  }

  // Check stock tickers
  for (const [alias] of STOCK_TICKERS) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) return "economic";
  }

  // Check sports
  for (const pattern of SPORTS_PATTERNS) {
    if (pattern.test(text)) return "sports";
  }

  // Check keywords
  if (/\b(stream|netflix|disney|hulu|hbo|prime\s+video|spotify|youtube)\b/i.test(lower)) return "streaming";
  if (/\b(billboard|grammy|album|song|artist|spotify|chart)\b/i.test(lower)) return "music";
  if (/\b(weather|temperature|rain|snow|hurricane|forecast|celsius|fahrenheit)\b/i.test(lower)) return "weather";
  if (/\b(election|vote|poll|candidate|president|governor|senator|congress)\b/i.test(lower)) return "elections";
  if (/\b(github|npm|pypi|framework|library|language|stack\s*overflow|ai|ml|llm)\b/i.test(lower)) return "technology";
  if (/\b(gdp|inflation|interest\s+rate|fed|employment|stock|market\s+cap|revenue|earnings)\b/i.test(lower)) return "economic";

  return "crypto"; // Default for prediction markets
}

function detectAsset(text: string): { ticker: string; name: string } | null {
  const lower = text.toLowerCase();

  // Use word boundary matching to avoid false positives (e.g. "drop" matching "op")
  // Check longer aliases first to avoid partial matches
  const allEntries = [
    ...Array.from(STOCK_TICKERS.entries()),
    ...Array.from(CRYPTO_TICKERS.entries()),
  ].sort((a, b) => b[0].length - a[0].length); // Longest alias first

  for (const [alias, info] of allEntries) {
    const pattern = new RegExp(`\\b${alias}\\b`, "i");
    if (pattern.test(lower)) return { ticker: info.ticker, name: info.name };
  }

  return null;
}

function detectDirection(text: string): "UP" | "DOWN" | null {
  for (const p of UP_PATTERNS) {
    if (p.test(text)) return "UP";
  }
  for (const p of DOWN_PATTERNS) {
    if (p.test(text)) return "DOWN";
  }
  return null;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000_000) return `$${(price / 1_000_000_000).toFixed(1)}B`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${price.toLocaleString("en-US")}`;
  return `$${price.toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export interface ParsedPrediction {
  question: string;
  category: Category;
  marketType: "typeA" | "typeB";
  closingTime: Date;
  eventTime?: Date;
  measurementStart?: Date;
  measurementEnd?: Date;
  dataSource: string;
  dataSourceUrl: string;
  backupSource: string;
  betSide: "YES" | "NO";
  confidence: number; // 0-1 how confident the parser is
}

export function parsePrediction(text: string): ParsedPrediction {
  const category = detectCategory(text);
  const asset = detectAsset(text);
  const price = parsePrice(text);
  const targetDate = parseDate(text);
  const direction = detectDirection(text);

  const now = new Date();
  const defaultTarget = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const eventDate = targetDate || defaultTarget;

  // Determine closing time (Type A: 24h before event)
  const closingTime = new Date(eventDate.getTime() - CONFIG.DEFAULT_CLOSE_BUFFER_HOURS * 60 * 60 * 1000);

  // Build question
  let question: string;
  let confidence = 0.5;
  let betSide: "YES" | "NO" = "YES";

  const dsInfo = CONFIG.DATA_SOURCES[category] || CONFIG.DATA_SOURCES.crypto;
  let dataSource = dsInfo.name;
  let dataSourceUrl = dsInfo.url;

  if (asset && price !== null) {
    // Price prediction: "Will BTC exceed $110,000 by March 1, 2026?"
    const dir = direction || "UP";
    const verb = dir === "UP" ? "exceed" : "fall below";
    question = `Will ${asset.name} (${asset.ticker}) ${verb} ${formatPrice(price)} by ${formatDate(eventDate)}?`;
    betSide = dir === "UP" ? "YES" : "YES"; // Caller always bets YES on their prediction
    confidence = 0.8;

    // Check if this is a crypto asset (use the canonical ticker as alias key)
    const isCrypto = [...CRYPTO_TICKERS.values()].some(v => v.ticker === asset.ticker);
    if (isCrypto) {
      dataSource = "CoinGecko";
      dataSourceUrl = `https://www.coingecko.com/en/coins/${asset.name.toLowerCase().replace(/\s+/g, "-")}`;
    }
  } else if (asset && !price) {
    // Directional call without price: "ETH will pump next week"
    const dir = direction || "UP";
    const verb = dir === "UP" ? "increase" : "decrease";
    question = `Will ${asset.name} (${asset.ticker}) ${verb} in value by ${formatDate(eventDate)}?`;
    confidence = 0.6;
  } else if (SPORTS_PATTERNS.some(p => p.test(text))) {
    // Sports prediction — try to extract teams
    const teamMatch = text.match(/(\w+)\s+will\s+(?:beat|defeat|win\s+against)\s+(?:the\s+)?(\w+)/i);
    if (teamMatch) {
      question = `Will the ${teamMatch[1]} beat the ${teamMatch[2]} by ${formatDate(eventDate)}?`;
      confidence = 0.7;
    } else {
      question = cleanPredictionToQuestion(text, eventDate);
      confidence = 0.4;
    }
    dataSource = "ESPN";
    dataSourceUrl = "https://www.espn.com";
  } else {
    // Generic prediction — best effort
    question = cleanPredictionToQuestion(text, eventDate);
    confidence = 0.3;
  }

  // Determine timing type
  // Type A (event-based) for specific events
  // Type B (measurement) for period-based observations
  const isMeasurement = /\b(over|during|throughout|across|period|week|month|quarter)\b/i.test(text)
    && !/\bby\b/i.test(text);

  let marketType: "typeA" | "typeB";
  let measurementStart: Date | undefined;
  let measurementEnd: Date | undefined;

  if (isMeasurement) {
    marketType = "typeB";
    measurementStart = new Date(closingTime.getTime() + 60 * 60 * 1000); // 1h after close
    measurementEnd = eventDate;
  } else {
    marketType = "typeA";
  }

  return {
    question,
    category,
    marketType,
    closingTime,
    eventTime: marketType === "typeA" ? eventDate : undefined,
    measurementStart,
    measurementEnd,
    dataSource,
    dataSourceUrl,
    backupSource: `Manual verification via ${dataSource}`,
    betSide,
    confidence,
  };
}

function cleanPredictionToQuestion(text: string, deadline: Date): string {
  // Remove common prefixes
  let clean = text
    .replace(/^(I think|I believe|I predict|My call:|Call:)\s*/i, "")
    .replace(/^(gonna|going to)\s*/i, "will ")
    .trim();

  // Ensure it starts with "Will" and avoid "Will X will Y" duplication
  if (/^will\s/i.test(clean)) {
    // Already starts with "will" — just capitalize
    clean = `Will ${clean.slice(clean.indexOf(" ") + 1)}`;
  } else if (/\bwill\s/i.test(clean)) {
    // Contains "will" in the middle — restructure as "Will [subject] [verb] ..."
    // e.g. "Chiefs will win the Super Bowl" → "Will the Chiefs win the Super Bowl"
    const willIdx = clean.search(/\bwill\s/i);
    const subject = clean.slice(0, willIdx).trim();
    const rest = clean.slice(willIdx + 5).trim(); // Skip "will "
    clean = `Will ${subject.charAt(0).toLowerCase()}${subject.slice(1)} ${rest}`;
  } else {
    clean = `Will ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }

  // Remove trailing punctuation
  clean = clean.replace(/[.!?]*$/, "");

  // Remove date references already in the text (avoid duplication)
  clean = clean.replace(/\s+by\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{0,4}/i, "");
  clean = clean.replace(/\s+(?:next|this)\s+(?:week|month|quarter|year)/i, "");
  clean = clean.replace(/\s+(?:in|within)\s+\d+\s+(?:days?|weeks?|months?)/i, "");
  clean = clean.replace(/\s+(?:end of|by end of)\s+Q[1-4](?:\s+\d{4})?/i, "");

  // Add date
  clean = clean.replace(/\s+$/, "");
  clean += ` by ${formatDate(deadline)}`;
  clean += "?";

  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Create a Call object from parsed prediction + caller info
export function createCall(
  text: string,
  callerName: string,
  callerId?: string,
  betAmount?: number,
): Call {
  const parsed = parsePrediction(text);
  const id = randomUUID().slice(0, 8);

  return {
    id,
    callerId: callerId || callerName.toLowerCase().replace(/\s+/g, "-"),
    callerName,
    predictionText: text,
    question: parsed.question,
    category: parsed.category,
    marketType: parsed.marketType,
    closingTime: parsed.closingTime,
    eventTime: parsed.eventTime,
    measurementStart: parsed.measurementStart,
    measurementEnd: parsed.measurementEnd,
    dataSource: parsed.dataSource,
    dataSourceUrl: parsed.dataSourceUrl,
    backupSource: parsed.backupSource,
    betAmount: betAmount || CONFIG.DEFAULT_BET_SOL,
    betSide: parsed.betSide,
    resolved: false,
    createdAt: new Date(),
  };
}
