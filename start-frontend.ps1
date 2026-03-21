$ErrorActionPreference = "Stop"

$frontendDir = Join-Path $PSScriptRoot "frontend"

Set-Location $frontendDir
npm run dev
