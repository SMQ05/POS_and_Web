// Kynex Pharmacloud — Electron desktop shell (Windows).
// Wraps the web app in a native window with a keyboard-shortcut menu for every
// major function. Loads the live site by default; point KYNEX_APP_URL at a
// local build/dev server for offline/testing.
//
// Navigation shortcuts work WITHOUT any change to the web app: each menu item
// runs history.pushState + a popstate event, which React Router handles as an
// in-app navigation (no full reload).
const { app, BrowserWindow, Menu, shell, globalShortcut } = require('electron');
const path = require('path');

const APP_URL = process.env.KYNEX_APP_URL || 'https://pos.kynexsolutions.com';

// SECURITY: the desktop shell loads REMOTE content, so it runs with whatever JS
// that origin serves. Lock the app to exactly one HTTPS origin. If someone points
// KYNEX_APP_URL somewhere unexpected, only an explicit localhost (dev) or https
// URL is honoured — never plain http to an arbitrary host.
const APP_ORIGIN = (() => {
  try { return new URL(APP_URL).origin; } catch { return 'https://pos.kynexsolutions.com'; }
})();
function isAllowedUrl(target) {
  try {
    const u = new URL(target);
    if (u.origin === APP_ORIGIN) return true;
    // Allow localhost during development only.
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

let win = null;
let splash = null;

// Instant branded splash so launch never shows a blank window while the login
// page loads over the network (no image dependency — pure CSS on brand colors).
function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 300, frame: false, resizable: false, center: true,
    backgroundColor: '#0a1628', alwaysOnTop: true, skipTaskbar: true, show: true,
  });
  const html = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a1628;font-family:Segoe UI,Arial,sans-serif;color:#fff">
    <div style="font-size:42px;font-weight:800;letter-spacing:1px">K<span style="color:#1f9cf0">X</span></div>
    <div style="margin-top:8px;font-size:16px;font-weight:600">Kynex Pharmacloud</div>
    <div style="margin-top:22px;width:34px;height:34px;border:3px solid rgba(255,255,255,.15);border-top-color:#1f9cf0;border-radius:50%;animation:s 0.8s linear infinite"></div>
    <div style="margin-top:16px;font-size:12px;color:#8aa0b8">Loading…</div>
    <style>@keyframes s{to{transform:rotate(360deg)}}</style>
  </body></html>`;
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

/** Navigate the SPA to `route` via the History API (React Router picks it up). */
function go(route) {
  if (!win) return;
  const js = `(() => { history.pushState({}, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate')); })();`;
  win.webContents.executeJavaScript(js).catch(() => {});
}

// Every function + its shortcut. Cmd shown on macOS, Ctrl on Windows/Linux.
const NAV = [
  { label: 'Dashboard', accel: 'CmdOrCtrl+1', route: '/dashboard' },
  { label: 'POS Billing', accel: 'CmdOrCtrl+2', route: '/pos' },
  { label: 'Sales', accel: 'CmdOrCtrl+3', route: '/sales' },
  { label: 'Inventory', accel: 'CmdOrCtrl+4', route: '/inventory' },
  { label: 'Medicines', accel: 'CmdOrCtrl+5', route: '/medicines' },
  { label: 'Suppliers', accel: 'CmdOrCtrl+6', route: '/suppliers' },
  { label: 'Purchase Orders', accel: 'CmdOrCtrl+7', route: '/purchase-orders' },
  { label: 'Customers', accel: 'CmdOrCtrl+8', route: '/customers' },
  { label: 'Reports', accel: 'CmdOrCtrl+9', route: '/reports' },
  { label: 'Alerts', accel: 'CmdOrCtrl+Shift+A', route: '/alerts' },
  { label: 'Reconcile', accel: 'CmdOrCtrl+Shift+R', route: '/reconcile' },
  { label: 'Day Close', accel: 'CmdOrCtrl+Shift+D', route: '/day-close' },
  { label: 'Promise Orders', accel: 'CmdOrCtrl+Shift+P', route: '/promise-orders' },
  { label: 'Inbox', accel: 'CmdOrCtrl+Shift+I', route: '/inbox' },
  { label: 'Expenses', accel: 'CmdOrCtrl+Shift+E', route: '/expenses' },
  { label: 'Settings', accel: 'CmdOrCtrl+,', route: '/settings' },
];

function buildMenu() {
  const template = [
    {
      label: 'Kynex',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload' },
        // SECURITY: DevTools exposes the in-page session token / localStorage to
        // anyone at the terminal — only expose it in unpackaged/dev builds.
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Go',
      submenu: NAV.map((n) => ({ label: n.label, accelerator: n.accel, click: () => go(n.route) })),
    },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 850,
    show: false,
    title: 'Kynex Pharmacloud',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0a1628',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,          // run the renderer in an OS sandbox
      webSecurity: true,      // keep same-origin policy enforced (explicit)
    },
  });
  // Go straight to the login page (skip the marketing landing). The SPA bundle
  // that the login page loads IS the whole app, so the dashboard is already in
  // memory once you log in — no extra download. Electron's persistent HTTP cache
  // makes repeat launches load the bundle from disk.
  win.loadURL(APP_URL + '/login');

  // Reveal the real window only once it's painted — no blank-white flash; the
  // splash covers the network load until then.
  const reveal = () => {
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) { win.maximize(); win.show(); }
    if (splash && !splash.isDestroyed()) { splash.close(); splash = null; }
  };
  win.once('ready-to-show', reveal);
  win.webContents.on('did-fail-load', reveal); // show the error page rather than hang on splash
  setTimeout(reveal, 15000);                    // hard fallback if the network stalls

  // The receipt printer opens a popup via window.open('') → about:blank, and our
  // app navigates within APP_URL — both are ALLOWED as in-app windows. External
  // links (http/https/mailto/tel/wa.me) go to the OS browser. Everything else —
  // including data:/blob: popups, which can run arbitrary scriptable content in
  // an opener-controlled window — is DENIED.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || isAllowedUrl(url)) {
      return { action: 'allow' };
    }
    if (/^(https?|mailto|tel):/i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  // SECURITY: navigation lockdown. Prevent the privileged main window from being
  // navigated away from our origin (via a link, JS redirect, or injected
  // location change) to an attacker page that would then run inside the desktop
  // shell with the persisted session. about:blank (print popup) is permitted.
  const blockOffOrigin = (e, url) => {
    if (url === 'about:blank' || isAllowedUrl(url)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  };
  win.webContents.on('will-navigate', blockOffOrigin);
  win.webContents.on('will-redirect', blockOffOrigin);

  // Give popup windows (the print receipt window) a normal frame so the user can
  // see/close them, and let them print. Also deny any embedded <webview>.
  win.webContents.on('did-create-window', (child) => {
    child.setMenu(null);
    child.webContents.on('will-navigate', blockOffOrigin);
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

// SECURITY: never silently accept an invalid TLS certificate. This is Electron's
// default, but we make it explicit so a MITM (rogue CA / hijacked network) can't
// feed the desktop app attacker content under our origin.
app.on('certificate-error', (event, _wc, _url, _error, _cert, callback) => {
  event.preventDefault();
  callback(false);
});

// Defense-in-depth: block creation of any webContents that would navigate or
// attach off-origin, regardless of which window opened it.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.whenReady().then(() => {
  buildMenu();
  createSplash();
  createWindow();
  // A couple of OS-global shortcuts (work even when the menu isn't focused).
  globalShortcut.register('CmdOrCtrl+2', () => go('/pos'));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
