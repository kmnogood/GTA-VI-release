(() => {
'use strict';

/* ───────────── Setup ───────────── */
const view  = document.getElementById('view');
const vctx  = view.getContext('2d');
const scene = document.createElement('canvas');   // Hintergrund + Logo (wird von den Tropfen "gebrochen")
const sctx  = scene.getContext('2d');
const trail = document.createElement('canvas');   // nasse Spuren
const tctx  = trail.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const TAU = Math.PI * 2;
const rnd   = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease  = t => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };

let W = 0, H = 0, dpr = 1, S = 1, OX = 0, OY = 0, U = 1;
let vignette = null;

/* ───────────── Logo-Geometrie (Einheiten 0–470) ───────────── */
const V   = new Path2D('M96 150 H168 L189 268 L210 150 H282 L189 346 Z');
const I   = new Path2D('M298 150 H356 V346 H298 Z');
const ALL = new Path2D(); ALL.addPath(V); ALL.addPath(I);
const CX = 227, CY = 248;

/* Palmen: Winkel in Grad (0 = rechts, 90 = oben), Länge, Durchhang */
const CROWN = [
  { a: 176, len: 74, droop: .55 }, { a: 150, len: 86, droop: .45 }, { a: 124, len: 80, droop: .30 },
  { a: 96,  len: 70, droop: .16 }, { a: 66,  len: 82, droop: .30 }, { a: 38,  len: 88, droop: .45 },
  { a: 10,  len: 76, droop: .55 }
];
const PALMS = [
  { x: 136, y: 226, s: 1.00, ph: 0.0, lean: -10 },
  { x: 244, y: 238, s: 1.10, ph: 1.9, lean:  12 },
  { x: 327, y: 222, s: 0.85, ph: 3.7, lean:  -6 }
];

/* Bokeh-Lichter im Hintergrund */
const COLORS = ['255,63,200', '74,107,255', '255,150,70', '130,70,255'];
const bokeh = Array.from({ length: 18 }, () => ({
  x: Math.random(), y: Math.random(), r: rnd(.05, .17), a: rnd(.04, .11),
  c: COLORS[(Math.random() * COLORS.length) | 0], sp: rnd(.08, .25), ph: rnd(0, TAU), z: rnd(.2, 1)
}));

/* ───────────── Zustand ───────────── */
let drops = [];      // ruhende Tropfen {x,y,r,born}
let runners = [];    // herunterlaufende Tropfen
let rivulet = null;  // dünnes Rinnsal rechts oben
let flash = 0, nextThunder = 9, frame = 0;
const par = { x: 0, y: 0, tx: 0, ty: 0, lastMove: -99 };

/* ───────────── Größe ───────────── */
function layout() {
  const cd = document.getElementById('countdown');
  const reserve = cd ? Math.max(0, innerHeight - cd.getBoundingClientRect().top) * dpr : 0;
  const top = H * .035, availH = Math.max(H - reserve - top, H * .4);
  S  = Math.min(W / 330, availH / 292) * .92;
  OX = W / 2 - CX * S;
  OY = top + availH / 2 - CY * S;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  W = Math.round(innerWidth * dpr);  H = Math.round(innerHeight * dpr);
  for (const c of [view, scene, trail]) { c.width = W; c.height = H; }
  layout();
  U  = dpr * Math.max(.8, Math.min(innerWidth, innerHeight) / 900);

  vignette = vctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.62)');

  // Tropfen neu verteilen
  drops = []; runners = []; rivulet = null;
  const area = innerWidth * innerHeight;
  const add = (n, a, b) => { for (let i = 0; i < n; i++) drops.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(a, b) * U, born: -10 }); };
  add(Math.round(area / 6000),   1.0, 2.6);
  add(Math.round(area / 12000), 3.4, 7);
  add(Math.round(area / 60000), 8, 15);
}

/* ───────────── Palmen ───────────── */
function frond(c, a, len, droop) {
  const steps = 14, pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push({ x: Math.cos(a) * len * u, y: -Math.sin(a) * len * u + droop * len * u * u });
  }
  c.beginPath();
  for (let i = 1; i <= steps; i++) {
    const p = pts[i], q = pts[i - 1];
    let tx = p.x - q.x, ty = p.y - q.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, u = i / steps;
    const L = len * .32 * (1 - .62 * u) * Math.min(1, u * 5), w = len * .028;
    for (const side of [-1, 1]) {
      let dx = tx * .5 + nx * .85 * side, dy = ty * .5 + ny * .85 * side + .55;
      const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
      c.moveTo(p.x - tx * w, p.y - ty * w);
      c.lineTo(p.x + dx * L, p.y + dy * L);
      c.lineTo(p.x + tx * w, p.y + ty * w);
    }
  }
  c.fill();
  c.beginPath(); c.moveTo(0, 0);
  for (let i = 1; i <= steps; i++) c.lineTo(pts[i].x, pts[i].y);
  c.lineWidth = len * .022; c.stroke();
}
function palm(c, p, t, alpha) {
  c.save();
  c.translate(p.x + par.x * 5, p.y + par.y * 3);
  c.scale(p.s, p.s);
  c.globalAlpha = alpha;
  c.fillStyle = c.strokeStyle = '#3a0f66';
  // Stamm
  c.beginPath(); c.moveTo(0, 0);
  c.quadraticCurveTo(p.lean * .5, 70, p.lean * 1.4, 150);
  c.lineWidth = 4.5; c.stroke();
  for (const f of CROWN) {
    const sway = Math.sin(t * 1.15 + p.ph + f.a * .02) * .06 + Math.sin(t * .5 + p.ph) * .03;
    frond(c, f.a * Math.PI / 180 + sway, f.len, f.droop);
  }
  c.restore();
}

/* ───────────── Funkeln ───────────── */
function star(c, x, y, s, a, rot) {
  c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 22 * s);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.35, 'rgba(255,170,240,.35)'); g.addColorStop(1, 'rgba(255,100,220,0)');
  c.fillStyle = g; c.fillRect(-22 * s, -22 * s, 44 * s, 44 * s);
  c.rotate(rot); c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(0, -30 * s); c.lineTo(2.2 * s, -2.2 * s); c.lineTo(30 * s, 0); c.lineTo(2.2 * s, 2.2 * s);
  c.lineTo(0, 30 * s); c.lineTo(-2.2 * s, 2.2 * s); c.lineTo(-30 * s, 0); c.lineTo(-2.2 * s, -2.2 * s);
  c.closePath(); c.fill();
  c.restore();
}

/* ───────────── Szene (Hintergrund + Logo) ───────────── */
function drawScene(t) {
  const c = sctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.shadowBlur = 0;

  // Hintergrund
  let g = c.createRadialGradient(W / 2, H * .44, 0, W / 2, H * .44, Math.max(W, H) * .8);
  g.addColorStop(0, '#42245f'); g.addColorStop(.4, '#201131'); g.addColorStop(1, '#06030a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // Bokeh
  c.globalCompositeOperation = 'lighter';
  for (const b of bokeh) {
    const x = (b.x + Math.sin(t * b.sp + b.ph) * .03) * W + par.x * b.z * dpr * 40;
    const y = (b.y + Math.cos(t * b.sp * .8 + b.ph) * .03) * H + par.y * b.z * dpr * 25;
    const r = b.r * Math.min(W, H) * 1.2;
    const gg = c.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, `rgba(${b.c},${b.a})`); gg.addColorStop(1, `rgba(${b.c},0)`);
    c.fillStyle = gg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  c.globalCompositeOperation = 'source-over';

  const pulse = .86 + .14 * Math.sin(t * 1.6) + flash * .6;
  const ie = ease((t - 1.2) / 1.5);

  c.save();
  lastTx = OX + par.x * 12 * dpr; lastTy = OY + par.y * 8 * dpr; lastS = S;
  c.translate(lastTx, lastTy);
  c.scale(S, S);

  // Leuchten hinter dem Logo
  c.globalCompositeOperation = 'lighter';
  g = c.createRadialGradient(CX, CY, 0, CX, CY, 270);
  g.addColorStop(0, `rgba(255,70,210,${.30 * pulse * ie})`);
  g.addColorStop(.5, `rgba(120,60,255,${.12 * pulse * ie})`);
  g.addColorStop(1, 'rgba(120,60,255,0)');
  c.fillStyle = g; c.fillRect(-100, -100, 700, 700);
  c.globalCompositeOperation = 'source-over';

  // Neon-Kontur (flackert beim Start an)
  const oa = t < .4 ? 0 : t > 1.9 ? 1 : (Math.sin(t * 47) + Math.sin(t * 23 + 1) > .1 ? 1 : .12) * ease((t - .4) / .4);
  c.lineJoin = 'miter'; c.miterLimit = 6; c.globalAlpha = oa;
  c.strokeStyle = '#4f1478'; c.lineWidth = 26; c.stroke(ALL);
  const rim = c.createLinearGradient(0, 140, 0, 360);
  rim.addColorStop(0, '#ff9af0'); rim.addColorStop(.5, '#ff45cf'); rim.addColorStop(1, '#ff5fa0');
  c.shadowColor = 'rgba(255,50,210,.9)'; c.shadowBlur = (22 + 10 * pulse) * dpr;
  c.strokeStyle = rim; c.lineWidth = 13; c.stroke(ALL);
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,225,250,.9)'; c.lineWidth = 3; c.stroke(ALL);
  c.globalAlpha = 1;

  // Füllung (steigt von unten auf)
  const fa = ease((t - 1.6) / 1.5);
  const revealY = 360 - fa * 220;
  c.save();
  c.clip(ALL);
  c.beginPath(); c.rect(0, revealY, 470, 400); c.clip();

  const drift = Math.sin(t * .6) * 16;
  const fg = c.createLinearGradient(0, 146 + drift, 0, 352 + drift);
  fg.addColorStop(0, '#4c70ff'); fg.addColorStop(.36, '#b13cff'); fg.addColorStop(.62, '#ff3fc4');
  fg.addColorStop(.84, '#ff8a5c'); fg.addColorStop(1, '#ffc04a');
  c.fillStyle = fg; c.fillRect(0, 120, 470, 260);

  // Palmen-Silhouetten
  const pa = .4 * ease((t - 2.3) / 1.4);
  if (pa > 0) for (const p of PALMS) palm(c, p, t, pa);
  c.globalAlpha = 1;

  // Glanz oben
  const gl = c.createLinearGradient(0, 146, 0, 260);
  gl.addColorStop(0, 'rgba(255,255,255,.16)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(0, 146, 470, 120);

  // Innenkante: unten orange
  const ig = c.createLinearGradient(0, 146, 0, 350);
  ig.addColorStop(0, 'rgba(255,255,255,0)'); ig.addColorStop(.6, 'rgba(255,120,200,.06)'); ig.addColorStop(1, 'rgba(255,200,90,.55)');
  c.strokeStyle = ig; c.lineWidth = 9; c.stroke(ALL);

  // Lichtstreifen
  if (t > 3) {
    const s = ((t - 3) % 7.5) / 3.4;
    if (s < 1.9) {
      c.save(); c.transform(1, 0, -.36, 1, 0, 0);
      const sx = -140 + s * 520;
      const sg = c.createLinearGradient(sx, 0, sx + 70, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,.34)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sg; c.fillRect(sx, 130, 70, 240);
      c.restore();
    }
  }
  c.restore();
  fwLetterLight(c);

  // Funkeln
  if (t > 2.2) {
    const k = ease((t - 2.2) / .6);
    const a1 = k * (.55 + .45 * Math.sin(t * 2.3) ** 2), a2 = k * (.35 + .65 * Math.sin(t * 1.7 + 1.5) ** 2);
    star(c, 291, 148, .75 + .35 * a1, a1, t * .25);
    star(c, 132, 154, .4 + .25 * a2, a2, -t * .3);
  }
  c.restore();
  fwDraw(c);

  // Blitz
  if (flash > .01) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(255,190,255,${flash * .22})`; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  }
}

/* ───────────── Tropfen ───────────── */
function drawDrop(c, d, t) {
  const x = d.x, y = d.y, r = d.r;
  const a = clamp((t - d.born) / .6, 0, 1);
  if (a <= 0) return;
  c.save(); c.globalAlpha = a;

  if (r < 2.6 * U) {                       // winzig: einfacher Punkt
    c.fillStyle = 'rgba(8,3,16,.55)';
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.arc(x - r * .3, y - r * .35, Math.max(.6, r * .28), 0, TAU); c.fill();
    c.restore(); return;
  }

  // Schatten unter dem Tropfen
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.beginPath(); c.arc(x + r * .08, y + r * .2, r * 1.04, 0, TAU); c.fill();

  // Brechung: verkleinertes, auf den Kopf gestelltes Abbild der Szene
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  const z = 1.75, sr = r / z;
  c.translate(x, y); c.scale(-1, -1);
  c.drawImage(scene, x - sr, y - sr, sr * 2, sr * 2, -r, -r, r * 2, r * 2);
  c.setTransform(1, 0, 0, 1, 0, 0);
  // Rand abdunkeln
  const sh = c.createRadialGradient(x, y, r * .35, x, y, r);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(.75, 'rgba(10,0,25,.25)'); sh.addColorStop(1, 'rgba(0,0,0,.6)');
  c.fillStyle = sh; c.fillRect(x - r, y - r, r * 2, r * 2);
  // Licht, das unten rechts gebündelt wird
  c.globalCompositeOperation = 'lighter';
  const cg = c.createRadialGradient(x + r * .35, y + r * .42, 0, x + r * .35, y + r * .42, r * .7);
  cg.addColorStop(0, 'rgba(255,170,240,.38)'); cg.addColorStop(1, 'rgba(255,170,240,0)');
  c.fillStyle = cg; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();

  // Lichtkante + Glanzpunkt
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, r * .14); c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, r * .84, Math.PI * .95, Math.PI * 1.55); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = Math.max(1, dpr);
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.95)';
  c.beginPath(); c.arc(x - r * .38, y - r * .42, Math.max(.8, r * .13), 0, TAU); c.fill();
  c.restore();
}

/* ───────────── Logik ───────────── */
function makeRunner(x, y, r) {
  const k = clamp(r / (6 * U), .6, 1.6);
  runners.push({ x, y, px: x, py: y, r, v: .25 * U, vmax: rnd(2.2, 5.2) * U * k, stuck: rnd(10, 60),
                 wob: rnd(0, 6), dist: 0, next: rnd(40, 90) * U });
}
function spawnRunner(t) {
  const big = drops.filter(d => d.r > 5 * U);
  if (big.length && Math.random() < .7) {
    const d = big[(Math.random() * big.length) | 0];
    drops.splice(drops.indexOf(d), 1);
    makeRunner(d.x, d.y, d.r);
  } else {
    makeRunner(rnd(0, W), rnd(0, H * .55), rnd(5, 9) * U);
  }
}
function startRivulet() {
  rivulet = { x0: W * (.80 + Math.random() * .08), y: -4, v: (H / 780) * rnd(.9, 1.5), seed: rnd(0, 10), px: 0, py: -4, wait: 0 };
}
function storm(t) {
  flash = 1;
  for (let i = 0; i < 9; i++) makeRunner(rnd(0, W), rnd(0, H * .5), rnd(5, 10) * U);
  for (let i = 0; i < 70; i++) drops.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 4.5) * U, born: t + rnd(0, .8) });
  while (drops.length > 760) drops.shift();
}

function update(dt, t) {
  fwUpdate(dt / 60, t);
  // Parallax
  if (t - par.lastMove > 3.5) { par.tx = Math.sin(t * .31) * .6; par.ty = Math.cos(t * .23) * .4; }
  par.x += (par.tx - par.x) * .05 * dt;  par.y += (par.ty - par.y) * .05 * dt;

  // Blitz
  flash *= Math.pow(.93, dt);
  if (t > nextThunder) {
    nextThunder = t + rnd(14, 26);
    flash = .8; setTimeout(() => { flash = Math.max(flash, .55); }, 170);
  }

  // Spuren verblassen langsam
  if (frame % 20 === 0) {
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0,0,0,.045)'; tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = 'source-over';
  }

  // Laufende Tropfen
  if (runners.length < 5 && Math.random() < .012 * dt) spawnRunner(t);
  for (let i = runners.length - 1; i >= 0; i--) {
    const p = runners[i];
    p.px = p.x; p.py = p.y;
    if (p.stuck > 0) p.stuck -= dt;
    else {
      p.v = Math.min(p.vmax, p.v * Math.pow(1.04, dt) + .02 * U * dt);
      p.y += p.v * dt; p.wob += .08 * dt; p.x += Math.sin(p.wob) * .3 * U * dt;
      p.dist += p.v * dt;
      if (p.dist > p.next) {                       // kleiner Resttropfen bleibt hängen
        p.dist = 0; p.next = rnd(40, 100) * U;
        drops.push({ x: p.x + rnd(-1, 1) * U, y: p.y - p.r, r: p.r * rnd(.2, .42), born: t });
        p.r *= .985;
      }
      if (Math.random() < .012 * dt) {             // bleibt kurz hängen – oder bleibt für immer
        if (Math.random() < .14) { drops.push({ x: p.x, y: p.y, r: p.r, born: -10 }); runners.splice(i, 1); continue; }
        p.stuck = rnd(8, 40); p.v *= .3;
      }
    }
    // Spur
    tctx.strokeStyle = 'rgba(255,235,255,.055)'; tctx.lineCap = 'round'; tctx.lineWidth = p.r * .7;
    tctx.beginPath(); tctx.moveTo(p.px, p.py); tctx.lineTo(p.x, p.y); tctx.stroke();
    // Tropfen einsammeln
    for (let j = drops.length - 1; j >= 0; j--) {
      const d = drops[j];
      if (d.r < p.r && Math.hypot(d.x - p.x, d.y - p.y) < p.r + d.r * .7) {
        p.r = Math.min(Math.sqrt(p.r * p.r + d.r * d.r * .35), 15 * U);
        drops.splice(j, 1);
      }
    }
    if (p.y - p.r > H) runners.splice(i, 1);
  }

  // Rinnsal rechts oben
  if (!rivulet) { if (Math.random() < .004 * dt) startRivulet(); }
  else if (rivulet.wait > 0) { rivulet.wait -= dt; if (rivulet.wait <= 0) rivulet = null; }
  else {
    const r = rivulet; r.px = r.x || r.x0; r.py = r.y; r.y += r.v * dt * dpr;
    r.x = r.x0 + (Math.sin(r.y * .021 + r.seed) * 6 + Math.sin(r.y * .007 + r.seed * 2) * 11) * U;
    if (r.px === 0) r.px = r.x;
    tctx.strokeStyle = 'rgba(255,240,255,.13)'; tctx.lineWidth = 1.6 * U; tctx.lineCap = 'round';
    tctx.beginPath(); tctx.moveTo(r.px, r.py); tctx.lineTo(r.x, r.y); tctx.stroke();
    if (r.y > H + 10) r.wait = 1;
  }

  while (drops.length > 760) drops.shift();
}


/* ───────────── Feuerwerk ───────────── */
const fw = { on: false, queue: [], next: 0, rockets: [], parts: [], lights: [], smoke: [] };
let lastTx = 0, lastTy = 0, lastS = 1;

const PAL = [
  { h: 322, s: 100 }, { h: 300, s: 100 }, { h: 222, s: 100 }, { h: 190, s: 100 },
  { h: 44,  s: 100 }, { h: 24,  s: 100 }, { h: 270, s: 100 }, { h: 0, s: 0 }
];
const GOLD = { h: 42, s: 100 };
const TYPES = [
  { name: 'peony',  w: 4, n: 150, tl: 4,  life: [1.5, 2.1], size: [1.3, 2.0], drag: 1.7, glit: .10, two: .4 },
  { name: 'chrys',  w: 3, n: 130, tl: 9,  life: [2.0, 2.7], size: [1.2, 1.8], drag: 1.8, glit: .25, emit: 10 },
  { name: 'willow', w: 3, n: 105, tl: 15, life: [3.2, 4.2], size: [1.4, 2.0], drag: 2.5, glit: .50, emit: 16, gold: true, g: .55 },
  { name: 'ring',   w: 2, n: 80,  tl: 5,  life: [1.5, 2.0], size: [1.5, 2.2], drag: 1.7, glit: .10, ring: true },
  { name: 'crackle',w: 2, n: 95,  tl: 4,  life: [1.2, 1.9], size: [1.2, 1.7], drag: 1.9, glit: 1.0, pop: true }
];
const pickType = () => {
  let r = Math.random() * TYPES.reduce((a, t) => a + t.w, 0);
  for (const t of TYPES) { if ((r -= t.w) <= 0) return t; }
  return TYPES[0];
};

function pickTarget() {
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 40; i++) {
    const inV = Math.random() < .62;
    const lx = inV ? rnd(108, 270) : rnd(306, 348), ly = rnd(168, 300);
    if (sctx.isPointInPath(ALL, lx, ly)) return { x: lastTx + lx * lastS, y: lastTy + ly * lastS };
  }
  return { x: lastTx + CX * lastS, y: lastTy + 230 * lastS };
}

function launchRocket(tx, ty) {
  if (tx === undefined) { const p = pickTarget(); tx = p.x; ty = p.y; }
  const g = 420 * U, Tf = rnd(1.45, 1.8);
  const x0 = tx + rnd(-130, 130) * U, y0 = H + 12 * U;
  fw.rockets.push({ x: x0, y: y0, vx: (tx - x0) / Tf, vy: (ty - y0 - .5 * g * Tf * Tf) / Tf, g, t: 0, Tf });
}

function addPart(o) { if (fw.parts.length < 7000) { o.xs = [o.x]; o.ys = [o.y]; o.max = o.life; fw.parts.push(o); } }

function explode(x, y) {
  const T = pickType(), size = rnd(.85, 1.15);
  const R = rnd(78, 125) * lastS * size;
  const v0 = R * T.drag / .97;
  const c1 = T.gold ? GOLD : PAL[(Math.random() * PAL.length) | 0];
  let c2 = PAL[(Math.random() * PAL.length) | 0];
  if (c2 === c1) c2 = PAL[(PAL.indexOf(c1) + 3) % PAL.length];
  const n = Math.round(T.n * rnd(.85, 1.15));
  const tilt = rnd(.25, 1), rot = rnd(0, TAU);

  fw.lights.push({ x, y, r: 330 * lastS * size, h: c1.h, sat: c1.s, life: .45, max: .45 });
  for (let i = 0; i < 5; i++)
    fw.smoke.push({ x: x + rnd(-.5, .5) * R, y: y + rnd(-.5, .5) * R, r: rnd(.35, .6) * R,
                    vx: rnd(-9, 9) * U, vy: rnd(-12, 2) * U, age: 0, max: rnd(5, 8) });
  while (fw.smoke.length > 50) fw.smoke.shift();

  for (let i = 0; i < n; i++) {
    let vx, vy, rr = 1;
    if (T.ring) {
      const a = (i / n) * TAU + rnd(-.03, .03), sp = v0 * rnd(.96, 1);
      const ex = Math.cos(a) * sp, ey = Math.sin(a) * sp * tilt;
      vx = ex * Math.cos(rot) - ey * Math.sin(rot); vy = ex * Math.sin(rot) + ey * Math.cos(rot);
    } else {
      const z = rnd(-1, 1); rr = Math.sqrt(1 - z * z);       // Kugelschale, von vorn gesehen
      const th = rnd(0, TAU), sp = v0 * (T.name === 'peony' ? rnd(.9, 1) : rnd(.62, 1));
      vx = Math.cos(th) * rr * sp; vy = Math.sin(th) * rr * sp;
    }
    const col = (T.two && rr < .55) ? c2 : c1;
    addPart({
      x, y, vx, vy, life: rnd(T.life[0], T.life[1]), s: rnd(T.size[0], T.size[1]), h: col.h, sat: col.s,
      drag: T.drag * rnd(.92, 1.08), g: (T.g || 1) * 250 * U, tl: T.tl,
      glit: Math.random() < T.glit, warm: !!T.gold, pop: !!T.pop && Math.random() < .55, emit: T.emit || 0
    });
  }
}

function fwStart(t) {
  fw.on = true;
  for (let i = 0, at = t + .25; i < 15; i++) { fw.queue.push(at); at += rnd(.3, .52); }   // großes Finale
  fw.next = t + 9;
}

function fwUpdate(ds, t) {
  if (!fw.on && !fw.parts.length && !fw.rockets.length) return;
  while (fw.queue.length && fw.queue[0] <= t) { fw.queue.shift(); launchRocket(); }
  if (fw.on && !fw.queue.length && t >= fw.next) {
    launchRocket(); if (Math.random() < .3) launchRocket();
    fw.next = t + rnd(.7, 1.6);
  }

  for (let i = fw.rockets.length - 1; i >= 0; i--) {
    const r = fw.rockets[i];
    r.vy += r.g * ds; r.x += r.vx * ds; r.y += r.vy * ds; r.t += ds;
    for (let k = 0; k < 3; k++)                       // Funkenschweif
      addPart({ x: r.x, y: r.y, vx: rnd(-30, 30) * U, vy: rnd(10, 80) * U, life: rnd(.35, .8), s: rnd(.7, 1.2),
                h: 32, sat: 100, drag: 2, g: 200 * U, tl: 3, glit: true, warm: false, pop: false, emit: 0 });
    if (r.t >= r.Tf) { explode(r.x, r.y); fw.rockets.splice(i, 1); }
  }

  for (let i = fw.parts.length - 1; i >= 0; i--) {
    const p = fw.parts[i], d = Math.exp(-p.drag * ds);
    p.vx *= d; p.vy = p.vy * d + p.g * ds;
    p.x += p.vx * ds; p.y += p.vy * ds; p.life -= ds;
    p.xs.push(p.x); p.ys.push(p.y);
    if (p.xs.length > p.tl + 1) { p.xs.shift(); p.ys.shift(); }
    if (p.emit && Math.random() < p.emit * ds)
      addPart({ x: p.x, y: p.y, vx: p.vx * .1 + rnd(-14, 14) * U, vy: p.vy * .1 + rnd(0, 20) * U, life: rnd(.45, .9), s: .7,
                h: p.h, sat: p.sat, drag: 3, g: 120 * U, tl: 2, glit: true, warm: p.warm, pop: false, emit: 0 });
    if (p.life <= 0) {
      if (p.pop) {                                     // Knistern: kleine Nachzünder
        fw.lights.push({ x: p.x, y: p.y, r: 70 * lastS, h: 50, sat: 0, life: .12, max: .12 });
        for (let k = 0; k < 5; k++) {
          const a = rnd(0, TAU), sp = rnd(40, 130) * U;
          addPart({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(.2, .4), s: 1.1,
                    h: 50, sat: 0, drag: 3, g: 150 * U, tl: 2, glit: true, warm: false, pop: false, emit: 0 });
        }
      }
      fw.parts.splice(i, 1);
    }
  }
  for (let i = fw.lights.length - 1; i >= 0; i--) { if ((fw.lights[i].life -= ds) <= 0) fw.lights.splice(i, 1); }
  for (let i = fw.smoke.length - 1; i >= 0; i--) {
    const m = fw.smoke[i]; m.age += ds; m.x += m.vx * ds; m.y += m.vy * ds; m.r += 9 * U * ds;
    if (m.age >= m.max) fw.smoke.splice(i, 1);
  }
}

/* Die Buchstaben leuchten in der Farbe der Explosion auf */
function fwLetterLight(c) {
  if (!fw.lights.length) return;
  c.save(); c.clip(ALL); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
  for (const l of fw.lights) {
    const k = l.life / l.max, a = .2 * k * k, r = l.r * .85;
    const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, `hsla(${l.h},${l.sat}%,62%,${a})`); g.addColorStop(1, `hsla(${l.h},${l.sat}%,50%,0)`);
    c.fillStyle = g; c.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }
  c.restore();
}

function fwDraw(c) {
  if (!fw.parts.length && !fw.rockets.length && !fw.lights.length && !fw.smoke.length) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);

  c.globalCompositeOperation = 'lighter';              // Streulicht im Raum
  for (const l of fw.lights) {
    const k = l.life / l.max, a = .11 * k * k, r = l.r;
    const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, `hsla(${l.h},${l.sat}%,60%,${a})`); g.addColorStop(1, `hsla(${l.h},${l.sat}%,50%,0)`);
    c.fillStyle = g; c.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }

  c.globalCompositeOperation = 'source-over';          // Rauch
  for (const m of fw.smoke) {
    const f = m.age / m.max, a = .05 * Math.min(1, m.age * 3) * (1 - f);
    const g = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
    g.addColorStop(0, `rgba(150,115,185,${a})`); g.addColorStop(1, 'rgba(150,115,185,0)');
    c.fillStyle = g; c.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
  }

  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const r of fw.rockets) {                        // Rakete
    c.strokeStyle = 'rgba(255,235,190,.95)'; c.lineWidth = 2.4 * U;
    c.beginPath(); c.moveTo(r.x - r.vx * .035, r.y - r.vy * .035); c.lineTo(r.x, r.y); c.stroke();
  }
  for (const p of fw.parts) {                          // Funken
    const f = 1 - p.life / p.max;
    let a = f < .65 ? 1 : Math.max(0, 1 - (f - .65) / .35); a = Math.pow(a, 1.3);
    if (p.glit && f > .45 && Math.random() < .5) a *= .2;       // Glitzern
    if (a < .02) continue;
    const l = f < .05 ? 86 : 62 - 18 * ((f - .05) / .95);           // weißglühend → Farbe → Glut
    const h = p.warm ? p.h + (24 - p.h) * f : p.h;
    c.strokeStyle = `hsla(${h | 0},${p.sat}%,${l | 0}%,${a.toFixed(2)})`;
    c.lineWidth = p.s * U * (1 - f * .45);
    const n = p.xs.length;
    if (n < 2) continue;
    c.globalAlpha = .42; c.beginPath(); c.moveTo(p.xs[0], p.ys[0]);
    for (let i = 1; i < n; i++) c.lineTo(p.xs[i], p.ys[i]);
    c.stroke();
    c.globalAlpha = 1; c.lineWidth *= 1.5; c.beginPath(); c.moveTo(p.xs[n - 2], p.ys[n - 2]); c.lineTo(p.xs[n - 1], p.ys[n - 1]); c.stroke();
  }
  c.restore();
}

/* ───────────── Zusammensetzen ───────────── */
function compose(t) {
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.globalCompositeOperation = 'source-over'; vctx.globalAlpha = 1;
  vctx.drawImage(scene, 0, 0);
  vctx.drawImage(trail, 0, 0);
  for (const d of drops) drawDrop(vctx, d, t);
  if (rivulet && rivulet.wait <= 0 && rivulet.y > 0) drawDrop(vctx, { x: rivulet.x, y: rivulet.y, r: 3.3 * U, born: -10 }, t);
  for (const p of runners) drawDrop(vctx, { x: p.x, y: p.y, r: p.r, born: -10 }, t);
  vctx.fillStyle = vignette; vctx.fillRect(0, 0, W, H);
}

/* ───────────── Schleife ───────────── */
let start = performance.now(), last = start;
function loop(now) {
  const dt = clamp((now - last) / 16.667, .2, 3); last = now;
  const t = reduce ? 6 : (now - start) / 1000;
  frame++;
  if (!reduce) update(dt, t);
  drawScene(t);
  compose(t);
  if (!reduce) requestAnimationFrame(loop);
}

/* ───────────── Eingaben ───────────── */
addEventListener('pointermove', e => {
  par.tx = (e.clientX / innerWidth - .5) * 2; par.ty = (e.clientY / innerHeight - .5) * 2;
  par.lastMove = (performance.now() - start) / 1000;
});
view.addEventListener('pointerdown', e => {
  if (reduce) return;
  if (fw.on) launchRocket(e.clientX * dpr, e.clientY * dpr);   // nach dem Release: eigene Raketen zünden
  else storm((performance.now() - start) / 1000);
});
addEventListener('keydown', e => { if (e.code === 'Space' && !reduce) { e.preventDefault(); storm((performance.now() - start) / 1000); } });
addEventListener('resize', resize);
addEventListener('load', layout);
addEventListener('vi:launch', () => {
  if (reduce) return;
  const t = (performance.now() - start) / 1000;
  storm(t); fwStart(t);
});

resize();
requestAnimationFrame(loop);
})();
