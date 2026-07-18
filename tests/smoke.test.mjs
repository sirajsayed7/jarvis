import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { cognitiveToolDefinitions, cognitiveToolPolicy, compactToolResult, parseToolArguments } from "../agent-runtime.mjs";

const port = 5297;
const base = `http://127.0.0.1:${port}`;
let server;
let dataDir;

test.before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "jarvis-smoke-"));
  server = spawn(process.execPath, ["server.mjs"], { cwd: path.resolve("."), env: { ...process.env, PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_PROJECTS_ROOT: dataDir, GROQ_API_KEY: "", GEMINI_API_KEY: "", JARVIS_TEST_WEATHER: "1" }, stdio: "ignore", windowsHide: true });
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
  assert.match(html, /Knowledge engine/);
  assert.match(html, /Continuous monitors/);
  assert.match(html, /Browser laboratory/);
  assert.match(html, /GitHub operations/);
  assert.match(html, /Productivity center/);
  assert.match(html, /Connected services/);
  assert.match(html, /productivity\.js/);
  assert.match(html, /reactorCanvas/);
  assert.match(html, /Live mission intelligence/);
  assert.match(html, /CONTINUITY ACTIVE/);
  assert.match(html, /Cognitive runtime/);
  assert.match(html, /Run doctor/);
  assert.match(html, /inner-rotor rotor-a/);
  assert.match(html, /SYSTEMS &amp; TOOLS/);
  assert.match(html, /hud\.js/);
  assert.match(html, /polish\.css/);
});

test("exposes a bounded cognitive tool runtime and truthful doctor report", async () => {
  assert.equal(cognitiveToolDefinitions.length, 15);
  assert.equal(cognitiveToolPolicy.start_managed_job, "managed");
  assert.deepEqual(parseToolArguments('{"location":"Doha"}'), { location: "Doha" });
  assert.throws(() => parseToolArguments("not-json"), /invalid tool arguments/);
  assert.ok(compactToolResult({ text: "x".repeat(20_000) }).length <= 12_001);
  const capabilities = await fetch(`${base}/api/capabilities`).then(response => response.json());
  assert.equal(capabilities.mode, "cognitive-tool-runtime");
  assert.equal(capabilities.limits.maxRounds, 4);
  assert.equal(capabilities.limits.directShell, false);
  assert.equal(capabilities.tools.length, 15);
  const doctor = await fetch(`${base}/api/doctor`).then(response => response.json());
  assert.equal(doctor.version, "1.0.0");
  assert.equal(doctor.status, "limited");
  assert.ok(doctor.score >= 35 && doctor.score < 85);
  assert.equal(doctor.checks.find(item => item.id === "groq").ok, false);
  const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Jarvis doctor" }) }).then(response => response.json());
  assert.equal(chat.doctor.status, "limited");
  assert.match(chat.answer, /readiness/);
});

test("reports local system status without an AI key", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "system status" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.system.cores >= 1);
  assert.match(body.answer, /memory available/);
});

test("assembles live situational intelligence and conversation state", async () => {
  const situation = await fetch(`${base}/api/situation`).then(response => response.json());
  assert.ok(situation.system.cores >= 1);
  assert.equal(situation.projects.count, 0);
  assert.equal(situation.missions.approvals, 0);
  assert.equal(typeof situation.attention, "number");
  const conversation = await fetch(`${base}/api/conversation?id=test-session`).then(response => response.json());
  assert.equal(conversation.id, "test-session");
  assert.deepEqual(conversation.messages, []);
  const cleared = await fetch(`${base}/api/conversation?id=test-session`, { method: "DELETE" }).then(response => response.json());
  assert.equal(cleared.removed, 0);
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

test("runs the cinematic HUD states and filtered systems deck", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".mission-grid article").count(), 4);
    await page.locator("#systemsDeck summary").click();
    assert.equal(await page.locator(".operation-card:visible").count(), 7);
    await page.locator("[data-deck=personal]").click();
    assert.equal(await page.locator(".operation-card:visible").count(), 3);
    await page.locator("#voiceState").evaluate(node => { node.textContent = "Listening for your command."; });
    await page.waitForTimeout(50);
    assert.equal(await page.locator("body").getAttribute("data-jarvis-state"), "listening");
    assert.match(await page.locator(".hud-core h1").innerText(), /Listening to you/);
    const rotation = await page.evaluate(() => ({ outer: getComputedStyle(document.querySelector('.reactor-arcs')).animationName, inner: getComputedStyle(document.querySelector('.rotor-a')).animationName, durations: ['.halo-outer', '.halo-ticks', '.halo-mid', '.halo-inner', '.reactor-arcs', '.rotor-a', '.rotor-b', '.reactor-scan'].map(selector => getComputedStyle(document.querySelector(selector)).animationDuration) }));
    assert.equal(rotation.outer, "hudSpin");
    assert.equal(rotation.inner, "hudSpinReverse");
    assert.deepEqual(rotation.durations, Array(8).fill("4s"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const beforeMotion = await page.locator('.reactor-arcs').evaluate(node => getComputedStyle(node).transform);
    await page.waitForTimeout(250);
    const afterMotion = await page.locator('.reactor-arcs').evaluate(node => getComputedStyle(node).transform);
    assert.notEqual(afterMotion, beforeMotion);
    assert.equal(await page.locator('.rotor-a').evaluate(node => getComputedStyle(node).animationName), "hudSpinReverse");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const remotePage = await browser.newPage();
    await remotePage.addInitScript(() => { window.JARVIS_FORCE_REMOTE = true; });
    await remotePage.goto(base, { waitUntil: "networkidle" });
    assert.equal(await remotePage.locator("#localListen").innerText(), "Phone voice");
    assert.match(await remotePage.locator("#localListen").getAttribute("title"), /device microphone/);
  } finally { await browser.close(); }
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

test("persists notes, tasks, and restart-safe reminders", async () => {
  const note = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "take a note: Use the production domain for passkeys" }) }).then(response => response.json());
  assert.equal(note.answer, "Note saved.");
  const task = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "add task: Review JARVIS alerts" }) }).then(response => response.json());
  assert.match(task.answer, /Task added/);
  const listed = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "list my tasks" }) }).then(response => response.json());
  assert.match(listed.answer, /Review JARVIS alerts/);
  const completed = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "complete task 1" }) }).then(response => response.json());
  assert.match(completed.answer, /Completed/);
  const reminder = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "remind me on 2099-01-02 at 09:30 to review the roadmap" }) }).then(response => response.json());
  assert.equal(reminder.reminder.kind, "reminder");
  assert.equal(reminder.reminder.enabled, true);
  const summary = await fetch(`${base}/api/productivity`).then(response => response.json());
  assert.equal(summary.counts.notes, 1);
  assert.equal(summary.counts.openTasks, 0);
  assert.equal(summary.counts.activeReminders, 1);
});

test("reports connector readiness without exposing credentials", async () => {
  const connectors = await fetch(`${base}/api/connectors`).then(response => response.json());
  assert.deepEqual(connectors.google.capabilities, ["Gmail", "Google Calendar"]);
  assert.equal(connectors.google.configured, false);
  assert.equal(JSON.stringify(connectors).includes("secret"), false);
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

test("answers weather requests with the live-weather tool path", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "tell me the weather in Doha Qatar right now" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.weather.place, "Doha");
  assert.match(body.answer, /35°C/);
});

test("schedules continuous learning", async () => {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "schedule learning renewable energy daily at 11:45" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.automation.kind, "knowledge");
  assert.equal(body.automation.at, "11:45");
});
