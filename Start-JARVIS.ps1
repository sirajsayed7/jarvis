param([switch]$Headless)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
function Import-JarvisEnvironmentValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, 'User')
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Machine') }
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($Name, 'Process') }
  if ($value) { Set-Item -LiteralPath "Env:$Name" -Value $value }
}
@('GROQ_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JARVIS_DATA_DIR', 'JARVIS_NATIVE_VOICE', 'JARVIS_NATIVE_VOICE_CONFIDENCE') | ForEach-Object { Import-JarvisEnvironmentValue $_ }
$env:JARVIS_OWNER_EMAIL = 'sirajsayed7@gmail.com'
if (-not $env:GROQ_API_KEY) { throw 'GROQ_API_KEY is not configured in your Windows user environment.' }
Set-Location $project
$expectedVersion = (Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$dataRoot = if ($env:JARVIS_DATA_DIR) { $env:JARVIS_DATA_DIR } else { Join-Path $project 'data' }
$nativeStatusPath = Join-Path $dataRoot 'native-voice-status.json'
function Get-JarvisNativeVoiceProcess {
  if (-not (Test-Path -LiteralPath $nativeStatusPath)) { return $null }
  try {
    $status = Get-Content -LiteralPath $nativeStatusPath -Raw | ConvertFrom-Json
    $process = Get-Process -Id ([int]$status.pid) -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -in @('powershell', 'pwsh')) { return [pscustomobject]@{ Process = $process; Status = $status } }
  } catch { }
  return $null
}
$serverRunning = Get-NetTCPConnection -LocalPort 5190 -State Listen -ErrorAction SilentlyContinue
if ($serverRunning) {
  try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5190/api/health' -TimeoutSec 2 } catch { $health = $null }
  if ($health -and $health.name -eq 'JARVIS' -and $health.version -ne $expectedVersion) {
    Stop-Process -Id $serverRunning.OwningProcess -Force
    $agentRunning = Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue
    if ($agentRunning) { Stop-Process -Id $agentRunning.OwningProcess -Force }
    $nativeVoice = Get-JarvisNativeVoiceProcess
    if ($nativeVoice) { Stop-Process -Id $nativeVoice.Process.Id -Force }
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
$nativeVoice = Get-JarvisNativeVoiceProcess
if ($nativeVoice -and $nativeVoice.Status.version -ne $expectedVersion) {
  Stop-Process -Id $nativeVoice.Process.Id -Force
  Start-Sleep -Milliseconds 300
  $nativeVoice = $null
}
if ($env:JARVIS_NATIVE_VOICE -ne 'off' -and -not $nativeVoice) {
  $voiceScript = Join-Path $project 'native-voice.ps1'
  $confidence = if ($env:JARVIS_NATIVE_VOICE_CONFIDENCE) { $env:JARVIS_NATIVE_VOICE_CONFIDENCE } else { '0.58' }
  $voiceArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$voiceScript`" -CoreUrl `"http://127.0.0.1:5190`" -DataRoot `"$dataRoot`" -Version `"$expectedVersion`" -MinConfidence $confidence"
  Start-Process -FilePath powershell.exe -ArgumentList $voiceArguments -WorkingDirectory $project -WindowStyle Hidden
}
if (-not $Headless) { Start-Process 'http://localhost:5190' }
Write-Host $(if ($Headless) { 'JARVIS is running in the background.' } else { 'JARVIS is ready at http://localhost:5190' }) -ForegroundColor Cyan
