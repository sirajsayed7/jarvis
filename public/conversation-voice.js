(function () {
  const button = document.querySelector('#conversationMode');
  const state = document.querySelector('#voiceState');
  if (!button || !state) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let active = false, recognition = null, processing = false, restartTimer = null;

  const speaking = () => document.body.dataset.jarvisState === 'speaking' || /speaking/i.test(state.textContent || '');
  const render = text => { state.textContent = text; button.textContent = active ? 'Conversation: On' : 'Conversation mode'; button.classList.toggle('conversation-active', active); button.setAttribute('aria-pressed', String(active)); };

  function stopRecognition() {
    clearTimeout(restartTimer);
    const current = recognition; recognition = null;
    if (current) try { current.stop(); } catch { /* already stopped */ }
  }

  function restart(delay = 350) {
    clearTimeout(restartTimer);
    if (active && !recognition) restartTimer = setTimeout(startRecognition, delay);
  }

  async function handleTranscript(transcript) {
    let command = String(transcript || '').trim();
    if (!command || processing) return;
    if (speaking()) {
      const match = command.match(/\bjarvis\b[\s,.:;!?-]*(.*)/i);
      if (!match) return;
      if (typeof window.stopJarvisSpeech === 'function') window.stopJarvisSpeech(); else document.querySelector('#stopVoice')?.click();
      command = match[1].trim();
      if (!command) { render('Interrupted. I am listening.'); return; }
    }
    processing = true;
    render(`Heard: ${command}`);
    try { await window.respond(command); }
    finally { processing = false; if (active) render(speaking() ? 'Say Jarvis to interrupt.' : 'Conversation mode listening.'); }
  }

  function startRecognition() {
    if (!active || recognition || !Recognition) return;
    const current = new Recognition(); recognition = current;
    current.lang = 'en-US'; current.continuous = true; current.interimResults = true; current.maxAlternatives = 1;
    current.onstart = () => render('Conversation mode listening. Speak naturally.');
    current.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        window.jarvisVoiceLevel = Math.max(Number(window.jarvisVoiceLevel || 0), result.isFinal ? .15 : .35);
        if (result.isFinal) handleTranscript(result[0].transcript);
      }
    };
    current.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { active = false; stopRecognition(); render('Microphone permission is required for conversation mode.'); return; }
      if (active && event.error !== 'aborted') render('Conversation hearing paused. Reconnecting.');
    };
    current.onend = () => { if (recognition === current) recognition = null; window.jarvisVoiceLevel = 0; restart(450); };
    try { current.start(); } catch { recognition = null; restart(700); }
  }

  function enable() {
    if (!Recognition) { render('Continuous speech recognition needs Chrome or Edge.'); return; }
    const wake = document.querySelector('#wakeToggle'); if (/On/i.test(wake?.textContent || '')) wake.click();
    active = true; render('Starting continuous conversation mode.'); startRecognition();
  }

  function disable() { active = false; processing = false; stopRecognition(); window.jarvisVoiceLevel = 0; render('Conversation mode off.'); }
  button.addEventListener('click', () => active ? disable() : enable());
  document.addEventListener('keydown', event => { if (event.altKey && event.key.toLowerCase() === 'j') { event.preventDefault(); active ? disable() : enable(); } });
  window.addEventListener('beforeunload', stopRecognition);
  render('Conversation mode ready.');
})();
