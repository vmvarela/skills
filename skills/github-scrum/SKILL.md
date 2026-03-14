---
name: github-scrum
description: Manage software projects with Scrum on GitHub. Plan MVPs, maintain a Product Backlog as Issues, run Sprints as Milestones, and automate setup with GitHub MCP tools (preferred) or gh CLI (fallback). Adapted for solo developers and small teams (1-3 people). Use this skill whenever the user mentions sprints, issues, backlog, milestones, pull requests, project planning, releases, retrospectives, or any aspect of managing software work on GitHub — even if they don't explicitly mention Scrum.
---

# GitHub Scrum

Manage software projects using Scrum on GitHub, adapted for solo developers and small teams (1-3 people). This skill maps Scrum artifacts and events to GitHub primitives (Issues, Milestones, Labels, Releases) and automates project setup and sprint management.

Reference: [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html).

---

## Tooling Strategy

**Prefer GitHub MCP tools** (`mcp_github_github_*`) for all operations they support. Fall back to the `gh` CLI **only** when the MCP server does not expose the needed functionality.

The MCP server supports: Issues, Pull Requests, Branches, Releases, Labels (read), Files, Commits, Repository operations.

The MCP server does **not** support: label create/delete/list, milestones (use `gh api`), release creation.

> Always set `GH_PAGER=cat` when running `gh` commands to prevent interactive pagers from blocking script execution.

For a full command reference, see [references/tooling.md](references/tooling.md).

---

## Scrum → GitHub Mapping

| Scrum Concept | GitHub Primitive | Notes |
|---|---|---|
| Product Goal | Repo description + pinned issue | Long-term vision in 1-2 sentences |
| Product Backlog | Issues (open, no milestone) | Ordered by priority labels |
| Sprint | Milestone (with due date) | Fixed-length timebox (1-2 weeks recommended) |
| Sprint Backlog | Issues assigned to a milestone | Selected during Sprint Planning |
| Sprint Goal | Milestone description | Why this sprint is valuable |
| Increment | GitHub Release / tag | Usable product at sprint end |
| Definition of Done | Checklist in issue/PR template | Shared quality standard |
| Sprint Review | Close milestone + release notes | Inspect what was delivered |
| Sprint Retrospective | Issue with label `retrospective` | Inspect how work went |
| Backlog Refinement | Edit issues: add details, resize, reprioritize | Ongoing activity |

No formal role separation. The user acts as Product Owner, Scrum Master, and Developer.

---

## Labels System

Use namespaced labels with prefixes for filtering. Create all labels during project initialization.

| Category | Labels |
|---|---|
| **Type** | `type:feature` `type:bug` `type:chore` `type:spike` `type:docs` |
| **Priority** | `priority:critical` `priority:high` `priority:medium` `priority:low` |
| **Size** | `size:xs` `size:s` `size:m` `size:l` `size:xl` |
| **Status** | `status:ready` `status:in-progress` `status:blocked` `status:review` |
| **Special** | `mvp` `tech-debt` `retrospective` `stale` |

Colors and descriptions — use `gh` CLI to create (MCP does not support label creation):

```sh
# Remove default labels
GH_PAGER=cat gh label list --json name -q '.[].name' | xargs -I {} GH_PAGER=cat gh label delete {} --yes

GH_PAGER=cat gh label create "type:feature"       --color "1D76DB" --description "New functionality"
GH_PAGER=cat gh label create "type:bug"           --color "D73A4A" --description "Something isn't working"
GH_PAGER=cat gh label create "type:chore"         --color "0E8A16" --description "Maintenance, refactoring, tooling"
GH_PAGER=cat gh label create "type:spike"         --color "D4C5F9" --description "Research or investigation (timeboxed)"
GH_PAGER=cat gh label create "type:docs"          --color "0075CA" --description "Documentation only"
GH_PAGER=cat gh label create "priority:critical"  --color "B60205" --description "Must fix immediately — blocks everything"
GH_PAGER=cat gh label create "priority:high"      --color "D93F0B" --description "Must be in the next sprint"
GH_PAGER=cat gh label create "priority:medium"    --color "FBCA04" --description "Should be done soon"
GH_PAGER=cat gh label create "priority:low"       --color "C2E0C6" --description "Nice to have, do when possible"
GH_PAGER=cat gh label create "size:xs"            --color "EDEDED" --description "Trivial — less than 1 hour"
GH_PAGER=cat gh label create "size:s"             --color "D4C5F9" --description "Small — 1 to 4 hours"
GH_PAGER=cat gh label create "size:m"             --color "BFD4F2" --description "Medium — 4 to 8 hours"
GH_PAGER=cat gh label create "size:l"             --color "FBCA04" --description "Large — 1 to 2 days"
GH_PAGER=cat gh label create "size:xl"            --color "D93F0B" --description "Extra large — more than 2 days (split it)"
GH_PAGER=cat gh label create "status:ready"       --color "0E8A16" --description "Refined and ready for sprint selection"
GH_PAGER=cat gh label create "status:in-progress" --color "1D76DB" --description "Currently being worked on"
GH_PAGER=cat gh label create "status:blocked"     --color "B60205" --description "Waiting on something external"
GH_PAGER=cat gh label create "status:review"      --color "D4C5F9" --description "In code review or waiting for feedback"
GH_PAGER=cat gh label create "mvp"                --color "FEF2C0" --description "Part of the Minimum Viable Product"
GH_PAGER=cat gh label create "tech-debt"          --color "E4E669" --description "Technical debt — address proactively"
GH_PAGER=cat gh label create "retrospective"      --color "C5DEF5" --description "Sprint retrospective issue"
```

---

## Project Initialization

### 1. Define the Product Goal

Ask the user: *"In 1-2 sentences, what is the product and what problem does it solve?"*

Create a pinned issue titled **Product Goal**:

```
tool: mcp_github_github_issue_write
params:
  owner: <owner>
  repo: <repo>
  title: "Product Goal"
  body: "## Vision\n\n<user's answer>\n\n## Target Users\n\n<who benefits>\n\n## Success Criteria\n\n- [ ] <measurable outcome>"
  labels: ["type:docs"]
```

Then pin it (MCP does not support pinning):

```sh
GH_PAGER=cat gh issue pin <issue-number>
```

### 2. Create Labels

Run the label creation commands from the Labels System section above.

### 3. Identify the MVP

For each feature idea, apply: *"Without this, does the product make no sense?"*
- Yes → `mvp` + `priority:high` or `priority:critical`
- Important but not essential → `priority:medium`
- Nice to have → `priority:low`

Keep the MVP to 3-7 features. Create each as an issue with **Acceptance Criteria** as a checklist.

### 4. Create the First Sprint

```sh
GH_PAGER=cat gh api repos/{owner}/{repo}/milestones --method POST \
  --field title="Sprint 1" \
  --field description="Sprint Goal: <what makes this sprint valuable>" \
  --field due_on="<ISO 8601 date>"
```

Assign issues to the milestone:

```
tool: mcp_github_github_issue_write
params:
  owner: <owner>
  repo: <repo>
  issue_number: <number>
  milestone: <milestone-number>
```

### 5. Create Repository Scaffolding

Read templates and workflows from the reference files and create these files:

- Issue templates → see [references/templates.md](references/templates.md) for `backlog-item.yml` and `bug-report.yml`
- PR template → see [references/templates.md](references/templates.md) for `PULL_REQUEST_TEMPLATE.md`
- Labeler config → see [references/templates.md](references/templates.md) for `labeler.yml` and `release-drafter.yml`
- GitHub Actions workflows → see [references/workflows.md](references/workflows.md) for `labeler.yml`, `stale.yml`, `release-drafter.yml`, `auto-assign.yml`

```sh
mkdir -p .github/ISSUE_TEMPLATE .github/workflows
```

---

## Sprint Lifecycle

### Sprint Planning

1. **Review the backlog** — list `status:ready` issues with no milestone:
   ```
   tool: mcp_github_github_search_issues
   params:
     q: "repo:<owner>/<repo> is:issue is:open label:status:ready no:milestone"
   ```

2. **Propose sprint selection** based on: `critical` > `high` > `medium` > `low`, MVP items first, capacity fits duration.

3. **Define the Sprint Goal** — ask: *"What is the single most important outcome of this sprint?"*

4. **Create milestone and assign issues** (see Sprint Planning commands in [references/tooling.md](references/tooling.md)).

5. **Mark issues as in-progress** when work begins — add `status:in-progress`, remove `status:ready`.

### During the Sprint

- **Progress report** — list open/closed issues on the milestone.
- **Identify blockers** — search for `label:status:blocked`.
- **Update status labels** as issues move:
  - Starting → `status:in-progress` (remove `status:ready`)
  - PR open → `status:review` (remove `status:in-progress`)
  - Blocked → `status:blocked` (remove `status:in-progress`)
  - Done → remove all `status:*`, close the issue

### Sprint Review

1. List completed issues (closed on milestone).
2. Move carryover issues back to backlog: remove milestone, remove `status:*` labels, add `status:ready`.
3. Create a release if there is a usable Increment (`gh release create`).
4. Close the milestone (`gh api ... --method PATCH --field state="closed"`).

### Sprint Retrospective

Create a retrospective issue with label `retrospective`:

```
tool: mcp_github_github_issue_write
params:
  owner: <owner>
  repo: <repo>
  title: "Retrospective: Sprint N"
  body: "## What went well?\n\n- \n\n## What could be improved?\n\n- \n\n## Action items for next sprint\n\n- [ ] \n\n## Metrics\n\n- **Planned:** X issues\n- **Completed:** Y issues\n- **Carried over:** Z issues\n- **Sprint Goal met:** Yes/No"
  labels: ["retrospective"]
```

---

## Backlog Refinement

### Split Large Issues (`size:xl`)

1. Create sub-issues linked with "Part of #N".
2. Close the original with a comment listing the new issues.
3. Remove all `status:*` labels from the original before closing.

### Add Missing Details

For issues without acceptance criteria: propose concrete criteria, update body, add `status:ready`.

### Reprioritize

List open backlog items (no milestone), review with the user, update priority labels.

---

## Definition of Done

Every issue must meet these criteria before closing:

- [ ] Code implemented and functional
- [ ] All acceptance criteria from the issue are met
- [ ] Tests written and passing (when applicable)
- [ ] No lint or compilation errors
- [ ] Self-reviewed (read your own diff before closing)
- [ ] Documentation updated (if user-facing behavior changed)
- [ ] All `status:*` labels removed from the issue
- [ ] Issue closed with reference to the commit or PR

### Applying the Definition of Done

When the user says an issue is done:

1. **Check acceptance criteria** — read the issue, confirm each criterion is checked.
2. **Check code quality** — run lint/tests if configured.
3. **Remove `status:*` labels and close** with a reference:

```
tool: mcp_github_github_add_issue_comment
params:
  owner: <owner>
  repo: <repo>
  issue_number: <number>
  body: "Done in <commit-sha or PR #>"

tool: mcp_github_github_issue_write
params:
  owner: <owner>
  repo: <repo>
  issue_number: <number>
  labels: [<existing labels minus any "status:*" labels>]
  state: "closed"
```

If any criterion is not met, tell the user what's missing before closing.

### Closing or Merging a PR

When a PR is closed or merged, **remove all `status:*` labels from the linked issue**. Status labels represent transient workflow state and must not remain as permanent metadata after the work is done.

```
tool: mcp_github_github_issue_write
params:
  owner: <owner>
  repo: <repo>
  issue_number: <linked-issue-number>
  labels: [<existing labels minus any "status:*" labels>]
```

---

## When to Apply This Skill

- Starting a new project and need to organize work from day one
- Planning an MVP or defining what to build first
- Managing a Product Backlog — creating, refining, prioritizing issues
- Running Sprints — planning, tracking, reviewing, retrospecting
- Setting up labels and milestones for a Scrum workflow
- Asking for a progress report or sprint status
- Performing backlog refinement — splitting issues, adding acceptance criteria
- Closing a sprint and creating a release

### Adaptation Guidelines

**Solo developer:** Skip Daily Scrum. Use 1-week sprints. Agent acts as thinking partner.

**Small team (2-3):** Use all events. Use 2-week sprints. Retrospectives are more valuable with multiple perspectives.

**Existing project:** Skip MVP identification. Create labels, triage existing issues, start sprinting from current state.
