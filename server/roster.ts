// Who is in which photo + teachers.
//
// Studio portraits are grouped in "sets" (one set per student, see scripts/people_groups.json),
// but a set can contain someone else's photo. photo_owner overrides the owner of single photos:
//   owner = "s<no>" (student), "t<id>" (teacher) or "none" (nobody / hidden).
// Without an override a portrait belongs to whichever student has its set (students.portrait_set).
//
//   GET    /api/roster                      { owners, teachers, uploads }
//   POST   /api/admin/owner                 { photos: string[], owner: "s12" | "t3" | "none" | "auto" }
//   POST   /api/admin/teachers              add a (blank) teacher
//   PUT    /api/admin/teachers/:id          { name, nickname, role, subject, quote, avatar, coverPhoto, theme, hidden }
//   POST   /api/admin/teachers/:id/move     { dir: -1 | 1 }
//   DELETE /api/admin/teachers/:id
//   POST   /api/admin/upload                { data, face, w, h, owner? }   (base64 JPEGs, resized in the browser)
//   DELETE /api/admin/upload/:id
//   POST   /api/admin/renumber              { from, to, mode: "all" | "photos" }  fix a wrong student number
//   GET    /uploads/<id>.jpg, /uploads/face-<id>.jpg
import crypto from "node:crypto";
import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { HttpError, type Req } from "./http.ts";
import { ROOT, clean, cleanTheme, getDb, getStudentRow } from "./db.ts";

type Session = { no: number | null; isAdmin: boolean } | null;
type Raw = Record<string, unknown>;

const UPLOAD_DIR = path.join(ROOT, "data", "uploads");
/** photos one student may upload from /me */
const MAX_STUDENT_UPLOADS = 30;
const ID = /^[\w-]{6,80}$/;
const now = () => new Date().toISOString();

/** Number of empty teacher slots created on the very first run. */
const SEED_TEACHERS = 5;

let ready = false;
function db() {
  const d = getDb();
  if (ready) return d;
  d.exec(`
    CREATE TABLE IF NOT EXISTS photo_owner (
      photo_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,           -- s<no> | t<id> | none
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      quote TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      cover_photo TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT '{}',
      sort INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const seeded = d.prepare("SELECT value FROM settings WHERE key = 'teachers_seeded'").get();
  if (!seeded) {
    const ins = d.prepare("INSERT INTO teachers (sort, updated_at) VALUES (?, ?)");
    for (let i = 1; i <= SEED_TEACHERS; i++) ins.run(i, now());
    d.prepare("INSERT INTO settings (key, value) VALUES ('teachers_seeded', '1')").run();
  }
  ready = true;
  return d;
}

export type TeacherRow = {
  id: number;
  name: string;
  nickname: string;
  role: string;
  subject: string;
  quote: string;
  avatar: string;
  coverPhoto: string;
  theme: ReturnType<typeof cleanTheme>;
  sort: number;
  hidden: boolean;
  updatedAt: string;
};

function parseTheme(v: unknown) {
  try {
    return cleanTheme(JSON.parse(typeof v === "string" && v ? v : "{}"));
  } catch {
    return {};
  }
}
const toTeacher = (r: Raw): TeacherRow => ({
  id: Number(r.id),
  name: String(r.name),
  nickname: String(r.nickname),
  role: String(r.role),
  subject: String(r.subject),
  quote: String(r.quote),
  avatar: String(r.avatar),
  coverPhoto: String(r.cover_photo),
  theme: parseTheme(r.theme),
  sort: Number(r.sort),
  hidden: !!r.hidden,
  updatedAt: String(r.updated_at),
});
const listTeachers = () =>
  (db().prepare("SELECT * FROM teachers ORDER BY sort, id").all() as Raw[]).map(toTeacher);
const getTeacher = (id: number) => {
  const r = db().prepare("SELECT * FROM teachers WHERE id = ?").get(id) as Raw | undefined;
  return r ? toTeacher(r) : null;
};

function listOwners(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of db().prepare("SELECT photo_id, owner FROM photo_owner").all() as Raw[])
    out[String(r.photo_id)] = String(r.owner);
  return out;
}
const listUploads = () =>
  (db().prepare("SELECT id, w, h FROM uploads ORDER BY created_at").all() as Raw[]).map((r) => ({
    id: String(r.id),
    w: Number(r.w),
    h: Number(r.h),
  }));

/** Public teachers = named and not hidden; the admin sees everyone. */
export function roster(admin: boolean) {
  return {
    owners: listOwners(),
    teachers: listTeachers().filter((t) => admin || (t.name && !t.hidden)),
    uploads: listUploads(),
  };
}

function checkOwner(owner: string) {
  if (owner === "none" || owner === "auto") return;
  const m = owner.match(/^([st])(\d{1,6})$/);
  if (!m) throw new HttpError(400, "เจ้าของรูปไม่ถูกต้อง");
  const ok = m[1] === "s" ? getStudentRow(Number(m[2])) : getTeacher(Number(m[2]));
  if (!ok) throw new HttpError(404, "ไม่พบคนนี้");
}

function setOwner(photos: string[], owner: string) {
  const d = db();
  const del = d.prepare("DELETE FROM photo_owner WHERE photo_id = ?");
  const put = d.prepare(
    `INSERT INTO photo_owner (photo_id, owner, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(photo_id) DO UPDATE SET owner = excluded.owner, updated_at = excluded.updated_at`,
  );
  for (const id of photos) {
    if (owner === "auto") del.run(id);
    else put.run(id, owner, now());
  }
}

const TEACHER_FIELDS: Record<string, [string, number]> = {
  name: ["name", 100],
  nickname: ["nickname", 40],
  role: ["role", 80],
  subject: ["subject", 80],
  quote: ["quote", 300],
  avatar: ["avatar", 80],
  coverPhoto: ["cover_photo", 80],
};

function updateTeacher(id: number, patch: Raw) {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  for (const [key, [col, max]] of Object.entries(TEACHER_FIELDS)) {
    if (!(key in patch)) continue;
    sets.push(`${col} = ?`);
    vals.push(clean(patch[key], max));
  }
  if ("theme" in patch) {
    sets.push("theme = ?");
    vals.push(JSON.stringify(cleanTheme(patch.theme)));
  }
  if ("hidden" in patch) {
    sets.push("hidden = ?");
    vals.push(patch.hidden ? 1 : 0);
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    vals.push(now());
    db()
      .prepare(`UPDATE teachers SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals, id);
  }
  return getTeacher(id);
}

function moveTeacher(id: number, dir: number) {
  const list = listTeachers();
  const i = list.findIndex((t) => t.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return;
  const order = list.map((t) => t.id);
  [order[i], order[j]] = [order[j], order[i]];
  const upd = db().prepare("UPDATE teachers SET sort = ? WHERE id = ?");
  order.forEach((tid, k) => upd.run(k + 1, tid));
}

/* ---------------- uploads ---------------- */

/** Like readJson but allows big bodies (base64 photos). */
async function readBig(req: Req, max = 12_000_000): Promise<Raw> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = typeof c === "string" ? Buffer.from(c) : (c as Buffer);
    size += b.length;
    if (size > max) throw new HttpError(413, "รูปใหญ่เกินไป");
    chunks.push(b);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return v && typeof v === "object" ? (v as Raw) : {};
  } catch {
    throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
  }
}

function jpeg(v: unknown): Buffer {
  const s = typeof v === "string" ? v.replace(/^data:image\/jpeg;base64,/, "") : "";
  const buf = Buffer.from(s, "base64");
  // JPEG files start with FF D8 FF
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff)
    throw new HttpError(400, "ต้องเป็นไฟล์ JPEG");
  return buf;
}

function saveUpload(body: Raw) {
  const full = jpeg(body.data);
  const face = jpeg(body.face);
  const w = Math.max(1, Math.min(4000, Number(body.w) | 0));
  const h = Math.max(1, Math.min(4000, Number(body.h) | 0));
  const id = `up-${crypto.randomBytes(9).toString("base64url")}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.jpg`), full);
  fs.writeFileSync(path.join(UPLOAD_DIR, `face-${id}.jpg`), face);
  db()
    .prepare("INSERT INTO uploads (id, w, h, created_at) VALUES (?, ?, ?, ?)")
    .run(id, w, h, now());
  return id;
}

function deleteUpload(id: string) {
  const d = db();
  if (!d.prepare("SELECT id FROM uploads WHERE id = ?").get(id)) throw new HttpError(404, "ไม่พบรูป");
  d.prepare("DELETE FROM uploads WHERE id = ?").run(id);
  d.prepare("DELETE FROM photo_owner WHERE photo_id = ?").run(id);
  for (const f of [`${id}.jpg`, `face-${id}.jpg`])
    fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
}

/** Serves /uploads/<id>.jpg and /uploads/face-<id>.jpg. */
export function serveUploads(req: Req, res: ServerResponse): boolean {
  const m = (req.url ?? "").match(/^\/uploads\/((?:face-)?up-[\w-]{6,40})\.jpg(?:\?.*)?$/);
  if (!m) return false;
  const file = path.join(UPLOAD_DIR, `${m[1]}.jpg`);
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    res.end();
    return true;
  }
  res.setHeader("content-type", "image/jpeg");
  res.setHeader("cache-control", "public, max-age=604800, immutable");
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ---------------- routes ---------------- */

/** Returns the response body, or undefined when the path isn't a roster route. */
/* ---------------- student numbers (เลขที่) ---------------- */
const MAX_NO = 99;
/** Columns that hold a student number without a foreign key (FK columns are found automatically). */
const LOOSE_NO_COLUMNS: [string, string][] = [
  ["sessions", "no"],
  ["photo_tags", "updated_by"],
  ["photo_info", "updated_by"],
  ["chat_reads", "reader"],
  ["chat_reads", "peer"],
];

/** Every [table, column] that stores a student number. */
function noColumns(): [string, string][] {
  const d = db();
  const tables = (
    d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  ).map((t) => t.name);
  const out = new Map<string, [string, string]>([["students.no", ["students", "no"]]]);
  for (const t of tables) {
    const cols = new Set(
      (d.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) => c.name),
    );
    const fks = d.prepare(`PRAGMA foreign_key_list("${t}")`).all() as {
      table: string;
      from: string;
    }[];
    for (const fk of fks) if (fk.table === "students") out.set(`${t}.${fk.from}`, [t, fk.from]);
    for (const [lt, lc] of LOOSE_NO_COLUMNS)
      if (lt === t && cols.has(lc)) out.set(`${t}.${lc}`, [t, lc]);
  }
  return [...out.values()];
}

/**
 * Fix a wrong student number.
 *  mode "all":    the whole person moves to number `to` (name, photos, account + password, posts…);
 *                 whoever had `to` gets `from` (or `from` becomes empty if `to` was unused).
 *  mode "photos": only the photos swap (photo set, profile picture, cover, single-photo owners).
 */
function renumber(from: number, to: number, mode: "all" | "photos") {
  const d = db();
  if (!Number.isInteger(to) || to < 1 || to > MAX_NO)
    throw new HttpError(400, `เลขที่ต้องเป็นตัวเลข 1–${MAX_NO}`);
  const a = getStudentRow(from);
  if (!a) throw new HttpError(404, "ไม่พบนักเรียน");
  if (from === to) return;
  const b = getStudentRow(to);
  if (mode === "photos" && !b) throw new HttpError(400, `ยังไม่มีเลขที่ ${to}`);
  if (mode === "all") {
    // private chats are encrypted with the two numbers baked in, so old messages would become unreadable
    const chats = (
      d
        .prepare(
          "SELECT COUNT(*) AS c FROM chat_messages WHERE sender IN (?, ?) OR recipient IN (?, ?)",
        )
        .get(from, to, from, to) as { c: number } | undefined
    )?.c;
    if (chats)
      throw new HttpError(
        409,
        `เลขที่ ${from}${b ? ` หรือ ${to}` : ""} มีแชทส่วนตัวแล้ว ย้ายเลขที่ไม่ได้ (แชทเข้ารหัสด้วยเลขที่) · ใช้ "สลับแค่รูป" แทน`,
      );
  }
  const swapOwners = d.prepare(
    `UPDATE photo_owner SET owner = CASE owner WHEN ? THEN ? ELSE ? END, updated_at = ? WHERE owner IN (?, ?)`,
  );
  d.exec("BEGIN IMMEDIATE");
  try {
    if (mode === "all") {
      d.exec("PRAGMA defer_foreign_keys = ON"); // rows point at each other mid-swap; checked at COMMIT
      const tmp = -100000 - from; // never a real number
      const cols = noColumns();
      const move = (x: number, y: number) => {
        for (const [t, c] of cols)
          d.prepare(`UPDATE "${t}" SET "${c}" = ? WHERE "${c}" = ?`).run(y, x);
      };
      move(from, tmp);
      if (b) move(to, from);
      move(tmp, to);
    } else {
      const set = d.prepare(
        "UPDATE students SET portrait_set = ?, avatar = ?, cover_photo = ?, updated_at = ? WHERE no = ?",
      );
      set.run(b!.portraitSet, b!.avatar, b!.coverPhoto, now(), from);
      set.run(a.portraitSet, a.avatar, a.coverPhoto, now(), to);
    }
    swapOwners.run(`s${from}`, `s${to}`, `s${from}`, now(), `s${from}`, `s${to}`);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export async function handleRoster(
  req: Req,
  urlPath: string,
  session: Session,
  readJson: (req: Req) => Promise<Raw>,
): Promise<unknown> {
  const m = req.method;
  const admin = !!session?.isAdmin;
  if (urlPath === "/api/roster" && m === "GET") return roster(admin);

  // a student's own photos (uploaded from /me for their profile picture / cover)
  if (urlPath === "/api/me/upload" || urlPath.startsWith("/api/me/upload/")) {
    if (!session || session.isAdmin || !session.no) throw new HttpError(401, "ต้องเข้าสู่ระบบก่อน");
    const key = `s${session.no}`;
    if (urlPath === "/api/me/upload" && m === "POST") {
      const mine = db()
        .prepare("SELECT COUNT(*) AS n FROM photo_owner WHERE owner = ? AND photo_id LIKE 'up-%'")
        .get(key) as { n: number };
      if (mine.n >= MAX_STUDENT_UPLOADS)
        throw new HttpError(400, `อัปโหลดได้สูงสุด ${MAX_STUDENT_UPLOADS} รูป ลบรูปเก่าก่อนนะ`);
      const id = saveUpload(await readBig(req, 8_000_000));
      setOwner([id], key);
      return { ...roster(false), uploaded: id };
    }
    const own = urlPath.match(/^\/api\/me\/upload\/(up-[\w-]{6,40})$/);
    if (own && m === "DELETE") {
      const row = db().prepare("SELECT owner FROM photo_owner WHERE photo_id = ?").get(own[1]) as
        | { owner: string }
        | undefined;
      if (row?.owner !== key) throw new HttpError(403, "ลบได้เฉพาะรูปที่ตัวเองอัปโหลด");
      deleteUpload(own[1]);
      return roster(false);
    }
    throw new HttpError(404, "ไม่พบ");
  }

  const isRoster =
    urlPath === "/api/admin/owner" ||
    urlPath.startsWith("/api/admin/teachers") ||
    urlPath.startsWith("/api/admin/upload") ||
    urlPath === "/api/admin/renumber";
  if (!isRoster) return undefined;
  if (!admin) throw new HttpError(401, "ต้องเข้าสู่ระบบผู้ดูแล");

  if (urlPath === "/api/admin/renumber" && m === "POST") {
    const body = await readJson(req);
    renumber(Number(body.from), Number(body.to), body.mode === "photos" ? "photos" : "all");
    return roster(true);
  }

  if (urlPath === "/api/admin/owner" && m === "POST") {
    const body = await readJson(req);
    const photos = (Array.isArray(body.photos) ? body.photos : [])
      .filter((x): x is string => typeof x === "string" && ID.test(x))
      .slice(0, 500);
    const owner = clean(body.owner, 12);
    checkOwner(owner);
    setOwner(photos, owner);
    return roster(true);
  }

  if (urlPath === "/api/admin/teachers" && m === "POST") {
    const max = db().prepare("SELECT COALESCE(MAX(sort), 0) AS s FROM teachers").get() as {
      s: number;
    };
    const r = db()
      .prepare("INSERT INTO teachers (sort, updated_at) VALUES (?, ?)")
      .run(max.s + 1, now());
    return { ...roster(true), created: Number(r.lastInsertRowid) };
  }
  const tm = urlPath.match(/^\/api\/admin\/teachers\/(\d+)(\/move)?$/);
  if (tm) {
    const id = Number(tm[1]);
    if (!getTeacher(id)) throw new HttpError(404, "ไม่พบครู");
    if (tm[2] && m === "POST") {
      const body = await readJson(req);
      moveTeacher(id, Number(body.dir));
      return roster(true);
    }
    if (!tm[2] && m === "PUT") {
      updateTeacher(id, await readJson(req));
      return roster(true);
    }
    if (!tm[2] && m === "DELETE") {
      db().prepare("DELETE FROM teachers WHERE id = ?").run(id);
      // their photos go back to the default owner
      db().prepare("DELETE FROM photo_owner WHERE owner = ?").run(`t${id}`);
      return roster(true);
    }
  }

  if (urlPath === "/api/admin/upload" && m === "POST") {
    const body = await readBig(req);
    const owner = clean(body.owner, 12);
    if (owner) checkOwner(owner);
    const id = saveUpload(body);
    if (owner && owner !== "auto") setOwner([id], owner);
    return { ...roster(true), uploaded: id };
  }
  const um = urlPath.match(/^\/api\/admin\/upload\/(up-[\w-]{6,40})$/);
  if (um && m === "DELETE") {
    deleteUpload(um[1]);
    return roster(true);
  }
  throw new HttpError(404, "ไม่พบ");
}
