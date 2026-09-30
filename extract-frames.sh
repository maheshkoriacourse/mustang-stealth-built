#!/usr/bin/env bash
# Mustang frame-extract pipeline (owner spec: JPEG ~q90, <=1MB/frame, fast for mobile+desktop)
# Usage: ./tools/extract-frames.sh assets/video/act-1.mp4 assets/seq-1
# Requires: ffmpeg (full build), python3 (for size cap)
set -euo pipefail
IN="$1"; OUT="$2"
mkdir -p "$OUT"
# normalize to 24fps, 10s cap, 1280px width, strip audio
ffmpeg -y -i "$IN" -t 10 -r 24 -vf "scale='min(1280,iw)':-2:flags=lanczos" -an -q:v 2 "$OUT/f_%04d.jpg"
# enforce <=1MB per frame via re-encode loop
python3 - "$OUT" <<'PY'
import sys, os, glob, subprocess
out = sys.argv[1]
for f in sorted(glob.glob(os.path.join(out, 'f_*.jpg'))):
    sz = os.path.getsize(f)
    if sz <= 1_000_000:
        continue
    q = 88
    while q >= 70:
        tmp = f + '.tmp.jpg'
        subprocess.run(['ffmpeg','-y','-i',f,'-q:v',str(q),tmp], capture_output=True)
        if os.path.getsize(tmp) <= 1_000_000: break
        q -= 4
    else:
        # last resort: downscale 15%
        subprocess.run(['ffmpeg','-y','-i',f,'-vf','scale=iw*0.85:-2','-q:v','86',tmp], capture_output=True)
    os.replace(tmp, f)
    print(f'capped {os.path.basename(f)}: {sz//1024}KB -> {os.path.getsize(f)//1024}KB')
print('frame cap pass done')
PY
N=$(ls "$OUT"/f_*.jpg | wc -l)
echo "extracted $N frames -> $OUT"
