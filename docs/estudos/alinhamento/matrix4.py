import scene, solve_chart, json
S = dict(W=2000, H=1333, plain=True, plain_subject=True)
# chart=3.0 a 3 m mostra ao detector marcas do tamanho que ele veria numa foto de 6000 px sem reduzir (A4 de verdade)
cases = [("marcas 3x maiores, 120°", dict(n=9, arc=120, chart=3.0)), ("marcas 3x maiores, 160°", dict(n=9, arc=160, chart=3.0)),
         ("marcas 3x maiores, 120°, ruído e desfoque, cor diferente", dict(n=9, arc=120, chart=3.0, noise=12, blur=1.0, gain=0.25)),
         ("marcas 3x maiores, a 5 m", dict(n=9, arc=120, chart=3.0, radius=5.0))]
res = []
for k, (label, kw) in enumerate(cases):
    out = "d%d" % k
    scene.make(out, seed=60 + k, **S, **kw)
    r = solve_chart.run(out, 0); r["case"] = label; res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("matrix4.json", "w"), ensure_ascii=False, indent=1)
