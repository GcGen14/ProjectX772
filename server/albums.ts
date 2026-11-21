// Albums live in the database so new Google Drive folders can be added from /backend.
// Built-in albums (src/data/albums.json + src/data/manifest.json) are imported once; their files
// are in public/photos. Anything synced later is stored in data/media and served at /media/*.
import { spawn } from "node:child_process";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fetchPreview, folderTitle, imageSize, listFolder, type DriveItem } from "./drive.ts";
import { ROOT, getDb } from "./db.ts";

const MEDIA_DIR = path.join(ROOT, "data", "media");
/** Face matching on the server (see startFaces); its people.json wins over the bundled one. */
export const FACES_HOME = path.join(ROOT, "data", "faces");
const LARGE_PER_ALBUM = 14;
const MAX_ITEMS_PER_SYNC = 5000;

export type MediaRow = {
  id: string;
  name: string;
  kind: "photo" | "video";
  w: number;
  h: number;
  group: string | null;
  thumb: boolean;
  large: boolean;
  base: "photos" | "media";
};
export type AlbumRow = {
  slug: string;
  title: string;
  en: string;
  tagline: string;
  about: string;
  tags: { label: string; icon: string }[];
  folders: string[];
  showGroups: boolean;
  builtin: boolean;
  hidden: boolean;
  sort: number;
  syncedAt: string;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function ensureAlbumTables() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      en TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT '',
      about TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      folders TEXT NOT NULL DEFAULT '[]',
      show_groups INTEGER NOT NULL DEFAULT 0,
      builtin INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS album_media (
      album TEXT NOT NULL REFERENCES albums(slug) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      w INTEGER NOT NULL DEFAULT 0,
      h INTEGER NOT NULL DEFAULT 0,
      grp TEXT,
      has_thumb INTEGER NOT NULL DEFAULT 0,
      large INTEGER NOT NULL DEFAULT 0,
      base TEXT NOT NULL DEFAULT 'media',
      sort INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (album, id)
    );
  `);
  seedBuiltin();
}

/**
 * Copies the built-in albums into the database: all of them on first run, later only ones newly
 * added to albums.json (built-in albums can't be deleted, so a missing slug is always a new one).
 */
function seedBuiltin() {
  const d = getDb();
  const have = new Set(
    (d.prepare("SELECT slug FROM albums").all() as { slug: string }[]).map((r) => r.slug),
  );
  const meta = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "data", "albums.json"), "utf8"),
  ) as {
    albums: (Omit<AlbumRow, "builtin" | "hidden" | "sort" | "syncedAt"> & {
      showGroups?: boolean;
    })[];
  };
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "data", "manifest.json"), "utf8"),
  ) as {
    generatedAt: string;
    albums: Record<string, { photos: Raw[]; videos: Raw[] }>;
  };
  const insA = d.prepare(
    `INSERT OR IGNORE INTO albums (slug, title, en, tagline, about, tags, folders, show_groups, builtin, sort, synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  );
  const insM = d.prepare(
    `INSERT OR IGNORE INTO album_media (album, id, name, kind, w, h, grp, has_thumb, large, base, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'photos', ?)`,
  );
  const added = meta.albums.filter((a) => !have.has(a.slug));
  if (!added.length) return;
  meta.albums.forEach((a, i) => {
    if (have.has(a.slug)) return;
    insA.run(
      a.slug,
      a.title,
      a.en,
      a.tagline,
      a.about,
      JSON.stringify(a.tags),
      JSON.stringify(a.folders),
      a.showGroups ? 1 : 0,
      i,
      manifest.generatedAt,
      manifest.generatedAt,
    );
    const src = manifest.albums[a.slug] ?? { photos: [], videos: [] };
    let k = 0;
    for (const p of src.photos)
      insM.run(
        a.slug,
        str(p.id),
        str(p.name),
        "photo",
        Number(p.w ?? 0),
        Number(p.h ?? 0),
        (p.group as string) ?? null,
        1,
        p.large ? 1 : 0,
        k++,
      );
    for (const v of src.videos)
      insM.run(
        a.slug,
        str(v.id),
        str(v.name),
        "video",
        Number(v.w ?? 0),
        Number(v.h ?? 0),
        (v.group as string) ?? null,
        v.thumb ? 1 : 0,
        0,
        k++,
      );
  });
  console.log(`[albums] imported built-in albums: ${added.map((a) => a.slug).join(", ")}`);
}

const toAlbum = (r: Raw): AlbumRow => ({
  slug: String(r.slug),
  title: String(r.title),
  en: String(r.en),
  tagline: String(r.tagline),
  about: String(r.about),
  tags: JSON.parse(String(r.tags)) as AlbumRow["tags"],
  folders: JSON.parse(String(r.folders)) as string[],
  showGroups: r.show_groups === 1,
  builtin: r.builtin === 1,
  hidden: r.hidden === 1,
  sort: Number(r.sort),
  syncedAt: String(r.synced_at),
});
const toMedia = (r: Raw): MediaRow => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind === "video" ? "video" : "photo",
  w: Number(r.w),
  h: Number(r.h),
  group: typeof r.grp === "string" ? r.grp : null,
  thumb: r.has_thumb === 1,
  large: r.large === 1,
  base: r.base === "photos" ? "photos" : "media",
});

export function getAlbumRow(slug: string): AlbumRow | null {
  const r = getDb().prepare("SELECT * FROM albums WHERE slug = ?").get(slug) as Raw | undefined;
  return r ? toAlbum(r) : null;
}

/** Albums with their media, for the site. `includeHidden` for the admin. */
export function listAlbums(includeHidden = false) {
  const d = getDb();
  const albums = (d.prepare("SELECT * FROM albums ORDER BY sort, created_at").all() as Raw[])
    .map(toAlbum)
    .filter((a) => includeHidden || !a.hidden);
  const stmt = d.prepare("SELECT * FROM album_media WHERE album = ? ORDER BY sort");
  return albums.map((a) => {
    const rows = (stmt.all(a.slug) as Raw[]).map(toMedia);
    return {
      ...a,
      photos: rows.filter((m) => m.kind === "photo" && m.w > 0),
      videos: rows.filter((m) => m.kind === "video"),
    };
  });
}

export function isKnownMedia(id: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM album_media WHERE id = ? AND kind = 'photo' LIMIT 1")
    .get(id);
}

function slugFrom(text: string): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "album";
  let slug = base;
  for (let i = 2; getAlbumRow(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createAlbum(input: {
  folder: string;
  title?: string;
  en?: string;
  tagline?: string;
  about?: string;
}) {
  const title = input.title?.trim() || (await folderTitle(input.folder)) || "อัลบั้มใหม่";
  const slug = slugFrom(input.en?.trim() || `album-${Date.now().toString(36)}`);
  const d = getDb();
  const sort = (
    d.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM albums").get() as { s: number }
  ).s;
  d.prepare(
    `INSERT INTO albums (slug, title, en, tagline, about, tags, folders, show_groups, builtin, sort, created_at)
     VALUES (?, ?, ?, ?, ?, '[]', ?, 0, 0, ?, ?)`,
  ).run(
    slug,
    title,
    input.en ?? "",
    input.tagline ?? "",
    input.about ?? "",
    JSON.stringify([input.folder]),
    sort,
    new Date().toISOString(),
  );
  return slug;
}

export function updateAlbum(
  slug: string,
  patch: Partial<
    Pick<AlbumRow, "title" | "en" | "tagline" | "about" | "showGroups" | "hidden" | "sort">
  > & { tags?: string[] },
) {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  const text = { title: 80, en: 60, tagline: 200, about: 1000 } as const;
  for (const [k, max] of Object.entries(text)) {
    const v = patch[k as keyof typeof text];
    if (typeof v === "string") {
      sets.push(`${k} = ?`);
      vals.push(v.trim().slice(0, max));
    }
  }
  if (typeof patch.showGroups === "boolean") {
    sets.push("show_groups = ?");
    vals.push(patch.showGroups ? 1 : 0);
  }
  if (typeof patch.hidden === "boolean") {
    sets.push("hidden = ?");
    vals.push(patch.hidden ? 1 : 0);
  }
  if (typeof patch.sort === "number" && Number.isFinite(patch.sort)) {
    sets.push("sort = ?");
    vals.push(Math.round(patch.sort));
  }
  if (Array.isArray(patch.tags)) {
    const tags = patch.tags
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .slice(0, 6)
      .map((t) => ({ label: t.trim().slice(0, 30), icon: "sparkle" }));
    sets.push("tags = ?");
    vals.push(JSON.stringify(tags));
  }
  if (sets.length)
    getDb()
      .prepare(`UPDATE albums SET ${sets.join(", ")} WHERE slug = ?`)
      .run(...vals, slug);
  return getAlbumRow(slug);
}

export function addFolder(slug: string, folder: string) {
  const a = getAlbumRow(slug);
  if (!a) return null;
  if (!a.folders.includes(folder)) {
    getDb()
      .prepare("UPDATE albums SET folders = ? WHERE slug = ?")
      .run(JSON.stringify([...a.folders, folder]), slug);
  }
  return getAlbumRow(slug);
}

/** Delete an added album (built-in ones can only be hidden). Removes its downloaded files. */
export function deleteAlbum(slug: string) {
  const a = getAlbumRow(slug);
  if (!a || a.builtin) return false;
  const d = getDb();
  const ids = (
    d.prepare("SELECT id FROM album_media WHERE album = ? AND base = 'media'").all(slug) as {
      id: string;
    }[]
  ).map((r) => r.id);
  d.prepare("DELETE FROM albums WHERE slug = ?").run(slug);
  for (const id of ids) {
    const stillUsed = d
      .prepare("SELECT 1 FROM album_media WHERE id = ? AND base = 'media' LIMIT 1")
      .get(id);
    if (stillUsed) continue;
    for (const sub of ["thumbs", "large"])
      fs.rmSync(path.join(MEDIA_DIR, sub, `${id}.jpg`), { force: true });
  }
  return true;
}

/* ---------------- background jobs ---------------- */

export type Job = {
  kind: "sync" | "faces";
  state: "running" | "done" | "error";
  done: number;
  total: number;
  message: string;
  startedAt: string;
  finishedAt?: string;
  added?: number;
};
const jobs = new Map<string, Job>(); // key: album slug, or "faces"
export const jobStatus = () => Object.fromEntries(jobs);

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Pull new photos/videos from every folder of an album. Existing items are kept as they are. */
export function startSync(slug: string): Job {
  const running = jobs.get(slug);
  if (running?.state === "running") return running;
  const job: Job = {
    kind: "sync",
    state: "running",
    done: 0,
    total: 0,
    message: "กำลังอ่านโฟลเดอร์…",
    startedAt: new Date().toISOString(),
  };
  jobs.set(slug, job);
  void runSync(slug, job).catch((e: unknown) => {
    job.state = "error";
    job.message = (e as Error).message;
    job.finishedAt = new Date().toISOString();
  });
  return job;
}

async function runSync(slug: string, job: Job) {
  const a = getAlbumRow(slug);
  if (!a) throw new Error("ไม่พบอัลบั้ม");
  const d = getDb();
  fs.mkdirSync(path.join(MEDIA_DIR, "thumbs"), { recursive: true });
  fs.mkdirSync(path.join(MEDIA_DIR, "large"), { recursive: true });

  const listed: DriveItem[] = [];
  for (const f of a.folders) listed.push(...(await listFolder(f)));
  const have = new Set(
    (d.prepare("SELECT id FROM album_media WHERE album = ?").all(slug) as { id: string }[]).map(
      (r) => r.id,
    ),
  );
  const fresh = [
    ...new Map(listed.filter((x) => !have.has(x.id)).map((x) => [x.id, x])).values(),
  ].slice(0, MAX_ITEMS_PER_SYNC);
  job.total = fresh.length;
  job.message = fresh.length ? `พบไฟล์ใหม่ ${fresh.length} ไฟล์ กำลังดาวน์โหลดภาพตัวอย่าง…` : "ไม่มีไฟล์ใหม่";

  let sort = (
    d
      .prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM album_media WHERE album = ?")
      .get(slug) as { s: number }
  ).s;
  const ins = d.prepare(
    `INSERT OR IGNORE INTO album_media (album, id, name, kind, w, h, grp, has_thumb, large, base, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'media', ?)`,
  );
  let added = 0;
  await pool(fresh, 6, async (item) => {
    const file = path.join(MEDIA_DIR, "thumbs", `${item.id}.jpg`);
    let buf: Buffer | null = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!buf) {
      buf = await fetchPreview(item.id, 600);
      if (buf) fs.writeFileSync(file, buf);
    }
    const size = buf ? imageSize(buf) : null;
    // photos Drive can't render are skipped; videos are kept (they play through Drive's player)
    if (item.kind === "photo" && !size) {
      job.done++;
      return;
    }
    ins.run(
      slug,
      item.id,
      item.name,
      item.kind,
      size?.w ?? 0,
      size?.h ?? 0,
      item.group,
      size ? 1 : 0,
      sort++,
    );
    added++;
    job.done++;
  });

  // larger copies for covers / hero cards, spread across the album
  const needLarge = (
    d.prepare("SELECT COUNT(*) AS c FROM album_media WHERE album = ? AND large = 1").get(slug) as {
      c: number;
    }
  ).c;
  if (needLarge < LARGE_PER_ALBUM) {
    job.message = "กำลังเตรียมรูปปก…";
    const photos = d
      .prepare(
        "SELECT id, base FROM album_media WHERE album = ? AND kind = 'photo' AND large = 0 AND base = 'media' ORDER BY sort",
      )
      .all(slug) as { id: string; base: string }[];
    const step = Math.max(1, Math.floor(photos.length / (LARGE_PER_ALBUM - needLarge)));
    const picks = photos.filter((_, i) => i % step === 0).slice(0, LARGE_PER_ALBUM - needLarge);
    await pool(picks, 4, async (p) => {
      const dir = path.join(MEDIA_DIR, "large");
      const file = path.join(dir, `${p.id}.jpg`);
      if (!fs.existsSync(file)) {
        const big = await fetchPreview(p.id, 1600);
        if (!big) return;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, big);
      }
      d.prepare("UPDATE album_media SET large = 1 WHERE album = ? AND id = ?").run(slug, p.id);
    });
  }

  // show sub-folder chips automatically when the album is organised into sub-folders
  const groups = (
    d
      .prepare(
        "SELECT COUNT(DISTINCT grp) AS c FROM album_media WHERE album = ? AND kind = 'photo' AND grp IS NOT NULL",
      )
      .get(slug) as { c: number }
  ).c;
  if (!a.builtin && groups > 1)
    d.prepare("UPDATE albums SET show_groups = 1 WHERE slug = ?").run(slug);

  d.prepare("UPDATE albums SET synced_at = ? WHERE slug = ?").run(new Date().toISOString(), slug);
  job.state = "done";
  job.added = added;
  job.message = added ? `เพิ่มแล้ว ${added} ไฟล์` : "ไม่มีไฟล์ใหม่ (ทุกอย่างเป็นปัจจุบันแล้ว)";
  job.finishedAt = new Date().toISOString();
}

/** Run the Python face matcher (scripts/faces.py) so new photos get classmates tagged. */
export function startFaces(): Job {
  const running = jobs.get("faces");
  if (running?.state === "running") return running;
  const job: Job = {
    kind: "faces",
    state: "running",
    done: 0,
    total: 0,
    message: "กำลังหาใบหน้าในรูปใหม่…",
    startedAt: new Date().toISOString(),
  };
  jobs.set("faces", job);
  // dev: scripts/ (models in scripts/models). Server: the script ships in server/faces/ and its
  // models, cache, Python venv and output live in data/faces/ (the only folder a deploy keeps).
  const home = FACES_HOME;
  const script = [
    path.join(ROOT, "scripts", "faces.py"),
    path.join(ROOT, "server", "faces", "faces.py"),
  ].find((f) => fs.existsSync(f));
  const models = fs.existsSync(path.join(home, "models"))
    ? path.join(home, "models")
    : path.join(ROOT, "scripts", "models");
  if (!script || !fs.existsSync(path.join(models, "face_recognition_sface_2021dec.onnx"))) {
    job.state = "error";
    job.message = "ไม่พบไฟล์โมเดลใบหน้าใน scripts/models (ใช้ได้เฉพาะเครื่องที่ตั้งค่าไว้)";
    return job;
  }
  const venv = path.join(home, "venv", "bin", "python");
  const python =
    process.env.PYTHON ??
    (fs.existsSync(venv) ? venv : process.platform === "win32" ? "python" : "python3");
  const env = models.startsWith(home) ? { ...process.env, FACES_HOME: home } : process.env;
  const run = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn(python, ["-I", "-u", script, ...args], {
        cwd: ROOT,
        env,
        windowsHide: true,
      });
      let err = "";
      p.stdout.on("data", (c: Buffer) => {
        const line = c.toString().trim().split("\n").pop() ?? "";
        const m = line.match(/(\d+)\/(\d+) photos/);
        if (m) {
          job.done = Number(m[1]);
          job.total = Number(m[2]);
        }
        if (line) job.message = line.slice(0, 160);
      });
      p.stderr.on("data", (c: Buffer) => (err += c.toString()));
      p.on("error", (e) => reject(new Error(`เรียก Python ไม่ได้: ${e.message}`)));
      p.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(err.trim().split("\n").pop() || `faces.py ออกด้วยรหัส ${code}`)),
      );
    });
  void (async () => {
    try {
      job.message = "กำลังโหลดรูปนักเรียนจากเว็บโรงเรียน…";
      await run(["refs"]); // downloads only new / changed school photos, then embeds them
      await run(["class"]);
      job.message = "กำลังจับคู่ใบหน้ากับเพื่อนในห้อง…";
      await run(["match"]);
      job.message = "กำลังจัดรูปเป็นเหตุการณ์…";
      await run(["events"]);
      job.state = "done";
      job.message = "จับคู่ใบหน้าและจัดกลุ่มเหตุการณ์เสร็จแล้ว";
    } catch (e) {
      job.state = "error";
      job.message = (e as Error).message;
    }
    job.finishedAt = new Date().toISOString();
  })();
  return job;
}

/** Serve downloaded media: /media/thumbs/<id>.jpg and /media/large/<id>.jpg */
export function serveMedia(req: IncomingMessage, res: ServerResponse): boolean {
  const m = (req.url ?? "").match(/^\/media\/(thumbs|large)\/([\w-]{10,80})\.jpg(?:\?.*)?$/);
  if (!m) return false;
  const file = path.join(MEDIA_DIR, m[1], `${m[2]}.jpg`);
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    res.end();
    return true;
  }
  res.setHeader("content-type", "image/jpeg");
  res.setHeader("cache-control", "public, max-age=604800");
  fs.createReadStream(file).pipe(res);
  return true;
}
