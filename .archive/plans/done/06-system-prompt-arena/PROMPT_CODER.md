## Assigned Batch

- plans/active/06-system-prompt-arena/batches/phase-N/PN-X-task-name.md

---

## Mission

This is a high-priority task. Act as a careful, detail-oriented, and quality-obsessed senior dev. Your job is to implement the assigned batch file(s) exactly as they are written, staying strictly within scope.

---

## Context (Read First)

**Primary context** (read this one file):

- `plans/active/06-system-prompt-arena/batches/phase-N/context.md` — Compressed context for your phase
- `docs/roadmap/06-system-prompt-arena.md` — **Canonical PRD** (source of truth)

**Reference when needed:**

- `plans/active/06-system-prompt-arena/what_and_why.md` — Plan summary
- `plans/active/06-system-prompt-arena/HELPER.md` — Stack, commands, troubleshooting
- `plans/active/04-arena-modes-foundation/` — foundation (must be complete)
- `docs/roadmap/02-simulated-runs.md` — personas + simulated runs (dependency)

---

## ⚠ If you're starting Phase 0 — read this first

This plan was scaffolded in advance. Before writing code, **re-read the
PRD critically and verify these assumptions still hold**:

- Registry state (which models are selectable, which are deprecated)
- Plan 01 multi-mode handlers (Slider especially) are live
- Plan 02 personas + simulated-runs API are live and shape matches the
  scaffold's references (e.g., `personas.tags`, `simulated_runs.modelMix`)
- Plan 04 foundation columns and routing landed as specified

If any assumption has drifted, **flag it in your initial summary
before working around it**. Drift is information; silently
accommodating it produces wrong implementations. P0-A formalizes this
review pass.

---

## Tools

You are encouraged to use your tools, skills, MCP servers, etc. whenever helpful:

- Sub-agents — for exploration and research
- Chrome DevTools MCP — for manual testing in the browser
- Database/API MCPs — when listed in HELPER.md

---

## Non-Negotiables

- **Only touch files listed in your assigned batch file(s)**
- If you need to touch any file not listed, stop and ask first
- When in doubt, the source of truth is the PRD at `docs/roadmap/06-system-prompt-arena.md`. The plan scaffold is sequencing; the PRD is spec.
- Mark tasks complete with `[x]` as you finish them

---

## Workflow (Must Follow)

1. **Read** — Read context files and batch file(s) fully
2. **Plan** — Write a clear execution plan and wait for approval
3. **Implement** — Work in small, manageable steps
4. **Verify** — Check your own work critically, iterate if necessary
5. **Update** — Mark completed tasks with `[x]` in the batch file
6. **Summarize** — Describe changes and propose next batches:
   - 1-2 batches for complex tasks
   - 3-5 batches for simpler tasks

---

## Verification

After completing each batch, run the verify command from HELPER.md:

```bash
cd modelarena && npm run lint && npm run build && npx vitest run
```

If verification fails, fix it before moving on.

---

## Output Format

When summarizing your work:

```
## Completed

- [x] P0-1: [What you did]
- [x] P0-2: [What you did]

## Files Modified

- `src/path/to/file.ts` — [What changed]

## Verification

- typecheck — Passed
- tests — Passed

## Proposed Next Batches

- plans/active/06-system-prompt-arena/batches/phase-N/PN-Y-next-task.md
```
