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

let win = null;

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
        { role: 'toggleDevTools' },
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.maximize();
  win.show();
  win.loadURL(APP_URL);

  // Open external links (mailto, wa.me, etc.) in the OS browser, not the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  // A couple of OS-global shortcuts (work even when the menu isn't focused).
  globalShortcut.register('CmdOrCtrl+2', () => go('/pos'));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
