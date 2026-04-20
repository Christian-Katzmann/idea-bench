import { type WebHandler, toVercelHandler } from '../../../src/server/vercel-adapter.js';
import { activateCampaignWebHandler } from '../../../src/server/routes/campaigns/activate.js';
import { closeCampaignWebHandler } from '../../../src/server/routes/campaigns/close.js';
import { exportCampaignCsvWebHandler } from '../../../src/server/routes/campaigns/exportCsv.js';
import { exportCampaignParticipantsCsvWebHandler } from '../../../src/server/routes/campaigns/exportParticipantsCsv.js';
import { generateCampaignWebHandler } from '../../../src/server/routes/campaigns/generate.js';
import { previewCampaignWebHandler } from '../../../src/server/routes/campaigns/preview.js';
import { recomputeCampaignWebHandler } from '../../../src/server/routes/campaigns/recompute.js';

const actionHandlers: Record<string, WebHandler> = {
  activate: activateCampaignWebHandler,
  close: closeCampaignWebHandler,
  export: exportCampaignCsvWebHandler,
  'export-participants': exportCampaignParticipantsCsvWebHandler,
  generate: generateCampaignWebHandler,
  preview: previewCampaignWebHandler,
  recompute: recomputeCampaignWebHandler,
};

const campaignActionWebHandler: WebHandler = async (request) => {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const action = parts[3] ?? '';
  const handler = actionHandlers[action];

  if (!handler) {
    return json({ error: 'not found' }, 404);
  }

  return handler(request);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default toVercelHandler(campaignActionWebHandler);
