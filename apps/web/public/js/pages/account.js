// Paramètres : barre latérale (carte du compte, sections groupées, déconnexion) et panneaux.
import { request } from '../api.js';
import { describeError } from '../lib.js';
import { init, logout, state } from '../state.js';
import { clear, errorBox, h } from '../ui.js';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'jamais');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '');
const usd = (n) => `${n.toFixed(2).replace('.', ',')} $`;
const REASONS = { signup: ['Crédits de bienvenue', '★'], job: ['Génération', '✦'], refund_failed: ['Remboursement : échec', '↺'], refund_canceled: ['Remboursement : annulation', '↺'], refund_cache: ['Remboursement : déjà généré', '↺'], refund_error: ['Remboursement', '↺'], refund_blocked: ['Remboursement : bloqué', '↺'], admin: ['Ajustement', '±'] };
const MCP_URL = `${location.origin}/api/mcp`;
const initial = (p) => (p.displayName || p.email || '?').trim().slice(0, 1).toUpperCase();

function copyBtn(text, label = 'Copier') {
  const b = h('button', { type: 'button', class: 'btn btn-small', onclick: async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    b.textContent = 'Copié ✓'; setTimeout(() => (b.textContent = label), 1500);
  } }, label);
  return b;
}
const codeLine = (text) => h('div', { class: 'code-line' }, h('code', {}, text), copyBtn(text));
const card = (...kids) => h('div', { class: 'set-card' }, ...kids);
const cardHead = (title, sub) => h('div', { class: 'card-head' }, h('b', {}, title), sub ? h('span', { class: 'hint' }, sub) : null);

/** @param {HTMLElement} root @param {URLSearchParams} qs */
export function mount(root, qs) {
  const resetLink = location.hash.includes('nouveau-mdp=1'); // lu avant que go() ne réécrive l'adresse
  /** @type {any} */
  let me = { email: state.user ? state.user.email : '', displayName: state.user ? state.user.name : null, owner: false, credits: state.user ? state.user.credits : 0, stats: { images: 0, videos: 0, connectors: 0 } };
  let current = resetLink ? 'securite' : qs.get('section') || 'profil';
  const panel = h('section', { class: 'set-panel', 'aria-live': 'polite' });
  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Sections des paramètres' });
  const who = h('div', { class: 'set-who' });

  const GROUPS = () => [
    ['Compte', [['profil', 'Profil', '◉'], ['securite', 'Sécurité', '⚿']]],
    ['Utilisation', [['credits', 'Crédits', '✦'], ['#/galerie', 'Mes créations', '▦']]],
    ['Intégrations', [['connecteurs', 'Connecteurs', '⧉']]],
    ...(me.owner ? [['Propriétaire', [['depenses', 'Dépenses fal', '$']]]] : []),
  ];

  function renderSide() {
    clear(who);
    who.append(h('div', { class: 'avatar avatar-lg', 'aria-hidden': 'true' }, initial(me)),
      h('div', { class: 'who-txt' }, h('b', {}, me.displayName || me.email.split('@')[0]), h('span', {}, me.email)),
      h('div', { class: 'who-row' }, h('span', { class: 'plan-chip' }, me.owner ? 'Propriétaire' : 'Gratuit'),
        h('button', { type: 'button', class: 'who-credits', onclick: () => go('credits') }, `✦ ${me.credits} crédits`)));
    clear(nav);
    for (const [group, items] of GROUPS()) {
      nav.append(h('span', { class: 'nav-group' }, group));
      for (const [id, label, ico] of items) {
        nav.append(id.startsWith('#')
          ? h('a', { href: id }, h('span', { class: 'ico' }, ico), label, h('span', { class: 'ext' }, '↗'))
          : h('button', { type: 'button', 'aria-current': String(id === current), onclick: () => go(id) }, h('span', { class: 'ico' }, ico), label));
      }
    }
  }

  function go(id) {
    current = id;
    history.replaceState(null, '', `#/parametres?section=${id}`);
    renderSide();
    clear(panel);
    ({ profil, securite, credits, connecteurs, depenses }[id] || profil)();
  }

  const head = (title, sub) => panel.append(h('header', { class: 'set-head' }, h('h2', {}, title), sub ? h('p', { class: 'lede' }, sub) : null));
  const flash = (box, text, ok = true) => { clear(box); box.append(ok ? h('div', { class: 'notice' }, text) : errorBox(text)); };

  function profil() {
    head('Profil', 'Comment vous apparaissez dans ZODIAK AI.');
    const name = h('input', { type: 'text', maxLength: 60, value: me.displayName || '', placeholder: me.email.split('@')[0] });
    const out = h('div', {});
    panel.append(
      card(h('div', { class: 'profile-row' }, h('div', { class: 'avatar avatar-xl', 'aria-hidden': 'true' }, initial(me)),
        h('form', { class: 'profile-form', onsubmit: async (ev) => {
          ev.preventDefault();
          try {
            const r = await request('/profile', { method: 'PATCH', json: { displayName: name.value } });
            me.displayName = r.displayName; renderSide(); await init(); flash(out, 'Profil enregistré.');
          } catch (e) { flash(out, describeError(e), false); }
        } }, h('label', { class: 'k' }, 'Nom affiché'), h('div', { class: 'pw-row' }, name, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer')), out))),
      card(h('div', { class: 'kv' }, h('span', {}, 'Adresse e-mail'), h('b', {}, me.email)),
        h('div', { class: 'kv' }, h('span', {}, 'Membre depuis'), h('b', {}, day(me.createdAt) || '—')),
        h('div', { class: 'kv' }, h('span', {}, 'Offre'), h('b', {}, me.owner ? 'Propriétaire du site' : 'Gratuit'))),
      h('div', { class: 'stat-grid' },
        ...[['Images créées', me.stats.images], ['Vidéos créées', me.stats.videos], ['Assistants connectés', me.stats.connectors]].map(([l, v]) => card(h('span', { class: 'hint' }, l), h('b', { class: 'big' }, String(v))))));
  }

  function securite() {
    head('Sécurité', 'Mot de passe, sessions et suppression du compte.');
    const pw = h('input', { type: 'password', minLength: 8, autocomplete: 'new-password', placeholder: '8 caractères minimum' });
    const pwOut = h('div', {});
    const allOut = h('div', {});
    const confirmIn = h('input', { type: 'text', placeholder: 'SUPPRIMER', autocomplete: 'off' });
    const delOut = h('div', {});
    panel.append(
      h('form', { class: 'set-card', onsubmit: async (ev) => {
        ev.preventDefault();
        try { await request('/auth/password', { method: 'POST', json: { password: pw.value } }); pw.value = ''; flash(pwOut, 'Mot de passe modifié.'); } catch (e) { flash(pwOut, describeError(e), false); }
      } }, cardHead(resetLink ? 'Choisissez votre nouveau mot de passe' : 'Mot de passe', resetLink ? 'Vous êtes connecté grâce au lien reçu par e-mail.' : 'Utilisé pour vous connecter avec votre e-mail.'),
      h('div', { class: 'pw-row' }, pw, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer')), pwOut),
      card(cardHead('Sessions', 'Déconnecte ce navigateur, vos autres appareils et les assistants connectés (Claude…).'),
        h('div', {}, h('button', { type: 'button', class: 'btn', onclick: async () => {
          if (!confirm('Se déconnecter partout ? Vous devrez vous reconnecter, et reconnecter Claude.')) return;
          try { await request('/auth/logout-all', { method: 'POST' }); await logout().catch(() => {}); } catch (e) { flash(allOut, describeError(e), false); }
        } }, 'Se déconnecter de tous les appareils')), allOut),
      h('div', { class: 'set-card danger' }, cardHead('Supprimer le compte', 'Efface définitivement votre compte, vos créations, vos crédits et vos connecteurs. Action irréversible.'),
        h('label', { class: 'k' }, 'Tapez SUPPRIMER pour confirmer'),
        h('div', { class: 'pw-row' }, confirmIn, h('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
          if (confirmIn.value !== 'SUPPRIMER') { flash(delOut, 'Tapez SUPPRIMER en majuscules pour confirmer.', false); return; }
          try { await request('/account/delete', { method: 'POST', json: { confirm: 'SUPPRIMER' } }); await logout().catch(() => {}); location.hash = '#/'; } catch (e) { flash(delOut, describeError(e), false); }
        } }, 'Supprimer définitivement')), delOut));
    if (resetLink) pw.focus();
  }

  async function credits() {
    head('Crédits', '1 crédit ≈ 0,01 $ de calcul chez le fournisseur. Une génération ratée est recréditée automatiquement.');
    const hist = card(h('p', { class: 'hint' }, 'Chargement…'));
    const bal = h('div', { class: 'big' }, `✦ ${me.credits}`);
    const eq = h('span', { class: 'hint' }, '');
    const setBal = (n) => { bal.textContent = `✦ ${n}`; eq.textContent = `≈ ${n} images FLUX, ${Math.floor(n / 5)} Nano Banana ou ${Math.floor(n / 40)} vidéo(s) Kling`; };
    setBal(me.credits);
    panel.append(h('div', { class: 'credit-hero' },
      h('div', {}, h('span', { class: 'hint' }, 'Solde disponible'), bal, eq),
      h('div', { class: 'hero-actions' }, h('a', { class: 'btn btn-primary', href: '#/studio' }, 'Créer'), h('span', { class: 'btn', 'aria-disabled': 'true', title: 'Paiement en ligne en préparation' }, 'Recharger · bientôt'))),
    h('h3', {}, 'Historique'), hist);
    try {
      const c = await request('/credits');
      me.credits = c.balance; setBal(c.balance); renderSide();
      clear(hist);
      if (!c.ledger.length) hist.append(h('p', { class: 'hint' }, 'Aucune opération pour le moment.'));
      hist.append(h('ul', { class: 'ledger ledger-full' }, ...c.ledger.map((l) => {
        const [label, ico] = REASONS[l.reason] || [l.reason, '•'];
        return h('li', {}, h('span', { class: 'l-ico' }, ico), h('span', {}, label), h('time', {}, fmt(l.createdAt)), h('b', { class: l.delta < 0 ? 'neg' : 'pos' }, `${l.delta > 0 ? '+' : ''}${l.delta}`));
      })));
    } catch (e) { hist.replaceChildren(errorBox(describeError(e))); }
  }

  async function connecteurs() {
    head('Connecteurs', 'Reliez ZODIAK AI à vos assistants : ils pourront créer des images et des vidéos pour vous.');
    const access = h('ul', { class: 'token-list' });
    const steps = h('ol', { class: 'steps-list', hidden: true },
      h('li', {}, 'Copiez l’adresse du connecteur : ', codeLine(MCP_URL)),
      h('li', {}, 'Dans Claude : ', h('b', {}, 'Paramètres → Connecteurs → Ajouter un connecteur personnalisé'), ', nom « ZODIAK AI », collez l’adresse.'),
      h('li', {}, 'Cliquez ', h('b', {}, 'Connecter'), ', puis ', h('b', {}, 'Autoriser'), ' dans la fenêtre ZODIAK AI. C’est tout.'));
    const manualOut = h('div', { 'aria-live': 'polite' });
    panel.append(
      card(h('div', { class: 'conn-head' }, h('div', { class: 'conn-logo', 'aria-hidden': 'true' }, '✳'),
        h('div', {}, h('b', {}, 'Claude'), h('span', { class: 'hint' }, 'Générer, suivre vos créations et vos crédits depuis une conversation.')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { steps.hidden = !steps.hidden; } }, 'Connecter')), steps),
      h('h3', {}, 'Accès autorisés'), card(access),
      h('details', { class: 'set-card' }, h('summary', {}, 'Clé manuelle (Claude Code, autres outils MCP)'),
        h('p', { class: 'hint' }, 'Pour les outils sans connexion automatique. La clé n’est affichée qu’une fois.'),
        h('div', {}, h('button', { type: 'button', class: 'btn', onclick: async () => {
          clear(manualOut);
          try {
            const r = await request('/tokens', { method: 'POST', json: { label: 'Clé manuelle' } });
            manualOut.append(h('p', { class: 'hint' }, 'Commande pour Claude Code (ne la partagez pas) :'), codeLine(`claude mcp add --transport http zodiak ${MCP_URL} --header "Authorization: Bearer ${r.token}"`));
            void loadAccess();
          } catch (e) { manualOut.append(errorBox(describeError(e))); }
        } }, 'Générer une clé')), manualOut));
    async function loadAccess() {
      try {
        const r = await request('/tokens');
        clear(access);
        if (!r.items.length) access.append(h('li', { class: 'hint' }, 'Aucun assistant connecté pour le moment.'));
        for (const t of r.items) {
          access.append(h('li', {}, h('span', { class: 'conn-dot', 'aria-hidden': 'true' }), h('div', {}, h('b', {}, t.label), h('span', { class: 'hint' }, `autorisé le ${fmt(t.createdAt)} · dernier usage ${fmt(t.lastUsedAt)}`)),
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
    const box = card(h('p', { class: 'hint' }, 'Chargement…'));
    panel.append(box);
    try {
      const r = await request('/admin/usage');
      box.replaceChildren(
        r.fal.error ? h('p', { class: 'hint' }, `Solde fal indisponible : ${r.fal.error}. Consultez fal.ai → Billing.`) : h('div', {}, h('span', { class: 'hint' }, 'Solde restant chez fal.ai'), h('div', { class: 'big' }, usd(r.fal.balance))),
        h('div', { class: 'stat-grid' },
          ...[['24 h', r.spent.usd.day, `plafond ${usd(r.spent.dailyBudget / 100)}`], ['7 jours', r.spent.usd.week, ''], ['30 jours', r.spent.usd.month, '']].map(([l, v, n]) => card(h('span', { class: 'hint' }, l), h('b', { class: 'big' }, usd(v)), n ? h('span', { class: 'hint' }, n) : null))));
    } catch (e) { box.replaceChildren(errorBox(describeError(e))); }
  }

  const side = h('aside', { class: 'set-side' }, who, nav,
    h('button', { type: 'button', class: 'set-logout', onclick: () => void logout() }, h('span', { class: 'ico' }, '↪'), 'Déconnexion'));
  root.append(h('div', { class: 'page settings' }, h('div', { class: 'set-layout' }, side, panel)));
  go(current);
  request('/profile').then((p) => { me = { ...me, ...p }; go(current); }).catch(() => {});
  return () => {};
}
