# Sprint Review: Blocked Tickets Analysis & Resolution

I'll help you get visibility on the blocked tickets and remove the blocker from ENG-42. Let's work through this systematically.

## Step 1: Setup (one-time)

First, ensure you have the `jira` CLI installed and configured:

```sh
# If not yet installed
brew install jira-cli    # macOS; for other platforms see the installation guide

# Initialize/configure for your JIRA instance
export JIRA_API_TOKEN="your-api-token"   # Get from id.atlassian.com → Security → API tokens

jira init \
  --installation cloud \
  --server https://mycompany.atlassian.net \
  --login your-email@company.com \
  --auth-type basic \
  --project ENG \
  --board "ENG Scrum Board" \
  --force
```

Add `export JIRA_API_TOKEN="..."` to your `.zshrc` or `.bashrc` so it persists.

---

## Step 2: View all blocked tickets in the current ENG sprint

Use this JQL query to find all blocked stories:

```sh
jira issue list --jql "project = ENG AND sprint in openSprints() AND label = blocked AND type = Story" --plain
```

**What this does:**
- `project = ENG` — filter to your ENG project
- `sprint in openSprints()` — current active sprint only
- `label = blocked` — tickets marked with the `blocked` label
- `type = Story` — stories only (not subtasks or bugs)

**Alternative (if you want blockers of any type):**
```sh
jira issue list --jql "project = ENG AND sprint in openSprints() AND label = blocked" --plain
```

This should show you all 3 blocked stories, displaying their keys, summaries, status, and assignees.

---

## Step 3: Unblock ENG-42 (blocked by ENG-38)

Since ENG-38 was merged yesterday, it's no longer a blocker. Here's how to remove the blocker label from ENG-42:

### Step 3a: Verify the current state of ENG-42

```sh
jira issue view ENG-42
```

This shows you the ticket details, including the `blocked` label and any comments explaining the blocker.

### Step 3b: Remove the blocker label

The `jira` CLI doesn't have a `--remove-label` flag, so use `curl` with the REST API directly:

```sh
# First, set up auth if not already done
export JIRA_BASE_URL="https://mycompany.atlassian.net"
export JIRA_USER_EMAIL="your-email@company.com"
export JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
```

**bash/zsh (macOS, Linux, WSL):**
```sh
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/ENG-42" \
  -d '{"update": {"labels": [{"remove": "blocked"}]}}'
```

**PowerShell (Windows):**
```powershell
$bytes = [System.Text.Encoding]::UTF8.GetBytes("$env:JIRA_USER_EMAIL`:$env:JIRA_API_TOKEN")
$JIRA_AUTH = [Convert]::ToBase64String($bytes)

$response = Invoke-RestMethod -Uri "${JIRA_BASE_URL}/rest/api/3/issue/ENG-42" `
  -Method Put `
  -Headers @{ Authorization = "Basic $JIRA_AUTH"; "Content-Type" = "application/json" } `
  -Body '{"update": {"labels": [{"remove": "blocked"}]}}'

Write-Host "Blocker removed from ENG-42"
```

### Step 3c: Transition ENG-42 to "In Progress" (if it's still in "To Do")

```sh
jira issue move ENG-42 "In Progress"
```

### Step 3d: Add a comment documenting the resolution

```sh
jira issue comment add ENG-42 --body "Blocker resolved: ENG-38 was merged. Unblocking and resuming work."
```

---

## Step 4: Verify the unblock

Re-run the blocked tickets query to confirm ENG-42 is no longer in the list:

```sh
jira issue list --jql "project = ENG AND sprint in openSprints() AND label = blocked" --plain
```

You should now see only 2 blocked stories instead of 3.

---

## Full summary of commands

Run these in order to complete the task:

```sh
# View all blocked stories in the current sprint
jira issue list --jql "project = ENG AND sprint in openSprints() AND label = blocked AND type = Story" --plain

# Remove blocker from ENG-42
export JIRA_BASE_URL="https://mycompany.atlassian.net"
export JIRA_USER_EMAIL="your-email@company.com"
export JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')

curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/ENG-42" \
  -d '{"update": {"labels": [{"remove": "blocked"}]}}'

# Move ENG-42 back to In Progress
jira issue move ENG-42 "In Progress"

# Add a comment
jira issue comment add ENG-42 --body "Blocker resolved: ENG-38 was merged. Unblocking and resuming work."

# Verify the unblock
jira issue list --jql "project = ENG AND sprint in openSprints() AND label = blocked" --plain
```

---

## Why this approach?

- **JQL for blocked tickets:** The `label = blocked` field is the standard way to mark and track blockers in this workflow (see `workflows.md` in the references).
- **`curl` for label removal:** The `jira` CLI lacks direct label removal, so we use the REST API v3 directly with the `update` syntax to remove the label without affecting other fields.
- **Transition to "In Progress":** Once unblocked, the ticket should resume work; transitioning it signals readiness to the team.
- **Comment for context:** Documenting the resolution in the ticket creates a record for the sprint retrospective and helps future investigations.

You're now ready for your sprint review with visibility on remaining blockers. Good luck tomorrow!
