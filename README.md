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

Run `supabase/schema.sql` in the Supabase SQL Editor, then use `node agent.mjs` to start the laptop-side remote agent foundation.
