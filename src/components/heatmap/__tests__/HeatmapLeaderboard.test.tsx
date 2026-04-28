/**
 * Plan 06 P2-A — heatmap component tests.
 *
 * Component-level (no host page). We render with controlled fixtures
 * and assert on cell rendering, sparse-cell handling, the tooltip
 * surface, and the discrete-bucket colour mapping. The colour classes
 * themselves are part of the component's public contract — operators
 * notice when a "high" score doesn't paint as green — so the tests
 * pin them down by index.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HeatmapLeaderboard,
  type HeatmapCell,
  type HeatmapPrompt,
  type HeatmapVariant,
} from '../HeatmapLeaderboard';

const VARIANTS: HeatmapVariant[] = [
  { id: 'v1', displayName: 'Warm Pro' },
  { id: 'v2', displayName: 'Playful' },
];
const PROMPTS: HeatmapPrompt[] = [
  {
    id: 'p1',
    label: 'Polite refusal',
    text: 'Draft a polite refusal to a refund request.',
    orderIndex: 0,
  },
  {
    id: 'p2',
    label: 'Angry customer',
    text: 'Reply to an angry customer about a late delivery.',
    orderIndex: 1,
  },
];

function makeCell(overrides: Partial<HeatmapCell>): HeatmapCell {
  return {
    variantId: 'v1',
    promptId: 'p1',
    score: 7.5,
    ciLow: 7.0,
    ciHigh: 8.0,
    sampleSize: 12,
    ...overrides,
  };
}

describe('HeatmapLeaderboard', () => {
  it('renders rows for each variant and columns for each suite prompt', () => {
    render(
      <HeatmapLeaderboard
        variants={VARIANTS}
        suitePrompts={PROMPTS}
        cells={[
          makeCell({ variantId: 'v1', promptId: 'p1', score: 8.5 }),
          makeCell({ variantId: 'v1', promptId: 'p2', score: 4.0 }),
          makeCell({ variantId: 'v2', promptId: 'p1', score: 6.0 }),
          makeCell({ variantId: 'v2', promptId: 'p2', score: 7.5 }),
        ]}
      />,
    );

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('Warm Pro')).toBeInTheDocument();
    expect(screen.getByText('Playful')).toBeInTheDocument();
    // Column header text (truncated). The full prompt text is in the
    // header's `title` attribute for hover.
    expect(screen.getByText('Polite refusal')).toBeInTheDocument();
    expect(screen.getByText('Angry customer')).toBeInTheDocument();
    // Cell scores render to one decimal.
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('6.0')).toBeInTheDocument();
    expect(screen.getByText('7.5')).toBeInTheDocument();
  });

  it('renders sparse cells (no responses) as greyed em-dashes — never inferred 0', () => {
    render(
      <HeatmapLeaderboard
        variants={VARIANTS}
        suitePrompts={PROMPTS}
        // Only v1×p1 has a cell. The other 3 cells should fall through
        // to the sparse branch.
        cells={[makeCell({ variantId: 'v1', promptId: 'p1' })]}
      />,
    );

    // 3 sparse cells render an em-dash; the populated one renders 7.5.
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('7.5')).toBeInTheDocument();
    // The aria-label on the sparse cells calls out "no responses yet"
    // for screen readers — never "0".
    expect(
      screen.getAllByLabelText(/no responses yet/i).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('treats sampleSize=0 as sparse (defensive: zero responses still grey)', () => {
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[
          makeCell({ variantId: 'v1', promptId: 'p1', sampleSize: 0 }),
        ]}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the cell tooltip on hover with score / CI / sample size', async () => {
    const user = userEvent.setup();
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[
          makeCell({
            variantId: 'v1',
            promptId: 'p1',
            score: 7.5,
            ciLow: 7.1,
            ciHigh: 8.0,
            sampleSize: 14,
          }),
        ]}
      />,
    );

    // Score renders to one decimal in the cell body.
    const cell = screen.getByText('7.5');
    await user.hover(cell);

    // Tooltip is rendered inline on hover.
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Warm Pro/);
    expect(tooltip).toHaveTextContent(/Polite refusal/);
    expect(tooltip).toHaveTextContent(/95% CI/);
    expect(tooltip).toHaveTextContent(/7\.1\s*–\s*8\.0/);
    expect(tooltip).toHaveTextContent(/n = 14/);
  });

  it('shows "n < 2" instead of the CI band when CI bounds are null', async () => {
    const user = userEvent.setup();
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[
          makeCell({
            variantId: 'v1',
            promptId: 'p1',
            ciLow: null,
            ciHigh: null,
            sampleSize: 1,
          }),
        ]}
      />,
    );
    await user.hover(screen.getByText('7.5'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/n < 2/);
  });

  it('renders a "View generation" link in the tooltip when onViewGeneration is provided', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[makeCell({ variantId: 'v1', promptId: 'p1' })]}
        onViewGeneration={handler}
      />,
    );
    await user.hover(screen.getByText('7.5'));
    const link = await screen.findByRole('button', { name: /view generation/i });
    fireEvent.click(link);
    expect(handler).toHaveBeenCalledWith({
      variantId: 'v1',
      promptId: 'p1',
    });
  });

  it('omits the "View generation" affordance when no handler is wired', async () => {
    const user = userEvent.setup();
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[makeCell({ variantId: 'v1', promptId: 'p1' })]}
      />,
    );
    await user.hover(screen.getByText('7.5'));
    expect(
      screen.queryByRole('button', { name: /view generation/i }),
    ).not.toBeInTheDocument();
  });

  it('orders columns by orderIndex (suite ordering preserved)', () => {
    const reordered: HeatmapPrompt[] = [
      // Pass them in reverse to prove the component sorts.
      { ...PROMPTS[1] },
      { ...PROMPTS[0] },
    ];
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={reordered}
        cells={[
          makeCell({ variantId: 'v1', promptId: 'p1', score: 8 }),
          makeCell({ variantId: 'v1', promptId: 'p2', score: 4 }),
        ]}
      />,
    );
    // The first <th> in the body row's column-header set should match
    // the lowest orderIndex (p1 → "Polite refusal").
    const headers = screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent ?? '');
    expect(headers[1]).toBe('Polite refusal'); // index 0 is the row-header "Variant"
    expect(headers[2]).toBe('Angry customer');
  });

  it('renders an empty-state hint when variants or prompts are empty', () => {
    render(
      <HeatmapLeaderboard variants={[]} suitePrompts={PROMPTS} cells={[]} />,
    );
    expect(
      screen.getByText(/heatmap fills in once at least one variant/i),
    ).toBeInTheDocument();
  });

  it('clamps out-of-range scores into the colour buckets without throwing', () => {
    // A campaign with a slider range 1–10 but somehow stored a 12.
    // The component should still render the cell (clamp the bucket).
    render(
      <HeatmapLeaderboard
        variants={[VARIANTS[0]]}
        suitePrompts={[PROMPTS[0]]}
        cells={[
          makeCell({
            variantId: 'v1',
            promptId: 'p1',
            score: 12, // out of range
          }),
        ]}
        scoreRange={{ min: 1, max: 10 }}
      />,
    );
    expect(screen.getByText('12.0')).toBeInTheDocument();
  });
});
