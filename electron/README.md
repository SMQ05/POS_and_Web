# Kynex Pharmacloud — Windows Desktop App (Electron)

A thin Electron shell around the web app, with a keyboard-shortcut menu for every
major function and a Windows installer (.exe).

## Build the installer (needs a machine with working npm + Windows, or Wine)

```bash
npm install                 # installs electron + electron-builder (devDeps)
npm run electron:build      # produces dist-electron/KynexPharmacloud-Setup-<ver>.exe
```

> The .exe **cannot be built in the sandboxed dev container** (no npm registry
> access). Run the commands above on a normal dev machine / CI.

## Run in dev (loads the live site)

```bash
npm run electron:dev
```

By default it loads **https://pos.kynexsolutions.com**. To point at a local build or
dev server:

```bash
KYNEX_APP_URL=http://localhost:5173 npm run electron:dev
```

## Shortcuts (Ctrl on Windows/Linux, Cmd on macOS)

| Function | Shortcut |  | Function | Shortcut |
|---|---|---|---|---|
| Dashboard | Ctrl+1 |  | Alerts | Ctrl+Shift+A |
| POS Billing | Ctrl+2 |  | Reconcile | Ctrl+Shift+R |
| Sales | Ctrl+3 |  | Day Close | Ctrl+Shift+D |
| Inventory | Ctrl+4 |  | Promise Orders | Ctrl+Shift+P |
| Medicines | Ctrl+5 |  | Inbox | Ctrl+Shift+I |
| Suppliers | Ctrl+6 |  | Expenses | Ctrl+Shift+E |
| Purchase Orders | Ctrl+7 |  | Settings | Ctrl+, |
| Customers | Ctrl+8 |  | Print | Ctrl+P |
| Reports | Ctrl+9 |  | Reload | Ctrl+R |

Navigation uses the History API (`pushState` + `popstate`), so it routes inside the
SPA with no full reload — no changes to the web app are required.

## Files
- `electron/main.cjs` — main process: window, menu, shortcuts, external-link handling.
- `electron/preload.cjs` — context-isolated preload (exposes `window.kynexDesktop`).
- `electron-builder.json` — Windows NSIS installer config.
