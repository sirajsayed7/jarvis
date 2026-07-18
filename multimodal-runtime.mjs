import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_POLICY = {
  version: 1,
  privacy: {
    localFirst: true,
    interactionLearning: true,
    explicitPreferenceLearning: true,
    conversationHistory: true,
    camera: "off-until-user-starts",
    screenCapture: "approval-required",
    screenRetention: "ephemeral",
    cloudVision: "owner-authenticated",
    retentionDays: 30
  },
  permissions: {
    publicRead: "automatic",
    localRead: "automatic",
    cameraCapture: "user-session",
    screenCapture: "approval",
    deviceControl: "approval",
    externalWrite: "approval",
    projectWrite: "approval",
    destructiveAction: "approval-and-confirmation",
    voiceApproval: "denied"
  }
};

const INTENT_RULES = [
  ["device-control", /\b(?:turn\s+(?:on|off)|set\s+(?:the\s+)?(?:light|thermostat)|home\s+assistant|device\s+control)\b/i, true, "device"],
  ["computer-control", /\b(?:open|launch|close|restart|shutdown|visible\s+windows|my\s+screen|laptop\s+status)\b/i, true, "device"],
  ["coding", /\b(?:code|project|repository|repo|build|test|lint|debug|deploy|pwa|github)\b/i, false, "project"],
  ["vision", /\b(?:look\s+at|see|image|camera|screen|screenshot|photo|visual|ocr)\b/i, false, "vision"],
  ["research", /\b(?:research|look\s+up|search\s+(?:the\s+)?web|latest|news|current)\b/i, false, "internet"],
  ["productivity", /\b(?:task|reminder|calendar|meeting|note|email|schedule)\b/i, false, "personal-data"],
  ["learning", /\b(?:learn|remember|prefer|preference|feedback|correct(?:ion)?)\b/i, false, "memory"],
  ["security", /\b(?:security|privacy|permission|audit|credential|access|delete\s+my\s+data)\b/i, true, "security"],
  ["conversation", /[\s\S]*/, false, "conversation"]
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function mergePolicy(input = {}) {
  return {
    ...clone(DEFAULT_POLICY),
    ...input,
    privacy: { ...DEFAULT_POLICY.privacy, ...(input.privacy || {}) },
    permissions: { ...DEFAULT_POLICY.permissions, ...(input.permissions || {}) }
  };
}

function boundedText(value, max = 1000) { return String(value || "").trim().slice(0, max); }

function redactedString(value) {
  return String(value)
    .replace(/\b(?:gsk_|AIza)[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:api[_ -]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, "%USERPROFILE%");
}

function sanitize(value, depth = 0) {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactedString(value).slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitize(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:authorization|credential|password|secret|token|key)$/i.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return value;
}

export function analyzeIntent(message) {
  const text = boundedText(message, 10_000);
  const matched = INTENT_RULES.find(([, pattern]) => pattern.test(text)) || INTENT_RULES.at(-1);
  const [intent, , sensitive, context] = matched;
  const entities = {
    urls: [...text.matchAll(/https?:\/\/[^\s<>()]+/gi)].map(match => match[0].replace(/[.,;!?]+$/, "")).slice(0, 5),
    repositories: [...text.matchAll(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/g)].map(match => match[0]).slice(0, 5),
    dates: [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match => match[0]).slice(0, 5),
    times: [...text.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)].map(match => match[0]).slice(0, 5)
  };
  const question = /\?|^(?:what|why|how|when|where|who|which|can|could|would|should|is|are|do|does)\b/i.test(text);
  const action = /^(?:approve|create|build|run|open|launch|start|stop|schedule|send|delete|remove|turn|set|capture|analy[sz]e)\b/i.test(text);
  return { intent, confidence: intent === "conversation" ? 0.55 : 0.86, question, action, sensitive: sensitive || /\b(?:approve|delete|remove|credential|password|secret|token)\b/i.test(text), context, entities };
}

export class MultimodalRuntime {
  constructor({ dataRoot, env = process.env, platform = process.platform, fetchImpl = globalThis.fetch, validateEndpoint = null } = {}) {
    if (!dataRoot) throw new Error("A data root is required.");
    this.dataRoot = dataRoot;
    this.env = env;
    this.platform = platform;
    this.fetch = fetchImpl;
    this.validateEndpoint = validateEndpoint;
    this.learningPath = path.join(dataRoot, "learning-profile.json");
    this.securityPath = path.join(dataRoot, "security-policy.json");
    this.auditPath = path.join(dataRoot, "security-audit.json");
    this.mcpPath = path.join(dataRoot, "mcp-servers.json");
    this.mcpSessions = new Map();
  }

  async readJson(target, fallback) { try { return JSON.parse(await readFile(target, "utf8")); } catch { return clone(fallback); } }

  async writeJson(target, value) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, target);
    return value;
  }

  async policy() { return mergePolicy(await this.readJson(this.securityPath, DEFAULT_POLICY)); }

  async updatePrivacy(changes = {}) {
    const policy = await this.policy();
    const allowed = ["interactionLearning", "explicitPreferenceLearning", "conversationHistory", "retentionDays"];
    for (const key of allowed) {
      if (!(key in changes)) continue;
      if (key === "retentionDays") policy.privacy[key] = Math.max(1, Math.min(365, Number(changes[key]) || 30));
      else policy.privacy[key] = changes[key] === true;
    }
    policy.updatedAt = new Date().toISOString();
    await this.writeJson(this.securityPath, policy);
    await this.audit("privacy.policy_updated", { changed: allowed.filter(key => key in changes) }, "owner");
    return policy;
  }

  async audit(event, detail = {}, actor = "jarvis") {
    const current = await this.readJson(this.auditPath, []);
    const item = { id: crypto.randomUUID(), at: new Date().toISOString(), event: boundedText(event, 120), actor: boundedText(actor, 80), detail: sanitize(detail) };
    const policy = await this.policy();
    const cutoff = Date.now() - policy.privacy.retentionDays * 86_400_000;
    await this.writeJson(this.auditPath, [item, ...current.filter(entry => Date.parse(entry.at) >= cutoff)].slice(0, 2000));
    return item;
  }

  async auditLog(limit = 100) { return (await this.readJson(this.auditPath, [])).slice(0, Math.max(1, Math.min(500, Number(limit) || 100))); }

  emptyLearning() { return { version: 1, interactions: 0, intentCounts: {}, activeHours: {}, preferences: [], feedback: [], toolOutcomes: {}, updatedAt: null }; }

  async learning() {
    const profile = { ...this.emptyLearning(), ...(await this.readJson(this.learningPath, this.emptyLearning())) };
    const policy = await this.policy(), cutoff = Date.now() - policy.privacy.retentionDays * 86_400_000;
    profile.feedback = (profile.feedback || []).filter(item => Date.parse(item.at) >= cutoff).slice(0, 200);
    return profile;
  }

  extractPreference(message) {
    const text = boundedText(message, 1200);
    if (/\b(?:password|passcode|api\s*key|secret|token|credential|credit\s*card)\b/i.test(text)) return null;
    const match = text.match(/(?:^|[.!?]\s+)(?:i\s+prefer|please\s+always|from\s+now\s+on|my\s+preference\s+is|keep\s+(?:your\s+)?responses?)\s+(.+?)(?:[.!?]|$)/i);
    if (!match) return null;
    const value = boundedText(match[1], 300);
    return value.length >= 3 ? value : null;
  }

  async observeInteraction({ message, intent = analyzeIntent(message), toolTrace = [], countInteraction = true } = {}) {
    const policy = await this.policy();
    if (!policy.privacy.interactionLearning) return { learned: false, reason: "Interaction learning is disabled." };
    const profile = await this.learning();
    if (countInteraction) {
      profile.interactions += 1;
      profile.intentCounts[intent.intent] = (profile.intentCounts[intent.intent] || 0) + 1;
      const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", hourCycle: "h23" }).format(new Date());
      profile.activeHours[hour] = (profile.activeHours[hour] || 0) + 1;
    }
    for (const trace of toolTrace || []) {
      const key = boundedText(trace.tool, 120); if (!key) continue;
      const item = profile.toolOutcomes[key] || { success: 0, failed: 0 };
      item[trace.ok === false ? "failed" : "success"] += 1; profile.toolOutcomes[key] = item;
    }
    let preference = null;
    if (countInteraction && policy.privacy.explicitPreferenceLearning) {
      preference = this.extractPreference(message);
      if (preference) {
        const existing = profile.preferences.find(item => item.value.toLowerCase() === preference.toLowerCase());
        if (existing) existing.confirmations += 1, existing.updatedAt = new Date().toISOString();
        else profile.preferences.unshift({ id: crypto.randomUUID(), value: preference, source: "explicit-owner-statement", confirmations: 1, createdAt: new Date().toISOString() });
        profile.preferences = profile.preferences.slice(0, 50);
      }
    }
    profile.updatedAt = new Date().toISOString();
    await this.writeJson(this.learningPath, profile);
    if (preference) await this.audit("learning.preference_added", { preference }, "owner");
    return { learned: true, preference };
  }

  async recordFeedback({ rating, correction = "", context = "conversation" } = {}) {
    const profile = await this.learning();
    const score = Number(rating);
    if (![1, -1].includes(score)) throw new Error("Feedback rating must be 1 or -1.");
    const safeCorrection = boundedText(redactedString(correction), 1000);
    profile.feedback.unshift({ id: crypto.randomUUID(), rating: score, correction: safeCorrection, context: boundedText(context, 80), at: new Date().toISOString() });
    profile.feedback = profile.feedback.slice(0, 200); profile.updatedAt = new Date().toISOString();
    await this.writeJson(this.learningPath, profile);
    await this.audit("learning.feedback_recorded", { rating: score, hasCorrection: Boolean(safeCorrection) }, "owner");
    return this.learningSummary(profile);
  }

  learningSummary(profile) {
    const sortedIntents = Object.entries(profile.intentCounts || {}).sort((a, b) => b[1] - a[1]);
    const activeHours = Object.entries(profile.activeHours || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hour]) => `${hour}:00`);
    const toolTotals = Object.values(profile.toolOutcomes || {}).reduce((sum, item) => sum + item.success + item.failed, 0);
    const toolSuccess = Object.values(profile.toolOutcomes || {}).reduce((sum, item) => sum + item.success, 0);
    return {
      interactions: profile.interactions || 0,
      preferences: (profile.preferences || []).slice(0, 20),
      dominantIntents: sortedIntents.slice(0, 5).map(([intent, count]) => ({ intent, count })),
      activeHours,
      feedback: { positive: (profile.feedback || []).filter(item => item.rating === 1).length, negative: (profile.feedback || []).filter(item => item.rating === -1).length },
      toolSuccessRate: toolTotals ? Math.round(toolSuccess / toolTotals * 100) : null,
      learningMode: "explicit-preferences-and-observed-outcomes",
      modelWeightsModified: false,
      updatedAt: profile.updatedAt || null
    };
  }

  async learningProfile() { return this.learningSummary(await this.learning()); }

  async resetLearning(confirm) {
    if (confirm !== "DELETE LEARNING PROFILE") throw new Error("Exact confirmation DELETE LEARNING PROFILE is required.");
    await this.writeJson(this.learningPath, this.emptyLearning());
    await this.audit("learning.profile_deleted", {}, "owner");
    return { deleted: true };
  }

  async mcpServers() { return this.readJson(this.mcpPath, []); }

  normalizeMcpServer(input = {}) {
    const name = boundedText(input.name, 80), rawUrl = boundedText(input.url, 500);
    if (!name || !rawUrl) throw new Error("MCP server name and URL are required.");
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Use a credential-free HTTP or HTTPS MCP URL.");
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
    if (!local && url.protocol !== "https:") throw new Error("Remote MCP servers must use HTTPS.");
    if (/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) && !local) throw new Error("Private-network MCP servers must use localhost and a local tunnel managed by JARVIS.");
    const tokenEnv = boundedText(input.tokenEnv, 100);
    if (tokenEnv && !/^JARVIS_MCP_[A-Z0-9_]+_TOKEN$/.test(tokenEnv)) throw new Error("MCP token environment names must use JARVIS_MCP_<NAME>_TOKEN.");
    return { name, url: url.toString(), tokenEnv: tokenEnv || null, allowedTools: Array.isArray(input.allowedTools) ? input.allowedTools.map(item => boundedText(item, 120)).filter(Boolean).slice(0, 100) : [] };
  }

  async registerMcpServer(input, approve = false) {
    const server = this.normalizeMcpServer(input);
    const preview = { ...server, tokenConfigured: Boolean(server.tokenEnv && this.env[server.tokenEnv]), approvalRequired: true, executed: false };
    if (!approve) return preview;
    if (this.validateEndpoint) await this.validateEndpoint(server.url, { allowLoopback: true });
    const servers = await this.mcpServers(), existing = servers.find(item => item.name.toLowerCase() === server.name.toLowerCase());
    const item = { id: existing?.id || crypto.randomUUID(), ...server, enabled: true, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.writeJson(this.mcpPath, [item, ...servers.filter(entry => entry.id !== item.id)].slice(0, 30));
    await this.audit("integration.mcp_registered", { id: item.id, name: item.name, url: item.url, tokenEnv: item.tokenEnv }, "owner");
    return { ...item, tokenConfigured: Boolean(item.tokenEnv && this.env[item.tokenEnv]), approvalRequired: true, executed: true };
  }

  async removeMcpServer(id, confirm) {
    if (confirm !== "REMOVE MCP SERVER") throw new Error("Exact confirmation REMOVE MCP SERVER is required.");
    const servers = await this.mcpServers(), next = servers.filter(item => item.id !== id);
    if (next.length === servers.length) throw new Error("MCP server not found.");
    await this.writeJson(this.mcpPath, next); this.mcpSessions.delete(id);
    await this.audit("integration.mcp_removed", { id }, "owner");
    return { deleted: id };
  }

  mcpHeaders(server, sessionId = null) {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (server.tokenEnv && this.env[server.tokenEnv]) headers.Authorization = `Bearer ${this.env[server.tokenEnv]}`;
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    return headers;
  }

  parseMcpResponse(text, contentType) {
    if (/text\/event-stream/i.test(contentType || "")) {
      const payloads = text.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(line => line && line !== "[DONE]");
      if (!payloads.length) return {};
      return JSON.parse(payloads.at(-1));
    }
    return text ? JSON.parse(text) : {};
  }

  async rawMcpRequest(server, method, params = {}, sessionId = null, notification = false) {
    if (this.validateEndpoint) await this.validateEndpoint(server.url, { allowLoopback: true });
    const body = { jsonrpc: "2.0", method, params };
    if (!notification) body.id = crypto.randomUUID();
    const response = await this.fetch(server.url, { method: "POST", headers: this.mcpHeaders(server, sessionId), body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`MCP server ${server.name} returned ${response.status}.`);
    if (notification) return { sessionId: response.headers.get("mcp-session-id") || sessionId, payload: null };
    const payload = this.parseMcpResponse(text, response.headers.get("content-type"));
    if (payload.error) throw new Error(`MCP ${method} failed: ${boundedText(payload.error.message, 500)}`);
    return { sessionId: response.headers.get("mcp-session-id") || sessionId, payload };
  }

  async ensureMcpSession(server) {
    if (this.mcpSessions.has(server.id)) return this.mcpSessions.get(server.id);
    const initialized = await this.rawMcpRequest(server, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "JARVIS", version: "1.3.0" } });
    const session = { id: initialized.sessionId || null, capabilities: initialized.payload?.result?.capabilities || {}, serverInfo: initialized.payload?.result?.serverInfo || null };
    await this.rawMcpRequest(server, "notifications/initialized", {}, session.id, true);
    this.mcpSessions.set(server.id, session);
    return session;
  }

  async mcpTools(id) {
    const server = (await this.mcpServers()).find(item => item.id === id || item.name.toLowerCase() === String(id).toLowerCase());
    if (!server?.enabled) throw new Error("Enabled MCP server not found.");
    const session = await this.ensureMcpSession(server);
    const response = await this.rawMcpRequest(server, "tools/list", {}, session.id);
    const tools = (response.payload?.result?.tools || []).slice(0, 200).map(item => ({ name: item.name, description: boundedText(item.description, 500), inputSchema: item.inputSchema || {}, readOnly: item.annotations?.readOnlyHint === true, destructive: item.annotations?.destructiveHint === true, allowed: server.allowedTools.includes(item.name) }));
    await this.audit("integration.mcp_tools_listed", { server: server.name, count: tools.length });
    return { server: { id: server.id, name: server.name, url: server.url }, tools, untrustedMetadata: true };
  }

  async callMcpTool({ serverId, tool, arguments: args = {}, approve = false } = {}) {
    const server = (await this.mcpServers()).find(item => item.id === serverId || item.name.toLowerCase() === String(serverId || "").toLowerCase());
    if (!server?.enabled) throw new Error("Enabled MCP server not found.");
    const toolName = boundedText(tool, 120); if (!toolName) throw new Error("An MCP tool name is required.");
    const catalog = await this.mcpTools(server.id), definition = catalog.tools.find(item => item.name === toolName);
    if (!definition) throw new Error("That MCP tool was not advertised by the server.");
    const allowed = server.allowedTools.includes(toolName), automatic = allowed && definition.readOnly && !definition.destructive;
    const preview = { server: server.name, tool: toolName, arguments: sanitize(args), readOnly: definition.readOnly, destructive: definition.destructive, allowListed: allowed, approvalRequired: !automatic, executed: false };
    if (!automatic && !approve) return preview;
    const session = await this.ensureMcpSession(server), startedAt = Date.now();
    const response = await this.rawMcpRequest(server, "tools/call", { name: toolName, arguments: args && typeof args === "object" && !Array.isArray(args) ? args : {} }, session.id);
    const result = sanitize(response.payload?.result || {});
    await this.audit("integration.mcp_tool_called", { server: server.name, tool: toolName, approved: approve, automatic, durationMs: Date.now() - startedAt, isError: result.isError === true }, "owner");
    return { ...preview, executed: true, result, untrustedOutput: true };
  }

  homeAssistantConfig() {
    const url = boundedText(this.env.HOME_ASSISTANT_URL, 500), token = this.env.HOME_ASSISTANT_TOKEN || "";
    return { configured: Boolean(url && token), url, token };
  }

  async homeAssistantStatus(live = false) {
    const config = this.homeAssistantConfig();
    if (!config.configured || !live) return { configured: config.configured, connected: false, capabilities: ["Lights", "Switches", "Climate", "Media"], setup: "Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN as Windows user environment variables." };
    if (this.validateEndpoint) await this.validateEndpoint(config.url, { allowPrivateHttps: true, allowLoopback: true });
    const response = await this.fetch(new URL("/api/", config.url), { headers: { Authorization: `Bearer ${config.token}` }, redirect: "error", signal: AbortSignal.timeout(8000) });
    return { configured: true, connected: response.ok, capabilities: ["Lights", "Switches", "Climate", "Media"] };
  }

  async homeAssistantAction({ domain, service, entityId, data = {}, approve = false } = {}) {
    const allowed = new Set(["light.turn_on", "light.turn_off", "light.toggle", "switch.turn_on", "switch.turn_off", "switch.toggle", "media_player.media_play_pause", "climate.set_temperature"]);
    const action = `${boundedText(domain, 40)}.${boundedText(service, 60)}`;
    if (!allowed.has(action)) throw new Error("That Home Assistant action is not allow-listed.");
    const entity = boundedText(entityId, 160); if (!/^[a-z_]+\.[a-z0-9_]+$/i.test(entity)) throw new Error("Use a valid Home Assistant entity ID.");
    const preview = { action, entityId: entity, data: sanitize(data), approvalRequired: true, executed: false };
    if (!approve) return preview;
    const config = this.homeAssistantConfig(); if (!config.configured) throw new Error("Home Assistant is not configured.");
    if (this.validateEndpoint) await this.validateEndpoint(config.url, { allowPrivateHttps: true, allowLoopback: true });
    const response = await this.fetch(new URL(`/api/services/${domain}/${service}`, config.url), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` }, body: JSON.stringify({ entity_id: entity, ...(data && typeof data === "object" ? data : {}) }), redirect: "error", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Home Assistant returned ${response.status}.`);
    const result = sanitize(await response.json().catch(() => []));
    await this.audit("device.home_assistant_action", { action, entityId: entity }, "owner");
    return { ...preview, executed: true, result };
  }

  async devices({ remoteConfigured = false, githubConfigured = false, browserAutomation = false } = {}) {
    const mcp = await this.mcpServers(), home = await this.homeAssistantStatus(false);
    return {
      devices: [
        { id: "windows-core", name: "Windows laptop core", type: "computer", configured: this.platform === "win32", connected: this.platform === "win32", permissions: ["observe", "approval-gated-control"] },
        { id: "android-companion", name: "Android companion", type: "mobile", configured: remoteConfigured, connected: false, permissions: ["authenticated-chat", "user-started-camera", "notifications-while-open"] },
        { id: "browser", name: "Browser laboratory", type: "browser", configured: browserAutomation, connected: browserAutomation, permissions: ["public-web", "visual-audit"] },
        { id: "github", name: "GitHub", type: "service", configured: true, connected: githubConfigured, permissions: ["public-read", "approval-gated-write"] },
        { id: "home-assistant", name: "Home Assistant", type: "device-hub", configured: home.configured, connected: home.connected, permissions: ["approval-gated-control"] }
      ],
      mcp: { configured: mcp.length, enabled: mcp.filter(item => item.enabled).length },
      generatedAt: new Date().toISOString()
    };
  }

  async securityStatus(extra = {}) {
    const policy = await this.policy(), audit = await this.auditLog(200), learning = await this.learningProfile(), mcp = await this.mcpServers();
    return { policy, safeguards: { secretValuesReturned: false, rawShellAvailableToModel: false, voiceApproval: false, screenRetention: policy.privacy.screenRetention, ownerAuthentication: true, toolAudit: true, mcpAllowLists: true, externalWritesRequireApproval: true }, data: { learningInteractions: learning.interactions, learnedPreferences: learning.preferences.length, auditEvents: audit.length, mcpServers: mcp.length }, ...extra, generatedAt: new Date().toISOString() };
  }

  async privacyExport({ memory = [], knowledge = [] } = {}) {
    return { exportedAt: new Date().toISOString(), security: await this.securityStatus(), learning: await this.learningProfile(), explicitPreferences: (await this.learning()).preferences, memory: sanitize(memory), knowledge: sanitize(knowledge), credentialsIncluded: false };
  }
}

export { DEFAULT_POLICY };
