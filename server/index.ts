// Standalone production server: serves the built site (dist/) + the /api database.
//   npm start            (builds, then runs this on http://localhost:3000)
//   PORT=8080 ADMIN_PASSWORD=... node server/index.ts
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createApi } from "./api.ts";
import { createExtrasApi } from "./extras.ts";
import { ROOT, getDb } from "./db.ts";

const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 3000);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ not found. Run `npm run build` first (npm start does this for you).");
  process.exit(1);
}
getDb();
const api = createApi();
const extras = createExtrasApi();

http
  .createServer((req, res) => {
    extras(req, res, () =>
      api(req, res, () => {
        const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
        let file = path.normalize(path.join(DIST, urlPath));
        if (file !== DIST && !file.startsWith(DIST + path.sep)) {
          res.statusCode = 403;
          return res.end();
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
          file = path.join(DIST, "index.html"); // SPA fallback
        const ext = path.extname(file).toLowerCase();
        res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
        if (urlPath.startsWith("/assets/") || urlPath.startsWith("/photos/"))
          res.setHeader("cache-control", "public, max-age=604800");
        fs.createReadStream(file).pipe(res);
      }),
    );
  })
  .listen(PORT, () => console.log(`602 memories running on http://localhost:${PORT}`));
