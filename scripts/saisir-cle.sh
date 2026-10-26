#!/usr/bin/env bash
# Saisie masquée d'une clé dans un fichier local ignoré par Git (jamais affichée, jamais dans le chat).
# Usage : bash scripts/saisir-cle.sh .gemini-key
set -euo pipefail
cd "$(dirname "$0")/.."
f="${1:?fichier cible, ex. .gemini-key}"
printf 'Colle la clé (rien ne s’affiche), puis Entrée : '
IFS= read -rs key; echo
key="$(printf '%s' "$key" | tr -d '[:space:]')"
[ -n "$key" ] || { echo "Rien reçu, recommence."; exit 1; }
umask 077; printf '%s' "$key" > "$f"
echo "OK : ${#key} caractères enregistrés dans $f (fichier privé, ignoré par Git)."
