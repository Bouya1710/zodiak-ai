# LICENCES.md — Licences des modèles et outils

> Vérifié le 25/10/2026 par recherche web. La colonne « Vérifié » dit si la licence a été confirmée par une source citée ; **« non vérifié »** signifie que c'est ma connaissance générale, à confirmer sur la carte officielle du modèle avant tout usage commercial. Les licences de modèles changent : relisez le texte officiel.
> Le code de ZODIAK AI lui-même est sous **Apache-2.0** (fichier `LICENSE`). Les poids de modèles ne sont **pas** redistribués par ce dépôt : `scripts/download-models.sh` les télécharge depuis leurs sources officielles, vous acceptez leur licence.

## Modèles inclus dans les profils par défaut

| Modèle | Usage dans ZODIAK AI | Licence | Usage commercial | Vérifié | Source |
|---|---|---|---|---|---|
| Wan 2.2 (TI2V-5B, A14B) | vidéo texte→vidéo et image→vidéo | Apache-2.0, aucun droit revendiqué sur les sorties | Oui | Oui | [magichour](https://magichour.ai/blog/ltx-2-3-vs-wan-2-2), [promptquorum](https://www.promptquorum.com/power-local-llm/local-ai-video-generation-vs-cloud) |
| FLUX.1 [schnell] | image par défaut | Apache-2.0 | Oui | Oui | [cinevva](https://app.cinevva.com/fr/guides/frontier-gen-ai-models), [insiderllm](https://insiderllm.com/guides/flux-locally-complete-guide/) |
| Real-ESRGAN | upscale image/vidéo | BSD-3-Clause | Oui | Oui (texte de licence listé) | [licences.html](https://huggingface.co/steammerf1/jay/blob/main/html/licenses.html) |

## Modèles optionnels (désactivés par défaut)

| Modèle | Licence | Commercial | Vérifié | Note |
|---|---|---|---|---|
| FLUX.2 [klein] 4B | Apache-2.0 | Oui | Source unique (cinevva) | À confirmer sur la carte officielle |
| Chroma1-HD (dérivé de FLUX schnell) | Apache-2.0 | Oui | Source unique (cinevva) | Alternative sûre à FLUX dev |
| LTX-2 / LTX-2.3 | LTX Community License | Gratuit sous 10 M$ de revenu annuel, licence payante au-delà | Oui | Audio+vidéo synchronisés ; **n'est pas open source au sens OSI** |
| FLUX.1 [dev], FLUX.2 [dev] | Non commerciale | **Non** | Oui | Usage personnel/recherche seulement |
| SDXL | CreativeML Open RAIL++-M | Oui avec restrictions d'usage | **Non vérifié** | Lire les restrictions |
| RIFE (interpolation) | MIT (à ma connaissance) | Oui | **Non vérifié** | |
| LatentSync (lip-sync) | Apache-2.0 (à ma connaissance) | Oui | **Non vérifié** | Dépend aussi de modèles audio (Whisper, MIT, non vérifié) |
| Détecteur NSFW image (ex. Falconsai/nsfw_image_detection) | Apache-2.0 (à ma connaissance) | Oui | **Non vérifié** | Utilisé par le garde-fou de sortie optionnel |

## Modèles **exclus** et pourquoi

| Modèle | Raison |
|---|---|
| HunyuanVideo 1.5 | Licence communautaire Tencent qui **exclut l'UE, le Royaume-Uni et la Corée du Sud**, pour le modèle et ses sorties ([promptquorum](https://www.promptquorum.com/power-local-llm/local-ai-video-generation-vs-cloud)). Vous êtes en France : exclu. |
| CodeFormer | Licence S-Lab, usage non commercial ([licences.html](https://huggingface.co/steammerf1/jay/blob/main/html/licenses.html)). |
| InstantID / PuLID (portraits cohérents) | S'appuient sur InsightFace, dont les poids sont réputés non commerciaux (**non vérifié**). Remplacés en phase 2 par des images de référence + LoRA utilisateur (voir DECISIONS.md D-012). |
| Seedance, Kling, Veo, GPT Image, Nano Banana | Propriétaires : non reproductibles ni redistribuables. |

## Services cloud (mode serverless)

L'usage de RunPod, Modal, fal ou Replicate est soumis à leurs conditions d'utilisation, et les modèles qu'ils hébergent à leurs propres licences. ZODIAK AI n'envoie vos prompts qu'au fournisseur que vous configurez.

## Dépendances logicielles du dépôt

Les dépendances npm (Fastify, BullMQ, Next.js, React, pg, AWS SDK, zod…) sont sous licences permissives (MIT/Apache-2.0) ; `scripts/check-licenses.sh` liste les licences réelles installées.
