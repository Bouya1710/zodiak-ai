/* Accueil : bandeau de cartes média, promo + tuiles, bannière, presets, projets, tarifs. Même structure que les studios de référence, contenu ZODIAK AI. */
import { state } from '../state.js';
import { h } from '../ui.js';
import { CAM_DEMOS, EXAMPLES, TOOLS, canvasFor, clipForCam } from '../showcase.js';
import { plansEl } from './pricing.js';

export function mount(root) {
  document.body.classList.add('is-home');
  const authed = !!state.user;
  const cta = authed ? '#/studio' : '#/connexion?inscription=1';
  const wide = (cls, ...kids) => h('section', { class: `wide ${cls || ''}` }, ...kids);

  const feat = (t, d, href, o) => h('a', { class: 'feat-card', href },
    h('div', { class: 'feat-media' }, canvasFor({ ...o, ratio: 0.5625, width: 560 })),
    h('strong', {}, t), h('span', {}, d));
  const strip = wide('strip', h('div', { class: 'feat-row' },
    feat('Studio vidéo', `Animez une image ou écrivez une scène.`, '#/studio?tab=video', { clip: 'c06' }),
    feat('Presets de caméra', `22 mouvements et cadrages prêts à l'emploi.`, '#/studio?tab=video', { clip: 'c01' }),
    feat('Studio image', `Du texte à l'image, en quelques secondes.`, '#/studio?tab=image', { clip: 'c12' }),
    feat('Personnages', `Gardez le même visage d'un plan à l'autre.`, '#/personnages', { clip: 'c05' }),
    feat('Lip-sync', `Associez une voix à une vidéo.`, '#/outils', { clip: 'c16' })));

  const tile = (ico, t, d, href, nw) => h('a', { class: 'tile', href }, h('span', { class: 'ico' }, ico, nw ? h('em', { class: 'new' }, 'Nouveau') : null), h('strong', {}, t), h('span', {}, d));
  const promo = wide('promo-wrap', h('div', { class: 'promo' },
    h('div', { class: 'promo-main' }, canvasFor({ ratio: 0.6, width: 640, clip: 'c18' }),
      h('div', { class: 'promo-body' },
        h('h2', {}, 'Inscrivez-vous et ', h('br'), h('span', { class: 'hl' }, 'créez tout de suite')),
        h('ul', {}, h('li', {}, `100 crédits offerts à l'inscription`), h('li', {}, 'Image, vidéo et tous les outils'), h('li', {}, 'Galerie privée et historique')),
        h('a', { class: 'btn btn-primary', href: cta }, authed ? 'Ouvrir le studio' : 'Obtenir mes crédits'))),
    h('div', { class: 'promo-tiles' },
      tile('✦', 'Studio vidéo', 'Une vidéo, plusieurs versions', '#/studio?tab=video', true),
      tile('◧', 'Presets de caméra', 'Mouvements, cadrages, rythme', '#/studio?tab=video'),
      tile('☺', 'Personnages', 'Même visage, plan après plan', '#/personnages'),
      tile('♪', 'Lip-sync', 'Une voix sur votre vidéo', '#/outils'),
      tile('⤢', 'Upscale', 'Agrandir x2 ou x4', '#/outils'),
      tile('❏', 'Modèles de prompt', 'Des structures à remplir', '#/studio?tab=image'))));

  const banner = wide('banner-wrap', h('div', { class: 'big-banner' },
    canvasFor({ ratio: 0.3, width: 960, clip: 'c14' }),
    h('div', { class: 'bb-body' }, h('span', { class: 'bb-eyebrow' }, 'Open source'), h('div', { class: 'bb-title' }, 'ZODIAK ', h('b', {}, 'STUDIO')),
      h('p', {}, 'Texte vers image, image vers vidéo, caméra, personnages. Libre et auto-hébergeable.'),
      h('a', { class: 'btn btn-primary', href: authed ? '#/studio?tab=video' : cta }, 'Essayer maintenant'))));

  const presets = wide('presets', h('div', { class: 'preset-wall' },
    ...Array.from({ length: 24 }, (_, i) => {
      const [id, label] = CAM_DEMOS[i % CAM_DEMOS.length];
      return h('a', { class: `pw pw-${i % 5}`, href: '#/studio?tab=video', 'aria-label': label },
        canvasFor({ ratio: 1, width: 200, clip: clipForCam(id), hover: true }), h('span', { class: 'cap' }, label));
    })),
    h('div', { class: 'wall-cta' }, h('a', { class: 'btn pill', href: '#/studio?tab=video' }, 'Voir tous les presets ↗')));

  const ribbon = ['r-a', 'r-b', 'r-c', 'r-d'];
  const cards = EXAMPLES.concat(EXAMPLES).slice(0, 16);
  const inside = wide('inside', h('div', { class: 'row-head' }, h('h2', {}, `Explorez l'intérieur de chaque projet`), h('p', {}, 'Tous les prompts, les réglages et la façon dont chaque projet a été créé.')),
    h('div', { class: 'proj-grid' }, ...cards.map((e, i) => h('a', { class: 'proj', href: '#/galerie' },
      canvasFor({ ratio: 0.62, width: 420, clip: e.clip, hover: true }),
      h('span', { class: `rib ${ribbon[i % 4]}` }, e.kind === 'video' ? '▶' : '◆'),
      h('span', { class: 'who' }, e.t.slice(0, 1)),
      h('span', { class: 'cap' }, e.t)))));

  const tools = wide('tools', h('div', { class: 'row-head' }, h('h2', {}, 'Tous les outils pour créer'), h('p', {}, `Un seul endroit, du premier prompt à l'export.`)),
    h('div', { class: 'tool-grid' }, ...TOOLS.map((o) => h('a', { class: 'tool-tile', href: o.href },
      canvasFor({ ratio: 1.25, width: 320, clip: o.clip, hover: true }),
      h('span', { class: 'tag' }, o.tag),
      h('div', { class: 'cap' }, h('strong', {}, o.t), h('span', {}, o.d))))));

  const step = (n, t, d, o) => h('div', { class: 'step' }, canvasFor({ ...o, ratio: 0.62, width: 420 }), h('div', {}, h('b', {}, h('span', { class: 'num' }, n), t), h('span', {}, d)));
  const steps = wide('steps-wrap', h('div', { class: 'row-head' }, h('h2', {}, 'Une vidéo en trois gestes')),
    h('div', { class: 'steps' },
      step('1', 'Ajoutez une image', `Téléversez-la ou générez-la d'abord.`, { clip: 'c08' }),
      step('2', 'Choisissez un mouvement', 'Dolly, orbite, grue, drone…', { clip: 'c03' }),
      step('3', 'Lancez la génération', 'Suivez le résultat en direct.', { clip: 'c06' })));

  const pricing = wide('pricing-wrap', h('div', { class: 'row-head' }, h('h2', {}, 'Simple et transparent'), h('p', {}, 'Gratuit en ligne, libre à héberger, votre clé pour les vrais modèles.')), plansEl());

  const more = wide('more', h('div', { class: 'row-head' }, h('h2', {}, 'Explorer plus')),
    h('div', { class: 'chips-cloud' }, ...[['Image', '#/studio?tab=image'], ['Vidéo', '#/studio?tab=video'], ['Texte vers vidéo', '#/studio?tab=video&mode=t2v'], ['Presets de caméra', '#/studio?tab=video'], ['Personnages', '#/personnages'], ['Lip-sync', '#/outils'], ['Upscale', '#/outils'], ['Interpolation', '#/outils'], ['Montage', '#/outils'], ['Galerie', '#/galerie'], ['Tarifs', '#/tarifs']].map(([t, href]) => h('a', { href }, t))));

  root.append(h('h1', { class: 'visually-hidden' }, 'ZODIAK AI, studio de création image et vidéo par IA'), strip, promo, banner, presets, inside, tools, steps, pricing, more);
  return () => document.body.classList.remove('is-home');
}
