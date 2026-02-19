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

describe('Pari-mutuel v6.3 Timing Rules', () => {
  describe('Type B Detection (measurement-period)', () => {
    it('detects "Will X be above Y on DATE" as Type B', () => {
      const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will SOL be above $200 on ${futureDate}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('B');
    });

    it('validates close_time < measurement_start', () => {
      const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will BTC be above $100000 on ${futureDate}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Type B');
    });

    it('rejects when close_time >= measurement_start', () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will BTC be above $100000 on ${pastDate}?`, 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('VIOLATION');
    });
  });

  describe('Type A Detection (event-based)', () => {
    it('detects "by end of Q1 2026" as Type A', () => {
      const proposal = makeProposal('Will a BTC ETF be approved by end of Q1 2026?', 7);
      const result = classifyAndValidateTiming(proposal);
      expect(result.type).toBe('A');
    });

    it('validates 24h buffer before event', () => {
      const proposal = makeProposal('Will a BTC ETF be approved by end of Q2 2026?', 30);
      const result = classifyAndValidateTiming(proposal);
      expect(result.valid).toBe(true);
    });
  });

  describe('enforceTimingRules', () => {
    it('returns proposal unchanged when already compliant', () => {
      const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will SOL be above $200 on ${futureDate}?`, 7);
      const result = enforceTimingRules(proposal);
      expect(result).not.toBeNull();
      expect(result!.question).toBe(proposal.question);
    });

    it('adjusts non-compliant closing time', () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const proposal = makeProposal(`Will SOL be above $200 on ${futureDate}?`, 10);
      const result = enforceTimingRules(proposal);
      // Should either adjust or return null
      if (result) {
        expect(result.closingTime.getTime()).toBeLessThan(new Date(futureDate).getTime());
      }
    });
  });
});
