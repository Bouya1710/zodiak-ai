// Paramètres : menu latéral (Profil, Crédits, Connecteurs, Dépenses fal pour le propriétaire).
import { request } from '../api.js';
import { describeError } from '../lib.js';
import { state } from '../state.js';
import { clear, errorBox, h } from '../ui.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais');
const usd = (n) => `${n.toFixed(2).replace('.', ',')} $`;
const REASONS = { signup: 'Bienvenue', job: 'Génération', refund_failed: 'Remboursement (échec)', refund_canceled: 'Remboursement (annulation)', refund_cache: 'Remboursement (déjà généré)', refund_error: 'Remboursement', admin: 'Ajustement' };
const MCP_URL = `${location.origin}/api/mcp`;

function copyBtn(text, label = 'Copier') {
  const b = h('button', { type: 'button', class: 'btn btn-small', onclick: async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    b.textContent = 'Copié ✓'; setTimeout(() => (b.textContent = label), 1500);
  } }, label);
  return b;
}
const codeLine = (text) => h('div', { class: 'code-line' }, h('code', {}, text), copyBtn(text));

/** @param {HTMLElement} root @param {URLSearchParams} qs */
export function mount(root, qs) {
  const panel = h('section', { class: 'set-panel' });
  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Paramètres' });
  const sections = [['profil', 'Profil', '◉'], ['credits', 'Crédits', '✦'], ['connecteurs', 'Connecteurs', '⧉']];
  let owner = false;

  function go(id) {
    history.replaceState(null, '', `#/parametres?section=${id}`);
    for (const a of nav.querySelectorAll('button')) a.setAttribute('aria-current', String(a.dataset.id === id));
    clear(panel);
    ({ profil, credits, connecteurs, depenses }[id] || connecteurs)();
  }
  function renderNav() {
    clear(nav);
    for (const [id, label, ico] of owner ? [...sections, ['depenses', 'Dépenses fal', '$']] : sections) {
      nav.append(h('button', { type: 'button', 'data-id': id, onclick: () => go(id) }, h('span', { class: 'ico' }, ico), label));
    }
  }

  function head(title, sub) { panel.append(h('h2', {}, title), sub ? h('p', { class: 'lede' }, sub) : null); }

  function profil() {
    head('Profil');
    panel.append(h('div', { class: 'set-card' },
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'E-mail'), h('b', {}, state.user ? state.user.email : '')),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Rôle'), h('b', {}, owner ? 'Propriétaire du site' : 'Membre'))));
  }

  async function credits() {
    head('Crédits', '1 crédit ≈ 0,01 $ de calcul chez le fournisseur. Une génération ratée est remboursée.');
    const box = h('div', { class: 'set-card' }, h('p', { class: 'hint' }, 'Chargement…'));
    panel.append(box);
    try {
      const c = await request('/credits');
      box.replaceChildren(h('div', { class: 'big' }, `✦ ${c.balance}`), h('span', { class: 'hint' }, 'crédits disponibles'),
        h('ul', { class: 'ledger' }, ...c.ledger.map((l) => h('li', {}, h('span', {}, REASONS[l.reason] || l.reason), h('b', { class: l.delta < 0 ? 'neg' : 'pos' }, `${l.delta > 0 ? '+' : ''}${l.delta}`), h('time', {}, fmt(l.createdAt))))));
    } catch (e) { box.replaceChildren(errorBox(describeError(e))); }
  }

  async function connecteurs() {
    head('Connecteurs', 'Reliez ZODIAK AI à vos assistants : ils pourront créer des images et des vidéos pour vous.');
    const access = h('ul', { class: 'token-list' });
    const steps = h('ol', { class: 'steps-list', hidden: true },
      h('li', {}, 'Copiez l’adresse du connecteur ci-dessous.'),
      h('li', {}, 'Dans Claude : ', h('b', {}, 'Paramètres → Connecteurs → Ajouter un connecteur personnalisé'), ', nom « ZODIAK AI », collez l’adresse.'),
      h('li', {}, 'Cliquez ', h('b', {}, 'Connecter'), ' : une fenêtre ZODIAK AI s’ouvre, cliquez ', h('b', {}, 'Autoriser'), '. C’est tout.'),
      h('li', {}, codeLine(MCP_URL)));
    const claude = h('div', { class: 'set-card conn' },
      h('div', { class: 'conn-head' }, h('div', { class: 'conn-logo', 'aria-hidden': 'true' }, '✳'),
        h('div', {}, h('b', {}, 'Claude'), h('span', { class: 'hint' }, 'Générer, suivre vos créations et vos crédits depuis une conversation.')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { steps.hidden = !steps.hidden; } }, 'Connecter')),
      steps);

    const manualOut = h('div', { 'aria-live': 'polite' });
    const manual = h('details', { class: 'set-card' }, h('summary', {}, 'Clé manuelle (Claude Code, autres outils MCP)'),
      h('p', { class: 'hint' }, 'Pour les outils qui ne gèrent pas la connexion automatique. La clé n’est affichée qu’une fois.'),
      h('button', { type: 'button', class: 'btn', onclick: async () => {
        clear(manualOut);
        try {
          const r = await request('/tokens', { method: 'POST', json: { label: 'Clé manuelle' } });
          manualOut.append(h('p', { class: 'hint' }, 'Commande pour Claude Code (ne la partagez pas) :'),
            codeLine(`claude mcp add --transport http zodiak ${MCP_URL} --header "Authorization: Bearer ${r.token}"`));
          void loadAccess();
        } catch (e) { manualOut.append(errorBox(describeError(e))); }
      } }, 'Générer une clé'), manualOut);

    panel.append(claude, h('h3', {}, 'Accès autorisés'), h('div', { class: 'set-card' }, access), manual);

    async function loadAccess() {
      try {
        const r = await request('/tokens');
        clear(access);
        if (!r.items.length) access.append(h('li', { class: 'hint' }, 'Aucun assistant connecté pour le moment.'));
        for (const t of r.items) {
          access.append(h('li', {}, h('b', {}, t.label), h('span', { class: 'hint' }, `autorisé ${fmt(t.createdAt)} · dernier usage ${fmt(t.lastUsedAt)}`),
            h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: async () => {
              if (!confirm(`Retirer l’accès « ${t.label} » ? L’assistant ne pourra plus utiliser ZODIAK AI.`)) return;
              await request(`/tokens/${t.id}`, { method: 'DELETE' }).catch(() => {});
              void loadAccess();
            } }, 'Retirer')));
        }
      } catch (e) { access.replaceChildren(errorBox(describeError(e))); }
    }
    void loadAccess();
  }

  async function depenses() {
    head('Dépenses fal', 'Ce que le site a consommé chez fal.ai, et le solde du compte.');
    const box = h('div', { class: 'set-card' }, h('p', { class: 'hint' }, 'Chargement…'));
    panel.append(box);
    try {
      const r = await request('/admin/usage');
      box.replaceChildren(
        r.fal.error ? h('p', { class: 'hint' }, `Solde fal indisponible : ${r.fal.error}.`) : h('div', {}, h('div', { class: 'big' }, usd(r.fal.balance)), h('span', { class: 'hint' }, 'solde restant chez fal.ai')),
        h('ul', { class: 'ledger' },
          h('li', {}, h('span', {}, 'Dernières 24 h'), h('b', {}, usd(r.spent.usd.day)), h('time', {}, `plafond ${usd(r.spent.dailyBudget / 100)}`)),
          h('li', {}, h('span', {}, '7 jours'), h('b', {}, usd(r.spent.usd.week)), h('time', {}, '')),
          h('li', {}, h('span', {}, '30 jours'), h('b', {}, usd(r.spent.usd.month)), h('time', {}, ''))));
    } catch (e) { box.replaceChildren(errorBox(describeError(e))); }
  }

  root.append(h('div', { class: 'page settings' }, h('div', { class: 'page-head' }, h('h1', {}, 'Paramètres')), h('div', { class: 'set-layout' }, nav, panel)));
  renderNav();
  go(qs.get('section') || 'connecteurs');
  request('/tokens').then((r) => { if (r.owner) { owner = true; renderNav(); for (const a of nav.querySelectorAll('button')) a.setAttribute('aria-current', String(a.dataset.id === (qs.get('section') || 'connecteurs'))); } }).catch(() => {});
  return () => {};
}
