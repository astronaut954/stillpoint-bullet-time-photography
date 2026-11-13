import numpy as np, cv2, json, scene, find_marks
W, H = 2400, 1600
def proj(c, P):
    K, R, C = np.array(c["K"]), np.array(c["R"]), np.array(c["C"]); p = K @ (R @ (np.array(P, float) - C)); return p[:2] / p[2]
def run(folder, chain):
    T = json.load(open(folder + "/truth.json")); cams = T["cams"]; rng = np.random.default_rng(3)
    imgs = [cv2.imread("%s/%s" % (folder, c["name"])) for c in cams]
    truth = [(proj(c, (0, 0, 1.3)), proj(c, (0, 0, 0.7))) for c in cams]
    ref = len(cams) // 2
    click = (truth[ref][0] + rng.normal(0, 3, 2), truth[ref][1] + rng.normal(0, 3, 2))      # o clique da pessoa, com 3 px de erro
    off = (click[0] - truth[ref][0], click[1] - truth[ref][1])   # o erro do clique vai junto para todas as fotos: não atrapalha o alinhamento
    found = {ref: click}; order = list(range(ref + 1, len(cams))) + list(range(ref - 1, -1, -1)); errs = []; miss = 0; conf = []
    for i in order:
        src = (i - 1 if i > ref else i + 1) if chain else ref      # chain: usa a câmera vizinha já achada como referência
        if src not in found: miss += 1; continue
        r = find_marks.find(imgs[src], found[src][0], found[src][1], imgs[i])
        if r is None: miss += 1; continue
        e = max(np.linalg.norm(np.array(r[0]) - truth[i][0] - off[0]), np.linalg.norm(np.array(r[1]) - truth[i][1] - off[1]))
        d = np.linalg.norm(truth[i][0] - truth[i][1])
        if e > 0.12 * d: miss += 1; conf.append(("x", round(r[2], 2))); continue     # achou outra coisa
        found[i] = (np.array(r[0]), np.array(r[1])); errs.append(e); conf.append(("ok", round(r[2], 2)))
    n = len(cams) - 1
    return {"found": n - miss, "of": n, "max_err_px": round(float(max(errs)), 1) if errs else None, "mean_err_px": round(float(np.mean(errs)), 1) if errs else None,
            "conf_ok_min": min([c for k, c in conf if k == "ok"], default=None), "conf_wrong_max": max([c for k, c in conf if k == "x"], default=None)}
B = dict(n=9, arc=120, W=W, H=H, subject=False, err=1.2)
cases = [("fita laranja, estúdio liso", dict(**B, pole="tape", plain=True)), ("fita laranja, lugar com muito detalhe", dict(**B, pole="tape")),
  ("faixa impressa de anéis, estúdio liso", dict(**B, pole="rings", plain=True)), ("faixa impressa de anéis, lugar com muito detalhe", dict(**B, pole="rings")),
  ("bolas laranja, estúdio liso", dict(**B, pole="balls", plain=True)), ("bolas laranja, lugar com muito detalhe", dict(**B, pole="balls")),
  ("fita cinza-clara (pouco contraste), estúdio liso", dict(**B, pole="gray", plain=True)), ("fita cinza-clara, lugar com muito detalhe", dict(**B, pole="gray")),
  ("fita laranja, estúdio, ruído e desfoque, cor diferente entre câmeras", dict(**B, pole="tape", plain=True, noise=14, blur=1.5, gain=0.3)),
  ("fita laranja, lugar com detalhe, 18 câmeras em volta inteira", dict(n=18, arc=340, W=W, H=H, subject=False, err=1.2, pole="tape")),
  ("fita laranja, estúdio, a 5 m", dict(**B, pole="tape", plain=True, radius=5.0)),
  ("faixa de anéis, lugar com detalhe, erros de montagem grandes", dict(n=9, arc=120, W=W, H=H, subject=False, err=2.5, pole="rings"))]
res = []
for k, (label, kw) in enumerate(cases):
    out = "f%d" % k; scene.make(out, seed=80 + k, **kw)
    r = {"case": label, "a_partir_da_foto_clicada": run(out, False), "de_vizinha_em_vizinha": run(out, True)}
    res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("matrix5.json", "w"), ensure_ascii=False, indent=1)
