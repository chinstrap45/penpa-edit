#!/usr/bin/env bash
# A failed list stops the script: filing blind could duplicate.
set -euo pipefail
title=$1
body=$(cat "$2")
open=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --search "\"${title//\"/}\" in:title" --limit 100 --json number,title --jq '.[] | "\(.number)\t\(.title)"')
number=$(awk -F '\t' -v title="$title" '$2 == title { print $1; exit }' <<<"$open")
if [[ -n $number ]]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"
elif [[ ${3:-} != --comment-only ]]; then
  gh issue create --repo "$GITHUB_REPOSITORY" --label bug,needs-info --title "$title" --body "$body"
fi
