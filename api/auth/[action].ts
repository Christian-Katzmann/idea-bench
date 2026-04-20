import { type WebHandler, toVercelHandler } from '../../src/server/vercel-adapter.js';
import { loginWebHandler } from '../../src/server/routes/auth/login.js';
import { logoutWebHandler } from '../../src/server/routes/auth/logout.js';
import {
  githubAuthorizeWebHandler,
  githubCallbackWebHandler,
} from '../../src/server/routes/auth/github.js';
import {
  magicLinkSendWebHandler,
  magicLinkVerifyWebHandler,
} from '../../src/server/routes/auth/magic-link.js';

const actionHandlers: Record<string, WebHandler> = {
  login: loginWebHandler,
  logout: logoutWebHandler,
  github: githubAuthorizeWebHandler,
  'github-callback': githubCallbackWebHandler,
  'email-send': magicLinkSendWebHandler,
  'email-verify': magicLinkVerifyWebHandler,
};

const authActionWebHandler: WebHandler = async (request) => {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const action = parts[2] ?? '';
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

export default toVercelHandler(authActionWebHandler);
