# Référence d'expérience produit

Analyse du produit de référence (higgsfield.ai) faite le 25/10/2026 au navigateur : accueil, studio vidéo, tarifs, vue mobile.
Objectif : retrouver la **même structure, la même logique d'usage et le même ressenti**, avec une identité 100 % ZODIAK AI.
Les captures (dossier `docs/ux-ref/`) ne servent que de documentation interne ; aucun asset, texte, logo, code ou CSS de la référence n'est repris ni chargé dans le produit.

## 1. Constats sur la référence

### Accueil (`ux-ref/higgsfield-home-top.jpg`, `higgsfield-home-explore.jpg`, `higgsfield-home-mobile.jpg`)
- Barre du haut sombre et dense : logo, entrées Explorer / Image / Vidéo / Audio / outils spécialisés (avec pastilles « New »), puis à droite pastille Tarifs, Connexion, Inscription (bouton plein, couleur vive).
- Bandeau de grandes cartes média (vidéos en boucle) avec titre en capitales et une ligne de description : ce sont les outils et modèles à la une.
- Bloc promotionnel « inscription = remise » : grande image à gauche, liste de bénéfices, bouton, et à droite une grille de 6 petites tuiles (modèles/outils) icône + titre + sous-titre.
- Sections répétées « Voir tout » : grille de projets de la communauté (miniatures animées, auteur, compteurs), puis une rangée par modèle phare.
- Nuage de liens « Explorer plus de fonctionnalités » (caméra, effets, upscale, personnages…), puis pied de page en colonnes (Créer, Studios, Plateforme, Ressources, Entreprise, Communauté).
- Mobile : barre d'onglets fixe en bas (Accueil, Communauté, bouton central Créer très visible, Bibliothèque, Profil).

### Studio vidéo (`ux-ref/higgsfield-studio-video.jpg`)
- Page pleine largeur en deux colonnes : **panneau de réglages à gauche** (étroit, défilant), **grande zone de résultats à droite**.
- Panneau : onglets de mode (Créer / Éditer / Contrôle du mouvement), carte du modèle avec aperçu, zone « Ajouter des références » (image, vidéo, audio), champ de prompt, puis lignes de réglages (modèle, durée, format), et un gros bouton **Générer** collé en bas avec le **coût en crédits** dans le bouton.
- Zone droite vide au départ : explication en trois étapes illustrées (ajouter une image → choisir un preset → obtenir la vidéo), bouton Historique en haut, lien vers l'académie en bas.
- Plus de 250 presets de caméra / VFX présentés en cartes visuelles animées.

### Tarifs (`ux-ref/higgsfield-pricing.jpg`)
- Bandeau promo, bascule mensuel / annuel, quatre cartes de plans côte à côte (une mise en avant avec pastille « meilleure offre »), crédits mensuels, équivalences (nombre d'images / vidéos), prix barré, bouton plein par plan, listes de fonctionnalités détaillées dessous.

### Direction visuelle
- Thème sombre quasi noir (#0f1113), texte blanc, une seule couleur d'accent saturée pour les boutons principaux et les mots clés.
- Titres en capitales, graisse forte, interlettrage serré ; texte courant sans empattement.
- Cartes aux coins arrondis, bordures très discrètes, médias en plein cadre, légendes en dégradé sombre en bas de carte.
- Vidéos qui tournent en boucle dans presque toutes les cartes ; le mouvement est le principal vecteur d'émotion.

## 2. Traduction dans ZODIAK AI

| Élément | Référence | ZODIAK AI |
|---|---|---|
| Barre du haut | Explorer, Image, Vidéo, outils, Tarifs, Connexion, Inscription | Explorer, Image, Vidéo, Outils, Personnages, Galerie ; pastille Tarifs, solde de crédits, Connexion, Créer / Commencer |
| Accueil | Hero, cartes à la une, promo + tuiles, grilles, nuage de liens, pied de page | Hero animé, 3 cartes à la une, bloc « 100 crédits » + 6 tuiles, grille de 8 outils, rangée de presets de caméra animés, mosaïque de 12 créations, 3 étapes, 3 plans, appel à l'action, nuage « Explorer plus », pied de page en 4 colonnes |
| Studio | 2 colonnes, panneau + résultats, gros bouton avec coût | Idem : onglets Image / Vidéo / Outils, carte du moteur, références, prompt + modèles, formats, durée, **22 presets de caméra en cartes animées**, réglages avancés, bouton « Générer ✦ coût », sélecteur ×1–×4, résultats en direct + historique |
| Mobile | Barre d'onglets basse avec bouton central | Idem (Accueil, Galerie, Créer, Outils, Crédits) |
| Tarifs | 4 plans, crédits, équivalences | 3 plans (Découverte gratuite, Votre clé, Auto-hébergé), tableau des coûts réels en crédits |
| Couleurs | Fond #0f1113, accent jaune-vert | Fond #07080d, accent dégradé aurore violet → cyan, étoile dorée pour les crédits |
| Logo / nom | — | Anneau de douze points et étoile à quatre branches, « ZODIAK AI » |
| Médias | Vidéos et images produites par IA | Scènes animées générées **par code** (`js/art.js`), originales ; images de démonstration générées par le moteur mock côté serveur |

## 3. Limites respectées
- Aucun logo, nom, slogan, texte, image, vidéo ou icône de la référence ; aucun hotlink.
- Pas de copie de code ni de CSS : la mise en page est réécrite (grilles, variables, composants propres).
- Les « vidéos » de la vitrine sont des animations canvas déterministes, pas des sorties de modèle : elles illustrent l'interface, et sont présentées comme exemples. Les vrais médias générés apparaissent dans le studio et la galerie (moteur de démonstration en ligne, vrais modèles avec une clé fal ou RunPod).
- Les plans de la page Tarifs ne sont pas des offres commerciales payantes : le produit est gratuit et libre ; les coûts réels dépendent du fournisseur choisi (docs/COUTS.md).
