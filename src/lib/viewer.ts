// Full-screen photo/video viewer with details panel and face tags.
import {
  albumOfPhoto,
  applyPhotoData,
  driveFile,
  driveFull,
  driveVideo,
  photoExif,
  photoInfo,
  photoSrc,
  photoTags,
  portraitOwner,
  students,
  studentAvatar,
  type Photo,
  type PhotoTag,
  type Video,
  profileUrl,
} from "../data.ts";
import { api, myNo, session } from "./api.ts";
import { icon } from "./icons.ts";
import { esc } from "./router.ts";

export type MediaItem =
  | { kind: "photo"; photo: Photo; caption?: string }
  | { kind: "video"; video: Video; caption?: string };

const fmtDate = (d: string) => {
  const date = new Date(d.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return d;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short" }).format(date);
};
const isAdmin = () => !!session.user && "admin" in session.user;
const nameOf = (no: number | null) =>
  no === 0 ? "ผู้ดูแล" : (students.find((s) => s.no === no)?.nickname ?? `เลขที่ ${no}`);

export function createViewer(host: HTMLElement, later: (fn: () => void, ms: number) => void) {
  host.insertAdjacentHTML(
    "beforeend",
    `<div class="vw" hidden role="dialog" aria-modal="true" aria-label="ดูรูป">
      <div class="vw-media" data-media>
        <button class="vw-btn vw-close" type="button" data-vw-close aria-label="ปิด">${icon("close", 22)}</button>
        <button class="vw-btn vw-nav prev" type="button" data-vw-step="-1" aria-label="ก่อนหน้า">${icon("chevronLeft", 26)}</button>
        <div class="vw-stage" data-stage></div>
        <button class="vw-btn vw-nav next" type="button" data-vw-step="1" aria-label="ถัดไป">${icon("chevronRight", 26)}</button>
        <div class="vw-bar"><span data-count></span><button class="vw-chip" type="button" data-tagtoggle aria-pressed="false" title="แสดง/ซ่อนแท็ก (T)">${icon("users", 14)} แท็ก</button></div>
      </div>
      <aside class="vw-side" data-side aria-live="polite"></aside>
    </div>`,
  );
  const v = host.querySelector<HTMLElement>(".vw:last-of-type")!;
  const stage = v.querySelector<HTMLElement>("[data-stage]")!;
  const side = v.querySelector<HTMLElement>("[data-side]")!;
  const count = v.querySelector<HTMLElement>("[data-count]")!;
  const toggle = v.querySelector<HTMLButtonElement>("[data-tagtoggle]")!;
  let items: MediaItem[] = [];
  let vi = 0;
  let showTags = false;
  let editing = false;

  /* ---------------- media ---------------- */
  function fit() {
    const box = stage.querySelector<HTMLElement>(".vw-photo");
    const it = items[vi];
    if (!box || !it || it.kind !== "photo") return;
    const aw = stage.clientWidth;
    const ah = stage.clientHeight;
    const r = it.photo.w / it.photo.h;
    const w = Math.min(aw, ah * r);
    box.style.width = `${Math.round(w)}px`;
    box.style.height = `${Math.round(w / r)}px`;
    layoutLabels();
  }

  /**
   * Place name labels so they don't pile up on crowded photos: try below the face, then above;
   * keep them inside the photo; if both spots collide, hide that label until hovered.
   * Bigger (closer) faces get first pick. Re-runs on every resize, so it adapts to screen width.
   */
  function layoutLabels() {
    const photo = stage.querySelector<HTMLElement>(".vw-photo");
    if (!photo) return;
    const pr = photo.getBoundingClientRect();
    const boxes = [...photo.querySelectorAll<HTMLElement>(".vw-box")].sort(
      (a, b) => b.offsetWidth - a.offsetWidth,
    );
    const placed: DOMRect[] = [];
    const collides = (r: DOMRect) =>
      placed.some(
        (p) =>
          r.left < p.right - 2 &&
          r.right > p.left + 2 &&
          r.top < p.bottom - 1 &&
          r.bottom > p.top + 1,
      );
    for (const b of boxes) {
      const lab = b.querySelector<HTMLElement>(".vw-label")!;
      b.classList.remove("is-crowded");
      let ok = false;
      for (const above of [false, true]) {
        lab.classList.toggle("is-above", above);
        lab.style.translate = "";
        let r = lab.getBoundingClientRect();
        // nudge back inside the photo's left/right edges
        const dx =
          r.left < pr.left + 4
            ? pr.left + 4 - r.left
            : r.right > pr.right - 4
              ? pr.right - 4 - r.right
              : 0;
        if (dx) {
          lab.style.translate = `calc(-50% + ${Math.round(dx)}px) ${above ? "-6px" : "6px"}`;
          r = lab.getBoundingClientRect();
        }
        if (!collides(r)) {
          placed.push(r);
          ok = true;
          break;
        }
      }
      if (!ok) {
        lab.classList.remove("is-above");
        lab.style.translate = "";
        b.classList.add("is-crowded");
      }
    }
  }

  function boxesHtml(tags: PhotoTag[]) {
    return tags
      .filter((t) => t.box)
      .map((t) => {
        // face boxes are tight; grow them a little so the frame sits around the head
        const [x, y, w, h] = t.box!;
        const g = 0.18;
        const L = Math.max(0, x - w * g);
        const T = Math.max(0, y - h * g);
        const W = Math.min(1 - L, w * (1 + 2 * g));
        const H = Math.min(1 - T, h * (1 + 2 * g));
        const s = t.student;
        return `<a class="vw-box" href="${profileUrl(s)}" data-link data-tag-no="${s.no}" style="left:${L * 100}%;top:${T * 100}%;width:${W * 100}%;height:${H * 100}%" aria-label="${esc(s.nickname)}">
          <span class="vw-label"><img src="${studentAvatar(s)}" alt=""><span class="vw-label-name">${esc(s.nickname)}</span></span></a>`;
      })
      .join("");
  }

  function renderMedia() {
    const it = items[vi];
    const idx = vi;
    if (it.kind === "photo") {
      const tags = it.photo.local ? [] : photoTags(it.photo.id);
      stage.innerHTML = `<div class="vw-photo"><img alt="" src="${photoSrc(it.photo)}"><div class="vw-boxes">${boxesHtml(tags)}</div></div>`;
      const img = stage.querySelector("img")!;
      const hi = new Image();
      hi.onload = () => {
        if (vi === idx) img.src = hi.src;
      };
      hi.src = driveFull(it.photo.id);
      fit();
      toggle.hidden = !tags.some((t) => t.box);
    } else {
      stage.innerHTML = `<iframe class="vw-video" src="${driveVideo(it.video.id)}" allow="autoplay; fullscreen" allowfullscreen title="${esc(it.video.name)}"></iframe>`;
      toggle.hidden = true;
    }
    count.textContent = `${vi + 1} / ${items.length}`;
  }

  /* ---------------- details panel ---------------- */
  function renderSide(msg = "") {
    const it = items[vi];
    if (it.kind === "video") {
      const album = albumOfVideo(it.video.id);
      side.innerHTML = `
        ${album ? `<a class="vw-album" href="/album/${album.slug}" data-link>${icon("video", 16)} ${esc(album.title)}</a>` : ""}
        <h3 class="vw-title">${esc(it.video.name.replace(/\.[^.]+$/, ""))}</h3>
        <p class="vw-muted">วิดีโอเล่นผ่าน Google Drive</p>
        <a class="vw-link" href="${driveFile(it.video.id)}" target="_blank" rel="noopener">${icon("arrowUpRight", 14)} เปิดใน Google Drive</a>`;
      return;
    }
    const p = it.photo;
    // studio portrait: owner only, no editing
    if (p.local) {
      const owner = portraitOwner(p.id);
      side.innerHTML = `
        <span class="vw-album">${icon("camera", 16)} รูปเดี่ยว · ถ่ายรูปรุ่น</span>
        ${owner ? peopleHtml([{ student: owner, box: null, manual: false }], false) : ""}
        <a class="vw-link" href="${driveFile(p.id)}" target="_blank" rel="noopener">${icon("arrowUpRight", 14)} เปิดใน Google Drive</a>`;
      return;
    }
    const album = albumOfPhoto(p.id);
    const exif = photoExif(p.id);
    const info = photoInfo(p.id);
    const tags = photoTags(p.id);
    const me = myNo();
    const meTagged = me != null && tags.some((t) => t.student.no === me);
    const canEdit = me != null || isAdmin();
    const gps =
      exif.lat != null && exif.lon != null ? `${exif.lat.toFixed(5)},${exif.lon.toFixed(5)}` : "";
    const where = info?.location || "";

    side.innerHTML = `
      ${album ? `<a class="vw-album" href="/album/${album.slug}" data-link>${icon("image", 16)} ${esc(album.title)}${p.group && album.groups.length ? ` · ${esc(p.group)}` : ""}</a>` : ""}
      <div class="vw-meta">
        ${exif.date ? `<span>${icon("calendar", 14)} ${esc(fmtDate(exif.date))}</span>` : ""}
        ${exif.camera ? `<span>${icon("camera", 14)} ${esc(exif.camera)}</span>` : ""}
      </div>
      ${
        editing
          ? `<form class="vw-edit" data-edit>
              <label><span>คำบรรยาย</span><textarea name="caption" maxlength="500" rows="4" placeholder="รูปนี้คือ… (กิจกรรม / เกิดอะไรขึ้น)">${esc(info?.caption ?? "")}</textarea></label>
              <label><span>สถานที่</span><input name="location" maxlength="120" value="${esc(where)}" placeholder="เช่น หอประชุม, สนามฟุตบอล"></label>
              <div class="vw-row"><button class="vw-primary" type="submit">บันทึก</button><button class="vw-ghost" type="button" data-cancel>ยกเลิก</button></div>
            </form>`
          : `<p class="vw-desc${info?.caption ? "" : " is-empty"}">${info?.caption ? esc(info.caption) : "ยังไม่มีคำบรรยาย"}</p>
             ${
               where || gps
                 ? `<p class="vw-loc">${icon("pin", 15)} <span>${esc(where || "มีพิกัดในรูป")}</span>${gps ? ` <a href="https://www.google.com/maps?q=${gps}" target="_blank" rel="noopener">ดูแผนที่</a>` : ""}</p>`
                 : ""
             }`
      }
      ${peopleHtml(tags, isAdmin())}
      <div class="vw-actions">
        ${
          me != null
            ? meTagged
              ? `<button class="vw-ghost" type="button" data-tag-action="remove" data-no="${me}">${icon("close", 14)} นี่ไม่ใช่ฉัน — ลบแท็กฉัน</button>`
              : `<button class="vw-primary" type="button" data-tag-action="add" data-no="${me}">${icon("plus", 14)} มีฉันอยู่ในรูปนี้ — แท็กฉัน</button>`
            : ""
        }
        ${
          isAdmin()
            ? `<div class="vw-row"><select data-admin-add aria-label="เพิ่มแท็กเพื่อน"><option value="">+ แท็กเพื่อน…</option>${students
                .filter((s) => !tags.some((t) => t.student.no === s.no))
                .map((s) => `<option value="${s.no}">${s.no} · ${esc(s.nickname)}</option>`)
                .join("")}</select></div>`
            : ""
        }
        ${canEdit && !editing ? `<button class="vw-ghost" type="button" data-edit-open>${icon("pen", 14)} ${info?.caption || where ? "แก้ไขคำบรรยาย / สถานที่" : "เขียนคำบรรยาย / สถานที่"}</button>` : ""}
        ${!canEdit ? `<a class="vw-link" href="/me" data-link>${icon("user", 14)} เข้าสู่ระบบเพื่อแท็กตัวเองหรือเขียนคำบรรยาย</a>` : ""}
      </div>
      ${msg ? `<p class="vw-msg">${esc(msg)}</p>` : ""}
      <footer class="vw-foot">
        ${info?.updatedAt ? `<span>แก้ไขล่าสุดโดย ${esc(nameOf(info.updatedBy))}</span>` : ""}
        <a href="${driveFile(p.id)}" target="_blank" rel="noopener">${icon("arrowUpRight", 13)} เปิดใน Google Drive</a>
      </footer>`;
  }

  function peopleHtml(tags: PhotoTag[], admin: boolean) {
    return `<section class="vw-people">
      <h4>คนในรูป <span>${tags.length}</span></h4>
      ${
        tags.length
          ? `<ul>${tags
              .map(
                (t) => `<li data-person="${t.student.no}">
                  <a href="${profileUrl(t.student)}" data-link><img src="${studentAvatar(t.student)}" alt=""><span><b>${esc(t.student.nickname)}</b><small>เลขที่ ${t.student.no}${t.manual ? " · แท็กเอง" : t.box ? "" : ""}</small></span></a>
                  ${admin ? `<button class="vw-x" type="button" data-tag-action="remove" data-no="${t.student.no}" aria-label="ลบแท็ก ${esc(t.student.nickname)}">${icon("close", 12)}</button>` : ""}
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="vw-muted">ยังไม่พบเพื่อนในรูปนี้</p>`
      }
    </section>`;
  }

  function albumOfVideo(id: string) {
    return albumOfPhoto(id) ?? undefined;
  }

  /* ---------------- actions ---------------- */
  async function tag(no: number, action: "add" | "remove") {
    const it = items[vi];
    if (it.kind !== "photo") return;
    try {
      applyPhotoData(await api.tagPhoto(it.photo.id, no, action));
      renderMedia();
      renderSide(action === "add" ? "แท็กแล้ว ✓" : "ลบแท็กแล้ว");
    } catch (e) {
      renderSide((e as Error).message);
    }
  }

  v.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-vw-close]") || t === v || t.matches(".vw-media, .vw-stage"))
      return close();
    const step = t.closest<HTMLElement>("[data-vw-step]");
    if (step) return show(vi + Number(step.dataset.vwStep));
    if (t.closest("[data-tagtoggle]")) return setTagsVisible(!showTags);
    const ta = t.closest<HTMLElement>("[data-tag-action]");
    if (ta) return void tag(Number(ta.dataset.no), ta.dataset.tagAction as "add" | "remove");
    if (t.closest("[data-edit-open]")) {
      editing = true;
      renderSide();
      side.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      return;
    }
    if (t.closest("[data-cancel]")) {
      editing = false;
      return renderSide();
    }
    if (t.closest("a[data-link]")) close();
  });
  v.addEventListener("change", (e) => {
    const sel = (e.target as Element).closest<HTMLSelectElement>("[data-admin-add]");
    if (sel?.value) void tag(Number(sel.value), "add");
  });
  v.addEventListener("submit", async (e) => {
    const form = (e.target as Element).closest<HTMLFormElement>("[data-edit]");
    const it = items[vi];
    if (!form || it.kind !== "photo") return;
    e.preventDefault();
    const caption = (form.elements.namedItem("caption") as HTMLTextAreaElement).value;
    const location = (form.elements.namedItem("location") as HTMLInputElement).value;
    try {
      applyPhotoData(await api.savePhoto(it.photo.id, caption, location));
      editing = false;
      renderSide("บันทึกแล้ว ✓");
    } catch (ex) {
      renderSide((ex as Error).message);
    }
  });
  // hovering a name in the list highlights that face in the photo
  side.addEventListener("pointerover", (e) => {
    const li = (e.target as Element).closest<HTMLElement>("[data-person]");
    stage
      .querySelectorAll(".vw-box")
      .forEach((b) =>
        b.classList.toggle(
          "is-hot",
          !!li && (b as HTMLElement).dataset.tagNo === li.dataset.person,
        ),
      );
  });
  side.addEventListener("pointerleave", () =>
    stage.querySelectorAll(".vw-box").forEach((b) => b.classList.remove("is-hot")),
  );

  function setTagsVisible(on: boolean) {
    showTags = on;
    v.classList.toggle("show-tags", on);
    toggle.setAttribute("aria-pressed", String(on));
  }

  function show(i: number) {
    vi = (i + items.length) % items.length;
    editing = false;
    renderMedia();
    renderSide();
  }

  function open(list: MediaItem[], i: number) {
    items = list;
    v.hidden = false;
    // touch screens can't hover, so start with name tags visible there
    if (matchMedia("(hover: none)").matches) setTagsVisible(true);
    document.documentElement.classList.add("has-viewer");
    show(i);
    requestAnimationFrame(() => {
      fit();
      v.classList.add("is-open");
    });
  }

  function close() {
    v.classList.remove("is-open");
    document.documentElement.classList.remove("has-viewer");
    later(() => {
      v.hidden = true;
      stage.innerHTML = "";
    }, 250);
  }

  const onResize = () => !v.hidden && fit();
  window.addEventListener("resize", onResize);

  /** returns true when the viewer handled the key */
  function onKey(e: KeyboardEvent): boolean {
    if (v.hidden) return false;
    const typing = (e.target as Element | null)?.closest("input, textarea, select");
    if (e.key === "Escape") {
      if (editing) {
        editing = false;
        renderSide();
      } else close();
      return true;
    }
    if (typing) return true;
    if (e.key === "ArrowRight") show(vi + 1);
    else if (e.key === "ArrowLeft") show(vi - 1);
    else if (e.key.toLowerCase() === "t") setTagsVisible(!showTags);
    return true;
  }

  return {
    open,
    close,
    onKey,
    isOpen: () => !v.hidden,
    dispose: () => window.removeEventListener("resize", onResize),
  };
}
