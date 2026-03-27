# Creating a JIRA Ticket for Safari SSO Login Bug

I'll guide you through creating a JIRA ticket for this Safari SSO authentication bug. Since I don't have direct API access, here's how to create it manually or via CLI:

## Option 1: Using JIRA Web UI (Manual)

1. **Navigate to your JIRA board**
   - Go to `https://mycompany.atlassian.net`
   - Click on the **ENG** project

2. **Create a new issue**
   - Click "Create" button (usually in the top navigation)
   - Fill in the following details:

   **Issue Details:**
   - **Project:** ENG
   - **Issue Type:** Bug
   - **Summary:** Safari SSO authentication failing for users
   - **Description:** Users on Safari are unable to authenticate using SSO. This is a production issue affecting authentication workflows.
   - **Priority:** High
   - **Sprint:** Select your current active sprint
   - **Components/Labels:** (if your team uses these)

3. **Submit the ticket**
   - Click "Create"

## Option 2: Using JIRA REST API via cURL

If you prefer to automate this, you can use the JIRA REST API:

```bash
# Set your credentials and variables
JIRA_URL="https://mycompany.atlassian.net"
PROJECT_KEY="ENG"
CURRENT_SPRINT_ID="<your-sprint-id>"  # You'll need to get this first

# Get the current sprint ID (if you don't know it)
curl -u your-email@company.com:your-api-token \
  -X GET \
  "$JIRA_URL/rest/api/3/board?name=ENG" | jq '.values[0].id'

# Then get the active sprint
curl -u your-email@company.com:your-api-token \
  -X GET \
  "$JIRA_URL/rest/api/3/board/<board-id>/sprint?state=active" | jq '.values[0].id'

# Create the issue
curl -u your-email@company.com:your-api-token \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": {
        "key": "ENG"
      },
      "summary": "Safari SSO authentication failing for users",
      "description": {
        "version": 1,
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Users on Safari are unable to authenticate using SSO in production. This is a critical issue affecting the authentication workflow."
              }
            ]
          }
        ]
      },
      "issuetype": {
        "name": "Bug"
      },
      "priority": {
        "name": "High"
      },
      "sprint": <SPRINT_ID>,
      "components": []
    }
  }' \
  "$JIRA_URL/rest/api/3/issues"
```

**Important Notes:**
- Replace `your-email@company.com` with your actual JIRA email
- Replace `your-api-token` with your JIRA API token (generate from Account Settings > Security > API tokens)
- You'll need to find your board ID and current sprint ID first

## Option 3: Using JIRA Command Line (jira-cli)

If your team uses `jira-cli`, you can use:

```bash
jira issue create \
  --project ENG \
  --type Bug \
  --summary "Safari SSO authentication failing for users" \
  --description "Users on Safari are unable to authenticate using SSO in production." \
  --priority High \
  --sprint "<current-sprint-name>"
```

## What You'll Get

Once created, you'll have:
- ✓ A bug ticket in the ENG project
- ✓ High priority designation
- ✓ Assigned to the current active sprint
- ✓ Ready for your team to triage and work on

## Next Steps

1. The ticket will be visible on your ENG board
2. You can then assign it to a team member
3. Add any additional details like affected browsers, reproduction steps, or links to monitoring data
4. Consider adding labels like `production`, `safari`, or `sso` for better tracking

---

**Note:** This guidance covers the JIRA API v3 REST endpoints. Your JIRA instance may have slightly different configurations, so adjust field names and IDs as needed for your environment.
