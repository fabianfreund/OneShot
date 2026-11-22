'use strict';
// Floating capture bar — the window you get when OneShot opens without an image.
const api = window.oneshot;
document.querySelectorAll('[data-capture]').forEach((b) => (b.onclick = () => api.capture(b.dataset.capture)));
document.getElementById('open').onclick = () => api.openImages();
document.getElementById('folder').onclick = () => api.openFolder();
document.getElementById('close').onclick = () => api.closeWindow();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeWindow(); });

// Drop an image on the bar to open it.
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
document.addEventListener('dragleave', () => document.body.classList.remove('drop'));
document.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('drop');
  const f = e.dataTransfer.files[0];
  if (f) api.openPath(api.pathForFile(f));
});
