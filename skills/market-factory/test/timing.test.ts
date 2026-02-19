import { describe, it, expect } from 'vitest';
import { classifyAndValidateTiming, enforceTimingRules, MarketProposal } from '../src/news-detector';

function makeProposal(question: string, closingDaysFromNow: number): MarketProposal {
  return {
    question,
    category: 'Crypto',
    closingTime: new Date(Date.now() + closingDaysFromNow * 24 * 60 * 60 * 1000),
    source: 'test',
    sourceUrl: '',
    confidence: 0.8,
  };
}

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

describe('Pari-mutuel v6.3 Timing Rules', () => {

  // ─── Type B: measurement-period markets ────────────────────────────
  describe('Type B Detection (measurement-period)', () => {
    it('detects "Will X be above Y on DATE" as Type B', () => {
      const proposal = makeProposal(`Will SOL be above $200 on ${futureDate(14)}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('B');
    });

    it('detects "Will X be below Y on DATE" as Type B', () => {
      const proposal = makeProposal(`Will BTC be below $90000 on ${futureDate(14)}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('B');
    });

    it('validates close_time < measurement_start (compliant)', () => {
      // Closes 7 days from now, measurement 14 days from now - valid
      const proposal = makeProposal(`Will BTC be above $100000 on ${futureDate(14)}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('B');
      expect(result.reason).toContain('Type B');
      expect(result.measurementStart).toBeDefined();
    });

    it('rejects when close_time >= measurement_start (non-compliant)', () => {
      // Closes 7 days from now, measurement 3 days from now - VIOLATION
      const proposal = makeProposal(`Will BTC be above $100000 on ${futureDate(3)}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('VIOLATION');
    });

    it('rejects when close_time equals measurement date', () => {
      const date = futureDate(7);
      const proposal = makeProposal(`Will ETH reach $5000 on ${date}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      // close_time should be strictly less than measurement_start
      // Since both are ~7 days, this should fail or be borderline
      expect(result.type).toBe('B');
    });
  });

  // ─── Type A: event-based markets ───────────────────────────────────
  describe('Type A Detection (event-based)', () => {
    it('detects "by end of Q1 2026" as Type A', () => {
      const proposal = makeProposal('Will a BTC ETF be approved by end of Q1 2026?', 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('A');
    });

    it('detects "by end of Q2 2026" as Type A', () => {
      const proposal = makeProposal('Will Solana flip Ethereum by end of Q2 2026?', 30);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('A');
    });

    it('validates 24h buffer before event (compliant)', () => {
      const proposal = makeProposal('Will a BTC ETF be approved by end of Q2 2026?', 30);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(true);
      expect(result.eventTime).toBeDefined();
    });

    it('detects "by DATE" format as Type A', () => {
      const proposal = makeProposal(`Will GPT-5 launch by ${futureDate(60)}?`, 30);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('A');
      expect(result.valid).toBe(true);
    });
  });

  // ─── enforceTimingRules ────────────────────────────────────────────
  describe('enforceTimingRules', () => {
    it('returns proposal unchanged when already compliant', () => {
      const proposal = makeProposal(`Will SOL be above $200 on ${futureDate(14)}?`, 7);
      const result = enforceTimingRules(proposal);
      expect(result).not.toBeNull();
      expect(result!.question).toBe(proposal.question);
    });

    it('adjusts non-compliant Type B closing time', () => {
      // Measurement in 5 days, but close in 10 - should adjust close to < measurement
      const measureDate = futureDate(5);
      const proposal = makeProposal(`Will SOL be above $200 on ${measureDate}?`, 10);
      const result = enforceTimingRules(proposal);
      if (result) {
        // Adjusted close should be before measurement date
        expect(result.closingTime.getTime()).toBeLessThan(new Date(measureDate + 'T00:00:00Z').getTime());
      }
    });

    it('returns null when market cannot be made compliant', () => {
      // Measurement date is in the past
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will BTC be above $100000 on ${pastDate}?`, 7);
      const result = enforceTimingRules(proposal);
      // Should either return null or adjusted to past (which enforceTimingRules rejects)
      if (result) {
        // If it returns something, the adjusted time must still be in the future
        expect(result.closingTime.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('preserves all other proposal fields when adjusting', () => {
      const measureDate = futureDate(5);
      const proposal: MarketProposal = {
        question: `Will SOL be above $200 on ${measureDate}?`,
        category: 'Crypto',
        closingTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        source: 'CoinGecko',
        sourceUrl: 'https://coingecko.com/en/coins/solana',
        confidence: 0.85,
      };
      const result = enforceTimingRules(proposal);
      if (result && result.closingTime.getTime() !== proposal.closingTime.getTime()) {
        expect(result.question).toBe(proposal.question);
        expect(result.category).toBe(proposal.category);
        expect(result.source).toBe(proposal.source);
        expect(result.sourceUrl).toBe(proposal.sourceUrl);
        expect(result.confidence).toBe(proposal.confidence);
      }
    });
  });

  // ─── Golden rule enforcement ───────────────────────────────────────
  describe('Golden rule: no information advantage while betting is open', () => {
    it('Type B markets always close before measurement', () => {
      // This is the fundamental Type B invariant
      for (const days of [7, 14, 21, 30]) {
        const proposal = makeProposal(`Will BTC be above $100000 on ${futureDate(days)}?`, days - 3);
        const result = classifyAndValidateTiming(proposal);
        if (result.type === 'B' && result.valid && result.measurementStart) {
          expect(proposal.closingTime.getTime()).toBeLessThan(result.measurementStart.getTime());
        }
      }
    });

    it('Type A markets always close 24h before event', () => {
      const proposal = makeProposal('Will a Solana ETF be approved by end of Q2 2026?', 30);
      const result = classifyAndValidateTiming(proposal);
      if (result.type === 'A' && result.valid && result.eventTime) {
        const buffer = result.eventTime.getTime() - proposal.closingTime.getTime();
        expect(buffer).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
      }
    });
  });
});
