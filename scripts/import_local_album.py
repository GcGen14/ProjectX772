"""
Add a folder of photos on this computer as a built-in album (no Google Drive needed).

  python scripts/import_local_album.py <folder> <album slug>

Each photo gets a stable id from its contents ("lb-" + 16 hex, so the same photo is never added
twice), and is saved without EXIF/GPS as public/photos/thumbs/<id>.jpg (600px) and
public/photos/large/<id>.jpg (1280px). The album's photo list goes into src/data/manifest.json;
add the album itself to src/data/albums.json (the server adds new built-in albums on start).
Photos are ordered by the number at the end of their file name (LINE album exports: ..._12.jpg).
"""

import hashlib
import json
import os
import re
import sys

from PIL import Image, ImageOps

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS = os.path.join(ROOT, "public", "photos", "thumbs")
LARGE = os.path.join(ROOT, "public", "photos", "large")
MANIFEST = os.path.join(ROOT, "src", "data", "manifest.json")
THUMB_PX, LARGE_PX = 600, 1280


def order(name):
    m = re.search(r"(\d+)\.\w+$", name)
    return (int(m.group(1)) if m else 1 << 30, name)


def save(im, side, dst, quality):
    im = im.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)  # no exif= -> metadata dropped
    return im.size


def main():
    folder, slug = sys.argv[1], sys.argv[2]
    names = sorted((n for n in os.listdir(folder) if n.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))), key=order)
    manifest = json.load(open(MANIFEST, encoding="utf8"))
    known = {p["id"] for a in manifest["albums"].values() for p in a["photos"]}
    photos, seen = [], set()
    for k, name in enumerate(names):
        path = os.path.join(folder, name)
        pid = "lb-" + hashlib.sha1(open(path, "rb").read()).hexdigest()[:16]
        if pid in seen:
            print("  duplicate, skipped:", name)
            continue
        seen.add(pid)
        if pid in known and not any(p["id"] == pid for p in manifest["albums"].get(slug, {}).get("photos", [])):
            print("  already in another album, skipped:", name)
            continue
        t, l = os.path.join(THUMBS, pid + ".jpg"), os.path.join(LARGE, pid + ".jpg")
        with Image.open(path) as src:
            im = ImageOps.exif_transpose(src).convert("RGB")
        w, h = save(im, THUMB_PX, t, 80) if not os.path.exists(t) else Image.open(t).size
        if not os.path.exists(l):
            save(im, LARGE_PX, l, 74)
        photos.append({"id": pid, "name": f"{slug}-{len(photos) + 1}.jpg", "w": w, "h": h, "large": True})
        if k % 100 == 0:
            print(f"  {k + 1}/{len(names)}", flush=True)
    entry = {"photos": photos, "videos": []}
    text = open(MANIFEST, encoding="utf8").read().rstrip()
    end = "\n  }\n}"
    if slug not in manifest["albums"] and text.endswith(end):
        # append to the end of "albums" so the rest of the (hand-formatted) file stays as it is
        block = json.dumps({slug: entry}, ensure_ascii=False, indent=2)[1:-1].strip("\n")
        block = "\n".join("  " + line for line in block.split("\n"))
        text = text[: -len(end)] + ",\n" + block + end + "\n"
    else:
        manifest["albums"][slug] = entry
        text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    with open(MANIFEST, "w", encoding="utf8", newline="\n") as f:
        f.write(text)
    print(f"album '{slug}': {len(photos)} photos ({len(names) - len(photos)} skipped)")


if __name__ == "__main__":
    main()
