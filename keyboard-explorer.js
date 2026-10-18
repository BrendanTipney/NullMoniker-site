// Keyboard hero: exploded model that assembles on scroll, then a layout explorer
// laid over the real keycaps. Expects the markup in keyboard.html (#kb-stage).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stage = document.getElementById('kb-stage');
const canvas = stage.querySelector('.kb-canvas');
const overlay = stage.querySelector('.kb-keys');
const MODEL_URL = stage.dataset.model || 'keyboard-media/corne.glb';
const KEYMAP_URL = stage.dataset.keymap || 'keyboard-media/keymap.json';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const remap = (v, a, b) => clamp01((v - a) / (b - a));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- three.js setup ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  stage.classList.add('kb-no-webgl');
  throw e;
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

// ---------- part choreography ----------
// Real assembly order, bottom up. Each part slides home inside its window of the
// assembly progress, so the stack lands in the order you would build it.
const STAGES = [
  { id: 'case',   label: 'Printed case',        lift: 0.000, win: [0.00, 0.45] },
  { id: 'pcb',    label: 'PCB and standoffs',   lift: 0.018, win: [0.08, 0.55] },
  { id: 'plate',  label: 'Switch plate',        lift: 0.036, win: [0.18, 0.65] },
  { id: 'switch', label: 'Kailh Choc switches', lift: 0.054, win: [0.28, 0.78] },
  { id: 'cap',    label: 'Keycaps',             lift: 0.078, win: [0.40, 0.97] },
];
const stageOf = (name) => {
  if (/^Keycap/.test(name)) return 'cap';
  if (/^Switch/.test(name)) return 'switch';
  if (/^(KeyPlate|Pexi)/.test(name)) return 'plate';
  if (/^(PCB|Support)/.test(name)) return 'pcb';
  return 'case';
};
const EXTRA = { Pexi: 0.03, Foot: -0.014, Leg: -0.014 }; // windows float higher, feet drop below
const SPREAD = 0.02; // halves pulled apart sideways when exploded

const parts = [];     // { obj, home, offset, win }
const keycaps = {};   // ZMK position -> { obj, wide, angle, press }
let modelSize = new THREE.Vector3(0.24, 0.02, 0.09);

new GLTFLoader().load(MODEL_URL, (gltf) => {
  const root = gltf.scene;
  scene.add(root);
  // black keycaps and housings should stay black, so they take less of the room reflection
  root.traverse((o) => {
    if (o.isMesh && /Keycaps|Choc/.test(o.material.name)) o.material.envMapIntensity = 0.45;
  });
  const box = new THREE.Box3().setFromObject(root);
  box.getSize(modelSize);

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
      // keycaps and switches rain in column by column, inner columns first
      const col = pos >= 36 ? (pos < 39 ? 5 : 6) : pos % 12;
      const fromCenter = Math.abs(col - 5.5);
      const d = (5 - fromCenter) * 0.018;
      win = [win[0] + d, Math.min(1, win[1] + d * 0.4)];
      if (st.id === 'cap') keycaps[pos] = { obj: o, wide: !!o.userData.wide, angle: o.userData.angle || 0, press: 0 };
    }
    parts.push({ obj: o, home: o.position.clone(), offset: new THREE.Vector3(side * SPREAD, lift, 0), win });
  });
  stage.classList.add('kb-ready');
  resize();
  needsFrame = true;
}, undefined, () => stage.classList.add('kb-no-webgl'));

// ---------- scroll + camera ----------
let progress = 0, needsFrame = true, visible = true;
function readScroll() {
  const r = stage.getBoundingClientRect();
  const travel = r.height - innerHeight;
  const p = travel > 0 ? clamp01(-r.top / travel) : 1;
  if (p !== progress) { progress = p; needsFrame = true; }
}

function fitDistance(w, h, margin) {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  return Math.max((w * margin.x) / 2 / Math.tan(hfov / 2), (h * margin.y) / 2 / Math.tan(vfov / 2));
}

const tmp = new THREE.Vector3();
const target = new THREE.Vector3();
let frameBox = { top: 0, bottom: 1 }; // fraction of viewport height free for the board
function measureFrame() {
  const H = stage.querySelector('.kb-sticky').clientHeight;
  const head = stage.querySelector('.kb-explorer-head').getBoundingClientRect();
  const panel = stage.querySelector('.kb-panel').getBoundingClientRect();
  const sticky = stage.querySelector('.kb-sticky').getBoundingClientRect();
  const top = head.bottom - sticky.top + 12, bottom = panel.top - sticky.top - 12;
  frameBox = bottom - top > H * 0.2 ? { top: top / H, bottom: bottom / H } : { top: 0.15, bottom: 0.85 };
}

function placeCamera(c, t) {
  const narrow = camera.aspect < 1;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  // top-down: fit the board into the free band between tabs and panel
  const band = frameBox.bottom - frameBox.top;
  const depth = modelSize.z * 1.06, width = modelSize.x * 1.06;
  const dTop = Math.max(width / 2 / Math.tan(Math.atan(Math.tan(vfov / 2) * camera.aspect)),
                        depth / band / 2 / Math.tan(vfov / 2)) + modelSize.y;
  const worldPerFrac = 2 * dTop * Math.tan(vfov / 2); // world units per full viewport height
  const shiftTop = (0.5 - (frameBox.top + frameBox.bottom) / 2) * worldPerFrac;
  const dHero = fitDistance(modelSize.x + SPREAD * 2, modelSize.z, { x: narrow ? 1.08 : 2.0, y: 3.2 });
  const sway = reduceMotion ? 0 : Math.sin(t * 0.25) * 0.06 * (1 - c);
  const theta = lerp(-0.55 + sway, 0, c);
  const phi = lerp(1.0, 0.0005, c);
  const dist = lerp(dHero, dTop, c);
  // in the hero the model sits low so the title floats above it
  target.set(0, lerp(narrow ? 0.05 : 0.068, 0, c), lerp(-0.01, shiftTop, c));
  camera.position.set(
    target.x + dist * Math.sin(phi) * Math.sin(theta),
    target.y + dist * Math.cos(phi),
    target.z + dist * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(target);
}

function resize() {
  const w = stage.querySelector('.kb-sticky').clientWidth;
  const h = stage.querySelector('.kb-sticky').clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  measureFrame();
  needsFrame = true;
}
addEventListener('resize', resize);
addEventListener('scroll', readScroll, { passive: true });
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) needsFrame = true; }).observe(stage);

const stageEls = [...stage.querySelectorAll('.kb-build li')];
let lastLabelsOn = null;

function frame(ms) {
  requestAnimationFrame(frame);
  const t = ms / 1000;
  const anyPress = Object.values(keycaps).some((k) => Math.abs(k.press - (k === hovered ? 1 : 0)) > 0.01);
  if (!visible || (!needsFrame && !anyPress && (reduceMotion || progress > 0.15))) return;
  needsFrame = false;

  const A = ease(remap(progress, 0.03, 0.56));   // assembly
  const C = ease(remap(progress, 0.12, 0.70));   // camera to top-down
  const L = remap(progress, 0.70, 0.80);         // layout overlay

  for (const p of parts) {
    const k = 1 - ease(remap(A, p.win[0], p.win[1]));
    p.obj.position.copy(p.home).addScaledVector(p.offset, k);
  }
  for (const pos in keycaps) {
    const kc = keycaps[pos];
    kc.press += ((kc === hovered ? 1 : 0) - kc.press) * 0.35;
    kc.obj.position.y -= kc.press * 0.0018; // Choc travel is 3 mm; a short dip reads as a press
  }

  placeCamera(C, t);
  renderer.render(scene, camera);

  stage.style.setProperty('--kb-title', String(1 - remap(progress, 0.02, 0.16)));
  stage.style.setProperty('--kb-build', String(remap(progress, 0.04, 0.12) * (1 - remap(progress, 0.62, 0.70))));
  stage.style.setProperty('--kb-layout', String(L));
  stageEls.forEach((li, i) => li.classList.toggle('is-set', A >= STAGES[i].win[1] - 0.02));
  const on = L > 0.5;
  if (on !== lastLabelsOn) { stage.classList.toggle('kb-explore', on); lastLabelsOn = on; }
  if (L > 0) positionLabels();
}
requestAnimationFrame(frame);
readScroll();

// ---------- layout explorer ----------
let keymap = null, layerIx = 0, hovered = null;
const labelEls = {};
const tabsEl = stage.querySelector('.kb-tabs');
const reachEl = stage.querySelector('.kb-reach');
const detailEl = stage.querySelector('.kb-detail');
const combosEl = stage.querySelector('.kb-combos');
const countEl = stage.querySelector('.kb-count');

const NOTES = {
  HighSens: 'Trackpad runs at 1.8x while P is held. Every key passes through to Base.',
  LowSens: 'Trackpad drops to 0.45x for fine work while V is held. Every key passes through to Base.',
  Mouse: 'Pointer keys and clicks. Nothing in the current keymap switches to this layer.',
  Gaming: 'Toggled on, so the left hand stays on WASD with Space under the thumb.',
};

fetch(KEYMAP_URL).then((r) => r.json()).then((data) => {
  keymap = data;
  const physical = data.layers[0].keys.filter((k) => k.kind !== 'none').length;
  countEl.textContent = `${data.layers.length} layers on ${physical} keys`;

  data.layers.forEach((L, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kb-tab';
    b.id = `kb-layer-${i}`;
    b.innerHTML = `<span class="kb-tab-ix">L${i}</span>${L.name}`;
    b.addEventListener('click', () => setLayer(i));
    tabsEl.appendChild(b);
  });

  for (let p = 0; p < 42; p++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'kb-key';
    el.dataset.pos = p;
    el.innerHTML = '<span class="kb-tap"></span><span class="kb-hold"></span>';
    el.addEventListener('pointerenter', () => showKey(p));
    el.addEventListener('focus', () => showKey(p));
    el.addEventListener('click', () => showKey(p));
    el.addEventListener('pointerleave', () => { hovered = null; needsFrame = true; });
    overlay.appendChild(el);
    labelEls[p] = el;
  }
  setLayer(0);
});

function effective(p) {
  // What a key does with this layer active. &trans falls through to the layers
  // underneath: Gaming Num sits on Gaming, everything else sits on Base.
  const chain = [layerIx, ...(layerIx === 5 ? [4] : []), 0];
  for (const i of chain) {
    const k = keymap.layers[i].keys[p];
    if (k.kind !== 'trans') return { k, from: i };
  }
  return { k: keymap.layers[0].keys[p], from: 0 };
}

function reachFor(ix) {
  const out = [];
  keymap.layers.forEach((L, li) => L.keys.forEach((k, p) => {
    if (k.layer === ix && li !== ix) {
      const verb = k.kind === 'layer-tap' ? `Hold ${k.tap}` : k.note === 'Toggle' ? 'Toggle key' : 'Hold key';
      out.push({ text: `${verb} on ${L.name}`, positions: [p] });
    }
  }));
  keymap.combos.forEach((c) => {
    if (c.action.layer === ix) {
      const names = c.positions.map((p) => keymap.layers[0].keys[p].tap || `#${p}`).join(' + ');
      out.push({ text: `${c.action.note === 'Toggle' ? 'Toggle' : 'Hold'} combo ${names}`, positions: c.positions });
    }
  });
  return out;
}

function setLayer(ix) {
  layerIx = ix;
  const L = keymap.layers[ix];
  tabsEl.querySelectorAll('.kb-tab').forEach((b, i) => b.setAttribute('aria-pressed', String(i === ix)));
  const reach = reachFor(ix);
  const activators = new Set(reach.flatMap((r) => r.positions));
  reachEl.innerHTML = '';
  const h = document.createElement('p');
  h.className = 'kb-reach-title';
  h.textContent = L.name;
  reachEl.appendChild(h);
  const how = document.createElement('p');
  how.className = 'kb-reach-how';
  how.textContent = ix === 0 ? 'Always on. Colemak-DH with home row layer keys.'
    : reach.length ? reach.map((r) => r.text).join(' · ') : 'No key switches to this layer.';
  reachEl.appendChild(how);
  if (NOTES[L.id]) {
    const n = document.createElement('p');
    n.className = 'kb-reach-note';
    n.textContent = NOTES[L.id];
    reachEl.appendChild(n);
  }

  for (let p = 0; p < 42; p++) {
    const el = labelEls[p];
    if (!el) continue;
    const { k, from } = effective(p);
    el.querySelector('.kb-tap').textContent = k.tap || '';
    el.querySelector('.kb-hold').textContent = k.hold || '';
    el.classList.toggle('is-through', from !== ix);
    el.classList.toggle('is-empty', k.kind === 'none');
    el.classList.toggle('is-activator', activators.has(p) && ix !== 0);
    el.classList.toggle('is-long', (k.tap || '').length > 4);
    el.setAttribute('aria-label', `Key ${p}: ${k.tap || 'nothing'}${k.hold ? `, hold for ${k.hold}` : ''}`);
  }

  combosEl.innerHTML = '';
  keymap.combos.filter((c) => !c.layers || c.layers.includes(ix)).forEach((c) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'kb-combo';
    const keys = c.positions.map((p) => keymap.layers[0].keys[p].tap || '·').join(' ');
    chip.innerHTML = `<span class="kb-combo-keys">${esc(keys)}</span><span class="kb-combo-out">${esc(c.action.tap || c.name)}</span>`;
    chip.title = c.name;
    const on = (v) => c.positions.forEach((p) => labelEls[p] && labelEls[p].classList.toggle('is-combo', v));
    chip.addEventListener('pointerenter', () => on(true));
    chip.addEventListener('pointerleave', () => on(false));
    chip.addEventListener('focus', () => on(true));
    chip.addEventListener('blur', () => on(false));
    combosEl.appendChild(chip);
  });
  showKey(null);
}

function showKey(p) {
  hovered = p === null ? null : keycaps[p] || null;
  needsFrame = true;
  if (p === null) {
    detailEl.innerHTML = '<p class="kb-detail-hint">Point at a key to see its binding.</p>';
    return;
  }
  const { k, from } = effective(p);
  const rows = [];
  if (k.kind === 'none') rows.push(['Tap', 'Nothing']);
  else rows.push(['Tap', k.tap]);
  if (k.hold) rows.push(['Hold', k.kind === 'layer-tap' ? `${k.hold} layer` : k.hold]);
  if (k.note) rows.push(['Note', k.note]);
  if (from !== layerIx) rows.push(['From', `${keymap.layers[from].name}, passed through`]);
  detailEl.innerHTML = `<p class="kb-detail-pos">Position ${p}</p>` +
    rows.map(([a, b]) => `<p class="kb-detail-row"><span>${a}</span>${esc(b)}</p>`).join('') +
    `<code class="kb-detail-code">${esc(k.raw)}</code>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const KEY_W = 0.0175, KEY_TOP = 0.0066;
const a = new THREE.Vector3(), b = new THREE.Vector3();
function positionLabels() {
  if (!keymap) return;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (let p = 0; p < 42; p++) {
    const el = labelEls[p], kc = keycaps[p];
    if (!el) continue;
    if (!kc) { el.hidden = true; continue; }
    el.hidden = false;
    kc.obj.updateWorldMatrix(true, false);
    a.set(-KEY_W / 2, KEY_TOP, 0).applyMatrix4(kc.obj.matrixWorld).project(camera);
    b.set(KEY_W / 2, KEY_TOP, 0).applyMatrix4(kc.obj.matrixWorld).project(camera);
    tmp.set(0, KEY_TOP, 0).applyMatrix4(kc.obj.matrixWorld).project(camera);
    const px = Math.hypot((b.x - a.x) * w / 2, (b.y - a.y) * h / 2);
    const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
    el.style.width = `${px}px`;
    el.style.height = `${px * (kc.wide ? 26.5 : 16.5) / 17.5}px`;
    el.style.fontSize = `${px}px`;
    el.style.transform = `translate(${x - px / 2}px, ${y - px * (kc.wide ? 26.5 : 16.5) / 35}px) rotate(${-kc.angle}deg)`;
  }
}
