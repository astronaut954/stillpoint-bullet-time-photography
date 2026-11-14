"""A pessoa clica nas duas marcas em UMA foto; o programa procura as mesmas marcas nas outras fotos.
Busca por semelhança (em cor), em vários tamanhos e giros, e escolhe o par (alto, baixo) que faz sentido junto."""
import numpy as np, cv2, json, os

def patch(img, p, hw, hh):
    x, y = int(round(p[0])), int(round(p[1])); H, W = img.shape[:2]
    x0, x1, y0, y1 = x - hw, x + hw + 1, y - hh, y + hh + 1
    if x0 < 0 or y0 < 0 or x1 > W or y1 > H: return None
    return img[y0:y1, x0:x1]

def candidates(img, tmpl, scales, angles, keep=12):
    out = []
    for s in scales:
        for a in angles:
            t = tmpl
            if s != 1.0: t = cv2.resize(t, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
            if a:
                h, w = t.shape[:2]; M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0); t = cv2.warpAffine(t, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
            if t.shape[0] >= img.shape[0] or t.shape[1] >= img.shape[1]: continue
            r = cv2.matchTemplate(img, t, cv2.TM_CCOEFF_NORMED); r = np.nan_to_num(r)
            for _ in range(4):
                _, v, _, loc = cv2.minMaxLoc(r)
                out.append((v, loc[0] + t.shape[1] / 2.0, loc[1] + t.shape[0] / 2.0, s, a))
                cv2.circle(r, loc, max(4, t.shape[0] // 2), -1.0, -1)
    out.sort(key=lambda c: -c[0]); pick = []
    for c in out:
        if all((c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2 > 36 for p in pick): pick.append(c)
        if len(pick) >= keep: break
    return pick

def snap(img, p, d, rounds=3, other=None, wide=None):
    """Leva o ponto para o centro da marca. A marca é o que tem cor própria ali: cores comuns perto do ponto e raras
    em volta (a haste acima e abaixo, o fundo). d: distância entre as duas marcas, que dá a escala."""
    """other: a outra marca. Com ela, só conta o que está numa faixa estreita em volta da linha entre as duas (a haste),
    para uma mancha da mesma cor no fundo, encostada na haste, não puxar o ponto."""
    p = np.array(p, float); H, W = img.shape[:2]
    axis = None
    if other is not None:
        v = np.array(other, float) - p; n = np.linalg.norm(v)
        if n > 1: axis = v / n
    rin, rout = max(5.0, d * 0.05), max(12.0, d * 0.16)
    for _ in range(rounds):
        x0, x1, y0, y1 = int(p[0] - rout), int(p[0] + rout) + 1, int(p[1] - rout), int(p[1] + rout) + 1
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H: return p
        lab = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2LAB).astype(np.int32)
        q = (lab[..., 0] // 16) * 256 + (lab[..., 1] // 12) * 16 + (lab[..., 2] // 12)       # cor em caixas
        ys, xs = np.mgrid[y0:y1, x0:x1]; r = np.hypot(xs - p[0], ys - p[1])
        inner, outer = r <= rin, r >= rin * 2.2
        hi = np.bincount(q[inner], minlength=4096) / max(1, inner.sum()); ho = np.bincount(q[outer], minlength=4096) / max(1, outer.sum())
        like = (hi[q] > 0.02) & (hi[q] > 3 * ho[q])
        like &= r <= rin * 2.2
        if like.sum() < 12: return p
        n, lbl, st, cen = cv2.connectedComponentsWithStats(like.astype(np.uint8), 8)
        # fica com os pedaços perto do ponto (os anéis de uma faixa impressa são vários pedaços)
        keep = np.zeros_like(like)
        for k in range(1, n):
            if st[k, cv2.CC_STAT_AREA] < 6 or np.hypot(cen[k][0] + x0 - p[0], cen[k][1] + y0 - p[1]) > rin * 1.6: continue
            # com a outra marca conhecida: o pedaço tem de estar centrado na linha da haste (uma mancha da mesma cor no
            # fundo, ao lado, fica de fora; uma bola, mais larga que a haste, entra inteira)
            if axis is not None and abs((cen[k][0] + x0 - p[0]) * axis[1] - (cen[k][1] + y0 - p[1]) * axis[0]) > max(6.0, d * 0.07): continue
            keep |= lbl == k
        if keep.sum() < 12: return p
        if axis is None: newp = np.array([xs[keep].mean(), ys[keep].mean()])
        else:
            dx, dy = xs[keep] - p[0], ys[keep] - p[1]
            along, side = dx * axis[0] + dy * axis[1], dx * axis[1] - dy * axis[0]
            band = max(4.0, d * 0.035)
            lo, hi = np.percentile(side, [10, 90])
            if (wide if wide is not None else hi - lo > 2.4 * band):
                # marca mais larga que a haste (uma bola): fica inteira
                newp = np.array([xs[keep].mean(), ys[keep].mean()])
            else:
                # marca na haste (fita, faixa): só a faixa da largura da haste em volta do ponto; o que estiver ao
                # lado, da mesma cor, fica de fora
                near = np.abs(side) <= band
                if near.sum() < 6: return p
                newp = np.array([xs[keep][near].mean(), ys[keep][near].mean()])
        if np.linalg.norm(newp - p) < 0.3: return newp
        p = newp
    return p

def find(ref_img, a, b, img, work=1200, wide=None):
    """a, b: os cliques (alto, baixo) na foto de referência. Devolve (alto, baixo, confiança) na outra foto, ou None."""
    k = work / ref_img.shape[1]
    R = cv2.resize(ref_img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA); I = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    a2, b2 = np.array(a) * k, np.array(b) * k; d = np.linalg.norm(a2 - b2)
    hw, hh = max(4, int(round(d * 0.045))), max(6, int(round(d * 0.14)))    # recorte estreito e alto: a marca e um pouco da haste
    ta, tb = patch(R, a2, hw, hh), patch(R, b2, hw, hh)
    if ta is None or tb is None: return None
    scales, angles = (0.8, 0.9, 1.0, 1.1, 1.25), (-8, -4, 0, 4, 8)
    ca, cb = candidates(I, ta, scales, angles), candidates(I, tb, scales, angles)
    ref_ang = np.arctan2(a2[0] - b2[0], -(a2[1] - b2[1])); best = None
    for va, xa, ya, sa, aa in ca:
        for vb, xb, yb, sb, ab in cb:
            dd = np.hypot(xa - xb, ya - yb)
            if dd < 0.6 * d or dd > 1.6 * d or yb <= ya: continue
            ang = np.arctan2(xa - xb, -(ya - yb))
            if abs(np.degrees(ang - ref_ang)) > 20: continue
            # o tamanho de cada marca tem de combinar com a distância entre elas
            cons = 1.0 - min(0.5, abs(dd / d - (sa + sb) / 2))
            score = (va + vb) / 2 * cons
            if best is None or score > best[0]: best = (score, (xa / k, ya / k, sa, aa), (xb / k, yb / k, sb, ab))
    if best is None: return None
    # Ajuste fino na foto inteira, numa janela pequena em volta do que foi achado
    def refine(click, got):
        x, y, sc, an = got; d0 = np.linalg.norm(np.array(a) - np.array(b))
        t = patch(ref_img, click, max(6, int(round(d0 * 0.045))), max(8, int(round(d0 * 0.14))))
        if t is None: return (x, y)
        if sc != 1.0: t = cv2.resize(t, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_LINEAR)
        if an:
            h, w = t.shape[:2]; t = cv2.warpAffine(t, cv2.getRotationMatrix2D((w / 2, h / 2), an, 1.0), (w, h), borderMode=cv2.BORDER_REPLICATE)
        m = int(round(d0 * 0.03)) + 6; th, tw = t.shape[:2]
        x0, y0 = int(round(x - tw / 2)) - m, int(round(y - th / 2)) - m
        if x0 < 0 or y0 < 0 or x0 + tw + 2 * m > img.shape[1] or y0 + th + 2 * m > img.shape[0]: return (x, y)
        r = cv2.matchTemplate(img[y0:y0 + th + 2 * m, x0:x0 + tw + 2 * m], t, cv2.TM_CCOEFF_NORMED); _, _, _, loc = cv2.minMaxLoc(np.nan_to_num(r))
        return (x0 + loc[0] + (tw - 1) / 2.0, y0 + loc[1] + (th - 1) / 2.0)
    pa, pb = refine(a, best[1]), refine(b, best[2]); d1 = np.hypot(pa[0] - pb[0], pa[1] - pb[1])
    return tuple(snap(img, pa, d1, other=pb, wide=wide)), tuple(snap(img, pb, d1, other=pa, wide=wide)), float(best[0])


def is_wide(img, p, d, other):
    """Na foto clicada: a marca é mais larga que a haste (uma bola)? Mede só o pedaço de cor que está sob o clique."""
    p = np.array(p, float); v = np.array(other, float) - p; axis = v / np.linalg.norm(v)
    rin, rout = max(5.0, d * 0.05), max(12.0, d * 0.16)
    x0, x1, y0, y1 = int(p[0] - rout), int(p[0] + rout) + 1, int(p[1] - rout), int(p[1] + rout) + 1
    lab = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2LAB).astype(np.int32)
    q = (lab[..., 0] // 16) * 256 + (lab[..., 1] // 12) * 16 + (lab[..., 2] // 12)
    ys, xs = np.mgrid[y0:y1, x0:x1]; r = np.hypot(xs - p[0], ys - p[1])
    inner, outer = r <= rin, r >= rin * 2.2
    hi = np.bincount(q[inner], minlength=4096) / max(1, inner.sum()); ho = np.bincount(q[outer], minlength=4096) / max(1, outer.sum())
    like = (hi[q] > 0.02) & (hi[q] > 3 * ho[q]) & (r <= rin * 2.2)
    n, lbl, st, cen = cv2.connectedComponentsWithStats(like.astype(np.uint8), 8)
    if n < 2: return False
    k = 1 + int(np.argmin([np.hypot(cen[j][0] + x0 - p[0], cen[j][1] + y0 - p[1]) for j in range(1, n)]))
    m = lbl == k; side = (xs[m] - p[0]) * axis[1] - (ys[m] - p[1]) * axis[0]
    lo, hi_ = np.percentile(side, [10, 90])
    return bool(hi_ - lo > 2.4 * max(4.0, d * 0.035))
