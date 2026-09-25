#!/usr/bin/env bash
# scripts/dispatch-stdio.sh — minimal wave dispatcher (reconstructed 2026-09-25).
# Runs one builder worker (hermes chat -Q) under a perl alarm, enforces the
# typed-trailer arm gate, retries once, appends a receipt to runs.jsonl.
# Usage: dispatch-stdio.sh <task_id> <brief.md> [timeout_secs]
set -u
TASK_ID=$1; BRIEF=$2; TMO=${3:-850}
REPO=${ORCH_REPO_DIR:-$(pwd)}
ATTEMPTS=0; STATUS=failed; SUMMARY=""

while [ $ATTEMPTS -lt 2 ]; do
  ATTEMPTS=$((ATTEMPTS+1))
  OUT=$(perl -e 'alarm shift @ARGV; exec @ARGV' "$TMO" \
    hermes chat -m deepseek-ai/DeepSeek-V4-Flash-0731 --provider hyper-deepseek \
    -q "$(cat "$BRIEF")" 2>&1)
  EXIT=$?
  if [ $EXIT -eq 0 ] && printf '%s' "$OUT" | grep -q 'ARM: DONE'; then
    STATUS=succeeded
    SUMMARY=$(printf '%s' "$OUT" | grep -o 'SUMMARY:.*' | tail -1 | cut -c1-200)
    break
  fi
  printf '%s' "$OUT" | tail -20 > "$REPO/.dispatch_last_error.txt"
done

python3 - "$REPO/runs.jsonl" "$TASK_ID" "$STATUS" "$ATTEMPTS" "$SUMMARY" <<'EOF'
import json, sys, datetime
path, task_id, status, attempts, summary = sys.argv[1:6]
rec = {"task_id": task_id, "transport": "stdio", "status": status,
       "attempts": int(attempts), "error": None, "summary": summary,
       "receipts": [], "ts": datetime.datetime.now().astimezone().isoformat(timespec='seconds')}
with open(path, 'a') as f:
    f.write(json.dumps(rec) + "\n")
EOF
echo "dispatch: $TASK_ID -> $STATUS (attempts=$ATTEMPTS)"
[ "$STATUS" = succeeded ]
