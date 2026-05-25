# ADX Operating Layer

This directory is the machine-readable operating layer for AI coding agents
working in ïdea Bench.

Start here:

- `../AGENTS.md` - canonical human-readable project guide.
- `adx.json` - manifest describing installed ADX contracts.
- `commands.json` - command registry with cwd, safety class, and recovery hints.
- `verification.json` - which checks to run for each change type.
- `risks.json` - advisory safety boundaries.
- `recovery.md` - known failure modes and first recovery moves.
- `modules/index.json` - module map for common change areas.
- `audit/latest.json` - latest ADX audit summary.
- `implementation/` - receipts for ADX changes.

These files are advisory and inspectable. They do not install blocking hooks.
