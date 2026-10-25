// Connexion / inscription (mode multi uniquement).
import { api } from '../api.js';
import { describeError } from '../lib.js';
import { init, state } from '../state.js';
import { clear, errorBox, field, h, logo } from '../ui.js';
import { canvasFor } from '../showcase.js';

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  let registering = false;
  if (location.hash.includes('inscription=1') && state.config && state.config.registrationOpen) registering = true;
  const email = h('input', { type: 'email', required: true, autocomplete: 'email' });
  const pass = h('input', { type: 'password', required: true, minLength: 8, autocomplete: 'current-password' });
  const err = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Se connecter');
  const title = h('h1', {}, 'Connexion');
  const toggle = h('button', { type: 'button', class: 'btn btn-ghost' }, '');
  const canRegister = !!state.config?.registrationOpen;

  function sync() {
    title.textContent = registering ? 'Créer un compte' : 'Connexion';
    submit.textContent = registering ? 'Créer le compte' : 'Se connecter';
    pass.autocomplete = registering ? 'new-password' : 'current-password';
    toggle.textContent = registering ? 'J’ai déjà un compte' : 'Créer un compte';
    toggle.hidden = !canRegister;
  }
  toggle.addEventListener('click', () => {
    registering = !registering;
    clear(err);
    sync();
  });

  const form = h('form', { class: 'card stack auth-card', novalidate: true },
    h('div', { class: 'auth-logo' }, logo(44)),
    title,
    field('Adresse e-mail', email),
    field('Mot de passe', pass, registering ? '8 caractères minimum.' : undefined),
    err,
    submit,
    toggle,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(err);
    if (!email.value.trim() || !pass.value) {
      err.appendChild(errorBox('Renseignez votre e-mail et votre mot de passe.'));
      return;
    }
    submit.disabled = true;
    try {
      if (registering) await api.register(email.value.trim(), pass.value);
      else await api.login(email.value.trim(), pass.value);
      await init();
      location.hash = '#/studio';
    } catch (e) {
      err.appendChild(errorBox(describeError(e)));
    } finally {
      submit.disabled = false;
    }
  });
  sync();
  const artCv = canvasFor({ scene: 'orbit', seed: 8, cam: 'spin', ratio: 1.2, width: 640, speed: 0.6 });
  root.appendChild(h('div', { class: 'auth-split' },
    h('div', { class: 'auth-art' }, artCv, h('div', {}, h('h2', {}, 'Votre studio de ', h('span', { class: 'grad' }, 'création IA')), h('p', { class: 'lede' }, `Images, vidéos, mouvements de caméra et personnages cohérents. 100 crédits offerts à l'inscription.`))),
    h('div', { class: 'auth-wrap' }, form)));
  email.focus();
  return () => {};
}
