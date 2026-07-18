(function () {
  const stateNode = document.querySelector('#voiceState');
  const titleNode = document.querySelector('.hud-core h1');
  const canvas = document.querySelector('#reactorCanvas');
  const clock = document.querySelector('#hudClock');
  const date = document.querySelector('#hudDate');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stateFromText(value) {
    const text = String(value || '').toLowerCase();
    if (/listen|recording|heard locally|wake word/.test(text)) return 'listening';
    if (/think|process|analy|transcrib|research|scan|running/.test(text)) return 'thinking';
    if (/speak/.test(text)) return 'speaking';
    return 'ready';
  }

  function renderState() {
    const current = stateFromText(stateNode?.textContent);
    document.body.dataset.jarvisState = current;
    const labels = { ready: 'Awaiting your command', listening: 'Listening to you', thinking: 'Processing request', speaking: 'Responding' };
    if (titleNode) titleNode.lastChild.textContent = labels[current];
  }
  if (stateNode) new MutationObserver(renderState).observe(stateNode, { childList: true, characterData: true, subtree: true });
  renderState();

  function updateClock() {
    const now = new Date();
    if (clock) clock.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
    if (date) date.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', weekday: 'long', day: '2-digit', month: 'long' }).format(now);
  }
  updateClock(); setInterval(updateClock, 1000);

  const groups = [
    ['intel', ['#operationProject', '#researchQuery', '#knowledgeTopic', '#monitorQuery', '#browserAuditUrl', '#githubRepo', '#doctorRun']],
    ['build', ['#pwaName', '#briefingTime', '#jobGoal']],
    ['device', ['#windowsApp', '#screenPrompt', '#voiceCapabilities']],
    ['personal', ['#commandPhrase', '#productivityText', '#connectorStatus']]
  ];
  const cards = [...document.querySelectorAll('.operation-card')];
  for (const [group, selectors] of groups) for (const selector of selectors) document.querySelector(selector)?.closest('.operation-card')?.setAttribute('data-deck-group', group);
  function filterDeck(group) {
    cards.forEach(card => { card.hidden = group !== 'all' && card.dataset.deckGroup !== group; });
    document.querySelectorAll('[data-deck]').forEach(button => button.classList.toggle('active', button.dataset.deck === group));
  }
  document.querySelectorAll('[data-deck]').forEach(button => button.addEventListener('click', () => filterDeck(button.dataset.deck)));
  filterDeck('intel');

  if (!canvas) return;
  const context = canvas.getContext('2d');
  const points = Array.from({ length: 54 }, (_, index) => ({ angle: Math.random() * Math.PI * 2, radius: .22 + Math.random() * .74, size: .5 + Math.random() * 1.7, speed: (.00008 + Math.random() * .00022) * (index % 2 ? 1 : -1), alpha: .2 + Math.random() * .65 }));
  let width = 560, height = 560, last = performance.now();
  function resize() { const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); width = rect.width; height = rect.height; canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr)); context.setTransform(dpr, 0, 0, dpr, 0, 0); }
  new ResizeObserver(resize).observe(canvas); resize();

  function draw(now) {
    const delta = Math.min(40, now - last); last = now;
    const cx = width / 2, cy = height / 2, radius = Math.min(width, height) / 2;
    const mode = document.body.dataset.jarvisState || 'ready';
    const base = { ready: .12, listening: .42, thinking: .28, speaking: .5 }[mode];
    const voice = Math.min(1, Number(window.jarvisVoiceLevel || 0) * 7);
    const energy = Math.max(base, voice);
    context.clearRect(0, 0, width, height);
    context.save(); context.translate(cx, cy);
    context.strokeStyle = `rgba(62,235,255,${.1 + energy * .2})`; context.lineWidth = 1;
    for (let ring = 0; ring < 4; ring++) {
      context.beginPath(); const r = radius * (.34 + ring * .14); const start = now * .00018 * (ring % 2 ? -1 : 1) + ring;
      context.arc(0, 0, r, start, start + Math.PI * (1.05 + ring * .12)); context.stroke();
    }
    for (const point of points) {
      point.angle += point.speed * delta * (1 + energy * 2); const r = radius * point.radius; const x = Math.cos(point.angle) * r, y = Math.sin(point.angle) * r;
      context.fillStyle = `rgba(62,239,255,${point.alpha * (.45 + energy)})`; context.shadowColor = '#3defff'; context.shadowBlur = 7; context.beginPath(); context.arc(x, y, point.size * (1 + energy * .4), 0, Math.PI * 2); context.fill();
    }
    context.shadowBlur = 0; context.beginPath();
    const waveRadius = radius * .44, samples = 120;
    for (let index = 0; index <= samples; index++) {
      const angle = index / samples * Math.PI * 2, oscillation = Math.sin(angle * 9 + now * .006) * radius * (.006 + energy * .025) + Math.sin(angle * 17 - now * .004) * radius * energy * .009;
      const r = waveRadius + oscillation, x = Math.cos(angle) * r, y = Math.sin(angle) * r; if (!index) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); context.strokeStyle = `rgba(76,244,255,${.3 + energy * .55})`; context.lineWidth = 1.4; context.stroke(); context.restore();
    if (!reduceMotion) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
