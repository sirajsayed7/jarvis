(function () {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const counts = document.querySelector('#productivityCounts');
  const connectors = document.querySelector('#connectorStatus');
  const dateInput = document.querySelector('#reminderDate');
  const enableButton = document.querySelector('#notificationEnable');
  let seen = new Set();

  if (dateInput && !dateInput.value) dateInput.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

  async function showAlert(title, message) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration) await registration.showNotification(title, { body: message, icon: '/jarvis.svg', badge: '/jarvis.svg', tag: `jarvis-${Date.now()}` });
      else new Notification(title, { body: message, icon: '/jarvis.svg' });
      return true;
    } catch { return false; }
  }
  window.jarvisNotify = showAlert;

  function renderPermission() {
    if (!enableButton) return;
    enableButton.textContent = !('Notification' in window) ? 'Alerts unavailable' : Notification.permission === 'granted' ? 'Alerts enabled' : Notification.permission === 'denied' ? 'Alerts blocked' : 'Enable alerts';
    enableButton.disabled = !('Notification' in window) || Notification.permission === 'denied';
  }

  enableButton?.addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission(); renderPermission();
    if (permission === 'granted') {
      await showAlert('JARVIS', 'Browser alerts are operational.');
      if (local) fetch('/api/notifications/test', { method: 'POST' }).catch(() => {});
    }
  });

  async function refreshProductivity() {
    if (!counts) return;
    if (!local) { counts.textContent = 'Remote commands sync securely through the laptop agent.'; return; }
    try {
      const data = await fetch('/api/productivity').then(response => response.json());
      counts.innerHTML = `<b>${data.counts.openTasks} tasks</b><span>${data.counts.notes} notes</span><span>${data.counts.activeReminders} reminders</span>`;
      const latest = data.notifications || [];
      if (!seen.size) seen = new Set(latest.map(item => item.id));
      else for (const item of latest) if (!seen.has(item.id)) { seen.add(item.id); await showAlert(item.title, item.message); }
    } catch { counts.textContent = 'Productivity store is temporarily unavailable.'; }
  }
  window.refreshProductivity = refreshProductivity;

  async function refreshConnectors() {
    if (!connectors) return;
    if (!local) { connectors.textContent = 'Open laptop JARVIS to configure private connectors.'; return; }
    try {
      const data = await fetch('/api/connectors').then(response => response.json());
      connectors.innerHTML = `<b>GitHub: ${data.github.connected ? 'connected' : 'read-only'}</b><span>Google: ${data.google.configured ? 'OAuth ready' : 'setup needed'}</span>`;
    } catch { connectors.textContent = 'Connector status is unavailable.'; }
  }

  renderPermission(); refreshProductivity(); refreshConnectors();
  setInterval(refreshProductivity, 15000);
})();
