import { create } from 'zustand';
import { addDays, subDays } from 'date-fns';

export type CampaignStatus = 'draft' | 'active' | 'completed';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  categories: string[];
  status: CampaignStatus;
  createdAt: string;
  closedAt?: string;
  operatorId: string;
  shareLink: string;
}

export interface Prompt {
  id: string;
  campaignId: string;
  text: string;
  context?: string;
  categoryTags: string[];
}

export interface ModelConfig {
  campaignId: string;
  modelId: string;
  modelName: string;
  params: any;
}

export interface Generation {
  id: string;
  promptId: string;
  modelId: string;
  output: string;
  tokens: number;
  latency: number;
}

export interface Participant {
  id: string;
  email: string;
  campaignId: string;
  startedAt: string;
  finishedAt?: string;
}

export interface Vote {
  id: string;
  participantId: string;
  promptId: string;
  generationA_id: string;
  generationB_id: string;
  winner: 'A' | 'B' | 'tie' | 'both_bad';
  timestamp: string;
}

export interface Rating {
  campaignId: string;
  modelId: string;
  category: string;
  elo: number;
  ci_low: number;
  ci_high: number;
  gameCount: number;
}

interface StoreState {
  campaigns: Campaign[];
  prompts: Prompt[];
  modelConfigs: ModelConfig[];
  generations: Generation[];
  participants: Participant[];
  votes: Vote[];
  ratings: Rating[];
  
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, data: Partial<Campaign>) => void;
  addVote: (vote: Vote) => void;
  addParticipant: (participant: Participant) => void;
  updateParticipant: (id: string, data: Partial<Participant>) => void;
}

const mockCampaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Danish citizen-letter drafting',
    description: 'Evaluate models on drafting official letters to citizens in Danish, focusing on tone and clarity.',
    categories: ['translation', 'creative writing'],
    status: 'active',
    createdAt: subDays(new Date(), 2).toISOString(),
    operatorId: 'op1',
    shareLink: 'https://modelarena.app/c/c1'
  },
  {
    id: 'c2',
    name: 'Code review quality',
    description: 'Which model provides the most actionable and accurate code reviews?',
    categories: ['code', 'reasoning'],
    status: 'completed',
    createdAt: subDays(new Date(), 10).toISOString(),
    closedAt: subDays(new Date(), 1).toISOString(),
    operatorId: 'op1',
    shareLink: 'https://modelarena.app/c/c2'
  },
  {
    id: 'c3',
    name: 'Meeting summary extraction',
    description: 'Extracting action items and key decisions from messy meeting transcripts.',
    categories: ['summarization', 'data extraction'],
    status: 'draft',
    createdAt: new Date().toISOString(),
    operatorId: 'op1',
    shareLink: 'https://modelarena.app/c/c3'
  }
];

const mockPrompts: Prompt[] = [
  {
    id: 'p1',
    campaignId: 'c1',
    text: 'Draft a letter to a citizen informing them that their application for a building permit has been approved, but they must start construction within 12 months.',
    categoryTags: ['creative writing']
  },
  {
    id: 'p2',
    campaignId: 'c1',
    text: 'Translate this technical policy update into plain Danish suitable for a general audience.',
    context: 'Policy update: The municipal waste management directive 2024/B requires all households to separate organic waste into the new green bins starting October 1st. Failure to comply may result in a fine of 500 DKK.',
    categoryTags: ['translation']
  }
];

const mockModelConfigs: ModelConfig[] = [
  { campaignId: 'c1', modelId: 'm1', modelName: 'Claude Opus 4.6', params: {} },
  { campaignId: 'c1', modelId: 'm2', modelName: 'GPT-5', params: {} },
  { campaignId: 'c1', modelId: 'm3', modelName: 'Gemini 2.5 Pro', params: {} },
];

const mockGenerations: Generation[] = [
  { id: 'g1', promptId: 'p1', modelId: 'm1', output: 'Kære Borger,\n\nVi har den glæde at meddele dig, at din ansøgning om byggetilladelse er blevet godkendt. Du kan nu påbegynde dit byggeprojekt.\n\nVær venligst opmærksom på, at byggeriet skal påbegyndes inden for 12 måneder fra dags dato. Hvis dette ikke overholdes, vil tilladelsen bortfalde.\n\nMed venlig hilsen,\nKommunen', tokens: 65, latency: 1200 },
  { id: 'g2', promptId: 'p1', modelId: 'm2', output: 'Til rette vedkommende.\n\nDin byggetilladelse er godkendt. Byggeriet skal starte inden 12 måneder, ellers udløber tilladelsen.\n\nVenlig hilsen,\nByggeafdelingen', tokens: 40, latency: 800 },
  { id: 'g3', promptId: 'p1', modelId: 'm3', output: 'Kære ansøger,\n\nVi skriver for at informere dig om, at din byggetilladelse er godkendt. Husk at byggeriet skal sættes i gang senest 12 måneder fra i dag.\n\nVenlig hilsen,\nBorgerservice', tokens: 50, latency: 950 },
  
  { id: 'g4', promptId: 'p2', modelId: 'm1', output: 'Vigtig information om affaldssortering.\n\nFra den 1. oktober skal alle husstande sortere deres madaffald i de nye grønne spande. Det er vigtigt at overholde dette, da manglende sortering kan medføre et gebyr på 500 kr.', tokens: 55, latency: 1100 },
  { id: 'g5', promptId: 'p2', modelId: 'm2', output: 'Nye regler for affald.\n\nAlle skal bruge de grønne spande til organisk affald fra 1. oktober. Bøde på 500 kr. hvis det ikke overholdes.', tokens: 35, latency: 750 },
  { id: 'g6', promptId: 'p2', modelId: 'm3', output: 'Kære borger,\n\nFra 1. oktober indfører vi nye regler for affaldssortering. Det betyder, at du skal sortere dit madaffald i den nye grønne spand. Bemærk venligst, at det kan koste en afgift på 500 kr., hvis affaldet ikke sorteres korrekt.', tokens: 60, latency: 1050 },
];

const mockVotes: Vote[] = [
  { id: 'v1', participantId: 'part1', promptId: 'p1', generationA_id: 'g1', generationB_id: 'g2', winner: 'A', timestamp: subDays(new Date(), 1).toISOString() },
  { id: 'v2', participantId: 'part1', promptId: 'p2', generationA_id: 'g4', generationB_id: 'g6', winner: 'B', timestamp: subDays(new Date(), 1).toISOString() },
  { id: 'v3', participantId: 'part2', promptId: 'p1', generationA_id: 'g2', generationB_id: 'g3', winner: 'B', timestamp: subDays(new Date(), 1).toISOString() },
  { id: 'v4', participantId: 'part3', promptId: 'p1', generationA_id: 'g1', generationB_id: 'g3', winner: 'A', timestamp: subDays(new Date(), 0).toISOString() },
];

const mockRatings: Rating[] = [
  { campaignId: 'c1', modelId: 'm1', category: 'overall', elo: 1247, ci_low: 1209, ci_high: 1285, gameCount: 45 },
  { campaignId: 'c1', modelId: 'm3', category: 'overall', elo: 1180, ci_low: 1140, ci_high: 1220, gameCount: 42 },
  { campaignId: 'c1', modelId: 'm2', category: 'overall', elo: 1050, ci_low: 980, ci_high: 1120, gameCount: 40 },
  
  { campaignId: 'c2', modelId: 'm2', category: 'overall', elo: 1310, ci_low: 1280, ci_high: 1340, gameCount: 120 },
  { campaignId: 'c2', modelId: 'm1', category: 'overall', elo: 1290, ci_low: 1260, ci_high: 1320, gameCount: 115 },
  { campaignId: 'c2', modelId: 'm3', category: 'overall', elo: 1150, ci_low: 1100, ci_high: 1200, gameCount: 110 },
];

export const useStore = create<StoreState>((set) => ({
  campaigns: mockCampaigns,
  prompts: mockPrompts,
  modelConfigs: mockModelConfigs,
  generations: mockGenerations,
  participants: [],
  votes: mockVotes,
  ratings: mockRatings,
  
  addCampaign: (campaign) => set((state) => ({ campaigns: [...state.campaigns, campaign] })),
  updateCampaign: (id, data) => set((state) => ({
    campaigns: state.campaigns.map(c => c.id === id ? { ...c, ...data } : c)
  })),
  addVote: (vote) => set((state) => ({ votes: [...state.votes, vote] })),
  addParticipant: (participant) => set((state) => ({ participants: [...state.participants, participant] })),
  updateParticipant: (id, data) => set((state) => ({
    participants: state.participants.map(p => p.id === id ? { ...p, ...data } : p)
  })),
}));
