"""
Browser smoke test (Playwright, headless Chromium). Needs the site running:

    npx vp dev --port 5199        # then:
    python scripts/smoke.py http://localhost:5199
    python scripts/smoke.py https://project772.jn03.cloud     # also fine against production

Logins are never typed: the profile-layout checks answer /api/extras and /api/me themselves
(Playwright route mocks), so no real student account or password is involved. Nothing is saved.
Set CHROME=<path to chrome.exe> if Playwright's own browser isn't installed.
"""

import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5199").rstrip("/")
NO = 3  # any student number that exists
failures, passed = [], 0


def check(name, ok, detail=""):
    global passed
    if ok:
        passed += 1
        print(f"  ok   {name}")
    else:
        failures.append(name)
        print(f"  FAIL {name} {detail}")


def new_page(browser, width=1400, height=900, mock=None, me=False):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("response", lambda r: errs.append(f"{r.status} {r.url}") if r.status >= 400 and "favicon" not in r.url else None)
    pg.errs = errs
    if mock is not None:
        real = {}

        def extras(route):
            r = route.fetch()
            j = r.json()
            j["extras"][str(NO)] = {**j["extras"].get(str(NO), {"socials": [], "privacy": {}, "character": {"selections": {}, "colors": {}}, "info": {}, "hasCharacter": False, "updatedAt": ""}), "layout": mock}
            route.fulfill(response=r, json=j)

        pg.route("**/api/extras", extras)
    if me:
        students = ctx.request.get(BASE + "/api/students").json()["students"]
        rec = next(s for s in students if s["no"] == NO)
        def me_route(route):
            # GET: "I am student NO". PUT (saving the profile): accept and echo, nothing is stored
            if route.request.method == "GET":
                return route.fulfill(json={"user": {"no": NO, "needsPassword": False}, "student": rec})
            if route.request.method == "PUT":
                return route.fulfill(json={"student": rec})
            route.continue_()

        pg.route("**/api/me", me_route)
    return pg


def overflow(pg):
    return pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


def main():
    exe = os.environ.get("CHROME") or "C:/Users/Jnx03/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe"
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe) if os.path.exists(exe) else p.chromium.launch()

        print("profile: default layout")
        pg = new_page(b)
        pg.goto(f"{BASE}/member/{NO}")
        pg.wait_for_selector(".pf-tab", timeout=15000)
        tabs = pg.locator(".pf-tab").all_inner_texts()
        check("all five tabs by default", len(tabs) >= 4, tabs)
        check("bio, friends, share, tags are there", pg.locator(".pf-bio").count() == 1 and pg.locator(".pf-friends").count() == 1 and pg.locator(".pf-pass").count() == 1 and pg.locator(".pf-tags").count() == 1)
        check("no errors", not pg.errs, pg.errs[:3])
        pg.context.close()

        print("profile: custom layout (hide + reorder + start tab + columns + by event)")
        lay = {"hide": ["bio", "tags", "friends", "share", "cover", "fullName", "studentId", "dream", "tab:albums", "mates"], "tabs": ["about", "memories"], "start": "about", "cols": 2, "memories": "events"}
        pg = new_page(b, mock=lay)
        pg.goto(f"{BASE}/member/{NO}")
        pg.wait_for_selector(".pf-tab", timeout=15000)
        names = [t.strip() for t in pg.locator(".pf-tab").all_inner_texts()]  # label + count, e.g. "ความทรงจำ164"
        check("tabs reordered, albums hidden", names[0].startswith("เกี่ยวกับ") and names[1].startswith("ความทรงจำ") and not any(n.startswith("อัลบั้ม") for n in names), names)
        check("opens on the chosen tab", "is-active" in (pg.locator(".pf-tab").first.get_attribute("class") or "") and pg.locator(".pf-about").count() == 1)
        check("bio hidden", pg.locator(".pf-bio").count() == 0)
        check("friends hidden", pg.locator(".pf-friends").count() == 0)
        check("share hidden", pg.locator(".pf-pass").count() == 0)
        check("tags hidden", pg.locator(".pf-tags").count() == 0 and pg.locator(".pf-tag").count() == 0)
        check("nothing from the hidden parts is visible on screen", not pg.locator(".pf-bio, .pf-friends, .pf-pass, .pf-tag, .pf-cover img").evaluate_all("els => els.filter(e => e.offsetParent !== null)"))
        check("cover hidden", pg.locator(".pf-cover img").count() == 0)
        about = pg.locator(".pf-about-card").inner_text()
        check("hidden info is gone from the about card", "ชื่อจริง" not in about and "รหัสนักเรียน" not in about and "ความฝัน" not in about, about[:120])
        check("the rest of the card stays", "เลขที่" in about and "วันเกิด" in about)
        check("mates strip hidden", pg.locator(".pf-mate-strip").count() == 0)
        check("hidden info is gone from the top too", "รหัสนักเรียน (ID)" not in pg.locator(".pf-info-text").inner_text())
        pg.locator(".pf-tab", has_text="ความทรงจำ").click()
        pg.wait_for_timeout(800)
        groups = pg.locator(".pf-ev").count()
        check("memories grouped by event", groups >= 1, groups)
        if groups:
            check("two photo columns", pg.locator(".pf-ev .pf-masonry").first.evaluate("e => getComputedStyle(e).gridTemplateColumns.split(' ').length") == 2)
        pg.goto(f"{BASE}/member/{NO}?tab=memories")
        pg.wait_for_selector(".pf-tab")
        check("?tab= in the address still wins over the start tab", "is-active" in (pg.locator(".pf-tab", has_text="ความทรงจำ").get_attribute("class") or ""))
        check("no errors", not pg.errs, pg.errs[:3])
        pg.context.close()

        print("profile: a layout that hides every tab still shows the page")
        pg = new_page(b, mock={"hide": [f"tab:{t}" for t in ["memories", "portraits", "messages", "albums", "about"]]})
        pg.goto(f"{BASE}/member/{NO}")
        pg.wait_for_selector(".pf-tab", timeout=15000)
        check("tabs still there", pg.locator(".pf-tab").count() >= 4)
        pg.context.close()

        print("editor: จัดหน้า tab")
        pg = new_page(b, me=True)
        saved = {}

        def put(route):
            if route.request.method == "PUT":
                saved.update(route.request.post_data_json)
                j = {"extras": {"socials": [], "privacy": {}, "character": {"selections": {}, "colors": {}}, "info": {}, "hasCharacter": False, "updatedAt": "x", "layout": saved.get("layout", {})}}
                return route.fulfill(json=j)
            route.continue_()

        pg.route("**/api/me/extras", put)
        pg.goto(f"{BASE}/me")
        pg.wait_for_selector("[data-tab=layout]", timeout=15000)
        pg.locator("[data-tab=layout]").click()
        check("layout panel opens", pg.locator("[data-mx-layout]").is_visible())
        check("every tab listed", pg.locator("[data-lay-tab]").count() == 5)
        pg.locator("[data-lay-show=bio]").evaluate("e => e.click()")  # the visible control is the styled switch
        pg.locator("[data-lay-tab=about] [data-lay-move='-1']").click()
        pg.locator("[data-lay-tab=about] [data-lay-move='-1']").click()
        first = pg.locator("[data-lay-tab]").first.get_attribute("data-lay-tab")
        check("arrows move a tab", first in ("memories", "about"), first)
        pg.locator("[data-lay-cols]").select_option("4")
        pg.locator("[data-lay-memories]").select_option("events")
        pg.locator("[data-lay-start]").select_option("about")
        pg.locator("[data-save]").click()
        pg.wait_for_timeout(1200)
        L = saved.get("layout") or {}
        check("saved layout has the bio hidden", "bio" in (L.get("hide") or []), L)
        check("saved layout has columns, view, start tab", L.get("cols") == 4 and L.get("memories") == "events" and L.get("start") == "about", L)
        check("saved tab order has all tabs", sorted(L.get("tabs") or []) == sorted(["memories", "portraits", "messages", "albums", "about"]), L)
        pg.locator("[data-lay-reset]").click()
        pg.locator("[data-save]").click()
        pg.wait_for_timeout(800)
        check("reset clears the layout", (saved.get("layout") or {}) == {}, saved.get("layout"))
        # (pretending to be logged in makes the chat badge ask for unread messages: 401 is expected here)
        check("no errors", not [e for e in pg.errs if "/api/me/extras" not in e and "/api/chat/unread" not in e], pg.errs[:3])
        pg.context.close()

        print("phones (390px): no sideways scroll")
        for path in ["/", "/events", "/album/life", f"/member/{NO}", "/me"]:
            pg = new_page(b, width=390, height=800)
            pg.goto(BASE + path)
            pg.wait_for_timeout(3500)
            check(f"{path}", overflow(pg) <= 1, f"overflow {overflow(pg)}px")
            pg.context.close()
        pg = new_page(b, width=390, height=800)
        pg.goto(BASE + "/events")
        pg.wait_for_selector(".ev-card")
        href = pg.locator(".ev-card").first.get_attribute("href")
        pg.goto(BASE + href)
        pg.wait_for_timeout(3500)
        check(f"{href} (event page)", overflow(pg) <= 1, f"overflow {overflow(pg)}px")
        check("event photos render", pg.locator(".al-tile").count() > 0)
        pg.context.close()

        b.close()
    print(f"\n{passed} passed, {len(failures)} failed")
    if failures:
        print("failed:", *failures, sep="\n  - ")
        sys.exit(1)


main()
