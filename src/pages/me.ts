// /me — students log in and customise their own profile.
import {
  BRAND,
  CLASS,
  STUDENT_GROUPS,
  applyStudentRecords,
  getStudent,
  large,
  photoSrc,
  portraitPhotos,
  students,
  studentAvatar,
  type StudentRecord,
  profileUrl,
} from "../data.ts";
import { ApiError, api, refreshSession, session } from "../lib/api.ts";
import { forgetKeys } from "../lib/e2e.ts";
import { icon } from "../lib/icons.ts";
import { esc, navigate, type Cleanup } from "../lib/router.ts";
import { applyTheme, bindThemeEditor, themeEditorHtml } from "../lib/theme.ts";
import { bindExtrasEditor, extrasEditorHtml } from "./me-extras.ts";
import { rail } from "./profile.ts";

const LIMITS = {
  nickname: 40,
  fullName: 100,
  nicknameEn: 40,
  quote: 300,
  dream: 120,
  ig: 30,
  birthday: 40,
};

export function renderMe(root: HTMLElement): Cleanup {
  document.title = `โปรไฟล์ของฉัน · ${BRAND}`;
  document.body.className = "page-profile page-me";
  root.innerHTML = `<div class="pf-app">${rail()}<main class="pf-main me-main" id="pf-main"><div class="me-wrap" data-view><div class="me-card"><span class="skeleton" style="display:block;height:220px"></span></div></div></main></div>`;
  const view = root.querySelector<HTMLElement>("[data-view]")!;
  let alive = true;

  const fieldError = (el: HTMLElement | null, msg: string) => {
    if (el) el.textContent = msg;
  };

  async function start() {
    const me = await refreshSession().catch(() => session);
    if (!alive) return;
    // probe the API so we can explain when the site runs without the database server
    try {
      await api.students();
    } catch (e) {
      view.innerHTML = `<div class="me-card me-narrow"><h1>โปรไฟล์ของฉัน</h1><p class="me-help">${esc((e as Error).message)}</p><a class="btn-outline" href="/" data-link>กลับหน้าแรก</a></div>`;
      return;
    }
    if (!me.user) return showLogin();
    if ("admin" in me.user) {
      view.innerHTML = `<div class="me-card me-narrow"><h1>คุณเข้าสู่ระบบเป็นผู้ดูแล</h1><p class="me-help">หน้านี้สำหรับนักเรียนแก้โปรไฟล์ตัวเอง</p><div class="me-row"><a class="me-btn" href="/backend" data-link>ไปหน้า backend</a><button class="btn-outline" type="button" data-logout>ออกจากระบบ</button></div></div>`;
      bindLogout();
      return;
    }
    if (me.user.needsPassword) return showSetPassword(me.user.no);
    showEditor("student" in me ? me.student : null);
  }

  /* ---------------- login ---------------- */
  function showLogin() {
    view.innerHTML = `
      <form class="me-card me-narrow" data-login novalidate>
        <div class="me-head">${icon("users", 22)}<div><h1>เข้าสู่ระบบ</h1><p class="me-help">เพื่อแก้ไขโปรไฟล์ของตัวเองใน ${CLASS.name}</p></div></div>
        <label class="me-field"><span>เลขที่</span>
          <div class="me-picker">
            <img class="me-pick-avatar" src="${studentAvatar(students[0])}" alt="" data-pick-avatar>
            <select name="no" required>${students.map((s) => `<option value="${s.no}">${s.no} · ${esc(s.nickname)}</option>`).join("")}</select>
          </div>
        </label>
        <label class="me-field"><span>รหัสผ่าน หรือ รหัสครั้งแรก 6 ตัว</span>
          <input name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="เช่น K7Q2MX">
        </label>
        <p class="me-error" data-error role="alert"></p>
        <button class="me-btn me-block" type="submit">เข้าสู่ระบบ</button>
        <p class="me-help small">ครั้งแรกให้ใช้รหัส 6 ตัวที่ได้จากผู้ดูแลห้อง แล้วระบบจะให้ตั้งรหัสผ่านของตัวเอง ลืมรหัส? ให้ผู้ดูแลกดรีเซ็ตให้ในหน้า backend</p>
      </form>`;
    const form = view.querySelector<HTMLFormElement>("[data-login]")!;
    const sel = form.querySelector<HTMLSelectElement>("select")!;
    const av = form.querySelector<HTMLImageElement>("[data-pick-avatar]")!;
    sel.addEventListener("change", () => (av.src = studentAvatar(getStudent(Number(sel.value))!)));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-error]");
      const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      const pw = (form.elements.namedItem("password") as HTMLInputElement).value;
      if (!pw) return fieldError(err, "กรอกรหัสก่อนนะ");
      btn.disabled = true;
      try {
        const r = await api.login(Number(sel.value), pw);
        await refreshSession();
        if (r.needsPassword) showSetPassword(Number(sel.value));
        else void start();
      } catch (ex) {
        fieldError(err, (ex as Error).message);
        btn.disabled = false;
      }
    });
  }

  /* ---------------- first password ---------------- */
  function showSetPassword(no: number) {
    view.innerHTML = `
      <form class="me-card me-narrow" data-setpw novalidate>
        <div class="me-head"><img class="me-head-avatar" src="${studentAvatar(getStudent(no) ?? { no, portraitSet: null })}" alt=""><div><h1>ตั้งรหัสผ่านของตัวเอง</h1><p class="me-help">เลขที่ ${no} · ใช้รหัสนี้แทนรหัสครั้งแรกในครั้งต่อไป</p></div></div>
        <label class="me-field"><span>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</span><input name="next" type="password" autocomplete="new-password" minlength="6" maxlength="200" required></label>
        <label class="me-field"><span>พิมพ์อีกครั้ง</span><input name="again" type="password" autocomplete="new-password" required></label>
        <p class="me-error" data-error role="alert"></p>
        <button class="me-btn me-block" type="submit">บันทึกรหัสผ่าน</button>
      </form>`;
    const form = view.querySelector<HTMLFormElement>("[data-setpw]")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-error]");
      const next = (form.elements.namedItem("next") as HTMLInputElement).value;
      const again = (form.elements.namedItem("again") as HTMLInputElement).value;
      if (next.length < 6) return fieldError(err, "รหัสผ่านต้องยาวอย่างน้อย 6 ตัว");
      if (next !== again) return fieldError(err, "รหัสผ่านสองช่องไม่ตรงกัน");
      try {
        await api.setPassword(next);
        void start();
      } catch (ex) {
        fieldError(err, (ex as Error).message);
      }
    });
  }

  /* ---------------- profile editor ---------------- */
  function showEditor(rec: StudentRecord | null) {
    if (!rec) return showLogin();
    const s = getStudent(rec.no)!;
    const draft: StudentRecord = { ...rec };
    const coverChoices = [...portraitPhotos(s), ...s.memories.slice(0, 18)];
    const input = (key: keyof typeof LIMITS, label: string, ph = "", area = false) => `
      <label class="me-field"><span>${label}<em data-count="${key}"></em></span>
        ${
          area
            ? `<textarea name="${key}" rows="3" maxlength="${LIMITS[key]}" placeholder="${esc(ph)}">${esc(String(draft[key] ?? ""))}</textarea>`
            : `<input name="${key}" type="text" maxlength="${LIMITS[key]}" value="${esc(String(draft[key] ?? ""))}" placeholder="${esc(ph)}">`
        }
      </label>`;

    view.innerHTML = `
      <div class="me-layout">
        <aside class="me-card me-preview" aria-label="ตัวอย่างโปรไฟล์">
          <div class="me-preview-cover"><img alt="" data-prev-cover></div>
          <img class="me-preview-avatar" src="${studentAvatar(s)}" alt="" data-prev-avatar>
          <h2><span data-prev="nickname"></span> <span data-prev="emoji" aria-hidden="true"></span></h2>
          <p class="me-preview-handle">@602.${String(s.no).padStart(2, "0")} · เลขที่ ${s.no}</p>
          <p class="me-preview-quote" data-prev="quote"></p>
          <p class="me-preview-line">${icon("sparkle", 14)}<span data-prev="dream"></span></p>
          <a class="btn-outline me-block" href="${profileUrl(s)}" data-link data-profile-link>ดูหน้าโปรไฟล์จริง ${icon("arrowUpRight", 14)}</a>
        </aside>
        <form class="me-card me-form" data-edit novalidate>
          <div class="me-form-head"><h1>แก้ไขโปรไฟล์</h1><button class="btn-outline me-small" type="button" data-logout>${icon("close", 14)} ออกจากระบบ</button></div>
          <div class="me-grid">
            ${input("nickname", "ชื่อเล่น", "เช่น มายด์")}
            ${input("nicknameEn", "ชื่อเล่นภาษาอังกฤษ", "เช่น Mind")}
            ${input("fullName", "ชื่อ–นามสกุล", "นาย / นางสาว …")}
            ${input("birthday", "วันเกิด", "เช่น 12 มี.ค.")}
            ${input("ig", "Instagram", "ไม่ต้องใส่ @")}
            ${input("dream", "ความฝัน / คณะที่อยากเข้า", "เช่น วิศวะคอม")}
            <label class="me-field"><span>กลุ่ม</span>
              <select name="group">${["", ...STUDENT_GROUPS].map((g) => `<option value="${g}"${g === draft.group ? " selected" : ""}>${g || "ยังไม่เลือก"}</option>`).join("")}</select>
            </label>
          </div>
          <div class="me-field me-slug">
            <span>ลิงก์โปรไฟล์ของฉัน<em data-slug-state></em></span>
            <div class="me-slug-row">
              <span class="me-slug-prefix">${esc(location.host)}/me/</span>
              <input name="slug" type="text" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(draft.slug ?? "")}" placeholder="ชื่อของคุณ เช่น mind.cpe">
              <button class="btn-outline me-small" type="button" data-copy-link title="คัดลอกลิงก์">${icon("share", 14)} คัดลอก</button>
            </div>
            <small class="me-help">a–z, 0–9, จุด ขีด ขีดล่าง · 3–30 ตัว · เว้นว่าง = ใช้ลิงก์ /member/${s.no}</small>
          </div>
          ${input("quote", "คำคม / ข้อความถึงเพื่อน", "อยากบอกอะไรเพื่อน ๆ 6/2", true)}
          ${
            coverChoices.length
              ? `<div class="me-field"><span>รูปปกโปรไฟล์</span><div class="me-covers" role="radiogroup">
                  <button type="button" class="me-cover${draft.coverPhoto ? "" : " is-on"}" data-cover="" role="radio" aria-checked="${!draft.coverPhoto}"><span>อัตโนมัติ</span></button>
                  ${coverChoices.map((p) => `<button type="button" class="me-cover${draft.coverPhoto === p.id ? " is-on" : ""}" data-cover="${p.id}" role="radio" aria-checked="${draft.coverPhoto === p.id}"><img src="${photoSrc(p)}" alt="" loading="lazy"></button>`).join("")}
                </div></div>`
              : ""
          }
          <section class="me-section">
            <h2>${icon("palette", 18)} ตกแต่งหน้าโปรไฟล์</h2>
            <p class="me-help small">เลือกสี พื้นหลัง และตัวอักษรของหน้าเรา ดูตัวอย่างได้ทางซ้าย แล้วกดบันทึก</p>
            <div data-theme-editor>${themeEditorHtml(draft.theme ?? {})}</div>
          </section>
          <div data-mx>${extrasEditorHtml(s.no)}</div>
          <p class="me-error" data-error role="alert"></p>
          <div class="me-row me-actions"><span class="me-saved" data-saved></span><button class="me-btn" type="submit" data-save>${icon("check", 16)} บันทึก</button></div>
          <details class="me-pw">
            <summary>เปลี่ยนรหัสผ่าน</summary>
            <div class="me-grid">
              <label class="me-field"><span>รหัสผ่านเดิม</span><input name="pwCurrent" type="password" autocomplete="current-password"></label>
              <label class="me-field"><span>รหัสผ่านใหม่</span><input name="pwNext" type="password" autocomplete="new-password" minlength="6"></label>
            </div>
            <p class="me-error" data-pw-error></p>
            <button class="btn-outline me-small" type="button" data-pw-save>เปลี่ยนรหัสผ่าน</button>
          </details>
        </form>
      </div>`;

    const form = view.querySelector<HTMLFormElement>("[data-edit]")!;
    const saved = view.querySelector<HTMLElement>("[data-saved]")!;
    const coverImg = view.querySelector<HTMLImageElement>("[data-prev-cover]")!;
    const refreshPreview = () => {
      const set = (k: string, v: string) =>
        (view.querySelector<HTMLElement>(`[data-prev="${k}"]`)!.textContent = v);
      set("nickname", draft.nickname || `เพื่อนเลขที่ ${s.no}`);
      set("quote", draft.quote || "ยังไม่ได้เขียนคำคม…");
      set("dream", draft.dream || "ความฝัน: รอเติม");
      set("emoji", draft.theme?.emoji ?? "");
      applyTheme(view.querySelector<HTMLElement>(".me-preview")!, draft.theme ?? {});
      view
        .querySelector("[data-prev-avatar]")!
        .classList.toggle("is-square", draft.theme?.avatar === "square");
      const chosen = coverChoices.find((p) => p.id === draft.coverPhoto) ?? coverChoices[0];
      if (chosen) coverImg.src = chosen.local ?? large(chosen);
      coverImg.hidden = !chosen;
      for (const [k, max] of Object.entries(LIMITS)) {
        const c = view.querySelector<HTMLElement>(`[data-count="${k}"]`);
        if (c) c.textContent = `${String(draft[k as keyof typeof LIMITS] ?? "").length}/${max}`;
      }
    };
    refreshPreview();

    // ---- personal address: live format + availability check ----
    const slugInput = form.querySelector<HTMLInputElement>('input[name="slug"]')!;
    const slugState = view.querySelector<HTMLElement>("[data-slug-state]")!;
    let slugTimer = 0;
    let slugOk = true;
    const checkSlug = () => {
      const v = slugInput.value.trim().toLowerCase();
      draft.slug = v;
      slugState.className = "";
      if (!v) {
        slugOk = true;
        slugState.textContent = "ใช้ลิงก์เลขที่แทน";
        return;
      }
      if (v === (rec.slug ?? "").toLowerCase()) {
        slugOk = true;
        slugState.textContent = "ลิงก์ปัจจุบันของคุณ";
        slugState.className = "is-ok";
        return;
      }
      slugState.textContent = "กำลังตรวจ…";
      clearTimeout(slugTimer);
      slugTimer = window.setTimeout(async () => {
        try {
          const r = await fetch(`/api/slug-check?slug=${encodeURIComponent(v)}`, {
            credentials: "same-origin",
          });
          const out = (await r.json()) as { ok: boolean; error?: string };
          if (slugInput.value.trim().toLowerCase() !== v) return; // user kept typing
          slugOk = out.ok;
          slugState.textContent = out.ok ? "ว่าง ใช้ได้ ✓" : (out.error ?? "ใช้ไม่ได้");
          slugState.className = out.ok ? "is-ok" : "is-bad";
        } catch {
          slugState.textContent = "";
        }
      }, 350);
    };
    slugInput.addEventListener("input", () => {
      // keep only allowed characters while typing
      const clean = slugInput.value.toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (clean !== slugInput.value) slugInput.value = clean;
      saved.textContent = "ยังไม่ได้บันทึก";
      checkSlug();
    });
    checkSlug();
    view.querySelector("[data-copy-link]")!.addEventListener("click", () => {
      const url = `${location.origin}${profileUrl({ no: s.no, slug: rec.slug })}`;
      void navigator.clipboard?.writeText(url).then(
        () => (saved.textContent = "คัดลอกลิงก์แล้ว ✓"),
        () => (saved.textContent = url),
      );
    });

    form.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name in LIMITS || el.name === "group") {
        (draft as Record<string, unknown>)[el.name] = el.value;
        saved.textContent = "ยังไม่ได้บันทึก";
        refreshPreview();
      }
    });
    bindThemeEditor(
      view.querySelector<HTMLElement>("[data-theme-editor]")!,
      draft.theme ?? {},
      (t) => {
        draft.theme = t;
        saved.textContent = "ยังไม่ได้บันทึก";
        refreshPreview();
      },
    );
    // character, social links, privacy (saved together with the profile below)
    const extras = bindExtrasEditor(view.querySelector<HTMLElement>("[data-mx]")!, s.no, () => {
      saved.textContent = "ยังไม่ได้บันทึก";
    });
    view.querySelectorAll<HTMLButtonElement>("[data-cover]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.coverPhoto = b.dataset.cover ?? "";
        view.querySelectorAll<HTMLButtonElement>("[data-cover]").forEach((x) => {
          x.classList.toggle("is-on", x === b);
          x.setAttribute("aria-checked", String(x === b));
        });
        saved.textContent = "ยังไม่ได้บันทึก";
        refreshPreview();
      }),
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-error]");
      const btn = form.querySelector<HTMLButtonElement>("[data-save]")!;
      if (!slugOk) {
        fieldError(err, `ลิงก์โปรไฟล์: ${slugState.textContent}`);
        slugInput.focus();
        return;
      }
      btn.disabled = true;
      fieldError(err, "");
      try {
        const {
          nickname,
          fullName,
          nicknameEn,
          quote,
          dream,
          ig,
          birthday,
          group,
          coverPhoto,
          theme,
        } = draft;
        const r = await api.updateMe({
          nickname,
          fullName,
          nicknameEn,
          quote,
          dream,
          ig,
          birthday,
          group,
          coverPhoto: coverPhoto ?? "",
          slug: draft.slug ?? "",
          theme: theme ?? {},
        });
        await extras.save();
        Object.assign(draft, r.student);
        const all = await api.students();
        applyStudentRecords(all.students);
        rec.slug = r.student.slug ?? "";
        view.querySelector<HTMLAnchorElement>("[data-profile-link]")!.href = profileUrl({
          no: s.no,
          slug: rec.slug,
        });
        checkSlug();
        saved.textContent = rec.slug ? `บันทึกแล้ว ✓ ลิงก์ของคุณคือ /me/${rec.slug}` : "บันทึกแล้ว ✓";
      } catch (ex) {
        fieldError(err, (ex as Error).message);
        if (ex instanceof ApiError && ex.status === 401) showLogin();
      } finally {
        btn.disabled = false;
      }
    });

    view.querySelector("[data-pw-save]")!.addEventListener("click", async () => {
      const err = view.querySelector<HTMLElement>("[data-pw-error]");
      const cur = (form.elements.namedItem("pwCurrent") as HTMLInputElement).value;
      const next = (form.elements.namedItem("pwNext") as HTMLInputElement).value;
      if (next.length < 6) return fieldError(err, "รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว");
      try {
        await api.setPassword(next, cur);
        fieldError(err, "เปลี่ยนรหัสผ่านแล้ว ✓");
        (form.elements.namedItem("pwCurrent") as HTMLInputElement).value = "";
        (form.elements.namedItem("pwNext") as HTMLInputElement).value = "";
      } catch (ex) {
        fieldError(err, (ex as Error).message);
      }
    });
    bindLogout();
  }

  function bindLogout() {
    view.querySelector("[data-logout]")?.addEventListener("click", async () => {
      await api.logout().catch(() => {});
      await forgetKeys(); // unlocked chat keys don't stay on a shared computer
      await refreshSession();
      navigate("/me");
      void start();
    });
  }

  void start();
  return () => {
    alive = false;
  };
}
