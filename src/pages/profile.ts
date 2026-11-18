// Shared "profile" page layout (left rail, header, cover, tabs, viewer).
// Album pages and student pages both render through renderProfilePage().
import {
  BRAND,
  CLASS,
  photoExif,
  photoSrc,
  photoTags,
  students,
  studentAvatar,
  thumb,
  type Photo,
  type Video,
  profileUrl,
} from "../data.ts";
import { myNo } from "../lib/api.ts";
import { chatBadge } from "../lib/chat-badge.ts";
import { icon, logoMark } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { badgeRow, crownSvg, hasCrown } from "../lib/badges.ts";
import { applyTheme, type ProfileTheme } from "../lib/theme.ts";
import { songNavButton } from "../lib/song.ts";
import { createViewer, type MediaItem } from "../lib/viewer.ts";

export type { MediaItem } from "../lib/viewer.ts";

export type PageApi = {
  openViewer(items: MediaItem[], index: number, opts?: { slideshow?: boolean }): void;
  setTab(key: string): void;
  toast(msg: string): void;
  later(fn: () => void, ms: number): void;
  onDispose(fn: () => void): void;
};

export type ProfileTab = {
  key: string;
  label: string;
  count?: number;
  render: () => string;
  mount?: (panel: HTMLElement, api: PageApi) => void;
};

export type ProfileConfig = {
  docTitle: string;
  crumbs: { label: string; href?: string }[];
  topNav?: string;
  avatar: string;
  avatarShape?: "round" | "square";
  name: string;
  /** emoji shown after the name */
  nameBadge?: string;
  /** colours / background / font the student picked for their page */
  theme?: ProfileTheme;
  /** badge ids given in /backend (หัวหน้าห้อง gets a crown on the picture) */
  badges?: string[];
  handle: string;
  handleNote: string;
  bio: string;
  lines: { icon: string; html: string }[];
  stack: { avatars: string[]; more: number };
  stats: { value: string; label: string }[];
  follow: [string, string];
  covers: string[];
  tags: { label: string; icon: string }[];
  moreTags?: string[];
  preload: string[];
  tabs: ProfileTab[];
};

/* ----------------------------- shared bits ----------------------------- */

export const rail = () => `
  <nav class="menu-rail" aria-label="Main">
    <a class="rail-logo" href="/" data-link aria-label="${BRAND} home">${logoMark(36)}</a>
    <a class="rail-item" href="/#showcase" data-link>${icon("grid", 24)}<span>อัลบั้ม</span></a>
    <span class="rail-sep"></span>
    <a class="rail-item" href="/#classmates" data-link>${icon("users", 24)}<span>เพื่อน</span></a>
    <a class="rail-item rail-chat" href="/chat" data-link>${icon("chat", 24)}<span>แชท</span>${chatBadge()}</a>
    <a class="rail-item" href="/me" data-link>${icon("user", 24)}<span>${myNo() ? "โปรไฟล์ฉัน" : "เข้าสู่ระบบ"}</span></a>
    ${songNavButton("rail")}
    <span class="rail-item rail-bottom rail-class"><b>${CLASS.short}</b><span>${CLASS.gen}</span></span>
  </nav>
  <nav class="tab-bar" aria-label="Main">
    <a href="/" data-link>${logoMark(22)}<span>หน้าแรก</span></a>
    <a href="/#showcase" data-link>${icon("grid", 22)}<span>อัลบั้ม</span></a>
    <a href="/#classmates" data-link>${icon("users", 22)}<span>เพื่อน</span></a>
    <a class="tab-chat" href="/chat" data-link>${icon("chat", 22)}<span>แชท</span>${chatBadge()}</a>
    ${songNavButton("tab")}
    <a href="/me" data-link>${icon("user", 22)}<span>${myNo() ? "ฉัน" : "เข้าระบบ"}</span></a>
  </nav>`;

const skeleton = () => `
  <div class="pf-topbar"><span class="skeleton" style="width:120px;height:20px"></span></div>
  <section class="pf-head">
    <div class="pf-info">
      <span class="skeleton pf-avatar-sk"></span>
      <div class="pf-info-text">
        <span class="skeleton" style="width:220px;height:36px"></span>
        <span class="skeleton" style="width:180px;height:16px;margin-top:12px"></span>
        <span class="skeleton" style="width:100%;max-width:420px;height:14px;margin-top:16px"></span>
        <span class="skeleton" style="width:80%;max-width:360px;height:14px;margin-top:8px"></span>
        <span class="skeleton" style="width:230px;height:72px;margin-top:28px;border-radius:16px"></span>
      </div>
    </div>
    <div class="pf-cover-col"><span class="skeleton pf-cover-sk"></span></div>
  </section>
  <div class="pf-tabs-wrap"><div class="pf-tabs"><span class="skeleton" style="width:240px;height:20px;margin:14px 0"></span></div></div>
  <section class="pf-panel"><div class="pf-sk-grid">${Array.from({ length: 6 }, (_, i) => `<span class="skeleton" style="height:${[260, 340, 200, 300, 220, 280][i]}px"></span>`).join("")}</div></section>`;

const shortDate = (d?: string) => {
  if (!d) return "";
  const t = new Date(d.replace(" ", "T"));
  return Number.isNaN(t.getTime())
    ? ""
    : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(
        t,
      );
};

/** Grid tile; class photos show the date + who is in it on hover. */
const tile = (p: Photo, i: number) => {
  const tags = p.local ? [] : photoTags(p.id);
  const date = p.local ? "" : shortDate(photoExif(p.id).date);
  const info =
    date || tags.length
      ? `<span class="pf-tile-info">${date ? `<span>${icon("calendar", 12)} ${date}</span>` : "<span></span>"}${
          tags.length
            ? `<span class="pf-tile-people">${tags
                .slice(0, 3)
                .map((t) => `<img src="${studentAvatar(t.student)}" alt="">`)
                .join("")}${tags.length > 3 ? `<b>+${tags.length - 3}</b>` : ""}</span>`
            : ""
        }</span>`
      : "";
  return `<button class="pf-tile" type="button" data-view="${i}" style="aspect-ratio:${p.w}/${p.h}" aria-label="เปิดรูป ${i + 1}${tags.length ? ` · ${tags.length} คนในรูป` : ""}"><img src="${photoSrc(p)}" alt="" loading="lazy" decoding="async">${info}</button>`;
};

/**
 * Masonry photo grid that appends photos in batches as you scroll.
 * Clicking a tile opens the viewer over the whole list.
 */
export function mountMasonry(
  host: HTMLElement,
  photos: Photo[],
  api: PageApi,
  caption: (p: Photo) => string,
  opts: { cols?: number } = {},
) {
  const auto = innerWidth < 1100 ? 2 : 3;
  const cols = Math.max(1, Math.min(innerWidth < 640 ? 2 : 5, opts.cols ?? auto));
  host.innerHTML = `<div class="pf-masonry" style="--cols:${cols}">${Array.from({ length: cols }, () => `<div class="pf-mcol"></div>`).join("")}</div><div class="pf-more-sentinel"></div>`;
  const colEls = [...host.querySelectorAll<HTMLElement>(".pf-mcol")];
  const heights = Array.from({ length: cols }, () => 0);
  const sentinel = host.querySelector<HTMLElement>(".pf-more-sentinel")!;
  let shown = 0;
  const BATCH = 45;
  const addBatch = () => {
    const end = Math.min(photos.length, shown + BATCH);
    for (let i = shown; i < end; i++) {
      const p = photos[i];
      const c = heights.indexOf(Math.min(...heights));
      heights[c] += p.h / p.w + 0.05;
      colEls[c].insertAdjacentHTML("beforeend", tile(p, i));
    }
    shown = end;
    sentinel.textContent =
      shown < photos.length
        ? `กำลังโหลด… ${shown}/${photos.length}`
        : photos.length > BATCH
          ? `ครบทั้ง ${photos.length} รูปแล้ว`
          : "";
    if (shown >= photos.length) io.disconnect();
  };
  const io = new IntersectionObserver((en) => en.some((e) => e.isIntersecting) && addBatch(), {
    rootMargin: "800px 0px",
  });
  addBatch();
  io.observe(sentinel);
  api.onDispose(() => io.disconnect());
  host.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-view]");
    if (!t) return;
    api.openViewer(
      photos.map((p) => ({ kind: "photo", photo: p, caption: caption(p) })),
      Number(t.dataset.view),
    );
  });
}

/** Grid of video cards (Drive thumbnails); click plays the Drive embed in the viewer. */
export function mountVideos(host: HTMLElement, videos: Video[], api: PageApi) {
  host.innerHTML = videos.length
    ? `<div class="pf-video-grid">${videos
        .map(
          (v, i) => `<button class="pf-video" type="button" data-video="${i}">
            <span class="pf-video-thumb">${v.thumb ? `<img src="${thumb(v.id)}" alt="" loading="lazy">` : ""}<span class="pf-play">${icon("play", 22)}</span></span>
            <span class="pf-video-name">${esc(v.name.replace(/\.[^.]+$/, ""))}</span>
          </button>`,
        )
        .join("")}</div>`
    : `<p class="pf-empty">ยังไม่มีวิดีโอในอัลบั้มนี้</p>`;
  host.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-video]");
    if (!t) return;
    api.openViewer(
      videos.map((v) => ({ kind: "video", video: v, caption: v.name })),
      Number(t.dataset.video),
    );
  });
}

/* ----------------------------- page ----------------------------- */

function header(cfg: ProfileConfig, tab: string) {
  return `
  <div class="pf-topbar">
    <nav class="pf-crumbs" aria-label="Breadcrumb"><a href="/" data-link>${logoMark(16)}</a>${cfg.crumbs
      .map(
        (c) =>
          `${icon("chevronRight", 12)}${c.href ? `<a href="${c.href}" data-link>${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`}`,
      )
      .join("")}</nav>
    <div class="pf-top-right">
      ${cfg.topNav ?? ""}
      <div class="pf-more-wrap">
        <button class="pf-more" type="button" aria-label="More" aria-haspopup="menu" data-more>${icon("more", 20)}</button>
        <div class="pf-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-share>${icon("share", 16)} คัดลอกลิงก์หน้านี้</button>
          <a role="menuitem" href="/#classmates" data-link>${icon("users", 16)} ดูเพื่อนทั้งห้อง</a>
        </div>
      </div>
    </div>
  </div>
  <section class="pf-head">
    <div class="pf-info">
      ${(() => {
        const img = `<img class="pf-avatar${cfg.avatarShape === "square" ? " is-square" : ""}" src="${cfg.avatar}" alt="">`;
        return hasCrown(cfg.badges)
          ? `<span class="pf-avatar-box">${img}${crownSvg()}</span>`
          : img;
      })()}
      <div class="pf-info-text">
        <h1>${esc(cfg.name)}${cfg.nameBadge ? ` <span class="pf-emoji" aria-hidden="true">${esc(cfg.nameBadge)}</span>` : ""}</h1>
        ${badgeRow(cfg.badges, "pf-roles")}
        <div class="pf-handle">${esc(cfg.handle)} <span class="pf-dot">•</span> <span class="pf-followers">${cfg.handleNote}</span></div>
        <p class="pf-bio">${esc(cfg.bio)}</p>
        ${cfg.lines.map((l) => `<div class="pf-line">${icon(l.icon, 16)}<span>${l.html}</span></div>`).join("")}
        <button class="pf-clients pf-friends" type="button" data-clients aria-label="เพื่อนในห้อง">
          ${cfg.stack.avatars.map((a) => `<img class="pf-friend" src="${a}" alt="">`).join("")}
          <span class="pf-client more">+${cfg.stack.more}</span>
        </button>
        <div class="pf-stats">${cfg.stats.map((s) => `<div><b>${s.value}</b><span>${esc(s.label)}</span></div>`).join("")}</div>
        <button class="pf-follow" type="button" data-follow aria-pressed="false">${icon("heart", 18)}<span>${esc(cfg.follow[0])}</span></button>
      </div>
    </div>
    <div class="pf-cover-col">
      <div class="pf-cover">${cfg.covers.map((c, i) => `<img src="${c}" alt="" class="${i === 0 ? "is-on" : ""}">`).join("")}</div>
      <div class="pf-tags">
        ${cfg.tags.map((t) => `<span class="chip pf-tag">${icon(t.icon, 18)}${esc(t.label)}</span>`).join("")}
        ${
          cfg.moreTags?.length
            ? `<span class="pf-tag-extra" hidden>${cfg.moreTags.map((t) => `<span class="chip pf-tag">${esc(t)}</span>`).join("")}</span><button class="chip pf-tag pf-tag-more" type="button" data-more-tags>+${cfg.moreTags.length}</button>`
            : ""
        }
      </div>
    </div>
  </section>
  <div class="pf-tabs-wrap">
    <div class="pf-tabs" role="tablist">${cfg.tabs
      .map(
        (t) =>
          `<button type="button" role="tab" class="pf-tab${t.key === tab ? " is-active" : ""}" data-tab="${t.key}" aria-selected="${t.key === tab}">${esc(t.label)}${t.count != null ? `<span class="pf-tab-count">${t.count.toLocaleString()}</span>` : ""}</button>`,
      )
      .join("")}</div>
  </div>
  <section class="pf-panel" data-panel></section>`;
}

const classmatesModal = () => `
  <div class="pf-modal" hidden role="dialog" aria-modal="true" aria-labelledby="pf-mates-title">
    <div class="pf-modal-backdrop" data-m-close></div>
    <div class="pf-modal-card">
      <header><h2 id="pf-mates-title">เพื่อน ${CLASS.name} ทั้ง ${students.length} คน</h2><button type="button" data-m-close aria-label="ปิด">${icon("close", 20)}</button></header>
      <div class="pf-modal-body pf-mates">
        ${students
          .map(
            (s) =>
              `<a class="pf-client-row" href="${profileUrl(s)}" data-link><img class="pf-mate-avatar" src="${studentAvatar(s)}" alt=""><div><b>${esc(s.nickname)}</b><span>เลขที่ ${s.no}${s.isPlaceholder ? "" : ` · ${esc(s.fullName)}`}</span></div></a>`,
          )
          .join("")}
      </div>
    </div>
  </div>`;

export function renderProfilePage(root: HTMLElement, cfg: ProfileConfig | null): Cleanup {
  document.body.className = "page-profile";
  document.title = cfg ? cfg.docTitle : `ไม่พบหน้านี้ · ${BRAND}`;
  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main" id="pf-main">${skeleton()}</main></div>`;
  const main = root.querySelector<HTMLElement>("#pf-main")!;
  applyTheme(main, cfg?.theme);
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
  const cleanup = () => {
    alive = false;
    timers.forEach(clearTimeout);
    disposers.forEach((d) => d());
  };
  // dark profile theme: darken the whole page (rail, tab bar, menus), not just the main panel
  const html = document.documentElement;
  html.classList.toggle("pf-dark", main.classList.contains("th-dark"));
  disposers.push(() => html.classList.remove("pf-dark"));

  if (!cfg) {
    later(() => {
      main.innerHTML = `<div class="pf-404"><h1>ไม่พบหน้านี้</h1><p>ลิงก์อาจผิด หรือหน้านี้ถูกลบไปแล้ว</p><a class="btn-outline" href="/" data-link>กลับหน้าแรก</a></div>`;
    }, 300);
    return cleanup;
  }

  // Loading: wait for the avatar + first cover (min 400ms so the skeleton doesn't flash).
  const preload = (src: string) =>
    new Promise<void>((res) => {
      const im = new Image();
      im.onload = im.onerror = () => res();
      im.src = src;
    });
  const started = performance.now();
  void Promise.race([
    Promise.all(cfg.preload.map(preload)),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => later(mount, Math.max(0, 400 - (performance.now() - started))));

  function mount() {
    const c = cfg!;
    const keys = c.tabs.map((t) => t.key);
    const q = new URLSearchParams(location.search).get("tab");
    let tab = q && keys.includes(q) ? q : keys[0];
    main.innerHTML = header(c, tab);
    main.classList.add("is-mounted");
    root.querySelector(".pf-app")!.insertAdjacentHTML("beforeend", classmatesModal());

    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
    let panelEl = $("[data-panel]");

    const api: PageApi = {
      openViewer,
      setTab: (k) => setTab(k),
      toast,
      later,
      onDispose: (fn) => disposers.push(fn),
    };

    let panelDisposers: (() => void)[] = [];
    function renderPanel() {
      panelDisposers.forEach((d) => d());
      panelDisposers = [];
      const t = c.tabs.find((x) => x.key === tab)!;
      const fresh = panelEl.cloneNode(false) as HTMLElement; // drop old listeners
      panelEl.replaceWith(fresh);
      panelEl = fresh;
      fresh.innerHTML = t.render();
      fresh.classList.add("is-in");
      t.mount?.(fresh, { ...api, onDispose: (fn) => panelDisposers.push(fn) });
    }
    disposers.push(() => panelDisposers.forEach((d) => d()));
    renderPanel();

    function setTab(t: string) {
      if (t === tab || !keys.includes(t)) return;
      tab = t;
      root.querySelectorAll<HTMLElement>(".pf-tab").forEach((b) => {
        const on = b.dataset.tab === t;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      const url = new URL(location.href);
      if (t === keys[0]) url.searchParams.delete("tab");
      else url.searchParams.set("tab", t);
      history.replaceState({}, "", url.pathname + url.search);
      renderPanel();
      const tabsTop = $(".pf-tabs-wrap").offsetTop;
      if (main.scrollTop > tabsTop) main.scrollTo({ top: tabsTop });
    }

    // cover slideshow
    const covers = [...root.querySelectorAll<HTMLImageElement>(".pf-cover img")];
    let ci = 0;
    if (covers.length > 1) {
      const id = window.setInterval(() => {
        covers[ci].classList.remove("is-on");
        ci = (ci + 1) % covers.length;
        covers[ci].classList.add("is-on");
      }, 4500);
      disposers.push(() => clearInterval(id));
    }

    // viewer (photos with face tags + details panel, Drive videos)
    const viewer = createViewer(root.querySelector<HTMLElement>(".pf-app")!, later);
    disposers.push(viewer.dispose);
    function openViewer(list: MediaItem[], i: number, opts?: { slideshow?: boolean }) {
      viewer.open(list, i, opts);
    }

    // classmates modal
    const m = $(".pf-modal");
    const openModal = () => {
      m.hidden = false;
      requestAnimationFrame(() => m.classList.add("is-open"));
    };
    const closeModal = () => {
      m.classList.remove("is-open");
      later(() => (m.hidden = true), 250);
    };

    const menu = $(".pf-menu");
    function toast(msg: string) {
      const t = document.createElement("div");
      t.className = "pf-toast";
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("is-on"));
      setTimeout(() => {
        t.classList.remove("is-on");
        setTimeout(() => t.remove(), 300);
      }, 1800);
    }

    let liked = false;
    function onClick(e: MouseEvent) {
      const t = e.target as Element;
      const tabBtn = t.closest<HTMLElement>("[data-tab]");
      if (tabBtn) return setTab(tabBtn.dataset.tab!);
      const follow = t.closest<HTMLElement>("[data-follow]");
      if (follow) {
        liked = !liked;
        follow.classList.toggle("is-following", liked);
        follow.setAttribute("aria-pressed", String(liked));
        follow.innerHTML = `${icon(liked ? "check" : "heart", 18)}<span>${esc(c.follow[liked ? 1 : 0])}</span>`;
        return;
      }
      if (t.closest(".vw")) return; // the viewer handles its own clicks
      if (t.closest("[data-clients]")) return openModal();
      if (t.closest("[data-m-close]")) return closeModal();
      if (t.closest(".pf-modal a")) closeModal();
      if (t.closest("[data-more-tags]")) {
        const extra = $(".pf-tag-extra");
        extra.hidden = !extra.hidden;
        $("[data-more-tags]").textContent = extra.hidden ? `+${c.moreTags!.length}` : "ซ่อน";
        return;
      }
      if (t.closest("[data-more]")) {
        menu.hidden = !menu.hidden;
        return;
      }
      if (t.closest("[data-share]")) {
        navigator.clipboard?.writeText(location.origin + location.pathname).catch(() => {});
        menu.hidden = true;
        return toast("คัดลอกลิงก์แล้ว");
      }
      if (!t.closest(".pf-more-wrap")) menu.hidden = true;
    }
    root.addEventListener("click", onClick);
    disposers.push(() => root.removeEventListener("click", onClick));

    const onKey = (e: KeyboardEvent) => {
      if (viewer.onKey(e)) return;
      if (!m.hidden && e.key === "Escape") closeModal();
      else if (e.key === "Escape") menu.hidden = true;
    };
    window.addEventListener("keydown", onKey);
    disposers.push(() => window.removeEventListener("keydown", onKey));

    const tabsWrap = $(".pf-tabs-wrap");
    main.addEventListener(
      "scroll",
      () => tabsWrap.classList.toggle("is-stuck", main.scrollTop > tabsWrap.offsetTop - 1),
      { passive: true },
    );
  }

  return () => {
    cleanup();
    document.documentElement.classList.remove("has-viewer");
  };
}
