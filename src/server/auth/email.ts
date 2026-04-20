/**
 * Resend-backed transactional email.
 *
 * Uses Resend's REST API directly — no SDK needed for a single endpoint.
 * The sender address defaults to `onboarding@resend.dev` (Resend's
 * sandbox, which only delivers to the account owner's verified email).
 * Set `RESEND_SENDER_ADDRESS` once the production domain is verified.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_SANDBOX_SENDER = 'onboarding@resend.dev';

let sandboxWarned = false;

interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendMagicLink(
  to: string,
  link: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const sender = process.env.RESEND_SENDER_ADDRESS?.trim() || DEFAULT_SANDBOX_SENDER;
  if (sender === DEFAULT_SANDBOX_SENDER && !sandboxWarned) {
    sandboxWarned = true;
    console.warn(
      '[auth] Sending magic links from Resend sandbox. Configure ' +
        'RESEND_SENDER_ADDRESS with a verified domain for real delivery.',
    );
  }

  const subject = 'Your ModelArena sign-in link';
  const text = [
    'Click to sign in to ModelArena:',
    '',
    link,
    '',
    'This link expires in 15 minutes. If you didn’t request it, ignore this email.',
  ].join('\n');
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F7F6F3;color:#1F1B16;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E8E6E1;border-radius:12px;padding:32px">
    <h1 style="font-size:18px;margin:0 0 16px">Sign in to ModelArena</h1>
    <p style="margin:0 0 24px;line-height:1.5;font-size:14px">Click the button below to sign in. This link expires in 15 minutes.</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1F1B16;color:#F7F6F3;text-decoration:none;padding:10px 20px;border-radius:9999px;font-size:14px;font-weight:500">Sign in</a></p>
    <p style="margin:0;font-size:12px;color:#6E6A62">If the button doesn’t work, copy this URL:<br/><span style="word-break:break-all">${link}</span></p>
    <p style="margin:24px 0 0;font-size:12px;color:#6E6A62">If you didn’t request this, ignore this email.</p>
  </div>
</body></html>`.trim();

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: sender, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `resend ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

/** Test-only: reset sandbox warning flag. */
export function __resetEmailWarnings(): void {
  sandboxWarned = false;
}
