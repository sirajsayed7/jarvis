# JARVIS Local

Local-first JARVIS command center with Groq conversation, Gemini analysis, project awareness, voice controls, and an Android-ready PWA.

The responsive cinematic HUD uses a procedural canvas reactor, rotating telemetry rings, live Qatar time, system panels, state-aware motion, and a speech-amplitude visualizer for Local Whisper. The interface changes behavior while listening, reasoning, and speaking. Advanced controls remain available in a filtered, collapsible systems deck so the primary command surface stays focused.

Version 1.2 adds native closed-page hearing and verified coding. A background Windows speech sidecar starts with the laptop launcher, listens locally for **Jarvis**, calls the same bounded command core, and speaks the answer without requiring the dashboard to stay open. Spoken approval and authorization phrases are blocked; sensitive work must still be approved in the authenticated dashboard. Optional autostart can keep the core and listener available after every Windows sign-in.

Coding proposals can now be copied into a disposable, secret-free verification workspace before application. Dependencies install with lifecycle scripts disabled, then available `test`, `build`, and `lint` scripts run with a sanitized environment. The real project remains unchanged. This is strong workspace isolation and evidence collection, but not an operating-system security boundary for hostile code.

Conversation mode keeps browser speech recognition active for natural follow-up turns while the page is open. Say **Jarvis** while the reply is speaking to interrupt and issue a new command, or press `Alt+J` to toggle the mode. Browser microphone permission is required; Local Whisper and Piper remain the private laptop-side voice options.

The dashboard now reports measured provider and core readiness instead of hardcoded online labels. Say `Jarvis doctor`, select **Run doctor**, or open local `/api/doctor` to see a weighted readiness report with exact missing systems. `show your capabilities` exposes the current policy-controlled tool catalog. The architecture choices and public projects reviewed for this release are documented in [`docs/assistant-architecture-review.md`](docs/assistant-architecture-review.md).

JARVIS has two connection modes, not two separate versions. **LAPTOP CORE** is the localhost interface with direct access to local Whisper, Piper, projects, and Windows tools. **REMOTE LINK** is the passkey-protected Vercel interface that queues commands through Supabase to the same laptop core. On the remote interface, **Phone voice** uses the phone or browser speech recognizer; **Local Whisper** is shown only where the Whisper executable is physically installed.

## Configuration

Set `GROQ_API_KEY` and `GEMINI_API_KEY` as Windows User environment variables. Never commit or place credentials in the browser.

## Run

```powershell
.\Start-JARVIS.cmd
```

The launcher is idempotent: it starts the server, secure laptop agent, and native voice sidecar only when needed, verifies readiness, and opens `http://localhost:5190`. The `.cmd` wrapper works when Windows blocks direct `.ps1` execution without changing the system execution policy. Set `JARVIS_NATIVE_VOICE=off` as a Windows user environment variable to disable the native listener; `JARVIS_NATIVE_VOICE_CONFIDENCE` can tune its default `0.58` recognition threshold.

To start JARVIS automatically and invisibly after Windows sign-in, run this once:

```powershell
.\Install-JARVIS-Autostart.ps1
```

Remove the sign-in task with `.\Install-JARVIS-Autostart.ps1 -Remove`. Neither operation stores API keys in Task Scheduler; the headless launcher reads them from Windows user environment variables.

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

## Frontier commands

- `run awareness pulse` checks approvals, failed jobs, tasks, memory pressure, and local hearing readiness.
- `agent evaluation` reports tool success, latency, job completion, and voice readiness from local evidence.
- `council: <decision or task>` consults four focused specialists in parallel and saves the synthesis locally.
- `propose change to <exact project>: <request>` drafts a bounded change without writing files.
- `verify latest code change` previews an isolated verification run; `approve verify latest code change` executes it.
- `list code verifications` shows locally recorded evidence and failures.
- `approve latest code change` writes the reviewed proposal and creates a checkpoint.
- `rollback latest code change` previews recovery; `approve rollback latest code change` performs it.
- `native voice status`, `pause native voice`, and `resume native voice` control closed-page hearing.

## Skills, learning, and voice providers

JARVIS ships with built-in project, research, portfolio, system, and verification skills. Custom skills can be registered through the local `/api/skills` endpoint. Teach a reusable voice or text command with `when I say <phrase>, do <job>`, then invoke the exact phrase later. Specialist prompts use `ask coder:`, `ask researcher:`, `ask reviewer:`, or `ask verifier:`. Tool attempts, duration, errors, and job evaluations remain local in the ignored data folder.

Native voice is available with `native voice status`. It uses the installed Windows `System.Speech` recognizer and works after the web page closes, as long as the laptop core is running. Say “Jarvis” followed by the command, or say “Jarvis”, wait for “Yes?”, then continue. Conversation mode temporarily leases the microphone and pauses the sidecar to prevent duplicate commands.

The launcher also discovers optional runtimes under `data/runtime`; custom paths can use `JARVIS_WHISPER_CLI`, `JARVIS_WHISPER_MODEL`, `JARVIS_PIPER_CLI`, and `JARVIS_PIPER_MODEL`. **Local Whisper** records microphone audio as 16 kHz WAV and transcribes it entirely on the laptop. Piper generates an offline British neural voice, while browser speech and Windows speech remain fallbacks. Runtime binaries and models remain in the ignored local data folder and are never deployed.

## Public internet and durable memory

Use `deep research <question> and save it to memory` to run multiple searches, open readable public pages, synthesize evidence, and return numbered citations. Use `read <https://...>` for a specific public page, `search memory for <topic>` for relevance-ranked recall, and `compress my memory` to consolidate older entries without discarding recent context. `schedule research <topic> daily at HH:MM` creates a recurring Qatar-time monitor.

Internet access is intentionally limited to reachable public HTTP/HTTPS text pages. JARVIS blocks localhost, private/internal/reserved network ranges, credential-bearing URLs, non-text downloads, oversized responses, and excessive redirects. It does not bypass authentication, subscriptions, CAPTCHAs, robots, paywalls, or site access controls.

## Continuous knowledge acquisition

JARVIS can now build a citation-backed knowledge library without pretending to retrain itself on the entire Internet. Say `learn about <topic>` to run bounded multi-hop research, save the summary and sources to `data/knowledge.json`, and add the evidence to durable memory. Say `knowledge status` or use the Knowledge engine card to review topics and confidence. `schedule learning <topic> daily at HH:MM` makes the laptop agent revisit a topic in Qatar time. Knowledge entries are deduplicated and capped; web pages are treated as untrusted reference material, never as executable instructions. This keeps learning useful, auditable, and recoverable instead of silently copying everything online.

## Browser and GitHub laboratory

Use `audit website <URL>` to launch the installed Microsoft Edge in isolated headless desktop and mobile profiles. JARVIS records status, load timing, console errors, failed requests, responsive overflow, headings, basic accessibility findings, screenshots, and an optional Gemini visual review. Screenshots remain in the ignored `data/browser` folder. Public targets retain private-network protections; explicit localhost audits are allowed for local development.

Use `inspect GitHub repo <owner/repo>` to review open issues, pull requests, branches, and Actions workflows. Issue and pull-request creation are preview-first and approval-gated. To enable approved mutations, configure a least-privilege fine-grained GitHub token as the Windows user environment variable `GITHUB_TOKEN`; the token remains laptop-only and is never returned by the API, committed, or deployed.

## Productivity and notifications

JARVIS now stores notes, tasks, reminders, and notification history locally in the ignored `data/productivity.json` file. Use `take a note: <text>`, `add task: <text>`, `list my tasks`, `complete task <number>`, `remind me on YYYY-MM-DD at HH:MM to <text>`, and `list my reminders`. Reminder times use Qatar time, survive restarts, and are queued through the authenticated laptop agent. If Supabase is unavailable, the local core delivers them directly while it is running.

Choose **Enable alerts** once in the dashboard to permit PWA/browser notifications. On Windows, JARVIS also attempts a native toast and always keeps the alert in its local notification history. The hosted Android PWA can show completed remote commands and reminders while it is open; true closed-app Android push is the next notification transport step.

The connector status endpoint reports capabilities without exposing credentials. GitHub continues to use `GITHUB_TOKEN`. Gmail and Google Calendar are OAuth-ready but remain disconnected until a Google OAuth desktop/web client is configured with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Windows user environment variables and the owner completes consent; credentials must never be committed.
