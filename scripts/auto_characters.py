"""
Make each student's default Humation character look like them, from their school profile photo
(scripts/.cache/refs/NN.jpg, see faces.py "refs"):

  skin colour   median of both cheeks
  hair colour   darkest pixels above the forehead
  hair style    how much hair sits above / beside / below the face (and if there are bangs)
  clothes       school uniform: white shirt + navy shorts (boys) or navy skirt (girls)

  python scripts/auto_characters.py   -> src/data/auto_characters.json
  node scripts/humation-avatars.mjs   -> regenerates public/photos/humation/<no>.svg from it

A character a student made themselves in /me always wins over these defaults.
"""

import json
import os
import sys

import cv2
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFS = os.path.join(ROOT, "scripts", ".cache", "refs")
MODELS = os.path.join(ROOT, "scripts", "models")
OUT = os.path.join(ROOT, "src", "data", "auto_characters.json")

# from the school record: numbers 1-32 are boys, 33-49 girls
GIRLS = set(range(33, 50))

UNIFORM_SHIRT = "#F3F5F9"
UNIFORM_NAVY = "#25345C"


def hexc(bgr):
    b, g, r = (int(max(0, min(255, v))) for v in bgr)
    return f"#{r:02X}{g:02X}{b:02X}"


def soften_skin(bgr):
    """Studio flash washes skin out or tints it; keep the measured tone but keep it friendly."""
    hsv = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2HSV)[0, 0].astype(float)
    hsv[0] = min(max(hsv[0], 7), 18)  # warm skin hue range (OpenCV hue 0-180)
    hsv[1] = min(max(hsv[1], 55), 120)
    hsv[2] = min(max(hsv[2], 170), 245)
    return cv2.cvtColor(np.uint8([[hsv]]), cv2.COLOR_HSV2BGR)[0, 0]


def analyse(det, path):
    img = cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    det.setInputSize((W, H))
    _, dets = det.detect(img)
    if dets is None:
        return None
    x, y, w, h = (float(v) for v in max(dets, key=lambda d: d[2] * d[3])[:4])

    def region(x0, y0, x1, y1):
        return img[int(max(0, y0)) : int(min(H, y1)), int(max(0, x0)) : int(min(W, x1))].reshape(-1, 3)

    # skin: both cheeks
    cheeks = np.concatenate(
        [region(x + 0.18 * w, y + 0.55 * h, x + 0.36 * w, y + 0.72 * h), region(x + 0.64 * w, y + 0.55 * h, x + 0.82 * w, y + 0.72 * h)]
    )
    skin = soften_skin(np.median(cheeks, 0))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    b, g, r = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    # hair = dark and not the blue backdrop
    hairmask = (gray < 80) & ~((b > r + 35) & (b > 90))

    def frac(x0, y0, x1, y1):
        m = hairmask[int(max(0, y0)) : int(min(H, y1)), int(max(0, x0)) : int(min(W, x1))]
        return float(m.mean()) if m.size else 0.0

    above = region(x + 0.2 * w, y - 0.45 * h, x + 0.8 * w, y + 0.02 * h)
    dark = above[np.argsort(above.sum(1))[: max(1, len(above) // 3)]]
    hair_col = np.median(dark, 0)
    hair_col = np.minimum(hair_col, 95)  # stays a believable natural shade

    # hair height above the face (rows with lots of hair)
    top = y
    for yy in range(int(y), int(max(0, y - 1.2 * h)), -2):
        if frac(x + 0.2 * w, yy, x + 0.8 * w, yy + 2) > 0.35:
            top = yy
    volume = (y - top) / h
    bangs = frac(x + 0.25 * w, y + 0.02 * h, x + 0.75 * w, y + 0.18 * h)
    sides = (frac(x - 0.22 * w, y + 0.95 * h, x + 0.02 * w, y + 1.35 * h) + frac(x + 0.98 * w, y + 0.95 * h, x + 1.22 * w, y + 1.35 * h)) / 2
    cheek_side = (frac(x - 0.15 * w, y + 0.35 * h, x + 0.05 * w, y + 0.85 * h) + frac(x + 0.95 * w, y + 0.35 * h, x + 1.15 * w, y + 0.85 * h)) / 2
    return {"skin": hexc(skin), "hair": hexc(hair_col), "volume": volume, "bangs": bangs, "sides": sides, "cheekSide": cheek_side}


def head_for(no, m):
    if no in GIRLS:
        if m["sides"] > 0.35:
            return "long-straight" if m["bangs"] < 0.45 else "blunt-long"
        if m["cheekSide"] > 0.5:  # hair hanging all along the cheeks = a bob (tied hair leaves strands only)
            return "fluffy-bob" if m["bangs"] > 0.45 else "blunt-bob"
        return "ponytail" if m["bangs"] < 0.45 else "low-ponytail"
    if m["bangs"] > 0.55:
        return "short-bangs"
    if m["volume"] > 0.42:
        return "messy-short"
    if m["volume"] > 0.3:
        return "side-swept-short"
    return "short"


def main():
    det = cv2.FaceDetectorYN.create(os.path.join(MODELS, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 5000)
    out = {}
    for no in range(1, 50):
        path = os.path.join(REFS, f"{no:02d}.jpg")
        m = analyse(det, path) if os.path.exists(path) else None
        if not m:
            print(f"{no:2d}: no photo / face, skipped")
            continue
        girl = no in GIRLS
        out[str(no)] = {
            "selections": {
                "head": head_for(no, m),
                "body": "shirt",
                "bottom": "flared-skirt" if girl else "cropped-pants",
                "glasses": "none",
                "item": "none",
            },
            "colors": {"skin": m["skin"], "hair": m["hair"], "clothes": UNIFORM_SHIRT, "bottom": UNIFORM_NAVY},
        }
        print(f"{no:2d}: {out[str(no)]['selections']['head']:<17} skin {m['skin']} hair {m['hair']}  vol={m['volume']:.2f} bangs={m['bangs']:.2f} sides={m['sides']:.2f} cheek={m['cheekSide']:.2f}")
    with open(OUT, "w", encoding="utf8", newline="\n") as f:
        json.dump({"_help": "Default characters made by scripts/auto_characters.py from school photos.", "characters": out}, f, indent=1)
        f.write("\n")
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
