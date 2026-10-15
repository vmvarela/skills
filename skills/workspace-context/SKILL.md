---
name: workspace-context
description: >
  Edit the workspace AGENTS.md and context/*.md using the five-section format
  (Project summary, Key files, Development and validation, Guardrails,
  Definition of done). Use when changing workspace guidance, creating or
  migrating context/<repo>.md, or consolidating lessons.
---

Maintain workspace docs precisely. Never invent facts. Keep AGENTS.md and context files ≤50 lines.

## Required format

Workspace `AGENTS.md` and every `context/*.md` must match exactly:

```
# <title>
## Project summary
<purpose and toolchain>
## Key files
- `path/relative/file`: concrete responsibility.
## Development and validation
- <instruction>: `exact command`
## Guardrails
- <rule the agent must not skip, or when to ask for authorization>
## Definition of done
- <check: lint, format, build, tests, or review step>
```

## Rules

- Exactly the five `##` headings above, in this order, no other `##` headings.
- `AGENTS.md` and each `context/*.md` at most 50 lines; consolidate rather than exceed.
- Key files: one bullet per path, or one bullet per group of paths sharing a single concrete responsibility (no vague "core logic").
- Commands are exact and run from the repo root unless stated otherwise.
- Explicitly state inapplicable validation steps (e.g. no linter, formatter, build, or dev server); never silently omit them.
- Never invent facts; verify against the live repo.
- Never store or print secrets (keys, tokens, `.env`, `.envrc`); report path + key name and recommend rotation.

## Workflow

1. Read the target file(s) fully before editing.
2. For `context/<repo>.md`, verify paths and commands against the repo when it
   exists locally under `projects/<repo>/`; otherwise inspect its README.
3. If inspected code contradicts stored guidance, explain the discrepancy and
   ask for confirmation before saving the correction.
4. When moving or merging content, transfer it between sections; never drop it.
5. Ask when repo conventions or scope are unclear.

## Consolidation

- Remove context blocks already covered by workspace AGENTS.md.
- Promote blocks shared by 2+ contexts to the matching section of workspace AGENTS.md.
- Keep unique project guidance in its own context file.
- Preview proposed changes in the reply before applying any consolidation.

## Validation

- `grep -n '^## ' <file>` shows exactly the five headings in order.
- `wc -l <file>` reports ≤50.
