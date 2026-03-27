# Tooling Reference

Quick reference for all GitHub operations used in this skill.

**Primary tool: `gh` CLI.** Always set `GH_PAGER=cat` to prevent interactive pagers from blocking execution.

---

## Labels

```sh
GH_PAGER=cat gh label create "<name>" --color "<hex>" --description "<text>"
GH_PAGER=cat gh label delete "<name>" --yes
GH_PAGER=cat gh label list
```

## Issues

```sh
GH_PAGER=cat gh issue create --title "<title>" --body "<body>" --label "<l1>,<l2>"
GH_PAGER=cat gh issue list --label "<label>" --state open
GH_PAGER=cat gh issue list --state open --json number,title,labels -q '.[] | "#\(.number) \(.title)"'
GH_PAGER=cat gh issue edit <number> --add-label "<label>" --remove-label "<label>"
GH_PAGER=cat gh issue close <number> --comment "<reason>"
GH_PAGER=cat gh issue view <number>
GH_PAGER=cat gh issue pin <number>
```

## Pull Requests

```sh
GH_PAGER=cat gh pr create --title "<title>" --body "<body>" --base main --head <branch>
GH_PAGER=cat gh pr list --state open
GH_PAGER=cat gh pr merge <number> --squash --delete-branch
GH_PAGER=cat gh pr view <number>
GH_PAGER=cat gh pr edit <number> --add-label "<label>" --remove-label "<label>"
```

## GitHub Projects

### Project Management

```sh
# List projects
gh project list --owner <owner>

# Create project
gh project create --title "Scrum Board" --owner <owner>

# View project
gh project view <number> --owner <owner>

# Edit project
gh project edit <number> --owner <owner> --title "New Title"
```

### Project Items

```sh
# Add issue to project
gh project item-add <project-number> --owner <owner> --url <issue-url>

# List items
gh project item-list <project-number> --owner <owner>

# Edit item fields
gh project item-edit --id <item-id> --field "Status" --value "In Progress"

# Delete item
gh project item-delete --id <item-id>
```

### Project Fields

Projects use custom fields for Scrum tracking:

```sh
# Get project fields (requires GraphQL)
gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field {
              name
              id
            }
            ... on ProjectV2SingleSelectField {
              name
              id
              options {
                name
                id
              }
            }
          }
        }
      }
    }
  }
' -f owner=<owner> -F number=<project-number>
```

### Project API (GraphQL)

For advanced operations, use the GitHub GraphQL API:

```sh
# Update project item field
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: {singleSelectOptionId: $optionId}
      }
    ) {
      projectV2Item {
        id
      }
    }
  }
' -f projectId=<project-id> -f itemId=<item-id> -f fieldId=<field-id> -f optionId=<option-id>
```

## Releases

```sh
GH_PAGER=cat gh release create v<version> --title "<title>" --notes "<markdown>"
GH_PAGER=cat gh release list
```

## Workflows

```sh
# List workflows
gh workflow list

# View workflow
gh workflow view <workflow-name>

# Run workflow
gh workflow run <workflow-name>

# Run workflow with inputs
gh workflow run sprint-start.yml -f sprint_goal="Add auth" -f sprint_days=14

# Enable/disable workflow
gh workflow enable <workflow-id>
gh workflow disable <workflow-id>
```

## Environment Variables

Always set these when running commands:

```sh
# Prevent interactive pagers
export GH_PAGER=cat

# Use GitHub token for API calls
export GITHUB_TOKEN=<your-token>
```

## Cross-platform Date Generation

```sh
# Portable (Linux + macOS)
DUE_DATE=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow()+timedelta(days=14)).strftime('%Y-%m-%dT00:00:00Z'))")

# Linux/GNU only
DUE_DATE=$(date -u -d "+14 days" +%Y-%m-%dT00:00:00Z)

# macOS/BSD only
DUE_DATE=$(date -u -v+14d +%Y-%m-%dT00:00:00Z)
```
