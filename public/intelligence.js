(function () {
  const $ = selector => document.querySelector(selector);
  const local = !window.JARVIS_FORCE_REMOTE && /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(location.hostname);
  const status = (text, level = '') => { const node = $('#operationStatus'); if (node) { node.textContent = text; node.dataset.level = level; } };
  const cardStatus = (selector, text, level = '') => { const node = $(selector); if (node) { node.textContent = text; node.dataset.level = level; } };
  const send = command => typeof window.respond === 'function' ? window.respond(command) : status('JARVIS is still loading.');
  const bind = (selector, handler) => $(selector)?.addEventListener('click', handler);
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  };
  const concise = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  async function localOrCommand(url, command, options) {
    if (!local) { send(command); return null; }
    const body = await request(url, options);
    status(concise(body));
    return body;
  }

  bind('#learningProfile', async () => {
    try {
      if (!local) return send('show my learning profile');
      const profile = await request('/api/learning');
      const preferences = profile.preferences?.map(item => item.value).slice(0, 5) || [];
      const summary = `${profile.interactions || 0} interactions · ${profile.feedback?.positive || 0} helpful · ${profile.feedback?.negative || 0} needs work${preferences.length ? ` · Preferences: ${preferences.join('; ')}` : ''}`;
      cardStatus('#learningStatus', summary, 'good'); status(summary, 'good');
    } catch (error) { cardStatus('#learningStatus', error.message, 'bad'); }
  });
  bind('#learningPositive', async () => { try { await localOrCommand('/api/learning/feedback', 'feedback: good', { method: 'POST', body: JSON.stringify({ rating: 1, correction: '', context: 'dashboard' }) }); cardStatus('#learningStatus', 'Feedback saved locally.', 'good'); } catch (error) { cardStatus('#learningStatus', error.message, 'bad'); } });
  bind('#learningNegative', async () => { try { await localOrCommand('/api/learning/feedback', 'feedback: bad', { method: 'POST', body: JSON.stringify({ rating: -1, correction: '', context: 'dashboard' }) }); cardStatus('#learningStatus', 'Feedback saved. JARVIS will adjust future choices.', 'warn'); } catch (error) { cardStatus('#learningStatus', error.message, 'bad'); } });
  bind('#learningDelete', async () => {
    if (!confirm('Delete JARVIS interaction learning and explicit preferences? Conversation history is separate.')) return;
    try { await localOrCommand('/api/learning', 'approve reset my learning profile', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE LEARNING PROFILE' }) }); cardStatus('#learningStatus', 'Learning profile reset.', 'good'); } catch (error) { cardStatus('#learningStatus', error.message, 'bad'); }
  });

  bind('#deviceMesh', async () => {
    try {
      if (!local) return send('list connected devices');
      const body = await request('/api/devices');
      const summary = body.devices?.map(item => `${item.name}: ${item.connected ? 'connected' : item.configured ? 'configured' : 'not configured'}`).join(' · ') || 'No connected devices.';
      status(summary, 'good');
    } catch (error) { status(error.message, 'bad'); }
  });
  bind('#mcpList', () => localOrCommand('/api/integrations/mcp', 'list MCP integrations').catch(error => status(error.message, 'bad')));
  async function registerMcp(approve) {
    const name = $('#mcpName')?.value.trim(), url = $('#mcpUrl')?.value.trim(), tokenEnv = $('#mcpTokenEnv')?.value.trim();
    if (!name || !url) return status('Enter a trusted integration name and HTTPS MCP URL.', 'warn');
    if (!local) return send(`${approve ? 'approve ' : ''}register MCP server ${name} at ${url}${tokenEnv ? ` using token env ${tokenEnv}` : ''}`);
    try {
      const body = await request('/api/integrations/mcp', { method: 'POST', body: JSON.stringify({ name, url, tokenEnv, approve }) });
      status(approve ? `${body.name} connected. Credentials remain in ${body.tokenEnv || 'no token variable'}.` : `Preview ready for ${name}. Approval is required to save it.`, approve ? 'good' : 'warn');
    } catch (error) { status(error.message, 'bad'); }
  }
  bind('#mcpPreview', () => registerMcp(false));
  bind('#mcpApprove', () => { if (confirm('Trust and connect this MCP server? Its tools remain subject to JARVIS approval policy.')) registerMcp(true); });

  bind('#homeStatus', async () => {
    try {
      if (!local) return send('Home Assistant status');
      const body = await request('/api/devices/home-assistant');
      status(body.configured ? `Home Assistant is configured${body.connected ? ' and connected' : ''}.` : 'Home Assistant is not configured yet.', body.configured ? 'good' : 'warn');
    } catch (error) { status(error.message, 'bad'); }
  });
  function homeAction(approve) {
    const entityId = $('#homeEntity')?.value.trim(), service = $('#homeAction')?.value, domain = entityId?.split('.')[0];
    if (!entityId) return status('Enter an allow-listed Home Assistant entity.', 'warn');
    if (!local) return send(`${approve ? 'approve ' : ''}Home Assistant ${domain}.${service} ${entityId}`);
    request('/api/devices/home-assistant/action', { method: 'POST', body: JSON.stringify({ domain, service, entityId, approve }) }).then(body => status(body.approvalRequired ? `Preview: ${service} ${entityId}. Approval is required.` : `${entityId} updated.`, body.approvalRequired ? 'warn' : 'good')).catch(error => status(error.message, 'bad'));
  }
  bind('#homePreview', () => homeAction(false));
  bind('#homeApprove', () => { if (confirm('Allow this physical device action now?')) homeAction(true); });

  async function securityStatus() {
    try {
      if (!local) return send('show security status');
      const body = await request('/api/security');
      const summary = `${body.policy?.privacy?.localFirst ? 'Local-first' : 'Cloud-enabled'} · sensitive actions require approval · voice approval blocked · ${body.data?.auditEvents || 0} audit events`;
      cardStatus('#securityStatus', summary, 'good'); status(summary, 'good');
      if (body.policy?.privacy) { $('#interactionLearning').checked = body.policy.privacy.interactionLearning !== false; $('#conversationHistory').checked = body.policy.privacy.conversationHistory !== false; }
    } catch (error) { cardStatus('#securityStatus', error.message, 'bad'); }
  }
  bind('#securityCheck', securityStatus);
  bind('#auditShow', () => localOrCommand('/api/security/audit?limit=30', 'show security audit').catch(error => status(error.message, 'bad')));
  bind('#privacyExport', async () => {
    if (!local) return send('export my JARVIS data');
    try {
      const body = await request('/api/privacy/export');
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `jarvis-owner-data-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
      status('Private owner-data export prepared. Credentials were not included.', 'good');
    } catch (error) { status(error.message, 'bad'); }
  });
  async function updatePrivacy(key, checked) {
    try {
      if (!local) return send(`set ${key === 'interactionLearning' ? 'learning' : 'conversation history'} ${checked ? 'on' : 'off'}`);
      await request('/api/security/privacy', { method: 'PATCH', body: JSON.stringify({ [key]: checked }) });
      status(`${key === 'interactionLearning' ? 'Interaction learning' : 'Conversation history'} ${checked ? 'enabled' : 'disabled'}.`, 'good');
    } catch (error) { status(error.message, 'bad'); }
  }
  $('#interactionLearning')?.addEventListener('change', event => updatePrivacy('interactionLearning', event.target.checked));
  $('#conversationHistory')?.addEventListener('change', event => updatePrivacy('conversationHistory', event.target.checked));
  if (local) securityStatus(); else cardStatus('#securityStatus', 'Managed securely by the laptop core.', 'good');
})();
