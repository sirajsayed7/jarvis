$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:GROQ_API_KEY = [Environment]::GetEnvironmentVariable('GROQ_API_KEY', 'User')
$env:GEMINI_API_KEY = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
if (-not $env:GROQ_API_KEY) { throw 'GROQ_API_KEY is not configured in your Windows user environment.' }
Set-Location $project
node server.mjs
