/**
 * Extract recurring themes from a campaign's qualitative responses.
 *
 * Inspired by the reuse-kit's `high-signal-memory-extraction` pattern
 * (kit path: ready/../high-signal-memory-extraction) — the kit's
 * concept of "distill structured signal from free-text" fits here,
 * but its regex patterns target personal-memory domains (preferences,
 * goals, relationships) that don't apply to model-evaluation feedback.
 *
 * Instead, this module uses n-gram frequency with stopword filtering:
 * count 1-3 word phrases across all responses, drop common stopwords,
 * and return top-N themes with representative excerpts.
 *
 * Tuning knobs (leave as module constants for now; move to options if
 * the results need per-campaign tuning):
 *   - MIN_PHRASE_COUNT: minimum occurrences before a theme surfaces
 *   - MIN_RESPONSE_COUNT: minimum qualitative responses required
 *   - TOP_N: how many themes to return
 *   - STOPWORDS: filtered phrases (English; extend if multilingual use
 *     becomes important)
 */

export interface QualitativeThemeInput {
  text: string;
}

export interface QualitativeTheme {
  /** The n-gram phrase (1..3 words) that appeared repeatedly. */
  phrase: string;
  /** How many distinct responses contained this phrase. */
  responseCount: number;
  /** A representative excerpt from one of the responses. */
  excerpt: string;
  /** Relative salience: responseCount × averageResponseLength, used for ordering. */
  score: number;
}

/**
 * Minimum number of distinct responses a phrase must appear in before
 * we surface it as a theme. Lower → noisier, higher → misses early
 * signal. 3 works well for campaigns with 10-50 responses.
 */
const MIN_PHRASE_COUNT = 3;

/** Don't surface themes unless there are at least this many responses. */
const MIN_RESPONSE_COUNT = 5;

/** Cap themes returned; ordered by score descending. */
const TOP_N = 10;

/**
 * English stopwords. Filter single-word phrases against this list;
 * drop bi/tri-grams if they START or END with a stopword (a common
 * anti-pattern: phrases like "the model", "was very" aren't themes).
 */
const STOPWORDS = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'do',
  'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his',
  'i', 'if', 'in', 'is', 'it', 'its', "it's", 'me', 'my', 'no', 'not',
  'of', 'on', 'or', 'she', 'so', 'than', 'that', 'the', 'their', 'them',
  'they', 'this', 'to', 'too', 'up', 'us', 'very', 'was', 'we', 'were',
  'what', 'when', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
  'would', 'could', 'should', 'can', 'also', 'just', 'like', 'more',
  'one', 'two', 'three', 'there', 'those', 'these', 'about', 'some',
  'any', 'all', 'any', 'only', 'over', 'such', 'into', 'out',
]);

const WORD_RE = /[a-z][a-z'-]*/g;

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  return Array.from(lower.matchAll(WORD_RE), (m) => m[0]);
}

function isUsefulWord(word: string): boolean {
  if (word.length < 3) return false;
  if (STOPWORDS.has(word)) return false;
  return true;
}

function edgesAreStopwords(phrase: string): boolean {
  const [first, , last] = splitFirstMiddleLast(phrase);
  return STOPWORDS.has(first) || STOPWORDS.has(last);
}

function splitFirstMiddleLast(
  phrase: string,
): [string, string | undefined, string] {
  const words = phrase.split(' ');
  if (words.length === 1) return [words[0]!, undefined, words[0]!];
  if (words.length === 2) return [words[0]!, undefined, words[1]!];
  return [words[0]!, words[1]!, words[words.length - 1]!];
}

function extractNGrams(
  tokens: string[],
  minN: number,
  maxN: number,
): string[] {
  const grams: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slice = tokens.slice(i, i + n);
      const phrase = slice.join(' ');
      if (n === 1) {
        if (isUsefulWord(slice[0]!)) grams.push(phrase);
      } else {
        // Drop n-grams whose endpoints are stopwords; keep interior
        // stopwords (e.g. "cost of tokens" is fine).
        if (!edgesAreStopwords(phrase)) grams.push(phrase);
      }
    }
  }
  return grams;
}

export function extractQualitativeThemes(
  responses: ReadonlyArray<QualitativeThemeInput>,
): QualitativeTheme[] {
  if (responses.length < MIN_RESPONSE_COUNT) return [];

  // Per-phrase: {count: distinct responses, excerpt: first full response
  // the phrase appeared in}.
  const phraseStats = new Map<
    string,
    { responseCount: number; excerpt: string }
  >();

  for (const r of responses) {
    const tokens = tokenize(r.text);
    if (tokens.length === 0) continue;
    const phrases = new Set(extractNGrams(tokens, 1, 3));
    for (const phrase of phrases) {
      const existing = phraseStats.get(phrase);
      if (existing) {
        existing.responseCount += 1;
      } else {
        phraseStats.set(phrase, {
          responseCount: 1,
          excerpt: r.text.length > 120 ? r.text.slice(0, 117) + '…' : r.text,
        });
      }
    }
  }

  const avgResponseLength =
    responses.reduce((sum, r) => sum + r.text.length, 0) /
    Math.max(1, responses.length);

  const themes: QualitativeTheme[] = [];
  for (const [phrase, stat] of phraseStats.entries()) {
    if (stat.responseCount < MIN_PHRASE_COUNT) continue;
    themes.push({
      phrase,
      responseCount: stat.responseCount,
      excerpt: stat.excerpt,
      score: stat.responseCount * avgResponseLength,
    });
  }

  // Drop overlapping phrases: if a 3-gram has the same responseCount
  // as its containing 1-gram (same responses), prefer the longer phrase
  // (more specific). This is a cheap de-duplication that keeps the
  // stronger signal without merging across unrelated phrasings.
  const byPhrase = new Map(themes.map((t) => [t.phrase, t]));
  const toRemove = new Set<string>();
  for (const t of themes) {
    const words = t.phrase.split(' ');
    if (words.length === 1) continue;
    for (const word of words) {
      const single = byPhrase.get(word);
      if (single && single.responseCount === t.responseCount) {
        toRemove.add(word);
      }
    }
  }

  return themes
    .filter((t) => !toRemove.has(t.phrase))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}
