---
name: workspace-context
description: >
  Maintain only the workspace AGENTS.md and context/*.md: five-section
  structure, scoped guidance and evidence-preserving consolidation. Use when
  changing workspace guidance, creating or migrating context/<repo>.md, or
  consolidating lessons. Other Markdown and instruction files keep their own
  format.
---

## Required format

Use exactly these five `##` headings, in order, with at most 50 lines per file:

```
# <title>
## Project summary
<purpose and toolchain>
## Key files
- <path or related path group>: concrete responsibility.
## Development and validation
- <exact command and when it applies>
## Guardrails
- <constraint or scoped policy exception>
## Definition of done
- <required evidence>
```

## Editing

1. Read each target fully and follow AGENTS.md for authority, confirmation
   and consolidation. Preview structural changes before applying them.
2. For factual changes, verify paths and commands in the target repo when in
   scope; for `context/<repo>.md`, that repo is under `projects/<repo>/`.
   Otherwise retain the recorded baseline and state what was not revalidated.
   Editorial consolidation must not imply fresh technical verification.
3. Preserve unique requirements, exceptions, failure handling and evidence
   limits. Delete redundant wording, not distinct constraints.
4. Keep commands relative to the target repo unless stated otherwise. Name
   inapplicable installation, lint, format, build, test or server steps.
5. Keep technical guidance scoped; shared tooling can be an on-demand reference,
   but repetition alone does not justify promotion to global policy.

## Validation

- Check the exact headings with `grep -n '^## ' <file>` and lines with `wc -l`.
- Compare words and characters before and after, separating root instructions,
  selected contexts, skill descriptions and on-demand bodies or references.
- Review authority, approval and exception scenarios, links and inventories.
  Shorter text is useful only when the intended behavior remains clear.
