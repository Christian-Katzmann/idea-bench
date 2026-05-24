import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../app-shell';
import { ThemeProvider } from '../../ThemeProvider';
import { renderWithRouter } from '../../../test/renderWithProviders';
import { installMockFetch } from '../../../test/mockFetch';

function renderShell(route = '/') {
  return renderWithRouter(
    <ThemeProvider defaultTheme="light">
      <AppShell breadcrumb={[{ label: 'Dashboard' }]}>
        <div>body</div>
      </AppShell>
    </ThemeProvider>,
    { route },
  );
}

/**
 * The shell renders the sidebar twice — once in the fixed desktop <aside>,
 * once inside the mobile drawer — because both are present in the DOM
 * (CSS hides one or the other depending on viewport). Testing Library
 * can't distinguish by CSS, so every assertion that touches a nav link
 * scopes itself via `within(sidebar)` using the desktop aside.
 */
function getDesktopSidebar() {
  return screen.getByRole('complementary');
}

describe('AppShell', () => {
  it('renders real destinations for every operator nav item', () => {
    renderShell();
    const sidebar = within(getDesktopSidebar());

    expect(sidebar.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(sidebar.getByRole('link', { name: /campaigns/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      sidebar.getByRole('link', { name: /team activity/i }),
    ).toHaveAttribute('href', '/team-activity');
    expect(sidebar.getByRole('link', { name: /^models$/i })).toHaveAttribute(
      'href',
      '/models',
    );
    expect(
      sidebar.getByRole('link', { name: /api settings/i }),
    ).toHaveAttribute('href', '/settings/api');
  });

  it('marks the active operator section in the sidebar', () => {
    renderShell('/dashboard');
    const sidebar = within(getDesktopSidebar());

    expect(sidebar.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      sidebar.getByRole('link', { name: /campaigns/i }),
    ).not.toHaveAttribute('aria-current');
  });

  it('lets the operator sign out from the avatar menu', async () => {
    const user = userEvent.setup();
    const fetchMock = installMockFetch([
      {
        method: 'POST',
        url: '/api/auth/logout',
        body: { ok: true },
      },
    ]);

    renderShell('/dashboard');

    // Avatar button opens the menu; Sign out is the destructive row.
    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renders the idea-bench breadcrumb root linking to /', () => {
    renderShell('/dashboard');

    // Breadcrumb root is inside the <nav aria-label="Breadcrumb"> region.
    const breadcrumb = within(screen.getByRole('navigation', { name: /breadcrumb/i }));
    expect(breadcrumb.getByRole('link', { name: /idea-bench/i })).toHaveAttribute(
      'href',
      '/',
    );
    // The current page label appears as text (no link) in the same region.
    expect(breadcrumb.getByText(/^dashboard$/i)).toBeInTheDocument();
  });
});
