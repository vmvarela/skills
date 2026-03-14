# Copilot Agent Instructions

## Project Management (GitHub Scrum)

When working with pull requests, issues, milestones, sprints, labels, releases, retrospectives, backlog management, or any other aspect of project management on GitHub, use the **github-scrum** skill located at `skills/github-scrum/SKILL.md`.

## Documentation (Pragmatic Docs)

When creating, editing, or reviewing documentation — including README files, module docs, guides, CONTRIBUTING.md, or any content under `docs/` — use the **pragmatic-docs** skill located at `skills/pragmatic-docs/SKILL.md`.

## Conventions

- Branch names: `issue-{number}/{short-description}`
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`, etc.)
- PRs: squash merge, delete branch after merge
- Labels follow the Scrum label system (`type:*`, `priority:*`, `size:*`, `status:*`) — see `github-scrum` skill for details
- When closing/merging a PR, remove the `status:*` label from the linked issue (status labels are transient workflow state, not permanent metadata)
