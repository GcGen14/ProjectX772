// /backend — admin view of the class database (requires the admin password).
import { songNavButton } from "../lib/song.ts";
import {
  BRAND,
  CLASS,
  STUDENT_GROUPS,
  applyAlbums,
  applyStudentRecords,
  driveFolder,
  type StudentRecord,
  profileUrl,
} from "../data.ts";
import { api, refreshSession, type AdminAlbum, type Job } from "../lib/api.ts";
import { icon, logoMark } from "../lib/icons.ts";
import { esc, type Cleanup } from "../lib/router.ts";
import { createPeopleTools } from "./backend-people.ts";
import { wallCard } from "./wall.ts";

type Row = StudentRecord & {
  account: { claimed: boolean; code: string | null; lastLogin: string | null };
};
type Field = {
  key: Exclude<keyof StudentRecord, "theme" | "badges" | "specialTheme">;
  label: string;
  kind?: "area" | "group" | "set";
  width?: number;
  placeholder?: string;
};

const FIELDS: Field[] = [
  { key: "nickname", label: "ชื่อเล่น", width: 120, placeholder: "เช่น มายด์" },
  { key: "fullName", label: "ชื่อ–นามสกุล", width: 220, placeholder: "นาย/นางสาว …" },
  { key: "nicknameEn", label: "ชื่อเล่น (EN)", width: 110 },
  { key: "quote", label: "คำคม / ข้อความ", kind: "area", width: 240 },
  { key: "dream", label: "ความฝัน / คณะ", width: 170 },
  { key: "ig", label: "Instagram", width: 130, placeholder: "ไม่ต้องใส่ @" },
  { key: "birthday", label: "วันเกิด", width: 100, placeholder: "12 มี.ค." },
  { key: "group", label: "กลุ่ม", kind: "group", width: 76 },
  { key: "portraitSet", label: "ชุดรูปเดี่ยว", kind: "set", width: 110 },
  { key: "photoNote", label: "หมายเหตุ", width: 160 },
];
const GROUPS = ["", ...STUDENT_GROUPS];

export function renderBackend(root: HTMLElement): Cleanup {
  document.title = `ฐานข้อมูลนักเรียน · ${BRAND}`;
  document.body.className = "page-backend";
  let alive = true;
  let rows: Row[] = [];

  root.innerHTML = `
  <div class="adm">
    <header class="adm-head">
      <a class="nav-logo" href="/" data-link>${logoMark(20)}<span>${BRAND}</span></a>
      ${songNavButton("pill")}
      <div class="adm-title"><h1>ฐานข้อมูลนักเรียน ${CLASS.name}</h1><p class="muted" data-status>กำลังโหลด…</p></div>
      <div class="adm-actions" data-actions hidden>
        <span class="adm-student-tools">
          <input class="adm-search" type="search" placeholder="ค้นหา เลขที่ / ชื่อ" data-search>
          <button class="btn-outline adm-btn" type="button" data-nb-open>${icon("users", 16)} จัดเลขที่ / รูปโปรไฟล์</button>
          <button class="btn-outline adm-btn" type="button" data-print>${icon("users", 16)} พิมพ์รหัสเข้าใช้</button>
          <button class="btn-outline adm-btn" type="button" data-download>${icon("share", 16)} ส่งออก JSON</button>
        </span>
        <button class="btn-outline adm-btn" type="button" data-logout>${icon("close", 16)} ออกจากระบบ</button>
      </div>
    </header>
    <nav class="adm-tabs" data-tabs hidden role="tablist">
      <button type="button" role="tab" class="is-on" data-admtab="students">${icon("users", 16)} นักเรียน</button>
      <button type="button" role="tab" data-admtab="teachers">${icon("book", 16)} คุณครู</button>
      <button type="button" role="tab" data-admtab="albums">${icon("folder", 16)} อัลบั้ม / โฟลเดอร์รูป</button>
      <button type="button" role="tab" data-admtab="wall">${icon("heart", 16)} ข้อความสาธารณะ</button>
    </nav>
    <div data-body></div>
  </div>`;
  // listeners go on this page's own container so they disappear with it
  const wrap = root.querySelector<HTMLElement>(".adm")!;
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const setStatus = (m: string) => (status.textContent = m);
  // photo-set picker (fix wrong photo ↔ number) + profile decoration modals
  const people = createPeopleTools({
    root,
    wrap,
    rows: () => rows,
    setStatus,
    profileHref: profileUrl,
    reload: () => loadTable(),
  });

  async function start() {
    const me = await refreshSession();
    if (!alive) return;
    try {
      await api.students();
    } catch (e) {
      setStatus((e as Error).message);
      body.innerHTML = "";
      return;
    }
    if (me.user && "admin" in me.user) return openTab(tab);
    showLogin();
  }

  function showLogin() {
    setStatus("สำหรับผู้ดูแลห้องเท่านั้น");
    body.innerHTML = `
      <form class="me-card me-narrow adm-login" data-login novalidate>
        <h2>เข้าสู่ระบบผู้ดูแล</h2>
        <label class="me-field"><span>รหัสผ่านผู้ดูแล</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="me-error" data-error role="alert"></p>
        <button class="me-btn me-block" type="submit">เข้าสู่ระบบ</button>
        <p class="me-help small">รหัสถูกสร้างครั้งแรกไว้ในไฟล์ <code>data/ADMIN_PASSWORD.txt</code> ในโฟลเดอร์โปรเจกต์ (หรือตั้งเองด้วยตัวแปร ADMIN_PASSWORD)</p>
      </form>`;
    const form = body.querySelector<HTMLFormElement>("[data-login]")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-error]")!;
      try {
        await api.adminLogin((form.elements.namedItem("password") as HTMLInputElement).value);
        await refreshSession();
        openTab(tab);
      } catch (ex) {
        err.textContent = (ex as Error).message;
      }
    });
  }

  /* ---------------- tabs ---------------- */
  type Tab = "students" | "teachers" | "albums" | "wall";
  let tab: Tab =
    location.hash === "#albums"
      ? "albums"
      : location.hash === "#wall"
        ? "wall"
        : location.hash === "#teachers"
          ? "teachers"
          : "students";
  function openTab(t: Tab) {
    tab = t;
    history.replaceState(null, "", t === "students" ? location.pathname : `#${t}`);
    root.querySelector<HTMLElement>("[data-tabs]")!.hidden = false;
    root.querySelector<HTMLElement>("[data-actions]")!.hidden = false;
    root.querySelector<HTMLElement>(".adm-student-tools")!.hidden = t !== "students";
    root
      .querySelectorAll<HTMLElement>("[data-admtab]")
      .forEach((b) => b.classList.toggle("is-on", b.dataset.admtab === t));
    stopPolling();
    people.leaveTab();
    if (t === "students") void loadTable();
    else if (t === "teachers") void people.loadTeachers(body);
    else if (t === "wall") void loadWall();
    else void loadAlbums();
  }

  /* ---------------- albums ---------------- */
  let albumsList: AdminAlbum[] = [];
  let jobs: Record<string, Job> = {};
  let pollId = 0;
  let confirmDelete = "";
  function stopPolling() {
    if (pollId) clearInterval(pollId);
    pollId = 0;
  }
  const coverSrc = (a: AdminAlbum) =>
    a.cover
      ? `/${a.cover.base ?? "photos"}/${a.cover.large ? "large" : "thumbs"}/${a.cover.id}.jpg`
      : "";
  const fmtTime = (v: string) => {
    if (!v) return "ยังไม่เคย";
    const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
    return Number.isNaN(d.getTime())
      ? v
      : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(d);
  };
  const jobHtml = (j: Job | undefined) => {
    if (!j) return "";
    const pct = j.total ? Math.round((j.done / j.total) * 100) : j.state === "running" ? 8 : 100;
    const mark =
      j.state === "running" ? icon("clock", 13) : j.state === "error" ? "⚠️" : icon("check", 13);
    const progress = j.state === "running" && j.total ? ` (${j.done}/${j.total})` : "";
    return `<div class="alb-job is-${j.state}">
      ${j.state === "running" ? `<div class="alb-bar"><span style="width:${pct}%"></span></div>` : ""}
      <span>${mark} ${esc(j.message)}${progress}</span>
    </div>`;
  };

  function albumCard(a: AdminAlbum) {
    const j = jobs[a.slug];
    const busy = j?.state === "running";
    const cover = coverSrc(a);
    return `<article class="alb-card${a.hidden ? " is-hidden" : ""}" data-album="${a.slug}">
      <div class="alb-cover">${cover ? `<img src="${cover}" alt="" loading="lazy">` : icon("image", 28)}</div>
      <div class="alb-info">
        <div class="alb-title"><b>${esc(a.title)}</b>${a.en ? `<span class="muted">${esc(a.en)}</span>` : ""}${a.builtin ? `<span class="alb-badge">ตั้งต้น</span>` : ""}${a.hidden ? `<span class="alb-badge is-warn">ซ่อนอยู่</span>` : ""}</div>
        <p class="alb-meta">${a.photoCount.toLocaleString()} รูป · ${a.videoCount} คลิป · ซิงก์ล่าสุด ${esc(fmtTime(a.syncedAt ?? ""))}</p>
        <p class="alb-folders">${a.folders
          .map(
            (f, i) =>
              `<a href="${driveFolder(f)}" target="_blank" rel="noopener">${icon("folder", 13)} โฟลเดอร์ ${i + 1}</a>`,
          )
          .join("")}</p>
        ${jobHtml(j)}
        <form class="alb-edit" data-edit-form hidden>
          <label>ชื่ออัลบั้ม<input name="title" maxlength="80" value="${esc(a.title)}" required></label>
          <label>ชื่อภาษาอังกฤษ<input name="en" maxlength="60" value="${esc(a.en)}"></label>
          <label class="wide">คำอธิบายสั้น<input name="tagline" maxlength="200" value="${esc(a.tagline)}"></label>
          <label class="wide">เกี่ยวกับอัลบั้ม<textarea name="about" maxlength="1000" rows="3">${esc(a.about)}</textarea></label>
          <label class="check wide"><input type="checkbox" name="showGroups"${a.showGroups ? " checked" : ""}> แสดงปุ่มกรองตามโฟลเดอร์ย่อย</label>
          <div class="alb-row wide"><button class="me-btn me-small" type="submit">บันทึก</button><button class="btn-outline me-small" type="button" data-edit-cancel>ยกเลิก</button></div>
        </form>
        <form class="alb-addfolder" data-folder-form hidden>
          <input name="folder" placeholder="วางลิงก์โฟลเดอร์ Google Drive เพิ่มเติม" required>
          <button class="me-btn me-small" type="submit">เพิ่มและซิงก์</button>
        </form>
      </div>
      <div class="alb-actions">
        <button class="btn-outline me-small" type="button" data-sync ${busy ? "disabled" : ""}>${icon("clock", 14)} ซิงก์ใหม่</button>
        <button class="btn-outline me-small" type="button" data-folder-open>${icon("plus", 14)} เพิ่มโฟลเดอร์</button>
        <button class="btn-outline me-small" type="button" data-edit-open>${icon("pen", 14)} แก้ไข</button>
        <button class="btn-outline me-small" type="button" data-hide>${a.hidden ? "แสดงบนเว็บ" : "ซ่อน"}</button>
        ${a.builtin ? "" : `<button class="btn-outline me-small alb-del" type="button" data-delete>${confirmDelete === a.slug ? "กดอีกครั้งเพื่อลบ" : "ลบ"}</button>`}
        <a class="adm-open" href="/album/${a.slug}" target="_blank" rel="noopener" title="เปิดอัลบั้ม">${icon("arrowUpRight", 16)}</a>
      </div>
    </article>`;
  }

  function renderAlbums() {
    const faces = jobs.faces;
    body.innerHTML = `
      <section class="alb-add me-card">
        <h2>${icon("plus", 18)} เพิ่มโฟลเดอร์ Google Drive</h2>
        <p class="me-help small">โฟลเดอร์ต้องแชร์แบบ <b>"ทุกคนที่มีลิงก์ดูได้"</b> · ระบบจะอ่านโฟลเดอร์ย่อยทั้งหมด ดาวน์โหลดภาพตัวอย่าง แล้วรูปจะขึ้นเว็บทันที (วิดีโอเล่นผ่าน Drive)</p>
        <form class="alb-form" data-add-form>
          <label class="wide">ลิงก์โฟลเดอร์ *<input name="folder" required placeholder="https://drive.google.com/drive/folders/..."></label>
          <label>ชื่ออัลบั้ม<input name="title" maxlength="80" placeholder="เว้นว่าง = ใช้ชื่อโฟลเดอร์"></label>
          <label>ชื่อภาษาอังกฤษ (ใช้ทำลิงก์)<input name="en" maxlength="60" placeholder="เช่น Sports Day"></label>
          <label class="wide">คำอธิบายสั้น<input name="tagline" maxlength="200" placeholder="เช่น กีฬาสีปีสุดท้ายของเรา"></label>
          <p class="me-error wide" data-add-error></p>
          <button class="me-btn" type="submit">${icon("folder", 16)} เพิ่มและเริ่มซิงก์</button>
        </form>
      </section>
      <section class="alb-faces me-card">
        <div>
          <h2>${icon("users", 18)} แท็กเพื่อนในรูปใหม่</h2>
          <p class="me-help small">หลังเพิ่มรูปใหม่ กดปุ่มนี้เพื่อหาใบหน้าและแท็กเพื่อนอัตโนมัติ (สแกนเฉพาะรูปที่ยังไม่เคยสแกน · ใช้ Python บนเครื่องนี้)</p>
          ${jobHtml(faces)}
        </div>
        <button class="me-btn" type="button" data-faces ${faces?.state === "running" ? "disabled" : ""}>${icon("sparkle", 16)} จับคู่ใบหน้า</button>
      </section>
      <h2 class="alb-h">อัลบั้มทั้งหมด <span class="muted">(${albumsList.length})</span></h2>
      <div class="alb-list">${albumsList.map(albumCard).join("")}</div>`;
  }

  /* ---------------- public messages (moderation) ---------------- */
  async function loadWall() {
    const { posts } = await api.adminWall();
    if (!alive || tab !== "wall") return;
    const pending = posts.filter((p) => p.status === "pending").length;
    setStatus(
      `ข้อความสาธารณะ ${posts.length} ข้อความ · รออนุมัติ ${pending} · ปกติเพื่อนที่ถูกเขียนถึงเป็นคนอนุมัติเอง ผู้ดูแลอนุมัติ / ซ่อน / ลบแทนได้ (แชทส่วนตัวเข้ารหัส ผู้ดูแลอ่านไม่ได้)`,
    );
    body.innerHTML = posts.length
      ? `<div class="wall-grid adm-wall">${posts
          .map((p) =>
            wallCard(p, {
              status: true,
              actions:
                p.status === "approved"
                  ? ["hide", "delete"]
                  : p.status === "hidden"
                    ? ["approve", "delete"]
                    : ["approve", "hide", "delete"],
            }),
          )
          .join("")}</div>`
      : `<p class="pf-empty">ยังไม่มีข้อความสาธารณะ</p>`;
  }

  async function loadAlbums() {
    setStatus("จัดการอัลบั้มรูป · เพิ่มโฟลเดอร์ Google Drive ใหม่ หรือซิงก์รูปที่เพิ่มเข้ามาในโฟลเดอร์เดิม");
    const r = await api.adminAlbums();
    albumsList = r.albums;
    jobs = r.jobs;
    renderAlbums();
    ensurePolling();
  }

  /** While a sync / face job runs, refresh its progress; when one ends, reload the albums for the site. */
  function ensurePolling() {
    const anyRunning = () => Object.values(jobs).some((j) => j.state === "running");
    if (!anyRunning() || pollId) return;
    pollId = window.setInterval(async () => {
      if (!alive || tab !== "albums") return stopPolling();
      const before = Object.entries(jobs)
        .filter(([, j]) => j.state === "running")
        .map(([k]) => k);
      jobs = (await api.adminJobs()).jobs;
      if (before.some((k) => jobs[k]?.state !== "running")) {
        albumsList = (await api.adminAlbums()).albums;
        void api.albums().then((x) => applyAlbums(x.albums)); // live site data in this tab too
      }
      // don't wipe a form the admin is typing in
      if (!body.querySelector("form:focus-within")) renderAlbums();
      if (!anyRunning()) stopPolling();
    }, 1500);
  }

  async function albumAction(fn: () => Promise<unknown>, okMsg?: string) {
    try {
      await fn();
      await loadAlbums();
      if (okMsg) setStatus(okMsg);
    } catch (ex) {
      setStatus((ex as Error).message);
    }
  }

  wrap.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    const f = new FormData(form);
    const val = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" ? v : "";
    };
    if (form.matches("[data-add-form]")) {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-add-error]")!;
      err.textContent = "";
      const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      btn.disabled = true;
      api
        .adminAddAlbum({
          folder: val("folder"),
          title: val("title"),
          en: val("en"),
          tagline: val("tagline"),
        })
        .then(() => loadAlbums())
        .then(() => setStatus("เพิ่มอัลบั้มแล้ว กำลังซิงก์รูป…"))
        .catch((ex: Error) => {
          err.textContent = ex.message;
          btn.disabled = false;
        });
      return;
    }
    const card = form.closest<HTMLElement>("[data-album]");
    if (!card) return;
    e.preventDefault();
    const slug = card.dataset.album!;
    if (form.matches("[data-edit-form]"))
      void albumAction(
        () =>
          api.adminUpdateAlbum(slug, {
            title: val("title"),
            en: val("en"),
            tagline: val("tagline"),
            about: val("about"),
            showGroups: f.get("showGroups") === "on",
          }),
        "บันทึกอัลบั้มแล้ว",
      );
    if (form.matches("[data-folder-form]"))
      void albumAction(() => api.adminAddFolder(slug, val("folder")), "เพิ่มโฟลเดอร์แล้ว กำลังซิงก์…");
  });

  const cell = (r: Row, f: Field) => {
    const v = r[f.key];
    const attrs = `data-no="${r.no}" data-key="${f.key}" aria-label="${f.label} เลขที่ ${r.no}"`;
    if (f.kind === "area") return `<textarea ${attrs} rows="2">${esc(String(v ?? ""))}</textarea>`;
    if (f.kind === "group")
      return `<select ${attrs}>${GROUPS.map((g) => `<option value="${g}"${g === v ? " selected" : ""}>${g || "—"}</option>`).join("")}</select>`;
    if (f.kind === "set") return people.setButton(r);
    return `<input ${attrs} type="text" value="${esc(String(v ?? ""))}" placeholder="${esc(f.placeholder ?? "")}">`;
  };

  const accountCell = (r: Row) =>
    r.account.claimed
      ? `<span class="adm-acc ok">${icon("check", 14)} ตั้งรหัสแล้ว</span>`
      : `<code class="adm-code" title="รหัสครั้งแรก">${esc(r.account.code ?? "—")}</code>`;

  async function loadTable() {
    root.querySelector<HTMLElement>("[data-actions]")!.hidden = false;
    setStatus("กำลังโหลดข้อมูล…");
    rows = (await api.adminStudents()).students;
    applyStudentRecords(rows);
    await people.refreshRoster(); // who owns which photo (profile pictures in the table)
    setStatus("แก้ไขแล้วระบบบันทึกให้อัตโนมัติเมื่อออกจากช่อง · นักเรียนเข้าสู่ระบบที่หน้า /me ด้วยเลขที่ + รหัสครั้งแรก");
    body.innerHTML = `
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>รูป</th><th>เลขที่</th><th>บัญชี</th>${FIELDS.map((f) => `<th style="min-width:${f.width ?? 120}px">${f.label}</th>`).join("")}<th></th></tr></thead>
          <tbody>${rows
            .map(
              (r) => `<tr data-row="${r.no}">
                <td>${people.avatarCell(r)}</td>
                <td class="adm-no"><b>${r.no}</b><button class="adm-ps-btn" type="button" data-ps-open="${r.no}" title="ตั้งค่าทั้งหมดของเลขที่ ${r.no}">${icon("pen", 13)} ตั้งค่า</button></td>
                <td class="adm-account"><span data-acc="${r.no}">${accountCell(r)}</span><button class="adm-reset" type="button" data-reset="${r.no}" title="สร้างรหัสครั้งแรกใหม่ (ลืมรหัส)">รีเซ็ต</button></td>
                ${FIELDS.map((f) => `<td>${cell(r, f)}</td>`).join("")}
                <td class="adm-row-end"><span class="adm-state" data-state="${r.no}"></span>${people.styleButton(r)}<a class="adm-open" href="${profileUrl(r)}" target="_blank" rel="noopener" title="เปิดโปรไฟล์">${icon("arrowUpRight", 16)}</a></td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
      <p class="adm-foot muted">ข้อมูลอยู่ในฐานข้อมูล <code>data/602.sqlite</code> · "ชุดรูปเดี่ยว" คือชุดรูปจากโฟลเดอร์ 602 (ดูใน <code>scripts/people_groups.json</code>) · กดที่รูปหรือปุ่มชุดรูปเพื่อเลือก / สลับรูปให้ถูกคน · ปุ่ม "ตกแต่ง" ใช้แต่งหน้าโปรไฟล์</p>`;
    people.noteDuplicates();
  }

  // save one field when it changes (on blur / select change)
  const saveField = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
    const no = Number(el.dataset.no);
    const key = el.dataset.key as keyof StudentRecord | undefined;
    const r = rows.find((x) => x.no === no);
    if (!key || !r) return;
    const value = el.value;
    if (value === r[key]) return;
    const st = root.querySelector<HTMLElement>(`[data-state="${no}"]`)!;
    st.textContent = "…";
    try {
      const out = await api.adminUpdate(no, { [key]: value });
      Object.assign(r, out.student);
      st.textContent = "✓";
      applyStudentRecords(rows);
    } catch (ex) {
      st.textContent = "!";
      st.title = (ex as Error).message;
      setStatus(`บันทึกเลขที่ ${no} ไม่สำเร็จ: ${(ex as Error).message}`);
    }
  };
  wrap.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (people.onChange(el)) return;
    if (el.dataset.key) void saveField(el);
  });

  wrap.addEventListener("click", async (e) => {
    const t = e.target as Element;
    if (people.onClick(t)) return;
    const tabBtn = t.closest<HTMLElement>("[data-admtab]");
    if (tabBtn) return openTab(tabBtn.dataset.admtab as Tab);
    const wallBtn = t.closest<HTMLButtonElement>("[data-wall-act]");
    if (wallBtn) {
      wallBtn.disabled = true;
      try {
        await api.wallAction(Number(wallBtn.dataset.id), wallBtn.dataset.wallAct as "approve");
        await loadWall();
      } catch (ex) {
        wallBtn.disabled = false;
        setStatus((ex as Error).message);
      }
      return;
    }
    if (t.closest("[data-faces]"))
      return void albumAction(() => api.adminRunFaces(), "เริ่มจับคู่ใบหน้าแล้ว");
    const card = t.closest<HTMLElement>("[data-album]");
    if (card && t.closest("button") && !t.closest("form")) {
      const slug = card.dataset.album!;
      const a = albumsList.find((x) => x.slug === slug)!;
      if (t.closest("[data-sync]"))
        return void albumAction(() => api.adminSyncAlbum(slug), `เริ่มซิงก์ ${a.title}`);
      if (t.closest("[data-hide]"))
        return void albumAction(() => api.adminUpdateAlbum(slug, { hidden: !a.hidden }));
      if (t.closest("[data-edit-open]")) {
        card.querySelector<HTMLElement>("[data-edit-form]")!.hidden = false;
        return;
      }
      if (t.closest("[data-folder-open]")) {
        const f = card.querySelector<HTMLElement>("[data-folder-form]")!;
        f.hidden = !f.hidden;
        return;
      }
      if (t.closest("[data-delete]")) {
        if (confirmDelete !== slug) {
          confirmDelete = slug;
          return renderAlbums();
        }
        confirmDelete = "";
        return void albumAction(() => api.adminDeleteAlbum(slug), `ลบอัลบั้ม ${a.title} แล้ว`);
      }
    }
    if (card && t.closest("[data-edit-cancel]")) {
      card.querySelector<HTMLElement>("[data-edit-form]")!.hidden = true;
      return;
    }
    const reset = t.closest<HTMLButtonElement>("[data-reset]");
    if (reset) {
      const no = Number(reset.dataset.reset);
      const r = rows.find((x) => x.no === no)!;
      reset.disabled = true;
      try {
        const out = await api.adminReset(no);
        r.account = { claimed: false, code: out.code, lastLogin: r.account.lastLogin };
        root.querySelector<HTMLElement>(`[data-acc="${no}"]`)!.innerHTML = accountCell(r);
        setStatus(`เลขที่ ${no}: รหัสครั้งแรกใหม่คือ ${out.code} (รหัสผ่านเดิมใช้ไม่ได้แล้ว)`);
      } catch (ex) {
        setStatus((ex as Error).message);
      } finally {
        reset.disabled = false;
      }
    }
    if (t.closest("[data-logout]")) {
      await api.logout().catch(() => {});
      await refreshSession();
      root.querySelector<HTMLElement>("[data-actions]")!.hidden = true;
      root.querySelector<HTMLElement>("[data-tabs]")!.hidden = true;
      stopPolling();
      showLogin();
    }
    if (t.closest("[data-download]")) {
      const clean = rows.map(({ account: _a, ...s }) => s);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify({ students: clean }, null, 1)], { type: "application/json" }),
      );
      a.download = "students.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (t.closest("[data-print]")) printCodes();
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches("[data-search]")) return;
    const q = el.value.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>("tr[data-row]").forEach((tr) => {
      const r = rows.find((x) => x.no === Number(tr.dataset.row))!;
      tr.hidden =
        !!q && !`${r.no} ${r.nickname} ${r.fullName} ${r.nicknameEn}`.toLowerCase().includes(q);
    });
  });

  /** Printable slips: one per student who hasn't set a password yet. */
  function printCodes() {
    const pending = rows.filter((r) => !r.account.claimed && r.account.code);
    const w = window.open("", "_blank");
    if (!w) return setStatus("เบราว์เซอร์บล็อกหน้าต่างใหม่ ลองอนุญาต pop-up");
    const slip = (r: Row) =>
      `<div class="slip"><b>${CLASS.name} · เลขที่ ${r.no}</b><span>${esc(r.nickname || "")}</span><div class="code">${esc(r.account.code!)}</div><small>เข้าสู่ระบบที่ ${esc(location.origin)}/me</small></div>`;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>รหัสเข้าใช้ ${CLASS.name}</title>
      <style>body{font-family:system-ui,sans-serif;margin:16px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .slip{border:1px dashed #999;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
      .code{font:700 26px/1.2 ui-monospace,monospace;letter-spacing:.15em;margin:6px 0}small{color:#666}</style>
      <h3>รหัสเข้าใช้ครั้งแรก (${pending.length} คน) — ตัดแจกทีละคน</h3><div class="grid">${pending.map(slip).join("")}</div>
      <script>window.onload=()=>window.print()</script>`);
    w.document.close();
  }

  void start();
  return () => {
    alive = false;
    stopPolling();
    people.dispose();
  };
}
