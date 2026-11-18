// SQLite database for the class site (uses Node's built-in node:sqlite, no extra packages).
// File: data/602.sqlite (git-ignored). Seeded from src/data/students.json on first run.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashSecret, newCode } from "./auth.ts";

export const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "602.sqlite");
const SEED_FILE = path.join(ROOT, "src", "data", "students.json");
const ADMIN_FILE = path.join(DATA_DIR, "ADMIN_PASSWORD.txt");

export type StudentRow = {
  no: number;
  nickname: string;
  fullName: string;
  nicknameEn: string;
  quote: string;
  dream: string;
  ig: string;
  birthday: string;
  group: string;
  portraitSet: number | null;
  photoNote: string;
  /** school student ID (เลขประจำตัวนักเรียน) */
  studentId: string;
  coverPhoto: string;
  theme: ProfileTheme;
  /** id of the photo used as profile picture ("" = first of their photos) */
  avatar: string;
  /** personal profile address: /me/<slug> ("" = not set) */
  slug: string;
  /** ids from the badge catalog (getBadges), given out in /backend */
  badges: string[];
  /** a one-off look the admin designed for this student; shown to them as a preset on /me */
  specialTheme: SpecialTheme | null;
  updatedAt: string;
};

export type SpecialTheme = { name: string; theme: ProfileTheme };

/** A badge shown on profiles (หัวหน้าห้อง, Beta tester, ...). The catalog lives in settings.badges. */
export type Badge = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** also puts a crown on the holder's profile picture (older field; see deco) */
  crown?: boolean;
  /** decoration on the holder's profile picture (src/lib/badges.ts DECOS) */
  deco?: string;
  /** chip style (src/lib/badges.ts LOOKS) */
  look?: string;
};
const BADGE_DECOS = [
  "none",
  "crown",
  "crown-silver",
  "tiara",
  "halo",
  "laurel",
  "code",
  "stars",
  "flame",
];
const BADGE_LOOKS = ["chip", "shine", "holo", "solid"];
export const DEFAULT_BADGES: Badge[] = [
  { id: "leader", name: "หัวหน้าห้อง", emoji: "👑", color: "#ca8a04", deco: "crown", look: "shine" },
  { id: "vice", name: "รองหัวหน้าห้อง", emoji: "🎖️", color: "#ea580c", deco: "crown-silver" },
  { id: "dev", name: "Web Developer", emoji: "💻", color: "#0569ff", deco: "code", look: "holo" },
  { id: "beta", name: "Beta Tester", emoji: "🧪", color: "#7c3aed", look: "shine" },
  { id: "designer", name: "ดีไซเนอร์", emoji: "🎨", color: "#db2777" },
  { id: "photo", name: "ช่างภาพ", emoji: "📸", color: "#0d9488" },
  { id: "treasurer", name: "เหรัญญิก", emoji: "💰", color: "#16a34a" },
  { id: "secretary", name: "เลขานุการ", emoji: "📝", color: "#475569" },
  { id: "mvp", name: "MVP ของห้อง", emoji: "⭐", color: "#f59e0b", deco: "stars", look: "holo" },
  { id: "party", name: "สายปาร์ตี้", emoji: "🔥", color: "#ef4444", deco: "flame", look: "solid" },
  { id: "angel", name: "นางฟ้าประจำห้อง", emoji: "😇", color: "#0ea5e9", deco: "halo" },
  { id: "princess", name: "เจ้าหญิง", emoji: "👸", color: "#ec4899", deco: "tiara" },
  { id: "scholar", name: "เด็กเรียน", emoji: "📚", color: "#65a30d", deco: "laurel" },
];

/**
 * How a student decorated their own profile page (stored as JSON in students.theme).
 * Keep the option lists in sync with src/lib/theme.ts.
 */
export type ProfileTheme = {
  accent?: string;
  accent2?: string;
  bg?: string;
  font?: string;
  avatar?: string;
  mode?: string;
  fx?: string;
  corner?: string;
  ring?: string;
  cover?: string;
  emoji?: string;
  song?: string;
  hobbies?: string;
  /** signature theme (only kept for its owner, see SIGNATURE_OWNERS) */
  sig?: string;
  /** upload id of the owner's picture for a signature theme */
  art?: string;
  /** owner switched their default-on signature theme off */
  sigOff?: boolean;
};
const THEME_BG = [
  "plain",
  "soft",
  "dots",
  "grid",
  "glow",
  "stripes",
  "aurora",
  "hearts",
  "stars",
  "checker",
  "magic",
  "layers",
  "blueprint",
  "pixel",
  "waves",
];
const THEME_FONTS = ["default", "mali", "playpen", "serif", "itim", "sriracha", "mono"];
const THEME_AVATAR = ["round", "square"];
/** extra look settings: [key, allowed values, default (not stored)] */
const THEME_PICKS: ["mode" | "fx" | "corner" | "ring" | "cover", string[], string][] = [
  ["mode", ["light", "dark", "auto"], "light"],
  ["fx", ["none", "snow", "sparkle", "hearts", "petals", "gems", "cubes", "bubbles"], "none"],
  ["corner", ["sharp", "normal", "round"], "normal"],
  ["ring", ["accent", "rainbow", "none"], "accent"],
  ["cover", ["short", "normal", "tall"], "normal"],
];

/** Fields a student may change on their own profile, with max lengths. */
export const SELF_FIELDS = {
  nickname: 40,
  fullName: 100,
  nicknameEn: 40,
  quote: 300,
  dream: 120,
  ig: 30,
  birthday: 40,
  group: 3,
  coverPhoto: 64,
  theme: 0, // JSON object, validated by cleanTheme()
  avatar: 80,
  slug: 30, // validated by cleanSlug()
} as const;
/** Allowed values for the "group" field (empty = not chosen). */
export const GROUPS = ["SII", "ERA", "DAG"] as const;
/** Extra fields only the admin may change. */
export const ADMIN_FIELDS = {
  ...SELF_FIELDS,
  photoNote: 120,
  studentId: 10,
  badges: 0, // ids, validated against the catalog
  specialTheme: 0, // { name, theme }, validated by cleanSpecial()
} as const;

const COLS: Record<string, string> = {
  nickname: "nickname",
  fullName: "full_name",
  nicknameEn: "nickname_en",
  quote: "quote",
  dream: "dream",
  ig: "ig",
  birthday: "birthday",
  group: "group_name",
  photoNote: "photo_note",
  studentId: "student_id",
  coverPhoto: "cover_photo",
  theme: "theme",
  avatar: "avatar",
  slug: "slug",
};

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS students (
      no INTEGER PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      nickname_en TEXT NOT NULL DEFAULT '',
      quote TEXT NOT NULL DEFAULT '',
      dream TEXT NOT NULL DEFAULT '',
      ig TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '',
      group_name TEXT NOT NULL DEFAULT '',
      portrait_set INTEGER,
      photo_note TEXT NOT NULL DEFAULT '',
      cover_photo TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS accounts (
      no INTEGER PRIMARY KEY REFERENCES students(no) ON DELETE CASCADE,
      password_hash TEXT,          -- set once the student chooses a password
      initial_code TEXT,           -- one-time code handed out by the admin (cleared after first login)
      initial_code_hash TEXT,
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      no INTEGER,                  -- NULL for the admin session
      is_admin INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photo_info (
      photo_id TEXT PRIMARY KEY,
      caption TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,          -- student no, or 0 for the admin
      updated_at TEXT NOT NULL DEFAULT ''
    );
    -- manual tag corrections on top of the automatic face matches
    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id TEXT NOT NULL,
      no INTEGER NOT NULL REFERENCES students(no) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('add', 'remove')),
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (photo_id, no)
    );
  `);
  migrate(db);
  seed(db);
  return db;
}

/** Columns added after the first release (CREATE TABLE IF NOT EXISTS won't add them). */
function migrate(d: DatabaseSync) {
  const cols = new Set(
    (d.prepare("PRAGMA table_info(students)").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has("theme"))
    d.exec("ALTER TABLE students ADD COLUMN theme TEXT NOT NULL DEFAULT '{}'");
  if (!cols.has("avatar"))
    d.exec("ALTER TABLE students ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
  if (!cols.has("slug")) d.exec("ALTER TABLE students ADD COLUMN slug TEXT NOT NULL DEFAULT ''");
  if (!cols.has("badges"))
    d.exec("ALTER TABLE students ADD COLUMN badges TEXT NOT NULL DEFAULT '[]'");
  if (!cols.has("special_theme"))
    d.exec("ALTER TABLE students ADD COLUMN special_theme TEXT NOT NULL DEFAULT '{}'");
  if (!cols.has("student_id")) {
    d.exec("ALTER TABLE students ADD COLUMN student_id TEXT NOT NULL DEFAULT ''");
    // fill school IDs from the seed file once
    if (fs.existsSync(SEED_FILE)) {
      const seedIds = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as {
        students: { no: number; studentId?: string }[];
      };
      const put = d.prepare("UPDATE students SET student_id = ? WHERE no = ? AND student_id = ''");
      for (const st of seedIds.students) if (st.studentId) put.run(st.studentId, st.no);
    }
  }
  // one address per student, case-insensitive; empty = not set
  d.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS students_slug ON students (slug COLLATE NOCASE) WHERE slug <> ''",
  );
}

function seed(d: DatabaseSync) {
  const count = (d.prepare("SELECT COUNT(*) AS c FROM students").get() as { c: number }).c;
  if (count === 0 && fs.existsSync(SEED_FILE)) {
    const seedData = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as {
      students: Partial<StudentRow>[];
    };
    const ins = d.prepare(
      `INSERT INTO students (no, nickname, full_name, nickname_en, quote, dream, ig, birthday, group_name, portrait_set, photo_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of seedData.students) {
      ins.run(
        s.no!,
        s.nickname ?? "",
        s.fullName ?? "",
        s.nicknameEn ?? "",
        s.quote ?? "",
        s.dream ?? "",
        s.ig ?? "",
        s.birthday ?? "",
        s.group ?? "",
        s.portraitSet ?? null,
        s.photoNote ?? "",
      );
    }
    console.log(`[db] seeded ${seedData.students.length} students from src/data/students.json`);
  }
  // every student gets an account with a one-time code
  const missing = d
    .prepare("SELECT no FROM students WHERE no NOT IN (SELECT no FROM accounts)")
    .all() as { no: number }[];
  const addAcc = d.prepare(
    "INSERT INTO accounts (no, initial_code, initial_code_hash) VALUES (?, ?, ?)",
  );
  for (const { no } of missing) {
    const code = newCode();
    addAcc.run(no, code, hashSecret(code));
  }
  // admin password: ADMIN_PASSWORD env var wins; otherwise generate one once and save it to a local file
  const envPw = process.env.ADMIN_PASSWORD;
  const stored = d.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").get() as
    | { value: string }
    | undefined;
  if (envPw) {
    d.prepare(
      "INSERT INTO settings (key, value) VALUES ('admin_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(hashSecret(envPw));
  } else if (!stored) {
    const pw = newCode(10);
    d.prepare("INSERT INTO settings (key, value) VALUES ('admin_hash', ?)").run(hashSecret(pw));
    fs.writeFileSync(ADMIN_FILE, `${pw}\n`, "utf8");
    console.log(`[db] admin password created -> ${path.relative(ROOT, ADMIN_FILE)}`);
  }
}

type Raw = Record<string, unknown>;
const toStudent = (r: Raw): StudentRow => ({
  no: Number(r.no),
  nickname: String(r.nickname),
  fullName: String(r.full_name),
  nicknameEn: String(r.nickname_en),
  quote: String(r.quote),
  dream: String(r.dream),
  ig: String(r.ig),
  birthday: String(r.birthday),
  group: String(r.group_name),
  portraitSet: r.portrait_set == null ? null : Number(r.portrait_set),
  photoNote: String(r.photo_note),
  studentId: typeof r.student_id === "string" ? r.student_id : "",
  coverPhoto: String(r.cover_photo),
  theme: parseTheme(r.theme),
  avatar: typeof r.avatar === "string" ? r.avatar : "",
  slug: typeof r.slug === "string" ? r.slug : "",
  badges: parseJson(r.badges, (v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [],
  ),
  specialTheme: parseJson(r.special_theme, cleanSpecial),
  updatedAt: String(r.updated_at),
});

function parseJson<T>(v: unknown, fn: (x: unknown) => T): T {
  try {
    return fn(JSON.parse(typeof v === "string" && v ? v : "null"));
  } catch {
    return fn(null);
  }
}

/** { name, theme } with a non-empty theme, or null. */
export function cleanSpecial(v: unknown): SpecialTheme | null {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const theme = cleanTheme(o.theme);
  if (!Object.keys(theme).length) return null;
  return { name: clean(o.name, 30) || "ธีมพิเศษ", theme };
}

/* ---------------- badge catalog ---------------- */
const BADGE_ID = /^[a-z0-9-]{1,24}$/;
function cleanBadges(v: unknown): Badge[] {
  const out: Badge[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(v) ? v.slice(0, 40) : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = clean(o.name, 30);
    if (!name) continue;
    let id = typeof o.id === "string" && BADGE_ID.test(o.id) ? o.id : "";
    while (!id || seen.has(id)) id = `b-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const color =
      typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#475569";
    out.push({
      id,
      name,
      emoji: graphemes(clean(o.emoji, 40), 1),
      color: color.toLowerCase(),
      ...(typeof o.deco === "string" && BADGE_DECOS.includes(o.deco)
        ? { deco: o.deco }
        : o.crown === true
          ? { crown: true }
          : {}),
      ...(typeof o.look === "string" && BADGE_LOOKS.includes(o.look) ? { look: o.look } : {}),
    });
  }
  return out;
}
/**
 * A catalog saved before badges had decorations / styles has neither field: give those badges the
 * built-in decoration and style for their id (an admin's explicit "none" / "chip" is kept).
 */
function withBadgeDefaults(list: Badge[]): Badge[] {
  return list.map((b) => {
    const def = DEFAULT_BADGES.find((d) => d.id === b.id);
    if (!def) return b;
    const out = { ...b };
    if (out.deco === undefined && !out.crown && def.deco) out.deco = def.deco;
    if (out.look === undefined && def.look) out.look = def.look;
    return out;
  });
}

export function getBadges(): Badge[] {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = 'badges'").get() as
    | { value: string }
    | undefined;
  return r ? withBadgeDefaults(parseJson(r.value, cleanBadges)) : DEFAULT_BADGES;
}
/** Replace the whole catalog (admin). Badges removed here simply stop showing on profiles. */
export function saveBadges(v: unknown): Badge[] {
  const list = cleanBadges(v);
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('badges', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(JSON.stringify(list));
  return list;
}

function parseTheme(v: unknown): ProfileTheme {
  try {
    return cleanTheme(JSON.parse(typeof v === "string" && v ? v : "{}"));
  } catch {
    return {};
  }
}

/** First `n` user-perceived characters (so an emoji with skin tone / ZWJ isn't cut in half). */
function graphemes(v: string, n: number) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(v), (x) => x.segment)
    .slice(0, n)
    .join("");
}

/** Keep only known theme keys with valid values; anything else is dropped. */
/** Signature themes (src/lib/signature.ts) and the one student allowed to use each. */
export const SIGNATURE_OWNERS: Record<string, number> = {
  homura: 1,
  ender: 26,
  cp: 15,
  pudding: 7,
  gamedev: 5,
};

/** Drop a signature theme / picture that doesn't belong to this student. */
export function restrictTheme(t: ProfileTheme, no: number): ProfileTheme {
  if (t.sig && SIGNATURE_OWNERS[t.sig] !== no) delete t.sig;
  if (t.art) {
    try {
      const own = getDb().prepare("SELECT owner FROM photo_owner WHERE photo_id = ?").get(t.art) as
        | { owner: string }
        | undefined;
      if (own?.owner !== `s${no}`) delete t.art;
    } catch {
      delete t.art; // photo owners not set up yet
    }
  }
  return t;
}

export function cleanTheme(v: unknown): ProfileTheme {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const pick = (k: string, allowed: string[]) =>
    typeof o[k] === "string" && allowed.includes(o[k]) ? o[k] : undefined;
  const out: ProfileTheme = {};
  if (typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent))
    out.accent = o.accent.toLowerCase();
  if (typeof o.accent2 === "string" && /^#[0-9a-f]{6}$/i.test(o.accent2))
    out.accent2 = o.accent2.toLowerCase();
  if (typeof o.sig === "string" && o.sig in SIGNATURE_OWNERS) out.sig = o.sig;
  if (typeof o.art === "string" && /^up-[\w-]{6,40}$/.test(o.art)) out.art = o.art;
  if (o.sigOff === true) out.sigOff = true;
  const bg = pick("bg", THEME_BG);
  const font = pick("font", THEME_FONTS);
  const avatar = pick("avatar", THEME_AVATAR);
  if (bg && bg !== "plain") out.bg = bg;
  if (font && font !== "default") out.font = font;
  if (avatar && avatar !== "round") out.avatar = avatar;
  for (const [k, allowed, def] of THEME_PICKS) {
    const val = pick(k, allowed);
    if (val && val !== def) out[k] = val;
  }
  const emoji = graphemes(clean(o.emoji, 60), 2);
  const song = clean(o.song, 80);
  const hobbies = clean(o.hobbies, 120);
  if (emoji) out.emoji = emoji;
  if (song) out.song = song;
  if (hobbies) out.hobbies = hobbies;
  return out;
}

/* ---------------- personal profile address: /me/<slug> ---------------- */

/** Paths a student can't take because the site already uses them (or they'd be confusing). */
const RESERVED_SLUGS = new Set([
  "me",
  "admin",
  "backend",
  "api",
  "login",
  "logout",
  "edit",
  "settings",
  "profile",
  "new",
  "member",
  "members",
  "student",
  "students",
  "album",
  "albums",
  "media",
  "photos",
  "assets",
  "help",
  "about",
  "home",
  "index",
  "null",
  "undefined",
  "602",
  "class",
  "teacher",
  "root",
  "password",
  "chat",
  "wall",
  "messages",
  "inbox",
  "search",
  "explore",
  "friends",
]);

/** Normalise + validate a requested address. Returns "" to clear it. Throws a Thai message. */
export function cleanSlug(v: unknown, no: number): string {
  const slug = clean(v, 60).toLowerCase().replace(/^@/, "");
  if (!slug) return "";
  if (slug.length < 3 || slug.length > 30) throw new Error("ลิงก์ต้องยาว 3–30 ตัวอักษร");
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(slug))
    throw new Error(
      "ใช้ได้เฉพาะ a–z, 0–9, จุด ( . ), ขีด ( - ) และขีดล่าง ( _ ) และต้องขึ้นต้น/ลงท้ายด้วยตัวอักษรหรือตัวเลข",
    );
  if (/[._-]{2}/.test(slug)) throw new Error("ห้ามมีจุดหรือขีดติดกันสองตัว");
  if (/^\d+$/.test(slug)) throw new Error("ต้องมีตัวอักษรอย่างน้อย 1 ตัว (ห้ามเป็นตัวเลขล้วน)");
  if (RESERVED_SLUGS.has(slug)) throw new Error("ชื่อนี้ถูกสงวนไว้ ลองชื่ออื่นนะ");
  const taken = getDb()
    .prepare("SELECT no FROM students WHERE slug = ? COLLATE NOCASE AND no <> ?")
    .get(slug, no);
  if (taken) throw new Error("มีเพื่อนใช้ชื่อนี้แล้ว");
  return slug;
}

/** Who owns /me/<slug> (case-insensitive). */
export function studentBySlug(slug: string) {
  const r = getDb().prepare("SELECT * FROM students WHERE slug = ? COLLATE NOCASE").get(slug) as
    | Raw
    | undefined;
  return r ? toStudent(r) : null;
}

export const listStudents = () =>
  (getDb().prepare("SELECT * FROM students ORDER BY no").all() as Raw[]).map(toStudent);
export const getStudentRow = (no: number) => {
  const r = getDb().prepare("SELECT * FROM students WHERE no = ?").get(no) as Raw | undefined;
  return r ? toStudent(r) : null;
};

/** Clean a user-supplied string: trim, drop control chars, cap length. */
export function clean(v: unknown, max: number): string {
  const str = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  return (
    str
      // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, max)
  );
}

/** Validate + apply a partial update. `allowed` decides which fields may change. */
export function updateStudent(
  no: number,
  patch: Record<string, unknown>,
  allowed: Record<string, number>,
  opts: { portraitSet?: boolean } = {},
) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [key, max] of Object.entries(allowed)) {
    if (!(key in patch)) continue;
    if (key === "theme") {
      sets.push("theme = ?");
      vals.push(JSON.stringify(restrictTheme(cleanTheme(patch.theme), no)));
      continue;
    }
    if (key === "badges") {
      const known = new Set(getBadges().map((b) => b.id));
      const ids = Array.isArray(patch.badges) ? patch.badges : [];
      sets.push("badges = ?");
      vals.push(
        JSON.stringify(
          [...new Set(ids.filter((x): x is string => known.has(x as string)))].slice(0, 12),
        ),
      );
      continue;
    }
    if (key === "specialTheme") {
      sets.push("special_theme = ?");
      vals.push(JSON.stringify(cleanSpecial(patch.specialTheme) ?? {}));
      continue;
    }
    if (key === "slug") {
      sets.push("slug = ?");
      vals.push(cleanSlug(patch.slug, no));
      continue;
    }
    let v = clean(patch[key], max);
    if (key === "ig") v = v.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
    if (key === "studentId") v = v.replace(/\D/g, "");
    if (key === "group" && v && !(GROUPS as readonly string[]).includes(v))
      throw new Error(`กลุ่มต้องเป็น ${GROUPS.join(" / ")}`);
    sets.push(`${COLS[key]} = ?`);
    vals.push(v);
  }
  if (opts.portraitSet && "portraitSet" in patch) {
    const ps = patch.portraitSet;
    sets.push("portrait_set = ?");
    vals.push(ps === null || ps === "" ? null : Math.max(1, Math.min(999, Number(ps) | 0)));
  }
  if (!sets.length) return getStudentRow(no);
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  getDb()
    .prepare(`UPDATE students SET ${sets.join(", ")} WHERE no = ?`)
    .run(...vals, no);
  return getStudentRow(no);
}

/* ---------------- photos: captions, locations, tag corrections ---------------- */

export function listPhotoData() {
  const d = getDb();
  const info: Record<
    string,
    { caption: string; location: string; updatedBy: number | null; updatedAt: string }
  > = {};
  for (const r of d.prepare("SELECT * FROM photo_info").all() as Raw[]) {
    info[String(r.photo_id)] = {
      caption: String(r.caption),
      location: String(r.location),
      updatedBy: r.updated_by == null ? null : Number(r.updated_by),
      updatedAt: String(r.updated_at),
    };
  }
  const tags = (d.prepare("SELECT photo_id, no, action FROM photo_tags").all() as Raw[]).map(
    (r) => ({
      photo: String(r.photo_id),
      no: Number(r.no),
      action: String(r.action) as "add" | "remove",
    }),
  );
  return { info, tags };
}

export function savePhotoInfo(id: string, caption: string, location: string, by: number) {
  if (!caption && !location) {
    // cleared both fields: drop the row so the photo shows as "no description" again
    getDb().prepare("DELETE FROM photo_info WHERE photo_id = ?").run(id);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO photo_info (photo_id, caption, location, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(photo_id) DO UPDATE SET caption = excluded.caption, location = excluded.location,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .run(id, caption, location, by, new Date().toISOString());
}

/** action "add" / "remove" records a correction; "auto" clears it (back to face matching). */
export function setPhotoTag(id: string, no: number, action: "add" | "remove" | "auto", by: number) {
  const d = getDb();
  if (action === "auto") {
    d.prepare("DELETE FROM photo_tags WHERE photo_id = ? AND no = ?").run(id, no);
    return;
  }
  d.prepare(
    `INSERT INTO photo_tags (photo_id, no, action, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(photo_id, no) DO UPDATE SET action = excluded.action, updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  ).run(id, no, action, by, new Date().toISOString());
}
