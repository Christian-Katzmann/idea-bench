/**
 * The shape an arena takes — what's being compared head-to-head. Today
 * only `model` is wired through the rest of the app; `prompt` and
 * `system_prompt` are placeholders for the upcoming arena-mode work,
 * already typed here so the next session can land them by importing
 * this constant rather than re-introducing the union.
 */
export type ArenaKind = 'model' | 'prompt' | 'system_prompt';
