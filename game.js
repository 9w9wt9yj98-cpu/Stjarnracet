/* Stjärnracet – a tiny side-scroller for small kids. Vanilla JS, no assets. */
(function () {
  'use strict';
  const Art = window.Art;
  const $ = (s) => document.querySelector(s);
  const cvs = $('#game');
  const ctx = cvs.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';

  /* ---------------- tuning ---------------- */
  const GOAL = 100;            // stars per level
  const BASE_SPEED = 230;      // old cruise; auto/gas/turtle are multipliers of this
  const SPEED_SLOW = 0.5;
  const SPEED_AUTO = 0.75;
  const SPEED_GAS = 1.7;
  const SPEED_STEP = 8;        // a little quicker each level, still easy
  const MAX_SPEED = 300;
  /* Jump numbers are tuned so a normal arc passes through the star rows
     (alt ~90–165) and still clears a cone, a rock and the big truck.
     Truck: higher gravity, lower peak, bouncier body, rolls over small obstacles. */
  const PAINTS = [
    { name: 'Röd', body: '#e3141f', light: '#ff6a5c', dark: '#b10c16', rim: '#cfd6dd', mid: '#f0222c' },
    { name: 'Blå', body: '#1a73e8', light: '#9ec4ff', dark: '#0b3c8a', rim: '#ff8a00' },
    { name: 'Grön', body: '#1faa4a', light: '#8cf0a0', dark: '#0c6a30', rim: '#ffe14a' },
    { name: 'Gul', body: '#ffd21f', light: '#fff4a8', dark: '#e09600', rim: '#3a4250' },
    { name: 'Orange', body: '#ff8a1f', light: '#ffc56a', dark: '#c45600', rim: '#ffffff' },
    { name: 'Rosa', body: '#ee5aaa', light: '#ffb6e0', dark: '#a02474', rim: '#fff6b0' },
  ];
  const DEFAULT_COLOR = { car: 0, truck: 1, buggy: 2, rally: 4 };
  const VEHICLES = {
    car: {
      id: 'car', name: 'Bil', jump: 520, jump2: 290, grav: 1060, speed: 1, pitch: 1, scale: 1,
      bounceBase: 1.5, bounceAmp: 1.3, bounceFast: 0.8, freq: 8, roll: false,
      box: { x0: -38, x1: 46, y0: -50, y1: -6 }, star: { x: 6, y: -40, r: 54 }, shadow: 66,
    },
    truck: {
      id: 'truck', name: 'Truck', jump: 500, jump2: 280, grav: 1180, speed: 1, pitch: 0.74, scale: 0.8,
      bounceBase: 8, bounceAmp: 5.5, bounceFast: 2.2, freq: 13, roll: true,
      box: { x0: -40, x1: 46, y0: -102, y1: -42 }, star: { x: 10, y: -74, r: 62 }, shadow: 116,
    },
    buggy: {
      id: 'buggy', name: 'Buggy', jump: 560, jump2: 320, grav: 980, speed: 1, pitch: 0.88, scale: 1,
      bounceBase: 6, bounceAmp: 4.8, bounceFast: 2.2, freq: 11, roll: false,
      box: { x0: -42, x1: 50, y0: -62, y1: -8 }, star: { x: 6, y: -44, r: 56 }, shadow: 84,
    },
    rally: {
      id: 'rally', name: 'Rally', jump: 530, jump2: 300, grav: 1060, speed: 1, pitch: 1.12, scale: 0.92, spark: true,
      bounceBase: 1.2, bounceAmp: 1, bounceFast: 0.5, freq: 10, roll: false,
      box: { x0: -36, x1: 48, y0: -46, y1: -6 }, star: { x: 8, y: -32, r: 52 }, shadow: 70,
    },
  };
  function veh() { return VEHICLES[G.vehicle] || VEHICLES.car; }
  function loadSave() {
    try {
      const g = JSON.parse(localStorage.getItem('sr_garage') || '{}');
      if (VEHICLES[g.vehicle]) G.vehicle = g.vehicle;
      if (g.colors) {
        for (const id in DEFAULT_COLOR) {
          const n = g.colors[id];
          if (typeof n === 'number' && n >= 0 && n < PAINTS.length) G.colors[id] = n;
        }
      }
    } catch (e) { /* keep defaults */ }
    try {
      const p = JSON.parse(localStorage.getItem('sr_progress') || '{}');
      const n = p.done | 0;
      if (n > 0) G.done = Math.min(LEVELS.length, n);
    } catch (e) { /* keep defaults */ }
  }
  function saveGarage() {
    try { localStorage.setItem('sr_garage', JSON.stringify({ vehicle: G.vehicle, colors: G.colors })); } catch (e) { /* ignore */ }
  }
  function saveProgress() {
    try { localStorage.setItem('sr_progress', JSON.stringify({ done: G.done })); } catch (e) { /* ignore */ }
  }
  function paintOf(id) {
    const colors = (G && G.colors) || DEFAULT_COLOR;
    const i = colors[id] == null ? DEFAULT_COLOR[id] || 0 : colors[id];
    return PAINTS[(i % PAINTS.length + PAINTS.length) % PAINTS.length];
  }
  function drawVehicleArt(ctx, id, o) {
    const opt = Object.assign({ palette: paintOf(id) }, o || {});
    if (id === 'truck') Art.drawTruck(ctx, opt);
    else if (id === 'buggy') Art.drawBuggy(ctx, opt);
    else if (id === 'rally') Art.drawRally(ctx, opt);
    else Art.drawCar(ctx, opt);
  }

  const PALETTES = [
    { name: 'Ängen', sky: ['#3fb4ff', '#c4ecff'], sun: '#ffd23b', farFar: '#a9dcf0', far: '#8fd47c', mid: '#5fc24e', midDark: '#47a83b',
      grass: '#55c53f', grassLight: '#8ee36a', grassDark: '#2f8f2a', dirt: '#c98a4b', dirtDark: '#a46a34', leaf: '#4fbf3f', leafDark: '#2f9230', cloud: '#ffffff', theme: '#3fb4ff' },
    { name: 'Solen', sky: ['#ff9d5c', '#ffe7a6'], sun: '#fff2a0', farFar: '#f3c79a', far: '#d9c46a', mid: '#a9c84e', midDark: '#8aae3a',
      grass: '#8ccb3e', grassLight: '#c3e86a', grassDark: '#5c9426', dirt: '#e0b06a', dirtDark: '#c48a40', leaf: '#86c23a', leafDark: '#5e9a25', cloud: '#fff4e0', theme: '#ff9d5c' },
    { name: 'Skogen', sky: ['#8ec8ff', '#d7f0d0'], sun: '#ffe08a', farFar: '#9ec98a', far: '#4f9a48', mid: '#2f7a38', midDark: '#1f5c28',
      grass: '#3e9a40', grassLight: '#7dcc6a', grassDark: '#1f6b28', dirt: '#8d6a45', dirtDark: '#6a4e32', leaf: '#2f8a32', leafDark: '#1c5e22', cloud: '#f4fff0', theme: '#3e9a40' },
    { name: 'Hösten', sky: ['#4ab0ff', '#d6f0ff'], sun: '#ffd23b', farFar: '#b8d8ec', far: '#e8b75a', mid: '#d99a3a', midDark: '#b87a28',
      grass: '#7cc444', grassLight: '#b5e57a', grassDark: '#4f8e2a', dirt: '#c98a4b', dirtDark: '#a46a34', leaf: '#ff9a2e', leafDark: '#e0661a', cloud: '#ffffff', theme: '#ff9a2e' },
    { name: 'Snön', sky: ['#cfe8ff', '#f4fbff'], sun: '#fff6c8', farFar: '#e7f2fb', far: '#d5e6f5', mid: '#b9d4ea', midDark: '#8fb4d4',
      grass: '#f7fbff', grassLight: '#ffffff', grassDark: '#c5d8ea', dirt: '#d5e4f2', dirtDark: '#b7cbe0', leaf: '#eef6ff', leafDark: '#c5d7ea', cloud: '#ffffff', theme: '#d5e6f5' },
    { name: 'Stranden', sky: ['#4ec4ff', '#d8f6ff'], sun: '#ffe14a', farFar: '#9ee0f2', far: '#3ec0c8', mid: '#f2d27a', midDark: '#e0b85a',
      grass: '#f0d48a', grassLight: '#ffe7a8', grassDark: '#e0b25a', dirt: '#e7c07a', dirtDark: '#c9964e', leaf: '#3ec06a', leafDark: '#1f8a48', cloud: '#ffffff', theme: '#4ec4ff' },
    { name: 'Natten', sky: ['#1b2456', '#3a4a88'], sun: '#f4f0c8', moon: true, farFar: '#2a3568', far: '#243058', mid: '#1c3a48', midDark: '#142830',
      grass: '#1e4a38', grassLight: '#2f6a4e', grassDark: '#123224', dirt: '#3a342c', dirtDark: '#241e18', leaf: '#245c40', leafDark: '#163828', cloud: '#d5def0', theme: '#1b2456' },
    { name: 'Godis', sky: ['#ff8ec8', '#ffe0f4'], sun: '#fff0a0', farFar: '#f7b6e4', far: '#c9a0f0', mid: '#7ad0c8', midDark: '#4aa8a4',
      grass: '#7ae07a', grassLight: '#c8f5a0', grassDark: '#3aaa6a', dirt: '#f2b0c8', dirtDark: '#e080a4', leaf: '#ff7ab8', leafDark: '#e04090', cloud: '#fff', theme: '#ff8ec8' },
    { name: 'Bergen', sky: ['#7ec8f0', '#e4f4ff'], sun: '#fff2b0', farFar: '#c5d5e4', far: '#9aa8b8', mid: '#6d8a6a', midDark: '#4e6a50',
      grass: '#6aaa58', grassLight: '#b0d888', grassDark: '#3e7a38', dirt: '#b08968', dirtDark: '#8a684c', leaf: '#5a9450', leafDark: '#3a6834', cloud: '#ffffff', theme: '#7ec8f0' },
    { name: 'Regnbågen', sky: ['#7aa6ff', '#ffd0f0'], sun: '#ffe14a', farFar: '#f7b0e0', far: '#8fd0ff', mid: '#b8e070', midDark: '#70b848',
      grass: '#62d06a', grassLight: '#d0f090', grassDark: '#2f9a48', dirt: '#f0b06a', dirtDark: '#d08040', leaf: '#40c8e0', leafDark: '#2088c0', cloud: '#ffffff', theme: '#7aa6ff' },
  ];
  const LEVELS = PALETTES.map((p, i) => ({ name: p.name, index: i }));
  /* Winding road on the level map, viewBox 800×280. */
  const MAP_PTS = [[70, 210], [150, 120], [230, 70], [320, 150], [400, 210], [490, 110], [570, 60], [650, 140], [730, 200], [760, 90]];

  /* ---------------- layout ---------------- */
  let DPR = 1, S = 1, W = 800, H = 400, GB = 130, portrait = false;
  let skyGrad = null;
  function resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2); // cap for 60fps on phones
    cvs.width = Math.round(cw * DPR); cvs.height = Math.round(ch * DPR);
    cvs.style.width = cw + 'px'; cvs.style.height = ch + 'px';
    S = Math.min(ch / 400, cw / 560);
    W = cw / S; H = ch / S;
    portrait = ch > cw * 1.05;
    const jb = $('#jumpBtn').getBoundingClientRect();
    const btnPx = jb.height > 0 ? (ch - jb.top) : Math.min(124, 0.3 * Math.min(cw, ch)) + 14;
    GB = Math.max(110, (btnPx + 8) / S);
    if (portrait) GB = Math.max(GB, H * 0.36); // portrait: lift the track, dirt area holds the buttons
    skyGrad = null;
    $('#rotateHint').classList.toggle('hidden', !portrait || hintDismissed);
  }
  let hintDismissed = false;

  /* ---------------- audio (WebAudio, no files) ---------------- */
  const Snd = {
    ac: null, out: null, muted: localStorage.getItem('sr_muted') === '1', eng: null, noiseBuf: null, lastHonk: 0,
    unlock() {
      try {
        if (!this.ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
          const ac = this.ac = new AC();
          const comp = ac.createDynamicsCompressor();
          comp.connect(ac.destination);
          this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : 0.9; this.out.connect(comp);
          const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
          const len = ac.sampleRate * 1; this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
          const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          this.startEngine();
        }
        if (this.ac.state !== 'running') this.ac.resume();
      } catch (e) { console.warn('audio', e); }
    },
    setMuted(m) {
      this.muted = m; localStorage.setItem('sr_muted', m ? '1' : '0');
      if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.9, this.ac.currentTime, 0.05);
    },
    tone(f, opt) {
      const ac = this.ac; if (!ac || this.muted) return;
      opt = opt || {};
      const t = ac.currentTime + (opt.at || 0), dur = opt.dur || 0.2, vol = opt.vol || 0.25;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = opt.type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + (opt.slide || dur));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (opt.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(opt) {
      const ac = this.ac; if (!ac || this.muted) return;
      const t = ac.currentTime + (opt.at || 0), dur = opt.dur || 0.2;
      const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
      const f = ac.createBiquadFilter(); f.type = opt.type || 'bandpass'; f.frequency.setValueAtTime(opt.f || 1000, t);
      if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
      f.Q.value = opt.q || 1;
      const g = ac.createGain(); g.gain.setValueAtTime(opt.vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    },
    boing(k) { k = k || 1; this.tone(170 * k, { to: 640 * k, dur: 0.28, slide: 0.16, vol: 0.3 }); this.tone(340 * k, { to: 1000 * k, dur: 0.18, type: 'triangle', vol: 0.08 }); },
    star(n) {
      const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
      const f = 659 * Math.pow(2, sc[(n - 1) % sc.length] / 12);
      this.tone(f, { type: 'triangle', dur: 0.25, vol: 0.18 });
      this.tone(f * 1.5, { type: 'sine', dur: 0.3, vol: 0.12, at: 0.06 });
      this.tone(f * 2, { type: 'sine', dur: 0.35, vol: 0.06, at: 0.1 });
    },
    bump() { this.tone(150, { to: 60, dur: 0.28, vol: 0.35 }); this.noise({ type: 'lowpass', f: 500, dur: 0.12, vol: 0.18 }); this.tone(520, { to: 300, dur: 0.22, type: 'triangle', vol: 0.06, at: 0.08 }); },
    land() { this.tone(110, { to: 70, dur: 0.1, vol: 0.12 }); },
    crunch() {
      this.noise({ type: 'lowpass', f: 1600, to: 140, dur: 0.22, vol: 0.3, q: 0.7 });
      this.tone(160, { to: 55, dur: 0.2, vol: 0.24, type: 'triangle' });
      this.tone(480, { to: 140, dur: 0.09, vol: 0.07, type: 'square' });
    },
    vroom() {
      this.tone(96, { to: 176, dur: 0.18, type: 'triangle', vol: 0.11 });
      this.tone(68, { to: 124, dur: 0.16, type: 'square', vol: 0.04 });
      this.noise({ type: 'lowpass', f: 480, to: 150, dur: 0.16, vol: 0.07, q: 0.6 });
      this.tone(168, { to: 96, dur: 0.07, type: 'square', vol: 0.045, at: 0.09 });
      this.tone(176, { to: 104, dur: 0.06, type: 'square', vol: 0.035, at: 0.17 });
    },
    screech() {
      this.noise({ type: 'bandpass', f: 1700, to: 620, dur: 0.22, q: 3.2, vol: 0.07 });
      this.tone(280, { to: 170, dur: 0.14, type: 'triangle', vol: 0.04 });
    },
    splash() { this.noise({ f: 1800, to: 350, dur: 0.45, q: 0.7, vol: 0.28 }); this.tone(900, { to: 300, dur: 0.15, vol: 0.06, type: 'triangle' }); },
    honk(at, p) {
      if (!this.ac) return; p = p || 1; at = at || 0;
      for (let i = 0; i < 2; i++) {
        this.tone(311 * p, { type: 'square', dur: 0.14, vol: 0.045, at: at + i * 0.2, attack: 0.01 });
        this.tone(392 * p, { type: 'square', dur: 0.14, vol: 0.04, at: at + i * 0.2, attack: 0.01 });
      }
    },
    fanfare() {
      const n = [523, 659, 784, 1047];
      n.forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.22, vol: 0.2, at: i * 0.12 }));
      [523, 659, 784, 1047].forEach((f) => this.tone(f, { type: 'triangle', dur: 1.1, vol: 0.12, at: 0.52, attack: 0.02 }));
      [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, { type: 'sine', dur: 0.2, vol: 0.08, at: 0.7 + i * 0.09 }));
      [1047, 1319, 1568, 2093].forEach((f) => this.tone(f, { type: 'sine', dur: 1.2, vol: 0.05, at: 1.1, attack: 0.02 }));
    },
    go() { [392, 523, 784].forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.18, vol: 0.18, at: i * 0.1 })); },
    yay() { [523, 659, 784].forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.11, vol: 0.2, at: i * 0.06 })); },
    pop() { this.tone(500, { to: 900, dur: 0.1, vol: 0.12, slide: 0.06 }); },
    startEngine() {
      const ac = this.ac;
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator();
      const lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 55; o2.frequency.value = 82;
      lfo.frequency.value = 11; lg.gain.value = 5; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      f.type = 'lowpass'; f.frequency.value = 280; f.Q.value = 2;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.out);
      o1.start(); o2.start(); lfo.start();
      this.eng = { o1, o2, lfo, f, g };
    },
    engine(speed, on, pitch) {
      if (!this.eng) return;
      const t = this.ac.currentTime, e = this.eng, p = pitch || 1;
      e.o1.frequency.setTargetAtTime((38 + speed * 0.11) * p, t, 0.15);
      e.o2.frequency.setTargetAtTime((57 + speed * 0.16) * p, t, 0.15);
      e.lfo.frequency.setTargetAtTime(8 + speed * 0.02, t, 0.2);
      e.f.frequency.setTargetAtTime(220 + speed * 0.6, t, 0.2);
      e.g.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.25);
    },
  };

  /* ---------------- game state ---------------- */
  const G = {
    state: 'title', round: 1, stars: 0, total: 0, cam: 0, camY: 0, speed: 150, baseSpeed: BASE_SPEED, t: 0,
    nextSpawn: 600, objs: [], parts: [], fly: [], bgTrucks: [], confetti: [], celebT: 0,
    hillAmp: 40, hillTarget: 40, pal: PALETTES[0], bannerT: 0, input: { fast: false, slow: false },
    hudPop: 0, nextTruckT: 2, patternCount: 0, clouds: [], vehicle: 'car', pickFrom: 'title', pickLock: false, paused: false,
    level: 0, done: 0, colors: Object.assign({}, DEFAULT_COLOR), mapFrom: null, mapTo: 0, mapT0: 0,
  };
  const car = { y: 0, vy: 0, onGround: true, jumps: 0, angle: 0, face: 'normal', faceT: 0, blinkT: 2, blinkA: -1,
    wobble: 0, squash: 0, wheelRot: 0, bp: 0, hitT: 0, jumpBuf: 0, dustT: 0, susp: 0, rideLift: 0, ridePeak: 0, dropLock: false,
    stunt: 0, stuntV: 0, stuntShow: 0, stoppieT: 0, flameT: 0, wasFast: false, wasSlow: false, sparkT: 0 };
  loadSave();

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function hillF(x) {
    return 0.5 + 0.5 * (0.55 * Math.sin(x * 0.0042 + 0.5) + 0.3 * Math.sin(x * 0.0101 + 1.3) + 0.15 * Math.sin(x * 0.021 + 0.7));
  }
  function groundY(x) { return H - GB - G.hillAmp * hillF(x); }
  const carSX = () => Math.max(110, W * 0.24);
  function carWX() { return G.cam + carSX(); }

  /* Monster-truck wheels, in world pixels. Matches drawTruck (±55) * scale. */
  function truckHalf() { return 55 * VEHICLES.truck.scale; }
  function smallReach(o) { return (o.type === 'cone' ? 18 : 24) + 20; }
  function smallHeight(o) {
    const full = o.type === 'cone' ? 36 : 28;
    const k = o.crush || 0;
    if (k >= 1) return o.type === 'cone' ? 4 : 0;
    return full * (1 - k * 0.9);
  }
  function humpAt(o, x) {
    if (o.hit) return 0;
    const reach = smallReach(o);
    const ad = Math.abs(x - o.x);
    if (ad >= reach) return 0;
    const lobe = 0.5 * (1 + Math.cos(Math.PI * ad / reach));
    return smallHeight(o) * lobe;
  }
  function liftAt(x) {
    let h = 0;
    for (const o of G.objs) {
      if (o.type !== 'cone' && o.type !== 'rock') continue;
      h = Math.max(h, humpAt(o, x));
    }
    return h;
  }
  function truckRide(wx) {
    const half = truckHalf();
    const rearLift = liftAt(wx - half);
    const frontLift = liftAt(wx + half);
    const rearY = groundY(wx - half) - rearLift;
    const frontY = groundY(wx + half) - frontLift;
    return {
      y: (rearY + frontY) / 2,
      angle: Math.atan2(frontY - rearY, half * 2),
      rearLift, frontLift,
      lift: (rearLift + frontLift) / 2,
    };
  }
  function crushUnderWheel(o, wx) {
    if (o.hit || o.crush >= 1 || !car.onGround) return;
    const half = truckHalf();
    const near = smallReach(o) * 0.45;
    const rear = wx - half, front = wx + half;
    const overlap = Math.abs(front - o.x) < smallReach(o) || Math.abs(rear - o.x) < smallReach(o);
    // Rear wheel presses it flat, so the front wheel can climb the full shape first.
    const onTop = Math.abs(rear - o.x) < near;
    if (overlap && !o.greeted) {
      o.greeted = true;
      setFace('happy', 0.7);
    }
    if (onTop && !o.crushing) {
      o.crushing = true;
      Snd.crunch();
      setFace('happy', 1.1);
      const gy = groundY(o.x);
      const dust = o.type === 'rock' ? 'rgba(190,190,198,0.9)' : 'rgba(255,170,70,0.85)';
      puff(o.x, gy - 4, o.type === 'rock' ? 9 : 5, dust, 1.3);
      sparkle(o.x, gy - 18, 7);
    }
  }

  /* Wheelie / stoppie. Negative stunt = nose up. Visual only — hitboxes stay put. */
  const WHEELIE = -20 * Math.PI / 180;
  const STOPPIE = 17 * Math.PI / 180;
  function bodyBounce(v) {
    let bounce = car.onGround
      ? v.bounceBase + Math.sin(car.bp) * v.bounceAmp + (G.input.fast ? Math.sin(car.bp * 2.3) * v.bounceFast : 0)
      : 3;
    if (v.id === 'truck') bounce += car.susp * 16;
    return bounce;
  }
  function truckNozzle(bounce) {
    const s = VEHICLES.truck.scale;
    const half = 55 * s;
    const st = car.stuntShow || 0;
    const pivot = st < -0.02 ? -half : st > 0.02 ? half : 0;
    const lx = -96, ly = -162 - (bounce || 0);
    let x = lx * s - pivot, y = ly * s;
    const cs = Math.cos(st), sn = Math.sin(st);
    const rx = x * cs - y * sn, ry = x * sn + y * cs;
    x = rx + pivot; y = ry;
    const a = car.angle, c2 = Math.cos(a), s2 = Math.sin(a);
    const wx = carWX() + x * c2 - y * s2;
    const wy = car.y + x * s2 + y * c2;
    let dx = -0.45, dy = -1;
    const ddx = dx * cs - dy * sn, ddy = dx * sn + dy * cs;
    dx = ddx * c2 - ddy * s2; dy = ddx * s2 + ddy * c2;
    const len = Math.hypot(dx, dy) || 1;
    return { x: wx, y: wy, dx: dx / len, dy: dy / len };
  }
  function exhaustPuff(n, smokeN, burst) {
    if (G.parts.length > 90) return;
    const nz = truckNozzle(bodyBounce(VEHICLES.truck));
    const px = -nz.dy, py = nz.dx;
    for (let i = 0; i < smokeN; i++) {
      const sp = rnd(18, 50);
      G.parts.push({ k: 'smoke', x: nz.x + rnd(-4, 2), y: nz.y + rnd(-4, 2), vx: nz.dx * sp + px * rnd(-20, 20), vy: nz.dy * sp + py * rnd(-20, 20), life: 0, max: rnd(0.35, 0.55), r: rnd(5, 9), c: 'rgba(186,186,196,0.45)', g: -20 });
    }
    for (let i = 0; i < n; i++) {
      const sp = burst ? rnd(110, 240) : rnd(50, 130);
      const hot = Math.random() < 0.5;
      G.parts.push({
        k: 'flame', x: nz.x + rnd(-3, 3), y: nz.y + rnd(-3, 3),
        vx: nz.dx * sp + px * rnd(-50, 50), vy: nz.dy * sp + py * rnd(-40, 40),
        life: 0, max: burst ? rnd(0.28, 0.42) : rnd(0.16, 0.3),
        r: burst ? rnd(8, 16) : rnd(5, 10),
        c: hot ? 'rgba(255,214,50,0.95)' : 'rgba(255,122,20,0.92)', g: -30,
      });
    }
  }
  function updateStunts(dt, v, ride) {
    const truck = v.id === 'truck' && G.state === 'play';
    if (!truck) {
      car.stuntV += (0 - car.stunt) * 48 * dt;
      car.stuntV *= Math.exp(-9 * dt);
      car.stunt += car.stuntV * dt;
      car.stuntShow = 0;
      car.stoppieT = 0;
      car.wasFast = false;
      car.wasSlow = false;
      return;
    }
    const fastNow = !!G.input.fast;
    const slowNow = !!G.input.slow && !fastNow;
    const fastEdge = fastNow && !car.wasFast;
    const slowEdge = slowNow && !car.wasSlow;
    const climbing = !!(ride && car.onGround && (ride.lift > 4 || Math.abs(ride.angle) > 0.08));
    const allow = car.onGround && !climbing;
    if (fastEdge) {
      Snd.vroom();
      exhaustPuff(9, 4, true);
      setFace('happy', 0.7);
      car.flameT = 0;
    }
    if (!fastNow && car.wasFast && car.onGround) {
      car.susp = Math.min(1.4, car.susp + 0.45);
      car.squash = Math.max(car.squash, 0.4);
    }
    const cruise = G.baseSpeed * v.speed;
    if (slowEdge && allow && G.speed >= cruise * 0.82) {
      car.stoppieT = 0.45;
      Snd.screech();
      setFace('happy', 0.55);
      const half = truckHalf();
      puff(carWX() + half, car.y, 4, 'rgba(120,110,100,0.6)', 1.5);
      puff(carWX() - half, car.y, 3, 'rgba(200,196,190,0.75)', 1.2);
    }
    let target = 0;
    if (car.stoppieT > 0) {
      const was = car.stoppieT;
      car.stoppieT = Math.max(0, car.stoppieT - dt);
      if (was > 0 && car.stoppieT === 0 && car.onGround) {
        car.susp = Math.min(1.4, car.susp + 0.55);
        car.squash = Math.max(car.squash, 0.5);
      }
      if (allow && !fastNow) target = STOPPIE;
    }
    if (fastNow && allow) target = WHEELIE;
    car.stuntV += (target - car.stunt) * 55 * dt;
    car.stuntV *= Math.exp(-9 * dt);
    car.stunt += car.stuntV * dt;
    if (car.stunt > 0.5) car.stunt = 0.5;
    else if (car.stunt < -0.5) car.stunt = -0.5;
    let grip = 1;
    if (!car.onGround) grip = 0;
    else if (ride) grip = Math.max(0, 1 - Math.max(ride.lift / 10, Math.abs(ride.angle) / 0.16));
    const wob = fastNow && allow ? Math.sin(G.t * 16) * 0.03 : 0;
    car.stuntShow = car.stunt * grip + wob * grip;
    if (fastNow) {
      car.flameT -= dt;
      if (car.flameT <= 0) {
        car.flameT = 0.045;
        exhaustPuff(2, 1, false);
      }
    }
    car.wasFast = fastNow;
    car.wasSlow = slowNow;
  }

  for (let i = 0; i < 6; i++) G.clouds.push({ x: rnd(0, 1400), y: rnd(0.08, 0.38), s: rnd(0.6, 1.15), p: rnd(0.05, 0.12) });

  /* ---------------- spawning ---------------- */
  function addStar(x, alt) { G.objs.push({ type: 'star', x, alt, got: false, ph: Math.random() * TAU }); }
  function addObs(type, x, extra) {
    /* Truck hit-box is a little inside the drawing so the lower jump still clears the cab. */
    const def = { cone: [26, 38], rock: [40, 30], truck: [64, 72], puddle: [110, 0] }[type];
    G.objs.push(Object.assign({ type, x, w: def[0], h: def[1], hit: false, passed: false, ox: 0, oy: 0, vx: 0, vy: 0, rot: 0, react: 0, color: Math.floor(Math.random() * 4) }, extra || {}));
  }
  function spawn() {
    const x = G.nextSpawn, r = G.round;
    G.patternCount++;
    let pick;
    if (G.patternCount <= 1) pick = 'line';
    else if (G.patternCount === 2) pick = 'arc';
    else {
      const bag = ['line', 'line', 'arc', 'line', 'arc', 'line', 'cone', 'line', 'rock', 'puddle', 'arc'];
      if (r >= 3) bag.push('truck', 'line', 'arc');
      if (r >= 5) bag.push('combo', 'truck');
      if (r >= 8) bag.push('rock', 'combo');
      pick = bag[Math.floor(Math.random() * bag.length)];
      if (pick === G.lastPick && Math.random() < 0.55) pick = 'line';
    }
    G.lastPick = pick;
    let w = 200;
    switch (pick) {
      case 'line': for (let i = 0; i < 5; i++) addStar(x + i * 58, 34); w = 250; break;
      case 'arc': for (let i = 0; i < 6; i++) addStar(x + i * 50, 36 + 100 * Math.sin(Math.PI * i / 5)); w = 280; break;
      case 'cone': case 'rock':
        addObs(pick, x + 120);
        for (let i = 0; i < 4; i++) addStar(x + 40 + i * 56, i % 2 ? 108 : 40);
        w = 260; break;
      case 'puddle':
        addObs('puddle', x + 110);
        for (let i = 0; i < 4; i++) addStar(x + 30 + i * 52, 36);
        w = 230; break;
      case 'truck':
        addObs('truck', x + 140);
        for (let i = 0; i < 5; i++) addStar(x + 140 + (i - 2) * 48, 120 + 36 * Math.sin(Math.PI * i / 4));
        w = 280; break;
      case 'combo':
        addObs('cone', x + 90); addObs('rock', x + 360);
        addStar(x + 90, 110); addStar(x + 200, 36); addStar(x + 280, 40); addStar(x + 360, 108);
        w = 420; break;
    }
    const gap = rnd(920, 1220) - Math.min((r - 1) * 20, 160);
    G.nextSpawn = x + w + gap;
  }

  /* ---------------- particles ---------------- */
  function puff(x, y, n, color, spread) {
    for (let i = 0; i < n; i++) G.parts.push({ k: 'dust', x: x + rnd(-4, 4), y: y + rnd(-3, 2), vx: rnd(-60, -10) * (spread || 1), vy: rnd(-40, -5), life: 0, max: rnd(0.4, 0.7), r: rnd(4, 8), c: color || 'rgba(255,255,255,0.8)' });
  }
  function sparkle(x, y, n) {
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(80, 220); G.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.35, 0.6), r: rnd(2.5, 5), c: ['#fff6a0', '#ffd21f', '#ffffff'][i % 3] }); }
  }
  function splash(x, y) {
    for (let i = 0; i < 18; i++) G.parts.push({ k: 'drop', x: x + rnd(-30, 30), y, vx: rnd(-90, 140), vy: rnd(-330, -150), life: 0, max: 0.9, r: rnd(3, 6), c: i % 2 ? '#6fbcff' : '#bfe6ff', g: 900 });
  }
  function confettiBurst(n) {
    const cols = ['#ff4d6d', '#ffd21f', '#3fb4ff', '#55c53f', '#9b59ff', '#ff9f1a', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      G.confetti.push({ x: fromLeft ? -10 : W + 10, y: H * rnd(0.5, 0.9), vx: (fromLeft ? 1 : -1) * rnd(150, 520), vy: rnd(-650, -300),
        rot: rnd(0, TAU), vr: rnd(-10, 10), w: rnd(6, 12), h: rnd(4, 8), c: cols[i % cols.length], life: 0 });
    }
    for (let i = 0; i < n / 2; i++) G.confetti.push({ x: rnd(0, W), y: rnd(-200, -10), vx: rnd(-40, 40), vy: rnd(0, 80), rot: rnd(0, TAU), vr: rnd(-8, 8), w: rnd(6, 12), h: rnd(4, 8), c: cols[i % cols.length], life: 0 });
  }

  /* ---------------- actions ---------------- */
  function jump() {
    if (G.state !== 'play') return;
    const v = veh();
    if (car.onGround) {
      car.vy = -v.jump; car.onGround = false; car.jumps = 1; car.squash = -1;
      Snd.boing(v.id === 'truck' ? 0.78 : 1); puff(carWX() - 30, car.y, 5);
    } else if (car.jumps < 2) {
      car.vy = -v.jump2; car.jumps = 2; Snd.boing(v.id === 'truck' ? 0.95 : 1.25);
      sparkle(carWX(), car.y - 10, 8);
    } else car.jumpBuf = 0.15; // remember the tap, jump on landing
  }
  function setFace(f, t) { if (car.face === 'oops' && f === 'happy' && car.faceT > 0.4) return; car.face = f; car.faceT = t; }

  function collect(o, sx, sy) {
    o.got = true; G.stars++; G.total++;
    Snd.star(G.stars);
    sparkle(sx, sy, 10);
    setFace('happy', 0.7);
    // fly to HUD (screen coords)
    G.fly.push({ x: sx - G.cam, y: sy + G.camY, t: 0 });
    if (G.stars >= GOAL) setTimeout(celebrate, 450);
  }
  function hitObstacle(o) {
    o.hit = true; o.react = 1;
    Snd.bump();
    setFace('oops', 1.0);
    car.wobble = 1; car.hitT = 0.7;
    car.onGround = false; car.jumps = 1;
    const bumpH = o.type === 'truck' ? 150 : 62;
    car.vy = -Math.sqrt(2 * veh().grav * bumpH);
    if (o.type === 'cone') { o.vx = 260; o.vy = -420; }
    if (o.type === 'truck') Snd.honk(0.25, 1);
    sparkle(carWX() + 40, car.y - 30, 6);
  }

  function celebrate() {
    if (G.state !== 'play') return;
    G.state = 'celebrate'; G.celebT = 0;
    Snd.fanfare();
    confettiBurst(140);
    setFace('happy', 999);
    // remove what is ahead so the party is calm
    const cx = carWX();
    G.objs = G.objs.filter((o) => o.x < cx + 40);
    // a parade of friendly trucks
    for (let i = 0; i < 3; i++) G.bgTrucks.push(makeBgTruck(true, i * 170));
    Snd.honk(0.9, 1.1);
    G.done = Math.max(G.done, (G.level || 0) + 1);
    saveProgress();
    $('#controls').classList.add('hidden');
    $('#map').classList.add('hidden');
    $('#celebrate').classList.remove('hidden');
    $('#nextBtn').classList.add('hidden');
    setTimeout(() => { if (G.state === 'celebrate') { $('#nextBtn').classList.remove('hidden'); Snd.pop(); } }, 1400);
    G.input.fast = G.input.slow = false;
  }
  function enterPlay(level) {
    const i = Math.max(0, Math.min(LEVELS.length - 1, level | 0));
    G.level = i;
    G.round = i + 1;
    G.pal = PALETTES[i];
    G.baseSpeed = Math.min(MAX_SPEED, BASE_SPEED + i * SPEED_STEP);
    G.hillTarget = Math.min(70, 36 + i * 4);
    G.patternCount = 0;
    G.nextSpawn = G.cam + W * 0.8;
    G.stars = 0; G.state = 'play';
    document.querySelector('meta[name=theme-color]').setAttribute('content', G.pal.theme);
    setFace('normal', 0); G.bannerT = 2.2; skyGrad = null;
    car.onGround = true; car.vy = 0; car.jumps = 0; car.wobble = 0; car.susp = 0; car.rideLift = 0; car.ridePeak = 0; car.dropLock = false;
    car.stunt = 0; car.stuntV = 0; car.stuntShow = 0; car.stoppieT = 0; car.flameT = 0; car.sparkT = 0;
    car.wasFast = !!G.input.fast; car.wasSlow = !!G.input.slow && !G.input.fast;
    car.y = groundY(carWX());
    $('#title').classList.add('hidden');
    $('#celebrate').classList.add('hidden');
    $('#pick').classList.add('hidden');
    $('#map').classList.add('hidden');
    $('#controls').classList.remove('hidden');
    Snd.go();
  }
  function nextRound() {
    if (G.state !== 'celebrate') return;
    openMap(true);
  }
  function markCards() {
    document.querySelectorAll('.vehCard').forEach((el) => el.classList.toggle('on', el.dataset.veh === G.vehicle));
    const cur = G.colors[G.vehicle];
    document.querySelectorAll('#swatches .swatch').forEach((el, n) => el.classList.toggle('on', n === cur));
  }
  function openPick(from) {
    G.state = 'pick'; G.pickFrom = from; G.pickLock = false;
    $('#title').classList.add('hidden');
    $('#celebrate').classList.add('hidden');
    $('#controls').classList.add('hidden');
    $('#map').classList.add('hidden');
    document.querySelectorAll('.vehCard').forEach((el) => el.classList.remove('chosen'));
    markCards();
    $('#pick').classList.remove('hidden');
  }
  function startGame() {
    if (G.state !== 'title') return;
    Snd.unlock();
    openPick('title');
  }
  function selectVehicle(id) {
    if (G.state !== 'pick' || G.pickLock || !VEHICLES[id]) return;
    G.vehicle = id;
    saveGarage();
    markCards();
    Snd.pop();
  }
  function setColor(i) {
    if (G.state !== 'pick' || G.pickLock) return;
    G.colors[G.vehicle] = i;
    saveGarage();
    markCards();
    Snd.pop();
  }
  function confirmPick() {
    if (G.state !== 'pick' || G.pickLock) return;
    G.pickLock = true;
    Snd.unlock();
    Snd.yay();
    setFace('happy', 1.4);
    saveGarage();
    const el = document.querySelector('.vehCard.on');
    if (el) el.classList.add('chosen');
    const from = G.pickFrom;
    setTimeout(() => {
      G.pickLock = false;
      if (el) el.classList.remove('chosen');
      if (G.state !== 'pick') return;
      if (from === 'celebrate') openMap(false);
      else enterPlay(Math.min(G.done, LEVELS.length - 1));
    }, 680);
  }
  function chooseVehicle(id) { selectVehicle(id); }
  function toGarage() {
    if (G.state !== 'celebrate') return;
    openPick('celebrate');
  }
  function refreshMap() {
    document.querySelectorAll('#mapStage .node').forEach((b) => {
      const i = +b.dataset.level;
      const done = i < G.done;
      const next = i === G.done && G.done < LEVELS.length;
      const locked = i > G.done;
      b.classList.toggle('done', done);
      b.classList.toggle('next', next);
      b.classList.toggle('locked', locked);
      b.disabled = locked;
      const name = LEVELS[i].name;
      b.setAttribute('aria-label', locked ? name + ', låst' : name);
      if (locked) {
        b.innerHTML = '<svg class="lock" viewBox="0 0 48 48"><rect x="12" y="20" width="24" height="18" rx="4" fill="#9aabbc" stroke="#4d6274" stroke-width="3"/><path d="M16 20v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#4d6274" stroke-width="3"/></svg>';
      } else if (done) b.innerHTML = '<b>' + (i + 1) + '</b><em>★</em>';
      else b.innerHTML = '<b>' + (i + 1) + '</b>';
    });
  }
  function openMap(drive) {
    G.state = 'map';
    G.input.fast = G.input.slow = false;
    $('#title').classList.add('hidden');
    $('#pick').classList.add('hidden');
    $('#celebrate').classList.add('hidden');
    $('#controls').classList.add('hidden');
    $('#map').classList.remove('hidden');
    refreshMap();
    if (drive && G.done > 0) {
      G.mapFrom = Math.min(LEVELS.length - 1, G.done - 1);
      G.mapTo = Math.min(LEVELS.length - 1, G.done);
      G.mapT0 = G.t;
    } else G.mapFrom = null;
    Snd.pop();
  }
  function tapLevel(i) {
    if (G.state !== 'map' || i > G.done || i >= LEVELS.length) return;
    Snd.unlock();
    Snd.pop();
    enterPlay(i);
  }
  function toTitle() {
    G.state = 'title';
    G.input.fast = G.input.slow = false;
    $('#map').classList.add('hidden');
    $('#pick').classList.add('hidden');
    $('#celebrate').classList.add('hidden');
    $('#controls').classList.add('hidden');
    $('#title').classList.remove('hidden');
  }

  /* ---------------- background trucks (mid layer, parallax 0.4) ---------------- */
  const MIDP = 0.4;
  function midY(lx) { return H - GB - 48 - 46 * (0.5 + 0.5 * Math.sin(lx * 0.006 + 2) * 0.7 + 0.3 * Math.sin(lx * 0.017)); }
  function makeBgTruck(fromLeft, offset) {
    const lcam = G.cam * MIDP;
    return fromLeft
      ? { lx: lcam - 120 - (offset || 0), v: G.speed * MIDP + rnd(70, 120), color: Math.floor(Math.random() * 4), honked: false, rot: 0, bp: rnd(0, 6) }
      : { lx: lcam + W + 120, v: rnd(10, 40), color: Math.floor(Math.random() * 4), honked: false, rot: 0, bp: rnd(0, 6) };
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    G.t += dt;
    const v = veh();
    let target;
    if (G.state === 'title' || G.state === 'pick' || G.state === 'map') target = 140;
    else if (G.state === 'celebrate') target = 90;
    else target = G.baseSpeed * v.speed * (G.input.fast ? SPEED_GAS : G.input.slow ? SPEED_SLOW : SPEED_AUTO);
    if (car.hitT > 0) { car.hitT -= dt; target *= 0.6; }
    G.speed += (target - G.speed) * Math.min(1, dt * 2.5);
    G.cam += G.speed * dt;
    G.hillAmp += (G.hillTarget - G.hillAmp) * Math.min(1, dt * 0.25);

    // car (truck rides the contour of small obstacles; the red car does not)
    const wx = carWX();
    const ride = v.roll ? truckRide(wx) : null;
    const gy = ride ? ride.y : groundY(wx);
    if (car.onGround) {
      if (ride) {
        if (ride.lift > car.ridePeak) car.ridePeak = ride.lift;
        const drop = car.ridePeak - ride.lift;
        if (drop > 10 && !car.dropLock) {
          car.dropLock = true;
          car.susp = Math.min(1.7, 0.5 + drop / 20);
          car.squash = 0.95;
          Snd.boing(0.58);
        }
        if (car.dropLock && ride.lift > car.rideLift + 4) {
          car.dropLock = false;
          car.ridePeak = ride.lift;
        }
        car.rideLift = ride.lift;
        car.y = gy;
        car.vy = 0;
        car.angle = ride.angle;
      } else {
        car.y = gy; car.vy = 0;
      }
    } else {
      car.vy += v.grav * dt; car.y += car.vy * dt;
      if (car.y >= gy && car.vy > 0) {
        car.y = gy; car.onGround = true; car.jumps = 0; car.squash = 1; car.vy = 0;
        Snd.land(); puff(wx - 35, gy, 4); puff(wx + 35, gy, 3);
        if (ride) car.rideLift = ride.lift;
        if (car.jumpBuf > 0) { car.jumpBuf = 0; jump(); }
      }
    }
    if (car.jumpBuf > 0) car.jumpBuf -= dt;
    if (!(ride && car.onGround)) {
      const slope = Math.atan2(groundY(wx + 35) - groundY(wx - 35), 70);
      const ta = car.onGround ? slope : Math.max(-0.3, Math.min(0.35, car.vy * 0.00045));
      car.angle += (ta - car.angle) * Math.min(1, dt * 10);
    }
    car.wheelRot += G.speed * dt / (v.id === 'truck' ? 34 * v.scale : 15);
    car.squash *= Math.pow(0.0005, dt);
    car.wobble = Math.max(0, car.wobble - dt * 1.3);
    car.susp = Math.max(0, car.susp - dt * 2.4);
    car.bp += dt * (v.freq + G.speed / 30);
    if (car.faceT > 0) { car.faceT -= dt; if (car.faceT <= 0) car.face = 'normal'; }
    car.blinkT -= dt;
    if (car.blinkT <= 0) { car.blinkA = 0; car.blinkT = rnd(2, 4.5); }
    if (car.blinkA >= 0) { car.blinkA += dt; if (car.blinkA > 0.16) car.blinkA = -1; }
    updateStunts(dt, v, ride);
    car.dustT -= dt;
    if (car.onGround && car.dustT <= 0) { car.dustT = G.input.fast ? 0.05 : 0.12; puff(wx - 50, gy - 2, 1, 'rgba(230,200,150,0.7)'); }
    if (G.input.fast && G.state === 'play' && Math.random() < dt * 20) G.parts.push({ k: 'dust', x: wx - 72, y: car.y - 18, vx: -120, vy: rnd(-20, 5), life: 0, max: 0.35, r: rnd(3, 5), c: 'rgba(200,200,210,0.8)' });
    if (v.spark && G.state === 'play' && G.parts.length < 80) {
      car.sparkT -= dt;
      if (car.sparkT <= 0) {
        car.sparkT = 0.07;
        G.parts.push({ k: 'spark', x: wx - 36, y: car.y - 10, vx: rnd(-30, 20), vy: rnd(-50, -10), life: 0, max: 0.45, r: rnd(2.4, 4.2), c: ['#fff6a0', '#ff8ad8', '#9ee6ff', '#ffffff'][(Math.random() * 4) | 0] });
      }
    }

    // camera follows car upward if it leaves the top
    const top = car.y - 90;
    const want = top < 70 ? 70 - top : 0;
    G.camY += (want - G.camY) * Math.min(1, dt * 6);

    if (G.state === 'play') {
      while (G.nextSpawn < G.cam + W + 300) spawn();
      // collisions
      const cx0 = wx + v.box.x0, cx1 = wx + v.box.x1, cy1 = car.y + v.box.y1;
      const ccx = wx + v.star.x, ccy = car.y + v.star.y, rr = v.star.r;
      for (const o of G.objs) {
        if (o.type === 'star') {
          if (o.got) continue;
          const sx = o.x, sy = groundY(o.x) - o.alt;
          const dx = sx - ccx, dy = sy - ccy;
          if (dx * dx + dy * dy < rr * rr) collect(o, sx, sy);
        } else if (o.type === 'puddle') {
          if (!o.hit && Math.abs(wx - o.x) < o.w / 2 && car.onGround) {
            o.hit = true; Snd.splash(); splash(wx, groundY(wx)); setFace('happy', 0.8); car.hitT = 0.25;
          }
        } else if (v.roll && (o.type === 'cone' || o.type === 'rock')) {
          crushUnderWheel(o, wx);
        } else {
          if (o.hit || o.passed) continue;
          const ogy = groundY(o.x);
          const ox0 = o.x - o.w / 2, ox1 = o.x + o.w / 2, oy0 = ogy - o.h;
          if (cx1 > ox0 && cx0 < ox1 && cy1 > oy0) hitObstacle(o);
          else if (cx0 > ox1) {
            o.passed = true; o.react = 1;
            setFace('happy', 0.6);
            if (o.type === 'truck') { o.awake = true; Snd.honk(0.05, 1.05); }
          }
        }
      }
    }
    // obstacles reacting
    for (const o of G.objs) {
      if (o.react > 0) o.react = Math.max(0, o.react - dt * 1.5);
      if (o.type === 'cone' && o.hit) { o.vy += 1300 * dt; o.ox += o.vx * dt; o.oy += o.vy * dt; o.rot += dt * 9; if (o.oy > 0 && o.vy > 0) { o.oy = 0; o.vy *= -0.35; o.vx *= 0.6; } }
      if ((o.type === 'cone' || o.type === 'rock') && o.crushing && (o.crush || 0) < 1) o.crush = Math.min(1, (o.crush || 0) + dt * 3.4);
    }
    G.objs = G.objs.filter((o) => o.x - G.cam > -300);

    // particles
    for (const p of G.parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
      if (p.k === 'dust') { p.vx *= 0.96; p.r += dt * 10; }
      else if (p.k === 'flame') p.r += dt * 16;
      else if (p.k === 'smoke') { p.r += dt * 12; p.vx *= 0.98; }
    }
    G.parts = G.parts.filter((p) => p.life < p.max);
    for (const c of G.confetti) { c.life += dt; c.vy += 500 * dt; c.vx *= Math.pow(0.4, dt); c.vy = Math.min(c.vy, 160); c.x += c.vx * dt + Math.sin(c.life * 6 + c.rot) * 30 * dt; c.y += c.vy * dt; c.rot += c.vr * dt; }
    G.confetti = G.confetti.filter((c) => c.y < H + 30 && c.life < 7);
    if (G.state === 'celebrate') { G.celebT += dt; if (Math.random() < dt * 25) G.confetti.push({ x: rnd(0, W), y: -10, vx: rnd(-30, 30), vy: rnd(40, 120), rot: rnd(0, TAU), vr: rnd(-8, 8), w: rnd(6, 11), h: rnd(4, 7), c: ['#ff4d6d', '#ffd21f', '#3fb4ff', '#55c53f', '#9b59ff'][Math.floor(Math.random() * 5)], life: 0 }); }
    for (const f of G.fly) f.t += dt * 1.6;
    G.fly = G.fly.filter((f) => { if (f.t >= 1) { G.hudPop = 1; return false; } return true; });
    G.hudPop = Math.max(0, G.hudPop - dt * 4);
    if (G.bannerT > 0) G.bannerT -= dt;

    // background trucks
    G.nextTruckT -= dt;
    if (G.nextTruckT <= 0) { G.bgTrucks.push(makeBgTruck(Math.random() < 0.55)); G.nextTruckT = rnd(5, 10); }
    const lcam = G.cam * MIDP;
    for (const b of G.bgTrucks) {
      b.lx += b.v * dt; b.rot += b.v * dt / 14; b.bp += dt * 7;
      const sx = b.lx - lcam;
      if (!b.honked && sx > W * 0.3 && sx < W * 0.8 && (G.state === 'play' || G.state === 'celebrate')) { b.honked = true; if (G.t - Snd.lastHonk > 3) { Snd.lastHonk = G.t; Snd.honk(0, 1.25); } }
    }
    G.bgTrucks = G.bgTrucks.filter((b) => { const sx = b.lx - lcam; return sx > -260 && sx < W + 300; });

    for (const c of G.clouds) { c.x -= (G.speed * c.p + 6) * dt; if (c.x < -150) { c.x = W + rnd(50, 300); c.y = rnd(0.08, 0.38); c.s = rnd(0.6, 1.15); } }

    Snd.engine(G.speed, G.state === 'play' || G.state === 'celebrate', v.pitch);
  }

  /* ---------------- render ---------------- */
  function render() {
    const P = G.pal;
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    if (!skyGrad) { skyGrad = ctx.createLinearGradient(0, 0, 0, H); skyGrad.addColorStop(0, P.sky[0]); skyGrad.addColorStop(0.75, P.sky[1]); }
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);

    // sun + clouds (fixed-ish)
    for (const c of G.clouds) Art.drawCloud(ctx, c.x, H * c.y + G.camY * 0.15, c.s, P.cloud);
    if (P.moon) {
      const mx = W - 150, my = 52 + G.camY * 0.1;
      ctx.fillStyle = P.sun; ctx.beginPath(); ctx.arc(mx, my, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = P.sky[0]; ctx.beginPath(); ctx.arc(mx + 10, my - 6, 18, 0, TAU); ctx.fill();
    } else Art.drawSun(ctx, W - 150, 52 + G.camY * 0.1, 30, G.t, P.sun);

    // far hills
    ctx.save(); ctx.translate(0, G.camY * 0.3);
    const lf = G.cam * 0.12;
    ctx.fillStyle = P.farFar; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, H - GB - 120 - 55 * (0.5 + 0.5 * Math.sin((x + lf * 0.6) * 0.004 + 1)));
    ctx.lineTo(W + 20, H); ctx.fill();
    ctx.fillStyle = P.far; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 16) ctx.lineTo(x, H - GB - 70 - 50 * (0.5 + 0.5 * Math.sin((x + lf) * 0.0065)));
    ctx.lineTo(W + 20, H); ctx.fill();
    ctx.restore();

    // mid hills + trees + background trucks
    ctx.save(); ctx.translate(0, G.camY * 0.6);
    const lcam = G.cam * MIDP;
    ctx.fillStyle = P.mid; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 12) ctx.lineTo(x, midY(x + lcam));
    ctx.lineTo(W + 16, H); ctx.fill();
    ctx.strokeStyle = P.midDark; ctx.lineWidth = 3; ctx.beginPath();
    for (let x = 0; x <= W + 16; x += 12) x ? ctx.lineTo(x, midY(x + lcam)) : ctx.moveTo(x, midY(x + lcam));
    ctx.stroke();
    const step = 110, k0 = Math.floor((lcam - 60) / step), k1 = Math.ceil((lcam + W + 60) / step);
    for (let k = k0; k <= k1; k++) {
      if (hash(k) < 0.45) continue;
      const lx = k * step + hash(k + 9) * 60, sx = lx - lcam;
      Art.drawTree(ctx, sx, midY(lx) + 6, 0.7 + hash(k + 3) * 0.5, P.leaf, P.leafDark);
    }
    for (const b of G.bgTrucks) {
      const sx = b.lx - lcam, y = midY(b.lx) + 4;
      const ang = Math.atan2(midY(b.lx + 30) - midY(b.lx - 30), 60);
      ctx.save(); ctx.translate(sx, y); ctx.rotate(ang); ctx.scale(0.36, 0.36); ctx.globalAlpha = 0.92;
      Art.drawTruck(ctx, { color: b.color, wheelRot: b.rot, bounce: 3 + Math.sin(b.bp) * 3, face: G.state === 'celebrate' ? 'happy' : 'normal', blink: ((G.t + b.bp) % 3.3) < 0.15 ? 1 : 0, t: G.t });
      ctx.restore();
    }
    ctx.restore();

    // ground
    ctx.save(); ctx.translate(0, G.camY);
    const pts = [];
    for (let x = -10; x <= W + 10; x += 8) pts.push(x, groundY(G.cam + x));
    ctx.fillStyle = P.dirt; ctx.beginPath(); ctx.moveTo(-10, H + 400);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(W + 10, H + 400); ctx.fill();
    // pebbles
    ctx.fillStyle = P.dirtDark;
    const ps = 46, p0 = Math.floor(G.cam / ps), p1 = Math.ceil((G.cam + W) / ps);
    for (let k = p0; k <= p1; k++) {
      const wx = k * ps + hash(k) * 30, sx = wx - G.cam, gy = groundY(wx);
      ctx.beginPath(); ctx.ellipse(sx, gy + 34 + hash(k + 1) * (GB - 50), 4 + hash(k + 2) * 5, 3 + hash(k + 4) * 2, 0, 0, TAU); ctx.fill();
    }
    // grass band
    ctx.fillStyle = P.grass; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1] - 2) : ctx.moveTo(pts[i], pts[i + 1] - 2);
    for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1] + 20 + Math.sin((G.cam + pts[i]) * 0.15) * 2.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.grassLight; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1] + 1) : ctx.moveTo(pts[i], pts[i + 1] + 1);
    ctx.stroke();
    ctx.strokeStyle = P.grassDark; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1] - 2) : ctx.moveTo(pts[i], pts[i + 1] - 2);
    ctx.stroke();
    // flowers / tufts
    const fs = 70, f0 = Math.floor(G.cam / fs), f1 = Math.ceil((G.cam + W) / fs);
    for (let k = f0; k <= f1; k++) {
      const h = hash(k * 3.1);
      const wx = k * fs + h * 40, sx = wx - G.cam, gy = groundY(wx);
      if (h < 0.5) { // tuft
        ctx.strokeStyle = P.grassDark; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(sx - 4, gy); ctx.lineTo(sx - 6, gy - 8); ctx.moveTo(sx, gy); ctx.lineTo(sx, gy - 10); ctx.moveTo(sx + 4, gy); ctx.lineTo(sx + 6, gy - 8); ctx.stroke();
      } else {
        ctx.strokeStyle = P.grassDark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx, gy - 11); ctx.stroke();
        ctx.fillStyle = ['#ff6fae', '#ffffff', '#ffd21f', '#9b8cff'][Math.floor(h * 40) % 4];
        for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 3.4, gy - 13 + Math.sin(a) * 3.4, 2.6, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.arc(sx, gy - 13, 2, 0, TAU); ctx.fill();
      }
    }

    // objects (puddles first)
    for (const o of G.objs) if (o.type === 'puddle') { ctx.save(); ctx.translate(o.x - G.cam, groundY(o.x)); Art.drawPuddle(ctx, o.w, G.t); ctx.restore(); }
    for (const o of G.objs) {
      if (o.type === 'puddle' || o.type === 'star') continue;
      const sx = o.x - G.cam; if (sx < -200 || sx > W + 200) continue;
      const gy = groundY(o.x);
      ctx.save(); ctx.translate(sx + o.ox, gy + o.oy);
      if (o.type === 'cone') { ctx.rotate(o.rot); ctx.translate(0, o.react * Math.sin(G.t * 40) * 0); Art.drawCone(ctx, G.t, o.crush || 0); }
      else if (o.type === 'rock') { ctx.rotate(Math.sin(G.t * 30) * 0.08 * o.react); Art.drawRock(ctx, o.crush || 0); }
      else if (o.type === 'truck') {
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 1, 62, 6, 0, 0, TAU); ctx.fill();
        ctx.rotate(Math.sin(G.t * 25) * 0.05 * o.react);
        ctx.scale(0.62, 0.62);
        const face = o.hit ? (o.react > 0.3 ? 'oops' : 'happy') : o.awake ? 'happy' : 'sleep';
        Art.drawTruck(ctx, { color: o.color, face, bounce: o.react * 8 * Math.abs(Math.sin(G.t * 20)) + (face === 'sleep' ? Math.sin(G.t * 2) * 1.5 : 0), t: G.t, lookX: -0.5 });
      }
      ctx.restore();
    }
    for (const o of G.objs) {
      if (o.type !== 'star' || o.got) continue;
      const sx = o.x - G.cam; if (sx < -40 || sx > W + 40) continue;
      const bob = Math.sin(G.t * 3 + o.ph) * 4;
      // glow
      ctx.fillStyle = 'rgba(255,240,150,0.35)'; ctx.beginPath(); ctx.arc(sx, groundY(o.x) - o.alt + bob, 24, 0, TAU); ctx.fill();
      Art.drawStar(ctx, sx, groundY(o.x) - o.alt + bob, 17 + Math.sin(G.t * 5 + o.ph) * 1.2, Math.sin(G.t * 2 + o.ph) * 0.15, false);
    }

    // car shadow + car (hidden while the picker is up)
    if (G.state !== 'pick') {
      const v = veh();
      const wx = carWX(), sx = carSX(), gy = groundY(wx);
      const hgt = car.onGround ? 0 : Math.max(0, gy - car.y), sh = Math.max(0.35, 1 - hgt / 220);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(sx + 4, gy + 1, v.shadow * sh, (v.id === 'truck' ? 10 : 7) * sh, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(sx, car.y);
      ctx.rotate(car.angle + Math.sin(G.t * 28) * 0.12 * car.wobble);
      if (v.id === 'truck' && Math.abs(car.stuntShow) > 0.001) {
        const half = 55 * v.scale;
        const pivot = car.stuntShow < 0 ? -half : half;
        ctx.translate(pivot, 0);
        ctx.rotate(car.stuntShow);
        ctx.translate(-pivot, 0);
      }
      const sq = car.squash;
      ctx.scale(1 + sq * 0.08, 1 - sq * 0.1);
      const blink = car.blinkA >= 0 ? Math.sin(Math.min(1, car.blinkA / 0.16) * Math.PI) : 0;
      const lookY = car.onGround ? 0 : (car.vy < 0 ? -0.8 : 0.6);
      const bounce = bodyBounce(v);
      ctx.scale(v.scale, v.scale);
      drawVehicleArt(ctx, v.id, { face: car.face, blink, wheelRot: car.wheelRot, bounce, lookX: 1, lookY, t: G.t, flame: v.id === 'truck' && G.input.fast && G.state === 'play' });
      ctx.restore();
    }

    // particles (world)
    for (const p of G.parts) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.c;
      if (p.k === 'spark') { Art.starPath(ctx, p.x - G.cam, p.y, p.r * 1.6, p.r * 0.7, p.life * 6); ctx.fill(); }
      else if (p.k === 'flame') {
        const fx = p.x - G.cam, fy = p.y;
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(fx, fy, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,246,190,0.9)'; ctx.beginPath(); ctx.arc(fx, fy, p.r * 0.45, 0, TAU); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(p.x - G.cam, p.y, p.r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.restore(); // camY

    if (G.state === 'play' && G.input.fast) {
      const boost = Math.max(0, Math.min(1, (G.speed / G.baseSpeed - SPEED_AUTO) / (SPEED_GAS - SPEED_AUTO)));
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.38 * boost;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const y = 28 + ((i * 53 + G.t * 90) % (H * 0.55));
        const x = ((i * 140 - G.t * (280 + boost * 520)) % (W + 180)) - 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 46 + boost * 70, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // HUD
    if (G.state === 'play' || G.state === 'celebrate') drawHUD();
    drawPreviews();
    if (G.state === 'map') drawMapDriver();
    // confetti
    for (const c of G.confetti) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.cos(c.life * 8 + c.rot));
      ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    // round banner
    if (G.bannerT > 0 && G.state === 'play') {
      const t = 2.2 - G.bannerT, a = Math.min(1, t * 4, G.bannerT * 3);
      const sc = t < 0.3 ? 0.6 + t / 0.3 * 0.4 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.36); ctx.scale(sc, sc);
      const label = (LEVELS[G.level] && LEVELS[G.level].name) || ('Bana ' + G.round);
      ctx.font = '900 ' + (label.length > 8 ? 42 : 54) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = '#c2101b'; ctx.strokeText(label, 0, 0);
      ctx.fillStyle = '#ffd21f'; ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  function drawHUD() {
    const w = 292, h = 66, x = W / 2 - w / 2, y = 8;
    const pop = 1 + G.hudPop * 0.12;
    ctx.save(); ctx.translate(W / 2, y + h / 2); ctx.scale(pop, pop); ctx.translate(-W / 2, -(y + h / 2));
    ctx.fillStyle = 'rgba(27,58,92,0.25)'; Art.rr(ctx, x, y + 4, w, h, 28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; Art.rr(ctx, x, y, w, h, 28); ctx.fill();
    Art.drawStar(ctx, x + 34, y + 28, 20, Math.sin(G.t * 2) * 0.1, true);
    const label = Math.min(G.stars, GOAL) + '/' + GOAL;
    ctx.font = '900 32px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1b3a5c';
    ctx.fillText(label, x + 62, y + 26);
    const bx = x + 62, bw = w - 84, by = y + h - 18;
    ctx.fillStyle = '#e3ebf3'; Art.rr(ctx, bx, by, bw, 10, 5); ctx.fill();
    const p = Math.min(1, G.stars / GOAL);
    if (p > 0) { const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ffd21f'); gr.addColorStop(1, '#ff9f1a'); ctx.fillStyle = gr; Art.rr(ctx, bx, by, Math.max(10, bw * p), 10, 5); ctx.fill(); }
    ctx.restore();
    // flying stars
    for (const f of G.fly) {
      const e = 1 - Math.pow(1 - f.t, 3);
      const fx = f.x + (x + 32 - f.x) * e, fy = f.y + (y + h / 2 - f.y) * e - Math.sin(f.t * Math.PI) * 60;
      Art.drawStar(ctx, fx, fy, 17 - 4 * e, f.t * 8, true);
    }
  }

  /* ---------------- loop ---------------- */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000 || 0));
    last = ts;
    if (!G.paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------- input ---------------- */
  function press(el, down, up) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('pressed'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } Snd.unlock(); down && down(); });
    const end = (e) => { el.classList.remove('pressed'); up && up(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  }
  press($('#jumpBtn'), jump);
  press($('#fastBtn'), () => { G.input.fast = true; G.input.slow = false; }, () => { G.input.fast = false; });
  press($('#slowBtn'), () => { G.input.slow = true; G.input.fast = false; }, () => { G.input.slow = false; });
  press($('#startBtn'), null, startGame);
  press($('#nextBtn'), null, nextRound);
  press($('#swapBtn'), null, toGarage);
  press($('#mapBtn'), null, () => { if (G.state === 'title') { Snd.unlock(); openMap(false); } });
  press($('#mapHome'), null, toTitle);
  press($('#pickGo'), null, confirmPick);
  document.querySelectorAll('.vehCard').forEach((el) => press(el, null, () => selectVehicle(el.dataset.veh)));
  const muteBtn = $('#muteBtn');
  muteBtn.classList.toggle('muted', Snd.muted);
  press(muteBtn, null, () => { Snd.setMuted(!Snd.muted); muteBtn.classList.toggle('muted', Snd.muted); });
  cvs.addEventListener('pointerdown', (e) => { e.preventDefault(); Snd.unlock(); if (G.state === 'play') jump(); });
  $('#rotateHint').addEventListener('pointerdown', () => { hintDismissed = true; $('#rotateHint').classList.add('hidden'); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (G.state === 'title') startGame(); else if (G.state === 'celebrate') nextRound(); else jump(); }
    if (e.code === 'ArrowRight') G.input.fast = true;
    if (e.code === 'ArrowLeft') G.input.slow = true;
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'ArrowRight') G.input.fast = false; if (e.code === 'ArrowLeft') G.input.slow = false; });
  // iOS: unlock audio on any real gesture, block zoom/scroll/bounce
  ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => Snd.unlock(), { passive: true }));
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (!Snd.ac) return;
    if (document.hidden) Snd.ac.suspend(); else Snd.ac.resume();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  setTimeout(() => { hintDismissed = true; $('#rotateHint').classList.add('hidden'); }, 9000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  function fitPreview(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2 || h < 2) return null;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return { c, w, h };
  }
  const PREVIEW = {
    car: { sel: '#prevCar', y: 0.8, bw: 200, bh: 140, sh: 62 },
    truck: { sel: '#prevTruck', y: 0.88, bw: 250, bh: 200, sh: 78 },
    buggy: { sel: '#prevBuggy', y: 0.84, bw: 230, bh: 170, sh: 70 },
    rally: { sel: '#prevRally', y: 0.78, bw: 210, bh: 140, sh: 64 },
  };
  function drawPreviews() {
    const pick = $('#pick');
    if (!pick || pick.classList.contains('hidden')) return;
    const blink = Math.sin(G.t * 3) > 0.92 ? 1 : 0;
    for (const id in PREVIEW) {
      const spec = PREVIEW[id];
      const box = fitPreview($(spec.sel));
      if (!box) continue;
      const card = $(spec.sel).parentElement;
      const happy = card && (card.classList.contains('on') || card.classList.contains('chosen'));
      box.c.save();
      box.c.translate(box.w * 0.5, box.h * spec.y);
      const s = Math.min(box.w / spec.bw, box.h / spec.bh);
      box.c.scale(s, s);
      box.c.fillStyle = 'rgba(27,58,92,0.12)';
      box.c.beginPath(); box.c.ellipse(0, 4, spec.sh, 9, 0, 0, TAU); box.c.fill();
      const bounce = id === 'truck' ? 7 + Math.sin(G.t * 7) * 4 : id === 'buggy' ? 5 + Math.sin(G.t * 8) * 4 : 2 + Math.sin(G.t * 6) * 1.4;
      drawVehicleArt(box.c, id, { face: happy ? 'happy' : 'normal', blink, wheelRot: G.t * (id === 'truck' ? 2.2 : 3), bounce, lookX: 1, t: G.t });
      box.c.restore();
    }
  }
  function drawMapDriver() {
    const el = $('#mapVeh');
    if (!el || G.state !== 'map') return;
    let i0 = Math.min(G.done, LEVELS.length - 1);
    let i1 = i0;
    let u = 1;
    if (G.mapFrom != null) {
      u = Math.min(1, Math.max(0, (G.t - G.mapT0) / 1.25));
      u = u * u * (3 - 2 * u);
      i0 = G.mapFrom;
      i1 = G.mapTo;
    }
    const a = MAP_PTS[i0], b = MAP_PTS[i1];
    const x = a[0] + (b[0] - a[0]) * u;
    const y = a[1] + (b[1] - a[1]) * u;
    el.style.left = (x / 800 * 100) + '%';
    el.style.top = (y / 280 * 100) + '%';
    const box = fitPreview(el);
    if (!box) return;
    box.c.save();
    box.c.translate(box.w * 0.5, box.h * 0.84);
    const sc = Math.min(box.w / 170, box.h / 130) * (G.vehicle === 'truck' ? 0.82 : 1);
    box.c.scale(sc, sc);
    drawVehicleArt(box.c, G.vehicle, { face: 'happy', wheelRot: G.t * 5, bounce: 2 + Math.sin(G.t * 12) * 2, lookX: 1, t: G.t });
    box.c.restore();
  }

  // test hook (used by automated screenshots)
  function buildPicker() {
    const row = $('#swatches');
    PAINTS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c.body;
      b.setAttribute('aria-label', c.name);
      press(b, null, () => setColor(i));
      row.appendChild(b);
    });
    const stage = $('#mapStage');
    const d = MAP_PTS.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ');
    $('#mapRoad').innerHTML = '<path d="' + d + '" fill="none" stroke="#e2b56a" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="' + d + '" fill="none" stroke="#fff4d2" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="' + d + '" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="1 18" stroke-linecap="round" stroke-linejoin="round"/>';
    MAP_PTS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'node';
      b.style.left = (p[0] / 800 * 100) + '%';
      b.style.top = (p[1] / 280 * 100) + '%';
      b.dataset.level = String(i);
      press(b, null, () => tapLevel(i));
      stage.appendChild(b);
    });
    markCards();
  }
  buildPicker();

  window.__game = { G, car, celebrate, jump, nextRound, startGame, chooseVehicle, selectVehicle, setColor, confirmPick, openMap, toGarage, toTitle, GOAL, VEHICLES, LEVELS, PAINTS, SPEED_SLOW, SPEED_AUTO, SPEED_GAS, groundY, carWX, veh, update, truckRide, paintOf };

  resize();
  car.y = groundY(carWX());
  requestAnimationFrame(loop);
})();
