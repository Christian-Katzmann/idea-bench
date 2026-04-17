import { screen } from '@testing-library/react';
import OperatorLayout from '../OperatorLayout';
import { renderWithRouter } from '../../../test/renderWithProviders';

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
  });
});
