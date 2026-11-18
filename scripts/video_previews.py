"""Make the short hover-preview clips for album videos.

For every video in the class albums this writes public/photos/previews/<id>.mp4: 4 seconds from
about a third of the way in, 480px wide, no sound, small enough to start playing the moment the
mouse rests on a tile. ffmpeg reads only the part it needs from Google Drive (range requests),
so the full originals are never downloaded.

    python scripts/video_previews.py            # missing clips only
    python scripts/video_previews.py --force    # remake all
Needs ffmpeg / ffprobe on PATH.
"""
import json
import os
import sqlite3
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "photos", "previews")
CLIP_SECONDS = 4


def video_ids():
    ids = []
    db = os.path.join(ROOT, "data", "602.sqlite")
    if os.path.exists(db):
        con = sqlite3.connect(db)
        ids = [r[0] for r in con.execute("SELECT DISTINCT id FROM album_media WHERE kind = 'video'")]
        con.close()
    if not ids:  # no database yet: the bundled manifest
        with open(os.path.join(ROOT, "src", "data", "manifest.json"), encoding="utf-8") as f:
            albums = json.load(f)["albums"]
        ids = [v["id"] for a in albums.values() for v in a.get("videos", [])]
    return sorted(set(ids))


def source(vid):
    return f"https://drive.usercontent.google.com/download?id={vid}&export=download&confirm=t"


def make(vid, force):
    dest = os.path.join(OUT, f"{vid}.mp4")
    if os.path.exists(dest) and not force:
        return vid, "skip"
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", source(vid)],
            capture_output=True, text=True, timeout=120,
        )
        duration = float(probe.stdout.strip() or 0)
    except (subprocess.TimeoutExpired, ValueError):
        duration = 0
    start = max(0.0, min(duration * 0.33, duration - CLIP_SECONDS)) if duration > CLIP_SECONDS else 0.0
    tmp = dest + ".part.mp4"
    cmd = [
        "ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", source(vid), "-t", str(CLIP_SECONDS),
        "-an", "-vf", "scale=480:-2,fps=24", "-c:v", "libx264", "-profile:v", "main", "-preset", "veryfast",
        "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        r = None
    if not r or r.returncode or not os.path.exists(tmp) or os.path.getsize(tmp) < 2000:
        if os.path.exists(tmp):
            os.remove(tmp)
        return vid, "FAILED " + (r.stderr.strip().splitlines()[-1][:120] if r and r.stderr.strip() else "timeout")
    os.replace(tmp, dest)
    return vid, f"ok {os.path.getsize(dest) // 1024}KB"


def main():
    force = "--force" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    os.makedirs(OUT, exist_ok=True)
    ids = only or video_ids()
    failed = 0
    with ThreadPoolExecutor(6) as pool:
        for i, (vid, msg) in enumerate(pool.map(lambda v: make(v, force), ids), 1):
            failed += msg.startswith("FAILED")
            if msg != "skip":
                print(f"[{i}/{len(ids)}] {vid} {msg}", flush=True)
    print(f"done: {len(ids)} videos, {failed} failed")


if __name__ == "__main__":
    main()
