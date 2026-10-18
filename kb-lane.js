// Compact version of the keyboard case study hero, for the home page Hardware band
// and the Hardware page. The model starts exploded and assembles as the panel
// scrolls up through the viewport. Any element with [data-kb-model] gets one.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// corne.glb is Draco compressed (geometry) with WebP textures, so the loader needs the decoder.
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
const makeLoader = () => new GLTFLoader().setDRACOLoader(draco);

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const remap = (v, a, b) => clamp01((v - a) / (b - a));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// Same assembly order and part rules as keyboard-explorer.js
const STAGES = [
  { id: 'case',   lift: 0.000, win: [0.00, 0.45] },
  { id: 'pcb',    lift: 0.018, win: [0.08, 0.55] },
  { id: 'plate',  lift: 0.036, win: [0.18, 0.65] },
  { id: 'switch', lift: 0.054, win: [0.28, 0.78] },
  { id: 'cap',    lift: 0.078, win: [0.40, 0.97] },
];
const stageOf = (name) => {
  if (/^Keycap/.test(name)) return 'cap';
  if (/^Switch/.test(name)) return 'switch';
  if (/^(KeyPlate|Pexi)/.test(name)) return 'plate';
  if (/^(PCB|Support)/.test(name)) return 'pcb';
  return 'case';
};
const EXTRA = { Pexi: 0.03, Foot: -0.014, Leg: -0.014 };
const SPREAD = 0.02;

let gltfPromise = null;
const loadModel = (url) => (gltfPromise ||= new Promise((res, rej) => makeLoader().load(url, res, undefined, rej)));

function mount(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'kb-lane-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D model of the split keyboard assembling from its printed case, PCB, switch plate, switches and keycaps');
  host.prepend(canvas);
  const steps = [...host.querySelectorAll('.kb-lane-steps li')];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    host.classList.add('kb-lane-fallback');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-0.3, 0.6, 0.35);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(0.25, 0.25, -0.5);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x000000, 0.35));
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 10);

  const parts = [];
  const size = new THREE.Vector3(0.24, 0.02, 0.09);
  const center = new THREE.Vector3();
  let ready = false;

  loadModel(host.dataset.kbModel).then((gltf) => {
    // each mount gets its own copy so two panels can sit at different progress
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      if (o.isMesh && o.material && /Keycaps|Choc/.test(o.material.name)) {
        o.material = o.material.clone();
        o.material.envMapIntensity = 0.45;
      }
    });
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
    root.traverse((o) => {
      const group = o.parent && o.parent.name;
      if (!group || !/^(Left|Right)_(case|switches|keycaps)$/.test(group)) return;
      const side = group.startsWith('Left') ? -1 : 1;
      const st = STAGES.find((s) => s.id === stageOf(o.name));
      let lift = st.lift;
      for (const k in EXTRA) if (o.name.startsWith(k)) lift += EXTRA[k];
      let win = st.win.slice();
      const pos = o.userData.pos;
      if (pos !== undefined) {
        const col = pos >= 36 ? (pos < 39 ? 5 : 6) : pos % 12;
        const d = (5 - Math.abs(col - 5.5)) * 0.018;
        win = [win[0] + d, Math.min(1, win[1] + d * 0.4)];
      }
      parts.push({ obj: o, home: o.position.clone(), offset: new THREE.Vector3(side * SPREAD, lift, 0), win });
    });
    ready = true;
    host.classList.add('kb-lane-ready');
    resize();
  }).catch(() => host.classList.add('kb-lane-fallback'));

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  // pointer nudges the orbit a little
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!reduceMotion) {
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
    });
    host.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  }

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px 0px' }).observe(host);

  // 0 when the panel's top enters the bottom of the screen, 1 once its center
  // has climbed to a bit above the middle.
  let progress = reduceMotion ? 1 : 0;
  function readScroll() {
    if (reduceMotion) return;
    const r = host.getBoundingClientRect();
    const vh = innerHeight;
    progress = remap(vh - r.top, 0, vh * 0.5 + r.height * 0.5);
  }

  const target = new THREE.Vector3();
  function frame(ms) {
    requestAnimationFrame(frame);
    if (!visible || !ready) return;
    readScroll();
    const t = ms / 1000;
    const A = ease(remap(progress, 0.08, 1));
    for (const p of parts) {
      const k = 1 - ease(remap(A, p.win[0], p.win[1]));
      p.obj.position.copy(p.home).addScaledVector(p.offset, k);
    }
    px += (tx - px) * 0.06; py += (ty - py) * 0.06;
    const narrow = camera.aspect < 1;
    const idle = reduceMotion ? 0 : Math.sin(t * 0.3) * 0.08;
    const theta = lerp(-0.95, -0.42, A) + idle + px * 0.5;
    const phi = lerp(0.82, 1.0, A) + py * 0.25;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const w = size.x + SPREAD * 2 * (1 - A);
    const margin = narrow ? 1.3 : 1.6;
    const dist = Math.max((w * margin) / 2 / Math.tan(hfov / 2), (0.14 * margin) / 2 / Math.tan(vfov / 2));
    target.set(center.x, lerp(0.055, 0.012, A), center.z);
    camera.position.set(
      target.x + dist * Math.sin(phi) * Math.sin(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    steps.forEach((li, i) => li.classList.toggle('is-set', A >= STAGES[i].win[1] - 0.02));
  }
  requestAnimationFrame(frame);
}

document.querySelectorAll('[data-kb-model]').forEach(mount);
