/* Médias de démonstration de ZODIAK AI : scènes animées générées par code (canvas), 100 % originales.
   Servent à la vitrine, aux aperçus de mouvements de caméra et aux états vides. Aucune ressource externe. */
const TAU = Math.PI * 2;

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

export const SCENES = ['aurora', 'planet', 'ocean', 'city', 'orbit', 'tunnel'];

/** Pré-calcul déterministe par graine (étoiles, reliefs, immeubles). */
function prep(seed, scene) {
  const r = rng(seed * 9973 + SCENES.indexOf(scene) * 131 + 7);
  const hue = scene === 'ocean' ? 15 + r() * 25 : scene === 'city' ? 270 + r() * 50 : 190 + r() * 120;
  const P = { hue, stars: [], ridges: [], blds: [], r: r() };
  for (let i = 0; i < 90; i++) P.stars.push({ x: r(), y: r() * 0.75, s: 0.4 + r() * 1.3, p: r() * TAU });
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(r());
    P.ridges.push(pts);
  }
  for (let k = 0; k < 3; k++) {
    const row = [];
    let x = -0.05;
    while (x < 1.05) {
      const w = 0.04 + r() * 0.07;
      row.push({ x, w, h: 0.12 + r() * (0.2 + k * 0.08), lit: r() });
      x += w + r() * 0.01;
    }
    P.blds.push(row);
  }
  return P;
}

function sky(g, w, h, P, t, top, bot, withStars = true) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  if (!withStars) return;
  for (const s of P.stars) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p));
    g.fillStyle = `rgba(255,248,230,${a * 0.9})`;
    g.beginPath();
    g.arc(s.x * w, s.y * h, Math.max(0.6, s.s * (w / 1100)), 0, TAU);
    g.fill();
  }
}

function ridge(g, w, h, pts, base, amp, col, shift) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, h);
  const n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const y = h * base - pts[(i + shift) % pts.length] * amp * h;
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

const DRAW = {
  aurora(g, w, h, t, P) {
    sky(g, w, h, P, t, hsl(P.hue + 200, 60, 5), hsl(P.hue + 150, 55, 16));
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const hue = P.hue + k * 28;
      const gr = g.createLinearGradient(0, h * 0.1, 0, h * 0.75);
      gr.addColorStop(0, hsl(hue, 90, 60, 0));
      gr.addColorStop(0.5, hsl(hue, 90, 60, 0.38));
      gr.addColorStop(1, hsl(hue, 90, 60, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const y = h * (0.38 + k * 0.05) + Math.sin(x * 0.012 + t * (0.5 + k * 0.17) + k * 2) * h * 0.1 + Math.sin(x * 0.03 - t * 0.6) * h * 0.025;
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    ridge(g, w, h, P.ridges[0], 0.84, 0.28, hsl(P.hue + 210, 40, 9), 0);
    ridge(g, w, h, P.ridges[1], 0.95, 0.22, hsl(P.hue + 220, 35, 5), 3);
  },
  planet(g, w, h, t, P) {
    sky(g, w, h, P, t, hsl(P.hue + 230, 55, 4), hsl(P.hue + 190, 50, 12));
    const cx = w * (0.58 + Math.sin(t * 0.15) * 0.02);
    const cy = h * 0.52;
    const R = Math.min(w, h) * 0.3;
    const glow = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2);
    glow.addColorStop(0, hsl(P.hue, 80, 60, 0.35));
    glow.addColorStop(1, hsl(P.hue, 80, 60, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.35);
    g.strokeStyle = hsl(P.hue + 40, 60, 75, 0.35);
    g.lineWidth = R * 0.07;
    g.beginPath();
    g.ellipse(0, 0, R * 1.7, R * 0.42, 0, Math.PI, TAU);
    g.stroke();
    g.restore();
    const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
    body.addColorStop(0, hsl(P.hue + 30, 85, 72));
    body.addColorStop(0.55, hsl(P.hue, 70, 42));
    body.addColorStop(1, hsl(P.hue - 30, 70, 10));
    g.fillStyle = body;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.clip();
    for (let i = 0; i < 7; i++) {
      g.fillStyle = hsl(P.hue + i * 12, 70, 70, 0.07 + (i % 2) * 0.05);
      const yy = cy - R + ((i + 0.5) / 7) * R * 2 + Math.sin(t * 0.4 + i) * 3;
      g.fillRect(cx - R, yy, R * 2, R * 0.16);
    }
    g.restore();
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.35);
    g.strokeStyle = hsl(P.hue + 40, 60, 80, 0.55);
    g.lineWidth = R * 0.07;
    g.beginPath();
    g.ellipse(0, 0, R * 1.7, R * 0.42, 0, 0, Math.PI);
    g.stroke();
    g.restore();
    const ma = t * 0.5;
    g.fillStyle = hsl(P.hue + 90, 20, 85);
    g.beginPath();
    g.arc(cx + Math.cos(ma) * R * 2.1, cy + Math.sin(ma) * R * 0.5, R * 0.12, 0, TAU);
    g.fill();
  },
  ocean(g, w, h, t, P) {
    const hz = h * 0.58;
    const gr = g.createLinearGradient(0, 0, 0, hz);
    gr.addColorStop(0, hsl(P.hue + 230, 55, 12));
    gr.addColorStop(0.7, hsl(P.hue + 10, 85, 48));
    gr.addColorStop(1, hsl(P.hue + 25, 95, 70));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, hz);
    const sx = w * 0.5;
    const sun = g.createRadialGradient(sx, hz, 0, sx, hz, h * 0.5);
    sun.addColorStop(0, 'rgba(255,240,200,0.95)');
    sun.addColorStop(0.15, hsl(P.hue + 20, 100, 70, 0.6));
    sun.addColorStop(1, hsl(P.hue, 100, 60, 0));
    g.fillStyle = sun;
    g.fillRect(0, 0, w, hz + 2);
    const sea = g.createLinearGradient(0, hz, 0, h);
    sea.addColorStop(0, hsl(P.hue + 200, 60, 22));
    sea.addColorStop(1, hsl(P.hue + 230, 60, 6));
    g.fillStyle = sea;
    g.fillRect(0, hz, w, h - hz);
    for (let i = 0; i < 40; i++) {
      const z = i / 40;
      const y = hz + z * z * (h - hz);
      const amp = 1 + z * 7;
      g.strokeStyle = hsl(P.hue + 20, 100, 78, 0.5 * (1 - z) * (0.4 + 0.6 * Math.abs(Math.sin(i + t))));
      g.lineWidth = 1 + z * 2;
      g.beginPath();
      const half = (30 + z * 90) * (w / 360);
      for (let x = -half; x <= half; x += 5) {
        const yy = y + Math.sin(x * 0.08 + t * 1.6 + i) * amp * 0.4;
        if (x === -half) g.moveTo(sx + x, yy);
        else g.lineTo(sx + x, yy);
      }
      g.stroke();
    }
  },
  city(g, w, h, t, P) {
    sky(g, w, h, P, t, hsl(P.hue + 250, 60, 6), hsl(P.hue, 80, 30), false);
    const haze = g.createRadialGradient(w * 0.5, h * 0.8, 0, w * 0.5, h * 0.8, h * 0.7);
    haze.addColorStop(0, hsl(P.hue + 40, 100, 60, 0.45));
    haze.addColorStop(1, hsl(P.hue + 40, 100, 60, 0));
    g.fillStyle = haze;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 3; k++) {
      const off = Math.sin(t * 0.2) * (k - 1) * w * 0.01;
      for (const b of P.blds[k]) {
        const bx = b.x * w + off;
        const bh = b.h * h * (1.2 + k * 0.3);
        g.fillStyle = hsl(P.hue + 240, 40, 6 + (2 - k) * 4);
        g.fillRect(bx, h - bh, b.w * w, bh);
        if (k > 0) {
          for (let wy = h - bh + 6; wy < h - 6; wy += 9) {
            for (let wx = bx + 3; wx < bx + b.w * w - 4; wx += 7) {
              const on = Math.sin(wx * 12.9898 + wy * 78.233 + b.lit * 50) * 43758;
              if (on - Math.floor(on) > 0.62) {
                g.fillStyle = hsl(P.hue + 60 * (on - Math.floor(on)), 90, 70, 0.5 + 0.4 * Math.sin(t * 2 + wx));
                g.fillRect(wx, wy, 3, 4);
              }
            }
          }
        }
      }
    }
    g.fillStyle = hsl(P.hue + 120, 100, 70, 0.55 + 0.35 * Math.sin(t * 3));
    g.fillRect(w * 0.12, h * 0.3, w * 0.22, 3);
    g.strokeStyle = 'rgba(190,210,255,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 53.7 + t * 40) % (w + 40)) - 20;
      const y = ((i * 97.3 + t * 260) % h);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 3, y + 14);
      g.stroke();
    }
  },
  orbit(g, w, h, t, P) {
    sky(g, w, h, P, t, hsl(P.hue + 220, 50, 4), hsl(P.hue + 200, 50, 10));
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.38;
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
    core.addColorStop(0, hsl(P.hue, 100, 70, 0.55));
    core.addColorStop(1, hsl(P.hue, 100, 70, 0));
    g.fillStyle = core;
    g.fillRect(0, 0, w, h);
    const glyphs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
    g.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      g.strokeStyle = hsl(P.hue + k * 20, 70, 70, 0.2);
      g.beginPath();
      g.arc(cx, cy, R * (0.45 + k * 0.18), 0, TAU);
      g.stroke();
    }
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.12;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    g.strokeStyle = hsl(P.hue + 40, 80, 75, 0.35);
    g.beginPath();
    [0, 3, 6, 9, 0, 4, 8, 0].forEach((i, n) => (n ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1])));
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(R * 0.2)}px serif`;
    pts.forEach((p, i) => {
      g.fillStyle = hsl(P.hue + i * 14, 90, 78, 0.9);
      g.beginPath();
      g.arc(p[0], p[1], 3, 0, TAU);
      g.fill();
      g.fillText(glyphs[i] + String.fromCharCode(0xfe0e), cx + (p[0] - cx) * 1.16, cy + (p[1] - cy) * 1.16);
    });
  },
  tunnel(g, w, h, t, P) {
    g.fillStyle = hsl(P.hue + 230, 60, 3);
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) * 0.6;
    const sides = 6 + Math.floor(P.r * 3);
    for (let i = 0; i < 26; i++) {
      const z = (i + ((t * 0.7) % 1)) / 26;
      const rr = Math.pow(z, 2.4) * maxR;
      g.strokeStyle = hsl(P.hue + z * 90, 90, 40 + z * 35, Math.min(1, z * 1.3));
      g.lineWidth = 0.5 + z * 3.5;
      g.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * TAU + z * 1.4 + t * 0.15;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (s) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    const c = g.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.25);
    c.addColorStop(0, hsl(P.hue + 40, 100, 80, 0.8));
    c.addColorStop(1, hsl(P.hue + 40, 100, 80, 0));
    g.fillStyle = c;
    g.fillRect(0, 0, w, h);
  },
};

/** Transformation de caméra : renvoie [zoom, dx, dy, rotation] (dx, dy en fraction de la taille). */
function camState(cam, t) {
  const ph = 0.5 - 0.5 * Math.cos((t * TAU) / 5);
  const fast = 0.5 - 0.5 * Math.cos((t * TAU) / 2.5);
  switch (cam) {
    case 'zoom-in': return [1.08 + 0.4 * ph, 0, 0, 0];
    case 'zoom-out': return [1.5 - 0.4 * ph, 0, 0, 0];
    case 'pan-l': return [1.3, (ph - 0.5) * 0.18, 0, 0];
    case 'pan-r': return [1.3, (0.5 - ph) * 0.18, 0, 0];
    case 'tilt-u': return [1.3, 0, (ph - 0.5) * 0.18, 0];
    case 'tilt-d': return [1.3, 0, (0.5 - ph) * 0.18, 0];
    case 'orbit': return [1.35, (0.5 - ph) * 0.12, 0, (ph - 0.5) * 0.35];
    case 'crane-u': return [1.5 - 0.3 * ph, 0, (ph - 0.5) * 0.2, 0];
    case 'crane-d': return [1.2 + 0.3 * ph, 0, (0.5 - ph) * 0.2, 0];
    case 'fly': return [1.3 + 0.2 * ph, (0.5 - ph) * 0.14, (ph - 0.5) * 0.08, (ph - 0.5) * 0.12];
    case 'shake': return [1.15, Math.sin(t * 17) * 0.008 + Math.sin(t * 6.3) * 0.006, Math.cos(t * 13) * 0.008, Math.sin(t * 9) * 0.012];
    case 'macro': return [1.7 + 0.3 * ph, 0, 0, 0];
    case 'spin': return [1.5, 0, 0, ph * 0.5 - 0.25];
    case 'fast': return [1.1 + 0.3 * fast, (fast - 0.5) * 0.1, 0, 0];
    case 'focus': return [1.15 + 0.08 * ph, 0, 0, 0];
    default: return [1.04, 0, 0, 0];
  }
}

const CAM_BY_ID = {
  'dolly-in': 'zoom-in', 'dolly-out': 'zoom-out', 'track-left': 'pan-l', 'track-right': 'pan-r',
  'pan-left': 'pan-l', 'pan-right': 'pan-r', 'tilt-up': 'tilt-u', 'tilt-down': 'tilt-d', orbit: 'orbit',
  'crane-up': 'crane-u', 'crane-down': 'crane-d', 'drone-flyover': 'fly', handheld: 'shake', static: 'static',
  macro: 'macro', 'wide-establishing': 'zoom-out', 'hero-low': 'tilt-u', 'top-down': 'spin',
  'slow-motion': 'zoom-in', timelapse: 'fast', 'rack-focus': 'focus', anamorphic: 'pan-r',
};
export const camFor = (id) => CAM_BY_ID[id] || 'static';

/* Boucle d'animation partagée : seules les toiles visibles sont dessinées, à ~24 images/s. */
const active = new Set();
let raf = 0;
let last = 0;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const it = e.target.__art;
        if (!it) continue;
        it.visible = e.isIntersecting;
        if (e.isIntersecting) { active.add(it); frame(it, performance.now()); loop(); } else active.delete(it);
      }
    }, { rootMargin: '120px' })
  : null;

function frame(it, now) {
  const t = it.t0 + (now / 1000) * it.speed;
  const { g, w, h } = it;
  const [z, dx, dy, rot] = camState(it.cam, t);
  g.save();
  g.translate(w / 2 + dx * w, h / 2 + dy * h);
  g.rotate(rot);
  g.scale(z, z);
  g.translate(-w / 2, -h / 2);
  DRAW[it.scene](g, w, h, t, it.P);
  g.restore();
}

function loop() {
  if (raf || reduced) return;
  raf = requestAnimationFrame(function tick(now) {
    raf = 0;
    if (!active.size) return;
    if (now - last > 40) {
      last = now;
      for (const it of active) frame(it, now);
    }
    raf = requestAnimationFrame(tick);
  });
}

/** Anime une toile avec une scène et un mouvement de caméra. Renvoie l'élément pour chaînage. */
export function art(canvas, opts = {}) {
  const scene = opts.scene && DRAW[opts.scene] ? opts.scene : SCENES[(opts.seed || 1) % SCENES.length];
  const seed = opts.seed || 1;
  const w = opts.width || 360;
  const ratio = opts.ratio || 1.25;
  canvas.width = w;
  canvas.height = Math.round(w * ratio);
  const it = {
    g: canvas.getContext('2d'), w: canvas.width, h: canvas.height, scene, P: prep(seed, scene),
    cam: opts.cam || 'static', speed: opts.speed || 1, t0: (seed * 1.7) % 20, visible: false,
  };
  canvas.__art = it;
  frame(it, 0);
  if (io && !reduced && !opts.still) io.observe(canvas);
  return canvas;
}

export function stopArt(canvas) {
  const it = canvas.__art;
  if (it) active.delete(it);
  if (io) io.unobserve(canvas);
}
