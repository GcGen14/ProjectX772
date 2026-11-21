// How a student arranges their own profile page: what is shown, tab order, grid size.
// Pure data + helpers (no DOM). The server keeps its own copy of the cleaner in server/layout.ts;
// layout.test.ts checks the two lists never drift apart.

export const LAYOUT_TABS = ["memories", "portraits", "messages", "albums", "about"] as const;
export type LayoutTab = (typeof LAYOUT_TABS)[number];

/** Parts of the page a student can switch off. `tab:*` hides a whole tab; the rest hide one piece. */
export const HIDE_KEYS = [
  // top of the page
  "cover",
  "bio",
  "badges",
  "friends",
  "tags",
  "share",
  // tabs
  "tab:memories",
  "tab:portraits",
  "tab:messages",
  "tab:albums",
  "tab:about",
  // information (hidden everywhere it would appear: top, tags and the about tab)
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
export type HideKey = (typeof HIDE_KEYS)[number];

export type Layout = {
  hide?: HideKey[];
  /** tab order (tabs not listed keep their usual order after these) */
  tabs?: LayoutTab[];
  /** tab shown first */
  start?: LayoutTab;
  /** photo grid columns (omit = automatic) */
  cols?: 2 | 3 | 4 | 5;
  /** memories tab: one grid, or grouped by event */
  memories?: "grid" | "events";
  /** cover: slideshow of several, or one picture */
  cover?: "slideshow" | "single";
};

export const LAYOUT_LABELS = {
  hide: {
    cover: "รูปปก",
    bio: "ข้อความแนะนำตัว",
    badges: "เหรียญ / บทบาท",
    friends: "เพื่อนในห้อง (วงกลมรูป)",
    tags: "แท็ก",
    share: "ปุ่มแชร์การ์ด",
    fullName: "ชื่อจริง",
    studentId: "รหัสนักเรียน",
    group: "กลุ่ม",
    birthday: "วันเกิด",
    dream: "ความฝัน",
    socials: "โซเชียล",
    song: "เพลงโปรด",
    hobbies: "สิ่งที่ชอบ",
    note: "หมายเหตุ",
    info: "มหาวิทยาลัย / พอร์ต / ทักษะ",
    mates: "แถบเพื่อนในห้อง",
  } as Record<string, string>,
  tabs: {
    memories: "ความทรงจำ",
    portraits: "รูปเดี่ยว",
    messages: "ข้อความ",
    albums: "อัลบั้ม",
    about: "เกี่ยวกับ",
  } as Record<LayoutTab, string>,
};

/** Same rules as the server: unknown keys dropped, at least one tab stays visible. */
export function cleanLayout(v: unknown): Layout {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Layout = {};
  const list = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s) => typeof s === "string") : [];
  let hide = [...new Set(list(o.hide))].filter((k): k is HideKey =>
    (HIDE_KEYS as readonly string[]).includes(k),
  );
  if (LAYOUT_TABS.every((t) => hide.includes(`tab:${t}` as HideKey)))
    hide = hide.filter((k) => !k.startsWith("tab:"));
  if (hide.length) out.hide = hide;
  const tabs = [...new Set(list(o.tabs))].filter((t): t is LayoutTab =>
    (LAYOUT_TABS as readonly string[]).includes(t),
  );
  if (tabs.length) out.tabs = tabs;
  if (typeof o.start === "string" && (LAYOUT_TABS as readonly string[]).includes(o.start))
    out.start = o.start as LayoutTab;
  if (typeof o.cols === "number" && [2, 3, 4, 5].includes(o.cols))
    out.cols = o.cols as Layout["cols"];
  if (o.memories === "events") out.memories = "events";
  if (o.cover === "single") out.cover = "single";
  return out;
}

export const isHidden = (l: Layout | undefined, key: HideKey) => !!l?.hide?.includes(key);

/** Tabs after the student's choices: hidden ones removed, their order first. */
export function arrangeTabs<T extends { key: string }>(tabs: T[], l: Layout | undefined): T[] {
  if (!l) return tabs;
  let out = tabs.filter((t) => !isHidden(l, `tab:${t.key}` as HideKey));
  if (!out.length) out = tabs; // never leave an empty page
  const rank = (k: string) => {
    const i = l.tabs?.indexOf(k as LayoutTab) ?? -1;
    return i < 0 ? 100 : i;
  };
  return [...out].sort((a, b) => rank(a.key) - rank(b.key)); // stable: unlisted tabs keep their order
}

/** The tab to open first: their choice if it is still there, else the first tab. */
export function startTab(tabs: { key: string }[], l: Layout | undefined): string {
  return (l?.start && tabs.find((t) => t.key === l.start)?.key) || tabs[0]?.key || "";
}
