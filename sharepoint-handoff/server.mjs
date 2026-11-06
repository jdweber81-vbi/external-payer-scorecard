import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const dataDir = path.join(root, "mock-data");
const filesDir = path.join(dataDir, "files");
const stateFile = path.join(dataDir, "state.json");
loadEnv(path.join(root, ".env"));

const host = process.env.SCORECARD_HOST || "127.0.0.1";
const port = Number(process.env.SCORECARD_PORT || 5190);
const accessCode = process.env.SCORECARD_ACCESS_CODE || "Scorecard26!#";
const sessionSecret = crypto.randomBytes(32);
let remoteCookie = "";

await fs.mkdir(filesDir, { recursive: true });

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(x => {
    const i = x.indexOf("=");
    return [x.slice(0, i).trim(), decodeURIComponent(x.slice(i + 1))];
  }));
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function role(req) {
  const token = cookies(req).scorecard_session;
  if (!token) return null;
  const [value, signature] = token.split(".");
  if (!value || !signature || sign(value) !== signature) return null;
  const [expires, selectedRole] = Buffer.from(value, "base64url").toString().split(":");
  return Number(expires) > Date.now() ? selectedRole : null;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body(req, limit = 55 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw Object.assign(new Error("Request is too large"), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function serveFile(res, file) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function authenticateRemote(base) {
  if (remoteCookie || !process.env.SCORECARD_AI_WORKER_ACCESS_CODE) return;
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ accessCode: process.env.SCORECARD_AI_WORKER_ACCESS_CODE })
  });
  remoteCookie = response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function proxyAi(req, res) {
  const base = (process.env.SCORECARD_AI_WORKER_URL || "").replace(/\/$/, "");
  if (!base) return json(res, 503, { error: "Set SCORECARD_AI_WORKER_URL in .env to enable the AI bridge." });
  const payload = await body(req, 12 * 1024 * 1024);
  await authenticateRemote(base);
  let response = await fetch(`${base}/api/ai`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(remoteCookie ? { Cookie: remoteCookie } : {}) },
    body: payload
  });
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status) && process.env.SCORECARD_AI_WORKER_ACCESS_CODE) {
    remoteCookie = "";
    await authenticateRemote(base);
    response = await fetch(`${base}/api/ai`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: remoteCookie }, body: payload });
  }
  const text = await response.text();
  res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const form = new URLSearchParams((await body(req, 8192)).toString());
      if (form.get("accessCode") !== accessCode) {
        res.writeHead(303, { Location: "/login?error=1" }).end();
        return;
      }
      const selectedRole = ["viewer", "contributor", "admin"].includes(form.get("role")) ? form.get("role") : "admin";
      const value = Buffer.from(`${Date.now() + 12 * 60 * 60 * 1000}:${selectedRole}`).toString("base64url");
      res.writeHead(303, { Location: "/", "Set-Cookie": `scorecard_session=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` }).end();
      return;
    }
    if (url.pathname === "/auth/logout" && req.method === "POST") {
      res.writeHead(303, { Location: "/login", "Set-Cookie": "scorecard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }).end();
      return;
    }
    if (url.pathname === "/login" || url.pathname === "/login.html") {
      res.writeHead(303, { Location: "/" }).end();
      return;
    }

    // A real SharePoint page receives identity and permissions from Microsoft 365.
    // The local harness skips a redundant application login and simulates Site Owner access.
    const selectedRole = role(req) || "admin";

    if (url.pathname === "/mock-api/session" && req.method === "GET") return json(res, 200, { role: selectedRole, mode: "Mock SharePoint", sharedStorage: true });
    if (url.pathname === "/mock-api/state" && req.method === "GET") {
      if (!existsSync(stateFile)) return json(res, 200, { state: null });
      return json(res, 200, { state: JSON.parse(await fs.readFile(stateFile, "utf8")) });
    }
    if (url.pathname === "/mock-api/state" && req.method === "PUT") {
      if (selectedRole === "viewer") return json(res, 403, { error: "Viewer role is read-only" });
      const incoming = JSON.parse((await body(req, 5 * 1024 * 1024)).toString());
      incoming.mockSharePoint = { lastSaved: new Date().toISOString(), savedByRole: selectedRole };
      await fs.writeFile(stateFile, JSON.stringify(incoming, null, 2));
      return json(res, 200, { ok: true, metadata: incoming.mockSharePoint });
    }
    const fileMatch = url.pathname.match(/^\/mock-api\/files\/([a-zA-Z0-9-]+)$/);
    if (fileMatch) {
      const target = path.join(filesDir, fileMatch[1]);
      if (req.method === "GET") {
        if (!existsSync(target)) return json(res, 404, { error: "File not found" });
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `inline; filename="${fileMatch[1]}"` });
        return createReadStream(target).pipe(res);
      }
      if (selectedRole === "viewer") return json(res, 403, { error: "Viewer role is read-only" });
      if (req.method === "PUT") {
        await fs.writeFile(target, await body(req));
        return json(res, 201, { ok: true });
      }
      if (req.method === "DELETE") {
        await fs.rm(target, { force: true });
        return json(res, 200, { ok: true });
      }
    }
    if (url.pathname === "/api/ai" && req.method === "POST") return proxyAi(req, res);

    const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const safe = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    return serveFile(res, path.join(dist, safe));
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Unexpected error" });
  }
});

server.listen(port, host, () => {
  console.log(`External Payer Scorecard mock SharePoint site: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`Shared library folder: ${filesDir}`);
  console.log(process.env.SCORECARD_AI_WORKER_URL ? "Cloudflare AI bridge configured." : "AI bridge not configured; deterministic fallbacks remain available.");
});
