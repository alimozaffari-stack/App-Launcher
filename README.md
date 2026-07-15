# App Launcher — Migration Build (v1.1.1)

An offline-first Electron library for applications, folders, files, URLs and named workspaces.

This is the required one-time **migration build** for users upgrading from the earlier launcher. It retains the former `http://localhost:3000` origin only long enough to move existing browser-stored shortcuts into the desktop library file. Open it once before installing the final direct-file desktop build.

## Run and package

```bash
npm install
npm run desktop:start
```

Create a Windows installer with:

```bash
npm run desktop:build
```

The installer is written to `dist-desktop/`.

## Migration procedure

1. Build and install this version over the earlier App Launcher.
2. Open it once and confirm that the existing library appears.
3. Close the application. Your data is now stored in the desktop user-data location.
4. Install the subsequent direct desktop release.

## What this release changes

- Existing `localhost` launcher data is migrated once into a local v2 library file, with a browser-storage backup retained.
- Each item has a primary purpose and can belong to additional groups.
- Groups and tags are displayed alphabetically; the library supports flat, purpose and A–Z views.
- The dashboard panels can be collapsed, hidden and restored.
- Workspaces combine applications with actual folders, files, URLs and protocol links.
- Folder scanning uses actual local paths, and matching targets are not imported twice.
- The Electron bridge handles local opening, scanning, persistence and icon caching; the renderer does not have direct Node access.

## Development checks

```bash
npm run lint
npm run build
```
