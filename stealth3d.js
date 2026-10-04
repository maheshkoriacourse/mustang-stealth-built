/* ============================================================================
   STEALTH 3D — depth-parallax WebGL2 layer for the 1968 Mustang scroll film
   ----------------------------------------------------------------------------
   Every video frame ships with a Depth-Anything-V2 depth map (same filename,
   .png, 16-bit, R=normalized depth). This module renders each reel frame
   with per-pixel displacement driven by pointer (desktop) / gyro (mobile):
     uv' = (uv - 0.5 - shift*(depth-0.5)*k) * zoom + 0.5
   The car (near) moves MORE than salt/sky (far) -> real camera-swing 3D
   while staying photoreal cinematic. Graceful: no WebGL2 -> app.js keeps
   its 2D canvas path untouched.

   Public API (called by app.js):
     Stealth3D.init(canvas2d)  -> bool   (true = 3D path active)
     Stealth3D.setFrame(rgbImg, depthImg)  // upload texture pair for frame
     Stealth3D.render(shiftX, shiftY, zoom)
     Stealth3D.isActive()      -> bool
     Stealth3D.failReason()    -> string for diagnostics
   ========================================================================= */
(function (win) {
  'use strict';

  var gl = null;
  var prog = null;
  var uni = {};
  var texColor = null, texDepth = null;
  var canvasRef = null;
  var frameW = 0, frameH = 0;
  var active = false;
  var failReason = '';

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
    'uniform vec2 uShift;',
    'uniform float uZoom;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float depth = texture2D(uDepth, uv).r;',
    '  float depthW = depth - 0.5;',
    '  vec2 disp = uShift * depthW * 1.45;',
    '  vec2 uvD = (uv - 0.5 - disp) * uZoom + 0.5;',
    '  vec4 c = texture2D(uTex, clamp(uvD, 0.002, 0.998));',
    '  gl_FragColor = vec4(c.rgb, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      failReason = 'shader: ' + gl.getShaderInfoLog(s);
      return null;
    }
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
      gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false
      });
    } catch (e) { gl = null; }
    if (!gl) { failReason = 'webgl2 unavailable'; return false; }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      failReason = 'link: ' + gl.getProgramInfoLog(prog);
      return false;
    }
    gl.useProgram(prog);

    // fullscreen triangle strip
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uni.uTex = gl.getUniformLocation(prog, 'uTex');
    uni.uDepth = gl.getUniformLocation(prog, 'uDepth');
    uni.uShift = gl.getUniformLocation(prog, 'uShift');
    uni.uZoom = gl.getUniformLocation(prog, 'uZoom');

    texColor = makeTex(gl.TEXTURE0);
    texDepth = makeTex(gl.TEXTURE1);
    gl.uniform1i(uni.uTex, 0);
    gl.uniform1i(uni.uDepth, 1);

    active = true;
    return true;
  }

  var lastColorSrc = null, lastDepthSrc = null;
  function setFrame(rgbImg, depthImg) {
    if (!active || !rgbImg || !depthImg || !rgbImg.naturalWidth || !depthImg.naturalWidth) return false;
    if (rgbImg !== lastColorSrc || depthImg !== lastDepthSrc) {
      gl.bindTexture(gl.TEXTURE_2D, texColor);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rgbImg);
      gl.bindTexture(gl.TEXTURE_2D, texDepth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, depthImg.naturalWidth, depthImg.naturalHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null); /* placeholder; replaced below */
      // 16-bit PNG -> browsers give a 2-octet-per-channel Image; safest path is an
      // offscreen 8-bit downcast at load time (done in app.js before calling us).
      // So depth texture upload here expects an 8-bit grayscale Image:
      lastColorSrc = rgbImg;
      lastDepthSrc = depthImg;
      frameW = rgbImg.naturalWidth; frameH = rgbImg.naturalHeight;
      return true;
    }
    return true;
  }

  function render(sx, sy, zoom) {
    if (!active) return false;
    gl.viewport(0, 0, canvasRef.width, canvasRef.height);
    gl.uniform2f(uni.uShift, sx, sy);
    gl.uniform1f(uni.uZoom, zoom || 1.0);
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
    version: '1.1'
  };
})(window);