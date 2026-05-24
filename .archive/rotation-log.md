# Key rotation log — pre-publish

Rotation record before flipping `modelarena` public. Christian is the
only person who can authenticate to the upstream providers, so this file
records the provider-side rotations without storing any values.

No secret values appear in this file — by design.

## Why rotate at all?

Git history is clean (see `secret-scan-report.md`). The reason to rotate
is defence-in-depth: any key that has ever touched a private repo on a
laptop, a CI run, or a screen-share is treated as "potentially seen" and
swapped out before the repo goes public.

## Rotation record

| Key | Where it lives | Rotated by | Rotated on | Notes |
|-----|----------------|-----------|------------|-------|
| `OPENROUTER_API_KEY` | OpenRouter dashboard → `.env.local` + Vercel prod | Christian | 2026-05-23 | Completed before public flip. |
| `AUTH_SECRET` | local `openssl rand -hex 32` → `.env.local` + Vercel prod | Christian | 2026-05-23 | Completed; invalidates prior sessions as expected. |
| `OPERATOR_PASSWORD` | strong operator password → `.env.local` + Vercel prod | Christian | 2026-05-23 | Completed; replaced the old weak local value. |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App → `.env.local` + Vercel prod | Christian | 2026-05-23 | Completed before public flip. |
| `RESEND_API_KEY` | Resend dashboard | n/a | n/a | Empty during audit; issue fresh when email magic-link auth is enabled. |
| `DATABASE_URL` password | Postgres provider role password → `.env.local` + Vercel prod | Christian | 2026-05-23 | Completed before public flip. |
| `VERCEL_OIDC_TOKEN` | Auto-managed by Vercel; regenerated every `vercel env pull`. No action. | n/a | n/a | n/a |
| `GITHUB_OAUTH_CLIENT_ID` | Public identifier, rotated only if a new OAuth app is created. | Christian | optional | Public identifier; not a secret. |

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

5. Update this file with dates only (no values ever go in).

## Belt-and-braces

After the public flip, sign up for [Secret scanning push protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations)
on the new public repo so GitHub blocks any accidental future push that
contains a recognized provider key.
