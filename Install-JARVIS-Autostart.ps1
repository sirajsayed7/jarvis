param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$taskName = 'JARVIS Local Core'
if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'JARVIS autostart removed.' -ForegroundColor Yellow
  exit 0
}

$launcher = Join-Path $PSScriptRoot 'Start-JARVIS.ps1'
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$quotedLauncher = '"' + $launcher.Replace('"', '""') + '"'
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $quotedLauncher -Headless" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts the local JARVIS core, secure agent, and native wake-word listener at sign-in.' -Force | Out-Null
Write-Host 'JARVIS will now start in the background when you sign in.' -ForegroundColor Cyan
