import { camFor } from './art.js';
import { h } from './ui.js';
const BASE = '/showcase/';
// Chaque emplacement montre une vraie vidéo de nos modèles (scripts/showcase-clips.mjs) ; en attendant, un bloc neutre.
const DEFAULT_CLIP = { aurora: 'c12', planet: 'c03', ocean: 'c09', city: 'c05', orbit: 'c08', tunnel: 'c14' };
const CLIP_BY_CAM = {
  'dolly-in': 'c08', 'dolly-out': 'c05', 'track-left': 'c09', 'track-right': 'c06', 'pan-left': 'c18', 'pan-right': 'c17',
  'tilt-up': 'c12', 'tilt-down': 'c15', orbit: 'c03', 'crane-up': 'c07', 'crane-down': 'c20', 'drone-flyover': 'c02',
  handheld: 'c04', static: 'c16', macro: 'c10', 'wide-establishing': 'c12', 'hero-low': 'c13', 'top-down': 'c11',
  'slow-motion': 'c19', timelapse: 'c11', 'rack-focus': 'c01', anamorphic: 'c14',
};
export const clipForCam = (id) => CLIP_BY_CAM[id];
function pickClip(o) {
  return o.clip || DEFAULT_CLIP[o.scene] || null;
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
});
cv.replaceWith(v);
if (vio) vio.observe(v);
}
export const EXAMPLES = [
  { t: 'Kickflip au couchant', p: 'Skateur en plein kickflip sur une dalle vide au coucher du soleil, zoom choc', clip: 'c01', kind: 'video', ratio: 0.5625 },
  { t: 'Canyon en FPV', p: 'Moto tout-terrain dans un canyon rouge, drone FPV en poursuite', clip: 'c02', kind: 'video', ratio: 0.5625 },
  { t: 'Danse dans la lumière', p: 'Danseuse en robe blanche dans un entrepôt, orbite autour d’elle', clip: 'c03', kind: 'video', ratio: 1.78 },
  { t: 'Dernier round', p: 'Boxeur dans une vieille salle, caméra à l’épaule, coups vers l’objectif', clip: 'c04', kind: 'video', ratio: 0.5625 },
  { t: 'Défilé sous la pluie', p: 'Mannequin en manteau noir sous la pluie, néons, travelling arrière', clip: 'c05', kind: 'video', ratio: 1.78 },
  { t: 'Drift de nuit', p: 'Voiture noire en drift sur piste mouillée, fumée, travelling latéral', clip: 'c06', kind: 'video', ratio: 0.5625 },
  { t: 'Ruines de jungle', p: 'Petit robot explorateur dans un temple envahi par la jungle, grue ascendante', clip: 'c07', kind: 'video', ratio: 0.5625 },
  { t: 'Toit à l’heure dorée', p: 'Portrait au vent sur un toit à contre-jour, lent travelling avant', clip: 'c08', kind: 'video', ratio: 1.78 },
  { t: 'Dans le tube', p: 'Surfeur dans une vague turquoise, travelling dans le tube', clip: 'c09', kind: 'video', ratio: 0.5625 },
  { t: 'Flambé', p: 'Chef qui flambe une poêle, très gros plan au ralenti', clip: 'c10', kind: 'video', ratio: 0.5625 },
  { t: 'Immobile dans la foule', p: 'Carrefour de nuit vu du ciel, une silhouette immobile, accéléré', clip: 'c11', kind: 'video', ratio: 0.5625 },
  { t: 'Sortie du hangar', p: 'Astronaute quittant un hangar géant sur une planète glacée, plan d’ensemble', clip: 'c12', kind: 'video', ratio: 0.5625 },
  { t: 'Dunk au crépuscule', p: 'Dunk en contre-plongée au ralenti sur un terrain extérieur', clip: 'c13', kind: 'video', ratio: 0.5625 },
  { t: 'Tunnel orange', p: 'Moto lancée dans un tunnel de lumières orange, look anamorphique', clip: 'c14', kind: 'video', ratio: 0.5625 },
  { t: 'Porte du château', p: 'Chevalier sous la pluie devant la porte, torches, recul lent', clip: 'c15', kind: 'video', ratio: 0.5625 },
  { t: 'Solo sur scène', p: 'Guitariste dans la fumée, lumières de scène, plan fixe', clip: 'c16', kind: 'video', ratio: 1.78 },
  { t: 'Galop à l’aube', p: 'Cheval au galop sur la plage à l’aube, ralenti', clip: 'c17', kind: 'video', ratio: 0.5625 },
  { t: 'Ruelle aux lanternes', p: 'À vélo dans une ruelle de lanternes, caméra qui suit', clip: 'c18', kind: 'video', ratio: 1.78 },
  { t: 'Éclat de verre', p: 'Flacon de verre et gouttes qui explosent, ultra ralenti', clip: 'c19', kind: 'video', ratio: 1.78 },
  { t: 'Saut en poudreuse', p: 'Snowboardeur qui s’envole d’une crête, drone en suivi', clip: 'c20', kind: 'video', ratio: 0.5625 },
];

export const TOOLS = [
  { clip: 'c08', t: 'Texte vers image', d: 'Décrivez, générez, déclinez en un clic.', tag: 'Image', href: '#/studio?tab=image' },
  { clip: 'c03', t: 'Image vers vidéo', d: 'Animez une image avec un mouvement de caméra.', tag: 'Vidéo', href: '#/studio?tab=video' },
  { clip: 'c12', t: 'Texte vers vidéo', d: 'Un prompt, une scène animée.', tag: 'Vidéo', href: '#/studio?tab=video&mode=t2v' },
  { clip: 'c01', t: 'Presets de caméra', d: '22 mouvements et cadrages prêts à l’emploi.', tag: 'Caméra', href: '#/studio?tab=video' },
  { clip: 'c05', t: 'Personnages cohérents', d: 'Gardez le même visage d’un plan à l’autre.', tag: 'Personnages', href: '#/personnages' },
  { clip: 'c16', t: 'Lip-sync', d: 'Associez une voix à une vidéo.', tag: 'Audio', href: '#/outils' },
  { clip: 'c19', t: 'Agrandir et fluidifier', d: 'Upscale x2 ou x4, interpolation des images.', tag: 'Qualité', href: '#/outils' },
  { clip: 'c14', t: 'Modèles de prompt', d: 'Des structures éprouvées, à compléter.', tag: 'Templates', href: '#/studio?tab=image' },
];

// Mur de presets : 20 mouvements, chacun avec sa propre vidéo.
export const CAM_DEMOS = [
  ['rack-focus', 'Zoom choc'], ['drone-flyover', 'Drone FPV'], ['orbit', 'Orbite 360'], ['handheld', 'Caméra à l’épaule'],
  ['dolly-out', 'Travelling arrière'], ['track-right', 'Travelling latéral'], ['crane-up', 'Grue ascendante'], ['dolly-in', 'Travelling avant'],
  ['track-left', 'Suivi latéral'], ['macro', 'Très gros plan'], ['top-down', 'Plongée verticale'], ['tilt-up', 'Plan d’ensemble'],
  ['hero-low', 'Contre-plongée'], ['anamorphic', 'Anamorphique'], ['tilt-down', 'Recul révélateur'], ['static', 'Plan fixe'],
  ['pan-right', 'Panoramique'], ['pan-left', 'Caméra qui suit'], ['slow-motion', 'Ultra ralenti'], ['crane-down', 'Drone en suivi'],
];

/** Emplacement média : bloc neutre remplacé par la vidéo dès qu'elle est publiée. */
export function canvasFor(o) {
const width = o.width || 360;
const cv = h('canvas', { 'aria-hidden': 'true', class: 'sk', width: String(width), height: String(Math.round(width * (o.ratio || 1.25))) });
const id = pickClip(o);
if (id && !o.noVideo) loadShowcase().then((set) => { if (set.has(id)) setTimeout(() => swapToVideo(cv, id, null, o.hover), 0); });
return cv;
}

export { camFor };
