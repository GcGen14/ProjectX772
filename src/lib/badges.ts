// Badges shown on profiles (หัวหน้าห้อง, Web Developer, Beta Tester, ...). The admin edits the
// catalog and hands badges out in /backend; the catalog comes from /api/badges (DEFAULT_BADGES
// in server/db.ts is the same list, used until the admin changes it).
import { esc } from "./router.ts";

export type Badge = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** (old) also puts a crown on the holder's profile picture; now `deco: "crown"` */
  crown?: boolean;
  /** decoration on the holder's profile picture */
  deco?: Deco;
  /** chip style */
  look?: Look;
};

let CATALOG: Badge[] = [
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

export const badgeCatalog = () => CATALOG;
export function applyBadges(list: Badge[]) {
  if (Array.isArray(list)) CATALOG = list;
}

/** The person's badges in catalog order (unknown / deleted ids are skipped). */
export const badgesOf = (ids: string[] | undefined) =>
  ids?.length ? CATALOG.filter((b) => ids.includes(b.id)) : [];
export const hasCrown = (ids: string[] | undefined) => badgesOf(ids).some((b) => !!decoOf(b));

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#475569");

export const badgeChip = (b: Badge) =>
  `<span class="bdg bdg-look-${b.look ?? "chip"}" style="--bdg:${safeColor(b.color)}" title="${esc(b.name)}">${b.emoji ? `<i aria-hidden="true">${esc(b.emoji)}</i>` : ""}<span>${esc(b.name)}</span></span>`;

/* ---------------- avatar decorations ---------------- */
// One "top" piece (crown, tiara, halo) and one "ring" piece (laurel, code, stars, flame) per person:
// the first matching badge in catalog order wins each slot.

export type Deco =
  | "crown"
  | "crown-silver"
  | "tiara"
  | "halo"
  | "laurel"
  | "code"
  | "stars"
  | "flame";
export type Look = "chip" | "shine" | "holo" | "solid";
export const DECOS: { key: Deco; name: string; slot: "top" | "ring" }[] = [
  { key: "crown", name: "มงกุฎทอง", slot: "top" },
  { key: "crown-silver", name: "มงกุฎเงิน", slot: "top" },
  { key: "tiara", name: "ทิอาร่า", slot: "top" },
  { key: "halo", name: "วงแหวนนางฟ้า", slot: "top" },
  { key: "laurel", name: "ช่อมะกอก", slot: "ring" },
  { key: "code", name: "โค้ดนักพัฒนา </>", slot: "ring" },
  { key: "stars", name: "ดาวระยิบ", slot: "ring" },
  { key: "flame", name: "เปลวไฟ", slot: "ring" },
];
export const LOOKS: { key: Look; name: string }[] = [
  { key: "chip", name: "ปกติ" },
  { key: "shine", name: "เงาวิ้ง" },
  { key: "holo", name: "โฮโลแกรม" },
  { key: "solid", name: "สีเต็ม" },
];
/** older badges only had `crown: true` */
export const decoOf = (b: Badge): Deco | undefined => b.deco ?? (b.crown ? "crown" : undefined);

export function avatarDecos(ids: string[] | undefined): Deco[] {
  const own = badgesOf(ids)
    .map(decoOf)
    .filter((d): d is Deco => !!d);
  const slot = (s: "top" | "ring") => own.find((d) => DECOS.find((x) => x.key === d)?.slot === s);
  return [slot("top"), slot("ring")].filter((d): d is Deco => !!d);
}

const crownPath = (fill: string, stroke: string, band: string, gems: [string, string]) =>
  `<path d="M4 24 2 7l10 8 8-13 8 13 10-8-2 17z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/><rect x="4" y="23" width="32" height="5" rx="1.5" fill="${band}" stroke="${stroke}" stroke-width="1.6"/><circle cx="20" cy="15" r="2.3" fill="${gems[0]}"/><circle cx="11" cy="17.5" r="1.6" fill="${gems[1]}"/><circle cx="29" cy="17.5" r="1.6" fill="${gems[1]}"/>`;

/** laurel leaves along both sides of the circle */
const laurel = () => {
  let leaves = "";
  for (let k = 0; k < 7; k++) {
    const a = ((118 + k * 18) * Math.PI) / 180;
    for (const side of [1, -1]) {
      const x = 50 + side * Math.cos(a) * -47;
      const y = 50 + Math.sin(a) * 47;
      const rot = side * (k * 18 + 28);
      leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6.5" ry="2.8" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  }
  return leaves;
};

export function decoSvg(d: Deco): string {
  const c = `bdg-deco bdg-deco-${d}`;
  switch (d) {
    case "crown":
      return `<svg class="${c}" viewBox="0 0 40 30" aria-hidden="true">${crownPath("#facc15", "#a16207", "#eab308", ["#ef4444", "#3b82f6"])}</svg>`;
    case "crown-silver":
      return `<svg class="${c}" viewBox="0 0 40 30" aria-hidden="true">${crownPath("#f1f5f9", "#64748b", "#cbd5e1", ["#8b5cf6", "#38bdf8"])}</svg>`;
    case "tiara":
      return `<svg class="${c}" viewBox="0 0 60 26" aria-hidden="true"><path d="M5 22C12 12 20 8 30 8s18 4 25 14" fill="none" stroke="#f472b6" stroke-width="3" stroke-linecap="round"/><path d="m30 1 3.5 8h-7zM18 6l3 6.5-5.5-.5zM42 6l-3 6.5 5.5-.5z" fill="#fbcfe8" stroke="#db2777" stroke-width="1.2" stroke-linejoin="round"/><circle cx="30" cy="11" r="2.6" fill="#a855f7"/><circle cx="19.5" cy="13.5" r="1.8" fill="#fff" stroke="#db2777"/><circle cx="40.5" cy="13.5" r="1.8" fill="#fff" stroke="#db2777"/></svg>`;
    case "halo":
      return `<svg class="${c}" viewBox="0 0 60 18" aria-hidden="true"><ellipse cx="30" cy="9" rx="25" ry="5.5" fill="none" stroke="#fde047" stroke-width="3.6"/><ellipse cx="30" cy="9" rx="25" ry="5.5" fill="none" stroke="#fff7c2" stroke-width="1.2"/></svg>`;
    case "laurel":
      return `<svg class="${c}" viewBox="0 0 100 100" aria-hidden="true"><g fill="#84cc16" stroke="#4d7c0f" stroke-width=".8">${laurel()}</g><circle cx="50" cy="97" r="3.2" fill="#eab308" stroke="#a16207"/></svg>`;
    case "code":
      return `<span class="${c}" aria-hidden="true"><svg class="bdg-code-ring" viewBox="0 0 100 100"><defs><path id="bdg-code-p" d="M50 50m-46 0a46 46 0 1 1 92 0a46 46 0 1 1-92 0"/></defs><circle cx="50" cy="50" r="46" fill="none" stroke="#22d3ee" stroke-opacity=".25" stroke-width="7"/><text><textPath href="#bdg-code-p">const dev = true; while (alive) build(); git push origin main; {}</textPath></text></svg><b class="bdg-code-tag">&lt;/&gt;</b></span>`;
    case "stars":
      return `<span class="${c}" aria-hidden="true">${[0, 1, 2]
        .map(
          (i) =>
            `<svg class="bdg-star s${i}" viewBox="-10 -10 20 20"><path d="M0-10 2.4-2.4 10 0 2.4 2.4 0 10-2.4 2.4-10 0-2.4-2.4z" fill="#fde047" stroke="#ca8a04" stroke-width=".8"/></svg>`,
        )
        .join("")}</span>`;
    case "flame":
      return `<svg class="${c}" viewBox="0 0 100 40" aria-hidden="true"><g class="bdg-flames"><path d="M20 40c-8-10 2-16 0-30 9 8 14 18 8 30z" fill="#f97316"/><path d="M42 40c-10-12 4-22 4-38 10 12 14 26 6 38z" fill="#fb923c"/><path d="M62 40c-7-10 3-18 3-30 8 8 12 20 6 30z" fill="#f97316"/><path d="M80 40c-6-8 2-13 1-24 7 7 10 16 5 24z" fill="#fb923c"/><path d="M45 40c-4-8 2-14 3-22 5 8 7 15 3 22z" fill="#fde047"/></g></svg>`;
  }
}

/** Wrap a profile picture in its box, with the person's badge decorations (if any). */
export function decorateAvatar(img: string, ids: string[] | undefined, boxCls: string): string {
  const d = avatarDecos(ids);
  return `<span class="${boxCls} bdg-face${d.length ? " has-deco" : ""}">${img}${d.map(decoSvg).join("")}</span>`;
}

/** A row of badge chips, or "" when the person has none. */
export function badgeRow(ids: string[] | undefined, cls = "") {
  const list = badgesOf(ids);
  return list.length
    ? `<div class="bdg-row${cls ? ` ${cls}` : ""}">${list.map(badgeChip).join("")}</div>`
    : "";
}

/** Gold crown that sits tilted on the top-left of a profile picture. */
export const crownSvg = (cls = "pf-crown") =>
  `<svg class="${cls}" viewBox="0 0 40 30" aria-hidden="true"><path d="M4 24 2 7l10 8 8-13 8 13 10-8-2 17z" fill="#facc15" stroke="#a16207" stroke-width="1.6" stroke-linejoin="round"/><rect x="4" y="23" width="32" height="5" rx="1.5" fill="#eab308" stroke="#a16207" stroke-width="1.6"/><circle cx="20" cy="15" r="2.3" fill="#ef4444"/><circle cx="11" cy="17.5" r="1.6" fill="#3b82f6"/><circle cx="29" cy="17.5" r="1.6" fill="#3b82f6"/></svg>`;
