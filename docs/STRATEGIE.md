# STRATEGIE.md — « Gratuit ou 10× moins cher » (étape 2)

Les chiffres de coût et leurs sources sont dans [COUTS.md](COUTS.md), les licences dans [LICENCES.md](LICENCES.md).

## 1. Principe
Higgsfield revend surtout des modèles propriétaires de tiers (voir ANALYSE.md). ZODIAK AI ne peut pas les égaler tous ; il vise les **usages courants** avec des modèles ouverts à licence commerciale claire, pilotés par **ComfyUI en mode headless** avec des workflows JSON versionnés (`workflows/`).

## 2. Fonctionnalité → modèle retenu

| Fonctionnalité | Modèle par défaut | Alternative | Pourquoi |
|---|---|---|---|
| Texte → image | FLUX.1 schnell (Apache-2.0, 4 pas) | FLUX.2 klein 4B, Chroma1-HD | Rapide (~3 s sur 4090), licence propre |
| Image → vidéo | Wan 2.2 TI2V-5B | Wan 2.2 A14B (24 Go), LTX-2 (licence à seuil) | Apache-2.0, 720p/24 fps, tient sur 12–24 Go |
| Texte → vidéo | Wan 2.2 TI2V-5B | idem | Un seul modèle pour t2v et i2v |
| Presets de caméra | Fragments de prompt versionnés (`catalog/camera_presets.json`) | LoRAs de mouvement | Wan réagit au vocabulaire de caméra ; aucun poids supplémentaire |
| Personnage cohérent | Image de référence + graine + LoRA utilisateur | PuLID / InstantID (exclus, licence) | Voir D-012 |
| Upscale | Real-ESRGAN (BSD-3) | SeedVR2 (non vérifié) | Nœuds natifs ComfyUI |
| Interpolation | RIFE | ffmpeg `minterpolate` (repli) | Fluidifier 24 → 48 fps |
| Lip-sync | LatentSync | MuseTalk | Phase 3, nécessite GPU 16+ Go |
| Montage | ffmpeg côté serveur | — | Aucun modèle requis |

## 3. Trois modes de déploiement (réglage `GENERATION_BACKEND`)

| Réglage | Mode | Quand |
|---|---|---|
| `comfyui` | **a) GPU local** : worker → ComfyUI sur la même machine ou le LAN | Vous avez une carte 12–24 Go |
| `runpod` / `fal` | **b) serverless** : le worker envoie le workflow (RunPod) ou l'appel d'API (fal) | Pas de GPU local |
| `comfyui` + cache + file | **c) hybride** : cache par empreinte, file qui garde le GPU occupé, brouillon 480p | Pod loué ou machine partagée |
| `mock` | Démo sans GPU : images et vidéos synthétiques générées par ffmpeg/Pillow | Test, CI, `docker compose up` sans GPU |

Le choix se fait par une seule variable (`.env`), sans changer de code.

## 4. Quantification
Voir COUTS.md §5 et les profils `GPU_PROFILE=vram12|vram16|vram24`. Règle pratique : FP8 d'abord (qualité quasi identique à FP16), GGUF Q4–Q5 seulement si la VRAM l'impose, car il ralentit et dégrade un peu.

## 5. Garde-fous (obligatoires)
Filtre de prompts (contenu sexuel, mineurs, violence extrême, demandes de deepfake de personnes réelles), case de consentement pour tout téléversement de visage, détecteur NSFW de sortie optionnel (service `safety`), avertissement visible, journal d'audit des refus. Détails : ARCHITECTURE.md §6.

## 6. Limites assumées
Pas d'audio natif synchronisé, pas de modèles propriétaires, qualité vidéo inférieure à Kling/Seedance. L'écart doit être jugé sur vos propres prompts : `scripts/compare/README.md` décrit le protocole de comparaison avec captures.
