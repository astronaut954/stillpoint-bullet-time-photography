import numpy as np, cv2, json, scene
from PIL import Image, ImageDraw, ImageFont
F = lambda s, b=True: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if b else ""), s)
W, H = 2400, 1600
scene.make("mx", n=3, arc=10, seed=7, W=W, H=H, subject=False, plain=True, pole="tape3", rows=(1.0, 1.0, 2.0), err=0.0)
T = json.load(open("mx/truth.json")); cams = T["cams"]
def proj(c, P):
    K, R, C = np.array(c["K"]), np.array(c["R"]), np.array(c["C"]); p = K @ (R @ (np.array(P, float) - C)); return p[:2] / p[2]
def crop(i, label):
    im = cv2.imread("mx/%02d.jpg" % (i + 1)); c = cams[i]; t, m, b = proj(c, (0, 0, 1.3)), proj(c, (0, 0, 1.0)), proj(c, (0, 0, 0.7))
    cx, cy = int(m[0]), int(m[1]); x0, y0 = cx - 260, cy - 420; im = im[y0:y0 + 840, x0:x0 + 520].copy()
    out = Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)).resize((390, 630)); d = ImageDraw.Draw(out); k = 390 / 520
    pts = [((p[0] - x0) * k, (p[1] - y0) * k) for p in (t, m, b)]
    for (x, y) in pts: d.line([x + 30, y, x + 70, y], fill=(255, 230, 0), width=2)
    up, lo = pts[1][1] - pts[0][1], pts[2][1] - pts[1][1]
    d.text((pts[0][0] + 76, (pts[0][1] + pts[1][1]) / 2 - 12), "%.0f px" % (up / k), font=F(20), fill=(255, 230, 0))
    d.text((pts[0][0] + 76, (pts[1][1] + pts[2][1]) / 2 - 12), "%.0f px" % (lo / k), font=F(20), fill=(255, 230, 0))
    d.rectangle([0, 0, 390, 40], fill=(0, 0, 0)); d.text((10, 8), label, font=F(20), fill=(255, 255, 255))
    return out, up / k, lo / k
a, ua, la = crop(0, "Câmera na altura da haste")
b, ub, lb = crop(2, "Câmera 1 m mais alta")
# Vista de lado (desenho)
side = Image.new("RGB", (640, 630), (16, 16, 16)); d = ImageDraw.Draw(side)
gx, gy, s = 440, 560, 250   # chão em y=560; 1 m = 250 px
d.line([20, gy, 620, gy], fill=(90, 90, 90), width=2); d.text((24, gy + 8), "chão", font=F(18, False), fill=(150, 150, 150))
d.line([gx, gy, gx, gy - 1.8 * s], fill=(230, 230, 230), width=8)
for z in (0.7, 1.0, 1.3): d.rectangle([gx - 9, gy - z * s - 8, gx + 9, gy - z * s + 8], fill=(255, 120, 0))
d.text((gx + 18, gy - 1.3 * s - 10), "marca de cima", font=F(18, False), fill=(255, 160, 60)); d.text((gx + 18, gy - 1.0 * s - 10), "marca do meio", font=F(18, False), fill=(255, 160, 60)); d.text((gx + 18, gy - 0.7 * s - 10), "marca de baixo", font=F(18, False), fill=(255, 160, 60))
for (cx, cz, col, lab) in ((80, 1.0, (120, 200, 255), "na altura"), (80, 2.0, (255, 120, 160), "mais alta")):
    y = gy - cz * s; d.rectangle([cx - 26, y - 16, cx + 26, y + 16], outline=col, width=3); d.text((cx - 40, y - 44), lab, font=F(18), fill=col)
    for z in (0.7, 1.0, 1.3): d.line([cx + 26, y, gx, gy - z * s], fill=col, width=1)
d.rectangle([0, 0, 640, 40], fill=(0, 0, 0)); d.text((10, 8), "Vista de lado", font=F(20), fill=(255, 255, 255))
full = Image.new("RGB", (640 + 390 * 2 + 32, 630 + 150), (16, 16, 16)); full.paste(side, (0, 0)); full.paste(a, (656, 0)); full.paste(b, (656 + 406, 0))
d = ImageDraw.Draw(full)
txt = ["Duas marcas (cima e baixo): a câmera mais alta vê a haste mais curta (%.0f px contra %.0f px). Parte disso é só o ângulo, e o app não separa do afastamento." % (ub + lb, ua + la),
       "Três marcas: na câmera mais alta, os dois trechos ficam desiguais (%.0f e %.0f px); na da altura, iguais (%.0f e %.0f px)." % (ub, lb, ua, la),
       "Essa diferença mostra de que ângulo a câmera olha, e o app desconta o encurtamento."]
for k, t in enumerate(txt): d.text((10, 650 + 40 * k), t, font=F(19, False), fill=(220, 220, 220))
full.save("marcas-duas-tres.png"); print(full.size, ua, la, ub, lb)
