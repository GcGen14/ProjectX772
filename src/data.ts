// Site data: class info, albums (from the synced Google Drive manifest) and students.
import albumsMeta from "./data/albums.json";
import manifest from "./data/manifest.json";
import peopleDb from "./data/people.json";
import photoMetaDb from "./data/photo_meta.json";
import poolDb from "./data/portrait_pool.json";
import studentsDb from "./data/students.json";
import type { ProfileTheme } from "./lib/theme.ts";

export const CLASS = {
  name: "ม.6/2",
  short: "6/2",
  room: "602",
  gen: "GC Gen 14",
  year: "2569",
  yearEn: "2026",
  /** Countdown target on the landing page. Change to your real graduation day. */
  graduation: "2027-03-01T09:00:00+07:00",
};

export const BRAND = "602 memories";

/* ------------------------------ media ------------------------------ */

export type Photo = {
  id: string;
  name: string;
  w: number;
  h: number;
  group?: string;
  large?: boolean;
  /** set for images stored outside /photos/thumbs (e.g. studio portraits) */
  local?: string;
  /** "media" = synced from Drive at runtime (served from data/media), else built-in public/photos */
  base?: "photos" | "media";
};
export type Video = {
  id: string;
  name: string;
  w?: number;
  h?: number;
  group?: string;
  thumb: boolean;
};

/** 600px preview stored in /public (fast, used in grids). */
export const thumb = (id: string) => `/${MEDIA_BASE.get(id) ?? "photos"}/thumbs/${id}.jpg`;
/** 1600px version stored in /public for a few photos per album, else the thumb. */
export const large = (p: Photo) =>
  p.local ?? (p.large ? `/${MEDIA_BASE.get(p.id) ?? "photos"}/large/${p.id}.jpg` : thumb(p.id));
/** Grid image for any photo (class photo thumb or local portrait). */
export const photoSrc = (p: Photo) => p.local ?? thumb(p.id);
/** Full-resolution image streamed from Google Drive. */
export const driveFull = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w2000`;
/** Embeddable Google Drive video player. */
export const driveVideo = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
export const driveFile = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const driveFolder = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/* ------------------------------ albums ------------------------------ */

export type TagIcon =
  | "camera"
  | "video"
  | "users"
  | "book"
  | "pen"
  | "music"
  | "palette"
  | "heart"
  | "sparkle"
  | "home";

export type Album = {
  slug: string;
  title: string;
  en: string;
  tagline: string;
  about: string;
  tags: { label: string; icon: TagIcon }[];
  folders: string[];
  photos: Photo[];
  videos: Video[];
  groups: string[]; // filter chips (empty = no chips)
  builtin?: boolean;
  syncedAt?: string;
};

/** Album as delivered by the server (/api/albums) or built from the bundled JSON files. */
export type AlbumData = Omit<Album, "groups" | "photos" | "videos"> & {
  showGroups?: boolean;
  photos: (Omit<Photo, "group"> & { group?: string | null })[];
  videos: (Omit<Video, "group"> & { group?: string | null; base?: "photos" | "media" })[];
};

/** where each image's files live ("photos" = public/photos, "media" = synced into data/media) */
const MEDIA_BASE = new Map<string, "photos" | "media">();
const photoById = new Map<string, Photo>();
const albumByPhoto = new Map<string, Album>();

type ManifestAlbum = { photos: Photo[]; videos: Video[] };
const M = manifest as unknown as { generatedAt: string; albums: Record<string, ManifestAlbum> };
export const SYNCED_AT = M.generatedAt;

function buildAlbum(a: AlbumData): Album {
  const photos: Photo[] = a.photos.map((p) => ({ ...p, group: p.group ?? undefined }));
  const videos: Video[] = a.videos.map((v) => ({ ...v, group: v.group ?? undefined }));
  for (const p of photos) if (p.base) MEDIA_BASE.set(p.id, p.base);
  for (const v of a.videos) if (v.base) MEDIA_BASE.set(v.id, v.base);
  const groups = a.showGroups
    ? [...new Set(photos.map((p) => p.group).filter((g): g is string => !!g))].sort()
    : [];
  const { showGroups: _sg, ...rest } = a;
  return { ...rest, photos, videos, groups };
}

const BUNDLED: AlbumData[] = (
  albumsMeta as unknown as { albums: Omit<AlbumData, "photos" | "videos">[] }
).albums.map((m) => ({
  ...m,
  photos: M.albums[m.slug]?.photos ?? [],
  videos: M.albums[m.slug]?.videos ?? [],
  syncedAt: M.generatedAt,
  builtin: true,
}));

/** Starts from the bundled JSON; replaced by the live album list from the server (see main.ts). */
export const albums: Album[] = BUNDLED.map(buildAlbum);
export const allPhotos: Photo[] = [];
export const totals = { photos: 0, videos: 0, albums: 0 };

function indexAlbums() {
  photoById.clear();
  albumByPhoto.clear();
  allPhotos.length = 0;
  for (const a of albums) {
    for (const p of a.photos) {
      photoById.set(p.id, p);
      albumByPhoto.set(p.id, a);
      allPhotos.push(p);
    }
    for (const v of a.videos) albumByPhoto.set(v.id, a);
  }
  totals.photos = allPhotos.length;
  totals.videos = albums.reduce((n, a) => n + a.videos.length, 0);
  totals.albums = albums.length;
}
indexAlbums();

/** Swap in the live album list (including folders added from /backend). */
export function applyAlbums(list: AlbumData[]) {
  albums.splice(0, albums.length, ...list.map(buildAlbum));
  indexAlbums();
  applyStudentRecords(students.map((s) => s.raw)); // memories point at photos by id
}

export const getAlbum = (slug: string) => albums.find((a) => a.slug === slug);
/** Photos that have a 1600px local copy (hero cards, covers). */
export const featured = (a: Album) => {
  const big = a.photos.filter((p) => p.large);
  return big.length ? big : a.photos.slice(0, 8);
};

/* ------------------------------ students ------------------------------ */
// The class database lives in src/data/students.json (edit it at /backend while `npm run dev` runs).
// Portraits + face-matched photos come from src/data/people.json (built by scripts/faces.py).

/** Choices for a student's "group" (กลุ่ม). Keep in sync with GROUPS in server/db.ts. */
export const STUDENT_GROUPS = ["SII", "ERA", "DAG"] as const;

export type StudentRecord = {
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
  /** id of the student's chosen cover photo (one of their portraits or memories) */
  coverPhoto?: string;
  /** how the student decorated their profile page (see src/lib/theme.ts) */
  theme?: ProfileTheme;
  /** id of the photo used as profile picture ("" = first of their photos) */
  avatar?: string;
  /** personal profile address: /me/<slug> ("" / missing = not set) */
  slug?: string;
  updatedAt?: string;
};

export type Portrait = { id: string; w: number; h: number; upload?: boolean };
type PeopleSet = { set: number; portraits: Portrait[]; photos: string[] };

export type Student = StudentRecord & {
  /** the record exactly as stored (no placeholder text) — used by edit forms */
  raw: StudentRecord;
  isPlaceholder: boolean;
  /** studio portraits (empty when the student has no portrait set) */
  portraits: Portrait[];
  /** class photos this student's face was found in */
  memories: Photo[];
};

export const STUDENT_DB = (studentsDb as unknown as { students: StudentRecord[] }).students;
let SETS = new Map((peopleDb as unknown as { sets: PeopleSet[] }).sets.map((s) => [s.set, s]));
/* ---- photo details: EXIF, captions/locations from the database, face tags ---- */
export type ExifMeta = { date?: string; camera?: string; lat?: number; lon?: number };
export type PhotoInfo = {
  caption: string;
  location: string;
  updatedBy: number | null;
  updatedAt: string;
};
export type TagFix = { photo: string; no: number; action: "add" | "remove" };
const PHOTO_META = photoMetaDb as unknown as Record<string, ExifMeta>;
/** automatic tags from face matching: { photoId: [[set, x, y, w, h], ...] } */
let AUTO_TAGS = ((peopleDb as unknown as { tags?: Record<string, number[][]> }).tags ??
  {}) as Record<string, number[][]>;
let PHOTO_INFO: Record<string, PhotoInfo> = {};
let TAG_FIXES: TagFix[] = [];

export const portraitSrc = (p: Portrait) =>
  p.upload ? `/uploads/${p.id}.jpg` : `/photos/people/${p.id}.jpg`;
/** All studio portrait sets (one per student, in Drive folder order), sorted by set number. */
export const portraitSets = () => [...SETS.values()].sort((a, b) => a.set - b.set);
/** Face crop for a portrait set (built by scripts/faces.py). */
export const setAvatar = (set: number) => `/photos/people/avatar-${set}.jpg`;
/** Portraits as Photo objects so they can go through the same grid/viewer code. */
export const portraitPhotos = (s: Student): Photo[] =>
  s.portraits.map((p) => ({ id: p.id, name: `portrait`, w: p.w, h: p.h, local: portraitSrc(p) }));

/* ---- photo owners: every studio portrait / uploaded photo belongs to one person ---- */
// Default owner of a portrait = the student holding its set; /backend can move single photos
// to anyone (photo_owner table, see server/roster.ts). Owner keys: "s<no>", "t<id>", "none".

/** A studio portrait (any set, or in no set) or a photo uploaded from /backend. */
export type PoolPhoto = Portrait & { set: number | null };
export type Teacher = {
  id: number;
  name: string;
  nickname: string;
  role: string;
  subject: string;
  quote: string;
  avatar: string;
  coverPhoto: string;
  theme: ProfileTheme;
  sort: number;
  hidden: boolean;
};
export type Roster = {
  owners: Record<string, string>;
  teachers: Teacher[];
  uploads: { id: string; w: number; h: number }[];
};

const POOL_BUNDLED = (poolDb as unknown as { portraits: PoolPhoto[] }).portraits;
let POOL: PoolPhoto[] = POOL_BUNDLED;
let OWNERS: Record<string, string> = {};
const POOL_BY_ID = new Map<string, PoolPhoto>();
/** owner key -> photos, rebuilt whenever owners / sets / students change */
let OWNED = new Map<string, PoolPhoto[]>();
/** photo id -> owner keys (several only when two students share a set by mistake) */
let OWNERS_OF = new Map<string, string[]>();
export const teachers: Teacher[] = [];

export const personKey = (who: { no: number } | { id: number }) =>
  "no" in who ? `s${who.no}` : `t${who.id}`;
/** Every photo that can be handed to a person, in Drive folder order (uploads last). */
export const photoPool = () => POOL;
export const poolPhoto = (id: string) => POOL_BY_ID.get(id);
/** Square face crop of a pool photo (made by scripts/faces.py pool, or in the browser on upload). */
export const faceSrc = (p: Portrait) =>
  p.upload ? `/uploads/face-${p.id}.jpg` : `/photos/people/face-${p.id}.jpg`;
/** Who a photo currently belongs to (owner keys; empty = nobody). */
export const photoOwnersOf = (id: string) => OWNERS_OF.get(id) ?? [];
export const ownedPhotos = (key: string) => OWNED.get(key) ?? [];
/** True when /backend moved this photo away from its set's default owner. */
export const isOwnerOverride = (id: string) => id in OWNERS;

function reindexOwners(records: Pick<StudentRecord, "no" | "portraitSet">[]) {
  POOL_BY_ID.clear();
  for (const p of POOL) POOL_BY_ID.set(p.id, p);
  const holders = new Map<number, string[]>();
  for (const r of [...records].sort((a, b) => a.no - b.no))
    if (r.portraitSet != null)
      holders.set(r.portraitSet, [...(holders.get(r.portraitSet) ?? []), `s${r.no}`]);
  OWNED = new Map();
  OWNERS_OF = new Map();
  for (const p of POOL) {
    const o = OWNERS[p.id];
    const keys = o ? (o === "none" ? [] : [o]) : p.set != null ? (holders.get(p.set) ?? []) : [];
    OWNERS_OF.set(p.id, keys);
    for (const k of keys) OWNED.set(k, [...(OWNED.get(k) ?? []), p]);
  }
}
reindexOwners(STUDENT_DB);

/** Face crop for someone's profile picture: their chosen photo, else their first photo. */
function avatarFor(key: string, chosen: string | undefined): string | null {
  const mine = ownedPhotos(key);
  const pick = (chosen && mine.find((p) => p.id === chosen)) || mine[0];
  return pick ? faceSrc(pick) : null;
}

export const getTeacher = (id: number) => teachers.find((t) => t.id === id);
export const teacherName = (t: Teacher) => t.nickname || t.name || "คุณครู";
export const teacherUrl = (t: Pick<Teacher, "id">) => `/teacher/${t.id}`;
export function teacherAvatar(t: Pick<Teacher, "id" | "avatar">): string {
  return avatarFor(`t${t.id}`, t.avatar) ?? `/photos/humation/${(t.id % 49) + 1}.svg`;
}
/** A teacher's photos as Photo objects (for grids / the viewer). */
export const teacherPhotos = (t: Pick<Teacher, "id">): Photo[] =>
  ownedPhotos(`t${t.id}`).map((p) => ({
    id: p.id,
    name: "portrait",
    w: p.w,
    h: p.h,
    local: portraitSrc(p),
  }));

/** Swap in photo owners, uploads and teachers from /api/roster. */
export function applyRoster(r: Roster) {
  OWNERS = r.owners;
  POOL = [
    ...POOL_BUNDLED,
    ...r.uploads.map((u) => ({ ...u, set: null, upload: true }) as PoolPhoto),
  ];
  teachers.splice(0, teachers.length, ...r.teachers);
  applyStudentRecords(students.map((s) => s.raw));
}

function buildStudent(r: StudentRecord): Student {
  const set = r.portraitSet ? SETS.get(r.portraitSet) : undefined;
  return {
    ...r,
    raw: r,
    nickname: r.nickname || `เพื่อนเลขที่ ${r.no}`,
    fullName: r.fullName,
    quote: r.quote || "ยังไม่ได้เขียนคำคม… มาเขียนด้วยน้า ✍️",
    dream: r.dream || "ความฝัน: รอเจ้าตัวมาเติม",
    isPlaceholder: !r.nickname,
    portraits: ownedPhotos(`s${r.no}`),
    memories: memoryIds(r.no, set)
      .map((id) => photoById.get(id))
      .filter((p): p is Photo => !!p),
  };
}

/** Face-matched photos, minus the ones the student untagged, plus the ones they tagged by hand. */
function memoryIds(no: number, set: PeopleSet | undefined): string[] {
  const auto = set?.photos ?? [];
  const removed = new Set(
    TAG_FIXES.filter((t) => t.no === no && t.action === "remove").map((t) => t.photo),
  );
  const added = TAG_FIXES.filter(
    (t) => t.no === no && t.action === "add" && !auto.includes(t.photo),
  ).map((t) => t.photo);
  return [...added, ...auto.filter((id) => !removed.has(id))];
}

/** Starts from the bundled JSON; replaced by live database data on load (see main.ts). */
export const students: Student[] = STUDENT_DB.map(buildStudent);

/** Swap in fresh records from the database API, keeping the same array object. */
export function applyStudentRecords(records: StudentRecord[]) {
  reindexOwners(records);
  students.splice(
    0,
    students.length,
    ...records
      .slice()
      .sort((a, b) => a.no - b.no)
      .map(buildStudent),
  );
}

export const getStudent = (no: number) => students.find((s) => s.no === no);

/** Avatar: face crop from the student's portraits, otherwise a generated badge with their number. */
/**
 * Avatar: face crop from the student's studio portraits; classmates without portraits get a
 * Humation avatar (https://github.com/humation-labs/humation, MIT), pre-rendered per เลขที่
 * by scripts/humation-avatars.mjs into public/photos/humation/<no>.svg.
 */
export function studentAvatar(
  s: Pick<Student, "no" | "portraitSet"> & { avatar?: string },
): string {
  const face = avatarFor(`s${s.no}`, s.avatar);
  if (face) return face;
  return `/photos/humation/${s.no}.svg`;
}

/* ------------------------------ copy ------------------------------ */

export const notes = [
  { text: "ใครยืมปากกาไป คืนด้วยยยย", bg: "#b5ebbd", x: 0, y: 2, w: 25, h: 47, r: -2 },
  { text: "การบ้านส่งวันไหนนะ?? ไม่มีใครบอกเลย", bg: "#d7c4fb", x: 24, y: 5, w: 24, h: 43, r: 3 },
  { text: "ลาบวันนั้นอร่อยสุดในชีวิต", bg: "#fcab9f", x: 50, y: 0, w: 24, h: 45, r: -1.5 },
  { text: "คิดถึงโต๊ะหลังห้อง กับเสียงแอร์ตัวเก่า", bg: "#fde098", x: 11, y: 44, w: 24, h: 47, r: 2 },
  { text: "อย่าเพิ่งเรียนจบได้ไหม…", bg: "#b3f0ee", x: 34, y: 42, w: 24, h: 50, r: -2 },
  { text: "จบแล้วไปเที่ยวด้วยกันอีกนะ 6/2", bg: "#d7c4fb", x: 71, y: 36, w: 25, h: 52, r: -4 },
];

/** An approved public message ("ข้อความถึงเพื่อน"). */
export type WallPost = { id: number; from: number; to: number; text: string; at: string };

/** Approved public messages from the server (newest first). Empty when there's no server. */
export const wall: WallPost[] = [];
export function applyWall(posts: WallPost[]) {
  wall.splice(0, wall.length, ...posts.filter((p) => getStudent(p.from) && getStudent(p.to)));
}

/** Sample cards for the landing page until real messages are approved. */
export const messages = [
  { text: "ขอบคุณที่อยู่ด้วยกันมาตลอด ม.ปลายนะ", from: 3 },
  { text: "ห้องนี้เสียงดังสุด แต่ก็อบอุ่นสุด", from: 17 },
  { text: "ถ้าไม่มีพวกแกคงไม่รอดคาบเคมี", from: 24 },
  { text: "ไม่ว่าจะไปอยู่ไหน 6/2 คือบ้านเสมอ", from: 41 },
];

export const photoExif = (id: string): ExifMeta => PHOTO_META[id] ?? {};
export const photoInfo = (id: string): PhotoInfo | undefined => PHOTO_INFO[id];
export const getPhoto = (id: string) => photoById.get(id);

export const albumOfPhoto = (id: string) => albumByPhoto.get(id);

/** The student a studio portrait belongs to. */
export const portraitOwner = (id: string) =>
  students.find((s) => s.portraits.some((p) => p.id === id));

export type PhotoTag = {
  student: Student;
  box: [number, number, number, number] | null;
  manual: boolean;
};

/** Who is in a photo: face-matched classmates (with face boxes) + manual tags − removed tags. */
export function photoTags(photoId: string): PhotoTag[] {
  const bySet = new Map(
    students.filter((s) => s.portraitSet != null).map((s) => [s.portraitSet!, s]),
  );
  const fixes = TAG_FIXES.filter((t) => t.photo === photoId);
  const removed = new Set(fixes.filter((t) => t.action === "remove").map((t) => t.no));
  const out: PhotoTag[] = [];
  for (const t of AUTO_TAGS[photoId] ?? []) {
    const s = bySet.get(t[0]);
    if (!s || removed.has(s.no)) continue;
    out.push({ student: s, box: t.length === 5 ? [t[1], t[2], t[3], t[4]] : null, manual: false });
  }
  for (const f of fixes) {
    if (f.action !== "add" || out.some((o) => o.student.no === f.no)) continue;
    const s = students.find((x) => x.no === f.no);
    if (s) out.push({ student: s, box: null, manual: true });
  }
  return out.sort((a, b) => (a.box?.[0] ?? 2) - (b.box?.[0] ?? 2)); // left-to-right as in the photo
}

/** Apply captions + tag corrections from the database and refresh everyone's memories. */
export function applyPhotoData(d: { info: Record<string, PhotoInfo>; tags: TagFix[] }) {
  PHOTO_INFO = d.info;
  TAG_FIXES = d.tags;
  applyStudentRecords(students.map((s) => s.raw));
}

/** Refresh portraits + face tags from the server (people.json changes when faces.py runs again). */
export function applyPeople(p: { sets: PeopleSet[]; tags?: Record<string, number[][]> }) {
  SETS = new Map(p.sets.map((x) => [x.set, x]));
  AUTO_TAGS = p.tags ?? {};
  applyStudentRecords(students.map((s) => s.raw));
}

/** A student's public profile link: /me/<their address> if they picked one, else /member/<no>. */
export const profileUrl = (s: { no: number; slug?: string }) =>
  s.slug ? `/me/${encodeURIComponent(s.slug)}` : `/member/${s.no}`;
/** Same, from a เลขที่. */
export const profileUrlByNo = (no: number) =>
  profileUrl(students.find((x) => x.no === no) ?? { no });
/** Who owns /me/<slug> (case-insensitive). */
export const studentBySlug = (slug: string) =>
  students.find((x) => x.slug && x.slug.toLowerCase() === slug.toLowerCase());
