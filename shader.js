(() => {
  const canvas = document.getElementById('shaderCanvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false })
          || canvas.getContext('experimental-webgl');

  if (!gl) {
    canvas.style.background = 'radial-gradient(ellipse at top, #1a1a2a, #000 60%)';
    return;
  }

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  // User shader from https://www.shadertoy.com/view/flt3z7
  // iTime is modulated by smoothed scroll velocity, iMouse.y is driven by scroll progress.
  const FRAG = `
    precision highp float;

    uniform vec3  iResolution;
    uniform float iTime;
    uniform vec4  iMouse;
    uniform vec2  uLook;   // visitor input (mouse or phone tilt), roughly -1..1

    //Transforms
    float RotX = 1.5;
    float RotY = 1.5;
    float RotZ = 1.5;
    float TransX = 1.;
    float TransY = 1.5;
    float TransZ = 0.5;
    float Scale = 0.;
    float Range = 0.001;
    float RX = 0.;
    float RY = 0.;
    float RZ = 0.;
    float TX = 0.;
    float TY = 1.;
    float TZ = 0.;
    float TwistY = 0.;
    int MirrorX = 1;
    int MirrorY = 1;
    int MirrorZ = 1;
    //Rectangle
    int Rectangle = 1;
    float RecScale = 1.;
    //Sphere
    int Sphere = 0;
    float SphereScale = 1.;
    float SphereTX = 0.;
    float SphereTY = 0.;
    float SphereTZ = 0.;
    //Shapes
    int InfPre = 1;
    int InfPost = 0;
    int Merge = 0;
    float ShapeMix = 0.;
    float FractalScale = 0.1;
    float NearClip = 5.;
    //Color
    int Iterations = 1;
    float IHue = 0.;
    float Proximity = 0.;
    float PHue = 0.;
    float Distance = 0.;
    float DHue = 0.;
    float light = 0.;
    float DepthHue = 0.1;
    float ProxHue = 0.;
    //Time
    float TimeRotX = 1.;
    float TimeRotY = 0.25;
    float TimeTransX = 0.1;
    float TimeTransY = 0.05;
    int TimeEnable = 1;
    int TimeDisabled = 0;

    #define MAX_STEPS 50
    #define MAX_DIST 25.
    #define SURF_DIST .001
    #define FRACT_STEPS 20
    #define PI 3.14159

    float map(float x, float inMin, float inMax, float outMin, float outMax) {
        return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    vec3 hs(vec3 c, float s){
        vec3 m = vec3(cos(s), s = sin(s) * .5774, -s);
        return c * mat3(m += (1. - m.x) / 3., m.zxy, m.yzx);
    }

    mat2 rotate(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, -s, s, c);
    }

    float opSmoothUnion(float d1, float d2, float k) {
        float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
        return mix(d2, d1, h) - k * h * (1.0 - h);
    }

    vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float GetDist(vec3 p) {
        float d = 1.;

        for (int i = 0; i < FRACT_STEPS; i++) {
            if (InfPre == 1) p = mod(p + 2.5, 5.) - 2.5;

            if (MirrorX == 1) p.x = abs(p.x);
            if (MirrorY == 1) p.y = abs(p.y);
            if (MirrorZ == 1) p.z = abs(p.z);

            p.x -= TransX
                + iMouse.x * Range
                + TimeTransX * sin(iTime * 0.2);
            p.y -= TransY + iMouse.y * Range
                + iMouse.y * Range
                + TimeTransY * cos(iTime * 0.1);
            p.z -= TransZ;

            p.xy *= rotate(RotX + sin(iTime * 0.2) * TimeRotX);
            p.xz *= rotate(RotY + cos(iTime * 0.1) * TimeRotY);
            p.yz *= rotate(RotZ);

            p.xz *= rotate(p.y * TwistY);

            if (InfPost == 1) p = mod(p + 2.5, 5.) - 2.5;
        }

        if (Sphere == 1) {
            vec4 sphere = vec4(SphereTX, SphereTY, SphereTZ, SphereScale);
            float sphereDist = length(p - sphere.xyz) - sphere.w;
            if (Merge == 1) d = opSmoothUnion(sphereDist, d, ShapeMix);
            else d = min(sphereDist, d);
        }

        if (Rectangle == 1) {
            vec4 rec = vec4(0.0, 0.0, 0.0, RecScale);
            float recDist = length(max(abs(p) - rec.w, 0.));
            if (Merge == 1) d = opSmoothUnion(recDist, d, ShapeMix);
            else d = min(recDist, d);
        }

        return d;
    }

    vec3 RayMarch(vec3 ro, vec3 rd) {
        vec3 dO = vec3(NearClip, 0., 10.);

        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * dO.x;
            float dS = GetDist(p);
            dO.x += dS;
            dO.z = min(dS, dO.z);
            dO.y = float(i);
            if (dO.x > MAX_DIST || dS < SURF_DIST) break;
        }

        return dO;
    }

    vec3 GetNormal(vec3 p) {
        float d = GetDist(p);
        vec2 e = vec2(.01, 0);

        vec3 n = d - vec3(
            GetDist(p - e.xyy),
            GetDist(p - e.yxy),
            GetDist(p - e.yyx));

        return normalize(n);
    }

    float GetLight(vec3 p) {
        vec3 lightPos = vec3(0, 1, -6);
        vec3 l = normalize(lightPos - p);
        vec3 n = GetNormal(p);

        float dif = clamp(dot(n, l), 0., 1.);
        float d = RayMarch(p + n * SURF_DIST * 2., l).x;
        if (d < length(lightPos - p)) dif *= .1;

        return dif;
    }

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        if (TimeEnable == 0 && TimeDisabled == 0) {
            TimeRotX = 0.;
            TimeRotY = 0.;
            TimeTransX = 0.;
            TimeTransY = 0.;
        }

        vec2 uv = (fragCoord + fragCoord - iResolution.xy) / iResolution.y;

        vec3 color = vec3(0);

        vec3 ro = vec3(0.0, 0.0, -6.0 + float(InfPre + InfPost));
        vec3 rd = normalize(vec3(uv.x, uv.y, 1));
        // look around: the camera turns a little toward the input and slides through
        // the repeating space, so near and far layers move at different speeds
        ro.xy += uLook * vec2(0.45, -0.3);
        rd.xz *= rotate(-uLook.x * 0.14);
        rd.yz *= rotate(uLook.y * 0.09);

        vec3 d = RayMarch(ro, rd);

        vec3 p = ro + rd * d.x;

        float dif = GetLight(p);

        vec3 n = GetNormal(p);

        color.r = (d.y * 0.05 - (1. - step(d.x * 0.04, 1.))) * float(Iterations);

        color.g = (1. - (d.z + step(d.x * 0.04, 1.))) * Proximity;

        color = hs(color, PHue);
        color.b = (1. - d.x * 0.04) * Distance;

        color = hs(color, DHue);

        color += dif * light;

        color = hs(color, -n.b);
        color = hs(color, n.r);

        color = hs(color, d.y * DepthHue);

        // Keep the palette on the cool side. The hue rotations above can swing past teal
        // into green and yellow; anything in that band is pulled back to teal (hue 0.5),
        // with a soft edge so there is no visible seam.
        {
            vec3 c = rgb2hsv(color);
            if (c.x > 0.1 && c.x < 0.5) {
                c.x = mix(c.x, 0.5, smoothstep(0.1, 0.2, c.x));
            }
            // The teal phase is also where the animation gets brightest and washes out the
            // hero text, so cap brightness there. Blues and purples are untouched.
            float tealness = 1.0 - smoothstep(0.06, 0.16, abs(c.x - 0.5));
            c.z = min(c.z, mix(1.0, 0.5, tealness));
            color = hsv2rgb(c);
        }

        // Desaturate yellow-to-red hues toward grayscale, with a soft falloff.
        // Band centered on orange (hue ~ 1/12); width spans red..yellow with smooth edges.
        vec3 hsv = rgb2hsv(color);
        float hueDist = abs(hsv.x - 0.0833);
        hueDist = min(hueDist, 1.0 - hueDist);
        float monoMask = 1.0 - smoothstep(0.083, 0.22, hueDist);
        float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(color, vec3(lum), monoMask);

        fragColor = vec4(color, 1.0);
    }

    void main() {
        vec4 col;
        mainImage(col, gl_FragCoord.xy);
        gl_FragColor = col;
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      console.error(src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  3, -1,  -1, 3,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(prog, 'iResolution');
  const uTime       = gl.getUniformLocation(prog, 'iTime');
  const uMouse      = gl.getUniformLocation(prog, 'iMouse');
  const uLook       = gl.getUniformLocation(prog, 'uLook');

  // Performance. This is a raymarching shader (up to 50 steps x 20 fractal steps per pixel),
  // and the canvas is heavily blurred in CSS, so rendering it at a fraction of screen
  // resolution looks the same and costs a lot less. The scale adapts to how fast the
  // device actually is, phones run at 30fps, and low power setups get one still frame.
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const stillOnly =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (navigator.connection && navigator.connection.saveData) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2);
  const MIN_SCALE = 0.18;
  let scale = coarse ? 0.3 : 0.45;   // fraction of CSS pixels actually rendered
  let frameBudget = coarse ? 1000 / 30 : 0; // 0 = uncapped (display rate)
  // The shader reads iMouse in pixels, so the camera offset depends on resolution.
  // Feed it pixel values at the original full render size so the look is identical
  // whatever scale we actually draw at.
  const refDpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const refW = () => canvas.clientWidth * refDpr;
  const refH = () => canvas.clientHeight * refDpr;
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth  * scale));
    const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Scroll plumbing
  const hero = document.getElementById('hero') || canvas.parentElement;
  let scrollNorm = 0;          // eased 0..1 across hero height
  let scrollFlow = 0;          // smoothed signed velocity, in "hero-heights / frame"
  let lastScrollY = window.scrollY;

  function updateScroll() {
    const heroH = hero ? hero.offsetHeight : window.innerHeight;
    const y = window.scrollY;
    const target = Math.min(1, Math.max(0, y / Math.max(1, heroH)));
    scrollNorm += (target - scrollNorm) * 0.12;

    const dy = (y - lastScrollY) / Math.max(1, heroH);
    lastScrollY = y;
    scrollFlow = scrollFlow * 0.88 + dy * 0.12;
  }
  window.addEventListener('scroll', updateScroll, { passive: true });

  // Pause when hero is offscreen
  let heroVisible = true;
  if ('IntersectionObserver' in window && hero) {
    const io = new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
    }, { threshold: 0 });
    io.observe(hero);
  }

  // Live input, the way a VJ rig follows a controller. The mouse (or tilting a phone)
  // turns the camera and bends the fractal, and moving fast pushes the clock forward,
  // then it all settles back when the input goes quiet.
  let inX = 0, inY = 0;        // where the input is, -1..1
  let lookX = 0, lookY = 0;    // smoothed copy fed to the shader
  let energy = 0;              // recent input speed, decays every frame
  function feed(x, y) {
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    energy = Math.min(1.2, energy + Math.hypot(x - inX, y - inY) * 0.9);
    inX = x; inY = y;
  }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    feed(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { inX = 0; inY = 0; } });
  // Phones: tilt where the browser allows it without a permission prompt (Android).
  // iOS gates motion behind a dialog, so there a finger on the hero steers instead.
  let tiltLive = false, baseB = null, baseG = null;
  if (coarse && 'DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let gx = e.gamma, gy = e.beta;
      if (ang === 90) { gx = e.beta; gy = -e.gamma; }
      else if (ang === -90 || ang === 270) { gx = -e.beta; gy = e.gamma; }
      // the resting angle is however the phone is held, and it slowly re-centres
      if (baseB === null) { baseB = gy; baseG = gx; }
      baseB += (gy - baseB) * 0.01;
      baseG += (gx - baseG) * 0.01;
      tiltLive = true;
      feed((gx - baseG) / 22, (gy - baseB) / 22);
    }, { passive: true });
  }
  if (coarse && hero) {
    const touch = (e) => {
      if (tiltLive || !e.touches[0]) return;
      const r = hero.getBoundingClientRect();
      feed((e.touches[0].clientX - r.left) / r.width * 2 - 1, (e.touches[0].clientY - r.top) / r.height * 2 - 1);
    };
    hero.addEventListener('touchstart', touch, { passive: true });
    hero.addEventListener('touchmove', touch, { passive: true });
    hero.addEventListener('touchend', () => { if (!tiltLive) { inX = 0; inY = 0; } }, { passive: true });
  }

  // iTime accumulates with a scroll-driven rate so wheel motion scrubs the clock.
  let shaderTime = 0;
  let lastFrameTime = performance.now();

  // Watch real frame times for a couple of seconds at a time. If the device can't
  // keep up, drop the resolution, and if it is already at the floor, drop to 30fps.
  let sampleStart = 0, sampleFrames = 0, lastDraw = 0, lastAdapt = 0;
  function adapt(now) {
    // a long gap means the hero was off screen or the tab was hidden: start over
    if (!sampleStart || now - lastAdapt > 250) { sampleStart = now; sampleFrames = 0; lastAdapt = now; return; }
    lastAdapt = now;
    sampleFrames++;
    const span = now - sampleStart;
    if (span < 1500) return;
    const avg = span / sampleFrames;
    const target = (frameBudget || 1000 / 60) * 1.35;
    if (avg > target) {
      if (scale > MIN_SCALE) { scale = Math.max(MIN_SCALE, scale * 0.75); resize(); }
      else if (!frameBudget) { frameBudget = 1000 / 30; }
    }
    sampleStart = now; sampleFrames = 0;
  }

  function frame(now) {
    if (heroVisible && (!frameBudget || now - lastDraw >= frameBudget - 2)) {
      const dt = Math.min(0.05, (now - lastFrameTime) * 0.001); // clamp big gaps
      lastFrameTime = now;
      lastDraw = now;
      adapt(now);
      resize();
      updateScroll();

      lookX += (inX - lookX) * 0.05;
      lookY += (inY - lookY) * 0.05;
      energy *= 0.95;

      // iTime = baseRate + scroll-velocity scrub + a push from fast input.
      const rate = 1.0 + scrollFlow * 18.0 + energy * 2.5;
      shaderTime += dt * rate;

      // iMouse: x ≈ canvas center, nudged by velocity and the visitor's input; y follows
      // scroll progress. These offsets go through the fractal folds, so small values
      // reshape the whole structure.
      const mx = refW() * (0.5 + scrollFlow * 1.5 + lookX * 0.06);
      const my = refH() * (scrollNorm + lookY * 0.04);

      gl.uniform3f(uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      gl.uniform1f(uTime, shaderTime);
      gl.uniform4f(uMouse, mx, my, 0.0, 0.0);
      gl.uniform2f(uLook, lookX, lookY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
  if (stillOnly) {
    resize();
    gl.uniform3f(uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
    gl.uniform1f(uTime, 12.0);
    gl.uniform4f(uMouse, refW() * 0.5, 0.0, 0.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    window.addEventListener('resize', () => {
      resize();
      gl.uniform3f(uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, { passive: true });
  } else {
    requestAnimationFrame(frame);
  }
})();
