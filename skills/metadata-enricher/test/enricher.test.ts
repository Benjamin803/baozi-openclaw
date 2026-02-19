import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTiming, calculateQuality, keywordClassify, jaccardSimilarity } from '../src/enricher';

describe('Timing Validation (Pari-mutuel v6.3)', () => {
  describe('Type A (event-based)', () => {
    it('passes when close_time is 24h+ before event', () => {
      const close = '2026-03-01T00:00:00Z';
      const event = '2026-03-03T00:00:00Z'; // 48h after close
      const result = validateTiming(close, 'A', event);
      expect(result.valid).toBe(true);
      expect(result.notes).toContain('Type A valid');
    });

    it('fails when close_time is less than 24h before event', () => {
      const close = '2026-03-02T12:00:00Z';
      const event = '2026-03-03T00:00:00Z'; // only 12h gap
      const result = validateTiming(close, 'A', event);
      expect(result.valid).toBe(false);
      expect(result.notes).toContain('VIOLATION');
    });

    it('passes at exactly 24h boundary', () => {
      const close = '2026-03-02T00:00:00Z';
      const event = '2026-03-03T00:00:00Z'; // exactly 24h
      const result = validateTiming(close, 'A', event);
      expect(result.valid).toBe(true);
    });
  });

  describe('Type B (measurement-period)', () => {
    it('passes when close_time is before measurement start', () => {
      const close = '2026-03-01T00:00:00Z';
      const measStart = '2026-03-02T00:00:00Z';
      const result = validateTiming(close, 'B', undefined, measStart);
      expect(result.valid).toBe(true);
      expect(result.notes).toContain('Type B valid');
    });

    it('fails when close_time equals measurement start', () => {
      const close = '2026-03-01T00:00:00Z';
      const measStart = '2026-03-01T00:00:00Z';
      const result = validateTiming(close, 'B', undefined, measStart);
      expect(result.valid).toBe(false);
      expect(result.notes).toContain('VIOLATION');
    });

    it('fails when close_time is after measurement start', () => {
      const close = '2026-03-02T00:00:00Z';
      const measStart = '2026-03-01T00:00:00Z';
      const result = validateTiming(close, 'B', undefined, measStart);
      expect(result.valid).toBe(false);
    });
  });

  describe('Unknown type', () => {
    it('returns valid with note about unknown type', () => {
      const result = validateTiming('2026-03-01T00:00:00Z', 'unknown');
      expect(result.valid).toBe(true);
      expect(result.notes).toContain('unknown');
    });
  });
});

describe('Quality Scoring', () => {
  it('gives full score to well-formed market', () => {
    const result = calculateQuality(
      'Will Bitcoin reach $100,000 by March 2026?',
      {
        category: 'crypto',
        tags: ['bitcoin', 'price'],
        timingType: 'A',
        dataSource: 'CoinGecko',
        isSubjective: false,
        reasoning: 'test',
      },
      true, // timing valid
      1.5,  // pool
      []    // no existing markets
    );
    expect(result.score).toBe(100);
    expect(result.flags).toContain('clear-question');
    expect(result.flags).toContain('objectively-verifiable');
    expect(result.flags).toContain('timing-compliant');
    expect(result.flags).toContain('data-source:CoinGecko');
    expect(result.flags).toContain('unique');
  });

  it('penalizes subjective questions', () => {
    const result = calculateQuality(
      'Is Bitcoin the best cryptocurrency?',
      {
        category: 'crypto',
        tags: ['bitcoin'],
        timingType: 'unknown',
        isSubjective: true,
        reasoning: 'subjective opinion',
      },
      true, 0, []
    );
    expect(result.flags).not.toContain('objectively-verifiable');
  });

  it('detects duplicates', () => {
    const result = calculateQuality(
      'Will Bitcoin reach $100k?',
      null,
      true,
      0,
      ['Will Bitcoin reach $100k by end of year?']
    );
    expect(result.flags).toContain('potential-duplicate');
    expect(result.flags).not.toContain('unique');
  });

  it('flags timing violations', () => {
    const result = calculateQuality('Will X happen?', null, false, 0, []);
    expect(result.flags).not.toContain('timing-compliant');
  });
});

describe('Keyword Classification (fallback)', () => {
  it('classifies crypto markets', () => {
    const result = keywordClassify('Will Bitcoin reach $100k?');
    expect(result.category).toBe('crypto');
    expect(result.tags).toContain('bitcoin');
  });

  it('classifies sports markets', () => {
    const result = keywordClassify('Will the Lakers win the NBA championship?');
    expect(result.category).toBe('sports');
  });

  it('classifies politics markets', () => {
    const result = keywordClassify('Will Trump win the 2028 election?');
    expect(result.category).toBe('politics');
  });

  it('returns other for unrecognized topics', () => {
    const result = keywordClassify('Will my cat learn to fly?');
    expect(result.category).toBe('other');
  });
});

describe('Jaccard Similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('hello world', 'foo bar')).toBe(0);
  });

  it('returns partial for overlapping strings', () => {
    const sim = jaccardSimilarity('will bitcoin reach 100k', 'will bitcoin reach 200k');
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });
});
