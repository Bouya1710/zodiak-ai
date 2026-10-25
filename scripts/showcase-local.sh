#!/usr/bin/env bash
# Génère les 14 clips de la vitrine depuis ce Mac et les envoie dans le bucket `showcase`.
# La clé fal est demandée en saisie masquée : elle n'est ni affichée, ni écrite sur disque.
# Le jeton d'envoi est lu dans `.showcase-token` (local, ignoré par Git ; son hash est dans l'edge function).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo "ffmpeg manquant (brew install ffmpeg)"; exit 1; }
[ -s .showcase-token ] || { echo ".showcase-token manquant"; exit 1; }
node scripts/generate-showcase.mjs
read -r -s -p "Colle ta clé fal (FAL_KEY), puis Entrée : " FAL_KEY; echo
[ -n "$FAL_KEY" ] || { echo "Clé vide, arrêt."; exit 1; }
FAL_KEY="$FAL_KEY" \
SHOWCASE_UPLOAD_URL="https://wlrjpgtjizegehhwelgh.supabase.co/functions/v1/showcase-upload" \
SHOWCASE_TOKEN="$(cat .showcase-token)" \
node scripts/generate-showcase.mjs --run "$@" 2>&1 | tee showcase-run.log
