#!/bin/bash
# Start the DataCrawl backend server
cd "$(dirname "$0")"
export PYTHONPATH="backend:."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
