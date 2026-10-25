// Connexion / inscription / mot de passe oublié (mode multi uniquement).
import { api, request } from '../api.js';
import { describeError, returnTo } from '../lib.js';
import { init, state } from '../state.js';
import { clear, errorBox, field, h, logo } from '../ui.js';
import { canvasFor } from '../showcase.js';

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  const canRegister = !!state.config?.registrationOpen;
  /** @type {'login'|'register'|'forgot'} */
  let mode = location.hash.includes('inscription=1') && canRegister ? 'register' : 'login';
  const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'vous@exemple.com' });
  const pass = h('input', { type: 'password', required: true, minLength: 8, autocomplete: 'current-password' });
  const eye = h('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Afficher le mot de passe', onclick: () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.textContent = show ? 'Masquer' : 'Afficher';
    eye.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  } }, 'Afficher');
  const passField = field('Mot de passe', h('div', { class: 'pw-wrap' }, pass, eye));
  const passHint = h('p', { class: 'hint' }, '8 caractères minimum.');
  const terms = h('input', { type: 'checkbox', id: 'terms' });
  const termsRow = h('div', { class: 'check' }, terms, h('label', { for: 'terms' }, 'J’accepte les ', h('a', { href: '#/legal/cgu', target: '_blank' }, 'conditions d’utilisation'), ' et la ', h('a', { href: '#/legal/confidentialite', target: '_blank' }, 'politique de confidentialité'), '.'));
  const err = h('div', { 'aria-live': 'polite' });
  const info = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, '');
  const title = h('h1', {}, '');
  const sub = h('p', { class: 'hint auth-sub' }, '');
  const forgot = h('button', { type: 'button', class: 'link-btn', onclick: () => { mode = 'forgot'; sync(); } }, 'Mot de passe oublié ?');
  const back = h('button', { type: 'button', class: 'link-btn', onclick: () => { mode = 'login'; sync(); } }, '← Retour à la connexion');
  const tabs = h('div', { class: 'auth-tabs', role: 'tablist' },
    ...[['login', 'Connexion'], ['register', 'Créer un compte']].map(([m, label]) => h('button', { type: 'button', role: 'tab', 'data-mode': m, onclick: () => { mode = /** @type {any} */ (m); sync(); } }, label)));

  function sync() {
    clear(err);
    title.textContent = mode === 'register' ? 'Créez votre compte' : mode === 'forgot' ? 'Mot de passe oublié' : 'Bon retour';
    sub.textContent = mode === 'register' ? '100 crédits offerts à l’inscription, sans carte bancaire.' : mode === 'forgot' ? 'Recevez un lien pour choisir un nouveau mot de passe.' : 'Connectez-vous pour retrouver vos créations.';
    submit.textContent = mode === 'register' ? 'Créer mon compte' : mode === 'forgot' ? 'Envoyer le lien' : 'Se connecter';
    pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    passField.hidden = mode === 'forgot';
    passHint.hidden = mode !== 'register';
    termsRow.hidden = mode !== 'register';
    forgot.hidden = mode !== 'login';
    back.hidden = mode !== 'forgot';
    tabs.hidden = mode === 'forgot' || !canRegister;
    for (const t of tabs.children) t.setAttribute('aria-selected', String(t.getAttribute('data-mode') === mode));
  }

  const form = h('form', { class: 'card stack auth-card', novalidate: true },
    h('div', { class: 'auth-logo' }, logo(40)), tabs, title, sub,
    field('Adresse e-mail', email), passField, passHint, forgot, termsRow, info, err, submit, back);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(err); clear(info);
    if (!email.value.trim() || (mode !== 'forgot' && !pass.value)) {
      err.appendChild(errorBox(mode === 'forgot' ? 'Renseignez votre adresse e-mail.' : 'Renseignez votre e-mail et votre mot de passe.'));
      return;
    }
    if (mode === 'register' && !terms.checked) { err.appendChild(errorBox('Acceptez les conditions d’utilisation pour créer un compte.')); return; }
    submit.disabled = true;
    try {
      if (mode === 'forgot') {
        await request('/auth/recover', { method: 'POST', json: { email: email.value.trim() } });
        info.appendChild(h('div', { class: 'notice' }, 'Si un compte existe pour cette adresse, un e-mail vient de partir. Ouvrez le lien depuis ce navigateur (valable 1 h).'));
        return;
      }
      if (mode === 'register') await api.register(email.value.trim(), pass.value);
      else await api.login(email.value.trim(), pass.value);
      await init();
      const next = returnTo(location.hash);
      if (next) location.href = next;
      else location.hash = '#/studio';
    } catch (e) {
      err.appendChild(errorBox(describeError(e)));
    } finally {
      submit.disabled = false;
    }
  });
  sync();
  if (location.hash.includes('lien-expire=1')) err.appendChild(errorBox('Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.'));
  const artCv = canvasFor({ ratio: 1.2, width: 640, clip: 'c08' });
  root.appendChild(h('div', { class: 'auth-split' },
    h('div', { class: 'auth-art' }, artCv, h('div', {}, h('h2', {}, 'Votre studio de ', h('span', { class: 'grad' }, 'création IA')), h('p', { class: 'lede' }, 'FLUX, Nano Banana, Wan 2.2, Kling : les meilleurs modèles d’image et de vidéo au même endroit, avec 22 mouvements de caméra.'))),
    h('div', { class: 'auth-wrap' }, form)));
  email.focus();
  return () => {};
}
