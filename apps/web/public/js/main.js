import { returnTo } from './lib.js';
/* Point d'entrée : en-tête, routage par hash, pied de page, barre mobile. */
import { init, isMulti, logout, state, subscribe } from './state.js';
import { clear, errorBox, h, logo } from './ui.js';

const ROUTES = {
  '/': { title: 'Créez images et vidéos par IA', load: () => import('./pages/home.js'), pub: true, full: true },
  '/studio': { title: 'Studio', load: () => import('./pages/studio.js'), full: true },
  '/galerie': { title: 'Galerie', load: () => import('./pages/gallery.js') },
  '/personnages': { title: 'Personnages', load: () => import('./pages/characters.js') },
  '/outils': { title: 'Outils', load: () => import('./pages/tools.js') },
  '/tarifs': { title: 'Tarifs et crédits', load: () => import('./pages/pricing.js'), pub: true, full: true },
  '/parametres': { title: 'Paramètres', load: () => import('./pages/account.js') },
  '/compte': { title: 'Paramètres', load: () => import('./pages/account.js') },
  '/legal/mentions': { title: 'Mentions légales', load: () => import('./pages/legal.js'), pub: true },
  '/legal/cgu': { title: "Conditions d'utilisation", load: () => import('./pages/legal.js'), pub: true },
  '/legal/confidentialite': { title: 'Confidentialité', load: () => import('./pages/legal.js'), pub: true },
  '/connexion': { title: 'Connexion', load: () => import('./pages/login.js'), pub: true, full: true },
};

const NAV = [
  ['#/', 'Explorer'],
  ['#/studio?tab=image', 'Image'],
  ['#/studio?tab=video', 'Vidéo'],
  ['#/outils', 'Outils'],
  ['#/personnages', 'Personnages'],
  ['#/galerie', 'Galerie'],
];

const app = document.getElementById('app');

const nav = h('nav', { class: 'nav', 'aria-label': 'Navigation principale' });
const navLinks = new Map();
for (const [href, label] of NAV) {
  const a = h('a', { href }, label);
  navLinks.set(href, a);
  nav.appendChild(a);
}
const pricing = h('a', { class: 'btn btn-small pricing-pill', href: '#/tarifs' }, '✦ Tarifs');
const credits = h('a', { class: 'credits', href: '#/parametres?section=credits', title: 'Mes crédits', hidden: true });
// Menu du compte (avatar) : e-mail, crédits, paramètres, connecteurs, déconnexion.
const avatar = h('span', { class: 'avatar', 'aria-hidden': 'true' });
const menuEmail = h('span', { class: 'acct-email' });
const menuCredits = h('span', { class: 'acct-credits' });
const acct = h('details', { class: 'acct-menu', hidden: true },
  h('summary', { 'aria-label': 'Menu du compte' }, avatar),
  h('div', { class: 'acct-pop', role: 'menu' },
    h('div', { class: 'acct-who' }, menuEmail, menuCredits),
    h('a', { role: 'menuitem', href: '#/parametres?section=credits' }, '✦ Crédits'),
    h('a', { role: 'menuitem', href: '#/galerie' }, '▦ Mes créations'),
    h('a', { role: 'menuitem', href: '#/parametres?section=connecteurs' }, '⧉ Connecteurs (Claude)'),
    h('a', { role: 'menuitem', href: '#/parametres' }, '⚙ Paramètres'),
    h('button', { type: 'button', role: 'menuitem', onclick: () => void logout() }, '↪ Déconnexion')));
acct.addEventListener('click', (ev) => { if (ev.target instanceof HTMLAnchorElement) acct.open = false; });
document.addEventListener('click', (ev) => { if (acct.open && !acct.contains(/** @type {Node} */ (ev.target))) acct.open = false; });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && acct.open) { acct.open = false; acct.querySelector('summary').focus(); } });
const loginBtn = h('a', { class: 'btn btn-small btn-ghost', href: '#/connexion' }, 'Connexion');
const startBtn = h('a', { class: 'btn btn-small btn-primary', href: '#/studio' }, 'Créer');
const header = h('header', { class: 'site-header' },
  h('a', { class: 'brand', href: '#/', 'aria-label': 'ZODIAK AI, accueil' }, logo(30), h('span', { class: 'brand-name' }, 'ZODIAK AI')),
  nav,
  h('div', { class: 'header-right' }, pricing, credits, loginBtn, startBtn, acct),
);

const main = h('main', { id: 'main', class: 'main', tabindex: -1 });
const col = (title, links) => h('div', {}, h('h4', {}, title), ...links.map(([href, t]) => h('a', { href }, t)));
const footer = h('footer', { class: 'site-footer' },
  h('div', { class: 'foot-inner' },
    h('div', {}, h('a', { class: 'brand', href: '#/' }, logo(26), h('span', { class: 'brand-name' }, 'ZODIAK AI')),
      h('p', { style: 'margin-top:.8rem;max-width:32ch' }, `Plateforme libre de génération d'images et de vidéos par IA. Auto-hébergeable, licence Apache-2.0.`)),
    col('Créer', [['#/studio?tab=image', 'Texte vers image'], ['#/studio?tab=video', 'Image vers vidéo'], ['#/studio?tab=video&mode=t2v', 'Texte vers vidéo'], ['#/personnages', 'Personnages cohérents']]),
    col('Outils', [['#/outils', 'Agrandir (upscale)'], ['#/outils', 'Interpolation'], ['#/outils', 'Lip-sync'], ['#/outils', 'Montage et découpe']]),
    col('Projet', [['#/tarifs', 'Tarifs et crédits'], ['#/galerie', 'Galerie'], ['#/parametres?section=connecteurs', 'Connecter Claude'], ['#/connexion', 'Connexion']]),
    col('Légal', [['#/legal/mentions', 'Mentions légales'], ['#/legal/cgu', "Conditions d'utilisation"], ['#/legal/confidentialite', 'Confidentialité']]),
  ),
  h('p', { class: 'foot-note' }, `Utilisez ZODIAK AI de façon responsable : pas de contenu illégal ou sexuel explicite, pas d'usurpation d'identité, et uniquement des visages dont vous avez le droit d'utiliser l'image. ZODIAK AI - Apache-2.0.`),
);
const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Navigation mobile' },
  ...[['#/', '⌂', 'Accueil', ''], ['#/galerie', '▦', 'Galerie', ''], ['#/studio', '✦', 'Créer', 'go'], ['#/outils', '✂', 'Outils', ''], ['#/tarifs', '◎', 'Crédits', '']]
    .map(([href, ico, label, cls]) => h('a', { href, class: cls }, h('b', {}, ico), label)));

app.append(
  h('a', { class: 'skip', href: '#main', onclick: (ev) => { ev.preventDefault(); main.focus(); } }, 'Aller au contenu'),
  header, h('div', { class: 'layout' }, main), footer, tabbar,
);

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', qs: new URLSearchParams(query) };
}

function syncHeader() {
  const authed = !!state.user;
  const multi = isMulti();
  credits.hidden = !(authed && state.config && state.config.creditsEnabled);
  credits.textContent = state.user ? `${state.user.credits} crédits` : '';
  acct.hidden = !(authed && multi);
  if (state.user) {
    avatar.textContent = state.user.email.slice(0, 1).toUpperCase();
    menuEmail.textContent = state.user.email;
    menuCredits.textContent = state.config && state.config.creditsEnabled ? `${state.user.credits} crédits` : '';
  }
  loginBtn.hidden = authed || !multi;
  startBtn.textContent = authed ? 'Créer' : 'Commencer';
  startBtn.setAttribute('href', authed ? '#/studio' : '#/connexion?inscription=1');
  const { path, qs } = parseHash();
  for (const [href, a] of navLinks) {
    const [p, q = ''] = href.replace(/^#/, '').split('?');
    const want = new URLSearchParams(q).get('tab');
    const on = p === path && (!want || (qs.get('tab') || 'image') === want);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  for (const a of tabbar.querySelectorAll('a')) {
    if ((a.getAttribute('href') || '').replace(/^#/, '') === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

let cleanup = null;
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  if (cleanup) cleanup();
  cleanup = null;
  clear(main);
  const { path, qs } = parseHash();
  syncHeader();
  window.scrollTo(0, 0);
  if (!state.ready) {
    main.appendChild(h('p', { class: 'loading page', role: 'status' }, 'Chargement…'));
    return;
  }
  if (state.loadError) {
    main.append(h('div', { class: 'page' }, errorBox(state.loadError), h('button', { type: 'button', class: 'btn', onclick: async () => { await init(); void route(); } }, 'Réessayer')));
    return;
  }
  const multi = isMulti();
  const def = ROUTES[path];
  if (!def) {
    main.append(h('div', { class: 'page' }, h('h1', {}, 'Page introuvable'), h('p', {}, h('a', { href: '#/' }, `Retour à l'accueil`))));
    document.title = 'Page introuvable - ZODIAK AI';
    return;
  }
  if (multi && !state.user && !def.pub) {
    location.hash = '#/connexion';
    return;
  }
  if (path === '/connexion' && (!multi || state.user)) {
    const back = returnTo(location.hash);
    if (back) { location.href = back; return; }
    location.hash = '#/studio';
    return;
  }
  document.title = `${def.title} - ZODIAK AI`;
  try {
    const mod = await def.load();
    if (seq !== routeSeq) return;
    const host = def.full ? main : main.appendChild(h('div', { class: 'page' }));
    const c = mod.mount(host, qs);
    cleanup = typeof c === 'function' ? c : null;
    const h1 = main.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  } catch (e) {
    main.appendChild(h('div', { class: 'page' }, errorBox(e)));
  }
}

let lastReady = false;
let lastAuthed = false;
subscribe(() => {
  syncHeader();
  const authedNow = !!state.user;
  if ((state.ready && !lastReady) || authedNow !== lastAuthed) {
    lastReady = state.ready;
    lastAuthed = authedNow;
    void route();
  }
});
window.addEventListener('hashchange', () => void route());

void route();
void init();
