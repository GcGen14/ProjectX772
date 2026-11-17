import {
  BRAND,
  CLASS,
  albums,
  driveFolder,
  featured,
  getAlbum,
  large,
  students,
  studentAvatar,
  thumb,
  type Album,
  type Photo,
} from "../data.ts";
import { icon } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { mountMasonry, mountVideos, renderProfilePage, type ProfileTab } from "./profile.ts";

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

/** Cards linking to albums (used on album "others" aside and on student pages). */
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

export function renderAlbum(root: HTMLElement, slug: string): Cleanup {
  const a = getAlbum(slug);
  if (!a) return renderProfilePage(root, null);
  const others = albums.filter((x) => x !== a);
  const feat = featured(a);
  const landscape = feat.filter((p) => p.w >= p.h);
  const first = albumCover(a);
  const pool = landscape.length >= 2 ? landscape : feat;
  const covers = (first ? [first, ...pool.filter((p) => p !== first)] : pool)
    .slice(0, 5)
    .map(large);
  if (!covers.length)
    a.videos
      .filter((v) => v.thumb)
      .slice(0, 4)
      .forEach((v) => covers.push(thumb(v.id)));
  const caption = (p: Photo) => (p.group && a.groups.length ? `${a.title} · ${p.group}` : a.title);

  const photosTab: ProfileTab = {
    key: "photos",
    label: "รูปภาพ",
    count: a.photos.length,
    render: () => `
      ${
        a.groups.length
          ? `<div class="pf-filter" role="group" aria-label="กลุ่ม"><button type="button" class="pf-chip is-on" data-group="">ทั้งหมด <span>${a.photos.length}</span></button>${a.groups
              .map(
                (g) =>
                  `<button type="button" class="pf-chip" data-group="${esc(g)}">${esc(g)} <span>${a.photos.filter((p) => p.group === g).length}</span></button>`,
              )
              .join("")}</div>`
          : ""
      }
      <div class="pf-portfolio"><div data-masonry></div><aside class="pf-aside"><h2>อัลบั้มอื่น</h2>${albumRows(others)}</aside></div>`,
    mount: (panel, api) => {
      let host = panel.querySelector<HTMLElement>("[data-masonry]")!;
      mountMasonry(host, a.photos, api, caption);
      // group filter: swap in a fresh grid element so old click handlers go away
      panel.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((b) =>
        b.addEventListener("click", () => {
          panel.querySelectorAll(".pf-chip").forEach((c) => c.classList.toggle("is-on", c === b));
          const fresh = host.cloneNode(false) as HTMLElement;
          host.replaceWith(fresh);
          host = fresh;
          const g = b.dataset.group;
          mountMasonry(fresh, g ? a.photos.filter((p) => p.group === g) : a.photos, api, caption);
        }),
      );
    },
  };

  const videosTab: ProfileTab = {
    key: "videos",
    label: "วิดีโอ",
    count: a.videos.length,
    render: () => `<div data-videos></div>`,
    mount: (panel, api) =>
      mountVideos(panel.querySelector<HTMLElement>("[data-videos]")!, a.videos, api),
  };

  const aboutTab: ProfileTab = {
    key: "about",
    label: "เกี่ยวกับ",
    render: () => `<div class="pf-about">
      <div class="pf-about-main">
        <h2>${esc(a.title)} <span class="muted">· ${esc(a.en)}</span></h2>
        <p>${esc(a.about)}</p>
        <h3>แท็ก</h3>
        <div class="pf-skill-list">${a.tags.map((t) => `<span class="chip">${esc(t.label)}</span>`).join("")}${a.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</div>
      </div>
      <aside class="pf-about-card">
        <div><span>${icon("image", 18)} รูปภาพ</span><b>${a.photos.length.toLocaleString()}</b></div>
        <div><span>${icon("video", 18)} วิดีโอ</span><b>${a.videos.length}</b></div>
        <div><span>${icon("home", 18)} ห้อง</span><b>${CLASS.name} · ${CLASS.gen}</b></div>
        <div><span>${icon("clock", 18)} ซิงก์ล่าสุด</span><b>${esc(fmtSynced(a.syncedAt))}</b></div>
        <div><span>${icon("folder", 18)} ต้นฉบับ</span><b>${a.folders.map((f, i) => `<a href="${driveFolder(f)}" target="_blank" rel="noopener">Google Drive${a.folders.length > 1 ? ` ${i + 1}` : ""} ↗</a>`).join("<br>")}</b></div>
      </aside>
    </div>`,
  };

  const tabs: ProfileTab[] = [];
  if (a.photos.length) tabs.push(photosTab);
  if (a.videos.length) tabs.push(videosTab);
  if (a.videos.length > a.photos.length) tabs.reverse();
  tabs.push(aboutTab);

  return renderProfilePage(root, {
    docTitle: `${a.title} · ${BRAND}`,
    crumbs: [{ label: "อัลบั้ม", href: "/#showcase" }, { label: a.title }],
    avatar: albumCoverSrc(a),
    avatarShape: "square",
    name: a.title,
    handle: `@602 · ${a.en}`,
    handleNote: `<b>${albumCount(a)}</b>`,
    bio: a.tagline,
    lines: [
      { icon: "home", html: `${CLASS.name} · ${CLASS.gen} · ปีการศึกษา ${CLASS.year}` },
      {
        icon: "folder",
        html: `${a.groups.length ? `${a.groups.length} กลุ่ม · ` : ""}จาก Google Drive ของห้อง`,
      },
    ],
    stack: { avatars: students.slice(0, 3).map(studentAvatar), more: students.length - 3 },
    stats: [
      { value: a.photos.length.toLocaleString(), label: "รูป" },
      { value: String(a.videos.length), label: "คลิป" },
      { value: String(students.length), label: "เพื่อน" },
    ],
    follow: ["ถูกใจอัลบั้มนี้", "ถูกใจแล้ว"],
    covers,
    tags: a.tags,
    moreTags: a.groups,
    preload: [covers[0]].filter(Boolean),
    tabs,
  });
}

function fmtSynced(v: string | undefined) {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
