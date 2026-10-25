# COUTS.md — Coût par génération (image, vidéo 5 s)

> Rédigé le 25/10/2026. Chaque chiffre est suivi de sa source. Ce qui est **hypothèse** ou **non trouvé** est marqué comme tel. Les prix des fournisseurs changent : revérifiez avant de vous engager.
> Devise : USD pour ce qui vient des fournisseurs, sans conversion (je ne convertis pas pour ne pas introduire un taux inventé). L'électricité est en €/kWh et son prix est un paramètre.

## 1. Référence : prix Higgsfield

| Élément | Valeur | Source |
|---|---|---|
| Prix du crédit (plan Starter) | 15 $ pour 200 crédits = **0,075 $/crédit** | [Higgsfield — blog](https://higgsfield.ai/blog/best-affordable-ai-video-generators) |
| Vidéo 5 s Kling 3.0 avec audio | 10 crédits ≈ **0,75 $** | idem |
| Vidéo 5 s Seedance 2.5 avec audio | 33 crédits ≈ **2,48 $** | idem |
| Image Nano Banana Pro | ~2 crédits ; calcul tiers « 19 $ / 135 = 0,14 $ par image » | [Krea — comparatif](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs) |
| Plans | Starter 19 €/mois, Plus 59 €/mois (47 € en annuel) ; certains modèles « illimités » dans le plan | [Higgsfield — tarifs](https://higgsfield.ai/pricing) |

Réserves : (1) avec un forfait « illimité », le coût marginal de certains modèles est nul pour l'abonné ; la comparaison porte donc sur le **prix au crédit**. (2) Un test indépendant annonce 3 à 5 essais par clip utilisable ([Luma — Higgsfield pricing](https://lumalabs.ai/news/higgsfield-pricing)) : ce facteur s'applique aussi à ZODIAK AI, il ne change donc pas le rapport.

## 2. Données de base pour ZODIAK AI

| Donnée | Valeur | Source |
|---|---|---|
| Wan 2.2 TI2V-5B, 720p 24 fps, 5 s | **~9 min sur une RTX 4090** (sans optimisation) | [README officiel relayé](https://huggingface.co/unsloth/Wan2.2-TI2V-5B-FP8), [evetech](https://evezone.evetech.co.za/daily-drop/wan-2-2-hits-local-rigs-720p-video-on-24gb-of-vram) |
| FLUX.1 schnell, 1024², RTX 4090 | **~2–4 s** par image | [JarvisLabs](https://jarvislabs.ai/ai-faqs/best-gpu-for-flux) |
| RunPod serverless « flex » 4090 PRO (24 Go) | **0,00031 $/s** | [Runpod docs](https://docs.runpod.io/serverless/pricing) |
| RunPod serverless « flex » A100 80 Go | 0,00076 $/s | idem |
| RunPod Pod RTX 4090 | **0,34 $/h** (Community), 0,69 $/h (Secure) | [hackceleration](https://www.hackceleration.com/labs/runpod-pricing) |
| Modal L40S | 0,000542 $/s | [Modal](https://frontend.modal.com/blog/nvidia-l40s-price-article) |
| Replicate Wan 2.2 i2v « fast » 480p | **0,05 $/vidéo** ; t2v fast 720p 0,10 $ ; i2v A14B 480p 0,40 $, 720p 1,00 $ | [Replicate — blog](https://replicate.com/blog/wan-22) |
| fal Wan 2.2 A14B | 0,10 $/s annoncé par fal (soit 0,50 $ pour 5 s) ; un comparateur tiers liste 0,20–0,40 $/s | [fal](https://fal.ai/learn/tools/ai-video-generators), [aiidelist](https://aiidelist.com/blog/cheapest-wan-2-2-api-pricing-2026) |

**Hypothèses de ma part (paramétrables dans `catalog/costs.json`)** : puissance GPU moyenne 450 W (TDP d'une 4090, borne haute) ; électricité 0,20 €/kWh ; amortissement du matériel non compté (voir §3a).

**Non trouvé** : temps de génération Wan 2.2 5B sur A100/H100/L40S, donc je ne calcule pas de coût serverless sur ces cartes. Mesurez-le avec `scripts/bench.sh` avant de choisir.

## 3. Coût par génération et mode de déploiement

### a) GPU local
- Image (3 s × 450 W = 0,375 Wh) : **≈ 0,00008 €** d'électricité.
- Vidéo 5 s (9 min × 450 W = 67,5 Wh = 0,0675 kWh) : **≈ 0,0135 €**.
- Hors amortissement. Une 4090 à ~1 800 $ (prix de détail cité par [deploybase](https://deploybase.ai/articles/runpod-gpu-pricing)) équivaut à ~6 mois d'usage continu d'une location à 0,34 $/h : le local est rentable à partir d'un usage régulier.

### b) GPU serverless / à la demande
| Mode | Image 1024² (3 s) | Vidéo 5 s 720p (540 s) |
|---|---|---|
| RunPod serverless flex 4090 PRO | 3 × 0,00031 = **0,00093 $** | 540 × 0,00031 = **0,167 $** |
| RunPod Pod 4090 Community, 100 % utilisé | 3/3600 × 0,34 = **0,00028 $** | 0,15 h × 0,34 = **0,051 $** |
| RunPod Pod 4090 Secure, 100 % utilisé | 0,00057 $ | 0,104 $ |
| Replicate Wan 2.2 i2v fast 480p (API gérée) | n/a | **0,05 $** (qualité 480p, pas équivalente) |
| fal Wan 2.2 A14B (API gérée) | n/a | 0,50 $ (prix fal) |

Un pod facture aussi quand il est inactif : coût effectif = tarif ÷ taux d'utilisation.

| Utilisation du pod 4090 Community | Coût vidéo 5 s | Rapport vs Kling 0,75 $ |
|---|---|---|
| 100 % | 0,051 $ | 14,7× |
| 70 % | 0,073 $ | 10,3× |
| 50 % | 0,102 $ | 7,4× |
| 25 % | 0,204 $ | 3,7× |

### c) Hybride (file d'attente + cache)
ZODIAK AI implémente trois leviers : (1) **cache** par empreinte du workflow + entrées (une génération identique ne coûte rien), (2) **file d'attente** qui regroupe les jobs pour garder un pod chaud (utilisation élevée), (3) **mode brouillon** 480p avant le rendu final. Le gain du cache dépend de votre usage : je ne l'ai pas mesuré, donc je ne l'inclus pas dans les chiffres ci-dessus.

## 4. Rapport avec Higgsfield (objectif « au moins 10× moins cher »)

| Mode | Image vs 0,14 $ | Vidéo vs Kling 0,75 $ | Vidéo vs Seedance 2,48 $ |
|---|---|---|---|
| Local (≈ 0,0135 € électricité) | > 1 000× | ≈ 50× | ≈ 170× |
| Pod 4090 Community ≥ 70 % utilisé | > 400× | ≥ 10× | ≥ 34× |
| Serverless flex 4090 PRO (0,167 $) | ≈ 150× | **≈ 4,5× (objectif 10× non atteint)** | ≈ 15× |

Conclusion honnête :
- **Images** : le critère est atteint dans tous les modes, très largement.
- **Vidéo en local** : le critère est atteint (et le coût est quasi gratuit hors matériel).
- **Vidéo en cloud serverless** : face à Kling 3.0 chez Higgsfield, le gain n'est que ~4,5× avec Wan 2.2 5B sur 4090 PRO. Pour atteindre 10× il faut un pod bien rempli (≥ 70 %), ou réduire le temps de rendu (modèles distillés « lightning » : levier **non mesuré ici**). Face à Seedance 2.5, le gain est déjà de ~15×.
- **Qualité** : Kling/Seedance produisent de l'audio natif et une meilleure cohérence ; Wan 2.2 5B n'est pas équivalent. Le rapport de prix compare des produits de qualité différente.

## 5. Quantification pour petites cartes

| Modèle | Variante | VRAM / taille | Source |
|---|---|---|---|
| FLUX.1 schnell | FP8 | ~12 Go ; ~6 s/image sur RTX 4070 | [localaimaster](https://localaimaster.com/vram/best-flux-model-12gb-vram), [packet.ai](https://packet.ai/blog/flux-image-generation-gpu-vram-requirements) |
| FLUX.1 schnell | GGUF Q4_K_S + T5 FP8 | ~10–11 Go de poids, ~3 s par image (rapporté sur RTX 5070 12 Go) | [gigagpu](https://gigagpu.com/?p=36651) |
| FLUX.1 | GGUF Q4/NF4 | 8 Go, mais 60–90 s par image | [insiderllm](https://insiderllm.com/guides/flux-locally-complete-guide/) |
| FLUX.2 [klein] 4B | natif | ~8 Go, < 1 s (4090) ; licence Apache-2.0 à confirmer | [cinevva](https://app.cinevva.com/fr/guides/frontier-gen-ai-models) |
| Wan 2.2 TI2V-5B | GGUF Q8_0 (5,4 Go) | 8 Go avec offloading, lent | [localaimaster](https://localaimaster.com/blog/wan-vram-requirements-by-gpu) |
| Wan 2.2 TI2V-5B | FP16 (10 Go) | 12 Go | idem |
| Wan 2.2 TI2V-5B | FP16/FP8 | 24 Go (cible officielle) | README Wan |
| Wan 2.2 A14B | FP8 (14,3 Go par expert) | 24 Go | localaimaster |
| Wan 2.2 A14B | GGUF Q5_K_M | 16 Go (rapporté par la communauté) | idem |

Profils livrés (`GPU_PROFILE`) : `vram12` (FLUX schnell GGUF Q4 + Wan 5B FP16), `vram16` (FLUX schnell FP8 + Wan 5B FP16), `vram24` (FLUX schnell FP8 + Wan 5B FP16, option A14B FP8).

## 6. Coût de la vitrine (une seule fois)
Source : fal.ai, relevé du 25/10/2026 : Wan 2.2 A14B image-vers-vidéo 720p = 0,08 $ par seconde vidéo (16 i/s) ; FLUX schnell = 0,003 $ par mégapixel.
- Un clip de 81 images (≈ 5,06 s) : 0,08 × 5,06 + 0,003 ≈ **0,41 $**.
- 14 clips : **≈ 5,7 $** ; avec 25 % de marge pour relances : **≈ 7,1 $**.
- Ensuite : 0 $ récurrent (fichiers statiques de 1 à 3 Mo, réécriture `/showcase/*`). Les lire coûte de la bande passante, pas de GPU.
- Estimation sans appel payant : `node scripts/generate-showcase.mjs`.
