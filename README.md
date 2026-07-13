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
- Shortcut cards can be dragged into the nominated workspace without changing their original group; the workspace membership is stored as lightweight metadata.
- The nominated workspace can hold one-click temporary folder links for the current application session. A temporary link can be pinned as a permanent shortcut or removed at any time.
- Uploaded icon images are resized before storage.
- Workspace features reuse the existing renderer and local service; they add no background process or runtime dependency.
- External pages open in the operating system's default browser, not inside the privileged application window.

## Project structure

- `electron-main.cjs` — Electron lifecycle and security boundary
- `electron-preload.cjs` — narrow bridge for native dropped-file paths and folder selection
- `server.ts` — loopback API, Windows launch integration and static host
- `src/` — React interface
- `test/` — local-server integration tests
