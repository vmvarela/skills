---
name: github-scrum
description: Manage software projects with Scrum on GitHub. Plan MVPs, maintain a Product Backlog as Issues, run Sprints as Project Iterations, and automate setup with the gh CLI. Adapted for solo developers and small teams (1-3 people). Use this skill whenever the user mentions sprints, issues, backlog, milestones, pull requests, project planning, releases, retrospectives, or any aspect of managing software work on GitHub — even if they don't explicitly mention Scrum.
---

# GitHub Scrum

Manage software projects using Scrum on GitHub, adapted for solo developers and small teams (1-3 people). This skill maps Scrum artifacts and events to GitHub primitives (Issues, Milestones/Project Iterations, Labels, Releases) and automates project setup and sprint management.

**Key Features:**
- GitHub Milestones or Projects for Sprint tracking
- Automated DoR (Definition of Ready) validation  
- Automatic velocity calculation and reporting
- PR status transitions
- Sprint lifecycle automation

Reference: [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html).

---

## Tooling Strategy

**Use the `gh` CLI for all GitHub operations.** It is the primary and default tool for this skill.

> Always set `GH_PAGER=cat` when running `gh` commands to prevent interactive pagers from blocking script execution.

For a full command reference, see [references/tooling.md](references/tooling.md).

### Cross-platform Date Generation

When generating ISO 8601 dates for milestone `due_on` fields, use a portable snippet — `date -d` is GNU/Linux only and fails on macOS:

```sh
# Portable (Linux + macOS) — recommended
DUE_DATE=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow()+timedelta(days=14)).strftime('%Y-%m-%dT00:00:00Z'))")

# Linux/GNU only
DUE_DATE=$(date -u -d "+14 days" +%Y-%m-%dT00:00:00Z)

# macOS/BSD only
DUE_DATE=$(date -u -v+14d +%Y-%m-%dT00:00:00Z)
```

Always use the Python one-liner when the target platform is unknown. Adjust `days=14` to match the sprint length.

---

## Scrum → GitHub Mapping

| Scrum Concept | GitHub Primitive | Notes |
|---|---|---|
| Product Goal | Repo description + pinned issue | Long-term vision in 1-2 sentences |
| Product Backlog | Issues with Status=Backlog | Ordered by priority labels |
| Sprint | Project Iteration (recommended) or Milestone | Fixed-length timebox (1-2 weeks) |
| Sprint Backlog | Issues in current Sprint iteration | Selected during Sprint Planning |
| Sprint Goal | Project field `Sprint Goal` | Why this sprint is valuable |
| Increment | GitHub Release / tag | Usable product at sprint end |
| Definition of Done | Checklist in issue/PR template | Shared quality standard |
| Sprint Review | Close iteration + release notes | Inspect what was delivered |
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

## Project Initialization (GitHub Projects - Recommended)

### 1. Create the Scrum Project

First, create a GitHub Project with the Scrum Board template:

```sh
gh project create --title "Scrum Board" --owner <owner> --template "table"
```

Add these custom fields to the project:

| Field | Type | Options |
|-------|------|---------|
| `Status` | Single select | Backlog, Ready, In Progress, Blocked, Review, Done |
| `Size` | Single select | XS (1), S (2), M (4), L (8), XL (16) |
| `Estimate` | Number | Auto-calculated from Size |
| `Priority` | Single select | Critical, High, Medium, Low |
| `Type` | Single select | Feature, Bug, Chore, Spike, Docs |
| `Sprint` | Iteration | Configure 14-day duration |
| `Sprint Goal` | Text | Sprint objective |

Configure the Sprint iteration field:
1. Go to Project Settings
2. Enable "Sprint" iteration field
3. Set duration to 14 days
4. Set start date to next Monday

Create views:
- **Board**: Grouped by Status (Kanban)
- **Sprint**: Filtered by current Sprint
- **Backlog**: Status=Backlog, sorted by Priority
- **Velocity**: Shows Size, Estimate, and Sprint

### 2. Define the Product Goal

Ask the user: *"In 1-2 sentences, what is the product and what problem does it solve?"*

Create a pinned issue titled **Product Goal**:

```sh
GH_PAGER=cat gh issue create \
  --title "Product Goal" \
  --body "## Vision

<user's answer>

## Target Users

<who benefits>

## Success Criteria

- [ ] <measurable outcome>" \
  --label "type:docs"

GH_PAGER=cat gh issue pin <issue-number>
```

### 2. Create Labels

Run the label creation commands from the Labels System section above.

### 3. Identify the MVP

For each feature idea, apply: *"Without this, does the product make no sense?"*
- Yes → `mvp` + `priority:high` or `priority:critical`
- Important but not essential → `priority:medium`
- Nice to have → `priority:low`

Keep the MVP to 3-7 features. Create each as an issue with **Acceptance Criteria** as a checklist:

```sh
GH_PAGER=cat gh issue create \
  --title "<feature title>" \
  --body "## Description

<what and why>

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Notes

<technical notes, constraints, dependencies>" \
  --label "type:feature,priority:high,size:m,mvp"
```

### 4. Create the First Sprint

The Sprint iteration is auto-created when you enable the Iteration field. To view and manage it:

```sh
# View current sprint
gh project view <project-number> --owner <owner>

# Set Sprint Goal
gh project item-edit --id <item-id> --field "Sprint Goal" --value "Your goal here"
```

### Alternative: Using Milestones

If you prefer traditional milestones:

```sh
# Generate due date (portable — works on Linux and macOS)
DUE_DATE=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow()+timedelta(days=14)).strftime('%Y-%m-%dT00:00:00Z'))")

GH_PAGER=cat gh api repos/{owner}/{repo}/milestones --method POST \
  --field title="Sprint 1" \
  --field description="Sprint Goal: <what makes this sprint valuable>" \
  --field due_on="$DUE_DATE"

# Assign issues to milestone
GH_PAGER=cat gh issue edit <number> --milestone "Sprint 1"
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

## Sprint Lifecycle (GitHub Projects)

### Sprint Planning

1. **Review the backlog** — list issues with Status=Backlog:

   ```sh
   # View in Sprint view
   gh project view <project-number> --owner <owner>
   
   # Or filter issues
   GH_PAGER=cat gh issue list --label "status:ready" --state open \
     --json number,title,labels \
     --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'
   ```

2. **Propose sprint selection** based on: `critical` > `high` > `medium` > `low`, MVP items first, capacity fits duration.

3. **Define the Sprint Goal**:

   ```sh
   # Set Sprint Goal field in Project
   gh project item-edit --id <item-id> --field "Sprint Goal" --value "<your goal>"
   ```

4. **Add issues to current Sprint:**

   ```sh
   # Add issue to Project
   gh project item-add <project-number> --owner <owner> --url <issue-url>
   
   # Set Sprint field to current iteration
   gh project item-edit --id <item-id> --field "Sprint" --value "Sprint N"
   
   # Set Status to Ready
   gh project item-edit --id <item-id> --field "Status" --value "Ready"
   ```

5. **Mark issues as in-progress** when work begins:

   ```sh
   # Update Status field in Project
   gh project item-edit --id <item-id> --field "Status" --value "In Progress"
   
   # Update labels
   GH_PAGER=cat gh issue edit <number> --add-label "status:in-progress" --remove-label "status:ready"
   ```

### During the Sprint

- **Progress report (via Project):**

  ```sh
  # View Sprint view showing all items
  gh project view <project-number> --owner <owner>
  
  # View items by Status
  gh project item-list <project-number> --owner <owner> --format json | \
    jq '.[] | select(.fieldValues.Status == "In Progress")'
  ```

- **Identify blockers:**

  ```sh
  # Filter by Blocked status in Project
  gh project item-list <project-number> --owner <owner> --format json | \
    jq '.[] | select(.fieldValues.Status == "Blocked")'
  
  # Or via labels
  GH_PAGER=cat gh issue list --label "status:blocked" --json number,title -q '.[] | "#\(.number) \(.title)"'
  ```

- **Update Status field** as issues move:
  - Starting → `In Progress` (update Project Status field)
  - PR open → `Review` (update Project Status field)
  - Blocked → `Blocked` (update Project Status field)
  - Done → `Done` (update Project Status field)

### Sprint Review

1. List completed issues (Status=Done in current Sprint):

   ```sh
   gh project item-list <project-number> --owner <owner> --format json | \
     jq '.[] | select(.fieldValues.Status == "Done" and .fieldValues.Sprint == "Sprint N")'
   ```

2. Move carryover issues to Backlog:

   ```sh
   # Update Status to Backlog for incomplete items
   gh project item-edit --id <item-id> --field "Status" --value "Backlog"
   
   # Remove from current Sprint (set to empty or next sprint)
   gh project item-edit --id <item-id> --field "Sprint" --value ""
   
   # Update labels
   GH_PAGER=cat gh issue edit <number> --remove-label "status:in-progress" --remove-label "status:blocked" \
     --remove-label "status:review" --add-label "status:ready"
   ```

3. Create a release if there is a usable Increment:

   ```sh
   GH_PAGER=cat gh release create v<version> --title "Sprint N Release" \
     --notes "## What's New\n\n$(gh project item-list <project-number> --owner <owner> --format json | \
     jq -r '.[] | select(.fieldValues.Status == "Done" and .fieldValues.Sprint == "Sprint N") | \
     "- \(.content.title) (#\(.content.number))"')\n\n## Sprint Goal\n\n<goal summary>"
   ```

### Sprint Retrospective

```sh
GH_PAGER=cat gh issue create \
  --title "Retrospective: Sprint N" \
  --label "retrospective" \
  --body "## What went well?\n\n- \n\n## What could be improved?\n\n- \n\n## Action items for next sprint\n\n- [ ] \n\n## Metrics\n\n- **Planned:** X issues\n- **Completed:** Y issues\n- **Carried over:** Z issues\n- **Sprint Goal met:** Yes/No"
```

---

## Definition of Ready

Issues must meet these criteria before being added to a Sprint:

**Required:**
- [ ] Clear description (minimum 50 characters)
- [ ] Acceptance criteria as checklist (`- [ ] criterion`)
- [ ] Size estimate (size:xs/s/m/l/xl)
- [ ] Type label (type:feature/bug/chore/spike/docs)
- [ ] Not blocked (no status:blocked)

See [references/dor-checklist.md](references/dor-checklist.md) for the complete DoR specification.

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

   ```sh
   GH_PAGER=cat gh issue edit <number> --remove-label "status:ready" --remove-label "status:in-progress" --remove-label "status:blocked" --remove-label "status:review" 2>/dev/null
   GH_PAGER=cat gh issue close <number> --comment "Done in <commit-sha or PR #>"
   ```

If any criterion is not met, tell the user what's missing before closing.

### Closing or Merging a PR

When a PR is closed or merged, **remove all `status:*` labels from the linked issue**. Status labels represent transient workflow state and must not remain as permanent metadata after the work is done.

```sh
GH_PAGER=cat gh issue edit <linked-issue-number> --remove-label "status:ready" --remove-label "status:in-progress" --remove-label "status:blocked" --remove-label "status:review" 2>/dev/null
```

---

## Backlog Refinement

### Split Large Issues (`size:xl`)

1. Create sub-issues linked with "Part of #N":

   ```sh
   GH_PAGER=cat gh issue create \
     --title "<specific sub-task>" \
     --body "Part of #<original-number>\n\n## Acceptance Criteria\n\n- [ ] <specific criterion>" \
     --label "type:feature,priority:high,size:m"
   ```

2. Close the original with a comment listing the new issues (remove `status:*` labels first):

   ```sh
   GH_PAGER=cat gh issue edit <original-number> --remove-label "status:ready" --remove-label "status:in-progress" --remove-label "status:blocked" --remove-label "status:review" 2>/dev/null
   GH_PAGER=cat gh issue close <original-number> --comment "Split into #<sub1>, #<sub2>, #<sub3>"
   ```

### Add Missing Details

For issues without acceptance criteria: propose concrete criteria, update body, add `status:ready`:

```sh
GH_PAGER=cat gh issue edit <number> --body "<refined body with acceptance criteria>"
GH_PAGER=cat gh issue edit <number> --add-label "status:ready"
```

### Reprioritize

List open backlog items (no milestone), review with the user, update priority labels:

```sh
GH_PAGER=cat gh issue list --state open --milestone "" --json number,title,labels \
  -q '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'
```

---

## Automation (Optional)

For teams wanting to automate Scrum workflows, this skill provides GitHub Actions workflows:

### GitHub Projects Setup

Create a Scrum Board Project with custom fields:

```sh
gh workflow run project-setup.yml
```

This creates a GitHub Project with fields: Status, Size, Estimate, Priority, Type, Sprint, Sprint Goal.

### Automated Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `project-setup.yml` | Manual | Create GitHub Project with custom fields |
| `sprint-start.yml` | Manual/Schedule | Validate DoR, calculate capacity |
| `sprint-end.yml` | Schedule | Calculate velocity, create retro |
| `pr-status.yml` | PR events | Auto-transition issue status |
| `dor-validation.yml` | Issue events | Validate Definition of Ready |
| `velocity-report.yml` | Schedule | Generate velocity trends |

To install automation in a repository:

```sh
cp skills/github-scrum/templates/workflows/*.yml .github/workflows/
```

See [references/workflows.md](references/workflows.md) for detailed workflow documentation and [references/project-setup.md](references/project-setup.md) for Project configuration.

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
