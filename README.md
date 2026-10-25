# ZODIAK AI

Plateforme libre et auto-hébergeable de génération d'images et de vidéos par IA : texte → image, image → vidéo, presets de caméra, modèles de prompts, personnages cohérents, agrandissement, interpolation, montage. Code Apache-2.0, modèles ouverts à licence commerciale claire, aucun contenu ni nom empruntés à un service existant.

> **État honnête** : tout le code est testé de bout en bout avec un backend de démonstration (`mock`, sans IA). Les workflows ComfyUI qui font tourner les vrais modèles (FLUX, Wan 2.2) sont écrits d'après les nœuds natifs de ComfyUI mais **n'ont pas pu être exécutés sur un GPU** pendant le développement. Voir « Ce qui est testé ».

## Lancer (une commande)

```bash
docker compose up        # puis http://localhost:8080
```

Sans GPU ni réglage : mode **personnel** (un utilisateur, pas de connexion ni crédits) et backend **mock** (images procédurales étiquetées « ZODIAK MOCK », vidéos = mouvement de caméra ffmpeg sur l'image). C'est la démo.

Sans Docker : Node ≥ 22.18 et ffmpeg suffisent, **aucun `npm install`** (zéro dépendance).

```bash
node apps/api/src/server.ts     # http://localhost:8080
bash scripts/test.sh            # 20 tests + typage
```

## Passer aux vrais modèles

| Je veux… | Réglages `.env` (voir `.env.example`) |
|---|---|
| **GPU local** 12–24 Go | `GENERATION_BACKEND=comfyui`, `GPU_PROFILE=vram12\|vram16\|vram24`, `scripts/download-models.sh <profil>`, `docker compose --profile gpu up` |
| ComfyUI déjà installé ailleurs | `GENERATION_BACKEND=comfyui`, `COMFYUI_URL=http://hôte:8188` (copiez les fichiers de `workflows/` si besoin) |
| **Serverless** RunPod | `GENERATION_BACKEND=runpod`, `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID` (endpoint « worker-comfyui ») |
| **fal** | `GENERATION_BACKEND=fal`, `FAL_KEY` (identifiants de modèles réglables `FAL_MODEL_*`) |
| **Multi-utilisateurs** | `MODE=multi`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, optionnellement `CREDITS_ENABLED=true` |

Profils GPU : `vram16/24` = FLUX.1 schnell FP8 + Wan 2.2 TI2V-5B FP16 ; `vram12` = FLUX schnell GGUF Q4 (nœud ComfyUI-GGUF). Quantification et coûts : `docs/STRATEGIE.md`, `docs/COUTS.md`.

## Mode cloud (Vercel + Supabase)

Production : https://zodiak-ai-mrow.vercel.app (mock par défaut). Supabase fournit Postgres (RLS), auth et stockage ; Vercel héberge le front et l'API (`api/index.js`). Variables Vercel : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ZODIAK_SERVER_SECRET`, `GENERATION_BACKEND` ; pour de vrais modèles ajouter `FAL_KEY` (ou `RUNPOD_API_KEY` + `RUNPOD_ENDPOINT_ID`). Détails dans `docs/DECISIONS.md` (D-030 à D-039). Le mode auto-hébergé ci-dessus reste inchangé.

## Fonctionnalités par phase

| Phase | Contenu | Où |
|---|---|---|
| 1 | Texte → image, image → vidéo, texte → vidéo, galerie (favoris, recherche), historique, file de jobs avec progression (SSE), annulation, cache, brouillon 480p | page *Studio*, *Galerie* |
| 2 | 22 presets de caméra, 8 modèles de prompts, personnages cohérents (image de référence + graine + description + LoRA utilisateur) | *Studio*, *Personnages* |
| 3 | Agrandissement ×2/×4, interpolation d'images, découpe, assemblage, lip-sync (voir limites), multi-utilisateurs, crédits internes optionnels | *Outils*, `MODE=multi` |

## Ce qui est testé / non testé

| Élément | Statut |
|---|---|
| API, file, cache, crédits, garde-fous, upload, outils ffmpeg, SSE, interface | **Testé** (20 tests ; démo navigateur en mock) |
| Workflows ComfyUI (FLUX, Wan 2.2, Real-ESRGAN) | Écrits, validés structurellement (chargement, variables, LoRA), **non exécutés sur GPU** — lancez `scripts/bench.sh` |
| Backends RunPod et fal | Écrits d'après leur documentation, **non testés** (pas de clé) |
| Lip-sync | **Mock** : l'audio est ajouté à la vidéo sans synchronisation labiale ; le modèle réel (LatentSync) n'est pas câblé |
| Interpolation | ffmpeg `minterpolate` (RIFE non câblé) |
| `docker compose up` | `docker compose config` valide ; image **non construite** (pas de démon Docker en développement) |
| Personnages | Cohérence par description, graine et LoRA ; pas de transfert de visage (PuLID/InstantID exclus pour licence) |

## Coût réel par génération

Détail sourcé dans `docs/COUTS.md` (à re-vérifier : les tarifs changent).

| | Image 1024² | Vidéo 5 s 720p |
|---|---|---|
| Higgsfield (référence, prix au crédit) | ≈ 0,14 $ | 0,75 $ (Kling 3.0) à 2,48 $ (Seedance 2.5) |
| ZODIAK AI, GPU local (électricité) | ≈ 0,0001 € | ≈ 0,014 € |
| ZODIAK AI, pod 4090 loué (0,34 $/h), très utilisé | ≈ 0,0003 $ | ≈ 0,05 $ |
| ZODIAK AI, RunPod serverless 4090 | ≈ 0,001 $ | ≈ 0,17 $ |

Le « ≥ 10× moins cher » est atteint en local, en pod rempli (≥ 70 %) et pour les images ; **il ne l'est pas** en serverless face à Kling (≈ 4,5×), même s'il l'est face à Seedance (≈ 15×). La qualité des modèles ouverts reste inférieure aux modèles propriétaires.

## Sécurité et contenus

Filtre de prompts par règles (sexuel, mineurs, personnes réelles, violence extrême, auto-agression), consentement obligatoire pour toute image ou vidéo téléversée, avertissement visible, journal d'audit des refus, détecteur de sortie optionnel (`SAFETY_URL`). Ce sont des garde-fous à base de règles : ils réduisent le risque sans le supprimer. Auth `scrypt`, cookies HttpOnly, contrôle d'origine, signatures de fichiers vérifiées, isolation par utilisateur.

## Documentation

`docs/ANALYSE.md` (étude du marché) · `STRATEGIE.md` · `COUTS.md` · `LICENCES.md` (modèles) · `ARCHITECTURE.md` · `API.md` · `DECISIONS.md` · `CONTRIBUTING.md`.

## Licence

Code : Apache-2.0 (`LICENSE`). Les poids de modèles ne sont pas redistribués : chacun a sa licence (`docs/LICENCES.md`).
