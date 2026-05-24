export const APP_NAME = 'ïdea Bench';

export function buildDocumentTitle(section?: string | null) {
  const trimmed = section?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
}
