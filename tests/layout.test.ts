import { describe, expect, test } from "vite-plus/test";
import * as clientLayout from "../src/lib/layout.ts";
import * as serverLayout from "../server/layout.ts";

const { cleanLayout, arrangeTabs, startTab, isHidden } = clientLayout;
const tabs = ["memories", "portraits", "messages", "albums", "about"].map((key) => ({ key }));
const keys = (l: { key: string }[]) => l.map((t) => t.key);

describe("layout lists", () => {
  test("server and client agree on every key", () => {
    expect([...serverLayout.HIDE_KEYS]).toEqual([...clientLayout.HIDE_KEYS]);
    expect([...serverLayout.LAYOUT_TABS]).toEqual([...clientLayout.LAYOUT_TABS]);
  });

  test("server and client cleaners give the same answer", () => {
    const samples: unknown[] = [
      {},
      null,
      "x",
      { hide: ["cover", "bogus", "cover", 3], tabs: ["about", "nope"], start: "albums", cols: 4 },
      { hide: clientLayout.LAYOUT_TABS.map((t) => `tab:${t}`) },
      { cols: 9, memories: "events", cover: "single", start: "zzz" },
    ];
    for (const s of samples) expect(serverLayout.cleanLayout(s)).toEqual(cleanLayout(s));
  });
});

describe("cleanLayout", () => {
  test("drops unknown keys and duplicates", () => {
    expect(cleanLayout({ hide: ["cover", "cover", "x", 1, null] })).toEqual({ hide: ["cover"] });
  });
  test("ignores bad shapes", () => {
    expect(cleanLayout(undefined)).toEqual({});
    expect(cleanLayout([1, 2])).toEqual({});
    expect(cleanLayout({ hide: "cover", tabs: 5, cols: "3" })).toEqual({});
  });
  test("never hides every tab", () => {
    const all = clientLayout.LAYOUT_TABS.map((t) => `tab:${t}`);
    expect(cleanLayout({ hide: [...all, "cover"] })).toEqual({ hide: ["cover"] });
    expect(cleanLayout({ hide: all.slice(1) }).hide).toHaveLength(4); // one tab left: allowed
  });
  test("only valid columns, start tab and enums", () => {
    expect(cleanLayout({ cols: 1 })).toEqual({});
    expect(cleanLayout({ cols: 5, start: "albums", memories: "events", cover: "single" })).toEqual({
      cols: 5,
      start: "albums",
      memories: "events",
      cover: "single",
    });
    expect(cleanLayout({ memories: "grid", cover: "slideshow" })).toEqual({}); // defaults are not stored
  });
});

describe("arrangeTabs / startTab", () => {
  test("no layout keeps the usual tabs", () => {
    expect(arrangeTabs(tabs, undefined)).toBe(tabs);
    expect(keys(arrangeTabs(tabs, {}))).toEqual(keys(tabs));
  });
  test("hides tabs", () => {
    expect(keys(arrangeTabs(tabs, { hide: ["tab:messages", "tab:albums"] }))).toEqual([
      "memories",
      "portraits",
      "about",
    ]);
  });
  test("custom order first, the rest keep their order", () => {
    expect(keys(arrangeTabs(tabs, { tabs: ["about", "albums"] }))).toEqual([
      "about",
      "albums",
      "memories",
      "portraits",
      "messages",
    ]);
  });
  test("a tab the profile does not have is ignored", () => {
    const some = tabs.filter((t) => t.key !== "portraits");
    expect(keys(arrangeTabs(some, { tabs: ["portraits", "about"] }))).toEqual([
      "about",
      "memories",
      "messages",
      "albums",
    ]);
  });
  test("keeps all tabs if the layout would hide them all", () => {
    const all = clientLayout.LAYOUT_TABS.map((t) => `tab:${t}`) as clientLayout.HideKey[];
    expect(arrangeTabs(tabs, { hide: all })).toHaveLength(5);
  });
  test("start tab: the choice if present, else the first tab", () => {
    expect(startTab(tabs, { start: "albums" })).toBe("albums");
    expect(startTab(arrangeTabs(tabs, { hide: ["tab:albums"] }), { start: "albums" })).toBe(
      "memories",
    );
    expect(startTab([], undefined)).toBe("");
  });
  test("isHidden", () => {
    expect(isHidden({ hide: ["bio"] }, "bio")).toBe(true);
    expect(isHidden({ hide: ["bio"] }, "tags")).toBe(false);
    expect(isHidden(undefined, "bio")).toBe(false);
  });
});
