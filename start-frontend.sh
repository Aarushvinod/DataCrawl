#!/usr/bin/env bash

set -euo pipefail

frontend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/frontend" && pwd)"

cd "$frontend_dir"

if [[ ! -x "node_modules/.bin/vite" ]]; then
  echo "Frontend dependencies are not installed in '$frontend_dir'. Run 'npm install' in frontend first." >&2
  exit 1
fi

npm run dev
