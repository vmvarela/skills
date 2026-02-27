---
name: github-scrum
description: Manage software projects with Scrum on GitHub. Plan MVPs, maintain a Product Backlog as Issues, run Sprints as Milestones, and automate setup with gh CLI. Adapted for solo developers and small teams (1-3 people).
---

# GitHub Scrum

Manage software projects using Scrum on GitHub, adapted for solo developers and small teams (1-3 people). This skill maps Scrum artifacts and events to GitHub primitives (Issues, Milestones, Labels, Releases) and automates project setup and sprint management using `gh` CLI.

Reference: [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html).

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

No formal role separation. The user acts as Product Owner, Scrum Master, and Developer. The agent assists with planning, tracking, and automation.

---

## Labels System

Use namespaced labels with prefixes for filtering. Create all labels during project initialization.

### Type

| Label | Color | Description |
|---|---|---|
| `type:feature` | `#1D76DB` | New functionality |
| `type:bug` | `#D73A4A` | Something isn't working |
| `type:chore` | `#0E8A16` | Maintenance, refactoring, tooling |
| `type:spike` | `#D4C5F9` | Research or investigation (timeboxed) |
| `type:docs` | `#0075CA` | Documentation only |

### Priority

| Label | Color | Description |
|---|---|---|
| `priority:critical` | `#B60205` | Must fix immediately — blocks everything |
| `priority:high` | `#D93F0B` | Must be in the next sprint |
| `priority:medium` | `#FBCA04` | Should be done soon |
| `priority:low` | `#C2E0C6` | Nice to have, do when possible |

### Size (Relative Estimation)

| Label | Color | Description |
|---|---|---|
| `size:xs` | `#EDEDED` | Trivial — less than 1 hour |
| `size:s` | `#D4C5F9` | Small — 1 to 4 hours |
| `size:m` | `#BFD4F2` | Medium — 4 to 8 hours (half day to full day) |
| `size:l` | `#FBCA04` | Large — 1 to 2 days |
| `size:xl` | `#D93F0B` | Extra large — more than 2 days (should be split) |

### Status

| Label | Color | Description |
|---|---|---|
| `status:ready` | `#0E8A16` | Refined and ready for sprint selection |
| `status:in-progress` | `#1D76DB` | Currently being worked on |
| `status:blocked` | `#B60205` | Waiting on something external |
| `status:review` | `#D4C5F9` | In code review or waiting for feedback |

### Special

| Label | Color | Description |
|---|---|---|
| `mvp` | `#FEF2C0` | Part of the Minimum Viable Product |
| `tech-debt` | `#E4E669` | Technical debt — address proactively |
| `retrospective` | `#C5DEF5` | Sprint retrospective issue |

---

## Project Initialization

When the user wants to start a new project with Scrum, execute this workflow. Ask the user for input at each decision point.

### 1. Define the Product Goal

Ask the user: *"In 1-2 sentences, what is the product and what problem does it solve?"*

Use the answer as:
- The repository description (if creating a new repo)
- A pinned issue titled **Product Goal** with the full vision

```sh
gh issue create --title "Product Goal" --body "## Vision\n\n<user's answer>\n\n## Target Users\n\n<who benefits>\n\n## Success Criteria\n\n- [ ] <measurable outcome>" --label "type:docs" --pinned
```

### 2. Create Labels

Delete GitHub's default labels and create the Scrum label set:

```sh
# Remove default labels
gh label list --json name -q '.[].name' | xargs -I {} gh label delete {} --yes

# Type labels
gh label create "type:feature" --color "1D76DB" --description "New functionality"
gh label create "type:bug" --color "D73A4A" --description "Something isn't working"
gh label create "type:chore" --color "0E8A16" --description "Maintenance, refactoring, tooling"
gh label create "type:spike" --color "D4C5F9" --description "Research or investigation (timeboxed)"
gh label create "type:docs" --color "0075CA" --description "Documentation only"

# Priority labels
gh label create "priority:critical" --color "B60205" --description "Must fix immediately — blocks everything"
gh label create "priority:high" --color "D93F0B" --description "Must be in the next sprint"
gh label create "priority:medium" --color "FBCA04" --description "Should be done soon"
gh label create "priority:low" --color "C2E0C6" --description "Nice to have, do when possible"

# Size labels
gh label create "size:xs" --color "EDEDED" --description "Trivial — less than 1 hour"
gh label create "size:s" --color "D4C5F9" --description "Small — 1 to 4 hours"
gh label create "size:m" --color "BFD4F2" --description "Medium — 4 to 8 hours"
gh label create "size:l" --color "FBCA04" --description "Large — 1 to 2 days"
gh label create "size:xl" --color "D93F0B" --description "Extra large — more than 2 days (split it)"

# Status labels
gh label create "status:ready" --color "0E8A16" --description "Refined and ready for sprint selection"
gh label create "status:in-progress" --color "1D76DB" --description "Currently being worked on"
gh label create "status:blocked" --color "B60205" --description "Waiting on something external"
gh label create "status:review" --color "D4C5F9" --description "In code review or waiting for feedback"

# Special labels
gh label create "mvp" --color "FEF2C0" --description "Part of the Minimum Viable Product"
gh label create "tech-debt" --color "E4E669" --description "Technical debt — address proactively"
gh label create "retrospective" --color "C5DEF5" --description "Sprint retrospective issue"
```

### 3. Identify the MVP

Help the user define the Minimum Viable Product. For each feature idea, apply this filter:

> **"Without this, does the product make no sense?"**
> - **Yes** → label `mvp` + `priority:high` or `priority:critical`
> - **No, but it's important** → `priority:medium`, no `mvp` label
> - **Nice to have** → `priority:low`, no `mvp` label

Guide the user to keep the MVP as small as possible — typically 3-7 features. The MVP is the smallest thing that delivers the core value proposition.

Create each backlog item as an issue:

```sh
gh issue create \
  --title "<feature title>" \
  --body "## Description\n\n<what and why>\n\n## Acceptance Criteria\n\n- [ ] <criterion 1>\n- [ ] <criterion 2>\n- [ ] <criterion 3>\n\n## Notes\n\n<technical notes, constraints, dependencies>" \
  --label "type:feature,priority:high,size:m,mvp"
```

Always include **Acceptance Criteria** as a checklist — these are the concrete conditions that must be true for the issue to be considered Done.

### 4. Create the First Sprint

Create a milestone for Sprint 1. Recommend 1-week sprints for solo developers, 2-week for small teams:

```sh
# Create milestone (Sprint 1)
gh api repos/{owner}/{repo}/milestones --method POST \
  --field title="Sprint 1" \
  --field description="Sprint Goal: <what makes this sprint valuable>" \
  --field due_on="<ISO 8601 date, e.g. 2026-03-06T23:59:59Z>"
```

Select issues for the sprint based on priority and capacity. For a 1-week sprint, aim for issues totaling roughly 20-30 hours of estimated work (adjust based on available time):

```sh
# Assign issues to the sprint milestone
gh issue edit <issue-number> --milestone "Sprint 1"
```

### 5. Create Repository Scaffolding

Create the `.github/` directory structure with issue templates, PR template, labeler config, and CI workflows:

```sh
mkdir -p .github/ISSUE_TEMPLATE .github/workflows
```

#### Issue Templates

Create `.github/ISSUE_TEMPLATE/backlog-item.yml`:

```yaml
name: Backlog Item
description: Add a new item to the Product Backlog
title: "[BACKLOG] "
labels: []
body:
  - type: markdown
    attributes:
      value: "## New Backlog Item"
  - type: textarea
    id: description
    attributes:
      label: Description
      description: What needs to be done and why?
      placeholder: "As a user, I want to... so that..."
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: Conditions that must be true for this to be Done
      placeholder: |
        - [ ] Criterion 1
        - [ ] Criterion 2
    validations:
      required: true
  - type: dropdown
    id: type
    attributes:
      label: Type
      options:
        - feature
        - bug
        - chore
        - spike
        - docs
    validations:
      required: true
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - critical
        - high
        - medium
        - low
    validations:
      required: true
  - type: dropdown
    id: size
    attributes:
      label: Estimated Size
      options:
        - "xs (< 1 hour)"
        - "s (1-4 hours)"
        - "m (4-8 hours)"
        - "l (1-2 days)"
        - "xl (> 2 days — consider splitting)"
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: Technical Notes
      description: Dependencies, constraints, implementation ideas
      placeholder: "Depends on #... / Blocked by... / Consider using..."
    validations:
      required: false
```

Create `.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug Report
description: Report something that isn't working correctly
title: "[BUG] "
labels: ["type:bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: Clear description of the bug
      placeholder: "When I do X, Y happens instead of Z"
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: Minimal steps to trigger the bug
      placeholder: |
        1. Go to...
        2. Click on...
        3. See error...
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What should happen instead?
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: Environment / Context
      description: OS, browser, version, relevant config
      placeholder: "macOS 15, Node 22, Chrome 130"
    validations:
      required: false
  - type: dropdown
    id: priority
    attributes:
      label: Severity
      options:
        - "critical — app crashes or data loss"
        - "high — major feature broken, no workaround"
        - "medium — feature broken but workaround exists"
        - "low — cosmetic or minor annoyance"
    validations:
      required: true
```

#### Pull Request Template

Create `.github/PULL_REQUEST_TEMPLATE.md` with the Definition of Done checklist:

```markdown
## Summary

<!-- What does this PR do and why? Reference the issue: Closes #N -->

Closes #

## Definition of Done

- [ ] Code implemented and functional
- [ ] All acceptance criteria from the issue are met
- [ ] Tests written and passing (when applicable)
- [ ] No lint or compilation errors
- [ ] Self-reviewed (read your own diff)
- [ ] Documentation updated (if user-facing behavior changed)
```

#### PR Auto-Labeler

Create `.github/labeler.yml` — rules for `actions/labeler` to auto-label PRs based on changed files. **Adapt the path patterns to the project's actual directory structure.**

```yaml
"type:docs":
  - changed-files:
      - any-glob-to-any-file:
          - "**/*.md"
          - "docs/**"
          - "LICENSE*"
          - "CHANGELOG*"

"type:chore":
  - changed-files:
      - any-glob-to-any-file:
          - ".github/**"
          - "**/Dockerfile"
          - "**/.dockerignore"
          - "**/Makefile"
          - "**/.gitignore"
          - ".editorconfig"
          - ".prettierrc*"
          - ".eslintrc*"
          - "eslint.config.*"
          - "tsconfig*.json"
          - "biome.json"
          - "renovate.json"

# Adapt these to the project's source layout
"type:feature":
  - changed-files:
      - any-glob-to-any-file:
          - "src/**"
          - "lib/**"
          - "app/**"
          - "cmd/**"
          - "internal/**"
          - "pkg/**"
```

When initializing a real project, inspect the directory structure and adjust the glob patterns accordingly. Remove paths that don't exist and add project-specific ones (e.g., `components/**`, `api/**`, `terraform/**`).

#### Release Drafter Config

Create `.github/release-drafter.yml` — auto-generates release notes from merged PRs, categorized by the Scrum labels:

```yaml
name-template: "v$RESOLVED_VERSION"
tag-template: "v$RESOLVED_VERSION"
template: |
  ## What's Changed

  $CHANGES

  **Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...v$RESOLVED_VERSION
categories:
  - title: "🚀 Features"
    labels:
      - "type:feature"
  - title: "🐛 Bug Fixes"
    labels:
      - "type:bug"
  - title: "🧰 Maintenance"
    labels:
      - "type:chore"
      - "tech-debt"
  - title: "📝 Documentation"
    labels:
      - "type:docs"
  - title: "🔬 Spikes & Research"
    labels:
      - "type:spike"
change-template: "- $TITLE (#$NUMBER) @$AUTHOR"
change-title-escapes: '\<*_&'
version-resolver:
  major:
    labels:
      - "breaking"
  minor:
    labels:
      - "type:feature"
  patch:
    labels:
      - "type:bug"
      - "type:chore"
      - "type:docs"
  default: patch
```

### 6. Create Workflows

Create the following GitHub Actions workflows during project initialization.

#### Labeler Workflow

Create `.github/workflows/labeler.yml` — auto-labels every PR using the rules from `.github/labeler.yml`:

```yaml
name: Labeler

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  labeler:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v5
        with:
          sync-labels: true
```

#### Stale Issues Workflow

Create `.github/workflows/stale.yml` — keeps the backlog healthy by flagging inactive issues. Does **not** auto-close — just adds a label so the user can review during refinement:

```yaml
name: Stale Issues

on:
  schedule:
    - cron: "0 9 * * 1" # Every Monday at 9:00 UTC

permissions:
  issues: write

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          stale-issue-message: >
            This issue has been inactive for 30 days.
            It will be reviewed in the next backlog refinement.
            If it's still relevant, remove the `stale` label.
          stale-issue-label: "stale"
          days-before-stale: 30
          days-before-close: -1 # Never auto-close
          exempt-issue-labels: "status:in-progress,status:blocked,mvp,priority:critical,priority:high"
          exempt-milestones: true # Don't mark sprint items as stale
```

#### Release Drafter Workflow

Create `.github/workflows/release-drafter.yml` — auto-maintains a draft release that accumulates merged PRs. When the sprint ends, the draft is ready to publish:

```yaml
name: Release Drafter

on:
  push:
    branches: [main, master]
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  update-release-draft:
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Auto-Assign Workflow

Create `.github/workflows/auto-assign.yml` — for solo/small teams, auto-assigns the PR creator as assignee:

```yaml
name: Auto Assign

on:
  pull_request:
    types: [opened]

permissions:
  pull-requests: write

jobs:
  assign:
    runs-on: ubuntu-latest
    steps:
      - uses: toshimaru/auto-author-assign@v2.1.1
```

---

## Sprint Lifecycle

### Sprint Planning

When the user asks to plan a new sprint or the current sprint's milestone is closed:

1. **Review the backlog.** List issues with `status:ready` that have no milestone:

   ```sh
   gh issue list --label "status:ready" --milestone "" --json number,title,labels --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'
   ```

2. **Propose a sprint selection.** Recommend issues based on:
   - Priority: `critical` > `high` > `medium` > `low`
   - MVP items first (label `mvp`)
   - Respect capacity — total estimated size should fit the sprint duration
   - Flag dependencies between issues

3. **Define the Sprint Goal.** Ask the user: *"What is the single most important outcome of this sprint?"* Use the answer as the milestone description.

4. **Create the milestone and assign issues:**

   ```sh
   # Get next sprint number
   SPRINT_NUM=$(gh api repos/{owner}/{repo}/milestones --jq 'length + 1')

   # Create milestone
   gh api repos/{owner}/{repo}/milestones --method POST \
     --field title="Sprint ${SPRINT_NUM}" \
     --field description="Sprint Goal: <goal>" \
     --field due_on="<due date ISO 8601>"

   # Assign selected issues
   gh issue edit <number> --milestone "Sprint ${SPRINT_NUM}"
   ```

5. **Mark issues as in-progress** when work begins:

   ```sh
   gh issue edit <number> --add-label "status:in-progress" --remove-label "status:ready"
   ```

### During the Sprint

The agent can help with these activities at any time:

- **Progress report.** Show sprint burndown:

  ```sh
  # Open vs closed issues in current sprint
  MILESTONE="Sprint N"
  echo "=== Open ==="
  gh issue list --milestone "$MILESTONE" --state open --json number,title,labels -q '.[] | "#\(.number) \(.title)"'
  echo "=== Closed ==="
  gh issue list --milestone "$MILESTONE" --state closed --json number,title,labels -q '.[] | "#\(.number) \(.title)"'
  ```

- **Identify blockers.** List blocked issues:

  ```sh
  gh issue list --label "status:blocked" --json number,title,body -q '.[] | "#\(.number) \(.title)"'
  ```

- **Update status labels** as issues move through the workflow:
  - Starting work: add `status:in-progress`, remove `status:ready`
  - Submitting PR: add `status:review`, remove `status:in-progress`
  - Blocked: add `status:blocked`, remove `status:in-progress`
  - Done: remove all `status:*` labels (issue gets closed)

- **Mid-sprint scope change.** If the user wants to add/remove issues from the sprint, update the milestone assignment. Never endanger the Sprint Goal — if adding scope, consider removing equal-sized items.

### Sprint Review

When the sprint ends (milestone due date reached or all issues closed):

1. **List what was completed:**

   ```sh
   gh issue list --milestone "Sprint N" --state closed --json number,title,closedAt \
     -q '.[] | "#\(.number) \(.title) (closed \(.closedAt | split("T")[0]))"'
   ```

2. **Identify carryover** — issues not completed move back to the backlog:

   ```sh
   # List uncompleted issues
   gh issue list --milestone "Sprint N" --state open --json number,title \
     -q '.[] | "#\(.number) \(.title)"'

   # Remove milestone from uncompleted issues (return to backlog)
   gh issue edit <number> --milestone ""
   ```

3. **Create a release** if there is a usable Increment:

   ```sh
   gh release create v<version> --title "Sprint N Release" \
     --notes "## What's New\n\n$(gh issue list --milestone 'Sprint N' --state closed --json number,title -q '.[] | "- #\(.number) \(.title)"')\n\n## Sprint Goal\n\n<goal summary>"
   ```

4. **Close the milestone:**

   ```sh
   # Get milestone number
   MILESTONE_NUM=$(gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.title=="Sprint N") | .number')

   # Close it
   gh api repos/{owner}/{repo}/milestones/${MILESTONE_NUM} --method PATCH --field state="closed"
   ```

### Sprint Retrospective

After closing the sprint, create a retrospective issue:

```sh
gh issue create \
  --title "Retrospective: Sprint N" \
  --label "retrospective" \
  --body "## What went well?\n\n- \n\n## What could be improved?\n\n- \n\n## Action items for next sprint\n\n- [ ] \n\n## Metrics\n\n- **Planned:** X issues\n- **Completed:** Y issues\n- **Carried over:** Z issues\n- **Sprint Goal met:** Yes/No"
```

Ask the user to reflect on:
- What went well? (Keep doing it)
- What could be improved? (Change something)
- Action items — concrete improvements to apply in the next sprint

If the user identifies action items, create issues for them and include in next sprint planning.

---

## Backlog Refinement

Refinement is an ongoing activity, not a one-time event. When the user asks to refine the backlog, or proactively when backlog items lack detail:

### Split Large Issues

Issues labeled `size:xl` should be split. Help the user decompose them:

1. Identify the original issue's acceptance criteria
2. Group criteria into independent, deliverable chunks
3. Create new issues for each chunk (linked to original via "Part of #N")
4. Close the original issue with a comment listing the sub-issues

```sh
# Create sub-issue
gh issue create \
  --title "<specific sub-task>" \
  --body "Part of #<original-number>\n\n## Description\n\n<details>\n\n## Acceptance Criteria\n\n- [ ] <specific criterion>" \
  --label "type:feature,priority:high,size:m"

# Close original with reference
gh issue close <original-number> --comment "Split into #<sub1>, #<sub2>, #<sub3>"
```

### Add Missing Details

For each issue that lacks acceptance criteria or has vague descriptions:

1. Read the issue content
2. Propose concrete acceptance criteria based on the description
3. Update the issue with the refined content
4. Add `status:ready` label when fully refined

```sh
# Update issue body with refined content
gh issue edit <number> --body "<refined body with acceptance criteria>"
gh issue edit <number> --add-label "status:ready"
```

### Reprioritize

Review the backlog ordering when:
- New information changes priorities
- Dependencies are discovered
- The user's goals shift

List the current backlog sorted by priority:

```sh
gh issue list --state open --milestone "" --json number,title,labels \
  -q 'sort_by(.labels | map(select(.name | startswith("priority:"))) | .[0].name) | .[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'
```

---

## Definition of Done

Every issue must meet these criteria before closing. The agent validates this checklist before considering work complete:

### Default Definition of Done

- [ ] Code implemented and functional
- [ ] All acceptance criteria from the issue are met
- [ ] Tests written and passing (when applicable)
- [ ] No lint or compilation errors
- [ ] Self-reviewed (read your own diff before closing)
- [ ] Documentation updated (if user-facing behavior changed)
- [ ] Issue closed with reference to the commit or PR

### Applying the Definition of Done

When the user says an issue is done, verify:

1. **Check acceptance criteria** — read the issue body, confirm each criterion is checked
2. **Check code quality** — run lint/tests if configured
3. **Close the issue** with a reference:

   ```sh
   gh issue close <number> --comment "Done in <commit-sha or PR #>"
   ```

If any criterion is not met, tell the user what's missing before closing.

---

## `gh` CLI Reference

### Labels

```sh
gh label create "<name>" --color "<hex>" --description "<text>"
gh label delete "<name>" --yes
gh label list
```

### Issues

```sh
gh issue create --title "<title>" --body "<body>" --label "<l1>,<l2>" --milestone "<name>"
gh issue list --milestone "<name>" --state open --label "<label>"
gh issue edit <number> --add-label "<label>" --remove-label "<label>"
gh issue edit <number> --milestone "<name>"
gh issue close <number> --comment "<reason>"
gh issue view <number>
```

### Milestones (via API)

```sh
# List milestones
gh api repos/{owner}/{repo}/milestones --jq '.[] | "\(.number): \(.title) (due: \(.due_on | split("T")[0]))"'

# Create milestone
gh api repos/{owner}/{repo}/milestones --method POST \
  --field title="Sprint N" \
  --field description="Sprint Goal: ..." \
  --field due_on="2026-03-06T23:59:59Z"

# Close milestone
gh api repos/{owner}/{repo}/milestones/<number> --method PATCH --field state="closed"

# Update milestone
gh api repos/{owner}/{repo}/milestones/<number> --method PATCH \
  --field description="Updated goal"
```

### Releases

```sh
gh release create v<version> --title "<title>" --notes "<markdown>"
gh release list
```

---

## When to Apply This Skill

Use this skill when:

- Starting a **new software project** and need to organize work from day one
- The user asks to **plan an MVP** or define what to build first
- Managing a **Product Backlog** — creating, refining, prioritizing issues
- Running **Sprints** — planning, tracking progress, reviewing, retrospecting
- Setting up **labels and milestones** for a Scrum workflow on GitHub
- The user asks for a **progress report** or sprint status
- Performing **backlog refinement** — splitting large issues, adding acceptance criteria
- Closing a sprint and **creating a release**

### Adaptation Guidelines

**Solo developer (1 person):** Skip ceremonies that require multiple people (Daily Scrum). Focus on sprint planning + review. Use 1-week sprints to maintain momentum. The agent acts as a thinking partner for planning and review.

**Small team (2-3 people):** Use all events. Sprint planning is collaborative — the agent proposes, the team decides. Retrospectives become more valuable with multiple perspectives. Use 2-week sprints.

**Existing project:** Skip MVP identification. Start with backlog creation from existing issues/TODO lists. Create labels, then triage existing issues into the label system. Start sprinting from the current state.
