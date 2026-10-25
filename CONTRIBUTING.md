# Contribuer à ZODIAK AI

- Licence des contributions : Apache-2.0. N'ajoutez ni code, ni texte, ni image, ni nom copiés d'un autre service ; ne contournez aucune protection ou paywall pour « étudier » un produit.
- Aucune dépendance npm sans discussion préalable : le projet démarre volontairement avec Node et ffmpeg seuls.
- TypeScript « effaçable » (pas d'`enum`, de `namespace`, de paramètres-propriétés) : Node l'exécute directement. Imports avec extension `.ts`.
- Avant une PR : `bash scripts/test.sh` doit passer (tests + typage). Ajoutez un test pour tout comportement nouveau.
- Nouveau modèle : ajoutez sa licence vérifiée (avec source) à `docs/LICENCES.md` ; refusez les licences qui excluent des régions ou interdisent l'usage commercial sans le signaler.
- Nouveau workflow ComfyUI : fichier JSON dans `workflows/` avec `_meta`, variables `{{x}}`, et mention de son statut de test.
- Décision structurante : une ligne dans `docs/DECISIONS.md` (choix, alternatives, raison).
- Garde-fous : ne les affaiblissez pas sans discussion ; les refus doivent rester explicites pour l'utilisateur.
