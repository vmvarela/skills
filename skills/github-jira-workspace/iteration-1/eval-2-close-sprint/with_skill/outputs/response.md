# Sprint 5 Close-Out: End-to-End Checklist

I'll help you close Sprint 5 and prepare for Sprint 6. This involves four coordinated steps across JIRA and GitHub. Let me break down the workflow:

---

## Pre-flight Setup

Before running the commands, ensure these environment variables are set:

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
export JIRA_BASE_URL="https://mycompany.atlassian.net"
export JIRA_USER_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token"  # from id.atlassian.com → Security → API tokens
export JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
export JIRA_PROJECT="ENG"
```

```powershell
# PowerShell (Windows)
$env:JIRA_BASE_URL   = "https://mycompany.atlassian.net"
$env:JIRA_USER_EMAIL = "your-email@company.com"
$env:JIRA_API_TOKEN  = "your-api-token"
$bytes = [System.Text.Encoding]::UTF8.GetBytes("$env:JIRA_USER_EMAIL`:$env:JIRA_API_TOKEN")
$env:JIRA_AUTH = [Convert]::ToBase64String($bytes)
$env:JIRA_PROJECT = "ENG"
```

Also ensure `jira` CLI is installed:

```sh
brew install jira-cli    # macOS
# Other platforms: see the skill documentation
```

---

## Step 1: Move All Unfinished Stories from Sprint 5 to Sprint 6

### 1a. Get the Sprint IDs

First, find the numeric IDs of Sprint 5 and Sprint 6. You'll need the board ID for the ENG project. Look up the board ID from the JIRA URL or list all boards:

```sh
# List all sprints (returns sprint name and ID)
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/agile/1.0/board/<BOARD_ID>/sprint?state=active,future,closed" \
  | jq '.values[] | "\(.id): \(.name) [\(.state)]"'

# The board ID is in your JIRA URL: ...boards/<BOARD_ID>
# If you don't know it, list all boards:
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/agile/1.0/board" \
  | jq '.values[] | "\(.id): \(.name)"'
```

Once you have the board ID, save these variables:

```sh
SPRINT_5_ID="<sprint-5-numeric-id>"
SPRINT_6_ID="<sprint-6-numeric-id>"
```

### 1b. Identify unfinished tickets in Sprint 5

```sh
# List all unfinished tickets in Sprint 5
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/api/3/issue/search?jql=project=ENG+AND+sprint=${SPRINT_5_ID}+AND+statusCategory!=Done" \
  | jq '.issues[] | "\(.key): \(.fields.summary) [\(.fields.status.name)]"'
```

Or using `jira` CLI if you have it configured for the ENG project:

```sh
jira issue list --sprint active --jql "statusCategory != Done" --plain
```

### 1c. Move unfinished tickets to Sprint 6

Collect the ticket keys from the previous command and move them:

```sh
# Move multiple tickets to Sprint 6
# Replace <PROJECT_KEY>-123, <PROJECT_KEY>-124, etc. with actual ticket keys
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "https://mycompany.atlassian.net/rest/agile/1.0/sprint/${SPRINT_6_ID}/issue" \
  -d '{
    "issues": [
      "ENG-123",
      "ENG-124",
      "ENG-125"
    ]
  }'
```

Or if using `jira` CLI:

```sh
jira sprint add ${SPRINT_6_ID} ENG-123 ENG-124 ENG-125
```

**Verify the move:**

```sh
# Confirm tickets now appear in Sprint 6
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/api/3/issue/search?jql=project=ENG+AND+sprint=${SPRINT_6_ID}" \
  | jq '.issues[] | "\(.key): \(.fields.summary)"'
```

---

## Step 2: Close Sprint 5 in JIRA

### 2a. Get the current date and time in ISO 8601 format

```sh
# bash / zsh / Linux / macOS / WSL / Git Bash
COMPLETE_DATE=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
echo "Closing Sprint 5 at: ${COMPLETE_DATE}"
```

```powershell
# PowerShell (Windows)
$completeDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")
Write-Host "Closing Sprint 5 at: $completeDate"
```

### 2b. Close the sprint

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "https://mycompany.atlassian.net/rest/agile/1.0/sprint/${SPRINT_5_ID}" \
  -d "{
    \"state\": \"closed\",
    \"completeDate\": \"${COMPLETE_DATE}\"
  }"
```

```powershell
# PowerShell (Windows)
$body = @{
    "state" = "closed"
    "completeDate" = "$completeDate"
} | ConvertTo-Json

curl -s -X POST `
  -H "Authorization: Basic ${env:JIRA_AUTH}" `
  -H "Content-Type: application/json" `
  "https://mycompany.atlassian.net/rest/agile/1.0/sprint/${env:SPRINT_5_ID}" `
  -d $body
```

**Verify closure:**

The response should show `"state": "closed"`. You can also verify by listing sprints again:

```sh
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/agile/1.0/board/<BOARD_ID>/sprint?state=closed" \
  | jq '.values[] | "\(.id): \(.name) [\(.state)]"'
```

---

## Step 3: Mark JIRA Version v1.5.0 as Released

### 3a. Look up the version ID for v1.5.0

```sh
# List all versions in the ENG project
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/api/3/project/ENG/versions" \
  | jq '.[] | "\(.id): \(.name) [released: \(.released)]"'
```

Find the ID for `v1.5.0` and save it:

```sh
VERSION_ID="<version-id-for-v1.5.0>"
```

### 3b. Mark the version as released

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
RELEASE_DATE=$(date +%Y-%m-%d)
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "https://mycompany.atlassian.net/rest/api/3/version/${VERSION_ID}" \
  -d "{
    \"released\": true,
    \"releaseDate\": \"${RELEASE_DATE}\"
  }"
```

```powershell
# PowerShell (Windows)
$releaseDate = Get-Date -Format "yyyy-MM-dd"
$body = @{
    "released" = $true
    "releaseDate" = "$releaseDate"
} | ConvertTo-Json

curl -s -X PUT `
  -H "Authorization: Basic ${env:JIRA_AUTH}" `
  -H "Content-Type: application/json" `
  "https://mycompany.atlassian.net/rest/api/3/version/${env:VERSION_ID}" `
  -d $body
```

**Verify:**

```sh
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "https://mycompany.atlassian.net/rest/api/3/project/ENG/versions" \
  | jq '.[] | select(.name == "v1.5.0") | "\(.name) [released: \(.released), releaseDate: \(.releaseDate)]"'
```

---

## Step 4: Publish GitHub Release v1.5.0

### 4a. Prerequisites

Ensure you have `gh` CLI installed and authenticated:

```sh
brew install gh      # macOS
# Other platforms: https://cli.github.com/
gh auth login        # if not already authenticated
```

### 4b. Check if a release draft already exists

```sh
gh release list --repo mycompany/eng-backend
```

If a draft release exists for v1.5.0, you can publish it directly. If not, create one:

```sh
# View the release draft (usually maintained by release-drafter)
gh release view v1.5.0 --repo mycompany/eng-backend --json body,isDraft
```

### 4c. Create or publish the release

**Option A: If a draft exists, publish it:**

```sh
gh release edit v1.5.0 \
  --repo mycompany/eng-backend \
  --draft=false
```

This triggers the `jira-release-sync.yml` workflow automatically if it's configured in your repository.

**Option B: If no release exists, create one from scratch:**

First, prepare the release notes. Create a file `/tmp/release-notes.md`:

```markdown
## Release v1.5.0

### Features
- ENG-123: User authentication with SSO
- ENG-124: Dashboard redesign
- ENG-125: Performance optimizations

### Bugfixes
- ENG-126: Fixed memory leak in cache layer
- ENG-127: Corrected date formatting in reports

### Documentation
- ENG-128: Updated API documentation
- ENG-129: Added deployment guide

Fixes: ENG-123, ENG-124, ENG-125, ENG-126, ENG-127, ENG-128, ENG-129
```

Then create the release:

```sh
gh release create v1.5.0 \
  --repo mycompany/eng-backend \
  --title "v1.5.0" \
  --body-file /tmp/release-notes.md \
  --target main
```

**Important:** The release body **must include JIRA ticket keys** (e.g., `ENG-123`) so that `jira-release-sync.yml` can extract them and update the JIRA tickets' `fixVersion` field.

### 4d. Verify the release is published

```sh
gh release view v1.5.0 --repo mycompany/eng-backend
```

---

## Complete Workflow Script (All Steps in One)

Save this as `close-sprint-5.sh` and customize with your actual values:

```sh
#!/bin/bash
set -e

# Configuration
JIRA_BASE_URL="https://mycompany.atlassian.net"
JIRA_USER_EMAIL="your-email@company.com"
JIRA_API_TOKEN="your-api-token"
JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
JIRA_PROJECT="ENG"
BOARD_ID="<your-board-id>"
SPRINT_5_ID="<sprint-5-id>"
SPRINT_6_ID="<sprint-6-id>"
VERSION_ID="<version-id-for-v1.5.0>"
GITHUB_REPO="mycompany/eng-backend"

echo "=== Step 1: Move unfinished tickets from Sprint 5 to Sprint 6 ==="
UNFINISHED=$(curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/search?jql=project=${JIRA_PROJECT}+AND+sprint=${SPRINT_5_ID}+AND+statusCategory!=Done&maxResults=100" \
  | jq -r '.issues[].key' | tr '\n' ' ')

if [ -n "$UNFINISHED" ]; then
  echo "Moving tickets: $UNFINISHED"
  ISSUE_ARRAY=$(echo "$UNFINISHED" | jq -R 'split(" ") | map(select(length > 0))')
  curl -s -X POST \
    -H "Authorization: Basic ${JIRA_AUTH}" \
    -H "Content-Type: application/json" \
    "${JIRA_BASE_URL}/rest/agile/1.0/sprint/${SPRINT_6_ID}/issue" \
    -d "{\"issues\": $ISSUE_ARRAY}"
  echo "✓ Tickets moved to Sprint 6"
else
  echo "✓ No unfinished tickets in Sprint 5"
fi

echo ""
echo "=== Step 2: Close Sprint 5 ==="
COMPLETE_DATE=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/sprint/${SPRINT_5_ID}" \
  -d "{\"state\": \"closed\", \"completeDate\": \"${COMPLETE_DATE}\"}"
echo "✓ Sprint 5 closed at ${COMPLETE_DATE}"

echo ""
echo "=== Step 3: Mark v1.5.0 as released in JIRA ==="
RELEASE_DATE=$(date +%Y-%m-%d)
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/version/${VERSION_ID}" \
  -d "{\"released\": true, \"releaseDate\": \"${RELEASE_DATE}\"}"
echo "✓ JIRA version v1.5.0 marked as released on ${RELEASE_DATE}"

echo ""
echo "=== Step 4: Publish GitHub Release v1.5.0 ==="
# Check if draft exists
if gh release view v1.5.0 --repo "${GITHUB_REPO}" 2>/dev/null | grep -q '"isDraft": true'; then
  echo "Publishing draft release..."
  gh release edit v1.5.0 --repo "${GITHUB_REPO}" --draft=false
else
  echo "No draft found. Create a release manually or use gh release create."
fi
echo "✓ GitHub Release v1.5.0 published"

echo ""
echo "=== All Done! ==="
echo "Sprint 5 has been closed and Sprint 6 is ready."
echo "JIRA version v1.5.0 is marked as released."
echo "GitHub Release v1.5.0 is published (triggers jira-release-sync.yml if configured)."
```

Run it with:

```sh
chmod +x close-sprint-5.sh
./close-sprint-5.sh
```

---

## Verification Checklist

After completing all steps, verify:

- [ ] **Sprint 5 is closed** in JIRA (no longer appears in active/future sprints)
- [ ] **All unfinished tickets** moved to Sprint 6 (check Sprint 6 in JIRA board)
- [ ] **JIRA version v1.5.0** shows as "Released" with today's date
- [ ] **GitHub Release v1.5.0** is published (visible at https://github.com/mycompany/eng-backend/releases/tag/v1.5.0)
- [ ] **`jira-release-sync.yml` workflow** ran successfully (check Actions tab) — it should:
  - Extract JIRA keys from the release body
  - Create/update the version in JIRA
  - Update `fixVersions` on each ticket
  - Mark the version as released

---

## Troubleshooting

### "No JIRA key found in release body"
- Ensure the GitHub Release body includes JIRA ticket keys like `ENG-123`.
- The `jira-release-sync.yml` workflow extracts keys using the regex `[A-Z]+-[0-9]+`.

### Sprint close fails with 409 conflict
- This usually means Sprint 5 is not in the correct state.
- Verify no open issues are blocking the close.
- Ensure all unfinished tickets were moved to Sprint 6 first.

### Version not found
- Double-check the version ID from `GET /rest/api/3/project/ENG/versions`.
- Ensure the version is named exactly `v1.5.0` (case-sensitive).

### GitHub release publish fails
- Verify the tag `v1.5.0` exists on the `main` branch.
- Ensure you have push access to the repository.
- Check that `gh` CLI is authenticated: `gh auth status`.

---

## Next Steps

After closing Sprint 5:

1. **Plan Sprint 6** using the moved carryover tickets
2. **Review burndown metrics** from Sprint 5 (visible in JIRA Sprint Report)
3. **Run Sprint Retrospective** (create a retrospective ticket in JIRA with label `retrospective`)
4. **Start Sprint 6** when ready
