// Profile layout choices (what a student shows on their page, tab order, grid size).
// Mirror of src/lib/layout.ts: layout.test.ts fails if the two lists differ.

export const LAYOUT_TABS = ["memories", "portraits", "messages", "albums", "about"] as const;
export const HIDE_KEYS = [
  "cover",
  "bio",
  "badges",
  "friends",
  "tags",
  "share",
  "tab:memories",
  "tab:portraits",
  "tab:messages",
  "tab:albums",
  "tab:about",
  "fullName",
  "studentId",
  "group",
  "birthday",
  "dream",
  "socials",
  "song",
  "hobbies",
  "note",
  "info",
  "mates",
] as const;

export type Layout = {
  hide?: string[];
  tabs?: string[];
  start?: string;
  cols?: 2 | 3 | 4 | 5;
  memories?: "events";
  cover?: "single";
};

export function cleanLayout(v: unknown): Layout {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Layout = {};
  const list = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 60) : [];
  let hide = [...new Set(list(o.hide))].filter((k) => (HIDE_KEYS as readonly string[]).includes(k));
  if (LAYOUT_TABS.every((t) => hide.includes(`tab:${t}`)))
    hide = hide.filter((k) => !k.startsWith("tab:")); // never an empty page
  if (hide.length) out.hide = hide;
  const tabs = [...new Set(list(o.tabs))].filter((t) =>
    (LAYOUT_TABS as readonly string[]).includes(t),
  );
  if (tabs.length) out.tabs = tabs;
  if (typeof o.start === "string" && (LAYOUT_TABS as readonly string[]).includes(o.start))
    out.start = o.start;
  if (typeof o.cols === "number" && [2, 3, 4, 5].includes(o.cols))
    out.cols = o.cols as Layout["cols"];
  if (o.memories === "events") out.memories = "events";
  if (o.cover === "single") out.cover = "single";
  return out;
}
