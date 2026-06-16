// Minimal preload — context-isolated. Exposes a tiny marker so the web app can
// detect it's running inside the desktop shell if it ever needs to.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('kynexDesktop', { isDesktop: true, platform: process.platform });
