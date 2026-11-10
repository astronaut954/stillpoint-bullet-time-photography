#!/bin/bash
# Roda o autoteste do plugin do Stillpoint dentro do Lightroom Classic e mostra o relatório, sem clicar no menu.
# O Lightroom precisa estar (ou ser aberto) num catálogo com "Self-Test" no nome: o teste põe 4 fotos pequenas no
# catálogo, e um plugin não consegue tirar fotos de um catálogo.
#   bash tests/lightroom/run_selftest.sh
B="$HOME/Library/Application Support/Stillpoint/lightroom"
REPORT="$B/self-test-report.txt"
REQUEST="$B/selftest-request.txt"
if [ ! -d "$B" ]; then
  echo "Stillpoint has not been opened on this Mac yet (there is no $B)."
  exit 2
fi
# O plugin está respondendo (alive.txt dos últimos 5 s) num catálogo Self-Test?
fresh() {
  [ -f "$B/alive.txt" ] || return 1
  local t now catalog
  t=$(sed -n 's/^time=//p' "$B/alive.txt" | head -1)
  now=$(date +%s)
  catalog=$(sed -n 's/^catalog=//p' "$B/alive.txt" | head -1)
  [ -n "$t" ] && [ $((now - t)) -le 5 ] && echo "$catalog" | grep -qi 'self-test'
}
if ! fresh; then
  CATALOG=$(head -1 "$B/selftest-catalog.txt" 2>/dev/null)
  if [ -n "$CATALOG" ] && [ -f "$CATALOG" ]; then
    echo "Opening Lightroom Classic on $CATALOG ..."
    open "$CATALOG"
  else
    echo 'Open Lightroom Classic on the "Stillpoint Self-Test" catalog (File > Open Catalog...). Waiting for it...'
  fi
  for _ in $(seq 1 180); do fresh && break; sleep 1; done
  if ! fresh; then
    echo 'Lightroom Classic is not answering on a Self-Test catalog. If it asked to relaunch, click Relaunch and run this again.'
    exit 2
  fi
fi
rm -f "$REPORT"
: > "$REQUEST"
echo "Self-test running in Lightroom Classic (a few minutes)..."
for i in $(seq 1 900); do
  [ -f "$REPORT" ] && break
  if [ "$i" = 20 ] && [ -f "$REQUEST" ]; then
    rm -f "$REQUEST"
    echo 'The plugin did not pick up the request: it is an older plugin. Open Stillpoint once (it installs the new plugin), restart Lightroom Classic and run this again.'
    exit 2
  fi
  sleep 1
done
if [ ! -f "$REPORT" ]; then
  echo "No report after 15 minutes."
  exit 2
fi
sleep 1
cat "$REPORT"
grep -q ' 0 failed' "$REPORT"
