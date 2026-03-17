# Closing Sprint 3 & Planning Sprint 4

## Step 1: Handle Carryover Issues

Identify incomplete issues in Sprint 3:

```sh
export GH_PAGER=cat

# List open (incomplete) issues
gh issue list --milestone "Sprint 3" --state open \
  --json number,title,labels \
  -q '.[] | "#\(.number) \(.title)"' \
  --repo mycompany/auth-service
```

Move carryover items back to backlog:

```sh
# For each incomplete issue:
ISSUE_NUM=123
gh issue edit $ISSUE_NUM --milestone "" \
  --remove-label "status:in-progress,status:blocked,status:review" \
  --add-label "status:ready" \
  --repo mycompany/auth-service
```

## Step 2: Create Retrospective Issue

```sh
gh issue create \
  --title "Retrospective: Sprint 3" \
  --body "## What went well?

- Strong team collaboration
- Deployed key auth features

## What could be improved?

- Better planning for unexpected issues
- More thorough testing before deployment

## Action items for next sprint

- [ ] Add integration test suite
- [ ] Improve incident response process
- [ ] Document deployment checklist

## Metrics

- **Planned:** 12 issues
- **Completed:** 10 issues
- **Carried over:** 2 issues
- **Sprint Goal met:** Yes" \
  --label "retrospective" \
  --repo mycompany/auth-service
```

## Step 3: Create GitHub Release v0.3.0

```sh
# Generate release notes from closed issues
gh release create v0.3.0 \
  --title "v0.3.0 - Sprint 3 Release" \
  --notes "## New Features

- User registration and email verification
- Session management
- Improved error handling

## Bug Fixes

- Fixed password reset email delivery
- Corrected token expiration logic

## Sprint Goal

Delivered complete authentication and user management system as planned." \
  --repo mycompany/auth-service
```

## Step 4: Create Sprint 4 Milestone

Calculate due date (2 weeks out):

```sh
DUE_DATE=$(date -u -d "+14 days" +%Y-%m-%d)

gh api repos/mycompany/auth-service/milestones --method POST \
  --field title="Sprint 4" \
  --field description="Sprint Goal: Implement 2FA and account security features" \
  --field due_on="$DUE_DATE"
```

## Step 5: Plan Sprint 4

Review backlog and assign top items to Sprint 4:

```sh
# List ready backlog items
gh issue list --label "status:ready" --milestone "" \
  --json number,title,labels \
  -q '.[] | "#\(.number) \(.title)"' \
  --repo mycompany/auth-service

# Assign selected items to Sprint 4:
gh issue edit 456 --milestone "Sprint 4" --repo mycompany/auth-service
gh issue edit 457 --milestone "Sprint 4" --repo mycompany/auth-service
gh issue edit 458 --milestone "Sprint 4" --repo mycompany/auth-service
```

## Workflow Summary

**Carryover** → Moved incomplete items to backlog with status:ready

**Retrospective** → Issue created to inspect what went well and what to improve

**Release** → v0.3.0 published with release notes

**Next Sprint** → Sprint 4 milestone created, top backlog items assigned