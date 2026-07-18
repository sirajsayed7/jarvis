# JARVIS assistant architecture review

Reviewed for the v1.0 cognitive-runtime release on 18 July 2026. This is a high-signal architecture review, not a claim that every repository on GitHub is safe, maintained, unique, or practical to copy.

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

## Deliberately not copied

- Arbitrary autonomous shell execution.
- Confirmation bypasses or unrestricted computer control.
- Credentials in browser storage or source control.
- Unbounded crawling, self-modifying code, or silent self-training.
- Large framework migrations that would weaken the current native-Windows, zero-cost, local-first setup.
- Wake-word models with licensing that is unsuitable for the intended use.

## Highest-value next layers

1. Full-duplex audio transport with voice activity detection, barge-in, interruption, and Android WebRTC support.
2. A native wake-word sidecar with an appropriately licensed custom “Jarvis” model.
3. A local MCP gateway so new connectors can join the same policy and audit system.
4. A sandboxed coding harness with checkpoints, diffs, tests, and rollback before approval.
5. Completed OAuth connectors and true Android background push delivery.
6. Continuous evaluation suites for tool choice, voice latency, task completion, and recovery.
