$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$venvDir = Join-Path $backendDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\\python.exe"
$pathSeparator = [System.IO.Path]::PathSeparator

if (-not (Test-Path $venvPython)) {
    throw "Backend virtual environment not found at '$venvDir'. Run .\\setup-backend.ps1 first."
}

& $venvPython -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Backend dependencies are not installed in '$venvDir'. Run .\\setup-backend.ps1 first."
}

Set-Location $repoRoot

# Make the backend package importable for uvicorn on Windows.
if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
    $env:PYTHONPATH = "$backendDir$pathSeparator$repoRoot"
} else {
    $env:PYTHONPATH = "$backendDir$pathSeparator$repoRoot$pathSeparator$env:PYTHONPATH"
}

& $venvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
