/* Tarifs et crédits : 1 crédit ≈ 0,01 $ de calcul chez le fournisseur (fal). Aucun paiement en ligne pour l'instant. */
import { state } from '../state.js';
import { h } from '../ui.js';

// Valeurs de repli si le catalogue ne liste pas les modèles (mode démonstration).
const ENGINES = [
  { id: 'flux-schnell', kinds: ['t2i'], name: 'FLUX.1 schnell', vendor: 'Black Forest Labs · libre', credits: 1 },
  { id: 'nano-banana', kinds: ['t2i'], name: 'Nano Banana', vendor: 'Google', credits: 5 },
  { id: 'wan-22', kinds: ['i2v', 't2v'], name: 'Wan 2.2 (720p, 5 s)', vendor: 'Alibaba · libre', credits: 45 },
  { id: 'kling-25', kinds: ['i2v', 't2v'], name: 'Kling 2.5 Turbo Pro (5 s)', vendor: 'Kuaishou', credits: 40 },
];
const TOOLS = { upscale: 2, interpolate: 3, lipsync: 8, concat: 1, trim: 1 };
const cr = (n) => `${n} crédit${n > 1 ? 's' : ''}`;

export function plansEl() {
  const authed = !!state.user;
  const plan = (o) => h('div', { class: `plan ${o.tone}` },
    h('h3', {}, o.name, o.flag ? h('span', { class: 'flag' }, o.flag) : null),
    h('p', { class: 'hint' }, o.sub),
    h('div', { class: 'credit-box' }, h('b', {}, o.credits), h('ul', {}, ...o.eq.map((i) => h('li', {}, i))), h('div', { class: 'fixed' }, o.fixed)),
    h('div', { class: 'price' }, o.price, ' ', h('small', {}, o.unit)),
    o.href ? h('a', { class: `btn plan-btn ${o.btn}`, href: o.href }, o.cta) : h('span', { class: `btn plan-btn ${o.btn}`, 'aria-disabled': 'true' }, o.cta),
    h('p', { class: 'note' }, o.note),
    h('div', { class: 'feat-box' }, h('b', {}, 'Inclus'), h('ul', {}, ...o.items.map((i) => h('li', {}, i)))));
  return h('div', { class: 'plans' },
    plan({ tone: 'p-dark', btn: 'btn-white', name: 'Gratuit', sub: 'Pour découvrir', credits: '100 crédits offerts', eq: ['≈ 100 images FLUX', 'ou 20 images Nano Banana', 'ou 2 vidéos Kling'], fixed: 'Offerts une fois, à l’inscription', price: '0 €', unit: 'sans carte bancaire', cta: authed ? 'Ouvrir le studio' : 'Créer mon compte', href: authed ? '#/studio' : '#/connexion?inscription=1', note: 'Les vrais modèles, dès la première image', items: ['FLUX, Nano Banana, Wan 2.2, Kling', '22 mouvements de caméra', 'Galerie privée et historique', 'Remboursement automatique en cas d’échec'] }),
    plan({ tone: 'p-cyan', btn: 'btn-primary', flag: 'Bientôt', name: 'Recharges', sub: 'Pour créer sans limite', credits: 'Crédits à l’unité', eq: ['Prix proche du coût réel', '1 crédit ≈ 0,01 $ de calcul'], fixed: 'Sans abonnement, crédits sans expiration', price: 'Bientôt', unit: 'paiement en ligne en préparation', cta: 'Bientôt disponible', note: 'Payez seulement ce que vous générez', items: ['Tous les modèles du studio', 'Aucun engagement mensuel', 'Historique détaillé des dépenses', 'Plafonds de sécurité'] }),
    plan({ tone: 'p-dark', btn: 'btn', flag: 'Nouveau', name: 'Connecteur Claude', sub: 'Créer depuis une conversation', credits: 'Mêmes crédits', eq: ['Images et vidéos', 'Suivi des créations'], fixed: 'Connexion OAuth, sans mot de passe', price: '0 €', unit: 'inclus', cta: authed ? 'Connecter Claude' : 'Créer mon compte', href: authed ? '#/parametres?section=connecteurs' : '#/connexion?inscription=1', note: 'Retirable à tout moment', items: ['« Génère une vidéo de… »', 'Choix du modèle et du format', 'Solde et dernières créations', 'Fonctionne aussi avec Claude Code'] }),
    plan({ tone: 'p-dark', btn: 'btn', flag: 'Libre', name: 'Auto-hébergé', sub: 'Sur votre propre machine', credits: 'Illimité sur votre GPU', eq: ['Vos modèles ComfyUI', 'Vos données chez vous'], fixed: 'Licence Apache-2.0', price: '0 €', unit: 'code ouvert', cta: 'Voir le code', href: 'https://github.com/Bouya1710/zodiak-ai', note: 'docker compose up', items: ['Même interface que la version en ligne', 'Mode personnel sans compte', 'Code modifiable', 'Aucun abonnement'] }));
}

export function mount(root) {
  const list = state.catalog && state.catalog.engines && state.catalog.engines.length ? state.catalog.engines : ENGINES;
  const kindLabel = (k) => (k.includes('t2i') ? 'Image' : 'Vidéo 5 s (texte ou image)');
  const promo = h('section', { class: 'wide' }, h('div', { class: 'price-promo' },
    h('span', { class: 'chip-red' }, '✦ Sans abonnement'),
    h('h1', {}, 'FLUX, NANO BANANA, WAN 2.2 ET KLING'),
    h('h1', { class: 'l2' }, 'LES MEILLEURS MODÈLES, AU PRIX DU CALCUL'),
    h('p', {}, '100 crédits offerts à l’inscription. 1 crédit ≈ 0,01 $ : vous payez la génération, pas un abonnement.')));
  root.append(promo,
    h('section', { class: 'wide' }, plansEl()),
    h('section', { class: 'wide' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Combien coûte chaque création ?'), h('p', {}, 'Le coût est affiché sur le bouton Générer avant chaque lancement. Une génération échouée est recréditée.'))),
      h('div', { class: 'card' }, h('table', { class: 'cost-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Modèle'), h('th', {}, 'Type'), h('th', {}, 'Coût'), h('th', {}, 'Éditeur'))),
        h('tbody', {},
          ...list.map((e) => h('tr', {}, h('td', {}, e.name), h('td', { class: 'hint' }, kindLabel(e.kinds)), h('td', {}, cr(e.credits)), h('td', { class: 'hint' }, e.vendor))),
          h('tr', {}, h('td', {}, 'Agrandir (upscale)'), h('td', { class: 'hint' }, 'Outil'), h('td', {}, cr(TOOLS.upscale)), h('td', { class: 'hint' }, 'x2 ou x4')),
          h('tr', {}, h('td', {}, 'Interpolation'), h('td', { class: 'hint' }, 'Outil'), h('td', {}, cr(TOOLS.interpolate)), h('td', { class: 'hint' }, 'Plus de fluidité')),
          h('tr', {}, h('td', {}, 'Montage / découpe'), h('td', { class: 'hint' }, 'Outil'), h('td', {}, cr(TOOLS.concat)), h('td', { class: 'hint' }, 'ffmpeg')))))));
  return () => {};
}
