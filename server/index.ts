// Standalone production server: serves the built site (dist/) + the /api database.
//   npm start            (builds, then runs this on http://localhost:3000)
//   PORT=8080 ADMIN_PASSWORD=... node server/index.ts
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createApi, sessionFrom } from "./api.ts";
import { createExtrasApi } from "./extras.ts";
import { ROOT, getDb } from "./db.ts";
import { safeDecode, securityHeaders, sendFile } from "./security.ts";

const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 3000);
// The admin screens are built into their own chunk (vite.config.ts) that only the logged-in admin
// is ever sent, so the admin UI and its endpoint list never reach a visitor's browser.
const ADMIN_ASSET = /^\/assets\/admin-[\w-]+\.(?:js|css)$/;
const IMMUTABLE = "public, max-age=31536000, immutable";

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ not found. Run `npm run build` first (npm start does this for you).");
  process.exit(1);
}
getDb();
const api = createApi();
const extras = createExtrasApi();

function notFound(res: http.ServerResponse) {
  res.statusCode = 404;
  res.setHeader("cache-control", "no-store");
  res.end();
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    return res.end();
  }
  const urlPath = safeDecode(new URL(req.url ?? "/", "http://x").pathname);
  if (urlPath === null) {
    res.statusCode = 400;
    return res.end();
  }
  if (ADMIN_ASSET.test(urlPath) && !sessionFrom(req)?.isAdmin) return notFound(res);
  const file = path.normalize(path.join(DIST, urlPath));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.statusCode = 403;
    return res.end();
  }
  // dotfiles and source maps are never served
  if (/(^|[\/])\./.test(path.relative(DIST, file)) || file.endsWith(".map")) return notFound(res);
  const hashed = urlPath.startsWith("/assets/");
  const cacheControl = hashed
    ? IMMUTABLE
    : urlPath.startsWith("/photos/")
      ? "public, max-age=2592000"
      : "no-cache";
  if (sendFile(req, res, file, { cache: cacheControl })) return;
  // a missing file under /assets or with an extension is a real 404; everything else is an SPA route
  if (hashed || path.extname(urlPath)) return notFound(res);
  if (urlPath.replace(/\/+$/, "") === "/backend") res.setHeader("x-robots-tag", "noindex, nofollow");
  sendFile(req, res, path.join(DIST, "index.html"), { cache: "no-cache" });
}

const server = http.createServer((req, res) => {
  securityHeaders(req, res);
  try {
    extras(req, res, () => api(req, res, () => serveStatic(req, res)));
  } catch (e) {
    console.error("[server]", e);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  }
});
server.requestTimeout = 120_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;
server.on("clientError", (_e, socket) => socket.destroy());
server.listen(PORT, () => console.log(`602 memories running on http://localhost:${PORT}`));

// one bad request must never take the whole site down
process.on("uncaughtException", (e) => console.error("[uncaught]", e));
process.on("unhandledRejection", (e) => console.error("[unhandled]", e));
