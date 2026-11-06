$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 or later is required. Install it, close PowerShell, and run this file again."
}

$major = [int]((node --version).TrimStart("v").Split(".")[0])
if ($major -lt 22) {
    throw "Node.js 22 or later is required. Your installed version is $(node --version)."
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env. Add the deployed Cloudflare URL before testing live AI." -ForegroundColor Yellow
}

Write-Host "Starting the simulated SharePoint scorecard..." -ForegroundColor Green
Write-Host "Open http://localhost:5190" -ForegroundColor Cyan
node .\server.mjs
