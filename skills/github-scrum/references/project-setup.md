# GitHub Project Setup

Instructions for setting up the Scrum Board using GitHub Projects.

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated with project scopes
- Repository admin access
- Node.js 18+ (for automation scripts)

### Authentication Setup

Before creating projects, ensure your `gh` CLI has the required permissions:

```sh
# Check current authentication status
gh auth status

# If projects fail, refresh with required scopes
gh auth refresh -s project,read:project

# Verify project access
gh project list --owner <your-username>
```

**Required scopes:**
- `project` - Create and manage GitHub Projects
- `read:project` - Read project data and configurations
- `repo` - Access repository issues and PRs
- `workflow` - Manage GitHub Actions workflows (for automation)

## Automated Setup

Run the setup workflow to create the complete Scrum Board:

```sh
gh workflow run project-setup.yml
```

This single command creates:
- GitHub Project with custom fields
- All required views (Board, Sprint, Backlog, Velocity)
- Imports existing repository issues
- Configures automation workflows

## Manual Setup (if needed)

If you need to customize the setup, follow these steps:

### 1. Create the Project

```sh
gh project create --title "Scrum Board" --owner <owner> --template "table"
```

### 2. Add Custom Fields

Navigate to your project and add these fields:

| Field Name | Type | Options | Notes |
|------------|------|---------|-------|
| Status | Single select | Backlog, Ready, In Progress, Blocked, Review, Done | Set "Backlog" as default |
| Size | Single select | XS, S, M, L, XL | Map to story points |
| Estimate | Number | - | Calculated from Size |
| Priority | Single select | Critical, High, Medium, Low | Set "Medium" as default |
| Type | Single select | Feature, Bug, Chore, Spike, Docs | Set "Feature" as default |
| Sprint Goal | Text | - | Sprint objective |

### 3. Configure Iterations (Sprints)

In Project settings:
1. Enable "Iterations" field
2. Set iteration duration to 14 days (or your sprint length)
3. Set start date to upcoming Monday

### 4. Create Views

#### Board View (Kanban)
- Layout: Board
- Group by: Status
- Columns: Backlog, Ready, In Progress, Blocked, Review, Done

#### Sprint View
- Layout: Table
- Filter: Sprint = @current
- Columns: Title, Status, Size, Estimate, Priority, Type

#### Backlog View
- Layout: Table
- Filter: Status = Backlog
- Sort: Priority (Critical → High → Medium → Low)
- Columns: Title, Priority, Size, Type

#### Velocity View
- Layout: Table
- Group by: Sprint
- Columns: Title, Status, Size, Estimate, Sprint

### 5. Add Existing Issues

```sh
# Get all open issues
gh issue list --state open --json number,url --jq '.[].url' | \
  xargs -I {} gh project item-add <project-number> --owner <owner> --url {}
```

### 6. Map Labels to Fields

For each issue in the Project, update fields based on labels:

```sh
# Example: Update Size field based on size:* label
gh project item-edit <item-id> --field "Size" --value "M"
```

## Field Mappings

Labels automatically map to Project fields:

| Label Prefix | Field | Mapping |
|--------------|-------|---------|
| `type:*` | Type | type:feature → Feature |
| `priority:*` | Priority | priority:high → High |
| `size:*` | Size | size:m → M |
| `size:*` | Estimate | size:m → 4 |

## Story Points Mapping

| Size | Points | Time Estimate |
|------|--------|---------------|
| XS | 1 | < 1 hour |
| S | 2 | 1-4 hours |
| M | 4 | 4-8 hours |
| L | 8 | 1-2 days |
| XL | 16 | > 2 days (consider splitting) |

## Troubleshooting

### Project not visible
- Ensure you're using the correct `--owner` flag (user or org)
- Check permissions: you need write access to the repository

### Fields not showing
- Verify the Project number: `gh project list --owner <owner>`
- Check field names are exact (case-sensitive)

### Issues not importing
- Use full issue URLs: `https://github.com/owner/repo/issues/123`
- Ensure issues are open (closed issues can be added too, but usually not needed)

## Post-Setup Verification

After setup, verify:

1. Project appears in repository's Projects tab
2. All 4 views are created and functional
3. Custom fields appear in the "+" menu when viewing items
4. Existing issues are imported
5. Iterations field shows current and future sprints

## Next Steps

1. Run `sprint-start.yml` to begin your first sprint
2. Review [dor-checklist.md](dor-checklist.md) for DoR requirements
3. Add the automation workflows to `.github/workflows/`
