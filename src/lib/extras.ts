// Student extras on the client: social links, privacy opt-outs and Humation characters.
// The "face guard" below watches every <img> on every page and, for students who chose to hide their
// face, swaps their avatar/portrait for their character and puts a character sticker over their face
// in class photos (grids, covers, the viewer, ...). It works on any page without that page knowing.
import { allPhotos, getPhoto, photoTags, portraitSrc, studentAvatar, students } from "../data.ts";
import { icon } from "./icons.ts";
import { esc } from "./router.ts";

export type SocialType =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "x"
  | "youtube"
  | "threads"
  | "line"
  | "discord"
  | "github"
  | "spotify"
  | "website";
export type Social = { type: SocialType; value: string };
export type Privacy = {
  noindex?: boolean;
  hidePhotos?: boolean;
  hideFace?: boolean;
  useCharacter?: boolean;
};
export type InfoStatus = "applying" | "admitted" | "studying" | "gap" | "other";
export type Info = {
  university?: string;
  faculty?: string;
  round?: string;
  status?: InfoStatus;
  portfolios?: { title: string; url: string }[];
  skills?: string[];
  awards?: string[];
  activities?: string[];
  goal?: string;
  email?: string;
  openTo?: string[];
};
export const INFO_STATUS: { key: InfoStatus; name: string }[] = [
  { key: "applying", name: "กำลังสมัครเข้ามหาวิทยาลัย" },
  { key: "admitted", name: "ติดแล้ว" },
  { key: "studying", name: "กำลังเรียนอยู่" },
  { key: "gap", name: "พักก่อน / Gap year" },
  { key: "other", name: "อื่น ๆ" },
];
export type CharacterState = { selections: Record<string, string>; colors: Record<string, string> };
export type Extras = {
  socials: Social[];
  privacy: Privacy;
  character: CharacterState;
  info: Info;
  hasCharacter: boolean;
  updatedAt: string;
};

export const SOCIALS: { type: SocialType; name: string; icon: string; placeholder: string }[] = [
  { type: "instagram", name: "Instagram", icon: "instagram", placeholder: "ชื่อผู้ใช้" },
  { type: "tiktok", name: "TikTok", icon: "video", placeholder: "ชื่อผู้ใช้" },
  { type: "facebook", name: "Facebook", icon: "users", placeholder: "ชื่อผู้ใช้ / ลิงก์" },
  { type: "x", name: "X (Twitter)", icon: "message", placeholder: "ชื่อผู้ใช้" },
  { type: "youtube", name: "YouTube", icon: "play", placeholder: "@ช่อง" },
  { type: "threads", name: "Threads", icon: "message", placeholder: "ชื่อผู้ใช้" },
  { type: "line", name: "LINE", icon: "chat", placeholder: "LINE ID" },
  { type: "discord", name: "Discord", icon: "chat", placeholder: "ชื่อผู้ใช้" },
  { type: "github", name: "GitHub", icon: "code", placeholder: "ชื่อผู้ใช้" },
  { type: "spotify", name: "Spotify", icon: "music", placeholder: "user id" },
  { type: "website", name: "เว็บไซต์", icon: "globe", placeholder: "https://..." },
];

const EMPTY: Extras = {
  socials: [],
  privacy: {},
  character: { selections: {}, colors: {} },
  info: {},
  hasCharacter: false,
  updatedAt: "",
};
let EXTRAS: Record<number, Extras> = {};

export const extrasOf = (no: number): Extras => EXTRAS[no] ?? EMPTY;
export const usesCharacter = (no: number) =>
  !!(extrasOf(no).privacy.hideFace || extrasOf(no).privacy.useCharacter);
export const characterUrl = (no: number) => {
  const e = extrasOf(no);
  return e.hasCharacter
    ? `/media/characters/${no}.svg?v=${encodeURIComponent(e.updatedAt)}`
    : `/photos/humation/${no}.svg`;
};

export async function loadExtras() {
  try {
    const r = await fetch("/api/extras", { credentials: "same-origin" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
      EXTRAS = ((await r.json()) as { extras: Record<number, Extras> }).extras;
    }
  } catch {
    /* no server: everyone keeps the defaults */
  }
  rebuildGuard();
}

export async function saveMyExtras(
  patch: Partial<Pick<Extras, "socials" | "privacy" | "character" | "info">>,
) {
  const r = await fetch("/api/me/extras", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const out = (await r.json()) as { extras?: Extras; error?: string };
  if (!r.ok || !out.extras) throw new Error(out.error ?? "บันทึกไม่สำเร็จ");
  return out.extras;
}

export function setExtrasFor(no: number, e: Extras) {
  EXTRAS[no] = e;
  rebuildGuard();
}

/* ---------------- social links ---------------- */

export function socialUrl(s: Social): string | null {
  const v = encodeURIComponent(s.value);
  switch (s.type) {
    case "instagram":
      return `https://instagram.com/${v}`;
    case "tiktok":
      return `https://www.tiktok.com/@${v}`;
    case "facebook":
      return `https://facebook.com/${v}`;
    case "x":
      return `https://x.com/${v}`;
    case "youtube":
      return `https://youtube.com/@${v}`;
    case "threads":
      return `https://www.threads.net/@${v}`;
    case "line":
      return `https://line.me/ti/p/~${v}`;
    case "github":
      return `https://github.com/${v}`;
    case "spotify":
      return `https://open.spotify.com/user/${v}`;
    case "website":
      return /^https?:\/\//i.test(s.value) ? s.value : null;
    default:
      return null; // discord: no public profile URL, shown as text
  }
}

/** Chips for a profile page. `legacyIg` = the older single Instagram field. */
export function socialLinksHtml(no: number, legacyIg = ""): string {
  const list = [...extrasOf(no).socials];
  if (
    legacyIg &&
    !list.some((s) => s.type === "instagram" && s.value.toLowerCase() === legacyIg.toLowerCase())
  )
    list.unshift({ type: "instagram", value: legacyIg });
  if (!list.length) return "";
  return `<div class="sx-links">${list
    .map((s) => {
      const meta = SOCIALS.find((m) => m.type === s.type)!;
      const url = socialUrl(s);
      const label =
        s.type === "website" ? s.value.replace(/^https?:\/\//, "").replace(/\/$/, "") : s.value;
      const inner = `${icon(meta.icon, 15)}<span class="sx-name">${esc(meta.name)}</span><span class="sx-val">${esc(label)}</span>`;
      return url
        ? `<a class="sx-chip" href="${esc(url)}" target="_blank" rel="noopener nofollow ugc">${inner}</a>`
        : `<span class="sx-chip">${inner}</span>`;
    })
    .join("")}</div>`;
}

/* ---------------- "more about me" (university, portfolio, skills, ...) ---------------- */

export const hasInfo = (i: Info) =>
  !!(
    i.university ||
    i.faculty ||
    i.status ||
    i.goal ||
    i.email ||
    i.portfolios?.length ||
    i.skills?.length ||
    i.awards?.length ||
    i.activities?.length ||
    i.openTo?.length
  );

/** Rows for the profile's "about" card. Empty string when the student filled in nothing. */
export function infoRowsHtml(no: number): string {
  const i = extrasOf(no).info;
  if (!hasInfo(i)) return "";
  const row = (ic: string, label: string, html: string) =>
    html ? `<div><span>${icon(ic, 18)} ${label}</span><b>${html}</b></div>` : "";
  const chips = (list: string[] | undefined, cls = "") =>
    list?.length
      ? `<span class="inf-chips${cls}">${list.map((x) => `<span class="inf-chip">${esc(x)}</span>`).join("")}</span>`
      : "";
  const list = (l: string[] | undefined) =>
    l?.length ? `<ul class="inf-list">${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const status = INFO_STATUS.find((s) => s.key === i.status)?.name ?? "";
  const uni = [i.university, i.faculty]
    .filter((x): x is string => !!x)
    .map(esc)
    .join(" · ");
  const port = i.portfolios?.length
    ? `<span class="inf-ports">${i.portfolios
        .map(
          (p) =>
            `<a class="inf-port" href="${esc(p.url)}" target="_blank" rel="noopener nofollow ugc">${icon("folder", 14)}<span>${esc(p.title)}</span>${icon("arrowUpRight", 12)}</a>`,
        )
        .join("")}</span>`
    : "";
  const mail = i.email ? `<a href="mailto:${esc(i.email)}" rel="nofollow">${esc(i.email)}</a>` : "";
  return [
    row(
      "book",
      "มหาวิทยาลัย / คณะ",
      uni + (i.round ? ` <small class="muted">(${esc(i.round)})</small>` : ""),
    ),
    row("check", "สถานะ", esc(status)),
    row("folder", "เปิดพอร์ต", port),
    row("compass", "เป้าหมาย", esc(i.goal ?? "")),
    row("code", "ทักษะ", chips(i.skills)),
    row("sparkle", "รางวัล / ผลงาน", list(i.awards)),
    row("users", "กิจกรรม", list(i.activities)),
    row("briefcase", "เปิดรับ", chips(i.openTo)),
    row("message", "ติดต่อ", mail),
  ].join("");
}

/* ---------------- search engines ---------------- */

/** Adds / removes <meta name="robots" content="noindex"> (the server also sends X-Robots-Tag). */
export function setNoindex(on: boolean) {
  let m = document.head.querySelector<HTMLMetaElement>('meta[name="robots"][data-privacy]');
  if (on && !m) {
    m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    m.dataset.privacy = "";
    document.head.append(m);
  }
  if (!on) m?.remove();
}

/* ---------------- face guard ---------------- */

let SWAP = new Map<string, string>(); // image path -> character url (avatars + portraits)
let FACES = new Map<string, { no: number; box: [number, number, number, number] }[]>(); // photo id -> hidden faces
const stickers = new WeakMap<HTMLImageElement, HTMLImageElement[]>();
const sized = new ResizeObserver((entries) =>
  entries.forEach((e) => process(e.target as HTMLImageElement)),
);
let observer: MutationObserver | null = null;

function rebuildGuard() {
  SWAP = new Map();
  FACES = new Map();
  const hidden = new Set<number>();
  for (const s of students) {
    if (!usesCharacter(s.no)) continue;
    const ch = characterUrl(s.no);
    // whatever avatar the site would show (face crop / upload / default Humation), plus every face crop
    SWAP.set(pathOf(studentAvatar(s)), ch);
    SWAP.set(`/photos/humation/${s.no}.svg`, ch);
    if (s.portraitSet) SWAP.set(`/photos/people/avatar-${s.portraitSet}.jpg`, ch);
    for (const p of s.portraits) {
      SWAP.set(`/photos/people/face-${p.id}.jpg`, ch);
      SWAP.set(`/uploads/face-${p.id}.jpg`, ch);
    }
    if (extrasOf(s.no).privacy.hideFace) {
      hidden.add(s.no);
      for (const p of s.portraits) {
        SWAP.set(pathOf(portraitSrc(p)), ch);
        SWAP.set(`/photos/people/${p.id}.jpg`, ch);
      }
    }
  }
  if (hidden.size) {
    for (const p of allPhotos) {
      const faces = photoTags(p.id)
        .filter((t) => t.box && hidden.has(t.student.no))
        .map((t) => ({ no: t.student.no, box: t.box! }));
      if (faces.length) FACES.set(p.id, faces);
    }
  }
  document.querySelectorAll<HTMLImageElement>("img").forEach(process);
}

/** Does this photo show someone who hid their face? (used to keep such photos out of covers) */
export const hasHiddenFace = (photoId: string) => FACES.has(photoId);

const pathOf = (src: string) => {
  try {
    return new URL(src, location.href).pathname;
  } catch {
    return src;
  }
};
function photoIdOf(src: string): string | null {
  const m =
    src.match(/\/(?:photos|media)\/(?:thumbs|large)\/([\w-]{10,80})\.jpg/) ??
    src.match(/googleusercontent\.com\/d\/([\w-]{10,80})=/);
  return m ? m[1] : null;
}

function process(img: HTMLImageElement) {
  if (img.classList.contains("pv-sticker")) return;
  const src = img.getAttribute("src") ?? "";
  const swap = SWAP.get(pathOf(src));
  if (swap) {
    if (src !== swap) img.src = swap;
    clearStickers(img);
    return;
  }
  const id = photoIdOf(src);
  const faces = id ? FACES.get(id) : undefined;
  if (!faces) return clearStickers(img);
  sized.observe(img);
  placeStickers(img, id!, faces);
}

function clearStickers(img: HTMLImageElement) {
  stickers.get(img)?.forEach((s) => s.remove());
  stickers.delete(img);
}

function placeStickers(
  img: HTMLImageElement,
  id: string,
  faces: { no: number; box: [number, number, number, number] }[],
) {
  const parent = img.parentElement;
  if (!parent || !img.offsetWidth || !img.offsetHeight) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  // where the photo's pixels actually land inside the <img> box (object-fit: cover/contain/fill)
  const p = getPhoto(id);
  const W = img.naturalWidth || p?.w || img.offsetWidth;
  const H = img.naturalHeight || p?.h || img.offsetHeight;
  const cw = img.offsetWidth;
  const ch = img.offsetHeight;
  const fit = getComputedStyle(img).objectFit;
  let sx = cw / W;
  let sy = ch / H;
  if (fit === "cover") sx = sy = Math.max(cw / W, ch / H);
  else if (fit === "contain" || fit === "scale-down") sx = sy = Math.min(cw / W, ch / H);
  const ox = img.offsetLeft + (cw - W * sx) / 2;
  const oy = img.offsetTop + (ch - H * sy) / 2;
  const els = stickers.get(img) ?? [];
  faces.forEach((f, i) => {
    let el = els[i];
    if (!el) {
      el = document.createElement("img");
      el.className = "pv-sticker";
      el.alt = "";
      el.setAttribute("aria-hidden", "true");
      els[i] = el;
    }
    const [x, y, w, h] = f.box;
    const size = Math.max(w * W * sx, h * H * sy) * 1.45;
    const cx = ox + (x + w / 2) * W * sx;
    const cy = oy + (y + h / 2) * H * sy;
    el.src = characterUrl(f.no);
    Object.assign(el.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
    });
    if (el.parentElement !== parent) parent.append(el);
  });
  els.slice(faces.length).forEach((e) => e.remove());
  stickers.set(img, els.slice(0, faces.length));
}

/** Start watching the page (call once). */
export function startFaceGuard() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes" && m.target instanceof HTMLImageElement) process(m.target);
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLImageElement) process(n);
        else if (n instanceof HTMLElement) n.querySelectorAll("img").forEach((i) => process(i));
      });
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  document.addEventListener(
    "load",
    (e) => e.target instanceof HTMLImageElement && process(e.target),
    true,
  );
  rebuildGuard();
}
