// Runs the whole sandbox in one container: the API as a child process, and the
// UI served from this process, proxying /_sandbox and /health to the API.
// If either side stops, the container stops.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, sep } from "node:path";

const API_PORT = Number(process.env.PORT ?? 15080);
const APP_PORT = Number(process.env.APP_PORT ?? 15088);
const APP_DIR = process.env.APP_DIR ?? "/srv/app";

const api = spawn(process.execPath, ["dist/main.js"], {
  cwd: "/srv/packages/sandbox-api",
  env: { ...process.env, PORT: String(API_PORT) },
  stdio: "inherit",
});
api.on("exit", (code, signal) => {
  console.error(`sandbox-api exited (${signal ?? code})`);
  process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    api.kill(signal);
    server.close();
  });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const proxy = (req, res) => {
  const upstream = http.request(
    { host: "127.0.0.1", port: API_PORT, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end("sandbox-api unavailable"));
  req.pipe(upstream);
};

const sendFile = async (res, path) => {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return false;
  const cache = path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": cache });
  createReadStream(path).pipe(res);
  return true;
};

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path.startsWith("/_sandbox/") || path === "/health") return proxy(req, res);
  const file = join(APP_DIR, normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, ""));
  if (file.startsWith(APP_DIR + sep) && (await sendFile(res, file))) return;
  // Single-page app: unknown paths get the shell.
  if (!(await sendFile(res, join(APP_DIR, "index.html")))) res.writeHead(404).end();
});

server.listen(APP_PORT, () => console.log(`sandbox-app listening on http://localhost:${APP_PORT}`));
