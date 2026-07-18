$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$files = @('Start-JARVIS.ps1', 'native-voice.ps1', 'Install-JARVIS-Autostart.ps1')
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  [Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file), [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count) { throw "$file has PowerShell syntax errors: $($errors.Message -join '; ')" }
}
Write-Output "PowerShell syntax verified for $($files.Count) scripts."
