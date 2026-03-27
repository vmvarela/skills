# Definition of Ready (DoR) Checklist

The Definition of Ready defines the minimum requirements for an issue to be considered ready for Sprint selection (Status=Ready).

## Required Criteria

These checks MUST pass before an issue can be added to a Sprint:

### 1. Description
**Validation:** Issue body has at least 50 characters  
**Error Message:** "Add a clear description (minimum 50 characters)"  
**Why:** Ensures the issue is understood by anyone reading it

### 2. Acceptance Criteria
**Validation:** Issue body contains at least one checklist item (`- [ ]`)  
**Error Message:** "Add acceptance criteria as a checklist (`- [ ] criterion`)"  
**Why:** Defines what "done" means for this specific issue

**Good Example:**
```markdown
## Acceptance Criteria
- [ ] User can log in with email and password
- [ ] Error message shown for invalid credentials
- [ ] Session persists for 24 hours
```

### 3. Size Estimate
**Validation:** Issue has a `size:*` label  
**Error Message:** "Add a size estimate label (size:xs/s/m/l/xl)"  
**Why:** Enables capacity planning and velocity tracking

### 4. Type Label
**Validation:** Issue has a `type:*` label  
**Error Message:** "Add a type label (type:feature/bug/chore/spike/docs)"  
**Why:** Categorizes work and helps with reporting

### 5. Not Blocked
**Validation:** Issue does NOT have `status:blocked` label  
**Error Message:** "Issue is blocked - resolve blockers before adding to sprint"  
**Why:** Blocked issues cannot be worked on

## Optional Criteria

These checks are recommended but don't block readiness:

### Priority Label
**Validation:** Issue has a `priority:*` label  
**Warning:** "Consider adding a priority label"  
**Why:** Helps with sprint planning and prioritization

## Automated Validation

The `dor-validation.yml` workflow automatically validates these criteria when:

1. **Issue labeled `status:ready`:**
   - Runs all required checks
   - If ALL pass: allows the label, sets Project Status = Ready
   - If ANY fail: removes `status:ready`, adds `status:needs-refinement`, comments with failures

2. **Issue added to Sprint iteration:**
   - Validates DoR before allowing sprint assignment
   - Warns if criteria are missing (but doesn't block - see "Validation Mode")

## Validation Results

### Success
When all required criteria pass:
- `status:ready` label is kept
- Project Status field is set to "Ready"
- No comment is added (silent success)

### Failure
When any required criterion fails:
- `status:ready` label is removed (if present)
- `status:needs-refinement` label is added
- A comment is posted with the checklist:

```markdown
⚠️ **Definition of Ready Check**

This issue needs refinement before it can be added to a sprint:

**Required:**
- [x] Description (52 characters ✓)
- [ ] Acceptance criteria - Add checklist items
- [x] Size estimate (size:m ✓)
- [x] Type label (type:feature ✓)
- [x] Not blocked ✓

**Optional:**
- [ ] Priority label - Consider adding one

Please address the missing items and re-apply `status:ready`.
```

## DoR vs DoD

| Aspect | Definition of Ready (DoR) | Definition of Done (DoD) |
|--------|---------------------------|--------------------------|
| **When** | Before sprint selection | Before issue completion |
| **Checks** | Planning clarity | Implementation quality |
| **Who validates** | Automated + Product Owner | Developer + Automation |
| **Failure** | Cannot enter sprint | Cannot close issue |

## Manual DoR Check

If you need to manually validate DoR:

```sh
# Check if issue is ready
gh issue view <number> --json body,labels

# Review criteria:
# 1. Body length >= 50?
# 2. Body contains "- [ ]"?
# 3. Has size:* label?
# 4. Has type:* label?
# 5. Does NOT have status:blocked?

# If all pass, add ready label
gh issue edit <number> --add-label "status:ready"
```

## Common DoR Failures

### "I added acceptance criteria but it still fails"
Ensure you use the checklist syntax:
```markdown
- [ ] This is a checklist item ✓

This is just a bullet point ✗
```

### "My description is long but validation fails"
The check counts body characters, not including markdown formatting. Ensure plain text content is sufficient.

### "The workflow didn't run"
Check that workflows are enabled in Settings → Actions → General. The `dor-validation.yml` must be in `.github/workflows/`.

## Updating DoR Criteria

To modify the DoR checklist, edit `automation/src/lib/dor.ts`:

```typescript
const DoR_CHECKS: DoRCheck[] = [
  // Add, remove, or modify checks here
  { 
    id: 'your-check', 
    check: (issue) => /* validation logic */, 
    message: 'Your error message',
    required: true 
  },
]
```

Then rebuild and redeploy the automation scripts.
