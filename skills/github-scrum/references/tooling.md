# Tooling Reference

Quick reference for all GitHub operations used in this skill.

---

## MCP Tools (preferred)

| Operation | MCP Tool | Key Params |
|---|---|---|
| Create issue | `mcp_github_github_issue_write` | `owner`, `repo`, `title`, `body`, `labels` |
| Update issue | `mcp_github_github_issue_write` | `owner`, `repo`, `issue_number`, + fields to update |
| Read issue | `mcp_github_github_issue_read` | `owner`, `repo`, `issue_number` |
| List issues | `mcp_github_github_list_issues` | `owner`, `repo`, `state`, `milestone`, `labels` |
| Search issues | `mcp_github_github_search_issues` | `q` (GitHub search syntax) |
| Add comment | `mcp_github_github_add_issue_comment` | `owner`, `repo`, `issue_number`, `body` |
| Create PR | `mcp_github_github_create_pull_request` | `owner`, `repo`, `title`, `body`, `head`, `base` |
| List PRs | `mcp_github_github_list_pull_requests` | `owner`, `repo`, `state` |
| Merge PR | `mcp_github_github_merge_pull_request` | `owner`, `repo`, `pull_number` |
| List releases | `mcp_github_github_list_releases` | `owner`, `repo` |
| Get label | `mcp_github_github_get_label` | `owner`, `repo`, `name` |
| Create branch | `mcp_github_github_create_branch` | `owner`, `repo`, `ref`, `sha` |
| List branches | `mcp_github_github_list_branches` | `owner`, `repo` |

---

## `gh` CLI (fallback — always use `GH_PAGER=cat`)

### Labels

```sh
GH_PAGER=cat gh label create "<name>" --color "<hex>" --description "<text>"
GH_PAGER=cat gh label delete "<name>" --yes
GH_PAGER=cat gh label list
```

### Issues

```sh
GH_PAGER=cat gh issue create --title "<title>" --body "<body>" --label "<l1>,<l2>" --milestone "<name>"
GH_PAGER=cat gh issue list --milestone "<name>" --state open --label "<label>"
GH_PAGER=cat gh issue edit <number> --add-label "<label>" --remove-label "<label>"
GH_PAGER=cat gh issue edit <number> --milestone "<name>"
GH_PAGER=cat gh issue close <number> --comment "<reason>"
GH_PAGER=cat gh issue view <number>
```

### Milestones (via API)

```sh
# List milestones
GH_PAGER=cat gh api repos/{owner}/{repo}/milestones --jq '.[] | "\(.number): \(.title) (due: \(.due_on | split("T")[0]))"'

# Create milestone
GH_PAGER=cat gh api repos/{owner}/{repo}/milestones --method POST \
  --field title="Sprint N" \
  --field description="Sprint Goal: ..." \
  --field due_on="2026-03-06T23:59:59Z"

# Close milestone
GH_PAGER=cat gh api repos/{owner}/{repo}/milestones/<number> --method PATCH --field state="closed"

# Update milestone
GH_PAGER=cat gh api repos/{owner}/{repo}/milestones/<number> --method PATCH \
  --field description="Updated goal"
```

### Releases

```sh
GH_PAGER=cat gh release create v<version> --title "<title>" --notes "<markdown>"
GH_PAGER=cat gh release list
```
