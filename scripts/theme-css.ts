// Student CSS themes (themes/<no>/theme.css): validate + scope a stylesheet to one student's profile.
//
// A student writes ordinary CSS as if their profile were the whole page. This file
//   1. rejects anything that could reach outside the profile or load things from other sites
//      (@import, remote url(), position: fixed, huge z-index, scripts, ...), and
//   2. prefixes every selector with `.th-custom-<no>` so it can only style that student's own profile.
// It is used by the Vite plugin (vite.config.ts) at build time and by scripts/check-themes.ts in the PR check.
// No dependencies on purpose: this runs on a bare `node` in CI.
import fs from "node:fs";
import path from "node:path";

export const MAX_CSS_BYTES = 60_000;
export const MAX_ASSET_BYTES = 300_000;
export const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const MAX_Z_INDEX = 50;

export class ThemeError extends Error {}

type Ctx = { no: number; scope: string; dir: string };

/** Index just past the `}` matching the `{` at `open` (strings, comments and nested braces respected). */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") i = skipString(css, i);
    else if (c === "/" && css[i + 1] === "*") i = css.indexOf("*/", i + 2) + 1 || css.length;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  throw new ThemeError("มีวงเล็บปีกกา { } ไม่ครบคู่");
}

function skipString(css: string, start: number): number {
  const q = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "\\") i++;
    else if (css[i] === q) return i;
    else if (css[i] === "\n") break;
  }
  throw new ThemeError("มีข้อความในเครื่องหมายคำพูดที่ไม่ปิด");
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Split on commas that are not inside (), [] or strings. */
function splitTop(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '"' || c === "'") {
      const end = skipString(sel, i);
      cur += sel.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function scopeSelector(sel: string, ctx: Ctx): string {
  // the profile container itself: :root / html / body (optionally followed by more of the selector)
  const root = sel.match(/^(?::root|html|body)(?![\w-])(.*)$/s);
  if (root) return `${ctx.scope}${root[1]}`;
  if (/(^|[\s>+~(,])(?:html|body|:root)(?![\w-])/.test(sel))
    throw new ThemeError(`ตัวเลือก "${sel}" ใช้ html / body / :root ผิดตำแหน่ง ใช้ได้เฉพาะตอนต้นตัวเลือก`);
  if (/^[>+~]/.test(sel)) throw new ThemeError(`ตัวเลือก "${sel}" ขึ้นต้นด้วย > + ~ ไม่ได้`);
  // `:host`, `::backdrop` and friends can't be scoped meaningfully
  if (/^(?::host|::backdrop)/.test(sel)) throw new ThemeError(`ตัวเลือก "${sel}" ไม่รองรับ`);
  return `${ctx.scope} ${sel}`;
}

function checkDeclarations(body: string, ctx: Ctx, where: string) {
  if (body.includes("{"))
    throw new ThemeError(`${where}: ยังไม่รองรับ CSS nesting (กฎซ้อนกฎ) เขียนแยกเป็นกฎใหม่แทน`);
  const text = stripComments(body);
  if (/position\s*:\s*(fixed|sticky)/i.test(text))
    throw new ThemeError(
      `${where}: ห้ามใช้ position: fixed / sticky (กันไม่ให้ทับส่วนอื่นของเว็บ) ใช้ absolute ภายในโปรไฟล์แทน`,
    );
  for (const m of text.matchAll(/z-index\s*:\s*(-?\d+)/gi))
    if (Number(m[1]) > MAX_Z_INDEX) throw new ThemeError(`${where}: z-index มากสุด ${MAX_Z_INDEX}`);
  if (/expression\s*\(|behavior\s*:|-moz-binding|javascript:|vbscript:/i.test(text))
    throw new ThemeError(`${where}: มีโค้ดที่ไม่อนุญาต`);
}

/** Every url(...) must be a small inline image or a file in the theme's own folder. */
function checkUrls(css: string, ctx: Ctx) {
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const u = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (
      /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(u) &&
      u.length < 40_000
    )
      continue;
    if (
      /^data:image\/svg\+xml[;,]/i.test(u) &&
      u.length < 40_000 &&
      !/<script|on\w+=/i.test(decodeURIComponentSafe(u))
    )
      continue;
    if (u.startsWith("#")) continue; // url(#gradient) for SVG references
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u))
      throw new ThemeError(
        `url(${u.slice(0, 50)}) โหลดจากภายนอกไม่ได้ ใส่ไฟล์รูปไว้ในโฟลเดอร์ธีมแล้วอ้างแบบ url("./รูป.png")`,
      );
    const rel = u.split(/[?#]/)[0];
    if (!/^\.\/[\w][\w .-]*$/.test(rel) || !ASSET_EXT.test(rel))
      throw new ThemeError(
        `url(${u.slice(0, 50)}) ต้องเป็นไฟล์รูป (png/jpg/webp/gif/svg/avif) ในโฟลเดอร์ธีม เช่น url("./bg.png")`,
      );
    const file = path.join(ctx.dir, rel);
    if (!fs.existsSync(file)) throw new ThemeError(`ไม่พบไฟล์ ${rel} ในโฟลเดอร์ธีม`);
    if (fs.statSync(file).size > MAX_ASSET_BYTES)
      throw new ThemeError(`ไฟล์ ${rel} ใหญ่เกิน ${Math.round(MAX_ASSET_BYTES / 1000)}KB`);
    if (
      /\.svg$/i.test(rel) &&
      /<script|\son\w+\s*=|javascript:|<foreignObject/i.test(fs.readFileSync(file, "utf8"))
    )
      throw new ThemeError(`ไฟล์ ${rel} มีสคริปต์ ไม่อนุญาต`);
  }
}

function decodeURIComponentSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function scopeBlock(css: string, ctx: Ctx): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    // skip whitespace / comments between rules
    const rest = css.slice(i);
    const ws = rest.match(/^(?:\s+|\/\*[\s\S]*?\*\/)/);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    const open = findPreludeEnd(css, i);
    if (open.kind === "end")
      throw new ThemeError(`CSS ไม่สมบูรณ์ใกล้ ๆ "${css.slice(i, i + 40).trim()}"`);
    const prelude = stripComments(css.slice(i, open.at)).trim();
    if (open.kind === "semi") {
      throw new ThemeError(
        prelude.startsWith("@import")
          ? "@import ไม่อนุญาต (เขียน CSS ทั้งหมดไว้ในไฟล์เดียว)"
          : `"${prelude.slice(0, 40)}" ไม่ใช่กฎ CSS ที่ใช้ได้ (ต้องมี { })`,
      );
    }
    const end = matchBrace(css, open.at);
    const body = css.slice(open.at + 1, end - 1);
    if (prelude.startsWith("@")) {
      const name = prelude.match(/^@([\w-]+)/)![1].toLowerCase();
      if (name === "media" || name === "supports") {
        out += `${prelude}{${scopeBlock(body, ctx)}}\n`;
      } else if (/^(?:-webkit-)?keyframes$/.test(name)) {
        const kf = prelude.slice(prelude.indexOf(name) + name.length).trim();
        if (!kf.startsWith(`t${ctx.no}-`))
          throw new ThemeError(
            `ชื่อ @keyframes "${kf}" ต้องขึ้นต้นด้วย t${ctx.no}- (เช่น t${ctx.no}-float) เพื่อไม่ชนกับธีมคนอื่น`,
          );
        checkDeclarations(body.replace(/\{[^{}]*\}/g, ""), ctx, `@keyframes ${kf}`);
        out += `${prelude}{${body}}\n`;
      } else {
        throw new ThemeError(`@${name} ไม่อนุญาต (ใช้ได้แค่ @media, @supports, @keyframes)`);
      }
    } else {
      const selectors = splitTop(prelude).map((s) => scopeSelector(s, ctx));
      checkDeclarations(body, ctx, prelude);
      out += `${selectors.join(",\n")}{${body}}\n`;
    }
    i = end;
  }
  return out;
}

/** Position of the next `{` (a rule) or `;` (a statement) outside strings/comments/parens. */
function findPreludeEnd(css: string, from: number): { kind: "brace" | "semi" | "end"; at: number } {
  let paren = 0;
  for (let i = from; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") i = skipString(css, i);
    else if (c === "/" && css[i + 1] === "*") i = css.indexOf("*/", i + 2) + 1 || css.length;
    else if (c === "(" || c === "[") paren++;
    else if (c === ")" || c === "]") paren--;
    else if (paren <= 0 && c === "{") return { kind: "brace", at: i };
    else if (paren <= 0 && c === ";") return { kind: "semi", at: i };
    else if (paren <= 0 && c === "}") throw new ThemeError("มี } เกินมา");
  }
  return { kind: "end", at: css.length };
}

/** Validate and scope a theme. Throws ThemeError (with a Thai message) when something isn't allowed. */
export function scopeCss(css: string, no: number, dir: string): string {
  if (Buffer.byteLength(css) > MAX_CSS_BYTES)
    throw new ThemeError(`theme.css ใหญ่เกิน ${Math.round(MAX_CSS_BYTES / 1000)}KB`);
  const ctx: Ctx = { no, scope: `.th-custom-${no}`, dir };
  if (/@import/i.test(stripComments(css)))
    throw new ThemeError("@import ไม่อนุญาต (เขียน CSS ทั้งหมดไว้ในไฟล์เดียว)");
  checkUrls(stripComments(css), ctx);
  return scopeBlock(css, ctx);
}

export type ThemeMeta = { name?: string; tagline?: string; author?: string };

/** theme.json is optional; when present it must be small, plain and well-formed. */
export function readMeta(dir: string): ThemeMeta {
  const file = path.join(dir, "theme.json");
  if (!fs.existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new ThemeError("theme.json ไม่ใช่ JSON ที่ถูกต้อง");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ThemeError("theme.json ต้องเป็น object");
  const o = raw as Record<string, unknown>;
  const out: ThemeMeta = {};
  for (const [k, max] of [
    ["name", 40],
    ["tagline", 120],
    ["author", 60],
  ] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== "string" || (o[k] as string).length > max)
      throw new ThemeError(`theme.json: "${k}" ต้องเป็นข้อความไม่เกิน ${max} ตัวอักษร`);
    out[k] = o[k] as string;
  }
  return out;
}
