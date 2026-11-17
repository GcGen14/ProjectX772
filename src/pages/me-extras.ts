// /me sections: my character (Humation), social links and privacy.
// Rendered inside the profile editor (me.ts) and saved together with the rest of the profile.
import {
  SOCIALS,
  extrasOf,
  saveMyExtras,
  setExtrasFor,
  type CharacterState,
  type Privacy,
  type Social,
  type SocialType,
} from "../lib/extras.ts";
import { icon } from "../lib/icons.ts";
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

export function extrasEditorHtml(no: number): string {
  const e = extrasOf(no);
  const p = e.privacy;
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
    </section>

    <section class="me-section" data-mx-socials>
      <h2>${icon("globe", 18)} โซเชียลมีเดีย</h2>
      <p class="me-help small">ใส่ช่องทางติดต่ออื่น ๆ ได้สูงสุด ${MAX_SOCIALS} ช่องทาง จะขึ้นในหน้าโปรไฟล์ (Instagram ช่องด้านบนยังใช้ได้เหมือนเดิม)</p>
      <div class="mx-socials" data-social-list>${e.socials.map(socialRow).join("")}</div>
      <button type="button" class="btn-outline me-small" data-social-add>${icon("plus", 14)} เพิ่มช่องทาง</button>
    </section>

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
      const patch: Parameters<typeof saveMyExtras>[0] = { socials, privacy };
      if (charChanged) patch.character = character;
      const saved = await saveMyExtras(patch);
      setExtrasFor(no, saved); // avatars + face stickers update everywhere right away
      charChanged = false;
      // show what the server kept (it tidies handles / links)
      socials = saved.socials;
      host.querySelector<HTMLElement>("[data-social-list]")!.innerHTML = saved.socials
        .map(socialRow)
        .join("");
      return saved;
    },
  };
}
