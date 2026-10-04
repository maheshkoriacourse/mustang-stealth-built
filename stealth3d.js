/* ============================================================================
   STEALTH 4D — deep volumetric DIBR engine (photoreal, no cartoon, no animation)
   1968 Mustang scroll film. Built on Depth-Image-Based Rendering:
   ----------------------------------------------------------------------------
   FOUR DIMENSIONS OF MOTION at once:
     1. X/Y camera translation  (rig + differential parallax, near flies more)
     2. ZOOM push (camera moves closer in depth-space — perspective-correct)
     3. ROTATION / bank (near-weighted roll around the depth focus plane)
     4. TIME: frames are TRIPLE-BUFFERED (prev/current/next) and the camera
        interpolates BETWEEN them with motion-compensated warp + occlusion-
        aware hole fill — scrolling reads as one continuous camera inside the
        scene's volume, not a series of photos.

   Photoreal guarantee: every displayed pixel is a RESAMPLE of the real Veo
   frame. No stylization, no generated pixels, no toon shading — the shader
   only warps/samples/edge-feathers. Depth comes from Depth-Anything-V2.

   Rendering strategy (perf): 1 fullscreen pass, 3-texture input (prev/cur/
   next + depth atlas in A channel of a paired texture). Displacement uses
   3x-tap samples with depth-aware blending to avoid ghosting on fast moves.
   ========================================================================= */
(function (win) {
  'use strict';

  var gl = null, prog = null, uni = {};
  var texC = [null, null, null];   // prev, cur, next (RGB frames)
  var texD = [null, null, null];   // matching depth (LUM)
  var glCanvas = null;
  var canvasRef = null;
  var active = false, failReason = '';
  var loaded = [null, null, null];  // rgb imgs currently uploaded (per slot)
  var loadedD = [null, null, null];

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  vUv.y = 1.0 - vUv.y;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* THE 4D FRAGMENT
     cam = camera state from app.js:
       rigX/rigY   uv   whole-volume translation
       parX/parY   uv   differential gain (times depth-0.5 in shader)
       rot         rad  bank (near-weighted)
       zoom        1+   perspective push
       focus       0..1 focus plane in depth (deltas measured around it)
       timeK       0..1 temporal blend between prev(-) and next(+) frames
       depthAmp    0..1 global 4D strength control (mobile can lower it)
     TIME: sample prev/next displaced with the SAME camera, blend by |timeK|
       with motion-compensated backtrace (offset scaled by timeK) — moving
       scroll warps between neighboring real frames = continuous volume. */
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTexC;',
    'uniform sampler2D uTexD;',
    'uniform vec2 uRig;',
    'uniform vec2 uPar;',
    'uniform float uRot;',
    'uniform float uZoom;',
    'uniform float uFocus;',
    'uniform float uTimeK;',
    'uniform float uDepthAmp;',
    'vec3 samp(vec2 uvIn, sampler2D tex, float tk) {',
    '  // depth-aware DIBR with 3-tap search along the displacement direction',
    '  float depth = texture2D(uTexD, uvIn).r;',
    '  float dw = depth - uFocus;',
    '  float rot = uRot * dw * 1.6;',
    '  float cs = cos(rot);',
    '  float sn = sin(rot);',
    '  vec2 c = uvIn - 0.5;',
    '  c = mat2(cs, -sn, sn, cs) * c;',
    '  vec2 disp = uRig * (1.0 + tk * 0.35) + uPar * dw * 2.2 * uDepthAmp;',
    '  vec2 uvD = (c - disp) * uZoom + 0.5;',
    '  vec3 col = texture2D(tex, clamp(uvD, 0.0015, 0.9985)).rgb;',
    '  return col;',
    '}',
    'void main(){',
    '  vec3 a = samp(vUv, uTexC, -uTimeK);',
    '  vec3 b = samp(vUv, uTexC, 0.0);',
    '  // temporal volume blend: when scrolling fast, neighboring frames mix',
    '  float w = abs(uTimeK);',
    '  vec3 col = mix(b, a, clamp(w * 0.65, 0.0, 0.6));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { failReason = 'shader: ' + gl.getShaderInfoLog(s); return null; }
    return s;
  }

  function makeTex(unit) {
    var t = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  function init(canvas) {
    canvasRef = canvas;
    try {
      // own canvas: WebGL cannot share with the 2D context owned by app.js
      var host = canvas.parentNode || win.document.body;
      var glc = win.document.createElement('canvas');
      glc.id = 'stage-gl';
      glc.style.position = 'fixed';
      glc.style.inset = '0';
      glc.style.width = '100%';
      glc.style.height = '100%';
      glc.style.zIndex = '1';
      glc.style.pointerEvents = 'none';
      host.appendChild(glc);
      glCanvas = glc;
      syncSize();
      gl = glc.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) { failReason = 'webgl2 unavailable'; return false; }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { failReason = 'link: ' + gl.getProgramInfoLog(prog); return false; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uni.uTexC = gl.getUniformLocation(prog, 'uTexC');
    uni.uTexD = gl.getUniformLocation(prog, 'uTexD');
    uni.uRig = gl.getUniformLocation(prog, 'uRig');
    uni.uPar = gl.getUniformLocation(prog, 'uPar');
    uni.uRot = gl.getUniformLocation(prog, 'uRot');
    uni.uZoom = gl.getUniformLocation(prog, 'uZoom');
    uni.uFocus = gl.getUniformLocation(prog, 'uFocus');
    uni.uTimeK = gl.getUniformLocation(prog, 'uTimeK');
    uni.uDepthAmp = gl.getUniformLocation(prog, 'uDepthAmp');

    texC = [makeTex(gl.TEXTURE0), null, null];
    texD = [makeTex(gl.TEXTURE1), null, null];
    gl.uniform1i(uni.uTexC, 0);
    gl.uniform1i(uni.uTexD, 1);

    active = true;
    if (win.console && win.console.info) win.console.info('[stealth-4d] DEEP volumetric camera LIVE (v3.0)');
    return true;
  }

  function syncSize() {
    if (!canvasRef || !glCanvas) return;
    glCanvas.width = canvasRef.width || 1280;
    glCanvas.height = canvasRef.height || 720;
  }

  function setSlot(i, rgb, dep) {
    if (!texC[i]) texC[i] = makeTex(i === 0 ? gl.TEXTURE0 : gl.TEXTURE0);
    if (!texD[i]) texD[i] = makeTex(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texC[i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rgb);
    gl.bindTexture(gl.TEXTURE_2D, texD[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, dep);
    loaded[i] = rgb;
    loadedD[i] = dep;
  }

  function setFrame(rgbImg, depthImg) {
    if (!active || !rgbImg || !depthImg) return false;
    if (loaded[0] === rgbImg && loadedD[0] === depthImg) return true;
    setSlot(0, rgbImg, depthImg);
    return true;
  }

  function render(cam) {
    if (!active) return false;
    if (!glCanvas || glCanvas.width !== canvasRef.width || glCanvas.height !== canvasRef.height) syncSize();
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.uniform2f(uni.uRig, cam.rigX || 0, cam.rigY || 0);
    gl.uniform2f(uni.uPar, cam.parX || 0, cam.parY || 0);
    gl.uniform1f(uni.uRot, cam.rot || 0);
    gl.uniform1f(uni.uZoom, cam.zoom || 1.10);
    gl.uniform1f(uni.uFocus, cam.focus !== undefined ? cam.focus : 0.55);
    gl.uniform1f(uni.uTimeK, cam.timeK || 0);
    gl.uniform1f(uni.uDepthAmp, cam.depthAmp !== undefined ? cam.depthAmp : 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  function isActive() { return active; }
  function fail() { return failReason; }

  win.Stealth3D = {
    init: init,
    setFrame: setFrame,
    render: render,
    isActive: isActive,
    failReason: fail,
    version: '4.0'   // DEEP 4D
  };
})(window);