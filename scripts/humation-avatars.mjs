// Generate a Humation avatar (https://github.com/humation-labs/humation, MIT) for every เลขที่.
// Used for classmates who have no studio portrait, and as everyone's default character.
// Looks come from src/data/auto_characters.json (scripts/auto_characters.py: hair, skin, uniform
// from each school photo); anything missing falls back to the seeded random look.
//
//   node scripts/humation-avatars.mjs        -> public/photos/humation/<no>.svg
//
// Deterministic: the same เลขที่ always gets the same avatar and colours.
import fs from "node:fs";
import path from "node:path";
import { createAvatar } from "@humation/core";
import { humation1 } from "@humation/assets-humation-1";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "photos", "humation");
const students = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "students.json"), "utf8"),
).students;

// soft palettes that sit well with the site's look
const HAIR = ["#2B2B2B", "#3B2A20", "#4A3728", "#1F1B24", "#5A3E2B", "#6B4A35"];
const CLOTHES = ["#9EC5FF", "#FFB4C6", "#B8E6C9", "#FFD89B", "#C9B8FF", "#A7E3F0", "#FFC9A8"];
const BOTTOM = ["#2E4A7D", "#3C3C46", "#4A5D8C", "#2F3E5C"];
const SKIN = ["#F8D9C0", "#F1C7A5", "#E8B48F", "#FBE3CF"];
const BG = ["#EAF2FF", "#FFEFF3", "#EDF8F0", "#FFF6E5", "#F2EEFF", "#E9F7FA"];

const pick = (arr, n, salt) => arr[(n * 7 + salt * 13) % arr.length];
const autoFile = path.join(ROOT, "src", "data", "auto_characters.json");
const AUTO = fs.existsSync(autoFile)
  ? JSON.parse(fs.readFileSync(autoFile, "utf8")).characters
  : {};

fs.mkdirSync(OUT, { recursive: true });
for (const { no } of students) {
  const svg = createAvatar(humation1, {
    seed: `602-gen14-${no}`,
    selections: AUTO[no]?.selections ?? {},
    colors: {
      hair: pick(HAIR, no, 1),
      clothes: pick(CLOTHES, no, 2),
      bottom: pick(BOTTOM, no, 3),
      skin: pick(SKIN, no, 4),
      ...AUTO[no]?.colors,
    },
    background: pick(BG, no, 5), // separate option, not a colour slot
  }).toString();
  fs.writeFileSync(path.join(OUT, `${no}.svg`), svg);
}
console.log(`wrote ${students.length} avatars to ${path.relative(ROOT, OUT)}`);
