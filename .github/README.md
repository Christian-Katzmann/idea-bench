# Repo administration

## Branch protection on `main`

`branch-protection-ruleset.json` is the prepared ruleset for `main`.

GitHub Free does not allow branch protection or rulesets on **private** repos,
so this file cannot be applied until the repo is public (or the account
upgrades to GitHub Pro). The moment visibility flips public, run:

```bash
gh api -X POST /repos/Christian-Katzmann/modelarena/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input .github/branch-protection-ruleset.json
```

The rule requires:

- A pull request before merging into `main` (one approval, stale reviews dismissed).
- The `lint+test+build` CI check (the job in `.github/workflows/ci.yml`) green.
- No force pushes, no branch deletion, conversations resolved.

## CI workflow

`.github/workflows/ci.yml` runs `npm run lint`, `npm run test:run`, and
`npm run build` on every PR and on every push to `main`. The exposed check is
`CI / lint+test+build` — that is the exact context name the ruleset above
references; don't rename the workflow or the job's `name:` field without also
updating the ruleset.
