import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCampaign, {
  CostPreviewCard,
  PersonaPanelCard,
} from '../CreateCampaign';
import { renderWithRouter } from '../../test/renderWithProviders';
import { installMockFetch } from '../../test/mockFetch';
import {
  fakeGenerationStream,
  type FakeSlotEvent,
} from '../../test/fakeGeneration';

const modelsFixture = {
  rows: [
    {
      id: '1',
      displayName: 'GPT-5',
      providerModelId: 'openai/gpt-5',
      enabled: true,
      legacy: false,
      availability: 'enabled',
      usage: { campaigns: 1, activeCampaigns: 1, completedCampaigns: 0 },
      performance: {
        wins: 1,
        losses: 0,
        ties: 0,
        comparisons: 1,
        winRate: 1,
        averageRating: 1100,
      },
      footprint: [],
      recommendation: 'Strong generalist',
    },
    {
      id: '2',
      displayName: 'Llama 4',
      providerModelId: 'meta-llama/llama-4',
      enabled: false,
      legacy: false,
      availability: 'disabled',
      usage: { campaigns: 0, activeCampaigns: 0, completedCampaigns: 0 },
      performance: {
        wins: 0,
        losses: 0,
        ties: 0,
        comparisons: 0,
        winRate: null,
        averageRating: null,
      },
      footprint: [],
      recommendation: 'Untested',
    },
  ],
  summary: {
    totalModels: 2,
    enabled: 1,
    disabled: 1,
    legacy: 0,
    inUse: 1,
  },
  guidance: {
    recommendedIds: ['1'],
    note: 'Keep GPT-5 enabled.',
  },
};

describe('CreateCampaign', () => {
  it('only shows enabled non-legacy models in the campaign model selector', async () => {
    const user = userEvent.setup();
    installMockFetch([{ url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture }]);

    renderWithRouter(<CreateCampaign />);

    // Step 0 (Plan 04) — Kind picker. `Model arena` is selected by
    // default, so a single Next click advances to Basics without
    // changing anything else.
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.type(screen.getByLabelText(/campaign name/i), 'Test campaign');
    await user.click(screen.getByRole('button', { name: /next/i }));
    // Simple is the default authoring mode now; the "Prompt text"
    // textarea is what populates `text` for the LLM. Advanced mode
    // exposes Instructions / Input / Output-format as separate fields,
    // but it's opt-in.
    await user.type(
      screen.getByLabelText(/prompt text/i),
      'Compare these responses',
    );
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(/^GPT-5$/)).toBeInTheDocument();
    expect(screen.queryByText(/llama 4/i)).not.toBeInTheDocument();
  });

  // Plan 04 — Step 0 surface tests. Plans 05 and 06 have flipped
  // their flags; the "Coming soon" badge no longer appears in Step 0.
  describe('Step 0 — kind picker', () => {
    it('renders all three arena kinds, all enabled', async () => {
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      const modelOption = screen.getByRole('radio', { name: /model arena/i });
      const promptOption = screen.getByRole('radio', { name: /^prompt arena/i });
      const sysPromptOption = screen.getByRole('radio', {
        name: /system-prompt arena/i,
      });

      expect(modelOption).toBeEnabled();
      expect(modelOption).toHaveAttribute('aria-checked', 'true');
      expect(promptOption).toBeEnabled();
      expect(promptOption).toHaveAttribute('aria-checked', 'false');
      // Plan 06 — system_prompt is now enabled.
      expect(sysPromptOption).toBeEnabled();
      expect(sysPromptOption).toHaveAttribute('aria-checked', 'false');

      // No "Coming soon" badges remain in Step 0 — both Plan 05's
      // and Plan 06's flips removed them. (The cross-model toggle
      // inside Step 3's Advanced disclosure still carries one, but
      // that lives further down the wizard.)
      expect(screen.queryAllByText(/coming soon/i)).toHaveLength(0);
    });

    it('selects prompt-arena and advances past Step 0', async () => {
      const user = userEvent.setup();
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      const promptOption = screen.getByRole('radio', { name: /^prompt arena/i });
      await user.click(promptOption);
      expect(promptOption).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
    });

    it('selects system-prompt-arena and advances past Step 0', async () => {
      const user = userEvent.setup();
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      const sysPromptOption = screen.getByRole('radio', {
        name: /system-prompt arena/i,
      });
      await user.click(sysPromptOption);
      expect(sysPromptOption).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
    });
  });

  // Plan 05 P1-A — variants step + pinned-model picker + Advanced
  // disclosure. We drive the wizard from Step 0 through Step 3 and
  // assert the prompt-arena surface area matches the PRD.
  describe("Step 3 — variants (kind='prompt')", () => {
    /**
     * Walks the wizard from Step 0 through to Step 3 (Variants) for a
     * prompt arena: pick prompt kind, fill name, breeze through inputs
     * with a single fragment, advance to variants. Returns the
     * userEvent instance so the caller can drive further interactions.
     */
    async function advanceToVariants() {
      const user = userEvent.setup();
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      // Step 0 — pick prompt arena.
      await user.click(
        screen.getByRole('radio', { name: /^prompt arena/i }),
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 1 — name.
      await user.type(
        screen.getByLabelText(/campaign name/i),
        'Prompt arena P1-A test',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 2 — Inputs. Fill the seed with a fragment so canProgress
      // gates true. The "Inputs" h2 is the canonical proof we landed
      // on the right step (the stepper shows it too, hence role=heading).
      expect(
        await screen.findByRole('heading', { name: /^inputs$/i }),
      ).toBeInTheDocument();
      // PromptDraft seed defaults `mode` to 'simple', so the textarea
      // is "Prompt text" — the same primitive the model-arena flow
      // uses, just under the "Inputs" header.
      await user.type(
        screen.getByLabelText(/prompt text/i),
        'Translate to French.',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      return { user };
    }

    it('renders 2 default variants and a pinned-model picker', async () => {
      await advanceToVariants();

      expect(
        await screen.findByRole('heading', { name: /^variants$/i }),
      ).toBeInTheDocument();

      // Two default display-name inputs ("Variant 1", "Variant 2") —
      // proves the MIN_VARIANTS=2 seed.
      expect(
        screen.getByLabelText(/variant 1 display name/i),
      ).toHaveValue('Variant 1');
      expect(
        screen.getByLabelText(/variant 2 display name/i),
      ).toHaveValue('Variant 2');

      // Pinned-model picker — single <select>, defaults to the most-
      // used selectable model. The fixture only has GPT-5 enabled, so
      // it should be the default.
      const picker = screen.getByLabelText(/pinned model/i) as HTMLSelectElement;
      expect(picker).toBeInTheDocument();
      expect(picker.value).toBe('openai/gpt-5');
    });

    it('keeps Next disabled until at least 2 variants have text', async () => {
      const { user } = await advanceToVariants();

      const next = screen.getByRole('button', { name: /next/i });
      // Both variants empty by default → Next disabled.
      expect(next).toBeDisabled();

      // Filling just one variant keeps Next disabled (need ≥ MIN_VARIANTS).
      await user.type(
        screen.getByLabelText(/variant text/i, { selector: '#variant-text-0' }),
        'You are a senior reviewer. {{input}}',
      );
      expect(next).toBeDisabled();

      await user.type(
        screen.getByLabelText(/variant text/i, { selector: '#variant-text-1' }),
        'You are a junior reviewer. {{input}}',
      );
      expect(next).toBeEnabled();
    });

    it('Advanced disclosure expands and exposes the three controls', async () => {
      const { user } = await advanceToVariants();

      // Closed by default — controls aren't in the DOM.
      expect(
        screen.queryByLabelText(/pinned system prompt/i),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /advanced settings/i }));

      // All three: pinned system prompt, standalone variants, cross-model.
      expect(
        screen.getByLabelText(/pinned system prompt/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: /standalone variants/i }),
      ).toBeEnabled();

      // Cross-model is disabled with a "Coming soon" badge.
      const crossModel = screen.getByRole('checkbox', {
        name: /run across multiple models/i,
      });
      expect(crossModel).toBeDisabled();
      expect(crossModel).not.toBeChecked();
    });

    it('Standalone toggle disables the inputs step (banner + opacity)', async () => {
      const { user } = await advanceToVariants();

      await user.click(screen.getByRole('button', { name: /advanced settings/i }));
      await user.click(
        screen.getByRole('checkbox', { name: /standalone variants/i }),
      );

      // Go back to Step 2 (Inputs). The wizard's Back button is in the
      // shared footer.
      await user.click(screen.getByRole('button', { name: /back/i }));

      // Banner explains the relationship — the exact text on the
      // bold lead phrase (avoids matching the parent div + span pair).
      expect(
        screen.getByText('Standalone variants is on.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/inputs are ignored — variants run as-is/i),
      ).toBeInTheDocument();
    });
  });

  // Plan 06 P1-A — system-prompt arena UI surface. Walks the wizard
  // from Step 0 to Step 3 and pins down the per-kind differences vs.
  // the prompt-arena flow tested above.
  describe("Step 2 + 3 — system-prompt arena (kind='system_prompt')", () => {
    /**
     * Walk Step 0 → 1 → 2 for a system-prompt arena and stop at the
     * suite step. The caller then drives further interactions.
     */
    async function advanceToSuite() {
      const user = userEvent.setup();
      installMockFetch([
        { url: '/api/operator/models?status=enabled&sort=name', body: modelsFixture },
      ]);
      renderWithRouter(<CreateCampaign />);

      // Step 0 — pick system-prompt arena.
      await user.click(
        screen.getByRole('radio', { name: /system-prompt arena/i }),
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 1 — name.
      await user.type(
        screen.getByLabelText(/campaign name/i),
        'System-prompt arena P1-A test',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 2 — Test prompts (suite). The "Test prompts (suite)" h2
      // is the canonical proof we landed on the right step.
      expect(
        await screen.findByRole('heading', { name: /^test prompts \(suite\)$/i }),
      ).toBeInTheDocument();

      return { user };
    }

    /** Continues from advanceToSuite by filling 3 prompts and clicking Next. */
    async function advanceToVariants(user: ReturnType<typeof userEvent.setup>) {
      // Suite minimum is 3 (PRD hard block). Fill three prompts so
      // canProgressStep2 unlocks Next.
      const promptInputs = screen.getAllByLabelText(/prompt text/i);
      // The seed prompt (index 0) has its own simple-text textarea;
      // adding two more rows yields three total. The "Add another test
      // prompt" button is the textbook way to grow the suite.
      await user.type(promptInputs[0], 'Draft a polite refusal.');
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      const allPromptInputs = screen.getAllByLabelText(/prompt text/i);
      expect(allPromptInputs).toHaveLength(3);
      await user.type(allPromptInputs[1], 'Reply to an angry customer.');
      await user.type(allPromptInputs[2], 'Welcome a new subscriber.');

      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    it('renders the suite step with the Plan 03 Collections seam button', async () => {
      await advanceToSuite();

      expect(
        screen.getByText(/load from a saved collection/i),
      ).toBeInTheDocument();
      const collectionBtn = screen.getByRole('button', { name: /load collection/i });
      expect(collectionBtn).toBeDisabled();
    });

    it('keeps Next disabled on Step 2 until 3 valid prompts are filled', async () => {
      const { user } = await advanceToSuite();

      const next = screen.getByRole('button', { name: /next/i });
      // Seed prompt is empty → Next disabled.
      expect(next).toBeDisabled();

      // Fill the seed only — still 1 of 3, Next stays disabled.
      const promptInputs = screen.getAllByLabelText(/prompt text/i);
      await user.type(promptInputs[0], 'Draft a polite refusal.');
      expect(next).toBeDisabled();

      // Add a second prompt — 2 of 3, Next still disabled.
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      let inputs = screen.getAllByLabelText(/prompt text/i);
      await user.type(inputs[1], 'Reply to an angry customer.');
      expect(next).toBeDisabled();

      // Add the third — 3 of 3, Next enables.
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      inputs = screen.getAllByLabelText(/prompt text/i);
      await user.type(inputs[2], 'Welcome a new subscriber.');
      expect(next).toBeEnabled();
    });

    it('seeds the suite with Slider as the default eval mode', async () => {
      await advanceToSuite();

      // EvalModePicker renders each mode as a button with
      // `aria-pressed`. For system-prompt arenas the seed row's
      // evalMode is `slider` (P1-9), so the Slider button reads
      // pressed and the other mode buttons don't.
      // The button's accessible name concatenates the label + desc
      // spans without a space ("SliderRate each output…").
      const sliderButton = screen.getByRole('button', {
        name: /^sliderrate each output/i,
      });
      expect(sliderButton).toHaveAttribute('aria-pressed', 'true');
      const tournamentButton = screen.getByRole('button', {
        name: /^tournamenttwo outputs/i,
      });
      expect(tournamentButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders Step 3 with the system-prompt-variants header and 2 default variants', async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      expect(
        await screen.findByRole('heading', {
          name: /^system prompt variants$/i,
        }),
      ).toBeInTheDocument();

      // Two default display-name inputs ("Variant 1", "Variant 2").
      expect(
        screen.getByLabelText(/variant 1 display name/i),
      ).toHaveValue('Variant 1');
      expect(
        screen.getByLabelText(/variant 2 display name/i),
      ).toHaveValue('Variant 2');

      // Pinned-model picker — single <select>, defaults to GPT-5
      // (the only enabled fixture model).
      const picker = screen.getByLabelText(/pinned model/i) as HTMLSelectElement;
      expect(picker.value).toBe('openai/gpt-5');
    });

    it('does NOT surface the {{input}} token UI on the variants step', async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      // No "Insert {{input}}" button — system prompts are verbatim.
      expect(
        screen.queryByRole('button', { name: /insert \{\{input\}\}/i }),
      ).not.toBeInTheDocument();
      // No "Token must be exactly" helper text.
      expect(
        screen.queryByText(/token must be exactly/i),
      ).not.toBeInTheDocument();
    });

    it('caps variant text at 16,000 chars on the counter (vs. 8,000 for prompt arenas)', async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      // The character counter is rendered as "0/16000". With 0 chars
      // typed, both variant cards show the same denominator.
      const counters = screen.getAllByText(/^0\/16000$/);
      expect(counters.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT surface the Advanced disclosure (no pinnedSystemPrompt, no standalone)', async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      // Plan 05's Advanced disclosure is omitted entirely for
      // system-prompt arenas — the variant IS the system message and
      // standaloneVariants is a kind='prompt' concept.
      expect(
        screen.queryByRole('button', { name: /advanced settings/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/pinned system prompt/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('checkbox', { name: /standalone variants/i }),
      ).not.toBeInTheDocument();
    });

    it("inlines the cross-model 'Coming soon' toggle beneath the pinned-model picker", async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      // The toggle now lives inline (not in an Advanced disclosure)
      // and is disabled with the badge.
      const crossModel = screen.getByRole('checkbox', {
        name: /run across multiple models/i,
      });
      expect(crossModel).toBeDisabled();
      expect(crossModel).not.toBeChecked();
      // The badge is the upper-cased "Coming soon" pill — match it
      // exactly so we don't pick up the trailing "Coming soon." in the
      // hint copy on the same row.
      expect(screen.getByText(/^Coming soon$/)).toBeInTheDocument();
    });

    it('keeps Next disabled on Step 3 until at least 2 variants have text', async () => {
      const { user } = await advanceToSuite();
      await advanceToVariants(user);

      const next = screen.getByRole('button', { name: /next/i });
      expect(next).toBeDisabled();

      await user.type(
        screen.getByLabelText(/variant text/i, { selector: '#variant-text-0' }),
        'You are a warm, professional brand voice. Be concise.',
      );
      expect(next).toBeDisabled();

      await user.type(
        screen.getByLabelText(/variant text/i, { selector: '#variant-text-1' }),
        'You are a playful, witty brand voice. Lean into personality.',
      );
      expect(next).toBeEnabled();
    });
  });

  // Plan 06 P1-B — persona suggestion card on the launch step.
  //
  // We test the card as an isolated component with controlled props.
  // Driving the full wizard to Step 5 requires successfully generating
  // (POST /api/campaigns + the SSE stream), which is out of scope for
  // this batch's verification surface. The component-level tests pin
  // down the user-facing contract; the wizard host's wiring is
  // verified separately in the browser smoke at the end of P1-B.
  describe('PersonaPanelCard (Step 5 surface for kind=system_prompt)', () => {
    const STARTER_PERSONA = {
      id: 'p-starter',
      name: 'Skeptical CFO',
      description: 'Reads every email through a cost-per-touch lens.',
      systemPrompt: '',
      priorities: ['cost', 'compliance'],
      antiPatterns: ['fluff'],
      tags: ['corporate', 'finance'],
      isStarter: true,
      derivedFromPersonaId: null,
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
    };
    const FRIENDLY_PERSONA = {
      id: 'p-friendly',
      name: 'Friendly Newsletter Subscriber',
      description: 'Wants warmth and a little humor.',
      systemPrompt: '',
      priorities: ['warmth'],
      antiPatterns: ['cold tone'],
      tags: ['newsletter'],
      isStarter: true,
      derivedFromPersonaId: null,
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
    };
    const UNTAGGED_PERSONA = {
      ...FRIENDLY_PERSONA,
      id: 'p-untagged',
      name: 'Untagged Reviewer',
      description: 'Skims first; reads later if at all.',
      tags: [],
      updatedAt: '2026-03-01T00:00:00.000Z',
    };

    function renderCard(
      overrides: Partial<React.ComponentProps<typeof PersonaPanelCard>> = {},
    ) {
      const onSelected = vi.fn();
      const onEnabled = vi.fn();
      const onVoter = vi.fn();
      const onRefine = vi.fn();
      const utils = render(
        <PersonaPanelCard
          campaignCategories={[]}
          enabled={true}
          onEnabledChange={onEnabled}
          personas={[STARTER_PERSONA, FRIENDLY_PERSONA, UNTAGGED_PERSONA]}
          personasLoading={false}
          personasError={null}
          selectedPersonaIds={[]}
          onSelectedPersonaIdsChange={onSelected}
          voterCount={10}
          onVoterCountChange={onVoter}
          refineQuery=""
          onRefineQueryChange={onRefine}
          {...overrides}
        />,
      );
      return { ...utils, onSelected, onEnabled, onVoter, onRefine };
    }

    it('renders the toggle checked by default and lists every persona', () => {
      renderCard();
      expect(
        screen.getByRole('checkbox', { name: /run with a persona panel/i }),
      ).toBeChecked();
      // Every persona surfaces — even the untagged one — per the
      // PRD's "don't silently exclude" rule.
      expect(screen.getByText('Skeptical CFO')).toBeInTheDocument();
      expect(
        screen.getByText('Friendly Newsletter Subscriber'),
      ).toBeInTheDocument();
      expect(screen.getByText('Untagged Reviewer')).toBeInTheDocument();
    });

    it('does not auto-check any persona (PRD: explicit selection only)', () => {
      renderCard();
      const personaCheckboxes = [
        STARTER_PERSONA.id,
        FRIENDLY_PERSONA.id,
        UNTAGGED_PERSONA.id,
      ].map((id) => document.getElementById(`persona-${id}`));
      for (const cb of personaCheckboxes) {
        expect(cb).toBeInstanceOf(HTMLInputElement);
        expect(cb).not.toBeChecked();
      }
    });

    it('ranks personas by tag-overlap with campaign categories', () => {
      renderCard({
        campaignCategories: ['corporate', 'finance'],
      });
      // The match badge appears on personas whose tags overlap.
      // STARTER_PERSONA has both tags → "2 matches".
      expect(screen.getByText(/^2 matches$/)).toBeInTheDocument();
      // FRIENDLY_PERSONA has neither category → no badge for it.
      // UNTAGGED_PERSONA has no tags → no badge.
      expect(screen.queryAllByText(/^\d+ match(es)?$/)).toHaveLength(1);

      // Order in the DOM: highest-match persona first.
      const items = screen.getAllByRole('listitem');
      const firstName = items[0].textContent ?? '';
      expect(firstName).toMatch(/Skeptical CFO/);
    });

    it('toggles the panel via the header checkbox and hides the inner controls', async () => {
      const user = userEvent.setup();
      const { rerender, onEnabled } = renderCard();
      const toggle = screen.getByRole('checkbox', {
        name: /run with a persona panel/i,
      });
      await user.click(toggle);
      expect(onEnabled).toHaveBeenCalledWith(false);

      // Re-render with enabled=false to confirm the inner controls
      // unmount (slider + persona list).
      rerender(
        <PersonaPanelCard
          campaignCategories={[]}
          enabled={false}
          onEnabledChange={onEnabled}
          personas={[STARTER_PERSONA, FRIENDLY_PERSONA]}
          personasLoading={false}
          personasError={null}
          selectedPersonaIds={[]}
          onSelectedPersonaIdsChange={vi.fn()}
          voterCount={10}
          onVoterCountChange={vi.fn()}
          refineQuery=""
          onRefineQueryChange={vi.fn()}
        />,
      );
      expect(screen.queryByText('Skeptical CFO')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/voter count/i)).not.toBeInTheDocument();
    });

    it('checking a persona row calls onSelectedPersonaIdsChange with the new id', async () => {
      const user = userEvent.setup();
      const { onSelected } = renderCard();
      await user.click(
        document.getElementById(`persona-${STARTER_PERSONA.id}`)!,
      );
      expect(onSelected).toHaveBeenCalledWith([STARTER_PERSONA.id]);
    });

    it('refine query filters the rendered list (case-insensitive)', () => {
      renderCard({ refineQuery: 'newsletter' });
      // Only the friendly persona's description includes "newsletter".
      expect(
        screen.getByText('Friendly Newsletter Subscriber'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Skeptical CFO')).not.toBeInTheDocument();
      expect(screen.queryByText('Untagged Reviewer')).not.toBeInTheDocument();
    });

    it('refine query showing zero matches renders an inline hint', () => {
      renderCard({ refineQuery: 'no-such-persona' });
      expect(
        screen.getByText(
          /no matches\. clear the search to see your full library/i,
        ),
      ).toBeInTheDocument();
    });

    it('voter-count slider mounts at 10 with min=10 and max=500', () => {
      renderCard();
      const slider = screen.getByLabelText(/voter count/i) as HTMLInputElement;
      expect(slider.type).toBe('range');
      expect(slider.min).toBe('10');
      expect(slider.max).toBe('500');
      expect(slider.value).toBe('10');
    });

    it('voter-count slider emits new values via onVoterCountChange', () => {
      const { onVoter } = renderCard();
      const slider = screen.getByLabelText(/voter count/i) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '50' } });
      expect(onVoter).toHaveBeenCalledWith(50);
    });

    it('caps selection at 10 personas (server limit)', () => {
      // Synthesize 11 personas to exercise the cap. Once 10 are
      // selected, every unselected checkbox must be disabled.
      const many = Array.from({ length: 11 }, (_, i) => ({
        ...STARTER_PERSONA,
        id: `p-${i}`,
        name: `Persona ${i}`,
        tags: ['corporate'],
      }));
      const selected = many.slice(0, 10).map((p) => p.id);
      renderCard({
        personas: many,
        selectedPersonaIds: selected,
      });
      const eleventh = document.getElementById(
        `persona-${many[10].id}`,
      ) as HTMLInputElement;
      expect(eleventh.disabled).toBe(true);
      expect(eleventh.checked).toBe(false);
      // Already-selected personas remain interactive (so the operator
      // can swap one out).
      const tenth = document.getElementById(
        `persona-${many[9].id}`,
      ) as HTMLInputElement;
      expect(tenth.disabled).toBe(false);
      expect(tenth.checked).toBe(true);
    });

    it('renders an empty-state CTA when the persona library is empty (P0-A drift)', () => {
      renderCard({ personas: [] });
      expect(
        screen.getByText(/no personas in your library yet/i),
      ).toBeInTheDocument();
      // The CTA is a link to /personas — operators can hop over to
      // create their first persona without leaving the campaign.
      const cta = screen.getByRole('link', { name: /create a persona/i });
      expect(cta).toHaveAttribute('href', '/personas');
    });

    it('shows a loading spinner while the persona library is being fetched', () => {
      renderCard({ personas: [], personasLoading: true });
      expect(screen.getByText(/loading persona library/i)).toBeInTheDocument();
    });

    it('inline footer prompts the operator when 0 personas are selected', () => {
      renderCard();
      expect(
        screen.getByText(/pick at least one persona to score this campaign/i),
      ).toBeInTheDocument();
    });
  });

  // Plan 06 P1-C — cost preview card. Component-level tests on the
  // exported card; the integration with CreateCampaign's state is
  // exercised by the live wizard, but the threshold gate + breakdown
  // UI are best pinned down at the component boundary.
  describe('CostPreviewCard (Step 5 cost preview)', () => {
    function renderCost(
      overrides: Partial<React.ComponentProps<typeof CostPreviewCard>> = {},
    ) {
      const onAck = vi.fn();
      const utils = render(
        <CostPreviewCard
          generationActualUsd={0}
          personaJudgingEstimateUsd={null}
          totalEstimatedUsd={0}
          aboveCostThreshold={false}
          costAcknowledged={false}
          onCostAcknowledgedChange={onAck}
          {...overrides}
        />,
      );
      return { ...utils, onAck };
    }

    it('shows the total prominently and the breakdown rows', () => {
      renderCost({
        generationActualUsd: 0.42,
        personaJudgingEstimateUsd: 1.08,
        totalEstimatedUsd: 1.5,
      });
      // The hero number is the total.
      expect(screen.getByText('$1.50')).toBeInTheDocument();
      // Breakdown rows exist.
      expect(
        screen.getByText(/generations \(already spent\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText('$0.42')).toBeInTheDocument();
      expect(
        screen.getByText(/persona judging \(estimated\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText('$1.08')).toBeInTheDocument();
    });

    it("renders an em-dash for persona judging when no estimate is available", () => {
      renderCost({
        generationActualUsd: 0.5,
        personaJudgingEstimateUsd: null,
        totalEstimatedUsd: 0.5,
      });
      // The persona-judging row falls back to em-dash when the helper
      // returned null (panel disabled or zero personas selected).
      const rows = screen.getAllByText('—');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('formats sub-cent estimates with a "<$0.01" indicator', () => {
      renderCost({
        generationActualUsd: 0.001,
        personaJudgingEstimateUsd: 0.002,
        totalEstimatedUsd: 0.003,
      });
      expect(screen.getAllByText('<$0.01').length).toBeGreaterThanOrEqual(2);
    });

    it('hides the soft-threshold checkbox when below the threshold', () => {
      renderCost({
        totalEstimatedUsd: 1.25,
        aboveCostThreshold: false,
      });
      expect(
        screen.queryByLabelText(/i understand this run costs/i),
      ).not.toBeInTheDocument();
    });

    it('shows the soft-threshold checkbox when above the threshold', () => {
      renderCost({
        generationActualUsd: 1,
        personaJudgingEstimateUsd: 6,
        totalEstimatedUsd: 7,
        aboveCostThreshold: true,
      });
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      // The label includes the formatted total.
      expect(
        screen.getByText(/i understand this run costs about \$7\.00/i),
      ).toBeInTheDocument();
    });

    it('clicking the threshold checkbox emits onCostAcknowledgedChange', async () => {
      const user = userEvent.setup();
      const { onAck } = renderCost({
        totalEstimatedUsd: 7,
        aboveCostThreshold: true,
      });
      await user.click(screen.getByRole('checkbox'));
      expect(onAck).toHaveBeenCalledWith(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Wizard end-to-end harness — Plan 06 follow-up.
  //
  // The component-level tests above pin down each card's surface in
  // isolation. These tests drive the full wizard from Step 0 through
  // launch, exercising the four POST endpoints the launch flow hits
  // (campaigns, generate, activate, simulated-runs) and asserting the
  // payload shapes the host wires together. The fake-SSE helper makes
  // Step 4's stream-consuming `runGeneration` complete inside the test
  // without a real server.
  // ────────────────────────────────────────────────────────────────────
  describe('end-to-end launch flow', () => {
    /** Full enabled-models fixture — model-arena needs ≥4 selectable rows. */
    const FOUR_MODELS_FIXTURE = {
      rows: [
        ...modelsFixture.rows.filter((r) => r.providerModelId === 'openai/gpt-5'),
        {
          id: '3',
          displayName: 'Claude Sonnet 4.6',
          providerModelId: 'anthropic/claude-sonnet-4-6',
          enabled: true,
          legacy: false,
          availability: 'enabled',
          usage: { campaigns: 0, activeCampaigns: 0, completedCampaigns: 0 },
          performance: {
            wins: 0,
            losses: 0,
            ties: 0,
            comparisons: 0,
            winRate: null,
            averageRating: null,
          },
          footprint: [],
          recommendation: 'Solid generalist',
        },
        {
          id: '4',
          displayName: 'Gemini 2.5 Flash',
          providerModelId: 'google/gemini-2.5-flash',
          enabled: true,
          legacy: false,
          availability: 'enabled',
          usage: { campaigns: 0, activeCampaigns: 0, completedCampaigns: 0 },
          performance: {
            wins: 0,
            losses: 0,
            ties: 0,
            comparisons: 0,
            winRate: null,
            averageRating: null,
          },
          footprint: [],
          recommendation: 'Cheap and fast',
        },
        {
          id: '5',
          displayName: 'GPT-5 Mini',
          providerModelId: 'openai/gpt-5-mini',
          enabled: true,
          legacy: false,
          availability: 'enabled',
          usage: { campaigns: 0, activeCampaigns: 0, completedCampaigns: 0 },
          performance: {
            wins: 0,
            losses: 0,
            ties: 0,
            comparisons: 0,
            winRate: null,
            averageRating: null,
          },
          footprint: [],
          recommendation: 'Cheap',
        },
      ],
      summary: { totalModels: 4, enabled: 4, disabled: 0, legacy: 0, inUse: 1 },
      guidance: { recommendedIds: ['1'], note: 'Keep GPT-5 enabled.' },
    };

    /** Persona library fixture matching `Persona` shape from src/lib/api.ts. */
    const PERSONA_LIBRARY = [
      {
        id: 'p-cfo',
        name: 'Skeptical CFO',
        description: 'Reads every email through a cost-per-touch lens.',
        systemPrompt: '',
        priorities: ['cost', 'compliance'],
        antiPatterns: ['fluff'],
        tags: ['corporate', 'finance'],
        isStarter: true,
        derivedFromPersonaId: null,
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'p-friendly',
        name: 'Friendly Newsletter Subscriber',
        description: 'Wants warmth and a little humor.',
        systemPrompt: '',
        priorities: ['warmth'],
        antiPatterns: ['cold tone'],
        tags: ['newsletter'],
        isStarter: true,
        derivedFromPersonaId: null,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    ];

    /**
     * Built-up route table for the full launch flow. Callers can
     * override individual entries (e.g. the SSE events, the personas
     * list) without rebuilding the whole table.
     */
    function buildRoutes(opts: {
      modelsFixture?: unknown;
      personas?: unknown[];
      slotEvents?: FakeSlotEvent[];
      campaignId?: string;
    } = {}) {
      const campaignId = opts.campaignId ?? 'campaign-uuid-1';
      const models = opts.modelsFixture ?? modelsFixture;
      const personas = opts.personas ?? PERSONA_LIBRARY;
      const slotEvents = opts.slotEvents ?? [
        {
          promptId: 'prompt-1',
          campaignModelId: 'cm-1',
          modelDisplayName: 'GPT-5',
          status: 'ok' as const,
          costUsd: 0.001,
          output: 'Hello world',
        },
      ];
      // Created-campaign response shape — referenced by `runGeneration`'s
      // caller to route the SSE events back to the right campaign id.
      const createdCampaign = {
        id: campaignId,
        shareSlug: 'test-share-slug',
        prompts: [{ id: 'prompt-1', orderIndex: 0 }],
        models: [
          {
            id: 'cm-1',
            providerModelId: 'openai/gpt-5',
            displayName: 'GPT-5',
          },
        ],
      };
      return [
        { url: '/api/operator/models?status=enabled&sort=name', body: models },
        { url: '/api/personas', body: { personas } },
        {
          method: 'POST',
          url: '/api/campaigns',
          body: createdCampaign,
        },
        {
          method: 'POST',
          url: `/api/campaigns/${campaignId}/generate`,
          headers: { 'content-type': 'text/event-stream' },
          streamBody: () => fakeGenerationStream(slotEvents),
        },
        {
          method: 'POST',
          url: `/api/campaigns/${campaignId}/activate`,
          body: { ok: true },
        },
        {
          method: 'POST',
          url: '/api/simulated-runs',
          body: {
            id: 'sim-run-1',
            campaignId,
            status: 'pending',
          },
        },
      ];
    }

    /** Walk the wizard from Step 0 to Step 5 for a system-prompt arena. */
    async function runSystemPromptThroughGenerate(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      // Step 0 — pick system-prompt arena.
      await user.click(
        screen.getByRole('radio', { name: /system-prompt arena/i }),
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 1 — name.
      await user.type(
        screen.getByLabelText(/campaign name/i),
        'E2E system-prompt run',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 2 — fill 3 test prompts (suite minimum).
      const seedInputs = screen.getAllByLabelText(/prompt text/i);
      await user.type(seedInputs[0], 'Draft a polite refusal.');
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      await user.click(
        screen.getByRole('button', { name: /add another test prompt/i }),
      );
      const allInputs = screen.getAllByLabelText(/prompt text/i);
      await user.type(allInputs[1], 'Reply to an angry customer.');
      await user.type(allInputs[2], 'Welcome a new subscriber.');
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 3 — fill 2 system-prompt variants. Pinned-model picker is
      // pre-seeded to `openai/gpt-5` from the modelsFixture.
      await user.type(
        screen.getByLabelText(/variant text/i, {
          selector: '#variant-text-0',
        }),
        'You are a warm, professional brand voice.',
      );
      await user.type(
        screen.getByLabelText(/variant text/i, {
          selector: '#variant-text-1',
        }),
        'You are a playful, witty brand voice.',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 4 — generate. Click Start; wait for the SSE stream's `done`
      // frame to set `generationDone === true` (rendered as "Complete").
      await user.click(screen.getByRole('button', { name: /start generation/i }));
      await screen.findByText(/^Complete$/);

      // Advance to Step 5 (Launch).
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    it('drives the full system-prompt wizard and fires activate + simulated-runs in order', async () => {
      const user = userEvent.setup();
      const fetchMock = installMockFetch(buildRoutes());

      renderWithRouter(<CreateCampaign />);
      await runSystemPromptThroughGenerate(user);

      // Wait for the personas fetch to land + the persona list to render.
      await screen.findByText('Skeptical CFO');

      // Pick one persona — without a selection, `handleLaunch` skips the
      // simulated-runs leg entirely (separate scenario tests that path).
      await user.click(document.getElementById('persona-p-cfo')!);

      // Below the cost soft threshold (default $5 + tiny generation +
      // tiny estimate), the Launch button enables without an
      // acknowledgement.
      const launch = screen.getByRole('button', { name: /launch campaign/i });
      expect(launch).toBeEnabled();
      await user.click(launch);

      // Wait for both legs of `handleLaunch` (activate + simulated-runs).
      await waitFor(() => {
        const calls = fetchMock.mock.calls.map(
          (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
        );
        expect(calls).toContain('POST /api/campaigns/campaign-uuid-1/activate');
        expect(calls).toContain('POST /api/simulated-runs');
      });

      // Assert ordering: activate must precede simulated-runs.
      const seq = fetchMock.mock.calls.map(
        (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
      );
      const activateIdx = seq.indexOf(
        'POST /api/campaigns/campaign-uuid-1/activate',
      );
      const simRunIdx = seq.indexOf('POST /api/simulated-runs');
      expect(activateIdx).toBeGreaterThan(-1);
      expect(simRunIdx).toBeGreaterThan(activateIdx);

      // Inspect the simulated-runs body — every Plan 06 P1-21 contract
      // (panelType, personaIds, voterCount, costCeilingUsd) must reach
      // the API.
      const simRunCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/simulated-runs' &&
          ((init as RequestInit | undefined)?.method ?? 'GET') === 'POST',
      )!;
      const simBody = JSON.parse(
        (simRunCall[1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(simBody).toMatchObject({
        campaignId: 'campaign-uuid-1',
        panelType: 'persona',
        personaIds: ['p-cfo'],
        voterCount: 10,
      });
      expect(typeof simBody.costCeilingUsd).toBe('number');
      // Default ceiling is 2× estimate floored at $0.50 (defaultCostCeiling).
      expect(simBody.costCeilingUsd as number).toBeGreaterThanOrEqual(0.5);
    });

    it('gates the Launch button behind the cost-acknowledgement checkbox above $5', async () => {
      const user = userEvent.setup();
      // Push generation actual over $5 via a single high-cost slot.
      // generationActualUsd is the SUM of slot.costUsd values for `ok`
      // events; the threshold is $5, so $6 sails above it.
      installMockFetch(
        buildRoutes({
          slotEvents: [
            {
              promptId: 'prompt-1',
              campaignModelId: 'cm-1',
              modelDisplayName: 'GPT-5',
              status: 'ok',
              costUsd: 6,
              output: 'expensive',
            },
          ],
        }),
      );

      renderWithRouter(<CreateCampaign />);
      await runSystemPromptThroughGenerate(user);

      // Persona list mounts — pick one so persona-judging estimate
      // contributes (small) to the total. Even without persona-cost, the
      // $6 generation alone already exceeds the threshold.
      await screen.findByText('Skeptical CFO');
      await user.click(document.getElementById('persona-p-cfo')!);

      // Threshold checkbox (the only checkbox with that label) appears.
      const ackCheckbox = await screen.findByLabelText(
        /i understand this run costs/i,
      );
      expect(ackCheckbox).not.toBeChecked();

      // Launch is disabled until the operator ticks the box.
      const launch = screen.getByRole('button', { name: /launch campaign/i });
      expect(launch).toBeDisabled();

      await user.click(ackCheckbox);
      expect(ackCheckbox).toBeChecked();
      expect(launch).toBeEnabled();
    });

    it('skips the simulated-runs leg when the persona panel is toggled OFF', async () => {
      const user = userEvent.setup();
      const fetchMock = installMockFetch(buildRoutes());

      renderWithRouter(<CreateCampaign />);
      await runSystemPromptThroughGenerate(user);

      await screen.findByText('Skeptical CFO');
      // Toggle the persona-panel header checkbox OFF. With panel
      // disabled, `handleLaunch` only activates — no `/api/simulated-runs`.
      await user.click(
        screen.getByRole('checkbox', { name: /run with a persona panel/i }),
      );
      // Inner controls (persona list, voter slider) unmount.
      expect(screen.queryByText('Skeptical CFO')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /launch campaign/i }));

      // Activate fires; simulated-runs does NOT.
      await waitFor(() => {
        const seq = fetchMock.mock.calls.map(
          (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
        );
        expect(seq).toContain('POST /api/campaigns/campaign-uuid-1/activate');
      });
      const seq = fetchMock.mock.calls.map(
        (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
      );
      expect(seq).not.toContain('POST /api/simulated-runs');
    });

    it('renders the empty-state CTA with no personas and still launches successfully', async () => {
      const user = userEvent.setup();
      const fetchMock = installMockFetch(buildRoutes({ personas: [] }));

      renderWithRouter(<CreateCampaign />);
      await runSystemPromptThroughGenerate(user);

      // Empty-state CTA is the canonical signal that the persona panel
      // saw `{ personas: [] }`. The CTA is a link to /personas — operator
      // can hop over without abandoning the campaign.
      await screen.findByText(/no personas in your library yet/i);
      const cta = screen.getByRole('link', { name: /create a persona/i });
      expect(cta).toHaveAttribute('href', '/personas');

      // Launch still succeeds. With no personaIds selected (the empty
      // library means there's nothing to select), `handleLaunch` skips
      // the simulated-runs leg even though the panel is enabled.
      await user.click(screen.getByRole('button', { name: /launch campaign/i }));

      await waitFor(() => {
        const seq = fetchMock.mock.calls.map(
          (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
        );
        expect(seq).toContain('POST /api/campaigns/campaign-uuid-1/activate');
      });
      const seq = fetchMock.mock.calls.map(
        (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
      );
      expect(seq).not.toContain('POST /api/simulated-runs');
    });

    it('regression: prompt arena drives Step 0→5 and launches with a single activate call', async () => {
      const user = userEvent.setup();
      const fetchMock = installMockFetch(buildRoutes());

      renderWithRouter(<CreateCampaign />);

      // Step 0 — pick prompt arena.
      await user.click(screen.getByRole('radio', { name: /^prompt arena/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 1 — name.
      await user.type(
        screen.getByLabelText(/campaign name/i),
        'E2E prompt run',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 2 — single input fragment (prompt arena only requires ≥1).
      await user.type(
        screen.getByLabelText(/prompt text/i),
        'Translate to French.',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 3 — fill 2 variants.
      await user.type(
        screen.getByLabelText(/variant text/i, {
          selector: '#variant-text-0',
        }),
        'You are a senior reviewer. {{input}}',
      );
      await user.type(
        screen.getByLabelText(/variant text/i, {
          selector: '#variant-text-1',
        }),
        'You are a junior reviewer. {{input}}',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 4 — generate.
      await user.click(screen.getByRole('button', { name: /start generation/i }));
      await screen.findByText(/^Complete$/);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 5 — launch. Prompt arenas have no persona panel and no
      // cost gate; the Launch button enables immediately.
      const launch = await screen.findByRole('button', {
        name: /launch campaign/i,
      });
      expect(launch).toBeEnabled();
      await user.click(launch);

      await waitFor(() => {
        const seq = fetchMock.mock.calls.map(
          (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
        );
        expect(seq).toContain('POST /api/campaigns/campaign-uuid-1/activate');
      });
      const seq = fetchMock.mock.calls.map(
        (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
      );
      // No persona panel, no simulated-runs leg.
      expect(seq).not.toContain('POST /api/simulated-runs');
      // Personas endpoint never even gets touched (the gate is
      // `kind === 'system_prompt' && step === 5`).
      expect(seq).not.toContain('GET /api/personas');
    });

    it('regression: model arena drives Step 0→5 and launches with a single activate call', async () => {
      const user = userEvent.setup();
      const fetchMock = installMockFetch(
        buildRoutes({ modelsFixture: FOUR_MODELS_FIXTURE }),
      );

      renderWithRouter(<CreateCampaign />);

      // Step 0 — model arena is the default; Next advances.
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 1 — name.
      await user.type(
        screen.getByLabelText(/campaign name/i),
        'E2E model run',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 2 — one prompt suffices.
      await user.type(
        screen.getByLabelText(/prompt text/i),
        'Compare these responses',
      );
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 3 — pick all four enabled models so MIN_MODELS=4 is met.
      await screen.findByText('GPT-5');
      await user.click(screen.getByText('GPT-5'));
      await user.click(screen.getByText('Claude Sonnet 4.6'));
      await user.click(screen.getByText('Gemini 2.5 Flash'));
      await user.click(screen.getByText('GPT-5 Mini'));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 4 — generate.
      await user.click(screen.getByRole('button', { name: /start generation/i }));
      await screen.findByText(/^Complete$/);
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Step 5 — launch. No persona panel, no cost gate.
      const launch = await screen.findByRole('button', {
        name: /launch campaign/i,
      });
      expect(launch).toBeEnabled();
      await user.click(launch);

      await waitFor(() => {
        const seq = fetchMock.mock.calls.map(
          (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
        );
        expect(seq).toContain('POST /api/campaigns/campaign-uuid-1/activate');
      });
      const seq = fetchMock.mock.calls.map(
        (c) => `${(c[1] as RequestInit | undefined)?.method ?? 'GET'} ${c[0]}`,
      );
      expect(seq).not.toContain('POST /api/simulated-runs');
      expect(seq).not.toContain('GET /api/personas');
    });
  });
});
