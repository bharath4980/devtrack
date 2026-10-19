#!/usr/bin/env bash
# Read-only HTTP readiness probe for the public Spring Boot Actuator endpoint.
# Exit 0 only for a successful HTTP response with JSON status "UP".
set -euo pipefail

url="${1:-http://127.0.0.1:8080/api/health}"
attempts="${HEALTH_ATTEMPTS:-1}"
delay="${HEALTH_DELAY_SECONDS:-2}"

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ && "$delay" =~ ^[0-9]+$ ]]; then
  echo "HEALTH_ATTEMPTS must be positive and HEALTH_DELAY_SECONDS non-negative." >&2
  exit 2
fi

for ((attempt = 1; attempt <= attempts; attempt++)); do
  if response="$(curl --fail --silent --show-error --max-time 5 --connect-timeout 3 \
      -H 'Accept: application/json' "$url" 2>/dev/null)"; then
    if printf '%s' "$response" | python3 -c '
import json
import sys
try:
    result = json.load(sys.stdin)
except (ValueError, UnicodeError):
    sys.exit(1)
sys.exit(0 if isinstance(result, dict) and result.get("status") == "UP" else 1)
'; then
      echo "Health verified: HTTP success and JSON status UP (attempt $attempt)."
      exit 0
    fi
  fi
  if ((attempt < attempts)); then
    sleep "$delay"
  fi
done

echo "Health verification did not return HTTP success with JSON status UP after $attempts attempt(s)." >&2
exit 1
