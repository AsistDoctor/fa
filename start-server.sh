#!/usr/bin/env bash
cd "$(dirname "$0")/fa-main" || exit 1
echo "Starting server at http://localhost:3000"
echo "Press Ctrl+C to stop."
if command -v python3 &>/dev/null; then
  python3 -m http.server 3000
else
  python -m http.server 3000
fi
