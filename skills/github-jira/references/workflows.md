# Sprint Lifecycle: Detailed Workflows

Step-by-step flows for each Scrum ceremony with JIRA + GitHub.

---

## Sprint Planning

**Recommended duration:** 1 hour per sprint week (2-week sprint → 2 hours)

### Step 1: Review the backlog

List the backlog for your component ordered by priority:

```sh
jira issue list \
  --status "Backlog,To Do" \
  --component <COMPONENT> \
  --order-by priority \
  --plain
```

Or with JQL for more control:

```sh
jira issue list --jql "project = <PROJECT_KEY> AND sprint is EMPTY AND component = <COMPONENT> AND statusCategory != Done ORDER BY priority ASC, created ASC"
```

### Step 2: Select tickets for the sprint

Selection criteria:
- **Priority:** Critical → High → Medium → Low
- **MVP first:** tickets linked to the current initiative's Epic or label
- **Dependencies:** don't include a ticket if its blocker isn't also in the sprint
- **Capacity:** estimated in Story Points or T-shirt sizes; don't overload the sprint
- **Balance:** mix of bugs, features, and chores; avoid single-type sprints

To view Story Points alongside tickets:

```sh
jira issue list --jql "project = <PROJECT_KEY> AND sprint is EMPTY AND component = <COMPONENT> AND statusCategory != Done ORDER BY priority ASC" \
  --columns KEY,SUMMARY,STATUS,PRIORITY,STORY_POINTS
```

### Step 3: Create the sprint (if it doesn't exist)

```sh
# List existing sprints
jira sprint list --board <BOARD_ID>

# Create a new sprint via curl (jira CLI does not support sprint creation)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/sprint" \
  -d '{
    "name": "Sprint 8",
    "originBoardId": <BOARD_ID>,
    "startDate": "2026-03-16T09:00:00.000Z",
    "endDate": "2026-03-27T18:00:00.000Z",
    "goal": "Clear and measurable sprint goal"
  }'
```

### Step 4: Move tickets to the sprint

```sh
# Add tickets to the active sprint
jira sprint add <sprint-id> <PROJECT_KEY>-123 <PROJECT_KEY>-124 <PROJECT_KEY>-125

# Verify they were assigned to the sprint
jira issue list --sprint active --component <COMPONENT>
```

### Step 5: Assign tickets to the team

```sh
# Self-assign a ticket
# bash/zsh (Linux, macOS, WSL):
jira issue assign <PROJECT_KEY>-123 $(jira me)

# PowerShell (Windows):
$ME = jira me
jira issue assign <PROJECT_KEY>-123 $ME

# Assign to another person
jira issue assign <PROJECT_KEY>-124 "firstname.lastname"

# View unassigned tickets in the sprint
jira issue list --sprint active --jql "project = <PROJECT_KEY> AND sprint in openSprints() AND assignee is EMPTY"
```

### Step 6: Define the Sprint Goal

Edit the Sprint Goal in the JIRA UI (edit the sprint and fill in the "Goal" field).
It should answer: **"Why is this sprint valuable?"**

Examples of good Sprint Goals:
- "Users can authenticate with SSO and access their profile"
- "The CI/CD pipeline is fully automated for the repository"
- "The 3 critical production bugs reported by the client are resolved"

---

## During the Sprint

### Daily check-in (3 questions)

```sh
# What did I work on yesterday? → my tickets "In Progress"
jira issue list --jql "project = <PROJECT_KEY> AND sprint in openSprints() \
  AND assignee = currentUser() AND status = 'In Progress'"

# What will I do today? → my tickets in "To Do"
jira issue list --jql "project = <PROJECT_KEY> AND sprint in openSprints() \
  AND assignee = currentUser() AND status = 'To Do'"

# Any impediments? → blocked tickets
jira issue list --jql "project = <PROJECT_KEY> AND sprint in openSprints() \
  AND label = blocked"
```

### Ticket workflow

```
Backlog → To Do → In Progress → In Review → Done
```

```sh
# Start working on a ticket
jira issue move <PROJECT_KEY>-123 "In Progress"

# Create the branch (activates native JIRA integration)
git checkout -b feature/<PROJECT_KEY>-123-short-description

# ... do the work ...

# Open PR (title includes the JIRA key)
gh pr create --title "[<PROJECT_KEY>-123] Description of the change" --body "Closes <PROJECT_KEY>-123"
# → jira-label-pr.yml applies labels automatically

# PR in review
jira issue move <PROJECT_KEY>-123 "In Review"

# PR merged → native integration can transition to Done automatically
# If not configured, do it manually:
jira issue move <PROJECT_KEY>-123 "Done"
jira issue comment add <PROJECT_KEY>-123 --body "Done in PR #42"
```

### Handle a blocker

```sh
# Mark as blocked
jira issue edit <PROJECT_KEY>-123 --label blocked

# bash/zsh (Linux, macOS, WSL):
TODAY=$(date +%d/%m/%Y)
jira issue comment add <PROJECT_KEY>-123 \
  --body "Blocked: need access to the staging environment. Contacted @ops on $TODAY"

# PowerShell (Windows):
# $TODAY = Get-Date -Format "dd/MM/yyyy"
# jira issue comment add <PROJECT_KEY>-123 --body "Blocked: need access to the staging environment. Contacted @ops on $TODAY"

# Resolve the blocker — edit the ticket removing the label via curl
# (jira CLI does not support --remove-label; use curl to update labels field directly)
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123" \
  -d '{"update": {"labels": [{"remove": "blocked"}]}}'
jira issue move <PROJECT_KEY>-123 "In Progress"
```

### Add scope mid-sprint

Only add if urgent and it doesn't put the Sprint Goal at risk.

```sh
# Add an urgent ticket to the active sprint
jira sprint add <sprint-id> <PROJECT_KEY>-171

# If scope is added, consider removing a ticket of equal size.
# jira CLI does not support removing from a sprint — use curl to move it back to the backlog:
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/backlog/issue" \
  -d '{"issues": ["<PROJECT_KEY>-165"]}'
```

---

## Sprint Review

**Duration:** 30-45 minutes

### Step 1: View what was completed

```sh
jira issue list --jql \
  "project = <PROJECT_KEY> AND sprint in openSprints() AND statusCategory = Done" \
  --plain
```

### Step 2: Evaluate the Sprint Goal

Answer honestly: Was the Sprint Goal met? Why yes/no?

### Step 3: Handle carryover

Tickets that weren't completed go back to the backlog to be re-planned:

```sh
# List carryover
jira issue list --jql \
  "project = <PROJECT_KEY> AND sprint in openSprints() AND statusCategory != Done"

# Move back to backlog (via curl — jira CLI does not support removing from sprint)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/backlog/issue" \
  -d '{"issues": ["<PROJECT_KEY>-125", "<PROJECT_KEY>-128"]}'

# Reset state if they were left "In Progress"
jira issue move <PROJECT_KEY>-125 "To Do"
jira issue move <PROJECT_KEY>-128 "To Do"
```

### Step 4: Close the sprint in JIRA

```sh
# Get the active sprint ID
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/agile/1.0/board/<BOARD_ID>/sprint?state=active" \
  | jq '.values[0] | "\(.id): \(.name)"'

        # Close the sprint
        # bash/zsh: uses command substitution to inject current UTC timestamp
        COMPLETE_DATE=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
        curl -s -X POST \
          -H "Authorization: Basic ${JIRA_AUTH}" \
          -H "Content-Type: application/json" \
          "${JIRA_BASE_URL}/rest/agile/1.0/sprint/<sprint-id>" \
          -d "{\"state\": \"closed\", \"completeDate\": \"${COMPLETE_DATE}\"}"

        # PowerShell equivalent:
        # $completeDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")
        # curl ... -d "{\"state\": \"closed\", \"completeDate\": \"$completeDate\"}"
```

### Step 5: Publish the GitHub Release

If there is an Increment (something deliverable), publish the release on GitHub:

```sh
# View the release draft generated by release-drafter
gh release list

# Publish the release (from GitHub UI or gh CLI)
gh release edit v1.2.0 --draft=false
# → This triggers jira-release-sync.yml automatically
```

**Tag format:** `v<major>.<minor>.<patch>` following semver:
- **Patch** (`v1.2.1`): bugfixes only
- **Minor** (`v1.3.0`): new backward-compatible features
- **Major** (`v2.0.0`): breaking changes

---

## Sprint Retrospective

**Duration:** 45-60 minutes. Always run it, even if the sprint was perfect.

### Step 1: Create the retrospective ticket

Write the body to a temp file for cross-platform compatibility.
The `--body-file` flag requires jira-cli v1.4+. If your version doesn't have it, replace `--body-file /tmp/retro-body.md` with `--body "$(cat /tmp/retro-body.md)"` (bash/zsh) or pass the content via `--body` directly.

```sh
# bash/zsh (Linux, macOS, WSL):
cat > /tmp/retro-body.md << 'BODY'
## What went well?

<!-- What should we keep doing -->
-

## What could be improved?

<!-- What should we change -->
-

## Action items for next sprint

<!-- Concrete, assigned improvements -->
- [ ]

## Sprint metrics

- **Planned:** X tickets / Y story points
- **Completed:** X tickets / Y story points
- **Carryover:** X tickets
- **Sprint Goal met:** Yes / No / Partially
- **Bugs introduced:** X
BODY

jira issue create \
  --type Task \
  --summary "Retrospective: Sprint <N> — <date>" \
  --priority Medium \
  --component <COMPONENT> \
  --label retrospective \
  --body-file /tmp/retro-body.md
```

```powershell
# PowerShell (Windows):
@"
## What went well?

<!-- What should we keep doing -->
-

## What could be improved?

<!-- What should we change -->
-

## Action items for next sprint

<!-- Concrete, assigned improvements -->
- [ ]

## Sprint metrics

- **Planned:** X tickets / Y story points
- **Completed:** X tickets / Y story points
- **Carryover:** X tickets
- **Sprint Goal met:** Yes / No / Partially
- **Bugs introduced:** X
"@ | Set-Content -Path "$env:TEMP\retro-body.md" -Encoding UTF8

jira issue create `
  --type Task `
  --summary "Retrospective: Sprint <N> — <date>" `
  --priority Medium `
  --component <COMPONENT> `
  --label retrospective `
  --body-file "$env:TEMP\retro-body.md"
```

### Step 2: Structured reflection

Useful questions to focus the retrospective:

**What went well?**
- Which work practices worked well?
- Which tools or processes saved time?
- Which collaborations were especially effective?

**What could be improved?**
- What caused the carryover (if any)?
- What blocked the team during the sprint?
- Is there technical debt slowing down development?
- Did the PR review process work well?

**Action items** (max 2-3, concrete and assigned):
- Bad: "Improve communication"
- Good: "Write a brief update in the #team channel every Friday before 5pm"

### Step 3: Convert action items into tickets

Action items should become tickets in the next sprint, not just notes:

```sh
jira issue create \
  --type Task \
  --summary "Retro S<N>: <concrete action>" \
  --priority Medium \
  --component <COMPONENT> \
  --label "retro-action"
```

---

## Backlog Refinement (ongoing)

Refinement is not a one-time ceremony; it happens continuously.
Goals:
- Every "To Do" ticket must have clear acceptance criteria
- Large tickets (`size:xl` or more than 2-3 days of work) must be split
- The backlog always has at least 1 sprint worth of refined and ready tickets

### Add acceptance criteria to an unrefined ticket

The `--body-file` flag requires jira-cli v1.4+. If unavailable, use `--body "$(cat /tmp/ticket-body.md)"` (bash/zsh).

```sh
# View the current ticket
jira issue view <PROJECT_KEY>-170

# bash/zsh: write to a temp file, then edit the ticket
cat > /tmp/ticket-body.md << 'BODY'
## Description

<what needs to be done and why>

## Acceptance criteria

- [ ] Criterion 1: <observable and verifiable condition>
- [ ] Criterion 2: <observable and verifiable condition>
- [ ] Criterion 3: <observable and verifiable condition>

## Technical notes

<dependencies, constraints, implementation ideas>
BODY

jira issue edit <PROJECT_KEY>-170 --body-file /tmp/ticket-body.md
```

```powershell
# PowerShell (Windows):
@"
## Description

<what needs to be done and why>

## Acceptance criteria

- [ ] Criterion 1: <observable and verifiable condition>
- [ ] Criterion 2: <observable and verifiable condition>
- [ ] Criterion 3: <observable and verifiable condition>

## Technical notes

<dependencies, constraints, implementation ideas>
"@ | Set-Content -Path "$env:TEMP\ticket-body.md" -Encoding UTF8

jira issue edit <PROJECT_KEY>-170 --body-file "$env:TEMP\ticket-body.md"
```

```sh
# Mark as ready for the sprint
jira issue edit <PROJECT_KEY>-170 --label ready
```

### Split an oversized ticket

If a ticket requires more than 2-3 days of work, split it into subtasks or
independent tickets:

```sh
# Create subtasks
jira issue create --type Subtask --parent <PROJECT_KEY>-170 \
  --summary "Part 1: <specific description>"

jira issue create --type Subtask --parent <PROJECT_KEY>-170 \
  --summary "Part 2: <specific description>"

# Or create independent tickets (if deliverable separately)
jira issue create --type Story \
  --summary "Part of <PROJECT_KEY>-170: <specific description>" \
  --body "Part of <PROJECT_KEY>-170\n\n## Acceptance criteria\n\n- [ ]"
```
