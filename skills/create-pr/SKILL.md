---
name: create-pr
description: >
  Draft or open a pull request when asked, using a Conventional Commits title,
  the applicable template and verified validation results. Use for /create-pr.
---

Follow AGENTS.md and the selected `context/<repo>.md` for authorization,
validation, screenshots and publication. This procedure does not redefine them.
It uses GitHub's `gh` CLI; other code hosts need their own variant.

## Draft

1. Read the task issue, final diff and any repository PR template.
2. Use a Conventional Commit title per AGENTS.md.
3. Build the English body from AGENTS.md and the repository PR template;
   retain mandatory fields.
4. Link the verified task issue with `Closes #N` or the template's equivalent.
   Resolve it from task context first; a branch name is only a hint. Ask only
   when the issue is genuinely unknown or ambiguous.
5. Report checks actually run, limitations and remaining work. Follow AGENTS.md
   for visual-change captures.
6. Show the proposed title and body. A draft-only request ends here.

## Publish

For an open or update request, publish only after satisfying the validation and
review gate in AGENTS.md.
Resolve the repository per AGENTS.md; ask if ambiguous. Use its default base
branch unless `context/<repo>.md` specifies another; ask if unclear.
Then run:

`gh pr create --repo <owner/repo> --base <base> --title <title> --body-file <file>`

Verify the resulting PR and update the issue's current state. Merge and release
actions are outside this procedure and follow AGENTS.md authorization.
