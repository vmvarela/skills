---
name: issue-workflow-github
description: >
  Triage and execute GitHub work for a workspace. Use when the user asks for an
  inbox of GitHub work (assigned issues, unlinked open pull requests, security
  alerts, backlog items) or asks to work a GitHub issue by number or URL.
  Requires a workspace with repositories under projects/<repo>/ and GitHub
  remotes. Use issue-workflow-jira for Jira-backed trackers.
---

Follow AGENTS.md and the selected `context/<repo>.md` for Git operations,
authorization, issue state and publication; this skill defines no conventions
for those operations.

Declare an optional backlog in the workspace AGENTS.md with one line:
``- Backlog: `path/to/file` ``. Without that line, no backlog is read.

## inbox: read-only prioritization

1. Run `./.agents/skills/issue-workflow-github/scripts/inbox.sh` from the
   workspace root. It derives repositories from `projects/*/` origin remotes and
   reports checkout state, the active GitHub user, assigned issues, unlinked
   open PRs, open security alerts and the declared backlog.
2. Treat failures as incomplete results, never as empty results. The script
   exits non-zero when GitHub data or the declared backlog is unavailable.
   Alert counts are capped at 100 per category and marked `100+` at the cap.
3. Rank candidates, then propose up to three actionable items with repo or
   project, reference or link and a short reason, using the question tool:
   1. security alerts by severity (secret-scanning, then dependabot or
      code-scanning critical/high, then medium/warning);
   2. work already in progress (own branch or open PR on the issue);
   3. assigned issues (`priority:*` or `bug` labels first, then most recent
      `updatedAt`);
   4. PRs without a linked issue, one option per repo (dependency-update batches
      take at most one slot);
   5. backlog entries in file order.
   Offer one option per repo unless fewer than three candidates exist. Report
   incomplete results rather than inventing candidates or treating failed reads
   as empty inboxes.
4. Wait for the user's choice. Listing work does not change external state.

## work <ref>: execute the selected task

1. Resolve `234`, `#234` or an issue URL against the selected repository. Read
   `gh issue view <n> --repo <owner/repo> --json number,title,body,comments,url`.
   If the issue is absent, check the backlog; a chosen backlog item needs a
   linked task issue before implementation. Ask when the target is ambiguous or
   no item matches.
2. Read the selected `context/<repo>.md` and the relevant README, source and
   tests, as AGENTS.md requires.
3. Update the issue and record decisions and validation as AGENTS.md requires.
4. Implement the selected scope using the workspace Git policy and the project's
   validation commands. Ask only for unresolved requirements or missing evidence.
5. Load `create-pr` to prepare, publish and verify the pull request and update
   the issue state. This workflow ends with an open pull request; merge and
   release follow the workspace authorization rules.
