/**
 * Tests the qualitative-theme extractor that surfaces recurring feedback
 * patterns in a campaign's free-text responses. Heuristic, not LLM —
 * calibrated to common model-eval feedback vocabulary.
 */
import { describe, it, expect } from 'vitest';
import { extractQualitativeThemes } from '../lib/qualitative-themes.js';

describe('extractQualitativeThemes', () => {
  it('returns empty when fewer than MIN_RESPONSE_COUNT responses', () => {
    const themes = extractQualitativeThemes([
      { text: 'too verbose' },
      { text: 'loved it' },
    ]);
    expect(themes).toEqual([]);
  });

  it('surfaces phrases that appear in >= 3 responses', () => {
    const themes = extractQualitativeThemes([
      { text: 'Model was too verbose and repeated itself' },
      { text: 'Very verbose output, could be shorter' },
      { text: 'Too verbose; trimmed the filler and it was fine' },
      { text: 'Concise answer, good response' },
      { text: 'Short and sweet' },
    ]);
    const phrases = themes.map((t) => t.phrase);
    expect(phrases).toContain('verbose');
  });

  it('ignores stopwords even if they occur frequently', () => {
    const themes = extractQualitativeThemes([
      { text: 'The model was good and it was helpful' },
      { text: 'The model was great and it helped a lot' },
      { text: 'The model was fine and it was useful' },
      { text: 'The model was okay and it was adequate' },
      { text: 'The model was subpar and it was slow' },
    ]);
    for (const t of themes) {
      // Edge words should never be stopwords in n-grams.
      const words = t.phrase.split(' ');
      expect(['the', 'was', 'it', 'and', 'a']).not.toContain(words[0]);
      expect(['the', 'was', 'it', 'and', 'a']).not.toContain(
        words[words.length - 1],
      );
    }
  });

  it('orders themes by score (responseCount × avg response length)', () => {
    // "hallucination" appears 4 times, "slow" 3 times. Hallucination
    // should rank first.
    const responses = [
      { text: 'The answer had a hallucination about the API' },
      { text: 'Spotted a hallucination in the citation' },
      { text: 'Clear hallucination in the dates' },
      { text: 'Another hallucination, this time the name' },
      { text: 'It was slow to respond' },
      { text: 'Very slow generation time' },
      { text: 'Slow but accurate' },
    ];
    const themes = extractQualitativeThemes(responses);
    const halIdx = themes.findIndex((t) => t.phrase === 'hallucination');
    const slowIdx = themes.findIndex((t) => t.phrase === 'slow');
    expect(halIdx).toBeGreaterThanOrEqual(0);
    expect(slowIdx).toBeGreaterThan(halIdx);
  });

  it('attaches a representative excerpt and responseCount', () => {
    const themes = extractQualitativeThemes([
      { text: 'Wrong tone in the response' },
      { text: 'Very wrong tone for an enterprise customer' },
      { text: 'The tone felt wrong and cold' },
      { text: 'Tone was off, felt wrong' },
      { text: 'Something else entirely' },
    ]);
    const wrong = themes.find((t) => t.phrase === 'wrong');
    if (wrong) {
      expect(wrong.responseCount).toBeGreaterThanOrEqual(3);
      expect(wrong.excerpt).toBeTruthy();
      expect(wrong.excerpt.length).toBeLessThanOrEqual(120);
    }
  });
});
