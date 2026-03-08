#!/usr/bin/env bash
set -euo pipefail

# e2o_screenshot.sh
# Capture a deterministic screenshot using OpenClaw's managed browser.
#
# Requirements:
# - openclaw gateway running on this machine
# - browser profile "openclaw" working (headless/noSandbox recommended on VPS)
#
# Usage:
#   scripts/e2o_screenshot.sh \
#     --url "https://earthtoorbit.space/" \
#     --out "docs/screenshots/pr-123/before-filters.png" \
#     --profile openclaw \
#     --full-page \
#     --wait-load networkidle

URL=""
OUT=""
PROFILE="openclaw"
FULL_PAGE=false
WAIT_LOAD="networkidle"
WAIT_MS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --full-page) FULL_PAGE=true; shift 1;;
    --wait-load) WAIT_LOAD="$2"; shift 2;;
    --wait-ms) WAIT_MS="$2"; shift 2;;
    -h|--help)
      sed -n '1,80p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$URL" || -z "$OUT" ]]; then
  echo "ERROR: --url and --out are required" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUT")"

# Start browser (no-op if already running)
openclaw browser --browser-profile "$PROFILE" start >/dev/null

# Open URL in a new tab, capture targetId
TARGET_ID=$(
  openclaw browser --browser-profile "$PROFILE" --json open "$URL" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["targetId"])'
)

# Wait for load state (best-effort)
openclaw browser --browser-profile "$PROFILE" wait --target-id "$TARGET_ID" --load "$WAIT_LOAD" >/dev/null || true

# Optional extra wait (for animations/data)
if [[ "$WAIT_MS" != "0" ]]; then
  openclaw browser --browser-profile "$PROFILE" wait --target-id "$TARGET_ID" --time "$WAIT_MS" >/dev/null
fi

# Screenshot
if [[ "$FULL_PAGE" == "true" ]]; then
  SRC=$(
    openclaw browser --browser-profile "$PROFILE" --json screenshot --full-page "$TARGET_ID" \
      | python3 -c 'import sys, json; print(json.load(sys.stdin)["path"])'
  )
else
  SRC=$(
    openclaw browser --browser-profile "$PROFILE" --json screenshot "$TARGET_ID" \
      | python3 -c 'import sys, json; print(json.load(sys.stdin)["path"])'
  )
fi

cp -f "$SRC" "$OUT"

# Print the repo-relative output path for easy copy/paste into PR bodies.
echo "$OUT"
