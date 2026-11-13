import scene, solve, json, sys, io, contextlib, os
cases = [("9 câmeras, arco 120° (15° entre elas)", dict(n=9, arc=120)), ("9 câmeras, arco 180° (22,5°)", dict(n=9, arc=180)), ("5 câmeras, arco 120° (30°)", dict(n=5, arc=120)),
         ("3 câmeras, arco 60° (30°)", dict(n=3, arc=60)), ("3 câmeras, arco 120° (60°)", dict(n=3, arc=120)), ("12 câmeras, arco 180° (16°)", dict(n=12, arc=180)),
         ("9 câmeras, 120°, fundo liso (só o sujeito tem detalhe)", dict(n=9, arc=120, plain=True)), ("18 câmeras, 120°, fundo liso", dict(n=18, arc=120, plain=True))]
res = []
for k, (label, kw) in enumerate(cases):
    out = "m%d" % k
    scene.make(out, seed=7 + k, **kw)
    try: r = solve.run(out)
    except Exception as e: r = {"ok": False, "error": str(e)[:200]}
    r["case"] = label; res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(res, open("matrix.json", "w"), ensure_ascii=False, indent=1)
