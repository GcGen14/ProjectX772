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
  thumb,
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

const fmtDay = (d: string) => {
  const date = new Date(d.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return d;
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};
const fmtTime = (d: string) => {
  const date = new Date(d.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const h = date.getHours();
  const part =
    h < 6
      ? "ตอนดึก"
      : h < 11
        ? "ตอนเช้า"
        : h < 13
          ? "ตอนเที่ยง"
          : h < 17
            ? "ตอนบ่าย"
            : h < 19
              ? "ตอนเย็น"
              : "ตอนค่ำ";
  return `${String(h).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} น. · ${part}`;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const shapeOf = (w: number, h: number) => {
  const r = w / h;
  const kind = Math.abs(r - 1) < 0.04 ? "จัตุรัส" : r > 1 ? "แนวนอน" : "แนวตั้ง";
  const known = [
    [3, 2],
    [4, 3],
    [16, 9],
    [1, 1],
    [2, 3],
    [3, 4],
    [9, 16],
    [5, 4],
    [4, 5],
  ];
  const near = known.find(([a, b]) => Math.abs(a / b - r) < 0.03);
  const g = gcd(w, h) || 1;
  return `${kind} · ${near ? `${near[0]}:${near[1]}` : `${w / g}:${h / g}`}`;
};
const dayKey = (d?: string) => (d ? d.slice(0, 10) : "");
const SLIDE_MS = 4000;
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
        <div class="vw-bar">
          <span data-count></span>
          <button class="vw-chip" type="button" data-tagtoggle aria-pressed="false" title="แสดง/ซ่อนแท็ก (T)">${icon("users", 14)} แท็ก</button>
          <button class="vw-chip" type="button" data-zoom aria-pressed="false" title="ซูม (Z) · ดับเบิลคลิกที่รูปก็ได้">${icon("search", 14)} ซูม</button>
          <button class="vw-chip" type="button" data-slides aria-pressed="false" title="สไลด์โชว์ (Space)">${icon("play", 14)} <span>สไลด์โชว์</span></button>
          <button class="vw-chip vw-chip-icon" type="button" data-sidetoggle aria-pressed="true" title="แสดง/ซ่อนรายละเอียด (I)" aria-label="แสดง/ซ่อนรายละเอียด">${icon("book", 14)}</button>
          <button class="vw-chip vw-chip-icon" type="button" data-full title="เต็มจอ (F)" aria-label="เต็มจอ">${icon("arrowUpRight", 14)}</button>
        </div>
        <div class="vw-slide-progress" aria-hidden="true"><i></i></div>
        <div class="vw-strip" data-strip role="listbox" aria-label="รูปทั้งหมด"></div>
      </div>
      <aside class="vw-side" data-side aria-live="polite"></aside>
    </div>`,
  );
  const v = host.querySelector<HTMLElement>(".vw:last-of-type")!;
  const stage = v.querySelector<HTMLElement>("[data-stage]")!;
  const side = v.querySelector<HTMLElement>("[data-side]")!;
  const count = v.querySelector<HTMLElement>("[data-count]")!;
  const toggle = v.querySelector<HTMLButtonElement>("[data-tagtoggle]")!;
  const zoomBtn = v.querySelector<HTMLButtonElement>("[data-zoom]")!;
  const slidesBtn = v.querySelector<HTMLButtonElement>("[data-slides]")!;
  const strip = v.querySelector<HTMLElement>("[data-strip]")!;
  let items: MediaItem[] = [];
  let vi = 0;
  let showTags = false;
  let editing = false;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let slideTimer = 0;
  let dragged = false;
  let copied = "";

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

  /* ---------------- zoom + pan ---------------- */
  function applyZoom() {
    const box = stage.querySelector<HTMLElement>(".vw-photo");
    if (!box) return;
    const maxX = (box.offsetWidth * (zoom - 1)) / 2;
    const maxY = (box.offsetHeight * (zoom - 1)) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    box.style.transform = zoom > 1 ? `translate(${panX}px, ${panY}px) scale(${zoom})` : "";
    v.classList.toggle("is-zoomed", zoom > 1);
    zoomBtn.setAttribute("aria-pressed", String(zoom > 1));
  }
  function setZoom(z: number, at?: { x: number; y: number }) {
    const box = stage.querySelector<HTMLElement>(".vw-photo");
    if (!box) return;
    const next = Math.max(1, Math.min(4, z));
    if (at && next !== zoom) {
      // keep the point under the cursor where it is
      const r = box.getBoundingClientRect();
      const cx = at.x - (r.left + r.width / 2);
      const cy = at.y - (r.top + r.height / 2);
      panX -= cx * (next / zoom - 1);
      panY -= cy * (next / zoom - 1);
    }
    zoom = next;
    if (zoom === 1) panX = panY = 0;
    applyZoom();
  }
  stage.addEventListener("dblclick", (e) => {
    if (!stage.querySelector(".vw-photo")) return;
    setZoom(zoom > 1 ? 1 : 2.5, { x: e.clientX, y: e.clientY });
  });
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!stage.querySelector(".vw-photo") || (zoom === 1 && e.deltaY > 0)) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), { x: e.clientX, y: e.clientY });
    },
    { passive: false },
  );
  // drag to pan when zoomed, swipe left/right to change photo when not
  let down: { x: number; y: number; px: number; py: number; id: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, px: panX, py: panY, id: e.pointerId };
    dragged = false;
  });
  stage.addEventListener("pointermove", (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
    if (zoom > 1 && dragged) {
      panX = down.px + dx;
      panY = down.py + dy;
      applyZoom();
    }
  });
  stage.addEventListener("pointerup", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (zoom === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      stopSlides();
      show(vi + (dx < 0 ? 1 : -1));
    }
    down = null;
  });
  // a drag shouldn't count as a click on a face tag (or close the viewer)
  stage.addEventListener(
    "click",
    (e) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    },
    true,
  );

  /* ---------------- slideshow ---------------- */
  function startSlides() {
    stopSlides();
    v.classList.add("is-playing");
    slidesBtn.setAttribute("aria-pressed", "true");
    slidesBtn.querySelector("span")!.textContent = "หยุด";
    const step = () => {
      v.classList.remove("slide-tick");
      void v.offsetWidth; // restart the progress bar animation
      v.classList.add("slide-tick");
      slideTimer = window.setTimeout(() => {
        show(vi + 1, true);
        step();
      }, SLIDE_MS);
    };
    step();
  }
  function stopSlides() {
    clearTimeout(slideTimer);
    slideTimer = 0;
    v.classList.remove("is-playing", "slide-tick");
    slidesBtn.setAttribute("aria-pressed", "false");
    slidesBtn.querySelector("span")!.textContent = "สไลด์โชว์";
  }

  /* ---------------- filmstrip ---------------- */
  const stripThumb = (it: MediaItem) =>
    it.kind === "photo" ? photoSrc(it.photo) : it.video.thumb ? thumb(it.video.id) : "";
  function renderStrip() {
    strip.hidden = items.length < 2;
    strip.innerHTML = items
      .map(
        (it, i) =>
          `<button type="button" class="vw-thumb" data-goto="${i}" role="option" aria-selected="false" aria-label="รูปที่ ${i + 1}">${stripThumb(it) ? `<img src="${stripThumb(it)}" alt="" loading="lazy">` : icon("video", 16)}</button>`,
      )
      .join("");
  }
  function markStrip() {
    strip.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    const cur = strip.querySelector<HTMLElement>(`[data-goto="${vi}"]`);
    if (!cur) return;
    cur.setAttribute("aria-selected", "true");
    const left = cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2;
    strip.scrollTo({
      left,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
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
    zoom = 1;
    panX = panY = 0;
    applyZoom();
    zoomBtn.hidden = it.kind !== "photo";
    markStrip();
    // warm up the next photo so the slideshow / arrow key feels instant
    const nx = items[(vi + 1) % items.length];
    if (nx && nx.kind === "photo") new Image().src = driveFull(nx.photo.id);
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
    // other photos in this list taken on the same day
    const day = dayKey(exif.date);
    const sameDay = day
      ? items
          .map((x, i) => ({ x, i }))
          .filter(
            ({ x, i }) =>
              i !== vi && x.kind === "photo" && dayKey(photoExif(x.photo.id).date) === day,
          )
      : [];
    const row = (ic: string, label: string, value: string) =>
      value ? `<div><dt>${icon(ic, 14)} ${label}</dt><dd>${value}</dd></div>` : "";

    side.innerHTML = `
      ${album ? `<a class="vw-album" href="/album/${album.slug}" data-link>${icon("image", 16)} ${esc(album.title)}${p.group && album.groups.length ? ` · ${esc(p.group)}` : ""}</a>` : ""}
      <dl class="vw-details">
        ${row("calendar", "วันที่ถ่าย", exif.date ? esc(fmtDay(exif.date)) : "")}
        ${row("clock", "เวลา", exif.date ? esc(fmtTime(exif.date)) : "")}
        ${row("camera", "กล้อง", exif.camera ? esc(exif.camera) : "")}
        ${row("image", "รูปทรง", esc(shapeOf(p.w, p.h)))}
        ${row("grid", "ลำดับ", `รูปที่ ${(vi + 1).toLocaleString()} จาก ${items.length.toLocaleString()}`)}
        ${row("users", "คนในรูป", tags.length ? `${tags.length} คน` : "")}
        ${row("folder", "ไฟล์", `<span class="vw-file">${esc(p.name)}</span>`)}
      </dl>
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
      ${
        sameDay.length
          ? `<section class="vw-sameday"><h4>ถ่ายวันเดียวกัน <span>${sameDay.length}</span></h4><div class="vw-sameday-row">${sameDay
              .slice(0, 12)
              .map(
                ({ x, i }) =>
                  `<button type="button" data-goto="${i}" aria-label="รูปที่ ${i + 1}"><img src="${x.kind === "photo" ? photoSrc(x.photo) : ""}" alt="" loading="lazy"></button>`,
              )
              .join("")}</div></section>`
          : ""
      }
      <div class="vw-quick">
        <a class="vw-ghost" href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${icon("arrowUpRight", 14)} ดาวน์โหลด</a>
        ${album ? `<button class="vw-ghost" type="button" data-copy="${location.origin}/album/${album.slug}#photo=${encodeURIComponent(p.id)}">${icon("share", 14)} ${copied === p.id ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}</button>` : ""}
      </div>
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
    if (step) {
      stopSlides();
      return show(vi + Number(step.dataset.vwStep));
    }
    const go = t.closest<HTMLElement>("[data-goto]");
    if (go) {
      stopSlides();
      return show(Number(go.dataset.goto));
    }
    if (t.closest("[data-tagtoggle]")) return setTagsVisible(!showTags);
    if (t.closest("[data-zoom]")) return setZoom(zoom > 1 ? 1 : 2);
    if (t.closest("[data-slides]")) return slideTimer ? stopSlides() : startSlides();
    if (t.closest("[data-sidetoggle]")) return toggleSide();
    if (t.closest("[data-full]")) return toggleFull();
    const cp = t.closest<HTMLElement>("[data-copy]");
    if (cp) {
      const it = items[vi];
      void navigator.clipboard?.writeText(cp.dataset.copy!).then(() => {
        copied = it.kind === "photo" ? it.photo.id : "";
        renderSide();
      });
      return;
    }
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

  function toggleSide(on = v.classList.contains("no-side")) {
    v.classList.toggle("no-side", !on);
    v.querySelector("[data-sidetoggle]")!.setAttribute("aria-pressed", String(on));
    requestAnimationFrame(fit);
  }
  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void v.requestFullscreen?.().catch(() => {});
  }

  function show(i: number, fromSlides = false) {
    vi = (i + items.length) % items.length;
    editing = false;
    copied = "";
    if (!fromSlides) v.classList.remove("slide-tick");
    renderMedia();
    renderSide();
  }

  function open(list: MediaItem[], i: number, opts: { slideshow?: boolean } = {}) {
    items = list;
    v.hidden = false;
    renderStrip();
    // touch screens can't hover, so start with name tags visible there
    if (matchMedia("(hover: none)").matches) setTagsVisible(true);
    document.documentElement.classList.add("has-viewer");
    show(i);
    requestAnimationFrame(() => {
      fit();
      markStrip();
      v.classList.add("is-open");
    });
    if (opts.slideshow) {
      toggleSide(false);
      startSlides();
    }
  }

  function close() {
    stopSlides();
    if (document.fullscreenElement === v) void document.exitFullscreen();
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
    const k = e.key.toLowerCase();
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      stopSlides();
      show(vi + (e.key === "ArrowRight" ? 1 : -1));
    } else if (k === "t") setTagsVisible(!showTags);
    else if (k === "z") setZoom(zoom > 1 ? 1 : 2);
    else if (k === "i") toggleSide();
    else if (k === "f") toggleFull();
    else if (e.key === " ") {
      e.preventDefault();
      if (slideTimer) stopSlides();
      else startSlides();
    } else if (e.key === "+" || e.key === "=") setZoom(zoom * 1.4);
    else if (e.key === "-") setZoom(zoom / 1.4);
    return true;
  }

  return {
    open,
    close,
    onKey,
    isOpen: () => !v.hidden,
    dispose: () => {
      stopSlides();
      window.removeEventListener("resize", onResize);
    },
  };
}
