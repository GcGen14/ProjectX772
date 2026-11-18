// /me — the profile editor, split into tabs with a live preview and a sticky save bar.
//   ข้อมูล · รูปภาพ (pick / upload + crop) · ธีม (presets + fine tuning) · ตัวการ์ตูน · โซเชียล ·
//   ความเป็นส่วนตัว · บัญชี (profile link + password)
import {
  STUDENT_GROUPS,
  applyStudentRecords,
  faceSrc,
  getStudent,
  large,
  ownedPhotos,
  photoSrc,
  portraitPhotos,
  profileUrl,
  studentAvatar,
  type Photo,
  type StudentRecord,
} from "../data.ts";
import { ApiError, api } from "../lib/api.ts";
import { badgeRow, crownSvg, hasCrown } from "../lib/badges.ts";
import { icon } from "../lib/icons.ts";
import { esc } from "../lib/router.ts";
import {
  applyTheme,
  bindThemeEditor,
  themeAttrs,
  themeEditorHtml,
  type ProfileTheme,
} from "../lib/theme.ts";
import { cropSquare, deleteMine, loadImage, toBody, uploadMine } from "../lib/upload.ts";
import { bindExtrasEditor, extrasSectionHtml } from "./me-extras.ts";

const LIMITS = {
  nickname: 40,
  fullName: 100,
  nicknameEn: 40,
  quote: 300,
  dream: 120,
  ig: 30,
  birthday: 40,
};
type Field = keyof typeof LIMITS;

const TABS = [
  { k: "info", label: "ข้อมูล", icon: "user" },
  { k: "photos", label: "รูปภาพ", icon: "image" },
  { k: "theme", label: "ธีม", icon: "palette" },
  { k: "character", label: "ตัวการ์ตูน", icon: "sparkle" },
  { k: "socials", label: "โซเชียล", icon: "globe" },
  { k: "privacy", label: "ความเป็นส่วนตัว", icon: "shield" },
  { k: "account", label: "บัญชี", icon: "lock" },
] as const;
type TabKey = (typeof TABS)[number]["k"];
const TAB_KEY = "me-tab";

/** One-tap looks. Personal bits (emoji, song, hobbies) are kept when a preset is applied. */
export const PRESETS: { name: string; theme: ProfileTheme }[] = [
  { name: "มินิมอล", theme: {} },
  {
    name: "พาสเทล",
    theme: {
      accent: "#db2777",
      accent2: "#7c3aed",
      bg: "aurora",
      font: "mali",
      corner: "round",
      fx: "hearts",
    },
  },
  {
    name: "ซากุระ",
    theme: {
      accent: "#e11d48",
      accent2: "#f9a8d4",
      bg: "soft",
      font: "itim",
      corner: "round",
      fx: "petals",
    },
  },
  { name: "ทะเล", theme: { accent: "#0891b2", accent2: "#0569ff", bg: "glow", cover: "tall" } },
  {
    name: "สมุดโน้ต",
    theme: { accent: "#b45309", bg: "grid", font: "sriracha", corner: "sharp", ring: "none" },
  },
  {
    name: "กลางคืน",
    theme: {
      mode: "dark",
      accent: "#8ab4ff",
      accent2: "#ff66f4",
      bg: "stars",
      fx: "sparkle",
      ring: "rainbow",
    },
  },
  {
    name: "หน้าหนาว",
    theme: { mode: "dark", accent: "#7dd3fc", bg: "plain", fx: "snow", corner: "round" },
  },
  {
    name: "นีออน",
    theme: {
      mode: "dark",
      accent: "#22c55e",
      accent2: "#ff66f4",
      bg: "aurora",
      font: "playpen",
      ring: "rainbow",
    },
  },
  {
    // pink + gold magical-girl look (Madoka-style)
    name: "สาวน้อยเวทมนตร์",
    theme: {
      accent: "#ec4899",
      accent2: "#eab308",
      bg: "magic",
      font: "mali",
      corner: "round",
      fx: "gems",
      ring: "rainbow",
    },
  },
  {
    name: "แม่มดรัตติกาล",
    theme: {
      mode: "dark",
      accent: "#a78bfa",
      accent2: "#f472b6",
      bg: "magic",
      font: "serif",
      fx: "gems",
    },
  },
  {
    name: "ปริ้น 3D",
    theme: {
      accent: "#f97316",
      accent2: "#0ea5e9",
      bg: "layers",
      font: "mono",
      corner: "sharp",
      fx: "cubes",
    },
  },
  {
    name: "พิมพ์เขียว",
    theme: {
      mode: "dark",
      accent: "#60a5fa",
      accent2: "#93c5fd",
      bg: "blueprint",
      font: "mono",
      corner: "sharp",
      ring: "none",
    },
  },
  {
    name: "เกมพิกเซล",
    theme: {
      accent: "#16a34a",
      accent2: "#eab308",
      bg: "pixel",
      font: "mono",
      corner: "sharp",
      cover: "short",
    },
  },
  {
    name: "ใต้ทะเล",
    theme: {
      accent: "#0891b2",
      accent2: "#22d3ee",
      bg: "waves",
      font: "itim",
      corner: "round",
      fx: "bubbles",
    },
  },
];
const PERSONAL = ["emoji", "song", "hobbies", "avatar"] as const;

const sameLook = (a: ProfileTheme, b: ProfileTheme) => {
  const strip = (t: ProfileTheme) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(t)
          .filter(([k, v]) => v && !(PERSONAL as readonly string[]).includes(k))
          .sort(([x], [y]) => x.localeCompare(y)),
      ),
    );
  return strip(a) === strip(b);
};

export function renderEditor(
  view: HTMLElement,
  rec: StudentRecord,
  hooks: { showLogin: () => void; bindLogout: () => void },
) {
  const s = getStudent(rec.no)!;
  const no = s.no;
  const draft: StudentRecord = { ...rec, theme: { ...rec.theme } };
  let tab: TabKey = "info";
  try {
    const t = sessionStorage.getItem(TAB_KEY) as TabKey | null;
    if (t && TABS.some((x) => x.k === t)) tab = t;
  } catch {
    /* storage blocked: start on the first tab */
  }

  const input = (key: Field, label: string, ph = "", area = false) => `
    <label class="me-field"><span>${label}<em data-count="${key}"></em></span>
      ${
        area
          ? `<textarea name="${key}" rows="3" maxlength="${LIMITS[key]}" placeholder="${esc(ph)}">${esc(String(draft[key] ?? ""))}</textarea>`
          : `<input name="${key}" type="text" maxlength="${LIMITS[key]}" value="${esc(String(draft[key] ?? ""))}" placeholder="${esc(ph)}">`
      }
    </label>`;
  // a look the admin designed just for this student comes first
  const presets: { name: string; theme: ProfileTheme; special?: boolean }[] = rec.specialTheme
    ? [{ ...rec.specialTheme, special: true }, ...PRESETS]
    : PRESETS;
  const presetCard = (p: (typeof presets)[number], i: number) => {
    const a = themeAttrs(Object.keys(p.theme).length ? p.theme : { bg: "plain" });
    return `<button type="button" class="me2-preset${p.special ? " is-special" : ""}" data-preset="${i}" aria-pressed="false">
      <span class="me2-preset-prev ${a.cls}" style="${a.style}"><i class="me2-pp-cover"></i><i class="me2-pp-av"></i><i class="me2-pp-line"></i><i class="me2-pp-line is-short"></i>${p.special ? `<b class="me2-pp-special">✦ ทำให้คุณ</b>` : ""}</span>
      <span class="me2-preset-name">${esc(p.name)}</span></button>`;
  };

  view.innerHTML = `
    <div class="me-layout me2">
      <aside class="me-card me-preview" aria-label="ตัวอย่างโปรไฟล์">
        <div class="me-preview-cover"><img alt="" data-prev-cover></div>
        ${
          hasCrown(rec.badges)
            ? `<span class="me-preview-face"><img class="me-preview-avatar" src="${studentAvatar(s)}" alt="" data-prev-avatar>${crownSvg()}</span>`
            : `<img class="me-preview-avatar" src="${studentAvatar(s)}" alt="" data-prev-avatar>`
        }
        <h2><span data-prev="nickname"></span> <span data-prev="emoji" aria-hidden="true"></span></h2>
        ${badgeRow(rec.badges, "me-preview-badges")}
        <p class="me-preview-handle">@602.${String(no).padStart(2, "0")} · เลขที่ ${no}</p>
        <p class="me-preview-quote" data-prev="quote"></p>
        <p class="me-preview-line">${icon("sparkle", 14)}<span data-prev="dream"></span></p>
        <a class="btn-outline me-block" href="${profileUrl(s)}" data-link data-profile-link>ดูหน้าโปรไฟล์จริง ${icon("arrowUpRight", 14)}</a>
      </aside>
      <form class="me-card me-form me2-form" data-edit novalidate>
        <div class="me-form-head">
          <div><h1>แต่งโปรไฟล์ของฉัน</h1><p class="me-help small">เลือกหัวข้อ แล้วดูตัวอย่างได้ทันที กดบันทึกด้านล่างเมื่อพอใจ</p></div>
          <button class="btn-outline me-small" type="button" data-logout>${icon("close", 14)} ออกจากระบบ</button>
        </div>
        <nav class="me2-tabs" role="tablist" aria-label="หัวข้อ">
          ${TABS.map((t) => `<button type="button" role="tab" class="me2-tab" data-tab="${t.k}" aria-selected="${t.k === tab}">${icon(t.icon, 16)}<span>${t.label}</span></button>`).join("")}
        </nav>

        <div class="me2-panel" data-panel="info" role="tabpanel">
          <div class="me-grid">
            ${input("nickname", "ชื่อเล่น", "เช่น มายด์")}
            ${input("nicknameEn", "ชื่อเล่นภาษาอังกฤษ", "เช่น Mind")}
            ${input("fullName", "ชื่อ–นามสกุล", "ชื่อ นามสกุล")}
            ${input("birthday", "วันเกิด", "เช่น 12 มี.ค.")}
            ${input("dream", "ความฝัน / คณะที่อยากเข้า", "เช่น วิศวะคอม")}
            ${input("ig", "Instagram", "ไม่ต้องใส่ @")}
          </div>
          <div class="me-field"><span>กลุ่ม</span>
            <div class="me2-chips" role="radiogroup" aria-label="กลุ่ม">
              ${["", ...STUDENT_GROUPS].map((g) => `<button type="button" class="me2-chip" data-group="${g}" role="radio" aria-checked="${g === (draft.group ?? "")}">${g || "ไม่ระบุ"}</button>`).join("")}
            </div>
          </div>
          ${input("quote", "คำคม / ข้อความถึงเพื่อน", "อยากบอกอะไรเพื่อน ๆ 6/2", true)}
        </div>

        <div class="me2-panel" data-panel="photos" role="tabpanel">
          <section class="me-section me2-first">
            <h2>${icon("user", 18)} รูปโปรไฟล์</h2>
            <p class="me-help small">แตะเพื่อเลือก หรืออัปโหลดรูปใหม่แล้วลากจัดให้หน้าอยู่กลางวง</p>
            <div class="me2-avatars" data-avatars></div>
          </section>
          <section class="me-section">
            <h2>${icon("image", 18)} รูปปก</h2>
            <p class="me-help small">รูปใหญ่ด้านบนของหน้าโปรไฟล์ เลือกจากรูปที่มีเรา หรืออัปโหลดเอง</p>
            <div class="me-covers me2-covers" data-covers></div>
          </section>
          <p class="me2-up-status" data-up-status role="status"></p>
          <input type="file" accept="image/*" hidden data-file>
        </div>

        <div class="me2-panel" data-panel="theme" role="tabpanel">
          <section class="me-section me2-first">
            <h2>${icon("sparkle", 18)} ธีมสำเร็จรูป</h2>
            <p class="me-help small">แตะครั้งเดียวเปลี่ยนทั้งหน้า แล้วค่อยปรับต่อด้านล่างได้</p>
            <div class="me2-presets">${presets.map(presetCard).join("")}</div>
          </section>
          <section class="me-section">
            <h2>${icon("brush", 18)} ปรับเอง</h2>
            <div data-theme-editor></div>
          </section>
        </div>

        <div class="me2-panel" data-panel="character" role="tabpanel">${extrasSectionHtml(no, "character")}</div>
        <div class="me2-panel" data-panel="socials" role="tabpanel">${extrasSectionHtml(no, "socials")}</div>
        <div class="me2-panel" data-panel="privacy" role="tabpanel">${extrasSectionHtml(no, "privacy")}</div>

        <div class="me2-panel" data-panel="account" role="tabpanel">
          <section class="me-section me2-first">
            <h2>${icon("share", 18)} ลิงก์โปรไฟล์ของฉัน</h2>
            <div class="me-field me-slug">
              <span>ที่อยู่หน้าโปรไฟล์<em data-slug-state></em></span>
              <div class="me-slug-row">
                <span class="me-slug-prefix">${esc(location.host)}/me/</span>
                <input name="slug" type="text" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(draft.slug ?? "")}" placeholder="ชื่อของคุณ เช่น mind.cpe">
                <button class="btn-outline me-small" type="button" data-copy-link title="คัดลอกลิงก์">${icon("share", 14)} คัดลอก</button>
              </div>
              <small class="me-help">a–z, 0–9, จุด ขีด ขีดล่าง · 3–30 ตัว · เว้นว่าง = ใช้ลิงก์ /member/${no}</small>
            </div>
          </section>
          <section class="me-section">
            <h2>${icon("lock", 18)} เปลี่ยนรหัสผ่าน</h2>
            <div class="me-grid">
              <label class="me-field"><span>รหัสผ่านเดิม</span><input name="pwCurrent" type="password" autocomplete="current-password"></label>
              <label class="me-field"><span>รหัสผ่านใหม่</span><input name="pwNext" type="password" autocomplete="new-password" minlength="6"></label>
            </div>
            <p class="me-error" data-pw-error></p>
            <button class="btn-outline me-small" type="button" data-pw-save>เปลี่ยนรหัสผ่าน</button>
          </section>
        </div>

        <div class="me2-savebar" data-savebar>
          <div class="me2-save-text"><span data-saved>ทุกอย่างบันทึกแล้ว</span><p class="me-error" data-error role="alert"></p></div>
          <button class="btn-outline me-small" type="button" data-reset>ยกเลิก</button>
          <button class="me-btn" type="submit" data-save>${icon("check", 16)} บันทึก</button>
        </div>
      </form>
    </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => view.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>("[data-edit]");
  const saved = $("[data-saved]");
  const savebar = $("[data-savebar]");
  const errBox = $("[data-error]");
  const setDirty = (on: boolean, msg?: string) => {
    savebar.classList.toggle("is-dirty", on);
    saved.textContent = msg ?? (on ? "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "ทุกอย่างบันทึกแล้ว");
  };

  /* ---------- tabs ---------- */
  const showTab = (k: TabKey) => {
    tab = k;
    view.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === k;
      b.setAttribute("aria-selected", String(on));
      if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    view
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((p) => (p.hidden = p.dataset.panel !== k));
    try {
      sessionStorage.setItem(TAB_KEY, k);
    } catch {
      /* ignore */
    }
  };
  view.querySelector(".me2-tabs")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-tab]");
    if (b) showTab(b.dataset.tab as TabKey);
  });
  view.querySelector(".me2-tabs")!.addEventListener("keydown", (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== "ArrowRight" && ke.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.k === tab);
    const next = TABS[(i + (ke.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].k;
    showTab(next);
    view.querySelector<HTMLElement>(`[data-tab="${next}"]`)!.focus();
  });
  showTab(tab);

  /* ---------- preview ---------- */
  const mine = () => ownedPhotos(`s${no}`);
  const coverChoices = (): Photo[] => {
    const st = getStudent(no) ?? s;
    return [...portraitPhotos(st), ...st.memories.slice(0, 18)];
  };
  const avatarSrc = () => {
    const list = mine();
    const p = (draft.avatar && list.find((x) => x.id === draft.avatar)) || list[0];
    return p ? faceSrc(p) : studentAvatar(s);
  };
  const coverImg = $<HTMLImageElement>("[data-prev-cover]");
  const refreshPreview = () => {
    const set = (k: string, v: string) => ($(`[data-prev="${k}"]`).textContent = v);
    set("nickname", draft.nickname || `เพื่อนเลขที่ ${no}`);
    set("quote", draft.quote || "ยังไม่ได้เขียนคำคม…");
    set("dream", draft.dream || "ความฝัน: รอเติม");
    set("emoji", draft.theme?.emoji ?? "");
    applyTheme($(".me-preview"), draft.theme ?? {});
    const av = $<HTMLImageElement>("[data-prev-avatar]");
    av.src = avatarSrc();
    av.classList.toggle("is-square", draft.theme?.avatar === "square");
    const list = coverChoices();
    const chosen = list.find((p) => p.id === draft.coverPhoto) ?? list[0];
    if (chosen) coverImg.src = chosen.local ?? large(chosen);
    coverImg.hidden = !chosen;
    for (const [k, max] of Object.entries(LIMITS)) {
      const c = view.querySelector<HTMLElement>(`[data-count="${k}"]`);
      if (c) c.textContent = `${String(draft[k as Field] ?? "").length}/${max}`;
    }
    view
      .querySelectorAll<HTMLElement>("[data-preset]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(sameLook(presets[Number(b.dataset.preset)].theme, draft.theme ?? {})),
        ),
      );
  };

  /* ---------- info ---------- */
  form.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name in LIMITS) {
      (draft as Record<string, unknown>)[el.name] = el.value;
      setDirty(true);
      refreshPreview();
    }
  });
  view.querySelector(".me2-chips")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-group]");
    if (!b) return;
    draft.group = b.dataset.group ?? "";
    view
      .querySelectorAll("[data-group]")
      .forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    setDirty(true);
  });

  /* ---------- photos: pick / upload / delete ---------- */
  const avatarsHost = $("[data-avatars]");
  const coversHost = $("[data-covers]");
  const upStatus = $("[data-up-status]");
  const fileInput = $<HTMLInputElement>("[data-file]");
  let uploadKind: "avatar" | "cover" = "avatar";
  let confirmDel = "";
  const uploadTile = (kind: "avatar" | "cover") =>
    `<button type="button" class="me2-upload is-${kind}" data-upload="${kind}">${icon("camera", 20)}<span>อัปโหลดรูป</span></button>`;
  const renderPhotos = () => {
    const list = mine();
    const cur = draft.avatar ?? "";
    avatarsHost.innerHTML = `
      ${uploadTile("avatar")}
      <button type="button" class="me2-av${cur ? "" : " is-on"}" data-avatar="" aria-pressed="${!cur}" title="อัตโนมัติ (รูปแรกของฉัน)"><img src="${list[0] ? faceSrc(list[0]) : studentAvatar(s)}" alt=""><span class="me2-av-tag">อัตโนมัติ</span></button>
      ${list
        .map(
          (p) =>
            `<div class="me2-av-wrap"><button type="button" class="me2-av${cur === p.id ? " is-on" : ""}" data-avatar="${p.id}" aria-pressed="${cur === p.id}"><img src="${faceSrc(p)}" alt="" loading="lazy"></button>${
              p.upload
                ? `<button type="button" class="me2-del${confirmDel === p.id ? " is-confirm" : ""}" data-del="${p.id}" aria-label="ลบรูปนี้" title="ลบรูปที่อัปโหลด">${confirmDel === p.id ? "ลบ?" : icon("trash", 13)}</button>`
                : ""
            }</div>`,
        )
        .join("")}`;
    const covers = coverChoices();
    const cov = draft.coverPhoto ?? "";
    coversHost.innerHTML = `
      ${uploadTile("cover")}
      <button type="button" class="me-cover${cov ? "" : " is-on"}" data-cover="" aria-pressed="${!cov}"><span>อัตโนมัติ</span></button>
      ${covers.map((p) => `<button type="button" class="me-cover${cov === p.id ? " is-on" : ""}" data-cover="${p.id}" aria-pressed="${cov === p.id}"><img src="${photoSrc(p)}" alt="" loading="lazy"></button>`).join("")}`;
  };
  view.querySelector('[data-panel="photos"]')!.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const up = t.closest<HTMLElement>("[data-upload]");
    const del = t.closest<HTMLElement>("[data-del]");
    const av = t.closest<HTMLElement>("[data-avatar]");
    const cv = t.closest<HTMLElement>("[data-cover]");
    if (up) {
      uploadKind = up.dataset.upload as "avatar" | "cover";
      fileInput.value = "";
      fileInput.click();
    } else if (del) {
      const id = del.dataset.del!;
      if (confirmDel !== id) {
        confirmDel = id;
        return renderPhotos();
      }
      confirmDel = "";
      upStatus.textContent = "กำลังลบ…";
      try {
        await deleteMine(id);
        if (draft.avatar === id) draft.avatar = "";
        if (draft.coverPhoto === id) draft.coverPhoto = "";
        upStatus.textContent = "ลบรูปแล้ว";
      } catch (ex) {
        upStatus.textContent = (ex as Error).message;
      }
      renderPhotos();
      refreshPreview();
    } else if (av) {
      draft.avatar = av.dataset.avatar ?? "";
      confirmDel = "";
      setDirty(true);
      renderPhotos();
      refreshPreview();
    } else if (cv) {
      draft.coverPhoto = cv.dataset.cover ?? "";
      setDirty(true);
      renderPhotos();
      refreshPreview();
    }
  });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      upStatus.textContent = "กำลังเปิดรูป…";
      const full = await loadImage(f);
      let box: Awaited<ReturnType<typeof cropSquare>> | undefined;
      if (uploadKind === "avatar") {
        upStatus.textContent = "";
        box = await cropSquare(full);
        if (!box) return;
      }
      upStatus.textContent = "กำลังอัปโหลด…";
      const id = await uploadMine(toBody(full, box ?? undefined));
      if (uploadKind === "avatar") draft.avatar = id;
      else draft.coverPhoto = id;
      setDirty(true);
      upStatus.textContent = "อัปโหลดแล้ว ✓ อย่าลืมกดบันทึกด้านล่าง";
      renderPhotos();
      refreshPreview();
    } catch (ex) {
      upStatus.textContent = (ex as Error).message;
      if (ex instanceof ApiError && ex.status === 401) hooks.showLogin();
    }
  });

  /* ---------- theme: presets + custom editor ---------- */
  const themeHost = () => $("[data-theme-editor]");
  const mountThemeEditor = () => {
    // a fresh element each time, so old listeners don't pile up
    const fresh = document.createElement("div");
    fresh.dataset.themeEditor = "";
    fresh.innerHTML = themeEditorHtml(draft.theme ?? {});
    themeHost().replaceWith(fresh);
    bindThemeEditor(fresh, draft.theme ?? {}, (t) => {
      draft.theme = t;
      setDirty(true);
      refreshPreview();
    });
  };
  mountThemeEditor();
  view.querySelector(".me2-presets")!.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-preset]");
    if (!b) return;
    const keep = Object.fromEntries(
      PERSONAL.map((k) => [k, draft.theme?.[k]]).filter(([, v]) => v),
    );
    draft.theme = { ...presets[Number(b.dataset.preset)].theme, ...keep };
    mountThemeEditor();
    setDirty(true);
    refreshPreview();
  });

  /* ---------- character / socials / privacy (all inside the form) ---------- */
  const extras = bindExtrasEditor(form, no, () => setDirty(true));

  /* ---------- account: profile link ---------- */
  const slugInput = form.querySelector<HTMLInputElement>('input[name="slug"]')!;
  const slugState = $("[data-slug-state]");
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
        if (slugInput.value.trim().toLowerCase() !== v) return; // still typing
        slugOk = out.ok;
        slugState.textContent = out.ok ? "ว่าง ใช้ได้ ✓" : (out.error ?? "ใช้ไม่ได้");
        slugState.className = out.ok ? "is-ok" : "is-bad";
      } catch {
        slugState.textContent = "";
      }
    }, 350);
  };
  slugInput.addEventListener("input", () => {
    const clean = slugInput.value.toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (clean !== slugInput.value) slugInput.value = clean;
    setDirty(true);
    checkSlug();
  });
  checkSlug();
  $("[data-copy-link]").addEventListener("click", () => {
    const url = `${location.origin}${profileUrl({ no, slug: rec.slug })}`;
    void navigator.clipboard?.writeText(url).then(
      () => (saved.textContent = "คัดลอกลิงก์แล้ว ✓"),
      () => (saved.textContent = url),
    );
  });
  $("[data-pw-save]").addEventListener("click", async () => {
    const err = $("[data-pw-error]");
    const cur = (form.elements.namedItem("pwCurrent") as HTMLInputElement).value;
    const next = (form.elements.namedItem("pwNext") as HTMLInputElement).value;
    if (next.length < 6) return void (err.textContent = "รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว");
    try {
      await api.setPassword(next, cur);
      err.textContent = "เปลี่ยนรหัสผ่านแล้ว ✓";
      (form.elements.namedItem("pwCurrent") as HTMLInputElement).value = "";
      (form.elements.namedItem("pwNext") as HTMLInputElement).value = "";
    } catch (ex) {
      err.textContent = (ex as Error).message;
    }
  });

  /* ---------- save / reset ---------- */
  $("[data-reset]").addEventListener("click", () => renderEditor(view, rec, hooks));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>("[data-save]");
    if (!slugOk) {
      errBox.textContent = `ลิงก์โปรไฟล์: ${slugState.textContent}`;
      showTab("account");
      slugInput.focus();
      return;
    }
    btn.disabled = true;
    errBox.textContent = "";
    saved.textContent = "กำลังบันทึก…";
    try {
      const { nickname, fullName, nicknameEn, quote, dream, ig, birthday, group } = draft;
      const r = await api.updateMe({
        nickname,
        fullName,
        nicknameEn,
        quote,
        dream,
        ig,
        birthday,
        group,
        avatar: draft.avatar ?? "",
        coverPhoto: draft.coverPhoto ?? "",
        slug: draft.slug ?? "",
        theme: draft.theme ?? {},
      });
      await extras.save();
      Object.assign(draft, r.student);
      Object.assign(rec, r.student);
      applyStudentRecords((await api.students()).students);
      $<HTMLAnchorElement>("[data-profile-link]").href = profileUrl({ no, slug: rec.slug });
      checkSlug();
      setDirty(false, rec.slug ? `บันทึกแล้ว ✓ ลิงก์ของคุณคือ /me/${rec.slug}` : "บันทึกแล้ว ✓");
    } catch (ex) {
      errBox.textContent = (ex as Error).message;
      saved.textContent = "บันทึกไม่สำเร็จ";
      if (ex instanceof ApiError && ex.status === 401) hooks.showLogin();
    } finally {
      btn.disabled = false;
    }
  });

  renderPhotos();
  refreshPreview();
  setDirty(false);
  hooks.bindLogout();
}
