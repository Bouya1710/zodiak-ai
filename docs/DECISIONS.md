# DECISIONS.md — Décisions importantes (choix, alternatives, raison)

Prises sans attendre votre retour, comme demandé. Chacune est réversible sauf mention contraire.

| # | Décision | Alternatives écartées | Raison |
|---|---|---|---|
| D-001 | **Nom : ZODIAK AI** (identité visuelle originale, logo SVG maison) | Noms évoquant Higgsfield | Contrainte légale : aucune marque, texte ou asset copié |
| D-002 | **Licence Apache-2.0** pour le code | MIT | Clause de brevets, cohérente avec Wan/FLUX schnell |
| D-003 | **API Node 22 + TypeScript sans framework** (`node:http`, routeur maison) | Fastify, FastAPI | Voir D-021 : le registre npm était inaccessible ; zéro dépendance = `docker compose up` sans installation |
| D-004 | **File de jobs dans SQLite** (réclamation atomique, worker intégré ou séparé) | BullMQ/Redis, file Postgres | Aucun service à lancer ; suffisant pour une instance. Redis/BullMQ non fournis |
| D-005 | **SQLite (`node:sqlite`) + migrations SQL, auth maison (scrypt, sessions en base)** | Postgres, Supabase | Un seul fichier, aucun compte externe. `node:sqlite` est expérimental en Node 22 : risque assumé. Postgres non fourni |
| D-006 | **Stockage en dossier local** (classe `Storage` isolée) | S3/MinIO | Simplicité ; adaptateur S3 non écrit |
| D-007 | **Modèles par défaut : FLUX.1 schnell (image), Wan 2.2 TI2V-5B (vidéo t2v + i2v)** | FLUX dev, HunyuanVideo, LTX-2 | Licences commerciales claires (Apache-2.0) ; Hunyuan exclut l'UE ; FLUX dev non commercial ; LTX-2 à seuil de revenu |
| D-008 | **HunyuanVideo exclu** | — | Licence qui exclut l'UE/UK/Corée : vous êtes en France |
| D-009 | **Backend par défaut : `mock`** (images/vidéos synthétiques) | `comfyui` par défaut | `docker compose up` doit marcher sur n'importe quelle machine sans GPU, et permettre une démo/CI. Passer en réel = une variable |
| D-010 | **`MODE=personal` par défaut** (un utilisateur implicite, sans crédits) | `multi` par défaut | Votre consigne. `multi` active inscription et crédits |
| D-011 | **Crédits = grand livre interne** (aucun paiement) | Intégration Stripe | Demandé « optionnel » ; un paiement exigerait des comptes et des obligations légales |
| D-012 | **Personnages cohérents = image de référence + graine + description + LoRA utilisateur** (pas PuLID/InstantID) | PuLID, InstantID | Leurs dépendances (InsightFace) sont réputées non commerciales (non vérifié) ; la voie retenue reste 100 % libre |
| D-013 | **Presets de caméra = fragments de prompt versionnés** | LoRAs de mouvement | Aucun poids supplémentaire, fonctionne avec Wan ; LoRAs possibles plus tard |
| D-014 | **Cache par empreinte** (workflow rendu + entrées + graine) | Pas de cache | Levier de coût du mode hybride ; une génération identique est gratuite |
| D-015 | **Garde-fous par règles + consentement + classifieur de sortie optionnel** | Aucun / modération par LLM externe | Aucune dépendance obligatoire ; limites assumées dans le README |
| D-016 | **Pas de compte Higgsfield créé** | — | Je ne peux pas créer de compte à votre place. L'UX de génération a été conçue sans l'observer ; des captures de votre part permettraient d'ajuster |
| D-017 | **Audio natif de la vidéo hors périmètre** | LTX-2 (audio+vidéo) | Pas d'équivalent ouvert mûr à licence simple ; LTX-2 reste optionnel |
| D-018 | **Honnêteté sur le « 10× »** : atteint en local, en pod rempli et sur les images ; **pas atteint** en serverless 4090 face à Kling | Annoncer 10× partout | Voir COUTS.md §4 |
| D-019 | **Les workflows ComfyUI n'ont pas été exécutés sur GPU** (aucun GPU dans l'environnement de développement) | — | Ils suivent les nœuds natifs de ComfyUI ; à valider avec `scripts/bench.sh` sur votre machine |
| D-020 | **Docker non exécuté en développement** (pas de démon) ; testé processus par processus, `docker compose config` valide | — | Le premier `docker compose up` réel reste à faire de votre côté |

| D-021 | **Zéro dépendance npm, interface sans framework ni build** | Next.js, Fastify, zod, BullMQ (plan initial) | Le registre npm était bloqué par la politique réseau de l'environnement (403 sur CONNECT) ; je ne l'ai pas contourné. Conséquence : tout est en stdlib Node, TypeScript effaçable, SPA vanilla. Coût : routeur/multipart/validation écrits à la main (testés), pas d'écosystème |
| D-022 | **Cache seulement si la graine est explicite** | Cache toujours | Sans graine fixée, deux demandes identiques doivent donner deux résultats différents |
| D-023 | **Lip-sync livré en mock** (audio muxé, sans synchronisation labiale, signalé dans le résultat) | Câbler LatentSync sans pouvoir le tester | Je ne peux pas vérifier le workflow ni la licence des modèles audio ; mieux vaut un état honnête qu'un faux « fonctionne » |
| D-024 | **Interpolation et agrandissement vidéo par ffmpeg** ; Real-ESRGAN via ComfyUI pour les images quand le backend le permet | RIFE, SeedVR2 | Disponibles partout, sans GPU ; qualité inférieure aux modèles dédiés |
| D-025 | **Fournisseurs RunPod/fal écrits mais non testés** | Ne pas les écrire | Le choix du mode cloud est demandé ; le code est court, suit la doc publique et est signalé non testé (identifiants fal réglables) |
| D-026 | **Crédits : coûts relatifs fixes** (`catalog/costs.json`), brouillon = ×0,4, remboursement en cas d'échec, d'annulation, de blocage ou de cache | Tarification dynamique | Simple, prévisible |
| D-027 | **Presets de caméra : fragments de prompt + mouvement ffmpeg pour le mock** | LoRAs de mouvement | Voir D-013 ; le champ `motion` permet de démontrer l'effet sans GPU |

## Mode cloud (Vercel + Supabase)

| # | Décision | Alternatives écartées | Raison |
|---|---|---|---|
| D-030 | **Une seule fonction Vercel** `api/index.js` (réécriture `/api/:path*`) sur le code de `apps/api` + couche `apps/cloud` ; le mode auto-hébergé (`docker compose up`, SQLite) reste inchangé | Réécrire l'API en routes séparées | Une seule base de code, les deux modes partagent routes et garde-fous |
| D-031 | **Supabase Postgres + RLS** ; lectures via PostgREST avec le JWT de l'utilisateur ; écritures privilégiées via des RPC `SECURITY DEFINER` (`app_register`, `app_credits`, `app_write`) protégées par un secret serveur (`ZODIAK_SERVER_SECRET`, variable Vercel) | Clé service-role dans Vercel ; Edge Function passerelle | Pas de clé service-role exposée ; surface minimale |
| D-032 | **Inscription par RPC** (`app_register`) : crée l'utilisateur sans confirmation par e-mail | Confirmation e-mail | Pas de SMTP configuré ; à réactiver avec un SMTP si l'inscription publique est ouverte à grande échelle |
| D-033 | **Stockage : bucket privé `media`**, accès par redirection 302 vers des URL signées | Bucket public | Les images restent privées à leur propriétaire |
| D-034 | **File de jobs = table `jobs`** ; progression par **polling** (pas de SSE ni Realtime) ; `processJob` en tâche de fond (`waitUntil`), délai 8 min | Realtime | Plus simple et fiable en serverless |
| D-035 | **Webhooks fal/RunPod signés (HMAC)** : ils enregistrent seulement l'URL du résultat ; le job est finalisé au prochain poll (`reconcile`) | Finaliser dans le webhook | Un webhook ne doit pas porter le traitement lourd |
| D-036 | **ffmpeg** : binaire `ffmpeg-static` copié dans `/tmp` de la fonction pour les outils légers (coupe, assemblage, interpolation mock) ; les gros traitements GPU relèvent de fal/RunPod | Worker séparé | Suffisant pour le mock ; un worker dédié reste documenté pour la production à forte charge |
| D-037 | **Mock par défaut en ligne** ; téléversements limités à 4 Mo (limite de corps des fonctions Vercel) ; 100 crédits à l'inscription | — | Fonctionne sans GPU ni clé payante |
| D-038 | **Vrais modèles : coller `FAL_KEY`** (ou `RUNPOD_API_KEY` + `RUNPOD_ENDPOINT_ID`) dans Vercel et mettre `GENERATION_BACKEND=fal` (ou `runpod`) | — | Aucun changement de code ; fournisseurs non testés (voir D-025) |
| D-039 | **Déploiement sans Git** : code empaqueté en fichiers `pack-NN.txt`, reconstruits par `scripts/unpack.mjs` au build (vérification sha1 à l'envoi) ; dépôt GitHub non créé | Push GitHub | L'environnement de travail ne pouvait ni joindre l'API GitHub ni exécuter un push ; le dépôt reste à créer |

## Interface de type studio et vitrine (phase 3)

| # | Décision | Alternatives écartées | Raison |
|---|---|---|---|
| D-040 | **Refonte de l'interface sur le modèle d'un studio de création** (accueil à médias, studio deux colonnes, tarifs en crédits, barre mobile) ; analyse dans `docs/UX-REFERENCE.md`, aucun asset, texte ni code de la référence repris | Copier | Structure et ergonomie seulement ; identité 100 % ZODIAK AI |
| D-041 | **Vitrine : vraies vidéos générées par nos modèles ouverts**, une seule fois, hébergées en statique (bucket Supabase public `showcase`, servi sous `/showcase/*` par réécriture Vercel). Repli automatique : image poster, puis animation canvas (`js/art.js`) si le clip manque ou ne se charge pas | Génération à chaque visite ; vidéos d'un autre service (interdit) | Coût récurrent nul, aucun média tiers |
| D-042 | **Modèles de la vitrine** : images de départ `fal-ai/flux/schnell` (FLUX.1 [schnell], licence Apache-2.0) ; vidéo `fal-ai/wan/v2.2-a14b/image-to-video` (Wan 2.2 A14B, licence Apache-2.0), 81 images à 16 i/s (≈ 5 s), 720p ; compression ffmpeg H.264 sans audio (cible 1 à 3 Mo) + poster JPEG. Les sorties de modèles ouverts sont utilisables commercialement selon ces licences (voir `docs/LICENCES.md`) ; les prompts sont originaux et sans personne réelle, marque ni logo | LTX-Video (même rôle, retenu en réserve) | Qualité/prix ; prix fal relevés le 25/10/2026 : 0,08 $/s en 720p et 0,003 $/mégapixel |
| D-043 | **Coût de la vitrine** : ≈ 0,41 $ par clip (0,08 $ × 5,06 s + 0,003 $), 14 clips ≈ 5,7 $ (≈ 7,1 $ avec marge de relance) | — | Estimation annoncée avant lancement |
| D-044 | **Génération pilotée par `scripts/generate-showcase.mjs`** (prompts versionnés dans `scripts/showcase-clips.mjs`, estimation sans `--run`) ; en ligne, la fonction `api/showcase-gen.js` fait les étapes (soumission, suivi, compression, envoi) sous jeton `SHOWCASE_TOKEN`, car l'environnement de développement n'atteint pas fal | Exécution locale seule | Pas de clé ni de réseau fal dans l'atelier |
| D-045 | **Envoi par fonction Edge Supabase `showcase-upload`** (clé de service gardée côté Supabase ; seul le hash SHA-256 du jeton est dans le code) | Clé de service dans Vercel | Moindre exposition d'un secret |
