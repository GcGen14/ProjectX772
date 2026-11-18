"""
Match classmates' faces to the class photos.

  python scripts/faces.py portraits   # 1. download + embed the studio portraits (folder "602")
  python scripts/faces.py class       # 2. download + embed every face in the class photos
  python scripts/faces.py match       # 3. write src/data/people.json for the site
  python scripts/faces.py pool        # every portrait + a face crop of each (run by "match" too)
  python scripts/faces.py school      # download everyone's school profile photo (student.prc.ac.th)
                                      # by their student ID into scripts/.cache/refs/NN.jpg
                                      # (only missing / changed ones; --force downloads all again)
  python scripts/faces.py refs        # "school", then embed the school profile photos
  python scripts/faces.py assign      # give each student number the portrait set that matches their
                                      # school photo (keeps number 1 as is), then run "match" again

The school photos are the reference face for each student number: they decide which portrait set is
whose, they are added to that set's reference faces when tagging class photos, and students without
a portrait set are tagged from their school photo alone.

Detection: YuNet on the 1600px copy; photos with small faces are scanned again from the full-size
original (faces under ~48px carry too little detail for recognition). Each face is embedded together
with its mirror image, and its pose (yaw) and sharpness are kept so matching can be stricter on
profile / blurry faces. "class" re-scans everything when the scan settings change (SCAN_VERSION).

Matching runs twice: after the first pass, each person's most certain class-photo faces are added to
their reference faces, which helps with looks the studio / school photos don't show.

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
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

import cv2
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))  # scripts/ (on the server: server/faces/)


def find_root(d):
    while not os.path.isdir(os.path.join(d, "src", "data")):
        if d == os.path.dirname(d):
            raise SystemExit("faces.py: can't find the project folder (src/data)")
        d = os.path.dirname(d)
    return d


ROOT = find_root(HERE)
# On the server, FACES_HOME=data/faces holds the models, the cache and the output, because data/ is
# the only folder that survives a deploy. Portraits / avatars are not rebuilt there (they ship in dist).
FACES_HOME = os.environ.get("FACES_HOME")
CACHE = os.path.join(FACES_HOME, "cache") if FACES_HOME else os.path.join(HERE, ".cache")
MODELS = os.path.join(FACES_HOME, "models") if FACES_HOME else os.path.join(HERE, "models")
MANIFEST = os.path.join(ROOT, "src", "data", "manifest.json")
BUNDLED_PEOPLE = os.path.join(ROOT, "src", "data", "people.json")
PEOPLE_JSON = os.path.join(FACES_HOME, "people.json") if FACES_HOME else BUNDLED_PEOPLE
POOL_JSON = os.path.join(ROOT, "src", "data", "portrait_pool.json")
GROUPS = os.path.join(HERE, "people_groups.json")
OVERRIDES = os.path.join(HERE, "people_overrides.json")
PUBLIC_PEOPLE = os.path.join(ROOT, "public", "photos", "people")

REFS = os.path.join(CACHE, "refs")  # school profile photos, NN.jpg = student number NN (git-ignored)
REF_FEATS = os.path.join(CACHE, "ref_feats.npy")
STUDENTS_JSON = os.path.join(ROOT, "src", "data", "students.json")
DB_FILE = os.path.join(ROOT, "data", "602.sqlite")
KEEP_NUMBERS = {1}  # numbers whose portrait set was checked by hand
PORTRAIT_FOLDER = "1sYKD2lfBaDR2lavqTWxa9AhebtMb50WY"
UA = {"User-Agent": "Mozilla/5.0"}

# SFace cosine similarity (model's own "same person" threshold is 0.363). Class photos contain many
# students from other rooms, so we're stricter: small/blurry faces need >= 0.50, and large clear faces
# need >= 0.56 (a sharp face that only scores ~0.45 is almost always someone else).
MATCH_THRESHOLD_SMALL = 0.50
MATCH_THRESHOLD_LARGE = 0.56
LARGE_FACE_PX = 70
MARGIN = 0.07  # best match must beat the runner-up classmate by this much
TURNED_EXTRA = 0.04  # extra similarity needed for a clearly turned face (|yaw| > TURNED_YAW)
TURNED_YAW = 0.35
SOLO_EXTRA = 0.03  # extra similarity for people known from their school photo only (one reference)

# detection
SCAN_VERSION = 2  # bump when detection / embedding changes so "class" re-scans every photo
DET_SCORE = 0.6
MIN_FACE_PX = 24
HIRES_BELOW_PX = 48  # photos with faces smaller than this are re-scanned from the full-size original
HIRES_SIZE = 3200

# gallery growth (second matching pass): class-photo faces this certain join the person's references
GROW_SIM = 0.62
GROW_MARGIN = 0.14
GROW_MIN_PX = 60
GROW_MAX = 12

SCHOOL_URL = "https://student.prc.ac.th/form/viewimageprofile.php?IDStudent={}"


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


def is_image(d):
    """JPEG or PNG bytes (Drive serves PNG uploads as PNG; OpenCV and Pillow read either)."""
    return bool(d) and (d[:2] == b"\xff\xd8" or d[:8] == b"\x89PNG\r\n\x1a\n")


def download(ids, folder, size):
    os.makedirs(folder, exist_ok=True)

    def one(fid):
        if fid.startswith("lb-"):  # added from this computer (import_local_album.py), not on Drive
            for base in ("public", "dist"):  # dev / server
                p = os.path.join(ROOT, base, "photos", "large", fid + ".jpg")
                if os.path.exists(p):
                    return p
            return None
        p = os.path.join(folder, fid + ".jpg")
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return p
        d = fetch(f"https://drive.google.com/thumbnail?id={fid}&sz={size}")
        if is_image(d):
            open(p, "wb").write(d)
            return p
        return None

    with cf.ThreadPoolExecutor(8) as ex:
        return list(ex.map(one, ids))


def unit(v):
    return v / (np.linalg.norm(v) + 1e-9)


def read_image(path, max_side):
    img = cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR) if path and os.path.exists(path) else None
    if img is None:
        return None
    h, w = img.shape[:2]
    s = min(1.0, max_side / max(h, w))
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


class Faces:
    def __init__(self):
        self.det = cv2.FaceDetectorYN.create(os.path.join(MODELS, "face_detection_yunet_2023mar.onnx"), "", (320, 320), DET_SCORE, 0.3, 5000)
        self.rec = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "face_recognition_sface_2021dec.onnx"), "")

    def embed(self, img, d):
        """Aligned 112px crop -> unit feature (crop + its mirror image averaged), plus sharpness."""
        crop = self.rec.alignCrop(img, d)
        f = unit(self.rec.feature(crop).flatten()) + unit(self.rec.feature(cv2.flip(crop, 1)).flatten())
        sharp = float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        return unit(f).astype(np.float32), sharp

    @staticmethod
    def yaw(d):
        """How far the head is turned: nose offset from the eyes' midpoint, in eye distances (0 = frontal)."""
        rx, ry, lx, ly, nx = d[4], d[5], d[6], d[7], d[8]
        eye = max(1.0, float(np.hypot(lx - rx, ly - ry)))
        return float((nx - (rx + lx) / 2) / eye)

    def faces_in(self, img):
        if img is None:
            return []
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, dets = self.det.detect(img)
        out = []
        for d in dets if dets is not None else []:
            fw, fh = d[2], d[3]
            if min(fw, fh) < MIN_FACE_PX:  # too small to recognise reliably
                continue
            feat, sharp = self.embed(img, d)
            box = [float(d[0] / w), float(d[1] / h), float(fw / w), float(fh / h)]
            out.append({"box": box, "score": float(d[14]), "size": float(min(fw, fh)), "yaw": self.yaw(d), "sharp": sharp, "feat": feat})
        return out

    def faces(self, path, max_side=1600):
        return self.faces_in(read_image(path, max_side))


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
    """All class photos: the built-in albums (manifest) + everything in the site database
    (includes albums added in /backend)."""
    m = json.load(open(MANIFEST, encoding="utf8"))
    ids = [p["id"] for a in m["albums"].values() for p in a["photos"]]
    db = os.path.join(ROOT, "data", "602.sqlite")
    if os.path.exists(db):
        import sqlite3

        con = sqlite3.connect(db)
        try:
            ids += [r[0] for r in con.execute("SELECT DISTINCT id FROM album_media WHERE kind = 'photo' AND w > 0")]
        except sqlite3.OperationalError:
            pass
        finally:
            con.close()
    return list(dict.fromkeys(ids))


def scan_photo(F, pid, path):
    """Faces in one class photo. If it has small faces and Drive holds a bigger original, scan that."""
    img = read_image(path, 1600)
    found = F.faces_in(img)
    if img is None or not any(f["size"] < HIRES_BELOW_PX for f in found):
        return found
    if max(img.shape[:2]) < 1590:  # the 1600px copy is already the original
        return found
    hp = os.path.join(CACHE, "class_hi", pid + ".jpg")
    if not os.path.exists(hp):
        d = fetch(f"https://drive.google.com/thumbnail?id={pid}&sz=w{HIRES_SIZE}")
        if not is_image(d):
            return found
        os.makedirs(os.path.dirname(hp), exist_ok=True)
        open(hp, "wb").write(d)
    hi = read_image(hp, HIRES_SIZE)
    if hi is None or max(hi.shape[:2]) < max(img.shape[:2]) * 1.25:
        return found
    return F.faces_in(hi)


def cmd_class():
    """Detect + embed faces in class photos. Incremental: photos already processed are skipped
    (all photos are scanned again when SCAN_VERSION changes)."""
    faces_file = os.path.join(CACHE, "class_faces.json")
    feats_file = os.path.join(CACHE, "class_feats.npy")
    done_file = os.path.join(CACHE, "class_done.json")
    faces = json.load(open(faces_file)) if os.path.exists(faces_file) else []
    feats = list(np.load(feats_file)) if os.path.exists(feats_file) and faces else []
    saved = json.load(open(done_file)) if os.path.exists(done_file) else {}
    if not isinstance(saved, dict) or saved.get("version") != SCAN_VERSION or "--force" in sys.argv:
        print(f"scan settings changed (v{SCAN_VERSION}): scanning every photo again", flush=True)
        faces, feats, saved = [], [], {}
    done = set(saved.get("done", []))
    ids = [i for i in class_photo_ids() if i not in done]
    print(f"class photos to scan: {len(ids)} new ({len(done)} already done)", flush=True)

    def save():
        np.save(feats_file, np.array(feats, np.float32).reshape(-1, 128))
        json.dump(faces, open(faces_file, "w"))
        json.dump({"version": SCAN_VERSION, "done": sorted(done)}, open(done_file, "w"))

    if ids:
        paths = download(ids, os.path.join(CACHE, "class"), "w1600")
        F = Faces()
        for k, (pid, path) in enumerate(zip(ids, paths)):
            for f in scan_photo(F, pid, path) if path else []:
                faces.append({"photo": pid, **{x: round(f[x], 4) if x != "box" else f[x] for x in ("box", "score", "size", "yaw", "sharp")}})
                feats.append(f["feat"])
            if path:
                done.add(pid)  # failed downloads are tried again next run
            if k % 20 == 0 or k == len(ids) - 1:
                print(f"  {k + 1}/{len(ids)} photos, {len(faces)} faces", flush=True)
            if k % 200 == 199:
                save()  # keep progress if the run is interrupted
        save()
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


def ref_path(no):
    return os.path.join(REFS, f"{no:02d}.jpg")


def cmd_school():
    """Download each student's school profile photo by student ID -> scripts/.cache/refs/NN.jpg.
    Only missing photos and ones whose student ID changed are fetched (--force: all of them)."""
    force = "--force" in sys.argv
    os.makedirs(REFS, exist_ok=True)
    ids_file = os.path.join(REFS, "ids.json")
    have = json.load(open(ids_file, encoding="utf8")) if os.path.exists(ids_file) else {}
    people = roster()
    for no, sid, _ in people:  # ID removed in /backend: drop the old photo so it can't tag anyone
        if not sid and str(no) in have:
            have.pop(str(no))
            if os.path.exists(ref_path(no)):
                os.remove(ref_path(no))
    todo = [(no, sid) for no, sid, _ in people if sid and (force or have.get(str(no)) != sid or not os.path.exists(ref_path(no)))]
    print(f"school photos: {len(todo)} to download ({len(people) - len(todo)} up to date)", flush=True)

    def one(job):
        no, sid = job
        d = fetch(SCHOOL_URL.format(urllib.parse.quote(sid)))
        if not is_image(d):
            return no, sid, "no photo on the school site"
        try:
            im = Image.open(io.BytesIO(d))
            im.load()
        except Exception as e:
            return no, sid, f"bad image ({e})"
        tmp = ref_path(no) + ".part"
        im.convert("RGB").save(tmp, "JPEG", quality=92)
        os.replace(tmp, ref_path(no))
        return no, sid, None

    with cf.ThreadPoolExecutor(4) as ex:
        for no, sid, err in ex.map(one, todo):
            if err:
                print(f"  number {no} ({sid}): {err}")
            else:
                have[str(no)] = sid
    json.dump(dict(sorted(have.items(), key=lambda kv: int(kv[0]))), open(ids_file, "w", encoding="utf8"))
    print("school photos on disk:", sum(os.path.exists(ref_path(no)) for no, _, _ in people))


def cmd_refs():
    """Download (missing) school photos, then embed each one (the biggest face in it)."""
    cmd_school()
    F = Faces()
    nos = [no for no, _, _ in roster()]
    feats = np.zeros((max(nos, default=0), 128), np.float32)
    for no in nos:
        fs = F.faces(ref_path(no))
        if not fs:
            print(f"  no face for number {no}")
            continue
        feats[no - 1] = max(fs, key=lambda f: f["size"])["feat"]
    np.save(REF_FEATS, feats)
    print("embedded", int((np.linalg.norm(feats, axis=1) > 0).sum()), "school photos")


def roster():
    """[(student number, student ID, portrait set)] from the site database (falls back to students.json)."""
    if os.path.exists(DB_FILE):
        import sqlite3

        con = sqlite3.connect(DB_FILE)
        try:
            rows = con.execute("SELECT no, student_id, portrait_set FROM students ORDER BY no").fetchall()
            return [(no, re.sub(r"\D", "", sid or ""), ps) for no, sid, ps in rows]
        finally:
            con.close()
    st = json.load(open(STUDENTS_JSON, encoding="utf8"))["students"]
    return [(s["no"], re.sub(r"\D", "", s.get("studentId") or ""), s.get("portraitSet")) for s in st]


def set_of_numbers():
    """{student number: portrait set}."""
    return {no: ps for no, _, ps in roster()}


def cmd_assign():
    """Optimal one-to-one assignment of portrait sets to student numbers by school-photo similarity."""
    from scipy.optimize import linear_sum_assignment

    items, sets = load_sets()
    pfeats = np.load(os.path.join(CACHE, "portrait_feats.npy"))
    by_id = {it["id"]: pfeats[i] for i, it in enumerate(items)}
    refs = np.load(REF_FEATS)
    current = set_of_numbers()
    kept_sets = {current.get(n) for n in KEEP_NUMBERS} - {None}
    numbers = [n for n in sorted(current) if n not in KEEP_NUMBERS and n <= len(refs) and np.linalg.norm(refs[n - 1]) > 0]
    set_ids = [k + 1 for k in range(len(sets)) if k + 1 not in kept_sets]

    def sim(set_no, no):
        fs = [by_id[p["id"]] for p in sets[set_no - 1] if np.linalg.norm(by_id[p["id"]]) > 0]
        if not fs:
            return 0.0
        sims = np.sort(np.array(fs) @ refs[no - 1])
        return float(sims[-3:].mean())  # 3 best portraits of the set

    M = np.array([[sim(k, n) for n in numbers] for k in set_ids])  # sets x numbers
    rows, cols = linear_sum_assignment(-M)
    new = {n: None for n in numbers}
    report = []
    for r, c in zip(rows, cols):
        k, n = set_ids[r], numbers[c]
        s = M[r, c]
        runner = np.sort(M[:, c])[-2] if len(set_ids) > 1 else 0
        if s >= 0.363:  # SFace "same person" threshold
            new[n] = k
        report.append((n, k, s, s - runner))
    print(" no  old -> new   sim  margin")
    for n, k, s, m in sorted(report):
        old = current.get(n)
        flag = "" if old == new[n] else "  <- changed"
        print(f"{n:3d}  {str(old):>3} -> {str(new[n]):>3}  {s:.2f}  {m:+.2f}{flag}")
    for n in numbers:
        if n not in {r[0] for r in report}:
            print(f"{n:3d}  {str(current.get(n)):>3} -> none (no portrait set left)")
    if "--write" not in sys.argv:
        print("dry run; add --write to save")
        return
    if os.path.exists(DB_FILE):
        import sqlite3

        con = sqlite3.connect(DB_FILE)
        for n, k in new.items():
            con.execute("UPDATE students SET portrait_set = ? WHERE no = ?", (k, n))
        con.commit()
        con.close()
    data = json.load(open(STUDENTS_JSON, encoding="utf8"))
    for st in data["students"]:
        if st["no"] in new:
            st["portraitSet"] = new[st["no"]]
    with open(STUDENTS_JSON, "w", encoding="utf8", newline="\n") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print("saved to the database + src/data/students.json")


def identities(sets, items):
    """Who can be tagged: one entry per portrait set (its portraits + its owner's school photo), plus
    one per student without a set who has a school photo. Each: {set, no, feats (n x 128)}."""
    pfeats = np.load(os.path.join(CACHE, "portrait_feats.npy"))
    by_id = {it["id"]: pfeats[i] for i, it in enumerate(items)}
    school = np.load(REF_FEATS) if os.path.exists(REF_FEATS) else np.zeros((0, 128), np.float32)
    has_school = lambda no: bool(no) and no <= len(school) and np.linalg.norm(school[no - 1]) > 0
    numbers = set_of_numbers()
    owner = {}
    for no, ps in sorted(numbers.items()):
        if ps and ps not in owner:
            owner[ps] = no
    out = []
    for k, s in enumerate(sets):
        fs = [by_id[p["id"]] for p in s if np.linalg.norm(by_id[p["id"]]) > 0]
        no = owner.get(k + 1)
        if has_school(no):
            fs += [school[no - 1]] * 2  # the school photo counts double: it is the reference face
        out.append({"set": k + 1, "no": no, "feats": np.array(fs, np.float32).reshape(-1, 128)})
    for no, ps in sorted(numbers.items()):
        if (not ps or ps > len(sets)) and has_school(no):
            out.append({"set": None, "no": no, "feats": school[no - 1][None, :]})
    return out


def match_faces(faces, feats, ids):
    """One pass: each face goes to its most similar person if it's similar enough and clearly ahead
    of the runner-up; a person is tagged at most once per photo (their most similar face).
    Returns, per identity, {photo: (sim, box, face index)}."""
    def score(r):  # average of the 3 most similar references (robust to sunglasses / odd poses)
        if not len(r):
            return np.full(len(feats), -1.0)
        sims = feats @ r.T
        k = min(3, sims.shape[1])
        return np.sort(sims, 1)[:, -k:].mean(1)

    S = np.stack([score(i["feats"]) for i in ids], 1)  # faces x identities
    hits = [dict() for _ in ids]
    margins = np.zeros(len(faces))
    for fi, f in enumerate(faces):
        row = S[fi]
        best = int(np.argmax(row))
        top = row[best]
        second = np.partition(row, -2)[-2] if len(row) > 1 else 0
        margins[fi] = top - second
        need = MATCH_THRESHOLD_LARGE if f["size"] >= LARGE_FACE_PX else MATCH_THRESHOLD_SMALL
        if abs(f.get("yaw", 0)) > TURNED_YAW:
            need += TURNED_EXTRA
        if ids[best]["set"] is None:
            need += SOLO_EXTRA
        if top >= need and top - second >= MARGIN:
            prev = hits[best].get(f["photo"])
            if prev is None or prev[0] < top:
                hits[best][f["photo"]] = (float(top), f["box"], fi)
    return hits, margins


def grow(ids, hits, margins, faces, feats):
    """Add each person's most certain class-photo faces (one per photo) to their references."""
    added = 0
    for i, h in zip(ids, hits):
        sure = [
            (sim, fi)
            for sim, _box, fi in h.values()
            if sim >= GROW_SIM and margins[fi] >= GROW_MARGIN and faces[fi]["size"] >= GROW_MIN_PX and abs(faces[fi].get("yaw", 0)) <= TURNED_YAW
        ]
        sure = [fi for _, fi in sorted(sure, reverse=True)[:GROW_MAX]]
        if sure:
            i["feats"] = np.vstack([i["feats"], feats[sure]])
            added += len(sure)
    return added


def cmd_match():
    items, sets = load_sets()
    ids = identities(sets, items)
    faces = json.load(open(os.path.join(CACHE, "class_faces.json")))
    feats = np.load(os.path.join(CACHE, "class_feats.npy")).reshape(-1, 128)
    hits, margins = match_faces(faces, feats, ids)
    first = sum(len(h) for h in hits)
    print(f"pass 1: {first} tags; adding {grow(ids, hits, margins, faces, feats)} certain faces to the references")
    hits, _ = match_faces(faces, feats, ids)
    print(f"pass 2: {sum(len(h) for h in hits)} tags")
    hits = [{pid: (sim, box) for pid, (sim, box, _fi) in h.items()} for h in hits]

    ov = json.load(open(OVERRIDES, encoding="utf8")) if os.path.exists(OVERRIDES) else {}
    for k, pids in ov.get("addPhotos", {}).items():
        for pid in pids:
            hits[int(k) - 1][pid] = (1.0, None)  # manual: no face box
    for k, pids in ov.get("removePhotos", {}).items():
        for pid in pids:
            hits[int(k) - 1].pop(pid, None)

    bundled = {}
    if FACES_HOME:  # server: portraits + avatars come with the build; only the tags are new
        bundled = {x["set"]: x["portraits"] for x in json.load(open(BUNDLED_PEOPLE, encoding="utf8"))["sets"]}
    else:
        os.makedirs(PUBLIC_PEOPLE, exist_ok=True)
    out = []
    for k, s in enumerate(sets):
        photos = [pid for pid, _ in sorted(hits[k].items(), key=lambda kv: -kv[1][0])]
        if FACES_HOME:
            out.append({"set": k + 1, "portraits": bundled.get(k + 1, []), "photos": photos})
            continue
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
        out.append({"set": k + 1, "portraits": ports, "photos": photos})
        print(f"set {k + 1:2d}: portraits={len(ports):2d} photos={len(photos):3d}")
    # per-photo face tags for the viewer: { photoId: [[set, x, y, w, h], ...] } (box = fraction of image)
    # students without a portrait set (matched by school photo) go in "students" / "studentTags",
    # keyed by student number instead of set number
    tags, solo, solo_tags = {}, [], {}
    for i, h in zip(ids, hits):
        key, dst = (i["set"], tags) if i["set"] else (i["no"], solo_tags)
        for pid, (_score, box) in h.items():
            dst.setdefault(pid, []).append([key, *([round(v, 4) for v in box] if box else [])])
        if not i["set"]:
            solo.append({"no": i["no"], "photos": [pid for pid, _ in sorted(h.items(), key=lambda kv: -kv[1][0])]})
            print(f"no {i['no']:2d} (school photo only): photos={len(h):3d}")
    tmp = PEOPLE_JSON + ".part"  # the site reads this file while we work: swap it in whole
    with open(tmp, "w", encoding="utf8") as f:
        json.dump({"sets": out, "tags": tags, "students": solo, "studentTags": solo_tags}, f, separators=(",", ":"))
    os.replace(tmp, PEOPLE_JSON)
    print("tagged photos:", len(set(tags) | set(solo_tags)))
    print("wrote", os.path.relpath(PEOPLE_JSON, ROOT))
    if not FACES_HOME:
        cmd_pool()


if __name__ == "__main__":
    {
        "portraits": cmd_portraits,
        "class": cmd_class,
        "match": cmd_match,
        "pool": cmd_pool,
        "school": cmd_school,
        "refs": cmd_refs,
        "assign": cmd_assign,
    }[sys.argv[1]]()
