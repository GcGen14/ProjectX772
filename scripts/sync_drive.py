"""
Sync class photos from the public Google Drive folders into the site.

  python scripts/sync_drive.py          (run from the ProjectX772 folder)

What it does
  1. Walks every folder below (including sub-folders) via Drive's public folder view.
  2. Downloads a 600px JPEG preview of every photo and video into public/photos/thumbs/
     (Drive converts HEIC to JPEG for us).
  3. Downloads 1600px versions of a few photos per album into public/photos/large/
     (used for hero cards and covers).
  4. Writes src/data/manifest.json with ids, sizes and groups for the site to read.

Full-size images in the lightbox and all videos are streamed from Drive at view time,
so the folders must stay shared as "Anyone with the link".
Re-running is safe: files that already exist are skipped.
"""

import concurrent.futures as cf
import html
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

# slug -> list of (drive folder id, group label or None to use the sub-folder name)
ALBUMS = {
    "grad": [("1eh1ZSj5XrCsjNvSWV0nKzJm56TsWn6kP", None)],  # 6-2 / G1..G6
    "life": [("1QZ30GL2LwHptgpk04jiBNAz2oxBpkW9i", None)],  # memoriesGCgen14 / gc602
    "larb": [("1uRwB3CBD6YOyHxpUb0oirAl1K1ON3N1d", None)],  # โครตลาบบ
    "tep": [("1zt04yspWsNMbOWqc9bE2D4ozFjy2P_yz", None)],  # TEP ก็งี้แหวะะ
    "moments": [("1-ZAB-6IgqGE6R9UeJ0wjrCublq-TSBCZ", None)],  # คลิปโมเม้น 602
}
LARGE_PER_ALBUM = 14
PHOTO_EXT = {"JPG", "JPEG", "PNG", "HEIC", "WEBP"}
VIDEO_EXT = {"MOV", "MP4", "AVI", "M4V", "MKV"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS = os.path.join(ROOT, "public", "photos", "thumbs")
LARGE = os.path.join(ROOT, "public", "photos", "large")
MANIFEST = os.path.join(ROOT, "src", "data", "manifest.json")
UA = {"User-Agent": "Mozilla/5.0"}


def fetch(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def listing(folder_id):
    raw = fetch(f"https://drive.google.com/embeddedfolderview?id={folder_id}")
    if raw is None:
        raise SystemExit(f"Could not read folder {folder_id}. Is it shared publicly?")
    s = raw.decode("utf8")
    items = []
    for url, name in re.findall(
        r'<a href="(https://drive\.google\.com/[^"]+)"[^>]*>.*?<div class="flip-entry-title">(.*?)</div>', s, re.S
    ):
        fid = re.search(r"/(?:d|folders)/([\w-]+)", url).group(1)
        items.append(("dir" if "/folders/" in url else "file", html.unescape(name).strip(), fid))
    return items


def walk(folder_id, group, out):
    for kind, name, fid in listing(folder_id):
        if kind == "dir":
            walk(fid, group or name, out)
        else:
            ext = name.rsplit(".", 1)[-1].upper()
            if ext in PHOTO_EXT:
                out.append({"id": fid, "name": name, "kind": "photo", "group": group})
            elif ext in VIDEO_EXT:
                out.append({"id": fid, "name": name, "kind": "video", "group": group})


def save_jpeg(data, path, width, quality):
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return im.size


def thumb(item):
    path = os.path.join(THUMBS, item["id"] + ".jpg")
    if not (os.path.exists(path) and os.path.getsize(path) > 500):
        data = fetch(f"https://drive.google.com/thumbnail?id={item['id']}&sz=w600")
        if not data or data[:2] not in (b"\xff\xd8", b"\x89P"):
            return None
        save_jpeg(data, path, 600, 74)
    with Image.open(path) as im:
        return im.size


def large(item):
    path = os.path.join(LARGE, item["id"] + ".jpg")
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return True
    data = fetch(f"https://drive.google.com/thumbnail?id={item['id']}&sz=w1600")
    if not data or data[:2] not in (b"\xff\xd8", b"\x89P"):
        return False
    save_jpeg(data, path, 1600, 80)
    return True


def main():
    os.makedirs(THUMBS, exist_ok=True)
    os.makedirs(LARGE, exist_ok=True)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    manifest = {"generatedAt": time.strftime("%Y-%m-%d %H:%M"), "albums": {}}
    for slug, folders in ALBUMS.items():
        items = []
        for fid, group in folders:
            walk(fid, group, items)
        # de-duplicate by id, keep order
        seen, uniq = set(), []
        for it in items:
            if it["id"] not in seen:
                seen.add(it["id"])
                uniq.append(it)
        with cf.ThreadPoolExecutor(8) as ex:
            sizes = list(ex.map(thumb, uniq))
        photos, videos = [], []
        for it, size in zip(uniq, sizes):
            rec = {"id": it["id"], "name": it["name"]}
            if it["group"]:
                rec["group"] = it["group"]
            if size:
                rec["w"], rec["h"] = size
            if it["kind"] == "photo":
                if size:  # skip photos Drive could not render
                    photos.append(rec)
            else:
                rec["thumb"] = bool(size)
                videos.append(rec)
        # large versions for a spread of landscape-ish and portrait photos
        step = max(1, len(photos) // LARGE_PER_ALBUM)
        picks = photos[::step][:LARGE_PER_ALBUM]
        with cf.ThreadPoolExecutor(6) as ex:
            ok = list(ex.map(large, picks))
        for p, good in zip(picks, ok):
            if good:
                p["large"] = True
        manifest["albums"][slug] = {"photos": photos, "videos": videos}
        print(f"{slug:8s} photos={len(photos):4d} videos={len(videos):3d} large={sum(ok)}")
    with open(MANIFEST, "w", encoding="utf8") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", os.path.relpath(MANIFEST, ROOT))


if __name__ == "__main__":
    main()
