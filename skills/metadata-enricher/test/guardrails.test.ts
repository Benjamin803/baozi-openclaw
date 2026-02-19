import { describe, it, expect } from 'vitest';
import { checkGuardrails, formatFactualReport, sanitizeForOpenMarket } from '../src/guardrails';

describe('Guardrail Compliance', () => {
  describe('checkGuardrails', () => {
    it('allows any content for closed markets', () => {
      const content = 'I predict YES is likely to win because of momentum';
      const result = checkGuardrails(content, false);
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('FULL_ANALYSIS');
    });

    it('blocks predictive language for open markets', () => {
      const content = 'This is likely to resolve YES based on current trends';
      const result = checkGuardrails(content, true);
      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('FACTUAL_ONLY');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('allows factual content for open markets', () => {
      const content = 'Current odds: YES 65% / NO 35%. Pool: 2.5 SOL. Closes in 48h.';
      const result = checkGuardrails(content, true);
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('FACTUAL_ONLY');
    });

    it('detects "should resolve YES" as predictive', () => {
      const result = checkGuardrails('This should resolve YES', true);
      expect(result.allowed).toBe(false);
    });

    it('detects "I think" as predictive', () => {
      const result = checkGuardrails('I think BTC will break 100k', true);
      expect(result.allowed).toBe(false);
    });

    it('detects "strong chance" as predictive', () => {
      const result = checkGuardrails('There is a strong chance of resolution', true);
      expect(result.allowed).toBe(false);
    });

    it('detects "leaning towards YES" as predictive', () => {
      const result = checkGuardrails('Market is leaning towards YES', true);
      expect(result.allowed).toBe(false);
    });

    it('allows "Quality: 85/100" for open markets', () => {
      const content = 'Quality: 85/100\nCategory: crypto\nTags: bitcoin, price\nTiming: B ✅';
      const result = checkGuardrails(content, true);
      expect(result.allowed).toBe(true);
    });
  });

  describe('formatFactualReport', () => {
    it('produces guardrail-compliant output', () => {
      const market = {
        question: 'Will BTC be above $100k on 2026-03-15?',
        yesPercent: 65.5,
        noPercent: 34.5,
        totalPoolSol: 2.5,
        closingTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        category: 'crypto',
        publicKey: 'abc123',
      };
      const metadata = {
        qualityScore: 85,
        tags: ['bitcoin', 'price'],
        timingType: 'B',
        timingValid: true,
      };
      const report = formatFactualReport(market, metadata);

      // Should contain factual data
      expect(report).toContain('YES 65.5%');
      expect(report).toContain('NO 34.5%');
      expect(report).toContain('2.5000 SOL');
      expect(report).toContain('Quality: 85/100');

      // Should pass guardrail check
      const check = checkGuardrails(report, true);
      expect(check.allowed).toBe(true);
    });
  });

  describe('sanitizeForOpenMarket', () => {
    it('removes predictive language', () => {
      const content = 'I think BTC will reach 100k. Current pool is 2.5 SOL.';
      const sanitized = sanitizeForOpenMarket(content);
      expect(sanitized).not.toMatch(/I think/i);
      expect(sanitized).toContain('2.5 SOL');
    });

    it('leaves factual content unchanged', () => {
      const content = 'Current odds: YES 65% / NO 35%. Pool: 2.5 SOL.';
      const sanitized = sanitizeForOpenMarket(content);
      expect(sanitized).toBe(content);
    });
  });
});
