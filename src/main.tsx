import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Operator and participant data changes slowly — a 30s window
      // reuses responses without feeling stale. Individual queries can
      // override with `staleTime: 0` when they need immediate refetch
      // (e.g., /next after submitting a vote).
      staleTime: 30_000,
      // Don't retry 4xx errors — they're almost always programmer or
      // auth issues where retrying just delays the real response.
      retry: (failureCount, error) => {
        if (error instanceof Error && /^4\d\d/.test(error.message)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
