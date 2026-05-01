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

  // Cap DPR aggressively: this is a raymarching shader, fragment cost is high.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Scroll plumbing
  const hero = document.getElementById('hero');
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

  // iTime accumulates with a scroll-driven rate so wheel motion scrubs the clock.
  let shaderTime = 0;
  let lastFrameTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) * 0.001); // clamp big gaps
    lastFrameTime = now;

    if (heroVisible) {
      resize();
      updateScroll();

      // iTime = baseRate + scroll-velocity scrub. Sign of scrollFlow scrubs forward/back.
      const rate = 1.0 + scrollFlow * 18.0;
      shaderTime += dt * rate;

      // iMouse: x ≈ canvas center with slight scrub from velocity, y driven by scroll progress.
      const mx = canvas.width  * (0.5 + scrollFlow * 1.5);
      const my = canvas.height * scrollNorm;

      gl.uniform3f(uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      gl.uniform1f(uTime, shaderTime);
      gl.uniform4f(uMouse, mx, my, 0.0, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
