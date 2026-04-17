import { getDb } from '../../db/client.js';
import { withOperator } from '../../auth/middleware.js';
import { buildCampaignDetail } from '../../campaigns/detail.js';
import { buildCampaignResultsCsv } from '../../campaigns/export.js';

export const exportCampaignCsvWebHandler = withOperator(
  async (request: Request) => {
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405 });
    }

    const id = extractId(new URL(request.url));
    if (!id) return json({ error: 'missing id' }, 400);

    const detail = await buildCampaignDetail(getDb(), id);
    if (!detail) return json({ error: 'campaign not found' }, 404);

    const filename = `${detail.campaign.shareSlug || detail.campaign.id}-results.csv`;
    const csv = buildCampaignResultsCsv(detail);

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  },
);

function extractId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'campaigns' &&
    parts[3] === 'export'
  ) {
    return parts[2] || null;
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
