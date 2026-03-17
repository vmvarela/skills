# Setting up Scrum for auth-service

## Step 1: Remove default labels and create Scrum labels

```sh
# Set pager to prevent blocking
export GH_PAGER=cat

# Remove default labels
gh label list --json name -q '.[].name' | xargs -I {} gh label delete {} --yes

# Create type: namespace
gh label create "type:feature"       --color "1D76DB" --description "New functionality"
gh label create "type:bug"           --color "D73A4A" --description "Something isn't working"
gh label create "type:chore"         --color "0E8A16" --description "Maintenance, refactoring, tooling"
gh label create "type:spike"         --color "D4C5F9" --description "Research or investigation (timeboxed)"
gh label create "type:docs"          --color "0075CA" --description "Documentation only"

# Create priority: namespace
gh label create "priority:critical"  --color "B60205" --description "Must fix immediately — blocks everything"
gh label create "priority:high"      --color "D93F0B" --description "Must be in the next sprint"
gh label create "priority:medium"    --color "FBCA04" --description "Should be done soon"
gh label create "priority:low"       --color "C2E0C6" --description "Nice to have, do when possible"

# Create size: namespace
gh label create "size:xs"            --color "EDEDED" --description "Trivial — less than 1 hour"
gh label create "size:s"             --color "D4C5F9" --description "Small — 1 to 4 hours"
gh label create "size:m"             --color "BFD4F2" --description "Medium — 4 to 8 hours"
gh label create "size:l"             --color "FBCA04" --description "Large — 1 to 2 days"
gh label create "size:xl"            --color "D93F0B" --description "Extra large — more than 2 days"

# Create status: namespace
gh label create "status:ready"       --color "0E8A16" --description "Refined and ready for sprint selection"
gh label create "status:in-progress" --color "1D76DB" --description "Currently being worked on"
gh label create "status:blocked"     --color "B60205" --description "Waiting on something external"
gh label create "status:review"      --color "D4C5F9" --description "In code review or waiting for feedback"

# Create special labels
gh label create "mvp"                --color "FEF2C0" --description "Part of the Minimum Viable Product"
gh label create "tech-debt"          --color "E4E669" --description "Technical debt — address proactively"
gh label create "retrospective"      --color "C5DEF5" --description "Sprint retrospective issue"
```

## Step 2: Create Sprint 1 milestone

Calculate due date (2 weeks from today):
```sh
DUE_DATE=$(date -u -d "+14 days" +%Y-%m-%d)

gh api repos/mycompany/auth-service/milestones --method POST \
  --field title="Sprint 1" \
  --field description="Sprint Goal: Establish authentication framework and user registration flow" \
  --field due_on="$DUE_DATE"
```

## Step 3: Create sprint planning issue

```sh
gh issue create \
  --title "Sprint Planning: Sprint 1" \
  --body "## Sprint Goal

Establish authentication framework and user registration flow

## Acceptance Criteria

- [ ] Sprint backlog defined and estimated
- [ ] All issues linked to Sprint 1 milestone
- [ ] Development environment ready
- [ ] Team aware of sprint goal and commitments

## Backlog Items for Consideration

1. User registration endpoint
2. Email verification
3. Login/logout flow
4. Session management
5. Password reset flow

## Next Steps

1. Review backlog items
2. Select items that fit sprint capacity
3. Estimate each item (sizing)
4. Commit to sprint goal" \
  --label "type:docs,status:ready"
```

This gives you a fully labeled Scrum environment with Sprint 1 ready for work.