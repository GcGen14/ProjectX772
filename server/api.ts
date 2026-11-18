// JSON API for the class site. Mounted by the Vite dev/preview servers (vite.config.ts)
// and by the standalone production server (server/index.ts).
//
//   GET  /api/students                public profiles
//   GET  /api/badges                  badge catalog (หัวหน้าห้อง, Beta tester, ...)
//   PUT  /api/admin/badges            { badges }  replace the catalog
//   GET  /api/me                      who is logged in (+ own profile)
//   POST /api/login                   { no, password }   (password = own password or one-time code)
//   POST /api/logout
//   POST /api/me/password             { current?, next }
//   PUT  /api/me                      { nickname, fullName, ... }  update own profile
//   POST /api/admin/login             { password }
//   GET  /api/admin/students          everything incl. one-time codes
//   PUT  /api/admin/students/:no      update any field
//   POST /api/admin/students/:no/reset   new one-time code, signs the student out
//   /api/chat/*, /api/wall*           chat + public messages, see server/social.ts
import type { ServerResponse } from "node:http";
import { HttpError, readJson, type Req } from "./http.ts";
import { handleSocial } from "./social.ts";
import { handleRoster, serveUploads } from "./roster.ts";
import {
  clearFails,
  createSession,
  deleteSession,
  deleteSessionsFor,
  hashSecret,
  isLocked,
  newCode,
  noteFail,
  readSession,
  verifySecret,
} from "./auth.ts";
import {
  ADMIN_FIELDS,
  SELF_FIELDS,
  clean,
  cleanSlug,
  studentBySlug,
  getBadges,
  getDb,
  getStudentRow,
  saveBadges,
  listPhotoData,
  listStudents,
  savePhotoInfo,
  setPhotoTag,
  updateStudent,
} from "./db.ts";
import fs from "node:fs";
import path from "node:path";
import {
  addFolder,
  createAlbum,
  deleteAlbum,
  ensureAlbumTables,
  getAlbumRow,
  isKnownMedia,
  jobStatus,
  listAlbums,
  serveMedia,
  startFaces,
  FACES_HOME,
  startSync,
  updateAlbum,
} from "./albums.ts";
import { folderIdFrom } from "./drive.ts";
import { ROOT } from "./db.ts";

type Res = ServerResponse;
type Next = (err?: unknown) => void;

const COOKIE = "s602";

function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function cookies(req: Req): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(req: Req, res: Res, token: string, maxAge: number) {
  const secure =
    (req.headers["x-forwarded-proto"] ?? "") === "https" ||
    (req.socket as { encrypted?: boolean }).encrypted;
  res.setHeader(
    "set-cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
  );
}

/** Mutating requests must be JSON from this same site (blocks cross-site form posts). */
function checkOrigin(req: Req) {
  if (req.method === "GET") return;
  if (!(req.headers["content-type"] ?? "").includes("application/json"))
    throw new HttpError(415, "ต้องส่งเป็น JSON");
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "ไม่อนุญาต");
}

const ip = (req: Req) =>
  String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?")
    .split(",")[0]
    .trim();
// the admin-made special theme is only for its owner (/api/me) and the admin
const publicStudent = (s: ReturnType<typeof listStudents>[number]) => {
  const out: Partial<typeof s> = { ...s };
  delete out.specialTheme;
  return out;
};

let ready = false;
export function createApi() {
  return (req: Req, res: Res, next: Next) => {
    if (!ready) {
      getDb();
      ensureAlbumTables();
      ready = true;
    }
    if (serveMedia(req, res)) return;
    if (serveUploads(req, res)) return;
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/api/")) return next();
    handle(req, res, url.pathname).catch((e: unknown) => {
      if (e instanceof HttpError) send(res, e.status, { error: e.message });
      else {
        console.error("[api]", e);
        send(res, 500, { error: "เซิร์ฟเวอร์ผิดพลาด" });
      }
    });
  };
}

async function handle(req: Req, res: Res, path: string) {
  const db = getDb();
  checkOrigin(req);
  const token = cookies(req)[COOKIE];
  const session = readSession(db, token);
  const m = req.method;

  /* ---------------- chat + public messages (server/social.ts) ---------------- */
  const url = new URL(req.url ?? "/", "http://x");
  const social = await handleSocial(req, path, url, session);
  if (social !== undefined) return send(res, 200, social);

  /* ---------------- photo owners + teachers (server/roster.ts) ---------------- */
  const rosterOut = await handleRoster(req, path, session, readJson);
  if (rosterOut !== undefined) return send(res, 200, rosterOut);

  /* ---------------- personal addresses: /me/<slug> ---------------- */
  // live "is this name free?" check for the /me editor
  if (path === "/api/slug-check" && m === "GET") {
    const q = new URL(req.url ?? "/", "http://x").searchParams.get("slug") ?? "";
    try {
      const slug = cleanSlug(q, session?.no ?? -1);
      return send(res, 200, { ok: true, slug });
    } catch (e) {
      return send(res, 200, { ok: false, error: (e as Error).message });
    }
  }
  const sm = path.match(/^\/api\/me\/([A-Za-z0-9._-]{1,60})$/);
  if (sm && m === "GET") {
    const st = studentBySlug(sm[1]);
    if (!st) throw new HttpError(404, "ไม่พบโปรไฟล์นี้");
    return send(res, 200, { no: st.no, slug: st.slug });
  }

  if (path === "/api/students" && m === "GET")
    return send(res, 200, { students: listStudents().map(publicStudent) });
  if (path === "/api/badges" && m === "GET") return send(res, 200, { badges: getBadges() });

  /* ---------------- albums ---------------- */
  if (path === "/api/albums" && m === "GET") return send(res, 200, { albums: listAlbums(false) });
  if (path === "/api/people" && m === "GET") return send(res, 200, readPeople());

  /* ---------------- photos ---------------- */
  if (path === "/api/photos" && m === "GET") return send(res, 200, listPhotoData());

  const pm = path.match(/^\/api\/photos\/([\w-]{10,80})(\/tag)?$/);
  if (pm) {
    const id = pm[1];
    if (!isKnownMedia(id)) throw new HttpError(404, "ไม่พบรูปนี้");
    if (!session) throw new HttpError(401, "กรุณาเข้าสู่ระบบก่อน");
    const by = session.isAdmin ? 0 : session.no!;
    const body = await readJson(req);
    if (!pm[2] && m === "PUT") {
      // any logged-in classmate (or the admin) can describe a photo; we keep who changed it last
      savePhotoInfo(id, clean(body.caption, 500), clean(body.location, 120), by);
      return send(res, 200, listPhotoData());
    }
    if (pm[2] && m === "POST") {
      const no = Number(body.no);
      const action = body.action;
      if (action !== "add" && action !== "remove" && action !== "auto")
        throw new HttpError(400, "action ไม่ถูกต้อง");
      // students may only tag / untag themselves; the admin may fix anyone
      if (!session.isAdmin && no !== session.no) throw new HttpError(403, "แท็กได้เฉพาะตัวเอง");
      if (!getStudentRow(no)) throw new HttpError(404, "ไม่พบนักเรียน");
      setPhotoTag(id, no, action, by);
      return send(res, 200, listPhotoData());
    }
  }

  if (path === "/api/me" && m === "GET") {
    if (!session) return send(res, 200, { user: null });
    if (session.isAdmin) return send(res, 200, { user: { admin: true } });
    const acc = db.prepare("SELECT password_hash FROM accounts WHERE no = ?").get(session.no) as
      | { password_hash: string | null }
      | undefined;
    return send(res, 200, {
      user: { no: session.no, needsPassword: !acc?.password_hash },
      student: getStudentRow(session.no!),
    });
  }

  if (path === "/api/login" && m === "POST") {
    const body = await readJson(req);
    const no = Number(body.no);
    const password = clean(body.password, 200);
    const keyIp = `ip:${ip(req)}`;
    const keyNo = `no:${no}`;
    if (isLocked(keyIp) || isLocked(keyNo))
      throw new HttpError(429, "ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่");
    const acc = db
      .prepare("SELECT password_hash, initial_code_hash FROM accounts WHERE no = ?")
      .get(no) as { password_hash: string | null; initial_code_hash: string | null } | undefined;
    // own password if set, otherwise the one-time code (codes are case-insensitive)
    const ok =
      acc &&
      (acc.password_hash
        ? verifySecret(password, acc.password_hash)
        : verifySecret(password.toUpperCase(), acc.initial_code_hash));
    if (!ok) {
      noteFail(keyIp);
      noteFail(keyNo);
      throw new HttpError(401, "เลขที่หรือรหัสไม่ถูกต้อง");
    }
    clearFails(keyNo);
    db.prepare("UPDATE accounts SET last_login = ? WHERE no = ?").run(new Date().toISOString(), no);
    const s = createSession(db, { no, isAdmin: false });
    setCookie(req, res, s.token, s.maxAge);
    return send(res, 200, { ok: true, needsPassword: !acc!.password_hash });
  }

  if (path === "/api/logout" && m === "POST") {
    deleteSession(db, token);
    setCookie(req, res, "", 0);
    return send(res, 200, { ok: true });
  }

  if (path === "/api/me/password" && m === "POST") {
    if (!session || session.isAdmin || session.no == null) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
    const body = await readJson(req);
    const next = typeof body.next === "string" ? body.next : "";
    if (next.length < 6) throw new HttpError(400, "รหัสผ่านต้องยาวอย่างน้อย 6 ตัว");
    if (next.length > 200) throw new HttpError(400, "รหัสผ่านยาวเกินไป");
    const acc = db.prepare("SELECT password_hash FROM accounts WHERE no = ?").get(session.no) as {
      password_hash: string | null;
    };
    if (
      acc.password_hash &&
      !verifySecret(typeof body.current === "string" ? body.current : "", acc.password_hash)
    )
      throw new HttpError(401, "รหัสผ่านเดิมไม่ถูกต้อง");
    db.prepare(
      "UPDATE accounts SET password_hash = ?, initial_code = NULL, initial_code_hash = NULL WHERE no = ?",
    ).run(hashSecret(next), session.no);
    return send(res, 200, { ok: true });
  }

  if (path === "/api/me" && m === "PUT") {
    if (!session || session.isAdmin || session.no == null) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
    const body = await readJson(req);
    try {
      return send(res, 200, { student: updateStudent(session.no, body, SELF_FIELDS) });
    } catch (e) {
      // validation messages (slug taken, bad group, ...) go back to the form as 400s
      throw new HttpError(400, (e as Error).message);
    }
  }

  /* ---------------- admin ---------------- */
  if (path === "/api/admin/login" && m === "POST") {
    const key = `admin:${ip(req)}`;
    if (isLocked(key)) throw new HttpError(429, "ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่");
    const body = await readJson(req);
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").get() as
      | { value: string }
      | undefined;
    if (!verifySecret(clean(body.password, 200), stored?.value)) {
      noteFail(key);
      throw new HttpError(401, "รหัสผ่านผู้ดูแลไม่ถูกต้อง");
    }
    clearFails(key);
    const s = createSession(db, { no: null, isAdmin: true });
    setCookie(req, res, s.token, s.maxAge);
    return send(res, 200, { ok: true });
  }

  if (path.startsWith("/api/admin/")) {
    if (!session?.isAdmin) throw new HttpError(401, "ต้องเข้าสู่ระบบผู้ดูแล");
    if (path === "/api/admin/students" && m === "GET") {
      const accs = new Map(
        (
          db.prepare("SELECT no, password_hash, initial_code, last_login FROM accounts").all() as {
            no: number;
            password_hash: string | null;
            initial_code: string | null;
            last_login: string | null;
          }[]
        ).map((a) => [a.no, a]),
      );
      return send(res, 200, {
        students: listStudents().map((s) => {
          const a = accs.get(s.no);
          return {
            ...s,
            account: {
              claimed: !!a?.password_hash,
              code: a?.initial_code ?? null,
              lastLogin: a?.last_login ?? null,
            },
          };
        }),
      });
    }
    if (path === "/api/admin/albums" && m === "GET") {
      const albums = listAlbums(true).map(({ photos, videos, ...a }) => ({
        ...a,
        photoCount: photos.length,
        videoCount: videos.length,
        cover: photos.find((p) => p.large) ?? photos[0] ?? null,
      }));
      return send(res, 200, { albums, jobs: jobStatus() });
    }
    if (path === "/api/admin/badges" && m === "PUT") {
      const body = await readJson(req);
      return send(res, 200, { badges: saveBadges(body.badges) });
    }
    if (path === "/api/admin/jobs" && m === "GET") return send(res, 200, { jobs: jobStatus() });
    if (path === "/api/admin/faces" && m === "POST") return send(res, 200, { job: startFaces() });
    if (path === "/api/admin/albums" && m === "POST") {
      const body = await readJson(req);
      const folder = folderIdFrom(clean(body.folder, 300));
      if (!folder) throw new HttpError(400, "ลิงก์โฟลเดอร์ Google Drive ไม่ถูกต้อง");
      const slug = await createAlbum({
        folder,
        title: clean(body.title, 80),
        en: clean(body.en, 60),
        tagline: clean(body.tagline, 200),
        about: clean(body.about, 1000),
      });
      return send(res, 200, { slug, job: startSync(slug) });
    }
    const am = path.match(/^\/api\/admin\/albums\/([a-z0-9-]{1,60})(\/sync|\/folders)?$/);
    if (am) {
      const slug = am[1];
      if (!getAlbumRow(slug)) throw new HttpError(404, "ไม่พบอัลบั้ม");
      if (am[2] === "/sync" && m === "POST") return send(res, 200, { job: startSync(slug) });
      if (am[2] === "/folders" && m === "POST") {
        const body = await readJson(req);
        const folder = folderIdFrom(clean(body.folder, 300));
        if (!folder) throw new HttpError(400, "ลิงก์โฟลเดอร์ Google Drive ไม่ถูกต้อง");
        addFolder(slug, folder);
        return send(res, 200, { album: getAlbumRow(slug), job: startSync(slug) });
      }
      if (!am[2] && m === "PUT") {
        const body = await readJson(req);
        return send(res, 200, { album: updateAlbum(slug, body) });
      }
      if (!am[2] && m === "DELETE") {
        if (!deleteAlbum(slug)) throw new HttpError(400, "อัลบั้มตั้งต้นลบไม่ได้ (ซ่อนได้แทน)");
        return send(res, 200, { ok: true });
      }
    }
    const mm = path.match(/^\/api\/admin\/students\/(\d+)(\/reset)?$/);
    if (mm) {
      const no = Number(mm[1]);
      if (!getStudentRow(no)) throw new HttpError(404, "ไม่พบนักเรียน");
      if (!mm[2] && m === "PUT") {
        const body = await readJson(req);
        try {
          return send(res, 200, {
            student: updateStudent(no, body, ADMIN_FIELDS, { portraitSet: true }),
          });
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
      }
      if (mm[2] && m === "POST") {
        const code = newCode();
        db.prepare(
          "UPDATE accounts SET password_hash = NULL, initial_code = ?, initial_code_hash = ? WHERE no = ?",
        ).run(code, hashSecret(code), no);
        deleteSessionsFor(db, no);
        clearFails(`no:${no}`);
        return send(res, 200, { ok: true, code });
      }
    }
  }

  throw new HttpError(404, "ไม่พบ");
}

/* people.json (face matching output) is read from disk so re-running faces.py shows up without a rebuild.
   On the server the face job writes data/faces/people.json (kept across deploys); it wins over the
   bundled src/data/people.json. */
let peopleCache: { file: string; mtime: number; data: unknown } | null = null;
function readPeople(): unknown {
  const own = path.join(FACES_HOME, "people.json");
  const file = fs.existsSync(own) ? own : path.join(ROOT, "src", "data", "people.json");
  const mtime = fs.statSync(file).mtimeMs;
  if (!peopleCache || peopleCache.file !== file || peopleCache.mtime !== mtime)
    peopleCache = { file, mtime, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  return peopleCache.data;
}
