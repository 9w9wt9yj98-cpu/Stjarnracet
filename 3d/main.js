import * as THREE from './vendor/three.module.min.js?v=3';
import {
  TILT_DEAD_DEG, TILT_SPAN_DEG,
  orientationToScreenAngle, tiltRightDownDegrees, steerFromTiltDegrees,
} from './tilt.js?v=3';

const BUILD = '3d-v3';
const PREF_KEY = 'sr3d_prefs';
const GRAV = 28;
const PAINT = { red: 0xef3d3d, green: 0x2fbe4a };
const BASE_SPEED = 16;
const WORLD_R = 62;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const Snd = {
  ac: null, master: null, eng: null, engGain: null, screech: null, muted: false,
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ac) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
      const ac = this.ac = new AC();
      this.master = ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(ac.destination);
      this.makeScreech();
    }
    this.ac.resume();
    this.engine(true);
  },
  makeScreech() {
    const ac = this.ac;
    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 880;
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.screech = g;
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
    o.frequency.value = 78;
    f.type = 'lowpass';
    f.frequency.value = 280;
    g.gain.value = 0.04;
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
  jump() { this.tone(420, 0.18, 'sine', 0.12); },
  boop() { this.tone(300, 0.1, 'triangle', 0.07); },
  slide() { this.tone(520, 0.14, 'square', 0.05); this.tone(780, 0.18, 'triangle', 0.06); },
  boost() { this.tone(440, 0.08, 'sawtooth', 0.05); this.tone(660, 0.16, 'triangle', 0.1); this.tone(990, 0.22, 'sine', 0.08); },
  yay() {
    this.tone(523, 0.12, 'triangle', 0.12);
    setTimeout(() => this.tone(659, 0.12, 'triangle', 0.12), 110);
    setTimeout(() => this.tone(784, 0.2, 'triangle', 0.12), 220);
  },
  setSlide(amount) { if (this.screech) this.screech.gain.value = this.muted ? 0 : amount * 0.055; },
  setSpeed(speed, boost) {
    if (!this.eng) return;
    this.eng.frequency.value = 70 + speed * 2.1 + boost * 46;
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
let invertSteer = false;
let state = 'title';
let stars = 0;
let cheered = false;
let holdL = false;
let holdR = false;
let holdSlide = false;
let jumpQueued = false;
let rampHops = 0;
let boops = 0;
const keys = new Set();
let forcedAngle = null;
let starting = false;
const frameDts = [];

const tilt = {
  status: 'unknown', beta: 0, gamma: 0, hasSample: false,
  zero: 0, zeroAngle: null, calibrated: false, raw: 0, target: 0,
};

const car = {
  x: 0, y: 0, z: 4, yaw: 0, vx: 0, vz: BASE_SPEED, vy: 0,
  steer: 0, drift: 0, slip: 0, speed: BASE_SPEED,
  onGround: true, squash: 1, bob: 0,
  driftTime: 0, praised: false, boosted: false, boostT: 0, boost: 0,
  sliding: false,
};

function loopPoint(t) {
  const a = t * Math.PI * 2;
  return {
    x: Math.sin(a) * 46 + Math.sin(a * 2) * 6,
    z: Math.cos(a) * 32,
  };
}
const LOOP_N = 80;
const loopPts = Array.from({ length: LOOP_N }, (_, i) => loopPoint(i / LOOP_N));
function distToLoop(x, z) {
  let best = 1e9;
  for (let i = 0; i < LOOP_N; i++) {
    const a = loopPts[i];
    const b = loopPts[(i + 1) % LOOP_N];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function loopPose(t) {
  const p = loopPoint(t);
  const q = loopPoint(t + 0.012);
  return { x: p.x, z: p.z, yaw: Math.atan2(q.x - p.x, q.z - p.z) };
}
function terrainY(x, z) {
  const r = Math.hypot(x, z);
  const edge = Math.max(0, r - 54);
  const wave = Math.sin(x * 0.045) * Math.cos(z * 0.05) * 0.55;
  return wave * clamp(r / 40, 0, 1) + edge * edge * 0.015;
}

const rampDefs = [
  { t: 0.22, len: 14, h: 3.6, halfW: 5.4 },
  { t: 0.68, len: 12, h: 2.8, halfW: 5.2 },
].map((d) => Object.assign(d, loopPose(d.t)));

function rampHeight(x, z) {
  let extra = 0;
  let hit = null;
  for (const r of rampDefs) {
    const dx = x - r.x;
    const dz = z - r.z;
    const fwd = dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
    const side = dx * Math.cos(r.yaw) - dz * Math.sin(r.yaw);
    if (fwd > 0 && fwd < r.len && Math.abs(side) < r.halfW) {
      const h = (fwd / r.len) * r.h;
      if (h > extra) { extra = h; hit = r; }
    }
  }
  return { extra, hit };
}
function surfaceY(x, z) {
  return terrainY(x, z) + rampHeight(x, z).extra;
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.color === 'green' || p.color === 'red') colorName = p.color;
    if (typeof p.muted === 'boolean') Snd.muted = p.muted;
    if (typeof p.invertSteer === 'boolean') invertSteer = p.invertSteer;
  } catch (e) { /* keep defaults */ }
}
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ color: colorName, muted: !!Snd.muted, invertSteer: !!invertSteer }));
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
  if (!tilt.hasSample || tilt.status !== 'granted') { tilt.target = 0; return; }
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
  return Math.abs(beta) > 0.8 || Math.abs(gamma) > 0.8;
}
function applyOrientation(event) {
  if (!event || (!Number.isFinite(event.beta) && !Number.isFinite(event.gamma))) return;
  tilt.beta = Number.isFinite(event.beta) ? event.beta : 0;
  tilt.gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  tilt.hasSample = true;
  if (tilt.status === 'denied') { tilt.target = 0; return; }
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
  if (!DOE) { tilt.status = 'unavailable'; showTiltPill(); return; }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      tilt.status = res === 'granted' ? 'granted' : 'denied';
    } catch (e) { tilt.status = 'denied'; }
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
  if (tilt.status === 'granted') { el.textContent = 'Lutning på'; el.classList.add('ok'); }
  else if (tilt.status === 'denied') { el.textContent = 'Ingen lutning — styr med pilarna'; el.classList.add('warn'); }
  else { el.textContent = 'Lutning saknas — styr med pilarna'; el.classList.add('warn'); }
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
let carGroup, wheelSpins = [], frontWheels = [], flames = [];
let shadowMesh;
const starPool = [];
const conePool = [];
const smoke = [];
const sparks = [];
const skidL = [];
const skidR = [];
let skidGeoL, skidGeoR, skidMeshL, skidMeshR;
let ready = false;
const SKID_MAX = 100;

const starSpots = [{ x: 0, z: 16 }];
for (let i = 0; i < 10; i++) starSpots.push(loopPoint((i + 0.15) / 10));
for (let i = 0; i < 4; i++) {
  const a = i / 4 * Math.PI * 2 + 0.7;
  starSpots.push({ x: Math.cos(a) * 9, z: Math.sin(a) * 9 });
}

function boot() {
  loadPrefs();
  Snd.setMuted(Snd.muted);
  markColor();
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch (e) { showFail(); return; }
  if (!renderer.getContext()) { showFail(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('stage').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x79c8ff);
  scene.fog = new THREE.Fog(0xb7e4ff, 48, 118);
  camera = new THREE.PerspectiveCamera(64, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 280);

  scene.add(new THREE.HemisphereLight(0xcfefff, 0x6fbf55, 1.15));
  sun = new THREE.DirectionalLight(0xfff3c4, 1.65);
  sun.position.set(-12, 22, 8);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffc2ea, 0.38);
  fill.position.set(16, 8, -10);
  scene.add(fill);
  buildSky();

  paintMat = new THREE.MeshToonMaterial({ color: PAINT[colorName], emissive: 0x331100, emissiveIntensity: 0 });
  buildCar();
  shadowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 18),
    new THREE.MeshBasicMaterial({ color: 0x16321a, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  scene.add(shadowMesh);

  buildGround();
  buildRoadDressing();
  buildRamps();
  buildScenery();
  for (let i = 0; i < starSpots.length; i++) starPool.push(makeStar(i));
  buildCones();
  buildSkids();
  buildPuffs();

  resetRun();
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  $('rotateHint').classList.toggle('hidden', !(h > w * 1.05));
}

function buildSky() {
  const geo = new THREE.SphereGeometry(200, 24, 14);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 200;
    const t = clamp((y + 0.15) / 1.05, 0, 1);
    col[i * 3] = 0.35 + (1 - t) * 0.65;
    col[i * 3 + 1] = 0.62 + (1 - t) * 0.28;
    col[i * 3 + 2] = 0.98 - t * 0.05;
    if (t < 0.22) {
      col[i * 3] = 1;
      col[i * 3 + 1] = 0.78 + t;
      col[i * 3 + 2] = 0.45;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffe56a, fog: false }));
  sunBall.position.set(28, 42, -20);
  scene.add(sunBall);
  const puff = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + k * 0.4, 8, 6), puff);
      s.position.set(k * 2.4 - 2, Math.sin(k) * 0.4, 0);
      g.add(s);
    }
    const a = i / 7 * Math.PI * 2;
    g.position.set(Math.cos(a) * 70, 24 + (i % 3) * 3, Math.sin(a) * 50);
    scene.add(g);
  }
}

function buildGround() {
  const seg = 46;
  const size = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainY(x, z);
    pos.setY(i, y);
    const r = Math.hypot(x, z);
    const road = distToLoop(x, z);
    const n = 0.5 + 0.5 * Math.sin(x * 0.35 + z * 0.22);
    let R, G, B;
    if (r < 16.5) {
      R = 0.93; G = 0.78; B = 0.46;
    } else if (road < 5.1) {
      R = 0.82; G = 0.64 + n * 0.04; B = 0.36;
    } else if (road < 6.4) {
      R = 0.55; G = 0.72; B = 0.32;
    } else {
      R = 0.28 + n * 0.08; G = 0.74 + n * 0.12; B = 0.26;
    }
    col[i * 3] = R; col[i * 3 + 1] = G; col[i * 3 + 2] = B;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function buildRoadDressing() {
  const dashGeo = new THREE.BoxGeometry(0.28, 0.05, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 48);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const pose = loopPose(i / 48);
    dummy.position.set(pose.x, terrainY(pose.x, pose.z) + 0.05, pose.z);
    dummy.rotation.set(0, pose.yaw, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  scene.add(dashes);
  const archMat = new THREE.MeshToonMaterial({ color: 0xff5aa5 });
  for (const t of [0.05, 0.48]) {
    const pose = loopPose(t);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.28, 8, 18, Math.PI), archMat);
    arch.position.set(pose.x, terrainY(pose.x, pose.z) + 3.2, pose.z);
    arch.rotation.y = pose.yaw;
    scene.add(arch);
  }
}

function buildRamps() {
  for (const r of rampDefs) {
    const geo = new THREE.BufferGeometry();
    const hw = r.halfW;
    const L = r.len;
    const h = r.h;
    const pts = new Float32Array([
      -hw, 0, 0, hw, 0, 0, hw, 0, L, -hw, 0, L,
      -hw, 0.12, 0, hw, 0.12, 0, hw, h, L, -hw, h, L,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setIndex([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xffc857 }));
    mesh.position.set(r.x, terrainY(r.x, r.z), r.z);
    mesh.rotation.y = r.yaw;
    scene.add(mesh);
  }
}

function buildScenery() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.3, 6);
  trunk.translate(0, 0.65, 0);
  const leaf = new THREE.ConeGeometry(1.25, 2.3, 7);
  leaf.translate(0, 2.2, 0);
  const trees = new THREE.InstancedMesh(trunk, new THREE.MeshToonMaterial({ color: 0x8a5a32 }), 42);
  const tops = new THREE.InstancedMesh(leaf, new THREE.MeshToonMaterial({ color: 0x37b84a }), 42);
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshToonMaterial({ color: 0xff77c0 }), 36);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshToonMaterial({ color: 0xb9c4ce }), 14);
  const dummy = new THREE.Object3D();
  let ti = 0, fi = 0, ri = 0;
  for (let i = 0; i < 90 && (ti < 42 || fi < 36 || ri < 14); i++) {
    const a = i * 2.399;
    const rad = 20 + (i % 9) * 4.2;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad * 0.86;
    const road = distToLoop(x, z);
    const plaza = Math.hypot(x, z) < 18;
    if (plaza || road < 8) continue;
    dummy.position.set(x, terrainY(x, z), z);
    dummy.rotation.set(0, a, 0);
    dummy.scale.setScalar(0.85 + (i % 5) * 0.12);
    dummy.updateMatrix();
    if (ti < 42 && i % 2 === 0) {
      trees.setMatrixAt(ti, dummy.matrix);
      tops.setMatrixAt(ti, dummy.matrix);
      ti++;
    } else if (fi < 36) {
      dummy.position.y += 0.15;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      flowers.setMatrixAt(fi++, dummy.matrix);
    } else if (ri < 14) {
      dummy.scale.setScalar(0.8 + (i % 3) * 0.3);
      dummy.updateMatrix();
      rocks.setMatrixAt(ri++, dummy.matrix);
    }
  }
  trees.count = ti; tops.count = ti; flowers.count = fi; rocks.count = ri;
  scene.add(trees, tops, flowers, rocks);
}

function starGeometry(scale) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0 ? 1 : 0.42) * scale;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: scale * 0.42, bevelEnabled: true, bevelThickness: scale * 0.08, bevelSize: scale * 0.05, bevelSegments: 1,
  });
  geo.center();
  return geo;
}
const sharedStar = starGeometry(0.5);
function makeStar(i) {
  const mesh = new THREE.Mesh(sharedStar, new THREE.MeshToonMaterial({ color: 0xffd23b }));
  scene.add(mesh);
  const item = { i, mesh, x: 0, z: 0, y: 0, got: false, back: 0 };
  placeStar(item, starSpots[i]);
  return item;
}
function placeStar(item, spec) {
  item.x = spec.x;
  item.z = spec.z;
  item.y = surfaceY(spec.x, spec.z) + 1.45;
  item.got = false;
  item.back = 0;
  item.mesh.visible = true;
  item.mesh.position.set(item.x, item.y, item.z);
}

function buildCones() {
  const spots = [
    { x: 12, z: 2 }, { x: -12, z: 2 }, { x: 8, z: -10 }, { x: -8, z: -10 },
    { x: 20, z: 18 }, { x: -18, z: 22 },
  ];
  for (let i = 0; i < spots.length; i++) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 8), new THREE.MeshToonMaterial({ color: 0xff8a1e }));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.1, 8), new THREE.MeshToonMaterial({ color: 0xf7f7f7 }));
    base.position.y = -0.4;
    const g = new THREE.Group();
    g.add(mesh, base);
    scene.add(g);
    const item = { i, mesh: g, x: spots[i].x, z: spots[i].z, booped: false, squash: 1, back: 0 };
    sitCone(item);
    conePool.push(item);
  }
}
function sitCone(c) {
  c.mesh.position.set(c.x, surfaceY(c.x, c.z) + 0.42 * c.squash, c.z);
  c.mesh.scale.y = c.squash;
}

function buildSkids() {
  skidGeoL = skidGeometry();
  skidGeoR = skidGeometry();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1c1814, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });
  skidMeshL = new THREE.Mesh(skidGeoL, mat);
  skidMeshR = new THREE.Mesh(skidGeoR, mat.clone());
  skidMeshL.renderOrder = 2;
  skidMeshR.renderOrder = 2;
  scene.add(skidMeshL, skidMeshR);
}
function skidGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SKID_MAX * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < SKID_MAX - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  return geo;
}
function wheelWorld(lx, lz) {
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  return { x: car.x + rx * lx + fx * lz, z: car.z + rz * lx + fz * lz };
}
function pushSkid() {
  const L = wheelWorld(-0.72, -1.15);
  const R = wheelWorld(0.72, -1.15);
  skidL.push(L);
  skidR.push(R);
  if (skidL.length > SKID_MAX) { skidL.shift(); skidR.shift(); }
}
function writeStrip(arr, geo) {
  const pos = geo.attributes.position.array;
  const n = arr.length;
  const w = 0.48;
  for (let i = 0; i < SKID_MAX; i++) {
    const p = arr[Math.min(i, Math.max(0, n - 1))] || { x: 0, z: 0 };
    const q = arr[Math.min(Math.max(i + 1, 0), Math.max(0, n - 1))] || p;
    let dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const px = -dz * w, pz = dx * w;
    const y = terrainY(p.x, p.z) + 0.12;
    const o = i * 6;
    pos[o] = p.x + px; pos[o + 1] = y; pos[o + 2] = p.z + pz;
    pos[o + 3] = p.x - px; pos[o + 4] = y; pos[o + 5] = p.z - pz;
  }
  geo.attributes.position.needsUpdate = true;
  geo.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
  geo.computeBoundingSphere();
}

function buildPuffs() {
  for (let i = 0; i < 32; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0, depthWrite: false })
    );
    m.visible = false;
    scene.add(m);
    smoke.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0, depthWrite: false })
    );
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
function spawnPuff(pool, lx, color, life, up) {
  const p = pool.find((d) => d.life <= 0);
  if (!p) return;
  const w = wheelWorld(lx, -1.2);
  p.life = life;
  p.vx = (Math.random() - 0.5) * 1.4 - Math.sin(car.yaw) * 0.4;
  p.vy = up;
  p.vz = (Math.random() - 0.5) * 1.4 - Math.cos(car.yaw) * 0.4;
  p.mesh.visible = true;
  p.mesh.position.set(w.x, car.y + 0.25, w.z);
  p.mesh.material.color.setHex(color);
  p.mesh.material.opacity = 0.75;
}
function stepPuffs(dt) {
  for (const p of smoke.concat(sparks)) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy += dt * 0.6;
    p.mesh.material.opacity = Math.max(0, p.life * 1.4);
    const s = p.life * 1.6;
    p.mesh.scale.setScalar(Math.max(0.2, s));
    if (p.life <= 0) p.mesh.visible = false;
  }
}
function liveCount(pool) { return pool.reduce((n, p) => n + (p.life > 0 ? 1 : 0), 0); }

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
  carGroup.add(body, cabin, windowRear);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.rotation.y = Math.PI;
  smile.position.set(0, 0.98, -1.06);
  carGroup.add(smile);
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
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.08), lamp);
    h.position.set(sx, 0.7, 1.74);
    carGroup.add(t, h);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.95 });
  for (const sx of [-0.38, 0.38]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), flameMat);
    f.rotation.x = Math.PI / 2;
    f.position.set(sx, 0.48, -1.9);
    f.visible = false;
    carGroup.add(f);
    flames.push(f);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const spots = [
    { x: -0.92, z: 1.05, front: true }, { x: 0.92, z: 1.05, front: true },
    { x: -0.92, z: -1.05, front: false }, { x: 0.92, z: -1.05, front: false },
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

function resetRun() {
  car.x = 0; car.z = 4; car.yaw = 0; car.vx = 0; car.vz = BASE_SPEED; car.vy = 0;
  car.steer = 0; car.drift = 0; car.slip = 0; car.speed = BASE_SPEED;
  car.onGround = true; car.squash = 1;
  car.y = surfaceY(0, 4);
  car.driftTime = 0; car.praised = false; car.boosted = false; car.boostT = 0; car.boost = 0; car.sliding = false;
  setStars(0); boops = 0; rampHops = 0; cheered = false;
  jumpQueued = false; holdL = false; holdR = false; holdSlide = false;
  skidL.length = 0; skidR.length = 0;
  if (skidGeoL) { writeStrip(skidL, skidGeoL); writeStrip(skidR, skidGeoR); }
  for (let i = 0; i < starPool.length; i++) placeStar(starPool[i], starSpots[i]);
  for (const c of conePool) { c.booped = false; c.squash = 1; c.back = 0; sitCone(c); }
  $('cheer').classList.remove('show');
  $('speedLines').classList.add('hidden');
  $('slideBtn').classList.remove('on');
}

function placeCar(dt) {
  const squash = car.squash;
  carGroup.position.set(car.x, car.y, car.z);
  carGroup.rotation.set(car.onGround ? 0 : clamp(-car.vy * 0.012, -0.35, 0.35), car.yaw, -car.steer * 0.14 - car.slip * 0.18);
  carGroup.scale.set(1 + (squash - 1) * 0.3, 1 - (squash - 1) * 0.4, 1 + (squash - 1) * 0.15);
  for (const w of frontWheels) w.rotation.y = -car.steer * 0.55;
  const spin = car.speed * dt / 0.36;
  for (const s of wheelSpins) s.rotation.x -= state === 'play' ? spin : dt * 2;
  const gy = surfaceY(car.x, car.z);
  shadowMesh.position.set(car.x, gy + 0.05, car.z);
  const air = clamp(car.y - gy, 0, 8);
  shadowMesh.scale.setScalar(clamp(1.15 - air * 0.08, 0.4, 1.3));
  shadowMesh.material.opacity = clamp(0.3 - air * 0.03, 0.05, 0.3);
  const flameOn = state === 'play' && car.boost > 0.12 && car.onGround;
  for (const f of flames) {
    f.visible = flameOn;
    f.scale.set(1, 0.7 + Math.random() * car.boost * 1.4, 1);
  }
  if (paintMat) paintMat.emissiveIntensity = car.boost * 0.35;
}

let smokeTick = 0;
function step(dt) {
  updateTiltSteer();
  const buttons = (holdR ? 1 : 0) - (holdL ? 1 : 0);
  const key = ((keys.has('ArrowRight') || keys.has('KeyD')) ? 1 : 0) - ((keys.has('ArrowLeft') || keys.has('KeyA')) ? 1 : 0);
  const tiltPart = (tilt.status === 'granted' ? tilt.target : 0) * (invertSteer ? -1 : 1);
  const steerTarget = clamp(tiltPart + buttons + key, -1, 1);
  car.steer += (steerTarget - car.steer) * (1 - Math.exp(-dt * 10));
  const slideHeld = holdSlide || keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyF');
  const wantDrift = slideHeld || Math.abs(car.steer) > 0.74;
  car.drift += ((wantDrift ? 1 : 0) - car.drift) * (1 - Math.exp(-dt * 8));
  $('slideBtn').classList.toggle('on', slideHeld);

  const yawRate = car.steer * (1.45 + car.drift * 2.15);
  // Positive steer is right. The chase camera looks along +Z, and Three.js
  // lookAt puts screen-right on world -X, so a right turn decreases yaw.
  car.yaw = wrap(car.yaw - yawRate * dt);
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  let grip = 0.85 + (1 - car.drift) * 7.2;
  if (Math.abs(car.slip) > 1.2) grip += 5;
  const cruise = BASE_SPEED + car.boost * 11 + (car.onGround ? 0 : 1);
  const k = 1 - Math.exp(-dt * grip);
  car.vx += (fx * cruise - car.vx) * k;
  car.vz += (fz * cruise - car.vz) * k;
  const side = car.steer * car.drift * 10 * dt;
  car.vx += Math.cos(car.yaw) * side;
  car.vz += -Math.sin(car.yaw) * side;
  const mag = Math.hypot(car.vx, car.vz) || 1;
  car.speed = clamp(cruise, 12, 30);
  car.vx = car.vx / mag * car.speed;
  car.vz = car.vz / mag * car.speed;
  const prev = rampHeight(car.x, car.z).hit;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const rad = Math.hypot(car.x, car.z);
  if (rad > WORLD_R) {
    const push = (rad - WORLD_R) * 14;
    car.vx -= (car.x / rad) * push * dt;
    car.vz -= (car.z / rad) * push * dt;
    const keep = WORLD_R + 0.2;
    car.x *= keep / rad;
    car.z *= keep / rad;
  }
  const velYaw = Math.atan2(car.vx, car.vz);
  car.slip = wrap(car.yaw - velYaw);
  const ground = surfaceY(car.x, car.z);
  const nowRamp = rampHeight(car.x, car.z).hit;
  if (car.onGround) {
    if (prev && !nowRamp) {
      car.onGround = false;
      car.vy = 8 + prev.h * 1.7;
      rampHops++;
      toast('Hoppsan!');
      Snd.jump();
    } else if (jumpQueued) {
      car.onGround = false;
      car.vy = 11.5;
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
      car.squash = 1.4;
    }
  }
  jumpQueued = false;
  car.squash += (1 - car.squash) * (1 - Math.exp(-dt * 8));
  car.bob += dt;
  car.sliding = car.onGround && Math.abs(car.slip) > 0.34 && car.speed > 10 && car.drift > 0.45;
  if (car.sliding) {
    car.driftTime += dt;
    if (!car.praised && car.driftTime > 0.28) { car.praised = true; toast('Sladd!'); Snd.slide(); }
    if (!car.boosted && car.driftTime > 0.62) {
      car.boosted = true;
      car.boostT = Math.max(car.boostT, 1.7);
      toast('Turbo!');
      Snd.boost();
    }
    pushSkid();
    smokeTick += dt;
    if (smokeTick > 0.04) {
      smokeTick = 0;
      spawnPuff(smoke, -0.72, 0xf4f4f4, 0.55, 1.4);
      spawnPuff(smoke, 0.72, 0xe8e8e8, 0.55, 1.4);
      if (Math.abs(car.slip) > 0.5) spawnPuff(sparks, car.steer > 0 ? 0.8 : -0.8, 0xffe14a, 0.28, 1.8);
    }
  } else if (car.driftTime > 0) {
    car.driftTime = Math.max(0, car.driftTime - dt * 1.4);
    if (car.driftTime === 0) { car.praised = false; car.boosted = false; }
  }
  car.boostT = Math.max(0, car.boostT - dt);
  car.boost = clamp(car.boostT / 1.7, 0, 1);
  $('speedLines').classList.toggle('hidden', car.boost < 0.2);
  Snd.setSlide(car.sliding ? clamp(Math.abs(car.slip), 0, 1) : 0);
  Snd.setSpeed(car.speed, car.boost);
  writeStrip(skidL, skidGeoL);
  writeStrip(skidR, skidGeoR);
  if (skidL.length > SKID_MAX - 2 && !car.sliding) { skidL.shift(); skidR.shift(); }

  for (const s of starPool) {
    if (!s.got) {
      s.mesh.rotation.y += dt * 2;
      s.mesh.position.y = s.y + Math.sin(car.bob * 3 + s.i) * 0.15;
      const dx = car.x - s.x, dz = car.z - s.z;
      if (dx * dx + dz * dz < 2.3 * 2.3) {
        s.got = true;
        s.back = 8;
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
    } else {
      s.back -= dt;
      if (s.back <= 0) placeStar(s, starSpots[s.i]);
    }
  }
  for (const c of conePool) {
    if (c.booped) {
      c.back -= dt;
      if (c.back <= 0) { c.booped = false; c.squash = 1; }
    } else {
      const dx = car.x - c.x, dz = car.z - c.z;
      if (dx * dx + dz * dz < 1.35 * 1.35 && car.y < surfaceY(c.x, c.z) + 1.7) {
        c.booped = true;
        c.back = 1.2;
        c.squash = 0.35;
        boops++;
        if (car.onGround) { car.onGround = false; car.vy = 5.4; }
        car.squash = 1.25;
        toast('Oj!');
        Snd.boop();
      }
    }
    const goal = c.booped ? 0.35 : 1;
    c.squash += (goal - c.squash) * (1 - Math.exp(-dt * 10));
    sitCone(c);
  }
  stepPuffs(dt);
}

const camPos = new THREE.Vector3();
const look = new THREE.Vector3();
const camDesired = new THREE.Vector3();
function snapCamera() {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  camPos.set(car.x - fx * 7.8, car.y + 3.4, car.z - fz * 7.8);
  camera.position.copy(camPos);
  camera.fov = 64;
  camera.lookAt(car.x + fx * 5, car.y + 1.1, car.z + fz * 5);
}
function updateCamera(dt) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  const back = 7.5 - car.boost * 0.4;
  const shake = (Math.abs(car.slip) * 0.05 + car.boost * 0.04) * (car.onGround ? 1 : 0.2);
  camDesired.set(
    car.x - fx * back + rx * car.slip * 0.7 + (Math.random() - 0.5) * shake,
    car.y + 3.25 + car.boost * 0.25 + (Math.random() - 0.5) * shake * 0.5,
    car.z - fz * back + rz * car.slip * 0.7
  );
  const k = 1 - Math.exp(-dt * 4.2);
  camPos.lerp(camDesired, state === 'play' ? k : 1);
  camera.position.copy(camPos);
  look.set(car.x + fx * 5.5, car.y + 1.05, car.z + fz * 5.5);
  camera.lookAt(look);
  const wantFov = 63 + car.boost * 12 + Math.min(7, Math.abs(car.slip) * 6);
  camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
  sun.position.set(car.x - 14, car.y + 24, car.z + 10);
  sun.target.position.set(car.x, car.y, car.z);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  const raw = (now - last) / 1000;
  last = now;
  frameDts.push(raw);
  if (frameDts.length > 45) frameDts.shift();
  const dt = Math.min(0.05, raw);
  if (state === 'play') step(dt);
  else {
    car.bob += dt;
    car.squash += (1 - car.squash) * (1 - Math.exp(-dt * 8));
    Snd.setSlide(0);
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
  if (!on) {
    $('tiltPill').classList.add('hidden');
    $('speedLines').classList.add('hidden');
  }
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
  holdL = false; holdR = false; holdSlide = false;
  $('slideBtn').classList.remove('on');
  $('pause').classList.remove('hidden');
  $('speedLines').classList.add('hidden');
  Snd.setSlide(0);
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
  Snd.setSlide(0);
  state = 'title';
  holdL = false; holdR = false; holdSlide = false; keys.clear();
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
function markInvert() {
  const el = $('pauseInvert');
  if (el) el.setAttribute('aria-pressed', invertSteer ? 'true' : 'false');
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
  $('pauseInvert').addEventListener('click', () => {
    invertSteer = !invertSteer;
    markInvert();
    savePrefs();
  });
  markInvert();
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  $('pauseColor').addEventListener('click', () => chooseColor(colorName === 'red' ? 'green' : 'red'));
  const flipMute = () => { Snd.unlock(); Snd.setMuted(!Snd.muted); savePrefs(); };
  $('muteBtn').addEventListener('click', flipMute);
  $('pauseMute').addEventListener('click', flipMute);
  holdButton($('steerLeft'), () => { holdL = true; }, () => { holdL = false; });
  holdButton($('steerRight'), () => { holdR = true; }, () => { holdR = false; });
  holdButton($('slideBtn'), () => { holdSlide = true; }, () => { holdSlide = false; });
  guardHold($('jumpBtn'));
  $('jumpBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Snd.resume();
    jumpQueued = true;
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') { Snd.resume(); jumpQueued = true; }
    if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'play') openPause();
    if (e.code === 'Enter' && state === 'title') startGame();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { holdL = false; holdR = false; holdSlide = false; keys.clear(); });
}
function guardHold(el) {
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function holdButton(el, down, up) {
  guardHold(el);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Snd.resume();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    down();
  });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

window.__sr3d = {
  get ready() { return ready; },
  get build() { return BUILD; },
  get invertSteer() { return invertSteer; },
  get state() { return state; },
  get color() { return colorName; },
  get stars() { return stars; },
  get boops() { return boops; },
  get rampHops() { return rampHops; },
  get x() { return car.x; },
  get y() { return car.y; },
  get z() { return car.z; },
  get yaw() { return car.yaw; },
  get camRight() {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    return { x: e[0], y: e[1], z: e[2] };
  },
  get aimScreen() {
    carGroup.updateMatrixWorld();
    const nose = new THREE.Vector3(0, 0.9, 1.8).applyMatrix4(carGroup.matrixWorld).project(camera);
    const tail = new THREE.Vector3(0, 0.9, -1.7).applyMatrix4(carGroup.matrixWorld).project(camera);
    return nose.x - tail.x;
  },
  get velYaw() { return Math.atan2(car.vx, car.vz); },
  get slip() { return car.slip; },
  get speed() { return car.speed; },
  get drifting() { return car.sliding; },
  get drift() { return car.drift; },
  get boost() { return car.boost; },
  get steer() { return car.steer; },
  get tiltSteer() { return tilt.target; },
  get tiltStatus() { return tilt.status; },
  get tiltRaw() { return tilt.raw; },
  get tiltZero() { return tilt.zero; },
  get screenAngle() { return currentScreenAngle(); },
  get airborne() { return !car.onGround; },
  get prefKey() { return PREF_KEY; },
  get skids() { return skidL.length; },
  get smoke() { return liveCount(smoke); },
  get sparks() { return liveCount(sparks); },
  get fps() {
    if (frameDts.length < 5) return 0;
    const avg = frameDts.reduce((a, b) => a + b, 0) / frameDts.length;
    return avg > 0 ? 1 / avg : 0;
  },
  setScreenAngle(angle) {
    if (forcedAngle !== angle) tilt.calibrated = false;
    forcedAngle = angle;
  },
  clearScreenAngle() { forcedAngle = null; },
  applyOrientation,
  calibrate,
};

boot();
