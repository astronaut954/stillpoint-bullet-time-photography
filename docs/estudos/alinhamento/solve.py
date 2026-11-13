"""Caminho do Xangle: acha as câmeras pela cena (COLMAP) e tira os quatro valores do Align photos de cada uma."""
import numpy as np, json, os, sys, shutil, time, pycolmap

def recipe(cams, K, W, H):
    """cams: lista de (R mundo->câmera, C centro). Devolve o ponto central, o 'para cima' e, por câmera, dx, dy (px), giro (graus), tamanho."""
    # Ponto central: o mais perto de todos os eixos de mira (mínimos quadrados)
    A = np.zeros((3, 3)); b = np.zeros(3)
    for R, C in cams:
        d = R[2]; P = np.eye(3) - np.outer(d, d); A += P; b += P @ C
    pivot = np.linalg.solve(A, b)
    # Para cima: a normal do plano que melhor passa pelos centros das câmeras, no sentido do 'para cima' médio delas
    Cs = np.array([C for _, C in cams]); _, _, vt = np.linalg.svd(Cs - Cs.mean(0)); up = vt[2]
    if np.dot(up, -np.mean([R[1] for R, _ in cams], 0)) < 0: up = -up
    out = []; dists = [np.linalg.norm(pivot - C) for _, C in cams]; dref = np.median(dists)
    for (R, C), d in zip(cams, dists):
        pc = R @ (pivot - C); u = K @ pc; u = u[:2] / u[2]
        q = R @ (pivot + up * 0.05 * d - C); v = K @ q; v = v[:2] / v[2]
        ang = np.degrees(np.arctan2(v[0] - u[0], -(v[1] - u[1])))   # giro do 'para cima' em relação à vertical da foto
        out.append({"dx": W / 2 - u[0], "dy": H / 2 - u[1], "rot": -ang, "scale": d / dref})
    return pivot, up, out

def run(folder):
    truth = json.load(open(os.path.join(folder, "truth.json")))
    K = np.array(truth["K"]); W, H = truth["W"], truth["H"]
    work = os.path.join(folder, "_colmap"); shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
    imgs = os.path.join(work, "images"); os.makedirs(imgs)
    for c in truth["cams"]: shutil.copy(os.path.join(folder, c["name"]), imgs)
    db = os.path.join(work, "db.db"); t0 = time.time()
    ro = pycolmap.ImageReaderOptions(); ro.camera_model = "SIMPLE_RADIAL"; pycolmap.extract_features(db, imgs, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=ro)
    pycolmap.match_exhaustive(db)
    maps = pycolmap.incremental_mapping(db, imgs, os.path.join(work, "sparse"))
    secs = time.time() - t0
    if not maps: return {"ok": False, "secs": secs, "found": 0, "n": len(truth["cams"])}
    rec = max(maps.values(), key=lambda r: r.num_reg_images())
    est = {}
    for im in rec.images.values():
        T = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
        R = np.array(T.rotation.matrix()); t = np.array(T.translation)
        est[im.name] = (R, -R.T @ t)
    cam = list(rec.cameras.values())[0]
    f = cam.params[0]; Ke = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    names = [c["name"] for c in truth["cams"] if c["name"] in est]
    tr = recipe([(np.array(c["R"]), np.array(c["C"])) for c in truth["cams"] if c["name"] in est], K, W, H)[2]
    es = recipe([est[n] for n in names], Ke, W, H)[2]
    # A receita vale a menos de um giro e de um tamanho comuns (não mudam o alinhamento entre as fotos): tira a média
    d = lambda k: np.array([e[k] for e in es]) - np.array([t[k] for t in tr])
    rot = d("rot"); rot -= rot.mean()
    sc = np.array([e["scale"] for e in es]) / np.array([t["scale"] for t in tr]); sc /= np.median(sc)
    return {"ok": True, "secs": round(secs, 1), "found": len(names), "n": len(truth["cams"]), "points": rec.num_points3D(), "focal_true": round(K[0, 0]), "focal_est": round(f),
            "need_dx": round(float(np.abs([t["dx"] for t in tr]).max())), "need_dy": round(float(np.abs([t["dy"] for t in tr]).max())), "need_rot": round(float(np.abs([t["rot"] for t in tr]).max()), 2),
            "err_dx": round(float(np.abs(d("dx") - d("dx").mean()).max()), 1), "err_dy": round(float(np.abs(d("dy") - d("dy").mean()).max()), 1), "err_rot": round(float(np.abs(rot).max()), 3), "err_scale_pct": round(float(np.abs(sc - 1).max() * 100), 2)}

if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1])))
