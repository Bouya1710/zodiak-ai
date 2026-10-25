// Personnages : liste, création, suppression.
import { api } from '../api.js';
import { describeError, stubAsset, truncate } from '../lib.js';
import { assetField, clear, errorBox, field, h, thumb } from '../ui.js';

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  const list = h('ul', { class: 'char-list' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const err = h('div', { 'aria-live': 'polite' });

  const name = h('input', { type: 'text', required: true, maxLength: 80, autocomplete: 'off' });
  const desc = h('textarea', { rows: 3, placeholder: 'Apparence, style, traits constants…' });
  const lora = h('input', { type: 'text', placeholder: 'ex. mon_perso_v1' });
  const seed = h('input', { type: 'number', step: '1', min: '0', placeholder: 'Aucune' });
  const ref = assetField({ kind: 'image', label: 'Image de référence (optionnelle)' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Créer le personnage');
  const formErr = h('div', { 'aria-live': 'polite' });

  const form = h('form', { class: 'card stack', novalidate: true },
    h('h2', {}, 'Nouveau personnage'),
    field('Nom', name),
    field('Description', desc),
    ref.el,
    h('div', { class: 'grid-2' }, field('Nom du LoRA (optionnel)', lora), field('Graine (optionnelle)', seed)),
    formErr,
    submit,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(formErr);
    if (!name.value.trim()) {
      formErr.appendChild(errorBox('Le nom est obligatoire.'));
      name.focus();
      return;
    }
    /** @type {{name: string, description: string, referenceAssetId?: string, loraName?: string, seed?: number}} */
    const body = { name: name.value.trim(), description: desc.value.trim() };
    const a = ref.getAsset();
    if (a) body.referenceAssetId = a.id;
    if (lora.value.trim()) body.loraName = lora.value.trim();
    if (seed.value.trim() !== '') body.seed = Number(seed.value);
    submit.disabled = true;
    try {
      await api.createCharacter(body);
      form.reset();
      ref.set(null);
      await load();
    } catch (e) {
      formErr.appendChild(errorBox(describeError(e)));
    } finally {
      submit.disabled = false;
    }
  });

  async function load() {
    status.textContent = 'Chargement…';
    clear(err);
    try {
      const { items } = await api.listCharacters();
      clear(list);
      for (const c of items) {
        const avatar = c.referenceAssetId ? thumb(stubAsset(c.referenceAssetId), 'thumb thumb-sm') : h('span', { class: 'thumb thumb-sm thumb-empty', 'aria-hidden': 'true' }, '☺');
        list.appendChild(
          h('li', { class: 'card char' }, avatar,
            h('div', { class: 'char-body' },
              h('strong', {}, c.name),
              h('p', {}, truncate(c.description, 160) || 'Pas de description.'),
              h('p', { class: 'hint' }, [c.loraName ? `LoRA : ${c.loraName}` : '', c.seed != null ? `graine ${c.seed}` : ''].filter(Boolean).join(' · ')),
            ),
            h('button', { type: 'button', class: 'btn btn-small btn-danger', 'aria-label': `Supprimer ${c.name}`, onclick: async () => {
              if (!confirm(`Supprimer le personnage « ${c.name} » ?`)) return;
              try {
                await api.deleteCharacter(c.id);
                await load();
              } catch (e) {
                err.replaceChildren(errorBox(describeError(e)));
              }
            } }, 'Supprimer')),
        );
      }
      status.textContent = items.length ? '' : 'Aucun personnage. Créez-en un pour garder un visage ou un style cohérent.';
    } catch (e) {
      status.textContent = '';
      err.appendChild(errorBox(describeError(e)));
    }
  }

  root.append(
    h('header', { class: 'page-head' }, h('h1', {}, 'Personnages'), h('p', { class: 'lede' }, 'Des fiches réutilisables pour garder la cohérence d’un visage ou d’un style.')),
    h('div', { class: 'two-col' }, h('section', {}, h('h2', {}, 'Vos personnages'), err, list, status), form),
  );
  void load();
  return () => {};
}
