"""Captura (simulada) do painel Bullet time com o Timing aberto, para o README.

Mesma técnica do make_demo_gif.py: a interface real (assets/ui) num Chromium sem janela,
com 9 câmeras simuladas e as funções do app substituídas por versões vazias.

    python3 scripts/make_timing_screenshot.py   # docs/images/screen-timing.png e screen-timing-custom.png

Requisitos: pip install playwright pillow && python -m playwright install chromium
"""
import base64
import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "assets" / "ui"
OUT = ROOT / "docs" / "images" / "screen-timing.png"
OUT_CUSTOM = ROOT / "docs" / "images" / "screen-timing-custom.png"
MODELS = [("SL3", "Canon EOS Rebel SL3"), ("T7", "Canon EOS Rebel T7")]


def page_html():
    css = (UI / "themes" / "nocturne-neo.css").read_text(encoding="utf-8")
    css = re.sub(r"__FONT:([A-Za-z0-9_.\-]+)__",
                 lambda m: "data:font/ttf;base64," + base64.b64encode((UI / "fonts" / m.group(1)).read_bytes()).decode(), css)
    names = sorted(set(re.findall(r"window\.([a-zA-Z]+)\(", (UI / "app.js").read_text(encoding="utf-8")))
                   - {"addEventListener", "removeEventListener", "matchMedia", "uiReady", "listSessions", "exportFormats"})
    stub = "\n".join(f"window.{n} = () => Promise.resolve(null);" for n in names) + """
window.uiReady = () => Promise.resolve({version: "2.11.1", os: "macos", timing: "", live: ""});
window.listSessions = () => Promise.resolve([]);
window.exportFormats = () => Promise.resolve([]);
"""
    html = (UI / "index.html").read_text(encoding="utf-8").replace("/*__THEME__*/", css)
    html = re.sub(r"__IMAGE:([A-Za-z0-9_.\-]+)__",
                  lambda m: "data:image/png;base64," + base64.b64encode((UI / "images" / m.group(1)).read_bytes()).decode(), html)
    html = re.sub(r'<div id="splash".*?</div>\s*</div>\s*</div>', "", html, count=1, flags=re.S)  # sem a abertura
    return html.replace("<script>/*__SCRIPT__*/</script>",
                        "<script>" + stub + "</script><script>" + (UI / "app.js").read_text(encoding="utf-8") + "</script>")


def main():
    work = Path(tempfile.mkdtemp())
    (work / "page.html").write_text(page_html(), encoding="utf-8")
    cams = []
    for i in range(9):
        short, model = MODELS[i % 2]
        cams.append({"name": f"{short}_{i // 2 + 1}", "model": model, "connected": True, "state": "connected",
                     "order": i + 1, "seconds": 0, "compatible": True})
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1300, "height": 880}, device_scale_factor=2)
        pg.goto("file://" + str(work / "page.html"))
        pg.wait_for_timeout(800)
        pg.evaluate("c => window.onCoreEvent({type:'cameras', cameras: c})", cams)
        pg.wait_for_timeout(300)
        pg.click("#timingToggle")
        pg.wait_for_timeout(200)
        # 1) Sweep 0,2 s, 1 → 9: a varredura clássica
        pg.click("#timingModes button:nth-child(2)")
        pg.wait_for_timeout(400)
        pg.query_selector(".shoot-panel").screenshot(path=str(OUT))
        # 2) Custom: três passos (1–3 no início, 4–6 após 1 s, 7–9 após 2 s), ida e volta
        pg.click("#timingModes button:nth-child(5)")
        pg.wait_for_timeout(200)
        pg.get_by_role("button", name="Add step").click()
        pg.wait_for_timeout(100)
        for chip in [7, 8, 9]:
            pg.locator("#timingCustom .timing-step").nth(2).locator(".cam-chip", has_text=str(chip)).first.click()
            pg.wait_for_timeout(50)
        after = pg.locator("#timingCustom .timing-step").nth(2).locator("input")
        after.fill("2")
        after.press("Enter")
        pg.select_option("#timingFields select", "pingpong")
        pg.wait_for_timeout(400)
        pg.query_selector(".shoot-panel").screenshot(path=str(OUT_CUSTOM))
        b.close()
    print(OUT, OUT_CUSTOM)


if __name__ == "__main__":
    main()
