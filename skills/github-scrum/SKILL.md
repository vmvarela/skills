---
name: github-scrum
description: >
  Manage software projects with Scrum on GitHub using Projects, automated workflows, 
  and Definition of Ready validation. Trigger: sprints, backlog, milestones, velocity, 
  retrospectives, planning, project boards, or any Scrum-related request.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "2.0"
---

# GitHub Scrum

Manage software projects using Scrum on GitHub, adapted for solo developers and small teams (1-3 people). This skill maps Scrum artifacts and events to GitHub primitives (Issues, Projects, Labels, Releases) and provides automated workflows for sprint management.

**Key Features:**
- GitHub Projects integration for sprint tracking
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

---

## Scrum → GitHub Mapping

| Scrum Concept | GitHub Primitive | Notes |
|---|---|---|
| Product Goal | Repo description + pinned issue | Long-term vision in 1-2 sentences |
| Product Backlog | Issues (Status=Backlog in Project) | Ordered by priority labels |
| Sprint | Project Iteration | Fixed-length timebox (1-2 weeks) |
| Sprint Backlog | Issues in current Sprint iteration | Selected during Sprint Planning |
| Sprint Goal | Project field `Sprint Goal` | Why this sprint is valuable |
| Increment | GitHub Release / tag | Usable product at sprint end |
| Definition of Ready | Validated automatically | See [references/dor-checklist.md](references/dor-checklist.md) |
| Definition of Done | Checklist in issue/PR template | Shared quality standard |
| Sprint Review | Close iteration + release notes | Inspect what was delivered |
| Sprint Retrospective | Issue with label `retrospective` | Inspect how work went |
| Backlog Refinement | Edit issues: add details, resize, reprioritize | Ongoing activity |

No formal role separation. The user acts as Product Owner, Scrum Master, and Developer.

---

## GitHub Project Setup

### 1. Create the Scrum Project

```sh
# Setup creates a Project with custom fields and views
gh workflow run project-setup.yml
```

This creates a GitHub Project with:

**Custom Fields:**
- `Status`: Backlog, Ready, In Progress, Blocked, Review, Done
- `Size`: XS (1), S (2), M (4), L (8), XL (16)
- `Estimate`: Calculated from Size (1-16 story points)
- `Priority`: Critical, High, Medium, Low
- `Type`: Feature, Bug, Chore, Spike, Docs
- `Sprint`: Auto-managed Iteration field
- `Sprint Goal`: Text field for sprint objective

**Views:**
- **Board**: Kanban board grouped by Status
- **Sprint**: Table view filtered by current Sprint
- **Backlog**: Table view of items in Backlog, sorted by Priority
- **Velocity**: Table view with Size, Estimate, and Sprint for metrics

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

### 3. Create Labels

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

### 4. Identify the MVP

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

Add issues to the Project:
```sh
gh project item-add <project-number> --owner <owner> --url <issue-url>
```

### 5. Create Repository Scaffolding

Read templates and workflows from the reference files and create these files:

- Issue templates → see [references/templates.md](references/templates.md)
- PR template → see [references/templates.md](references/templates.md)
- GitHub Actions workflows → see [references/workflows.md](references/workflows.md) and copy from [templates/workflows/](templates/workflows/)

```sh
mkdir -p .github/ISSUE_TEMPLATE .github/workflows
# Copy workflow files from templates/
cp skills/github-scrum/templates/workflows/*.yml .github/workflows/
```

---

## Definition of Ready

Issues must meet these criteria before being added to a Sprint (Status=Ready):

**Required:**
- [ ] Clear description (minimum 50 characters)
- [ ] Acceptance criteria as checklist (`- [ ] criterion`)
- [ ] Size estimate (size:xs/s/m/l/xl)
- [ ] Type label (type:feature/bug/chore/spike/docs)
- [ ] Not blocked (no status:blocked)

**Automated Validation:**
The `dor-validation.yml` workflow automatically checks these criteria when:
- An issue is labeled `status:ready`
- An issue is added to the Sprint iteration

If validation fails, the workflow:
- Removes `status:ready` label
- Adds `status:needs-refinement` label
- Comments with the specific missing criteria

See [references/dor-checklist.md](references/dor-checklist.md) for the complete DoR specification.

---

## Sprint Lifecycle (Automated)

### Sprint Planning

**Automated by `sprint-start.yml`:**

1. **Manual trigger:**
   ```sh
   gh workflow run sprint-start.yml -f sprint_goal="<your sprint goal>" -f sprint_days=14
   ```

2. **What happens automatically:**
   - Validates DoR for all issues in current Sprint iteration
   - Calculates capacity: sum of all Size estimates
   - Sets the `Sprint Goal` field
   - Comments a summary in the Project
   - Issues failing DoR get warnings (but are not removed)

3. **Capacity Calculation:**
   | Size | Points |
   |------|--------|
   | XS   | 1      |
   | S    | 2      |
   | M    | 4      |
   | L    | 8      |
   | XL   | 16     |

### During the Sprint

**Automated by `pr-status.yml`:**

When a PR is opened:
- Finds linked issue (from PR body "Closes #N")
- Updates Project Status → Review
- Adds `status:review` label

When a PR is merged:
- Updates Project Status → Done
- Closes the linked issue
- Removes all `status:*` labels

**Manual commands (if needed):**

```sh
# View sprint progress
gh project view <project-number> --owner <owner>

# List blocked issues
GH_PAGER=cat gh issue list --label "status:blocked" --json number,title -q '.[] | "#\(.number) \(.title)"'

# Update issue status manually
GH_PAGER=cat gh issue edit <number> --add-label "status:in-progress" --remove-label "status:ready"
```

### Sprint Review (Automated)

**Triggered by `sprint-end.yml`:**

When the Sprint iteration ends:
1. Calculates velocity metrics:
   - Planned: issues/points at sprint start
   - Completed: issues/points with Status=Done
   - Carryover: issues/points not Done

2. Creates retrospective issue with:
   - Sprint Goal review
   - Metrics summary
   - Template for discussion

3. Moves carryover items to Backlog or next Sprint

4. Comments velocity report in Project

### Sprint Retrospective

A retrospective issue is automatically created. The template includes:

```markdown
## Retrospective: Sprint N

**Sprint Goal:** <goal>

## What went well?
- 

## What could be improved?
- 

## Action items for next sprint
- [ ] 

## Metrics
- **Planned:** X issues (Y pts)
- **Completed:** N issues (M pts)
- **Carryover:** Z issues (W pts)
- **Sprint Goal met:** Yes/No
```

---

## Velocity & Metrics

**Automated by `velocity-report.yml` (runs weekly):**

The workflow generates a velocity report showing:

```
Velocity Trend (Last 6 Sprints)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sprint │ Issues │ Points │ Goal Met
───────┼────────┼────────┼──────────
1      │  8/10  │ 24/27  │ ✗
2      │ 10/10  │ 30/30  │ ✓
3      │  9/11  │ 28/32  │ ✓
...

Average Velocity: 27 points/sprint
```

This helps with capacity planning for future sprints.

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

**Automated:** PR merge triggers automatic cleanup (remove status labels, close issue).

---

## Backlog Refinement

### Split Large Issues (`size:xl`)

1. Create sub-issues linked with "Part of #N":

   ```sh
   GH_PAGER=cat gh issue create \
     --title "<specific sub-task>" \
     --body "Part of #<original-number>

## Acceptance Criteria

- [ ] <specific criterion>" \
     --label "type:feature,priority:high,size:m"
   ```

2. Close the original with a comment listing the new issues:

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

The DoR validation workflow will automatically check and confirm readiness.

---

## Automation Reference

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `project-setup.yml` | Manual | Create GitHub Project with custom fields |
| `sprint-start.yml` | Manual / Schedule | Validate DoR, calculate capacity, set sprint goal |
| `sprint-end.yml` | Schedule (daily) | Calculate velocity, create retro, handle carryover |
| `pr-status.yml` | PR events | Auto-transition issue status on PR open/merge |
| `dor-validation.yml` | Issue events | Validate Definition of Ready automatically |
| `velocity-report.yml` | Schedule (weekly) | Generate velocity trends and metrics |

See [references/workflows.md](references/workflows.md) for detailed workflow documentation.

---

## When to Apply This Skill

- Starting a new project and need to organize work from day one
- Planning an MVP or defining what to build first
- Managing a Product Backlog — creating, refining, prioritizing issues
- Running Sprints — planning, tracking, reviewing, retrospecting
- Setting up GitHub Projects for Scrum workflow
- Asking for a progress report or sprint status
- Performing backlog refinement — splitting issues, adding acceptance criteria
- Closing a sprint and creating a release
- Calculating velocity for capacity planning

### Adaptation Guidelines

**Solo developer:** Skip Daily Scrum. Use 1-week sprints. Agent acts as thinking partner. Rely heavily on automation.

**Small team (2-3):** Use all events. Use 2-week sprints. Retrospectives are more valuable with multiple perspectives. Automation reduces overhead.

**Existing project:** Skip MVP identification. Run `project-setup.yml` to create Project, import existing issues, configure fields, start sprinting from current state.

---

## Resources

- **Project Setup**: See [references/project-setup.md](references/project-setup.md)
- **DoR Checklist**: See [references/dor-checklist.md](references/dor-checklist.md)
- **Workflows**: See [references/workflows.md](references/workflows.md)
- **Templates**: See [references/templates.md](references/templates.md)
- **Tooling**: See [references/tooling.md](references/tooling.md)
- **Workflow Files**: Copy from [templates/workflows/](templates/workflows/)
