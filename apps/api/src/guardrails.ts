// Garde-fous : filtre de prompts par règles + consentement visages.
// Limite assumée : un filtre par règles réduit le risque, il ne le supprime pas.

export type BlockCategory = 'sexual' | 'minors' | 'real_person' | 'violence' | 'self_harm';
export type PromptCheck = { ok: true } | { ok: false; category: BlockCategory; reason: string };

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Minuscules, sans accents, leetspeak simple, ponctuation → espaces. */
export function normalize(input: string): string {
  const base = input.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
  const leet = [...base].map((c) => LEET[c] ?? c).join('');
  return leet.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MINOR = /\b(child|children|kid|kids|minor|minors|underage|under age|teen|teens|teenager|teenage|schoolgirl|schoolboy|toddler|baby|infant|preteen|enfant|enfants|mineur|mineure|mineurs|adolescent|adolescente|ado|ados|gamin|gamine|fillette|petite fille|petit garcon|collegien|collegienne|lyceen|lyceenne|bebe)\b/;
const MINOR_ALONE = /\b(loli|lolita|lolicon|shota|shotacon)\b/;
const SEXUAL = /\b(porn|porno|pornographic|pornographique|hentai|nsfw|xxx|nude|nudes|naked|topless|nue|nues|nus|erotic|erotique|erotica|sexual|sexually|sexuel|sexuelle|sex|sexe|sexy|blowjob|handjob|orgasm|orgasme|genitals|genitalia|vagina|penis|pussy|boobs|nipples|tetons|bdsm|fetish|fetiche|masturbation|masturbating|cumshot|onlyfans|undressed|deshabille|deshabillee|lingerie)\b/;
const SEXUAL_EXPLICIT = /\b(porn|porno|pornographic|pornographique|hentai|nsfw|xxx|nude|nudes|naked|topless|nue|nues|erotic|erotique|erotica|sexual|sexually|sexuel|sexuelle|sex|sexe|blowjob|handjob|orgasm|orgasme|genitals|genitalia|vagina|penis|pussy|boobs|nipples|tetons|bdsm|masturbation|masturbating|cumshot|onlyfans|undressed|deshabille|deshabillee)\b/;
const NAKED_OK = /\bnaked (eye|eyes|truth|flame|flames|mole rat|singularity|city)\b|\bsex (education|ed)\b|\bnus pieds\b/g;
const REAL_PERSON = /\b(deepfake|deepfakes|deep fake|faceswap|face swap|swap (the |his |her |my |their )?face|echange de visage|echanger le visage|remplacer le visage|remplace le visage|likeness of|lookalike of|looks exactly like|ressemblant a|identique a la vraie)\b/;
const VIOLENCE = /\b(gore|gory|dismember\w*|decapitat\w*|disembowel\w*|snuff|mutilat\w*|eviscerat\w*|torture porn|demembr\w*|decapit\w*|eventr\w*|egorge\w*)\b/;
const SELF_HARM = /\b(how to (kill|hurt|harm) myself|suicide method|suicide methods|methode de suicide|comment me suicider|how to commit suicide)\b/;

export function checkPrompt(...texts: (string | null | undefined)[]): PromptCheck {
  const joined = texts.filter(Boolean).join(' . ');
  if (!joined) return { ok: true };
  const n = normalize(joined);
  const cleaned = n.replace(NAKED_OK, ' ');
  if (MINOR_ALONE.test(cleaned) || (MINOR.test(cleaned) && SEXUAL.test(cleaned)))
    return { ok: false, category: 'minors', reason: 'Contenu sexualisant ou suggestif impliquant des mineurs : refusé sans exception.' };
  if (SEXUAL_EXPLICIT.test(cleaned))
    return { ok: false, category: 'sexual', reason: 'Contenu sexuel explicite ou nudité : non autorisé sur cette instance.' };
  if (REAL_PERSON.test(cleaned))
    return { ok: false, category: 'real_person', reason: "Demande de deepfake ou d'imitation d'une personne réelle : utilisez un personnage fictif." };
  if (SELF_HARM.test(cleaned))
    return { ok: false, category: 'self_harm', reason: "Contenu lié à l'automutilation ou au suicide : refusé. Si vous êtes en difficulté, parlez-en à un proche ou au 3114 (France)." };
  if (VIOLENCE.test(cleaned))
    return { ok: false, category: 'violence', reason: 'Violence extrême ou gore : non autorisé sur cette instance.' };
  return { ok: true };
}

export const NOTICES = {
  realFaces:
    "N’envoyez une photo que si vous avez le droit de l’utiliser et, pour une personne identifiable, son accord. Il est interdit de créer des deepfakes, des contenus trompeurs ou des images sexuelles d'une personne réelle.",
  content: "Les contenus sexuels, impliquant des mineurs, ou d'une violence extrême sont refusés. Les prompts refusés sont journalisés (sans le texte complet).",
} as const;

/** Une image téléversée (visage possible) exige un consentement explicite. */
export function requireConsent(usesUploadedImage: boolean, consent: unknown): { ok: true } | { ok: false; reason: string } {
  if (usesUploadedImage && consent !== true && consent !== 'true')
    return { ok: false, reason: "Cochez la case « J'ai le droit d'utiliser cette image » pour continuer." };
  return { ok: true };
}
