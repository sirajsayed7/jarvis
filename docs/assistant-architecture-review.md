# JARVIS assistant architecture review

Reviewed for the v1.2 native-runtime release on 18 July 2026. This is a high-signal architecture review, not a claim that every repository on GitHub is safe, maintained, unique, or practical to copy.

## Sources reviewed

- [OpenJarvis](https://github.com/open-jarvis/OpenJarvis): local-first primitives, scheduled and continuous agents, evaluation, trace-based learning, and energy/cost awareness.
- [Leon](https://github.com/leon-ai/leon): controlled and agent execution modes, layered memory, explicit skills/actions/tools/functions, and a bounded proactive pulse.
- [Open Interpreter](https://github.com/openinterpreter/openinterpreter): sandboxed computer use, permissions, skills, MCP, session state, and harness-level verification.
- [vierisid/jarvis](https://github.com/vierisid/jarvis): persistent daemon, sidecars, awareness, background agents, authority gating, workflows, and operational diagnostics.
- [isair/jarvis](https://github.com/isair/jarvis): local privacy, automatic secret redaction, long-lived memory, browser control, and tool-context management.
- [LiveKit Agents](https://github.com/livekit/agents): real-time multimodal sessions, WebRTC clients, semantic turn detection, interruption handling, tools, and agent tests.
- [Pipecat](https://github.com/pipecat-ai/pipecat): composable real-time speech and multimodal pipelines.
- [openWakeWord](https://github.com/dscripka/openWakeWord): efficient local wake-word detection and custom wake-model training.
- [Groq tool use](https://console.groq.com/docs/tool-use/overview): structured local function calling and bounded plan-act-observe loops.
- [Gemini Live API](https://ai.google.dev/gemini-api/docs/live-api): native audio, live multimodal sessions, and interruption-aware interaction.

## Patterns adopted in v1.0

- Model-native selection across an explicit JSON-schema tool catalog.
- A bounded loop: at most four reasoning rounds and eight tool calls per turn.
- Read and managed tool policies. There is no unrestricted shell tool.
- Persistent local tool traces with success, failure, policy, and duration.
- Sensitive work enters the existing managed-job engine and pauses for owner approval.
- Tool results and external content are treated as untrusted data.
- A capability manifest and JARVIS Doctor provide measurable readiness instead of hardcoded status claims.
- Conversation, situational context, approved memory, and live observations are combined without silently retraining a model.

## Patterns adopted in v1.1

- Proactive five-minute awareness pulses notify only when meaningful, fingerprinted state changes occur.
- A parallel specialist council separates architecture, implementation, risk review, and verification before synthesis.
- A coding workbench produces bounded proposals, verifies source freshness, rejects unsafe paths and symbolic links, and applies only after a separate owner command.
- Every approved coding proposal creates a local checkpoint with explicit preview and approval for rollback.
- Agent evaluations report observed success, latency, completion, and voice readiness instead of implying reliability.
- Browser conversation mode supports continuous follow-up turns and wake-name barge-in while the page remains open.

## Patterns adopted in v1.2

- A zero-cost Windows `System.Speech` sidecar provides persistent local “Jarvis” hearing after the browser closes.
- The launcher supervises sidecar versions and can run headlessly through an optional current-user logon task.
- Browser conversation mode leases the microphone so browser and native listeners do not submit duplicate commands.
- Voice-originated approval phrases are rejected before they reach the command core.
- Code proposals can be overlaid onto a bounded disposable copy, with secrets and generated folders excluded.
- Dependency lifecycle scripts are disabled during staging; test, build, and lint evidence is stored locally with a sanitized environment.
- A failed recorded verification blocks application of that proposal, while every successful application still creates a rollback checkpoint.

## Deliberately not copied

- Arbitrary autonomous shell execution.
- Confirmation bypasses or unrestricted computer control.
- Credentials in browser storage or source control.
- Unbounded crawling, self-modifying code, or silent self-training.
- Large framework migrations that would weaken the current native-Windows, zero-cost, local-first setup.
- Wake-word models with licensing that is unsuitable for the intended use.

## Highest-value next layers

1. Native full-duplex WebRTC audio with semantic turn detection and Android background audio support.
2. An optional openWakeWord “hey jarvis” model with VAD and user-specific verification for lower false activations than general dictation.
3. A local MCP gateway so new connectors can join the same policy and audit system.
4. Operating-system sandbox execution and visual diff review attached to coding proposals.
5. Completed OAuth connectors and true Android background push delivery.
6. Larger regression and recovery evaluation datasets with latency budgets per tool.
