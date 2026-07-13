# App Launcher

A local-first Windows desktop launcher for applications, folders, shortcuts, websites and registered protocol links. The interface is built with React and packaged with Electron; a loopback-only Express service handles Windows integration.

## Requirements

- Windows 10 or 11, 64-bit
- Node.js 22.12.0 or later
- npm 10 or later

## Development

```powershell
npm ci
npm run desktop:start
```

`desktop:start` builds the React interface and local service before opening Electron. Development tools are available in this mode but disabled in packaged builds.

To enable optional AI-assisted descriptions, set `GEMINI_API_KEY` in the environment or create a local `.env` file:

```dotenv
GEMINI_API_KEY=your_key_here
```

The launcher itself does not require an API key.

## Verification

```powershell
npm run check
```

This runs TypeScript validation, the production build and the local-server integration tests.

## Windows installer

```powershell
npm run desktop:build
```

The NSIS installer is written to `dist-desktop\`. The build is currently Windows-only because launching, icon extraction and folder scanning use Windows facilities.

## Desktop behaviour

- The local service binds only to `127.0.0.1:3000`; it is not exposed to the local network.
- Electron waits for the service to be ready instead of relying on a startup delay.
- Dropped files use their real native path through an isolated preload bridge.
- Shortcut data remains on the device in the application profile.
- An empty profile attempts a one-time recovery from earlier App Launcher profile names and loopback origins.
- Desktop import follows Windows' personal and public Desktop locations, scans nested launchers and stores extracted icons.
- Shortcut cards can belong to multiple groups. Dragging into the nominated workspace adds membership without changing the primary group.
- The shortcut form can suggest up to three deterministic local tags for the user to review before saving.
- Bulk selection has card-level select-all/deselect controls, a synchronised target-group selector, an explicit group operation and visible result feedback. It can add, remove or replace tags; add or remove additional groups; and safely change the primary group across several shortcuts at once.
- The optional top workspace is separate from the full-card group filters and can show one group, all shortcuts, or be cleared/hidden. Top-panel shortcut cards show only the icon and title to conserve space.
- Duplicate review resolves Windows `.lnk` and `.url` targets, merges exact duplicates in one action without deleting files, preserves useful metadata and provides session undo. Name-only matches are review-only.
- The nominated workspace can hold one-click temporary folder links for the current application session. A temporary link can be pinned as a permanent shortcut or removed at any time.
- Windows icon extraction selects the highest-quality embedded resource, renders a sharp 128 px high-DPI master and honours `.lnk`/`.url` icon indices. Existing local icons can be upgraded on demand with **Sharpen icons**.
- Uploaded icon images use high-quality resampling before storage.
- Optional dialogs and the AI SDK are loaded only when used; card icons decode lazily. The desktop-only Memory view reports current per-process usage on demand without background polling.
- Workspace features reuse the existing renderer and local service; they add no background process or runtime dependency.
- External pages open in the operating system's default browser, not inside the privileged application window.

## Project structure

- `electron-main.cjs` — Electron lifecycle and security boundary
- `electron-preload.cjs` — narrow bridge for native dropped-file paths and folder selection
- `server.ts` — loopback API, Windows launch integration and static host
- `src/` — React interface
- `test/` — local-server integration tests
