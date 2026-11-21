// Checks every student theme in themes/<no>/ (run: node scripts/check-themes.ts [--changed <file>...]).
//   - folder is a student number that exists, holds only theme.css, theme.json and small images
//   - theme.css passes the rules in scripts/theme-css.ts
// With `--pr <base-ref>` (used by .github/workflows/theme-check.yml) it also requires that the change
// touches only ONE themes/<no>/ folder, so a theme PR can't sneak changes into the rest of the site.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_EXT, MAX_ASSET_BYTES, ThemeError, readMeta, scopeCss } from "./theme-css.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const themesDir = path.join(root, "themes");
const students = (
  JSON.parse(fs.readFileSync(path.join(root, "src/data/students.json"), "utf8")) as {
    students: { no: number }[];
  }
).students.map((s) => s.no);

const problems: string[] = [];
const fail = (where: string, msg: string) => problems.push(`${where}: ${msg}`);

const args = process.argv.slice(2);
const prBase = args[0] === "--pr" ? args[1] : undefined;

if (prBase) {
  const changed = execFileSync("git", ["diff", "--name-only", `${prBase}...HEAD`], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const outside = changed.filter((f) => !/^themes\/\d{1,2}\//.test(f));
  if (outside.length)
    fail(
      "PR",
      `ธีมต้องแก้เฉพาะในโฟลเดอร์ themes/<เลขที่>/ ของตัวเองเท่านั้น แต่ PR นี้แตะไฟล์อื่นด้วย: ${outside.join(", ")}`,
    );
  const folders = new Set(changed.map((f) => f.split("/")[1]));
  if (folders.size > 1)
    fail(
      "PR",
      `PR เดียวแก้ได้แค่ธีมของคนเดียว แต่แตะ ${[...folders].map((f) => `themes/${f}`).join(", ")}`,
    );
}

const dirs = fs.existsSync(themesDir)
  ? fs.readdirSync(themesDir, { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];
let checked = 0;
for (const d of dirs) {
  if (d.name.startsWith("_")) continue; // _template
  const where = `themes/${d.name}`;
  if (!/^\d{1,2}$/.test(d.name) || !students.includes(Number(d.name))) {
    fail(where, "ชื่อโฟลเดอร์ต้องเป็นเลขที่ของนักเรียน (เช่น themes/12)");
    continue;
  }
  const no = Number(d.name);
  const dir = path.join(themesDir, d.name);
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === "theme.css" || f === "theme.json") continue;
    if (!ASSET_EXT.test(f))
      fail(
        `${where}/${f}`,
        "อนุญาตเฉพาะ theme.css, theme.json และไฟล์รูป (png/jpg/webp/gif/svg/avif)",
      );
    else if (fs.statSync(path.join(dir, f)).size > MAX_ASSET_BYTES)
      fail(`${where}/${f}`, `ไฟล์รูปใหญ่เกิน ${Math.round(MAX_ASSET_BYTES / 1000)}KB`);
  }
  if (!files.includes("theme.css")) {
    fail(where, "ไม่มี theme.css");
    continue;
  }
  try {
    scopeCss(fs.readFileSync(path.join(dir, "theme.css"), "utf8"), no, dir);
    readMeta(dir);
    checked++;
  } catch (e) {
    if (e instanceof ThemeError) fail(`${where}/theme.css`, e.message);
    else throw e;
  }
}

if (problems.length) {
  console.error(`พบปัญหา ${problems.length} จุด:\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`ธีมผ่านการตรวจ ${checked} ธีม ✓`);
