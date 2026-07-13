import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env.APP_LAUNCHER_EMBEDDED = "1";
process.env.NODE_ENV = "production";

const require = createRequire(import.meta.url);
const { startServer } = require("../dist/server.cjs");

let running;

before(async () => {
  running = await startServer({
    port: 0,
    host: "127.0.0.1",
    browserHost: "127.0.0.1",
  });
});

after(async () => {
  if (!running?.server) return;
  await new Promise((resolve, reject) => {
    running.server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("serves the packaged interface with security headers", async () => {
  const response = await fetch(running.url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(await response.text(), /<title>App Launcher<\/title>/);
});

test("reports local server health", async () => {
  const response = await fetch(`${running.url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    platform: process.platform,
  });
});

test("serves a blank no-cache storage migration document", async () => {
  const response = await fetch(`${running.url}/migration-storage`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /id=["']root["']/);
});

test("rejects foreign browser origins", async () => {
  const response = await fetch(`${running.url}/api/health`, {
    headers: { Origin: "https://example.invalid" },
  });
  assert.equal(response.status, 403);
});

test("rejects non-JSON API writes", async () => {
  const response = await fetch(`${running.url}/api/launch`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not-json",
  });
  assert.equal(response.status, 415);
});

test("rejects unsafe launch targets before invoking the platform", async () => {
  const response = await fetch(`${running.url}/api/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ execPath: 'C:\\Apps\\tool.exe" & calc.exe' }),
  });
  assert.equal(response.status, 400);
});

test("does not expose the bundled server source", async () => {
  const response = await fetch(`${running.url}/server.cjs`);
  assert.equal(response.status, 404);
});

test(
  "scans nested Windows launchers and returns their extracted icons",
  { skip: process.platform !== "win32" },
  async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "app-launcher-scan-"));
    try {
      const nestedFolder = path.join(fixtureRoot, "Nested");
      await mkdir(nestedFolder);
      const executablePath = path.join(nestedFolder, "Fixture App.exe");
      await copyFile(process.execPath, executablePath);
      await writeFile(
        path.join(fixtureRoot, "Fixture Website.url"),
        `[InternetShortcut]\nURL=https://example.com\nIconFile=${process.execPath}\nIconIndex=0\n`,
        "utf8",
      );
      await writeFile(
        path.join(fixtureRoot, "Shell Fallback Website.url"),
        "[InternetShortcut]\nURL=https://example.com/fallback\nIconFile=C:\\missing\\icon.exe\nIconIndex=0\n",
        "utf8",
      );

      const response = await fetch(`${running.url}/api/scan-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: fixtureRoot }),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.success, true);
      assert.equal(result.shortcuts.length, 3);
      for (const shortcut of result.shortcuts) {
        assert.match(shortcut.iconUrl || "", /^data:image\/png;base64,/);
      }
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  },
);
