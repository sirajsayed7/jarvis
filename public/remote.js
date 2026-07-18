(async () => {
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const gate = document.querySelector('#authGate');
  const message = document.querySelector('#authMessage');
  const status = document.querySelector('#remoteStatus');
  const sendButton = document.querySelector('#authSend');
  const passkeySignInButton = document.querySelector('#passkeySignIn');
  const passkeyEnrollButton = document.querySelector('#passkeyEnroll');
  status.textContent = isLocal ? 'LAPTOP CORE' : 'REMOTE LINK';
  status.title = isLocal ? 'Direct connection to the JARVIS laptop core.' : 'Secure hosted interface relaying commands to the laptop core.';
  const resendWindowMs = 60_000;
  let sending = false;
  let cooldownTimer;
  let remoteChannel = null;
  let historyLoadedFor = null;
  const nativeFetch = window.fetch.bind(window);
  let config;
  try { config = await fetch('/api/config').then(response => response.json()); } catch { return; }
  window.jarvisHostedVisionConfigured = config.hostedVision === true;
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return;
  if (!isLocal) status.title = config.hostedChat ? 'Secure direct conversation is active. Laptop tools use the local core.' : 'Secure conversation is active with laptop fallback when the hosted brain is unavailable.';

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

  function requiresLaptop(message) {
    const text = String(message || '').trim();
    if (!text) return false;
    if (/^(?:laptop|local)\s*:/i.test(text) || /\b(?:on|from|using)\s+my\s+(?:laptop|computer|pc)\b/i.test(text)) return true;
    return [
      /^approve\b/i,
      /^feedback\s*:/i,
      /^export\s+(?:all\s+)?my\s+(?:jarvis\s+)?data\b/i,
      /^(?:scan|inspect|review|summarize)\s+(?:all\s+)?(?:my\s+)?(?:codex\s+)?projects?\b/i,
      /^(?:project\s+report|build\s+preview|verify\s+(?:the\s+)?(?:latest\s+)?code\s+change|list\s+code\s+verifications?)\b/i,
      /^(?:daily|project|owner)\s+briefing\b/i,
      /^(?:run\s+)?(?:test|build|lint)\s+(?:for\s+)?[^?]+$/i,
      /^(?:create|build)\s+(?:a\s+)?pwa\b/i,
      /^(?:open|launch|start)\s+(?:the\s+)?(?:calculator|notepad|file\s+explorer|terminal|edge|settings)\b/i,
      /^(?:system|laptop|computer)\s+status\b/i,
      /^(?:show|list|inspect)\s+(?:my\s+)?(?:open|visible)\s+windows\b/i,
      /^(?:look\s+at|analy[sz]e|capture|inspect)\s+(?:my\s+|the\s+)?screen\b/i,
      /^(?:orchestrate|start\s+(?:a\s+)?job|execute\s+(?:a\s+)?job|list\s+(?:my\s+)?jobs|cancel\s+(?:the\s+)?(?:latest\s+)?job)\b/i,
      /^(?:schedule|automate|pause|resume|delete|list|show)\s+(?:a\s+|the\s+|my\s+|daily\s+)*(?:briefing|research|learning|automation|reminder|task)\b/i,
      /^(?:take\s+(?:a\s+)?note|add\s+(?:a\s+)?task|complete\s+task|remind\s+me|list\s+(?:my\s+)?(?:notes|tasks|reminders))\b/i,
      /^(?:remember|search|recall|find|compress)\s+(?:my\s+)?memory\b/i,
      /^(?:create|open|close|merge|inspect|list)\s+(?:a\s+)?(?:github\s+)?(?:issues?|pull\s+requests?|repository)\b/i,
      /^(?:research|deep\s+research|look\s+up|search\s+(?:the\s+)?web)\b/i,
      /^(?:show|list|check|register|approve\s+register|call|approve\s+call|set|export|feedback).*(?:mcp|integration|device|security|privacy|permission|learning|personalization|home\s+assistant)\b/i,
      /^(?:approve\s+)?home\s+assistant\b/i,
      /\b(?:latest|today|current|right\s+now|at\s+the\s+moment)\b.*\b(?:weather|forecast|news|headlines)\b/i,
      /^(?:what(?:'s|\s+is)|tell\s+me|give\s+me).*\b(?:weather|forecast)\b.*\b(?:in|for)\b/i
    ].some(pattern => pattern.test(text));
  }

  function conversationHistory(currentMessage) {
    const history = [...document.querySelectorAll('#log > div')]
      .filter(row => !row.classList.contains('pending'))
      .map(row => {
        const author = row.querySelector('b')?.textContent?.trim();
        const content = row.querySelector('span')?.textContent?.trim();
        if (!content || !['YOU', 'JARVIS'].includes(author)) return null;
        return { role: author === 'YOU' ? 'user' : 'assistant', content };
      })
      .filter(Boolean)
      .slice(-12);
    const last = history.at(-1);
    if (last?.role === 'user' && last.content === currentMessage) history.pop();
    return history;
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
      if (!isLocal) delete window.jarvisAuthorizedFetch;
      passkeyEnrollButton.hidden = !isLocal;
      if (isLocal) passkeyEnrollButton.textContent = 'Set up passkey';
      if (!isLocal) gate.classList.add('visible');
      return;
    }
    if ((session.user.email || '').toLowerCase() !== owner) {
      await client.auth.signOut(); gate.classList.add('visible'); message.textContent = 'This account is not authorized.'; return;
    }
    gate.classList.remove('visible'); status.textContent = isLocal ? 'LAPTOP CORE · SECURE' : 'REMOTE LINK · SECURE';
    passkeyEnrollButton.hidden = false;
    if (isLocal) return;
    window.jarvisAuthorizedFetch = (input, options = {}) => nativeFetch(input, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` } });

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

    async function relayLaptopCommand(body) {
      const { data: queued, error } = await client.from('jarvis_commands').insert({ user_id: session.user.id, command: body.message }).select('id').single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 750));
        const { data: command } = await client.from('jarvis_commands').select('id,status,result').eq('id', queued.id).maybeSingle();
        if (!command || !['completed', 'failed', 'awaiting_approval'].includes(command.status)) continue;
        rendered.add(command.id);
        const failed = command.status === 'failed';
        return new Response(JSON.stringify(failed ? { error: command.result || 'The laptop operation failed.' } : { answer: command.result || 'The laptop operation is awaiting approval.', mode: 'laptop-operation' }), { status: failed ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ answer: 'I sent that operation to your laptop. I will report the result here as soon as it finishes.', mode: 'laptop-operation-pending' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    }

    window.fetch = async (input, options = {}) => {
      if (typeof input === 'string' && input === '/api/chat' && options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        if (requiresLaptop(body.message)) return relayLaptopCommand(body);
        const hostedResponse = await nativeFetch('/api/converse', {
          ...options,
          headers: { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ ...body, history: conversationHistory(body.message) })
        });
        if (hostedResponse.status !== 503) return hostedResponse;
        const failure = await hostedResponse.clone().json().catch(() => ({}));
        if (failure.code !== 'hosted_chat_unconfigured') return hostedResponse;
        return relayLaptopCommand(body);
      }
      return nativeFetch(input, options);
    };
  }

  client.auth.onAuthStateChange((_event, nextSession) => activate(nextSession));
  await activate(session);
})();
