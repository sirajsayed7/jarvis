# JARVIS Local

Local-first JARVIS command center with Groq conversation, Gemini analysis, project awareness, voice controls, and an Android-ready PWA.

## Configuration

Set `GROQ_API_KEY` and `GEMINI_API_KEY` as Windows User environment variables. Never commit or place credentials in the browser.

## Run

```powershell
.\Start-JARVIS.cmd
```

The launcher is idempotent: it starts the server and laptop agent only when needed, verifies readiness, and opens `http://localhost:5190`. The `.cmd` wrapper works when Windows blocks direct `.ps1` execution without changing the system execution policy.

Use the hosted, passkey-protected app on Android. Sensitive project, memory, research, automation, and action APIs accept only loopback requests from the laptop browser or laptop agent; they are not exposed to other Wi-Fi devices.

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

## Passwordless passkeys

JARVIS supports passkeys for Windows Hello and Android biometrics. It never reads, stores, or sends a Windows password.

In Supabase Dashboard → **Authentication → Passkeys**, enable passkeys and use:

- Relying Party Display Name: `JARVIS`
- Relying Party ID: `jarvisv1-five.vercel.app`
- Relying Party Origin: `https://jarvisv1-five.vercel.app`

In **Authentication → URL Configuration**, set the Site URL and add the exact production URL above as an allowed Redirect URL. The first enrollment is initiated from `http://localhost:5190` with **Set up passkey**; that local-only action creates a one-time setup link using the laptop's service-role key and redirects to the production site. The link is never emailed or persisted. Then select **Set up passkey** on the production site and approve the Windows Hello or phone biometric prompt.

Passkey configuration is experimental in Supabase, and the relying-party ID is cryptographically bound to the domain. Do not change it after enrolling devices.

## Verification

```powershell
npm.cmd run check
npm.cmd test
```

The smoke suite starts an isolated JARVIS server and verifies health, PWA assets, the operations dashboard, automation creation/pause/deletion, and natural-language scheduling. Approved npm scripts run through Windows `cmd.exe`, avoiding the `spawn EINVAL` failure produced by invoking `.cmd` files directly.

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

## Persistent orchestrator jobs

Start a multi-step job from the Operations dashboard or chat with `orchestrate: <goal>`. JARVIS selects supported tools, executes safe steps, records observations, retries transient failures up to three times, and pauses before screen capture, application launches, or project scripts. Use `list jobs`, `approve latest job`, or `cancel latest job` to manage it. Job state is stored in the ignored `data/jobs.json`; interrupted safe steps resume after restart, while interrupted sensitive steps require fresh approval.

## Skills, learning, and voice providers

JARVIS ships with built-in project, research, portfolio, system, and verification skills. Custom skills can be registered through the local `/api/skills` endpoint. Teach a reusable voice or text command with `when I say <phrase>, do <job>`, then invoke the exact phrase later. Specialist prompts use `ask coder:`, `ask researcher:`, `ask reviewer:`, or `ask verifier:`. Tool attempts, duration, errors, and job evaluations remain local in the ignored data folder.

Phase 3 local voice is available with `voice status`. The laptop launcher automatically discovers runtimes under `data/runtime`; custom paths can use `JARVIS_WHISPER_CLI`, `JARVIS_WHISPER_MODEL`, `JARVIS_PIPER_CLI`, and `JARVIS_PIPER_MODEL`. **Local Whisper** records microphone audio as 16 kHz WAV and transcribes it entirely on the laptop. Piper generates an offline British neural voice, while browser speech remains the fallback. Runtime binaries and models remain in the ignored local data folder and are never deployed.

## Public internet and durable memory

Use `deep research <question> and save it to memory` to run multiple searches, open readable public pages, synthesize evidence, and return numbered citations. Use `read <https://...>` for a specific public page, `search memory for <topic>` for relevance-ranked recall, and `compress my memory` to consolidate older entries without discarding recent context. `schedule research <topic> daily at HH:MM` creates a recurring Qatar-time monitor.

Internet access is intentionally limited to reachable public HTTP/HTTPS text pages. JARVIS blocks localhost, private/internal/reserved network ranges, credential-bearing URLs, non-text downloads, oversized responses, and excessive redirects. It does not bypass authentication, subscriptions, CAPTCHAs, robots, paywalls, or site access controls.
