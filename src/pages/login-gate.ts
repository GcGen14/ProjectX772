// /backend entry point. This is the only admin code in the public bundle: a login form.
// The real admin screens (src/pages/backend.ts + its API calls and styles) are a separate chunk
// that the server only sends to a logged-in admin, so visitors never download them.
import { BRAND } from "../data.ts";
import { api, refreshSession } from "../lib/api.ts";
import { logoMark } from "../lib/icons.ts";
import { type Cleanup } from "../lib/router.ts";

export function renderLoginGate(root: HTMLElement): Cleanup {
  document.title = `ผู้ดูแล · ${BRAND}`;
  document.body.className = "page-backend";
  let alive = true;
  let inner: Cleanup | null = null;

  async function openAdmin() {
    root.innerHTML = `<div class="adm"><p class="muted" style="padding:24px">กำลังโหลด…</p></div>`;
    try {
      const { renderBackend } = await import("./backend.ts");
      if (alive) inner = renderBackend(root);
    } catch {
      if (alive) showLogin("โหลดหน้าผู้ดูแลไม่สำเร็จ");
    }
  }

  function showLogin(note = "") {
    root.innerHTML = `
    <div class="adm" style="max-width:520px;margin:0 auto;padding:24px 16px">
      <header class="adm-head"><a class="nav-logo" href="/" data-link>${logoMark(20)}<span>${BRAND}</span></a></header>
      <form class="me-card me-narrow adm-login" data-login novalidate>
        <h2>เข้าสู่ระบบผู้ดูแล</h2>
        <label class="me-field"><span>รหัสผ่านผู้ดูแล</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="me-error" data-error role="alert">${note}</p>
        <button class="me-btn me-block" type="submit">เข้าสู่ระบบ</button>
      </form>
    </div>`;
    const form = root.querySelector<HTMLFormElement>("[data-login]")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = form.querySelector<HTMLElement>("[data-error]")!;
      err.textContent = "";
      try {
        await api.adminLogin((form.elements.namedItem("password") as HTMLInputElement).value);
        await refreshSession();
        void openAdmin();
      } catch (ex) {
        err.textContent = (ex as Error).message;
      }
    });
  }

  void refreshSession().then((me) => {
    if (!alive) return;
    if (me.user && "admin" in me.user) void openAdmin();
    else showLogin();
  });

  return () => {
    alive = false;
    inner?.();
  };
}
