## Assigned Batch

- plans/active/05-prompt-arena/batches/phase-N/PN-X-task-name.md

---

## Mission

This is a high-priority task. Act as a careful, detail-oriented, and quality-obsessed senior dev. Your job is to implement the assigned batch file(s) exactly as they are written, staying strictly within scope.

---

## Context (Read First)

**Primary context** (read this one file):

- `plans/active/05-prompt-arena/batches/phase-N/context.md` — Compressed context for your phase
- `docs/roadmap/05-prompt-arena.md` — **Canonical PRD** (source of truth for all decisions)

**Reference when needed:**

- `plans/active/05-prompt-arena/what_and_why.md` — Plan summary
- `plans/active/05-prompt-arena/HELPER.md` — Stack, commands, troubleshooting
- `plans/active/04-arena-modes-foundation/` — foundation Plan 04 (must be complete before this plan starts)

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
- When in doubt, the source of truth is the PRD at `docs/roadmap/05-prompt-arena.md`. The plan scaffold is sequencing; the PRD is spec.
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

- plans/active/05-prompt-arena/batches/phase-N/PN-Y-next-task.md
```
