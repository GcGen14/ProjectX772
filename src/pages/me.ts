// /me — students log in and customise their own profile.
import { BRAND, CLASS, getStudent, students, studentAvatar, type StudentRecord } from "../data.ts";
import { api, refreshSession, session } from "../lib/api.ts";
import { forgetKeys } from "../lib/e2e.ts";
import { icon } from "../lib/icons.ts";
import { esc, navigate, type Cleanup } from "../lib/router.ts";
import { renderEditor } from "./me-editor.ts";
import { rail } from "./profile.ts";

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

  /* ---------------- profile editor (src/pages/me-editor.ts) ---------------- */
  function showEditor(rec: StudentRecord | null) {
    if (!rec) return showLogin();
    renderEditor(view, rec, { showLogin, bindLogout });
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
