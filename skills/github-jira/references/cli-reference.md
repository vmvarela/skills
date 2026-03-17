# CLI Reference

Full reference for JIRA operations. For each operation the primary `jira` CLI
command is shown, followed by the `curl` equivalent as fallback.

---

## Environment variables setup (for `curl`)

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
export JIRA_BASE_URL="https://<YOUR_DOMAIN>.atlassian.net"
export JIRA_USER_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token"
export JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
export JIRA_PROJECT="<PROJECT_KEY>"
```

```powershell
# PowerShell (Windows)
$env:JIRA_BASE_URL   = "https://<YOUR_DOMAIN>.atlassian.net"
$env:JIRA_USER_EMAIL = "your-email@company.com"
$env:JIRA_API_TOKEN  = "your-api-token"
$bytes = [System.Text.Encoding]::UTF8.GetBytes("$env:JIRA_USER_EMAIL`:$env:JIRA_API_TOKEN")
$env:JIRA_AUTH = [Convert]::ToBase64String($bytes)
$env:JIRA_PROJECT = "<PROJECT_KEY>"
```

> The `curl` examples in this file use bash syntax. On native PowerShell
> use `Invoke-RestMethod` or run `curl` from WSL / Git Bash.

---

## Issues: basic operations

### List issues

```sh
# jira CLI
jira issue list
jira issue list --status "To Do" --component <COMPONENT> --order-by priority
jira issue list --sprint active
jira issue list --jql "project = <PROJECT_KEY> AND sprint in openSprints()"

# curl
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/search?jql=project=${JIRA_PROJECT}+AND+sprint+in+openSprints()&maxResults=50" \
  | jq '.issues[] | "\(.key) [\(.fields.status.name)] \(.fields.summary)"'
```

### View a ticket

```sh
# jira CLI
jira issue view <PROJECT_KEY>-123

# curl
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123" \
  | jq '{key: .key, summary: .fields.summary, status: .fields.status.name, assignee: .fields.assignee.displayName}'
```

### Create an issue

```sh
# jira CLI (interactive)
jira issue create

# jira CLI (with parameters)
jira issue create \
  --type Story \
  --summary "As a user I want..." \
  --priority High \
  --component <COMPONENT> \
  --label "ready"

# curl
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue" \
  -d '{
    "fields": {
      "project": {"key": "<PROJECT_KEY>"},
      "issuetype": {"name": "Story"},
      "summary": "As a user I want...",
      "priority": {"name": "High"},
      "components": [{"name": "<COMPONENT>"}]
    }
  }' | jq '{key: .key, self: .self}'
```

### Edit an issue

```sh
# jira CLI
jira issue edit <PROJECT_KEY>-123 --priority Critical
jira issue edit <PROJECT_KEY>-123 --label blocked
jira issue edit <PROJECT_KEY>-123 --component <COMPONENT>

# curl: update fields
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123" \
  -d '{"fields": {"priority": {"name": "Critical"}}}'
```

### Assign an issue

```sh
# jira CLI (bash / zsh — subshell to self-assign)
jira issue assign <PROJECT_KEY>-123 $(jira me)
jira issue assign <PROJECT_KEY>-123 "username"
```

```powershell
# jira CLI (PowerShell — two steps to self-assign)
$me = jira me
jira issue assign <PROJECT_KEY>-123 $me
```

```sh
# curl: requires the user's accountId
# First look it up:
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/user/search?query=username" \
  | jq '.[0] | {accountId, displayName}'

# Then assign:
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123/assignee" \
  -d '{"accountId": "<accountId>"}'
```

---

## State transitions (workflow)

```sh
# jira CLI: view available transitions for a ticket
jira issue move <PROJECT_KEY>-123

# jira CLI: transition to a state
jira issue move <PROJECT_KEY>-123 "In Progress"
jira issue move <PROJECT_KEY>-123 "In Review"
jira issue move <PROJECT_KEY>-123 "Done"

# curl: first get available transition IDs
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123/transitions" \
  | jq '.transitions[] | "\(.id): \(.name)"'

# curl: execute a transition (use the ID obtained above)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123/transitions" \
  -d '{"transition": {"id": "<TRANSITION_ID>"}}'
```

---

## Comments

```sh
# jira CLI
jira issue comment add <PROJECT_KEY>-123 --body "Done in PR #42"
jira issue comment list <PROJECT_KEY>-123

# curl: add comment (simplified ADF format)
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123/comment" \
  -d '{
    "body": {
      "type": "doc",
      "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Done in PR #42"}]}]
    }
  }'
```

---

## Sprints

`jira` CLI has limited sprint support. For advanced operations use `curl`.

```sh
# jira CLI: list sprints for a board
jira sprint list --board <BOARD_ID>

# jira CLI: add tickets to a sprint
jira sprint add <sprint-id> <PROJECT_KEY>-123 <PROJECT_KEY>-124

# curl: list sprints for a board
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/agile/1.0/board/<BOARD_ID>/sprint?state=active,future" \
  | jq '.values[] | "\(.id): \(.name) [\(.state)]"'

# curl: move an issue to a sprint
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/sprint/<sprint-id>/issue" \
  -d '{"issues": ["<PROJECT_KEY>-123", "<PROJECT_KEY>-124"]}'

# curl: complete a sprint
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/sprint/<sprint-id>" \
  -d '{
    "state": "closed",
    "completeDate": "2026-03-13T23:59:59.000Z"
  }'

# curl: create a new sprint
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/agile/1.0/sprint" \
  -d '{
    "name": "Sprint 8",
    "originBoardId": <BOARD_ID>,
    "startDate": "2026-03-16T09:00:00.000Z",
    "endDate": "2026-03-27T18:00:00.000Z",
    "goal": "Sprint goal"
  }'
```

---

## Versions (for syncing with GitHub Releases)

```sh
# curl: list project versions
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT}/versions" \
  | jq '.[] | "\(.id): \(.name) [released: \(.released)]"'

# curl: create a new version
curl -s -X POST \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/version" \
  -d "{
    \"name\": \"v1.2.0\",
    \"project\": \"${JIRA_PROJECT}\",
    \"released\": false,
    \"description\": \"Release generated from GitHub\"
  }" | jq '{id: .id, name: .name}'

# curl: mark a version as released
RELEASE_DATE=$(date +%Y-%m-%d)   # Linux / macOS / WSL / Git Bash
# PowerShell: $RELEASE_DATE = Get-Date -Format "yyyy-MM-dd"
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/version/<version-id>" \
  -d "{
    \"released\": true,
    \"releaseDate\": \"${RELEASE_DATE}\"
  }"

# curl: update fixVersion on a ticket
curl -s -X PUT \
  -H "Authorization: Basic ${JIRA_AUTH}" \
  -H "Content-Type: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/<PROJECT_KEY>-123" \
  -d '{"update": {"fixVersions": [{"add": {"name": "v1.2.0"}}]}}'
```

---

## JQL search

```sh
# jira CLI
jira issue list --jql "project = <PROJECT_KEY> AND sprint in openSprints() AND component = <COMPONENT>"

# curl with arbitrary JQL (URL-encode the JQL as query param)
JQL="project=<PROJECT_KEY>+AND+sprint+in+openSprints()+AND+component=<COMPONENT>"
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/search?jql=${JQL}&maxResults=50&fields=summary,status,assignee,priority" \
  | jq '.issues[] | "\(.key) [\(.fields.status.name)] \(.fields.summary)"'
```

---

## Utilities

```sh
# View your own user info
jira me

# View available fields in the project (useful for scripting)
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/field" \
  | jq '.[] | select(.custom == false) | "\(.id): \(.name)"'

# View project components
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT}/components" \
  | jq '.[] | "\(.id): \(.name)"'

# View project issue types
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT}" \
  | jq '.issueTypes[] | "\(.id): \(.name)"'

# View available priorities
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/priority" \
  | jq '.[] | "\(.id): \(.name)"'

# View available resolutions
curl -s -H "Authorization: Basic ${JIRA_AUTH}" \
  "${JIRA_BASE_URL}/rest/api/3/resolution" \
  | jq '.[] | "\(.id): \(.name)"'
```
