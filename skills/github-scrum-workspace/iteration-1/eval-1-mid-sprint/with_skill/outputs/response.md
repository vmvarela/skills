# Handling Mid-Sprint Issues in Sprint 3

## Situation 1: Urgent Production Bug

### Step 1: Create the bug ticket

```sh
export GH_PAGER=cat

gh issue create \
  --title "[URGENT] Production bug in payment processing" \
  --body "## Problem

Production issue affecting customer transactions.

## Impact

Critical - blocking revenue.

## Acceptance Criteria

- [ ] Root cause identified
- [ ] Fix deployed to production
- [ ] Monitoring alerts configured
- [ ] Post-mortem scheduled" \
  --label "type:bug,priority:critical,size:m,status:ready" \
  --repo mycompany/auth-service
```

### Step 2: Add to Sprint 3 milestone

```sh
ISSUE_NUM=<number from above>
gh issue edit $ISSUE_NUM --milestone "Sprint 3" --repo mycompany/auth-service
```

### Step 3: Address sprint capacity

Since we're adding unplanned work, review current sprint capacity:

```sh
gh issue list --milestone "Sprint 3" --json number,title,labels \
  -q '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"' \
  --repo mycompany/auth-service
```

**Action:** Consider removing a `priority:low` or `priority:medium` item to the backlog to stay within sprint capacity:

```sh
LOW_PRIORITY_ISSUE=<number>
gh issue edit $LOW_PRIORITY_ISSUE --milestone "" \
  --add-label "status:ready" \
  --repo mycompany/auth-service
```

## Situation 2: Blocked Ticket (AUTH-42 blocked by AUTH-38)

### Step 1: Verify AUTH-38 is deployed and done

```sh
gh issue view AUTH-38 --repo mycompany/auth --json state,labels
```

### Step 2: Remove blocker from AUTH-42

```sh
gh issue edit AUTH-42 \
  --remove-label "status:blocked" \
  --add-label "status:ready" \
  --repo mycompany/auth
```

### Step 3: Update status to in-progress

```sh
gh issue edit AUTH-42 \
  --remove-label "status:ready" \
  --add-label "status:in-progress" \
  --repo mycompany/auth
```

### Summary

- **Urgent bug:** Created, added to Sprint 3, compensated by moving lower-priority item to backlog
- **Blocker:** Removed status:blocked label, marked as in-progress now that AUTH-38 is deployed