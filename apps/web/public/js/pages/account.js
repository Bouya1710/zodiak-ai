// Compte : solde de crédits, connecteur Claude (clés MCP) et, pour le propriétaire, suivi du compte fal.
import { request } from '../api.js';
import { describeError } from '../lib.js';
import { state } from '../state.js';
import { clear, errorBox, field, h } from '../ui.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais');
const usd = (n) => `${n.toFixed(2).replace('.', ',')} $`;

/** @param {HTMLElement} root */
export function mount(root) {
  const credits = h('div', { class: 'acct-card' });
  const owner = h('div', { class: 'acct-card', hidden: true });
  const tokens = h('ul', { class: 'token-list' });
  const created = h('div', { 'aria-live': 'polite' });
  const err = h('div', { 'aria-live': 'polite' });
  const pwd = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const label = h('input', { type: 'text', maxLength: 60, value: 'Claude' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Créer la clé du connecteur');

  async function loadCredits() {
    try {
      const c = await request('/api/credits');
      clear(credits);
      credits.append(h('span', { class: 'label' }, 'Mes crédits'), h('b', { class: 'big' }, `✦ ${c.balance}`),
        h('ul', { class: 'ledger' }, ...c.ledger.slice(0, 8).map((l) => h('li', {}, h('span', {}, l.reason), h('b', { class: l.delta < 0 ? 'neg' : 'pos' }, `${l.delta > 0 ? '+' : ''}${l.delta}`), h('time', {}, fmt(l.createdAt))))));
    } catch (e) { credits.replaceChildren(errorBox(describeError(e))); }
  }

  async function loadOwner() {
    try {
      const r = await request('/api/admin/usage');
      owner.hidden = false;
      clear(owner);
      const fal = r.fal.error ? h('p', { class: 'hint' }, `Solde fal indisponible (${r.fal.error}). Votre solde reste visible sur fal.ai → Billing.`) : h('b', { class: 'big' }, usd(r.fal.balance));
      owner.append(h('span', { class: 'label' }, 'Compte fal.ai (propriétaire)'), fal,
        h('ul', { class: 'ledger' },
          h('li', {}, h('span', {}, 'Dépensé par le site sur 24 h'), h('b', {}, usd(r.spent.usd.day)), h('time', {}, `plafond ${usd(r.spent.dailyBudget / 100)}`)),
          h('li', {}, h('span', {}, 'Sur 7 jours'), h('b', {}, usd(r.spent.usd.week)), h('time', {}, '')),
          h('li', {}, h('span', {}, 'Sur 30 jours'), h('b', {}, usd(r.spent.usd.month)), h('time', {}, ''))));
    } catch { owner.hidden = true; }
  }

  async function loadTokens() {
    try {
      const r = await request('/api/tokens');
      clear(tokens);
      if (!r.items.length) tokens.append(h('li', { class: 'hint' }, 'Aucune clé pour le moment.'));
      for (const t of r.items) {
        tokens.append(h('li', {}, h('b', {}, t.label), h('span', { class: 'hint' }, `créée ${fmt(t.createdAt)} · utilisée ${fmt(t.lastUsedAt)}`),
          h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: async () => {
            if (!confirm(`Supprimer la clé « ${t.label} » ? Le connecteur qui l'utilise cessera de fonctionner.`)) return;
            await request(`/api/tokens/${t.id}`, { method: 'DELETE' }).catch((e) => err.replaceChildren(errorBox(describeError(e))));
            void loadTokens();
          } }, 'Supprimer')));
      }
    } catch (e) { err.replaceChildren(errorBox(describeError(e))); }
  }

  const form = h('form', { class: 'acct-card stack', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    clear(err); clear(created);
    submit.disabled = true;
    try {
      const r = await request('/api/tokens', { method: 'POST', json: { password: pwd.value, label: label.value } });
      pwd.value = '';
      const url = h('input', { type: 'text', readOnly: true, value: r.url, class: 'mono', onclick: (e) => e.target.select() });
      created.append(h('div', { class: 'notice' },
        h('strong', {}, 'Clé créée. '), 'Copiez ce lien maintenant : il ne sera plus jamais affiché. Ne le partagez pas : il donne accès à vos crédits.',
        url,
        h('button', { type: 'button', class: 'btn btn-small', onclick: async () => { await navigator.clipboard.writeText(r.url).catch(() => {}); } }, 'Copier le lien')));
      void loadTokens();
    } catch (e) { err.replaceChildren(errorBox(describeError(e))); } finally { submit.disabled = false; }
  } },
  h('span', { class: 'label' }, 'Connecteur Claude'),
  h('p', { class: 'hint' }, 'Reliez ZODIAK AI à Claude : il pourra générer des images et des vidéos, suivre vos créations et vos crédits. Dans Claude : Réglages → Connecteurs → Ajouter un connecteur personnalisé, puis collez le lien.'),
  h('div', { class: 'grid-2' }, field('Nom de la clé', label), field('Votre mot de passe (confirmation)', pwd)),
  err, submit, created, tokens);

  root.append(h('div', { class: 'page acct' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Mon compte'), h('p', { class: 'lede' }, state.user ? state.user.email : '')),
    h('div', { class: 'acct-grid' }, credits, owner), form));
  void loadCredits(); void loadOwner(); void loadTokens();
}
