#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$repo_root/backend"
venv_dir="$backend_dir/.venv"
venv_python="$venv_dir/bin/python"

if [[ ! -x "$venv_python" ]]; then
  echo "Backend virtual environment not found at '$venv_dir'. Run ./setup-backend.sh first." >&2
  exit 1
fi

if ! "$venv_python" -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)"; then
  echo "Backend dependencies are not installed in '$venv_dir'. Run ./setup-backend.sh first." >&2
  exit 1
fi

cd "$repo_root"

if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="$backend_dir:$repo_root:$PYTHONPATH"
else
  export PYTHONPATH="$backend_dir:$repo_root"
fi

"$venv_python" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
