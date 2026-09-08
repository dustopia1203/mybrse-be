#!/bin/sh
set -eu

if ! command -v trivy >/dev/null 2>&1; then
  echo 'Trivy is required. Install it with brew install trivy or see CONTRIBUTING.md.' >&2
  exit 1
fi

exec trivy fs \
  --scanners vuln,misconfig \
  --include-dev-deps \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --skip-dirs node_modules \
  --skip-dirs .git \
  --skip-dirs .aws-sam \
  --skip-dirs .agents \
  --skip-dirs .worktrees \
  --skip-dirs coverage \
  --skip-dirs dist \
  --skip-dirs docs \
  .
