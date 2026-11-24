#!/usr/bin/env bash
set -euo pipefail
base=$1
report=$2

changed=$(git -c core.quotePath=false diff --name-only "$base" HEAD -- ':(glob)live/recordings/**/*.expected.json')
if [[ -n $changed ]]; then
  printf '## The merge changes expected files\n\nChris rules whether each is a fix or a regression.\n\n%s\n\n' \
    "$(sed 's/.*/- `&`/' <<<"$changed")" >>"$report"
  exit 1
fi
