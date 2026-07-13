import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const PORT = 3000;

// Lazy initialize Google Gen AI to prevent startup crashes if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Route: Suggest categories, tags, and descriptions for a program/game
  app.post("/api/suggest", async (req, res) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Program name is required" });
    }

    try {
      const ai = getGeminiClient();
      const prompt = `You are an expert utility cataloging and gaming assistant. For the program or game named "${name}", suggest:
1. A category or primary use-case group. Standard categories are: "Gaming", "Productivity", "Creative", "Development", "Streaming & Video", "Utilities", "Communication". Pick one of these or suggest a highly suitable one.
2. A list of 3-5 relevant search keywords/tags (all lowercase, clean, e.g. "photoshop" -> "editing, adobe, design, photo").
3. A short, elegant 1-sentence description of what this program does.

Respond strictly in JSON format matching this schema:
{
  "category": "string",
  "tags": ["string"],
  "description": "string"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING" },
              tags: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              description: { type: "STRING" }
            },
            required: ["category", "tags", "description"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsed = JSON.parse(responseText);
      return res.json(parsed);
    } catch (error: any) {
      console.error("Gemini Suggestion Error:", error);
      return res.status(500).json({
        error: error.message || "Failed to generate suggestions",
        fallback: {
          category: "Utilities",
          tags: [name.toLowerCase().replace(/\s+/g, "")],
          description: `Shortcut launcher for ${name}.`
        }
      });
    }
  });

  // API Route: Launch program locally
  app.post("/api/launch", (req, res) => {
    const { execPath } = req.body;
    if (!execPath) {
      return res.status(400).json({ error: "Execution path is required" });
    }

    // Check platform
    if (process.platform !== "win32") {
      return res.status(400).json({
        error: "Direct local launching is only supported when running this application locally on Windows.",
        isLocal: false
      });
    }

    // Launch on Windows
    // We run `start "" "execPath"` to open the file, directory, shortcut, or custom URI protocol safely
    const command = `start "" "${execPath}"`;
    exec(command, (error) => {
      if (error) {
        console.error("Local launch error:", error);
        return res.status(500).json({
          error: `Failed to launch program. Ensure the path is correct: ${error.message}`
        });
      }
      return res.json({ success: true, message: `Successfully launched ${execPath}` });
    });
  });

  // API Route: Extract icon from executable
  app.post("/api/extract-icon", (req, res) => {
    let { execPath } = req.body;
    if (!execPath) {
      return res.status(400).json({ error: "Execution path is required" });
    }

    // Replace environment variables in path
    if (process.platform === "win32") {
      execPath = execPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);

      const psCommand = `
        Add-Type -AssemblyName System.Drawing
        $path = "${execPath.replace(/"/g, '`"')}"
        if (Test-Path $path) {
          $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
          $bitmap = $icon.ToBitmap()
          $ms = New-Object System.IO.MemoryStream
          $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          $bytes = $ms.ToArray()
          $base64 = [Convert]::ToBase64String($bytes)
          Write-Output $base64
        } else {
          Write-Error "File not found"
          exit 1
        }
      `;

      exec(`powershell -NoProfile -Command "${psCommand.replace(/\\n/g, ' ')}"`, (error, stdout, stderr) => {
        if (error) {
          console.error("Icon extraction error:", error, stderr);
          return res.status(500).json({
            error: `Failed to extract icon: ${error.message}`
          });
        }

        const base64 = stdout.trim().replace(/[\r\n]/g, "");
        if (base64) {
          return res.json({ success: true, iconUrl: `data:image/png;base64,${base64}` });
        } else {
          return res.status(500).json({ error: "No base64 data returned from icon extraction" });
        }
      });
    } else {
      // Sandbox simulation: return a nice, dynamic SVG colored depending on the name
      const name = path.basename(execPath, path.extname(execPath)) || "App";
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const h = Math.abs(hash % 360);
      const color = `hsl(${h}, 70%, 50%)`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect width="100" height="100" rx="22" fill="${color}"/>
        <text x="50" y="58" font-family="system-ui, sans-serif" font-size="38" font-weight="bold" fill="white" text-anchor="middle">${name.charAt(0).toUpperCase()}</text>
      </svg>`;
      const base64Svg = Buffer.from(svg).toString("base64");
      return res.json({
        success: true,
        iconUrl: `data:image/svg+xml;base64,${base64Svg}`,
        simulated: true,
        message: "Simulated icon extraction using modern dynamic SVG builder."
      });
    }
  });

  // API Route: Scan folder for shortcuts (.lnk and .exe)
  app.post("/api/scan-folder", (req, res) => {
    let { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: "Folder path is required" });
    }

    // Replace environment variables in path
    if (process.platform === "win32") {
      folderPath = folderPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
      
      // PowerShell script to parse shortcuts (.lnk) and executables (.exe)
      const psCommand = `
        $folder = "${folderPath.replace(/"/g, '`"')}"
        if (-not (Test-Path $folder)) {
          Write-Error "Folder does not exist"
          exit 1
        }
        $shell = New-Object -ComObject WScript.Shell
        $results = @()

        # Scan LNK files
        Get-ChildItem -Path $folder -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $sc = $shell.CreateShortcut($_.FullName)
            if ($sc.TargetPath) {
              $results += [PSCustomObject]@{
                name = $_.BaseName
                execPath = $sc.TargetPath
                description = $sc.Description
                category = "Others"
                tags = @($_.BaseName.ToLower())
              }
            }
          } catch {}
        }

        # Scan EXE files
        Get-ChildItem -Path $folder -Filter *.exe -ErrorAction SilentlyContinue | ForEach-Object {
          $results += [PSCustomObject]@{
            name = $_.BaseName
            execPath = $_.FullName
            description = "Direct executable launcher."
            category = "Others"
            tags = @($_.BaseName.ToLower())
          }
        }

        $results | ConvertTo-Json -Compress
      `;

      exec(`powershell -NoProfile -Command "${psCommand.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
        if (error) {
          console.error("Scan folder error:", error, stderr);
          return res.status(500).json({
            error: `Failed to scan folder. Ensure the path is accessible and valid: ${error.message}`
          });
        }

        try {
          const parsed = JSON.parse(stdout.trim() || "[]");
          // If only one item, JSON is returned as an object, make it an array
          const shortcutsList = Array.isArray(parsed) ? parsed : [parsed];
          return res.json({ success: true, shortcuts: shortcutsList, platform: "win32" });
        } catch (parseErr) {
          return res.json({ success: true, shortcuts: [], platform: "win32", message: "No shortcuts found or parsing failed." });
        }
      });
    } else {
      // Graceful Sandbox Simulation (Mac / Linux)
      // Since we are running in the cloud sandbox, we will return some mock shortcuts
      // based on standard application folders so that the user can experience the scan feature!
      const simulatedShortcuts = [
        {
          name: "Steam",
          execPath: "C:\\Program Files (x86)\\Steam\\steam.exe",
          description: "Valve Steam game launcher",
          category: "Gaming",
          tags: ["steam", "gaming", "launcher"]
        },
        {
          name: "Discord",
          execPath: "C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe",
          description: "All-in-one voice and text chat",
          category: "Communication",
          tags: ["discord", "chat", "voice"]
        },
        {
          name: "Adobe Photoshop",
          execPath: "C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe",
          description: "Professional digital imaging and graphics design",
          category: "Photography",
          tags: ["photoshop", "editing", "adobe"]
        },
        {
          name: "Microsoft Word",
          execPath: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
          description: "Word processing utility",
          category: "Office",
          tags: ["word", "office", "document"]
        },
        {
          name: "VS Code",
          execPath: "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
          description: "Lightweight source code editor",
          category: "Development",
          tags: ["vscode", "code", "editor"]
        }
      ];

      return res.json({
        success: true,
        shortcuts: simulatedShortcuts,
        platform: "simulation",
        message: `Simulated scan of '${folderPath}'. If you run this app locally on Windows, it will scan your real directory!`
      });
    }
  });

  // Vite Integration
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, server.cjs is bundled inside the dist directory itself.
    // Using __dirname ensures that static assets are resolved relative to the actual code location
    // rather than the working directory (process.cwd()) which can change when launched via shortcuts.
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
