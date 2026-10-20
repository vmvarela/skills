#!/usr/bin/env bash
# Read-only inbox summary for repositories checked out under projects/.
# shortcut: alert requests inspect at most 100 alerts per category; raise the page cap for a full severity breakdown.

set -euo pipefail

usage() {
  printf 'Usage: %s [-h|--help]\n' "${0##*/}"
  printf 'Summarize assigned issues, unlinked pull requests, open alerts and the AGENTS.md backlog for workspace checkouts.\n'
}

case "${1-}" in
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 2 ;;
esac

for command_name in git gh; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'error: %s is required\n' "$command_name" >&2
    exit 2
  }
done

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
workspace=$(CDPATH='' cd -- "$script_dir/../../../.." && pwd)
projects_dir=$workspace/projects
[ -d "$projects_dir" ] || { printf 'error: missing %s\n' "$projects_dir" >&2; exit 2; }

tmpdir=$(mktemp -d "${TMPDIR:-.}/workspace-inbox.XXXXXX") || exit 2
trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
repo_file=$tmpdir/repos
: >"$repo_file"

parse_repo() {
  local url path owner name
  url=${1%.git}
  case "$url" in
    *://*) path=${url#*://}; path=${path#*/} ;;
    *:*) path=${url##*:} ;;
    *) path=$url ;;
  esac
  path=${path#/}
  owner=${path%%/*}
  [ "$owner" != "$path" ] || return 1
  path=${path#*/}
  name=${path%%/*}
  [ -n "$owner" ] && [ -n "$name" ] || return 1
  case "$owner" in *[!a-zA-Z0-9._-]*) return 1 ;; esac
  case "$name" in *[!a-zA-Z0-9._-]*) return 1 ;; esac
  printf '%s/%s\n' "$owner" "$name"
}

printf '# Workspace inbox\n\n## Checkouts\n'
found=0
for checkout in "$projects_dir"/*/; do
  [ -d "$checkout" ] || continue
  remote=$(git -C "$checkout" remote get-url origin 2>/dev/null) || continue
  repo=$(parse_repo "$remote") || continue
  printf '%s\n' "$repo" >>"$repo_file"
  branch=$(git -C "$checkout" branch --show-current 2>/dev/null || true)
  [ -n "$branch" ] || branch='(detached)'
  if [ -n "$(git -C "$checkout" status --porcelain 2>/dev/null || true)" ]; then
    dirty='dirty'
  else
    dirty='clean'
  fi
  # shellcheck disable=SC2016
  printf -- '- `%s` — `%s` — %s — %s\n' "$repo" "${checkout%/}" "$branch" "$dirty"
  found=1
done

if [ "$found" -eq 0 ]; then
  printf '\nNo workspace checkouts with usable origin remotes.\n' >&2
  exit 1
fi
LC_ALL=C sort -u "$repo_file" -o "$repo_file"

printf '\n## GitHub identity\n'
if login=$(gh api user --jq .login 2>&1); then
  # shellcheck disable=SC2016
  printf 'Active account: `%s`\n' "$login"
else
  printf 'Unavailable: %s\n' "$(printf '%s\n' "$login" | tail -n 1 | tr '\t\n' '  ')"
  identity_failed=1
fi

# GitHub search treats multiple repo: qualifiers as a union; explicit OR (even
# parenthesized) treats qualifiers as text and silently returns zero results.
repo_terms=''
while IFS= read -r repo; do
  [ -n "$repo" ] || continue
  repo_terms="$repo_terms repo:$repo"
done <"$repo_file"

printf '\n## Assigned issues and unlinked pull requests\n'
issues_query="is:issue is:open assignee:@me${repo_terms}"
prs_query="is:pr is:open${repo_terms}"
# shellcheck disable=SC2016
graphql_query='query($issues: String!, $prs: String!) { assigned: search(type: ISSUE, first: 100, query: $issues) { issueCount nodes { ... on Issue { number title url updatedAt labels(first: 10) { nodes { name } } repository { nameWithOwner } } } } pullRequests: search(type: ISSUE, first: 100, query: $prs) { issueCount nodes { ... on PullRequest { number title url isDraft author { login } closingIssuesReferences(first: 5) { totalCount } repository { nameWithOwner } } } } }'
if result=$(gh api graphql -F query="$graphql_query" -F issues="$issues_query" -F prs="$prs_query" --jq '"Assigned open issues (\(.data.assigned.nodes|length) shown; \(.data.assigned.issueCount) total)", (.data.assigned.nodes[]? | "- [#\(.number)] \(.title) — \(.repository.nameWithOwner) — updated \(.updatedAt) — labels: \([.labels.nodes[].name] | join(", ")) — \(.url)"), "Unlinked open PRs (\([.data.pullRequests.nodes[]? | select(.closingIssuesReferences.totalCount == 0)] | length) found among \(.data.pullRequests.nodes|length) shown; \(.data.pullRequests.issueCount) total)", (.data.pullRequests.nodes[]? | select(.closingIssuesReferences.totalCount == 0) | "- [#\(.number)] \(.title) — \(.repository.nameWithOwner) — by @\(.author.login // "unknown")\(if .isDraft then " (draft)" else "" end) — \(.url)")' 2>&1); then
  printf '%s\n' "$result"
else
  error_line=$(printf '%s\n' "$result" | tail -n 1 | tr '\t\n' '  ')
  printf 'Issues and PRs unavailable: %s\n' "${error_line:-GitHub GraphQL request failed}"
  issues_failed=1
fi

alert_worker() {
  local repo=$1 kind=$2 endpoint output last
  case "$kind" in
    secret-scanning) endpoint=secret-scanning/alerts ;;
    dependabot) endpoint=dependabot/alerts ;;
    code-scanning) endpoint=code-scanning/alerts ;;
  esac
  if output=$(gh api "repos/$repo/$endpoint?state=open&per_page=100" --jq '[.[] | (.security_advisory.severity // .rule.security_severity_level // .rule.severity // "unknown")] | if length == 0 then "0 open" elif length == 100 then "100+ open; first-page severity: " + ([group_by(.)[] | "\(.[0]) \(length)"] | join(", ")) else "\(length) open; " + ([group_by(.)[] | "\(.[0]) \(length)"] | join(", ")) end' 2>&1); then
    printf '%s\t%s\t%s\n' "$repo" "$kind" "$output"
  else
    last=$(printf '%s\n' "$output" | tail -n 1 | tr '\t\n' '  ')
    printf '%s\t%s\tUNAVAILABLE: %s\n' "$repo" "$kind" "${last:-request failed}"
  fi
}
export -f alert_worker
export GH_NO_UPDATE_NOTIFIER=1 GH_PROMPT_DISABLED=1

printf '\n## Open security alerts\n'
while IFS= read -r repo; do
  [ -n "$repo" ] || continue
  for kind in secret-scanning dependabot code-scanning; do
    printf '%s\n' "$repo $kind"
  done
done <"$repo_file" | xargs -P 8 -n 2 bash -c 'alert_worker "$@"' _ >"$tmpdir/alerts"
alerts_failed=0
while IFS="$(printf '\t')" read -r repo kind result; do
  # shellcheck disable=SC2016
  printf -- '- `%s` %s: %s\n' "$repo" "$kind" "$result"
  case "$result" in UNAVAILABLE:*) alerts_failed=1 ;; esac
done < <(LC_ALL=C sort "$tmpdir/alerts")

printf '\n## Backlog\n'
# A backlog is read only when AGENTS.md declares one with a line: - Backlog: `path`
# shellcheck disable=SC2016
backlog=$(sed -n 's/^- Backlog: `\(.*\)`[[:space:]]*$/\1/p' "$workspace/AGENTS.md" 2>/dev/null | head -n 1) || true
if [ -z "$backlog" ]; then
  printf 'No backlog declared in AGENTS.md.\n'
elif [ -f "$workspace/$backlog" ]; then
  while IFS= read -r line || [ -n "$line" ]; do printf '%s\n' "$line"; done <"$workspace/$backlog"
else
  # shellcheck disable=SC2016
  printf 'Declared backlog unavailable: `%s` is missing.\n' "$backlog"
  backlog_failed=1
fi

if [ "${identity_failed:-0}" -ne 0 ] || [ "${issues_failed:-0}" -ne 0 ] || [ "$alerts_failed" -ne 0 ] || [ "${backlog_failed:-0}" -ne 0 ]; then
  exit 1
fi
