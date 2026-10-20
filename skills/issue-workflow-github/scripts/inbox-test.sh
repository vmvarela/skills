#!/usr/bin/env bash
# Guard GitHub search syntax, read the AGENTS.md backlog, and keep failed reads incomplete.

set -euo pipefail

scripts=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
inbox=$scripts/inbox.sh

grep -F "repo_terms=\"\$repo_terms repo:\$repo\"" "$inbox" >/dev/null || {
  printf 'not ok: repository qualifiers must be space-separated\n' >&2
  exit 1
}

if grep -E 'repo_terms=.* OR |is:issue.*\(\$\{?repo_terms\}?\)|is:pr.*\(\$\{?repo_terms\}?\)' "$inbox" >/dev/null; then
  printf 'not ok: explicit OR or parenthesized repository qualifiers reintroduced\n' >&2
  exit 1
fi

# Fixture workspace: one checkout, a declared backlog, and a gh stub that always fails.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/inbox-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
ws=$tmp/ws
mkdir -p "$ws/.agents/skills/issue-workflow-github/scripts" "$ws/projects/demo" "$tmp/bin"
cp "$inbox" "$ws/.agents/skills/issue-workflow-github/scripts/inbox.sh"
git -C "$ws/projects/demo" init -q
git -C "$ws/projects/demo" remote add origin git@github.com:example/demo.git
printf -- '- Write the release notes\n' >"$ws/BACKLOG.md"
# shellcheck disable=SC2016
printf -- '- Backlog: `BACKLOG.md`\n' >"$ws/AGENTS.md"
printf '#!/usr/bin/env bash\necho "stub: offline" >&2\nexit 1\n' >"$tmp/bin/gh"
chmod +x "$tmp/bin/gh"

status=0
output=$(PATH="$tmp/bin:$PATH" bash "$ws/.agents/skills/issue-workflow-github/scripts/inbox.sh" 2>&1) || status=$?

[ "$status" -ne 0 ] || {
  printf 'not ok: failed GitHub reads must exit non-zero\n' >&2
  exit 1
}

for expected in 'Unavailable:' 'Issues and PRs unavailable:' 'Write the release notes'; do
  printf '%s\n' "$output" | grep -F "$expected" >/dev/null || {
    printf 'not ok: output missing %s\n' "$expected" >&2
    exit 1
  }
done

printf 'ok: inbox guards pass; failed reads are incomplete and the AGENTS.md backlog is read\n'
