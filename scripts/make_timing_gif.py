"""GIF do README mostrando os modos de disparo (Timing), navegando pela interface real.

Mesma técnica do make_demo_gif.py: a página do app (assets/ui) num Chromium sem janela, com
9 câmeras simuladas e as funções do app substituídas; um cursor desenhado anda e clica. O GIF
mostra só o painel Bullet time: Advanced → Sweep (atalhos, direção ida e volta e o aviso de
repetição) → Groups → Odd / even → Custom (chips e arrastar um passo) → Hide.

    python3 scripts/make_timing_gif.py        # docs/images/timing-demo.gif (também precisa de ffmpeg)

Requisitos: pip install playwright pillow && python -m playwright install chromium
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_timing_screenshot import page_html, MODELS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "images" / "timing-demo.gif"

CURSOR = """
const c = document.createElement('div'); c.id='demoCursor';
c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15.5 L12.5 22.5 L15.5 21 L12 14 L19 14 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>';
c.style.cssText='position:fixed;left:1200px;top:860px;z-index:99999;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))';
document.body.appendChild(c);
"""


def main():
    work = Path(tempfile.mkdtemp())
    (work / "page.html").write_text(page_html(), encoding="utf-8")
    FR = work / "frames"
    FR.mkdir()
    frames = []
    cams = []
    for i in range(9):
        short, model = MODELS[i % 2]
        cams.append({"name": f"{short}_{i // 2 + 1}", "model": model, "connected": True, "state": "connected",
                     "order": i + 1, "seconds": 0, "compatible": True})

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        # Janela mais alta que a de verdade: o painel com Custom e 3 passos cabe inteiro, sem rolar
        pg = b.new_page(viewport={"width": 1300, "height": 1180})
        pg.clock.install()
        pg.clock.pause_at(int(time.time() * 1000) + 2000)
        pg.goto((work / "page.html").as_uri())
        pg.clock.run_for(500)
        pg.evaluate("c => window.onCoreEvent({type:'cameras', cameras: c})", cams)
        pg.clock.run_for(200)
        pg.evaluate(CURSOR)
        pg.add_style_tag(content=".demo-press{filter:brightness(1.35);transform:scale(.98)}"
                                 " body.timing-open .app{--controls-h:760px}")  # só na captura: o painel cabe inteiro
        panel = pg.locator(".shoot-panel")

        def run(ms):
            pg.clock.run_for(ms)

        # Recorte fixo: o painel com o Advanced aberto (senão o GIF muda de tamanho a cada quadro)
        pg.click("#timingToggle"); run(100)
        pg.click("#timingModes button:nth-child(5)"); run(100)
        pg.get_by_role("button", name="Add step").click(); run(100)
        box = panel.bounding_box()
        clip = {"x": box["x"], "y": box["y"], "width": box["width"], "height": box["height"]}
        pg.locator("#timingCustom .timing-step").nth(2).locator(".step-x").click(); run(50)
        pg.click("#timingModes button:nth-child(1)"); run(50)
        pg.click("#timingToggle"); run(100)

        def shot(sec):
            p = FR / f"{len(frames):04d}.png"
            pg.screenshot(path=str(p), clip=clip)
            # Painel fechado (menor que o recorte): o que fica acima dele é outro painel; cobre com o
            # fundo do app, para o GIF mostrar só o painel Bullet time
            pb = panel.bounding_box()
            if pb["y"] > clip["y"] + 2:
                im = Image.open(p).convert("RGB")
                bg = im.getpixel((im.width - 2, im.height - 2))
                top = int(pb["y"] - clip["y"])
                im.paste(bg, (0, 0, im.width, top))
                im.save(p)
            frames.append((p, sec))

        def cursor_pos():
            return pg.evaluate("() => { const c=document.getElementById('demoCursor'); return [parseFloat(c.style.left), parseFloat(c.style.top)]; }")

        def move_to(target, steps=6, total=0.45, fx=0.55, fy=0.6):
            loc = target if not isinstance(target, str) else pg.locator(target).first
            box = loc.bounding_box()
            tx, ty = box["x"] + box["width"] * fx, box["y"] + box["height"] * fy
            sx, sy = cursor_pos()
            for k in range(1, steps + 1):
                t = 1 - (1 - k / steps) ** 3
                pg.evaluate("([x,y]) => { const c=document.getElementById('demoCursor'); c.style.left=x+'px'; c.style.top=y+'px'; }",
                            [sx + (tx - sx) * t, sy + (ty - sy) * t])
                shot(total / steps)
            return loc

        def click(target, hold=0.6, **kw):
            loc = move_to(target, **kw)
            loc.evaluate("e => e.classList.add('demo-press')")
            shot(0.15)
            loc.evaluate("e => e.classList.remove('demo-press')")
            loc.click()
            run(80)
            shot(hold)

        def mode(n, hold=1.0):
            click(f"#timingModes button:nth-child({n})", hold=hold)

        def pick(select, value, hold=1.0):
            loc = move_to(select)
            loc.select_option(value)
            run(80)
            shot(hold)

        # 1. Painel fechado (um instante), depois Advanced
        shot(0.5)
        click("#timingToggle", hold=0.8)

        # 2. Sweep: atalhos, ida e volta (aviso de repetição), direção de volta
        mode(2, hold=1.2)
        click("#timingFields .sweep-field .segmented button:nth-child(3)", hold=0.9)  # 0.3
        pick("#timingFields select", "pingpong", hold=1.8)                             # aviso
        pick("#timingFields select", "fwd", hold=0.9)

        # 3. Groups e Odd / even
        mode(3, hold=1.2)
        pick("#timingFields select", "pingpong", hold=1.4)
        mode(4, hold=1.2)
        pick("#timingFields select", "pingpong", hold=1.2)

        # 4. Custom: um passo novo com as câmeras 7–9, e arrastar o passo 3 para cima
        mode(5, hold=1.0)
        click(pg.get_by_role("button", name="Add step"), hold=0.6)
        step3 = pg.locator("#timingCustom .timing-step").nth(2)
        for n in (7, 8, 9):
            click(step3.locator(".cam-chip", has_text=str(n)).first, hold=0.35, steps=3, total=0.2)
        shot(0.8)
        # arrastar: segurar no rótulo "Step 3" e soltar sobre o passo 2 (vira o passo 2)
        move_to(step3.locator(".step-n"), fx=0.5, fy=0.5)
        s3 = step3.locator(".step-n").bounding_box()
        s2 = pg.locator("#timingCustom .timing-step").nth(1).bounding_box()
        x0, y0 = s3["x"] + s3["width"] / 2, s3["y"] + s3["height"] / 2
        y1 = s2["y"] + 6
        pg.mouse.move(x0, y0); pg.mouse.down()
        for k in range(1, 9):
            y = y0 + (y1 - y0) * k / 8
            pg.mouse.move(x0, y)
            pg.evaluate("([x,y]) => { const c=document.getElementById('demoCursor'); c.style.left=x+'px'; c.style.top=y+'px'; }", [x0, y])
            shot(0.08)
        pg.mouse.up(); run(80); shot(1.4)

        # 5. Hide: resumo e linha do tempo pequena
        click("#timingToggle", hold=1.6)
        b.close()

    lst = work / "frames.txt"
    with open(lst, "w") as f:
        for p, sec in frames:
            f.write(f"file '{p}'\nduration {sec}\n")
        f.write(f"file '{frames[-1][0]}'\n")
    vf = "fps=15,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-vf", vf, "-loop", "0", str(OUT)], check=True)
    print(OUT, OUT.stat().st_size // 1024, "KB", len(frames), "frames", round(sum(s for _, s in frames), 1), "s")


if __name__ == "__main__":
    main()
