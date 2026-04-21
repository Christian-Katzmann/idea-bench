import {
  buildCampaignResultsCsv,
  buildCampaignParticipantsCsv,
  buildCampaignResponsesCsv,
  type ResponsesExportInputs,
} from '../export';

const CAMPAIGN = {
  id: 'campaign-1',
  shareSlug: 'support-qa',
  name: 'Support QA',
  description: 'QA sweep',
  categories: ['quality'],
  status: 'active' as const,
  votingMode: 'hybrid' as const,
  emailPromptMessage: null,
  createdAt: new Date('2026-04-17T09:00:00.000Z'),
  closedAt: null,
};

describe('buildCampaignResultsCsv', () => {
  it('serializes leaderboard rows into a downloadable csv', () => {
    const csv = buildCampaignResultsCsv({
      campaign: CAMPAIGN,
      stats: {
        promptCount: 4,
        modelCount: 4,
        totalVotes: 12,
        uniqueParticipants: 5,
        finishedParticipants: 3,
        identifiedParticipants: 2,
        anonymousParticipants: 3,
      },
      models: [
        {
          id: 'cm-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
        },
      ],
      prompts: [],
      ratings: [
        {
          category: 'overall',
          source: 'both',
          personaId: null,
          campaignModelId: 'cm-1',
          providerModelId: 'openai/gpt-5',
          displayName: 'GPT-5',
          rating: 1102,
          seRating: null,
          btStrength: null,
          ciLow: 1078,
          ciHigh: 1126,
          winRate: 0.67,
          winCount: 4,
          lossCount: 1,
          tieCount: 1,
          gameCount: 6,
          gamesPlayed: 6,
          stability: 'stable',
          computedAt: new Date('2026-04-17T10:00:00.000Z'),
        },
      ],
    });

    expect(csv).toContain('campaign_name,campaign_status,share_slug');
    expect(csv).toContain('identified_participants,anonymous_participants');
    expect(csv).toContain('Support QA,active,support-qa');
    expect(csv).toContain('GPT-5');
    expect(csv).toContain('openai/gpt-5');
    // Aggregate identified/anonymous counts are appended after existing stats
    expect(csv.trim().split('\n')[1]?.endsWith(',3,2,3')).toBe(true);
  });
});

describe('buildCampaignParticipantsCsv', () => {
  it('emits one row per participant, blank email for anonymous voters', () => {
    const csv = buildCampaignParticipantsCsv(CAMPAIGN, [
      {
        participantId: 'p-1',
        email: 'alice@acme.com',
        startedAt: new Date('2026-04-17T09:00:00.000Z'),
        finishedAt: new Date('2026-04-17T09:05:00.000Z'),
        votesCast: 16,
        isFinished: true,
      },
      {
        participantId: 'p-2',
        email: null,
        startedAt: new Date('2026-04-17T09:02:00.000Z'),
        finishedAt: null,
        votesCast: 4,
        isFinished: false,
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'campaign_name,share_slug,participant_id,email,identity,started_at,finished_at,is_finished,votes_cast',
    );
    expect(lines[1]).toContain('alice@acme.com');
    expect(lines[1]).toContain('identified');
    expect(lines[1]).toContain('true');
    expect(lines[2]).toContain(',,anonymous,');
    expect(lines[2]).toContain('false');
  });

  it('handles empty participant list (header only)', () => {
    const csv = buildCampaignParticipantsCsv(CAMPAIGN, []);
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('participant_id');
  });
});

describe('buildCampaignResponsesCsv', () => {
  const baseInputs: ResponsesExportInputs = {
    campaign: CAMPAIGN,
    promptsById: new Map([
      [
        'prompt-1',
        { id: 'prompt-1', orderIndex: 0, categoryTags: ['quality'] },
      ],
      [
        'prompt-2',
        { id: 'prompt-2', orderIndex: 1, categoryTags: [] },
      ],
    ]),
    modelsById: new Map([
      [
        'cm-a',
        { id: 'cm-a', displayName: 'Claude', providerModelId: 'anthropic/claude' },
      ],
      [
        'cm-b',
        { id: 'cm-b', displayName: 'GPT-5', providerModelId: 'openai/gpt-5' },
      ],
      [
        'cm-c',
        { id: 'cm-c', displayName: 'Gemini', providerModelId: 'google/gemini' },
      ],
    ]),
    participantsById: new Map([
      ['p-1', { id: 'p-1', email: 'alice@acme.com' }],
      ['p-2', { id: 'p-2', email: null }],
    ]),
    generationsById: new Map([
      ['gen-a1', { id: 'gen-a1', campaignModelId: 'cm-a' }],
      ['gen-b1', { id: 'gen-b1', campaignModelId: 'cm-b' }],
    ]),
    votes: [],
    sliderResponses: [],
    approveRejectResponses: [],
    bestOfNResponses: [],
    multiAxisResponses: [],
    qualitativeResponses: [],
  };

  it('emits header-only CSV when there are no responses', () => {
    const csv = buildCampaignResponsesCsv(baseInputs);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('campaign_name,share_slug,created_at,mode');
    expect(lines[0]).toContain('model_a_display_name');
    expect(lines[0]).toContain('multi_axis_scores_json');
    expect(lines[0]).toContain('signal_summary');
  });

  it('emits tournament rows with both model sides + winner', () => {
    const csv = buildCampaignResponsesCsv({
      ...baseInputs,
      votes: [
        {
          id: 'v-1',
          campaignId: 'campaign-1',
          tournamentId: 't-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          sessionId: 's-1',
          bracketPosition: 'b1',
          generationAId: 'gen-a1',
          generationBId: 'gen-b1',
          winner: 'A',
          advancedGenerationId: 'gen-a1',
          createdAt: new Date('2026-04-17T09:00:00.000Z'),
        },
      ],
    });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    const row = lines[1];
    expect(row).toContain('tournament');
    expect(row).toContain('Claude');
    expect(row).toContain('GPT-5');
    expect(row).toContain('b1');
    expect(row).toContain(',A,'); // winner column
    expect(row).toContain('b1: Claude'); // human-readable summary
  });

  it('emits one row per slider response with score in dedicated column', () => {
    const csv = buildCampaignResponsesCsv({
      ...baseInputs,
      sliderResponses: [
        {
          id: 's-1',
          campaignId: 'campaign-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          campaignModelId: 'cm-a',
          sessionId: 'sess-1',
          score: 7,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
        },
        {
          id: 's-2',
          campaignId: 'campaign-1',
          participantId: 'p-2',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          campaignModelId: 'cm-b',
          sessionId: 'sess-2',
          score: 3,
          createdAt: new Date('2026-04-17T10:01:00.000Z'),
        },
      ],
    });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('slider');
    expect(lines[1]).toContain('Claude');
    expect(lines[1]).toContain('alice@acme.com');
    expect(lines[1]).toContain('score=7');
    // Anonymous voter's email column is blank.
    expect(lines[2]).toMatch(/,p-2,,sess-2/);
    expect(lines[2]).toContain('score=3');
  });

  it('emits per-mode rows distinctly for mixed-mode campaigns', () => {
    const csv = buildCampaignResponsesCsv({
      ...baseInputs,
      sliderResponses: [
        {
          id: 's-1',
          campaignId: 'campaign-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          campaignModelId: 'cm-a',
          sessionId: 'sess-1',
          score: 8,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
        },
      ],
      approveRejectResponses: [
        {
          id: 'ar-1',
          campaignId: 'campaign-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-2',
          campaignModelId: 'cm-a',
          sessionId: 'sess-1',
          approved: true,
          createdAt: new Date('2026-04-17T10:05:00.000Z'),
        },
      ],
      bestOfNResponses: [
        {
          id: 'bn-1',
          campaignId: 'campaign-1',
          participantId: 'p-2',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          chosenCampaignModelId: 'cm-c',
          sessionId: 'sess-2',
          createdAt: new Date('2026-04-17T10:10:00.000Z'),
        },
      ],
      multiAxisResponses: [
        {
          id: 'ma-1',
          campaignId: 'campaign-1',
          participantId: 'p-2',
          simulatedParticipantId: null,
          promptId: 'prompt-2',
          campaignModelId: 'cm-a',
          sessionId: 'sess-2',
          scores: { correctness: 4, tone: 3 },
          createdAt: new Date('2026-04-17T10:15:00.000Z'),
        },
      ],
      qualitativeResponses: [
        {
          id: 'q-1',
          campaignId: 'campaign-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          campaignModelId: 'cm-b',
          sessionId: 'sess-1',
          text: 'Concise and on point.',
          createdAt: new Date('2026-04-17T10:20:00.000Z'),
        },
      ],
    });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(6); // header + 5 response rows

    // Events sort chronologically, so line order matches createdAt.
    expect(lines[1]).toContain('slider');
    expect(lines[2]).toContain('approve_reject');
    expect(lines[2]).toContain('approved');
    expect(lines[3]).toContain('best_of_n');
    expect(lines[3]).toContain('Gemini');
    expect(lines[3]).toContain('chosen: Gemini');
    expect(lines[4]).toContain('multi_axis');
    expect(lines[4]).toContain('correctness');
    expect(lines[5]).toContain('qualitative');
    expect(lines[5]).toContain('Concise and on point.');
  });

  it('escapes qualitative text with embedded commas/quotes/newlines', () => {
    const csv = buildCampaignResponsesCsv({
      ...baseInputs,
      qualitativeResponses: [
        {
          id: 'q-1',
          campaignId: 'campaign-1',
          participantId: 'p-1',
          simulatedParticipantId: null,
          promptId: 'prompt-1',
          campaignModelId: 'cm-a',
          sessionId: 'sess-1',
          text: 'Good, but "verbose"\nand a bit off.',
          createdAt: new Date('2026-04-17T11:00:00.000Z'),
        },
      ],
    });
    // The raw text field must be quoted and inner quotes doubled.
    expect(csv).toContain('"Good, but ""verbose""\nand a bit off."');
  });
});
