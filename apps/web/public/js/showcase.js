import { art, camFor, stopArt } from './art.js';
import { h } from './ui.js';
const BASE = '/showcase/';
const DEFAULT_CLIP = { aurora: 'c01', planet: 'c02', ocean: 'c03', city: 'c04', orbit: 'c14', tunnel: 'c13' };
const CLIP_BY_CAM = { 'dolly-in': 'c05', 'dolly-out': 'c14', orbit: 'c06', 'crane-up': 'c07', 'drone-flyover': 'c08', handheld: 'c10', macro: 'c09', timelapse: 'c11', 'track-left': 'c04', 'track-right': 'c12', 'tilt-down': 'c03', 'wide-establishing': 'c01' };
export const clipForCam = (id) => CLIP_BY_CAM[id];
const SEED_CLIP = { 'aurora:47': 'c11' };
const CAM_CLIP = { 'zoom-in': 'c05', 'zoom-out': 'c14', orbit: 'c06', 'crane-u': 'c07', fly: 'c08', shake: 'c10', macro: 'c09', fast: 'c11', 'pan-l': 'c04', 'pan-r': 'c12', 'tilt-d': 'c03' };
function pickClip(o) {
if (o.clip) return o.clip;
if (SEED_CLIP[`${o.scene}:${o.seed}`]) return SEED_CLIP[`${o.scene}:${o.seed}`];
if (o.width && o.width <= 220) return CAM_CLIP[o.cam] || null;
return DEFAULT_CLIP[o.scene];
}
if (typeof document !== 'undefined') {
const st = document.createElement('style');
st.textContent = `.media-card video { display: block; width: 100%; height: 100%; object-fit: cover; aspect-ratio: 16 / 10; } .promo-main video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } .tool-tile video { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; } .cam-card video { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; } .mosaic video { display: block; width: 100%; height: auto; } .step video { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; } .cta-band video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } .model-card video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } .cam-grid .cam-card video { aspect-ratio: 1 / 1.1; } .auth-art video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }`;
document.head.appendChild(st);
}
let ready;
export function loadShowcase() {
ready ||= fetch(`${BASE}manifest.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => new Set(m ? m.clips.map((c) => c.id) : [])).catch(() => new Set());
return ready;
}
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const vio = typeof IntersectionObserver === 'function'
? new IntersectionObserver((entries) => {
for (const e of entries) {
const v = e.target;
if (e.isIntersecting) {
if (!v.getAttribute('src')) v.src = v.dataset.src;
if (!reduced && !v.dataset.hover) v.play().catch(() => {});
} else if (!v.dataset.hover) v.pause();
}
}, { rootMargin: '200px' })
: null;
const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
function swapToVideo(cv, id, opts, hover) {
if (!cv.parentNode) return;
const v = document.createElement('video');
v.muted = true;
v.defaultMuted = true;
v.loop = true;
v.playsInline = true;
v.preload = 'none';
v.poster = `${BASE}${id}.jpg`;
v.dataset.src = `${BASE}${id}.mp4`;
v.setAttribute('muted', '');
v.setAttribute('playsinline', '');
v.setAttribute('aria-hidden', 'true');
v.className = cv.className;
if (hover && canHover) {
v.dataset.hover = '1';
const host = cv.parentNode;
host.addEventListener('mouseenter', () => { if (!reduced) v.play().catch(() => {}); });
host.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
}
v.addEventListener('error', () => {
if (vio) vio.unobserve(v);
if (v.parentNode) v.replaceWith(cv);
art(cv, opts);
});
stopArt(cv);
cv.replaceWith(v);
if (vio) vio.observe(v);
}
export const EXAMPLES = [
  { t: `Aurore sur le fjord`, p: `Aurore boréale vert et violet au-dessus d'un fjord glacé, survol lent en drone`, scene: 'aurora', seed: 11, clip: 'c01', kind: 'video', cam: 'zoom-in', ratio: 1.45 },
  { t: `Planète à anneaux`, p: `Géante gazeuse cuivrée, anneaux fins, lune en orbite, orbite lente`, scene: 'planet', seed: 21, clip: 'c02', kind: 'video', cam: 'orbit', ratio: 1.0 },
  { t: `Soleil de minuit`, p: `Coucher de soleil sur un océan calme, panoramique vertical vers l'eau`, scene: 'ocean', seed: 5, clip: 'c03', kind: 'video', cam: 'tilt-d', ratio: 0.8 },
  { t: `Néons sous la pluie`, p: `Rue futuriste sous la pluie, néons magenta et cyan, travelling latéral`, scene: 'city', seed: 33, clip: 'c04', kind: 'video', cam: 'pan-l', ratio: 1.3 },
  { t: `Heure dorée`, p: `Portrait à contre-jour à l'heure dorée, lent travelling avant`, scene: 'orbit', seed: 8, clip: 'c05', kind: 'video', cam: 'zoom-in', ratio: 1.7 },
  { t: `Sneaker de studio`, p: `Produit sur piédestal sombre, orbite à 180 degrés, lumière rasante`, scene: 'tunnel', seed: 14, clip: 'c06', kind: 'video', cam: 'orbit', ratio: 1.2 },
  { t: `Cascade en forêt`, p: `Chute d'eau en forêt, brume, mouvement de grue ascendant`, scene: 'aurora', seed: 47, clip: 'c07', kind: 'video', cam: 'tilt-u', ratio: 1.7 },
  { t: `Dunes au vent`, p: `Dunes du désert à l'aube, survol en drone, sable soulevé par le vent`, scene: 'planet', seed: 62, clip: 'c08', kind: 'video', cam: 'pan-r', ratio: 1.3 },
  { t: `Café en macro`, p: `Gros plan macro sur un café fumant, vapeur et crème en mouvement`, scene: 'ocean', seed: 19, clip: 'c09', kind: 'video', cam: 'macro', ratio: 0.75 },
  { t: `Astronaute`, p: `Astronaute sur une planète rouge, caméra à l'épaule, poussière`, scene: 'city', seed: 58, clip: 'c10', kind: 'video', cam: 'shake', ratio: 1.7 },
  { t: `Nuages accélérés`, p: `Accéléré de nuages sur une chaîne enneigée au coucher du soleil`, scene: 'orbit', seed: 29, clip: 'c11', kind: 'video', cam: 'fast', ratio: 1.2 },
  { t: `Marché de nuit`, p: `Marché nocturne guirlandes et vapeur, travelling vers la droite`, scene: 'tunnel', seed: 37, clip: 'c12', kind: 'video', cam: 'pan-r', ratio: 0.85 },
];

export const TOOLS = [
  { clip: 'c01', t: 'Texte vers image', d: `Décrivez, générez, déclinez en un clic.`, tag: 'Image', href: '#/studio?tab=image', scene: 'aurora', seed: 3, cam: 'zoom-in' },
  { clip: 'c02', t: 'Image vers vidéo', d: `Animez une image avec un mouvement de caméra.`, tag: 'Vidéo', href: '#/studio?tab=video', scene: 'planet', seed: 4, cam: 'orbit' },
  { clip: 'c03', t: 'Texte vers vidéo', d: `Un prompt, une scène animée.`, tag: 'Vidéo', href: '#/studio?tab=video&mode=t2v', scene: 'ocean', seed: 6, cam: 'tilt-d' },
  { clip: 'c13', t: 'Presets de caméra', d: `22 mouvements et cadrages prêts à l'emploi.`, tag: 'Caméra', href: '#/studio?tab=video', scene: 'tunnel', seed: 9, cam: 'zoom-in' },
  { clip: 'c05', t: 'Personnages cohérents', d: `Gardez le même visage d'un plan à l'autre.`, tag: 'Personnages', href: '#/personnages', scene: 'orbit', seed: 12, cam: 'spin' },
  { clip: 'c10', t: 'Lip-sync', d: `Associez une voix à une vidéo.`, tag: 'Audio', href: '#/outils', scene: 'city', seed: 15, cam: 'pan-r' },
  { clip: 'c08', t: 'Agrandir et fluidifier', d: `Upscale x2 ou x4, interpolation des images.`, tag: 'Qualité', href: '#/outils', scene: 'planet', seed: 18, cam: 'zoom-out' },
  { clip: 'c14', t: 'Modèles de prompt', d: `Des structures éprouvées, à compléter.`, tag: 'Templates', href: '#/studio?tab=image', scene: 'aurora', seed: 24, cam: 'pan-l' },
];

export const CAM_DEMOS = [
['dolly-in', 'Travelling avant'], ['dolly-out', 'Recul progressif'], ['orbit', 'Orbite'], ['crane-up', 'Grue ascendante'],
['track-left', 'Travelling gauche'], ['tilt-down', 'Panoramique bas'], ['drone-flyover', 'Survol drone'], ['handheld', `Caméra à l'épaule`],
['macro', 'Très gros plan'], ['timelapse', 'Accéléré'], ['track-right', 'Travelling droite'], ['wide-establishing', 'Plan large'],
];

/** Toile animée prête à insérer. */
export function canvasFor(o) {
const opts = { scene: o.scene, seed: o.seed, cam: o.cam || 'static', ratio: o.ratio || 1.25, width: o.width || 360, speed: o.speed || 1, still: o.still };
const cv = art(h('canvas', { 'aria-hidden': 'true' }), opts);
const id = pickClip(o);
if (id && !o.noVideo) loadShowcase().then((set) => { if (set.has(id)) setTimeout(() => swapToVideo(cv, id, opts, o.hover), 0); });
return cv;
}

export { camFor };
