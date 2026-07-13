import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
