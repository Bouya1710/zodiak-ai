# Écarts de structure avec la référence (phase 4)

Méthode : captures de référence (`docs/ux-ref/higgsfield-*.jpg`, usage interne uniquement) mesurées à l'échelle 1440 px ; captures ZODIAK AI en ligne comparées écran par écran (`docs/ux-ref/compare-*.jpg`). Aucun asset, texte, code ni CSS de la référence n'est repris.

## Mesures relevées (échelle 1440 px)
- En-tête : 52 px, navigation 13 px / 500, entrée active en couleur d'accent sans fond, boutons 32 px.
- Marges de page 16 px, espacement des cartes 12 px, rayons 12 px.
- Accueil : pas de hero ; bandeau horizontal de cartes 16:9 (2,8 visibles, la dernière coupée), titre capitales 13 px / 800 + ligne 12 px.
- Promo : 44 % / 56 %, hauteur 270 px ; grille de 6 tuiles (3 × 2) de 112 px.
- Bannière large sombre, puis mur de presets (6 colonnes, hauteurs variables, fondu), puis grille 4 colonnes 16:10 avec rubans et avatars.
- Studio : panneau 340 px, onglets soulignés, carte modèle, zone de références en pointillés, bouton Générer 46 px collé en bas ; zone droite : boutons Historique / Résultats, carte « en un clic » avec 3 colonnes et bandeau bas.
- Tarifs : bandeau promo encadré, barre d'options, 4 cartes teintées (sombre, cyan, rose, bleu) avec encadré de crédits, prix, bouton plein, liste.
- Mobile : barre d'onglets basse avec bouton central, bandeau défilant, tuiles en 2 colonnes.

## Écarts constatés avant correction → correction
| Écran | Écart | Correction |
|---|---|---|
| Accueil | Grand hero texte absent de la référence | Supprimé ; bandeau de cartes média en tête |
| Accueil | Promo trop large, tuiles 2 colonnes | 44/56, tuiles 3 × 2, pastille « Nouveau » |
| Accueil | Pas de bannière ni de mur de presets | Ajoutés (bannière ZODIAK STUDIO, 24 presets, vidéo au survol) |
| Accueil | Mosaïque en colonnes CSS | Grille 4 colonnes 16:10, rubans, avatar |
| Studio | Panneau 400 px, onglets en pastilles | 340 px, onglets soulignés |
| Studio | Zone droite : titre et étapes génériques | Carte « en un clic », 3 colonnes 4:3, bandeau bas |
| Tarifs | Hero + 3 cartes neutres | Bandeau encadré, 4 cartes teintées, encadré de crédits |
| Galerie | Grille auto-fill 200 px | 4 colonnes 16:10 |
| Mobile | Nom de marque et bouton masqués même déconnecté | Masqués seulement connecté (`:has(.credits)`) |

## Écarts restants connus
- Les vidéos de la vitrine sont encore des animations de repli tant que `FAL_KEY` n'est pas fournie.
- Typographie : la référence utilise une police propriétaire ; nous gardons Avenir Next / Inter (système), donc l'interlettrage varie de ±1 px.
- Pas de capture de référence de la galerie : mise en page déduite de la grille « intérieur des projets ».

## Passe 2 — 25/10/2026 (Claude Code, Playwright avec Internet)
Contrôle en ligne de https://zodiak-ai-mrow.vercel.app à 1440 px et 375 px (accueil, tarifs, connexion ; studio/galerie/outils redirigent vers la connexion sans compte) : aucune erreur JS, aucun débordement horizontal. Seules erreurs réseau attendues : `401 /api/auth/me` (visiteur) et `400 /showcase/manifest.json` (aucun clip généré). Studio, galerie, outils, personnages et bouton Historique contrôlés connectés sur une instance locale (même front).

| Écran | Écart | Correction (`css/v4.css`) |
|---|---|---|
| Studio | Sélecteur « Image → vidéo / Texte → vidéo » écrasé à 2 px (bug : lignes de grille auto + `overflow: hidden`) | `grid-auto-rows: max-content` ; sélecteur sous la carte modèle, style segmenté 2 colonnes comme la référence |
| Studio | Carte modèle trop basse (112 px vs ≈150) | 142 px |
| Studio | Zone d'image alignée à gauche, boutons empilés | Zone centrée (icônes, titre, 2 boutons sur une ligne) |
| Studio | Puces de format sur 2 lignes | Grille 4 colonnes |
| Studio | Avertissement « visages réels » trop présent en haut | Compact, aligné à droite des boutons Historique / Résultats |
| Mobile | Visiteur : nom de marque et « Commencer » masqués (`:has(.credits)` toujours vrai, l'élément existe masqué) | Test `:has(.credits:not([hidden]))` ; « Tarifs » visible, « Connexion » via « Commencer » |
| Mobile | Bandeau : une carte et demie (78 %) contre deux dans la référence | 62 % ; bouton promo en bas de la carte |

Captures : `compare-home-top.jpg`, `compare-home-mobile.jpg`, `compare-pricing.jpg`, `compare-studio.jpg`.

### Écarts restants
- Studio : la référence présente Durée et Format en deux cartes compactes côte à côte (valeur + chevron) ; nous gardons les puces.
- Studio : bouton « Changer » sur la carte modèle (nécessite de modifier `studio.js`, prévu avec le passage à Git).
- Tarifs : bandeau promo plein (texture) dans la référence, simple bordure chez nous.
- Vitrine : toujours des animations canvas tant que `FAL_KEY` manque.
