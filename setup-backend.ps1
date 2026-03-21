$ErrorActionPreference = "Stop"

function Get-PreferredPython {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python311\\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python312\\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\\Python\\Python310\\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand -and $pythonCommand.Source -notmatch "\\\\.pyenv\\\\") {
        return $pythonCommand.Source
    }

    throw "Could not find a usable Python installation. Install Python 3.11+ or update setup-backend.ps1 with your interpreter path."
}

$repoRoot = $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$venvDir = Join-Path $backendDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\\python.exe"
$basePython = Get-PreferredPython

Set-Location $repoRoot

if (-not (Test-Path $venvPython)) {
    & $basePython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create the backend virtual environment."
    }
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip in backend\\.venv."
}

& $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install backend requirements."
}

& $venvPython -m pip uninstall -y langchain-google-genai google-generativeai
if ($LASTEXITCODE -ne 0) {
    throw "Failed to remove deprecated Gemini packages from backend\\.venv."
}
