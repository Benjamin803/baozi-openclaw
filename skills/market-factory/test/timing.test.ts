import { describe, it, expect } from 'vitest';
import { classifyAndValidateTiming, enforceTimingRules, checkV7Compliance, MarketProposal } from '../src/news-detector';

function makeProposal(question: string, closingDaysFromNow: number): MarketProposal {
  return {
    question,
    category: 'Tech',
    closingTime: new Date(Date.now() + closingDaysFromNow * 24 * 60 * 60 * 1000),
    source: 'test',
    sourceUrl: '',
    confidence: 0.8,
  };
}

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// =============================================================================
// v7.0 COMPLIANCE
// =============================================================================
describe('Parimutuel Rules v7.0 Compliance', () => {

  describe('BANNED: Price prediction markets', () => {
    const bannedQuestions = [
      'Will SOL be above $200 on 2026-03-15?',
      'Will BTC reach $100000 by end of Q2 2026?',
      'Will ETH be below $2000 on 2026-04-01?',
      'Will Bitcoin price exceed $150000?',
      'Will the stock price of AAPL hit $300?',
      'Will Solana break $250 by March?',
    ];

    for (const q of bannedQuestions) {
      it(`blocks: "${q.substring(0, 50)}..."`, () => {
        const result = checkV7Compliance(q);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('BANNED');
      });
    }
  });

  describe('BANNED: Measurement-period markets', () => {
    const bannedQuestions = [
      'What will BTC measure at the end of this month?',
      'Will average trading volume during this week exceed 1M?',
      'What will the monthly average temperature show?',
    ];

    for (const q of bannedQuestions) {
      it(`blocks: "${q.substring(0, 50)}..."`, () => {
        const result = checkV7Compliance(q);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('BANNED');
      });
    }
  });

  describe('ALLOWED: Event-based (Type A) markets', () => {
    const allowedQuestions = [
      'Will OpenAI announce GPT-5 by 2026-04-01?',
      'Will the SEC approve a Solana ETF by Q2 2026?',
      'Who will win the 2026 BAFTA for Best Film?',
      'Will Apple launch a foldable iPhone by 2026-06-01?',
      'Will @elonmusk tweet about Dogecoin by 2026-03-15?',
      'Will Congress pass the AI Safety Act by 2026-06-30?',
    ];

    for (const q of allowedQuestions) {
      it(`allows: "${q.substring(0, 50)}..."`, () => {
        const result = checkV7Compliance(q);
        expect(result.allowed).toBe(true);
      });
    }
  });
});

// =============================================================================
// TYPE A TIMING RULES
// =============================================================================
describe('Type A Timing Rules', () => {

  it('validates 24h buffer before event (compliant)', () => {
    const proposal = makeProposal('Will OpenAI announce GPT-5 by end of Q2 2026?', 30);
    const result = classifyAndValidateTiming(proposal);
    expect(result.type).toBe('A');
    expect(result.valid).toBe(true);
  });

  it('detects "by DATE" format', () => {
    const proposal = makeProposal(`Will Apple launch AR glasses by ${futureDate(60)}?`, 30);
    const result = classifyAndValidateTiming(proposal);
    expect(result.type).toBe('A');
    expect(result.valid).toBe(true);
  });

  it('detects "by end of Q1 2026" format', () => {
    const proposal = makeProposal('Will a Solana ETF be approved by end of Q1 2026?', 7);
    const result = classifyAndValidateTiming(proposal);
    expect(result.type).toBe('A');
  });

  describe('enforceTimingRules', () => {
    it('returns proposal unchanged when already compliant', () => {
      const proposal = makeProposal(`Will X happen by ${futureDate(30)}?`, 7);
      const result = enforceTimingRules(proposal);
      expect(result).not.toBeNull();
      expect(result!.question).toBe(proposal.question);
    });

    it('preserves all other proposal fields when adjusting', () => {
      const proposal: MarketProposal = {
        question: `Will X announce Y by ${futureDate(5)}?`,
        category: 'Tech',
        closingTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        source: 'RSS:Tech',
        sourceUrl: 'https://example.com',
        confidence: 0.85,
      };
      const result = enforceTimingRules(proposal);
      if (result && result.closingTime.getTime() !== proposal.closingTime.getTime()) {
        expect(result.question).toBe(proposal.question);
        expect(result.category).toBe(proposal.category);
        expect(result.source).toBe(proposal.source);
      }
    });
  });
});

// =============================================================================
// GOLDEN RULE
// =============================================================================
describe('Golden rule: outcome must be unknowable while betting is open', () => {
  it('Type A markets: outcome depends on future event, not observable data', () => {
    const eventQuestions = [
      'Will Tesla announce a new vehicle by 2026-04-01?',
      'Will Congress pass the crypto bill this session?',
      'Will @baozibet tweet a pizza emoji by March 1?',
    ];
    for (const q of eventQuestions) {
      const compliance = checkV7Compliance(q);
      expect(compliance.allowed).toBe(true);
    }
  });

  it('Price questions fail the one-line test (observable while betting open)', () => {
    const priceQuestions = [
      'Will BTC be above $100000 on 2026-03-15?',
      'Will SOL reach $300 by end of Q2?',
    ];
    for (const q of priceQuestions) {
      const compliance = checkV7Compliance(q);
      expect(compliance.allowed).toBe(false);
    }
  });
});
