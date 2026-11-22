// Pinned screenshot: a floating always-on-top reference window.
import { api, $, param, loadImage } from './lib.js';

loadImage(param('file')).then(({ url }) => { $('#img').src = url; });
$('#x').onclick = () => api.closeWindow();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeWindow(); });
