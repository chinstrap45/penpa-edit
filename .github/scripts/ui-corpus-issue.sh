#!/usr/bin/env bash
# `result` is the corpus run's outcome, or `not-run` when no scheduled run started in time.
set -euo pipefail
scripts=$(dirname "$0")
title='UI corpus failed'
log=$1 result=$2 url=$3
body=$(mktemp)

compared=0
ids=
if [[ -f $log ]]; then
  # Alternation, not a bracket: a multibyte character in a bracket expression matches nothing under LC_ALL=C.
  # Nested lines are the per-recording results; the top-level "failing tests:" block repeats the failures.
  compared=$(grep -cE '^\s+(✔|✖) replays ' "$log" || true)
  ids=$(sed -nE 's/^\s*✖ replays (\S+) through .*/\1/p' "$log" | sort -u)
fi

if [[ $result == success && $compared -gt 0 ]]; then
  {
    echo "The nightly UI corpus is green again: $compared comparisons, none failing."
    echo
    echo "Run: $url"
  } >"$body"
  bash "$scripts/file-issue-once.sh" "$title" "$body" --comment-only
  exit 0
fi

{
  if [[ $result == not-run ]]; then
    echo 'The nightly UI corpus did not run on schedule.'
  elif [[ ! -f $log ]]; then
    echo "The nightly UI corpus's log is missing (result: $result), so what it compared is unknown."
  elif [[ $result == success ]]; then
    echo 'The nightly UI corpus succeeded but compared no recording, so it checked nothing.'
  elif [[ $result == failure ]]; then
    echo 'The nightly UI corpus (every recording on the UI driver) failed on master.'
  else
    echo "The nightly UI corpus did not finish: its result was $result."
  fi
  echo
  echo '## Failing recordings'
  echo
  if [[ -n $ids ]]; then
    while read -r id; do echo "- \`$id\`"; done <<<"$ids"
  else
    echo '- No recording is named in the log; read the run.'
  fi
  echo
  echo "Run: $url"
} >"$body"
bash "$scripts/file-issue-once.sh" "$title" "$body"
