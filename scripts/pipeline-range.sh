#!/usr/bin/env bash
# Fetch + translate manual pages in batches.
# Usage: scripts/pipeline-range.sh 11 769 [batch_size]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FROM_PAGE="${1:?from}"
TO_PAGE="${2:?to}"
BATCH_SIZE="${3:-20}"

pad() { printf "%03d" "$1"; }

cur="$FROM_PAGE"
while [ "$cur" -le "$TO_PAGE" ]; do
  end=$((cur + BATCH_SIZE - 1))
  if [ "$end" -gt "$TO_PAGE" ]; then
    end="$TO_PAGE"
  fi
  echo "======== Batch ${cur}-${end} ========"
  node scripts/fetch-batch.mjs --from "$cur" --to "$end"
  raw="data/raw/$(pad "$cur")-$(pad "$end").json"
  python3 scripts/translate-batch.py --raw "$raw"
  cur=$((end + 1))
done

echo "Done ${FROM_PAGE}-${TO_PAGE}"
