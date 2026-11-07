import * as THREE from './vendor/three.module.min.js';
import {
  TILT_DEAD_DEG, TILT_SPAN_DEG,
  orientationToScreenAngle, tiltRightDownDegrees, steerFromTiltDegrees,
} from './tilt.js';

const PREF_KEY = 'sr3d_prefs';
const SPEED = 13;
const GRAV = 26;
const ROAD = 6.15;
const CHUNK = 48;
const PAINT = { red: 0xef3d3d, green: 0x2fbe4a };

const $ = (id) => document.getElementById(id);

const Snd = {
  ac: null, master: null, eng: null, muted: false,
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ac) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
      const ac = this.ac = new AC();
      this.master = ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(ac.destination);
    }
    this.ac.resume();
    this.engine(true);
  },
  engine(on) {
    if (!this.ac) return;
    if (!on) {
      if (this.eng) { try { this.eng.stop(); } catch (e) { /* ignore */ } this.eng = null; }
      return;
    }
    if (this.eng) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = 72;
    f.type = 'lowpass';
    f.frequency.value = 240;
    g.gain.value = 0.045;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.eng = o;
    this.engGain = g;
  },
  tone(freq, dur, type, gain) {
    if (!this.ac) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(ac.currentTime + dur + 0.02);
  },
  star() { this.tone(880, 0.12, 'triangle', 0.16); this.tone(1320, 0.16, 'sine', 0.07); },
  jump() { this.tone(440, 0.16, 'sine', 0.12); },
  boop() { this.tone(280, 0.1, 'triangle', 0.08); },
  yay() {
    this.tone(523, 0.12, 'triangle', 0.13);
    setTimeout(() => this.tone(659, 0.12, 'triangle', 0.13), 110);
    setTimeout(() => this.tone(784, 0.22, 'triangle', 0.13), 220);
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
    $('muteBtn').textContent = m ? '🔇' : '🔊';
    $('pauseMute').textContent = m ? 'Ljud på' : 'Ljud av';
  },
  suspend() { if (this.ac && this.ac.state === 'running') this.ac.suspend(); },
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
};

let colorName = 'red';
let state = 'title';
let stars = 0;
let boops = 0;
let rampHops = 0;
let cheered = false;
let holdL = false;
let holdR = false;
let jumpQueued = false;
const keys = new Set();
let forcedAngle = null;
let starting = false;

const tilt = {
  status: 'unknown', beta: 0, gamma: 0, hasSample: false,
  zero: 0, zeroAngle: null, calibrated: false, raw: 0, target: 0,
};

const car = {
  x: 0, y: 0, z: 0, vy: 0, steer: 0, onGround: true, squash: 1, bob: 0,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function groundY(z) {
  return Math.sin(z * 0.045) * 1.15 + Math.sin(z * 0.11 + 1.2) * 0.28;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function starSpec(i) {
  const lanes = [0, 2.5, -2.5, 1.5, -3.1, 0.8, 3.0];
  return { i, z: 12 + i * 16, x: lanes[i % lanes.length] };
}
function coneSpec(i) {
  const lanes = [3.55, -3.45, 2.7, -3.9];
  return { i, z: 34 + i * 42, x: lanes[i % lanes.length] };
}
function rampSpec(i) {
  return { i, z: 46 + i * 70, x: 0, len: 11, h: 2.5, halfW: 4.6 };
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.color === 'green' || p.color === 'red') colorName = p.color;
    if (typeof p.muted === 'boolean') Snd.muted = p.muted;
  } catch (e) { /* keep defaults */ }
}
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ color: colorName, muted: !!Snd.muted }));
  } catch (e) { /* ignore */ }
}

function currentScreenAngle() {
  if (forcedAngle != null) return forcedAngle;
  const so = window.screen && window.screen.orientation;
  const sa = so && typeof so.angle === 'number' ? so.angle : null;
  const wo = typeof window.orientation === 'number' ? window.orientation : null;
  return orientationToScreenAngle(sa, wo, window.innerWidth > window.innerHeight * 1.05);
}

function updateTiltSteer() {
  if (!tilt.hasSample || tilt.status !== 'granted') {
    tilt.target = 0;
    return;
  }
  const angle = currentScreenAngle();
  const raw = tiltRightDownDegrees(tilt.beta, tilt.gamma, angle);
  if (!tilt.calibrated || angle !== tilt.zeroAngle) {
    tilt.zero = raw;
    tilt.zeroAngle = angle;
    tilt.calibrated = true;
  }
  tilt.raw = raw;
  tilt.target = steerFromTiltDegrees(raw, tilt.zero, TILT_DEAD_DEG, TILT_SPAN_DEG);
}

function orientationIsLive(beta, gamma) {
  // Exact zeros are what headless browsers emit when no sensor exists.
  // A real phone jitters, or sits at a clear tilt, past this threshold.
  return Math.abs(beta) > 0.8 || Math.abs(gamma) > 0.8;
}
function applyOrientation(event) {
  if (!event || (!Number.isFinite(event.beta) && !Number.isFinite(event.gamma))) return;
  tilt.beta = Number.isFinite(event.beta) ? event.beta : 0;
  tilt.gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  tilt.hasSample = true;
  if (tilt.status === 'denied') {
    tilt.target = 0;
    return;
  }
  if (tilt.status !== 'granted' && orientationIsLive(tilt.beta, tilt.gamma)) {
    tilt.status = 'granted';
    if (state !== 'title') showTiltPill();
  }
  if (tilt.status === 'granted') updateTiltSteer();
}

function calibrate() {
  Snd.resume();
  if (!tilt.hasSample || tilt.status !== 'granted') {
    tilt.calibrated = false;
    toast('Håll telefonen rakt');
    return;
  }
  const angle = currentScreenAngle();
  tilt.zero = tiltRightDownDegrees(tilt.beta, tilt.gamma, angle);
  tilt.zeroAngle = angle;
  tilt.calibrated = true;
  updateTiltSteer();
  toast('Rakt!');
}

async function requestTilt() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    tilt.status = 'unavailable';
    showTiltPill();
    return;
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      tilt.status = res === 'granted' ? 'granted' : 'denied';
    } catch (e) {
      tilt.status = 'denied';
    }
    if (tilt.status !== 'granted') tilt.target = 0;
    showTiltPill();
    return;
  }
  tilt.status = (tilt.hasSample && orientationIsLive(tilt.beta, tilt.gamma)) ? 'granted' : 'unavailable';
  showTiltPill();
}

function showTiltPill() {
  const el = $('tiltPill');
  el.classList.remove('hidden', 'ok', 'warn');
  if (tilt.status === 'granted') {
    el.textContent = 'Lutning på';
    el.classList.add('ok');
  } else if (tilt.status === 'denied') {
    el.textContent = 'Ingen lutning — styr med pilarna';
    el.classList.add('warn');
  } else {
    el.textContent = 'Lutning saknas — styr med pilarna';
    el.classList.add('warn');
  }
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function setStars(n) {
  stars = n;
  $('starCount').textContent = String(n);
}

function showFail() {
  $('fail').classList.remove('hidden');
  $('title').classList.add('hidden');
}

let renderer, scene, camera, sun, paintMat;
let carGroup, wheelSpins = [], frontWheels = [];
let shadowMesh;
const chunks = [];
const starPool = [];
const conePool = [];
const rampPool = [];
const dust = [];
let ready = false;

function boot() {
  loadPrefs();
  Snd.setMuted(Snd.muted);
  markColor();
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch (e) {
    showFail();
    return;
  }
  if (!renderer.getContext()) { showFail(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('stage').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd4ff);
  scene.fog = new THREE.Fog(0xc5ebff, 38, 145);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 240);
  camera.position.set(0, 4, -8);

  scene.add(new THREE.HemisphereLight(0xd7f3ff, 0x67b34a, 1.05));
  sun = new THREE.DirectionalLight(0xfff6d2, 1.55);
  sun.position.set(-4, 14, -8);
  scene.add(sun);
  scene.add(sun.target);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe56a })
  );
  sunBall.position.set(18, 22, 40);
  scene.add(sunBall);

  paintMat = new THREE.MeshToonMaterial({ color: PAINT[colorName] });
  buildCar();
  shadowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 18),
    new THREE.MeshBasicMaterial({ color: 0x16321a, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  scene.add(shadowMesh);

  for (let i = 0; i < 5; i++) chunks.push(makeChunk(i - 1));
  for (let i = 0; i < 8; i++) starPool.push(makeStar(i));
  for (let i = 0; i < 5; i++) conePool.push(makeCone(i));
  for (let i = 0; i < 3; i++) rampPool.push(makeRamp(i));
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf4e2b0, transparent: true, opacity: 0.0 })
    );
    scene.add(m);
    dust.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }

  car.y = groundY(0);
  snapCamera();
  placeCar(0.016);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { resize(); tilt.calibrated = false; });
  window.addEventListener('deviceorientation', applyOrientation);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') openPause();
  });
  bindUi();
  resize();
  ready = true;
  requestAnimationFrame(frame);
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  const portrait = h > w * 1.05;
  $('rotateHint').classList.toggle('hidden', !portrait);
}

function buildCar() {
  carGroup = new THREE.Group();
  const glass = new THREE.MeshToonMaterial({ color: 0xc5f3ff });
  const dark = new THREE.MeshToonMaterial({ color: 0x243044 });
  const tire = new THREE.MeshToonMaterial({ color: 0x22262c });
  const hub = new THREE.MeshToonMaterial({ color: 0xf7f7f7 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.52, 3.35), paintMat);
  body.position.set(0, 0.62, 0.05);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.52, 1.45), paintMat);
  cabin.position.set(0, 1.12, -0.28);
  const windowRear = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.08), glass);
  windowRear.position.set(0, 1.14, -1.0);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.rotation.y = Math.PI;
  smile.position.set(0, 0.98, -1.06);
  carGroup.add(body, cabin, windowRear, smile);
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hub);
    eye.position.set(sx, 1.18, -1.05);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark);
    pupil.position.set(sx, 1.18, -1.12);
    carGroup.add(eye, pupil);
  }
  for (const sx of [-0.62, 0.62]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.08), tail);
    t.position.set(sx, 0.72, -1.64);
    carGroup.add(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.08), lamp);
    h.position.set(sx, 0.7, 1.74);
    carGroup.add(h);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.06), hub);
  plate.position.set(0, 0.55, -1.66);
  const starlet = new THREE.Mesh(starGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xf5b400 }));
  starlet.position.set(0, 0.55, -1.7);
  carGroup.add(plate, starlet);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const spots = [
    { x: -0.92, z: 1.05, front: true },
    { x: 0.92, z: 1.05, front: true },
    { x: -0.92, z: -1.05, front: false },
    { x: 0.92, z: -1.05, front: false },
  ];
  for (const s of spots) {
    const yaw = new THREE.Group();
    const spin = new THREE.Group();
    const mesh = new THREE.Mesh(wheelGeo, tire);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), hub);
    cap.position.x = Math.sign(s.x) * 0.12;
    spin.add(mesh, cap);
    yaw.add(spin);
    yaw.position.set(s.x, 0.36, s.z);
    carGroup.add(yaw);
    wheelSpins.push(spin);
    if (s.front) frontWheels.push(yaw);
  }
  scene.add(carGroup);
}

function starGeometry(scale) {
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = (i % 2 === 0 ? 1 : 0.42) * scale;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: scale * 0.45, bevelEnabled: true, bevelThickness: scale * 0.08,
    bevelSize: scale * 0.06, bevelSegments: 1,
  });
  geo.center();
  return geo;
}

function makeChunk(index) {
  const vx = 19, vz = 13;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vx * vz * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vx * vz * 3), 3));
  const idx = [];
  for (let iz = 0; iz < vz - 1; iz++) {
    for (let ix = 0; ix < vx - 1; ix++) {
      const a = iz * vx + ix;
      idx.push(a, a + vx, a + 1, a + 1, a + vx, a + vx + 1);
    }
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  const decor = new THREE.Group();
  const trunk = new THREE.MeshToonMaterial({ color: 0x8a5a32 });
  const leaf = new THREE.MeshToonMaterial({ color: 0x3aaa32 });
  const flower = new THREE.MeshToonMaterial({ color: 0xff7ab8 });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.05, 6), trunk);
    t.position.y = 0.52;
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.9, 7), leaf);
    c.position.y = 1.85;
    g.add(t, c);
    g.userData.kind = 'tree';
    decor.add(g);
  }
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), flower);
    f.userData.kind = 'flower';
    decor.add(f);
  }
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 1.15), dashMat);
    d.userData.kind = 'dash';
    decor.add(d);
  }
  scene.add(decor);
  const ch = { index, geo, mesh, decor, vx, vz };
  layoutChunk(ch);
  return ch;
}

function layoutChunk(ch) {
  const z0 = ch.index * CHUNK;
  const pos = ch.geo.attributes.position.array;
  const col = ch.geo.attributes.color.array;
  const half = 22;
  let p = 0;
  for (let iz = 0; iz < ch.vz; iz++) {
    for (let ix = 0; ix < ch.vx; ix++) {
      const x = -half + (ix / (ch.vx - 1)) * half * 2;
      const z = z0 + (iz / (ch.vz - 1)) * CHUNK;
      pos[p] = x;
      pos[p + 1] = groundY(z);
      pos[p + 2] = z;
      const ax = Math.abs(x);
      const n = 0.5 + 0.5 * Math.sin(x * 0.8 + z * 0.37);
      if (ax < 5.3) {
        col[p] = 0.86; col[p + 1] = 0.62 + n * 0.05; col[p + 2] = 0.32;
      } else if (ax < 6.3) {
        col[p] = 0.55; col[p + 1] = 0.72; col[p + 2] = 0.28;
      } else {
        col[p] = 0.28 + n * 0.08; col[p + 1] = 0.75 + n * 0.12; col[p + 2] = 0.24;
      }
      p += 3;
    }
  }
  ch.geo.attributes.position.needsUpdate = true;
  ch.geo.attributes.color.needsUpdate = true;
  ch.geo.computeVertexNormals();
  const rnd = mulberry32((ch.index + 40) * 997);
  let ti = 0, fi = 0, di = 0;
  for (const obj of ch.decor.children) {
    if (obj.userData.kind === 'tree') {
      const side = ti % 2 === 0 ? -1 : 1;
      const x = side * (9.2 + rnd() * 8);
      const z = z0 + 3 + rnd() * (CHUNK - 6);
      obj.position.set(x, groundY(z), z);
      obj.scale.setScalar(0.85 + rnd() * 0.55);
      ti++;
    } else if (obj.userData.kind === 'flower') {
      const side = fi % 2 === 0 ? -1 : 1;
      const x = side * (6.5 + rnd() * 2.2);
      const z = z0 + rnd() * CHUNK;
      obj.position.set(x, groundY(z) + 0.16, z);
      fi++;
    } else {
      const z = z0 + 6 + di * (CHUNK / 4);
      obj.position.set(0, groundY(z) + 0.06, z);
      di++;
    }
  }
}

function makeStar(i) {
  const mesh = new THREE.Mesh(
    starGeometry(0.48),
    new THREE.MeshToonMaterial({ color: 0xffd23b })
  );
  scene.add(mesh);
  const item = { i, mesh, x: 0, y: 0, z: 0, got: false };
  placeStar(item, starSpec(i));
  return item;
}
function placeStar(item, spec) {
  item.i = spec.i;
  item.x = spec.x;
  item.z = spec.z;
  item.y = groundY(spec.z) + 1.35;
  item.got = false;
  item.mesh.visible = true;
  item.mesh.position.set(item.x, item.y, item.z);
}
function makeCone(i) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.85, 8),
    new THREE.MeshToonMaterial({ color: 0xff8a1e })
  );
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.1, 8),
    new THREE.MeshToonMaterial({ color: 0xf4f4f4 })
  );
  base.position.y = -0.38;
  const g = new THREE.Group();
  g.add(mesh, base);
  scene.add(g);
  const item = { i, mesh: g, x: 0, z: 0, booped: false, squash: 1 };
  placeCone(item, coneSpec(i));
  return item;
}
function placeCone(item, spec) {
  item.i = spec.i;
  item.x = spec.x;
  item.z = spec.z;
  item.booped = false;
  item.squash = 1;
  item.mesh.position.set(spec.x, groundY(spec.z) + 0.42, spec.z);
  item.mesh.scale.set(1, 1, 1);
}
function makeRamp(i) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  geo.setIndex([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xf0c36a }));
  scene.add(mesh);
  const item = { i, mesh, x: 0, z: 0, len: 11, h: 2.5, halfW: 4.6 };
  placeRamp(item, rampSpec(i));
  return item;
}
function placeRamp(item, spec) {
  item.i = spec.i;
  item.x = spec.x;
  item.z = spec.z;
  item.len = spec.len;
  item.h = spec.h;
  item.halfW = spec.halfW;
  const y0 = groundY(spec.z);
  const rise = groundY(spec.z + spec.len) - y0;
  const hw = spec.halfW;
  const L = spec.len;
  const h1 = rise + spec.h;
  const arr = item.mesh.geometry.attributes.position.array;
  const pts = [
    [-hw, 0, 0], [hw, 0, 0], [hw, rise, L], [-hw, rise, L],
    [-hw, 0.08, 0], [hw, 0.08, 0], [hw, h1, L], [-hw, h1, L],
  ];
  for (let i = 0; i < pts.length; i++) {
    arr[i * 3] = pts[i][0];
    arr[i * 3 + 1] = pts[i][1];
    arr[i * 3 + 2] = pts[i][2];
  }
  item.mesh.geometry.attributes.position.needsUpdate = true;
  item.mesh.geometry.computeVertexNormals();
  item.mesh.position.set(spec.x, y0, spec.z);
}

function rampUnder(z, x) {
  for (const r of rampPool) {
    const t = (z - r.z) / r.len;
    if (t > 0 && t < 1 && Math.abs(x - r.x) <= r.halfW) return r;
  }
  return null;
}
function surfaceY(z, x) {
  let y = groundY(z);
  const r = rampUnder(z, x);
  if (r) {
    const t = (z - r.z) / r.len;
    const y0 = groundY(r.z);
    const y1 = groundY(r.z + r.len) + r.h;
    y = Math.max(y, y0 + (y1 - y0) * t);
  }
  return y;
}

function recycleWorld() {
  const minKeep = Math.floor(car.z / CHUNK) - 1;
  for (const ch of chunks) {
    let moved = false;
    while (ch.index < minKeep) { ch.index += chunks.length; moved = true; }
    if (moved) layoutChunk(ch);
  }
  for (const s of starPool) {
    if (s.z < car.z - 10) placeStar(s, starSpec(s.i + starPool.length));
  }
  for (const c of conePool) {
    if (c.z < car.z - 8) placeCone(c, coneSpec(c.i + conePool.length));
  }
  for (const r of rampPool) {
    if (r.z + r.len < car.z - 8) placeRamp(r, rampSpec(r.i + rampPool.length));
  }
}

function resetRun() {
  car.x = 0; car.z = 0; car.vy = 0; car.steer = 0; car.onGround = true; car.squash = 1;
  car.y = groundY(0);
  setStars(0); boops = 0; rampHops = 0; cheered = false;
  jumpQueued = false; holdL = false; holdR = false;
  for (let i = 0; i < starPool.length; i++) placeStar(starPool[i], starSpec(i));
  for (let i = 0; i < conePool.length; i++) placeCone(conePool[i], coneSpec(i));
  for (let i = 0; i < rampPool.length; i++) placeRamp(rampPool[i], rampSpec(i));
  for (let i = 0; i < chunks.length; i++) { chunks[i].index = i - 1; layoutChunk(chunks[i]); }
  $('cheer').classList.remove('show');
}

function placeCar(dt) {
  const squash = car.squash;
  carGroup.position.set(car.x, car.y, car.z);
  carGroup.scale.set(1 + (squash - 1) * 0.35, 1 - (squash - 1) * 0.45, 1 + (squash - 1) * 0.2);
  carGroup.rotation.y = -car.steer * 0.45;
  carGroup.rotation.z = -car.steer * 0.08;
  const lift = car.onGround ? 0 : clamp((car.y - surfaceY(car.z, car.x)) * 0.08, 0, 0.25);
  carGroup.rotation.x = -lift;
  for (const w of frontWheels) w.rotation.y = -car.steer * 0.35;
  const spin = (state === 'play' ? SPEED : 2) * dt / 0.36;
  for (const s of wheelSpins) s.rotation.x -= spin;
  const gy = surfaceY(car.z, car.x);
  shadowMesh.position.set(car.x, gy + 0.07, car.z);
  const air = clamp(car.y - gy, 0, 6);
  shadowMesh.scale.setScalar(1 - air * 0.08);
  shadowMesh.material.opacity = 0.28 - air * 0.03;
}

function step(dt) {
  updateTiltSteer();
  const buttons = (holdR ? 1 : 0) - (holdL ? 1 : 0);
  const key = ((keys.has('ArrowRight') || keys.has('KeyD')) ? 1 : 0) - ((keys.has('ArrowLeft') || keys.has('KeyA')) ? 1 : 0);
  const target = clamp((tilt.status === 'granted' ? tilt.target : 0) + buttons + key, -1, 1);
  car.steer += (target - car.steer) * (1 - Math.exp(-dt * 12));

  const prevRamp = rampUnder(car.z, car.x);
  car.z += SPEED * dt;
  car.x = clamp(car.x + car.steer * 8.2 * dt, -ROAD, ROAD);
  const ground = surfaceY(car.z, car.x);
  const nowRamp = rampUnder(car.z, car.x);

  if (car.onGround) {
    if (prevRamp && !nowRamp) {
      car.onGround = false;
      car.vy = 9.4;
      rampHops++;
      toast('Hoppsan!');
      Snd.jump();
    } else if (jumpQueued) {
      car.onGround = false;
      car.vy = 10.4;
      Snd.jump();
    } else {
      car.y = ground;
      car.vy = 0;
    }
  } else {
    car.vy -= GRAV * dt;
    car.y += car.vy * dt;
    if (car.y <= ground) {
      car.y = ground;
      car.vy = 0;
      car.onGround = true;
      car.squash = 1.45;
    }
  }
  jumpQueued = false;
  car.squash += (1 - car.squash) * (1 - Math.exp(-dt * 8));
  car.bob += dt;

  for (const s of starPool) {
    if (!s.got) {
      s.mesh.rotation.y += dt * 2.2;
      s.mesh.position.y = s.y + Math.sin(car.bob * 3 + s.i) * 0.12;
      const dx = car.x - s.x, dz = car.z - s.z;
      if (dx * dx + dz * dz < 1.65 * 1.65) {
        s.got = true;
        s.mesh.visible = false;
        setStars(stars + 1);
        Snd.star();
        toast('+1');
        if (stars === 8 && !cheered) {
          cheered = true;
          $('cheer').classList.add('show');
          Snd.yay();
          setTimeout(() => $('cheer').classList.remove('show'), 1600);
        }
      }
    }
  }
  for (const c of conePool) {
    const dx = car.x - c.x, dz = car.z - c.z;
    if (!c.booped && dx * dx + dz * dz < 1.25 * 1.25 && car.y < groundY(c.z) + 1.6) {
      c.booped = true;
      boops++;
      c.squash = 0.35;
      if (car.onGround) { car.onGround = false; car.vy = 5.2; }
      car.squash = 1.3;
      toast('Oj!');
      Snd.boop();
    }
    const goal = c.booped ? 0.35 : 1;
    c.squash += (goal - c.squash) * (1 - Math.exp(-dt * 10));
    c.mesh.scale.y = c.squash;
    c.mesh.position.y = groundY(c.z) + 0.42 * c.squash;
  }
  if (car.onGround && Math.random() < dt * 18) puff();
  for (const p of dust) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) p.mesh.visible = false;
  }
  recycleWorld();
}

function puff() {
  const p = dust.find((d) => d.life <= 0);
  if (!p) return;
  p.life = 0.45;
  p.vx = (Math.random() - 0.5) * 0.8;
  p.vy = 0.4;
  p.vz = -1.2;
  p.mesh.visible = true;
  p.mesh.position.set(car.x + (Math.random() - 0.5), car.y + 0.2, car.z - 1.4);
  p.mesh.material.opacity = 0.45;
}

const camPos = new THREE.Vector3(0, 4.2, -7.4);
const look = new THREE.Vector3();
const camDesired = new THREE.Vector3();
function snapCamera() {
  camPos.set(car.x * 0.72, car.y + 3.15, car.z - 7.4);
  camera.position.copy(camPos);
  look.set(car.x * 0.35, car.y + 1.05, car.z + 6.5);
  camera.lookAt(look);
}
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 4.5);
  camDesired.set(car.x * 0.72 - car.steer * 0.55, car.y + 3.15, car.z - 7.4);
  camPos.lerp(camDesired, k);
  camera.position.copy(camPos);
  look.set(car.x * 0.35, car.y + 1.05, car.z + 6.5);
  camera.lookAt(look);
  sun.position.set(car.x - 5, car.y + 14, car.z - 6);
  sun.target.position.set(car.x, car.y + 1, car.z + 8);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (state === 'play') step(dt);
  else {
    car.bob += dt;
    car.squash += (1 - car.squash) * (1 - Math.exp(-dt * 8));
  }
  placeCar(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function setPlayChrome(on) {
  $('controls').classList.toggle('hidden', !on);
  $('menuBtn').classList.toggle('hidden', !on);
  $('starHud').classList.toggle('hidden', !on);
  $('muteBtn').classList.toggle('hidden', !on);
  $('calBtn').classList.toggle('hidden', !on);
  if (!on) $('tiltPill').classList.add('hidden');
}

async function startGame() {
  if (state === 'play' || state === 'pause' || starting) return;
  starting = true;
  Snd.unlock();
  await requestTilt();
  Snd.resume();
  resetRun();
  snapCamera();
  state = 'play';
  starting = false;
  $('title').classList.add('hidden');
  $('pause').classList.add('hidden');
  setPlayChrome(true);
  showTiltPill();
  savePrefs();
}

function openPause() {
  if (state !== 'play') return;
  state = 'pause';
  holdL = false; holdR = false;
  $('pause').classList.remove('hidden');
  Snd.suspend();
}
function resumeGame() {
  if (state !== 'pause') return;
  Snd.unlock();
  state = 'play';
  $('pause').classList.add('hidden');
}
function toTitle() {
  Snd.engine(false);
  state = 'title';
  holdL = false; holdR = false; keys.clear();
  $('pause').classList.add('hidden');
  $('title').classList.remove('hidden');
  setPlayChrome(false);
  resetRun();
}

function markColor() {
  document.querySelectorAll('[data-color]').forEach((el) => {
    el.setAttribute('aria-pressed', el.dataset.color === colorName ? 'true' : 'false');
  });
  if (paintMat) paintMat.color.setHex(PAINT[colorName]);
}
function chooseColor(name) {
  if (name !== 'red' && name !== 'green') return;
  colorName = name;
  markColor();
  savePrefs();
}

function bindUi() {
  $('startBtn').addEventListener('pointerdown', () => { Snd.unlock(); });
  $('startBtn').addEventListener('click', () => { startGame(); });
  $('colorRed').addEventListener('click', () => chooseColor('red'));
  $('colorGreen').addEventListener('click', () => chooseColor('green'));
  $('menuBtn').addEventListener('click', () => openPause());
  $('resumeBtn').addEventListener('click', () => resumeGame());
  $('homeBtn').addEventListener('click', () => toTitle());
  $('pauseCal').addEventListener('click', () => calibrate());
  $('calBtn').addEventListener('click', () => calibrate());
  $('pauseColor').addEventListener('click', () => chooseColor(colorName === 'red' ? 'green' : 'red'));
  const flipMute = () => { Snd.unlock(); Snd.setMuted(!Snd.muted); savePrefs(); };
  $('muteBtn').addEventListener('click', flipMute);
  $('pauseMute').addEventListener('click', flipMute);
  holdButton($('steerLeft'), () => { holdL = true; }, () => { holdL = false; });
  holdButton($('steerRight'), () => { holdR = true; }, () => { holdR = false; });
  $('jumpBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Snd.resume();
    jumpQueued = true;
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    if (e.code === 'Space') { Snd.resume(); jumpQueued = true; }
    if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'play') openPause();
    if (e.code === 'Enter' && state === 'title') startGame();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { holdL = false; holdR = false; keys.clear(); });
}

function holdButton(el, down, up) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Snd.resume();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    down();
  });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

const api = {
  get ready() { return ready; },
  get state() { return state; },
  get color() { return colorName; },
  get stars() { return stars; },
  get boops() { return boops; },
  get rampHops() { return rampHops; },
  get x() { return car.x; },
  get y() { return car.y; },
  get z() { return car.z; },
  get steer() { return car.steer; },
  get tiltSteer() { return tilt.target; },
  get tiltStatus() { return tilt.status; },
  get tiltRaw() { return tilt.raw; },
  get tiltZero() { return tilt.zero; },
  get screenAngle() { return currentScreenAngle(); },
  get airborne() { return !car.onGround; },
  get prefKey() { return PREF_KEY; },
  setScreenAngle(angle) {
    if (forcedAngle !== angle) tilt.calibrated = false;
    forcedAngle = angle;
  },
  clearScreenAngle() { forcedAngle = null; },
  applyOrientation,
  calibrate,
};
window.__sr3d = api;

boot();
