"""Cena virtual para testar o alinhamento: sala com textura, um "sujeito" no centro e N câmeras num arco, com erros."""
import numpy as np, cv2, json, os, sys

def texture(rng, size=1024, plain=False):
    if plain:
        base = np.full((size, size, 3), rng.integers(150, 200), np.uint8)
        return cv2.add(base, rng.integers(0, 3, (size, size, 3), dtype=np.uint8))
    img = rng.integers(60, 200, (size // 16, size // 16, 3), dtype=np.uint8)
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_CUBIC)
    for _ in range(140):
        c = tuple(int(x) for x in rng.integers(0, 255, 3)); p = tuple(int(x) for x in rng.integers(0, size, 2)); r = int(rng.integers(8, 70))
        k = rng.integers(0, 3)
        if k == 0: cv2.circle(img, p, r, c, -1)
        elif k == 1: cv2.rectangle(img, p, (p[0] + r * 2, p[1] + r), c, -1)
        else: cv2.putText(img, "".join(chr(int(x)) for x in rng.integers(65, 90, 4)), p, cv2.FONT_HERSHEY_SIMPLEX, r / 25.0, c, 3)
    return img

def look_at(pos, target, up=np.array([0, 0, 1.0]), roll=0.0):
    f = target - pos; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    d = np.cross(f, r)  # para baixo
    R = np.stack([r, d, f])  # mundo -> câmera (x direita, y baixo, z frente)
    c, s = np.cos(roll), np.sin(roll)
    Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return Rz @ R

CHART_IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chart-only.jpg")
def quads(rng, plain_walls=False, plain_subject=False, chart=0.0):
    """Lista de (4 cantos 3D, textura). Tudo em ladrilhos pequenos para o recorte atrás da câmera ser simples."""
    out = []
    def plane(o, u, v, nu, nv, tex, front=0):
        th, tw = tex.shape[:2]
        for i in range(nu):
            for j in range(nv):
                c = [o + u * (i / nu) + v * (j / nv), o + u * ((i + 1) / nu) + v * (j / nv), o + u * ((i + 1) / nu) + v * ((j + 1) / nv), o + u * (i / nu) + v * ((j + 1) / nv)]
                t = np.float32([[tw * i / nu, th * j / nv], [tw * (i + 1) / nu, th * j / nv], [tw * (i + 1) / nu, th * (j + 1) / nv], [tw * i / nu, th * (j + 1) / nv]])
                out.append((np.array(c), tex, t, front))
    A = lambda *x: np.array(x, float)
    plane(A(-6, -6, 0), A(12, 0, 0), A(0, 12, 0), 24, 24, texture(rng, 2048, plain_walls))      # chão
    plane(A(-6, 6, 0), A(12, 0, 0), A(0, 0, 4), 24, 8, texture(rng, 2048, plain_walls))         # parede do fundo
    plane(A(-6, -6, 0), A(0, 12, 0), A(0, 0, 4), 24, 8, texture(rng, 2048, plain_walls))        # parede esquerda
    plane(A(6, -6, 0), A(0, 12, 0), A(0, 0, 4), 24, 8, texture(rng, 2048, plain_walls))         # parede direita
    def box(cx, cy, w, d, h, z0=0.0, flat=False):
        x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
        T = lambda: texture(rng, 512, flat)
        plane(A(x0, y0, z0), A(w, 0, 0), A(0, 0, h), 2, 4, T())
        plane(A(x0, y1, z0), A(w, 0, 0), A(0, 0, h), 2, 4, T())
        plane(A(x0, y0, z0), A(0, d, 0), A(0, 0, h), 2, 4, T())
        plane(A(x1, y0, z0), A(0, d, 0), A(0, 0, h), 2, 4, T())
        plane(A(x0, y0, z0 + h), A(w, 0, 0), A(0, d, 0), 2, 2, T())
    box(0, 0, 0.5, 0.35, 1.7, flat=plain_subject)            # o "sujeito" no centro
    if chart:
        # A cartela do Stillpoint (A4 deitado; chart = 1.41 para A3), em pé na frente do sujeito, virada para o meio do arco
        w, h = 0.297 * chart, 0.210 * chart
        plane(A(-w / 2, -0.20, 1.0 + h / 2), A(w, 0, 0), A(0, 0, -h), 2, 2, cv2.imread(CHART_IMG), front=1)
    if not plain_walls:
        box(-2.2, 2.5, 0.8, 0.8, 1.0); box(2.4, 3.0, 0.6, 0.6, 2.0); box(1.5, 1.2, 0.4, 0.4, 0.5); box(-1.4, 1.0, 0.5, 0.5, 0.8)
    return out

def render(K, R, C, W, H, qs):
    img = np.full((H, W, 3), 30, np.uint8)
    items = []
    for c, tex, t, front in qs:
        pc = (R @ (c - C).T).T
        if (pc[:, 2] < 0.15).any(): continue
        uv = (K @ pc.T).T; uv = uv[:, :2] / uv[:, 2:3]
        if (uv[:, 0] < -W).all() or (uv[:, 0] > 2 * W).all() or (uv[:, 1] < -H).all() or (uv[:, 1] > 2 * H).all(): continue
        if uv.min() < -4 * W or uv.max() > 5 * W: continue
        items.append((pc[:, 2].mean() - 1000 * front, uv.astype(np.float32), tex, t))
    for _, uv, tex, t in sorted(items, key=lambda x: -x[0]):
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0c, y0c, x1c, y1c = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1c <= x0c or y1c <= y0c: continue
        Hm = cv2.getPerspectiveTransform(t, uv - np.float32([x0c, y0c]))
        w, h = x1c - x0c, y1c - y0c
        patch = cv2.warpPerspective(tex, Hm, (w, h), flags=cv2.INTER_LINEAR)
        mask = np.zeros((h, w), np.uint8); cv2.fillConvexPoly(mask, np.round(uv - np.float32([x0c, y0c])).astype(np.int32), 255)
        roi = img[y0c:y1c, x0c:x1c]; roi[mask > 0] = patch[mask > 0]
    return img

def make(out, n=9, arc=120.0, radius=3.0, seed=1, err=1.0, plain=False, W=1500, H=1000, plain_subject=False, k1=0.0, noise=6, blur=0.0, gain=0.0, focal_var=0.0, dark=1.0, chart=0.0):
    """k1: distorção de lente (barril < 0); noise: ruído; blur: desfoque (px); gain: variação de exposição e cor entre
    câmeras; focal_var: variação da distância focal entre câmeras (lentes diferentes); dark: 1 = normal, 0.25 = pouca luz."""
    rng = np.random.default_rng(seed)
    os.makedirs(out, exist_ok=True)
    qs = quads(rng, plain, plain_subject, chart)
    f0 = 0.5 * W / np.tan(np.radians(22.5))
    pivot = np.array([0, 0, 1.0]); cams = []
    for i in range(n):
        a = np.radians(-arc / 2 + arc * i / (n - 1)) if n > 1 else 0.0
        r = radius + rng.normal(0, 0.05) * err
        C = np.array([r * np.sin(a), -r * np.cos(a), 1.4 + rng.normal(0, 0.04) * err])
        aim = pivot + rng.normal(0, 0.12, 3) * err          # erro de mira (até ~3 graus)
        R = look_at(C, aim, roll=np.radians(rng.normal(0, 2.0)) * err)
        f = f0 * (1 + rng.uniform(-focal_var, focal_var))
        K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
        img = render(K, R, C, W, H, qs)
        if k1:
            # distorção radial: cada pixel da foto final busca a cor no ponto sem distorção
            ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
            xn, yn = (xs - W / 2) / f, (ys - H / 2) / f; r2 = xn * xn + yn * yn
            pts = cv2.undistortPoints(np.stack([xs, ys], -1).reshape(-1, 1, 2), K, np.array([k1, 0, 0, 0.0])).reshape(H, W, 2)
            img = cv2.remap(img, (pts[..., 0] * f + W / 2).astype(np.float32), (pts[..., 1] * f + H / 2).astype(np.float32), cv2.INTER_LINEAR)
        if blur: img = cv2.GaussianBlur(img, (0, 0), blur)
        x = img.astype(np.float32) * dark
        if gain: x = x * (1 + rng.uniform(-gain, gain)) * (1 + rng.uniform(-gain / 2, gain / 2, 3))
        x = x + rng.normal(0, noise, x.shape)
        img = np.clip(x, 0, 255).astype(np.uint8)
        name = "%02d.jpg" % (i + 1)
        cv2.imwrite(os.path.join(out, name), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        cams.append({"name": name, "R": R.tolist(), "C": C.tolist(), "K": K.tolist()})
    json.dump({"K": cams[0]["K"], "W": W, "H": H, "pivot": pivot.tolist(), "cams": cams, "mixed": focal_var > 0, "chart": chart}, open(os.path.join(out, "truth.json"), "w"))

if __name__ == "__main__":
    make(sys.argv[1], n=int(sys.argv[2]), arc=float(sys.argv[3]), plain=len(sys.argv) > 4 and sys.argv[4] == "plain")
