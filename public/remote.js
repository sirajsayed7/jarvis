(async () => {
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const gate = document.querySelector('#authGate');
  const message = document.querySelector('#authMessage');
  const status = document.querySelector('#remoteStatus');
  const sendButton = document.querySelector('#authSend');
  const passkeySignInButton = document.querySelector('#passkeySignIn');
  const passkeyEnrollButton = document.querySelector('#passkeyEnroll');
  const resendWindowMs = 60_000;
  let sending = false;
  let cooldownTimer;
  let remoteChannel = null;
  let historyLoadedFor = null;
  const nativeFetch = window.fetch.bind(window);
  let config;
  try { config = await fetch('/api/config').then(response => response.json()); } catch { return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true, experimental: { passkey: true } }
  });
  const owner = config.ownerEmail.toLowerCase();
  let session = (await client.auth.getSession()).data.session;

  function secondsRemaining() {
    const sentAt = Number(localStorage.getItem('jarvis_magic_link_sent_at') || 0);
    return Math.max(0, Math.ceil((sentAt + resendWindowMs - Date.now()) / 1000));
  }

  function updateSendButton() {
    const remaining = secondsRemaining();
    if (sending) { sendButton.disabled = true; return; }
    if (remaining > 0) {
      sendButton.disabled = true;
      sendButton.textContent = `Resend available in ${remaining}s`;
      clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(updateSendButton, 1000);
      return;
    }
    sendButton.disabled = false;
    sendButton.textContent = 'Send secure sign-in link';
  }

  function passkeyError(error, fallback) {
    if (error?.code === 'passkey_disabled' || /passkey.*disabled/i.test(error?.message || '')) return 'Passkeys are not enabled in Supabase yet. Complete the one-time dashboard setup first.';
    if (error?.name === 'NotAllowedError') return 'Passkey request cancelled or not available on this device.';
    return error?.message || fallback;
  }

  async function signInWithPasskey() {
    if (!window.PublicKeyCredential) { message.textContent = 'This browser does not support passkeys.'; return; }
    passkeySignInButton.disabled = true;
    message.textContent = 'Approve with your fingerprint, Windows Hello, or device PIN.';
    try {
      const { data, error } = await client.auth.signInWithPasskey();
      if (error) throw error;
      if ((data.user?.email || '').toLowerCase() !== owner) throw new Error('This passkey is not authorized for JARVIS.');
      await activate(data.session);
    } catch (error) {
      message.textContent = passkeyError(error, 'Could not sign in with this passkey.');
    } finally {
      passkeySignInButton.disabled = false;
    }
  }

  async function enrollPasskey() {
    if (isLocal) {
      passkeyEnrollButton.disabled = true;
      try {
        const response = await fetch('/api/auth/passkey-bootstrap', { method: 'POST' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not start local passkey setup.');
        location.assign(body.url);
      } catch (error) {
        document.querySelector('#voiceState').textContent = error.message;
        passkeyEnrollButton.disabled = false;
      }
      return;
    }
    if (!session) { message.textContent = 'Sign in first, then set up a passkey.'; return; }
    passkeyEnrollButton.disabled = true;
    passkeyEnrollButton.textContent = 'Waiting for approval…';
    try {
      const { error } = await client.auth.registerPasskey();
      if (error) throw error;
      passkeyEnrollButton.textContent = 'Passkey ready';
      document.querySelector('#voiceState').textContent = 'Passkey enrolled. You can now sign in without email.';
    } catch (error) {
      passkeyEnrollButton.textContent = 'Set up passkey';
      passkeyEnrollButton.disabled = false;
      document.querySelector('#voiceState').textContent = passkeyError(error, 'Could not enroll this passkey.');
    }
  }

  async function authenticate() {
    if (sending || secondsRemaining() > 0) { updateSendButton(); return; }
    const email = document.querySelector('#authEmail').value.trim().toLowerCase();
    if (email !== owner) { message.textContent = 'This account is not authorized.'; return; }
    sending = true;
    updateSendButton();
    message.textContent = 'Sending secure link...';
    try {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin, shouldCreateUser: false } });
      localStorage.setItem('jarvis_magic_link_sent_at', String(Date.now()));
      if (error) {
        message.textContent = /rate limit/i.test(error.message) ? 'Email sending is temporarily rate-limited. Do not resend yet—check the latest link already sent, then wait before trying again.' : error.message;
      } else {
        message.textContent = 'Check your email for the sign-in link.';
      }
    } catch {
      message.textContent = 'Could not reach the sign-in service. Please try again shortly.';
    } finally {
      sending = false;
      updateSendButton();
    }
  }
  sendButton.addEventListener('click', authenticate);
  passkeySignInButton.addEventListener('click', signInWithPasskey);
  passkeyEnrollButton.addEventListener('click', enrollPasskey);
  updateSendButton();

  async function activate(nextSession) {
    session = nextSession;
    if (!session) {
      passkeyEnrollButton.hidden = !isLocal;
      if (isLocal) passkeyEnrollButton.textContent = 'Set up passkey';
      if (!isLocal) gate.classList.add('visible');
      return;
    }
    if ((session.user.email || '').toLowerCase() !== owner) {
      await client.auth.signOut(); gate.classList.add('visible'); message.textContent = 'This account is not authorized.'; return;
    }
    gate.classList.remove('visible'); status.textContent = isLocal ? 'LOCAL SECURE' : 'REMOTE SECURE';
    passkeyEnrollButton.hidden = false;
    if (isLocal) return;

    const rendered = new Set();
    const renderCommand = (command, live = false) => {
      if (rendered.has(command.id)) return;
      rendered.add(command.id);
      const log = document.querySelector('#log');
      const row = document.createElement('div'); row.innerHTML = `<b>${live ? 'JARVIS REMOTE' : 'RECENT RUN'}</b><span></span>`;
      row.querySelector('span').textContent = `${command.command ? `${command.command} — ` : ''}${command.result || command.status}`;
      log.append(row); log.scrollTop = log.scrollHeight;
    };
    if (historyLoadedFor !== session.user.id) {
      historyLoadedFor = session.user.id;
      const { data: history } = await client.from('jarvis_commands').select('id,command,status,result,created_at').order('created_at', { ascending: false }).limit(12);
      (history || []).reverse().forEach(command => renderCommand(command));
    }
    if (remoteChannel) await client.removeChannel(remoteChannel);
    remoteChannel = client.channel(`jarvis:${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jarvis_commands', filter: `user_id=eq.${session.user.id}` }, payload => {
        const command = payload.new;
        if (!['completed','failed','awaiting_approval'].includes(command.status)) return;
        renderCommand(command, true);
        if (command.result && typeof window.jarvisNotify === 'function') window.jarvisNotify('JARVIS', command.result.slice(0, 500));
        if (command.result && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(command.result.slice(0,900)));
      }).subscribe();

    window.fetch = async (input, options = {}) => {
      if (typeof input === 'string' && input === '/api/chat' && options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const { error } = await client.from('jarvis_commands').insert({ user_id: session.user.id, command: body.message });
        return new Response(JSON.stringify(error ? { error: error.message } : { answer: 'Command queued securely for your laptop.' }), { status: error ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, options);
    };
  }

  client.auth.onAuthStateChange((_event, nextSession) => activate(nextSession));
  await activate(session);
})();
