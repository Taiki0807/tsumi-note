#!/usr/bin/env bash

set -euo pipefail

NODE_ID="${1:-}"

if [ -z "$NODE_ID" ]; then
  echo "Usage: ./scripts/fetch-figma.sh <node-id>" >&2
  exit 1
fi

if [ -z "${FIGMA_ACCESS_TOKEN:-}" ]; then
  echo "FIGMA_ACCESS_TOKEN is not set." >&2
  exit 1
fi

FIGMA_FILE_KEY="2YR8QWeewgVF9tIM9yfLu7"

curl \
  --fail \
  --silent \
  --show-error \
  --get \
  -H "X-Figma-Token: ${FIGMA_ACCESS_TOKEN}" \
  --data-urlencode "ids=${NODE_ID}" \
  "https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/nodes"
