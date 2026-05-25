# Failure Modes

ïdea Bench is evidence infrastructure, not an oracle. These are the failure modes that matter most for private model decisions.

## Contestant Identity Leaks Into The Prompt Or Output

The app hides model, prompt, and contestant metadata from voters, but it cannot scrub identity from text the operator puts into the prompt or pasted generations. If one contestant says "As GPT-5..." or uses provider-specific formatting, the blind comparison is no longer blind.

Current mitigation: the voting API and DOM do not expose contestant identity before reveal. Operator mitigation: review pasted/generated outputs before activation when the decision depends on true blindness.

Remaining risk: provider style can still be recognizable to experienced voters.

## Small Samples Look More Certain Than They Are

Bradley-Terry ratings are useful early, but early campaigns can produce wide confidence intervals and unstable ranks. A narrow-looking leaderboard with eight votes is false comfort.

Current mitigation: the dashboard shows confidence intervals, sample counts, and stability language so directional results stay visibly directional.

Remaining risk: an operator can still over-trust a preliminary winner in a meeting.

## Simulated Personas Are Not Human Preference Evidence

Simulated votes are useful for rehearsal, sensitivity checks, and spotting obviously weak variants. They are not a substitute for real voters when the decision depends on human taste, trust, or policy judgment.

Current mitigation: simulated runs are separated from human votes in the ratings source filter, and AI spend is gated through `AI_ALLOWED_IDENTITIES`.

Remaining risk: simulated persona results can feel more authoritative than they are because they arrive quickly and fill the leaderboard.

## Provider Drift Changes The Contest

OpenRouter-backed model IDs point to live providers. A rerun weeks later may hit model behavior that has changed under the same public name.

Current mitigation: campaign exports include provider model IDs, timestamps, vote logs, ratings, and confidence intervals.

Remaining risk: exported evidence proves what happened then; it does not guarantee the same ranking today.

## Self-Hosted Single-Operator Is Not Team Governance

The current product shape assumes one trusted operator per deployment. It is not a hosted multi-tenant SaaS, and it does not yet provide team RBAC, billing, audit trails, or workspace separation.

Current mitigation: the README states the single-operator alpha status, and password sessions are blocked from AI-spending endpoints.

Remaining risk: deploying it as shared team software before those boundaries exist creates accountability gaps.
