(function () {
  const button = document.querySelector('#localListen');
  const state = document.querySelector('#voiceState');
  if (!button) return;
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const useRemoteVoice = window.JARVIS_FORCE_REMOTE === true || !localHost;
  if (useRemoteVoice) {
    button.textContent = 'Phone voice';
    button.title = 'Uses this device microphone, then securely sends the recognized command to your laptop JARVIS.';
    button.addEventListener('click', () => {
      const listen = document.querySelector('#listen');
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) { state.textContent = 'Voice recognition is unavailable in this browser. Use Chrome or Edge, or type the command.'; return; }
      listen?.click();
    });
    return;
  }
  let session = null;

  function wavBlob(chunks, inputRate) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const source = new Float32Array(length); let offset = 0;
    for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
    const targetRate = 16000, ratio = inputRate / targetRate, output = new Int16Array(Math.floor(source.length / ratio));
    for (let index = 0; index < output.length; index++) {
      const start = Math.floor(index * ratio), end = Math.min(source.length, Math.floor((index + 1) * ratio)); let sum = 0;
      for (let cursor = start; cursor < end; cursor++) sum += source[cursor];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))); output[index] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    const buffer = new ArrayBuffer(44 + output.byteLength), view = new DataView(buffer);
    const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + output.byteLength, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, output.byteLength, true);
    new Int16Array(buffer, 44).set(output); return new Blob([buffer], { type: 'audio/wav' });
  }

  async function asBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  }

  async function start() {
    const response = await fetch('/api/voice/capabilities');
    if (!response.ok) throw new Error('The laptop voice service is unavailable. Restart JARVIS from Start-JARVIS.cmd.');
    const capabilities = await response.json();
    if (!capabilities.whisper?.configured) throw new Error('Local Whisper is not ready. Restart the JARVIS laptop core after installation.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    const context = new AudioContext(), source = context.createMediaStreamSource(stream), processor = context.createScriptProcessor(4096, 1, 1), chunks = [];
    processor.onaudioprocess = event => { const samples = event.inputBuffer.getChannelData(0); chunks.push(new Float32Array(samples)); let total = 0; for (let index = 0; index < samples.length; index++) total += samples[index] * samples[index]; window.jarvisVoiceLevel = Math.sqrt(total / samples.length); };
    source.connect(processor); processor.connect(context.destination); session = { stream, context, source, processor, chunks, rate: context.sampleRate };
    button.textContent = 'Stop & transcribe'; button.classList.add('recording'); state.textContent = 'Local Whisper recording. Tap again when finished.';
  }

  async function stop() {
    const current = session; session = null; window.jarvisVoiceLevel = 0; current.processor.disconnect(); current.source.disconnect(); current.stream.getTracks().forEach(track => track.stop()); await current.context.close();
    button.textContent = 'Transcribing locally...'; button.disabled = true; state.textContent = 'Whisper is processing on this laptop.';
    try {
      const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataBase64: await asBase64(wavBlob(current.chunks, current.rate)) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Local transcription failed.');
      state.textContent = `Heard locally: ${body.text}`; if (typeof window.respond === 'function') window.respond(body.text);
    } finally { button.disabled = false; button.textContent = 'Local Whisper'; button.classList.remove('recording'); }
  }

  button.addEventListener('click', async () => { try { if (session) await stop(); else await start(); } catch (error) { state.textContent = error.message; button.disabled = false; button.textContent = 'Local Whisper'; session = null; } });
})();
