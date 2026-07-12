import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 5297;
const base = `http://127.0.0.1:${port}`;
let server;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "jarvis-smoke-"));
  server = spawn(process.execPath, ["server.mjs"], { cwd: path.resolve("."), env: { ...process.env, PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_PROJECTS_ROOT: dataDir, GROQ_API_KEY: "", GEMINI_API_KEY: "" }, stdio: "ignore", windowsHide: true });
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("JARVIS smoke server did not start.");
});

test.after(async () => {
  server?.kill();
  await rm(dataDir, { recursive: true, force: true });
});

test("serves the healthy PWA and operations dashboard", async () => {
  const health = await fetch(`${base}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  const html = await fetch(base).then(response => response.text());
  assert.match(html, /JARVIS OPERATIONS/);
  assert.match(html, /Automation engine/);
  assert.match(html, /polish\.css/);
});

test("creates, pauses, and deletes an automation", async () => {
  const created = await fetch(`${base}/api/automations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "briefing", at: "08:00" }) }).then(response => response.json());
  assert.equal(created.at, "08:00");
  assert.equal(created.enabled, true);
  const paused = await fetch(`${base}/api/automations/${created.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) }).then(response => response.json());
  assert.equal(paused.enabled, false);
  const removed = await fetch(`${base}/api/automations/${created.id}`, { method: "DELETE" }).then(response => response.json());
  assert.equal(removed.deleted, created.id);
  const remaining = await fetch(`${base}/api/automations`).then(response => response.json());
  assert.deepEqual(remaining, []);
});

test("schedules through the natural-language command path without an AI key", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "schedule briefing daily at 09:15" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.automation.at, "09:15");
  assert.match(body.answer, /Qatar time/);
});
