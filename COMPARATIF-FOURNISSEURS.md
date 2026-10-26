# COMPARATIF-FOURNISSEURS.md — Quel fournisseur vidéo pour ZODIAK AI ?

> Recherche du 26/10/2026. Prix en **USD**, sans conversion. Chaque prix a sa source ; ce qui n'a pas pu être confirmé est marqué **non vérifié**.
> Réserve générale : la plupart des tarifs de revendeurs viennent de pages ou de blogs des revendeurs eux-mêmes (ils se comparent à leur avantage). Aucune génération payante n'a été lancée pour cette étude : les seuls chiffres « mesurés » sont ceux du 26/10 déjà notés dans `catalog/engines.json`.

## 1. Verdict (à lire en premier)

| Usage | Modèle retenu | Fournisseur | Coût 5 s (720p) | Crédits |
|---|---|---|---|---|
| Gratuit pour le site / brouillon | **ZODIAK LTX-2.5** (libre, son inclus) | Modal (notre GPU) | ≈ 0,20 $ final, ≈ 0,08 $ brouillon | 20 / 8 |
| Premium économique | **Kling 3.0** | Kie.ai | ≈ 0,35 $ | 39 |
| Premium avec son | **Seedance 2.0** | Kie.ai | ≈ 0,62 $ | 69 |
| Repli | Omni Flash (Google), Kling 2.5 (fal si activé), Wan (Modal) | voir §5 | 0,35–0,56 $ | — |
| **Écarté** | Sora 2 | — | — | — |

- **Sora est mort** : l'app a fermé le 26/04/2026 et l'API le **24/09/2026** (appels en échec depuis) — [aide OpenAI](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation?so=1). Inutile de le comparer.
- **Le choix déjà en place est le bon.** Kling 3.0 chez Kie.ai (0,07 $/s) est au plancher du marché : Atlas Cloud 0,071 $/s, EvoLink 0,075, WaveSpeed 0,084, fal 0,084–0,168, API Kling officielle 0,084–0,14 (§2). Changer de revendeur ne ferait gagner que quelques pour cent.
- **Le plus gros levier restant n'est pas un VPN** (§4) : c'est un modèle Seedance « Fast » (0,045–0,10 $/s chez les revendeurs, soit 0,23–0,50 $ les 5 s contre 0,62 $ aujourd'hui) et un modèle Wan « ultra fast » (0,01–0,02 $/s, 0,05–0,10 $ les 5 s, sans son). Ni l'un ni l'autre n'est testable sans compte chez ces revendeurs : **non branchés**, voir §7.
- **Face à Higgsfield** (Kling 3.0 + son 5 s ≈ 0,75 $ ; Seedance ≈ 2,48 $, `docs/COUTS.md`) : nos coûts sont 2× moins élevés en Kling et 4× en Seedance. Le « 10× » n'existe que pour les modèles libres (0,05–0,20 $) — voir D-018.

## 2. Tarifs relevés (par seconde de vidéo, puis par clip)

### API officielles / éditeurs

| Modèle | $/s | 5 s | 10 s | Source et réserves |
|---|---|---|---|---|
| Kling 3.0 direct, 720p sans son | 0,084 | 0,42 | 0,84 | [Wireflow](https://www.wireflow.ai/blog/kling-ai-pricing) (relevé du 11/10) ; unité = 0,14 $ |
| Kling 3.0 direct, 1080p avec son | 0,14 | 0,70 | 1,40 | [Picassoia](https://blog.picassoia.com/cheapest-kling-3-0-api-pricing-compared) ; 4K : 2,10 $ les 5 s |
| Kling direct : forfait | — | — | — | **Pack minimum 700 $ (5 000 unités, 180 jours)**, crédits non remboursables à expiration — Wireflow, [ConductAtlas](https://conductatlas.com/platform/kling-ai/kling-ai-terms-of-service/non-refundable-expiring-resource-packages/). Le 9,80 $ noté dans `engines.json` est **non vérifié** |
| Seedance 2.5 BytePlus, 480p / 720p / 1080p | 0,103 / 0,231 / 0,569 | 0,51 / 1,16 / 2,85 | ×2 | [Laozhang](https://blog.laozhang.ai/en/posts/seedance-2-pricing-free-vs-paid-guide) d'après 10,70 $/M jetons (doc [BytePlus](https://docs.byteplus.com/en/docs/ModelArk/1544106)) : conversion en $/s **estimée par le blog**, pas publiée |
| Gemini Omni Flash (Google) | 0,10 | 0,51 (mesuré) | non mesuré | `engines.json`, mesure du 26/10 : 28 960 jetons pour 5 s |
| Sora 2 / Pro | 0,10 / 0,30–0,70 | — | — | **API arrêtée le 24/09/2026** |

### Revendeurs / agrégateurs

| Fournisseur | Modèle | $/s | 5 s | 10 s | Source |
|---|---|---|---|---|---|
| Kie.ai (branché) | Kling 3.0 std, sans son | 0,07 | 0,35 | 0,70 | `engines.json` (relevé antérieur, non revérifié ce jour) |
| Kie.ai (branché) | Seedance 2.0, 720p + son | 0,124 | 0,62 | 1,24 | idem |
| Atlas Cloud | Kling 3.0 Std / Pro | 0,071 / 0,095 | 0,36 / 0,48 | 0,71 / 0,95 | [Atlas](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-2-kling-wan) |
| Atlas Cloud | Seedance 2.0 Fast | ≈ 0,076–0,09 | 0,38–0,45 | 0,76–0,90 | idem |
| Atlas Cloud | Wan 2.2 Turbo i2v / Turbo Spicy / Wan 2.7 | 0,02 / 0,026 / 0,10 | 0,10 / 0,13 / 0,50 | ×2 | idem |
| EvoLink | Kling 3.0 Std / Pro | 0,075 / 0,100 | 0,38 / 0,50 | 0,75 / 1,00 | Picassoia |
| WaveSpeed | Wan 2.2 ultra fast | 0,010 | 0,05 | 0,10 | [Costbench](https://www.costbench.com/software/ai-media-apis/wavespeed/) |
| WaveSpeed | Kling 3.0 std / Seedance 2.0 Fast | 0,084 / 0,10 | 0,42 / 0,50 | 0,84 / 1,00 | idem |
| APIsRouter | Seedance 2.0 Fast / Mini / 2.5 | 0,045 / 0,065 / 0,09 | 0,23 / 0,33 / 0,45 | ×2 | [APIsRouter](https://apisrouter.com/seedance-api) — clips de démo en **480p** : résolution du tarif à confirmer |
| fal | Kling 3.0 | 0,084–0,168 | 0,42–0,84 | 0,84–1,68 | Atlas, Picassoia |
| fal | Seedance 2.0 Fast / 2.0, 720p | 0,2419 / 0,3034 | 1,21 / 1,52 | 2,42 / 3,03 | Atlas ; [fal](https://fal.ai/learn/tools/best-image-to-video-apis-2026) |
| fal | Wan 2.2 A14B 480p / 720p ; Kling 2.5 Turbo Pro | 0,04 / 0,08 ; 0,07 | 0,20 / 0,40 ; 0,35 | ×2 | [fal](https://fal.ai/learn/tools/ai-video-generators), Atlas |
| Replicate | Wan 2.2 i2v « fast » 480p | — | 0,05 / vidéo | — | `docs/COUTS.md` |
| PiAPI | Kling 3.0 | « le moins cher confirmé » | — | — | [Apiframe](https://apiframe.ai/blog/kling-3-0-api-providers) ne donne pas le chiffre : **non vérifié** |

### Auto-hébergement GPU

| Voie | 5 s | Source et réserves |
|---|---|---|
| **ZODIAK LTX-2.5 sur Modal** (en prod) | ≈ **0,20 $** (720p, son inclus) ; brouillon ≈ 0,08 $ | mesuré le 26/10 : 34 s de chargement + 72 s de calcul (`engines.json`). 10 s : **non mesuré** |
| ZODIAK Wan 2.2 Lightning sur Modal | ≈ 0,30 $ (720p) ; ≈ 0,10 $ (480p) | `engines.json`, « à affiner » |
| Pod RTX 5090 communauté (0,69 $/h) + LTX-2.3 | ≈ 0,06–0,09 $ à 100 % d'usage | [Spheron](https://spheron.network/blog/ai-video-generation-gpu-guide), tarif [RunPod](https://www.runpod.io/gpu-cloud/pricing) ; **un pod inactif coûte plein tarif** |
| Pod RTX 4090 communauté (0,34 $/h) + Wan 5B | ≈ 0,05 $ à 100 %, ≈ 0,10 $ à 50 % | `docs/COUTS.md` |
| Prix GPU : tendance | RunPod a **relevé ses tarifs 5 fois depuis juillet, pour 1 baisse** (au 12/10 : 4090 sécurisé 0,74 → 0,89 $/h, H100 SXM 3,49 → 3,99 $/h) | [PricingSaaS](https://pricingsaas.com/companies/runpod/diffs/2026W42) |

Notre Modal (sans pod à garder chaud) est facturé à la seconde, donc sans coût d'inactivité ; mais à 0,20 $ les 5 s avec son il reste **2 à 4× plus cher** qu'une API Wan « ultra fast » (0,05–0,10 $, sans son). À confirmer par un test de qualité avant de s'en servir.

## 3. Qualité, limites, licences

| Modèle | Qualité (jugement qualitatif) | Son | Licence / usage commercial |
|---|---|---|---|
| Seedance 2.0 / 2.5 | haut du marché (cité en tête de la liste image→vidéo de [fal](https://fal.ai/learn/tools/best-image-to-video-apis-2026), page d'un revendeur) | oui | via revendeur ou BytePlus |
| Kling 3.0 | haut du marché (Kling v3 Pro : 1 075 points Elo sur la page fal, juste derrière Grok Imagine Video, 1 082) ; Kling 4.0 sorti le 15/10 via [Unifically](https://unifically.com/ja/models/kling), prix **non publié** | oui (payant en option) | voir ci-dessous |
| Gemini Omni Flash | bon, clips de 5 s mesurés | oui | API Gemini |
| LTX-2.5 (libre) | inférieur aux deux premiers (à juger sur vos prompts, `docs/STRATEGIE.md` §6) | oui | **gratuit tant que l'entité fait moins de 10 M$ de chiffre d'affaires annuel** ; au-delà, licence payante Lightricks ([texte](https://static.lightricks.com/legal/ltx-2-open-weights-license-0.X.pdf)) |
| Wan 2.2 (libre) | inférieur, pas de son | non | Apache-2.0 (`docs/LICENCES.md`) |

Conditions Kling : les conditions générales interdisent de **revendre ou redistribuer le service ou son accès**, limitent le compte à son titulaire et excluent l'usage commercial du plan gratuit ([Kling](https://kling.ai/docs/user-policy), résumé [LicenseOrg](https://licenseorg.com/compare/kling-ai-vs-midjourney) — résumé tiers, **non vérifié** mot à mot). Conséquence : on ne sert pas des abonnés ZODIAK avec un compte grand public Kling ; on passe par l'API ou un revendeur autorisé.

## 4. Astuces de prix : régions, VPN, crédits

### Prix régionaux et VPN — gain réel, mais pas pour un site

Relevé des abonnements Kling dans l'App Store ([OpenTheRank](https://opentherank.com/ai-pricing/kling-ai/), juin 2026) : le plan Standard coûte **1,04 $/mois en Inde (−90 % vs États-Unis)**, 1,06 $ en Indonésie, 1,28 $ en Turquie, 1,33 $ en Arabie saoudite. Le site note un risque **moyen** : adresse de facturation locale, IP locale et carte cadeau exigées.

| | Verdict |
|---|---|
| Gain | Sur l'abonnement grand public, jusqu'à −90 %. Avec 660 crédits/mois et 6 crédits/s en 720p sans son (Kling 3.0), cela ferait ≈ 22 clips de 5 s pour ≈ 1 $ — **à confirmer** : tarifs d'appli probablement promotionnels, **non vérifié** |
| Faisable ? | Oui à la main (VPN + carte cadeau locale), mais **aucune API** ne vient avec un abonnement d'appli : rien n'est automatisable pour ZODIAK |
| Pour servir d'autres utilisateurs | **Non** : revente et partage de compte interdits (§3) ; chaque clip se fait dans l'interface Kling, pas dans notre site |
| Risque | Bannissement du compte et perte des crédits (les crédits expirent et ne sont pas remboursés) |
| API | Tarifs en dollars uniques : **aucun prix régional trouvé** pour l'API Kling, Seedance ou les revendeurs |
| Mon avis | Utile seulement pour **tes propres essais personnels**, à tes risques. Je ne le mets pas dans le produit |

### Ce qui marche vraiment (par ordre de gain)

1. **Brouillon gratuit puis rendu final** : déjà en place (brouillon LTX à 0,08 $). Pour un clip premium qui demande 3 à 5 essais (test indépendant cité dans `docs/COUTS.md`), 3 à 5 brouillons LTX + 1 rendu Kling coûtent 0,59–0,75 $ au lieu de 1,05–1,75 $ : environ ÷ 2.
2. **Cache par empreinte** : déjà en place (D-014), gain non mesuré.
3. **Modèles « Fast » / « ultra fast »** chez les revendeurs : −20 à −90 % sur le même modèle de départ (§2). Non branchés.
4. **Bonus de recharge et promotions** : APIYI annonce des bonus de recharge ([doc](https://docs.apiyi.com/en/api-capabilities/sora-2/overview)) ; WaveSpeed ferait des promotions d'environ −20 % ([Costbench](https://www.costbench.com/software/ai-media-apis/wavespeed/)) — **non vérifié** à la source.
5. **Crédits offerts par fal** : *Builder Grant* 25–250 $ pour développeurs indépendants (Europe/Asie) ; *Startup Program* 1 000–5 000 $ pour équipes avec traction ou financement ; non revendables ([fal](https://fal.ai/builder-grant), [fal](https://fal.ai/startup-program)). Utile seulement si fal est réactivé : il est aujourd'hui masqué par défaut.
6. **Ne pas précharger** : les forfaits Kling officiels expirent à 180 jours sans remboursement.

## 5. Architecture de routage (en place + repli ajouté aujourd'hui)

- **Un catalogue** (`catalog/engines.json`) : chaque modèle a son fournisseur (`provider`), son modèle chez ce fournisseur, ses crédits (1 crédit ≈ 0,01 $) et désormais une liste de **repli** (`fallback`).
- **Choix automatique** (`autoEngine`) : brouillon → moteur du site le moins cher ; sinon le moins cher du niveau demandé (gratuit ou premium) ; image de fin → fournisseur direct uniquement. Un modèle dont la clé manque est masqué.
- **Plafond du site** : 500 crédits / 24 h (≈ 5 $/jour), déjà en place.
- **Nouveau — repli automatique** (`retryWithFallback`, `apps/cloud/src/process.ts`) : si le fournisseur refuse l'envoi ou renvoie un échec, le job repart tout seul sur le modèle suivant de `fallback`, **2 replis au maximum**, sans nouveau débit. Le repli est refusé s'il coûte plus de ×1,6 ou +10 crédits (≈ 0,10 $) que le modèle d'origine : l'écart est absorbé par le site, donc borné. Le message du job indique « Repli automatique : X indisponible, essai avec Y ».

| Modèle d'origine | Replis, dans l'ordre |
|---|---|
| ZODIAK LTX-2.5 | ZODIAK Wan 2.2 (image→vidéo seulement) |
| ZODIAK Wan 2.2 | LTX-2.5, Wan 2.2 (fal) |
| Kling 3.0 | Kling 2.5 (fal, si activé), Omni Flash |
| Seedance 2.0 | Kling 3.0, Omni Flash |
| Omni Flash | Kling 3.0, Seedance 2.0 |
| Images : Nano Banana Pro → Nano Banana 2 → Nano Banana → FLUX schnell | |

- **Hausse de prix** : pas de détection automatique (je n'ai pas de source de prix interrogeable depuis le site). Garde-fou actuel : le plafond de 500 crédits/jour et le repli. À faire à la main chaque mois : recontrôler les `note` de `engines.json` (les tarifs bougent : RunPod, 5 hausses depuis juillet ; variations de 40–60 % entre versions de Kling selon [Costbench](https://costbench.com/compare/fal-vs-kling-api/), **non vérifié**).
- **Risque de concentration** : Kling 3.0 **et** Seedance 2.0 passent tous deux par Kie.ai. Si Kie tombe, les replis sont Omni Flash (Google) puis, si fal est activé, Kling 2.5. C'est le principal point faible actuel (§7).
- **Abstraction côté code** : changer de fournisseur = une ligne de `engines.json` (`provider` + `model`) ; les fournisseurs directs sont listés dans `DIRECT_KEYS` (`catalog.ts`) et branchés dans `providers.ts`.

## 6. Modèle économique

Hypothèses : 1 crédit = 0,01 $ de coût fournisseur (`engines.json`) ; l'abonné consomme 60 % de ses crédits (**hypothèse non vérifiée**) ; prix hors taxes et hors frais de paiement (**non chiffrés ici**).

| Plan proposé | Prix | Crédits | Prix du crédit | Marge à 100 % d'usage | Marge à 60 % | Équivaut à |
|---|---|---|---|---|---|---|
| Créateur | 9,99 $ | 450 | 0,022 $ | 55 % | 73 % | 22 vidéos LTX finales, ou 11 Kling 3.0, ou 6 Seedance 2.0 (5 s) |
| Pro | 29,99 $ | 1 500 | 0,020 $ | 50 % | 70 % | 75 LTX, ou 38 Kling 3.0, ou 21 Seedance |
| Studio | 79 $ | 4 500 | 0,0176 $ | 43 % | 66 % | 225 LTX, ou 115 Kling 3.0, ou 65 Seedance |

- **Seuil de rentabilité** : 0,01 $ le crédit (usage à 100 %). **Plancher recommandé : 0,0167 $ le crédit** (marge ≥ 40 % à 100 % d'usage), pour absorber échecs, replis, frais de paiement et TVA.
- **Honnêteté face à Higgsfield** : un clip Kling 5 s vendu au tarif Créateur revient à ≈ 0,87 $, **plus cher** que Higgsfield (≈ 0,75 $). Pour passer dessous, il faut vendre à ≈ 1,3× le coût (0,013 $/crédit → 0,51 $ le clip), soit une marge de 23 % à 100 % d'usage. L'avantage compétitif de ZODIAK AI est le **gratuit/bon marché** (LTX final 0,20 $ contre 0,75 $ ; brouillon 0,08 $), pas la revente de Kling.
- **Gratuit pour toi** : **pas encore implémenté**. Le rôle administrateur existe (`ADMIN_EMAIL`) mais le code débite aussi les crédits de l'admin ; il faut un compte propriétaire sans débit (à faire). En attendant, tes vidéos finales LTX coûtent 0,20 $ pièce au site.
- **Limites à fixer** : 100 crédits offerts à l'inscription (D-037) = jusqu'à **1 $ de coût par inscription**, donc exploitable. Recommandation : 40 crédits (5 brouillons LTX), modèles gratuits seulement, premium réservé aux abonnés ; plafond par compte et par jour sur le premium (ex. 5 clips). Le plafond du site (500 crédits/jour) reste le filet de sécurité.

## 7. Ce qui n'a pas pu être fait, et pourquoi

- **Aucun test payant** : je n'ai ni clé ni compte chez Atlas Cloud, WaveSpeed, APIsRouter ou EvoLink, et créer un compte avec paiement n'est pas à moi. Les fournisseurs non testés ne sont **pas branchés** (comme D-025 : on ne livre pas de faux « fonctionne »).
- **Solde fal** : la clé fal actuelle répond 403 (« not permitted »), il manque la clé « Admin » (`FAL_ADMIN_KEY`) ; dépenses du site aujourd'hui : 0,73 $ sur un plafond de 500 crédits.
- **Repli non rejoué de bout en bout** : la logique de choix est testée (tests unitaires), mais pas un échec réel de Kie.ai → Google (cela coûterait une génération et exigerait de faire échouer un fournisseur exprès).
- **Une seule action pour toi** : créer un compte **WaveSpeed** (ou Atlas Cloud), y mettre 10 $ et me donner la clé. Je branche alors un **second fournisseur** (supprime le risque Kie.ai), je teste Wan « ultra fast » et Seedance « Fast », je mesure la qualité côte à côte avec LTX, et je garde le moins cher.
