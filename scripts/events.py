"""
Group every photo into "events" (the same occasion), no matter which Google Drive folder or LINE
album it came from, and work out each event's date, time, place and a name.

  python scripts/events.py            -> src/data/events.json
  python scripts/events.py --review   -> also writes scripts/.cache/events_review/NN.jpg (contact sheets)

How photos are put together (distance between two photos, then average-linkage clustering):
  * time    - EXIF date taken, a timestamp in the file name (20240617_164957.jpg), or the date a LINE album
              was named after. Photos from different days never end up together; on the same day,
              photos with a clock time are pulled together when they are close in time.
  * look    - colour histogram + a coarse colour layout of the picture (outfits, venue, light) and the
              classmates tagged in it (src/data/people.json).
  * order   - neighbours in the same upload / file-number run are likely the same moment.
Small left-overs are folded into the closest event; what is still unplaced goes to "other photos".

Names, places and fixes are written by hand in scripts/events_overrides.json (keyed by any photo id
of the event, so they survive re-grouping):
  { "events": [ { "photo": "<id>", "title": "...", "en": "...", "place": "...", "note": "..." } ],
    "merge":  [ ["<photo id of event A>", "<photo id of event B>"] ] }
GPS coordinates found in the photos are looked up once (OpenStreetMap Nominatim, cached).

Photos are read from public/photos/thumbs, dist/photos/thumbs or data/media/thumbs (server). With
FACES_HOME set (server) the result goes to $FACES_HOME/events.json instead of src/data.
"""

import datetime as dt
import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))


def find_root(d):
    while not os.path.isdir(os.path.join(d, "src", "data")):
        if d == os.path.dirname(d):
            raise SystemExit("events.py: can't find the project folder (src/data)")
        d = os.path.dirname(d)
    return d


ROOT = find_root(HERE)
FACES_HOME = os.environ.get("FACES_HOME")
CACHE = os.path.join(FACES_HOME, "cache") if FACES_HOME else os.path.join(HERE, ".cache")
OUT = os.path.join(FACES_HOME, "events.json") if FACES_HOME else os.path.join(ROOT, "src", "data", "events.json")
OVERRIDES = os.path.join(HERE, "events_overrides.json")
if not os.path.exists(OVERRIDES):
    OVERRIDES = os.path.join(os.path.dirname(HERE), "scripts", "events_overrides.json")
GEO_CACHE = os.path.join(CACHE, "geo.json")

# ---- tuning ----
SAME_DAY_GAP_MIN = 150  # photos with a clock time this far apart (same day) are not the same moment
CUT = 0.62  # average-linkage distance above which two groups stay separate
MAX_EVENT = 70  # bigger groups are split again (an "event" of 300 photos is just a pile)
MIN_EVENT = 4  # smaller groups are folded into the closest event
FOLD_MAX = 0.85  # ...unless even the closest event is further than this
MIN_YEAR = 2022  # EXIF clocks stuck at 1980 etc. are ignored

TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def thumb_path(pid):
    for base in ("public", "dist"):
        for sub in ("thumbs", "large"):
            p = os.path.join(ROOT, base, "photos", sub, pid + ".jpg")
            if os.path.exists(p):
                return p
    for sub in ("thumbs", "large"):
        p = os.path.join(ROOT, "data", "media", sub, pid + ".jpg")
        if os.path.exists(p):
            return p
    return None


def load_photos():
    """[{id, album, name, group, w, h, seq}] from the built-in manifest + the site database."""
    m = json.load(open(os.path.join(ROOT, "src", "data", "manifest.json"), encoding="utf8"))
    out, seen = [], set()
    for slug, a in m["albums"].items():
        for i, p in enumerate(a["photos"]):
            if p["id"] in seen:
                continue
            seen.add(p["id"])
            out.append({"id": p["id"], "album": slug, "name": p["name"], "group": p.get("group"), "w": p.get("w", 0), "h": p.get("h", 0), "seq": i})
    db = os.path.join(ROOT, "data", "602.sqlite")
    if os.path.exists(db):
        import sqlite3

        con = sqlite3.connect(db)
        try:
            for album, pid, name, grp, w, h, sort in con.execute("SELECT album, id, name, grp, w, h, sort FROM album_media WHERE kind = 'photo' AND w > 0 ORDER BY album, sort"):
                if pid not in seen:
                    seen.add(pid)
                    out.append({"id": pid, "album": album, "name": name, "group": grp, "w": w, "h": h, "seq": sort})
        except sqlite3.OperationalError:
            pass
        finally:
            con.close()
    return out


def load_exif():
    meta = {}
    for f in (os.path.join(CACHE, "exif.json"), os.path.join(ROOT, "src", "data", "photo_meta.json")):
        if os.path.exists(f):
            for k, v in json.load(open(f, encoding="utf8")).items():
                if v:
                    meta.setdefault(k, {}).update(v)
    return meta


def parse_line_date(name):
    """LINE albums are named after the day they were made: 'LINE_ALBUM_5112568 BE_..' = 5/11/2568."""
    m = re.match(r"LINE_ALBUM_(\d{4,8})(?:\s*BE)?[_ ]", name)
    if not m:
        return None
    digits = m.group(1)
    if len(digits) in (5, 6):  # d m yy / dd m yy ... (2-digit Buddhist year)
        for dl, ml in ((1, 1), (2, 1), (1, 2), (2, 2)):
            if dl + ml + 2 == len(digits):
                d, mo, y = int(digits[:dl]), int(digits[dl : dl + ml]), int(digits[dl + ml :])
                y = 2500 + y if y < 100 else y
                break
        else:
            return None
    else:
        y = int(digits[-4:])
        head = digits[:-4]
        cands = []
        for dl in (2, 1):  # prefer a two-digit day: 2092567 -> 20/9/2567
            if dl < len(head) and 1 <= len(head) - dl <= 2:
                cands.append((int(head[:dl]), int(head[dl:])))
        d, mo = next(((d, mo) for d, mo in cands if 1 <= d <= 31 and 1 <= mo <= 12), (0, 0))
    y = y - 543 if y > 2400 else y
    try:
        return dt.date(y, mo, d).isoformat() if 2022 <= y <= 2030 else None
    except ValueError:
        return None


def when_of(p, exif):
    """(day 'YYYY-MM-DD' | None, minutes since midnight | None, source)."""
    e = exif.get(p["id"], {}).get("date")
    if e and e[:4].isdigit() and int(e[:4]) >= MIN_YEAR:
        return e[:10], int(e[11:13]) * 60 + int(e[14:16]), "exif"
    m = re.search(r"(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)[-_ T]?([0-2]\d)([0-5]\d)([0-5]\d)", p["name"])
    if m and int(m.group(1)) >= MIN_YEAR:
        try:
            dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", int(m.group(4)) * 60 + int(m.group(5)), "name"
        except ValueError:
            pass
    d = parse_line_date(p["name"])
    if d:
        return d, None, "line"
    return None, None, None


LABEL_FIX = {"กีลา": "กีฬาสี"}
LABEL_SKIP = ("ส่งรูป", "ที่นั่งใหม่", "เล่นกับน้อง")


def clean_hint(t):
    t = re.sub(r"[^\w\s\u0E00-\u0E7F]", "", t)  # emoji
    t = re.sub(r"\s*\d{4}\s*จะเป็น.*$", "", t).strip()
    if t.startswith("ไหว้ครู"):
        t = "ไหว้ครูครั้งสุดท้าย"
    t = LABEL_FIX.get(t, t)
    return "" if t.startswith(LABEL_SKIP) else t


def line_label(name):
    """The free-text part of a LINE album name ('ค่ายทักษะชีวิต 2567') - a hint for naming events."""
    m = re.match(r"LINE_ALBUM_(.*?)_\d+_\d+\.", name)
    if not m:
        return ""
    t = re.sub(r"^\d{4,8}(\s*BE)?$", "", m.group(1)).strip()
    return "" if len(t) < 3 else t


# ------------------------------ visual features ------------------------------
def visual_features(paths):
    hist, layout, sky = [], [], []
    for p in paths:
        img = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR) if p else None
        if img is None:
            hist.append(np.zeros(16 * 4 * 4, np.float32))
            layout.append(np.zeros(3 * 3 * 3, np.float32))
            sky.append(0.0)
            continue
        img = cv2.resize(img, (160, int(160 * img.shape[0] / img.shape[1]) or 1), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        top = hsv[: max(1, hsv.shape[0] // 4)]
        blue = (top[..., 0] > 90) & (top[..., 0] < 130) & (top[..., 1] > 40) & (top[..., 2] > 120)
        cloud = (top[..., 1] < 40) & (top[..., 2] > 200)  # white sky; a ceiling light looks alike, so only half counts
        sky.append(float(blue.mean() + 0.5 * cloud.mean()))
        h = cv2.calcHist([hsv], [0, 1, 2], None, [16, 4, 4], [0, 180, 0, 256, 0, 256]).flatten()
        h = np.sqrt(h / (h.sum() + 1e-9))
        hist.append((h / (np.linalg.norm(h) + 1e-9)).astype(np.float32))
        lab = cv2.cvtColor(cv2.resize(img, (3, 3), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2LAB).astype(np.float32) / 255.0
        layout.append(lab.flatten())
    return np.array(hist), np.array(layout), np.array(sky)


def people_sets():
    f = os.path.join(FACES_HOME, "people.json") if FACES_HOME else None
    if not f or not os.path.exists(f):
        f = os.path.join(ROOT, "src", "data", "people.json")
    tags = json.load(open(f, encoding="utf8")).get("tags", {})
    return {pid: {t[0] for t in ts} for pid, ts in tags.items()}


def face_counts():
    """{photo: faces}, {photo: biggest face in px} from the face scan."""
    f = os.path.join(CACHE, "class_faces.json")
    c, big = Counter(), Counter()
    if os.path.exists(f):
        for x in json.load(open(f)):
            if x["size"] >= 30:
                c[x["photo"]] += 1
            big[x["photo"]] = max(big[x["photo"]], x["size"])
    return c, big


# ------------------------------ clustering ------------------------------
def distance_matrix(photos, whens, hist, layout, people):
    n = len(photos)
    cos = hist @ hist.T
    V = 1.0 - cos  # 0..1
    L = np.linalg.norm(layout[:, None, :] - layout[None, :, :], axis=2)
    L = np.minimum(1.0, L / 1.2)
    D = 0.62 * V * 2.0 + 0.38 * L  # roughly 0..1

    days = np.array([w[0] or "" for w in whens])
    mins = np.array([w[1] if w[1] is not None else -1 for w in whens], np.float32)
    known = days != ""
    both_day = known[:, None] & known[None, :]
    same_day = days[:, None] == days[None, :]
    D = np.where(both_day & ~same_day, 9.0, D)  # a different day is a different event
    both_t = (mins[:, None] >= 0) & (mins[None, :] >= 0) & both_day & same_day
    gap = np.abs(mins[:, None] - mins[None, :])
    D = np.where(both_t & (gap <= 20), D * 0.45, D)  # taken within 20 minutes: very likely one moment
    D = np.where(both_t & (gap > SAME_DAY_GAP_MIN), D + 1.0, D)
    D = np.where(both_t & (gap > 20) & (gap <= SAME_DAY_GAP_MIN), D + 0.25 * (gap / SAME_DAY_GAP_MIN), D)
    D = np.where(both_day & same_day & ~both_t, D * 0.8, D)  # same day, no clock: share the day

    # an undated photo next to dated ones is only loosely tied to them
    D = np.where(known[:, None] ^ known[None, :], D + 0.08, D)

    # people overlap
    ppl = [people.get(p["id"], set()) for p in photos]
    nos = sorted({x for s in ppl for x in s})
    if nos:
        M = np.zeros((n, max(nos) + 1), np.float32)
        for i, s_ in enumerate(ppl):
            M[i, list(s_)] = 1
        inter = M @ M.T
        union = M.sum(1)[:, None] + M.sum(1)[None, :] - inter
        D -= 0.12 * np.where(union > 0, inter / np.maximum(union, 1), 0)

    # neighbours in the same upload / numbering run
    album = np.array([p["album"] for p in photos])
    seq = np.array([p["seq"] for p in photos])
    pref = np.array([re.sub(r"\d+", "#", p["name"])[:24] for p in photos])
    near = (album[:, None] == album[None, :]) & (np.abs(seq[:, None] - seq[None, :]) <= 3)
    near &= pref[:, None] == pref[None, :]
    D = np.where(near & (D < 8), D * 0.78, D)
    D = np.where(album[:, None] != album[None, :], np.where(both_day & same_day, D, D + 0.12), D)
    # a class-photo shoot is one group at a time (G1..G6)
    grp = np.array([(p["group"] or "") if p["album"] == "grad" else "" for p in photos])
    D = np.where((grp[:, None] != grp[None, :]) & (grp[:, None] != "") & (grp[None, :] != ""), D + 0.7, D)
    D = np.clip(D, 0, 20)
    np.fill_diagonal(D, 0)
    return (D + D.T) / 2


def cluster(D):
    from scipy.cluster.hierarchy import fcluster, linkage
    from scipy.spatial.distance import squareform

    Z = linkage(squareform(D, checks=False), method="average")
    return fcluster(Z, t=CUT, criterion="distance") - 1


def split_big(D, labels):
    """Split groups above MAX_EVENT with complete linkage (gives even pieces; average linkage can
    peel off singletons and leave the pile intact). Repeats until every piece is small enough."""
    from scipy.cluster.hierarchy import fcluster, linkage
    from scipy.spatial.distance import squareform

    labels = labels.copy()
    nxt = labels.max() + 1
    for _ in range(4):
        changed = False
        for c in sorted(set(labels)):
            idx = np.where(labels == c)[0]
            if c < 0 or len(idx) <= MAX_EVENT:
                continue
            k = max(2, int(np.ceil(len(idx) / (MAX_EVENT * 0.55))))
            Z = linkage(squareform(D[np.ix_(idx, idx)], checks=False), method="complete")
            sub = fcluster(Z, t=k, criterion="maxclust")
            for s_ in sorted(set(sub))[1:]:
                labels[idx[sub == s_]] = nxt
                nxt += 1
                changed = True
        if not changed:
            break
    return labels


def fold_small(D, labels):
    labels = labels.copy()
    while True:
        sizes = Counter(l for l in labels if l >= 0)
        small = [c for c, s in sizes.items() if s < MIN_EVENT]
        if not small:
            return labels
        c = min(small, key=lambda c: sizes[c])
        idx = np.where(labels == c)[0]
        best, bd = None, 9
        for o, so in sizes.items():
            if o == c or so < MIN_EVENT or so + len(idx) > MAX_EVENT:
                continue
            d = float(D[np.ix_(idx, np.where(labels == o)[0])].mean())
            if d < bd:
                best, bd = o, d
        if best is None or bd > FOLD_MAX:
            labels[idx] = -1 - c  # parked: becomes "other photos"
        else:
            labels[idx] = best


# ------------------------------ naming ------------------------------
def th_day(day):
    d = dt.date.fromisoformat(day)
    return f"{d.day} {TH_MONTHS[d.month - 1]} {d.year + 543}"


def daypart(mins):
    if mins is None:
        return ""
    return "ช่วงเช้า" if mins < 600 else "ช่วงสาย" if mins < 720 else "ช่วงเที่ยง" if mins < 780 else "ช่วงบ่าย" if mins < 960 else "ช่วงเย็น" if mins < 1080 else "ช่วงค่ำ"


def clock(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"


ALBUM_TITLE = {"grad": "ถ่ายรูปรุ่น", "larb": "โครตลาบบ", "tep": "TEP", "moments": "โมเม้น 602", "life": "ชีวิต 602", "bucket": "รูปจากเพื่อน ๆ"}


def geocode(lat, lon):
    cache = json.load(open(GEO_CACHE, encoding="utf8")) if os.path.exists(GEO_CACHE) else {}
    key = f"{lat:.3f},{lon:.3f}"
    if key in cache:
        return cache[key]
    try:
        url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 16, "accept-language": "th"})
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "class-album-events/1.0"}), timeout=20)
        j = json.load(r)
        a = j.get("address", {})
        name = j.get("name") or a.get("amenity") or a.get("building") or a.get("road") or ""
        area = a.get("suburb") or a.get("city_district") or a.get("town") or a.get("city") or a.get("county") or ""
        res = " · ".join(x for x in dict.fromkeys([name, area]) if x)
    except Exception:
        res = ""
    cache[key] = res
    os.makedirs(CACHE, exist_ok=True)
    json.dump(cache, open(GEO_CACHE, "w", encoding="utf8"), ensure_ascii=False)
    return res


def build_event(members, photos, whens, exif, faces, bigface, outdoor, album_day):
    ps = [photos[i] for i in members]
    ws = [whens[i] for i in members]
    days = Counter(w[0] for w in ws if w[0])
    if not days:  # an album shot on a single day (class photos, a party) lends that day to its undated photos
        top_album, top_n = Counter(p["album"] for p in ps).most_common(1)[0]
        if top_n >= 0.8 * len(ps) and top_album in album_day:
            days = Counter({album_day[top_album]: len(ps)})
    # the day only counts when enough of the photos actually carry one (else it is a visual guess)
    day = days.most_common(1)[0][0] if days and sum(days.values()) >= max(2, 0.3 * len(ps)) else None
    mins = sorted(w[1] for w in ws if w[1] is not None and w[0] == day)
    albums = Counter(p["album"] for p in ps)
    groups = Counter(p["group"] for p in ps if p["group"] and p["album"] == "grad")
    hints = Counter(line_label(p["name"]) for p in ps)
    hints.pop("", None)
    cams = Counter(exif.get(p["id"], {}).get("camera") for p in ps)
    cams.pop(None, None)
    gps = [(exif[p["id"]]["lat"], exif[p["id"]]["lon"]) for p in ps if "lat" in exif.get(p["id"], {})]

    def score(p):
        f = faces.get(p["id"], 0)
        land = 1 if p["w"] >= p["h"] else 0
        return min(f, 14) + 4 * land + (2 if p["w"] * p["h"] > 0 else 0)

    cover = max(ps, key=score)["id"]
    ev = {
        "day": day,
        "start": f"{day} {clock(mins[0])}" if day and mins else day,
        "end": f"{day} {clock(mins[-1])}" if day and mins else day,
        "approx": bool(day) and not mins,
        "albums": dict(albums),
        "photos": [p["id"] for p in sorted(ps, key=lambda p: (p["album"], p["seq"]))],
        "cover": cover,
    }
    if gps:
        lat, lon = float(np.median([g[0] for g in gps])), float(np.median([g[1] for g in gps]))
        ev["lat"], ev["lon"] = round(lat, 5), round(lon, 5)
    if cams:
        ev["camera"] = cams.most_common(1)[0][0]
    # automatic title (hand-written overrides replace it). Only names that say something real are
    # kept; everything else is "minor": the photos still sit in their album, but the event isn't listed.
    main = albums.most_common(1)[0][0]
    n = len(ps)
    hint = clean_hint(hints.most_common(1)[0][0]) if hints and hints.most_common(1)[0][1] >= n * 0.4 else ""
    part = daypart(mins[len(mins) // 2]) if mins else ""
    if main == "grad" and groups:
        base, real = f"ถ่ายรูปรุ่น · กลุ่ม {groups.most_common(1)[0][0]}", True
    elif main == "larb":
        base, real = ("โครตลาบบ" + (f" {part}" if part else "")), True
    elif hint:
        base, real = hint, True
    elif day and n >= 8:
        base, real = ALBUM_TITLE.get(main, main) + (f" {part}" if part else ""), True
    else:
        base, real = ALBUM_TITLE.get(main, main), False
    ev["title"] = base
    ev["auto"] = True
    if not real:
        ev["minor"] = True
    return ev


def apply_overrides(events):
    if not os.path.exists(OVERRIDES):
        return events
    ov = json.load(open(OVERRIDES, encoding="utf8"))
    of = {pid: i for i, e in enumerate(events) for pid in e["photos"]}
    for a, b in ov.get("merge", []):
        ia, ib = of.get(a), of.get(b)
        if ia is None or ib is None or ia == ib:
            continue
        events[ia]["photos"] += events[ib]["photos"]
        events[ia]["albums"] = dict(Counter(events[ia]["albums"]) + Counter(events[ib]["albums"]))
        events[ib]["photos"] = []
        for pid in events[ia]["photos"]:
            of[pid] = ia
    for o in ov.get("events", []):
        i = of.get(o.get("photo"))
        if i is None:
            continue
        for k in ("title", "en", "place", "note", "kind", "cover"):
            if o.get(k):
                events[i][k] = o[k]
        events[i]["auto"] = False
        events[i].pop("minor", None)
    return [e for e in events if e["photos"]]


def main():
    review = "--review" in sys.argv
    photos = load_photos()
    exif = load_exif()
    whens = [when_of(p, exif) for p in photos]
    print(f"photos: {len(photos)}  with a day: {sum(1 for w in whens if w[0])}  with a clock time: {sum(1 for w in whens if w[1] is not None)}")
    paths = [thumb_path(p["id"]) for p in photos]
    print("computing picture features…", flush=True)
    hist, layout, sky = visual_features(paths)
    outdoor = {p["id"]: float(v) for p, v in zip(photos, sky)}
    people = people_sets()
    faces, bigface = face_counts()
    by_album = defaultdict(Counter)
    for p, w in zip(photos, whens):
        if w[0] and w[2] != "line":
            by_album[p["album"]][w[0]] += 1
    album_day = {a: c.most_common(1)[0][0] for a, c in by_album.items() if len(c) == 1 and sum(c.values()) >= 10}
    print("clustering…", flush=True)
    D = distance_matrix(photos, whens, hist, layout, people)
    labels = fold_small(D, split_big(D, cluster(D)))
    events = []
    parked = defaultdict(list)
    for c in sorted(set(labels)):
        members = np.where(labels == c)[0].tolist()
        if c < 0:
            for i in members:
                parked[photos[i]["album"]].append(i)
            continue
        events.append(build_event(members, photos, whens, exif, faces, bigface, outdoor, album_day))
    for album, members in parked.items():  # what's left, per album
        e = build_event(members, photos, whens, exif, faces, bigface, outdoor, album_day)
        e["title"] = f"{ALBUM_TITLE.get(album, album)} · ภาพอื่น ๆ"
        e["other"] = True
        e["minor"] = True
        events.append(e)
    # chronological; undated last
    events.sort(key=lambda e: (e["day"] is None, e["start"] or "", -len(e["photos"])))
    for e in events:
        if "lat" in e and not e.get("place"):
            e["place"] = geocode(e["lat"], e["lon"])
    events = apply_overrides(events)
    for i, e in enumerate(events):
        e["id"] = "e" + hashlib.sha1(min(e["photos"]).encode()).hexdigest()[:6]
        if not e.get("place"):
            e.pop("place", None)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".part"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump({"generatedAt": dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "events": events}, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    sizes = sorted((len(e["photos"]) for e in events), reverse=True)
    print(f"events: {len(events)}  largest: {sizes[:8]}  placed photos: {sum(sizes)}/{len(photos)}")
    print("wrote", os.path.relpath(OUT, ROOT))
    if review:
        review_sheets(events, photos)


def review_sheets(events, photos):
    from PIL import Image, ImageDraw

    out = os.path.join(CACHE, "events_review")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    by_id = {p["id"]: p for p in photos}
    for k, e in enumerate(events):
        ids = e["photos"]
        step = max(1, len(ids) // 24)
        pick = ids[::step][:24]
        cols, cw, ch = 8, 150, 110
        rows = (len(pick) + cols - 1) // cols
        im = Image.new("RGB", (cols * cw, rows * ch + 22), "white")
        ImageDraw.Draw(im).text((4, 4), f"{k:02d} {e['id']} n={len(ids)} {e.get('start') or e.get('day')} {e['albums']}", fill="black")
        for i, pid in enumerate(pick):
            p = thumb_path(pid)
            if not p:
                continue
            t = Image.open(p).convert("RGB")
            t.thumbnail((cw - 3, ch - 3))
            im.paste(t, ((i % cols) * cw + 1, 22 + (i // cols) * ch + 1))
        im.save(os.path.join(out, f"{k:02d}.jpg"), quality=65)
    print("review sheets:", out)


if __name__ == "__main__":
    main()
