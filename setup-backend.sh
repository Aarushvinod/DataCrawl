#!/usr/bin/env bash

set -euo pipefail

get_preferred_python() {
  local candidates=(
    "python3.11"
    "python3.12"
    "python3.10"
    "python3"
    "python"
  )
  local candidate

  for candidate in "${candidates[@]}"; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done

  echo "Could not find a usable Python installation. Install Python 3.11+ or update setup-backend.sh with your interpreter path." >&2
  return 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$repo_root/backend"
venv_dir="$backend_dir/.venv"
venv_python="$venv_dir/bin/python"
base_python="$(get_preferred_python)"

cd "$repo_root"

if [[ ! -x "$venv_python" ]]; then
  "$base_python" -m venv "$venv_dir"
fi

"$venv_python" -m pip install --upgrade pip
"$venv_python" -m pip install -r "$backend_dir/requirements.txt"
"$venv_python" -m pip uninstall -y langchain-google-genai google-generativeai
