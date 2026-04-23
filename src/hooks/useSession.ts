import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export type AiAccess = 'allowed' | 'not_configured' | 'forbidden';

export interface Session {
  identity: string;
  method: 'password' | 'github' | 'email';
  aiAccess: AiAccess;
}

/**
 * Reads the current operator's identity + AI-access state from
 * `/api/auth/me`. Used by spend-triggering UI (simulated runs) to hide
 * controls for operators who can browse the app but not run AI.
 *
 * The server-side gate in `withAIOperator` is the real boundary — this
 * hook is UX polish. `aiAccess === 'allowed'` → show run buttons;
 * anything else → hide or disable them.
 */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiFetch<Session>('/api/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
