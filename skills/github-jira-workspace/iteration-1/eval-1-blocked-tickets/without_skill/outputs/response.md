# JIRA Blocked Tickets Management Guide

## Viewing All Blocked Tickets in Current ENG Sprint

Here's the JQL query to find all blocked stories in your current ENG sprint:

```jql
project = ENG AND sprint = EMPTY AND status != Done AND labels = "blocked"
```

Or if you're using a specific sprint name/ID:

```jql
project = ENG AND sprint = "Current Sprint" AND status != Done AND labels = "blocked"
```

Or using the Atlassian issue link approach:

```jql
project = ENG AND sprint in openSprints() AND issueLink = "is blocked by" AND status != Done
```

**Better approach** - Use the blocker link type directly:

```jql
project = ENG AND sprint in openSprints() AND linked >= 1 AND type in (Story, Task, Bug) AND status NOT IN (Done, Closed)
```

To see the actual blocking relationships, you can run:

```jql
project = ENG AND sprint in openSprints() AND link IS NOT EMPTY AND issueLink in ("is blocked by", "blocks")
```

## Step-by-Step: Removing the Blocker on ENG-42

Since ENG-38 was merged yesterday, follow these steps:

### Step 1: Verify the Link
1. Open ENG-42 in JIRA
2. Scroll to the "Linked Issues" section
3. Confirm that ENG-42 has a "is blocked by" link to ENG-38

### Step 2: Update ENG-38 Status (if needed)
1. Open ENG-38
2. Verify its status is set to "Done" or "Merged"
3. If not already done, transition it to "Done" status
4. This may automatically resolve dependent issues

### Step 3: Remove the Blocker Link
1. Go to ENG-42
2. In the "Linked Issues" section, locate the link to ENG-38
3. Click the "X" or "Remove" button next to that link
4. Confirm the deletion when prompted

### Step 4: Update ENG-42 Status
1. Once the blocker is removed, you should be able to transition ENG-42 from "Blocked" status
2. Update the status to "In Progress" or "Ready for Review" as appropriate
3. If you're using a workflow with explicit "Blocked" status, transition out of it

### Step 5: Remove the "blocked" Label (Optional)
1. If you're using labels to track blockers, remove the "blocked" label from ENG-42
2. This helps keep tracking consistent

## Alternative: Using JIRA REST API

If you prefer to automate this process:

### Get all blocked issues:
```bash
curl -X GET "https://mycompany.atlassian.net/rest/api/3/search?jql=project%3DENG%20AND%20sprint%20in%20openSprints()%20AND%20linked%20%3E%3D%201" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"
```

### Get specific issue links for ENG-42:
```bash
curl -X GET "https://mycompany.atlassian.net/rest/api/3/issue/ENG-42" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.fields.issuelinks'
```

### Remove a specific link:
```bash
curl -X DELETE "https://mycompany.atlassian.net/rest/api/3/issueLink/LINK_ID" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

(Get LINK_ID from the issue link objects returned above)

### Transition ENG-42 out of Blocked status:
```bash
curl -X POST "https://mycompany.atlassian.net/rest/api/3/issue/ENG-42/transitions" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transition": {
      "id": "TRANSITION_ID_FOR_IN_PROGRESS"
    }
  }'
```

## Best Practices

1. **Keep blocker tracking consistent**: Use either JIRA labels, link types, or custom fields — not all three
2. **Update linked issues**: When resolving a blocker, always update the blocking issue's status first
3. **Communicate changes**: Notify the team when blockers are removed, especially before sprint review
4. **Monitor dependent work**: Use JIRA dashboards or filters to track blocked items regularly
5. **Link types**: Use "blocks/is blocked by" relationship types consistently for better reporting

## For Sprint Review Preparation

Before your sprint review tomorrow, run this query to get a final count:

```jql
project = ENG AND sprint in openSprints() AND (labels = "blocked" OR linked IS NOT EMPTY)
```

This shows you any remaining blockers that might impact your sprint completion metrics.
