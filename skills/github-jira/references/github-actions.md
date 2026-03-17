# GitHub Actions: Templates

Two Actions to synchronize GitHub with JIRA. Copy to `.github/workflows/` in
each repository you want to integrate.

**Required secrets** (configure in Settings → Secrets and variables → Actions):

```
JIRA_CLIENT_ID         → Key ID of the Application Link (JIRA Settings → Applications → Application links)
JIRA_CLIENT_SECRET     → Key Secret of the Application Link
JIRA_CLOUD_ID          → Atlassian Cloud instance ID (see below for how to obtain it)
```

**Optional repository variable** (not secret):

```
JIRA_PROJECT           → <PROJECT_KEY>  (used by jira-release-sync.yml)
```

### How to obtain `JIRA_CLOUD_ID`

The `cloudId` identifies your Atlassian Cloud instance. Obtain it once:

```sh
# 1. Get an access_token using client_credentials
TOKEN=$(curl -s -X POST https://auth.atlassian.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"<JIRA_CLIENT_ID>","client_secret":"<JIRA_CLIENT_SECRET>"}' \
  | jq -r '.access_token')

# 2. List accessible resources → the "id" field is the cloudId
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.atlassian.com/oauth/token/accessible-resources | jq '.[].id'
```

### How authentication works (OAuth 2.0 — 2LO)

The service account uses **Client Credentials (2LO)**: no manual consent or
`refresh_token` needed. Each run obtains a fresh `access_token`:

```sh
curl -s -X POST https://auth.atlassian.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"...","client_secret":"..."}'
```

The token lasts **1 hour**. API URLs use `api.atlassian.com` (not your instance domain):

```
https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
```

### Required Application Link scopes

The Application Link (OAuth 2.0) must have:
- `read:jira-work` — read tickets and projects
- `write:jira-work` — update fixVersions and create versions

---

## 1. `jira-label-pr.yml`

When a PR is opened or updated, applies `priority:*` and `size:*` labels if the
branch contains a JIRA key and the ticket belongs to the configured component.

**The `type:*` label is managed by `labeler.yml`** (from branch name, without
consulting JIRA). If there is no JIRA key in the branch, this Action does nothing.

**Customize per repo:** edit the variable at the top of the job:

```yaml
JIRA_COMPONENT: "<COMPONENT>"   # exact Component name in JIRA (or "" to skip filtering)
JIRA_SP_FIELD: "customfield_10032"  # Story Points custom field ID for your instance
```

> To find your Story Points field ID: `curl -s -H "Authorization: Basic $JIRA_AUTH" "$JIRA_BASE_URL/rest/api/3/field" | jq '.[] | select(.name | test("story|point|sp"; "i")) | "\(.id): \(.name)"'`

**Labels generated:**
- `priority:critical` / `priority:high` / `priority:medium` / `priority:low` — from ticket `priority` field
- `size:xs` / `size:s` / `size:m` / `size:l` / `size:xl` — from `story_points` (Fibonacci: 1→xs, 2→s, 3→m, 5-8→l, 13+→xl)

```yaml
# .github/workflows/jira-label-pr.yml
# Applies priority:* and size:* labels from JIRA when the branch contains
# a ticket key (e.g. feature/<PROJECT_KEY>-123-...).
# The type:* label is managed by .github/labeler.yml (from branch name).
name: Label PR from JIRA

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write

env:
  # ── Customize per repo ────────────────────────────────────────────────────
  JIRA_COMPONENT: "<COMPONENT>"      # Component in JIRA (exact name). Leave empty to skip filtering.
  JIRA_SP_FIELD:  "customfield_10032" # Story Points field ID for your JIRA instance
  # ──────────────────────────────────────────────────────────────────────────

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Extract JIRA key from branch name
        id: jira-key
        run: |
          BRANCH="${{ github.head_ref }}"
          # Extracts the first ALL_CAPS-NNN pattern (e.g. ABC-123).
          # Note: if your project key contains numbers or shares a pattern with other tools
          # (e.g. CI-99, AWS-123), consider restricting the regex to your specific project key:
          #   grep -oE '<PROJECT_KEY>-[0-9]+' | head -1
          KEY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
          if [ -z "$KEY" ]; then
            echo "No JIRA key found in branch '$BRANCH', skipping JIRA labels."
            echo "found=false" >> "$GITHUB_OUTPUT"
          else
            echo "Found JIRA key: $KEY"
            echo "key=$KEY"   >> "$GITHUB_OUTPUT"
            echo "found=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Get JIRA access token
        id: jira-auth
        if: steps.jira-key.outputs.found == 'true'
        env:
          JIRA_CLIENT_ID:     ${{ secrets.JIRA_CLIENT_ID }}
          JIRA_CLIENT_SECRET: ${{ secrets.JIRA_CLIENT_SECRET }}
        run: |
          TOKEN_RESPONSE=$(curl -s -X POST https://auth.atlassian.com/oauth/token \
            -H "Content-Type: application/json" \
            -d "{\"grant_type\": \"client_credentials\", \"client_id\": \"${JIRA_CLIENT_ID}\", \"client_secret\": \"${JIRA_CLIENT_SECRET}\"}")

          ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

          if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
            echo "Error obtaining JIRA access_token: $TOKEN_RESPONSE"
            exit 1
          fi

          echo "access_token=$ACCESS_TOKEN" >> "$GITHUB_OUTPUT"
          echo "JIRA access token obtained successfully."

      - name: Fetch JIRA issue fields
        id: jira
        if: steps.jira-key.outputs.found == 'true'
        env:
          JIRA_CLOUD_ID: ${{ secrets.JIRA_CLOUD_ID }}
        run: |
          KEY="${{ steps.jira-key.outputs.key }}"
          ACCESS_TOKEN="${{ steps.jira-auth.outputs.access_token }}"
          SP_FIELD="${{ env.JIRA_SP_FIELD }}"

          RESPONSE=$(curl -s -f \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -H "Content-Type: application/json" \
            "https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3/issue/${KEY}?fields=priority,components,${SP_FIELD}")

          if [ $? -ne 0 ]; then
            echo "Could not fetch JIRA issue ${KEY}, skipping JIRA labels."
            echo "found=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          PRIORITY=$(echo "$RESPONSE" | jq -r '.fields.priority.name // "Medium"')
          SP=$(echo "$RESPONSE" | jq -r --arg f "$SP_FIELD" '.fields[$f] // empty | floor | tostring')
          COMPONENTS=$(echo "$RESPONSE" | jq -r '[.fields.components[].name] | join(",")')

          echo "priority=$PRIORITY"     >> "$GITHUB_OUTPUT"
          echo "story_points=$SP"       >> "$GITHUB_OUTPUT"
          echo "components=$COMPONENTS" >> "$GITHUB_OUTPUT"

          echo "Issue: $KEY | Priority: $PRIORITY | SP: $SP | Components: $COMPONENTS"

          # Validate component: if JIRA_COMPONENT is set, the ticket must belong to it
          if [ -n "$JIRA_COMPONENT" ]; then
            if echo "$COMPONENTS" | grep -qiF "$JIRA_COMPONENT"; then
              echo "Component match: ticket belongs to '$JIRA_COMPONENT'"
              echo "found=true" >> "$GITHUB_OUTPUT"
            else
              echo "Component mismatch: ticket components='$COMPONENTS', expected='$JIRA_COMPONENT'. Skipping JIRA labels."
              echo "found=false" >> "$GITHUB_OUTPUT"
            fi
          else
            echo "No component filter configured, accepting ticket."
            echo "found=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Compute labels from JIRA
        id: labels-jira
        if: steps.jira.outputs.found == 'true'
        run: |
          PRIORITY="${{ steps.jira.outputs.priority }}"
          SP="${{ steps.jira.outputs.story_points }}"

          # Map priority → priority label
          case "$PRIORITY" in
            Highest|Critical) PRIORITY_LABEL="priority:critical" ;;
            High)             PRIORITY_LABEL="priority:high"     ;;
            Low|Lowest)       PRIORITY_LABEL="priority:low"      ;;
            *)                PRIORITY_LABEL="priority:medium"   ;;
          esac

          # Map story points → size label (Fibonacci: 1→xs, 2→s, 3→m, 5-8→l, 13+→xl)
          SIZE_LABEL=""
          if [ -n "$SP" ] && [ "$SP" != "null" ]; then
            if   [ "$SP" -le 1 ]; then SIZE_LABEL="size:xs"
            elif [ "$SP" -le 2 ]; then SIZE_LABEL="size:s"
            elif [ "$SP" -le 3 ]; then SIZE_LABEL="size:m"
            elif [ "$SP" -le 8 ]; then SIZE_LABEL="size:l"
            else                        SIZE_LABEL="size:xl"
            fi
          fi

          # Write as multiline output
          {
            echo "labels<<EOF"
            echo "$PRIORITY_LABEL"
            [ -n "$SIZE_LABEL" ] && echo "$SIZE_LABEL"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"
          echo "Applying labels (from JIRA): $PRIORITY_LABEL${SIZE_LABEL:+,$SIZE_LABEL}"

      - name: Apply labels to PR
        if: steps.jira.outputs.found == 'true'
        uses: actions-ecosystem/action-add-labels@v1
        with:
          labels: ${{ steps.labels-jira.outputs.labels }}
```

### Create GitHub labels (once per repo)

Before the Actions can apply labels, they must exist in the repository:

```sh
# Type (managed by labeler.yml — not by jira-label-pr.yml)
gh label create "type:feature"  --color "1D76DB" --description "New functionality (feature/ branch)"
gh label create "type:bug"      --color "D73A4A" --description "Defect (bugfix/ or hotfix/ branch)"
gh label create "type:chore"    --color "0E8A16" --description "Maintenance, refactoring (chore/ branch)"
gh label create "type:spike"    --color "D4C5F9" --description "Research (spike/ branch)"
gh label create "type:docs"     --color "0075CA" --description "Documentation only (docs/ branch)"

# Priority (managed by jira-label-pr.yml)
gh label create "priority:critical" --color "B60205" --description "Blocks everything"
gh label create "priority:high"     --color "D93F0B" --description "Next sprint"
gh label create "priority:medium"   --color "FBCA04" --description "Important"
gh label create "priority:low"      --color "C2E0C6" --description "Nice to have"

# Size / Story Points (managed by jira-label-pr.yml)
gh label create "size:xs" --color "EDEDED" --description "1 point — trivial (< 1 hour)"
gh label create "size:s"  --color "D4C5F9" --description "2 points — small (1-4 hours)"
gh label create "size:m"  --color "BFD4F2" --description "3 points — medium (4-8 hours)"
gh label create "size:l"  --color "FBCA04" --description "5-8 points — large (1-2 days)"
gh label create "size:xl" --color "D93F0B" --description "13+ points — extra large (split it)"
```

---

## 2. `jira-release-sync.yml`

When a GitHub Release is published, syncs with JIRA:

1. Creates a Version in JIRA with the release name (e.g. `v1.2.0`)
2. Extracts all JIRA keys from the release body/changelog
3. Updates `fixVersions` on each found ticket
4. Marks the Version as "Released" in JIRA

```yaml
# .github/workflows/jira-release-sync.yml
name: Sync GitHub Release to JIRA

on:
  release:
    types: [published]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Extract release info
        id: release
        run: |
          VERSION="${{ github.event.release.tag_name }}"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "Release version: $VERSION"

      - name: Get JIRA access token
        id: jira-auth
        env:
          JIRA_CLIENT_ID:     ${{ secrets.JIRA_CLIENT_ID }}
          JIRA_CLIENT_SECRET: ${{ secrets.JIRA_CLIENT_SECRET }}
        run: |
          TOKEN_RESPONSE=$(curl -s -X POST https://auth.atlassian.com/oauth/token \
            -H "Content-Type: application/json" \
            -d "{\"grant_type\": \"client_credentials\", \"client_id\": \"${JIRA_CLIENT_ID}\", \"client_secret\": \"${JIRA_CLIENT_SECRET}\"}")

          ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

          if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
            echo "Error obtaining JIRA access_token: $TOKEN_RESPONSE"
            exit 1
          fi

          echo "access_token=$ACCESS_TOKEN" >> "$GITHUB_OUTPUT"
          echo "JIRA access token obtained successfully."

      - name: Create JIRA version
        id: jira-version
        env:
          JIRA_CLOUD_ID: ${{ secrets.JIRA_CLOUD_ID }}
        run: |
          VERSION="${{ steps.release.outputs.version }}"
          ACCESS_TOKEN="${{ steps.jira-auth.outputs.access_token }}"
          PROJECT="${{ vars.JIRA_PROJECT }}"

          if [ -z "$PROJECT" ]; then
            echo "JIRA_PROJECT variable not set. Set it in Settings → Variables → Actions."
            exit 1
          fi

          # Try to create the version (it may already exist)
          RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -H "Content-Type: application/json" \
            "https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3/version" \
            -d "{
              \"name\": \"${VERSION}\",
              \"project\": \"${PROJECT}\",
              \"released\": false,
              \"description\": \"Release generated from GitHub: ${{ github.event.release.html_url }}\"
            }")

          HTTP_CODE=$(echo "$RESPONSE" | tail -1)
          BODY=$(echo "$RESPONSE" | head -1)

          if [ "$HTTP_CODE" = "201" ]; then
            VERSION_ID=$(echo "$BODY" | jq -r '.id')
            echo "Created JIRA version: ${VERSION} (id: ${VERSION_ID})"
          elif [ "$HTTP_CODE" = "409" ]; then
            # Version already exists, look up its ID
            echo "Version ${VERSION} already exists, looking up ID..."
            VERSION_ID=$(curl -s \
              -H "Authorization: Bearer ${ACCESS_TOKEN}" \
              "https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3/project/${PROJECT}/versions" \
              | jq -r --arg v "$VERSION" '.[] | select(.name == $v) | .id')
            echo "Found existing version ID: ${VERSION_ID}"
          else
            echo "Error creating version (HTTP $HTTP_CODE): $BODY"
            exit 1
          fi

          echo "version_id=$VERSION_ID" >> "$GITHUB_OUTPUT"

      - name: Extract JIRA keys from release body
        id: jira-keys
        run: |
          BODY="${{ github.event.release.body }}"
          # Extracts all unique ALL_CAPS-NNN patterns from the changelog.
          # Restrict to your project key if needed: grep -oE '<PROJECT_KEY>-[0-9]+'
          KEYS=$(echo "$BODY" | grep -oE '[A-Z]+-[0-9]+' | sort -u | tr '\n' ' ')
          echo "Found JIRA keys: $KEYS"
          echo "keys=$KEYS" >> "$GITHUB_OUTPUT"

      - name: Update fixVersions on JIRA tickets
        if: steps.jira-keys.outputs.keys != ''
        env:
          JIRA_CLOUD_ID: ${{ secrets.JIRA_CLOUD_ID }}
        run: |
          VERSION="${{ steps.release.outputs.version }}"
          ACCESS_TOKEN="${{ steps.jira-auth.outputs.access_token }}"
          KEYS="${{ steps.jira-keys.outputs.keys }}"

          for KEY in $KEYS; do
            echo "Updating fixVersion on ${KEY}..."
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
              -H "Authorization: Bearer ${ACCESS_TOKEN}" \
              -H "Content-Type: application/json" \
              "https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3/issue/${KEY}" \
              -d "{\"update\": {\"fixVersions\": [{\"add\": {\"name\": \"${VERSION}\"}}]}}")

            if [ "$HTTP_CODE" = "204" ]; then
              echo "  ✓ ${KEY} updated"
            else
              echo "  ✗ ${KEY} failed (HTTP $HTTP_CODE) — skipping"
            fi
          done

      - name: Mark JIRA version as released
        env:
          JIRA_CLOUD_ID: ${{ secrets.JIRA_CLOUD_ID }}
        run: |
          VERSION_ID="${{ steps.jira-version.outputs.version_id }}"
          ACCESS_TOKEN="${{ steps.jira-auth.outputs.access_token }}"
          RELEASE_DATE=$(date +%Y-%m-%d)

          curl -s -X PUT \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            -H "Content-Type: application/json" \
            "https://api.atlassian.com/ex/jira/${JIRA_CLOUD_ID}/rest/api/3/version/${VERSION_ID}" \
            -d "{
              \"released\": true,
              \"releaseDate\": \"${RELEASE_DATE}\"
            }"

          echo "JIRA version ${VERSION_ID} marked as released on ${RELEASE_DATE}"

      - name: Summary
        run: |
          echo "### JIRA Release Sync" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "- **GitHub Release:** ${{ github.event.release.tag_name }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- **JIRA Version:** created and marked as Released" >> "$GITHUB_STEP_SUMMARY"
          echo "- **Tickets updated:** ${{ steps.jira-keys.outputs.keys }}" >> "$GITHUB_STEP_SUMMARY"
```

---

## Implementation notes

### `release-drafter` as source of JIRA keys

For `jira-release-sync.yml` to find JIRA keys in the changelog, PR titles must
include them. The recommended formats (all detected by the `[A-Z]+-[0-9]+` regex):

```
[<PROJECT_KEY>-123] Description of the change
feat(<PROJECT_KEY>-123): description of the change
fix: description (<PROJECT_KEY>-123)
```

### Compatibility with `release-drafter`

These two Actions are compatible with the `github-scrum` skill. If you already
have `release-drafter.yml` in the repo, all three coexist without conflicts:

- `release-drafter.yml` → maintains the release draft with the changelog
- `jira-label-pr.yml` → labels on PRs (improves changelog grouping)
- `jira-release-sync.yml` → syncs when the release is published
