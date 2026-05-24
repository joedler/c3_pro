param(
  [switch]$PushOnly,
  [switch]$GitOnly
)

$ErrorActionPreference = "Stop"
$GAS_DIR = Join-Path $PSScriptRoot "src\gas"

function Push-ToGAS {
  Write-Host "[1/2] Pushing to Google Apps Script..." -ForegroundColor Cyan
  Push-Location $PSScriptRoot
  try {
    Copy-Item -Path (Join-Path $PSScriptRoot "src\web\index.html") -Destination (Join-Path $GAS_DIR "index.html") -Force
    Write-Host "[OK] Synced src\web\index.html to GAS HtmlService index.html" -ForegroundColor Green

    $oldErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    npx clasp push --force
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[ERROR] clasp push failed" -ForegroundColor Red
      exit 1
    }
    
    Write-Host "Redeploying Web App to latest version..." -ForegroundColor Cyan
    npx clasp deploy -i AKfycbw5qd3RILHE1zkWfFLJfcDL-Mitfx2UcHj9cyzETaISKgwONltAcm1SL36Z_EK3lFAp -d "GymOS Auto Deploy"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[ERROR] clasp deploy failed" -ForegroundColor Red
      exit 1
    }

    $ErrorActionPreference = $oldErrorPreference
    Write-Host "[OK] GAS push and redeployment complete!" -ForegroundColor Green
  } finally {
    Pop-Location
  }
}

function Push-ToGitHub {
  Write-Host "[2/2] Committing and pushing to GitHub..." -ForegroundColor Cyan
  Push-Location $PSScriptRoot
  try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git add .gitignore .clasp.json package.json package-lock.json tsconfig.json deploy.ps1 src docs img
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[OK] No Git changes to commit" -ForegroundColor Green
      return
    }
    git commit -m "deploy: $timestamp"
    git push
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[WARN] git push failed or no changes" -ForegroundColor Yellow
    } else {
      Write-Host "[OK] GitHub push complete" -ForegroundColor Green
    }
  } finally {
    Pop-Location
  }
}

if ($PushOnly) {
  Push-ToGAS
} elseif ($GitOnly) {
  Push-ToGitHub
} else {
  Push-ToGAS
  Push-ToGitHub
}

Write-Host ""
Write-Host "[DONE] Deploy complete" -ForegroundColor Green
