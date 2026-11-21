// /event/<id> — one occasion (a day out, a shoot, a party): its photos from every album,
// who was there, and the events either side of it.
import {
  BRAND,
  getAlbum,
  large,
  photoSrc,
  photoTags,
  students,
  studentAvatar,
  type Photo,
  type Student,
} from "../data.ts";
import { myNo } from "../lib/api.ts";
import { eventCard } from "../lib/cards.ts";
import {
  eventCover,
  eventDay,
  eventPhotos,
  eventTime,
  getEvent,
  listedEvents,
} from "../lib/events.ts";
import { readPref, rowsHtml, tileHtml, writePref, type Size } from "../lib/gallery.ts";
import { icon, logoMark } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { createViewer, type MediaItem } from "../lib/viewer.ts";
import { rail, renderProfilePage } from "./profile.ts";

const SIZE_KEY = "album-size";

export function renderEvent(root: HTMLElement, id: string): Cleanup {
  const ev = getEvent(id);
  const photos = ev ? eventPhotos(ev) : [];
  if (!ev || !photos.length) return renderProfilePage(root, null);
  document.body.className = "page-profile page-album";
  document.title = `${ev.title} · ${BRAND}`;

  const tagsOf = new Map(photos.map((p) => [p.id, photoTags(p.id).map((t) => t.student.no)]));
  const perPerson = new Map<number, number>();
  for (const nos of tagsOf.values())
    for (const n of nos) perPerson.set(n, (perPerson.get(n) ?? 0) + 1);
  const people: Student[] = students
    .filter((s) => perPerson.has(s.no))
    .sort((x, y) => perPerson.get(y.no)! - perPerson.get(x.no)!);
  const me = myNo();

  // hero mosaic: the cover + the shots with the most people in them
  const cover = eventCover(ev);
  const picks: Photo[] = [];
  const ranked = [...photos]
    .filter((p) => p.w >= p.h)
    .sort((x, y) => (tagsOf.get(y.id)?.length ?? 0) - (tagsOf.get(x.id)?.length ?? 0));
  for (const p of [cover, ...ranked]) {
    if (p && !picks.includes(p)) picks.push(p);
    if (picks.length === 5) break;
  }
  const mosaic = picks
    .map(
      (p, i) =>
        `<button type="button" class="al-mo" data-hero="${photos.indexOf(p)}" aria-label="เปิดรูป"><img src="${i === 0 ? large(p) : photoSrc(p)}" alt="" ${i ? 'loading="lazy"' : ""}></button>`,
    )
    .join("");
  const albumSlugs = Object.keys(ev.albums).filter((s) => getAlbum(s));
  const fact = (ic: string, t: string) =>
    t ? `<span class="al-fact">${icon(ic, 15)} ${esc(t)}</span>` : "";

  // neighbours in time (listed events, in order)
  const all = listedEvents();
  const at = all.findIndex((e) => e.id === ev.id);
  const near =
    at >= 0
      ? [all[at - 2], all[at - 1], all[at + 1], all[at + 2]].filter(
          (e): e is NonNullable<typeof e> => !!e,
        )
      : all.slice(0, 4);

  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main al-main" id="pf-main">
    <div class="al-page">
      <div class="al-top">
        <nav class="pf-crumbs" aria-label="Breadcrumb"><a href="/" data-link>${logoMark(16)}</a>${icon("chevronRight", 14)}<a href="/events" data-link>ไทม์ไลน์</a>${icon("chevronRight", 14)}<span>${esc(ev.title)}</span></nav>
      </div>
      <header class="al-hero">
        <div class="al-mosaic n-${Math.min(5, Math.max(1, picks.length))}">${mosaic}</div>
        <div class="al-hero-info">
          ${ev.day ? `<span class="al-kicker">${icon("calendar", 14)} ${esc(eventDay(ev))}</span>` : ""}
          <h1>${esc(ev.title)}</h1>
          ${ev.note ? `<p class="al-tagline">${esc(ev.note)}</p>` : ""}
          <div class="al-facts">
            ${fact("clock", eventTime(ev))}
            ${fact("pin", ev.place ?? "")}
            ${fact("image", `${photos.length.toLocaleString()} รูป`)}
            ${fact("users", people.length ? `${people.length} คนในรูป` : "")}
          </div>
          ${albumSlugs.length ? `<p class="ev-from">อัลบั้ม: ${albumSlugs.map((s) => `<a href="/album/${s}" data-link>${esc(getAlbum(s)!.title)}</a>`).join(" · ")}</p>` : ""}
          <div class="al-actions">
            <button type="button" class="al-btn is-primary" data-slideshow>${icon("play", 16)} สไลด์โชว์</button>
            <button type="button" class="al-btn" data-copy>${icon("share", 16)} <span>คัดลอกลิงก์</span></button>
          </div>
        </div>
      </header>

      ${
        people.length
          ? `<section class="al-people" aria-label="คนในเหตุการณ์นี้">
        <div class="al-people-head"><h2>คนในเหตุการณ์นี้</h2></div>
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
        <div class="al-tabs"><span class="ev-count" data-status></span></div>
        <div class="al-controls">
          <div class="al-size" role="group" aria-label="ขนาดรูป">
            <button type="button" data-size="s" title="รูปเล็ก" aria-label="รูปเล็ก">${icon("grid", 13)}</button>
            <button type="button" data-size="m" title="รูปกลาง" aria-label="รูปกลาง">${icon("image", 15)}</button>
            <button type="button" data-size="l" title="รูปใหญ่" aria-label="รูปใหญ่">${icon("image", 19)}</button>
          </div>
        </div>
      </div>
      <section class="al-panel"><div data-rows></div></section>

      ${
        near.length
          ? `<section class="al-more"><h2>เหตุการณ์ใกล้เคียง</h2><div class="al-more-row">${near.map((e) => eventCard(e)).join("")}</div></section>`
          : ""
      }
    </div>
  </main></div>`;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const main = $("#pf-main")!;
  let alive = true;
  const timers = new Set<number>();
  const disposers: (() => void)[] = [];
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  };
  const viewer = createViewer(root.querySelector<HTMLElement>(".pf-app")!, later);
  disposers.push(viewer.dispose);
  const onKey = (e: KeyboardEvent) => void viewer.onKey(e);
  window.addEventListener("keydown", onKey);
  disposers.push(() => window.removeEventListener("keydown", onKey));
  requestAnimationFrame(() => main.classList.add("is-mounted"));

  const state = { size: ((readPref(SIZE_KEY) as Size) || "m") as Size, person: 0 };
  let list = photos;
  const items = () => list.map((p): MediaItem => ({ kind: "photo", photo: p, caption: ev.title }));
  const host = $("[data-rows]")!;
  const status = $("[data-status]")!;
  const render = () => {
    list = state.person
      ? photos.filter((p) => (tagsOf.get(p.id) ?? []).includes(state.person))
      : photos;
    const who = state.person ? students.find((s) => s.no === state.person) : null;
    status.innerHTML = `${list.length.toLocaleString()} รูป${who ? ` ที่มี <b>${esc(who.nickname)}</b> <button type="button" class="al-clear" data-clear>${icon("close", 12)} ล้าง</button>` : ""}`;
    const width = host.clientWidth || main.clientWidth - 48;
    host.innerHTML = `<div class="al-rows">${rowsHtml(list, 0, width, state.size, (p, i, w, h) => tileHtml(p, i, w, h, tagsOf.get(p.id) ?? []))}</div>`;
  };
  const markSize = () =>
    root
      .querySelectorAll<HTMLElement>("[data-size]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.size === state.size)));
  markSize();
  const setPerson = (n: number) => {
    state.person = state.person === n ? 0 : n;
    root
      .querySelectorAll<HTMLElement>("[data-person]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.person) === state.person)),
      );
    render();
    root.querySelector(".al-bar")!.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  root.querySelector(".al-page")!.addEventListener("click", (e) => {
    const t = e.target as Element;
    const sz = t.closest<HTMLElement>("[data-size]");
    if (sz) {
      state.size = sz.dataset.size as Size;
      writePref(SIZE_KEY, state.size);
      markSize();
      return render();
    }
    const tile = t.closest<HTMLElement>(".al-tile");
    if (tile) return viewer.open(items(), Number(tile.dataset.view));
    const hero = t.closest<HTMLElement>("[data-hero]");
    if (hero)
      return viewer.open(
        photos.map((p): MediaItem => ({ kind: "photo", photo: p, caption: ev.title })),
        Math.max(0, Number(hero.dataset.hero)),
      );
    const person = t.closest<HTMLElement>("[data-person]");
    if (person) return setPerson(Number(person.dataset.person));
    if (t.closest("[data-clear]")) return setPerson(state.person);
    if (t.closest("[data-slideshow]")) return viewer.open(items(), 0, { slideshow: true });
    const copy = t.closest<HTMLElement>("[data-copy]");
    if (copy)
      void navigator.clipboard?.writeText(`${location.origin}/event/${ev.id}`).then(() => {
        copy.querySelector("span")!.textContent = "คัดลอกแล้ว ✓";
        later(() => (copy.querySelector("span")!.textContent = "คัดลอกลิงก์"), 1800);
      });
  });
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth;
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    render();
  });
  ro.observe(host);
  disposers.push(() => ro.disconnect());
  render();

  const deep = decodeURIComponent(location.hash.match(/^#photo=([\w-]+)/)?.[1] ?? "");
  const di = deep ? list.findIndex((p) => p.id === deep) : -1;
  if (di >= 0) later(() => viewer.open(items(), di), 250);

  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    disposers.forEach((d) => d());
  };
}
