// /me sections: my character (Humation), social links and privacy.
// Rendered inside the profile editor (me.ts) and saved together with the rest of the profile.
import {
  INFO_STATUS,
  SOCIALS,
  extrasOf,
  saveMyExtras,
  setExtrasFor,
  type CharacterState,
  type Info,
  type Privacy,
  type Social,
  type SocialType,
} from "../lib/extras.ts";
import { icon } from "../lib/icons.ts";
import {
  LAYOUT_LABELS,
  LAYOUT_TABS,
  cleanLayout,
  type HideKey,
  type Layout,
  type LayoutTab,
} from "../lib/layout.ts";
import { esc } from "../lib/router.ts";

const SLOT_LABELS: Record<string, string> = {
  head: "ทรงผม",
  body: "เสื้อ",
  bottom: "กางเกง / กระโปรง",
  item: "ของถือ",
  glasses: "แว่นตา",
};
const COLOR_LABELS: Record<string, string> = {
  hair: "สีผม",
  skin: "สีผิว",
  clothes: "สีเสื้อ",
  bottom: "สีกางเกง",
  background: "พื้นหลัง",
};
const MAX_SOCIALS = 10;
const MAX_PORTFOLIOS = 6;
const nice = (name: string) => name.replace(/-/g, " ");

const toggle = (key: keyof Privacy, on: boolean, title: string, help: string) => `
  <label class="mx-toggle">
    <input type="checkbox" data-privacy="${key}"${on ? " checked" : ""}>
    <span class="mx-switch" aria-hidden="true"></span>
    <span class="mx-toggle-text"><b>${title}</b><small>${help}</small></span>
  </label>`;

const socialRow = (s: Social) => `
  <div class="mx-social" data-social-row>
    <select data-social-type aria-label="แพลตฟอร์ม">${SOCIALS.map((m) => `<option value="${m.type}"${m.type === s.type ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
    <input type="text" data-social-value maxlength="200" value="${esc(s.value)}" placeholder="${esc(SOCIALS.find((m) => m.type === s.type)?.placeholder ?? "")}" aria-label="ชื่อผู้ใช้ หรือ ลิงก์">
    <button type="button" class="mx-icon-btn" data-social-remove aria-label="ลบ">${icon("trash", 16)}</button>
  </div>`;

const portRow = (p: { title: string; url: string }) => `
  <div class="mx-social mx-port" data-port-row>
    <input type="text" data-port-title maxlength="60" value="${esc(p.title)}" placeholder="ชื่อ เช่น พอร์ตออกแบบ" aria-label="ชื่อพอร์ต">
    <input type="text" data-port-url maxlength="300" value="${esc(p.url)}" placeholder="https://..." aria-label="ลิงก์พอร์ต" inputmode="url">
    <button type="button" class="mx-icon-btn" data-port-remove aria-label="ลบ">${icon("trash", 16)}</button>
  </div>`;

export type ExtrasPart = "character" | "socials" | "privacy" | "more" | "layout";

/** All three sections in one block (kept for callers that want them together). */
export const extrasEditorHtml = (no: number): string =>
  (["more", "character", "socials", "privacy", "layout"] as const)
    .map((k) => extrasSectionHtml(no, k))
    .join("");

/** One section; the editor can put each in its own tab as long as all sit inside bindExtrasEditor's host. */
export function extrasSectionHtml(no: number, part: ExtrasPart): string {
  const e = extrasOf(no);
  const p = e.privacy;
  if (part === "layout") return layoutSectionHtml(e.layout);
  if (part === "character")
    return `
    <section class="me-section" data-mx-character>
      <h2>${icon("user", 18)} ตัวการ์ตูนของฉัน</h2>
      <p class="me-help small">แต่งตัวการ์ตูนของตัวเอง ใช้แทนรูปหน้าจริงได้ทั้งเว็บ (ตัวการ์ตูนจาก <a href="https://github.com/humation-labs/humation" target="_blank" rel="noopener">Humation</a>)</p>
      <div class="mx-char">
        <div class="mx-char-stage">
          <img class="mx-char-img" src="/photos/humation/${no}.svg" alt="ตัวการ์ตูนของฉัน" data-char-preview>
          <button type="button" class="btn-outline me-small" data-char-random>${icon("sparkle", 14)} สุ่มใหม่</button>
        </div>
        <div class="mx-char-controls">
          <div class="mx-char-parts" data-char-parts><span class="skeleton" style="display:block;height:160px"></span></div>
          <div class="mx-char-colors" data-char-colors></div>
        </div>
      </div>
      ${toggle("useCharacter", !!p.useCharacter, "ใช้ตัวการ์ตูนเป็นรูปโปรไฟล์", "รูปโปรไฟล์ทุกที่ในเว็บจะเป็นตัวการ์ตูนนี้แทนรูปหน้า")}
    </section>`;
  if (part === "more") {
    const i = e.info;
    const txt = (
      k: string,
      label: string,
      v: string | undefined,
      ph: string,
      max: number,
      wide = false,
    ) =>
      `<label class="me-field${wide ? " th-wide" : ""}"><span>${label}</span><input type="text" data-info="${k}" maxlength="${max}" value="${esc(v ?? "")}" placeholder="${esc(ph)}"></label>`;
    const lines = (k: string, label: string, hint: string, v: string[] | undefined, ph: string) =>
      `<label class="me-field th-wide"><span>${label} <em>${hint}</em></span><textarea data-info-list="${k}" rows="3" placeholder="${esc(ph)}">${esc((v ?? []).join("\n"))}</textarea></label>`;
    return `
    <section class="me-section me2-first" data-mx-more>
      <h2>${icon("book", 18)} มหาวิทยาลัย / เป้าหมาย</h2>
      <p class="me-help small">ทุกช่องเว้นว่างได้ ช่องไหนไม่กรอกจะไม่แสดงในหน้าโปรไฟล์</p>
      <div class="me-grid">
        ${txt("university", "มหาวิทยาลัย", i.university, "เช่น จุฬาลงกรณ์มหาวิทยาลัย", 80)}
        ${txt("faculty", "คณะ / สาขา", i.faculty, "เช่น วิศวกรรมศาสตร์ คอมพิวเตอร์", 100)}
        ${txt("round", "รอบ / ช่องทางสมัคร", i.round, "เช่น TCAS รอบ 1 พอร์ต", 60)}
        <label class="me-field"><span>สถานะ</span>
          <select data-info="status"><option value="">ไม่ระบุ</option>${INFO_STATUS.map((s) => `<option value="${s.key}"${i.status === s.key ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        </label>
        ${txt("goal", "เป้าหมาย / ความฝันในอนาคต", i.goal, "เช่น อยากเป็นนักพัฒนาเกม", 200, true)}
      </div>
    </section>
    <section class="me-section">
      <h2>${icon("folder", 18)} เปิดพอร์ต</h2>
      <p class="me-help small">ลิงก์พอร์ตโฟลิโอ ผลงาน (Drive, Behance, GitHub, Canva ฯลฯ) ได้สูงสุด ${MAX_PORTFOLIOS} ลิงก์</p>
      <div class="mx-socials" data-port-list>${(i.portfolios ?? []).map(portRow).join("")}</div>
      <button type="button" class="btn-outline me-small" data-port-add>${icon("plus", 14)} เพิ่มพอร์ต</button>
    </section>
    <section class="me-section">
      <h2>${icon("sparkle", 18)} ทักษะ รางวัล กิจกรรม</h2>
      <div class="me-grid">
        ${lines("skills", "ทักษะ", "บรรทัดละ 1 อย่าง", i.skills, "Python\nวาดรูป\nตัดต่อวิดีโอ")}
        ${lines("openTo", "เปิดรับ", "เช่น รับงานฟรีแลนซ์", i.openTo, "รับงานออกแบบ\nหาเพื่อนทำโปรเจกต์")}
        ${lines("awards", "รางวัล / ผลงาน", "บรรทัดละ 1 อย่าง", i.awards, "ชนะเลิศ Hackathon 2568")}
        ${lines("activities", "กิจกรรม / ชมรม", "บรรทัดละ 1 อย่าง", i.activities, "ประธานชมรมถ่ายภาพ")}
      </div>
    </section>
    <section class="me-section">
      <h2>${icon("message", 18)} ช่องทางติดต่อ</h2>
      <div class="me-grid">${txt("email", "อีเมล (แสดงให้ทุกคนเห็นในหน้าโปรไฟล์)", i.email, "ไม่อยากแสดงก็เว้นว่าง", 100, true)}</div>
    </section>`;
  }
  if (part === "socials")
    return `
    <section class="me-section" data-mx-socials>
      <h2>${icon("globe", 18)} โซเชียลมีเดีย</h2>
      <p class="me-help small">ใส่ช่องทางติดต่ออื่น ๆ ได้สูงสุด ${MAX_SOCIALS} ช่องทาง จะขึ้นในหน้าโปรไฟล์ (Instagram ช่องด้านบนยังใช้ได้เหมือนเดิม)</p>
      <div class="mx-socials" data-social-list>${e.socials.map(socialRow).join("")}</div>
      <button type="button" class="btn-outline me-small" data-social-add>${icon("plus", 14)} เพิ่มช่องทาง</button>
    </section>`;
  return `
    <section class="me-section" data-mx-privacy>
      <h2>${icon("shield", 18)} ความเป็นส่วนตัว</h2>
      <div class="mx-toggles">
        ${toggle("noindex", !!p.noindex, "ไม่ให้ Google / search engine เก็บหน้าโปรไฟล์ของฉัน", "หน้าโปรไฟล์จะบอก search engine ว่าห้ามเก็บเข้าผลค้นหา (คนที่มีลิงก์ยังเปิดดูได้)")}
        ${toggle("hidePhotos", !!p.hidePhotos, "ซ่อนรูปในหน้าโปรไฟล์ของฉัน", "ไม่แสดงรูปที่มีเรา รูปเดี่ยว และรูปปก ในหน้าโปรไฟล์ของเรา")}
        ${toggle("hideFace", !!p.hideFace, "ซ่อนหน้าของฉันทั้งเว็บ", "ใช้ตัวการ์ตูนแทนรูปโปรไฟล์และรูปเดี่ยว และแปะตัวการ์ตูนทับหน้าเราในรูปหมู่ที่ระบบหาหน้าเจอ")}
      </div>
      <p class="me-help small mx-note">${icon("eyeOff", 14)} การซ่อนหน้าทำบนเว็บนี้เท่านั้น รูปต้นฉบับใน Google Drive ของห้องยังเหมือนเดิม และรูปที่ระบบหาหน้าไม่เจอ (เช่นหน้าเล็กมาก) อาจยังเห็นอยู่ ถ้าเจอรูปไหนที่ยังเห็นหน้า ให้กดแท็กตัวเองในรูปนั้น หรือแจ้งผู้ดูแลห้อง</p>
    </section>`;
}

/* ---------------- layout (จัดหน้าโปรไฟล์) ---------------- */

const showToggle = (key: string, shown: boolean, label: string) => `
  <label class="mx-toggle mx-lay">
    <input type="checkbox" data-lay-show="${key}"${shown ? " checked" : ""}>
    <span class="mx-switch" aria-hidden="true"></span>
    <span class="mx-toggle-text"><b>${esc(label)}</b></span>
  </label>`;

function layoutSectionHtml(l: Layout): string {
  const hid = (k: string) => !!l.hide?.includes(k as HideKey);
  const order = [
    ...(l.tabs ?? []),
    ...LAYOUT_TABS.filter((t) => !(l.tabs ?? []).includes(t)),
  ] as LayoutTab[];
  const group = (title: string, keys: string[]) =>
    `<div class="mx-lay-group"><h3>${title}</h3><div class="mx-toggles">${keys.map((k) => showToggle(k, !hid(k), LAYOUT_LABELS.hide[k])).join("")}</div></div>`;
  return `
    <section class="me-section me2-first" data-mx-layout>
      <h2>${icon("grid", 18)} จัดหน้าโปรไฟล์</h2>
      <p class="me-help small">เปิด/ปิดส่วนที่อยากให้เพื่อนเห็น เรียงแท็บใหม่ และเลือกขนาดรูป ทุกอย่างมีผลกับหน้าโปรไฟล์ของคุณหลังกดบันทึก</p>

      <div class="mx-lay-group">
        <h3>แท็บ <small>ใช้ลูกศรเลื่อนลำดับ</small></h3>
        <ol class="mx-lay-tabs" data-lay-tabs>${order
          .map(
            (t) => `<li class="mx-lay-tab" data-lay-tab="${t}">
          <label class="mx-toggle mx-lay"><input type="checkbox" data-lay-show="tab:${t}"${hid(`tab:${t}`) ? "" : " checked"}><span class="mx-switch" aria-hidden="true"></span><span class="mx-toggle-text"><b>${esc(LAYOUT_LABELS.tabs[t])}</b></span></label>
          <span class="mx-lay-move"><button type="button" class="mx-icon-btn" data-lay-move="-1" aria-label="เลื่อนขึ้น">${icon("chevronLeft", 16)}</button><button type="button" class="mx-icon-btn" data-lay-move="1" aria-label="เลื่อนลง">${icon("chevronRight", 16)}</button></span>
        </li>`,
          )
          .join("")}</ol>
        <label class="me-field mx-lay-select"><span>แท็บที่เปิดก่อน</span>
          <select data-lay-start><option value="">แท็บแรก</option>${LAYOUT_TABS.map((t) => `<option value="${t}"${l.start === t ? " selected" : ""}>${esc(LAYOUT_LABELS.tabs[t])}</option>`).join("")}</select>
        </label>
      </div>

      ${group("ส่วนบนของหน้า", ["cover", "bio", "badges", "friends", "tags", "share"])}
      ${group("ข้อมูลที่แสดง (ซ่อนได้ทุกที่ ทั้งด้านบน แท็ก และแท็บเกี่ยวกับ)", ["fullName", "studentId", "group", "birthday", "dream", "socials", "song", "hobbies", "note", "info", "mates"])}

      <div class="mx-lay-group">
        <h3>รูปแบบ</h3>
        <div class="me-grid">
          <label class="me-field"><span>รูปปก</span>
            <select data-lay-cover><option value="slideshow">สไลด์หลายรูป</option><option value="single"${l.cover === "single" ? " selected" : ""}>รูปเดียว</option></select>
          </label>
          <label class="me-field"><span>ความทรงจำ</span>
            <select data-lay-memories><option value="grid">รวมเป็นตารางเดียว</option><option value="events"${l.memories === "events" ? " selected" : ""}>แยกตามเหตุการณ์</option></select>
          </label>
          <label class="me-field"><span>จำนวนคอลัมน์รูป</span>
            <select data-lay-cols><option value="">อัตโนมัติ</option>${[2, 3, 4, 5].map((n) => `<option value="${n}"${l.cols === n ? " selected" : ""}>${n} คอลัมน์</option>`).join("")}</select>
          </label>
        </div>
      </div>
      <div class="me-row"><button type="button" class="btn-outline me-small" data-lay-reset>${icon("close", 14)} คืนค่าเริ่มต้น</button></div>
    </section>`;
}

/** Read the layout section back from its controls. */
export function readLayoutFrom(root: HTMLElement): Layout {
  const hide: string[] = [];
  root.querySelectorAll<HTMLInputElement>("[data-lay-show]").forEach((c) => {
    if (!c.checked) hide.push(c.dataset.layShow!);
  });
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-lay-tab]")].map(
    (li) => li.dataset.layTab!,
  );
  const sel = (q: string) => root.querySelector<HTMLSelectElement>(q)?.value ?? "";
  return cleanLayout({
    hide,
    tabs,
    start: sel("[data-lay-start]"),
    cols: Number(sel("[data-lay-cols]")) || undefined,
    memories: sel("[data-lay-memories]"),
    cover: sel("[data-lay-cover]"),
  });
}

type PartsResponse = { parts: Record<string, string[]>; colors: string[]; current: CharacterState };

/** Wire the sections up. Returns save(), which the editor calls when the profile is saved. */
export function bindExtrasEditor(host: HTMLElement, no: number, onDirty: () => void) {
  const e = extrasOf(no);
  let socials: Social[] = e.socials.map((s) => ({ ...s }));
  let privacy: Privacy = { ...e.privacy };
  let character: CharacterState = {
    selections: { ...e.character.selections },
    colors: { ...e.character.colors },
  };
  let info: Info = JSON.parse(JSON.stringify(e.info));
  let layout: Layout = JSON.parse(JSON.stringify(e.layout ?? {}));
  let layoutChanged = false;
  let charChanged = false;
  let parts: Record<string, string[]> = {};

  /* ---- character ---- */
  const preview = host.querySelector<HTMLImageElement>("[data-char-preview]")!;
  const partsHost = host.querySelector<HTMLElement>("[data-char-parts]")!;
  const colorsHost = host.querySelector<HTMLElement>("[data-char-colors]")!;
  let previewTimer = 0;
  const showPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      preview.src = `/api/character/preview?no=${no}&s=${encodeURIComponent(JSON.stringify(character))}`;
    }, 120);
  };
  const changed = () => {
    charChanged = true;
    onDirty();
    showPreview();
  };
  const renderControls = () => {
    partsHost.innerHTML = Object.entries(parts)
      .map(
        ([slot, names]) => `
        <div class="mx-part">
          <span>${SLOT_LABELS[slot] ?? slot}</span>
          <div class="mx-stepper">
            <button type="button" class="mx-icon-btn" data-step="-1" data-slot="${slot}" aria-label="ก่อนหน้า">${icon("chevronLeft", 16)}</button>
            <select data-slot-select="${slot}" aria-label="${SLOT_LABELS[slot] ?? slot}">${names.map((n) => `<option value="${esc(n)}"${character.selections[slot] === n ? " selected" : ""}>${esc(nice(n))}</option>`).join("")}</select>
            <button type="button" class="mx-icon-btn" data-step="1" data-slot="${slot}" aria-label="ถัดไป">${icon("chevronRight", 16)}</button>
          </div>
        </div>`,
      )
      .join("");
    colorsHost.innerHTML = Object.keys(COLOR_LABELS)
      .map(
        (k) => `
        <label class="mx-color" title="${COLOR_LABELS[k]}">
          <input type="color" data-char-color="${k}" value="${esc(character.colors[k] ?? "#ffffff")}">
          <span>${COLOR_LABELS[k]}</span>
        </label>`,
      )
      .join("");
  };
  fetch(`/api/character/parts?no=${no}`, { credentials: "same-origin" })
    .then((r) => r.json() as Promise<PartsResponse>)
    .then((r) => {
      parts = r.parts;
      // start from what the student has now (their default avatar if they never edited it)
      character = {
        selections: { ...r.current.selections, ...character.selections },
        colors: { ...r.current.colors, ...character.colors },
      };
      renderControls();
      if (e.hasCharacter)
        preview.src = `/media/characters/${no}.svg?v=${encodeURIComponent(e.updatedAt)}`;
    })
    .catch(() => {
      partsHost.innerHTML = `<p class="me-help small">ต้องเปิดเว็บผ่าน npm run dev / preview / start ถึงจะแต่งตัวการ์ตูนได้</p>`;
    });

  host.addEventListener("click", (ev) => {
    const t = ev.target as Element;
    const step = t.closest<HTMLElement>("[data-step]");
    if (step) {
      const slot = step.dataset.slot!;
      const names = parts[slot] ?? [];
      const i = names.indexOf(character.selections[slot]);
      const next = names[(i + Number(step.dataset.step) + names.length) % names.length];
      character.selections[slot] = next;
      host.querySelector<HTMLSelectElement>(`[data-slot-select="${slot}"]`)!.value = next;
      return changed();
    }
    if (t.closest("[data-char-random]")) {
      for (const [slot, names] of Object.entries(parts)) {
        character.selections[slot] = names[Math.floor(Math.random() * names.length)];
      }
      renderControls();
      return changed();
    }
    if (t.closest("[data-social-add]")) {
      const list = host.querySelector<HTMLElement>("[data-social-list]")!;
      if (list.children.length >= MAX_SOCIALS) return;
      const used = new Set(readSocials().map((s) => s.type));
      const type = (SOCIALS.find((m) => !used.has(m.type)) ?? SOCIALS[0]).type;
      list.insertAdjacentHTML("beforeend", socialRow({ type, value: "" }));
      list
        .querySelector<HTMLInputElement>("[data-social-row]:last-child [data-social-value]")
        ?.focus();
      syncSocials();
      return;
    }
    const rm = t.closest("[data-social-remove]");
    if (rm) {
      rm.closest("[data-social-row]")?.remove();
      syncSocials();
    }
  });

  host.addEventListener("change", (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.slotSelect) {
      character.selections[el.dataset.slotSelect] = el.value;
      return changed();
    }
    if (el.dataset.privacy) {
      privacy = { ...privacy, [el.dataset.privacy]: (el as HTMLInputElement).checked };
      onDirty();
      return;
    }
    if (el.matches("[data-social-type]")) {
      const meta = SOCIALS.find((m) => m.type === el.value);
      const input = el
        .closest("[data-social-row]")
        ?.querySelector<HTMLInputElement>("[data-social-value]");
      if (input && meta) input.placeholder = meta.placeholder;
      syncSocials();
    }
  });
  host.addEventListener("input", (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset.charColor) {
      character.colors[el.dataset.charColor] = el.value;
      return changed();
    }
    if (el.matches("[data-social-value]")) syncSocials();
  });

  /* ---- more about me ---- */
  function readInfo(): Info {
    const out: Record<string, unknown> = {};
    host.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-info]").forEach((el) => {
      if (el.value.trim()) out[el.dataset.info!] = el.value.trim();
    });
    host.querySelectorAll<HTMLTextAreaElement>("[data-info-list]").forEach((el) => {
      const list = el.value
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      if (list.length) out[el.dataset.infoList!] = list;
    });
    const ports = [...host.querySelectorAll<HTMLElement>("[data-port-row]")]
      .map((row) => ({
        title: row.querySelector<HTMLInputElement>("[data-port-title]")!.value.trim(),
        url: row.querySelector<HTMLInputElement>("[data-port-url]")!.value.trim(),
      }))
      .filter((p) => p.url);
    if (ports.length) out.portfolios = ports;
    return out as Info;
  }
  const syncInfo = () => {
    info = readInfo();
    host.querySelector<HTMLButtonElement>("[data-port-add]")!.disabled =
      host.querySelectorAll("[data-port-row]").length >= MAX_PORTFOLIOS;
    onDirty();
  };
  host.addEventListener("click", (ev) => {
    const t = ev.target as Element;
    if (t.closest("[data-port-add]")) {
      const list = host.querySelector<HTMLElement>("[data-port-list]")!;
      if (list.children.length >= MAX_PORTFOLIOS) return;
      list.insertAdjacentHTML("beforeend", portRow({ title: "", url: "" }));
      list.querySelector<HTMLInputElement>("[data-port-row]:last-child [data-port-title]")?.focus();
      syncInfo();
    } else if (t.closest("[data-port-remove]")) {
      t.closest("[data-port-row]")?.remove();
      syncInfo();
    }
  });
  host.addEventListener("input", (ev) => {
    const el = ev.target as HTMLElement;
    if (el.matches("[data-info], [data-info-list], [data-port-title], [data-port-url]")) syncInfo();
  });
  host.addEventListener("change", (ev) => {
    if ((ev.target as HTMLElement).matches("[data-info]")) syncInfo();
  });

  /* ---- layout ---- */
  const layHost = () => host.querySelector<HTMLElement>("[data-mx-layout]");
  const layDirty = () => {
    const h = layHost();
    if (!h) return;
    layout = readLayoutFrom(h);
    layoutChanged = true;
    onDirty();
  };
  host.addEventListener("change", (ev) => {
    if ((ev.target as HTMLElement).closest("[data-mx-layout]")) layDirty();
  });
  host.addEventListener("click", (ev) => {
    const t = ev.target as Element;
    const mv = t.closest<HTMLElement>("[data-lay-move]");
    if (mv) {
      const li = mv.closest<HTMLElement>("[data-lay-tab]")!;
      const dir = Number(mv.dataset.layMove);
      const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (sib && dir < 0) sib.before(li);
      else if (sib) sib.after(li);
      return layDirty();
    }
    if (t.closest("[data-lay-reset]")) {
      const h = layHost();
      if (!h) return;
      h.outerHTML = layoutSectionHtml({});
      layout = {};
      layoutChanged = true;
      onDirty();
    }
  });

  /* ---- socials ---- */
  function readSocials(): Social[] {
    return [...host.querySelectorAll<HTMLElement>("[data-social-row]")]
      .map((row) => ({
        type: row.querySelector<HTMLSelectElement>("[data-social-type]")!.value as SocialType,
        value: row.querySelector<HTMLInputElement>("[data-social-value]")!.value.trim(),
      }))
      .filter((s) => s.value);
  }
  function syncSocials() {
    socials = readSocials();
    const add = host.querySelector<HTMLButtonElement>("[data-social-add]")!;
    add.disabled = host.querySelectorAll("[data-social-row]").length >= MAX_SOCIALS;
    onDirty();
  }

  return {
    async save() {
      const patch: Parameters<typeof saveMyExtras>[0] = { socials, privacy, info };
      if (charChanged) patch.character = character;
      if (layoutChanged) patch.layout = layout;
      const saved = await saveMyExtras(patch);
      layoutChanged = false;
      layout = saved.layout ?? {};
      setExtrasFor(no, saved); // avatars + face stickers update everywhere right away
      charChanged = false;
      // show what the server kept (it tidies handles / links)
      socials = saved.socials;
      info = saved.info;
      host.querySelector<HTMLElement>("[data-port-list]")!.innerHTML = (saved.info.portfolios ?? [])
        .map(portRow)
        .join("");
      host.querySelector<HTMLElement>("[data-social-list]")!.innerHTML = saved.socials
        .map(socialRow)
        .join("");
      return saved;
    },
  };
}
