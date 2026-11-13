import numpy as np, cv2, json, os, scene
from PIL import Image, ImageDraw, ImageFont
W, H = 1500, 1000
kw = dict(n=9, arc=120, seed=5, W=W, H=H, plain=True, err=1.2)
scene.make("p_pole", pole=True, subject=False, **kw)
scene.make("p_subj", pole=False, subject=True, **kw)
T = json.load(open("p_pole/truth.json")); cams = T["cams"]
def proj(c, P):
    K, R, C = np.array(c["K"]), np.array(c["R"]), np.array(c["C"]); p = K @ (R @ (np.array(P, float) - C)); return p[:2] / p[2]
pts = [(proj(c, (0, 0, 1.3)), proj(c, (0, 0, 0.7))) for c in cams]          # o alto e o baixo: o que a pessoa clicaria
dist = [np.linalg.norm(a - b) for a, b in pts]; dref = float(np.median(dist))
def matrix(a, b):
    mid = (a + b) / 2; ang = np.degrees(np.arctan2(a[0] - b[0], -(a[1] - b[1]))); sc = dref / np.linalg.norm(a - b)
    M = cv2.getRotationMatrix2D((W / 2, H / 2), ang, sc); M[:, 2] += M[:, :2] @ (np.array([W / 2, H / 2]) - mid); return M, ang, sc, mid
font = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", s)
def label(img, text, sub=None):
    im = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 44], fill=(0, 0, 0)); d.text((12, 8), text, font=font(24), fill=(255, 255, 255))
    if sub: d.text((12, im.height - 34), sub, font=font(20), fill=(255, 220, 0))
    return im
def cross(img):
    cv2.line(img, (W // 2, 0), (W // 2, H), (255, 255, 255), 1); cv2.line(img, (0, H // 2), (W, H // 2), (255, 255, 255), 1)
S = (510, 340); rows = []
# Linha 1: a foto de calibração como saiu, com os dois pontos
r1, r2, r3, r4 = [], [], [], []
for k in (0, 4, 8):
    a, b = pts[k]; M, ang, sc, mid = matrix(a, b)
    img = cv2.imread("p_pole/%02d.jpg" % (k + 1)); raw = img.copy(); cross(raw)
    for p in (a, b): cv2.circle(raw, (int(p[0]), int(p[1])), 16, (0, 255, 255), 3)
    cv2.line(raw, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), (0, 255, 255), 2)
    r1.append(label(cv2.resize(raw, S), "Câmera %d: foto de calibração" % (k + 1), "mover %+d, %+d · girar %+.1f° · tamanho %.0f%%" % (W / 2 - mid[0], H / 2 - mid[1], ang, sc * 100)))
    al = cv2.warpAffine(img, M, (W, H)); cross(al); r2.append(label(cv2.resize(al, S), "Câmera %d: depois de alinhar" % (k + 1)))
    sub = cv2.imread("p_subj/%02d.jpg" % (k + 1)); s0 = sub.copy(); cross(s0); r3.append(label(cv2.resize(s0, S), "Câmera %d: sessão, como saiu" % (k + 1)))
    s1 = cv2.warpAffine(sub, M, (W, H)); cross(s1); r4.append(label(cv2.resize(s1, S), "Câmera %d: sessão, com a receita" % (k + 1)))
def strip(ims, title):
    w = sum(i.width for i in ims) + 8 * (len(ims) - 1); im = Image.new("RGB", (w, ims[0].height + 46), (16, 16, 16)); d = ImageDraw.Draw(im)
    d.text((4, 8), title, font=font(26), fill=(120, 255, 120)); x = 0
    for i in ims: im.paste(i, (x, 46)); x += i.width + 8
    return im
# Vista de cima do rig
top = Image.new("RGB", (r1[0].width * 3 + 16, 430), (16, 16, 16)); d = ImageDraw.Draw(top)
d.text((4, 8), "1. Vista de cima: a haste em pé no centro, as câmeras em volta", font=font(26), fill=(120, 255, 120))
cx, cy, sc = top.width // 2, 110, 95
for i, c in enumerate(cams):
    x, y = cx + c["C"][0] * sc, cy - c["C"][1] * sc
    d.line([x, y, cx, cy], fill=(70, 70, 70), width=1); d.rectangle([x - 11, y - 8, x + 11, y + 8], outline=(255, 255, 255), width=2); d.text((x - 6, y + 12), str(i + 1), font=font(18), fill=(255, 255, 255))
d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(255, 120, 0)); d.text((cx + 16, cy - 30), "haste com duas marcas", font=font(20), fill=(255, 160, 60))
out = [top, strip(r1, "2. Uma foto de cada câmera: o app acha (ou você clica) o alto e o baixo da haste"), strip(r2, "3. Com os dois pontos, o app calcula mover, girar e tamanho: a haste fica igual em todas"),
       strip(r3, "4. Tira-se a haste e fotografa-se a sessão: as fotos saem desalinhadas como antes"), strip(r4, "5. A mesma receita é aplicada em toda sessão, sem a haste")]
full = Image.new("RGB", (max(o.width for o in out), sum(o.height for o in out) + 14 * (len(out) - 1)), (16, 16, 16)); y = 0
for o in out: full.paste(o, (0, y)); y += o.height + 14
full.save("haste-simulacao.png")
# GIF: a sessão nas 9 câmeras, como saiu e com a receita
frames = []
for k in range(9):
    M = matrix(*pts[k])[0]; sub = cv2.imread("p_subj/%02d.jpg" % (k + 1)); a = sub.copy(); cross(a); b = cv2.warpAffine(sub, M, (W, H)); cross(b)
    la, lb = label(cv2.resize(a, (600, 400)), "Como saiu  ·  câmera %d" % (k + 1)), label(cv2.resize(b, (600, 400)), "Com a receita da haste")
    f = Image.new("RGB", (1208, 400)); f.paste(la, (0, 0)); f.paste(lb, (608, 0)); frames.append(f)
seq = frames + frames[-2:0:-1]
seq[0].save("haste-sessao.gif", save_all=True, append_images=seq[1:], duration=160, loop=0)
print(full.size, os.path.getsize("haste-sessao.gif"))
