import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { eventDay, eventTime, schoolYear, shortDay, spread, toDate } from "../src/lib/events.ts";
import type { EventRec } from "../src/data.ts";

const file = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const { events } = file("../src/data/events.json") as { events: EventRec[] };
const manifest = file("../src/data/manifest.json") as {
  albums: Record<string, { photos: { id: string }[] }>;
};
const ev = (o: Partial<EventRec>): EventRec => ({
  id: "e000000",
  title: "t",
  day: null,
  start: null,
  end: null,
  albums: {},
  photos: [],
  cover: "",
  ...o,
});

describe("event helpers", () => {
  test("eventTime", () => {
    expect(eventTime(ev({ start: "2026-09-08 09:42", end: "2026-09-08 10:03" }))).toBe(
      "09:42–10:03",
    );
    expect(eventTime(ev({ start: "2026-09-08 09:42", end: "2026-09-08 09:42" }))).toBe("09:42");
    expect(eventTime(ev({ start: "2026-09-08", end: "2026-09-08" }))).toBe("");
    expect(eventTime(ev({}))).toBe("");
  });
  test("eventDay (Buddhist year, ranges)", () => {
    expect(eventDay(ev({ day: "2026-09-08", end: "2026-09-08 10:00" }))).toBe("8 ก.ย. 2569");
    expect(eventDay(ev({ day: "2026-09-08", end: "2026-09-10" }))).toBe(
      "8 ก.ย. 2569 – 10 ก.ย. 2569",
    );
    expect(eventDay(ev({}))).toBe("");
  });
  test("shortDay / toDate", () => {
    expect(shortDay("2025-11-05")).toBe("5 พ.ย. 2568");
    expect(toDate("2025-11-05 09:30").getHours()).toBe(9);
  });
  test("schoolYear: the year starts in May", () => {
    expect(schoolYear("2026-04-30")).toEqual({ grade: "ม.5", year: 2568 });
    expect(schoolYear("2026-05-01")).toEqual({ grade: "ม.6", year: 2569 });
    expect(schoolYear("2025-11-05")).toEqual({ grade: "ม.5", year: 2568 });
    expect(schoolYear("2024-09-20")).toEqual({ grade: "ม.4", year: 2567 });
    expect(schoolYear("2019-01-01").grade).toBe("");
  });
  test("spread picks evenly and never mutates", () => {
    const a = Array.from({ length: 30 }, (_, i) => i);
    const s = spread(a, 3);
    expect(s).toHaveLength(3);
    expect(s[0]).toBeGreaterThan(0); // not the first file
    expect(new Set(s).size).toBe(3);
    expect(spread([1, 2], 5)).toEqual([1, 2]);
    expect(a).toHaveLength(30);
  });
});

describe("events.json (scripts/events.py output)", () => {
  const all = new Set(Object.values(manifest.albums).flatMap((a) => a.photos.map((p) => p.id)));

  test("ids are unique and well formed", () => {
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^e[0-9a-f]{6}$/); // matches the /event/:id route
  });
  test("every photo is in exactly one event, and every event photo exists", () => {
    const seen = new Map<string, string>();
    for (const e of events)
      for (const p of e.photos) {
        expect(seen.has(p), `${p} is in ${seen.get(p)} and ${e.id}`).toBe(false);
        seen.set(p, e.id);
      }
    for (const p of all) expect(seen.has(p), `photo ${p} has no event`).toBe(true);
    for (const p of seen.keys())
      expect(all.has(p), `event photo ${p} is not in an album`).toBe(true);
  });
  test("covers belong to their own event", () => {
    for (const e of events) expect(e.photos).toContain(e.cover);
  });
  test("album counts add up", () => {
    for (const e of events) {
      expect(Object.values(e.albums).reduce((n, c) => n + c, 0)).toBe(e.photos.length);
    }
  });
  test("dates and times are sane", () => {
    for (const e of events) {
      if (e.day) {
        expect(e.day).toMatch(/^20\d\d-\d\d-\d\d$/);
        expect(e.day >= "2022").toBe(true);
      }
      if (e.start && e.end) expect(e.start <= e.end).toBe(true);
    }
  });
  test("listed events have a real title; leftovers are marked minor", () => {
    const listed = events.filter((e) => !e.minor);
    expect(listed.length).toBeGreaterThan(10);
    for (const e of listed) {
      expect(e.title.trim().length).toBeGreaterThan(2);
      expect(e.title).not.toMatch(/ภาพอื่น ๆ/);
    }
    for (const e of events.filter((x) => x.other)) expect(e.minor).toBe(true);
  });
  test("no event is a giant pile", () => {
    for (const e of events) expect(e.photos.length).toBeLessThan(120);
  });
});
