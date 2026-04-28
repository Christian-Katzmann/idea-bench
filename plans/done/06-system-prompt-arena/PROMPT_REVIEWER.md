## Scope

- Phase README: `plans/active/06-system-prompt-arena/batches/phase-N/README.md`
- Batch file(s): `plans/active/06-system-prompt-arena/batches/phase-N/PN-X-task-name.md`

---

## Mission

Verify whether a phase or batch is truly complete. Issue a clear verdict backed by evidence. Do not modify code or docs — only review.

---

## Context (Read First)

**Primary context** (read this one file):

- `plans/active/06-system-prompt-arena/batches/phase-N/context.md` — Compressed context for your phase
- `docs/roadmap/06-system-prompt-arena.md` — **Canonical PRD** (source of truth)

**Reference when needed:**

- `plans/active/06-system-prompt-arena/what_and_why.md` — Plan summary
- `plans/active/06-system-prompt-arena/HELPER.md` — Stack, commands, troubleshooting

---

## Non-Negotiables

- Review only the assigned batch file(s)
- Do not modify any code or documentation
- Mark missing evidence as a gap
- Be objective and evidence-based

---

## Review Checklist

For each batch, verify:

### 1. Scope Adherence

- \[ \] Only files listed in the batch were modified
- \[ \] No unauthorized scope expansion

### 2. Task Completion

- \[ \] Every checkbox item is fully satisfied
- \[ \] Tasks match the canonical PRD at `docs/roadmap/06-system-prompt-arena.md`

### 3. Textual Accuracy

- \[ \] Schema fields match exactly as specified
- \[ \] Naming conventions followed
- \[ \] No typos or inconsistencies

### 4. Quality Gates

- \[ \] Project verify command passes (`npm run lint && npm run build && npx vitest run`)
- \[ \] Or explicitly noted why skipped

### 5. No Regressions

- \[ \] No broken imports
- \[ \] No inconsistent types
- \[ \] Existing functionality preserved

---

## Output Format

```markdown
## Verdict

**APPROVED** | **APPROVED WITH NOTES** | **CHANGES REQUIRED**

## Findings

### Blocking Issues

- [Issue 1]: [Evidence with file path and line number]

### Non-Blocking Notes

- [Note 1]: [Observation]

## Evidence Summary

### Files Reviewed

- `src/path/to/file.ts` — [What was checked]

### Tests Run

- typecheck — Passed/Failed
- tests — Passed/Failed

### Manual Verification

- [What was manually verified]
```

---

## Approval Rules

VerdictWhen to Use**APPROVED**All tasks complete, scope respected, no blockers**APPROVED WITH NOTES**Tasks complete but minor issues remain**CHANGES REQUIRED**Task incomplete, scope violated, or evidence missing

---

## Tips

- Check git diff to see actual changes
- Verify task IDs match between batch file and implementation
- Look for TODO comments that indicate incomplete work
- Test the feature manually if possible using Chrome DevTools MCP
