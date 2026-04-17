import { useEffect } from 'react';
import { buildDocumentTitle } from '../lib/branding';

export function useDocumentTitle(section?: string | null) {
  useEffect(() => {
    document.title = buildDocumentTitle(section);
  }, [section]);
}
