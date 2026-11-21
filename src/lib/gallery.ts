// Justified photo rows (album + event pages): every row fills the width, photos keep their ratio.
import { large, photoInfo, photoSrc, students, type Photo } from "../data.ts";
import { dayKey, longDay } from "./events.ts";
import { esc } from "./router.ts";

export const SIZES = { s: 150, m: 220, l: 320 } as const;
export type Size = keyof typeof SIZES;

export const readPref = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
export const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/** "น้ำขิง, ข้าวตัง +3": who is in a photo, for the hover preview. */
export const peopleNames = (nos: number[]) => {
  const names = nos
    .map((n) => students.find((s) => s.no === n)?.nickname)
    .filter((n): n is string => !!n);
  return names.length > 6
    ? `${names.slice(0, 6).join(", ")} +${names.length - 6}`
    : names.join(", ");
};

export function tileHtml(p: Photo, i: number, w: number, h: number, nos: number[] = []) {
  const day = dayKey(p);
  const cap = photoInfo(p.id)?.caption || (day ? longDay(day) : "");
  return `<button class="al-tile" type="button" data-view="${i}" data-hp="photo" data-hp-src="${large(p)}" data-hp-ratio="${p.w}/${p.h}" data-hp-cap="${esc(cap)}" data-hp-people="${esc(peopleNames(nos))}" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px" aria-label="เปิดรูป ${i + 1}${nos.length ? ` · ${nos.length} คน` : ""}"><img src="${photoSrc(p)}" alt="" loading="lazy" decoding="async"></button>`;
}

export function rowsHtml(
  photos: Photo[],
  offset: number,
  width: number,
  size: Size,
  tile: (p: Photo, i: number, w: number, h: number) => string,
) {
  const target = SIZES[size] * (innerWidth < 640 ? 0.62 : 1);
  const gap = 4;
  let out = "";
  let row: Photo[] = [];
  let sum = 0;
  const flush = (last: boolean) => {
    if (!row.length) return;
    const h = last
      ? Math.min(target, (width - gap * (row.length - 1)) / sum)
      : (width - gap * (row.length - 1)) / sum;
    out += `<div class="al-row">${row.map((p) => tile(p, offset + photos.indexOf(p), (p.w / p.h) * h, h)).join("")}</div>`;
    row = [];
    sum = 0;
  };
  for (const p of photos) {
    row.push(p);
    sum += p.w / p.h;
    if (sum * target + gap * (row.length - 1) >= width) flush(false);
  }
  flush(true);
  return out;
}
