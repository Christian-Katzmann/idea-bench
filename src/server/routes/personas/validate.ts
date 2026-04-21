/**
 * Input validation for persona create/update. The field caps are loose
 * enough for genuine editorial content but tight enough to protect
 * against malformed JSON and runaway text (persona prompts become LLM
 * input verbatim — a 100k-character prompt is a cost bomb).
 */
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_SYSTEM_PROMPT_LENGTH = 4000;
const MAX_BULLET_LENGTH = 200;
const MAX_BULLET_COUNT = 20;
const MAX_TAG_LENGTH = 40;
const MAX_TAG_COUNT = 12;

export interface ValidatedPersonaInput {
  name: string;
  description: string;
  systemPrompt: string;
  priorities: string[];
  antiPatterns: string[];
  tags: string[];
  derivedFromPersonaId: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidatedPersonaInput }
  | { ok: false; error: string };

export function validatePersonaInput(
  input: unknown,
  { allowPartial = false }: { allowPartial?: boolean } = {},
): ValidationResult {
  if (typeof input !== 'object' || input === null)
    return { ok: false, error: 'body must be an object' };
  const o = input as Record<string, unknown>;

  const pick = (key: string): string | undefined => {
    const v = o[key];
    if (typeof v !== 'string') return undefined;
    return v.trim();
  };

  const name = pick('name');
  const description = pick('description');
  const systemPrompt = pick('systemPrompt');

  if (!allowPartial) {
    if (!name) return { ok: false, error: 'name is required' };
    if (!description)
      return { ok: false, error: 'description is required' };
    if (!systemPrompt)
      return { ok: false, error: 'systemPrompt is required' };
  }

  if (name !== undefined && name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `name must be ≤ ${MAX_NAME_LENGTH} characters`,
    };
  }
  if (
    description !== undefined &&
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return {
      ok: false,
      error: `description must be ≤ ${MAX_DESCRIPTION_LENGTH} characters`,
    };
  }
  if (
    systemPrompt !== undefined &&
    systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH
  ) {
    return {
      ok: false,
      error: `systemPrompt must be ≤ ${MAX_SYSTEM_PROMPT_LENGTH} characters`,
    };
  }

  const parseList = (key: string, maxLen: number) => {
    const raw = o[key];
    if (raw == null) return [];
    if (!Array.isArray(raw)) return { error: `${key} must be an array` };
    if (raw.length > MAX_BULLET_COUNT)
      return { error: `${key} cannot have more than ${MAX_BULLET_COUNT} entries` };
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') return { error: `${key} must be strings` };
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (trimmed.length > maxLen)
        return {
          error: `${key} entry must be ≤ ${maxLen} characters: ${trimmed.slice(0, 30)}…`,
        };
      out.push(trimmed);
    }
    return out;
  };

  const priorities = parseList('priorities', MAX_BULLET_LENGTH);
  if (!Array.isArray(priorities)) return { ok: false, error: priorities.error };

  const antiPatterns = parseList('antiPatterns', MAX_BULLET_LENGTH);
  if (!Array.isArray(antiPatterns))
    return { ok: false, error: antiPatterns.error };

  // Tags are shorter + we cap the array tighter.
  const tagsRaw = o.tags;
  let tags: string[] = [];
  if (tagsRaw != null) {
    if (!Array.isArray(tagsRaw))
      return { ok: false, error: 'tags must be an array' };
    if (tagsRaw.length > MAX_TAG_COUNT)
      return {
        ok: false,
        error: `tags cannot have more than ${MAX_TAG_COUNT} entries`,
      };
    for (const raw of tagsRaw) {
      if (typeof raw !== 'string')
        return { ok: false, error: 'tags must be strings' };
      const trimmed = raw.trim().toLowerCase();
      if (!trimmed) continue;
      if (trimmed.length > MAX_TAG_LENGTH)
        return {
          ok: false,
          error: `tag must be ≤ ${MAX_TAG_LENGTH} characters: ${trimmed.slice(0, 30)}…`,
        };
      tags.push(trimmed);
    }
    tags = Array.from(new Set(tags));
  }

  const derivedRaw = o.derivedFromPersonaId;
  const derivedFromPersonaId =
    typeof derivedRaw === 'string' && derivedRaw.trim() ? derivedRaw : null;

  return {
    ok: true,
    value: {
      name: name ?? '',
      description: description ?? '',
      systemPrompt: systemPrompt ?? '',
      priorities,
      antiPatterns,
      tags,
      derivedFromPersonaId,
    },
  };
}
