$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:GROQ_API_KEY = [Environment]::GetEnvironmentVariable('GROQ_API_KEY', 'User')
$env:GEMINI_API_KEY = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
$env:SUPABASE_URL = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')
$env:SUPABASE_ANON_KEY = [Environment]::GetEnvironmentVariable('SUPABASE_ANON_KEY', 'User')
$env:SUPABASE_SERVICE_ROLE_KEY = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')
$env:JARVIS_OWNER_EMAIL = 'sirajsayed7@gmail.com'
if (-not $env:GROQ_API_KEY) { throw 'GROQ_API_KEY is not configured in your Windows user environment.' }
Set-Location $project
$expectedVersion = (Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$serverRunning = Get-NetTCPConnection -LocalPort 5190 -State Listen -ErrorAction SilentlyContinue
if ($serverRunning) {
  try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5190/api/health' -TimeoutSec 2 } catch { $health = $null }
  if ($health -and $health.name -eq 'JARVIS' -and $health.version -ne $expectedVersion) {
    Stop-Process -Id $serverRunning.OwningProcess -Force
    $agentRunning = Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue
    if ($agentRunning) { Stop-Process -Id $agentRunning.OwningProcess -Force }
    Start-Sleep -Milliseconds 500
    $serverRunning = $null
  }
}
if (-not $serverRunning) {
  Start-Process -FilePath node -ArgumentList 'server.mjs' -WorkingDirectory $project -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try { $ready = (Invoke-WebRequest -Uri 'http://127.0.0.1:5190/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $ready = $false }
    if ($ready) { break }
  }
  if (-not $ready) { throw 'JARVIS server did not become ready.' }
}
$agentRunning = Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue
if ($env:SUPABASE_SERVICE_ROLE_KEY -and -not $agentRunning) {
  Start-Process -FilePath node -ArgumentList 'agent.mjs' -WorkingDirectory $project -WindowStyle Hidden
}
Start-Process 'http://localhost:5190'
Write-Host 'JARVIS is ready at http://localhost:5190' -ForegroundColor Cyan
