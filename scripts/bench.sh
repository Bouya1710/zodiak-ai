#!/usr/bin/env bash
# Mesure le temps réel de génération sur VOTRE machine (alimente docs/COUTS.md). Nécessite le serveur lancé.
# Usage : scripts/bench.sh [url]   ex. scripts/bench.sh http://localhost:8080
set -euo pipefail
U="${1:-http://localhost:8080}"
post() { curl -fsS -X POST "$U/api/jobs" -H 'content-type: application/json' -d "$1"; }
wait_job() { # id → secondes
  local s=$(date +%s.%N)
  while :; do st=$(curl -fsS "$U/api/jobs/$1" | python3 -c 'import json,sys;j=json.load(sys.stdin)["job"];print(j["status"])'); case $st in queued|running) sleep 1;; *) break;; esac; done
  echo "$st $(python3 -c "print(round($(date +%s.%N)-$s,1))")"
}
j=$(post '{"kind":"t2i","prompt":"bench lighthouse at night","params":{"seed":1}}'); id=$(echo "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["job"]["id"])')
echo "image 1024² : $(wait_job "$id") (statut, secondes)"
asset=$(curl -fsS "$U/api/jobs/$id" | python3 -c 'import json,sys;print(json.load(sys.stdin)["assets"][0]["id"])')
j=$(post "{\"kind\":\"i2v\",\"prompt\":\"slow camera move\",\"inputAssetId\":\"$asset\",\"params\":{\"duration\":5,\"fps\":24}}"); id=$(echo "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["job"]["id"])')
echo "vidéo 5 s : $(wait_job "$id")"
echo "Coût = secondes × (puissance W / 1000 / 3600) × prix du kWh, ou secondes × tarif GPU à la seconde (docs/COUTS.md §2)."
