export const APP_NAME = 'ModelArena';

export function buildDocumentTitle(section?: string | null) {
  const trimmed = section?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
}
