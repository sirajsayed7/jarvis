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
if ($env:SUPABASE_SERVICE_ROLE_KEY) { Start-Process -FilePath node -ArgumentList 'agent.mjs' -WorkingDirectory $project -WindowStyle Hidden }
node server.mjs
