# App Launcher release checklist

Use this sequence for each public Windows release.

## Prepare

1. Start from an up-to-date `main` branch.
2. Create a release branch named `release/direct-desktop-vX.Y.Z`.
3. Update `package.json`, `package-lock.json`, README/release notes, and any required source changes.
4. Run `npm ci`, `npm run lint`, and `npm run build`.
5. Review the diff and confirm the version is a new, unused semantic version.

## Publish

6. Push the release branch to GitHub.
7. Confirm the Windows workflow completes on `windows-latest`.
8. Confirm the workflow creates the matching immutable tag and release, for example `v1.3.4`.
9. Confirm the release contains `App Launcher Setup X.Y.Z.exe`; record its SHA-256 checksum.
10. Test the downloaded installer on Windows.

## Close out

11. Merge the release pull request into `main`.
12. Keep the matching version tag and release; do not attempt to retarget an immutable release.
13. Close or delete the temporary release branch only after the release asset has been verified.

The workflow intentionally publishes from a dedicated release branch created from `main`. Each release must use a unique version and tag; never reuse an existing immutable tag.
