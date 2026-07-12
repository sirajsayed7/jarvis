# JARVIS Local

Local-first JARVIS command center with Groq conversation, Gemini analysis, project awareness, voice controls, and an Android-ready PWA.

## Configuration

Set `GROQ_API_KEY` and `GEMINI_API_KEY` as Windows User environment variables. Never commit or place credentials in the browser.

## Run

```powershell
& .\Start-JARVIS.ps1
```

Open `http://localhost:5190`. On the same Wi-Fi, open the laptop's displayed local address on Android and install the app from Chrome.

## Deployment

This repository contains the local JARVIS core. Before deploying to Vercel, the hosted dashboard and laptop-only agent should be separated so local files and API keys remain private.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL Editor.

Configure these environment variables on Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `JARVIS_OWNER_EMAIL`

Configure `SUPABASE_SERVICE_ROLE_KEY` only as a Windows User environment variable on the laptop. Never put it in the browser, Android app, GitHub, or Vercel. The Windows launcher starts the authenticated laptop agent automatically when this key is present.

The remote agent currently supports JARVIS chat and project-review requests. Arbitrary remote shell execution is intentionally not enabled.

## Project operations

JARVIS scans projects below `Documents\Codex` (or `JARVIS_PROJECTS_ROOT`), reads local Git state, and adds public GitHub context when a project has a GitHub `origin` remote. Private GitHub repositories remain private; no GitHub token is stored or required for the basic metadata check.

In JARVIS chat, use:

- `report for <exact project name>` — saves a concise status, risk, and next-action report locally.
- `briefing` — creates a portfolio briefing from the most recently modified projects.
- `build PWA called <name>` — previews a dependency-free PWA scaffold.
- `approve build PWA <name>` — creates that scaffold under `Documents\Codex\generated`.
- `build <exact project name>`, `test <exact project name>`, or `lint <exact project name>` — previews an available npm script.
- `approve build <exact project name>` — runs that one approved npm script locally.

Reports stay in the ignored `data/reports` folder. Generation and script execution are both approval-gated, so JARVIS can plan and inspect broadly but only changes files or runs commands after an explicit approval phrase.
