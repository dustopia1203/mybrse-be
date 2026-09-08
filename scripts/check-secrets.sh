#!/bin/sh
set -eu

if ! command -v gitleaks >/dev/null 2>&1; then
  echo 'Gitleaks is required. Install it with brew install gitleaks or see CONTRIBUTING.md.' >&2
  exit 1
fi

exec gitleaks git --staged --redact --no-banner
