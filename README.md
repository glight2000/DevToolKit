# DevToolkit

A pluggable multi-tool desktop application for developers, built with Electron, React, and TypeScript. Ships with SSH tunnel management, a markdown notebook, an image editor, and a handful of everyday utilities — all accessible from a single sidebar.

![platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)
![electron](https://img.shields.io/badge/electron-33-47848F?logo=electron&logoColor=white)
![react](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)
![typescript](https://img.shields.io/badge/typescript-5-3178C6?logo=typescript&logoColor=white)

---

## Features

### Shell
- Sidebar navigation that switches between tools instantly.
- Light / dark theme with persistent preference.
- System tray integration — closing the main window hides it to the tray; background tasks (SSH tunnels, etc.) keep running. Quit only from the tray menu.
- Single-instance lock so launching the app a second time brings the existing window forward.
- Per-plugin encrypted SQLite databases (AES-256-CBC at the field level, built-in key — designed as "keep honest people honest" protection, not high-security).

### Built-in tools

| Tool | Description |
|------|-------------|
| **SSH Tunnel** | Manage local / remote / dynamic (SOCKS5) SSH tunnels, with real-time traffic stats, auto-reconnect with exponential backoff, auto-start on launch, SSH command import/export, system-terminal launcher, and public-key deployment helpers. |
| **Notebook** | Hierarchical markdown documents with live preview, document locking, and per-document encryption (PBKDF2 + AES-GCM, user-chosen password). |
| **Image Editor** | Canvas-based layered editor (Konva) — paste/open images, add text and shapes, drag / transform / rotate, snap guides, layer panel, undo/redo, export PNG or copy to clipboard. |
| **Crypto Tools** | Password generator, encoding conversions (HTML / URL / Base64 / Unicode), hashing (MD5 / SHA-1/256/512), AES symmetric, RSA asymmetric (keygen, encrypt / decrypt, sign / verify). |
| **Time Tools** | Multi-format live clock, timestamp ↔ date conversion, timezone converter, date-diff calculator. |
| **Translation** | Chinese ↔ English (and more) via the free MyMemory API. Proxied through the main process to avoid CORS. |

---

## Screenshots

> (Add your own screenshots here — e.g. `docs/screenshots/*.png` and reference them with `![ssh](docs/screenshots/ssh.png)`.)

---

## Project layout

```
src/
  shared/                 # Plugin interface contracts shared by main & renderer
  main/                   # Electron main process
    index.ts              # App lifecycle, window, tray, single-instance
    plugin-host.ts        # Plugin registration + lifecycle
    lib/                  # db, crypto, store, constants
    plugins/
      ssh-tunnel/         # SSH tunnel manager (ssh2 + SQLite)
      notebook/           # Markdown notebook (SQLite)
      image-editor/       # Canvas export / import IPC
      crypto-tools/       # MD5 hash IPC
      time-tools/         # (stub — all logic is renderer-side)
      translation/        # MyMemory API proxy
  preload/                # Generic invoke/on IPC bridge
  renderer/
    src/
      App.tsx             # Shell: sidebar + content area
      components/
        shell/            # Sidebar
        common/           # TabBar, Modal, CopyButton
      hooks/              # useTheme
      plugins/
        registry.ts       # Static registry of renderer plugin manifests
        ssh-tunnel/       # SSH tunnel UI
        notebook/         # Notebook UI (tree, editor, encryption flow)
        image-editor/     # Canvas stage, layer panel, properties
        crypto-tools/     # Tabbed crypto tools
        time-tools/       # Tabbed time tools
        translation/      # Split-panel translation UI
resources/
  icon.png                # App icon (256×256)
  tray-icon.png           # Tray icon (32×32)
```

---

## Plugin architecture

Each tool is a plugin consisting of:

1. **Main-process module** (`src/main/plugins/<id>/index.ts`) implementing
   ```ts
   interface PluginMainModule {
     id: string
     name: string
     initialize(ctx: PluginContext): void | Promise<void>
     dispose(): Promise<void>
   }
   ```
   The `PluginContext` gives the plugin a dedicated `better-sqlite3` database handle, an `encrypt` / `decrypt` helper, and a `sendToRenderer` callback.

2. **Renderer manifest** (`src/renderer/src/plugins/<id>/index.tsx` exported via `registry.ts`):
   ```ts
   interface PluginRendererManifest {
     id: string
     name: string
     icon: string                 // lucide-react icon name
     component: React.ComponentType
   }
   ```
   Pages are lazy-loaded so the initial bundle stays small.

**IPC namespacing:** every plugin's IPC channels are prefixed with its id (e.g. `tunnel:list`, `notebook:get-tree`). The preload exposes a generic `window.api.invoke(channel, ...args)` / `window.api.on(channel, cb)` pair, so adding a new plugin never requires touching the preload layer.

---

## Tech stack

- **Electron 33** + **electron-vite** for the build pipeline
- **React 19** + **TypeScript 5**
- **TailwindCSS 3** with CSS variables for runtime theme switching
- **Lucide React** icons
- **ssh2** for all SSH traffic (pure JS, enables accurate byte-level traffic metering)
- **better-sqlite3** for per-plugin persistence, rebuilt for Electron via `@electron/rebuild`
- **Konva** / **react-konva** for the image editor canvas
- **electron-store** for the small app-level settings file (window bounds, theme, active plugin)

---

## Development

```bash
# Install dependencies
npm install

# If Electron downloads are slow, use a mirror:
#   export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# Start the dev server (hot-reload renderer + restart main on changes)
npm run dev

# Production build (to ./out)
npm run build

# Package a distributable (to ./dist)
npm run package
```

The dev build auto-opens DevTools; the app state (SQLite DBs, window bounds, theme) is persisted in the per-user OS config directory:

- **Windows** — `%APPDATA%/DevToolkit/`
- **macOS** — `~/Library/Application Support/DevToolkit/`
- **Linux** — `~/.config/DevToolkit/`

Per-plugin databases live under `<configDir>/databases/<pluginId>.db`.

### Native module rebuild

`better-sqlite3` is a native module and must match Electron's Node ABI. `electron-builder` handles this automatically in `npm run package`. If you hit ABI mismatch errors in `npm run dev`, run:

```bash
npx electron-rebuild -f -w better-sqlite3
```

---

## Packaging & distribution

`npm run package` produces a single installable artifact per platform:

- **Windows** — `dist/DevToolkit Setup <version>.exe` (NSIS, ~80 MB)
- **macOS** — `dist/DevToolkit-<version>.dmg`
- **Linux** — `dist/DevToolkit-<version>.AppImage`

`electron-builder` can only target the current OS; to produce all three you need a CI matrix (e.g. GitHub Actions).

### Code signing

The repo ships **unsigned**. On Windows, first-time users will see a SmartScreen warning (choose "More info" → "Run anyway"). To ship signed builds, add a code-signing certificate config under the `win` / `mac` keys in [electron-builder.yml](electron-builder.yml).

---

## Security notes

- The built-in `APP_ENCRYPTION_KEY` in [src/main/lib/constants.ts](src/main/lib/constants.ts) is **intentionally hardcoded** — its job is to keep casual readers out of a stolen SQLite file, nothing more. Do **not** rely on it for anything that would hurt if it leaked.
- The Notebook plugin's per-document encryption, by contrast, derives its key from a user-chosen password via PBKDF2 (100 000 iterations, SHA-256) and encrypts with AES-GCM. The password itself is never stored — only its SHA-256 hash, used for unlock verification.
- SSH passwords, private key paths, and passphrases are stored in the SSH Tunnel plugin's SQLite file, field-encrypted with the built-in key. If that's not good enough for your threat model, use key-based auth and leave the password field empty.
- The "Deploy Public Key" feature connects via `ssh2`, reads your local `~/.ssh/*.pub`, and appends it to the remote's `~/.ssh/authorized_keys` using a safely-escaped shell command.

---

## License

MIT — see [LICENSE](LICENSE) if present, otherwise do what you like with it.
