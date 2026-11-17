// Profile decoration: accent colour, background, font, avatar shape and a few personal touches.
// Stored per student as JSON (students.theme). Option lists must match THEME_* in server/db.ts.
import { icon } from "./icons.ts";
import { esc } from "./router.ts";

export type ProfileTheme = {
  accent?: string;
  /** second colour, used by the gradient backgrounds ("glow", "aurora") */
  accent2?: string;
  bg?:
    | "plain"
    | "soft"
    | "dots"
    | "grid"
    | "glow"
    | "stripes"
    | "aurora"
    | "hearts"
    | "stars"
    | "checker"
    | "magic"
    | "layers"
    | "blueprint"
    | "pixel"
    | "waves";
  font?: "default" | "mali" | "playpen" | "serif" | "itim" | "sriracha" | "mono";
  avatar?: "round" | "square";
  /** light (default), dark, or follow the viewer's device */
  mode?: "light" | "dark" | "auto";
  /** floating particles over the page background */
  fx?: "none" | "snow" | "sparkle" | "hearts" | "petals" | "gems" | "cubes" | "bubbles";
  corner?: "sharp" | "normal" | "round";
  ring?: "accent" | "rainbow" | "none";
  cover?: "short" | "normal" | "tall";
  emoji?: string;
  song?: string;
  hobbies?: string;
};

export const ACCENTS = [
  { hex: "#0569ff", name: "ฟ้า" },
  { hex: "#7c3aed", name: "ม่วง" },
  { hex: "#db2777", name: "ชมพู" },
  { hex: "#e11d48", name: "แดง" },
  { hex: "#ea580c", name: "ส้ม" },
  { hex: "#b45309", name: "น้ำตาลทอง" },
  { hex: "#16a34a", name: "เขียว" },
  { hex: "#0d9488", name: "เขียวมิ้นท์" },
  { hex: "#0891b2", name: "ฟ้าน้ำทะเล" },
  { hex: "#171717", name: "ดำ" },
];
export const BACKGROUNDS: { key: NonNullable<ProfileTheme["bg"]>; name: string }[] = [
  { key: "plain", name: "เรียบ" },
  { key: "soft", name: "สีอ่อน" },
  { key: "glow", name: "ไล่สี" },
  { key: "dots", name: "จุด" },
  { key: "grid", name: "ตาราง" },
  { key: "stripes", name: "ลายทาง" },
  { key: "aurora", name: "ออโรร่า" },
  { key: "hearts", name: "หัวใจ" },
  { key: "stars", name: "ดาว" },
  { key: "checker", name: "ตารางหมากรุก" },
  { key: "magic", name: "วงเวทมนตร์" },
  { key: "layers", name: "เลเยอร์ 3D" },
  { key: "blueprint", name: "พิมพ์เขียว" },
  { key: "pixel", name: "พิกเซล" },
  { key: "waves", name: "คลื่น" },
];
export const FONTS: { key: NonNullable<ProfileTheme["font"]>; name: string }[] = [
  { key: "default", name: "ปกติ" },
  { key: "mali", name: "ลายมือ" },
  { key: "playpen", name: "สนุก" },
  { key: "serif", name: "ทางการ" },
  { key: "itim", name: "กลมมน" },
  { key: "sriracha", name: "ปากกา" },
  { key: "mono", name: "โค้ด" },
];

type Choice<K extends keyof ProfileTheme> = { key: NonNullable<ProfileTheme[K]>; name: string }[];
export const MODES: Choice<"mode"> = [
  { key: "light", name: "สว่าง" },
  { key: "dark", name: "มืด" },
  { key: "auto", name: "ตามเครื่อง" },
];
export const EFFECTS: (Choice<"fx">[number] & { glyph: string })[] = [
  { key: "none", name: "ไม่มี", glyph: "–" },
  { key: "snow", name: "หิมะ", glyph: "❄" },
  { key: "sparkle", name: "ประกาย", glyph: "✦" },
  { key: "hearts", name: "หัวใจลอย", glyph: "♥" },
  { key: "petals", name: "ซากุระ", glyph: "✿" },
  { key: "gems", name: "อัญมณี", glyph: "◆" },
  { key: "cubes", name: "ลูกบาศก์", glyph: "⬢" },
  { key: "bubbles", name: "ฟองน้ำ", glyph: "○" },
];
export const CORNERS: Choice<"corner"> = [
  { key: "sharp", name: "เหลี่ยม" },
  { key: "normal", name: "ปกติ" },
  { key: "round", name: "มน" },
];
export const RINGS: Choice<"ring"> = [
  { key: "accent", name: "สีหลัก" },
  { key: "rainbow", name: "สีรุ้ง" },
  { key: "none", name: "ไม่มี" },
];
export const COVERS: Choice<"cover"> = [
  { key: "short", name: "เตี้ย" },
  { key: "normal", name: "ปกติ" },
  { key: "tall", name: "สูง" },
];
/** Defaults are not stored, so a missing key means the first/"normal" option. */
const DEFAULTS = {
  mode: "light",
  fx: "none",
  corner: "normal",
  ring: "accent",
  cover: "normal",
} as const;

/** Whether the theme renders dark right now ("auto" follows the viewer's device). */
export const isDarkTheme = (t: ProfileTheme | undefined) =>
  t?.mode === "dark" ||
  (t?.mode === "auto" &&
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches);
const EMOJI_PICKS = ["✨", "🌷", "🔥", "🎧", "📚", "⚽", "🎨", "🐱", "🍀", "🌙"];

export const hobbyList = (t: ProfileTheme | undefined) =>
  (t?.hobbies ?? "")
    .split(/[,，、]/)
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 8);

/** Classes + inline CSS variables that decorate a profile container (see .th-* in profile.css). */
export function themeAttrs(t: ProfileTheme | undefined): { cls: string; style: string } {
  if (!t || !Object.keys(t).length) return { cls: "", style: "" };
  const cls = ["has-theme", `th-bg-${t.bg ?? "plain"}`, `th-font-${t.font ?? "default"}`];
  if (isDarkTheme(t)) cls.push("th-dark");
  if (t.fx && t.fx !== "none") cls.push("th-fx", `th-fx-${t.fx}`);
  for (const k of ["corner", "ring", "cover"] as const)
    if (t[k] && t[k] !== DEFAULTS[k]) cls.push(`th-${k}-${t[k]}`);
  const hex = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);
  const style = [
    hex(t.accent) ? `--pf-accent:${t.accent}` : "",
    hex(t.accent2) ? `--pf-accent2:${t.accent2}` : "",
  ]
    .filter(Boolean)
    .join(";");
  return { cls: cls.join(" "), style };
}

/** Put the theme on an element, replacing whatever theme it had before. */
export function applyTheme(el: HTMLElement, t: ProfileTheme | undefined) {
  el.classList.forEach((c) => {
    if (c === "has-theme" || c.startsWith("th-")) el.classList.remove(c);
  });
  el.style.removeProperty("--pf-accent");
  el.style.removeProperty("--pf-accent2");
  const { cls, style } = themeAttrs(t);
  if (cls) el.classList.add(...cls.split(" "));
  for (const decl of style.split(";").filter(Boolean)) {
    const [k, v] = decl.split(":");
    el.style.setProperty(k, v);
  }
}

/** Form controls for editing a theme. Pair with bindThemeEditor(). */
export function themeEditorHtml(t: ProfileTheme): string {
  const isPreset = !t.accent || ACCENTS.some((a) => a.hex === t.accent);
  const opt = (attr: string, value: string, on: boolean, inner: string, label: string) =>
    `<button type="button" class="th-opt" ${attr}="${value}" role="radio" aria-checked="${on}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
  const pick = <K extends "mode" | "fx" | "corner" | "ring" | "cover">(
    k: K,
    list: { key: string; name: string }[],
    inner: (key: string, name: string) => string,
  ) =>
    list
      .map((o) =>
        opt(
          `data-th-k="${k}" data-th-v`,
          o.key,
          (t[k] ?? DEFAULTS[k]) === o.key,
          `${inner(o.key, o.name)}<span>${o.name}</span>`,
          o.name,
        ),
      )
      .join("");
  return `
  <div class="th-editor">
    <div class="th-row"><span class="th-label">${icon("sparkle", 15)} โหมด</span>
      <div class="th-choices" role="radiogroup" aria-label="โหมดสี">
        ${pick("mode", MODES, (k) => `<span class="th-modeprev is-${k}"><i></i><i></i></span>`)}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("palette", 15)} สีหลัก</span>
      <div class="th-swatches" role="radiogroup" aria-label="สีหลัก">
        ${opt("data-th-accent", "", !t.accent, `<span class="th-sw th-sw-none"></span>`, "ค่าเริ่มต้น")}
        ${ACCENTS.map((a) => opt("data-th-accent", a.hex, t.accent === a.hex, `<span class="th-sw" style="background:${a.hex}"></span>`, a.name)).join("")}
        <label class="th-opt th-custom${isPreset ? "" : " is-on"}" title="เลือกสีเอง"><input type="color" data-th-color value="${esc(t.accent ?? "#0569ff")}" aria-label="เลือกสีเอง"><span>สีเอง</span></label>
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("sparkle", 15)} สีรอง <em>ใช้กับพื้นหลังไล่สี / ออโรร่า</em></span>
      <div class="th-swatches" role="radiogroup" aria-label="สีรอง">
        ${opt("data-th-accent2", "", !t.accent2, `<span class="th-sw th-sw-none"></span>`, "อัตโนมัติ")}
        ${ACCENTS.slice(0, 9)
          .map((a) =>
            opt(
              "data-th-accent2",
              a.hex,
              t.accent2 === a.hex,
              `<span class="th-sw" style="background:${a.hex}"></span>`,
              a.name,
            ),
          )
          .join("")}
        <label class="th-opt th-custom${!t.accent2 || ACCENTS.some((a) => a.hex === t.accent2) ? "" : " is-on"}" data-th-custom2 title="เลือกสีเอง"><input type="color" data-th-color2 value="${esc(t.accent2 ?? "#db2777")}" aria-label="เลือกสีรองเอง"><span>สีเอง</span></label>
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("grid", 15)} พื้นหลัง</span>
      <div class="th-choices" role="radiogroup" aria-label="พื้นหลัง">
        ${BACKGROUNDS.map((b) => opt("data-th-bg", b.key, (t.bg ?? "plain") === b.key, `<span class="th-bgprev has-theme th-bg-${b.key}"></span><span>${b.name}</span>`, b.name)).join("")}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("pen", 15)} ตัวอักษร</span>
      <div class="th-choices" role="radiogroup" aria-label="ตัวอักษร">
        ${FONTS.map((f) => opt("data-th-font", f.key, (t.font ?? "default") === f.key, `<span class="th-fontprev th-font-${f.key}">ก Aa</span><span>${f.name}</span>`, f.name)).join("")}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("user", 15)} รูปโปรไฟล์</span>
      <div class="th-choices" role="radiogroup" aria-label="ทรงรูปโปรไฟล์">
        ${opt("data-th-avatar", "round", t.avatar !== "square", `<span class="th-shape"></span><span>วงกลม</span>`, "วงกลม")}
        ${opt("data-th-avatar", "square", t.avatar === "square", `<span class="th-shape is-square"></span><span>สี่เหลี่ยม</span>`, "สี่เหลี่ยม")}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("user", 15)} กรอบรูปโปรไฟล์</span>
      <div class="th-choices" role="radiogroup" aria-label="กรอบรูปโปรไฟล์">
        ${pick("ring", RINGS, (k) => `<span class="th-shape th-ringprev is-${k}"></span>`)}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("sparkle", 15)} เอฟเฟกต์ <em>ลอยอยู่บนพื้นหลัง</em></span>
      <div class="th-choices" role="radiogroup" aria-label="เอฟเฟกต์">
        ${pick("fx", EFFECTS, (k) => `<span class="th-fxprev is-${k}">${EFFECTS.find((e) => e.key === k)!.glyph}</span>`)}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("grid", 15)} มุมการ์ดและรูป</span>
      <div class="th-choices" role="radiogroup" aria-label="มุมการ์ด">
        ${pick("corner", CORNERS, (k) => `<span class="th-cornerprev is-${k}"></span>`)}
      </div>
    </div>
    <div class="th-row"><span class="th-label">${icon("grid", 15)} ความสูงหน้าปก</span>
      <div class="th-choices" role="radiogroup" aria-label="ความสูงหน้าปก">
        ${pick("cover", COVERS, (k) => `<span class="th-coverprev is-${k}"><i></i></span>`)}
      </div>
    </div>
    <div class="th-fields">
      <label class="me-field"><span>อีโมจิข้างชื่อ</span>
        <div class="th-emoji"><input type="text" data-th-field="emoji" maxlength="16" value="${esc(t.emoji ?? "")}" placeholder="เช่น ✨">
        <div class="th-emoji-picks">${EMOJI_PICKS.map((e) => `<button type="button" data-th-emoji="${e}" aria-label="ใช้ ${e}">${e}</button>`).join("")}</div></div>
      </label>
      <label class="me-field"><span>เพลงโปรด</span><input type="text" data-th-field="song" maxlength="80" value="${esc(t.song ?? "")}" placeholder="ชื่อเพลง – ศิลปิน"></label>
      <label class="me-field th-wide"><span>งานอดิเรก / สิ่งที่ชอบ <em>คั่นด้วย ,</em></span><input type="text" data-th-field="hobbies" maxlength="120" value="${esc(t.hobbies ?? "")}" placeholder="เช่น วาดรูป, บาส, ดูซีรีส์"></label>
    </div>
  </div>`;
}

/** Wire up the controls rendered by themeEditorHtml() inside `host`; calls onChange with a new theme. */
export function bindThemeEditor(
  host: HTMLElement,
  initial: ProfileTheme,
  onChange: (t: ProfileTheme) => void,
) {
  let t: ProfileTheme = { ...initial };
  const commit = (patch: Partial<ProfileTheme>) => {
    t = { ...t, ...patch };
    for (const k of Object.keys(t) as (keyof ProfileTheme)[]) if (!t[k]) delete t[k];
    host.style.setProperty("--th-preview-accent", t.accent ?? "#0569ff");
    onChange({ ...t });
  };
  host.style.setProperty("--th-preview-accent", t.accent ?? "#0569ff");
  const mark = (attr: string, value: string) =>
    host.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((b) => {
      b.setAttribute("aria-checked", String(b.getAttribute(attr) === value));
    });
  const custom = host.querySelector<HTMLElement>(".th-custom:not([data-th-custom2])");
  host.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b || !host.contains(b)) return;
    if (b.dataset.thK) {
      const k = b.dataset.thK as "mode" | "fx" | "corner" | "ring" | "cover";
      const v = b.dataset.thV!;
      host
        .querySelectorAll<HTMLElement>(`[data-th-k="${k}"]`)
        .forEach((x) => x.setAttribute("aria-checked", String(x.dataset.thV === v)));
      commit({ [k]: v === DEFAULTS[k] ? undefined : v });
    } else if (b.hasAttribute("data-th-accent")) {
      mark("data-th-accent", b.dataset.thAccent!);
      custom?.classList.remove("is-on");
      const picker = host.querySelector<HTMLInputElement>("[data-th-color]");
      if (picker && b.dataset.thAccent) picker.value = b.dataset.thAccent;
      commit({ accent: b.dataset.thAccent || undefined });
    } else if (b.hasAttribute("data-th-accent2")) {
      mark("data-th-accent2", b.dataset.thAccent2!);
      host.querySelector(".th-custom[data-th-custom2]")?.classList.remove("is-on");
      commit({ accent2: b.dataset.thAccent2 || undefined });
    } else if (b.dataset.thBg) {
      mark("data-th-bg", b.dataset.thBg);
      commit({ bg: b.dataset.thBg as ProfileTheme["bg"] });
    } else if (b.dataset.thFont) {
      mark("data-th-font", b.dataset.thFont);
      commit({ font: b.dataset.thFont as ProfileTheme["font"] });
    } else if (b.dataset.thAvatar) {
      mark("data-th-avatar", b.dataset.thAvatar);
      commit({ avatar: b.dataset.thAvatar as ProfileTheme["avatar"] });
    } else if (b.dataset.thEmoji) {
      const input = host.querySelector<HTMLInputElement>('[data-th-field="emoji"]')!;
      input.value = b.dataset.thEmoji;
      commit({ emoji: b.dataset.thEmoji });
    }
  });
  host.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.matches("[data-th-color2]")) {
      mark("data-th-accent2", "-");
      host.querySelector(".th-custom[data-th-custom2]")?.classList.add("is-on");
      commit({ accent2: el.value });
      return;
    }
    if (el.matches("[data-th-color]")) {
      mark("data-th-accent", "-");
      custom?.classList.add("is-on");
      commit({ accent: el.value });
      return;
    }
    const k = el.dataset.thField as "emoji" | "song" | "hobbies" | undefined;
    if (k) commit({ [k]: el.value.trim() });
  });
}
