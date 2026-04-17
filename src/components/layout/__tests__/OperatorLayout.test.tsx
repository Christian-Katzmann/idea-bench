import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperatorLayout from '../OperatorLayout';
import { renderWithRouter } from '../../../test/renderWithProviders';
import { installMockFetch } from '../../../test/mockFetch';

describe('OperatorLayout', () => {
  it('renders real destinations for every operator nav item', () => {
    renderWithRouter(
      <OperatorLayout>
        <div>body</div>
      </OperatorLayout>,
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: /campaigns/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: /team activity/i }),
    ).toHaveAttribute('href', '/team-activity');
    expect(
      screen.getByRole('link', { name: /model library/i }),
    ).toHaveAttribute('href', '/models');
    expect(
      screen.getByRole('link', { name: /api settings/i }),
    ).toHaveAttribute('href', '/settings/api');
    expect(screen.getByRole('link', { name: /^modelarena$/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('marks the active operator section in the sidebar', () => {
    renderWithRouter(
      <OperatorLayout>
        <div>body</div>
      </OperatorLayout>,
      { route: '/dashboard' },
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /campaigns/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('lets the operator log out from the sidebar', async () => {
    const user = userEvent.setup();
    const fetchMock = installMockFetch([
      {
        method: 'POST',
        url: '/api/auth/logout',
        body: { ok: true },
      },
    ]);

    renderWithRouter(
      <OperatorLayout>
        <div>body</div>
      </OperatorLayout>,
      { route: '/dashboard' },
    );

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
