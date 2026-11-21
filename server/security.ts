// Response hardening shared by the production server: security headers, safe URL decoding,
// the real client IP, and compressed + cached static file serving.
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import zlib from "node:zlib";

/** The browser may only load code from this site; everything else is locked down. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://drive.google.com https://i.ytimg.com",
  "media-src 'self' blob: https://drive.google.com",
  "frame-src https://www.youtube-nocookie.com https://drive.google.com https://open.spotify.com",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("content-security-policy", CSP);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.removeHeader("x-powered-by");
  if ((req.headers["x-forwarded-proto"] ?? "") === "https")
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

/** The address the reverse proxy saw. The LAST x-forwarded-for entry is the one our proxy appended
 *  (earlier ones are whatever the client claimed), so it is the only one that can be trusted. */
export function clientIp(req: IncomingMessage): string {
  const xff = String(req.headers["x-forwarded-for"] ?? "");
  const last = xff.split(",").pop()?.trim();
  return last || req.socket.remoteAddress || "?";
}

/** decodeURIComponent that returns null instead of throwing (a bad %-escape must not crash the server). */
export function safeDecode(s: string): string | null {
  try {
    const out = decodeURIComponent(s);
    return out.includes("\0") ? null : out;
  } catch {
    return null;
  }
}

/* ---------------- static files ---------------- */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".webmanifest",
]);

type Entry = {
  mtime: number;
  size: number;
  etag: string;
  raw: Buffer | null;
  br: Buffer | null;
  gz: Buffer | null;
};
const cache = new Map<string, Entry>();

function entryFor(file: string, ext: string): Entry | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
  const e: Entry = {
    mtime: st.mtimeMs,
    size: st.size,
    etag: `W/"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`,
    raw: null,
    br: null,
    gz: null,
  };
  // small compressible files are held in memory, compressed once (brotli is ~15-25% smaller than gzip)
  if (COMPRESSIBLE.has(ext) && st.size < 8_000_000) {
    e.raw = fs.readFileSync(file);
    if (e.raw.length > 512) {
      e.br = zlib.brotliCompressSync(e.raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
      });
      e.gz = zlib.gzipSync(e.raw, { level: 9 });
    }
  }
  cache.set(file, e);
  return e;
}

/** Serve `file`. Returns false when it does not exist. */
export function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  opts: { cache: string } = { cache: "no-cache" },
): boolean {
  const ext = path.extname(file).toLowerCase();
  const e = entryFor(file, ext);
  if (!e) return false;
  res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
  res.setHeader("cache-control", opts.cache);
  res.setHeader("etag", e.etag);
  if (COMPRESSIBLE.has(ext)) res.setHeader("vary", "Accept-Encoding");
  if (req.headers["if-none-match"] === e.etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  const accept = String(req.headers["accept-encoding"] ?? "");
  let body = e.raw;
  if (body && e.br && /\bbr\b/.test(accept)) {
    body = e.br;
    res.setHeader("content-encoding", "br");
  } else if (body && e.gz && /\bgzip\b/.test(accept)) {
    body = e.gz;
    res.setHeader("content-encoding", "gzip");
  }
  if (body) {
    res.setHeader("content-length", body.length);
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return true;
  }
  res.setHeader("content-length", e.size);
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}

/** gzip a JSON string for clients that accept it (large public lists compress ~10x). */
export function sendJsonCompressed(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  json: string,
) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  const accept = String(req.headers["accept-encoding"] ?? "");
  if (json.length < 1024 || !/\bgzip\b/.test(accept)) return res.end(json);
  res.setHeader("content-encoding", "gzip");
  res.setHeader("vary", "Accept-Encoding");
  zlib.gzip(json, { level: 5 }, (err, buf) => {
    if (err) {
      res.removeHeader("content-encoding");
      return res.end(json);
    }
    res.setHeader("content-length", buf.length);
    res.end(buf);
  });
}
