# DevToolkit

A pluggable multi-tool desktop application for developers, built with Electron, React, and TypeScript. Ships with SSH tunnel management, a markdown notebook, and a handful of everyday utilities — all accessible from a single sidebar.

**English** | [简体中文](./README.zh-CN.md)

![platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)
![electron](https://img.shields.io/badge/electron-44-47848F?logo=electron&logoColor=white)
![react](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white)
![typescript](https://img.shields.io/badge/typescript-7-3178C6?logo=typescript&logoColor=white)

---

## Features

### Shell

- Sidebar navigation that switches between tools instantly.
- Keyboard-friendly dialogs (Escape to close, focus restored), scrollable tool tabs (arrow keys / Home / End), and responsive layouts for smaller windows.
- Crypto and time tool inputs stay in memory when switching tabs within the same tool; leaving that tool clears its temporary state.
- Copy actions provide success/failure feedback; light theme accents have stronger contrast and animations respect reduced-motion preferences.
- Light / dark theme with persistent preference.
- Switch between Modern (spacious) and Compact (denser) interface styles at the bottom of the sidebar. Style and color theme are independent, and both preferences survive restarts.
- System tray integration — closing the main window hides it to the tray; background tasks (SSH tunnels, etc.) keep running. Quit only from the tray menu.
- Single-instance lock so launching the app a second time brings the existing window forward.
- Per-plugin encrypted SQLite databases (AES-256-CBC at the field level, built-in key — designed as "keep honest people honest" protection, not high-security).

### Built-in tools

New Tunnel automatically discovers explicit `Host` aliases from the local user/system SSH config and running WSL distributions. Select an alias to preview and copy its connection fields; stopped distributions have an explicit **Start and read** action. Includes, wildcard/negated Host rules, first-value precedence, multiple identities and common identity path tokens are handled. WSL key paths use `\\wsl.localhost\<distribution>\...`; connections still originate from Windows.

Import is a snapshot, does not edit SSH config or read private key contents, and does not start a connection. Configure forwarding and authentication before saving. Conditional `Match`, dynamic Includes, proxy/jump commands, agent/certificate options and unsupported connection policies are reported instead of silently ignored; these profiles require OpenSSH and cannot be imported with the current `ssh2` engine. Config forwarding/session options are listed as not imported. Refresh to reread changes.

| Tool | Description |
|------|-------------|
| **SSH Connections** | Separate app library and Windows/WSL SSH config sources. Groups, tags, favorites, recent launches, search, grid/list views, quick connect, in-app terminal tabs and external terminals. New profiles prefer WSL when installed. |
| **SSH Tunnel** | Manage local / remote / dynamic (SOCKS5) SSH tunnels, with real-time traffic stats, auto-reconnect with exponential backoff, auto-start on launch, SSH command import/export, system-terminal launcher, and public-key deployment helpers. |
| **Notebook** | Hierarchical markdown documents with live preview, document locking, and per-document encryption (PBKDF2 + AES-GCM, user-chosen password). |
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

- **Electron 44** + **electron-vite** for the build pipeline
- **React 19** + **TypeScript 7**
- **TailwindCSS 4** with CSS variables for runtime theme switching
- **Lucide React** icons
- **ssh2** for all SSH traffic (pure JS, enables accurate byte-level traffic metering)
- **better-sqlite3** for per-plugin persistence, using the ABI-stable N-API binaries shipped with version 13
- **electron-store** for the small app-level settings file (window bounds, theme, active plugin)

---

## Development

Requires Node.js 24 or newer (CI uses Node.js 24 LTS).

All direct dependencies use their latest stable releases as of 2026-10-08, except Vite: electron-vite 5 supports Vite 7, so this project uses Vite 7.3.7 and the compatible React SWC plugin. Tailwind uses its Vite plugin and a CSS theme. Unused Recharts, Electron Toolkit, legacy PostCSS plugins, and stub UUID types were removed.

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

### Checks and native modules

`npm run build` prepares native modules and runs both TypeScript checks before bundling. Run `npm test` for regression tests, `npm run test:smoke` for the general Electron smoke test, and `npm run test:ssh` for the connection workspace and real PTY input/output tests. Tests use temporary app profiles; source-config editing is tested with fixtures and never modifies your actual SSH files. On Linux use `xvfb-run -a` if no display is available. Screenshots are saved under `out/test-artifacts/`.

`better-sqlite3` 13 ships N-API binaries for Windows, macOS, and Linux. Electron-specific recompilation is no longer needed on the configured targets; packaging keeps these binaries outside ASAR.

The project `.npmrc` disables dependency install scripts to prevent npm from implicitly rebuilding SQLite. The configured targets use shipped SQLite, SWC, and esbuild binaries; SSH uses its JavaScript fallback for optional accelerators. Electron downloads on first use. Explicit commands such as `npm run build` still run normally.

Embedded terminals use xterm.js and node-pty with the native OpenSSH client. node-pty supplies Windows/macOS binaries; Linux's `prepare:native` step explicitly builds node-pty and needs Python, make, and a C++ compiler. Install the OpenSSH client in Windows and in any selected WSL distribution. Source aliases run inside their original environment and retain native `Include`, `Match`, `ProxyJump` and agent behavior. App profiles use `ssh -F none`, so system aliases cannot silently override their fields. Passwords and key passphrases are entered in the terminal and are not saved by the connection library.

The source editor maintains the user `~/.ssh/config` file for each environment; included/system-wide files remain externally maintained. Existing content is backed up under `<configDir>/ssh-config-backups/`, and revision checks refuse to overwrite outside edits. App profiles live in `databases/ssh-connections.db`; editing, duplicating or deleting them never writes source config files. Terminal tabs stay alive when switching tools; closing a live tab disconnects it after confirmation. Status indicates SSH process state, not verified authentication success. The workspace interaction design draws on [Termix](https://github.com/Termix-SSH/Termix), [Tabby](https://github.com/Eugeny/tabby), and [electerm](https://github.com/electerm/electerm).

---

## Packaging & distribution

`npm run package` produces a single installable artifact per platform:

- **Windows** — `dist/DevToolkit Setup <version>.exe` (NSIS, ~80 MB)
- **macOS** — `dist/DevToolkit-<version>.dmg`
- **Linux** — `dist/DevToolkit-<version>.AppImage`

`electron-builder` can only target the current OS; to produce all three you need a CI matrix — see [Cloud Build](#cloud-build) below.

### Code signing

The repo ships **unsigned**. On Windows, first-time users will see a SmartScreen warning (choose "More info" → "Run anyway"). To ship signed builds, add a code-signing certificate config under the `win` / `mac` keys in [electron-builder.yml](electron-builder.yml).

---

## Cloud Build

A GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml) builds the app for **Windows, macOS, and Linux in parallel** — no need to own all three operating systems.

### Triggers

**Option 1 — push a tag (recommended)**

```bash
# Bump the version
npm version 1.0.1

# Push the tag — triggers the workflow
git push origin main --tags
```

**Option 2 — manual dispatch**

Go to **Actions** → **Release** → **Run workflow**.

### What the workflow does

1. Runs in parallel on `ubuntu-latest`, `macos-latest`, and `windows-latest`.
2. Each runner runs `npm ci`, type-checked builds, regression tests, and `electron-builder`. SQLite uses its shipped N-API binaries.
3. When triggered by a tag, a draft GitHub Release is created with all platform installers attached. When triggered manually, binaries are uploaded as workflow artifacts instead.

### Manual releases (without CI)

If you already built locally with `npm run package`, you can publish a release yourself:

- **Web UI**: open the repo's **Releases** page → **Draft a new release** → pick a tag → attach `dist/DevToolkit Setup <version>.exe` → **Publish**.
- **[GitHub CLI](https://cli.github.com/)**:
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  gh release create v1.0.0 \
    "dist/DevToolkit Setup 1.0.0.exe" \
    --title "DevToolkit 1.0.0" \
    --notes "First release"
  ```

---

## Security notes

- The built-in `APP_ENCRYPTION_KEY` in [src/main/lib/constants.ts](src/main/lib/constants.ts) is **intentionally hardcoded** — its job is to keep casual readers out of a stolen SQLite file, nothing more. Do **not** rely on it for anything that would hurt if it leaked.
- The Notebook plugin's per-document encryption, by contrast, derives its key from a user-chosen password via PBKDF2 (100 000 iterations, SHA-256) and encrypts with AES-GCM. The password itself is never stored — only its SHA-256 hash, used for unlock verification.
- SSH passwords, private key paths, and passphrases are stored in the SSH Tunnel plugin's SQLite file, field-encrypted with the built-in key. If that's not good enough for your threat model, use key-based auth and leave the password field empty.
- The "Deploy Public Key" feature connects via `ssh2`, reads your local `~/.ssh/*.pub`, and appends it to the remote's `~/.ssh/authorized_keys` using a safely-escaped shell command.

---

## Desktop settings and floating tools

Four pages in the lower settings section provide optional desktop controls. Switches are off by default, persist locally, and run while the app remains in the tray. Quitting unloads the native input hooks and closes floating panels.

- **Desktop settings**: choose Alt or Alt+Shift; left-drag anywhere in a normal window to move it, right-drag to resize. Maximized/fullscreen and fixed-size windows keep their native behavior. Elevated windows remain subject to Windows permissions.
- **Window switcher**: Win+Space opens a centered search for already-open windows, filtered by title/application. Arrows select; Enter/click activates; Shift+Enter/click moves the target to the current virtual desktop before activation. Enabling this replaces Windows' Win+Space input-language shortcut until disabled.
- **Floating widgets**: notes, clock, clipboard and quota panels support independent or linked docking. Drag the header, resize the lower corner, hover an edge handle to expand, or pin to keep open. Panels snap within 24 DIP of a display's work-area edge; a short 80ms leave delay precedes the 110ms closing animation. Undocked or pinned panels stay open. Both modes retain their own bounds and pins, and display changes keep panels reachable.
- Notes use the existing field encryption in `desktop.db` (no separate password). Clipboard history is memory-only, starts when enabled, retains at most 30 text items of 20,000 characters, and clears on disable/quit. Common confidential clipboard format markers are excluded; ordinary text can still contain sensitive information.

Native window control targets Windows x64. The isolated C# helper builds with Windows' .NET Framework compiler as part of `npm run build` and `npm run dev`. Windows packaging includes it and the pinned, SHA-256-checked MIT [VirtualDesktopAccessor](https://github.com/Ciantic/VirtualDesktopAccessor/releases/tag/2024-12-16-windows11) binary/license. Virtual desktop support is probed at runtime. Interaction takes inspiration from [Alfred](https://www.alfredapp.com/); the window-specific UI is implemented here.

**Quick Launcher** uses Alt+Space for tool shortcuts, desktop actions, date/time/UUID copying, calculations and web search. Enable it and select its action categories on its settings page. It follows the main window's theme.

All dock widgets share one display, selected under **Floating Widgets > Dock display** (primary display by default). Dragging and resizing stay inside that display in both docking modes. Disconnecting it temporarily moves the widgets to the primary display; reconnecting restores the selected display.

Run `npm run test:desktop` for isolated UI coverage. `node tests/desktop-native-smoke.mjs` validates real enumeration and moving a dedicated test window between existing desktops on compatible Windows 11 builds. Neither test moves the user's existing windows.

## Local and SSH AI subscriptions

A fixed **本地环境** (local environment) is always first in the list and cannot be edited, duplicated, or removed. It reads the current OS user's Codex/Claude configuration automatically using native CLI processes, without SSH or Python. Refresh and floating widgets remain available. Windows and WSL account data stay separate. Installed WSL distributions are discovered as fixed local environments and read directly through WSL (Python 3 and the provider CLI are required inside the distribution). Reading may start a stopped distribution.

The **AI 订阅** tab registers remote environments using saved SSH Connections profiles or Windows/WSL config aliases. Each environment can select Codex/Claude and custom remote configuration directories. The page shows available account/plan metadata, quota/reset windows, credits, earned reset coupons/expiry, usage summaries, pressure estimates, and read-only conversation indexes. Missing fields stay unknown. Recent local quota samples are retained for seven days, separately from server usage statistics.

Desktop widgets support **independent docking** (one auto-hide panel expanded at a time) and **linked docking** (one continuous sidebar for all enabled widgets, including subscription quotas). Independent positions and pins survive mode changes; linked mode has its own position, size and pin. Hover opens in 150ms; leaving waits 80ms before a 110ms closing animation. Re-entry cancels closing, and reduced-motion preferences are respected. Only collapsed handles use the new neutral borders/text and colored icons; expanded styling is preserved. Quota handles show the tightest valid remaining allowance. All desktop surfaces remain topmost.

Remote collection requires Python 3 on Linux, WSL or macOS, and SSH key/agent authentication with an already verified host key. It reuses the native SSH client (including aliases/ProxyJump) and sends a temporary collector via stdin. Provider credentials remain remote; only allowlisted metadata crosses SSH. Codex uses official [app-server](https://learn.chatgpt.com/docs/app-server) read APIs. Claude uses auth status and a compatibility usage endpoint, with capability-specific fallbacks; native Windows remote shells, interactive SSH passwords and some credential keyrings are not supported by background collection. No login/logout, account switching, purchase, redemption, session resume or remote installation is performed.

Codex and Claude have independent persisted schedules. Both normally refresh every five minutes. Claude defaults to 5/20/60/1440-minute failure retries, then repeats every 24 hours; missing/unreadable credentials or unsupported subscription auth pause automatic Claude polling. **刷新设置** configures its normal interval, retry stages, and pause behavior. Codex keeps its environment interval and 5/10/20/40/60-minute failure backoff. Manual refresh can recheck login or retry early, with a separate two-minute minimum per provider. Global execution remains serialized. Offline environments retain marked old readings. Removing an environment leaves SSH profiles and remote data intact. Conversation indexes are capped at 100 per provider; these are environment histories, not guaranteed to belong to the currently signed-in account.

Run `npm run test:subscriptions` for isolated transport/UI/persistence/widget coverage. Run `python3 tests/fixtures/test-collector.py src/main/plugins/subscriptions/collector.py` in a Python 3 environment for provider fixtures. `npm run package:dir` reuses the fixed `dist/win-unpacked` Windows output directory.

Plugin databases now live under `userData/devtoolkit-data/databases`. Before creating any BrowserWindow, startup copies legacy databases through SQLite's backup API (including committed WAL data) and verifies the copies without replacing existing migrated files. This avoids Chromium's automatic cleanup of its reserved legacy WebSQL `userData/databases` directory.

## License

MIT — see [LICENSE](LICENSE) if present, otherwise do what you like with it.

The AI quota dock is one aggregate component: its collapsed grid shows up to nine environments (one to three columns, up to three rows), defaulting to the host OS and local WSL. Each tile identifies Codex/Claude, plan and remaining quota. Expanded details run horizontally with fixed 360-DIP height, width capped to the display work area, and horizontal overflow. Use AI Subscriptions > docking settings or Floating Widgets to enable it. Window Switcher follows live theme changes; grouped widgets support edge/corner resizing and responsive columns.
