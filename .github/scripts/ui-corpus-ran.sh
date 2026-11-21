#!/usr/bin/env bash
# Files the UI corpus's failure when its last scheduled run is missing or older than MAX_AGE_HOURS (#324): a workflow that
# never started cannot report itself, so the nightly seam checks on it. The seam's schedule is about an hour before the
# corpus's, so the run it sees is about a day old.
# Usage: ui-corpus-ran.sh <run-url>
set -euo pipefail
MAX_AGE_HOURS=36
scripts=$(dirname "$0")
latest=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow ui-corpus.yml --event schedule --limit 1 --json createdAt --jq '.[0].createdAt // empty')
if [[ -n $latest ]] && (( $(date +%s) - $(date -d "$latest" +%s) < MAX_AGE_HOURS * 3600 )); then
  exit 0
fi
bash "$scripts/ui-corpus-issue.sh" /dev/null not-run "$1"
