# App Launcher — Direct Desktop Build (v1.2.4)

An offline-first Electron library for applications, folders, files, URLs and named workspaces.

This final desktop build loads its packaged interface directly through Electron. It contains no Express server, no localhost service and no external backend.

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

## Upgrade procedure

1. If upgrading from the earlier launcher, first install and open the v1.1.2 migration repair build once.
2. Confirm that your existing library appears, then close it.
3. Install this v1.2.4 direct desktop build.

Fresh installations can install this release directly.

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
- Folder scanning uses actual local paths, and matching targets are not imported twice.
- The Electron bridge handles local opening, scanning, persistence and icon caching; the renderer does not have direct Node access.

## Development checks

```bash
npm run lint
npm run build
```
