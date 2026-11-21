// Per-student extras kept in their own table so they don't collide with the core students table:
//   • socials   — extra social links (Instagram, TikTok, Facebook, X, YouTube, LINE, ...)
//   • privacy   — opt-outs: no search indexing, hide photos on my profile, hide my face site-wide
//   • character — a Humation character (https://github.com/humation-labs/humation, MIT) the student
//                 builds in /me; shown instead of their face when they hide it (or use it as avatar)
//
//   GET  /api/extras                  public: everyone's extras (no secrets in here)
//   PUT  /api/me/extras               { socials?, privacy?, character?, info? } — logged-in student only
//   GET  /api/character/parts         part names per slot (for the builder)
//   GET  /api/character/preview?s=..  SVG preview of a character state (no saving)
//   GET  /media/characters/<no>.svg   a student's saved character
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAvatar, getPartsForSlot } from "@humation/core";
import { humation1 } from "@humation/assets-humation-1";
import { readSession } from "./auth.ts";
import { safeDecode, sendJsonCompressed } from "./security.ts";
import fs from "node:fs";
import path from "node:path";
import { ROOT, clean, getDb, getStudentRow } from "./db.ts";

type Req = IncomingMessage;
type Res = ServerResponse;
type Next = (err?: unknown) => void;

export type Social = { type: SocialType; value: string };
export type Privacy = {
  noindex?: boolean;
  hidePhotos?: boolean;
  hideFace?: boolean;
  useCharacter?: boolean;
};
/** "More about me": university, portfolio, skills, awards, goals and contact. All optional. */
export type Info = {
  university?: string;
  faculty?: string;
  /** TCAS round / admission path, free text */
  round?: string;
  status?: "applying" | "admitted" | "studying" | "gap" | "other";
  portfolios?: { title: string; url: string }[];
  skills?: string[];
  awards?: string[];
  activities?: string[];
  goal?: string;
  /** shown on the profile only if the student typed it in here */
  email?: string;
  openTo?: string[];
};
export const INFO_STATUS = ["applying", "admitted", "studying", "gap", "other"] as const;
export type CharacterState = { selections: Record<string, string>; colors: Record<string, string> };

export const SOCIAL_TYPES = [
  "instagram",
  "tiktok",
  "facebook",
  "x",
  "youtube",
  "threads",
  "line",
  "discord",
  "github",
  "spotify",
  "website",
] as const;
type SocialType = (typeof SOCIAL_TYPES)[number];
const SLOTS = ["head", "body", "bottom", "item", "glasses"] as const;
const COLOR_KEYS = ["hair", "skin", "clothes", "bottom", "background"] as const;
const MAX_SOCIALS = 10;
const MAX_PORTFOLIOS = 6;

let ready = false;
function ensure() {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS student_extras (
      no INTEGER PRIMARY KEY REFERENCES students(no) ON DELETE CASCADE,
      socials TEXT NOT NULL DEFAULT '[]',
      privacy TEXT NOT NULL DEFAULT '{}',
      character TEXT NOT NULL DEFAULT '{}',
      character_svg TEXT,
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  const cols = getDb().prepare("PRAGMA table_info(student_extras)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "info"))
    getDb().exec("ALTER TABLE student_extras ADD COLUMN info TEXT NOT NULL DEFAULT '{}'");
  ready = true;
}

/* ---------------- validation ---------------- */

const PART_NAMES: Record<string, Set<string>> = Object.fromEntries(
  SLOTS.map((s) => [s, new Set(getPartsForSlot(humation1, s).map((p) => p.name ?? p.id))]),
);

function cleanSocials(v: unknown): Social[] {
  if (!Array.isArray(v)) return [];
  const out: Social[] = [];
  for (const item of v.slice(0, MAX_SOCIALS)) {
    if (!item || typeof item !== "object") continue;
    const { type, value } = item as Record<string, unknown>;
    if (typeof type !== "string" || !(SOCIAL_TYPES as readonly string[]).includes(type)) continue;
    let val = clean(value, 200);
    if (!val) continue;
    if (type === "website") {
      // only plain http(s) links; everything else is dropped
      if (!/^https?:\/\//i.test(val)) val = `https://${val}`;
      try {
        const u = new URL(val);
        if (u.protocol !== "https:" && u.protocol !== "http:") continue;
        val = u.toString().slice(0, 200);
      } catch {
        continue;
      }
    } else {
      // handles / ids: strip @, spaces and anything that isn't a typical handle character
      val = val.replace(/^@/, "").replace(/\s+/g, "");
      val = val.replace(/^https?:\/\/[^/]+\/(@)?/i, ""); // tolerate pasted profile links
      val = val.replace(/[^A-Za-z0-9._\-~#]/g, "").slice(0, 60);
      if (!val) continue;
    }
    out.push({ type: type as SocialType, value: val });
  }
  return out;
}

const httpUrl = (v: unknown): string | null => {
  let val = clean(v, 300);
  if (!val) return null;
  if (!/^https?:\/\//i.test(val)) val = `https://${val}`;
  try {
    const u = new URL(val);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes("."))
      return null;
    return u.toString().slice(0, 300);
  } catch {
    return null;
  }
};
const cleanList = (v: unknown, max: number, len: number): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => clean(x, len)).filter(Boolean))].slice(0, max);
  return out.length ? out : undefined;
};

export function cleanInfo(v: unknown): Info {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Info = {};
  for (const [k, len] of [
    ["university", 80],
    ["faculty", 100],
    ["round", 60],
    ["goal", 200],
  ] as const) {
    const t = clean(o[k], len);
    if (t) out[k] = t;
  }
  if (typeof o.status === "string" && (INFO_STATUS as readonly string[]).includes(o.status))
    out.status = o.status as Info["status"];
  const email = clean(o.email, 100);
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) out.email = email;
  if (Array.isArray(o.portfolios)) {
    const list: { title: string; url: string }[] = [];
    for (const it of o.portfolios.slice(0, MAX_PORTFOLIOS)) {
      if (!it || typeof it !== "object") continue;
      const url = httpUrl((it as Record<string, unknown>).url);
      if (!url) continue;
      const title = clean((it as Record<string, unknown>).title, 60) || new URL(url).hostname;
      list.push({ title, url });
    }
    if (list.length) out.portfolios = list;
  }
  const skills = cleanList(o.skills, 12, 30);
  const awards = cleanList(o.awards, 8, 120);
  const activities = cleanList(o.activities, 8, 120);
  const openTo = cleanList(o.openTo, 6, 40);
  if (skills) out.skills = skills;
  if (awards) out.awards = awards;
  if (activities) out.activities = activities;
  if (openTo) out.openTo = openTo;
  return out;
}

function cleanPrivacy(v: unknown): Privacy {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Privacy = {};
  for (const k of ["noindex", "hidePhotos", "hideFace", "useCharacter"] as const)
    if (o[k] === true) out[k] = true;
  return out;
}

function cleanCharacter(v: unknown): CharacterState {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const sel =
    o.selections && typeof o.selections === "object"
      ? (o.selections as Record<string, unknown>)
      : {};
  const col = o.colors && typeof o.colors === "object" ? (o.colors as Record<string, unknown>) : {};
  const selections: Record<string, string> = {};
  for (const s of SLOTS)
    if (typeof sel[s] === "string" && PART_NAMES[s].has(sel[s])) selections[s] = sel[s];
  const colors: Record<string, string> = {};
  for (const k of COLOR_KEYS) {
    const c = col[k];
    if (typeof c === "string" && /^#?[0-9a-f]{6}$/i.test(c))
      colors[k] = `#${c.replace("#", "").toUpperCase()}`;
  }
  return { selections, colors };
}

// same palettes + seed as scripts/humation-avatars.mjs, so an untouched character = the default avatar
const PALETTE: Record<string, string[]> = {
  hair: ["#2B2B2B", "#3B2A20", "#4A3728", "#1F1B24", "#5A3E2B", "#6B4A35"],
  clothes: ["#9EC5FF", "#FFB4C6", "#B8E6C9", "#FFD89B", "#C9B8FF", "#A7E3F0", "#FFC9A8"],
  bottom: ["#2E4A7D", "#3C3C46", "#4A5D8C", "#2F3E5C"],
  skin: ["#F8D9C0", "#F1C7A5", "#E8B48F", "#FBE3CF"],
  background: ["#EAF2FF", "#FFEFF3", "#EDF8F0", "#FFF6E5", "#F2EEFF", "#E9F7FA"],
};
const SALT: Record<string, number> = { hair: 1, clothes: 2, bottom: 3, skin: 4, background: 5 };
export const defaultColors = (no: number) =>
  Object.fromEntries(
    Object.entries(PALETTE).map(([k, arr]) => [k, arr[(no * 7 + SALT[k] * 13) % arr.length]]),
  );

/** Look-alike defaults made from school photos by scripts/auto_characters.py. */
let AUTO: Record<string, CharacterState> | null = null;
function autoCharacter(no: number): CharacterState {
  if (!AUTO) {
    try {
      const file = path.join(ROOT, "src", "data", "auto_characters.json");
      AUTO = (
        JSON.parse(fs.readFileSync(file, "utf8")) as { characters: Record<string, CharacterState> }
      ).characters;
    } catch {
      AUTO = {};
    }
  }
  return AUTO[String(no)] ?? { selections: {}, colors: {} };
}

const avatarOptions = (no: number, state: CharacterState) => {
  const auto = autoCharacter(no);
  const { background, ...colors } = { ...defaultColors(no), ...auto.colors, ...state.colors };
  return {
    seed: `602-gen14-${no}`, // fills any slot the student didn't pick, same as their default avatar
    selections: { ...auto.selections, ...state.selections },
    colors,
    background, // a separate option in Humation, not one of the colour slots
  };
};

function renderCharacter(no: number, state: CharacterState): string {
  return createAvatar(humation1, avatarOptions(no, state)).toString();
}

/** The full character a student has right now (seeded defaults filled in), as part names + colours. */
function resolvedCharacter(no: number): CharacterState {
  const saved = getExtras(no).character;
  const json = createAvatar(humation1, avatarOptions(no, saved)).toJSON() as {
    selections: Record<string, string>;
    colors: Record<string, string>;
    background?: string;
  };
  const selections: Record<string, string> = {};
  for (const slot of SLOTS) {
    const part = getPartsForSlot(humation1, slot).find(
      (p: { id: string }) => p.id === json.selections[slot],
    );
    if (part) selections[slot] = (part as { name: string }).name;
  }
  const colors: Record<string, string> = {};
  for (const k of COLOR_KEYS) {
    const v = k === "background" ? json.background : json.colors[k];
    if (v) colors[k] = `#${String(v).replace("#", "").toUpperCase()}`;
  }
  return { selections, colors };
}

/* ---------------- data ---------------- */

type Raw = Record<string, unknown>;
const parse = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" && v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function getExtras(no: number) {
  ensure();
  const r = getDb().prepare("SELECT * FROM student_extras WHERE no = ?").get(no) as Raw | undefined;
  return {
    socials: parse<Social[]>(r?.socials, []),
    privacy: parse<Privacy>(r?.privacy, {}),
    character: parse<CharacterState>(r?.character, { selections: {}, colors: {} }),
    info: parse<Info>(r?.info, {}),
    hasCharacter: !!r?.character_svg,
    updatedAt: typeof r?.updated_at === "string" ? r.updated_at : "",
  };
}

export function listExtras() {
  ensure();
  const out: Record<number, ReturnType<typeof getExtras>> = {};
  for (const r of getDb().prepare("SELECT no FROM student_extras").all() as { no: number }[])
    out[r.no] = getExtras(r.no);
  return out;
}

function saveExtras(no: number, body: Record<string, unknown>) {
  ensure();
  const cur = getExtras(no);
  const socials = "socials" in body ? cleanSocials(body.socials) : cur.socials;
  const privacy = "privacy" in body ? cleanPrivacy(body.privacy) : cur.privacy;
  const character = "character" in body ? cleanCharacter(body.character) : cur.character;
  const info = "info" in body ? cleanInfo(body.info) : cur.info;
  const svg = "character" in body || !cur.hasCharacter ? renderCharacter(no, character) : null;
  const d = getDb();
  d.prepare(
    `INSERT INTO student_extras (no, socials, privacy, character, info, character_svg, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(no) DO UPDATE SET socials = excluded.socials, privacy = excluded.privacy, character = excluded.character, info = excluded.info,
       character_svg = COALESCE(excluded.character_svg, student_extras.character_svg), updated_at = excluded.updated_at`,
  ).run(
    no,
    JSON.stringify(socials),
    JSON.stringify(privacy),
    JSON.stringify(character),
    JSON.stringify(info),
    svg,
    new Date().toISOString(),
  );
  return getExtras(no);
}

/** Should this page carry `X-Robots-Tag: noindex`? (profile pages of students who opted out) */
export function isNoindexPath(pathname: string): boolean {
  ensure();
  const m = pathname.match(/^\/(?:me|member|student)\/([A-Za-z0-9._-]{1,60})\/?$/);
  if (!m) return false;
  const byNo = !pathname.startsWith("/me/"); // /member/<no>, /student/<no>
  const row = byNo
    ? (getDb().prepare("SELECT no FROM students WHERE no = ?").get(Number(m[1])) as
        | { no: number }
        | undefined)
    : (getDb().prepare("SELECT no FROM students WHERE slug = ? COLLATE NOCASE").get(m[1]) as
        | { no: number }
        | undefined);
  return !!row && getExtras(row.no).privacy.noindex === true;
}

/* ---------------- http ---------------- */

function sameHost(origin: string, host: string | undefined): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function send(res: Res, status: number, body: unknown) {
  sendJsonCompressed(res.req, res, status, JSON.stringify(body));
}

function sessionOf(req: Req) {
  const cookie = req.headers.cookie ?? "";
  const m = cookie.match(/(?:^|;\s*)s602=([^;]+)/);
  return readSession(getDb(), m ? (safeDecode(m[1]) ?? undefined) : undefined);
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 50_000) throw new Error("ข้อมูลยาวเกินไป");
  }
  const v: unknown = raw ? JSON.parse(raw) : {};
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Connect-style middleware; mounted next to the main API (vite.config.ts, server/index.ts). */
/* ---------------- teacher's letter ---------------- */

export type Letter = { text: string; signed: string; updatedAt: string };

function letterTable() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS class_letter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    text TEXT NOT NULL DEFAULT '',
    signed TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`);
}

export function getLetter(): Letter {
  letterTable();
  const r = getDb()
    .prepare("SELECT text, signed, updated_at FROM class_letter WHERE id = 1")
    .get() as { text: string; signed: string; updated_at: string } | undefined;
  return { text: r?.text ?? "", signed: r?.signed ?? "", updatedAt: r?.updated_at ?? "" };
}

function saveLetter(body: Record<string, unknown>): Letter {
  letterTable();
  // keep line breaks (it is a letter), drop other control characters
  const raw = typeof body.text === "string" ? body.text.replace(/\r\n?/g, "\n") : "";
  let kept = "";
  for (let i = 0; i < raw.length && kept.length < 6000; i++) {
    const c = raw.charCodeAt(i);
    if (c === 10 || c === 9 || (c >= 32 && c !== 127)) kept += raw[i];
  }
  const text = kept.trim();
  const signed = clean(body.signed, 120);
  getDb()
    .prepare(
      `INSERT INTO class_letter (id, text, signed, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, signed = excluded.signed, updated_at = excluded.updated_at`,
    )
    .run(text, signed, new Date().toISOString());
  return getLetter();
}

export function createExtrasApi() {
  return (req: Req, res: Res, next: Next) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    const m = req.method;
    const char = p.match(/^\/media\/characters\/(\d{1,3})\.svg$/);
    if (char && m === "GET") {
      ensure();
      const r = getDb()
        .prepare("SELECT character_svg FROM student_extras WHERE no = ?")
        .get(Number(char[1])) as { character_svg: string | null } | undefined;
      if (!r?.character_svg) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader("content-type", "image/svg+xml; charset=utf-8");
      res.setHeader("cache-control", "public, max-age=60");
      return res.end(r.character_svg);
    }
    // students who opted out of search engines: tell crawlers on the profile page itself
    if (m === "GET" && isNoindexPath(p)) res.setHeader("x-robots-tag", "noindex, nofollow");
    if (p === "/api/extras" && m === "GET") return send(res, 200, { extras: listExtras() });
    if (p === "/api/character/parts" && m === "GET") {
      const parts = Object.fromEntries(SLOTS.map((s) => [s, [...PART_NAMES[s]]]));
      const no = Math.max(1, Math.min(99, Number(url.searchParams.get("no")) || 1));
      return send(res, 200, { parts, colors: COLOR_KEYS, current: resolvedCharacter(no) });
    }
    if (p === "/api/character/preview" && m === "GET") {
      let state: unknown = {};
      try {
        state = JSON.parse(url.searchParams.get("s") ?? "{}");
      } catch {
        /* fall back to default */
      }
      const no = Math.max(1, Math.min(99, Number(url.searchParams.get("no")) || 1));
      res.setHeader("content-type", "image/svg+xml; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      return res.end(renderCharacter(no, cleanCharacter(state)));
    }
    if (p === "/api/me/extras" && m === "PUT") {
      // same rules as the main API: JSON only, same site only
      if (!(req.headers["content-type"] ?? "").includes("application/json"))
        return send(res, 415, { error: "ต้องส่งเป็น JSON" });
      const origin = req.headers.origin;
      if (origin && !sameHost(origin, req.headers.host))
        return send(res, 403, { error: "ไม่อนุญาต" });
      const s = sessionOf(req);
      if (!s || s.isAdmin || s.no == null || !getStudentRow(s.no))
        return send(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
      readBody(req)
        .then((body) => send(res, 200, { extras: saveExtras(s.no!, body) }))
        .catch((e: unknown) => send(res, 400, { error: (e as Error).message || "ข้อมูลไม่ถูกต้อง" }));
      return;
    }
    // the teacher's letter to the whole class (landing page); only the admin can write it
    if (p === "/api/letter" && m === "GET") return send(res, 200, { letter: getLetter() });
    if (p === "/api/admin/letter" && m === "PUT") {
      if (!(req.headers["content-type"] ?? "").includes("application/json"))
        return send(res, 415, { error: "ต้องส่งเป็น JSON" });
      const origin = req.headers.origin;
      if (origin && !sameHost(origin, req.headers.host))
        return send(res, 403, { error: "ไม่อนุญาต" });
      if (!sessionOf(req)?.isAdmin) return send(res, 401, { error: "ต้องเข้าสู่ระบบผู้ดูแล" });
      readBody(req)
        .then((body) => send(res, 200, { letter: saveLetter(body) }))
        .catch((e: unknown) => send(res, 400, { error: (e as Error).message || "ข้อมูลไม่ถูกต้อง" }));
      return;
    }
    next();
  };
}
