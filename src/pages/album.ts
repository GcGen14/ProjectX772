// /album/<slug> — a page made for looking at photos:
//   hero mosaic + facts, "who's in this album" (tap a face to filter), sticky toolbar,
//   photos in justified rows (by day / album order / most people), events, videos, about.
import {
  BRAND,
  albums,
  driveFolder,
  featured,
  getAlbum,
  large,
  photoExif,
  photoTags,
  students,
  studentAvatar,
  thumb,
  photoSrc,
  type Album,
  type Photo,
  type Student,
} from "../data.ts";
import { myNo } from "../lib/api.ts";
import { albumCard, eventCard } from "../lib/cards.ts";
import {
  albumCount,
  albumEvents,
  albumCover,
  albumCoverSrc,
  albumSrcs,
  dateRange,
  dayKey,
  longDay,
  shortDay,
} from "../lib/events.ts";
import { readPref, rowsHtml, tileHtml, writePref, type Size } from "../lib/gallery.ts";
import { icon, logoMark } from "../lib/icons.ts";
import { previewHtml } from "../lib/preview.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { createViewer, type MediaItem } from "../lib/viewer.ts";
import { mountVideos, rail, renderProfilePage, type PageApi } from "./profile.ts";

export { albumCover, albumCoverSrc, albumCount };

/** Small rows linking to albums (used on student pages). */
export const albumRows = (list: Album[]) =>
  list
    .map(
      (a) =>
        `<a class="pf-svc-row" href="/album/${a.slug}" data-link><img src="${albumCover(a) ? thumb(albumCover(a).id) : albumCoverSrc(a)}" alt=""><div><b>${esc(a.title)}</b><span>${albumCount(a)}</span></div></a>`,
    )
    .join("");

/** Cards linking to albums (student / teacher pages). Hover flips through the album's pictures. */
export const albumCards = (list: Album[]) =>
  `<div class="pf-svc-grid">${list
    .map((a) => {
      const { srcs, videoFrom } = albumSrcs(a);
      return `<a class="pf-svc-card pv-host" href="/album/${a.slug}" data-link>
        <div class="al-pv-wrap">${previewHtml(srcs, { videoFrom })}</div>
        <h3>${esc(a.title)} <span class="muted">· ${esc(a.en)}</span></h3>
        <div class="pf-svc-meta">${icon("image", 14)} <span>${albumCount(a)}</span></div>
      </a>`;
    })
    .join("")}</div>`;

type View = "day" | "album" | "people";
const VIEW_KEY = "album-view";
const SIZE_KEY = "album-size";

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
  const range = dateRange(a.photos);
  const events = albumEvents(a);
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
          <span class="al-kicker">${icon("image", 14)} ${esc(a.en)}</span>
          <h1>${esc(a.title)}</h1>
          ${a.tagline ? `<p class="al-tagline">${esc(a.tagline)}</p>` : ""}
          <div class="al-facts">
            ${fact("calendar", range)}
            ${fact("image", a.photos.length ? `<b>${a.photos.length.toLocaleString()}</b> รูป` : "")}
            ${fact("video", a.videos.length ? `<b>${a.videos.length}</b> คลิป` : "")}
            ${fact("users", people.length ? `<b>${people.length}</b> คนในรูป` : "")}
          </div>
          <div class="al-actions">
            ${hasPhotos ? `<button type="button" class="al-btn is-primary" data-slideshow>${icon("play", 16)} สไลด์โชว์</button>` : ""}
            <button type="button" class="al-btn" data-copy>${icon("share", 16)} <span>คัดลอกลิงก์</span></button>
            ${a.folders[0] ? `<a class="al-btn" href="${driveFolder(a.folders[0])}" target="_blank" rel="noopener">${icon("folder", 16)} Google Drive ${icon("arrowUpRight", 13)}</a>` : ""}
          </div>
        </div>
      </header>

      ${
        people.length
          ? `<section class="al-people" aria-label="คนในอัลบั้มนี้">
        <div class="al-people-head"><h2>คนในอัลบั้มนี้</h2></div>
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
          ${events.length > 1 ? `<button type="button" role="tab" data-tab="events" aria-selected="false">เหตุการณ์ <span>${events.length}</span></button>` : ""}
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
      <section class="al-panel" data-panel="events" hidden><div class="al-more-row">${events.map((x) => eventCard(x.ev, x.n)).join("")}</div></section>
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
            ${a.folders.length ? `<div><dt>${icon("folder", 16)} ต้นฉบับ</dt><dd>${a.folders.map((f, i) => `<a href="${driveFolder(f)}" target="_blank" rel="noopener">Google Drive${a.folders.length > 1 ? ` ${i + 1}` : ""} ↗</a>`).join("<br>")}</dd></div>` : ""}
          </dl>
        </div>
      </section>

      ${
        others.length
          ? `<section class="al-more"><h2>อัลบั้มอื่น</h2><div class="al-more-row">${others.map((o) => albumCard(o)).join("")}</div></section>`
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
    view: (readPref(VIEW_KEY) as View) || (datedShare > 0.2 ? "day" : "album"),
    size: ((readPref(SIZE_KEY) as Size) || "m") as Size,
    group: "",
    person: 0,
  };
  if (state.view === "day" && datedShare <= 0.2) state.view = "album";
  if (!["day", "album", "people"].includes(state.view)) state.view = "album";
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
  const tile = (p: Photo, i: number, w: number, h: number) =>
    tileHtml(p, i, w, h, tagsOf.get(p.id) ?? []);
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
      groupsHost.innerHTML = `<div class="al-rows">${rowsHtml(list, 0, width, state.size, tile)}</div>`;
      return;
    }
    // one section per day (undated photos last)
    const days = new Map<string, Photo[]>();
    for (const p of list) days.set(dayKey(p), [...(days.get(dayKey(p)) ?? []), p]);
    let offset = 0;
    let html = "";
    for (const [k, ps] of days) {
      const ppl = new Set(ps.flatMap((p) => tagsOf.get(p.id) ?? [])).size;
      html += `<section class="al-day"><h3>${k ? esc(longDay(k)) : "ไม่ทราบวันที่"}<span>${ps.length.toLocaleString()} รูป${ppl ? ` · ${ppl} คน` : ""}</span></h3><div class="al-rows">${rowsHtml(ps, offset, width, state.size, tile)}</div></section>`;
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
    writePref(SIZE_KEY, state.size);
    markSize();
    render();
  });
  viewSel?.addEventListener("change", () => {
    state.view = viewSel.value as View;
    writePref(VIEW_KEY, state.view);
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
    const tileEl = t.closest<HTMLElement>(".al-tile");
    if (tileEl) return viewer.open(items(), Number(tileEl.dataset.view));
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

export { shortDay };
