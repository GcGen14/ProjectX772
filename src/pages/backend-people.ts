// /backend helpers for people (students + teachers):
//  - photo manager: hand single photos to the right person, pick the profile picture, upload photos
//  - set picker: give / swap a whole studio photo set between students
//  - teachers tab: add / edit / hide / reorder / delete teachers
//  - decoration editor: the same theme editor students get on /me
import {
  STUDENT_GROUPS,
  applyRoster,
  applyStudentRecords,
  faceSrc,
  getTeacher,
  isOwnerOverride,
  ownedPhotos,
  photoOwnersOf,
  photoPool,
  poolPhoto,
  portraitSets,
  portraitSrc,
  setAvatar,
  studentAvatar,
  teacherAvatar,
  teacherUrl,
  teachers,
  type PoolPhoto,
  type Roster,
  type StudentRecord,
  type Teacher,
} from "../data.ts";
import { api } from "../lib/api.ts";
import { icon } from "../lib/icons.ts";
import { esc } from "../lib/router.ts";
import {
  applyTheme,
  bindThemeEditor,
  hobbyList,
  themeEditorHtml,
  type ProfileTheme,
} from "../lib/theme.ts";

type Row = StudentRecord;
type PsKey =
  | "nickname"
  | "fullName"
  | "nicknameEn"
  | "quote"
  | "dream"
  | "ig"
  | "birthday"
  | "studentId"
  | "photoNote";
type Opts = {
  root: HTMLElement;
  wrap: HTMLElement;
  rows: () => Row[];
  setStatus: (msg: string) => void;
  profileHref: (r: Row) => string;
  /** reload the students table (after numbers change) */
  reload: () => Promise<void>;
};

/** Someone who can own photos: a student ("s12") or a teacher ("t3"). */
type Person = {
  key: string;
  label: string;
  avatar: string;
  avatarId: string;
  coverId: string;
  theme: ProfileTheme;
  href: string;
  save: (patch: { avatar?: string; coverPhoto?: string; theme?: ProfileTheme }) => Promise<void>;
};

export function createPeopleTools(o: Opts) {
  const { root, wrap, setStatus } = o;
  const holders = (set: number | null) =>
    set == null ? [] : o.rows().filter((r) => r.portraitSet === set);
  const who = (r: Row) => `เลขที่ ${r.no}${r.nickname ? ` ${r.nickname}` : ""}`;
  const findRow = (no: number) => o.rows().find((x) => x.no === no);
  const teacherLabel = (t: Teacher) => {
    const n = t.nickname || t.name;
    if (!n) return `ครู ช่องที่ ${teachers.indexOf(t) + 1}`;
    return /^(ครู|อาจารย์|คุณครู)/.test(n) ? n : `ครู ${n}`;
  };

  function person(key: string): Person | null {
    const n = Number(key.slice(1));
    if (key[0] === "s") {
      const r = findRow(n);
      if (!r) return null;
      return {
        key,
        label: who(r),
        avatar: studentAvatar(r),
        avatarId: r.avatar ?? "",
        coverId: r.coverPhoto ?? "",
        theme: r.theme ?? {},
        href: o.profileHref(r),
        save: async (patch) => {
          const out = await api.adminUpdate(r.no, patch);
          Object.assign(r, out.student);
          applyStudentRecords(o.rows());
        },
      };
    }
    const t = getTeacher(n);
    if (!t) return null;
    return {
      key,
      label: teacherLabel(t),
      avatar: teacherAvatar(t),
      avatarId: t.avatar,
      coverId: t.coverPhoto,
      theme: t.theme ?? {},
      href: teacherUrl(t),
      save: async (patch) => applyRoster(await api.adminUpdateTeacher(t.id, patch)),
    };
  }
  const ownerLabel = (key: string) => person(key)?.label ?? "ไม่มีเจ้าของ";

  /* ---------------- table cells ---------------- */
  const avatarCell = (r: Row) =>
    `<button class="adm-avatar-btn" type="button" data-photos="s${r.no}" title="จัดรูปของเลขที่ ${r.no}"><img class="adm-avatar" src="${studentAvatar(r)}" alt="" data-avatar="s${r.no}"><span class="adm-avatar-edit">${icon("image", 12)}</span></button>`;

  function setButton(r: Row) {
    const others = holders(r.portraitSet).filter((x) => x.no !== r.no);
    const warn = others.length
      ? ` is-warn" title="ใช้ชุดเดียวกับ ${esc(others.map(who).join(", "))}`
      : "";
    return `<button class="adm-set-btn${warn}" type="button" data-pick="${r.no}" data-setbtn="${r.no}">${r.portraitSet ? `ชุดที่ ${r.portraitSet}` : "ไม่มีรูป"}${others.length ? " ⚠️" : ""} ${icon("chevronDown", 14)}</button>`;
  }

  const themeDot = (t: ProfileTheme | undefined) =>
    t && Object.keys(t).length
      ? `<span class="adm-theme-dot" style="background:${t.accent ?? "var(--ink-900)"}" title="ตกแต่งแล้ว"></span>`
      : "";
  const styleInner = (t: ProfileTheme | undefined) =>
    `${icon("palette", 15)}<span>ตกแต่ง</span>${themeDot(t)}`;
  const styleButton = (r: Row) =>
    `<button class="adm-style-btn" type="button" data-style="s${r.no}" title="ตกแต่งหน้าโปรไฟล์">${styleInner(r.theme)}</button>`;

  /** After owners / avatars change: refresh every avatar + photo count shown on the page. */
  function refreshFaces() {
    root.querySelectorAll<HTMLImageElement>("[data-avatar]").forEach((img) => {
      const p = person(img.dataset.avatar!);
      if (p) img.src = p.avatar;
    });
    root.querySelectorAll<HTMLElement>("[data-photo-count]").forEach((el) => {
      el.textContent = String(ownedPhotos(el.dataset.photoCount!).length);
    });
  }
  function refreshSetButtons() {
    for (const r of o.rows()) {
      const b = root.querySelector<HTMLElement>(`[data-setbtn="${r.no}"]`);
      if (b) b.outerHTML = setButton(r);
    }
  }
  /** Warn about photo sets given to more than one student (usually a numbering mistake). */
  function noteDuplicates() {
    const dup = new Set(
      o
        .rows()
        .filter((r) => r.portraitSet != null && holders(r.portraitSet).length > 1)
        .map((r) => r.portraitSet),
    );
    if (dup.size) setStatus(`⚠️ มีชุดรูปที่ใช้ซ้ำกันหลายคน: ชุด ${[...dup].join(", ")} · กดที่ปุ่มชุดรูปเพื่อแก้`);
  }
  async function refreshRoster() {
    try {
      applyRoster(await api.roster());
    } catch {
      /* keep what we have */
    }
  }
  function takeRoster(r: Roster) {
    applyRoster(r);
    refreshFaces();
  }

  /* ---------------- modal ---------------- */
  const modal = document.createElement("div");
  modal.className = "adm-modal";
  modal.hidden = true;
  wrap.appendChild(modal);
  let lastFocus: HTMLElement | null = null;
  function showModal(html: string) {
    if (modal.hidden) lastFocus = document.activeElement as HTMLElement | null;
    modal.innerHTML = `<div class="adm-modal-backdrop" data-modal-close></div>${html}`;
    modal.hidden = false;
    document.documentElement.classList.add("adm-modal-open");
  }
  function closeModal() {
    if (modal.hidden) return;
    // photo / style tools opened from the number board or a person's settings go back there
    if ((nb || ps) && (pm || pick || styleOn)) {
      pm = null;
      pick = null;
      styleOn = false;
      if (nb) renderBoard();
      else renderPerson();
      return;
    }
    nb = null;
    ps = null;
    styleOn = false;
    modal.hidden = true;
    modal.innerHTML = "";
    pick = null;
    pm = null;
    document.documentElement.classList.remove("adm-modal-open");
    if (tab === "teachers") renderTeachers();
    lastFocus?.focus();
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || modal.hidden) return;
    const zoom = modal.querySelector<HTMLElement>(".pm-zoom");
    if (zoom) zoom.remove();
    else closeModal();
  };
  window.addEventListener("keydown", onKey);
  const keepScroll = (sel: string, fn: () => void) => {
    const tops = [...modal.querySelectorAll<HTMLElement>(sel)].map((el) => el.scrollTop);
    fn();
    modal.querySelectorAll<HTMLElement>(sel).forEach((el, i) => (el.scrollTop = tops[i] ?? 0));
  };

  /* ================= photo manager (single photos) ================= */
  let pm: { key: string; sel: Set<string>; add: Set<string>; filter: string } | null = null;

  function openPhotos(key: string) {
    if (!person(key)) return;
    const free = photoPool().some((p) => !photoOwnersOf(p.id).length);
    pm = { key, sel: new Set(), add: new Set(), filter: free ? "free" : "all" };
    renderPhotos();
  }

  const peopleOptions = (exclude: string) =>
    [
      `<option value="">— เลือกคน —</option>`,
      `<optgroup label="นักเรียน">${o
        .rows()
        .filter((r) => `s${r.no}` !== exclude)
        .map((r) => `<option value="s${r.no}">${esc(who(r))}</option>`)
        .join("")}</optgroup>`,
      teachers.length
        ? `<optgroup label="คุณครู">${teachers
            .filter((t) => `t${t.id}` !== exclude)
            .map((t) => `<option value="t${t.id}">${esc(teacherLabel(t))}</option>`)
            .join("")}</optgroup>`
        : "",
    ].join("");

  function poolFiltered(key: string, filter: string): PoolPhoto[] {
    const notMine = photoPool().filter((p) => !photoOwnersOf(p.id).includes(key));
    if (filter === "free") return notMine.filter((p) => !photoOwnersOf(p.id).length);
    if (filter === "uploads") return notMine.filter((p) => p.upload);
    if (filter.startsWith("set:")) return notMine.filter((p) => p.set === Number(filter.slice(4)));
    return notMine;
  }

  function renderPhotos() {
    const s = pm!;
    const p = person(s.key)!;
    const mine = ownedPhotos(s.key);
    // forget selections of photos that moved away
    for (const id of s.sel) if (!mine.some((x) => x.id === id)) s.sel.delete(id);
    const avatarId = mine.some((x) => x.id === p.avatarId) ? p.avatarId : mine[0]?.id;
    const sel = [...s.sel];
    const pool = poolFiltered(s.key, s.filter);
    for (const id of s.add) if (!pool.some((x) => x.id === id)) s.add.delete(id);
    const free = photoPool().filter((x) => !photoOwnersOf(x.id).length).length;
    const uploads = photoPool().filter((x) => x.upload).length;

    const mineTile = (x: PoolPhoto) => `
      <button type="button" class="pm-tile${s.sel.has(x.id) ? " is-sel" : ""}" data-pm-mine="${x.id}" aria-pressed="${s.sel.has(x.id)}" style="aspect-ratio:${x.w}/${x.h}">
        <img src="${portraitSrc(x)}" alt="" loading="lazy">
        <span class="pm-badges">${x.id === avatarId ? `<span title="รูปโปรไฟล์">★ โปรไฟล์</span>` : ""}${x.id === p.coverId ? `<span>ปก</span>` : ""}${isOwnerOverride(x.id) && !x.upload ? `<span class="is-moved" title="ย้ายมาจากชุดอื่น">ย้ายมา</span>` : ""}${x.upload ? `<span>อัปโหลด</span>` : x.set ? `<span>ชุด ${x.set}</span>` : ""}</span>
        <span class="pm-check">${icon("check", 14)}</span>
      </button>`;
    const poolTile = (x: PoolPhoto) => {
      const owners = photoOwnersOf(x.id);
      return `<div class="pm-face${s.add.has(x.id) ? " is-sel" : ""}">
        <button type="button" data-pm-add="${x.id}" aria-pressed="${s.add.has(x.id)}" title="${esc(owners.map(ownerLabel).join(", ") || "ยังไม่มีเจ้าของ")}">
          <img src="${faceSrc(x)}" alt="" loading="lazy">
          <span class="${owners.length ? "" : "is-free"}">${owners.length ? esc(owners.map(ownerLabel).join(", ")) : "ว่าง"}</span>
          <small>${x.upload ? "อัปโหลด" : x.set ? `ชุด ${x.set}` : "ไม่อยู่ในชุด"}</small>
        </button>
        <button type="button" class="pm-zoom-btn" data-pm-zoom="${portraitSrc(x)}" aria-label="ดูรูปเต็ม">${icon("search", 13)}</button>
      </div>`;
    };
    const one = sel.length === 1;
    const anyMoved = sel.some((id) => isOwnerOverride(id) && !poolPhoto(id)?.upload);
    const allUploads = sel.length > 0 && sel.every((id) => poolPhoto(id)?.upload);
    const setsOpts = portraitSets()
      .map(
        (x) =>
          `<option value="set:${x.set}"${s.filter === `set:${x.set}` ? " selected" : ""}>ชุดที่ ${x.set}</option>`,
      )
      .join("");

    const html = `<div class="adm-modal-card pm" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <header class="adm-modal-head">
        <img class="adm-avatar" src="${p.avatar}" alt="">
        <div><h2 id="pm-title">จัดรูปของ ${esc(p.label)}</h2><p class="muted">เลือกรูปที่ไม่ใช่ของคนนี้แล้ว "ย้ายไปให้" คนที่ถูก · หรือเลือกรูปด้านล่างมาเป็นของคนนี้</p></div>
        <a class="btn-outline me-small" href="${p.href}" target="_blank" rel="noopener">ดูหน้าโปรไฟล์ ${icon("arrowUpRight", 14)}</a>
        ${nb || ps ? `<button class="btn-outline me-small" type="button" data-modal-close>${icon("chevronLeft", 14)} ${nb ? "กลับไปจัดเลขที่" : "กลับไปหน้าตั้งค่า"}</button>` : ""}
        <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
      </header>
      <div class="pm-body">
        <section class="pm-mine">
          <h3>รูปของ ${esc(p.label)} <span class="muted">· ${mine.length} รูป</span></h3>
          ${
            mine.length
              ? `<div class="pm-grid">${mine.map(mineTile).join("")}</div>`
              : `<p class="pm-empty">${icon("image", 18)} ยังไม่มีรูป · เลือกจากรูปด้านล่าง หรืออัปโหลดรูปใหม่</p>`
          }
          <div class="pm-bar${sel.length ? " is-on" : ""}">
            ${
              sel.length
                ? `<b>เลือก ${sel.length} รูป</b>
              ${one ? `<button class="btn-outline me-small" type="button" data-pm-act="avatar">★ ตั้งเป็นรูปโปรไฟล์</button><button class="btn-outline me-small" type="button" data-pm-act="cover">ตั้งเป็นรูปปก</button>` : ""}
              <span class="pm-move"><select data-pm-target aria-label="ย้ายไปให้">${peopleOptions(s.key)}</select><button class="me-btn me-small" type="button" data-pm-act="move">${icon("users", 14)} ย้ายไปให้</button></span>
              <button class="btn-outline me-small" type="button" data-pm-act="none" title="ไม่แสดงในหน้าของใครเลย">ไม่ใช่รูปของใคร</button>
              ${anyMoved ? `<button class="btn-outline me-small" type="button" data-pm-act="auto" title="ให้กลับไปเป็นของเจ้าของชุดรูปเดิม">คืนเจ้าของเดิม</button>` : ""}
              ${allUploads ? `<button class="btn-outline me-small pm-danger" type="button" data-pm-act="delete">ลบรูปที่อัปโหลด</button>` : ""}
              <button class="pm-clear" type="button" data-pm-act="clear">ยกเลิกเลือก</button>`
                : `<span class="muted">กดที่รูปเพื่อเลือก (เลือกได้หลายรูป)</span>`
            }
          </div>
        </section>
        <section class="pm-pool">
          <div class="pm-pool-head">
            <h3>เพิ่มรูปให้ ${esc(p.label)}</h3>
            <label class="me-btn me-small pm-upload">${icon("plus", 14)} อัปโหลดรูปใหม่<input type="file" accept="image/*" multiple data-pm-upload hidden></label>
          </div>
          <div class="pm-filters" role="group" aria-label="กรองรูป">
            <button type="button" class="chip${s.filter === "free" ? " is-on" : ""}" data-pm-filter="free">ยังไม่มีเจ้าของ (${free})</button>
            <button type="button" class="chip${s.filter === "all" ? " is-on" : ""}" data-pm-filter="all">ทุกรูป</button>
            ${uploads ? `<button type="button" class="chip${s.filter === "uploads" ? " is-on" : ""}" data-pm-filter="uploads">อัปโหลด (${uploads})</button>` : ""}
            <select data-pm-set aria-label="ดูทีละชุด"><option value="">ดูทีละชุด…</option>${setsOpts}</select>
          </div>
          ${
            pool.length
              ? `<div class="pm-faces">${pool.map(poolTile).join("")}</div>`
              : `<p class="pm-empty">ไม่มีรูปในหมวดนี้</p>`
          }
          <div class="pm-bar${s.add.size ? " is-on" : ""}">
            ${
              s.add.size
                ? `<b>เลือก ${s.add.size} รูป</b>${s.add.size === 1 ? `<button class="btn-outline me-small" type="button" data-pm-act="take-avatar">★ ย้ายมาและตั้งเป็นรูปโปรไฟล์</button>` : ""}<button class="me-btn me-small" type="button" data-pm-act="take">${icon("check", 14)} ย้ายมาเป็นของ ${esc(p.label)}</button><button class="pm-clear" type="button" data-pm-act="clear-add">ยกเลิกเลือก</button>`
                : `<span class="muted">เลือกรูปที่เป็นของ ${esc(p.label)} แล้วกดย้ายมา · 🔍 = ดูรูปเต็ม</span>`
            }
          </div>
        </section>
      </div>
      <p class="pm-status muted" data-pm-status></p>
    </div>`;
    keepScroll(".pm-mine, .pm-pool, .pm-body", () => showModal(html));
  }

  const pmStatus = (m: string) => {
    const el = modal.querySelector<HTMLElement>("[data-pm-status]");
    if (el) el.textContent = m;
  };

  async function photoAction(act: string) {
    const s = pm!;
    const p = person(s.key)!;
    const sel = [...s.sel];
    try {
      if (act === "clear") s.sel.clear();
      else if (act === "clear-add") s.add.clear();
      else if (act === "avatar") {
        await p.save({ avatar: sel[0] });
        setStatus(`ตั้งรูปโปรไฟล์ของ ${p.label} แล้ว`);
        s.sel.clear();
      } else if (act === "cover") {
        await p.save({ coverPhoto: sel[0] });
        setStatus(`ตั้งรูปปกของ ${p.label} แล้ว`);
        s.sel.clear();
      } else if (act === "move") {
        const to = modal.querySelector<HTMLSelectElement>("[data-pm-target]")!.value;
        if (!to) return pmStatus("เลือกก่อนว่าจะย้ายไปให้ใคร");
        takeRoster(await api.adminSetOwner(sel, to));
        setStatus(`ย้าย ${sel.length} รูปจาก ${p.label} ไปให้ ${ownerLabel(to)} แล้ว`);
        s.sel.clear();
      } else if (act === "none" || act === "auto") {
        takeRoster(await api.adminSetOwner(sel, act));
        setStatus(
          act === "none"
            ? `ซ่อน ${sel.length} รูป (ไม่ใช่รูปของใคร)`
            : `คืน ${sel.length} รูปให้เจ้าของชุดรูปเดิม`,
        );
        s.sel.clear();
      } else if (act === "delete") {
        if (!confirmPending("delete")) return pmStatus('กด "ลบรูปที่อัปโหลด" อีกครั้งเพื่อยืนยัน (ลบถาวร)');
        let last: Roster | null = null;
        for (const id of sel) last = await api.adminDeleteUpload(id);
        if (last) takeRoster(last);
        setStatus(`ลบรูปที่อัปโหลด ${sel.length} รูปแล้ว`);
        s.sel.clear();
      } else if (act === "take-avatar") {
        const id = [...s.add][0];
        takeRoster(await api.adminSetOwner([id], s.key));
        await p.save({ avatar: id });
        setStatus(`ตั้งรูปโปรไฟล์ใหม่ของ ${p.label} แล้ว`);
        s.add.clear();
      } else if (act === "take") {
        const ids = [...s.add];
        takeRoster(await api.adminSetOwner(ids, s.key));
        setStatus(`ย้าย ${ids.length} รูปมาเป็นของ ${p.label} แล้ว`);
        s.add.clear();
      }
      refreshFaces();
      renderPhotos();
    } catch (ex) {
      pmStatus(`ไม่สำเร็จ: ${(ex as Error).message}`);
    }
  }
  let pendingConfirm = "";
  const confirmPending = (k: string) => {
    if (pendingConfirm === k) {
      pendingConfirm = "";
      return true;
    }
    pendingConfirm = k;
    return false;
  };

  /** Resize in the browser (max 1600px) + make a 240px face-ish square crop, then upload. */
  async function uploadFiles(files: File[]) {
    const s = pm!;
    let done = 0;
    for (const f of files) {
      pmStatus(`กำลังอัปโหลด ${done + 1}/${files.length}…`);
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * scale);
        const h = Math.round(bmp.height * scale);
        const full = document.createElement("canvas");
        full.width = w;
        full.height = h;
        full.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
        // square crop around where a face usually is (upper middle of the photo)
        const side = Math.min(w, h) * (h > w ? 0.8 : 0.62);
        const cx = w / 2;
        const cy = h > w ? h * 0.32 : h * 0.4;
        const sx = Math.max(0, Math.min(w - side, cx - side / 2));
        const sy = Math.max(0, Math.min(h - side, cy - side / 2));
        const face = document.createElement("canvas");
        face.width = face.height = 240;
        face.getContext("2d")!.drawImage(full, sx, sy, side, side, 0, 0, 240, 240);
        bmp.close();
        const r = await api.adminUpload({
          data: full.toDataURL("image/jpeg", 0.86),
          face: face.toDataURL("image/jpeg", 0.86),
          w,
          h,
          owner: s.key,
        });
        applyRoster(r);
        done++;
      } catch (ex) {
        pmStatus(`อัปโหลด ${f.name} ไม่สำเร็จ: ${(ex as Error).message}`);
        return;
      }
    }
    refreshFaces();
    renderPhotos();
    setStatus(`อัปโหลด ${done} รูปให้ ${person(s.key)?.label ?? ""} แล้ว`);
  }

  /* ================= one person's settings: everything for a student in one place ================= */
  type Acc = { account?: { claimed: boolean; code: string | null } };
  let ps: { no: number } | null = null;
  const PS_FIELDS: { key: PsKey; label: string; ph?: string; area?: boolean; max: number }[] = [
    { key: "nickname", label: "ชื่อเล่น", ph: "เช่น มายด์", max: 40 },
    { key: "fullName", label: "ชื่อ–นามสกุล", ph: "นาย/นางสาว …", max: 100 },
    { key: "nicknameEn", label: "ชื่อเล่น (EN)", max: 40 },
    { key: "birthday", label: "วันเกิด", ph: "12 มี.ค.", max: 40 },
    { key: "ig", label: "Instagram", ph: "ไม่ต้องใส่ @", max: 30 },
    { key: "dream", label: "ความฝัน / คณะ", max: 120 },
    { key: "quote", label: "คำคม / ข้อความ", area: true, max: 300 },
    { key: "studentId", label: "รหัสนักเรียน (ID)", ph: "เช่น 40160", max: 10 },
    { key: "photoNote", label: "หมายเหตุ (เห็นเฉพาะผู้ดูแล)", max: 200 },
  ];

  function openPerson(no: number) {
    if (!findRow(no)) return;
    pick = null;
    pm = null;
    nb = null;
    ps = { no };
    renderPerson();
  }

  function renderPerson() {
    const r = findRow(ps!.no);
    if (!r) return closeModal();
    const list = [...o.rows()].sort((x, y) => x.no - y.no);
    const i = list.indexOf(r);
    const prev = list[i - 1];
    const next = list[i + 1];
    const acc = (r as Row & Acc).account;
    const photos = ownedPhotos(`s${r.no}`).length;
    const field = (f: (typeof PS_FIELDS)[number]) => {
      const v = esc(String(r[f.key] ?? ""));
      const attrs = `data-ps-key="${f.key}" maxlength="${f.max}" placeholder="${esc(f.ph ?? "")}"`;
      return `<label class="ps-field${f.area ? " is-wide" : ""}"><span>${f.label}</span>${
        f.area
          ? `<textarea ${attrs} rows="3">${v}</textarea>`
          : `<input type="text" ${attrs} value="${v}">`
      }</label>`;
    };
    const group = `<label class="ps-field"><span>กลุ่ม</span><select data-ps-key="group">${[
      "",
      ...STUDENT_GROUPS,
    ]
      .map((g) => `<option value="${g}"${g === r.group ? " selected" : ""}>${g || "—"}</option>`)
      .join("")}</select></label>`;
    showModal(`<div class="adm-modal-card ps" role="dialog" aria-modal="true" aria-labelledby="ps-title">
      <header class="adm-modal-head">
        <img class="adm-avatar" src="${studentAvatar(r)}" alt="" data-avatar="s${r.no}">
        <div><h2 id="ps-title">ตั้งค่า ${esc(who(r))}</h2><p class="muted">แก้แล้วบันทึกอัตโนมัติเมื่อออกจากช่อง</p></div>
        <a class="btn-outline me-small" href="${o.profileHref(r)}" target="_blank" rel="noopener">ดูหน้าโปรไฟล์ ${icon("arrowUpRight", 14)}</a>
        <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
      </header>
      <div class="ps-body">
        <aside class="ps-side">
          <button class="ps-face" type="button" data-photos="s${r.no}" title="เปลี่ยนรูปโปรไฟล์"><img src="${studentAvatar(r)}" alt="" data-avatar="s${r.no}"><span>${icon("image", 14)} เปลี่ยนรูป</span></button>
          <div class="ps-actions">
            <button class="ps-act" type="button" data-photos="s${r.no}">${icon("image", 16)}<span><b>รูปโปรไฟล์ / จัดรูป</b><small>${photos} รูป · เลือกรูปโปรไฟล์ ย้ายรูปที่ผิดคน อัปโหลด</small></span></button>
            <button class="ps-act" type="button" data-pick="${r.no}">${icon("grid", 16)}<span><b>ชุดรูปเดี่ยว</b><small>${r.portraitSet ? `ชุดที่ ${r.portraitSet}` : "ไม่มีรูป"} · สลับทั้งชุดกับคนอื่น</small></span></button>
            <button class="ps-act" type="button" data-nb-open="${r.no}">${icon("users", 16)}<span><b>เปลี่ยนเลขที่</b><small>ตอนนี้เลขที่ ${r.no} · ย้าย / สลับกับคนอื่น</small></span></button>
            <button class="ps-act" type="button" data-style="s${r.no}">${icon("palette", 16)}<span><b>ตกแต่งหน้าโปรไฟล์</b><small>${r.theme && Object.keys(r.theme).length ? "ตกแต่งแล้ว" : "สี พื้นหลัง ฟอนต์ อีโมจิ เพลงโปรด"}</small></span></button>
          </div>
          <div class="ps-acc">
            <span>${icon("lock", 15)} บัญชี</span>
            ${acc?.claimed ? `<b class="adm-acc ok">${icon("check", 14)} ตั้งรหัสแล้ว</b>` : `<span>รหัสครั้งแรก <code class="adm-code">${esc(acc?.code ?? "—")}</code></span>`}
            <button class="btn-outline me-small" type="button" data-ps-reset title="ลืมรหัส: สร้างรหัสครั้งแรกใหม่">รีเซ็ตรหัส</button>
          </div>
        </aside>
        <div class="ps-form">${PS_FIELDS.slice(0, 6).map(field).join("")}${group}${PS_FIELDS.slice(6).map(field).join("")}</div>
      </div>
      <footer class="adm-modal-foot">
        <span class="muted" data-ps-msg></span>
        ${prev ? `<button class="btn-outline me-small" type="button" data-ps-go="${prev.no}">${icon("chevronLeft", 14)} เลขที่ ${prev.no}</button>` : ""}
        ${next ? `<button class="btn-outline me-small" type="button" data-ps-go="${next.no}">เลขที่ ${next.no} ${icon("chevronRight", 14)}</button>` : ""}
      </footer>
    </div>`);
  }

  const psMsg = (m: string) => {
    const el = modal.querySelector<HTMLElement>("[data-ps-msg]");
    if (el) el.textContent = m;
  };

  async function savePersonField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    const r = ps && findRow(ps.no);
    const key = el.dataset.psKey as PsKey | "group";
    if (!r || !key) return;
    const value = el.value.trim();
    if (value === (r[key] ?? "")) return;
    psMsg("กำลังบันทึก…");
    try {
      const out = await api.adminUpdate(r.no, { [key]: value });
      Object.assign(r, out.student);
      applyStudentRecords(o.rows());
      // keep the big table in sync
      const cell = root.querySelector<HTMLInputElement>(`[data-no="${r.no}"][data-key="${key}"]`);
      if (cell) cell.value = String(r[key] ?? "");
      const title = modal.querySelector("#ps-title");
      if (title) title.textContent = `ตั้งค่า ${who(r)}`;
      psMsg(`✓ บันทึกแล้ว`);
    } catch (ex) {
      psMsg(`บันทึกไม่สำเร็จ: ${(ex as Error).message}`);
    }
  }

  async function resetCode() {
    const r = ps && findRow(ps.no);
    if (!r) return;
    if (!confirmPending(`reset${r.no}`))
      return psMsg('กด "รีเซ็ตรหัส" อีกครั้งเพื่อยืนยัน (รหัสผ่านเดิมของนักเรียนจะใช้ไม่ได้)');
    try {
      const out = await api.adminReset(r.no);
      (r as Row & Acc).account = { claimed: false, code: out.code };
      const accCell = root.querySelector<HTMLElement>(`[data-acc="${r.no}"]`);
      if (accCell)
        accCell.innerHTML = `<code class="adm-code" title="รหัสครั้งแรก">${esc(out.code)}</code>`;
      renderPerson();
      psMsg(`รหัสครั้งแรกใหม่ของ ${who(r)}: ${out.code}`);
    } catch (ex) {
      psMsg(`ไม่สำเร็จ: ${(ex as Error).message}`);
    }
  }

  /* ================= number board: fix เลขที่ + profile pictures for the whole class ================= */
  let nb: { a: number | null; b: number | null; flash: number[] } | null = null;
  const nameOf = (r: Row) => r.nickname || r.fullName || r.nicknameEn || "";

  function openBoard(no?: number) {
    pick = null;
    pm = null;
    ps = null;
    nb = { a: no ?? null, b: null, flash: [] };
    renderBoard(true);
  }

  function boardCard(r: Row) {
    const s = nb!;
    const set = r.portraitSet;
    const noPhoto = !ownedPhotos(`s${r.no}`).length;
    const dup = set != null && holders(set).length > 1;
    const cls = [
      "nb-card",
      s.a === r.no && "is-a",
      s.b === r.no && "is-b",
      s.flash.includes(r.no) && "is-flash",
    ]
      .filter(Boolean)
      .join(" ");
    const name = nameOf(r);
    return `<div class="${cls}">
      <button type="button" class="nb-pick" data-nb="${r.no}" aria-pressed="${s.a === r.no || s.b === r.no}">
        <img src="${studentAvatar(r)}" alt="" loading="lazy" data-avatar="s${r.no}">
        <b>เลขที่ ${r.no}</b>
        <span class="nb-name">${name ? esc(name) : "<em>ยังไม่มีชื่อ</em>"}</span>
        ${noPhoto ? `<span class="nb-flag">ไม่มีรูป</span>` : dup ? `<span class="nb-flag is-warn">รูปซ้ำ</span>` : ""}
      </button>
      <button type="button" class="nb-photo" data-photos="s${r.no}" title="เปลี่ยนรูปโปรไฟล์ของเลขที่ ${r.no}" aria-label="เปลี่ยนรูปโปรไฟล์ของเลขที่ ${r.no}">${icon("image", 14)}</button>
    </div>`;
  }

  function boardBar(): string {
    const s = nb!;
    const A = s.a != null ? findRow(s.a) : undefined;
    if (!A)
      return `<span class="muted">${icon("users", 15)} กดที่คนที่อยู่ผิดเลขที่ แล้วกดเลขที่ที่ถูก (ระบบจะสลับให้) · ปุ่ม ${icon("image", 13)} มุมการ์ด = เปลี่ยนรูปโปรไฟล์</span>`;
    const face = (r: Row) => `<img class="adm-avatar" src="${studentAvatar(r)}" alt="">`;
    const tag = (r: Row) =>
      `<span class="nb-who">${face(r)}<b>เลขที่ ${r.no}</b>${nameOf(r) ? `<span>${esc(nameOf(r))}</span>` : ""}</span>`;
    const input = `<label class="nb-to"><span>หรือพิมพ์เลขที่</span><input type="number" min="1" max="99" inputmode="numeric" data-nb-to value="${s.b ?? ""}" aria-label="เลขที่ใหม่"></label>`;
    const cancel = `<button class="pm-clear" type="button" data-nb-clear>ยกเลิก</button>`;
    const B = s.b != null ? findRow(s.b) : undefined;
    if (s.b == null || s.b === A.no)
      return `${tag(A)}<span class="nb-arrow">→</span><span class="muted">กดคนที่จะสลับเลขที่ด้วย</span>${input}
        <button class="btn-outline me-small" type="button" data-photos="s${A.no}">${icon("image", 14)} เปลี่ยนรูปโปรไฟล์</button>${cancel}`;
    if (!B)
      return `${tag(A)}<span class="nb-arrow">→</span><span class="nb-who"><b>เลขที่ ${s.b}</b><span class="muted">(ว่าง)</span></span>${input}
        <button class="me-btn me-small" type="button" data-nb-go="all">${icon("check", 14)} ย้ายไปเป็นเลขที่ ${s.b}</button>${cancel}`;
    return `${tag(A)}<span class="nb-arrow">⇄</span>${tag(B)}
      <button class="me-btn me-small" type="button" data-nb-go="all" title="ชื่อ รูป บัญชี รหัสผ่าน และข้อความ ย้ายไปพร้อมกับคน">${icon("users", 14)} สลับเลขที่ (ย้ายทั้งคน)</button>
      <button class="btn-outline me-small" type="button" data-nb-go="photos" title="ชื่อและข้อมูลอยู่ที่เลขที่เดิม สลับแค่รูป">${icon("image", 14)} สลับแค่รูป</button>${cancel}`;
  }

  function renderBoard(first = false) {
    const s = nb!;
    const list = [...o.rows()].sort((x, y) => x.no - y.no);
    const top = modal.querySelector<HTMLElement>(".nb-grid")?.scrollTop ?? 0;
    const noPhoto = list.filter((r) => !ownedPhotos(`s${r.no}`).length).length;
    showModal(`<div class="adm-modal-card nb" role="dialog" aria-modal="true" aria-labelledby="nb-title">
      <header class="adm-modal-head">
        <span class="nb-icon">${icon("users", 22)}</span>
        <div><h2 id="nb-title">จัดเลขที่และรูปโปรไฟล์</h2><p class="muted">ทั้งคนอยู่ผิดเลขที่ → กดคนนั้น แล้วกดเลขที่ที่ถูก · ชื่อถูกแต่รูปผิด → "สลับแค่รูป" หรือกด ${icon("image", 12)} เพื่อเลือกรูปเอง · ${list.length} คน${noPhoto ? ` · ไม่มีรูป ${noPhoto} คน` : ""}</p></div>
        <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
      </header>
      <div class="nb-grid">${list.map(boardCard).join("")}</div>
      <div class="nb-bar${s.a != null ? " is-on" : ""}">${boardBar()}</div>
      <p class="pm-status muted" data-nb-status></p>
    </div>`);
    const grid = modal.querySelector<HTMLElement>(".nb-grid")!;
    if (first && s.a != null) grid.querySelector(".is-a")?.scrollIntoView({ block: "center" });
    else grid.scrollTop = top;
  }

  const nbStatus = (m: string) => {
    const el = modal.querySelector<HTMLElement>("[data-nb-status]");
    if (el) el.textContent = m;
  };

  async function boardGo(mode: "all" | "photos") {
    const s = nb!;
    if (s.a == null || s.b == null) return;
    const [x, y] = [s.a, s.b];
    const hadB = !!findRow(y);
    modal.querySelectorAll<HTMLButtonElement>("[data-nb-go]").forEach((b) => (b.disabled = true));
    nbStatus("กำลังบันทึก…");
    try {
      applyRoster(await api.adminRenumber(x, y, mode));
      await o.reload();
      const msg =
        mode === "photos"
          ? `สลับรูประหว่างเลขที่ ${x} กับ ${y} แล้ว (ชื่อและข้อมูลอยู่ที่เดิม)`
          : hadB
            ? `สลับเลขที่ ${x} ⇄ ${y} แล้ว · ชื่อ รูป และบัญชีย้ายไปพร้อมกัน (คนที่ตั้งรหัสแล้วต้องเข้าสู่ระบบด้วยเลขที่ใหม่)`
            : `ย้ายเลขที่ ${x} ไปเป็นเลขที่ ${y} แล้ว`;
      setStatus(msg);
      if (!nb) return;
      nb = { a: null, b: null, flash: [x, y] };
      renderBoard();
      nbStatus(`✓ ${msg}`);
    } catch (ex) {
      nbStatus(`ไม่สำเร็จ: ${(ex as Error).message}`);
      modal
        .querySelectorAll<HTMLButtonElement>("[data-nb-go]")
        .forEach((b) => (b.disabled = false));
    }
  }

  function boardClick(t: Element): boolean {
    const s = nb;
    if (!s || !modal.querySelector(".nb")) return false;
    const card = t.closest<HTMLElement>("[data-nb]");
    if (card) {
      const n = Number(card.dataset.nb);
      if (s.a === n) Object.assign(s, { a: s.b, b: null });
      else if (s.b === n) s.b = null;
      else if (s.a == null) s.a = n;
      else s.b = n;
      s.flash = [];
      renderBoard();
      return true;
    }
    if (t.closest("[data-nb-clear]")) {
      Object.assign(s, { a: null, b: null, flash: [] });
      renderBoard();
      return true;
    }
    const go = t.closest<HTMLElement>("[data-nb-go]");
    if (go) {
      void boardGo(go.dataset.nbGo === "photos" ? "photos" : "all");
      return true;
    }
    return false;
  }

  /* ================= set picker (whole studio sets) ================= */
  let pick: { no: number; sel: number | null; freeOnly: boolean } | null = null;

  function openPicker(no: number) {
    const r = findRow(no);
    if (!r) return;
    pick = { no, sel: r.portraitSet, freeOnly: false };
    renderPicker(true);
  }

  function pickerActions(r: Row, selSet: number | null, isCurrent: boolean) {
    const others = holders(selSet).filter((x) => x.no !== r.no);
    if (isCurrent)
      return `<p class="pk-hint">${icon("check", 14)} ชุดนี้คือรูปที่ใช้อยู่ตอนนี้ · เลือกชุดอื่นเพื่อเปลี่ยน</p>`;
    if (others.length === 1)
      return `<p class="pk-hint">ชุดนี้ตอนนี้เป็นของ <b>${esc(who(others[0]))}</b> · ถ้ารูปสลับกันอยู่ ให้กด "สลับ"</p>
        <button class="me-btn" type="button" data-pk-assign="swap">${icon("users", 16)} สลับรูปกับ${esc(who(others[0]))}</button>
        <button class="btn-outline me-small" type="button" data-pk-assign="set">ใช้ชุดนี้ด้วย (ไม่สลับ)</button>`;
    if (others.length > 1)
      return `<p class="pk-hint">ชุดนี้ใช้อยู่กับ ${esc(others.map(who).join(", "))}</p>
        <button class="me-btn" type="button" data-pk-assign="set">ใช้ชุดนี้</button>`;
    return `<button class="me-btn" type="button" data-pk-assign="set">${icon("check", 16)} ${selSet ? `ใช้ชุดที่ ${selSet}` : "ไม่ใช้รูป"}</button>`;
  }

  function renderPicker(first = false) {
    const p = pick!;
    const r = findRow(p.no)!;
    const sets = portraitSets();
    const sel = p.sel != null ? sets.find((x) => x.set === p.sel) : undefined;
    const preview = sel?.portraits.length
      ? `<div class="pk-main"><img src="${portraitSrc(sel.portraits[0])}" alt="ชุดที่ ${sel.set}" data-pk-big></div>
         <div class="pk-strip">${sel.portraits
           .map(
             (pt, i) =>
               `<button type="button" class="${i === 0 ? "is-on" : ""}" data-pk-thumb="${portraitSrc(pt)}" aria-label="รูปที่ ${i + 1}"><img src="${portraitSrc(pt)}" alt="" loading="lazy"></button>`,
           )
           .join("")}</div>`
      : `<div class="pk-main pk-none"><img src="${studentAvatar({ no: r.no, portraitSet: null })}" alt=""><p>ไม่ใช้รูปเดี่ยว · หน้าโปรไฟล์จะแสดงรูปการ์ตูนแทน</p></div>`;

    const card = (n: number, count: number) => {
      const hs = holders(n);
      const mine = hs.some((h) => h.no === r.no);
      const label = hs.length ? hs.map((h) => `เลขที่ ${h.no}`).join(", ") : "ว่าง";
      const cls = [
        "pk-card",
        p.sel === n && "is-sel",
        mine && "is-cur",
        !hs.length && "is-free",
        hs.length > 1 && "is-dup",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${cls}" data-pk-set="${n}" aria-pressed="${p.sel === n}">
        <img src="${setAvatar(n)}" alt="" loading="lazy">
        <b>ชุด ${n}</b><span>${mine ? "ใช้อยู่" : esc(label)} · ${count} รูป</span></button>`;
    };
    const visible = sets.filter((x) => !p.freeOnly || !holders(x.set).length || x.set === p.sel);
    const free = sets.filter((x) => !holders(x.set).length).length;

    const oldGrid = modal.querySelector(".pk-grid");
    const scroll = oldGrid?.scrollTop ?? 0;
    showModal(`<div class="adm-modal-card pk" role="dialog" aria-modal="true" aria-labelledby="pk-title">
      <header class="adm-modal-head">
        <img class="adm-avatar" src="${studentAvatar(r)}" alt="">
        <div><h2 id="pk-title">เลือกชุดรูปให้ ${esc(who(r))}</h2><p class="muted">ตอนนี้ใช้ ${r.portraitSet ? `ชุดที่ ${r.portraitSet}` : "ไม่มีรูป"} · ทั้งชุดผิดคน → เลือกชุดที่ถูกแล้วกด "สลับ" · ผิดบางรูป → ใช้ปุ่ม "จัดทีละรูป"</p></div>
        <button class="btn-outline me-small" type="button" data-photos="s${r.no}">${icon("image", 14)} จัดทีละรูป</button>
        <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
      </header>
      <div class="pk-body">
        <section class="pk-side">
          <h3>${sel ? `ชุดที่ ${sel.set} · ${sel.portraits.length} รูป` : "ไม่มีรูป"}</h3>
          ${preview}
          <div class="pk-actions">${pickerActions(r, p.sel, p.sel === r.portraitSet)}</div>
        </section>
        <section class="pk-list">
          <div class="pk-tools">
            <label class="pk-free"><input type="checkbox" data-pk-free${p.freeOnly ? " checked" : ""}> แสดงเฉพาะชุดที่ยังว่าง</label>
            <span class="muted">${sets.length} ชุด · ว่าง ${free}</span>
          </div>
          <div class="pk-grid">
            <button type="button" class="pk-card pk-card-none${p.sel == null ? " is-sel" : ""}${r.portraitSet == null ? " is-cur" : ""}" data-pk-set="" aria-pressed="${p.sel == null}"><span class="pk-nophoto">${icon("eyeOff", 22)}</span><b>ไม่มีรูป</b><span>ไม่ใช้ชุดรูป</span></button>
            ${visible.map((x) => card(x.set, x.portraits.length)).join("")}
          </div>
        </section>
      </div>
    </div>`);
    const grid = modal.querySelector<HTMLElement>(".pk-grid")!;
    const selected = grid.querySelector<HTMLElement>(".is-sel");
    if (first) selected?.scrollIntoView({ block: "center" });
    else grid.scrollTop = scroll;
    selected?.focus({ preventScroll: true });
  }

  async function saveSet(r: Row, set: number | null) {
    const out = await api.adminUpdate(r.no, { portraitSet: set });
    Object.assign(r, out.student);
  }

  async function assignPick(mode: "swap" | "set") {
    const p = pick!;
    const r = findRow(p.no)!;
    const old = r.portraitSet;
    const other = mode === "swap" ? holders(p.sel).find((x) => x.no !== r.no) : undefined;
    modal
      .querySelectorAll<HTMLButtonElement>("[data-pk-assign]")
      .forEach((b) => (b.disabled = true));
    try {
      await saveSet(r, p.sel);
      if (other) await saveSet(other, old);
      applyStudentRecords(o.rows());
      refreshFaces();
      refreshSetButtons();
      closeModal();
      setStatus(
        other
          ? `สลับรูปแล้ว: ${who(r)} → ชุด ${p.sel} · ${who(other)} → ${old ? `ชุด ${old}` : "ไม่มีรูป"}`
          : `${who(r)} ใช้ ${p.sel ? `ชุดที่ ${p.sel}` : "ไม่มีรูป"} แล้ว`,
      );
      noteDuplicates();
    } catch (ex) {
      setStatus(`เปลี่ยนรูปไม่สำเร็จ: ${(ex as Error).message}`);
      applyStudentRecords(o.rows());
      refreshSetButtons();
      renderPicker();
    }
  }

  /* ================= decoration editor ================= */
  let styleOn = false;
  function openStyle(key: string) {
    const p = person(key);
    if (!p) return;
    pm = null;
    pick = null;
    styleOn = true;
    let draft: ProfileTheme = { ...p.theme };
    const short = p.label.replace(/^เลขที่ \d+ ?/, "") || p.label;
    showModal(`<div class="adm-modal-card st" role="dialog" aria-modal="true" aria-labelledby="st-title">
      <header class="adm-modal-head">
        <img class="adm-avatar" src="${p.avatar}" alt="">
        <div><h2 id="st-title">ตกแต่งหน้าโปรไฟล์ · ${esc(p.label)}</h2><p class="muted">${key[0] === "s" ? "นักเรียนแก้เองได้ที่หน้า /me ด้วย" : "หน้าของคุณครูบนเว็บ"}</p></div>
        <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
      </header>
      <div class="st-body">
        <div class="st-prev" data-st-prev aria-label="ตัวอย่าง">
          <img class="st-prev-avatar" src="${p.avatar}" alt="">
          <div class="st-prev-text"><b><span>${esc(short)}</span> <span data-st-emoji></span></b><small>${esc(p.href)}</small><p data-st-song></p></div>
          <div class="st-prev-tags" data-st-tags></div>
          <div class="st-prev-tabs"><span class="is-on">รูป</span><span>เกี่ยวกับ</span><span>อัลบั้ม</span></div>
        </div>
        <div data-theme-editor>${themeEditorHtml(draft)}</div>
      </div>
      <footer class="adm-modal-foot">
        <span class="muted" data-st-msg></span>
        <button class="btn-outline me-small" type="button" data-st-reset>ล้างการตกแต่ง</button>
        <a class="btn-outline me-small" href="${p.href}" target="_blank" rel="noopener">ดูหน้าจริง ${icon("arrowUpRight", 14)}</a>
        <button class="me-btn me-small" type="button" data-st-save>${icon("check", 15)} บันทึก</button>
      </footer>
    </div>`);
    const prev = modal.querySelector<HTMLElement>("[data-st-prev]")!;
    const msg = modal.querySelector<HTMLElement>("[data-st-msg]")!;
    const paint = () => {
      applyTheme(prev, draft);
      prev
        .querySelector(".st-prev-avatar")!
        .classList.toggle("is-square", draft.avatar === "square");
      prev.querySelector("[data-st-emoji]")!.textContent = draft.emoji ?? "";
      prev.querySelector("[data-st-song]")!.textContent = draft.song ? `♪ ${draft.song}` : "";
      prev.querySelector("[data-st-tags]")!.innerHTML = hobbyList(draft)
        .map((h) => `<span>${esc(h)}</span>`)
        .join("");
    };
    paint();
    bindThemeEditor(modal.querySelector<HTMLElement>("[data-theme-editor]")!, draft, (t) => {
      draft = t;
      msg.textContent = "ยังไม่ได้บันทึก";
      paint();
    });
    const save = async (t: ProfileTheme) => {
      msg.textContent = "กำลังบันทึก…";
      try {
        await p.save({ theme: t });
        root
          .querySelectorAll<HTMLElement>(`[data-style="${key}"]`)
          .forEach((b) => (b.innerHTML = styleInner(t)));
        closeModal();
        setStatus(`บันทึกการตกแต่งของ ${p.label} แล้ว`);
      } catch (ex) {
        msg.textContent = `บันทึกไม่สำเร็จ: ${(ex as Error).message}`;
      }
    };
    modal.querySelector("[data-st-save]")!.addEventListener("click", () => void save(draft));
    modal.querySelector("[data-st-reset]")!.addEventListener("click", () => void save({}));
    modal.querySelector<HTMLElement>("[data-st-save]")!.focus();
  }

  /* ================= teachers tab ================= */
  let tab = "";
  let host: HTMLElement | null = null;
  let confirmDel = 0;

  async function loadTeachers(body: HTMLElement) {
    tab = "teachers";
    host = body;
    setStatus("คุณครูของห้อง · ครูที่ยังไม่ใส่ชื่อ หรือกดซ่อนไว้ จะยังไม่แสดงบนเว็บ");
    body.innerHTML = `<p class="muted">กำลังโหลด…</p>`;
    await refreshRoster();
    renderTeachers();
  }
  /** Called when another tab opens. */
  const leaveTab = () => {
    tab = "";
    host = null;
  };

  const tField = (
    t: Teacher,
    key: "name" | "nickname" | "role" | "subject" | "quote",
    label: string,
    ph = "",
    area = false,
  ) =>
    `<label class="tch-field${area ? " is-wide" : ""}"><span>${label}</span>${
      area
        ? `<textarea data-tch-key="${key}" rows="2" maxlength="300" placeholder="${esc(ph)}">${esc(String(t[key] ?? ""))}</textarea>`
        : `<input data-tch-key="${key}" type="text" maxlength="100" value="${esc(String(t[key] ?? ""))}" placeholder="${esc(ph)}">`
    }</label>`;

  function teacherCard(t: Teacher, i: number) {
    const k = `t${t.id}`;
    const live = t.name && !t.hidden;
    return `<article class="tch-card${live ? "" : " is-off"}" data-tch="${t.id}">
      <div class="tch-side">
        <button class="adm-avatar-btn tch-av" type="button" data-photos="${k}" title="จัดรูป"><img class="adm-avatar" src="${teacherAvatar(t)}" alt="" data-avatar="${k}"><span class="adm-avatar-edit">${icon("image", 12)}</span></button>
        <span class="tch-status">${live ? `${icon("check", 12)} แสดงบนเว็บ` : t.hidden ? "ซ่อนอยู่" : "ยังไม่มีชื่อ"}</span>
      </div>
      <div class="tch-fields">
        ${tField(t, "name", "ชื่อ–นามสกุล *", "เช่น นางสาว…")}
        ${tField(t, "nickname", "ชื่อที่นักเรียนเรียก", "เช่น ครูแอน")}
        ${tField(t, "role", "ตำแหน่ง", "เช่น ครูประจำชั้น")}
        ${tField(t, "subject", "วิชาที่สอน", "เช่น คณิตศาสตร์")}
        ${tField(t, "quote", "ข้อความถึงนักเรียน", "", true)}
      </div>
      <div class="tch-actions">
        <span class="adm-state" data-tch-state="${t.id}"></span>
        <button class="btn-outline me-small" type="button" data-photos="${k}">${icon("image", 14)} รูป (<span data-photo-count="${k}">${ownedPhotos(k).length}</span>)</button>
        <button class="adm-style-btn" type="button" data-style="${k}">${styleInner(t.theme)}</button>
        <button class="btn-outline me-small" type="button" data-tch-hide>${t.hidden ? "แสดงบนเว็บ" : "ซ่อน"}</button>
        <span class="tch-move">
          <button type="button" data-tch-move="-1" aria-label="เลื่อนขึ้น" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-tch-move="1" aria-label="เลื่อนลง" ${i === teachers.length - 1 ? "disabled" : ""}>↓</button>
        </span>
        <button class="btn-outline me-small pm-danger" type="button" data-tch-del>${confirmDel === t.id ? "กดอีกครั้งเพื่อลบ" : "ลบ"}</button>
        ${live ? `<a class="adm-open" href="${teacherUrl(t)}" target="_blank" rel="noopener" title="เปิดหน้าครู">${icon("arrowUpRight", 16)}</a>` : ""}
      </div>
    </article>`;
  }

  function renderTeachers() {
    if (!host) return;
    host.innerHTML = `<section class="tch">
      <div class="tch-head">
        <div><h2>คุณครู <span class="muted">(${teachers.length})</span></h2>
        <p class="muted">ใส่ชื่อแล้วบันทึกอัตโนมัติ · กด "รูป" เพื่อเลือกรูปจากชุดรูปเดี่ยว / อัปโหลดรูป · ลำดับนี้คือลำดับบนเว็บ</p></div>
        <button class="me-btn" type="button" data-tch-add>${icon("plus", 16)} เพิ่มครู</button>
      </div>
      <div class="tch-list">${teachers.map(teacherCard).join("") || `<p class="pm-empty">ยังไม่มีครู · กด "เพิ่มครู"</p>`}</div>
    </section>`;
  }

  async function teacherAction(fn: () => Promise<Roster>, msg?: string) {
    try {
      applyRoster(await fn());
      renderTeachers();
      if (msg) setStatus(msg);
    } catch (ex) {
      setStatus((ex as Error).message);
    }
  }

  async function saveTeacherField(el: HTMLInputElement | HTMLTextAreaElement) {
    const card = el.closest<HTMLElement>("[data-tch]")!;
    const id = Number(card.dataset.tch);
    const key = el.dataset.tchKey as keyof Teacher;
    const t = getTeacher(id);
    if (!t || t[key] === el.value.trim()) return;
    const st = card.querySelector<HTMLElement>("[data-tch-state]")!;
    st.textContent = "…";
    try {
      applyRoster(await api.adminUpdateTeacher(id, { [key]: el.value }));
      st.textContent = "✓";
      if (key === "name") {
        // the "shown on the site" badge depends on the name
        const fresh = getTeacher(id)!;
        const live = fresh.name && !fresh.hidden;
        card.classList.toggle("is-off", !live);
        card.querySelector(".tch-status")!.innerHTML = live
          ? `${icon("check", 12)} แสดงบนเว็บ`
          : fresh.hidden
            ? "ซ่อนอยู่"
            : "ยังไม่มีชื่อ";
      }
    } catch (ex) {
      st.textContent = "!";
      setStatus(`บันทึกไม่สำเร็จ: ${(ex as Error).message}`);
    }
  }

  /* ================= events (called from the page's delegated listeners) ================= */
  /** Returns true when the click belonged to these tools. */
  function onClick(t: Element): boolean {
    const zoomBox = t.closest(".pm-zoom");
    if (zoomBox) {
      zoomBox.remove();
      return true;
    }
    if (t.closest("[data-modal-close]")) {
      closeModal();
      return true;
    }
    const psOpen = t.closest<HTMLElement>("[data-ps-open]");
    if (psOpen) {
      openPerson(Number(psOpen.dataset.psOpen));
      return true;
    }
    if (ps && modal.querySelector(".ps")) {
      const go = t.closest<HTMLElement>("[data-ps-go]");
      if (go) {
        ps.no = Number(go.dataset.psGo);
        renderPerson();
        return true;
      }
      if (t.closest("[data-ps-reset]")) {
        void resetCode();
        return true;
      }
    }
    const nbOpen = t.closest<HTMLElement>("[data-nb-open]");
    if (nbOpen) {
      openBoard(nbOpen.dataset.nbOpen ? Number(nbOpen.dataset.nbOpen) : undefined);
      return true;
    }
    if (boardClick(t)) return true;
    const photosBtn = t.closest<HTMLElement>("[data-photos]");
    if (photosBtn) {
      pick = null;
      openPhotos(photosBtn.dataset.photos!);
      return true;
    }
    const pickBtn = t.closest<HTMLElement>("[data-pick]");
    if (pickBtn) {
      openPicker(Number(pickBtn.dataset.pick));
      return true;
    }
    const styleBtn = t.closest<HTMLElement>("[data-style]");
    if (styleBtn) {
      openStyle(styleBtn.dataset.style!);
      return true;
    }

    // teachers tab
    if (t.closest("[data-tch-add]")) {
      void teacherAction(() => api.adminAddTeacher(), "เพิ่มครูแล้ว · ใส่ชื่อในช่องใหม่ด้านล่าง").then(() =>
        host?.querySelector<HTMLElement>(".tch-card:last-child input")?.focus(),
      );
      return true;
    }
    const card = t.closest<HTMLElement>("[data-tch]");
    if (card && t.closest("button")) {
      const id = Number(card.dataset.tch);
      const tc = getTeacher(id);
      if (!tc) return true;
      const move = t.closest<HTMLElement>("[data-tch-move]");
      if (move) {
        void teacherAction(() => api.adminMoveTeacher(id, Number(move.dataset.tchMove) as -1 | 1));
        return true;
      }
      if (t.closest("[data-tch-hide]")) {
        void teacherAction(() => api.adminUpdateTeacher(id, { hidden: !tc.hidden }));
        return true;
      }
      if (t.closest("[data-tch-del]")) {
        if (confirmDel !== id) {
          confirmDel = id;
          renderTeachers();
          return true;
        }
        confirmDel = 0;
        void teacherAction(() => api.adminDeleteTeacher(id), `ลบ ${teacherLabel(tc)} แล้ว`);
        return true;
      }
    }

    // photo manager
    if (pm) {
      const mine = t.closest<HTMLElement>("[data-pm-mine]");
      if (mine) {
        const id = mine.dataset.pmMine!;
        if (pm.sel.has(id)) pm.sel.delete(id);
        else pm.sel.add(id);
        renderPhotos();
        return true;
      }
      const add = t.closest<HTMLElement>("[data-pm-add]");
      if (add) {
        const id = add.dataset.pmAdd!;
        if (pm.add.has(id)) pm.add.delete(id);
        else pm.add.add(id);
        renderPhotos();
        return true;
      }
      const zoom = t.closest<HTMLElement>("[data-pm-zoom]");
      if (zoom) {
        modal.insertAdjacentHTML(
          "beforeend",
          `<div class="pm-zoom" role="dialog" aria-label="รูปเต็ม"><img src="${zoom.dataset.pmZoom}" alt=""><span>กดที่ไหนก็ได้เพื่อปิด</span></div>`,
        );
        return true;
      }
      const filter = t.closest<HTMLElement>("[data-pm-filter]");
      if (filter) {
        pm.filter = filter.dataset.pmFilter!;
        renderPhotos();
        return true;
      }
      const act = t.closest<HTMLElement>("[data-pm-act]");
      if (act) {
        const a = act.dataset.pmAct!;
        if (a !== "delete") pendingConfirm = "";
        void photoAction(a);
        return true;
      }
    }

    // set picker
    if (pick) {
      const setBtn = t.closest<HTMLElement>("[data-pk-set]");
      if (setBtn) {
        pick.sel = setBtn.dataset.pkSet ? Number(setBtn.dataset.pkSet) : null;
        renderPicker();
        return true;
      }
      const thumbBtn = t.closest<HTMLElement>("[data-pk-thumb]");
      if (thumbBtn) {
        modal.querySelector<HTMLImageElement>("[data-pk-big]")!.src = thumbBtn.dataset.pkThumb!;
        modal
          .querySelectorAll(".pk-strip button")
          .forEach((b) => b.classList.toggle("is-on", b === thumbBtn));
        return true;
      }
      const assign = t.closest<HTMLElement>("[data-pk-assign]");
      if (assign) {
        void assignPick(assign.dataset.pkAssign as "swap" | "set");
        return true;
      }
    }
    return !!t.closest(".adm-modal, .tch");
  }

  function onChange(el: Element): boolean {
    if (el.matches("[data-ps-key]") && ps) {
      void savePersonField(el as HTMLInputElement);
      return true;
    }
    if (el.matches("[data-nb-to]") && nb) {
      const v = Math.trunc(Number((el as HTMLInputElement).value));
      nb.b = v >= 1 && v <= 99 ? v : null;
      nb.flash = [];
      renderBoard();
      return true;
    }
    if (el.matches("[data-pk-free]") && pick) {
      pick.freeOnly = (el as HTMLInputElement).checked;
      renderPicker();
      return true;
    }
    if (el.matches("[data-pm-set]") && pm) {
      const v = (el as HTMLSelectElement).value;
      if (v) pm.filter = v;
      renderPhotos();
      return true;
    }
    if (el.matches("[data-pm-upload]") && pm) {
      const files = [...((el as HTMLInputElement).files ?? [])];
      if (files.length) void uploadFiles(files);
      return true;
    }
    if (el.matches("[data-tch-key]")) {
      void saveTeacherField(el as HTMLInputElement);
      return true;
    }
    return !!el.closest(".adm-modal, .tch");
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    document.documentElement.classList.remove("adm-modal-open");
  }

  return {
    avatarCell,
    setButton,
    styleButton,
    noteDuplicates,
    refreshRoster,
    loadTeachers,
    leaveTab,
    onClick,
    onChange,
    dispose,
  };
}
