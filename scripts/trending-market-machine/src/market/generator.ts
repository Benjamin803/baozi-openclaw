// Convert trending topics into properly-structured market questions
// Follows Baozi Parimutuel Rules v7.0 — TYPE A ONLY (no measurement-period markets)
import { CONFIG, type TrendingTopic, type MarketQuestion } from "../config.ts";

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

// v7.0 Blocked terms — auto-reject any question containing these
const BLOCKED_TERMS = [
  "price above", "price below", "trading volume", "market cap",
  "gains most", "total volume", "total burned", "average over",
  "this week", "this month", "floor price", "ath", "all-time high",
  "tvl", "total value locked",
];

function containsBlockedTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_TERMS.some((term) => lower.includes(term));
}

// Crypto market generators — v7.0: event-based only (no price/volume/rank)
function generateCryptoMarket(topic: TrendingTopic): MarketQuestion | null {
  const meta = topic.metadata;
  const symbol = (meta.symbol as string)?.toUpperCase();
  const coinName = (meta.name as string) || symbol;

  if (!symbol) return null;

  const title = topic.title.toLowerCase();

  // Mainnet/testnet launch detection
  if (title.match(/\b(mainnet|launch|upgrade|hard\s*fork|v\d|testnet|migration)\b/)) {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will ${coinName} (${symbol}) launch the upgrade or mainnet mentioned in "${truncate(topic.title, 60)}" before ${formatDate(eventTime)}?`,
      description: `Trending: "${topic.title}". Resolves YES if the specific upgrade, mainnet launch, or migration is officially completed and announced before the event date. Resolution via official project announcement.`,
      marketType: "boolean",
      category: "crypto",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: `Official ${coinName} project announcements (Twitter/X, blog, Discord)`,
      dataSourceUrl: `https://www.coingecko.com/en/coins/${meta.coinId}`,
      tags: ["crypto", symbol.toLowerCase(), "launch", "upgrade"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "CoinDesk / The Block coverage",
    };
  }

  // Exchange listing detection
  if (title.match(/\b(list|listing|delist|add|support)\b/i)) {
    const eventTime = new Date(Date.now() + 10 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will ${symbol} be listed on a new major exchange (Binance, Coinbase, Kraken) before ${formatDate(eventTime)}?`,
      description: `${coinName} is trending. This market asks whether it will gain a new listing on a major centralized exchange. Resolves YES if officially listed and tradeable. Source: official exchange announcement.`,
      marketType: "boolean",
      category: "crypto",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official exchange listing announcements",
      dataSourceUrl: `https://www.coingecko.com/en/coins/${meta.coinId}`,
      tags: ["crypto", symbol.toLowerCase(), "listing"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "CoinGecko exchange listing page",
    };
  }

  // Partnership/integration announcements
  if (title.match(/\b(partner|integrat|collaborat|join|alliance)\b/i)) {
    const eventTime = new Date(Date.now() + 10 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the ${coinName} partnership in "${truncate(topic.title, 60)}" be officially confirmed before ${formatDate(eventTime)}?`,
      description: `Trending: "${topic.title}". Resolves YES if the partnership or integration is officially confirmed by both parties before the event date.`,
      marketType: "boolean",
      category: "crypto",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official project press releases and announcements",
      dataSourceUrl: topic.url || `https://www.coingecko.com/en/coins/${meta.coinId}`,
      tags: ["crypto", symbol.toLowerCase(), "partnership"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "CoinDesk / The Block coverage",
    };
  }

  // Governance/DAO vote outcomes
  if (title.match(/\b(governance|proposal|vote|dao|referendum)\b/i)) {
    const eventTime = new Date(Date.now() + 7 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the ${coinName} governance proposal in "${truncate(topic.title, 60)}" pass before ${formatDate(eventTime)}?`,
      description: `Trending: "${topic.title}". Resolves YES if the governance proposal passes its voting period with majority approval. Resolution via official governance platform (Snapshot, on-chain vote).`,
      marketType: "boolean",
      category: "crypto",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official governance platform (Snapshot / on-chain)",
      dataSourceUrl: topic.url || `https://www.coingecko.com/en/coins/${meta.coinId}`,
      tags: ["crypto", symbol.toLowerCase(), "governance"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Project Discord / forum announcement",
    };
  }

  // Fallback for trending coins: generate listing/milestone event market
  // Only for coins trending on CoinGecko without matching specific event keywords
  if (topic.source === "coingecko") {
    const rank = meta.marketCapRank as number | undefined;
    const eventTime = new Date(Date.now() + 10 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    // For top-20 coins (BTC, ETH, SOL, etc.): network upgrade/hard fork events
    if (rank && rank <= 20) {
      return {
        question: `Will ${coinName} (${symbol}) have a major network upgrade or protocol change announced before ${formatDate(eventTime)}?`,
        description: `${coinName} is trending on CoinGecko (ranked #${rank}). Resolves YES if a new network upgrade, hard fork, or major protocol change is officially announced (not just proposed) by core developers before the event date.`,
        marketType: "boolean",
        category: "crypto",
        closingTime,
        resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
        dataSource: `Official ${coinName} developer blog or GitHub`,
        dataSourceUrl: topic.url || `https://www.coingecko.com/en/coins/${meta.coinId}`,
        tags: ["crypto", symbol.toLowerCase(), "upgrade", "trending"],
        trendSource: topic,
        timingType: "A",
        eventTime,
        backupSource: "CoinDesk / The Block coverage",
      };
    }

    // For top-100 coins: "Will X announce a major partnership?"
    if (rank && rank <= 100) {
      return {
        question: `Will ${coinName} (${symbol}) announce a major partnership or integration before ${formatDate(eventTime)}?`,
        description: `${coinName} is currently trending on CoinGecko (ranked #${rank}). This market resolves YES if ${coinName} officially announces a new major partnership, integration, or ecosystem expansion before the event date. Must be confirmed by official project channels.`,
        marketType: "boolean",
        category: "crypto",
        closingTime,
        resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
        dataSource: `Official ${coinName} announcements (Twitter/X, blog)`,
        dataSourceUrl: topic.url || `https://www.coingecko.com/en/coins/${meta.coinId}`,
        tags: ["crypto", symbol.toLowerCase(), "partnership", "trending"],
        trendSource: topic,
        timingType: "A",
        eventTime,
        backupSource: "CoinDesk / The Block coverage",
      };
    }

    // For lower-ranked coins: "Will X get listed on Binance/Coinbase?"
    return {
      question: `Will ${coinName} (${symbol}) be listed on Binance or Coinbase before ${formatDate(eventTime)}?`,
      description: `${coinName} is trending on CoinGecko${rank ? ` (ranked #${rank})` : ""}. This market resolves YES if ${symbol} becomes available for trading on Binance or Coinbase (spot market). Must be officially listed and tradeable.`,
      marketType: "boolean",
      category: "crypto",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Binance and Coinbase official listing announcements",
      dataSourceUrl: topic.url || `https://www.coingecko.com/en/coins/${meta.coinId}`,
      tags: ["crypto", symbol.toLowerCase(), "listing", "exchange"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "CoinGecko exchange listing page",
    };
  }

  return null;
}

// Tech/general news market generators — v7.0: event-based only
function generateNewsMarket(topic: TrendingTopic): MarketQuestion | null {
  const title = topic.title.toLowerCase();

  // Skip if contains blocked terms
  if (containsBlockedTerm(title)) return null;

  // Product launch detection
  if (title.match(/\b(launch|release|announce|unveil|reveal|introduce|debut)\b/)) {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the product/feature mentioned in "${truncate(topic.title, 80)}" be publicly available within 14 days?`,
      description: `Trending news: "${topic.title}". Source: ${topic.source}. Resolves YES if the product/feature/announcement becomes publicly available or officially confirmed within 14 days of market creation.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official press release or product page",
      dataSourceUrl: topic.url || "",
      tags: ["tech", "launch", "product"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "TechCrunch / The Verge coverage",
    };
  }

  // Acquisition/merger detection
  if (title.match(/\b(acquire|merger|buy|takeover|deal)\b/)) {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the deal in "${truncate(topic.title, 80)}" be officially confirmed within 14 days?`,
      description: `Trending: "${topic.title}". Source: ${topic.source}. Resolves YES if the acquisition/merger/deal is officially confirmed by involved companies within 14 days.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official company press releases (SEC filings if public)",
      dataSourceUrl: topic.url || "",
      tags: ["business", "acquisition"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Bloomberg / Reuters coverage",
    };
  }

  // Regulatory/legal decisions
  if (title.match(/\b(regulate|ruling|ban|approve|court|lawsuit|sec|fcc|fda|eu)\b/)) {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the regulatory action in "${truncate(topic.title, 80)}" be officially decided before ${formatDate(eventTime)}?`,
      description: `Trending: "${topic.title}". Source: ${topic.source}. Resolves YES if an official decision, ruling, or regulatory action is publicly announced before the event date.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Official government/agency press release",
      dataSourceUrl: topic.url || "",
      tags: ["regulation", "policy"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "AP / Reuters coverage",
    };
  }

  // IPO/public listing detection
  if (title.match(/\b(ipo|public|s-1|filing|nasdaq|nyse)\b/)) {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will the company in "${truncate(topic.title, 80)}" file for IPO before ${formatDate(eventTime)}?`,
      description: `Trending: "${topic.title}". Source: ${topic.source}. Resolves YES if an S-1 or equivalent IPO filing is submitted to the SEC or relevant regulatory body before the event date.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "SEC EDGAR filings",
      dataSourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
      tags: ["business", "ipo"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Bloomberg / Reuters coverage",
    };
  }

  // Open source milestone detection (e.g. GitHub stars, releases)
  if (title.match(/\b(open.?source|github|star|release|milestone)\b/) && topic.source === "hackernews") {
    const eventTime = new Date(Date.now() + 14 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    // Extract project name from title
    const projectMatch = topic.title.match(/([A-Z][a-zA-Z0-9-]+)/);
    const projectName = projectMatch ? projectMatch[1] : "the project";

    return {
      question: `Will ${projectName} release a new major version before ${formatDate(eventTime)}?`,
      description: `Trending on HackerNews: "${topic.title}". Resolves YES if a new major release (e.g. v2.0, v3.0) is published on GitHub or official channels before the event date.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "GitHub releases page",
      dataSourceUrl: topic.url || "",
      tags: ["tech", "opensource", "release"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Official project blog / changelog",
    };
  }

  // Fallback for high-scoring HackerNews topics: "Will this story get mainstream coverage?"
  if (topic.source === "hackernews" && topic.score > 50) {
    const eventTime = new Date(Date.now() + 7 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Will "${truncate(topic.title, 70)}" be covered by a major news outlet (NYT, BBC, CNN, Reuters) before ${formatDate(eventTime)}?`,
      description: `Trending on HackerNews: "${topic.title}". Resolves YES if the topic is covered by a major mainstream news outlet (New York Times, BBC, CNN, Reuters, AP, Washington Post) before the event date. Must be a dedicated article, not just a mention.`,
      marketType: "boolean",
      category: "economic",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "Major news outlets (NYT, BBC, CNN, Reuters, AP)",
      dataSourceUrl: topic.url || "",
      tags: ["tech", "media", "coverage"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Google News search",
    };
  }

  return null;
}

// Sports market generators — already Type A compliant
function generateSportsMarket(topic: TrendingTopic): MarketQuestion | null {
  const title = topic.title;

  if (title.match(/\b(vs|versus|play|match|game|championship|final|semifinal|playoff)\b/i)) {
    const eventTime = new Date(Date.now() + 5 * DAYS);
    const closingTime = new Date(eventTime.getTime() - 24 * HOURS);

    return {
      question: `Based on "${truncate(title, 80)}" — will the favored team/player win?`,
      description: `Sports news: "${title}". Source: ${topic.source}. Binary market on the outcome. Resolves based on official results.`,
      marketType: "boolean",
      category: "sports",
      closingTime,
      resolutionTime: new Date(eventTime.getTime() + CONFIG.DEFAULT_RESOLUTION_BUFFER_SECONDS * 1000),
      dataSource: "ESPN / official league results",
      dataSourceUrl: topic.url || "https://www.espn.com",
      tags: ["sports", "competition"],
      trendSource: topic,
      timingType: "A",
      eventTime,
      backupSource: "Official league website",
    };
  }

  return null;
}

export function generateMarketQuestion(topic: TrendingTopic): MarketQuestion | null {
  switch (topic.category) {
    case "crypto":
      return generateCryptoMarket(topic);
    case "sports":
      return generateSportsMarket(topic);
    default:
      return generateNewsMarket(topic);
  }
}

export function generateBatch(topics: TrendingTopic[]): MarketQuestion[] {
  return topics
    .sort((a, b) => b.score - a.score)
    .map(generateMarketQuestion)
    .filter((q): q is MarketQuestion => q !== null);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
