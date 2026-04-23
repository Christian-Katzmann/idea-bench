import { checkAiAccess, withOperator } from '../../auth/middleware.js';

/**
 * GET /api/auth/me
 *
 * Returns the current operator's identity and AI-access state. The
 * frontend uses this to hide AI-trigger UI (run button, configurator)
 * for operators who can read the app but cannot spend money.
 *
 * The server-side gate in `withAIOperator` is the real security
 * boundary; this endpoint exists purely for UX polish.
 */
export const meWebHandler = withOperator(async (request, { operator }) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const access = checkAiAccess(operator);
  return new Response(
    JSON.stringify({
      identity: operator.identity,
      method: operator.method,
      aiAccess: access.kind,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
