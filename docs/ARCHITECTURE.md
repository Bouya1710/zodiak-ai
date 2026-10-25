# ARCHITECTURE.md — ZODIAK AI

## 1. Vue d'ensemble

```
 Navigateur ──► zodiak (un seul processus Node 22, port 8080)
                ├─ interface web : SPA statique (apps/web/public, modules ES, sans build)
                ├─ API HTTP + SSE  (apps/api/src : http.ts, routes.ts, auth, jobs, assets, credits)
                ├─ worker intégré (worker.ts) — ou processus séparé : `server.ts --worker-only`
                ├─ SQLite (node:sqlite, WAL) : users, sessions, jobs, assets, characters, credit_ledger, audit_log
                └─ stockage fichiers (data/media), vignettes et outils via ffmpeg
                         │ worker → backend (GENERATION_BACKEND)
        ┌────────────────┼───────────────┬───────────────┐
      mock            comfyui          runpod            fal
   (ffmpeg, sans   (HTTP vers ComfyUI  (serverless,     (file HTTP,
     GPU, démo)     headless, GPU)      non testé)       non testé)
                                   (optionnel) SAFETY_URL : classifieur NSFW de sortie
```

Docker : `docker compose up` construit une image `zodiak` (Node + ffmpeg). `--profile gpu` ajoute un service `comfyui` (non construit en développement).

## 2. Choix de pile (voir DECISIONS.md D-003 à D-006, D-021)

| Couche | Choix | Pourquoi |
|---|---|---|
| Runtime | Node 22 + TypeScript « effaçable » exécuté directement | Aucune étape de build ; typage vérifié par `tsc --noEmit` |
| HTTP | `node:http` + routeur maison (≈150 lignes) | **Zéro dépendance npm** (voir D-021) |
| Base | SQLite via `node:sqlite` (expérimental dans Node 22) | Un fichier, aucun service à lancer ; migrations SQL versionnées |
| File de jobs | Table `jobs`, réclamation atomique `UPDATE … RETURNING`, worker intégré ou séparé | Annulation, reprise après crash, SSE par lecture de l'état ; pas de Redis |
| Stockage | Dossier local (`Storage`, protégé contre `..`) | Simple ; l'interface est petite pour ajouter S3 |
| Auth | Sessions en base (jeton haché SHA-256), mots de passe `scrypt` | Aucune dépendance native |
| Moteur IA | ComfyUI headless + workflows JSON versionnés | Écosystème de nœuds, quantifications FP8/GGUF |
| Frontend | SPA vanilla en modules ES, JSDoc vérifié par `tsc --checkJs` | Pas de build, pas de framework, identité visuelle originale |

Limites assumées : SQLite et le dossier local conviennent à une instance unique (quelques utilisateurs) ; au-delà, il faudra Postgres + S3 + une vraie file (non fournis).

## 3. Cycle d'un job
1. `POST /api/jobs` : validation → **garde-fous** (prompt, personnage, consentement) → débit des crédits → insertion `queued` (une transaction).
2. Le worker réclame le plus ancien job `queued` (`UPDATE … RETURNING`), calcule l'**empreinte** (entrées + paramètres + graine + backend) et consulte le **cache** : trouvé → réutilisation, crédits rendus.
3. Sinon : backend de génération ou outil ffmpeg ; la progression est écrite en base ; l'API la relaie en SSE (lecture périodique de la ligne du job).
4. Contrôle de sortie (si `SAFETY_URL`) → stockage → vignette → asset → job `done`.
5. Échec, blocage ou annulation : statut correspondant et **remboursement**. L'annulation d'un job en cours positionne un drapeau lu par le worker, qui avorte (`/interrupt` côté ComfyUI).

## 4. Workflows ComfyUI
`workflows/*.json` : format API de ComfyUI, variables `{{prompt}}`, `{{width}}`, `{{seed}}`… remplacées avec leur type, `_meta` (id, version, modèles, VRAM, statut de test). LoRA de personnage injectée par programme (`LoraLoaderModelOnly`). Le profil `GPU_PROFILE` choisit les fichiers de modèles (`catalog/profiles.json`).

## 5. Garde-fous
- Prompts, descriptions de personnages : règles normalisées (casse, accents, leetspeak) → refus avec raison en français, journalisé sans le texte complet.
- Visages réels : consentement obligatoire au téléversement (image/vidéo) et sur les jobs qui utilisent un média téléversé ; avertissement permanent.
- Sortie : classifieur optionnel `SAFETY_URL` (échec = blocage).
- Débit limité (auth, création de jobs), contrôle d'origine sur les écritures, en-têtes de sécurité (CSP stricte), signatures de fichiers vérifiées, taille bornée.
- Ce sont des règles, pas une garantie.

## 6. Modes
- `MODE=personal` (défaut) : utilisateur local implicite, pas de connexion, pas de crédits.
- `MODE=multi` : inscription/connexion, médias isolés par utilisateur, crédits internes optionnels (`CREDITS_ENABLED`, `CREDITS_SIGNUP`), rôle admin pour créditer.

## 7. Vitrine vidéo
`catalog` des clips : `scripts/showcase-clips.mjs`. Génération : `scripts/showcase-lib.mjs` (FLUX → Wan 2.2 via la file fal → ffmpeg → fonction Edge `showcase-upload` → bucket public `showcase`). Lecture : le navigateur charge `/showcase/manifest.json` (réécrit vers le bucket), remplace chaque animation canvas par une `<video>` muette en boucle, chargée seulement quand elle est visible, avec poster ; en cas d'échec il revient à l'animation canvas. En auto-hébergement, déposer les fichiers dans `apps/web/public/showcase/`.
