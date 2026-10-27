/* Art: all characters drawn with canvas vector shapes. Exposes window.Art */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- shared bits ---------- */
  function eye(ctx, x, y, rx, ry, o) {
    const mood = o.mood || 'normal';
    const dark = o.dark || '#2a0a0c';
    if (o.closed || (o.blink || 0) > 0.6) { // sleeping / blinking: curved line
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.5, rx * 0.22); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, rx * 0.8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      return;
    }
    let erx = rx, ery = ry;
    if (mood === 'oops') { erx *= 1.08; ery *= 1.12; }
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, erx, ery, 0, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip();
    // soft shade at top of eyeball
    ctx.fillStyle = 'rgba(120,160,200,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y - ery * 0.9, erx * 1.2, ery * 0.5, 0, 0, TAU); ctx.fill();
    const lx = (o.lx || 0), ly = (o.ly || 0);
    const ix = x + lx * erx * 0.38, iy = y + ly * ery * 0.3 + ery * 0.05;
    const ir = erx * (mood === 'oops' ? 0.5 : 0.66);
    ctx.fillStyle = o.iris || '#2b7de9';
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
    ctx.fillStyle = '#10131a';
    ctx.beginPath(); ctx.arc(ix, iy, ir * (mood === 'oops' ? 0.55 : 0.58), 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.4, ir * 0.32, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ix + ir * 0.3, iy + ir * 0.32, ir * 0.13, 0, TAU); ctx.fill();
    // upper lid (blink)
    const lid = Math.max(o.blink || 0, o.lidBase || 0);
    if (lid > 0.01) {
      const top = y - ery - 2, hh = (ery * 2 + 4) * lid;
      ctx.fillStyle = o.lidColor || '#d8141f';
      ctx.fillRect(x - erx - 2, top, erx * 2 + 4, hh);
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - erx - 2, top + hh); ctx.lineTo(x + erx + 2, top + hh); ctx.stroke();
    }
    // happy: cheeks push up from below
    if (mood === 'happy') {
      ctx.fillStyle = o.lidColor || '#d8141f';
      ctx.beginPath(); ctx.ellipse(x, y + ery * 1.5, erx * 1.6, ery * 0.75, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + ery * 1.5, erx * 1.6, ery * 0.75, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(x, y, erx, ery, 0, 0, TAU);
    ctx.strokeStyle = dark; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  }

  function wheel(ctx, x, y, r, rot, rim, hub, chunky) {
    ctx.save(); ctx.translate(x, y);
    if (chunky) { // monster truck treads
      ctx.save(); ctx.rotate(rot);
      ctx.fillStyle = '#1d1d1f';
      const n = 14;
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.rotate(i * TAU / n);
        rr(ctx, -r * 0.13, -r - r * 0.09, r * 0.26, r * 0.3, r * 0.06); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#2a2a2e';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.08); ctx.strokeStyle = '#121214'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
    const rr2 = r * (chunky ? 0.5 : 0.56);
    const g = ctx.createRadialGradient(-rr2 * 0.3, -rr2 * 0.3, 1, 0, 0, rr2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, rim);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(40,40,50,0.55)'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rr2 * 0.25, Math.sin(a) * rr2 * 0.25);
      ctx.lineTo(Math.cos(a) * rr2 * 0.85, Math.sin(a) * rr2 * 0.85); ctx.stroke();
    }
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(0, 0, rr2 * 0.32, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  function starPath(ctx, x, y, R, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 ? r : R;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /* ---------- the hero car ("Rödis", placeholder name) ----------
     origin = ground contact point between wheels, facing right */
  function bodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-60, -14);
    ctx.lineTo(62, -14);
    ctx.quadraticCurveTo(76, -14, 76, -26);
    ctx.quadraticCurveTo(76, -38, 64, -42);
    ctx.quadraticCurveTo(46, -48, 28, -49);
    ctx.quadraticCurveTo(18, -82, -10, -81);
    ctx.quadraticCurveTo(-34, -80, -44, -52);
    ctx.quadraticCurveTo(-58, -50, -64, -44);
    ctx.quadraticCurveTo(-70, -30, -66, -18);
    ctx.quadraticCurveTo(-65, -14, -60, -14);
    ctx.closePath();
  }

  function drawCar(ctx, o) {
    o = o || {};
    const OUT = '#4a0b10', RED = '#e3141f';
    const face = o.face || 'normal';
    const mouth = o.mouth || face;
    const rot = o.wheelRot || 0;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // body group (suspension bounce)
    ctx.save();
    ctx.translate(0, -(o.bounce || 0));

    // spoiler
    ctx.fillStyle = '#b30d17'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
    rr(ctx, -66, -58, 5, 12, 2); ctx.fill(); ctx.stroke();
    rr(ctx, -84, -63, 30, 8, 4); ctx.fillStyle = RED; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd21f'; rr(ctx, -80, -61, 22, 2.5, 1.2); ctx.fill();
    // exhaust
    ctx.fillStyle = '#9aa0a6'; rr(ctx, -74, -22, 10, 6, 3); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();

    // body fill
    bodyPath(ctx);
    const g = ctx.createLinearGradient(0, -82, 0, -14);
    g.addColorStop(0, '#ff6a5c'); g.addColorStop(0.45, '#f0222c'); g.addColorStop(1, '#b10c16');
    ctx.fillStyle = g; ctx.fill();

    ctx.save(); bodyPath(ctx); ctx.clip();
    // racing stripe (yellow) + white pinstripe
    ctx.fillStyle = '#ffd21f'; ctx.fillRect(-80, -26, 170, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-80, -20, 170, 1.6);
    // bottom shade
    ctx.fillStyle = 'rgba(80,0,10,0.25)'; ctx.fillRect(-80, -18, 170, 6);
    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(46, -45, 22, 3.5, -0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10, -79, 14, 2.6, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // wheel arches
    ctx.fillStyle = '#3a0a0e';
    ctx.beginPath(); ctx.arc(-36, -14, 19, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(38, -14, 19, Math.PI, 0); ctx.fill();

    bodyPath(ctx); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();

    // glass
    ctx.beginPath();
    ctx.moveTo(24, -50);
    ctx.quadraticCurveTo(15, -77, -10, -77);
    ctx.quadraticCurveTo(-30, -76, -40, -52);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, -77, 0, -50);
    gg.addColorStop(0, '#d9f6ff'); gg.addColorStop(1, '#7fcff7');
    ctx.fillStyle = gg; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
    // B-pillar
    ctx.fillStyle = RED; ctx.fillRect(-21, -77, 5, 26);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-21, -76); ctx.lineTo(-21, -51); ctx.moveTo(-16, -77); ctx.lineTo(-16, -51); ctx.stroke();
    // side window shine
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-34, -56); ctx.lineTo(-27, -70); ctx.stroke();

    // eyes (on the windshield)
    const ey = { blink: o.blink || 0, mood: face, lx: o.lookX == null ? 1 : o.lookX, ly: o.lookY || 0, lidColor: '#e8202a', dark: OUT, iris: '#2b7de9', lidBase: face === 'normal' ? 0.12 : 0 };
    eye(ctx, -3, -63, 10.5, 13, ey);
    eye(ctx, 14, -62, 9.5, 12.5, ey);
    // eyebrows
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.6;
    const browY = face === 'oops' ? -82 : face === 'happy' ? -80 : -78.5;
    ctx.beginPath();
    if (face === 'oops') {
      ctx.moveTo(-10, browY + 1); ctx.quadraticCurveTo(-4, browY - 3, 2, browY - 1);
      ctx.moveTo(8, browY - 1); ctx.quadraticCurveTo(14, browY - 3, 19, browY + 1);
    } else {
      ctx.moveTo(-10, browY); ctx.quadraticCurveTo(-3, browY - 4, 4, browY - 0.5);
      ctx.moveTo(7, browY - 0.5); ctx.quadraticCurveTo(13, browY - 4, 19, browY + 0.5);
    }
    ctx.stroke();

    // headlight
    ctx.fillStyle = '#fff6b0'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(67, -37, 5.5, 3.4, -0.25, 0, TAU); ctx.fill(); ctx.stroke();
    // tail light
    ctx.fillStyle = '#ffb02e'; rr(ctx, -67, -40, 4, 8, 2); ctx.fill(); ctx.stroke();

    // mouth on front bumper
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT;
    if (mouth === 'oops') {
      ctx.fillStyle = '#5c0a10';
      ctx.beginPath(); ctx.ellipse(67, -24, 4, 5.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (mouth === 'happy') {
      ctx.beginPath(); ctx.moveTo(53, -32); ctx.quadraticCurveTo(62, -8, 76, -25); ctx.quadraticCurveTo(65, -27, 53, -32); ctx.closePath();
      ctx.fillStyle = '#5c0a10'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(64, -15, 8, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(53, -32); ctx.quadraticCurveTo(65, -27, 76, -25); ctx.lineTo(76, -29); ctx.lineTo(53, -36); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(53, -32); ctx.quadraticCurveTo(62, -8, 76, -25); ctx.quadraticCurveTo(65, -27, 53, -32); ctx.closePath(); ctx.stroke();
    } else {
      const mp = () => { ctx.beginPath(); ctx.moveTo(55, -30); ctx.quadraticCurveTo(64, -15, 76, -25); ctx.quadraticCurveTo(66, -23, 55, -30); ctx.closePath(); };
      mp(); ctx.fillStyle = '#5c0a10'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(66, -17, 6, 3.5, 0, 0, TAU); ctx.fill(); ctx.restore();
      mp(); ctx.stroke();
    }
    // cheek blush
    ctx.fillStyle = 'rgba(255,170,190,0.55)';
    ctx.beginPath(); ctx.ellipse(56, -36, 4.5, 2.5, 0, 0, TAU); ctx.fill();

    // door decal: yellow star with a 7
    ctx.fillStyle = '#ffffff';
    starPath(ctx, -10, -33, 14.5, 7.2, 0); ctx.fill();
    starPath(ctx, -10, -33, 12, 5.8, 0);
    ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.strokeStyle = '#e08a00'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#d4101c';
    ctx.font = '900 12px ui-rounded, "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('7', -10, -32);
    // door line
    ctx.strokeStyle = 'rgba(74,11,16,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(22, -48); ctx.quadraticCurveTo(24, -34, 20, -18); ctx.stroke();

    // sweat drop when oops
    if (face === 'oops') {
      ctx.fillStyle = '#8fd8ff'; ctx.strokeStyle = '#2b7de9'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(26, -84); ctx.quadraticCurveTo(33, -74, 29, -71); ctx.quadraticCurveTo(22, -72, 26, -84); ctx.fill(); ctx.stroke();
    }
    ctx.restore(); // body group

    // wheels
    wheel(ctx, -36, -15, 15, rot, '#cfd6dd', '#e3141f', false);
    wheel(ctx, 38, -15, 15, rot, '#cfd6dd', '#e3141f', false);
    ctx.restore();
  }

  /* ---------- friendly monster truck ---------- */
  const TRUCK_COLORS = [
    { body: '#2f86ff', light: '#7cc0ff', dark: '#1550a8', rim: '#ffd21f' },
    { body: '#2ecc71', light: '#8ff0b3', dark: '#16834a', rim: '#ff8a1f' },
    { body: '#9b59ff', light: '#cfa8ff', dark: '#5b2aa8', rim: '#5ef0ff' },
    { body: '#ff9f1a', light: '#ffd27a', dark: '#b8620a', rim: '#2f86ff' },
  ];

  function drawTruck(ctx, o) {
    o = o || {};
    const c = o.palette || TRUCK_COLORS[(o.color || 0) % TRUCK_COLORS.length];
    const OUT = '#1d1a2e';
    const face = o.face || 'normal';
    const rot = o.wheelRot || 0;
    const b = o.bounce || 0;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // suspension springs
    ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 4;
    for (const wx of [-55, 55]) {
      ctx.beginPath(); ctx.moveTo(wx, -34);
      const top = -82 - b, n = 6;
      for (let i = 1; i <= n; i++) ctx.lineTo(wx + (i % 2 ? 7 : -7), -34 + (top + 34) * i / n);
      ctx.stroke();
    }
    ctx.fillStyle = '#555b66'; rr(ctx, -60, -40, 120, 8, 4); ctx.fill();

    ctx.save(); ctx.translate(0, -b);
    // cab
    ctx.beginPath();
    ctx.moveTo(-36, -110); ctx.lineTo(-36, -138); ctx.quadraticCurveTo(-36, -152, -22, -152);
    ctx.lineTo(18, -152); ctx.quadraticCurveTo(30, -152, 36, -138); ctx.lineTo(46, -110); ctx.closePath();
    ctx.fillStyle = c.body; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
    // light bar
    ctx.fillStyle = '#333'; rr(ctx, -24, -159, 44, 6, 3); ctx.fill();
    for (const lx of [-16, -2, 12]) {
      ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(lx, -160, 5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // windshield
    ctx.beginPath();
    ctx.moveTo(-4, -114); ctx.lineTo(-4, -144); ctx.lineTo(18, -145); ctx.quadraticCurveTo(26, -145, 30, -136); ctx.lineTo(38, -114); ctx.closePath();
    const gg = ctx.createLinearGradient(0, -145, 0, -114); gg.addColorStop(0, '#e2f8ff'); gg.addColorStop(1, '#8fd6f7');
    ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
    // side window
    rr(ctx, -30, -144, 20, 28, 6); ctx.fill(); ctx.stroke();
    const ey = { blink: o.blink || 0, mood: face, lx: o.lookX == null ? 1 : o.lookX, closed: face === 'sleep', lidColor: c.body, dark: OUT, iris: '#3a2a1a', lidBase: face === 'normal' ? 0.1 : 0 };
    eye(ctx, 7, -129, 9.5, 12, ey);
    eye(ctx, 24, -128, 8.5, 11.5, ey);

    // body
    rr(ctx, -88, -114, 178, 38, 14);
    const bg = ctx.createLinearGradient(0, -114, 0, -76); bg.addColorStop(0, c.light); bg.addColorStop(0.35, c.body); bg.addColorStop(1, c.dark);
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
    // decal: zigzag stripe + dots
    ctx.save(); rr(ctx, -88, -114, 178, 38, 14); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-90, -95);
    for (let x = -80; x <= 40; x += 16) ctx.lineTo(x, (x / 16) % 2 ? -101 : -89);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-20, -110, 50, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // grille-mouth
    const mouthPath = () => {
      ctx.beginPath();
      if (face === 'oops') { ctx.ellipse(70, -94, 6, 8, 0, 0, TAU); return; }
      ctx.moveTo(50, -103);
      if (face === 'sleep') { ctx.quadraticCurveTo(68, -93, 85, -101); ctx.quadraticCurveTo(68, -97, 50, -103); }
      else { ctx.quadraticCurveTo(67, face === 'happy' ? -70 : -76, 85, -102); ctx.quadraticCurveTo(67, -97, 50, -103); }
      ctx.closePath();
    };
    mouthPath(); ctx.fillStyle = '#3a0f14'; ctx.fill();
    if (face !== 'sleep' && face !== 'oops') {
      ctx.save(); mouthPath(); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillRect(46, -104, 42, 7);
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
      for (let x = 57; x < 85; x += 7) { ctx.beginPath(); ctx.moveTo(x, -104); ctx.lineTo(x, -96); ctx.stroke(); }
      ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(67, -80, 9, 6, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    mouthPath(); ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
    // headlights
    ctx.fillStyle = '#fff6b0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(84, -108, 4, 3.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // blush
    ctx.fillStyle = 'rgba(255,150,180,0.5)';
    ctx.beginPath(); ctx.ellipse(42, -104, 6, 3, 0, 0, TAU); ctx.fill();
    // Zzz
    if (face === 'sleep') {
      const t = o.t || 0;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
      ctx.font = '900 34px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.6 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - p;
        const zx = 44 + p * 34, zy = -165 - p * 50, s = 0.6 + p * 0.6;
        ctx.save(); ctx.translate(zx, zy); ctx.scale(s, s); ctx.strokeText('z', 0, 0); ctx.fillText('z', 0, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    if (face === 'oops') {
      ctx.fillStyle = '#8fd8ff'; ctx.strokeStyle = '#2b7de9'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(36, -158); ctx.quadraticCurveTo(50, -140, 42, -134); ctx.quadraticCurveTo(30, -138, 36, -158); ctx.fill(); ctx.stroke();
    }
    // exhaust stack at the back of the bed. Tip sits near (-96, -162); game.js matches that.
    ctx.fillStyle = '#4b5160'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.6;
    rr(ctx, -104, -148, 20, 46, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2c313c';
    rr(ctx, -110, -162, 32, 16, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.flame ? '#ffd24a' : '#6a5344';
    ctx.beginPath(); ctx.ellipse(-94, -154, 8, 4.5, 0, 0, TAU); ctx.fill();
    if (o.flame) {
      const flick = 0.82 + Math.sin((o.t || 0) * 32) * 0.18;
      ctx.fillStyle = '#ff8a14';
      ctx.beginPath(); ctx.ellipse(-108, -176, 11 * flick, 16 * flick, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23b';
      ctx.beginPath(); ctx.ellipse(-102, -168, 6 * flick, 10 * flick, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff6c2';
      ctx.beginPath(); ctx.ellipse(-98, -162, 3, 5, -0.3, 0, TAU); ctx.fill();
    }
    ctx.restore();

    wheel(ctx, -55, -34, 34, rot, c.rim, c.dark, true);
    wheel(ctx, 55, -34, 34, rot, c.rim, c.dark, true);
    ctx.restore();
  }

  /* ---------- small things ---------- */
  function drawStar(ctx, x, y, r, rot, happy) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.lineJoin = 'round';
    starPath(ctx, 0, 0, r, r * 0.5, 0);
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 1, 0, 0, r);
    g.addColorStop(0, '#fffbd0'); g.addColorStop(0.5, '#ffe14a'); g.addColorStop(1, '#ffb800');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#e07b00'; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.stroke();
    // face
    ctx.fillStyle = '#3a2200';
    ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.05, r * 0.08, r * 0.13, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.05, r * 0.08, r * 0.13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a2200'; ctx.lineWidth = Math.max(1.2, r * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, r * 0.1, r * (happy ? 0.2 : 0.15), 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.5)';
    ctx.beginPath(); ctx.arc(-r * 0.36, r * 0.12, r * 0.09, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.36, r * 0.12, r * 0.09, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCone(ctx, t, crush) {
    crush = crush || 0;
    ctx.save(); ctx.lineJoin = 'round';
    // Standing cone squashes away; a wide pancake with a dizzy face takes its place.
    const stand = crush <= 0.02 ? 1 : Math.max(0, 1 - (crush - 0.02) / 0.78);
    if (stand > 0.02) {
      ctx.save();
      ctx.globalAlpha = stand;
      if (crush > 0.001) ctx.scale(1 + crush * 1.05, 1 - crush * 0.86);
      ctx.fillStyle = '#e8590c'; ctx.strokeStyle = '#7a2a00'; ctx.lineWidth = 2;
      rr(ctx, -19, -7, 38, 7, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -6); ctx.lineTo(-4, -42); ctx.quadraticCurveTo(0, -46, 4, -42); ctx.lineTo(14, -6); ctx.closePath();
      const g = ctx.createLinearGradient(-14, 0, 14, 0); g.addColorStop(0, '#ff9a3c'); g.addColorStop(1, '#f06a10');
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-20, -21, 40, 6); ctx.fillRect(-20, -36, 40, 4);
      ctx.restore();
      ctx.stroke();
      if (crush < 0.45) {
        const blink = (Math.sin((t || 0) * 1.3) > 0.97) ? 0.2 : 1;
        ctx.fillStyle = '#2a1200';
        ctx.beginPath(); ctx.ellipse(-3.5, -27, 1.8, 2.6 * blink, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3.5, -27, 1.8, 2.6 * blink, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2a1200'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, -11, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
      ctx.restore();
    }
    if (crush > 0.28) {
      const a = Math.min(1, (crush - 0.28) / 0.42);
      const spread = 0.78 + 0.22 * Math.min(1, crush);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.scale(spread, 0.62 + 0.38 * Math.min(1, crush));
      // road shadow + wide orange splat, outlined so it reads on the dirt
      ctx.fillStyle = 'rgba(80, 40, 10, 0.35)';
      ctx.beginPath(); ctx.ellipse(3, 6, 64, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8590c'; ctx.strokeStyle = '#5a2200'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, -10, 60, 16, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb15a';
      ctx.beginPath(); ctx.ellipse(-16, -16, 24, 6, -0.15, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, -10, 60, 16, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-66, -16, 132, 7);
      ctx.fillRect(-66, -4, 132, 5);
      ctx.restore();
      // dizzy eyes
      function dizzyEye(x, y, spin) {
        ctx.fillStyle = '#fffef6'; ctx.strokeStyle = '#2a1200'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#2a1200'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, 6.2, spin, spin + 4.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 3.1, spin + 1.4, spin + 4.2); ctx.stroke();
        ctx.fillStyle = '#2a1200';
        ctx.beginPath(); ctx.arc(x + Math.cos(spin) * 1.4, y + Math.sin(spin) * 1.4, 2.1, 0, TAU); ctx.fill();
      }
      dizzyEye(-20, -14, 0.4);
      dizzyEye(18, -13, 2.2);
      // tongue sticking out of the splat
      ctx.fillStyle = '#ff5d84'; ctx.strokeStyle = '#7a2040'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(14, 2, 14, 8, 0.35, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd0dc'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(6, -1); ctx.quadraticCurveTo(16, 4, 22, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawRock(ctx, crush) {
    crush = crush || 0;
    ctx.save(); ctx.lineJoin = 'round';
    ctx.save();
    if (crush > 0.001) {
      ctx.translate(0, crush * 18);
      ctx.scale(1 + crush * 0.22, 1 - crush * 0.78);
    }
    ctx.beginPath();
    ctx.moveTo(-24, 0); ctx.quadraticCurveTo(-28, -18, -14, -28); ctx.quadraticCurveTo(-2, -38, 12, -30);
    ctx.quadraticCurveTo(26, -24, 25, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -36, 0, 0); g.addColorStop(0, '#c4c9d1'); g.addColorStop(1, '#7d8591');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#3d434c'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-8, -25, 7, 3, -0.4, 0, TAU); ctx.fill();
    // moss + flower
    ctx.fillStyle = '#5cc04a'; ctx.beginPath(); ctx.ellipse(6, -31, 9, 3.5, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff6fae'; for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(8 + Math.cos(a) * 3, -37 + Math.sin(a) * 3, 2.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(8, -37, 1.8, 0, TAU); ctx.fill();
    // sleepy face
    ctx.strokeStyle = '#2d3238'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-7, -16, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(5, -16, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(-1, -9, 2.5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    if (crush > 0.2) {
      ctx.strokeStyle = '#2a261f'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -20); ctx.lineTo(2, -8); ctx.lineTo(-2, -2);
      ctx.moveTo(6, -24); ctx.lineTo(14, -12);
      ctx.stroke();
    }
    ctx.restore();
    if (crush > 0.15) {
      ctx.globalAlpha = Math.min(1, crush);
      ctx.fillStyle = 'rgba(70, 48, 28, 0.4)';
      ctx.beginPath(); ctx.ellipse(0, 3, 28 + crush * 10, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a3228'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(-22, 12); ctx.lineTo(-34, 8);
      ctx.moveTo(4, 0); ctx.lineTo(20, 14); ctx.lineTo(32, 9);
      ctx.moveTo(0, 1); ctx.lineTo(2, 16);
      ctx.moveTo(-14, 2); ctx.lineTo(-18, 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPuddle(ctx, w, t) {
    ctx.save();
    ctx.fillStyle = '#3d8fe0';
    ctx.beginPath(); ctx.ellipse(0, 2, w / 2, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6fbcff';
    ctx.beginPath(); ctx.ellipse(-4, 0, w / 2 - 8, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    const p = ((t || 0) * 0.8) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath(); ctx.ellipse(6, 0, 6 + p * 18, 1.5 + p * 3, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(-w * 0.22, -1, 8, 1.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawSun(ctx, x, y, r, t, color) {
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.rotate(t * 0.15);
    ctx.fillStyle = color; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath(); ctx.moveTo(-r * 0.18, -r * 1.12); ctx.lineTo(0, -r * 1.55 - Math.sin(t * 2 + i) * r * 0.08); ctx.lineTo(r * 0.18, -r * 1.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(1, color);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a4a00';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.12, r * 0.07, r * 0.11, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.12, r * 0.07, r * 0.11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.32, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,130,100,0.45)';
    ctx.beginPath(); ctx.arc(-r * 0.52, r * 0.18, r * 0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.52, r * 0.18, r * 0.12, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCloud(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,40,90,0.08)';
    ctx.beginPath(); ctx.ellipse(4, 14, 58, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-30, 4, 20, 0, TAU); ctx.arc(-8, -10, 26, 0, TAU); ctx.arc(20, -4, 22, 0, TAU); ctx.arc(40, 6, 16, 0, TAU);
    ctx.fill();
    rr(ctx, -48, 0, 102, 22, 11); ctx.fill();
    ctx.restore();
  }

  function drawTree(ctx, x, y, s, leaf, leafDark) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#8a5a2b'; rr(ctx, -4, -30, 8, 32, 3); ctx.fill();
    ctx.fillStyle = leafDark;
    ctx.beginPath(); ctx.arc(0, -40, 20, 0, TAU); ctx.arc(-14, -30, 13, 0, TAU); ctx.arc(14, -30, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.arc(-2, -43, 16, 0, TAU); ctx.arc(-13, -33, 10, 0, TAU); ctx.arc(11, -34, 10, 0, TAU); ctx.fill();
    ctx.restore();
  }

  window.Art = { rr, eye, wheel, starPath, drawCar, drawTruck, drawStar, drawCone, drawRock, drawPuddle, drawSun, drawCloud, drawTree, TRUCK_COLORS };
})();
