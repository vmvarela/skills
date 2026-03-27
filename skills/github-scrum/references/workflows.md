# GitHub Actions Workflows

Copy these files into `.github/workflows/` during project initialization.

## Core Scrum Workflows

These workflows provide the automated Scrum lifecycle management:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Project Setup | `project-setup.yml` | Manual | Create GitHub Project with custom fields |
| Sprint Start | `sprint-start.yml` | Manual/Schedule | Validate DoR, calculate capacity |
| Sprint End | `sprint-end.yml` | Schedule | Calculate velocity, create retro |
| PR Status | `pr-status.yml` | PR events | Auto-transition issue status |
| DoR Validation | `dor-validation.yml` | Issue events | Validate Definition of Ready |
| Velocity Report | `velocity-report.yml` | Schedule | Generate velocity trends |

---

## `project-setup.yml`

Creates the GitHub Project with all custom fields and views.

**Trigger:** `workflow_dispatch` (manual)

**Inputs:**
- `project_name`: Name for the project (default: "Scrum Board")

**Actions:**
1. Create Project with title
2. Add custom fields (Status, Size, Estimate, Priority, Type, Sprint Goal)
3. Configure Sprint iteration field
4. Create views (Board, Sprint, Backlog, Velocity)
5. Import existing issues from repository

See [templates/workflows/project-setup.yml](../templates/workflows/project-setup.yml) for the complete workflow.

---

## `sprint-start.yml`

Validates DoR and prepares the sprint for execution.

**Triggers:**
- `workflow_dispatch` (manual with inputs)
- `schedule` (weekly, Monday 09:00 UTC)

**Inputs:**
- `sprint_goal`: Sprint objective text
- `sprint_days`: Sprint duration in days (default: 14)

**Actions:**
1. Get current Sprint iteration from Project
2. For each issue in the Sprint:
   - Validate DoR (description, acceptance criteria, size, type)
   - If fails: comment warning, set Status=Needs Refinement
   - If passes: set Status=Ready
3. Calculate capacity: sum of all Size estimates
4. Set the `Sprint Goal` field
5. Create summary comment with:
   - Sprint Goal
   - Total capacity (points)
   - Number of issues
   - Issues failing DoR (warnings)

See [templates/workflows/sprint-start.yml](../templates/workflows/sprint-start.yml) for the complete workflow.

---

## `sprint-end.yml`

Processes sprint completion and generates metrics.

**Triggers:**
- `schedule` (daily, 23:00 UTC)
- `workflow_dispatch` (manual)

**Actions:**
1. Check if current Sprint iteration ended yesterday
2. If ended:
   - Calculate velocity metrics:
     - Planned: issues/points at sprint start
     - Completed: issues/points with Status=Done
     - Carryover: issues/points not Done
   - Calculate completion percentage
   - Determine if Sprint Goal was met
3. Create retrospective issue with:
   - Sprint Goal summary
   - What went well / what could be improved template
   - Action items checklist
   - Metrics breakdown
4. Handle carryover:
   - Move incomplete items to Backlog (Status=Backlog)
   - Or move to next Sprint iteration
5. Comment velocity summary in Project
6. Close completed issues

See [templates/workflows/sprint-end.yml](../templates/workflows/sprint-end.yml) for the complete workflow.

---

## `pr-status.yml`

Automatically transitions issue status based on PR lifecycle.

**Trigger:** `pull_request` (opened, closed)

**Actions:**

**When PR is opened:**
1. Parse PR body for linked issues ("Closes #N", "Fixes #N", "Resolves #N")
2. For each linked issue:
   - Update Project Status field → Review
   - Add `status:review` label
   - Remove `status:in-progress` label
   - Comment: "PR #N opened for review"

**When PR is merged:**
1. Find linked issues
2. For each linked issue:
   - Update Project Status field → Done
   - Close the issue
   - Remove ALL `status:*` labels (ready, in-progress, blocked, review)
   - Comment: "Merged in #N [commit-sha]"

**When PR is closed (not merged):**
1. Find linked issues
2. For each linked issue:
   - Update Project Status field → In Progress
   - Remove `status:review` label
   - Add `status:in-progress` label
   - Comment: "PR closed without merge - returning to In Progress"

See [templates/workflows/pr-status.yml](../templates/workflows/pr-status.yml) for the complete workflow.

---

## `dor-validation.yml`

Validates the Definition of Ready for issues.

**Triggers:**
- `issues` (labeled, edited, opened)
- `workflow_dispatch` (manual)

**Validation Checks:**

**Required (must all pass):**
- Description: body.length >= 50 characters
- Acceptance Criteria: body contains "- [ ]" (checklist)
- Size Estimate: has `size:*` label
- Type Label: has `type:*` label
- Not Blocked: does NOT have `status:blocked`

**Actions:**

**If ALL required checks pass:**
- Add `status:ready` label (if not present)
- Set Project Status field = Ready
- Silent success (no comment)

**If ANY required check fails:**
- Remove `status:ready` label (if present)
- Add `status:needs-refinement` label
- Comment with detailed checklist showing:
  - Which checks passed ✓
  - Which checks failed ✗
  - Specific error messages

See [templates/workflows/dor-validation.yml](../templates/workflows/dor-validation.yml) for the complete workflow.

---

## `velocity-report.yml`

Generates velocity trend reports for capacity planning.

**Triggers:**
- `schedule` (weekly, Monday 09:00 UTC)
- `workflow_dispatch` (manual with inputs)

**Inputs:**
- `sprint_count`: Number of past sprints to include (default: 6)

**Actions:**
1. Get last N Sprint iterations from Project
2. For each sprint:
   - Count planned issues (in sprint at start)
   - Calculate planned points (sum of Estimates)
   - Count completed issues (Status=Done)
   - Calculate completed points
   - Count carryover issues
   - Check Sprint Goal met (field value present)
3. Calculate averages:
   - Average velocity (points/sprint)
   - Average completion rate (%)
4. Generate ASCII chart:
   ```
   Velocity Trend (Last 6 Sprints)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Sprint │ Issues │ Points │ Goal Met
   ───────┼────────┼────────┼──────────
   1      │  8/10  │ 24/27  │ ✗
   2      │ 10/10  │ 30/30  │ ✓
   ...
   
   Average Velocity: 27 points/sprint
   ```
5. Create or update tracking issue with report
6. Comment report in Project

See [templates/workflows/velocity-report.yml](../templates/workflows/velocity-report.yml) for the complete workflow.

---

## Supporting Workflows

These workflows support the development process:

## `labeler.yml` — Auto-label PRs by changed files

Uses `.github/labeler.yml` rules. See [templates.md](templates.md) for the labeler config.

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
      - uses: actions/labeler@v6
        with:
          sync-labels: true
```

---

## `stale.yml` — Flag inactive backlog items

Marks issues inactive after 30 days. Does **not** auto-close — flags for review during refinement.

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
      - uses: actions/stale@v10
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

---

## `release-drafter.yml` — Maintain a draft release

Auto-accumulates merged PRs into a draft release. Ready to publish at sprint end.

```yaml
name: Release Drafter

on:
  push:
    branches: [main, master]
  pull_request_target:
    types: [opened, reopened, synchronize, edited]

permissions:
  contents: write
  pull-requests: write

jobs:
  update-release-draft:
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## `auto-assign.yml` — Auto-assign PR creator

For solo/small teams, auto-assigns the PR creator as assignee.

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

## Workflow Installation

To install all workflows in a repository:

```sh
# Create workflows directory
mkdir -p .github/workflows

# Copy Scrum automation workflows
cp skills/github-scrum/templates/workflows/*.yml .github/workflows/

# Commit and push
git add .github/workflows/
git commit -m "feat: add GitHub Scrum automation workflows"
git push
```

## Workflow Permissions

All workflows use minimal permissions via `permissions:` key:

| Workflow | Issues | PRs | Contents | Project |
|----------|--------|-----|----------|---------|
| project-setup.yml | write | - | - | write |
| sprint-start.yml | write | - | - | write |
| sprint-end.yml | write | - | - | write |
| pr-status.yml | write | read | - | write |
| dor-validation.yml | write | - | - | write |
| velocity-report.yml | write | - | - | read |

## Troubleshooting

### Workflow not triggering
- Check the repository has Actions enabled (Settings → Actions → General)
- Verify the workflow file is in `.github/workflows/`
- Check the trigger conditions match your use case

### Permission errors
- Ensure `permissions:` are correctly set in the workflow
- For repository-level permissions, check Settings → Actions → General → Workflow permissions

### Project not found
- Verify the Project number is correct: `gh project list --owner <owner>`
- Check the workflow has `project: write` permission
- Ensure the token has access to the organization/user projects
