import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const mimeTypes: Record<string, string> = {
  ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json",
  ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2"
};

export function startLocalServer(port = 3000): Promise<void> {
  const root = __dirname;
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
        const candidate = path.resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
        const filePath = candidate.startsWith(root) ? candidate : path.join(root, "index.html");
        const content = await readFile(filePath);
        response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream", "Cache-Control": "no-store" });
        response.end(content);
      } catch {
        try {
          const content = await readFile(path.join(root, "index.html"));
          response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
          response.end(content);
        } catch {
          response.writeHead(404); response.end();
        }
      }
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}
