"""Encode the rendered PNG frames into the walkthrough MP4s (runs on the render server, CPU only).

  python3 make_video.py [--frames out/frames] [--outdir video] [--outputs hq,web] [--limit N] [--suffix _test]

Adds a fade in/out and one caption per shot. Caption times must match SHOTS in scene.py (24 fps).
"""
import argparse
import os
import subprocess
import sys

FPS = 24
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CAPTIONS = [  # (shot start s, shot end s, caption)
    (0, 9, "Arriving from the west road"),
    (9, 18, "Under the L-balcony to the walnut main door"),
    (18, 27, "Living hall around the courtyard"),
    (27, 36, "Sage & walnut kitchen \u00b7 NE pooja, idols facing west"),
    (36, 44, "Folded-plate stair with walnut treads"),
    (44, 52, "First-floor gallery over the courtyard \u2192 library"),
    (52, 59, "Master bedroom"),
    (59, 67, "The L-shaped balcony over the garden"),
    (67, 73, "Buddha fountain in the SE corner, facing west"),
    (73, 81, "Courtyard Home \u00b7 40\u2032 \u00d7 20\u2032 house \u00b7 W33 \u00b7 S46 \u00b7 E33 \u00b7 N51 plot"),
]
OUTPUTS = {
    "hq": ("walkthrough-1080p-hq.mp4", ["-crf", "17"]),
    "web": ("walkthrough-1080p.mp4", ["-crf", "21", "-maxrate", "8M", "-bufsize", "16M"]),
}

ap = argparse.ArgumentParser()
ap.add_argument("--frames", default="out/frames")
ap.add_argument("--outdir", default="video")
ap.add_argument("--outputs", default="hq,web")
ap.add_argument("--limit", type=int, default=0, help="encode only the first N frames (test run)")
ap.add_argument("--suffix", default="")
ap.add_argument("--poster", type=int, default=1790, help="frame used for the poster JPG")
args = ap.parse_args()
os.makedirs(os.path.join(args.outdir, "captions"), exist_ok=True)

frames = sorted(f for f in os.listdir(args.frames) if f.startswith("f_") and f.endswith(".png"))
n = args.limit or len(frames)
bad = [i for i in range(1, n + 1)
       if not os.path.exists(p := os.path.join(args.frames, f"f_{i:04d}.png")) or os.path.getsize(p) == 0]
if bad:
    sys.exit(f"missing or unfinished frames ({len(bad)}): {bad[:20]}")
dur = n / FPS

filters = ["fade=t=in:st=0:d=0.6"]
for i, (a, b, text) in enumerate(CAPTIONS):
    path = os.path.abspath(os.path.join(args.outdir, "captions", f"cap{i + 1}.txt"))
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)                                   # no trailing newline: it would add an empty line to the box
    a0, b0 = a + (0.8 if a == 0 else 0.35), b - 0.35
    filters.append(
        f"drawtext=fontfile={FONT}:textfile={path}:fontsize=38:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=18"
        f":x=54:y=h-th-60:enable='between(t,{a0},{b0})':alpha='min(1,min((t-{a0})/0.4,({b0}-t)/0.4))'")
filters.append(f"fade=t=out:st={max(0.0, dur - 1.0):.3f}:d=1.0")
script = os.path.join(args.outdir, "filters.txt")
with open(script, "w", encoding="utf-8") as f:
    f.write(",\n".join(filters))

for key in args.outputs.split(","):
    name, opts = OUTPUTS[key]
    out = os.path.join(args.outdir, name.replace(".mp4", args.suffix + ".mp4"))
    cmd = ["nice", "-n", "15", "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(FPS),
           "-i", os.path.join(args.frames, "f_%04d.png"), "-frames:v", str(n), "-filter_script:v", script,
           "-c:v", "libx264", "-preset", "slow", *opts, "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-movflags", "+faststart", "-threads", "16", out]
    subprocess.run(cmd, check=True)
    print(f"{out}: {os.path.getsize(out) / 1e6:.1f} MB, {dur:.1f} s", flush=True)

poster = os.path.join(args.frames, f"f_{args.poster:04d}.png")
if not args.limit and os.path.exists(poster):
    out = os.path.join(args.outdir, "walkthrough-poster.jpg")
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-i", poster, "-q:v", "3", out], check=True)
    print(f"{out}: {os.path.getsize(out) / 1e3:.0f} kB", flush=True)
