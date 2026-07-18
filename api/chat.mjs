const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_ITEM_LENGTH = 1_500;

const SYSTEM_PROMPT = `You are JARVIS, a calm, perceptive personal intelligence.
Lead with the answer. Use short, clear sentences and explain only what matters.
Default to one or two direct sentences; expand only when the user asks.
Use plain text. Avoid decorative filler and unnecessary headings.
Use conversation history to understand follow-up questions.
Be honest about uncertainty and never claim you performed a laptop action.
Laptop actions are handled by a separate, approval-gated local agent.`;

function header(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function send(response, status, body) {
  response.setHeader?.("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function requestBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  return {};
}

export function sanitizeHistory(input, currentMessage = "") {
  if (!Array.isArray(input)) return [];
  const history = input
    .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .map(item => ({ role: item.role, content: item.content.trim().slice(0, MAX_HISTORY_ITEM_LENGTH) }))
    .filter(item => item.content)
    .slice(-MAX_HISTORY_ITEMS);
  const last = history.at(-1);
  if (last?.role === "user" && last.content === currentMessage) history.pop();
  return history;
}

async function verifyOwner(accessToken) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) throw Object.assign(new Error("Remote authentication is not configured."), { status: 503 });
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!authResponse.ok) throw Object.assign(new Error("Your JARVIS session has expired. Please sign in again."), { status: 401 });
  const user = await authResponse.json();
  const owner = String(process.env.JARVIS_OWNER_EMAIL || "sirajsayed7@gmail.com").toLowerCase();
  if (String(user.email || "").toLowerCase() !== owner) throw Object.assign(new Error("This account is not authorized for JARVIS."), { status: 403 });
  return user;
}

async function groqChat(message, history) {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw Object.assign(new Error("Hosted conversation is not configured yet."), { status: 503, code: "hosted_chat_unconfigured" });
  const configured = process.env.JARVIS_GROQ_MODEL || DEFAULT_MODEL;
  const candidates = [...new Set([configured, DEFAULT_MODEL, "openai/gpt-oss-120b"])];
  let lastError;
  for (const model of candidates) {
    const provider = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_completion_tokens: 900,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history, { role: "user", content: message }]
      }),
      signal: AbortSignal.timeout(45_000)
    });
    if (provider.ok) {
      const payload = await provider.json();
      const answer = String(payload.choices?.[0]?.message?.content || "").trim();
      if (!answer) throw new Error("The reasoning provider returned an empty response.");
      return { answer, model };
    }
    const detail = await provider.json().catch(() => ({}));
    lastError = new Error(String(detail?.error?.message || `Groq request failed (${provider.status}).`).slice(0, 500));
    if (![400, 404, 422].includes(provider.status)) break;
  }
  throw lastError || new Error("The hosted reasoning provider is unavailable.");
}

export default async function handler(request, response) {
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
  try {
    const authorization = String(header(request, "authorization") || "");
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return send(response, 401, { error: "Authentication is required." });
    await verifyOwner(accessToken);
    const body = requestBody(request);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > MAX_MESSAGE_LENGTH) return send(response, 400, { error: "Please provide a valid message." });
    const history = sanitizeHistory(body.history, message);
    const completion = await groqChat(message, history);
    return send(response, 200, { answer: completion.answer, mode: "hosted-conversation", model: completion.model });
  } catch (error) {
    return send(response, Number(error.status) || 503, { error: error.message || "Hosted conversation failed.", code: error.code });
  }
}
