# MUSTANG — FINAL 4 VIDEO PROMPTS (Veo-class, 10s each, 24fps)
Owner spec (30 Sep): car assembles STEP-BY-STEP across all four sections, multiple parts land in EVERY section, car COMPLETE only at the end, audience should FEEL hunger/awe. Images = our verified stills (image-to-video conditioning anchors).

GLOBAL RULES (paste at top of EVERY prompt):
> One continuous unbroken shot, ZERO camera cuts. Slow constant-speed camera. Matte-black satin paint never changes gloss. Every part that lands STAYS on the car. Strict forward assembly states only — never show the car complete before the final section. Photoreal 24fps cinematic motion blur, fine film grain, golden-hour salt flat, no people, no text, no logos, no watermark. Duration exactly 10 seconds.

---
## V-S1 (10s) — THE GRAVEYARD OF PARTS CHOOSES ITS CAR
IMAGE ANCHOR (first frame): assets/stills/K2.png (exploded parts array hovering over the salt).
Action: the 200 parts breathe in the amber light — then the four wheels slowly rotate to face their future positions; floor pan + suspension + rear axle sink from the array and fuse mid-air, landing on the salt as one bare rolling chassis; the rejected parts (shell, engine, doors, hood) rise higher, waiting. End on the bare chassis alone (K3) as the array fades tall behind it.
Camera: one slow 60-degree counter-clockwise arc, high three-quarter descending to chassis height, ending low and intimate.
Emotion target: mystery. The feeling that the parts have CHOSEN to become something.

## V-S2 (10s) — IT LEARNS TO STAND
IMAGE ANCHOR (first frame): assets/stills/K3.png (bare chassis on dollies).
Action: the four black styled-steel wheels rise from the horizon one by one — front-left, front-right, rear-left, rear-right — flying on curved trajectories, landing with real suspension settle and tiny salt puffs, staggered every ~2 seconds; the trestle dollies drop away and the bare chassis STANDS on its own four wheels (K4) as the low sun flares behind the rear arch.
Camera: long-lens lateral tracking, left to right, constant speed, ending framed on the rear wheel arch flare.
Emotion target: anticipation. A skeleton finding its stride.

## V-S3 (10s) — THE HEART ARRIVES
IMAGE ANCHOR (first frame): assets/stills/K4.png (rolling bare chassis, no body).
Action: the 428 Cobra Jet block and transmission descend TOGETHER on golden light shafts and bolt into the bay (0-3s); front fenders swing in and secure (3-5s); black leather buckets and the matte-black dash lower gently through the open door apertures (5-7s); the matte-black body shell wraps down from above and seals onto the frame, doors swing in and close except the last one (7-9s); the hood lifts open on its front hinge exactly as the shell settles (9-10s). End: K6b — body complete, hood open, cabin visible.
Camera: continuous slow crane — high front-over descending to hood height, drifting into front three-quarter. NO CUTS.
Emotion target: hunger. The moment the machine gets a heart and skin.

## V-S4 (10s) — THE COBRA WAKES
IMAGE ANCHOR (first frame): assets/stills/K6b.png (body complete, hood open, lights dark).
Action: the hood lowers in one slow breath and latches (0-3s); both headlights ignite amber-white through dusk dust (3-5s); the block catches with a deep shudder, exhaust haze rolls fat and warm from the twin tailpipes (5-7s); the car flexes once on its suspension as if testing its own weight; camera pulls back through the arc to the rear three-quarter hero as a salt dust plume rises behind the tires — COMPLETE CAR, alive (K8).
Camera: one continuous pull-back + 180-degree arc, constant speed, ending wide on the finished legend in the burning golden hour.
Emotion target: release. Goosebumps. The legend is alive — and the viewer watched every part earn its place.

---
## DELIVERY PIPELINE (after Veo renders land in assets/video/)
1. Trim/normalize to exactly 10s, 24fps, 1920x1080: ffmpeg -i in.mp4 -t 10 -r 24 -vf scale=1920:1080:flags=lanczos out.mp4
2. EXTRACT FRAMES: ffmpeg -i act-N.mp4 -q:v 2 assets/seq-N/f_%04d.jpg  (target: 240 frames at 24fps. Owner note: 420 frames/16.6ms/24fps numbers conflict — real math: 10s x 24fps = 240; at 16.6ms gap it would be 60fps = 600. Shipping 240 native frames keeps 24fps truth; scrub smoothness comes from dense scroll mapping, not fps.)
3. MOBILE/DESKTOP OPT: width cap 1280px, JPEG quality ~= 90, hard cap <=1MB per frame (re-encode single oversized frames at q85).
4. Site engine maps act scroll progress -> f_[start..frameIndex] scrub + crossfades. assets/seq-N/ = THE scrub assets once videos land.
