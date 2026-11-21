#!/usr/bin/env bash
# Files the UI corpus's failure when its last scheduled run is missing or older than 36 hours (#324): a workflow that never
# started cannot report itself, so the nightly seam checks on it. Its own run is hours behind the corpus's, so a healthy
# corpus run is under 36 hours old.
# Usage: ui-corpus-ran.sh <run-url>
set -euo pipefail
scripts=$(dirname "$0")
latest=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow ui-corpus.yml --event schedule --limit 1 --json createdAt --jq '.[0].createdAt // empty')
if [[ -n $latest ]] && (( $(date +%s) - $(date -d "$latest" +%s) < 36 * 3600 )); then
  exit 0
fi
body=$(mktemp)
{
  echo 'The nightly UI corpus did not run: its last scheduled run is '"${latest:+at $latest, over 36 hours ago}${latest:-missing}"'.'
  echo
  echo "Checked by: $1"
} >"$body"
bash "$scripts/file-issue-once.sh" 'UI corpus failed' "$body"
