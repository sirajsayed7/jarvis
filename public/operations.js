(function () {
  const query = selector => document.querySelector(selector);
  const status = text => { const node = query('#operationStatus'); if (node) node.textContent = text; };
  const value = (selector, label) => { const input = query(selector); const text = input?.value.trim(); if (!text) status(`Enter ${label} first.`); return text; };
  const send = command => { if (typeof window.respond === 'function') window.respond(command); else status('JARVIS is still loading. Try again.'); };
  const bind = (selector, handler) => query(selector)?.addEventListener('click', handler);
  bind('#briefingRun', () => send('briefing'));
  bind('#projectReport', () => { const name = value('#operationProject', 'an exact project name'); if (name) { status(`Generating a saved report for ${name}...`); send(`report for ${name}`); } });
  bind('#projectBuild', () => { const name = value('#operationProject', 'an exact project name'); if (name) { status(`Preparing a build preview for ${name}...`); send(`build ${name}`); } });
  bind('#projectBuildApprove', () => { const name = value('#operationProject', 'an exact project name'); if (name && window.confirm(`Run the approved build script for ${name}?`)) { status(`Running the approved build for ${name}...`); send(`approve build ${name}`); } });
  bind('#researchRun', () => { const question = value('#researchQuery', 'a research question'); if (question) { status('Researching from the laptop...'); send(`research ${question} and save it to memory`); } });
  bind('#memoryHint', () => { const input = query('#input'); if (!input) return; input.value = 'Remember: '; input.focus(); status('Type your note after “Remember:” and send it.'); });
  bind('#pwaPreview', () => { const name = value('#pwaName', 'a PWA name'); if (name) { status(`Preparing a PWA preview for ${name}...`); send(`build PWA called ${name}`); } });
  bind('#pwaApprove', () => { const name = value('#pwaName', 'a PWA name'); if (name && window.confirm(`Create the approved PWA “${name}” in Documents\\Codex\\generated?`)) { status(`Creating the approved PWA ${name}...`); send(`approve build PWA called ${name}`); } });
  bind('#scheduleBriefing', () => { const time = query('#briefingTime')?.value; if (!time) { status('Choose a briefing time first.'); return; } status(`Scheduling the daily briefing for ${time} Qatar time...`); send(`schedule briefing daily at ${time}`); });
})();
