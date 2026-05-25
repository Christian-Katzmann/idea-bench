# Repo administration

## Branch protection on `main`

`branch-protection-ruleset.json` is the source-of-truth ruleset for `main`.

Apply or re-apply it with:

```bash
gh api -X POST /repos/Christian-Katzmann/idea-bench/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input .github/branch-protection-ruleset.json
```

GitHub Free allows this ruleset on public repositories. If the repo is ever
made private again, GitHub may require Pro before the ruleset can stay active.

The rule requires:

- A pull request before merging into `main` (one approval, stale reviews dismissed).
- The `lint+test+build` CI check (the job in `.github/workflows/ci.yml`) green.
- No force pushes, no branch deletion, conversations resolved.

## CI workflow

`.github/workflows/ci.yml` runs `npm run lint`, `npm run test:run`, and
`npm run build` on every PR and on every push to `main`. The required
status-check context is `lint+test+build` — that is the exact context name the
ruleset above references; don't rename the job's `name:` field without also
updating the ruleset.
