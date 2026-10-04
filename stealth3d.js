/* ============================================================================
   STEALTH 3D v2 — depth camera-choreography engine (1968 Mustang scroll film)
   ----------------------------------------------------------------------------
   Every reel frame ships with a Depth-Anything-V2 depth map. app.js flies a
   VIRTUAL CAMERA per tick and hands it here:
     rig  vec2  rigid translation of the whole image (uv units)
     par  vec2  differential parallax gain (multiplied by depth-0.5 in shader)
     rot  float camera BANK (rotation, near-weighted in shader)
     zoom float push-in factor (>= 1.06 hides displaced edges)
   Fragment: uv' = R(rot*(d-0.5)) * ((uv-0.5) - rig - par*(d-0.5)*2.2) * zoom + 0.5
   Near pixels move/rotate MORE than sky -> scroll itself flies the camera.

   API: init(canvas) setFrame(rgb, depth) render(cam) isActive failReason
   ========================================================================= */
(function (win) {
  'use strict';

  var gl = null, prog = null, uni = {};
  var texColor = null, texDepth = null;
  var canvasRef = null;
  var glCanvas = null;
  var active = false, failReason = '';
  var lastColor = null, lastDepth = null;

  // keep the GL canvas backing store matching the 2D stage (DPR handled by CSS scale)
  function syncSize() {
    if (!canvasRef || !glCanvas) return;
    glCanvas.width = canvasRef.width || 1280;
    glCanvas.height = canvasRef.height || 720;
  }

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  vUv.y = 1.0 - vUv.y;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform sampler2D uDepth;',
    'uniform vec2 uRig;',
    'uniform vec2 uPar;',
    'uniform float uRot;',
    'uniform float uZoom;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float depth = texture2D(uDepth, uv).r;',
    '  float dw = depth - 0.5;',
    '  float rot = uRot * dw * 1.6;',
    '  float cs = cos(rot);',
    '  float sn = sin(rot);',
    '  vec2 c = uv - 0.5;',
    '  c = mat2(cs, -sn, sn, cs) * c;',
    '  vec2 disp = uRig + uPar * dw * 2.2;',
    '  vec2 uvD = (c - disp) * uZoom + 0.5;',
    '  vec3 col = texture2D(uTex, clamp(uvD, 0.0015, 0.9985)).rgb;',
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
      // The 2D context is already owned by app.js on #stage. WebGL contexts
      // cannot share a canvas with 2D — so we render on our own canvas that
      // sits behind the overlay and REPLECES the stage visually.
      var host = canvas.parentNode || win.document.body;
      var glc = win.document.createElement('canvas');
      glc.id = 'stage-gl';
      glc.style.position = 'absolute';
      glc.style.inset = '0';
      glc.style.width = '100%';
      glc.style.height = '100%';
      glc.style.zIndex = '1';
      // append AFTER #stage so the GL canvas paints over it (same z-index 0)
      host.appendChild(glc);
      // feed sizing from the stage element
      syncSize();
      gl = glc.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      glCanvas = glc;
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

    uni.uTex = gl.getUniformLocation(prog, 'uTex');
    uni.uDepth = gl.getUniformLocation(prog, 'uDepth');
    uni.uRig = gl.getUniformLocation(prog, 'uRig');
    uni.uPar = gl.getUniformLocation(prog, 'uPar');
    uni.uRot = gl.getUniformLocation(prog, 'uRot');
    uni.uZoom = gl.getUniformLocation(prog, 'uZoom');

    texColor = makeTex(gl.TEXTURE0);
    texDepth = makeTex(gl.TEXTURE1);
    gl.uniform1i(uni.uTex, 0);
    gl.uniform1i(uni.uDepth, 1);
    active = true;
    if (win.console && win.console.info) win.console.info('[stealth-3d] v2 depth camera LIVE');
    return true;
  }

  function setFrame(rgbImg, depthImg) {
    if (!active || !rgbImg || !depthImg) return false;
    if (rgbImg === lastColor && depthImg === lastDepth) return true;
    gl.bindTexture(gl.TEXTURE_2D, texColor);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rgbImg);
    gl.bindTexture(gl.TEXTURE_2D, texDepth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, depthImg);
    lastColor = rgbImg;
    lastDepth = depthImg;
    return true;
  }

  function render(cam) {
    if (!active) return false;
    if (!glCanvas || glCanvas.width !== canvasRef.width || glCanvas.height !== canvasRef.height) syncSize();
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.uniform2f(uni.uRig, cam.rigX || 0, cam.rigY || 0);
    gl.uniform2f(uni.uPar, cam.parX || 0, cam.parY || 0);
    gl.uniform1f(uni.uRot, cam.rot || 0);
    gl.uniform1f(uni.uZoom, cam.zoom || 1.08);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  function isActive() { return active; }
  function fail() { return failReason; }

  win.Stealth3D = { init: init, setFrame: setFrame, render: render, isActive: isActive, failReason: fail, version: '2.0' };
})(window);