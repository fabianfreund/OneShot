'use strict';
// Pinned screenshot: a floating always-on-top reference window.
const api = window.oneshot;
const file = new URLSearchParams(location.search).get('file');
api.readImage(file).then((r) => { document.getElementById('img').src = URL.createObjectURL(new Blob([r.data], { type: r.mime })); });
document.getElementById('x').onclick = () => api.closeWindow();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeWindow(); });
