import { screen } from '@testing-library/react';
import OperatorLogin from '../OperatorLogin';
import { renderWithRouter } from '../../test/renderWithProviders';

describe('OperatorLogin', () => {
  it('sets an operator-specific document title', () => {
    renderWithRouter(<OperatorLogin />, { route: '/login' });

    expect(screen.getByRole('heading', { name: /ïdea Bench/i })).toBeInTheDocument();
    expect(document.title).toBe('Sign in · ïdea Bench');
  });
});
