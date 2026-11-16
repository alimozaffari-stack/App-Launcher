# Changelog

## v1.4.0

- Fixed Windows drive-letter path misclassification in icon extraction, path verification, `.lnk`/`.url` classification, and drag-and-drop.
- Hardened Electron main-process operations: serialized state writes with unique temp files, expanded/validated `workingDirectory`, safe `.bat`/`.cmd` spawning with error listeners, `setWindowOpenHandler`, and single-PowerShell batch `.lnk` scanning.
- Fixed UI state bugs: stale React state closures, target input click-to-browse conflict, `"No workspace"` selection fallback, group deletion/merge focus reconciliation, modal scrolling, and icon error handling.
- Added keyboard-first search (`Ctrl+K` / `/`, `Enter` to launch top match, `Esc` to clear) consolidated on a slim single line with an expandable functional `#tag` selector and card `#tag` badges.
- Unified app branding (header icon matching the desktop icon + `v1.4.0` label), consistent `Group` / `Tag` terminology, in-app confirmation modals, per-item scan checkboxes, and accessibility improvements (heading hierarchy, modal focus trap/restoration, `>= 24px` targets, `:focus-visible` outlines, and `prefers-reduced-motion`).
- Removed unused v1 legacy components and dead PWA files; hardened the Windows release GitHub Actions workflow.

## v1.3.4

- Updated the Windows release workflow to Node 24-compatible GitHub Actions.
- Added the maintained Windows release checklist.
- Preserved the v1.3.3 application behaviour and installer contents.
