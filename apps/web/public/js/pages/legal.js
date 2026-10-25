// Pages légales : mentions, conditions d'utilisation, confidentialité.
import { h } from '../ui.js';

const UPDATED = '26 octobre 2026';
const P = (...t) => h('p', {}, ...t);
const L = (...items) => h('ul', {}, ...items.map((i) => h('li', {}, i)));

const PAGES = {
  mentions: ['Mentions légales', () => [
    h('h2', {}, 'Éditeur'),
    P('ZODIAK AI est un projet logiciel libre (licence Apache-2.0) édité à titre personnel. Code source : ', h('a', { href: 'https://github.com/Bouya1710/zodiak-ai', rel: 'noopener', target: '_blank' }, 'github.com/Bouya1710/zodiak-ai'), '.'),
    P('Contact : via les « Issues » du dépôt GitHub ci-dessus.'),
    h('h2', {}, 'Hébergement'),
    L('Site et API : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.',
      'Base de données, comptes et fichiers : Supabase Inc. (infrastructure cloud).',
      'Génération des images et vidéos : fal.ai (Features & Labels Inc.), qui exécute les modèles choisis.'),
    h('h2', {}, 'Propriété intellectuelle'),
    P('Le code de ZODIAK AI est distribué sous licence Apache-2.0. Les marques et modèles tiers cités (FLUX, Nano Banana, Wan, Kling…) appartiennent à leurs détenteurs respectifs.'),
  ]],
  cgu: ["Conditions d'utilisation", () => [
    h('h2', {}, '1. Objet'),
    P('ZODIAK AI permet de générer des images et des vidéos à partir de textes et d’images, avec des modèles d’intelligence artificielle. En créant un compte, vous acceptez les présentes conditions.'),
    h('h2', {}, '2. Compte et crédits'),
    L('Un compte est personnel ; vous êtes responsable de son usage et de la confidentialité de votre mot de passe.',
      'Les crédits sont une unité interne d’usage. Les crédits offerts n’ont pas de valeur monétaire et ne sont ni remboursables ni cessibles.',
      'Une génération échouée est automatiquement recréditée. Un plafond d’usage global peut limiter temporairement les générations.'),
    h('h2', {}, '3. Usages interdits'),
    L('Contenus illégaux, haineux, violents ou à caractère sexuel impliquant des mineurs (interdiction absolue).',
      'Contenus sexuels explicites, deepfakes ou images d’une personne réelle sans son accord.',
      'Usurpation d’identité, harcèlement, désinformation, atteinte aux droits d’auteur ou au droit à l’image.',
      'Contournement des garde-fous, des quotas ou de la sécurité du service.'),
    P('Les demandes sont filtrées automatiquement ; un compte qui enfreint ces règles peut être suspendu sans préavis.'),
    h('h2', {}, '4. Contenus générés'),
    P('Vous êtes responsable des textes et images que vous envoyez et de l’usage des résultats. Sous réserve des licences des modèles utilisés, vous pouvez utiliser vos créations. Les résultats d’IA peuvent être inexacts ou inattendus.'),
    h('h2', {}, '5. Connecteurs (Claude et autres assistants)'),
    P('En autorisant un assistant, vous lui permettez de générer en votre nom (débit de vos crédits), de voir vos créations et votre solde. Vous pouvez retirer cet accès à tout moment dans Paramètres → Connecteurs.'),
    h('h2', {}, '6. Disponibilité et responsabilité'),
    P('Le service est fourni « en l’état », sans garantie de disponibilité. ZODIAK AI ne saurait être tenu responsable des dommages indirects liés à son utilisation.'),
    h('h2', {}, '7. Modification'),
    P('Ces conditions peuvent évoluer ; la date de mise à jour figure en bas de page.'),
  ]],
  confidentialite: ['Confidentialité', () => [
    h('h2', {}, 'Données collectées'),
    L('Compte : adresse e-mail, mot de passe (stocké sous forme chiffrée par notre prestataire d’authentification).',
      'Usage : prompts, images envoyées, créations, historique de crédits, dates.',
      'Technique : journaux de sécurité limités (adresse IP pour la limitation des abus).'),
    h('h2', {}, 'Finalités'),
    P('Fournir le service (générer et conserver vos créations), gérer vos crédits, prévenir les abus et assurer la sécurité.'),
    h('h2', {}, 'Destinataires'),
    L('Supabase : stockage du compte, des données et des fichiers (accès limité à votre propre compte).',
      'fal.ai : reçoit le prompt et, le cas échéant, l’image source, uniquement pour exécuter la génération demandée.',
      'Vercel : hébergement du site et de l’API.'),
    P('Aucune donnée n’est vendue ni utilisée à des fins publicitaires. Le site n’utilise qu’un cookie de session nécessaire à la connexion, sans traceur.'),
    h('h2', {}, 'Durée et droits'),
    P('Vos données sont conservées tant que votre compte existe. Vous pouvez supprimer vos créations à tout moment depuis la galerie, et demander la suppression de votre compte ou l’accès à vos données (droits RGPD : accès, rectification, effacement, portabilité, opposition) via le contact indiqué dans les mentions légales. Vous pouvez aussi saisir la CNIL.'),
  ]],
};

/** @param {HTMLElement} root */
export function mount(root) {
  const key = (location.hash.split('?')[0].split('/')[2] || 'mentions');
  const [title, body] = PAGES[key] || PAGES.mentions;
  document.title = `${title} - ZODIAK AI`;
  root.append(h('article', { class: 'page legal' },
    h('div', { class: 'page-head' }, h('h1', {}, title), h('p', { class: 'lede' }, `Dernière mise à jour : ${UPDATED}`)),
    ...body(),
    h('nav', { class: 'legal-nav' }, ...Object.entries(PAGES).map(([k, [t]]) => h('a', { href: `#/legal/${k}`, 'aria-current': k === key ? 'page' : null }, t)))));
  return () => {};
}
