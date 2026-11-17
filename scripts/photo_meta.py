"""
Read the date taken / GPS / camera from every class photo's EXIF header.

  python scripts/photo_meta.py        -> src/data/photo_meta.json

Only the first ~256 KB of each original file is downloaded (HTTP range request), which is
where JPEG and HEIC files keep their EXIF block. Photos sent through chat apps usually have
their EXIF stripped, so not every photo will have a date or location.
"""

import concurrent.futures as cf
import io
import json
import os
import sys
import urllib.request

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "src", "data", "manifest.json")
OUT = os.path.join(ROOT, "src", "data", "photo_meta.json")
CACHE = os.path.join(ROOT, "scripts", ".cache", "exif.json")


def head(fid, n=262143):
    req = urllib.request.Request(
        f"https://drive.usercontent.google.com/download?id={fid}&export=download",
        headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes=0-{n}"},
    )
    for _ in range(3):
        try:
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            pass
    return b""


def dms(v, ref):
    try:
        d, m, s = (float(x) for x in v)
        out = d + m / 60 + s / 3600
        return round(-out if ref in ("S", "W") else out, 6)
    except Exception:
        return None


def parse(data):
    i = data.find(b"Exif\x00\x00")
    if i < 0:
        return {}
    ex = Image.Exif()
    try:
        ex.load(data[i:])
    except Exception:
        try:
            ex.load(data[i + 6 :])
        except Exception:
            return {}
    out = {}
    sub = ex.get_ifd(0x8769)
    date = sub.get(0x9003) or ex.get(306)
    if isinstance(date, str) and len(date) >= 16 and not date.startswith("0000"):
        out["date"] = date[:16].replace(":", "-", 2)  # "2026-08-27 09:32"
    make, model = (ex.get(271) or "").strip(), (ex.get(272) or "").strip()
    cam = model if make and model.lower().startswith(make.lower().split()[0]) else f"{make} {model}".strip()
    if cam:
        out["camera"] = cam.replace("\x00", "")
    gps = ex.get_ifd(0x8825)
    if gps and 2 in gps and 4 in gps:
        lat, lon = dms(gps[2], gps.get(1)), dms(gps[4], gps.get(3))
        if lat is not None and lon is not None and (lat, lon) != (0, 0):
            out["lat"], out["lon"] = lat, lon
    return out


def main():
    m = json.load(open(MANIFEST, encoding="utf8"))
    photos = [p for a in m["albums"].values() for p in a["photos"]]
    cache = json.load(open(CACHE, encoding="utf8")) if os.path.exists(CACHE) else {}

    def one(p):
        if p["id"] in cache:
            return p["id"], cache[p["id"]]
        return p["id"], parse(head(p["id"]))

    done = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for pid, meta in ex.map(one, photos):
            cache[pid] = meta
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(photos)}", flush=True)
                json.dump(cache, open(CACHE, "w", encoding="utf8"))
    json.dump(cache, open(CACHE, "w", encoding="utf8"))
    out = {k: v for k, v in cache.items() if v}
    json.dump(out, open(OUT, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"photos: {len(photos)}  with date: {sum('date' in v for v in out.values())}  with GPS: {sum('lat' in v for v in out.values())}")
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
