---
name: create-pr
description: >
  Create a pull request with a Conventional Commits title and a structured
  body. Use for "create a pull request", "open a PR", "write PR body",
  /create-pr.
---

Draft the PR, show a preview, and only publish after the review gate passes.

## Title
- Inspect the repo's last ~10 merged PRs: `gh pr list --state merged --limit 10 --json title`.
- If a clear majority style exists (Conventional Commits prefixes or another consistent format), match it.
- Otherwise use Conventional Commits: `<type>(<scope>): <summary>`.
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`.
- Semantic-release repos: follow AGENTS.md — align analyzer/notes parsing and use `!` and `BREAKING CHANGE:` footers.

## Body (English only)
Exactly these sections, in this order:
- `## What` — what changes.
- `## Why` — motivation.
- `## How tested` — validation actually run. Never invent results.
- `## Remaining work` — write `None` if nothing is left.

## Rules
- **Template**: if `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, or `.github/pull_request_template/` exists, the template takes precedence. Keep and fill all its mandatory sections; add the four sections above where they fit, mapping to overlapping template sections. Never drop template requirements.
- **Linked issue (mandatory)**: the body must contain `Closes #N` (or the template's equivalent). Detect `N` from the branch name; if not detected, ask the user before drafting. Never guess.
- **Visual UI changes**: if the diff touches UI/visual files, the body must include before/after screenshot links. If screenshots are missing, stop and report — do not publish.
- **No AI attribution** or "Generated with" phrases.
- **Multiline bodies**: use `--body-file <file>`, never an inline `--body`.
- **SSH-alias repos**: pass `--repo vmvarela/<repo>` (or set `GH_REPO`).

## Flow
1. Draft title + body; show a preview to the user.
2. Create the PR only when BOTH hold:
   - Repo validation from `context/<repo>.md` passed, AND
   - The final diff was reviewed locally with findings resolved.
   If either is not satisfied, stop at the preview.
3. Create: `gh pr create --title <title> --body-file <file>`.
4. Never push to the default branch.

## Boundaries
Previews before the gate are drafts; do not run `gh pr create` until step 2 passes. If the user asks to merge, tag, or publish releases, that needs explicit approval in the same turn — this skill does not merge.
