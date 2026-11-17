"""
Match classmates' faces to the class photos.

  python scripts/faces.py portraits   # 1. download + embed the studio portraits (folder "602")
  python scripts/faces.py class       # 2. download + embed every face in the class photos
  python scripts/faces.py match       # 3. write src/data/people.json for the site
  python scripts/faces.py pool        # every portrait + a face crop of each (run by "match" too)

Which portraits belong together is set by hand in scripts/people_groups.json (one entry per
student, by file name). Which student number gets which set is in src/data/students.json
("portraitSet"), which you can also edit from the site's /backend page.

Manual photo fixes go in scripts/people_overrides.json:
  { "addPhotos": { "12": ["<drive file id>"] }, "removePhotos": { "12": ["<drive file id>"] } }
  (keys are portrait set numbers)

Needs the two OpenCV Zoo models in scripts/models/:
  face_detection_yunet_2023mar.onnx, face_recognition_sface_2021dec.onnx
"""

import concurrent.futures as cf
import html
import json
import os
import re
import sys
import urllib.request

import cv2
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "scripts")
CACHE = os.path.join(HERE, ".cache")
MODELS = os.path.join(HERE, "models")
MANIFEST = os.path.join(ROOT, "src", "data", "manifest.json")
PEOPLE_JSON = os.path.join(ROOT, "src", "data", "people.json")
POOL_JSON = os.path.join(ROOT, "src", "data", "portrait_pool.json")
GROUPS = os.path.join(HERE, "people_groups.json")
OVERRIDES = os.path.join(HERE, "people_overrides.json")
PUBLIC_PEOPLE = os.path.join(ROOT, "public", "photos", "people")

PORTRAIT_FOLDER = "1sYKD2lfBaDR2lavqTWxa9AhebtMb50WY"
UA = {"User-Agent": "Mozilla/5.0"}

# SFace cosine similarity (model's own "same person" threshold is 0.363). Class photos contain many
# students from other rooms, so we're stricter: small/blurry faces need >= 0.50, and large clear faces
# need >= 0.56 (a sharp face that only scores ~0.45 is almost always someone else).
MATCH_THRESHOLD_SMALL = 0.50
MATCH_THRESHOLD_LARGE = 0.56
LARGE_FACE_PX = 70
MARGIN = 0.07  # best match must beat the runner-up classmate by this much


def fetch(url, tries=3):
    for _ in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
        except Exception:
            pass
    return None


def list_folder(fid):
    s = fetch(f"https://drive.google.com/embeddedfolderview?id={fid}").decode("utf8")
    out = []
    for url, name in re.findall(r'<a href="(https://drive\.google\.com/[^"]+)"[^>]*>.*?<div class="flip-entry-title">(.*?)</div>', s, re.S):
        if "/folders/" in url:
            continue
        out.append({"name": html.unescape(name).strip(), "id": re.search(r"/d/([\w-]+)", url).group(1)})
    return out


def download(ids, folder, size):
    os.makedirs(folder, exist_ok=True)

    def one(fid):
        p = os.path.join(folder, fid + ".jpg")
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return p
        d = fetch(f"https://drive.google.com/thumbnail?id={fid}&sz={size}")
        if d and d[:2] == b"\xff\xd8":
            open(p, "wb").write(d)
            return p
        return None

    with cf.ThreadPoolExecutor(8) as ex:
        return list(ex.map(one, ids))


class Faces:
    def __init__(self):
        self.det = cv2.FaceDetectorYN.create(os.path.join(MODELS, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 5000)
        self.rec = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "face_recognition_sface_2021dec.onnx"), "")

    def faces(self, path, max_side=1600):
        img = cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return []
        h, w = img.shape[:2]
        s = min(1.0, max_side / max(h, w))
        if s < 1:
            img = cv2.resize(img, (int(w * s), int(h * s)))
            h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, dets = self.det.detect(img)
        out = []
        if dets is None:
            return out
        for d in dets:
            fw, fh = d[2], d[3]
            if min(fw, fh) < 24:  # too small to recognise reliably
                continue
            crop = self.rec.alignCrop(img, d)
            feat = self.rec.feature(crop).flatten()
            feat = feat / (np.linalg.norm(feat) + 1e-9)
            box = [float(d[0] / w), float(d[1] / h), float(fw / w), float(fh / h)]
            out.append({"box": box, "score": float(d[14]), "size": float(min(fw, fh)), "feat": feat})
        return out


def cmd_portraits():
    items = list_folder(PORTRAIT_FOLDER)
    print("portraits in folder:", len(items))
    paths = download([i["id"] for i in items], os.path.join(CACHE, "people"), "w1200")
    F = Faces()
    feats, boxes = [], []
    for it, p in zip(items, paths):
        fs = F.faces(p) if p else []
        if not fs:
            print("  no face:", it["name"])
            feats.append(np.zeros(128, np.float32))
            boxes.append(None)
        else:
            f = max(fs, key=lambda f: f["size"])
            feats.append(f["feat"])
            boxes.append(f["box"])
    for it, b in zip(items, boxes):
        it["face"] = b
    np.save(os.path.join(CACHE, "portrait_feats.npy"), np.array(feats))
    json.dump(items, open(os.path.join(CACHE, "portraits.json"), "w", encoding="utf8"), ensure_ascii=False)
    print("embedded", len(items))


def class_photo_ids():
    """All class photos: from the site database (includes albums added in /backend), else the manifest."""
    db = os.path.join(ROOT, "data", "602.sqlite")
    if os.path.exists(db):
        import sqlite3

        con = sqlite3.connect(db)
        try:
            rows = con.execute("SELECT DISTINCT id FROM album_media WHERE kind = 'photo' AND w > 0").fetchall()
            if rows:
                return [r[0] for r in rows]
        except sqlite3.OperationalError:
            pass
        finally:
            con.close()
    m = json.load(open(MANIFEST, encoding="utf8"))
    return [p["id"] for a in m["albums"].values() for p in a["photos"]]


def cmd_class():
    """Detect + embed faces in class photos. Incremental: photos already processed are skipped."""
    faces_file = os.path.join(CACHE, "class_faces.json")
    feats_file = os.path.join(CACHE, "class_feats.npy")
    done_file = os.path.join(CACHE, "class_done.json")
    faces = json.load(open(faces_file)) if os.path.exists(faces_file) else []
    feats = list(np.load(feats_file)) if os.path.exists(feats_file) and faces else []
    done = set(json.load(open(done_file))) if os.path.exists(done_file) else {f["photo"] for f in faces}
    ids = [i for i in class_photo_ids() if i not in done]
    print(f"class photos to scan: {len(ids)} new ({len(done)} already done)", flush=True)
    if ids:
        paths = download(ids, os.path.join(CACHE, "class"), "w1600")
        F = Faces()
        for k, (pid, path) in enumerate(zip(ids, paths)):
            for f in F.faces(path) if path else []:
                faces.append({"photo": pid, "box": f["box"], "score": f["score"], "size": f["size"]})
                feats.append(f["feat"])
            done.add(pid)
            if k % 20 == 0 or k == len(ids) - 1:
                print(f"  {k + 1}/{len(ids)} photos, {len(faces)} faces", flush=True)
        np.save(feats_file, np.array(feats))
        json.dump(faces, open(faces_file, "w"))
        json.dump(sorted(done), open(done_file, "w"))
    print("faces found:", len(faces))


def load_sets():
    """Portrait sets from people_groups.json -> list of lists of portrait records."""
    items = json.load(open(os.path.join(CACHE, "portraits.json"), encoding="utf8"))
    pos = {it["name"]: i for i, it in enumerate(items)}
    groups = json.load(open(GROUPS, encoding="utf8"))["groups"]
    return items, [items[pos[g["from"]] : pos[g["to"]] + 1] for g in groups]


def save_avatar(portrait, dst, size=480):
    """Square, face-centred crop of a portrait for avatars."""
    src = os.path.join(CACHE, "people", portrait["id"] + ".jpg")
    im = Image.open(src).convert("RGB")
    W, H = im.size
    if portrait.get("face"):
        x, y, w, h = portrait["face"]
        cx, cy, s = (x + w / 2) * W, (y + h / 2) * H, max(w * W, h * H) * 1.9
    else:
        cx, cy, s = W / 2, H * 0.35, H * 0.6
    box = (int(cx - s / 2), int(cy - s / 2.3), int(cx + s / 2), int(cy + s / 2 * 1.13))
    im.crop(box).resize((size, size), Image.LANCZOS).save(dst, "JPEG", quality=84, optimize=True)


def cmd_pool():
    """All studio portraits (incl. ones in no set) + a face crop of each, so /backend can hand any
    single photo to any person and use any photo as their profile picture."""
    items, sets = load_sets()
    set_of = {p["id"]: k + 1 for k, s in enumerate(sets) for p in s}
    os.makedirs(PUBLIC_PEOPLE, exist_ok=True)
    out = []
    for it in items:
        src = os.path.join(CACHE, "people", it["id"] + ".jpg")
        if not os.path.exists(src):
            continue
        dst = os.path.join(PUBLIC_PEOPLE, it["id"] + ".jpg")
        if not os.path.exists(dst):
            im = Image.open(src).convert("RGB")
            im.thumbnail((1200, 1200))
            im.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
        face = os.path.join(PUBLIC_PEOPLE, f"face-{it['id']}.jpg")
        if not os.path.exists(face):
            save_avatar(it, face, size=240)
        with Image.open(dst) as im:
            w, h = im.size
        out.append({"id": it["id"], "w": w, "h": h, "set": set_of.get(it["id"])})
    json.dump({"portraits": out}, open(POOL_JSON, "w", encoding="utf8"), separators=(",", ":"))
    print("pool:", len(out), "portraits ->", os.path.relpath(POOL_JSON, ROOT))


def cmd_match():
    items, sets = load_sets()
    pfeats = np.load(os.path.join(CACHE, "portrait_feats.npy"))
    by_id = {it["id"]: pfeats[i] for i, it in enumerate(items)}
    refs = []
    for s in sets:
        fs = np.array([by_id[p["id"]] for p in s if np.linalg.norm(by_id[p["id"]]) > 0])
        refs.append(fs if len(fs) else np.zeros((1, 128), np.float32))

    faces = json.load(open(os.path.join(CACHE, "class_faces.json")))
    feats = np.load(os.path.join(CACHE, "class_feats.npy"))
    # score = average of the 3 most similar portraits (robust to sunglasses / odd poses)
    def score(r):
        sims = feats @ r.T
        k = min(3, sims.shape[1])
        return np.sort(sims, 1)[:, -k:].mean(1)

    S = np.stack([score(r) for r in refs], 1)  # faces x sets
    hits = [dict() for _ in sets]
    for fi, f in enumerate(faces):
        row = S[fi]
        best = int(np.argmax(row))
        top = row[best]
        second = np.partition(row, -2)[-2] if len(row) > 1 else 0
        need = MATCH_THRESHOLD_LARGE if f["size"] >= LARGE_FACE_PX else MATCH_THRESHOLD_SMALL
        if top >= need and top - second >= MARGIN:
            prev = hits[best].get(f["photo"])
            if prev is None or prev[0] < top:
                hits[best][f["photo"]] = (float(top), f["box"])

    ov = json.load(open(OVERRIDES, encoding="utf8")) if os.path.exists(OVERRIDES) else {}
    for k, ids in ov.get("addPhotos", {}).items():
        for pid in ids:
            hits[int(k) - 1][pid] = (1.0, None)  # manual: no face box
    for k, ids in ov.get("removePhotos", {}).items():
        for pid in ids:
            hits[int(k) - 1].pop(pid, None)

    os.makedirs(PUBLIC_PEOPLE, exist_ok=True)
    out = []
    for k, s in enumerate(sets):
        ports = []
        for p in s:
            dst = os.path.join(PUBLIC_PEOPLE, p["id"] + ".jpg")
            if not os.path.exists(dst):
                im = Image.open(os.path.join(CACHE, "people", p["id"] + ".jpg")).convert("RGB")
                im.thumbnail((1200, 1200))
                im.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
            with Image.open(dst) as im:
                w, h = im.size
            ports.append({"id": p["id"], "w": w, "h": h})
        save_avatar(s[0], os.path.join(PUBLIC_PEOPLE, f"avatar-{k + 1}.jpg"))
        photos = [pid for pid, _ in sorted(hits[k].items(), key=lambda kv: -kv[1][0])]
        out.append({"set": k + 1, "portraits": ports, "photos": photos})
        print(f"set {k + 1:2d}: portraits={len(ports):2d} photos={len(photos):3d}")
    # per-photo face tags for the viewer: { photoId: [[set, x, y, w, h], ...] } (box = fraction of image)
    tags = {}
    for k, h in enumerate(hits):
        for pid, (_score, box) in h.items():
            tags.setdefault(pid, []).append([k + 1, *([round(v, 4) for v in box] if box else [])])
    json.dump({"sets": out, "tags": tags}, open(PEOPLE_JSON, "w", encoding="utf8"), separators=(",", ":"))
    print("tagged photos:", len(tags))
    print("wrote", os.path.relpath(PEOPLE_JSON, ROOT))
    cmd_pool()


if __name__ == "__main__":
    {"portraits": cmd_portraits, "class": cmd_class, "match": cmd_match, "pool": cmd_pool}[sys.argv[1]]()
