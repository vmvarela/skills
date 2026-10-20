---
name: workspace-adoption
description: >
  Adopt, inspect, update or undo this package's shared operating rules and
  OpenCode defaults (plugins and oh-my-opencode-slim model routing) in a
  workspace. Use when the user asks to configure a workspace with these
  practices, integrate a newer package version, check its adoption status, or
  remove it. Local AGENTS.md, context files and configuration always take
  precedence over package defaults.
metadata:
  version: "0.6.0"
---

# Workspace adoption

Guide the user through adopting shared practices and OpenCode defaults in a
workspace that may already have its own rules, plugins, MCP servers and model
routing. Ask only for decisions that change the outcome. Never apply a change
before the user approves a preview.

## Precedence

- Workspace `AGENTS.md`, `context/*.md` and local configuration are
  authoritative. Shared rules defer to them.
- Plugin and instruction arrays combine across configuration files, so a
  package default cannot remove a local entry. Removal happens only by editing
  the workspace file, with approval.
- The package never adopts MCP servers, permissions, default agents or
  workspace-specific aliases.

## Files

| Path | Owner | Purpose |
|------|-------|---------|
| `.agents/skills/workspace-adoption/assets/` | package | Shipped defaults for the installed version. Replaced by each install. |
| `.agents/workspace-kit/state.json` | adoption | Applied version, selected components, added entries, excluded plugins, kept conflicts. |
| `.agents/workspace-kit/base/<version>/` | adoption | Snapshot of the defaults as applied; the merge base for updates. |
| `.agents/workspace-kit/rules.md` | adoption | Applied copy of the shared rules, loaded through `instructions`. |
| `.agents/workspace-kit/staging/` | adoption | Proposed files awaiting approval. Deleted after apply or cancel. |
| `.opencode/opencode.json` (or `.opencode/opencode.jsonc`) | workspace | Edited only for the approved entries. |
| `.opencode/oh-my-opencode-slim.jsonc` (or `.json`) | workspace | Edited only for the approved model sections. |

Do not read `.env*`, `.envrc`, `.ignore`, `.slim/` or any credential file.
Do not print MCP headers, environment values or tokens; report names only.

## Choose the flow

- No `state.json` and the user asks to adopt or configure: **Adopt**.
- `state.json` exists and this skill's `metadata.version` differs from
  `state.version`: **Update**.
- `state.json` exists and the versions match, or the user asks what is applied:
  **Status**.
- The user asks to undo or remove the adoption: **Undo**.

## Inventory (read-only)

1. Read `AGENTS.md`, list `context/`, and read `.opencode/` configuration.
2. Record plugin names (strip version suffixes such as `@latest`), `instructions`
   entries, Slim preset names and the agents each preset defines, and MCP server
   names only.
3. Note conflicts: a shared plugin already present, a shared Slim agent with a
   different model, or an existing rules file.

## Ask (selectable questions)

Use the harness question tool when available; otherwise present numbered
options and wait. Put the recommended option first.

1. Components (multi-select, recommended all):
   - Shared operating rules: added as an `instructions` entry after `AGENTS.md`.
   - OpenCode plugin defaults: each plugin is a separate choice. Unselected
     plugins are recorded as excluded and are never added again.
   - Slim default routing: added only for agents the workspace does not define.
2. For each conflict with a local value, choose: keep local (recommended) or use
   the package default. Record the choice.

## Verify models before preview

For each Slim model and variant the approved defaults add, confirm it exists with
the OpenCode models tool (`tools.opencode.models({ query, provider })`). If one
is missing, ask: keep the agent unset, choose a listed model, or skip that
agent. Never substitute a model silently.

## Stage and preview

1. Write the proposed final content of each changed file under
   `.agents/workspace-kit/staging/`.
2. Show each change as a unified diff (`diff -u <current> <staged>`), with a
   short summary: rules added, plugins added, exclusions recorded, conflicts kept,
   models verified or missing.
3. Ask: **Apply**, **Adjust selection**, or **Cancel**. Apply nothing unless the
   user picks Apply.

## Apply (after approval)

1. Copy `assets/*` into `.agents/workspace-kit/base/<version>/`.
2. Write `.agents/workspace-kit/rules.md` by copying `assets/rules.md`.
3. In the OpenCode config: append the `instructions` entry
   `.agents/workspace-kit/rules.md` when rules are selected and absent; append
   each approved plugin missing by name. Do not reorder or change existing
   entries. Preserve other keys, comments and formatting.
4. In the Slim config: add only the missing preset and agent sections. Keep local
   values, and set `preset` only if the file has none.
5. Write `state.json`: `version` (the installed `metadata.version`), `source` (the
   exact tag installed, for example `vmvarela/skills@v0.6.0`; never a branch name),
   selected components, `added` (entries this adoption introduced),
   `excluded.plugins`, `kept_conflicts`, and the model check date. If the install
   came from a branch, record that value as-is and say in the report that the
   version alone cannot identify the package content.
6. Delete `staging/`. Do not commit; if the workspace uses Git, suggest one
   separate commit.

## Verify

- Static: confirm each edited file still parses as JSON or JSONC and that
  `state.json` is valid. Stop and report any parse error.
- Runtime: start a new OpenCode session (a restart may be required). Confirm
  the shared rules are in effect and the selected plugins and models appear in
  the loaded configuration. If you cannot confirm a runtime effect, report
  "applied; activation pending" rather than "verified".
- Report files changed, what was verified statically, what was verified at
  runtime, and what remains pending.

## Status

Read `state.json` and compare it with the installed package version. Report the
applied version, selected components, excluded plugins, kept conflicts, and any
local edits to added entries since adoption (compare the current values with
`base/<version>/`). Offer Update if a newer version is installed.

## Update

Precondition: the user installed the new version with
`npx skills add <owner>/skills#<tag> --skill workspace-adoption --agent opencode`
and started a new session. Compare the installed `metadata.version` with
`state.version`:

- Newer: proceed with the merge below.
- Equal, but the installed `assets/` differ from `base/<version>/`: the package
  changed without a version bump. Report it and ask whether to review it as an
  update; do not treat it as "no changes".
- Equal and identical: report "up to date" and stop.

For each owned item (the rules file, each shared plugin, each shared Slim agent),
compare three values: **base** (`base/<old>`), **new** (the installed assets), and
**local** (the current workspace value).

- local equals base: take new, if it differs. Include it in the preview.
- local differs from base, new equals base: keep local.
- local equals new: nothing to do.
- all three differ: conflict. Ask: keep local (recommended) or use new.
- item only in new: offer it as a new choice. Excluded plugins stay excluded.
- item removed from new: ask whether to remove it; default is keep.

Then run Stage, Apply and Verify. Record the new `version`, create
`base/<new>/`, and delete `base/<old>/` after a successful apply. Git history
serves as the rollback path.

## Undo

1. Show what would be removed: the rules file and `instructions` entry added by
   this adoption, plugins listed in `added.plugins`, and Slim sections listed in
   `added`, plus `.agents/workspace-kit/`.
2. Ask for approval. Remove only what `state.json` records as added. If an added
   entry changed since adoption, ask before removing it.
3. Leave kept local values and the installed skill folder. Tell the user that
   `npx skills remove workspace-adoption` removes the skill itself, if desired.

## Guardrails

- Never apply without a preview and an explicit approval in the same session.
- Never override local `AGENTS.md`, `context/*.md` or local configuration.
- Never add MCP servers, permissions or workspace-specific aliases from the
  package.
- Never commit, push, tag or publish unless the user asks.
- Report known limits: plugin versions use `@latest` unless the workspace pins
  them; OpenCode array fields combine across configuration files; behavior
  across models and harnesses is not guaranteed to match.
