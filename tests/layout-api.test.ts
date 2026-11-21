// The server half of "จัดหน้าโปรไฟล์": layout is validated, stored per student and survives other saves.
// Runs against a throwaway database (CLASS_DATA_DIR), never data/602.sqlite.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

let extras: typeof import("../server/extras.ts");
let dir = "";

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "class-layout-"));
  process.env.CLASS_DATA_DIR = dir;
  extras = await import("../server/extras.ts");
});
afterAll(async () => {
  (await import("../server/db.ts")).getDb().close(); // Windows can't delete an open file
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("student layout storage", () => {
  test("a new student starts with an empty layout", () => {
    expect(extras.getExtras(2).layout).toEqual({});
  });

  test("saves and returns a cleaned layout", () => {
    const saved = extras.saveExtras(3, {
      layout: {
        hide: ["bio", "tab:albums", "<script>", "bio"],
        tabs: ["about", "memories", "evil"],
        start: "about",
        cols: 4,
        memories: "events",
        cover: "single",
      },
    });
    expect(saved.layout).toEqual({
      hide: ["bio", "tab:albums"],
      tabs: ["about", "memories"],
      start: "about",
      cols: 4,
      memories: "events",
      cover: "single",
    });
    expect(extras.getExtras(3).layout).toEqual(saved.layout);
  });

  test("other saves (socials, privacy) keep the layout", () => {
    extras.saveExtras(4, { layout: { hide: ["tags"], cols: 2 } });
    extras.saveExtras(4, { privacy: { hidePhotos: true } });
    extras.saveExtras(4, { socials: [{ type: "instagram", value: "someone" }] });
    const e = extras.getExtras(4);
    expect(e.layout).toEqual({ hide: ["tags"], cols: 2 });
    expect(e.privacy.hidePhotos).toBe(true);
  });

  test("saving a layout leaves everything else alone", () => {
    extras.saveExtras(5, {
      socials: [{ type: "github", value: "me" }],
      privacy: { noindex: true },
    });
    extras.saveExtras(5, { layout: { hide: ["cover"] } });
    const e = extras.getExtras(5);
    expect(e.socials).toHaveLength(1);
    expect(e.privacy.noindex).toBe(true);
    expect(e.layout).toEqual({ hide: ["cover"] });
  });

  test("nonsense is dropped, and a page can never have zero tabs", () => {
    const all = ["memories", "portraits", "messages", "albums", "about"].map((t) => `tab:${t}`);
    expect(extras.saveExtras(6, { layout: "not an object" }).layout).toEqual({});
    expect(extras.saveExtras(6, { layout: { cols: 99, start: 5 } }).layout).toEqual({});
    expect(extras.saveExtras(6, { layout: { hide: all } }).layout).toEqual({});
  });

  test("clearing the layout resets it", () => {
    extras.saveExtras(7, { layout: { hide: ["bio"] } });
    expect(extras.saveExtras(7, { layout: {} }).layout).toEqual({});
  });

  test("each student has their own layout", () => {
    extras.saveExtras(8, { layout: { hide: ["bio"] } });
    extras.saveExtras(9, { layout: { hide: ["tags"] } });
    expect(extras.getExtras(8).layout.hide).toEqual(["bio"]);
    expect(extras.getExtras(9).layout.hide).toEqual(["tags"]);
    expect(extras.listExtras()[8].layout.hide).toEqual(["bio"]);
  });
});
