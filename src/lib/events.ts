// Dates + event helpers shared by the album, event, events and landing pages.
import {
  CLASS,
  eventList,
  featured,
  getPhoto,
  large,
  photoExif,
  photoSrc,
  thumb,
  type Album,
  type EventRec,
  type Photo,
} from "../data.ts";

export const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
export const toDate = (d: string) => new Date(d.replace(" ", "T"));
export const shortDay = (k: string) => {
  const d = toDate(k);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};
export const longDay = (k: string) =>
  new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toDate(k));
/** "YYYY-MM-DD" a photo was taken ("" if unknown / a bogus camera clock). */
export const dayKey = (p: Photo) => {
  const d = photoExif(p.id).date;
  return d && d >= "2020" ? d.slice(0, 10) : "";
};

/* ------------------------------ events ------------------------------ */
export const eventUrl = (e: Pick<EventRec, "id">) => `/event/${e.id}`;
export const getEvent = (id: string) => eventList().find((e) => e.id === id);
/** Events worth showing in lists (the rest are leftovers; their photos stay in the albums). */
export const listedEvents = () => eventList().filter((e) => !e.minor);
export const eventPhotos = (e: EventRec): Photo[] =>
  e.photos.map((id) => getPhoto(id)).filter((p): p is Photo => !!p);

export const eventDay = (e: EventRec) => {
  if (!e.day) return "";
  const end = e.end?.slice(0, 10);
  return shortDay(e.day) + (end && end !== e.day ? ` – ${shortDay(end)}` : "");
};
/** "09:42–11:05" when the event has clock times. */
export const eventTime = (e: EventRec) =>
  e.start && e.start.length > 10
    ? e.end && e.end !== e.start
      ? `${e.start.slice(11)}–${e.end.slice(11)}`
      : e.start.slice(11)
    : "";
export const eventCover = (e: EventRec): Photo | undefined =>
  getPhoto(e.cover) ?? eventPhotos(e)[0];

/** n pictures spread across a list, never the first file (often a sign / test shot). */
export function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step + step / 2)]);
}

/** Pictures an event card flips through on hover: its cover first, then a spread of the rest. */
export function eventSrcs(e: EventRec, n = 6): string[] {
  const ps = eventPhotos(e);
  const c = eventCover(e);
  const rest = spread(
    ps.filter((p) => p !== c),
    n - 1,
  );
  return [c, ...rest].filter((p): p is Photo => !!p).map(photoSrc);
}

/** Album card: a cover, a spread of its photos, then thumbnails of its clips (flagged as video). */
export function albumSrcs(a: Album, photos = 5, clips = 2) {
  const cover = albumCover(a);
  const imgs = [
    cover,
    ...spread(
      featured(a).filter((p) => p !== cover),
      photos - 1,
    ),
  ]
    .filter((p): p is Photo => !!p)
    .map((p, i) => (i === 0 ? large(p) : photoSrc(p)));
  const vids = a.videos
    .filter((v) => v.thumb)
    .slice(0, clips)
    .map((v) => thumb(v.id));
  return { srcs: [...imgs, ...vids], videoFrom: imgs.length };
}

export const albumCover = (a: Album) => {
  const f = featured(a);
  // a landscape shot from a third of the way in: the first file is often a sign/test shot
  const wide = f.filter((p) => p.w >= p.h);
  return wide[Math.floor(wide.length / 3)] ?? f[0] ?? a.photos[0];
};
export const albumCoverSrc = (a: Album) => {
  const c = albumCover(a);
  if (c) return large(c);
  const v = a.videos.find((x) => x.thumb);
  return v ? thumb(v.id) : "/favicon.svg";
};
export const albumCount = (a: Album) =>
  [
    a.photos.length ? `${a.photos.length.toLocaleString()} รูป` : "",
    a.videos.length ? `${a.videos.length} คลิป` : "",
  ]
    .filter(Boolean)
    .join(" · ");

/** Listed events that have photos in this album, in time order. */
export function albumEvents(a: Album) {
  const mine = new Set(a.photos.map((p) => p.id));
  return listedEvents()
    .map((ev) => ({ ev, n: ev.photos.filter((id) => mine.has(id)).length }))
    .filter((x) => x.n >= 3);
}

/** "17 มิ.ย. 2567 – 12 พ.ย. 2569" for a set of photos ("" when none has a date). */
export function dateRange(photos: Photo[]) {
  const days = [...new Set(photos.map(dayKey).filter(Boolean))].sort();
  if (!days.length) return "";
  const a = days[0];
  const b = days[days.length - 1];
  if (a === b) return shortDay(a);
  const [da, db] = [toDate(a), toDate(b)];
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth())
    return `${da.getDate()}–${db.getDate()} ${TH_MONTHS[db.getMonth()]} ${db.getFullYear() + 543}`;
  return `${shortDay(a)} – ${shortDay(b)}`;
}

const gradDate = new Date(CLASS.graduation);
// the school year starts in May; ม.6 is the year that ends with graduation
const M6_START = gradDate.getMonth() < 4 ? gradDate.getFullYear() - 1 : gradDate.getFullYear();
/** School year of a "YYYY-MM-DD": { grade: "ม.5", year: 2568 } (grade "" outside ม.4–ม.6). */
export function schoolYear(day: string) {
  const [y, m] = day.split("-").map(Number);
  const start = m >= 5 ? y : y - 1;
  const g = 6 - (M6_START - start);
  return { grade: g >= 4 && g <= 6 ? `ม.${g}` : "", year: start + 543 };
}
export const gradeOf = (day: string) => schoolYear(day).grade;
