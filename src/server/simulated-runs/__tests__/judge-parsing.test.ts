/**
 * Unit tests for judge-prompt parsers. These cover the realistic
 * judge-reply shapes (single-letter answers, prose with the answer
 * buried, JSON with preamble) — any of these failing to parse becomes
 * a `failed` seat outcome, so laxness here directly affects run
 * completion rate.
 */
import { describe, it, expect } from 'vitest';
import { parseTournamentVerdict } from '../prompts/tournament-judge.js';
import { parseSliderScore } from '../prompts/slider-judge.js';
import { parseApproveRejectVerdict } from '../prompts/approve-reject-judge.js';
import {
  parseBestOfNChoice,
  letterLabels,
} from '../prompts/best-of-n-judge.js';
import { parseMultiAxisScores } from '../prompts/multi-axis-judge.js';
import { cleanQualitativeFeedback } from '../prompts/qualitative-judge.js';

describe('parseTournamentVerdict', () => {
  it('parses the canonical single-token replies', () => {
    expect(parseTournamentVerdict('A')).toBe('A');
    expect(parseTournamentVerdict('B')).toBe('B');
    expect(parseTournamentVerdict('tie')).toBe('tie');
    expect(parseTournamentVerdict('both_bad')).toBe('both_bad');
  });

  it('handles punctuation/quotes', () => {
    expect(parseTournamentVerdict('"A"')).toBe('A');
    expect(parseTournamentVerdict("'B'")).toBe('B');
    expect(parseTournamentVerdict('A.')).toBe('A');
    expect(parseTournamentVerdict('`tie`')).toBe('tie');
  });

  it('recognizes prose with a leading answer token', () => {
    expect(parseTournamentVerdict('A\nBecause it\u2019s more concise.')).toBe('A');
    expect(parseTournamentVerdict('B — better tone')).toBe('B');
  });

  it('falls back to first-token scan', () => {
    expect(parseTournamentVerdict('tie is what i pick')).toBe('tie');
  });

  it('recognizes "both bad" with or without underscore', () => {
    expect(parseTournamentVerdict('both bad')).toBe('both_bad');
    expect(parseTournamentVerdict('both_bad, honestly')).toBe('both_bad');
  });

  it('returns null on unrecognizable reply', () => {
    expect(parseTournamentVerdict('neither')).toBeNull();
    expect(parseTournamentVerdict('')).toBeNull();
  });
});

describe('parseSliderScore', () => {
  it('parses an integer in range', () => {
    expect(parseSliderScore('7', 1, 10)).toBe(7);
    expect(parseSliderScore('  7  ', 1, 10)).toBe(7);
  });

  it('extracts the first integer from prose', () => {
    expect(parseSliderScore('My score: 8', 1, 10)).toBe(8);
    expect(parseSliderScore('8 out of 10', 1, 10)).toBe(8);
  });

  it('rejects out-of-range values', () => {
    expect(parseSliderScore('11', 1, 10)).toBeNull();
    expect(parseSliderScore('0', 1, 10)).toBeNull();
  });

  it('rejects non-integer / non-numeric replies', () => {
    expect(parseSliderScore('pretty good', 1, 10)).toBeNull();
    expect(parseSliderScore('', 1, 10)).toBeNull();
  });
});

describe('parseApproveRejectVerdict', () => {
  it('parses the canonical words', () => {
    expect(parseApproveRejectVerdict('approve')).toBe(true);
    expect(parseApproveRejectVerdict('reject')).toBe(false);
  });

  it('is case-insensitive with stray punctuation', () => {
    expect(parseApproveRejectVerdict('Approve.')).toBe(true);
    expect(parseApproveRejectVerdict('"REJECT"')).toBe(false);
  });

  it('accepts "yes"/"no"/"pass"/"fail" variants', () => {
    expect(parseApproveRejectVerdict('yes')).toBe(true);
    expect(parseApproveRejectVerdict('pass with flying colors')).toBe(true);
    expect(parseApproveRejectVerdict('no — too wordy')).toBe(false);
    expect(parseApproveRejectVerdict('fail')).toBe(false);
  });

  it('returns null on ambiguous replies', () => {
    expect(parseApproveRejectVerdict('meh')).toBeNull();
    expect(parseApproveRejectVerdict('')).toBeNull();
  });
});

describe('parseBestOfNChoice', () => {
  it('parses a single-letter reply', () => {
    expect(parseBestOfNChoice('B', ['A', 'B', 'C'])).toBe('B');
  });

  it('parses "Response X" style replies', () => {
    expect(parseBestOfNChoice('B is best', ['A', 'B', 'C'])).toBe('B');
    expect(parseBestOfNChoice('Response C', ['A', 'B', 'C'])).toBe('C');
  });

  it('scans tokens for an allowed label', () => {
    expect(parseBestOfNChoice('I pick A overall', ['A', 'B', 'C'])).toBe('A');
  });

  it('returns null when no allowed label is found', () => {
    expect(parseBestOfNChoice('None of them', ['A', 'B', 'C'])).toBeNull();
  });
});

describe('letterLabels', () => {
  it('produces A..J for n=10', () => {
    expect(letterLabels(5)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('parseMultiAxisScores', () => {
  const dims = [
    { key: 'tone', label: 'Tone', min: 1, max: 5 },
    { key: 'correctness', label: 'Correctness', min: 1, max: 5 },
  ];

  it('parses a clean JSON object', () => {
    const result = parseMultiAxisScores('{"tone": 4, "correctness": 5}', dims);
    expect(result).toEqual({ tone: 4, correctness: 5 });
  });

  it('extracts a JSON object buried in prose', () => {
    const result = parseMultiAxisScores(
      'Here are the scores: {"tone": 3, "correctness": 4} — overall solid.',
      dims,
    );
    expect(result).toEqual({ tone: 3, correctness: 4 });
  });

  it('rounds float replies to the nearest integer', () => {
    const result = parseMultiAxisScores(
      '{"tone": 3.7, "correctness": 4.2}',
      dims,
    );
    expect(result).toEqual({ tone: 4, correctness: 4 });
  });

  it('returns null if any dimension key is missing', () => {
    const result = parseMultiAxisScores('{"tone": 4}', dims);
    expect(result).toBeNull();
  });

  it('returns null if any score is out of range', () => {
    const result = parseMultiAxisScores(
      '{"tone": 4, "correctness": 10}',
      dims,
    );
    expect(result).toBeNull();
  });

  it('returns null on unparseable text', () => {
    expect(parseMultiAxisScores('not JSON', dims)).toBeNull();
  });
});

describe('cleanQualitativeFeedback', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanQualitativeFeedback('  hello\n\nworld  ')).toBe('hello world');
  });

  it('caps very long feedback with an explicit trunc marker', () => {
    const long = 'x'.repeat(3000);
    const result = cleanQualitativeFeedback(long);
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result.endsWith('[trunc]')).toBe(true);
  });

  it('leaves short feedback untouched', () => {
    expect(cleanQualitativeFeedback('tight prose')).toBe('tight prose');
  });
});
