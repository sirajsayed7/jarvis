import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = (process.env.JARVIS_OWNER_EMAIL || "sirajsayed7@gmail.com").toLowerCase();
const localCore = process.env.JARVIS_LOCAL_URL || "http://127.0.0.1:5190";
const automationsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "automations.json");
if (!url || !serviceKey) throw new Error("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the laptop agent.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function loadAutomations() {
  try { return JSON.parse(await readFile(automationsPath, "utf8")); } catch { return []; }
}

async function saveAutomations(automations) {
  await mkdir(path.dirname(automationsPath), { recursive: true });
  await writeFile(automationsPath, JSON.stringify(automations.slice(0, 50), null, 2));
}

let cachedOwner = null;
let ownerCacheExpiresAt = 0;
async function ownerUserId() {
  if (cachedOwner && ownerCacheExpiresAt > Date.now()) return cachedOwner;
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  cachedOwner = data.users.find(user => (user.email || "").toLowerCase() === ownerEmail)?.id || null;
  ownerCacheExpiresAt = Date.now() + 5 * 60 * 1000;
  return cachedOwner;
}

function qatarClock() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { at: `${values.hour}:${values.minute}`, day: `${values.year}-${values.month}-${values.day}` };
}

let schedulerBusy = false;
async function runAutomations() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const automations = await loadAutomations();
    const clock = qatarClock();
    let changed = false;
    for (const automation of automations) {
      if (!automation.enabled || automation.timezone !== "Asia/Qatar") continue;
      const reminder = automation.kind === "reminder";
      if (reminder) {
        const dueAt = new Date(automation.dueAt);
        if (Number.isNaN(dueAt.getTime()) || dueAt > new Date() || automation.lastRunAt) continue;
      } else {
        if (automation.at > clock.at || String(automation.lastRunAt || "").startsWith(clock.day)) continue;
      }
      const runKey = reminder ? new Date().toISOString() : `${clock.day} ${clock.at}`;
      const userId = await ownerUserId();
      if (!userId) throw new Error(`Owner account ${ownerEmail} was not found.`);
      const { error } = await supabase.from("jarvis_commands").insert({ user_id: userId, command: automation.command, status: "queued" });
      if (error) throw error;
      automation.lastRunAt = runKey;
      if (reminder) automation.enabled = false;
      changed = true;
      console.log(`JARVIS automation queued: ${automation.name}`);
    }
    if (changed) await saveAutomations(automations);
  } catch (error) { console.error(`JARVIS scheduler: ${error.message}`); }
  finally { schedulerBusy = false; }
}

async function runAwarenessPulse() {
  try {
    const response = await fetch(`${localCore}/api/pulse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notify: true }), signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`local core returned ${response.status}`);
    const pulse = await response.json();
    if (pulse.changed) console.log(`JARVIS awareness: ${pulse.summary}`);
  } catch (error) { console.error(`JARVIS awareness pulse: ${error.message}`); }
}

async function processCommand(command) {
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(command.user_id);
  if (userError || (userData.user?.email || "").toLowerCase() !== ownerEmail) return;

  const { data: claimed } = await supabase.from("jarvis_commands")
    .update({ status: "running" }).eq("id", command.id).eq("status", "queued").select("id").maybeSingle();
  if (!claimed) return;

  try {
    const response = await fetch(`${localCore}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: command.command })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Local core failed (${response.status}).`);
    const awaitingApproval = body.action?.approvalRequired === true && body.action?.executed !== true;
    await supabase.from("jarvis_commands").update({ status: awaitingApproval ? "awaiting_approval" : "completed", result: body.answer, completed_at: awaitingApproval ? null : new Date().toISOString() }).eq("id", command.id);
  } catch (error) {
    await supabase.from("jarvis_commands").update({ status: "failed", result: error.message, completed_at: new Date().toISOString() }).eq("id", command.id);
  }
}

const { data: pending } = await supabase.from("jarvis_commands").select("*").eq("status", "queued").order("created_at");
for (const command of pending || []) processCommand(command);

supabase.channel("jarvis-laptop-agent")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_commands" }, payload => processCommand(payload.new))
  .subscribe(status => console.log(`JARVIS remote agent: ${status}`));

console.log(`JARVIS laptop agent active for ${ownerEmail}.`);
const schedulerLock = createServer();
schedulerLock.on("error", error => {
  if (error.code === "EADDRINUSE") console.log("JARVIS scheduler standby: another laptop-agent instance owns the scheduler lock.");
  else console.error(`JARVIS scheduler lock: ${error.message}`);
});
schedulerLock.listen(5191, "127.0.0.1", () => {
  console.log("JARVIS scheduler active with offline catch-up.");
  setInterval(runAutomations, 30_000);
  setInterval(runAwarenessPulse, 5 * 60_000);
  runAutomations();
  setTimeout(runAwarenessPulse, 15_000);
});
