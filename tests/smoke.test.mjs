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
  assert.match(html, /Windows control/);
  assert.match(html, /Screen perception/);
  assert.match(html, /Local Whisper/);
  assert.match(html, /local-voice\.js/);
  assert.match(html, /Internet & memory/);
  assert.match(html, /Continuous monitors/);
  assert.match(html, /Browser laboratory/);
  assert.match(html, /GitHub operations/);
  assert.match(html, /polish\.css/);
});

test("reports local system status without an AI key", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "system status" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.system.cores >= 1);
  assert.match(body.answer, /memory available/);
});

test("runs persistent orchestrator jobs and pauses sensitive steps", async () => {
  const safe = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: "system status" }) }).then(response => response.json());
  assert.equal(safe.status, "completed");
  assert.equal(safe.steps[0].tool, "system.status");
  assert.equal(safe.steps[0].attempts, 1);
  assert.equal(safe.steps[0].observations[0].ok, true);
  assert.equal(safe.evaluation.verdict, "excellent");
  const guarded = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: "system status and open calculator" }) }).then(response => response.json());
  assert.equal(guarded.status, "awaiting_approval");
  assert.equal(guarded.steps[0].status, "completed");
  assert.equal(guarded.steps[1].status, "awaiting_approval");
  const history = await fetch(`${base}/api/jobs`).then(response => response.json());
  assert.equal(history.length, 2);
  const toolLog = await fetch(`${base}/api/tool-log`).then(response => response.json());
  assert.ok(toolLog.some(item => item.tool === "system.status" && item.ok));
});

test("registers skills, learns commands, and exposes voice provider status", async () => {
  const skill = await fetch(`${base}/api/skills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Morning check", description: "Check the laptop", trigger: "morning check", goalTemplate: "system status" }) }).then(response => response.json());
  assert.equal(skill.name, "Morning check");
  const catalog = await fetch(`${base}/api/skills`).then(response => response.json());
  assert.ok(catalog.some(item => item.id === "project-auditor"));
  assert.ok(catalog.some(item => item.id === skill.id));
  const learned = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "when I say quick check, do system status" }) }).then(response => response.json());
  assert.match(learned.answer, /Learned/);
  const invoked = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "quick check" }) }).then(response => response.json());
  assert.equal(invoked.job.status, "completed");
  const voice = await fetch(`${base}/api/voice/capabilities`).then(response => response.json());
  assert.equal(voice.browserSpeech, true);
  assert.equal(voice.whisper.configured, false);
});

test("retrieves durable memory and blocks private web targets", async () => {
  await fetch(`${base}/api/memory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Project Helios uses a blue deployment environment." }) });
  const memory = await fetch(`${base}/api/memory/search?q=Helios%20deployment`).then(response => response.json());
  assert.equal(memory.length, 1);
  assert.match(memory[0].text, /blue deployment/);
  const compressed = await fetch(`${base}/api/memory/compress`, { method: "POST" }).then(response => response.json());
  assert.equal(compressed.compressed, false);
  const privatePage = await fetch(`${base}/api/web/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1:5297/api/health" }) });
  assert.equal(privatePage.status, 400);
  assert.match((await privatePage.json()).error, /Private/);
});

test("audits the local dashboard in desktop and mobile Edge", async () => {
  const response = await fetch(`${base}/api/browser/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: base, visual: false }) });
  assert.equal(response.status, 200);
  const audit = await response.json();
  assert.equal(audit.reports.length, 2);
  assert.deepEqual(audit.reports.map(item => item.profile), ["desktop", "mobile"]);
  assert.ok(audit.reports.every(item => item.status === 200));
});

test("previews GitHub mutations without a token or side effect", async () => {
  const response = await fetch(`${base}/api/github/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: "sirajsayed7/jarvis", title: "Preview only", body: "No issue should be created.", approve: false }) });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.approvalRequired, true);
  assert.equal(preview.executed, undefined);
  const pullResponse = await fetch(`${base}/api/github/pulls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: "sirajsayed7/jarvis", title: "Preview PR", head: "feature/test", base: "main", body: "No pull request should be created.", approve: false }) });
  assert.equal(pullResponse.status, 200);
  const pull = await pullResponse.json();
  assert.equal(pull.approvalRequired, true);
  assert.equal(pull.head, "feature/test");
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

test("schedules a recurring research monitor", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "schedule research renewable energy policy daily at 10:30" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.automation.kind, "research");
  assert.equal(body.automation.at, "10:30");
});
