"""Câmeras em alturas diferentes: o quanto a receita da haste (dois pontos) erra em relação ao ideal."""
import numpy as np, cv2, json, scene, find_marks
W, H = 2400, 1600; PIV = np.array([0, 0, 1.0]); UP = np.array([0, 0, 1.0])
def proj(c, P):
    K, R, C = np.array(c["K"]), np.array(c["R"]), np.array(c["C"]); p = K @ (R @ (np.array(P, float) - C)); return p[:2] / p[2]
def surf(c, z, balls):
    if balls: return proj(c, (0, 0, z))
    C = np.array(c["C"]); h = C[:2] / np.linalg.norm(C[:2]); return proj(c, (0.02 * h[0], 0.02 * h[1], z))
def sim(mid, ang, sc):
    """mover mid ao centro, girar ang (graus, sentido da foto), mudar o tamanho sc: matriz 2x3"""
    t = np.radians(ang); R = sc * np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    c = np.array([W / 2, H / 2]); return R, c - R @ np.array(mid)
def apply(M, p): return M[0] @ np.array(p) + M[1]
def ideal(c, dref):
    """O alinhamento ideal: o ponto central (1 m de altura) no meio, a vertical do mundo na vertical da foto, o tamanho
    pela distância até o ponto central (mesmo tamanho do sujeito em todas as câmeras)."""
    u = proj(c, PIV); v = proj(c, PIV + UP * 0.05); ang = -np.degrees(np.arctan2(v[0] - u[0], -(v[1] - u[1])))
    dist = np.linalg.norm(PIV - np.array(c["C"])) / np.array(c["K"])[0, 0]
    return sim(u, ang, dist / dref)   # (a câmera mais perto vê o sujeito maior: reduz)
def run(label, kw, balls=False, three=False):
    f = "hh"; scene.make(f, seed=kw.pop("seed", 101), W=W, H=H, subject=False, n=9, arc=120, pole="balls" if balls else ("tape3" if three else "tape"), **kw)
    T = json.load(open(f + "/truth.json")); cams = T["cams"]; imgs = [cv2.imread("%s/%s" % (f, c["name"])) for c in cams]
    tr = [(surf(c, 1.3, balls), surf(c, 0.7, balls)) for c in cams]; ref = 4
    rng = np.random.default_rng(3); ck = (tr[ref][0] + rng.normal(0, 5, 2), tr[ref][1] + rng.normal(0, 5, 2)); d0 = np.linalg.norm(ck[0] - ck[1])
    wide = find_marks.is_wide(imgs[ref], ck[0], d0, ck[1])
    pts = {ref: (find_marks.snap(imgs[ref], ck[0], d0, other=ck[1], wide=wide), find_marks.snap(imgs[ref], ck[1], d0, other=ck[0], wide=wide))}
    for i in range(9):
        if i == ref: continue
        r = find_marks.find(imgs[ref], pts[ref][0], pts[ref][1], imgs[i], wide=wide); pts[i] = (np.array(r[0]), np.array(r[1]))
    lens = [np.linalg.norm(pts[i][0] - pts[i][1]) for i in range(9)]; lref = np.median(lens)
    if three:
        # Terceira marca, no meio: com três marcas de espaçamento igual, a perspectiva da haste dá a distância de verdade
        # (sem o encurtamento de quem olha de cima ou de baixo). Escala = distância até a marca do meio.
        dd = []
        for i, c in enumerate(cams):
            a_, b_ = pts[i]; m = find_marks.snap(imgs[i], (a_ + b_) / 2, lens[i], other=a_, wide=wide)
            K = np.array(c["K"]); Ki = np.linalg.inv(K); r = [Ki @ np.array([p[0], p[1], 1.0]) for p in (a_, m, b_)]
            A = np.stack([r[0] / 2, -r[1], r[2] / 2], 1)        # s1 r1 / 2 - s2 r2 + s3 r3 / 2 = 0
            _, _, vt = np.linalg.svd(A); s_ = vt[-1]; s_ = s_ / s_[1]
            X1, X3 = s_[0] * r[0], s_[2] * r[2]; Lr = np.linalg.norm(X3 - X1)   # tamanho da haste em unidades de s2
            dd.append(np.linalg.norm(r[1]) / Lr)                                  # distância até o meio, em "haste"s
        dd = np.array(dd); lens = list(lref * np.median(dd) / dd)             # vira um "comprimento" equivalente

    dists = [np.linalg.norm(PIV - np.array(c["C"])) / np.array(c["K"])[0, 0] for c in cams]; dref = np.median(dists)
    worst = 0; worst_sc = 0
    for i, c in enumerate(cams):
        a, b = pts[i]; mid = (a + b) / 2; ang = -np.degrees(np.arctan2(a[0] - b[0], -(a[1] - b[1])))
        Mh = sim(mid, ang, lref / lens[i]); Mi = ideal(c, dref)
        # onde a cabeça (1,7 m), o centro e os pés (0 m) do sujeito caem depois de alinhar, pela haste e pelo ideal
        for z in (0.0, 1.0, 1.7):
            q = proj(c, (0, 0, z)); worst = max(worst, np.linalg.norm(apply(Mh, q) - apply(Mi, q)))
        worst_sc = max(worst_sc, abs((lref / lens[i]) / (dists[i] / dref) - 1))
    hs = [round(c["C"][2], 2) for c in cams]
    return {"case": label, "alturas": hs, "erro_max_px_no_sujeito": round(float(worst), 1), "erro_tamanho_pct": round(float(worst_sc * 100), 2)}
cases = [("mesma altura (referência)", dict()), ("alturas ±10 cm", dict(hvar=0.10)), ("alturas ±25 cm", dict(hvar=0.25)), ("alturas ±50 cm", dict(hvar=0.5)),
         ("duas fileiras, 1,0 m e 1,8 m, alternadas", dict(rows=(1.0, 1.8))), ("alturas ±50 cm, a 5 m", dict(hvar=0.5, radius=5.0))]
res = [run(l, dict(k)) for l, k in cases] + [run(l + ", três marcas", dict(k), three=True) for l, k in cases]
for r in res: print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("heights.json", "w"), ensure_ascii=False, indent=1)
