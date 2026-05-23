# Key rotation log — pre-publish

Rotation status before flipping `modelarena` public. Christian is the
only person who can authenticate to the upstream providers, so the agent
prepares the list; Christian performs the actual rotation and ticks each
row off.

No secret values appear in this file — by design.

## Why rotate at all?

Git history is clean (see `secret-scan-report.md`). The reason to rotate
is defence-in-depth: any key that has ever touched a private repo on a
laptop, a CI run, or a screen-share is treated as "potentially seen" and
swapped out before the repo goes public.

## Rotation checklist

| Key | Where it lives | Rotated by | Rotated on | Status |
|-----|----------------|-----------|------------|--------|
| `OPENROUTER_API_KEY` | OpenRouter dashboard → `.env.local` + Vercel prod | Christian | rotated 2026-05-23 | ☐ pending |
| `AUTH_SECRET` | local `openssl rand -hex 32` → `.env.local` + Vercel prod (invalidates all sessions on rotate — expected) | Christian | rotated 2026-05-23 | ☐ pending |
| `OPERATOR_PASSWORD` | choose a strong one → `.env.local` + Vercel prod (current value `demo1234` is too weak for a public-ish prod URL) | Christian | rotated 2026-05-23 | ☐ pending |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub → Settings → Developer settings → OAuth Apps → Generate new client secret → `.env.local` + Vercel prod | Christian | rotated 2026-05-23 | ☐ pending |
| `RESEND_API_KEY` | Resend dashboard (currently empty, fresh-issue whenever magic-link auth is wired up) | Christian | n/a — empty | ☐ pending |
| `DATABASE_URL` (Neon password) | Neon console → Roles → `neondb_owner` → Reset password → update `.env.local` + Vercel prod | Christian | rotated 2026-05-23 | ☐ pending |
| `VERCEL_OIDC_TOKEN` | Auto-managed by Vercel; regenerated every `vercel env pull`. No action. | n/a | n/a | n/a |
| `GITHUB_OAUTH_CLIENT_ID` | Public identifier, but rotated together with the secret if a new OAuth app is created. | Christian | optional | ☐ optional |

## How to apply rotated values

1. **OpenRouter, GitHub, Resend, Neon** → rotate in the provider dashboard,
   copy the new value once.
2. **`AUTH_SECRET`, `OPERATOR_PASSWORD`** → generate locally
   (`openssl rand -hex 32` for the secret, a passphrase generator for the
   password).
3. Update Christian's laptop:

   ```bash
   $EDITOR ~/Dev/ïdea.com/modelarena/.env.local
   ```

4. Update Vercel production:

   ```bash
   cd ~/Dev/ïdea.com/modelarena
   vercel env rm   OPENROUTER_API_KEY production   # repeat per key
   vercel env add  OPENROUTER_API_KEY production
   # paste the new value when prompted
   vercel env pull .env.production.local            # re-sync the local mirror
   vercel --prod                                    # ship a deploy that uses the new key
   ```

5. Tick the row above and commit this file (no values ever go in).

## Belt-and-braces

After the public flip, sign up for [Secret scanning push protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations)
on the new public repo so GitHub blocks any accidental future push that
contains a recognized provider key.
