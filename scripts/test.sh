#!/usr/bin/env bash
# Lance tous les tests (API + web) et le typage. Aucune dépendance npm.
set -euo pipefail
cd "$(dirname "$0")/.."
TSC="${TSC:-$(command -v tsc || echo /opt/node22/lib/node_modules/typescript/bin/tsc)}"
fail=0
echo "== API : tests"; for f in apps/api/test/*.test.ts; do (cd apps/api && node --no-warnings --test-force-exit --test "test/$(basename "$f")") || fail=1; done
echo "== Web : tests"; node --no-warnings --test apps/web/test/*.test.js || fail=1
if [ -x "$TSC" ] || command -v tsc >/dev/null; then echo "== Typage"; (cd apps/api && "$TSC" -p tsconfig.json) || fail=1; fi
exit $fail
