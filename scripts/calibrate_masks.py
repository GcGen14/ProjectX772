"""
Calibrate the upper-face (mask-proof) fallback of faces.py on the class photos.

  python scripts/calibrate_masks.py

Faces the normal comparison tags with high certainty are treated as ground truth. For them we look at
the upper-face similarity to the right person (should match) and to the best OTHER person (must not).
Prints the thresholds that keep wrong matches rare, and how many extra tags the fallback adds with
the values currently set in faces.py.
"""

import importlib.util
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("faces", os.path.join(HERE, "faces.py"))
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)

items, sets = F.load_sets()
ids = F.identities(sets, items)
faces, feats, featsu = F.load_class()
print("faces:", len(faces), " identities:", len(ids))

# baseline without the fallback
saved = F.UP_MIN_PX
F.UP_MIN_PX = 10**9
hits, margins, _ = F.match_faces(faces, feats, featsu, ids)
F.UP_MIN_PX = saved
base = sum(len(h) for h in hits)

S = np.stack([F.top3(feats, i["feats"]) for i in ids], 1)
U = np.stack([F.top3(featsu, i["featu"]) for i in ids], 1)
pos, neg = [], []
for k, h in enumerate(hits):
    for sim, _box, fi in h.values():
        f = faces[fi]
        if sim >= 0.62 and margins[fi] >= 0.14 and f["size"] >= 60 and abs(f["yaw"]) <= 0.35:
            pos.append(U[fi, k])
            others = np.delete(U[fi], k)
            neg.append(others.max())
pos, neg = np.array(pos), np.array(neg)
print(f"sure faces: {len(pos)}")
print("upper-face sim to the right person: p5=%.2f p25=%.2f median=%.2f" % tuple(np.percentile(pos, [5, 25, 50])))
print("upper-face sim to the best other:   median=%.2f p95=%.2f p99=%.2f max=%.2f" % (np.median(neg), *np.percentile(neg, [95, 99]), neg.max()))
for t in (0.50, 0.55, 0.60, 0.65, 0.70):
    print(f"  threshold {t:.2f}: keeps {np.mean(pos >= t) * 100:5.1f}% of right matches, {np.mean(neg >= t) * 100:5.2f}% of wrong ones pass")

masks = np.array([f.get("mask", 0) for f in faces])
print("mask score: p50=%.2f p90=%.2f  share >= %.2f: %.1f%%" % (*np.percentile(masks, [50, 90]), F.UP_MASK_MIN, (masks >= F.UP_MASK_MIN).mean() * 100))

hits2, _, up = F.match_faces(faces, feats, featsu, ids)
print(f"tags without the fallback: {base}; with it: {sum(len(h) for h in hits2)} (+{up} from the upper face)")
