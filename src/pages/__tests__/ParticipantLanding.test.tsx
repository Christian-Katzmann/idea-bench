import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ParticipantLanding from '../ParticipantLanding';
import { installMockFetch } from '../../test/mockFetch';
import { ThemeProvider } from '../../components/ThemeProvider';

function renderLanding(slug = 'this-slug-does-not-exist') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[`/vote/${slug}`]}>
          <Routes>
            <Route path="/vote/:slug" element={<ParticipantLanding />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('ParticipantLanding — unknown slug (F-004)', () => {
  it('shows human-voice copy and no raw HTTP status when the campaign is missing', async () => {
    installMockFetch([
      {
        method: 'GET',
        url: '/api/vote/this-slug-does-not-exist',
        status: 404,
        body: { error: 'campaign not found' },
      },
    ]);

    renderLanding();

    await waitFor(() => {
      expect(
        screen.getByText(
          /This voting link isn't available anymore — ask whoever sent it to share a new one\./i,
        ),
      ).toBeInTheDocument();
    });

    // Implementation detail must not leak.
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Can't load this campaign/i)).not.toBeInTheDocument();
  });

  it('keeps the technical fallback for non-404 errors', async () => {
    installMockFetch([
      {
        method: 'GET',
        url: '/api/vote/this-slug-does-not-exist',
        status: 500,
        body: { error: 'database is on fire' },
      },
    ]);

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText(/Can't load this campaign/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/database is on fire/i)).toBeInTheDocument();
  });
});
