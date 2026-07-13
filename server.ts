import { execFile } from "node:child_process";
import type { Server } from "node:http";
import path from "node:path";
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
      // This optional bundle is loaded only when Auto-Suggest is used. Keeping the
      // Google SDK out of the normal startup path noticeably reduces cold memory.
      const suggestionModulePath = "./ai-suggest.cjs";
      const { suggestShortcut } = await import(suggestionModulePath);
      return res.json(await suggestShortcut(name));
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
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LauncherHighResolutionIcons {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(
    string szFileName,
    int nIconIndex,
    int cxIcon,
    int cyIcon,
    IntPtr[] phicon,
    uint[] piconid,
    uint nIcons,
    uint flags
  );

  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
'@

      function Convert-LauncherIconToBase64([System.Drawing.Icon] $icon) {
        $sourceBitmap = $icon.ToBitmap()
        $bitmap = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.DrawImage($sourceBitmap, 0, 0, 128, 128)
          $stream = New-Object System.IO.MemoryStream
          try {
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            return [Convert]::ToBase64String($stream.ToArray())
          } finally {
            $stream.Dispose()
          }
        } finally {
          $graphics.Dispose()
          $bitmap.Dispose()
          $sourceBitmap.Dispose()
        }
      }

      function Get-LauncherHighResolutionIcon([string] $source, [int] $defaultIndex = 0) {
        $icon = $null
        $iconHandle = [IntPtr]::Zero
        try {
          if ([string]::IsNullOrWhiteSpace($source)) { return $null }
          $expandedSource = [Environment]::ExpandEnvironmentVariables($source.Trim())
          $iconIndex = $defaultIndex
          if ($expandedSource -match '^\"?(.*?)\"?,\\s*(-?\\d+)$') {
            $expandedSource = $Matches[1]
            $iconIndex = [int] $Matches[2]
          }
          $expandedSource = $expandedSource.Trim().Trim('"')
          if (-not [System.IO.File]::Exists($expandedSource)) { return $null }

          $handles = New-Object IntPtr[] 1
          $iconIds = New-Object UInt32[] 1
          $count = [LauncherHighResolutionIcons]::PrivateExtractIcons(
            $expandedSource, $iconIndex, 256, 256, $handles, $iconIds, 1, 0
          )
          if ($count -gt 0 -and $handles[0] -ne [IntPtr]::Zero) {
            $iconHandle = $handles[0]
            $icon = [System.Drawing.Icon]::FromHandle($iconHandle).Clone()
            return Convert-LauncherIconToBase64 $icon
          }
          return $null
        } catch {
          return $null
        } finally {
          if ($null -ne $icon) { $icon.Dispose() }
          if ($iconHandle -ne [IntPtr]::Zero) {
            [void] [LauncherHighResolutionIcons]::DestroyIcon($iconHandle)
          }
        }
      }

      $target = [Environment]::ExpandEnvironmentVariables($env:APP_LAUNCHER_TARGET)
      if (-not [System.IO.File]::Exists($target)) { throw "File not found." }

      $iconSource = $target
      $fallbackSource = $target
      $extension = [System.IO.Path]::GetExtension($target)
      if ($extension -ieq ".lnk") {
        $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($target)
        if (-not [string]::IsNullOrWhiteSpace($shortcut.IconLocation)) {
          $iconSource = $shortcut.IconLocation
        } elseif (-not [string]::IsNullOrWhiteSpace($shortcut.TargetPath)) {
          $iconSource = $shortcut.TargetPath
        }
        if (-not [string]::IsNullOrWhiteSpace($shortcut.TargetPath)) {
          $fallbackSource = $shortcut.TargetPath
        }
      } elseif ($extension -ieq ".url") {
        $urlLines = @(Get-Content -LiteralPath $target -ErrorAction SilentlyContinue)
        $iconFile = ($urlLines | Where-Object { $_ -like "IconFile=*" } | Select-Object -First 1) -replace '^IconFile=', ''
        $iconIndex = ($urlLines | Where-Object { $_ -like "IconIndex=*" } | Select-Object -First 1) -replace '^IconIndex=', ''
        if (-not [string]::IsNullOrWhiteSpace($iconFile)) {
          $iconSource = if ([string]::IsNullOrWhiteSpace($iconIndex)) { $iconFile } else { "$iconFile,$iconIndex" }
        }
      }

      $base64 = Get-LauncherHighResolutionIcon $iconSource
      if ([string]::IsNullOrWhiteSpace($base64) -and $fallbackSource -ne $iconSource) {
        $base64 = Get-LauncherHighResolutionIcon $fallbackSource
      }
      if ([string]::IsNullOrWhiteSpace($base64)) {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($fallbackSource)
        if ($null -eq $icon) { throw "No associated icon." }
        try {
          $base64 = Convert-LauncherIconToBase64 $icon
        } finally {
          $icon.Dispose()
        }
      }
      $base64
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
      Add-Type -AssemblyName System.Drawing
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LauncherShellIcons {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(
    string szFileName,
    int nIconIndex,
    int cxIcon,
    int cyIcon,
    IntPtr[] phicon,
    uint[] piconid,
    uint nIcons,
    uint flags
  );

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
    public string szTypeName;
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(
    string pszPath,
    uint dwFileAttributes,
    ref SHFILEINFO psfi,
    uint cbFileInfo,
    uint uFlags
  );

  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
'@

      function Convert-LauncherIconToDataUrl([System.Drawing.Icon] $icon) {
        $sourceBitmap = $icon.ToBitmap()
        $bitmap = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.DrawImage($sourceBitmap, 0, 0, 128, 128)
          $stream = New-Object System.IO.MemoryStream
          try {
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            return "data:image/png;base64,$([Convert]::ToBase64String($stream.ToArray()))"
          } finally {
            $stream.Dispose()
          }
        } finally {
          $graphics.Dispose()
          $bitmap.Dispose()
          $sourceBitmap.Dispose()
        }
      }

      function Get-LauncherIconDataUrl([string] $source) {
        $icon = $null
        $iconHandle = [IntPtr]::Zero
        try {
          if ([string]::IsNullOrWhiteSpace($source)) { return $null }
          $expandedSource = [Environment]::ExpandEnvironmentVariables($source.Trim())
          $iconIndex = 0
          if ($expandedSource -match '^\"?(.*?)\"?,\\s*(-?\\d+)$') {
            $expandedSource = $Matches[1]
            $iconIndex = [int] $Matches[2]
          }
          $expandedSource = $expandedSource.Trim().Trim('"')
          if (-not [System.IO.File]::Exists($expandedSource)) { return $null }

          $handles = New-Object IntPtr[] 1
          $iconIds = New-Object UInt32[] 1
          $count = [LauncherShellIcons]::PrivateExtractIcons(
            $expandedSource, $iconIndex, 256, 256, $handles, $iconIds, 1, 0
          )
          if ($count -gt 0 -and $handles[0] -ne [IntPtr]::Zero) {
            $iconHandle = $handles[0]
            $icon = [System.Drawing.Icon]::FromHandle($iconHandle).Clone()
            return Convert-LauncherIconToDataUrl $icon
          }
          return $null
        } catch {
          return $null
        } finally {
          if ($null -ne $icon) { $icon.Dispose() }
          if ($iconHandle -ne [IntPtr]::Zero) {
            [void] [LauncherShellIcons]::DestroyIcon($iconHandle)
          }
        }
      }

      function Get-LauncherShellIconDataUrl([string] $source) {
        $icon = $null
        $iconHandle = [IntPtr]::Zero
        try {
          if ([string]::IsNullOrWhiteSpace($source)) { return $null }
          $expandedSource = [Environment]::ExpandEnvironmentVariables($source.Trim().Trim('"'))
          if (-not [System.IO.File]::Exists($expandedSource)) { return $null }

          $iconInfo = New-Object LauncherShellIcons+SHFILEINFO
          $result = [LauncherShellIcons]::SHGetFileInfo(
            $expandedSource,
            0,
            [ref] $iconInfo,
            [System.Runtime.InteropServices.Marshal]::SizeOf($iconInfo),
            0x100
          )
          if ($result -eq [IntPtr]::Zero -or $iconInfo.hIcon -eq [IntPtr]::Zero) {
            return $null
          }

          $iconHandle = $iconInfo.hIcon
          $icon = [System.Drawing.Icon]::FromHandle($iconHandle).Clone()
          return Convert-LauncherIconToDataUrl $icon
        } catch {
          return $null
        } finally {
          if ($null -ne $icon) { $icon.Dispose() }
          if ($iconHandle -ne [IntPtr]::Zero) {
            [void] [LauncherShellIcons]::DestroyIcon($iconHandle)
          }
        }
      }

      $requestedFolder = $env:APP_LAUNCHER_FOLDER
      if ($requestedFolder -eq "__WINDOWS_DESKTOP__" -or
          $requestedFolder -ieq "%USERPROFILE%\\Desktop") {
        $folders = @(
          [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory),
          [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)
        )
      } else {
        $folders = @([Environment]::ExpandEnvironmentVariables($requestedFolder))
      }

      $folders = @($folders |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique)
      if ($folders.Count -eq 0 -or
          @($folders | Where-Object { Test-Path -LiteralPath $_ -PathType Container }).Count -eq 0) {
        throw "Folder does not exist."
      }

      $shell = New-Object -ComObject WScript.Shell
      $files = @($folders |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
        ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Recurse -ErrorAction SilentlyContinue } |
        Where-Object { $_.Extension.ToLowerInvariant() -in ".lnk", ".exe", ".url", ".appref-ms" } |
        Sort-Object -Property FullName -Unique |
        Select-Object -First 500)

      $results = @()
      foreach ($file in $files) {
        try {
          $description = "Imported Windows launcher."
          $iconSource = $file.FullName
          $targetIconSource = $null

          if ($file.Extension -ieq ".lnk") {
            $shortcut = $shell.CreateShortcut($file.FullName)
            if (-not [string]::IsNullOrWhiteSpace($shortcut.Description)) {
              $description = $shortcut.Description
            }
            if (-not [string]::IsNullOrWhiteSpace($shortcut.IconLocation)) {
              $iconSource = $shortcut.IconLocation
            }
            if (-not [string]::IsNullOrWhiteSpace($shortcut.TargetPath)) {
              $targetIconSource = $shortcut.TargetPath
            }
            if ([string]::IsNullOrWhiteSpace($shortcut.IconLocation) -and
                -not [string]::IsNullOrWhiteSpace($targetIconSource)) {
              $iconSource = $shortcut.TargetPath
            }
          } elseif ($file.Extension -ieq ".url") {
            $urlLines = @(Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue)
            $urlValue = ($urlLines | Where-Object { $_ -like "URL=*" } | Select-Object -First 1) -replace '^URL=', ''
            $iconValue = ($urlLines | Where-Object { $_ -like "IconFile=*" } | Select-Object -First 1) -replace '^IconFile=', ''
            $iconIndexValue = ($urlLines | Where-Object { $_ -like "IconIndex=*" } | Select-Object -First 1) -replace '^IconIndex=', ''
            if (-not [string]::IsNullOrWhiteSpace($urlValue)) {
              $description = $urlValue
            }
            if (-not [string]::IsNullOrWhiteSpace($iconValue)) {
              $iconSource = if ([string]::IsNullOrWhiteSpace($iconIndexValue)) { $iconValue } else { "$iconValue,$iconIndexValue" }
            }
          } elseif ($file.Extension -ieq ".exe") {
            $description = "Direct executable launcher."
          } else {
            $description = "ClickOnce application launcher."
          }

          $iconUrl = Get-LauncherIconDataUrl $iconSource
          if ([string]::IsNullOrWhiteSpace($iconUrl) -and
              -not [string]::IsNullOrWhiteSpace($targetIconSource) -and
              $targetIconSource -ne $iconSource) {
            $iconUrl = Get-LauncherIconDataUrl $targetIconSource
          }
          if ([string]::IsNullOrWhiteSpace($iconUrl)) {
            $iconUrl = Get-LauncherShellIconDataUrl $file.FullName
          }

          $results += [PSCustomObject]@{
            name = $file.BaseName
            execPath = $file.FullName
            description = $description
            category = "Others"
            tags = @($file.BaseName.ToLowerInvariant())
            iconUrl = $iconUrl
          }
        } catch {}
      }
      ConvertTo-Json -InputObject @($results) -Compress -Depth 3
    `;

    try {
      const { stdout } = await runPowerShell(
        script,
        { APP_LAUNCHER_FOLDER: folderPath },
        30_000,
        32 * 1024 * 1024,
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

  // Blank same-origin document used by Electron to recover localStorage from
  // older application profiles without rendering or executing the main UI.
  app.get("/migration-storage", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
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
