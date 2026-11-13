import scene, solve_chart, json
S = dict(W=2000, H=1333)   # o Chart::Find reduz a foto para 2000 px de largura: é o que ele enxerga de uma foto de 6000 px
cases = [("A4 a 3 m, 9 câmeras em 120°, cenário com detalhe", dict(n=9, arc=120, chart=1.0), 0),
  ("A4 a 3 m, estúdio liso (fundo e sujeito)", dict(n=9, arc=120, chart=1.0, plain=True, plain_subject=True), 0),
  ("A4 a 3 m, arco de 160°", dict(n=9, arc=160, chart=1.0, plain=True, plain_subject=True), 0),
  ("A3 a 3 m, arco de 160°", dict(n=9, arc=160, chart=1.41, plain=True, plain_subject=True), 0),
  ("A4 a 2 m, 120°", dict(n=9, arc=120, chart=1.0, radius=2.0, plain=True, plain_subject=True), 0),
  ("A4 a 5 m, 120°", dict(n=9, arc=120, chart=1.0, radius=5.0, plain=True, plain_subject=True), 0),
  ("A3 a 5 m, 120°", dict(n=9, arc=120, chart=1.41, radius=5.0, plain=True, plain_subject=True), 0),
  ("A4 a 3 m, 120°, ruído e desfoque leves, cor diferente", dict(n=9, arc=120, chart=1.0, plain=True, plain_subject=True, noise=12, blur=1.0, gain=0.25), 0),
  ("A4 a 3 m, 120°, distância focal conhecida com 5% de erro", dict(n=9, arc=120, chart=1.0, plain=True, plain_subject=True), 0.05),
  ("A4 a 3 m, 120°, lentes com zoom diferente (±15%)", dict(n=9, arc=120, chart=1.0, plain=True, plain_subject=True, focal_var=0.15), 0),
  ("A4 a 3 m, 120°, erros de montagem 3x maiores", dict(n=9, arc=120, chart=1.0, plain=True, plain_subject=True, err=3.0), 0)]
res = []
for k, (label, kw, fe) in enumerate(cases):
    out = "c%d" % k
    scene.make(out, seed=40 + k, **S, **kw)
    try: r = solve_chart.run(out, fe)
    except Exception as e: r = {"ok": False, "error": str(e)[:300]}
    r["case"] = label; res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("matrix3.json", "w"), ensure_ascii=False, indent=1)
