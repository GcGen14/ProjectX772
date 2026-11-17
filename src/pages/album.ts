// /album/<slug> — a page made for looking at photos:
//   hero mosaic + facts, "who's in this album" (tap a face to filter), sticky toolbar,
//   photos grouped by day in justified rows, videos, about, other albums.
import {
  BRAND,
  CLASS,
  albums,
  driveFolder,
  featured,
  getAlbum,
  large,
  photoExif,
  photoInfo,
  photoSrc,
  photoTags,
  students,
  studentAvatar,
  thumb,
  type Album,
  type Photo,
  type Student,
} from "../data.ts";
import { myNo } from "../lib/api.ts";
import { icon, logoMark } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { createViewer, type MediaItem } from "../lib/viewer.ts";
import { mountVideos, rail, renderProfilePage, type PageApi } from "./profile.ts";

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

/** Cards linking to albums (used on student pages). */
export const albumRows = (list: Album[]) =>
  list
    .map(
      (a) =>
        `<a class="pf-svc-row" href="/album/${a.slug}" data-link><img src="${albumCover(a) ? thumb(albumCover(a).id) : albumCoverSrc(a)}" alt=""><div><b>${esc(a.title)}</b><span>${albumCount(a)}</span></div></a>`,
    )
    .join("");

export const albumCards = (list: Album[]) =>
  `<div class="pf-svc-grid">${list
    .map(
      (a) => `<a class="pf-svc-card" href="/album/${a.slug}" data-link>
        <div class="pf-carousel"><div class="pf-car-track"><img src="${albumCoverSrc(a)}" alt="" loading="lazy"></div></div>
        <h3>${esc(a.title)} <span class="muted">· ${esc(a.en)}</span></h3>
        <div class="pf-svc-meta">${icon("image", 14)} <span>${albumCount(a)}</span></div>
      </a>`,
    )
    .join("")}</div>`;

/* ---------------- dates ---------------- */
const TH_MONTHS = [
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
const toDate = (d: string) => new Date(d.replace(" ", "T"));
const dayKey = (p: Photo) => {
  const d = photoExif(p.id).date;
  return d && d >= "2020" ? d.slice(0, 10) : "";
};
const shortDay = (k: string) => {
  const d = toDate(k);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};
const longDay = (k: string) =>
  new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toDate(k));
function dateRange(photos: Photo[]) {
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

type View = "day" | "album" | "people";
const VIEW_KEY = "album-view";
const SIZE_KEY = "album-size";
const SIZES = { s: 150, m: 220, l: 320 } as const;
type Size = keyof typeof SIZES;
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function renderAlbum(root: HTMLElement, slug: string): Cleanup {
  const a = getAlbum(slug);
  if (!a) return renderProfilePage(root, null);
  document.body.className = "page-profile page-album";
  document.title = `${a.title} · ${BRAND}`;

  /* ---------- data for the page ---------- */
  const tagsOf = new Map(a.photos.map((p) => [p.id, photoTags(p.id).map((t) => t.student.no)]));
  const perPerson = new Map<number, number>();
  for (const nos of tagsOf.values())
    for (const n of nos) perPerson.set(n, (perPerson.get(n) ?? 0) + 1);
  const people: Student[] = students
    .filter((s) => perPerson.has(s.no))
    .sort((x, y) => perPerson.get(y.no)! - perPerson.get(x.no)!);
  const datedShare = a.photos.filter((p) => dayKey(p)).length / Math.max(1, a.photos.length);
  const cameras = [
    ...new Set(a.photos.map((p) => photoExif(p.id).camera).filter(Boolean)),
  ] as string[];
  const range = dateRange(a.photos);
  const caption = (p: Photo) => (p.group && a.groups.length ? `${a.title} · ${p.group}` : a.title);
  const others = albums.filter((x) => x !== a);
  const me = myNo();

  // hero mosaic: the most "peopled" landscape shots, spread across the album
  const pool = featured(a).filter((p) => p.w >= p.h);
  const picks: Photo[] = [];
  const ranked = [...pool].sort(
    (x, y) => (tagsOf.get(y.id)?.length ?? 0) - (tagsOf.get(x.id)?.length ?? 0),
  );
  for (const p of [albumCover(a), ...ranked].filter(Boolean) as Photo[]) {
    if (!picks.includes(p)) picks.push(p);
    if (picks.length === 5) break;
  }
  const mosaic = picks.length
    ? picks
        .map(
          (p, i) =>
            `<button type="button" class="al-mo" data-hero="${a.photos.indexOf(p)}" aria-label="เปิดรูป"><img src="${i === 0 ? large(p) : photoSrc(p)}" alt="" ${i ? 'loading="lazy"' : ""}></button>`,
        )
        .join("")
    : a.videos
        .filter((v) => v.thumb)
        .slice(0, 5)
        .map((v) => `<span class="al-mo"><img src="${thumb(v.id)}" alt=""></span>`)
        .join("");
  const fact = (ic: string, html: string) =>
    html ? `<span class="al-fact">${icon(ic, 15)} ${html}</span>` : "";
  const hasPhotos = a.photos.length > 0;
  const startTab = hasPhotos ? "photos" : a.videos.length ? "videos" : "about";

  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main al-main" id="pf-main">
    <div class="al-page">
      <div class="al-top">
        <nav class="pf-crumbs" aria-label="Breadcrumb"><a href="/" data-link>${logoMark(16)}</a>${icon("chevronRight", 14)}<a href="/#showcase" data-link>อัลบั้ม</a>${icon("chevronRight", 14)}<span>${esc(a.title)}</span></nav>
        <nav class="al-switch" aria-label="อัลบั้มอื่น">${albums
          .map(
            (x) =>
              `<a href="/album/${x.slug}" data-link class="${x === a ? "is-on" : ""}"${x === a ? ' aria-current="page"' : ""}>${esc(x.title)}</a>`,
          )
          .join("")}</nav>
      </div>

      <header class="al-hero">
        <div class="al-mosaic n-${Math.min(5, Math.max(1, picks.length || a.videos.filter((v) => v.thumb).slice(0, 5).length))}">${mosaic}</div>
        <div class="al-hero-info">
          <span class="al-kicker">${icon("image", 14)} อัลบั้ม · ${esc(a.en)}</span>
          <h1>${esc(a.title)}</h1>
          ${a.tagline ? `<p class="al-tagline">${esc(a.tagline)}</p>` : ""}
          <div class="al-facts">
            ${fact("calendar", range)}
            ${fact("image", a.photos.length ? `<b>${a.photos.length.toLocaleString()}</b> รูป` : "")}
            ${fact("video", a.videos.length ? `<b>${a.videos.length}</b> คลิป` : "")}
            ${fact("users", people.length ? `<b>${people.length}</b> เพื่อนในรูป` : "")}
            ${fact("camera", cameras.length ? esc(cameras.slice(0, 2).join(", ")) : "")}
          </div>
          <div class="al-actions">
            ${hasPhotos ? `<button type="button" class="al-btn is-primary" data-slideshow>${icon("play", 16)} ดูสไลด์โชว์</button>` : ""}
            <button type="button" class="al-btn" data-copy>${icon("share", 16)} <span>คัดลอกลิงก์</span></button>
            ${a.folders[0] ? `<a class="al-btn" href="${driveFolder(a.folders[0])}" target="_blank" rel="noopener">${icon("folder", 16)} Google Drive ${icon("arrowUpRight", 13)}</a>` : ""}
          </div>
        </div>
      </header>

      ${
        people.length
          ? `<section class="al-people" aria-label="เพื่อนในอัลบั้มนี้">
        <div class="al-people-head"><h2>เพื่อนในอัลบั้มนี้</h2><span>แตะที่หน้าเพื่อดูเฉพาะรูปที่มีคนนั้น</span></div>
        <div class="al-faces">${[
          ...(me != null && perPerson.has(me) ? [students.find((s) => s.no === me)!] : []),
          ...people.filter((s) => s.no !== me),
        ]
          .map(
            (s) =>
              `<button type="button" class="al-face" data-person="${s.no}" aria-pressed="false" title="${esc(s.nickname)}"><span class="al-face-img"><img src="${studentAvatar(s)}" alt="" loading="lazy"><b>${perPerson.get(s.no)}</b></span><span class="al-face-name">${s.no === me ? "ฉัน" : esc(s.nickname)}</span></button>`,
          )
          .join("")}</div>
      </section>`
          : ""
      }

      <div class="al-bar">
        <div class="al-tabs" role="tablist">
          ${hasPhotos ? `<button type="button" role="tab" data-tab="photos" aria-selected="${startTab === "photos"}">รูปภาพ <span>${a.photos.length.toLocaleString()}</span></button>` : ""}
          ${a.videos.length ? `<button type="button" role="tab" data-tab="videos" aria-selected="${startTab === "videos"}">วิดีโอ <span>${a.videos.length}</span></button>` : ""}
          <button type="button" role="tab" data-tab="about" aria-selected="${startTab === "about"}">เกี่ยวกับ</button>
        </div>
        <div class="al-controls" data-controls>
          ${
            a.groups.length
              ? `<label class="al-select">${icon("folder", 15)}<select data-group aria-label="กลุ่ม"><option value="">ทุกกลุ่ม</option>${a.groups
                  .map(
                    (g) =>
                      `<option value="${esc(g)}">${esc(g)} (${a.photos.filter((p) => p.group === g).length})</option>`,
                  )
                  .join("")}</select></label>`
              : ""
          }
          <label class="al-select">${icon("grid", 15)}<select data-view aria-label="จัดเรียง">
            ${datedShare > 0.2 ? `<option value="day">แยกตามวัน</option>` : ""}
            <option value="album">ลำดับในอัลบั้ม</option>
            <option value="people">คนในรูปเยอะสุด</option>
          </select></label>
          <div class="al-size" role="group" aria-label="ขนาดรูป">
            <button type="button" data-size="s" title="รูปเล็ก" aria-label="รูปเล็ก">${icon("grid", 13)}</button>
            <button type="button" data-size="m" title="รูปกลาง" aria-label="รูปกลาง">${icon("image", 15)}</button>
            <button type="button" data-size="l" title="รูปใหญ่" aria-label="รูปใหญ่">${icon("image", 19)}</button>
          </div>
        </div>
      </div>
      <p class="al-status" data-status></p>

      <section class="al-panel" data-panel="photos"${startTab === "photos" ? "" : " hidden"}><div data-groups></div></section>
      <section class="al-panel" data-panel="videos"${startTab === "videos" ? "" : " hidden"}><div data-videos></div></section>
      <section class="al-panel" data-panel="about"${startTab === "about" ? "" : " hidden"}>
        <div class="al-about">
          <div>
            <h2>${esc(a.title)} <span class="muted">· ${esc(a.en)}</span></h2>
            <p>${esc(a.about || a.tagline || "")}</p>
            ${a.tags.length || a.groups.length ? `<div class="pf-skill-list">${a.tags.map((t) => `<span class="chip">${esc(t.label)}</span>`).join("")}${a.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</div>` : ""}
          </div>
          <dl class="al-about-card">
            <div><dt>${icon("image", 16)} รูปภาพ</dt><dd>${a.photos.length.toLocaleString()}</dd></div>
            <div><dt>${icon("video", 16)} วิดีโอ</dt><dd>${a.videos.length}</dd></div>
            ${range ? `<div><dt>${icon("calendar", 16)} ช่วงเวลา</dt><dd>${range}</dd></div>` : ""}
            ${cameras.length ? `<div><dt>${icon("camera", 16)} กล้อง</dt><dd>${esc(cameras.join(", "))}</dd></div>` : ""}
            <div><dt>${icon("home", 16)} ห้อง</dt><dd>${CLASS.name} · ${CLASS.gen}</dd></div>
            <div><dt>${icon("clock", 16)} ซิงก์ล่าสุด</dt><dd>${esc(fmtSynced(a.syncedAt))}</dd></div>
            <div><dt>${icon("folder", 16)} ต้นฉบับ</dt><dd>${a.folders.map((f, i) => `<a href="${driveFolder(f)}" target="_blank" rel="noopener">Google Drive${a.folders.length > 1 ? ` ${i + 1}` : ""} ↗</a>`).join("<br>") || "—"}</dd></div>
          </dl>
        </div>
      </section>

      ${
        others.length
          ? `<section class="al-more"><h2>อัลบั้มอื่นของ ${CLASS.name}</h2><div class="al-more-row">${others
              .map(
                (o) => `<a class="al-card" href="/album/${o.slug}" data-link>
              <span class="al-card-img"><img src="${albumCoverSrc(o)}" alt="" loading="lazy"></span>
              <b>${esc(o.title)}</b><span>${albumCount(o)}${dateRange(o.photos) ? ` · ${dateRange(o.photos)}` : ""}</span></a>`,
              )
              .join("")}</div></section>`
          : ""
      }
    </div>
  </main></div>`;

  /* ---------- page plumbing ---------- */
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const main = $("#pf-main")!;
  let alive = true;
  const timers = new Set<number>();
  const disposers: (() => void)[] = [];
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  };
  const viewer = createViewer(root.querySelector<HTMLElement>(".pf-app")!, later);
  disposers.push(viewer.dispose);
  const onKey = (e: KeyboardEvent) => void viewer.onKey(e);
  window.addEventListener("keydown", onKey);
  disposers.push(() => window.removeEventListener("keydown", onKey));
  const status = $("[data-status]")!;
  const pageApi: PageApi = {
    openViewer: (items, i, opts) => viewer.open(items, i, opts),
    setTab: (k) => showTab(k),
    toast: (msg) => {
      status.textContent = msg;
    },
    later,
    onDispose: (fn) => disposers.push(fn),
  };
  requestAnimationFrame(() => main.classList.add("is-mounted"));

  /* ---------- state ---------- */
  const state = {
    view: ((read(VIEW_KEY) as View) || (datedShare > 0.2 ? "day" : "album")) as View,
    size: ((read(SIZE_KEY) as Size) || "m") as Size,
    group: "",
    person: 0,
  };
  if (state.view === "day" && datedShare <= 0.2) state.view = "album";
  const viewSel = $<HTMLSelectElement>("[data-view]");
  if (viewSel) viewSel.value = state.view;
  let list: Photo[] = [];
  const items = () =>
    list.map((p): MediaItem => ({ kind: "photo", photo: p, caption: caption(p) }));

  const filtered = () => {
    let out = a.photos.filter(
      (p) =>
        (!state.group || p.group === state.group) &&
        (!state.person || (tagsOf.get(p.id) ?? []).includes(state.person)),
    );
    if (state.view === "day")
      out = [...out].sort((x, y) => {
        const dx = photoExif(x.id).date ?? "~";
        const dy = photoExif(y.id).date ?? "~";
        return dx < dy ? -1 : dx > dy ? 1 : 0;
      });
    else if (state.view === "people")
      out = [...out].sort(
        (x, y) => (tagsOf.get(y.id)?.length ?? 0) - (tagsOf.get(x.id)?.length ?? 0),
      );
    return out;
  };

  /* ---------- justified rows ---------- */
  const groupsHost = $("[data-groups]")!;
  const tileHtml = (p: Photo, i: number, w: number, h: number) => {
    const nos = tagsOf.get(p.id) ?? [];
    const cap = photoInfo(p.id)?.caption;
    const day = dayKey(p);
    return `<button class="al-tile" type="button" data-view="${i}" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px" aria-label="เปิดรูป ${i + 1}${nos.length ? ` · ${nos.length} คน` : ""}"><img src="${photoSrc(p)}" alt="" loading="lazy" decoding="async"><span class="al-tile-info">${cap ? `<span class="al-tile-cap">${esc(cap)}</span>` : day && state.view !== "day" ? `<span>${shortDay(day)}</span>` : "<span></span>"}${
      nos.length
        ? `<span class="pf-tile-people">${nos
            .slice(0, 3)
            .map((n) => `<img src="${studentAvatar(students.find((s) => s.no === n)!)}" alt="">`)
            .join("")}${nos.length > 3 ? `<b>+${nos.length - 3}</b>` : ""}</span>`
        : ""
    }</span></button>`;
  };
  function rowsHtml(photos: Photo[], offset: number, width: number) {
    const target = SIZES[state.size] * (innerWidth < 640 ? 0.62 : 1);
    const gap = 4;
    let out = "";
    let row: Photo[] = [];
    let sum = 0;
    const flush = (last: boolean) => {
      if (!row.length) return;
      const h = last
        ? Math.min(target, (width - gap * (row.length - 1)) / sum)
        : (width - gap * (row.length - 1)) / sum;
      out += `<div class="al-row">${row
        .map((p) => tileHtml(p, offset + photos.indexOf(p), (p.w / p.h) * h, h))
        .join("")}</div>`;
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
  function render() {
    list = filtered();
    const width = groupsHost.clientWidth || main.clientWidth - 48;
    const who = state.person ? students.find((s) => s.no === state.person) : null;
    status.innerHTML = `${list.length.toLocaleString()} รูป${who ? ` ที่มี <b>${esc(who.nickname)}</b> <button type="button" class="al-clear" data-clear>${icon("close", 12)} ล้าง</button>` : ""}${state.group ? ` · ${esc(state.group)}` : ""}`;
    if (!list.length) {
      groupsHost.innerHTML = `<p class="pf-empty">ไม่มีรูปที่ตรงกับตัวกรองนี้</p>`;
      return;
    }
    if (state.view !== "day") {
      groupsHost.innerHTML = `<div class="al-rows">${rowsHtml(list, 0, width)}</div>`;
      return;
    }
    // one section per day (undated photos last)
    const days = new Map<string, Photo[]>();
    for (const p of list) days.set(dayKey(p), [...(days.get(dayKey(p)) ?? []), p]);
    let offset = 0;
    let html = "";
    for (const [k, ps] of days) {
      const ppl = new Set(ps.flatMap((p) => tagsOf.get(p.id) ?? [])).size;
      html += `<section class="al-day"><h3>${k ? esc(longDay(k)) : "ไม่ทราบวันที่"}<span>${ps.length.toLocaleString()} รูป${ppl ? ` · ${ppl} คน` : ""}</span></h3><div class="al-rows">${rowsHtml(ps, offset, width)}</div></section>`;
      offset += ps.length;
    }
    groupsHost.innerHTML = html;
  }

  /* ---------- tabs ---------- */
  const controls = $("[data-controls]")!;
  let videosMounted = false;
  function showTab(k: string) {
    root
      .querySelectorAll<HTMLElement>("[data-tab]")
      .forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    root
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((p) => (p.hidden = p.dataset.panel !== k));
    controls.hidden = k !== "photos";
    status.hidden = k !== "photos";
    if (k === "videos" && !videosMounted) {
      videosMounted = true;
      mountVideos($("[data-videos]")!, a!.videos, pageApi);
    }
    if (k === "photos") render();
  }
  root.querySelector(".al-tabs")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-tab]");
    if (b) showTab(b.dataset.tab!);
  });

  /* ---------- controls ---------- */
  const markSize = () =>
    root
      .querySelectorAll<HTMLElement>("[data-size]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.size === state.size)));
  markSize();
  root.querySelector(".al-size")?.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-size]");
    if (!b) return;
    state.size = b.dataset.size as Size;
    write(SIZE_KEY, state.size);
    markSize();
    render();
  });
  viewSel?.addEventListener("change", () => {
    state.view = viewSel.value as View;
    write(VIEW_KEY, state.view);
    render();
  });
  $<HTMLSelectElement>("[data-group]")?.addEventListener("change", (e) => {
    state.group = (e.target as HTMLSelectElement).value;
    render();
  });
  const setPerson = (n: number) => {
    state.person = state.person === n ? 0 : n;
    root
      .querySelectorAll<HTMLElement>("[data-person]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.person) === state.person)),
      );
    showTab("photos");
    root.querySelector(".al-bar")!.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ---------- clicks ---------- */
  root.querySelector(".al-page")!.addEventListener("click", (e) => {
    const t = e.target as Element;
    const tile = t.closest<HTMLElement>("[data-view]");
    if (tile && tile.classList.contains("al-tile"))
      return viewer.open(items(), Number(tile.dataset.view));
    const hero = t.closest<HTMLElement>("[data-hero]");
    if (hero) {
      const all = a!.photos.map((p): MediaItem => ({
        kind: "photo",
        photo: p,
        caption: caption(p),
      }));
      return viewer.open(all, Math.max(0, Number(hero.dataset.hero)));
    }
    const person = t.closest<HTMLElement>("[data-person]");
    if (person) return setPerson(Number(person.dataset.person));
    if (t.closest("[data-clear]")) return setPerson(state.person);
    if (t.closest("[data-slideshow]")) {
      if (!list.length) list = filtered();
      return viewer.open(items(), 0, { slideshow: true });
    }
    const copy = t.closest<HTMLElement>("[data-copy]");
    if (copy) {
      void navigator.clipboard?.writeText(`${location.origin}/album/${a!.slug}`).then(() => {
        copy.querySelector("span")!.textContent = "คัดลอกแล้ว ✓";
        later(() => (copy.querySelector("span")!.textContent = "คัดลอกลิงก์"), 1800);
      });
    }
  });

  // re-flow the rows when the width changes
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = groupsHost.clientWidth;
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    if (!$("[data-panel=photos]")?.hidden) render();
  });
  ro.observe(groupsHost);
  disposers.push(() => ro.disconnect());

  showTab(startTab);

  // shared link: /album/<slug>#photo=<id>
  const deep = decodeURIComponent(location.hash.match(/^#photo=([\w-]+)/)?.[1] ?? "");
  if (deep) {
    const at = list.findIndex((p) => p.id === deep);
    const all = at >= 0 ? null : a.photos.findIndex((p) => p.id === deep);
    if (at >= 0) later(() => viewer.open(items(), at), 250);
    else if (all != null && all >= 0)
      later(
        () =>
          viewer.open(
            a.photos.map((p): MediaItem => ({ kind: "photo", photo: p, caption: caption(p) })),
            all,
          ),
        250,
      );
  }

  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    disposers.forEach((d) => d());
  };
}

function fmtSynced(v: string | undefined) {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
