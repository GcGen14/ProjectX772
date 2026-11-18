// /backend: badges (หัวหน้าห้อง crown, Web Developer, Beta Tester, custom ones) and the
// admin-made "special theme" a student gets as their own preset on /me.
// Opened from a student's settings panel (backend-people.ts), which owns the modal.
import { applyStudentRecords, studentAvatar, type StudentRecord } from "../data.ts";
import { api } from "../lib/api.ts";
import {
  applyBadges,
  badgeCatalog,
  badgeChip,
  badgeRow,
  badgesOf,
  crownSvg,
  hasCrown,
  type Badge,
} from "../lib/badges.ts";
import { icon } from "../lib/icons.ts";
import { esc } from "../lib/router.ts";
import { applyTheme, bindThemeEditor, themeEditorHtml, type ProfileTheme } from "../lib/theme.ts";

type Hooks = {
  modal: HTMLElement;
  showModal: (html: string) => void;
  /** mark the modal as a sub-tool so closing it returns to the student's panel */
  enterSub: () => void;
  rows: () => StudentRecord[];
  label: (r: StudentRecord) => string;
  profileHref: (r: StudentRecord) => string;
  setStatus: (msg: string) => void;
};

export function createBadgeTools(h: Hooks) {
  const row = (no: number) => h.rows().find((r) => r.no === no);
  const save = async (r: StudentRecord, patch: Partial<StudentRecord>) => {
    const out = await api.adminUpdate(r.no, patch);
    Object.assign(r, out.student);
    applyStudentRecords(h.rows());
  };
  const head = (r: StudentRecord, title: string, sub: string) => `
    <header class="adm-modal-head">
      <img class="adm-avatar" src="${studentAvatar(r)}" alt="">
      <div><h2 id="bd-title">${title} · ${esc(h.label(r))}</h2><p class="muted">${sub}</p></div>
      <button class="adm-x" type="button" data-modal-close aria-label="ปิด">${icon("close", 20)}</button>
    </header>`;
  const $ = <T extends HTMLElement>(sel: string) => h.modal.querySelector<T>(sel)!;

  /* ================= give / take badges ================= */
  function openBadges(no: number) {
    const r = row(no);
    if (!r) return;
    h.enterSub();
    const mine = new Set(r.badges ?? []);
    const preview = () => {
      $("[data-bd-prev]").innerHTML = `
        <span class="bd-face">${hasCrown([...mine]) ? crownSvg("bd-crown") : ""}<img src="${studentAvatar(r)}" alt=""></span>
        <b>${esc(r.nickname || h.label(r))}</b>
        ${badgeRow([...mine]) || `<span class="muted">ยังไม่มีป้าย</span>`}`;
    };
    h.showModal(`<div class="adm-modal-card bd" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      ${head(r, "ป้ายและมงกุฎ", "กดเพื่อให้ / เอาออก · บันทึกทันที")}
      <div class="bd-body">
        <div class="bd-prev" data-bd-prev></div>
        <div class="bd-grid">${badgeCatalog()
          .map(
            (b) =>
              `<button type="button" class="bd-pick" data-bd-id="${esc(b.id)}" aria-pressed="${mine.has(b.id)}">${badgeChip(b)}${b.crown ? `<small>${icon("sparkle", 12)} มงกุฎบนรูป</small>` : ""}</button>`,
          )
          .join("")}</div>
      </div>
      <footer class="adm-modal-foot">
        <span class="muted" data-bd-msg></span>
        <button class="btn-outline me-small" type="button" data-bd-catalog>${icon("pen", 14)} จัดการรายการป้าย</button>
        <a class="btn-outline me-small" href="${h.profileHref(r)}" target="_blank" rel="noopener">ดูหน้าจริง ${icon("arrowUpRight", 14)}</a>
      </footer>
    </div>`);
    preview();
    const msg = $("[data-bd-msg]");
    $(".bd-grid").addEventListener("click", async (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-bd-id]");
      if (!b) return;
      const id = b.dataset.bdId!;
      if (mine.has(id)) mine.delete(id);
      else mine.add(id);
      b.setAttribute("aria-pressed", String(mine.has(id)));
      preview();
      msg.textContent = "กำลังบันทึก…";
      try {
        await save(r, { badges: [...mine] });
        msg.textContent = "✓ บันทึกแล้ว";
      } catch (ex) {
        msg.textContent = `บันทึกไม่สำเร็จ: ${(ex as Error).message}`;
      }
    });
    $("[data-bd-catalog]").addEventListener("click", () => openCatalog(no));
  }

  /* ================= edit the badge list ================= */
  function openCatalog(backTo: number) {
    const r = row(backTo);
    if (!r) return;
    let list: Badge[] = badgeCatalog().map((b) => ({ ...b }));
    const rowHtml = (b: Badge, i: number) => `
      <div class="bc-row" data-bc="${i}">
        <input class="bc-emoji" data-bc-k="emoji" maxlength="8" value="${esc(b.emoji)}" aria-label="อีโมจิ" placeholder="✨">
        <input class="bc-name" data-bc-k="name" maxlength="30" value="${esc(b.name)}" aria-label="ชื่อป้าย" placeholder="ชื่อป้าย">
        <input class="bc-color" type="color" data-bc-k="color" value="${esc(b.color)}" aria-label="สี">
        <label class="bc-crown"><input type="checkbox" data-bc-k="crown"${b.crown ? " checked" : ""}> มงกุฎ</label>
        <span class="bc-prev">${badgeChip(b)}</span>
        <button class="adm-x" type="button" data-bc-del="${i}" aria-label="ลบป้ายนี้">${icon("close", 16)}</button>
      </div>`;
    const render = () => {
      $("[data-bc-list]").innerHTML = list.map(rowHtml).join("");
    };
    h.showModal(`<div class="adm-modal-card bd" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      ${head(r, "รายการป้าย", "ป้ายที่ใช้ได้ทั้งเว็บ · ลบป้ายแล้วจะหายจากทุกคนที่มี")}
      <div class="bd-body">
        <div class="bc-list" data-bc-list></div>
        <button class="btn-outline me-small bc-add" type="button" data-bc-add>${icon("plus", 14)} เพิ่มป้ายใหม่</button>
      </div>
      <footer class="adm-modal-foot">
        <span class="muted" data-bd-msg></span>
        <button class="btn-outline me-small" type="button" data-bc-back>${icon("chevronLeft", 14)} กลับ</button>
        <button class="me-btn me-small" type="button" data-bc-save>${icon("check", 15)} บันทึกรายการ</button>
      </footer>
    </div>`);
    render();
    const msg = $("[data-bd-msg]");
    const listEl = $("[data-bc-list]");
    listEl.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      const i = Number(el.closest<HTMLElement>("[data-bc]")?.dataset.bc);
      const k = el.dataset.bcK as keyof Badge | undefined;
      if (!k || !list[i]) return;
      if (k === "crown") list[i].crown = el.checked || undefined;
      else list[i][k] = el.value;
      el.closest("[data-bc]")!.querySelector(".bc-prev")!.innerHTML = badgeChip(list[i]);
      msg.textContent = "ยังไม่ได้บันทึก";
    });
    listEl.addEventListener("click", (e) => {
      const del = (e.target as Element).closest<HTMLElement>("[data-bc-del]");
      if (!del) return;
      list.splice(Number(del.dataset.bcDel), 1);
      render();
      msg.textContent = "ยังไม่ได้บันทึก";
    });
    $("[data-bc-add]").addEventListener("click", () => {
      list.push({ id: "", name: "", emoji: "⭐", color: "#0569ff" });
      render();
      listEl.querySelector<HTMLInputElement>(".bc-row:last-child .bc-name")?.focus();
    });
    $("[data-bc-back]").addEventListener("click", () => openBadges(backTo));
    $("[data-bc-save]").addEventListener("click", async () => {
      msg.textContent = "กำลังบันทึก…";
      try {
        const out = await api.adminSaveBadges(list.filter((b) => b.name.trim()));
        applyBadges(out.badges);
        list = out.badges.map((b) => ({ ...b }));
        h.setStatus("บันทึกรายการป้ายแล้ว");
        openBadges(backTo);
      } catch (ex) {
        msg.textContent = `บันทึกไม่สำเร็จ: ${(ex as Error).message}`;
      }
    });
  }

  /* ================= special theme: a one-off look made for one student ================= */
  function openSpecial(no: number) {
    const r = row(no);
    if (!r) return;
    h.enterSub();
    const had = r.specialTheme;
    let draft: ProfileTheme = { ...(had?.theme ?? r.theme) };
    h.showModal(`<div class="adm-modal-card st" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      ${head(r, "ธีมพิเศษ", "ออกแบบธีมเฉพาะคนนี้ เขาจะเห็นเป็นธีมสำเร็จรูปของตัวเองในหน้า /me")}
      <div class="st-body">
        <div class="st-prev" data-st-prev aria-label="ตัวอย่าง">
          <img class="st-prev-avatar" src="${studentAvatar(r)}" alt="">
          <div class="st-prev-text"><b><span>${esc(r.nickname || h.label(r))}</span> <span data-st-emoji></span></b><small data-sp-label></small></div>
          <div class="st-prev-tabs"><span class="is-on">รูป</span><span>เกี่ยวกับ</span><span>อัลบั้ม</span></div>
        </div>
        <div>
          <label class="me-field sp-name"><span>ชื่อธีม</span><input type="text" data-sp-name maxlength="30" value="${esc(had?.name ?? "")}" placeholder="เช่น ธีมหัวหน้าห้อง"></label>
          <div data-theme-editor>${themeEditorHtml(draft)}</div>
        </div>
      </div>
      <footer class="adm-modal-foot">
        <span class="muted" data-bd-msg>${had ? "มีธีมพิเศษอยู่แล้ว · แก้แล้วกดบันทึก" : ""}</span>
        ${had ? `<button class="btn-outline me-small" type="button" data-sp-clear>ลบธีมพิเศษ</button>` : ""}
        <button class="btn-outline me-small" type="button" data-sp-save>${icon("check", 15)} บันทึกให้เลือก</button>
        <button class="me-btn me-small" type="button" data-sp-apply title="บันทึก และเปลี่ยนหน้าโปรไฟล์เป็นธีมนี้ทันที">${icon("sparkle", 15)} บันทึก + ใช้เลย</button>
      </footer>
    </div>`);
    const prev = $("[data-st-prev]");
    const msg = $("[data-bd-msg]");
    const nameIn = $<HTMLInputElement>("[data-sp-name]");
    const paint = () => {
      applyTheme(prev, draft);
      prev
        .querySelector(".st-prev-avatar")!
        .classList.toggle("is-square", draft.avatar === "square");
      prev.querySelector("[data-st-emoji]")!.textContent = draft.emoji ?? "";
      prev.querySelector("[data-sp-label]")!.textContent = `✦ ${nameIn.value.trim() || "ธีมพิเศษ"}`;
    };
    paint();
    nameIn.addEventListener("input", paint);
    bindThemeEditor($("[data-theme-editor]"), draft, (t) => {
      draft = t;
      msg.textContent = "ยังไม่ได้บันทึก";
      paint();
    });
    const store = async (apply: boolean) => {
      if (!Object.keys(draft).length) {
        msg.textContent = "ยังไม่ได้ตกแต่งอะไรเลย";
        return;
      }
      msg.textContent = "กำลังบันทึก…";
      const special = { name: nameIn.value.trim() || "ธีมพิเศษ", theme: draft };
      try {
        await save(r, apply ? { specialTheme: special, theme: draft } : { specialTheme: special });
        h.setStatus(`${apply ? "บันทึกและใช้ธีมพิเศษ" : "บันทึกธีมพิเศษ"}ของ ${h.label(r)} แล้ว`);
        openSpecial(no);
      } catch (ex) {
        msg.textContent = `บันทึกไม่สำเร็จ: ${(ex as Error).message}`;
      }
    };
    $("[data-sp-save]").addEventListener("click", () => void store(false));
    $("[data-sp-apply]").addEventListener("click", () => void store(true));
    h.modal.querySelector("[data-sp-clear]")?.addEventListener("click", async () => {
      try {
        await save(r, { specialTheme: null });
        h.setStatus(`ลบธีมพิเศษของ ${h.label(r)} แล้ว`);
        openSpecial(no);
      } catch (ex) {
        msg.textContent = `ลบไม่สำเร็จ: ${(ex as Error).message}`;
      }
    });
  }

  /** Short summaries for the student's settings panel. */
  const summary = (r: StudentRecord) => ({
    badges: badgesOf(r.badges).length
      ? badgesOf(r.badges)
          .map((b) => `${esc(b.emoji)} ${esc(b.name)}`)
          .join(" · ")
      : "หัวหน้าห้อง (มงกุฎ) · Beta Tester · Web Developer …",
    special: r.specialTheme ? `“${esc(r.specialTheme.name)}”` : "ออกแบบธีมเฉพาะคนนี้",
  });

  return { openBadges, openSpecial, summary };
}
