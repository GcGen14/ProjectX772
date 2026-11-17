// Read public Google Drive folders and fetch Drive's own resized previews (no API key needed).
// The folder must be shared as "Anyone with the link".

export type DriveItem = { id: string; name: string; kind: "photo" | "video"; group: string | null };

const PHOTO_EXT = new Set(["JPG", "JPEG", "PNG", "HEIC", "HEIF", "WEBP"]);
const VIDEO_EXT = new Set(["MOV", "MP4", "AVI", "M4V", "MKV", "3GP", "WEBM"]);
const UA = { "user-agent": "Mozilla/5.0" };

/** Accepts a full Drive folder link or a bare folder id. */
export function folderIdFrom(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/\/folders\/([\w-]{10,})/) ??
    s.match(/[?&]id=([\w-]{10,})/) ??
    s.match(/^([\w-]{10,})$/);
  return m ? m[1] : null;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  tries = 3,
): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...UA, ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return res;
      if (res.status === 404 || res.status === 403) return res;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

export async function folderTitle(id: string): Promise<string | null> {
  const res = await fetchWithRetry(`https://drive.google.com/embeddedfolderview?id=${id}`);
  if (!res?.ok) return null;
  const html = await res.text();
  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  return t ? decode(t[1].trim()) : null;
}

/** Recursively list a public folder. Sub-folder names become the photo "group". */
export async function listFolder(
  id: string,
  group: string | null = null,
  depth = 0,
  seen = new Set<string>(),
): Promise<DriveItem[]> {
  if (seen.has(id) || depth > 6) return [];
  seen.add(id);
  const res = await fetchWithRetry(`https://drive.google.com/embeddedfolderview?id=${id}`);
  if (!res?.ok) throw new Error("อ่านโฟลเดอร์ไม่ได้ — ตรวจว่าแชร์เป็น 'ทุกคนที่มีลิงก์' แล้ว");
  const html = await res.text();
  const out: DriveItem[] = [];
  const re =
    /<a href="(https:\/\/drive\.google\.com\/[^"]+)"[^>]*>[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const url = m[1];
    const name = decode(m[2].trim());
    const fid = url.match(/\/(?:d|folders)\/([\w-]+)/)?.[1];
    if (!fid) continue;
    if (url.includes("/folders/")) {
      out.push(...(await listFolder(fid, group ?? name, depth + 1, seen)));
      continue;
    }
    const ext = name.split(".").pop()?.toUpperCase() ?? "";
    if (PHOTO_EXT.has(ext)) out.push({ id: fid, name, kind: "photo", group });
    else if (VIDEO_EXT.has(ext)) out.push({ id: fid, name, kind: "video", group });
  }
  return out;
}

/** Drive's resized preview (JPEG; Drive converts HEIC for us). */
export async function fetchPreview(id: string, width: number): Promise<Buffer | null> {
  const res = await fetchWithRetry(`https://drive.google.com/thumbnail?id=${id}&sz=w${width}`);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return imageSize(buf) ? buf : null;
}

/** Width/height from a JPEG (SOFn marker) or PNG (IHDR) header. */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50)
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
