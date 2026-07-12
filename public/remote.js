(async () => {
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const gate = document.querySelector('#authGate');
  const message = document.querySelector('#authMessage');
  const status = document.querySelector('#remoteStatus');
  let config;
  try { config = await fetch('/api/config').then(response => response.json()); } catch { return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
  });
  const owner = config.ownerEmail.toLowerCase();
  let session = (await client.auth.getSession()).data.session;

  async function authenticate() {
    const email = document.querySelector('#authEmail').value.trim().toLowerCase();
    if (email !== owner) { message.textContent = 'This account is not authorized.'; return; }
    message.textContent = 'Sending secure link...';
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    message.textContent = error ? error.message : 'Check your email for the sign-in link.';
  }
  document.querySelector('#authSend').addEventListener('click', authenticate);

  async function activate(nextSession) {
    session = nextSession;
    if (!session) { if (!isLocal) gate.classList.add('visible'); return; }
    if ((session.user.email || '').toLowerCase() !== owner) {
      await client.auth.signOut(); gate.classList.add('visible'); message.textContent = 'This account is not authorized.'; return;
    }
    gate.classList.remove('visible'); status.textContent = 'REMOTE SECURE';
    client.channel(`jarvis:${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jarvis_commands', filter: `user_id=eq.${session.user.id}` }, payload => {
        const command = payload.new;
        if (!['completed','failed','awaiting_approval'].includes(command.status)) return;
        const log = document.querySelector('#log');
        const row = document.createElement('div'); row.innerHTML = '<b>JARVIS REMOTE</b><span></span>';
        row.querySelector('span').textContent = command.result || command.status;
        log.append(row); log.scrollTop = log.scrollHeight;
        if (command.result && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(command.result.slice(0,900)));
      }).subscribe();

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      if (typeof input === 'string' && input === '/api/chat' && options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const { error } = await client.from('jarvis_commands').insert({ user_id: session.user.id, command: body.message });
        return new Response(JSON.stringify(error ? { error: error.message } : { answer: 'Command queued securely for your laptop.' }), { status: error ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, options);
    };
  }

  client.auth.onAuthStateChange((_event, nextSession) => activate(nextSession));
  await activate(session);
})();
