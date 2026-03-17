---
name: github-jira
description: "Manage software projects with Scrum using JIRA Cloud as the backlog and sprint board, GitHub for code and releases, and the native JIRA+GitHub integration for automatic synchronization. Use this skill whenever the user mentions JIRA tickets, JIRA sprints, JIRA backlog, ticket keys (e.g. ABC-123), JQL queries, wants to create or move tickets, plan a sprint, close a sprint, sync a GitHub Release with JIRA, or needs to know how to name a branch from a ticket. Also applies when the user asks how to link GitHub PRs to JIRA tickets, how to auto-label PRs from JIRA fields, or how to manage a project that has a single JIRA project for multiple GitHub repositories."
---

# Skill: github-jira

Manage Scrum projects with JIRA Cloud + GitHub. The JIRA ticket key (e.g.
`<PROJECT_KEY>-123`) is the link that connects branches, PRs, releases, and
tickets.

---

## Tooling Strategy

### Primary tool: `jira` CLI

Use [`jira-cli`](https://github.com/ankitpokhrel/jira-cli) (ankitpokhrel) for
all ticket operations. It is the equivalent of `gh` CLI but for JIRA.

**Installation:**

```sh
brew install jira-cli    # macOS (Homebrew)
scoop install jira-cli   # Windows (Scoop)
snap install jira-cli    # Linux (Snap)
# Linux without Snap: download binary from
# https://github.com/ankitpokhrel/jira-cli/releases
```

**Initialization** (once per machine). Interactive mode fails with 401 before
asking for the token, so always pass parameters as flags:

```sh
# First export the token (from id.atlassian.com → Security → API tokens)
export JIRA_API_TOKEN="your-api-token"

# Initialize
jira init \
  --installation cloud \
  --server https://<YOUR_DOMAIN>.atlassian.net \
  --login your-email@company.com \
  --auth-type basic \
  --project <PROJECT_KEY> \
  --board "<BOARD_NAME>" \
  --force
```

> The `--board` name must match exactly what appears in JIRA, not the numeric ID.
> For commands that require a board **ID** (e.g. `jira sprint list --board <BOARD_ID>`),
> find it from the board URL in JIRA: `.../jira/software/projects/<PROJECT_KEY>/boards/<ID>`
> or by running `jira board list`.

Config is stored at:
- **macOS / Linux:** `~/.config/.jira/.config.yml`
- **Windows:** `%APPDATA%\.jira\.config.yml`

The token is **not stored on disk** — it is stored in the system keychain
(macOS Keychain, Windows Credential Manager). However, `jira` CLI reads it
from the `JIRA_API_TOKEN` environment variable if set, which is more convenient
for scripts and terminal sessions. Add to `.zshrc` or `.bashrc`:

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
export JIRA_API_TOKEN="your-api-token"
```

```powershell
# PowerShell (Windows) — add to $PROFILE
$env:JIRA_API_TOKEN = "your-api-token"
```

### Fallback: REST API v3 with `curl`

When `jira` CLI does not cover an operation (sprints, versions, specific
transitions), use the REST API directly. Authentication requires encoding
`email:api_token` in Base64:

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
```

```powershell
# PowerShell (Windows)
$bytes = [System.Text.Encoding]::UTF8.GetBytes("$env:JIRA_USER_EMAIL`:$env:JIRA_API_TOKEN")
$JIRA_AUTH = [Convert]::ToBase64String($bytes)
```

> This method is for **local/manual** use. For **GitHub Actions** use OAuth 2.0
> (see `references/github-actions.md`).

See `references/cli-reference.md` for the full command reference.

### Native JIRA + GitHub integration

With the official Atlassian integration enabled (**no extra code required**):

| Action in GitHub | Automatic effect in JIRA |
|---|---|
| Create branch `feature/<PROJECT_KEY>-123-...` | Ticket linked, visible in "Development" panel |
| Open PR with `<PROJECT_KEY>-123` in name/branch | PR linked to the ticket |
| Merge PR (if configured) | Can transition ticket to "Done" |

This means you **don't need Actions to sync states**. The native integration
handles it as long as the branch name contains the ticket key.

### Custom GitHub Actions (per repo)

Three Actions complement what the native integration does not cover:

| Action | What it does |
|---|---|
| `labeler.yml` | Applies `type:*` labels automatically based on branch name prefix |
| `jira-label-pr.yml` | Reads JIRA ticket from branch and applies `priority:*` and `size:*` to the PR |
| `jira-release-sync.yml` | On Release publish, creates the Version in JIRA and links tickets |

**Responsibility split:**
- `labeler.yml` → `type:*` (feature, bug, chore, spike, docs) — inferred from branch name, no JIRA call
- `jira-label-pr.yml` → `priority:*` and `size:*` — read from the JIRA ticket, only if the branch contains a JIRA key

See `references/github-actions.md` for complete ready-to-use templates.

---

## Scrum → JIRA + GitHub

| Scrum Concept | JIRA | GitHub |
|---|---|---|
| Product Goal | JIRA project description | — |
| Product Backlog | Tickets in **Backlog** or **To Do** with no sprint | — |
| Sprint | **Sprint** on the JIRA Scrum board | Optional Milestone (informational) |
| Sprint Backlog | Tickets assigned to the active sprint | — |
| Sprint Goal | Sprint **Goal** field in JIRA | — |
| Increment | **Version/Release** in JIRA | **GitHub Release** |
| Burndown | Sprint board view in JIRA | — |
| Retrospective | **Task** ticket with `retrospective` label | — |
| Definition of Done | Acceptance criteria on ticket | Checklist in PR template |

**Relationship between projects and repositories:**
A single JIRA project manages tickets for multiple repositories.
The **Component/s** field identifies the repository each ticket belongs to:
`1 Component = 1 GitHub repository`.

---

## Branch naming

The JIRA key in the branch name is **required**. It activates the native
integration and the GitHub Actions.

```
feature/<PROJECT_KEY>-123-short-description
bugfix/<PROJECT_KEY>-171-fix-auth-token
chore/<PROJECT_KEY>-180-update-dependencies
hotfix/<PROJECT_KEY>-195-critical-db-connection
spike/<PROJECT_KEY>-201-investigate-cache-options
```

**Rules:**
- Prefix by type: `feature/`, `bugfix/`, `chore/`, `hotfix/`, `spike/`
- JIRA key in uppercase: `<PROJECT_KEY>-NNN`
- Description in kebab-case
- No spaces or special characters

---

## Issue Types

Use JIRA's native types. Do not create custom types unless necessary.

| Type | When to use | Typical duration |
|---|---|---|
| **Epic** | Large features or initiatives | Weeks / multiple sprints |
| **Story** | Functionality with end-user value | 1 sprint |
| **Task** | Technical work without direct business value | 1 sprint or less |
| **Bug** | Defect in production or development | 1 sprint or less |
| **Subtask** | Part of a Story or Task | Hours / days |
| **Spike** | Research or proof of concept (timeboxed) | Maximum 1 sprint |

### JIRA native priorities

JIRA manages priorities as a native field. The `jira-label-pr.yml` GitHub
Action maps them automatically to PR labels:

| JIRA Priority | GitHub Label |
|---|---|
| Highest / Critical | `priority:critical` |
| High | `priority:high` |
| Medium | `priority:medium` |
| Low / Lowest | `priority:low` |

---

## Initial Setup

### 1. Install and configure `jira` CLI

```sh
brew install jira-cli   # macOS; see Tooling section for other platforms

export JIRA_API_TOKEN="your-api-token"   # id.atlassian.com → Security → API tokens

jira init \
  --installation cloud \
  --server https://<YOUR_DOMAIN>.atlassian.net \
  --login your-email@company.com \
  --auth-type basic \
  --project <PROJECT_KEY> \
  --board "<BOARD_NAME>" \
  --force
```

Add `JIRA_API_TOKEN` to `.zshrc` / `.bashrc` so it persists across sessions.

**Per-repo configuration** — create `.jira.d/config.yml` at the repo root
(takes priority over the global config):

```yaml
project: <PROJECT_KEY>
board: <BOARD_NAME>      # exact board name in JIRA (used for jira init/interactive commands)
component: <COMPONENT>   # exact Component name in JIRA (case-sensitive)
```

> **IMPORTANT:** The `component` in `.jira.d/config.yml` acts as a default filter
> for `jira issue list` commands but is **not applied automatically** when creating
> tickets with `jira issue create`. Always pass `--component <COMPONENT>` explicitly
> on creation. Without this flag the ticket will have no component and won't appear
> in per-repository filters.
>
> **Per-repo config vs global:** `.jira.d/config.yml` at the repo root overrides
> `~/.config/.jira/.config.yml`, allowing different project/board/component defaults
> per repository while reusing the same JIRA credentials.

### 2. Configure secrets in GitHub

In each repository: **Settings → Secrets and variables → Actions**

```
JIRA_BASE_URL      → https://<YOUR_DOMAIN>.atlassian.net
JIRA_USER_EMAIL    → your-email@company.com
JIRA_API_TOKEN     → your-api-token
JIRA_CLIENT_ID     → Application Link Key ID (for GitHub Actions OAuth 2.0)
JIRA_CLIENT_SECRET → Application Link Key Secret
JIRA_CLOUD_ID      → Atlassian Cloud ID (see github-actions.md for how to obtain)
```

Optionally, set a repository variable (not secret):
```
JIRA_PROJECT       → <PROJECT_KEY>   (if different from the default)
```

### 3. Install GitHub Actions

Copy the two templates from `references/github-actions.md` to `.github/workflows/`
in each repository you want to integrate with JIRA.

### 4. Create GitHub labels (once per repo)

```sh
# Type (managed by labeler.yml)
gh label create "type:feature"  --color "1D76DB" --description "New functionality"
gh label create "type:bug"      --color "D73A4A" --description "Something isn't working"
gh label create "type:chore"    --color "0E8A16" --description "Maintenance, refactoring"
gh label create "type:spike"    --color "D4C5F9" --description "Research (timeboxed)"
gh label create "type:docs"     --color "0075CA" --description "Documentation only"

# Priority (managed by jira-label-pr.yml)
gh label create "priority:critical" --color "B60205" --description "Blocks everything"
gh label create "priority:high"     --color "D93F0B" --description "Next sprint"
gh label create "priority:medium"   --color "FBCA04" --description "Important, no urgency"
gh label create "priority:low"      --color "C2E0C6" --description "Nice to have"

# Size / Story Points (managed by jira-label-pr.yml)
gh label create "size:xs" --color "EDEDED" --description "1 point — trivial"
gh label create "size:s"  --color "D4C5F9" --description "2 points — small"
gh label create "size:m"  --color "BFD4F2" --description "3 points — medium"
gh label create "size:l"  --color "FBCA04" --description "5-8 points — large"
gh label create "size:xl" --color "D93F0B" --description "13+ points — extra large (split it)"
```

---

## Sprint Lifecycle

### Sprint Planning

1. **View the backlog for your component:**

   ```sh
   jira issue list \
     --status "Backlog,To Do" \
     --component <COMPONENT> \
     --order-by priority \
     --plain
   ```

2. **Select tickets for the sprint.** Consider:
   - Priority: Critical → High → Medium
   - Dependencies between tickets
   - Team capacity (Story Points or T-shirt sizes)

3. **Move tickets to the active sprint:**

   ```sh
   # List available sprints
   jira sprint list --board <BOARD_ID>

   # Move tickets to the sprint
   jira sprint add <sprint-id> <PROJECT_KEY>-123 <PROJECT_KEY>-124
   ```

4. **Define the Sprint Goal** in the JIRA UI (edit the sprint and fill in the "Goal" field).

5. **Assign tickets** to team members:

   ```sh
   # bash / zsh — self-assign using subshell
   jira issue assign <PROJECT_KEY>-123 $(jira me)
   ```

   ```powershell
   # PowerShell — two steps
   $me = jira me
   jira issue assign <PROJECT_KEY>-123 $me
   ```

### During the Sprint

**View active sprint progress:**

```sh
jira issue list --sprint "active" --component <COMPONENT> --plain
```

**Transition a ticket** when starting work:

```sh
# See available transitions (interactive — shows a menu with the ticket's valid states)
jira issue move <PROJECT_KEY>-123

# Move to "In Progress"
jira issue move <PROJECT_KEY>-123 "In Progress"
```

**Create the branch** (activates native JIRA+GitHub integration):

```sh
git checkout -b feature/<PROJECT_KEY>-123-short-description
```

**Block a ticket:**

```sh
jira issue edit <PROJECT_KEY>-123 --label blocked
jira issue comment add <PROJECT_KEY>-123 --body "Blocked by: <reason>"
```

**View blockers:**

```sh
jira issue list --sprint "active" --label blocked --component <COMPONENT>
```

### Sprint Review

See `references/workflows.md` for the detailed review and retrospective flow.

### Sprint Retrospective

Create the retrospective ticket:

```sh
# bash / zsh (Linux, macOS, WSL, Git Bash)
jira issue create \
  --type Task \
  --summary "Retrospective: Sprint <N>" \
  --label retrospective \
  --component <COMPONENT> \
  --body "## What went well?\n\n-\n\n## What could be improved?\n\n-\n\n## Action items\n\n- [ ]\n\n## Metrics\n\n- Planned: X\n- Completed: Y\n- Carryover: Z\n- Sprint Goal met: Yes/No"
```

```powershell
# PowerShell (Windows)
$body = "## What went well?`n`n-`n`n## What could be improved?`n`n-`n`n## Action items`n`n- [ ]`n`n## Metrics`n`n- Planned: X`n- Completed: Y`n- Carryover: Z`n- Sprint Goal met: Yes/No"
jira issue create --type Task --summary "Retrospective: Sprint <N>" --label retrospective --component <COMPONENT> --body $body
```

---

## End-to-end flow: from ticket to release

```
1. JIRA: Ticket <PROJECT_KEY>-123 in Backlog (Story, High, component=<COMPONENT>)
         ↓
2. Sprint Planning: move <PROJECT_KEY>-123 to the active Sprint
         ↓
3. Dev creates branch: git checkout -b feature/<PROJECT_KEY>-123-description
   → Native integration: ticket appears as "In Progress" in JIRA
         ↓
4. Open PR with title "[<PROJECT_KEY>-123] Description of the change"
   → jira-label-pr.yml: applies priority:high, size:m from JIRA ticket fields
   → labeler.yml: applies type:feature from branch prefix
   → release-drafter: accumulates the PR in the next release draft
         ↓
5. PR merged to main
   → Native integration: can transition <PROJECT_KEY>-123 to "Done" (if configured)
         ↓
6. Sprint Review: publish GitHub Release (from GitHub UI or gh CLI)
   → jira-release-sync.yml:
      · Creates Version "v1.2.0" in the JIRA project
      · Extracts all JIRA keys from the release changelog
      · Updates fixVersions on each found ticket
      · Marks the Version as "Released" with today's date
         ↓
7. Create Retrospective ticket in JIRA
```

---

## Definition of Done

Before moving a ticket to "Done", verify:

- [ ] Code implemented and functional
- [ ] All acceptance criteria from the ticket are met
- [ ] Tests written and passing (when applicable)
- [ ] No lint or compilation errors
- [ ] PR self-reviewed (read your own diff before merging)
- [ ] Documentation updated (if user-facing behavior changed)
- [ ] Ticket transitioned to "Done" in JIRA

**Closing a ticket:**

Use `jira issue move` to transition the ticket. Available transition names
depend on your JIRA workflow configuration. To discover them:

```sh
# Interactive: shows available transitions for a ticket
jira issue move <PROJECT_KEY>-123

# Via REST API: list transition IDs and names
JIRA_AUTH=$(printf '%s' "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" | base64 | tr -d '\n')
curl -s -H "Authorization: Basic $JIRA_AUTH" \
  "https://<YOUR_DOMAIN>.atlassian.net/rest/api/3/issue/<PROJECT_KEY>-123/transitions" \
  | jq '.transitions[] | "\(.id): \(.name)"'
```

If your workflow requires a `resolution` field or custom fields on close, use the
REST API directly:

```sh
curl -s -X POST \
  -H "Authorization: Basic $JIRA_AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "transition": {"id": "<TRANSITION_ID>"},
    "fields": {
      "resolution": {"id": "<RESOLUTION_ID>"}
    }
  }' \
  "https://<YOUR_DOMAIN>.atlassian.net/rest/api/3/issue/<PROJECT_KEY>-123/transitions"
```

To find resolution IDs for your instance:

```sh
curl -s -H "Authorization: Basic $JIRA_AUTH" \
  "https://<YOUR_DOMAIN>.atlassian.net/rest/api/3/resolution" \
  | jq '.[] | "\(.id): \(.name)"'
```

Add a comment with the PR link:

```sh
jira issue comment add <PROJECT_KEY>-123 --body "Done in PR #<number> — <link>"
```

---

## References

- `references/jql-cheatsheet.md` — Ready-to-use JQL queries
- `references/cli-reference.md` — Full `jira` CLI and `curl` command reference
- `references/github-actions.md` — `jira-label-pr.yml` and `jira-release-sync.yml` templates
- `references/workflows.md` — Detailed sprint lifecycle procedures

---

## When to Apply This Skill

Apply this skill when the user:
- Mentions **JIRA** tickets, sprints, backlog, boards, or JQL
- Uses ticket key notation like `ABC-123` or `<PROJECT_KEY>-NNN`
- Wants to create, move, assign, or close JIRA tickets
- Asks about linking GitHub branches or PRs to JIRA tickets
- Wants to sync a GitHub Release with a JIRA version
- Asks how to auto-label PRs from JIRA priority or story points
- Is planning, running, reviewing, or closing a sprint in JIRA
- Manages a single JIRA project across multiple GitHub repositories

**This skill + `github-scrum`:** Both skills handle Scrum workflows but for
different backends. Use `github-scrum` when managing work entirely within GitHub
(Issues + Milestones). Use `github-jira` when JIRA is the source of truth for
the backlog and sprint board, and GitHub is used only for code and releases.
The two skills are compatible — you can use both in the same project if JIRA
and GitHub coexist.
