# Where ïdea Bench is going

A short public-facing view of the directions we're investing in next. Not a commitment, not a schedule — just enough context to decide whether to use ïdea Bench today.

## Three directions

1. **More than tournaments.** Today every prompt resolves to A/B blind voting. Some judgements need a slider, an approve/reject, a best-of-N, or a multi-axis rubric. We're generalizing the campaign so each prompt picks the evaluation instrument that fits the question.

2. **Simulated panels.** A persona library that lets you run a campaign without humans — fast iteration before you commit to a real voter cohort. Personas are first-class: a curated starter set, plus custom personas you write and duplicate. Useful before the humans show up, not as a replacement for them.

3. **Reuse infrastructure.** Prompt collections (folders + tags) and first-class campaign duplication so you stop hand-copying a working setup every time you want to run a variant.

## What's already in

Today ïdea Bench ships with three campaign kinds in one engine: **model arenas** (compare models head-to-head), **system-prompt arenas** (compare system prompts on a fixed model), and **prompt arenas** (compare prompt variants on a fixed model). Same blind-voting UI, same Bradley-Terry rating math across all three.

## Not on the roadmap

Things we considered and consciously left out, so you know what ïdea Bench is *not* trying to become:

- A production LLM router or traffic-hosting layer.
- An LLM-as-judge auto-grader (judges are humans or human-shaped panels, by design).
- A multi-tenant SaaS — ïdea Bench is self-hosted single-operator first. A team mode is plausible later; we'll know when we get there.
