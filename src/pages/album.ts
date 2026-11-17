import {
  BRAND,
  CLASS,
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
  type Album,
  type Photo,
} from "../data.ts";
import { myNo } from "../lib/api.ts";
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

  // who is in how many photos of this album (for the friend filter)
  const tagsOf = new Map(a.photos.map((p) => [p.id, photoTags(p.id).map((t) => t.student.no)]));
  const perPerson = new Map<number, number>();
  for (const nos of tagsOf.values())
    for (const n of nos) perPerson.set(n, (perPerson.get(n) ?? 0) + 1);
  const people = students
    .filter((st) => perPerson.has(st.no))
    .sort((x, y) => perPerson.get(y.no)! - perPerson.get(x.no)!);
  const dated = a.photos.some((p) => photoExif(p.id).date);
  const DENSITY_KEY = "album-cols";
  const readCols = () => {
    try {
      return Number(localStorage.getItem(DENSITY_KEY)) || 0;
    } catch {
      return 0;
    }
  };

  const photosTab: ProfileTab = {
    key: "photos",
    label: "รูปภาพ",
    count: a.photos.length,
    render: () => {
      const me = myNo();
      return `
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
      <div class="al-tools">
        <label class="al-select">${icon("calendar", 15)}<select data-sort aria-label="เรียงรูป">
          <option value="">ลำดับในอัลบั้ม</option>
          ${dated ? `<option value="new">ใหม่ → เก่า</option><option value="old">เก่า → ใหม่</option>` : ""}
          <option value="people">คนในรูปเยอะสุด</option>
        </select></label>
        ${
          people.length
            ? `<label class="al-select">${icon("users", 15)}<select data-person aria-label="ดูรูปของเพื่อน">
          <option value="">เพื่อนทุกคน</option>
          ${me != null && perPerson.has(me) ? `<option value="${me}">รูปที่มีฉัน (${perPerson.get(me)})</option>` : ""}
          ${people.map((st) => `<option value="${st.no}">${esc(st.nickname || `เลขที่ ${st.no}`)} (${perPerson.get(st.no)})</option>`).join("")}
        </select></label>`
            : ""
        }
        <div class="al-density" role="group" aria-label="ขนาดรูป">
          ${[
            [4, "เล็ก", "grid"],
            [3, "กลาง", "image"],
            [2, "ใหญ่", "image"],
          ]
            .map(
              ([c, label, ic]) =>
                `<button type="button" data-cols="${c}" aria-pressed="false" title="รูป${label}" aria-label="รูป${label}">${icon(String(ic), c === 2 ? 18 : c === 3 ? 15 : 13)}</button>`,
            )
            .join("")}
        </div>
        <button type="button" class="al-play" data-slideshow>${icon("play", 15)} สไลด์โชว์</button>
      </div>
      <p class="al-count" data-al-count></p>
      <div class="pf-portfolio"><div data-masonry></div><aside class="pf-aside"><h2>อัลบั้มอื่น</h2>${albumRows(others)}</aside></div>`;
    },
    mount: (panel, api) => {
      let host = panel.querySelector<HTMLElement>("[data-masonry]")!;
      const state = { group: "", sort: "", person: 0, cols: readCols() };
      let list: Photo[] = a.photos;
      const time = (p: Photo) => photoExif(p.id).date ?? "";
      const compute = () => {
        let out = a.photos.filter(
          (p) =>
            (!state.group || p.group === state.group) &&
            (!state.person || (tagsOf.get(p.id) ?? []).includes(state.person)),
        );
        if (state.sort === "new" || state.sort === "old") {
          const dir = state.sort === "new" ? -1 : 1;
          out = [...out].sort((x, y) => (time(x) < time(y) ? -dir : time(x) > time(y) ? dir : 0));
        } else if (state.sort === "people")
          out = [...out].sort(
            (x, y) => (tagsOf.get(y.id)?.length ?? 0) - (tagsOf.get(x.id)?.length ?? 0),
          );
        return out;
      };
      const countEl = panel.querySelector<HTMLElement>("[data-al-count]")!;
      const redraw = () => {
        list = compute();
        // swap in a fresh grid element so old click handlers go away
        const fresh = host.cloneNode(false) as HTMLElement;
        host.replaceWith(fresh);
        host = fresh;
        const who = state.person ? students.find((x) => x.no === state.person) : null;
        countEl.textContent = `${list.length.toLocaleString()} รูป${who ? ` ที่มี ${who.nickname || `เลขที่ ${who.no}`}` : ""}${state.group ? ` · ${state.group}` : ""}`;
        if (!list.length) {
          fresh.innerHTML = `<p class="pf-empty">ไม่มีรูปที่ตรงกับตัวกรองนี้</p>`;
          return;
        }
        mountMasonry(fresh, list, api, caption, state.cols ? { cols: state.cols } : {});
      };
      const markCols = () =>
        panel
          .querySelectorAll<HTMLElement>("[data-cols]")
          .forEach((b) =>
            b.setAttribute(
              "aria-pressed",
              String(Number(b.dataset.cols) === (state.cols || (innerWidth < 1100 ? 2 : 3))),
            ),
          );
      redraw();
      markCols();
      panel.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((b) =>
        b.addEventListener("click", () => {
          panel.querySelectorAll(".pf-chip").forEach((c) => c.classList.toggle("is-on", c === b));
          state.group = b.dataset.group ?? "";
          redraw();
        }),
      );
      panel.querySelector<HTMLSelectElement>("[data-sort]")?.addEventListener("change", (e) => {
        state.sort = (e.target as HTMLSelectElement).value;
        redraw();
      });
      panel.querySelector<HTMLSelectElement>("[data-person]")?.addEventListener("change", (e) => {
        state.person = Number((e.target as HTMLSelectElement).value) || 0;
        redraw();
      });
      panel.querySelector(".al-density")!.addEventListener("click", (e) => {
        const b = (e.target as Element).closest<HTMLElement>("[data-cols]");
        if (!b) return;
        state.cols = Number(b.dataset.cols);
        try {
          localStorage.setItem(DENSITY_KEY, String(state.cols));
        } catch {
          /* ignore */
        }
        markCols();
        redraw();
      });
      const items = () =>
        list.map((p) => ({ kind: "photo" as const, photo: p, caption: caption(p) }));
      panel.querySelector("[data-slideshow]")!.addEventListener("click", () => {
        if (list.length) api.openViewer(items(), 0, { slideshow: true });
      });
      // shared link: /album/<slug>#photo=<id>
      const deep = decodeURIComponent(location.hash.match(/^#photo=([\w-]+)/)?.[1] ?? "");
      const at = deep ? list.findIndex((p) => p.id === deep) : -1;
      if (at >= 0) api.later(() => api.openViewer(items(), at), 300);
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
