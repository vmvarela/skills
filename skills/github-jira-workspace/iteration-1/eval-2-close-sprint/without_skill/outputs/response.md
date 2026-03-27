# Sprint 5 Closure Workflow

I'll help you complete all four tasks for closing Sprint 5. Here's the step-by-step guidance:

## Prerequisites

Ensure you have the following:
- JIRA API token from your Atlassian account
- GitHub personal access token with `repo` and `release` scopes
- curl or similar HTTP client installed
- The following environment variables set (replace with actual values):

```bash
export JIRA_SITE="mycompany"
export JIRA_PROJECT="ENG"
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-jira-api-token"
export GITHUB_TOKEN="your-github-token"
export GITHUB_REPO="mycompany/eng-backend"
export JIRA_API_BASE="https://${JIRA_SITE}.atlassian.net/rest/api/3"
```

---

## Task 1: Move Unfinished Stories from Sprint 5 to Sprint 6

### Step 1a: Get Sprint IDs

First, retrieve the Sprint 5 and Sprint 6 IDs:

```bash
# Get all sprints for the project
curl -X GET \
  "${JIRA_API_BASE}/board" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" | jq .
```

Look for the board ID in the response, then use it to get sprints:

```bash
BOARD_ID="your-board-id"  # Replace with actual board ID from above

curl -X GET \
  "${JIRA_API_BASE}/board/${BOARD_ID}/sprint" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" | jq '.values[] | select(.name | contains("Sprint 5") or contains("Sprint 6"))'
```

Extract Sprint 5 ID and Sprint 6 ID from the response.

### Step 1b: Find Unfinished Issues in Sprint 5

```bash
SPRINT_5_ID="your-sprint-5-id"  # Replace with actual ID

curl -X GET \
  "${JIRA_API_BASE}/search" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "jql": "project = ENG AND sprint = '"${SPRINT_5_ID}"' AND status NOT IN (Done, Closed, Resolved)",
    "maxResults": 100,
    "fields": ["key", "summary", "status"]
  }' | jq '.issues[] | {key: .key, summary: .fields.summary, status: .fields.status.name}'
```

This returns all unfinished issues. Save the issue keys for the next step.

### Step 1c: Move Issues to Sprint 6

```bash
SPRINT_6_ID="your-sprint-6-id"  # Replace with actual ID
ISSUE_KEYS=("ENG-101" "ENG-102" "ENG-103")  # Replace with actual keys from Step 1b

for ISSUE_KEY in "${ISSUE_KEYS[@]}"; do
  curl -X POST \
    "${JIRA_API_BASE}/issue/${ISSUE_KEY}/move" \
    -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
    -H "Content-Type: application/json" \
    -d '{
      "issues": ["'"${ISSUE_KEY}"'"],
      "rankAfterIssue": "'"${SPRINT_6_ID}"'"
    }'
done
```

Alternatively, you can use a bulk move operation:

```bash
curl -X POST \
  "${JIRA_API_BASE}/issue/bulk" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "issues": ["ENG-101", "ENG-102", "ENG-103"],
    "fields": {
      "sprint": '"${SPRINT_6_ID}"'
    }
  }'
```

---

## Task 2: Close Sprint 5 in JIRA

```bash
SPRINT_5_ID="your-sprint-5-id"  # Replace with actual ID

curl -X POST \
  "${JIRA_API_BASE}/sprint/${SPRINT_5_ID}/close" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json"
```

This endpoint automatically resolves remaining issues and completes the sprint. You may optionally specify what to do with unfinished issues:

```bash
curl -X POST \
  "${JIRA_API_BASE}/sprint/${SPRINT_5_ID}/close" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "completeOption": "I will schedule the unfinished issues for the next sprint"
  }'
```

Note: Make sure all unfinished issues have been moved to Sprint 6 before closing Sprint 5.

---

## Task 3: Mark JIRA Version 'v1.5.0' as Released

### Step 3a: Get Project Key and Version ID

```bash
# List all versions for the project
curl -X GET \
  "${JIRA_API_BASE}/project/ENG/versions" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" | jq '.[] | select(.name == "v1.5.0")'
```

Extract the version ID from the response.

### Step 3b: Mark Version as Released

```bash
VERSION_ID="your-version-id"  # Replace with actual ID from Step 3a

curl -X PUT \
  "${JIRA_API_BASE}/version/${VERSION_ID}" \
  -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "released": true,
    "releaseDate": "'"$(date -u +'%Y-%m-%d')"'"
  }'
```

---

## Task 4: Publish a GitHub Release v1.5.0

### Option A: Using GitHub CLI (Recommended)

First, ensure you're authenticated and in the correct repository:

```bash
# Authenticate with GitHub (if not already done)
gh auth login

# Navigate to the repository
cd /path/to/mycompany/eng-backend

# Create the release with release notes
gh release create v1.5.0 \
  --title "Version 1.5.0" \
  --notes "
## v1.5.0 Release Notes

### Features
- Feature 1 description
- Feature 2 description

### Bug Fixes
- Bug fix 1 description
- Bug fix 2 description

### Breaking Changes
- Breaking change 1 (if applicable)

### Contributors
- Contributor names

See the [milestone](link-to-milestone) for full details.
" \
  --target main \
  --draft false
```

### Option B: Using GitHub REST API

```bash
# Get the latest commit SHA from main branch
COMMIT_SHA=$(curl -X GET \
  "https://api.github.com/repos/${GITHUB_REPO}/commits/main" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.sha')

# Create the release
curl -X POST \
  "https://api.github.com/repos/${GITHUB_REPO}/releases" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "tag_name": "v1.5.0",
    "target_commitish": "main",
    "name": "Version 1.5.0",
    "body": "## v1.5.0 Release Notes\n\n### Features\n- Feature 1\n- Feature 2\n\n### Bug Fixes\n- Bug fix 1\n- Bug fix 2",
    "draft": false,
    "prerelease": false
  }'
```

---

## Complete Automation Script

Here's a complete bash script that orchestrates all four tasks:

```bash
#!/bin/bash

set -e

# Configuration
JIRA_SITE="mycompany"
JIRA_PROJECT="ENG"
JIRA_EMAIL="${JIRA_EMAIL}"
JIRA_API_TOKEN="${JIRA_API_TOKEN}"
GITHUB_TOKEN="${GITHUB_TOKEN}"
GITHUB_REPO="mycompany/eng-backend"
JIRA_API_BASE="https://${JIRA_SITE}.atlassian.net/rest/api/3"

# Helper function for JIRA API calls
jira_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -X "$method" \
      "${JIRA_API_BASE}${endpoint}" \
      -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
      -H "Content-Type: application/json"
  else
    curl -s -X "$method" \
      "${JIRA_API_BASE}${endpoint}" \
      -H "Authorization: Basic $(echo -n ${JIRA_EMAIL}:${JIRA_API_TOKEN} | base64)" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

echo "=== Sprint 5 Closure Workflow ==="

# Task 1: Move unfinished stories to Sprint 6
echo "Task 1: Moving unfinished stories to Sprint 6..."

BOARD_ID=$(jira_call GET "/board" | jq -r '.values[0].id')
SPRINTS=$(jira_call GET "/board/${BOARD_ID}/sprint")
SPRINT_5_ID=$(echo "$SPRINTS" | jq -r '.values[] | select(.name | contains("Sprint 5")) | .id')
SPRINT_6_ID=$(echo "$SPRINTS" | jq -r '.values[] | select(.name | contains("Sprint 6")) | .id')

echo "Found Sprint 5 ID: $SPRINT_5_ID"
echo "Found Sprint 6 ID: $SPRINT_6_ID"

UNFINISHED=$(jira_call GET "/search" '' -d '{
  "jql": "project = '"${JIRA_PROJECT}"' AND sprint = '"${SPRINT_5_ID}"' AND status NOT IN (Done, Closed, Resolved)",
  "maxResults": 100
}')

ISSUE_KEYS=$(echo "$UNFINISHED" | jq -r '.issues[].key')

if [ -z "$ISSUE_KEYS" ]; then
  echo "No unfinished issues found in Sprint 5"
else
  echo "Moving the following issues to Sprint 6: $ISSUE_KEYS"
  for ISSUE_KEY in $ISSUE_KEYS; do
    jira_call PUT "/issue/${ISSUE_KEY}" '' -d '{
      "fields": {
        "sprint": '"${SPRINT_6_ID}"'
      }
    }'
  done
fi

# Task 2: Close Sprint 5
echo "Task 2: Closing Sprint 5..."
jira_call POST "/sprint/${SPRINT_5_ID}/close" ''
echo "Sprint 5 closed successfully"

# Task 3: Mark v1.5.0 as released
echo "Task 3: Marking v1.5.0 as released..."
VERSION_ID=$(jira_call GET "/project/${JIRA_PROJECT}/versions" | jq -r '.[] | select(.name == "v1.5.0") | .id')
jira_call PUT "/version/${VERSION_ID}" '' -d '{
  "released": true,
  "releaseDate": "'"$(date -u +'%Y-%m-%d')"'"
}'
echo "Version v1.5.0 marked as released"

# Task 4: Create GitHub release
echo "Task 4: Creating GitHub release v1.5.0..."
gh release create v1.5.0 \
  --repo "${GITHUB_REPO}" \
  --title "Version 1.5.0" \
  --notes "Release v1.5.0 - See https://mycompany.atlassian.net/software/c/projects/ENG/releases/v1.5.0 for details" \
  --target main \
  2>/dev/null || echo "Release already exists or error occurred"

echo "=== All tasks completed ==="
```

---

## Troubleshooting

### Issue: "Sprint not found" error
- Verify the sprint ID is correct by listing all sprints: `jira_call GET "/board/${BOARD_ID}/sprint"`
- Ensure the project key is correct (should be "ENG" based on your setup)

### Issue: "Cannot move issue to a closed sprint"
- Verify Sprint 6 is not in a closed state
- Check that Sprint 6 exists and is active

### Issue: "Version not found" when marking as released
- Verify the version name exactly matches "v1.5.0" in JIRA
- Use `jira_call GET "/project/ENG/versions"` to list all versions

### Issue: GitHub release creation fails
- Verify GitHub token has `repo` and `release` scopes
- Ensure the `main` branch exists and is properly named
- Use `gh auth status` to verify authentication

---

## Best Practices

1. **Before closing Sprint 5**: Always verify all stories are either completed or moved to Sprint 6
2. **Coordinate with team**: Notify the team before closing the sprint to ensure all work is accounted for
3. **Release notes**: Customize the GitHub release notes with meaningful information about what was included in v1.5.0
4. **Backup**: Consider exporting sprint reports before closing for historical records
5. **Communication**: Post the release in your team's communication channels (Slack, email, etc.)

---

## Summary of Commands

| Task | Command |
|------|---------|
| Get Sprint IDs | `jira_call GET "/board/${BOARD_ID}/sprint"` |
| Find unfinished issues | `jira_call GET "/search"` with JQL filter |
| Move issues to next sprint | `jira_call PUT "/issue/${ISSUE_KEY}"` |
| Close Sprint 5 | `jira_call POST "/sprint/${SPRINT_5_ID}/close"` |
| Mark version released | `jira_call PUT "/version/${VERSION_ID}"` |
| Create GitHub release | `gh release create v1.5.0` |

---

## Notes

- All JIRA API calls use Basic authentication with email and API token
- The script assumes the first board returned is the correct one; adjust as needed for your setup
- GitHub CLI is recommended for GitHub operations; REST API calls are also provided as an alternative
- Replace placeholder values (board IDs, sprint IDs, issue keys) with actual values from your environment
- The release date for v1.5.0 is automatically set to today's date in ISO format (YYYY-MM-DD)
