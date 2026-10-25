# ANALYSE.md — Étude de Higgsfield (étape 1)

> Date : 25/10/2026. Sources : site public (page d'accueil, page tarifs, accès bloqué à l'interface de génération sans compte) et catalogue de modèles du connecteur Higgsfield (`models_list` / `models_get`, pages 1 de vidéo et d'image, audio complet).
> Légende : **[observé]** = lu sur le site ou le catalogue ; **[déduit]** = hypothèse de ma part, à ne pas prendre pour un fait.
> Limites : je n'ai pas créé de compte, donc je n'ai pas vu l'interface de génération, la galerie ni les workspaces de l'intérieur. Le catalogue est paginé et je n'ai lu que les 40 premiers modèles vidéo, les 20 premiers modèles image et tous les modèles audio. Les coûts en crédits par génération ne sont pas affichés sur ce que j'ai lu.

---

## 1. Fonctionnalités

### 1.1 Création (menu du site) [observé]
AI Video, AI Image, Edit Image, Inpaint, Upscale, Sora 2 Upscale, Mixed Media, AI Face Swap, AI Influencer, Apps.

### 1.2 Studios spécialisés [observé]
- **Cinema Studio** (4.0) : contrôles de caméra (boîtier, optique, ouverture), époque, genre, rythme de montage, éclairage (préréglages ou rig personnalisé avec directions, couleur, luminosité, diffusion), palette de couleurs. Modes : texte→vidéo, références omni (image/vidéo/audio), édition vidéo, extension vidéo, 4 à 30 s.
- **Marketing Studio** : publicités produit en un clic (formats UGC, tutoriel, unboxing, avis produit, essayage virtuel), avatars, produits, hooks, décors, kits de marque.
- **Lipsync Studio**, **Photodump Studio**, **Fashion Factory**, **Popcorn**, **Canvas**.
- **Soul** : Soul 2.0 (images UGC/éditorial/personnages), **Soul ID** (personnage cohérent personnalisé), Soul Cinema, Soul Cast, Soul Location.
- **Genjutsu** (et Genjutsu Lite) : transfert de mouvement d'une vidéo de référence vers vos personnages, lieux ou produits ; présenté comme alimenté par la communauté (presets).
- **Supercomputer** : agent qui orchestre la création (coût en crédits affiché avant rendu, validé par l'utilisateur). Annoncé sur GPT-6 Astra.
- **AI Motion Designer**, **MCP/CLI**, **API**, **Collab**, **Games** (pipeline d'assets de jeu, dont AutoSprite : personnage → sprite sheet).

### 1.3 Outils de post-production [observé dans le catalogue]
Lip-sync (Sync Lipsync 3), doublage dans 18 langues, changement de voix, retrait de fond vidéo, reframe (changement de format), upscale vidéo (Topaz, Bytedance), conversion SDR→HDR, déflicker, interpolation d'images.

### 1.4 Audio [observé]
Synthèse vocale (Seed Audio, Qwen TTS, ElevenLabs v4, Inworld, moteur « Text to Speech V2 » multi-fournisseurs), clonage de voix par élément de référence, musique (Sonilo), effets sonores (Mirelo).

### 1.5 Modèles proposés [observé]
Higgsfield **n'entraîne pas tout lui-même** : c'est une place de marché de modèles tiers plus quelques modèles maison.

| Type | Modèles (extrait) | Fournisseurs |
|---|---|---|
| Vidéo maison | Cinema Studio 3.0 / 4.0, Marketing Studio, Genjutsu, Ad Multiplier | Higgsfield (certains reposent sur Seedance 2.5 d'après la description) |
| Vidéo tiers | Seedance 1.5 / 2.0 / 2.0 Mini / 2.5, Kling 2.6 / 3.0 / 3.0 Turbo / 4.0 / Omni, MiniMax Hailuo / H3 / H3 Max, FLUX 3 Video, Grok Video 1.5, Happy Horse, Wan 2.6 | ByteDance, Kling, MiniMax, Black Forest Labs, xAI, Wan… |
| Image maison | Soul 2.0, Soul Cinema, Soul Cast, Soul Location, Cinema Studio Image 2.5, Marketing Studio Image, DTC Ads, AutoSprite | Higgsfield |
| Image tiers | GPT Image 2, Nano Banana (1, Pro, 2, 2.1, Lite), Seedream 4.5, FLUX.2, Z Image | OpenAI, Google, ByteDance, BFL, Tongyi-MAI |

Paramètres typiques [observé] : durée de 2 à 30 s selon le modèle, résolution 480p à 4K, ratios 21:9 à 9:16, audio natif activable, images de début/fin, références image/vidéo/audio, genre, seed, batch jusqu'à 4 (vidéo) ou 20 (image), mode « draft » 480p finalisable ensuite. **Wan 2.6** est le seul modèle de la liste étiqueté « open-weight ».

---

## 2. Parcours utilisateur

| Étape | Ce qui est visible | Statut |
|---|---|---|
| Inscription | Offres promo à l'inscription (réduction supplémentaire, Nano Banana Pro illimité) | [observé] bannières ; formulaire non vu |
| Accueil | Vitrine de projets communautaires avec prompts et assets visibles (« voir comment chaque projet a été créé »), compteurs de likes | [observé] |
| Interface de génération | Barre latérale : Home, My generations, My elements, My favorites, Community, Projects (« New project »), Explore | [observé] (shell seulement, contenu derrière login) |
| Éléments réutilisables | « Elements » : personnages, voix, produits, lieux réutilisables entre générations | [observé] dans les paramètres (voice element, avatar, kling_element_ids) |
| Références dans le prompt | Syntaxe @image1 / @video1 convertie en liens d'éléments (d'après un avis utilisateur) | [observé] (témoignage) |
| Historique / galerie | « My generations », « My favorites », dossiers (`folder_id` dans l'API) | [observé] noms ; contenu non vu |
| Partage / collab | Communauté, concours, page Collab, workspaces (le connecteur expose list/select workspace) | [observé] noms ; fonctionnement non vu |

---

## 3. Crédits et tarifs [observé sur la page tarifs]

| Offre | Prix (hors TVA) | Contenu principal |
|---|---|---|
| Starter mensuel | 19 €/mois | 3 modèles « illimités », ~100 générations Nano Banana Pro/mois, 300 générations Soul V2 & Cinema, parallèle : 2 vidéos / 4 images, accès limité aux modèles |
| Plus mensuel | 59 €/mois | 7 modèles illimités, ~500 Nano Banana Pro/mois, accès à tous les modèles dont Seedance 2.0, 3 000 gén. Soul V2 & Cinema, parallèle : 6 vidéos / 8 images |
| Plus annuel | 47 €/mois facturé à l'année (−20 %) | idem avec volumes annuels (6 000 Nano Banana Pro/an, 5 000 Soul), accès Seedance 2.5 |
| Accès ponctuel | 3 $ | 40 crédits, 2 jours de Soul 2.0 illimité |

Règles observées :
- Chaque modèle consomme un nombre de crédits selon type, durée et résolution ; les crédits d'abonnement **expirent** à chaque cycle ; packs de crédits achetables.
- « Illimité » : file standard, vitesse ajustée en cas de charge, usage humain uniquement (automatisation interdite), disponible seulement sur le site (pas via MCP/CLI/Canvas/Supercomputer). Le mode crédits passe en file prioritaire.
- Le coût exact en crédits par génération n'apparaît pas sur les pages lues. **Je ne l'invente pas** : il faudra le relever avec un compte ou le calculer en étape 2 à partir des tarifs publics des fournisseurs de modèles.

---

## 4. Design et UX [observé, partiel]

- Navigation en méga-menu par catégories (Create / Video Models / Image Models / Studios / Soul / Platform / Resources).
- Page d'accueil centrée sur la **preuve sociale et l'inspiration** : galeries communautaires avec prompt et assets exposés, témoignages, 25 millions de créateurs revendiqués.
- Stratégie « presets » : motion et styles prêts à l'emploi plutôt que prompt libre seul.
- Flux de génération (file d'attente, progression) : **non observé** sans compte. À reconstruire de façon originale.

---

## 5. Architecture probable [déduit]

Aucune de ces déductions ne vient d'un contournement ; elles reposent sur ce qui est affiché et sur la forme du catalogue.

- **Frontend** web applicatif riche (SPA/SSR), vues Home / Generations / Projects / Explore.
- **API de jobs asynchrones** : paramètres typés par modèle, `folder_id`, `batch_size`, modes « draft » puis finalisation, ce qui suggère des jobs persistants avec états.
- **Passerelle multi-fournisseurs** : la majorité des modèles sont tiers (OpenAI, Google, ByteDance, Kling, MiniMax, xAI, BFL…), donc Higgsfield agit comme orchestrateur payant, pas comme hébergeur de tous les GPU.
- **Files de priorité** : « standard » (illimité) vs « prioritaire » (crédits), avec limites de parallélisme par plan.
- **Stockage média + CDN** pour les sorties, éléments, dossiers.
- **Facturation à crédits** avec cycles et expiration.
- **Couche agent** (Supercomputer) qui planifie, chiffre en crédits puis exécute après validation.
- **Intégrations** : API, MCP/CLI.

Conséquence pour votre projet : leur avantage tient surtout à l'accès à des modèles propriétaires de pointe (Seedance, Kling, Veo, GPT Image…) que vous **ne pourrez pas reproduire en open source** ; l'objectif réaliste est la couverture des usages courants avec des modèles ouverts.

---

## 6. Tableau fonctionnalité Higgsfield → équivalent open source

Difficulté : 1 = facile … 5 = très difficile. Priorité : P1 = MVP, P2 = phase 2, P3 = phase 3, — = hors périmètre.
Les noms de modèles sont des pistes à valider en étape 2 (licences et VRAM à vérifier) ; ils ne sont pas des recommandations définitives.

| Fonctionnalité Higgsfield | Équivalent open source possible | Difficulté | Priorité |
|---|---|---|---|
| Text-to-image (Soul, Nano Banana, FLUX.2, Seedream) | FLUX (variantes ouvertes), SDXL, SD 3.x via ComfyUI | 2 | P1 |
| Image-to-video | Wan 2.x, LTX-Video, HunyuanVideo, CogVideoX | 3 | P1 |
| Text-to-video | Wan 2.x, LTX-Video, Mochi | 3 | P1 |
| File d'attente + progression + historique | Redis/BullMQ, Postgres, WebSocket/SSE | 2 | P1 |
| Galerie, favoris, dossiers/projets | Postgres + stockage S3-compatible | 2 | P1 |
| Premier/dernier frame (start/end image) | Workflows Wan/LTX avec image de fin | 3 | P2 |
| Presets de mouvements de caméra / templates | LoRAs de mouvement de caméra, prompts templatés, workflows JSON versionnés | 3 | P2 |
| Personnage cohérent (Soul ID, Soul Cast) | LoRA par personnage, IP-Adapter, InstantID, PuLID | 4 | P2 |
| Éléments réutilisables (personnages, produits, lieux) | Bibliothèque d'images de référence + LoRA | 3 | P2 |
| Transfert de mouvement (Genjutsu) | Modèles de motion control basés sur Wan (VACE/Animate, à vérifier) | 4 | P2/P3 |
| Édition d'image / inpaint | FLUX Fill/Kontext (licence à vérifier), SDXL inpaint | 3 | P3 |
| Upscale image/vidéo | Real-ESRGAN, SeedVR2 (à vérifier) | 2 | P3 |
| Interpolation d'images | RIFE | 2 | P3 |
| Lip-sync | LatentSync, MuseTalk | 3 | P3 |
| Synthèse vocale / clonage de voix | Piper, Kokoro, XTTS/F5-TTS (licences à vérifier) | 3 | P3 |
| Doublage multilingue | Whisper + traduction + TTS + lip-sync | 4 | P3 |
| Retrait de fond | RMBG, rembg, SAM2 | 2 | P3 |
| Reframe (changement de ratio) | Détection de sujet + recadrage/outpainting | 3 | P3 |
| Audio natif de la vidéo | Pas d'équivalent ouvert mûr identifié ; chaîne TTS + effets séparée | 5 | — (à réévaluer) |
| Contrôles Cinema Studio (caméra, optique, éclairage) | Mots-clés de prompt + LoRAs ; pas de contrôle physique fin | 4 | P3 |
| Marketing Studio (publicités produit, avatars, kits de marque) | Template de workflows + images produit ; version simplifiée | 4 | P3 |
| Supercomputer (agent) | Agent LLM local ou API générant des workflows ComfyUI | 4 | — (hors MVP) |
| Auth, multi-utilisateurs, workspaces | Supabase Auth ou équivalent | 2 | P3 |
| Crédits et facturation | Compteur de crédits interne optionnel (pas de paiement au départ) | 2 | P3 (optionnel) |
| Communauté / partage public | Pages de partage, galerie publique modérée | 2 | P3 |
| Modèles propriétaires (Seedance, Kling, Veo, GPT Image) | Aucun équivalent ouvert de qualité strictement égale | — | — |
| Filtre NSFW / deepfakes, avertissement visages réels | Classifieurs NSFW ouverts, filtrage de prompts, avertissements | 3 | **P1 (garde-fou obligatoire)** |

---

## 7. Écart de qualité attendu (honnêteté)

- Les modèles vidéo ouverts progressent vite mais restent en retrait des meilleurs modèles propriétaires sur la cohérence temporelle, la durée longue et l'audio natif synchronisé.
- Le critère « qualité acceptable comparée aux exemples Higgsfield » devra être testé avec des captures côte à côte en étape 2 ; je ne peux pas le garantir à ce stade.
- Le critère « 10x moins cher » doit se calculer par génération, mode par mode (étape 2), en comparant avec le prix par génération réel de Higgsfield, que je n'ai pas encore pu relever.

---

## 8. Points à décider avec vous avant l'étape 2

1. Voulez-vous que je crée un compte gratuit pour observer l'interface de génération (file d'attente, progression) ? Sinon je conçois l'UX de façon originale sans la voir.
2. Matériel local : quelle carte graphique (VRAM) vise-t-on pour le mode « GPU local » ?
3. Cible principale : outil personnel ou service multi-utilisateurs ? Cela change la priorité de la phase 3.

---

## 9. Sources

- Page d'accueil Higgsfield : https://higgsfield.ai/
- Page tarifs Higgsfield : https://higgsfield.ai/pricing
- Catalogue de modèles via le connecteur Higgsfield (`models_list`, `models_get`)
