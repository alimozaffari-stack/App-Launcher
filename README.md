# App Launcher — Direct Desktop Build (v1.3.0)

An offline-first Electron library for applications, folders, files, URLs and named workspaces.

This final desktop build loads its packaged interface directly through Electron. It contains no Express server, no localhost service and no external backend.

## Interface at a glance

![App Launcher interface tour](docs/screenshots/app-launcher-tour.svg)

- **Workspaces** keep folders on the left and working files on the right, with file-type icons, verification and relinking.
- **Dashboard panels** can be shown, hidden, collapsed and reordered.
- **Folder scan** imports local applications and shortcuts; items can then be edited with purposes, additional groups and tags.

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

## Downloading the Windows installer

Published desktop releases include a ready-to-install Windows `.exe` in the repository's **Releases** page. Download `App Launcher Setup <version>.exe`, close App Launcher if it is open, and run the downloaded installer. Node.js and the source project are not needed for this route.

## Installation and existing-library migration

This is the first public, self-contained desktop release. Download and install it directly; no earlier version is required.

If you previously used an internal or localhost-based pre-release and its library does not appear after installation, use the earlier migration repair build once, then reopen this desktop release.

## What this release changes

- Existing `localhost` launcher data is migrated once into a local v2 library file, with a browser-storage backup retained.
- Each item has a primary purpose and can belong to additional groups.
- Groups and tags are displayed alphabetically; the library supports flat, purpose and A–Z views.
- The dashboard panels can be collapsed, hidden and restored.
- Workspaces combine applications with actual folders, files, URLs and protocol links.
- Workspace-only folders and files can be added directly from the Workspaces panel without appearing in the general library.
- Groups and tags can be deleted or merged, and shortcut labels/tags can be copied and pasted through the edit dialog.
- Workspace filenames retain their extensions; selected shortcuts support bulk copying and pasting of labels and tags.
- First launch offers an optional folder scan; Workspaces support A–Z/type arrangement, file-type fallbacks, and a full-width two-column view when other dashboard panels are hidden.
- Workspace-only file type icons include selected vectors sourced from [SVG Repo](https://www.svgrepo.com/); see the in-app Credits entry and SVG Repo's individual asset licences.
- Workspace entries can be verified, relinked, or removed without touching the underlying file or folder.
- Workspaces takes the full dashboard width by default, supports vertical resizing, and grouped library sections support Collapse all / Expand all.
- Workspace-only Add folder and Add file support selecting multiple folders or files at once.
- Folder scanning uses actual local paths, and matching targets are not imported twice.
- The Electron bridge handles local opening, scanning, persistence and icon caching; the renderer does not have direct Node access.

## Development checks

```bash
npm run lint
npm run build
```
