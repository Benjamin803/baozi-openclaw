/**
 * News & Event Detection Module
 *
 * Monitors RSS feeds, crypto prices, and generates prediction market questions.
 * Returns MarketProposal objects for the factory to create on-chain.
 */
import axios from 'axios';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { config } from './config';
import { isEventSeen, recordSeenEvent, isDuplicate } from './tracker';

const rssParser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'BaoziMarketFactory/1.0' },
});

export interface MarketProposal {
  question: string;
  category: string;
  closingTime: Date;
  source: string;
  sourceUrl: string;
  confidence: number; // 0-1, how confident we are this is a good market
}

// =============================================================================
// RSS NEWS DETECTION
// =============================================================================

interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  categories?: string[];
}

const CRYPTO_PATTERNS = [
  { regex: /(\w+)\s+(?:hits|reaches|breaks|surpasses|crosses)\s+\$?([\d,]+)/i, type: 'price_milestone' },
  { regex: /(\w+)\s+(?:ETF|etf)\s+(?:approved|rejected|filed|submitted)/i, type: 'etf' },
  { regex: /(\w+)\s+(?:halving|halvening)/i, type: 'halving' },
  { regex: /(\w+)\s+(?:launches?|announces?|unveils?|releases?)\s+(.+)/i, type: 'launch' },
  { regex: /(?:SEC|CFTC|regulat)/i, type: 'regulation' },
];

const TECH_PATTERNS = [
  { regex: /(GPT-\d|Claude\s+\d|Gemini\s+\d|Llama\s+\d)\s+(?:launch|release|announce)/i, type: 'ai_model' },
  { regex: /(Apple|Google|Microsoft|Meta|Tesla|Nvidia)\s+(?:launch|release|announce|unveil)/i, type: 'tech_launch' },
  { regex: /(?:IPO|acquisition|merger|buyout)\s+/i, type: 'corporate' },
];

function generateEventHash(title: string, source: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(`${source}:${normalized}`).digest('hex');
}

function generateMarketQuestion(title: string, pattern: { type: string }): string | null {
  const cleanTitle = title.replace(/\s+/g, ' ').trim();

  switch (pattern.type) {
    case 'price_milestone': {
      const match = cleanTitle.match(/(\w+)\s+(?:hits|reaches|breaks|surpasses|crosses)\s+\$?([\d,]+)/i);
      if (match) {
        const coin = match[1];
        const price = match[2].replace(/,/g, '');
        // Create a "will it stay above" market
        const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const dateStr = targetDate.toISOString().split('T')[0];
        return `Will ${coin} be above $${price} on ${dateStr}?`;
      }
      return null;
    }

    case 'etf':
      return `Will a ${cleanTitle.match(/(\w+)/)?.[1] || 'crypto'} ETF be approved by end of Q1 2026?`;

    case 'launch':
      return `Will ${cleanTitle.substring(0, 80)} succeed within 30 days?`;

    case 'regulation':
      return null; // Too complex for auto-generation

    case 'ai_model': {
      const match = cleanTitle.match(/(GPT-\d|Claude\s+\d|Gemini\s+\d|Llama\s+\d)/i);
      if (match) {
        return `Will ${match[1]} be publicly available within 30 days?`;
      }
      return null;
    }

    case 'tech_launch': {
      const match = cleanTitle.match(/(Apple|Google|Microsoft|Meta|Tesla|Nvidia)\s+(?:launches?|releases?|announces?|unveils?)\s+(.{5,40})/i);
      if (match) {
        return `Will ${match[1]}'s ${match[2].trim()} launch by end of month?`;
      }
      return null;
    }

    default:
      return null;
  }
}

export async function scanRSSFeeds(): Promise<MarketProposal[]> {
  const proposals: MarketProposal[] = [];

  for (const feed of config.rssFeeds) {
    try {
      console.log(`📡 Scanning RSS: ${feed.url}`);
      const parsed = await rssParser.parseURL(feed.url);

      for (const item of (parsed.items || []).slice(0, 15)) {
        const title = item.title || '';
        const eventHash = generateEventHash(title, feed.category);

        // Skip if already seen
        if (isEventSeen(eventHash)) continue;

        // Check against patterns
        const patterns = feed.category === 'Crypto' ? CRYPTO_PATTERNS : TECH_PATTERNS;
        for (const pattern of patterns) {
          if (pattern.regex.test(title)) {
            const question = generateMarketQuestion(title, pattern);
            if (question && question.length >= 10 && question.length <= 200) {
              // Check for duplicates
              if (!isDuplicate(question)) {
                const closingTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days
                proposals.push({
                  question,
                  category: feed.category,
                  closingTime,
                  source: `RSS:${feed.category}`,
                  sourceUrl: item.link || '',
                  confidence: 0.7,
                });
                recordSeenEvent(eventHash, title, feed.category);
                console.log(`  ✅ Proposal: "${question}"`);
              }
            }
            break; // Only match first pattern per article
          }
        }

        // Record event as seen even if no market created
        recordSeenEvent(eventHash, title, feed.category);
      }
    } catch (err: any) {
      console.error(`  ❌ RSS error for ${feed.url}: ${err.message}`);
    }
  }

  return proposals;
}

// =============================================================================
// CRYPTO PRICE MILESTONE DETECTION
// =============================================================================

interface CoinPrice {
  id: string;
  current_price: number;
  price_change_percentage_24h: number;
  name: string;
  symbol: string;
}

export async function scanCryptoPriceMilestones(): Promise<MarketProposal[]> {
  const proposals: MarketProposal[] = [];

  try {
    console.log('📊 Checking crypto price milestones...');
    const response = await axios.get(`${config.coingeckoApiUrl}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        ids: config.trackedCoins.join(','),
        order: 'market_cap_desc',
      },
      timeout: 10000,
    });

    const coins: CoinPrice[] = response.data;

    for (const coin of coins) {
      const milestones = config.priceMilestones[coin.id] || [];

      for (const milestone of milestones) {
        // Check if price is within 10% of a milestone
        const pctToMilestone = Math.abs(coin.current_price - milestone) / milestone;

        if (pctToMilestone < 0.10) {
          const direction = coin.current_price < milestone ? 'above' : 'below';
          const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const dateStr = targetDate.toISOString().split('T')[0];
          const question = `Will ${coin.name} be ${direction} $${milestone.toLocaleString()} on ${dateStr}?`;

          const eventHash = generateEventHash(`${coin.id}-${milestone}-${dateStr}`, 'CoinGecko');

          if (!isEventSeen(eventHash) && !isDuplicate(question)) {
            proposals.push({
              question,
              category: 'Crypto',
              closingTime: targetDate,
              source: 'CoinGecko',
              sourceUrl: `https://www.coingecko.com/en/coins/${coin.id}`,
              confidence: 0.85, // Price milestones are high-quality markets
            });
            recordSeenEvent(eventHash, question, 'CoinGecko');
            console.log(`  ✅ Price proposal: "${question}" (${coin.symbol} at $${coin.current_price.toFixed(2)})`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`  ❌ CoinGecko error: ${err.message}`);
  }

  return proposals;
}

// =============================================================================
// CURATED MARKET GENERATION (Guaranteed supply)
// =============================================================================

/**
 * Generate time-based markets that are always valid.
 * These are "safe" markets that don't depend on news detection.
 */
export function generateCuratedMarkets(): MarketProposal[] {
  const proposals: MarketProposal[] = [];
  const now = new Date();

  // Daily crypto snapshot markets
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekStr = weekFromNow.toISOString().split('T')[0];

  // SOL price markets (always relevant on a Solana platform)
  const solMarkets = [
    {
      question: `Will SOL close above $170 on ${weekStr}?`,
      closingTime: weekFromNow,
      confidence: 0.9,
    },
    {
      question: `Will BTC be above $100K on ${weekStr}?`,
      closingTime: weekFromNow,
      confidence: 0.9,
    },
    {
      question: `Will ETH be above $2800 on ${weekStr}?`,
      closingTime: weekFromNow,
      confidence: 0.85,
    },
  ];

  for (const m of solMarkets) {
    const eventHash = generateEventHash(m.question, 'Curated');
    if (!isEventSeen(eventHash) && !isDuplicate(m.question)) {
      proposals.push({
        question: m.question,
        category: 'Crypto',
        closingTime: m.closingTime,
        source: 'Curated',
        sourceUrl: '',
        confidence: m.confidence,
      });
      recordSeenEvent(eventHash, m.question, 'Curated');
    }
  }

  return proposals;
}

// =============================================================================
// MAIN SCAN FUNCTION
// =============================================================================

export async function detectMarketOpportunities(): Promise<MarketProposal[]> {
  const allProposals: MarketProposal[] = [];

  // Scan all sources
  const [rssProposals, priceProposals] = await Promise.allSettled([
    scanRSSFeeds(),
    scanCryptoPriceMilestones(),
  ]);

  if (rssProposals.status === 'fulfilled') allProposals.push(...rssProposals.value);
  if (priceProposals.status === 'fulfilled') allProposals.push(...priceProposals.value);

  // Add curated markets if we don't have enough
  if (allProposals.length < 3) {
    allProposals.push(...generateCuratedMarkets());
  }

  // Sort by confidence descending
  allProposals.sort((a, b) => b.confidence - a.confidence);

  console.log(`\n📋 Total proposals this scan: ${allProposals.length}`);
  return allProposals;
}

// =============================================================================
// PARI-MUTUEL V6.3 TIMING RULES
// =============================================================================

export interface TimingClassification {
  type: 'A' | 'B';
  eventTime?: Date;       // Type A: when the event occurs
  measurementStart?: Date; // Type B: when measurement period begins
  valid: boolean;
  reason: string;
}

/**
 * Classify and validate market timing per pari-mutuel v6.3 rules.
 * 
 * Type A (event-based): "Will X happen by Y?"
 *   - close_time must be <= event_time - 24h
 *   
 * Type B (measurement-period): "Will X measure Y at time Z?"
 *   - close_time must be < measurement_start
 *   
 * Golden Rule: Bettors must NEVER have information advantage while betting is open.
 */
export function classifyAndValidateTiming(proposal: MarketProposal): TimingClassification {
  const question = proposal.question.toLowerCase();
  const closingMs = proposal.closingTime.getTime();
  const buffer24h = 24 * 60 * 60 * 1000;

  // Type B detection: "Will X be above/below Y on DATE?"
  // These are measurement-period markets - closing time should be before measurement
  const dateMatch = question.match(/on\s+(\d{4}-\d{2}-\d{2})/);
  const priceMatch = question.match(/(?:above|below|reach|exceed)\s+\$?[\d,]+/);
  
  if (dateMatch && priceMatch) {
    // This is a Type B market (price measurement on a specific date)
    const measurementDate = new Date(dateMatch[1] + 'T00:00:00Z');
    const valid = closingMs < measurementDate.getTime();
    
    return {
      type: 'B',
      measurementStart: measurementDate,
      valid,
      reason: valid
        ? `Type B: closes ${((measurementDate.getTime() - closingMs) / (60*60*1000)).toFixed(1)}h before measurement`
        : `Type B VIOLATION: close_time must be < measurement_start (${measurementDate.toISOString()})`,
    };
  }

  // Type A detection: "Will X happen by/before DATE?" or event-based
  const byDateMatch = question.match(/by\s+(?:end\s+of\s+)?(\w+\s+\d{4}|q[1-4]\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  
  if (byDateMatch) {
    // Parse the event date
    let eventDate: Date;
    const dateStr = byDateMatch[1].toLowerCase();
    
    if (dateStr.match(/q[1-4]\s+\d{4}/)) {
      const [q, year] = dateStr.split(/\s+/);
      const quarter = parseInt(q.replace('q', ''));
      eventDate = new Date(`${year}-${String(quarter * 3).padStart(2, '0')}-28T23:59:59Z`);
    } else if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
      eventDate = new Date(dateStr + 'T23:59:59Z');
    } else {
      // "March 2026" format
      eventDate = new Date(dateStr + ' 28 23:59:59 UTC');
    }

    if (!isNaN(eventDate.getTime())) {
      const valid = closingMs <= eventDate.getTime() - buffer24h;
      return {
        type: 'A',
        eventTime: eventDate,
        valid,
        reason: valid
          ? `Type A: closes ${((eventDate.getTime() - closingMs) / buffer24h).toFixed(1)} days before event`
          : `Type A VIOLATION: close_time must be <= event_time - 24h`,
      };
    }
  }

  // Default: treat as Type A with closing time as event time proxy
  // Apply conservative 24h buffer from any mentioned future date
  const futureDate = new Date(closingMs + buffer24h);
  return {
    type: 'A',
    eventTime: futureDate,
    valid: true, // Conservative default: if no specific date, assume closing time is already buffered
    reason: 'Type A (inferred): no explicit event date, using closing time with default buffer',
  };
}

/**
 * Adjust proposal closing time to comply with timing rules.
 * Returns null if the market cannot be made compliant.
 */
export function enforceTimingRules(proposal: MarketProposal): MarketProposal | null {
  const classification = classifyAndValidateTiming(proposal);
  
  if (classification.valid) {
    return proposal; // Already compliant
  }

  const buffer24h = 24 * 60 * 60 * 1000;

  if (classification.type === 'A' && classification.eventTime) {
    // Adjust closing time to event_time - 24h
    const adjustedClose = new Date(classification.eventTime.getTime() - buffer24h);
    if (adjustedClose.getTime() <= Date.now()) {
      console.warn(`  ⚠️ Cannot fix timing for "${proposal.question}" — adjusted close would be in the past`);
      return null;
    }
    console.log(`  🔧 Adjusted closing time: ${proposal.closingTime.toISOString()} → ${adjustedClose.toISOString()}`);
    return { ...proposal, closingTime: adjustedClose };
  }

  if (classification.type === 'B' && classification.measurementStart) {
    // Adjust closing time to measurement_start - 1h
    const adjustedClose = new Date(classification.measurementStart.getTime() - 60 * 60 * 1000);
    if (adjustedClose.getTime() <= Date.now()) {
      console.warn(`  ⚠️ Cannot fix timing for "${proposal.question}" — adjusted close would be in the past`);
      return null;
    }
    console.log(`  🔧 Adjusted closing time: ${proposal.closingTime.toISOString()} → ${adjustedClose.toISOString()}`);
    return { ...proposal, closingTime: adjustedClose };
  }

  return null; // Can't fix
}
