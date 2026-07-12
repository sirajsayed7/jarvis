const visionForm = document.querySelector('#visionForm');
visionForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.querySelector('#visionFile').files[0];
  const output = document.querySelector('#visionResult');
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { output.textContent = 'Choose a file smaller than 8 MB.'; return; }
  output.textContent = 'Analyzing with Gemini...';
  const dataBase64 = (await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); }));
  try {
    const response = await fetch('/api/analyze-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: document.querySelector('#visionPrompt').value, mimeType: file.type, dataBase64 }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Analysis failed.');
    output.textContent = body.analysis;
  } catch (error) { output.textContent = error.message; }
});
