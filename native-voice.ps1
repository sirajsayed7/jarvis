param(
  [string]$CoreUrl = 'http://127.0.0.1:5190',
  [string]$DataRoot = (Join-Path $PSScriptRoot 'data'),
  [string]$Version = 'dev',
  [double]$MinConfidence = 0.58,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$statusPath = Join-Path $DataRoot 'native-voice-status.json'
$controlPath = Join-Path $DataRoot 'native-voice-control.json'
$script:state = 'starting'
$script:detail = 'Loading the Windows speech runtime.'
$script:lastHeardAt = $null
$script:lastCommandAt = $null
$script:armedUntil = [DateTime]::MinValue
$script:busy = $false
$script:speaking = $false
$script:recognizerName = ''

function Write-NativeVoiceStatus {
  param([string]$State = $script:state, [string]$Detail = $script:detail, [bool]$Active = $true)
  $script:state = $State
  $script:detail = $Detail
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
  $payload = [ordered]@{
    version = $Version
    pid = $PID
    active = $Active
    state = $State
    detail = $Detail
    engine = 'Windows System.Speech'
    recognizer = $script:recognizerName
    wakePhrase = 'Jarvis'
    minimumConfidence = $MinConfidence
    lastHeardAt = $script:lastHeardAt
    lastCommandAt = $script:lastCommandAt
    heartbeatAt = [DateTime]::UtcNow.ToString('o')
  }
  $temporary = "$statusPath.tmp"
  [IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $statusPath -Force
}

function Get-NativeVoiceControl {
  if (-not (Test-Path -LiteralPath $controlPath)) { return [pscustomobject]@{ enabled = $true; pausedUntil = $null } }
  try { return Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json }
  catch { return [pscustomobject]@{ enabled = $true; pausedUntil = $null } }
}

function Test-NativeVoicePaused {
  $control = Get-NativeVoiceControl
  if ($control.enabled -eq $false) { return $true }
  if (-not $control.pausedUntil) { return $false }
  try { return [DateTime]::Parse($control.pausedUntil).ToUniversalTime() -gt [DateTime]::UtcNow }
  catch { return $false }
}

function Test-SensitiveVoiceCommand {
  param([string]$Command)
  return $Command -match '(?i)\b(approve|confirm|authorize|cancel|delete|remove|erase)\b'
}

function Invoke-CoreJson {
  param([string]$Path, [hashtable]$Body, [int]$TimeoutSeconds = 90)
  return Invoke-RestMethod -Method Post -Uri "$CoreUrl$Path" -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec $TimeoutSeconds
}

function Speak-Jarvis {
  param([string]$Text)
  if (-not $Text) { return }
  $script:speaking = $true
  $script:state = 'speaking'
  $script:detail = 'Answering through the native laptop voice.'
  Write-NativeVoiceStatus
  $temporaryWav = Join-Path $env:TEMP "jarvis-native-$PID-$([Guid]::NewGuid().ToString('N')).wav"
  try {
    try {
      $audio = Invoke-CoreJson -Path '/api/voice/synthesize' -Body @{ text = $Text.Substring(0, [Math]::Min(850, $Text.Length)) } -TimeoutSeconds 50
      [IO.File]::WriteAllBytes($temporaryWav, [Convert]::FromBase64String($audio.audioBase64))
      $player = [System.Media.SoundPlayer]::new($temporaryWav)
      $player.PlaySync()
      $player.Dispose()
    } catch {
      $script:synthesizer.Speak($Text.Substring(0, [Math]::Min(850, $Text.Length)))
    }
  } finally {
    Remove-Item -LiteralPath $temporaryWav -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 650
    $script:speaking = $false
    $script:state = 'listening'
    $script:detail = 'Say Jarvis followed by a command.'
    Write-NativeVoiceStatus
  }
}

function Invoke-JarvisVoiceCommand {
  param([string]$Command)
  $clean = ($Command -replace '\s+', ' ').Trim(' ', '.', ',', ':', ';', '!', '?', '-')
  if (-not $clean -or $script:busy) { return }
  $script:busy = $true
  try {
    if (Test-SensitiveVoiceCommand $clean) {
      Speak-Jarvis 'That action needs approval in the JARVIS dashboard.'
      return
    }
    $script:state = 'processing'
    $script:detail = "Processing: $clean"
    $script:lastCommandAt = [DateTime]::UtcNow.ToString('o')
    Write-NativeVoiceStatus
    try {
      $response = Invoke-CoreJson -Path '/api/chat' -Body @{ message = $clean; conversationId = 'native-voice-sidecar' }
      Speak-Jarvis ([string]$response.answer)
    } catch {
      Speak-Jarvis 'I could not reach the local core. Please restart JARVIS.'
    }
  } finally { $script:busy = $false }
}

Add-Type -AssemblyName System.Speech
$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$selected = $installed | Sort-Object @{ Expression = { if ($_.Culture.Name -eq 'en-GB') { 0 } elseif ($_.Culture.Name -eq 'en-US') { 1 } else { 2 } } } | Select-Object -First 1
$script:recognizerName = if ($selected) { $selected.Name } else { '' }

if ($SelfTest) {
  $supported = $null -ne $selected
  Write-NativeVoiceStatus -State $(if ($supported) { 'self-test-passed' } else { 'unsupported' }) -Detail $(if ($supported) { "Recognizer ready: $($selected.Name)" } else { 'No Windows speech recognizer is installed.' }) -Active $false
  [pscustomobject]@{ supported = $supported; recognizerCount = $installed.Count; recognizer = $script:recognizerName; sensitiveApprovalBlocked = (Test-SensitiveVoiceCommand 'approve latest code change'); ordinaryCommandAllowed = -not (Test-SensitiveVoiceCommand 'tell me the weather') } | ConvertTo-Json -Compress
  exit $(if ($supported) { 0 } else { 1 })
}

$createdNew = $false
$mutex = [Threading.Mutex]::new($true, 'Local\JARVISNativeVoice', [ref]$createdNew)
if (-not $createdNew) { exit 0 }
if (-not $selected) { Write-NativeVoiceStatus -State 'unsupported' -Detail 'No Windows speech recognizer is installed.' -Active $false; exit 1 }

$script:synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try { $script:synthesizer.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Male, [System.Speech.Synthesis.VoiceAge]::Adult, 0, $selected.Culture) } catch { }
$recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($selected)
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())

$recognizer.add_SpeechRecognized({
  param($sender, $eventArgs)
  if ($script:speaking -or $script:busy -or (Test-NativeVoicePaused)) { return }
  $result = $eventArgs.Result
  if (-not $result -or $result.Confidence -lt $MinConfidence) { return }
  $heard = ($result.Text -replace '\s+', ' ').Trim()
  if (-not $heard) { return }
  $script:lastHeardAt = [DateTime]::UtcNow.ToString('o')
  $wake = [regex]::Match($heard, '(?i)\b(?:hey\s+)?jarvis\b[\s,.:;!?-]*(.*)$')
  if ($wake.Success) {
    $command = $wake.Groups[1].Value.Trim()
    if ($command) { Invoke-JarvisVoiceCommand $command }
    else { $script:armedUntil = [DateTime]::UtcNow.AddSeconds(10); Speak-Jarvis 'Yes?' }
    return
  }
  if ([DateTime]::UtcNow -lt $script:armedUntil) {
    $script:armedUntil = [DateTime]::MinValue
    Invoke-JarvisVoiceCommand $heard
  }
})

try {
  $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Write-NativeVoiceStatus -State 'listening' -Detail 'Say Jarvis followed by a command.'
  while ($true) {
    $control = Get-NativeVoiceControl
    if ($control.enabled -eq $false) { break }
    if (Test-NativeVoicePaused) { Write-NativeVoiceStatus -State 'paused' -Detail 'Paused while another JARVIS microphone is active.' }
    elseif (-not $script:busy -and -not $script:speaking) { Write-NativeVoiceStatus -State 'listening' -Detail 'Say Jarvis followed by a command.' }
    Start-Sleep -Seconds 4
  }
} finally {
  try { $recognizer.RecognizeAsyncCancel() } catch { }
  $recognizer.Dispose()
  $script:synthesizer.Dispose()
  Write-NativeVoiceStatus -State 'stopped' -Detail 'Native voice sidecar stopped.' -Active $false
  if ($createdNew) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
exit 0
