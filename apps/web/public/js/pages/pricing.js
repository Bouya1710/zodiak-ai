/* Tarifs et crédits. Aucun paiement : les crédits sont internes. Les coûts réels dépendent du fournisseur choisi (docs/COUTS.md). */
import { state } from '../state.js';
import { h } from '../ui.js';
import { canvasFor } from '../showcase.js';

const COSTS = { t2i: 1, i2v: 10, t2v: 10, upscale: 2, interpolate: 3, lipsync: 8, concat: 1, trim: 1 };

export function plansEl() {
  const authed = !!state.user;
  const plan = (o) => h('div', { class: `plan ${o.tone}` },
    h('h3', {}, o.name, o.flag ? h('span', { class: 'flag' }, o.flag) : null),
    h('p', { class: 'hint' }, o.sub),
    h('div', { class: 'credit-box' }, h('b', {}, o.credits), h('ul', {}, ...o.eq.map((i) => h('li', {}, i))), h('div', { class: 'fixed' }, o.fixed)),
    h('div', { class: 'price' }, o.price, ' ', h('small', {}, o.unit)),
    h('a', { class: `btn plan-btn ${o.btn}`, href: o.href }, o.cta),
    h('p', { class: 'note' }, o.note),
    h('div', { class: 'feat-box' }, h('b', {}, o.featTitle), h('ul', {}, ...o.items.map((i) => h('li', {}, i)))));
  return h('div', { class: 'plans' },
    plan({ tone: 'p-dark', btn: 'btn-white', name: 'Découverte', sub: 'Pour essayer en ligne', credits: '100 crédits offerts', eq: ['≈ 100 images', '≈ 10 vidéos'], fixed: 'Offerts une fois, à l\'inscription', price: '0 €', unit: 'sans carte bancaire', cta: authed ? 'Ouvrir le studio' : 'Créer mon compte', href: authed ? '#/studio' : '#/connexion?inscription=1', note: 'Moteur de démonstration en ligne', featTitle: 'Inclus', items: ['Studio image et vidéo', '22 presets de caméra', 'Personnages et modèles de prompt', 'Galerie privée et historique'] }),
    plan({ tone: 'p-cyan', btn: 'btn-primary', flag: 'Populaire', name: 'Votre clé', sub: 'Pour de vrais modèles', credits: 'Crédits à l\'usage', eq: ['Image FLUX ≈ 0,003 $', 'Vidéo Wan 5 s ≈ 0,40 $'], fixed: 'Tarif réel du fournisseur, sans marge', price: 'À l\'usage', unit: 'chez fal ou RunPod', cta: 'Voir les coûts', href: '#/tarifs', note: 'Vous gardez la main sur la dépense', featTitle: 'Inclus', items: ['Collez votre clé dans la configuration', 'Mêmes écrans, mêmes crédits internes', 'Garde-fous et plafonds de crédits', 'Coûts détaillés dans docs/COUTS.md'] }),
    plan({ tone: 'p-pink', btn: 'btn-pink', flag: 'Libre', name: 'Auto-hébergé', sub: 'Pour les projets exigeants', credits: 'Illimité sur votre GPU', eq: ['Vos modèles ComfyUI', 'Vos données chez vous'], fixed: 'Licence Apache-2.0', price: '0 €', unit: 'code ouvert', cta: 'Lire le guide', href: '#/tarifs', note: 'docker compose up', featTitle: 'Inclus', items: ['Aucun compte requis en mode personnel', 'Même interface que la version en ligne', 'Code modifiable', 'Pas de dépendance à un abonnement'] }),
    plan({ tone: 'p-blue', btn: 'btn-blue', name: 'Équipes', sub: 'Pour agences et petites équipes', credits: 'Espaces et crédits partagés', eq: ['Plusieurs comptes', 'Crédits par utilisateur'], fixed: 'Mode multi-utilisateurs intégré', price: '0 €', unit: 'à héberger soi-même', cta: 'Voir l\'architecture', href: '#/tarifs', note: 'Base PostgreSQL ou Supabase', featTitle: 'Inclus', items: ['Comptes, rôles et quotas', 'Galeries privées par personne', 'Journal des générations', 'Limites de débit configurables'] }));
}

export function mount(root) {
  const costs = (state.catalog && state.catalog.costs) || COSTS;
  const row = (label, key, note) => h('tr', {}, h('td', {}, label), h('td', {}, `${costs[key] ?? COSTS[key]} crédit${(costs[key] ?? COSTS[key]) > 1 ? 's' : ''}`), h('td', { class: 'hint' }, note));
  const promoBanner = h('section', { class: 'wide' }, h('div', { class: 'price-promo' },
    h('span', { class: 'chip-red' }, '✦ Sans abonnement'),
    h('h1', {}, 'TEXTE VERS IMAGE, IMAGE VERS VIDÉO ET PRESETS DE CAMÉRA'),
    h('h1', { class: 'l2' }, 'COMMENCEZ GRATUITEMENT, PAYEZ SEULEMENT CE QUE VOUS UTILISEZ'),
    h('p', {}, '100 crédits offerts à l\'inscription. Vos clés, vos coûts, aucun engagement.')));
  const bar = h('section', { class: 'wide' }, h('div', { class: 'price-bar' },
    h('div', { class: 'segmented' }, h('span', { class: 'seg on' }, 'Offres'), h('a', { class: 'seg', href: '#/tarifs' }, 'Coût par action')),
    h('span', { class: 'hint' }, 'Pas sûr de votre choix ? Commencez par Découverte.')));
  root.append(
    promoBanner, bar,
    h('section', { class: 'wide' }, plansEl()),
    h('section', { class: 'wide' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Combien coûte chaque action ?'), h('p', {}, 'Coûts en crédits internes. Un brouillon coûte 40 % de moins (arrondi au supérieur).'))),
      h('div', { class: 'card' }, h('table', { class: 'cost-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Action'), h('th', {}, 'Coût'), h('th', {}, 'Remarque'))),
        h('tbody', {},
          row('Image (texte vers image)', 't2i', `Remboursé en cas d'échec ou de résultat en cache`),
          row('Vidéo (image vers vidéo)', 'i2v', 'Brouillon 480p : 4 crédits'),
          row('Vidéo (texte vers vidéo)', 't2v', 'Brouillon 480p : 4 crédits'),
          row('Agrandir (upscale)', 'upscale', 'x2 ou x4'),
          row('Interpolation', 'interpolate', 'Plus de fluidité'),
          row('Lip-sync', 'lipsync', 'Aperçu de démonstration en ligne'),
          row('Montage / découpe', 'concat', 'Découpe : 1 crédit')))),
      h('p', { class: 'hint', style: 'margin-top:.8rem' }, `En ligne, la génération est en mode démonstration : les images et vidéos sont produites par le moteur de démonstration. Ajoutez une clé fal ou RunPod pour de vrais modèles.`)),
  );
  return () => {};
}
