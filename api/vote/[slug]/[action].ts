import { type WebHandler, toVercelHandler } from '../../../src/server/vercel-adapter.js';
import { voteFinishWebHandler } from '../../../src/server/routes/vote/finish.js';
import { voteNextWebHandler } from '../../../src/server/routes/vote/next.js';
import { voteResultsWebHandler } from '../../../src/server/routes/vote/results.js';
import { voteSubmitWebHandler } from '../../../src/server/routes/vote/submit.js';
import { voteSubmitSliderWebHandler } from '../../../src/server/routes/vote/submit-slider.js';
import { voteSubmitApproveRejectWebHandler } from '../../../src/server/routes/vote/submit-approve-reject.js';
import { voteSubmitBestOfNWebHandler } from '../../../src/server/routes/vote/submit-best-of-n.js';
import { voteSubmitMultiAxisWebHandler } from '../../../src/server/routes/vote/submit-multi-axis.js';
import { voteSubmitQualitativeWebHandler } from '../../../src/server/routes/vote/submit-qualitative.js';

const actionHandlers: Record<string, WebHandler> = {
  finish: voteFinishWebHandler,
  next: voteNextWebHandler,
  results: voteResultsWebHandler,
  submit: voteSubmitWebHandler, // legacy tournament endpoint
  'submit-slider': voteSubmitSliderWebHandler,
  'submit-approve-reject': voteSubmitApproveRejectWebHandler,
  'submit-best-of-n': voteSubmitBestOfNWebHandler,
  'submit-multi-axis': voteSubmitMultiAxisWebHandler,
  'submit-qualitative': voteSubmitQualitativeWebHandler,
};

const voteActionWebHandler: WebHandler = async (request) => {
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

export default toVercelHandler(voteActionWebHandler);
