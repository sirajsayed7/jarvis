(function () {
  const $ = selector => document.querySelector(selector);
  const local = !window.JARVIS_FORCE_REMOTE && /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(location.hostname);
  const output = $('#visionResult'), video = $('#visionPreview'), canvas = $('#visionFrame'), privacy = $('#visionPrivacy');
  let stream = null, timer = null, lastSample = null, analyzing = false;
  const setOutput = text => { if (output) output.textContent = text; };
  const dataUrlToBase64 = dataUrl => String(dataUrl).split(',')[1];
  const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(dataUrlToBase64(reader.result)); reader.onerror = () => reject(new Error('Could not read that image.')); reader.readAsDataURL(file); });

  async function analyze({ prompt, mimeType, dataBase64 }) {
    const url = local ? '/api/analyze-file' : '/api/perceive';
    const requester = local ? fetch.bind(window) : window.jarvisAuthorizedFetch;
    if (!requester) throw new Error('Sign in before using remote visual perception.');
    if (!local && window.jarvisHostedVisionConfigured === false) throw new Error('Remote vision needs GEMINI_API_KEY in the Vercel production environment. Laptop vision remains available locally.');
    const response = await requester(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, mimeType, dataBase64 }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Vision request failed (${response.status}).`);
    return body.analysis;
  }

  $('#visionForm')?.addEventListener('submit', async event => {
    event.preventDefault(); const file = $('#visionFile')?.files?.[0];
    if (!file) return; const maxBytes = (local ? 8 : 3) * 1024 * 1024; if (file.size > maxBytes) return setOutput(`Choose an image smaller than ${local ? 8 : 3} MB${local ? '' : ' for secure remote analysis'}.`);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setOutput('Use a PNG, JPEG, or WebP image.');
    setOutput('Analyzing the image securely...');
    try { setOutput(await analyze({ prompt: $('#visionPrompt')?.value.trim() || 'Describe the important visible information concisely.', mimeType: file.type, dataBase64: await readFile(file) })); }
    catch (error) { setOutput(error.message); }
  });

  function sampleFrame(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data, sample = [];
    const stride = Math.max(4, Math.floor((width * height) / 320) * 4);
    for (let index = 0; index < pixels.length; index += stride) sample.push((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3);
    return sample;
  }
  function changedEnough(next) {
    if (!lastSample || next.length !== lastSample.length) { lastSample = next; return true; }
    const difference = next.reduce((sum, value, index) => sum + Math.abs(value - lastSample[index]), 0) / next.length;
    lastSample = next; return difference >= 7;
  }
  function frameBlob() {
    const maxWidth = 960, ratio = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    canvas.width = Math.max(1, Math.round((video.videoWidth || maxWidth) * ratio));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 540) * ratio));
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { context, blob: new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .78)) };
  }
  async function observe(force = false) {
    if (!stream || analyzing || document.hidden) return;
    analyzing = true; $('#cameraAnalyze').disabled = true;
    try {
      const { context, blob: pendingBlob } = frameBlob(); const sample = sampleFrame(context, canvas.width, canvas.height);
      if (!force && !changedEnough(sample)) { setOutput('Scene unchanged. No frame sent.'); return; }
      lastSample = sample; setOutput('Observing the current scene...'); const blob = await pendingBlob;
      if (!blob) throw new Error('Could not capture a camera frame.');
      const dataBase64 = await readFile(new File([blob], 'camera-frame.jpg', { type: 'image/jpeg' }));
      setOutput(await analyze({ prompt: $('#cameraPrompt')?.value.trim() || 'Describe what is relevant in this scene. Be concise.', mimeType: 'image/jpeg', dataBase64 }));
    } catch (error) { setOutput(error.message); }
    finally { analyzing = false; if (stream) $('#cameraAnalyze').disabled = false; }
  }
  function resetTimer() {
    clearInterval(timer); timer = null; const seconds = Number($('#cameraInterval')?.value || 0);
    if (stream && seconds > 0) timer = setInterval(() => observe(false), seconds * 1000);
  }
  async function startCamera() {
    if (stream) return; if (!navigator.mediaDevices?.getUserMedia) return setOutput('Camera access is not supported in this browser.');
    try {
      const facing = $('#cameraFacing')?.value || 'environment';
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.dataset.facing = facing;
      video.srcObject = stream; video.hidden = false; await video.play(); privacy.dataset.active = 'true'; privacy.querySelector('span').textContent = 'CAMERA ACTIVE';
      $('#cameraStart').disabled = true; $('#cameraAnalyze').disabled = false; $('#cameraStop').disabled = false; lastSample = null; resetTimer(); setOutput('Camera active. JARVIS observes only when requested or at the selected interval.');
    } catch (error) { setOutput(error.name === 'NotAllowedError' ? 'Camera permission was not granted.' : `Camera could not start: ${error.message}`); }
  }
  function stopCamera(reason = 'Camera stopped. No frames are retained.') {
    clearInterval(timer); timer = null; stream?.getTracks().forEach(track => track.stop()); stream = null; lastSample = null;
    if (video) { video.pause(); video.srcObject = null; video.hidden = true; } if (privacy) { privacy.dataset.active = 'false'; privacy.querySelector('span').textContent = 'CAMERA OFF'; }
    if ($('#cameraStart')) $('#cameraStart').disabled = false; if ($('#cameraAnalyze')) $('#cameraAnalyze').disabled = true; if ($('#cameraStop')) $('#cameraStop').disabled = true; setOutput(reason);
  }
  $('#cameraStart')?.addEventListener('click', startCamera); $('#cameraAnalyze')?.addEventListener('click', () => observe(true)); $('#cameraStop')?.addEventListener('click', () => stopCamera()); $('#cameraInterval')?.addEventListener('change', resetTimer);
  document.querySelector('.vision')?.addEventListener('toggle', event => { if (!event.target.open && stream) stopCamera('Camera stopped because the visual perception panel was closed.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stopCamera('Camera stopped when JARVIS left the foreground.'); });
  addEventListener('pagehide', () => stopCamera('Camera stopped.'));
})();
