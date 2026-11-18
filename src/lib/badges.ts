// Badges shown on profiles (หัวหน้าห้อง, Web Developer, Beta Tester, ...). The admin edits the
// catalog and hands badges out in /backend; the catalog comes from /api/badges (DEFAULT_BADGES
// in server/db.ts is the same list, used until the admin changes it).
import { esc } from "./router.ts";

export type Badge = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** also puts a crown on the holder's profile picture */
  crown?: boolean;
};

let CATALOG: Badge[] = [
  { id: "leader", name: "หัวหน้าห้อง", emoji: "👑", color: "#ca8a04", crown: true },
  { id: "vice", name: "รองหัวหน้าห้อง", emoji: "🎖️", color: "#ea580c" },
  { id: "dev", name: "Web Developer", emoji: "💻", color: "#0569ff" },
  { id: "beta", name: "Beta Tester", emoji: "🧪", color: "#7c3aed" },
  { id: "designer", name: "ดีไซเนอร์", emoji: "🎨", color: "#db2777" },
  { id: "photo", name: "ช่างภาพ", emoji: "📸", color: "#0d9488" },
  { id: "treasurer", name: "เหรัญญิก", emoji: "💰", color: "#16a34a" },
  { id: "secretary", name: "เลขานุการ", emoji: "📝", color: "#475569" },
];

export const badgeCatalog = () => CATALOG;
export function applyBadges(list: Badge[]) {
  if (Array.isArray(list)) CATALOG = list;
}

/** The person's badges in catalog order (unknown / deleted ids are skipped). */
export const badgesOf = (ids: string[] | undefined) =>
  ids?.length ? CATALOG.filter((b) => ids.includes(b.id)) : [];
export const hasCrown = (ids: string[] | undefined) => badgesOf(ids).some((b) => b.crown);

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#475569");

export const badgeChip = (b: Badge) =>
  `<span class="bdg" style="--bdg:${safeColor(b.color)}" title="${esc(b.name)}">${b.emoji ? `<i aria-hidden="true">${esc(b.emoji)}</i>` : ""}${esc(b.name)}</span>`;

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
