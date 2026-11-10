#!/bin/bash
# Teste que junta o Stillpoint e o Lightroom Classic de verdade (Mac). Abre o Stillpoint com câmeras simuladas no
# projeto de teste (build/self-test-project, só nesta rodada: o projeto da pessoa não muda), roda o roteiro
# tests/e2e/e2e.js e mostra o relatório. O Lightroom precisa estar fechado no começo: o Stillpoint troca o plugin
# pelo novo e abre o Lightroom no catálogo do projeto de teste.
#   bash tests/e2e/run_e2e.sh
cd "$(dirname "$0")/../.." || exit 2
ROOT="$PWD"
APP="$ROOT/build/macos-arm64/Stillpoint"
BASE="$ROOT/build/self-test-project"
REPORT="$BASE/e2e-report.txt"
if [ ! -x "$APP" ]; then echo "Stillpoint is not built yet ($APP)."; exit 2; fi
if pgrep -x Stillpoint >/dev/null; then echo "Close Stillpoint first, then run this again."; exit 2; fi
if pgrep -f "Adobe Lightroom Classic.app" >/dev/null; then
  echo "Quit Lightroom Classic (Lightroom Classic > Quit). Waiting for it to close..."
  for _ in $(seq 1 120); do pgrep -f "Adobe Lightroom Classic.app" >/dev/null || break; sleep 1; done
  if pgrep -f "Adobe Lightroom Classic.app" >/dev/null; then echo "Lightroom Classic is still open."; exit 2; fi
fi
mkdir -p "$BASE"
rm -f "$REPORT"
STILLPOINT_FAKE_CAMERAS=4 STILLPOINT_E2E="$REPORT" STILLPOINT_E2E_SCRIPT="$ROOT/tests/e2e/e2e.js" \
  STILLPOINT_E2E_PROJECT="$BASE/Stillpoint Self-Test" "$APP" >/dev/null 2>&1 &
PID=$!
echo "Test running: Stillpoint and Lightroom Classic open by themselves. Do not click in them (about 5 minutes)."
SHOWN=0
for _ in $(seq 1 1500); do
  if [ -f "$REPORT" ]; then
    TOTAL=$(wc -l < "$REPORT")
    if [ "$TOTAL" -gt "$SHOWN" ]; then tail -n +$((SHOWN + 1)) "$REPORT" | grep -v '^END$'; SHOWN=$TOTAL; fi
    grep -q '^END$' "$REPORT" && break
  fi
  kill -0 $PID 2>/dev/null || { echo "Stillpoint closed before the end of the test."; break; }
  sleep 1
done
kill $PID 2>/dev/null
if ! grep -q '^END$' "$REPORT" 2>/dev/null; then echo "The test did not finish."; exit 2; fi
echo "Lightroom Classic stays open on the test catalog: you can quit it."
grep -q ' 0 failed' "$REPORT"
