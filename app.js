/* ============================================================
   STEALTH BUILT — 1968 Ford Mustang Fastback
   app.js — cinematic scroll-assembly engine
   ------------------------------------------------------------
   Stack: vanilla JS + vendored GSAP 3.12.5 / ScrollTrigger / Lenis 1.1.13
   Layer contract (style.css):
     body.no-scroll      -> scroll locked until preload finishes
     #loader.is-loaded   -> curtain fades out
     #loader-fill        -> width % driven here
     #progress-fill      -> width % driven here
     .copy               -> opacity driven per-frame in rAF from this file
   Film contract (PROMPTS-PACKAGE.md §3):
     fixed #stage canvas, cover-fit drawn manually, no letterbox,
     no scroll hijack (Lenis smooths only), DPR capped at 2.
     Missing asset -> black frame + thin amber outline + act logged.
   Frames (assets/stills — forward-state assembly ladder):
     K2 floating parts array · K3 bare chassis · K4 wheels standing ·
     K5b engine seated, doors still off · K6b body on, hood propped open ·
     K6 hood closed + headlight flare (PEAK) · K8 rear running finale.
     States only move forward: no complete car before the final act, and
     adjacent acts share their boundary frames (K2, K3, K4, K6b) so the
     reel flows across section edges. K1, K5, K7 stay on disk, out of the reel.
   Copy contract: all chapter copy sits in a fixed #overlay; each block
     carries data-act + data-win (an act-local in/hold/out envelope) that
     app.js drives per frame, and only .live blocks take pointer events.
   Reduced motion: no scrub/zoom engine, Lenis never inits, copy envelopes
   run from a plain scroll listener, static first frames swap with scroll.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */

  var win = window;
  var doc = document;

  function qs(s)  { return doc.querySelector(s); }
  function qsa(s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t)  { return a + (b - a) * t; }
  function smooth(t)      { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- reduced motion ---------- */

  var reduceMotion = false;
  try {
    var mql = win.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = !!(mql && mql.matches);
    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', function (e) { reduceMotion = e.matches; });
    }
  } catch (err) { /* very old engines: assume motion is fine */ }

  /* ---------- film model ---------- */

  // Scroll spans per act are measured from the live DOM, never guessed from
  // percentages, so the film stays glued to real section heights.
  // Forward-state assembly ladder: parts land in every section, the car
  // never shows complete before the final act, and the shared boundary
  // frames keep the reel flowing across act edges.
  /* ============================================================================
     REEL SOURCES — per act, real frame sequences live in /assets/seq-N/
     (extracted from the vicsee Veo renders at 24fps, 1280w, q90, <=1MB).
     ACT_SEQS maps reelCode -> { dir, first, count } (files f_0001.jpg...).
     STILLS keep the K-code pool as the instant-paint base layer while the
     act's frame sequence streams in; any act whose sequence fails falls
     back to the K-code still for that act range (graceful, never blank).
     ========================================================================= */
  var ACT_SEQS = {
    A1: { dir: 'assets/seq-1', first: 1,   count: 96  }, // parts breathe; floor pan + suspension fuse
    A2: { dir: 'assets/seq-1', first: 97,  count: 96  }, // array lands as the bare chassis (K3 end-state)
    A3: { dir: 'assets/seq-3', first: 1,   count: 96  }, // it stands: 4 wheels fly in (K3->K4 story)
    A4: { dir: 'assets/seq-3', first: 97,  count: 96  }, // cobra + cockpit + body wrap (K4 -> K6b)
    A5: { dir: 'assets/seq-4', first: 1,   count: 192 }  // hood closes, lights ignite, rear hero — COMPLETE
  };
  // Stills ladder retained as the instant base layer + reduced-motion + fallback
  var ACTS = [
    { selector: '#act-hero',           frames: ['K2'] },               // floating parts array — the car is nowhere yet
    { selector: '#act-parts',          frames: ['K2', 'K3'] },         // parts converge and land, bare chassis settles on salt
    { selector: '#act-chassis-wheels', frames: ['K3', 'K4'] },         // four wheels fly in one by one, it stands
    { selector: '#act-engine',         frames: ['K4', 'K5b', 'K6b'] }, // cobra seats, fenders bolt, buckets + dash, hood propped open
    { selector: '#act-reveal',         frames: ['K6b', 'K6', 'K8'] }   // hood lowers and closes, flare ignites — complete car finale
  ];

  // Ken-Burns pass per frame. s = scale multiplier over cover-fit,
  // x/y = center offset as a fraction of the draw rect (push/pull drift).
  var KB = {
    K2:  { s: [1.14, 1.03], x: [-0.050,  0.030 ], y: [ 0.030, -0.020 ] }, // pull back across the floating parts array
    K3:  { s: [1.10, 1.20], x: [-0.040,  0.040 ], y: [ 0.050,  0.000 ] }, // rack along the bare chassis
    K4:  { s: [1.05, 1.13], x: [ 0.050, -0.030 ], y: [-0.010,  0.020 ] }, // drift as the wheels fly in and it stands
    K5b: { s: [1.10, 1.18], x: [ 0.030, -0.020 ], y: [-0.040,  0.010 ] }, // engine + transmission seat, buckets + dash go in
    K6b: { s: [1.06, 1.14], x: [-0.030,  0.020 ], y: [ 0.020, -0.010 ] }, // body wraps, hood propped open
    K6:  { s: [1.04, 1.17], x: [-0.020,  0.020 ], y: [ 0.040, -0.010 ] }, // flare ignition push, the peak
    K8:  { s: [1.05, 1.16], x: [-0.040,  0.020 ], y: [ 0.020, -0.020 ] }  // rear running hero, complete car finale
  };

  var STATIC_KB = { s: [1, 1], x: [0, 0], y: [0, 0] };

  // Dissolve windows in local act progress, keyed by the OUTGOING frame
  // code. Segments are equal (one per frame), but a window may run past its
  // segment's edge: the outgoing frame keeps painting over the incoming
  // until its window closes. Hand-tuned windows stay for the cuts that run.
  var CROSSFADE = {
    K3: [0.52, 0.64] // bare chassis racks to its wheels in chapter 03
  };

  function crossfadeWindow(codes, t) {
    if (CROSSFADE[codes[t]]) return CROSSFADE[codes[t]];
    var boundary = (t + 1) / codes.length;
    return [boundary + 0.01, boundary + 0.10];
  }

  var STILLS = ['K2', 'K3', 'K4', 'K5b', 'K6b', 'K6', 'K8']; // reel codes — K1/K5/K7 stay on disk, out of the cut
  function stillPath(code) { return 'assets/stills/' + code + '.png'; }

  /* ---------- frame-sequence pool (real Veo frames) ---------- */

  function padFramesSeq(n) {
    var s = String(n);
    while (s.length < 4) s = '0' + s;
    return s;
  }
  function seqPath(seqKey, idx) {
    var seq = ACT_SEQS[seqKey];
    return seq.dir + '/f_' + padFramesSeq(seq.first + idx) + '.jpg';
  }
  var seqImages = {};                // seqKey -> [img|null, ...] (null until its preload lands)
  var seqOk = {};                     // act index (1-based) -> true once its reel loads
  function seqFrameImg(actIdx, local) {
    var key = 'A' + actIdx;
    var seq = ACT_SEQS[key];
    if (!seq) return null;
    var arr = seqImages[key];
    if (!arr || !arr.length) return null;
    var i = clamp(Math.round(local * (seq.count - 1)), 0, seq.count - 1);
    return arr[i] || null;
  }

  /* ---------- runtime state ---------- */

  var canvas, ctx, dpr = 1, rectW = 0, rectH = 0;
  var loaderEl, loaderFill, progressFill;
  var copyBlocks = [];               // [{ el, actIdx, w: {inS,inE,outS,outE}, isLive }]
  var TAIL_HOLD = 0.98;              // last act's parked local at hard-scroll end (finale holds, CTA live)
  var actEls = [];
  var spans = [];                    // per act: [top, bottom) in page px
  var docMax = 1;
  var targetProgress = 0;            // written by ScrollTrigger / scroll events
  var curProgress = 0;               // eased each tick, drives the film
  var renderedKey = null;            // skip canvas work when nothing changed
  var stills = {};                   // code -> { img, ok, w, h }
  var gateDone = false;              // preload finished (late flips repaint after this)
  var engineRunning = false;
  var lastCopyWrite = new WeakMap(); // one WeakMap entry per copy block

  /* ---------- preload gate ---------- */

  function setLoaderFill(pct) {
    if (loaderFill) loaderFill.style.width = clamp(pct, 0, 100).toFixed(1) + '%';
  }

  function preloadStills(onStep) {
    var jobs = STILLS.map(function (code) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.decoding = 'async';

        function settle(ok) {
          if (stills[code]) return resolve(); // already settled
          stills[code] = { img: img, ok: !!ok, w: img.naturalWidth, h: img.naturalHeight };
          onStep(code, !!ok);
          resolve();
        }

        var failSafe = setTimeout(function () {
          settle(img.complete && img.naturalWidth > 0); // a hung request never deadlocks the gate
        }, 20000);

        img.onload = function () {
          var st = stills[code];
          if (st) { // settled early by the failsafe; late success upgrades it
            if (!st.ok) { st.ok = true; st.w = img.naturalWidth; st.h = img.naturalHeight; }
            if (gateDone) paintOnce();
            return;
          }
          cleTimeoutSafe(failSafe);
          settle(true);
        };
        img.onerror = function () {
          if (!stills[code]) { cleTimeoutSafe(failSafe); settle(false); }
        };

        img.src = stillPath(code);
      });
    });

    return Promise.all(jobs);
  }

  function cleTimeoutSafe(handle) { clearTimeout(handle); }

  /* ---------- frame-sequence preload (background, after the still gate) ---------- */

  function preloadSeq(actKey, seq) {
    var arr = new Array(seq.count);
    for (var i = 0; i < seq.count; i++) arr[i] = null;
    seqImages[actKey] = arr;
    var loaded = 0;
    return new Promise(function (resolve) {
      for (var i = 0; i < seq.count; i++) {
        (function (idx) {
          var img = new Image();
          img.decoding = 'async';
          var done = false;
          function finish(imgRef) {
            if (done) return;
            done = true;
            arr[idx] = imgRef || null;
            loaded++;
            if (loaded >= seq.count) resolve();
          }
          var failsafe = setTimeout(function () { finish(img.complete && img.naturalWidth ? img : null); }, 25000);
          img.onload = function () { clearTimeout(failsafe); finish(img); };
          img.onerror = function () { clearTimeout(failsafe); finish(null); };
          img.src = seqPath(actKey, idx);
        })(i);
      }
    });
  }

  function startSeqPreload() {
    var keys = Object.keys(ACT_SEQS);
    Promise.all(keys.map(function (k) { return preloadSeq(k, ACT_SEQS[k]); })).then(function () {
      // any act whose reel failed stays on its still ladder (paintFilm already falls back)
      if (gateDone) paintOnce();
      if (win.ScrollTrigger) win.ScrollTrigger.refresh();
    });
  }

  function unlockSite() {
    // contract order: fill to 100 -> fade the curtain -> release scroll
    setLoaderFill(100);

    win.requestAnimationFrame(function () {
      win.requestAnimationFrame(function () {
        doc.body.classList.remove('no-scroll');
        if (loaderEl) loaderEl.classList.add('is-loaded');

        startSeqPreload(); // real Veo reels stream in behind the still cut
        if (!reduceMotion) initSmoothScroll();
        measure();
        paintOnce(); // first true frame behind the fading curtain
        if (!reduceMotion && win.ScrollTrigger) win.ScrollTrigger.refresh();
      });
    });
  }

  function runPreloadGate() {
    var gateStart = nowMs();

    preloadStills(function (code, ok) {
      var frac = 0;
      var done = 0;
      var i;
      for (i = 0; i < STILLS.length; i++) { var st = stills[STILLS[i]]; if (st) done++; }
      frac = done / STILLS.length;
      setLoaderFill(frac * 100);
      if (!ok) {
        console.warn('[stealth-frame] ' + code + ' failed to load — blank frame + amber outline will show (act ' + actIndexForCode(code) + ')');
      }
    }).then(function () {
      gateDone = true;
      // short cinematic beat before the curtain lifts, floor 900 ms
      return new Promise(function (r) { setTimeout(r, Math.max(0, 900 - (nowMs() - gateStart))); });
    }).then(unlockSite);
  }

  function nowMs() { return (win.performance && win.performance.now) ? win.performance.now() : Date.now(); }

  /* ---------- measurement ---------- */

  function measure() {
    docMax = Math.max(1, doc.documentElement.scrollHeight - win.innerHeight);

    spans = ACTS.map(function (act) {
      var el = qs(act.selector);
      if (!el) return [0, docMax];
      var top = el.getBoundingClientRect().top + (win.pageYOffset || 0);
      return [top, top + el.offsetHeight];
    });
    // the reel completes exactly at the scroll rail: the last act's span
    // stretches ~2% past hard-scroll end so a reader parked at the bottom
    // measures act-local ≈ TAIL_HOLD — inside the finale envelope's hold —
    // and the K8 copy + CTA stay live instead of fading under them
    if (spans.length) {
      var lastSpan = spans[spans.length - 1];
      if (docMax > lastSpan[0]) {
        lastSpan[1] = lastSpan[0] + (docMax - lastSpan[0]) / TAIL_HOLD;
      }
    }

    copyBlocks.forEach(function (c) { lastCopyWrite.set(c, -1); }); // force style rewrite after relayout
  }

  /* ---------- canvas: cover-fit film renderer ---------- */

  function sizeCanvas() {
    if (!canvas) return;
    dpr = clamp(win.devicePixelRatio || 1, 1, 2); // DPR cap per spec
    rectW = win.innerWidth;
    rectH = win.innerHeight;
    canvas.width  = Math.max(1, Math.round(rectW * dpr));
    canvas.height = Math.max(1, Math.round(rectH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderedKey = null;
  }

  function drawCover(img, ok, code, kb, q, alpha) {
    if (alpha <= 0.004 || rectW <= 0) return;

    if (!ok || !img || !img.naturalWidth) { drawPlaceholder(code, alpha); return; }

    var kbS = lerp(kb.s[0], kb.s[1], q);
    var kbX = lerp(kb.x[0], kb.x[1], q);
    var kbY = lerp(kb.y[0], kb.y[1], q);

    // manual object-fit: cover, then the frame's zoom, then a guard factor
    // so this frame's pan can never reveal an edge of the still
    var cover = Math.max(rectW / img.naturalWidth, rectH / img.naturalHeight);
    var scale = cover * kbS * (1 + 2 * Math.max(Math.abs(kbX), Math.abs(kbY)));

    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    var cx = rectW / 2 + kbX * rectW;
    var cy = rectH / 2 + kbY * rectH;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }

  // raw frame draw: video frames already match 16:9 — cover-fit them
  function drawRaw(img, alpha) {
    if (!img || !img.naturalWidth || alpha <= 0.004 || rectW <= 0) return;
    var cover = Math.max(rectW / img.naturalWidth, rectH / img.naturalHeight);
    var dw = img.naturalWidth * cover;
    var dh = img.naturalHeight * cover;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(img, (rectW - dw) / 2, (rectH - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawPlaceholder(code, alpha) {
    var inset = Math.round(Math.min(rectW, rectH) * 0.04) + 12;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, rectW, rectH);
    ctx.strokeStyle = 'rgba(227, 164, 59, 0.75)'; // thin amber outline frame
    ctx.lineWidth = 1;
    ctx.strokeRect(inset + 0.5, inset + 0.5, rectW - inset * 2 - 1, rectH - inset * 2 - 1);
    ctx.fillStyle = 'rgba(227, 164, 59, 0.9)';
    ctx.font = '600 12px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(code + ' OFFLINE (act ' + actIndexForCode(code) + ')', inset + 18, rectH - inset - 18);
    ctx.restore();
  }

  function actIndexForCode(code) {
    for (var i = 0; i < ACTS.length; i++) {
      if (ACTS[i].frames.indexOf(code) !== -1) return i + 1;
    }
    return 0;
  }

  /* ---------- film logic: page scroll span -> act -> frames ---------- */

  function actAt(p) {
    var y = p * docMax;
    var i;
    for (i = 0; i < spans.length; i++) {
      if (y >= spans[i][0] && y < spans[i][1]) return i;
    }
    return y <= 0 ? 0 : Math.max(0, spans.length - 1);
  }

  function frameInfo(code) {
    var st = stills[code];
    return { code: code, img: st ? st.img : null, ok: !!(st && st.ok), kb: KB[code] || STATIC_KB };
  }

  function paintFilm() {
    var actIdx = actAt(curProgress);          // 0-based
    var span = spans[actIdx] || [0, 1];
    var local = clamp((curProgress * docMax - span[0]) / Math.max(1, span[1] - span[0]), 0, 1);
    var codes = ACTS[actIdx].frames;
    var n = codes.length;

    // REAL REEL: if this act's frame sequence is ready, it owns the canvas —
    // scroll maps directly onto 24fps frames (video truth beats any still cut).
    var fimg = seqFrameImg(actIdx + 1, local);
    if (fimg) {
      drawRaw(fimg, 1);
      return;
    }

    if (n === 1) {
      var f = frameInfo(codes[0]);
      drawCover(f.img, f.ok, f.code, f.kb, local, 1);
      return;
    }

    // n-frame act, generalized from the two-frame cut: segments are equal
    // (one per frame) and handover windows may run past the segment edge,
    // so the outgoing frame keeps painting over the incoming chain until
    // its window closes (drawn last = on top). The deepest still-holding
    // frame is found by its window, not by segment index alone.
    var i, fi;
    var s = n - 1;
    for (i = 0; i < n - 1; i++) {
      if (local < crossfadeWindow(codes, i)[1]) { s = i; break; }
    }

    for (i = s + 1; i < n; i++) {
      fi = frameInfo(codes[i]);
      drawCover(fi.img, fi.ok, fi.code, fi.kb, local, 1); // incoming chain sits underneath
    }

    var outAlpha = 1;
    if (s < n - 1) {
      var w = crossfadeWindow(codes, s);
      outAlpha = local <= w[0] ? 1 : local >= w[1] ? 0 : 1 - smooth((local - w[0]) / (w[1] - w[0]));
    }
    fi = frameInfo(codes[s]);
    drawCover(fi.img, fi.ok, fi.code, fi.kb, local, outAlpha); // outgoing dissolves over the chain
  }

  /* ---------- copy blocks + progress rail (per-frame DOM writes) ---------- */

  function updateCopy(p, withTransform) {
    var i, c, local, inP, outP, a, ty;
    var prev;

    for (i = 0; i < copyBlocks.length; i++) {
      c = copyBlocks[i];

      // act-local progress against the MEASURED act span — never an in-flow
      // rect, so nothing drifts when fonts/layout settle late
      var span = spans[c.actIdx];
      if (span) {
        local = clamp((p * docMax - span[0]) / Math.max(1, span[1] - span[0]), 0, 1);
      } else {
        local = 0;
      }

      inP  = clamp((local - c.w.inS)   / Math.max(0.0001, c.w.inE  - c.w.inS),  0, 1); // smooth-in
      outP = clamp((local - c.w.outS)  / Math.max(0.0001, c.w.outE - c.w.outS), 0, 1); // smooth-out
      a  = Math.min(smooth(inP), 1 - smooth(outP));
      ty = (1 - smooth(inP)) * 24; // translateY 24px scrub per build spec

      // visibility gate: only blocks over 0.5 take pointer events (CSS .live)
      if (c.isLive !== (a > 0.5)) {
        c.isLive = a > 0.5;
        c.el.classList.toggle('live', c.isLive);
      }

      prev = lastCopyWrite.get(c);
      prev = prev === undefined ? -1 : prev;
      if (prev === -1 || Math.abs(a - prev) > 0.002 || (a === 0 && prev !== 0)) {
        c.el.style.opacity = a.toFixed(3);
        if (withTransform) c.el.style.transform = 'translateY(' + ty.toFixed(1) + 'px)';
        lastCopyWrite.set(c, a);
      }
    }
  }

  function updateRail(p) {
    if (!progressFill) return;
    var pct = (clamp(p, 0, 1) * 100).toFixed(2) + '%';
    if (progressFill.style.width !== pct) progressFill.style.width = pct;
  }

  /* ---------- master render (rAF via gsap.ticker) ---------- */

  function render() {
    if (!engineRunning || !ctx) return;

    // Lenis already smooths the scroll; this ease on top keeps the film
    // cinematic even on raw wheel steps and keyboard jumps.
    var dt = 1 / 60;
    if (win.gsap && win.gsap.ticker && win.gsap.ticker.deltaRatio) {
      dt = clamp((win.gsap.ticker.deltaRatio(60) / 60) || dt, 0.001, 0.05);
    }
    curProgress += (targetProgress - curProgress) * clamp(dt * 9, 0, 1);
    if (Math.abs(targetProgress - curProgress) < 0.00008) curProgress = targetProgress;

    var key = [curProgress.toFixed(6), rectW, rectH].join('|');
    if (key !== renderedKey) {
      renderedKey = key;
      paintFilm();
    }

    updateCopy(curProgress, true);
    updateRail(curProgress);
  }

  // One synchronous frame (post-load seam filler, resize re-paint).
  function paintOnce() {
    renderedKey = null;
    if (reduceMotion) paintStaticFrame();
    else render();
  }

  /* ---------- reduced-motion fallback (no engine, plain scroll) ---------- */

  function paintStaticFrame() {
    if (!ctx) return;
    var y = win.pageYOffset || doc.documentElement.scrollTop || 0;
    var idx = 0;
    var i;
    for (i = 0; i < spans.length; i++) {
      if (y >= spans[i][0] - 1) idx = i; else break;
    }
    var f = frameInfo(ACTS[Math.min(idx, ACTS.length - 1)].frames[0]);
    drawCover(f.img, f.ok, f.code, STATIC_KB, 0, 1);
    updateRail(docMax ? y / docMax : 0);
    updateCopy(clamp(y / Math.max(1, docMax), 0, 1), false); // same envelopes from plain scroll, opacity only
  }

  function initReducedMotion() {
    win.addEventListener('scroll', function () {
      win.requestAnimationFrame(paintStaticFrame);
    }, { passive: true });

    win.addEventListener('load', function () {
      measure();
      paintStaticFrame();
    });
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
      doc.fonts.ready.then(function () { measure(); paintStaticFrame(); }, function () {});
    }
  }

  /* ---------- smooth scroll (Lenis) + ScrollTrigger wiring ---------- */

  function initSmoothScroll() {
    if (typeof win.Lenis !== 'function' || typeof win.gsap !== 'function') return; // native scroll fallback

    win.gsap.registerPlugin(win.ScrollTrigger || function () {});

    var lenis = new win.Lenis({
      duration: 1.1,       // build spec: 1.1
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4
    });

    // canonical Lenis <-> GSAP handshake: Lenis drives, the ticker breathes
    lenis.on('scroll', function () {
      if (win.ScrollTrigger && win.ScrollTrigger.update) win.ScrollTrigger.update();
    });
    win.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    win.gsap.ticker.lagSmoothing(0);
  }

  function trackScrollTarget() {
    targetProgress = clamp((win.pageYOffset || 0) / Math.max(1, docMax), 0, 1);
  }

  function initScrollEngine() {
    if (typeof win.gsap === 'function' && win.ScrollTrigger) {
      win.gsap.registerPlugin(win.ScrollTrigger);

      // ONE master scrubbed trigger across the whole reel; its progress IS
      // the film timeline, everything else (frames, crossfades, copy, rail)
      // derives from it each tick.
      win.ScrollTrigger.create({
        trigger: doc.documentElement,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: function (self) { targetProgress = clamp(self.progress, 0, 1); },
        onRefresh: function (self) {
          targetProgress = clamp(self.progress, 0, 1);
          measure();
        }
      });
      // keep act spans in sync whenever ST re-measures (fonts, images, resize)
      win.ScrollTrigger.addEventListener('refresh', measure);
      return;
    }

    // no ScrollTrigger: derive the target straight from native scroll
    win.addEventListener('scroll', trackScrollTarget, { passive: true });
    win.addEventListener('load', function () { measure(); trackScrollTarget(); });
    trackScrollTarget();
  }

  // gsap vendored but blocked/absent: pump the engine with own rAF
  function nativeRafLoop() {
    var tick = function () {
      trackScrollTarget();
      render();
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  }

  /* ---------- resize ---------- */

  function onResize() {
    sizeCanvas();
    measure();
    paintOnce();
  }

  /* ---------- boot ---------- */

  function grabDom() {
    canvas = qs('#stage');
    loaderEl = qs('#loader');
    loaderFill = qs('#loader-fill');
    progressFill = qs('#progress-fill');

    if (canvas && typeof canvas.getContext === 'function') {
      ctx = canvas.getContext('2d', { alpha: false });
    }

    copyBlocks = qsa('[data-sc-copy]').map(function (el) {
      var actAttr = parseInt(el.getAttribute('data-act'), 10);
      var nums = (el.getAttribute('data-win') || '').split(',').map(function (v) {
        return parseFloat(v);
      });
      if (!(actAttr >= 1 && actAttr <= ACTS.length)) {
        console.warn('[stealth-copy] bad data-act on copy block — defaulting to act 1');
        actAttr = 1;
      }
      if (nums.length !== 4 || nums.some(function (v) { return !isFinite(v); })) {
        console.warn('[stealth-copy] bad data-win on copy block — full-act fallback');
        nums = [0, 0.05, 0.95, 1];
      }
      return {
        el: el,
        actIdx: actAttr - 1,
        w: { inS: nums[0], inE: nums[1], outS: nums[2], outE: nums[3] },
        isLive: false
      };
    });
    actEls = ACTS.map(function (a) {
      var el = qs(a.selector);
      if (!el) console.warn('[stealth-frame] missing act section ' + a.selector);
      return el;
    });

    return !!(canvas && ctx && loaderEl && loaderFill && progressFill && copyBlocks.length === 7 && actEls.indexOf(null) === -1);
  }

  function domContractFallback() {
    // never trap the visitor behind a broken contract
    doc.body.classList.remove('no-scroll');
    if (loaderEl) loaderEl.classList.add('is-loaded');
    qsa('[data-sc-copy]').forEach(function (el) { el.style.opacity = '1'; el.classList.add('live'); });
    console.warn('[stealth-frame] DOM contract incomplete — engine aborted, static copy released');
  }

  function boot() {
    if (!grabDom()) { domContractFallback(); return; }

    sizeCanvas();

    if (reduceMotion) {
      runPreloadGate(); // still load stills; they paint statically
      initReducedMotion();
      win.addEventListener('resize', onResize, { passive: true });
      win.addEventListener('orientationchange', onResize, { passive: true });
      return;
    }

    measure();
    engineRunning = true;

    if (typeof win.gsap === 'function') {
      win.gsap.ticker.add(render);
      initSmoothScroll();
      initScrollEngine();
    } else {
      nativeRafLoop(); // vendored gsap failed: still scrub, still animate
    }

    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
      doc.fonts.ready.then(function () { measure(); }, function () {});
    }

    runPreloadGate();

    win.addEventListener('resize', onResize, { passive: true });
    win.addEventListener('orientationchange', onResize, { passive: true });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();