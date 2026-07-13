import { execFile } from "node:child_process";
import type { Server } from "node:http";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import express from "express";

const DEFAULT_PORT = 3000;
const DEFAULT_BIND_HOST = "127.0.0.1";
const DEFAULT_BROWSER_HOST = "localhost";
const MAX_TARGET_LENGTH = 4096;
const MAX_NAME_LENGTH = 200;
const BLOCKED_PROTOCOLS = new Set(["data:", "javascript:", "vbscript:"]);

const envFile = process.env.APP_LAUNCHER_ENV_FILE;
dotenv.config(envFile ? { path: envFile, quiet: true } : { quiet: true });

const isProd = process.env.NODE_ENV === "production";

export interface StartServerOptions {
  port?: number;
  host?: "127.0.0.1" | "::1" | "localhost";
  browserHost?: "127.0.0.1" | "localhost";
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function readRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\0\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function readLaunchTarget(value: unknown): string | null {
  const target = readRequiredString(value, MAX_TARGET_LENGTH);
  if (!target || target.includes('"')) return null;

  const isWindowsDrivePath = /^[a-z]:[\\/]/i.test(target);
  if (!isWindowsDrivePath) {
    const protocol = target.match(/^([a-z][a-z\d+.-]*:)/i)?.[1]?.toLowerCase();
    if (protocol && BLOCKED_PROTOCOLS.has(protocol)) return null;
  }

  return target;
}

function runPowerShell(
  script: string,
  extraEnv: Record<string, string>,
  timeout: number,
  maxBuffer = 4 * 1024 * 1024,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        env: { ...process.env, ...extraEnv },
        maxBuffer,
        timeout,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function setSecurityHeaders(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

function protectLoopbackOrigin(allowedHosts: Set<string>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const hostname = req.hostname?.toLowerCase();
    if (!hostname || !allowedHosts.has(hostname)) {
      return res.status(403).json({ error: "Request host is not permitted." });
    }

    const origin = req.get("origin");
    if (origin) {
      try {
        const originHostname = new URL(origin).hostname.toLowerCase();
        if (!allowedHosts.has(originHostname)) {
          return res.status(403).json({ error: "Request origin is not permitted." });
        }
      } catch {
        return res.status(403).json({ error: "Request origin is invalid." });
      }
    }

    next();
  };
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const port = options.port ?? Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const host = options.host ?? DEFAULT_BIND_HOST;
  const browserHost = options.browserHost ?? DEFAULT_BROWSER_HOST;

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid server port: ${port}`);
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(setSecurityHeaders);

  const allowedHosts = new Set([
    "127.0.0.1",
    "::1",
    "localhost",
    host.toLowerCase(),
    browserHost.toLowerCase(),
  ]);
  app.use(protectLoopbackOrigin(allowedHosts));

  app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
      return res.status(415).json({ error: "API requests must use application/json." });
    }
    next();
  });
  app.use(express.json({ limit: "32kb", strict: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", platform: process.platform });
  });

  app.post("/api/suggest", async (req, res) => {
    const name = readRequiredString(req.body?.name, MAX_NAME_LENGTH);
    if (!name) {
      return res.status(400).json({ error: "A valid program name is required." });
    }

    try {
      const ai = getGeminiClient();
      const prompt = `You are a utility cataloguing assistant. The program name is ${JSON.stringify(name)}.
Suggest:
1. One category or primary use-case group. Prefer: Gaming, Productivity, Creative, Development, Streaming & Video, Utilities, or Communication.
2. Three to five relevant lowercase search tags.
3. One concise sentence describing the program.

Return only JSON matching the supplied schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING" },
              tags: { type: "ARRAY", items: { type: "STRING" } },
              description: { type: "STRING" },
            },
            required: ["category", "tags", "description"],
          },
        },
      });

      if (!response.text) throw new Error("The suggestion service returned no content.");
      return res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Gemini suggestion failed:", error);
      return res.status(503).json({
        error: "AI suggestions are unavailable.",
        fallback: {
          category: "Utilities",
          tags: [name.toLowerCase().replace(/\s+/g, "")],
          description: `Shortcut launcher for ${name}.`,
        },
      });
    }
  });

  app.post("/api/launch", async (req, res) => {
    const target = readLaunchTarget(req.body?.execPath);
    if (!target) {
      return res.status(400).json({ error: "A valid launch target is required." });
    }
    if (process.platform !== "win32") {
      return res.status(400).json({
        error: "Direct launching is supported only by the Windows desktop application.",
        isLocal: false,
      });
    }

    const script = `
      $target = [Environment]::ExpandEnvironmentVariables($env:APP_LAUNCHER_TARGET)
      if ([string]::IsNullOrWhiteSpace($target)) { throw "Launch target is empty." }
      Start-Process -FilePath $target -ErrorAction Stop
    `;

    try {
      await runPowerShell(script, { APP_LAUNCHER_TARGET: target }, 15_000);
      return res.json({ success: true });
    } catch (error) {
      console.error("Local launch failed:", error);
      return res.status(500).json({
        error: "The target could not be launched. Check that its path or protocol is valid.",
      });
    }
  });

  app.post("/api/extract-icon", async (req, res) => {
    const target = readLaunchTarget(req.body?.execPath);
    if (!target) {
      return res.status(400).json({ error: "A valid executable path is required." });
    }
    if (process.platform !== "win32") {
      return res.status(400).json({
        error: "Icon extraction is supported only by the Windows desktop application.",
      });
    }

    const script = `
      Add-Type -AssemblyName System.Drawing
      $target = [Environment]::ExpandEnvironmentVariables($env:APP_LAUNCHER_TARGET)
      if (-not [System.IO.File]::Exists($target)) { throw "File not found." }
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
      if ($null -eq $icon) { throw "No associated icon." }
      try {
        $bitmap = $icon.ToBitmap()
        $stream = New-Object System.IO.MemoryStream
        try {
          $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
          [Convert]::ToBase64String($stream.ToArray())
        } finally {
          $stream.Dispose()
          $bitmap.Dispose()
        }
      } finally {
        $icon.Dispose()
      }
    `;

    try {
      const { stdout } = await runPowerShell(
        script,
        { APP_LAUNCHER_TARGET: target },
        15_000,
      );
      const base64 = stdout.trim().replace(/[\r\n]/g, "");
      if (!base64) throw new Error("No icon data returned.");
      return res.json({ success: true, iconUrl: `data:image/png;base64,${base64}` });
    } catch (error) {
      console.error("Icon extraction failed:", error);
      return res.status(500).json({ error: "No icon could be extracted from that file." });
    }
  });

  app.post("/api/scan-folder", async (req, res) => {
    const folderPath = readRequiredString(req.body?.folderPath, MAX_TARGET_LENGTH);
    if (!folderPath || folderPath.includes('"')) {
      return res.status(400).json({ error: "A valid folder path is required." });
    }
    if (process.platform !== "win32") {
      return res.status(400).json({
        error: "Folder scanning is supported only by the Windows desktop application.",
      });
    }

    const script = `
      $folder = [Environment]::ExpandEnvironmentVariables($env:APP_LAUNCHER_FOLDER)
      if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
        throw "Folder does not exist."
      }
      $shell = New-Object -ComObject WScript.Shell
      $results = @()
      Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop |
        Where-Object { $_.Extension -in ".lnk", ".exe" } |
        Select-Object -First 500 |
        ForEach-Object {
          if ($_.Extension -eq ".lnk") {
            try {
              $shortcut = $shell.CreateShortcut($_.FullName)
              $results += [PSCustomObject]@{
                name = $_.BaseName
                execPath = $_.FullName
                description = $shortcut.Description
                category = "Others"
                tags = @($_.BaseName.ToLower())
              }
            } catch {}
          } else {
            $results += [PSCustomObject]@{
              name = $_.BaseName
              execPath = $_.FullName
              description = "Direct executable launcher."
              category = "Others"
              tags = @($_.BaseName.ToLower())
            }
          }
        }
      ConvertTo-Json -InputObject @($results) -Compress -Depth 3
    `;

    try {
      const { stdout } = await runPowerShell(
        script,
        { APP_LAUNCHER_FOLDER: folderPath },
        30_000,
        8 * 1024 * 1024,
      );
      const parsed = JSON.parse(stdout.trim() || "[]");
      return res.json({
        success: true,
        shortcuts: Array.isArray(parsed) ? parsed : [parsed],
        platform: "win32",
      });
    } catch (error) {
      console.error("Folder scan failed:", error);
      return res.status(500).json({
        error: "The folder could not be scanned. Check that it exists and is accessible.",
      });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname;
    app.get(["/server.cjs", "/server.cjs.map"], (_req, res) => res.sendStatus(404));
    app.use(express.static(distPath, { dotfiles: "deny", index: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine the local server address.");
  }

  const url = `http://${browserHost}:${address.port}`;
  console.log(`App Launcher server ready at ${url}`);
  return { server, port: address.port, url };
}

if (process.env.APP_LAUNCHER_EMBEDDED !== "1") {
  startServer().catch((error) => {
    console.error("App Launcher server failed to start:", error);
    process.exitCode = 1;
  });
}
