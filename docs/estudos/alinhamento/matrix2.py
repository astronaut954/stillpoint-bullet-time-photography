import scene, solve, json
B = dict(n=9, arc=120)
cases = [("referência: 9 câmeras, 120°, cena fácil", dict(**B)),
  ("lente com distorção (barril forte)", dict(**B, k1=-0.25)),
  ("ruído alto (ISO alto)", dict(**B, noise=25)),
  ("pouca luz + ruído", dict(**B, dark=0.25, noise=12)),
  ("fora de foco (desfoque de 3 px)", dict(**B, blur=3.0)),
  ("exposição e cor diferentes entre câmeras", dict(**B, gain=0.35)),
  ("lentes diferentes (zoom ±15% entre câmeras)", dict(**B, focal_var=0.15)),
  ("tudo junto: distorção, ruído, cor, zoom diferente", dict(**B, k1=-0.15, noise=15, gain=0.25, focal_var=0.1, blur=1.0)),
  ("sujeito liso, cenário com detalhe", dict(**B, plain_subject=True)),
  ("estúdio: fundo liso e sujeito liso", dict(**B, plain=True, plain_subject=True)),
  ("erros de montagem 3x maiores", dict(**B, err=3.0)),
  ("9 câmeras em volta inteira (360°, 40° entre elas)", dict(n=9, arc=320)),
  ("18 câmeras em volta inteira (20° entre elas)", dict(n=18, arc=340))]
res = []
for k, (label, kw) in enumerate(cases):
    out = "h%d" % k
    scene.make(out, seed=20 + k, **kw)
    try: r = solve.run(out)
    except Exception as e: r = {"ok": False, "error": str(e)[:200]}
    r["case"] = label; res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("matrix2.json", "w"), ensure_ascii=False, indent=1)
