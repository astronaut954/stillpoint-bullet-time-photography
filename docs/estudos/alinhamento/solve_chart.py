"""Objeto de referência: a cartela do Stillpoint. Acha as 4 marcas com o Chart::Find do app e tira os quatro valores."""
import numpy as np, cv2, json, os, subprocess, sys
TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "build", "host-test", "ChartFindTool")
MM = np.array([[31, 31], [266, 31], [266, 167], [31, 167]], float)  # centros das marcas na folha (mm), ordem do Chart::Find
CENTER = np.array([148.5, 105.0])

def values(R, t, K, W, H, size):
    """Pose da cartela (cartela -> câmera) -> mover, giro, tamanho. Eixos da cartela: x para a direita, y para baixo, em metros."""
    c = R @ np.array([0, 0, 0.0]) + t; u = K @ c; u = u[:2] / u[2]
    q = R @ np.array([0, -0.05 * size, 0.0]) + t; v = K @ q; v = v[:2] / v[2]     # 5 cm para cima na folha
    ang = np.degrees(np.arctan2(v[0] - u[0], -(v[1] - u[1])))
    return {"dx": W / 2 - u[0], "dy": H / 2 - u[1], "rot": -ang, "dist": float(np.linalg.norm(c)) / K[0, 0]}

def run(folder, focal_error=0.0):
    truth = json.load(open(os.path.join(folder, "truth.json"))); W, H = truth["W"], truth["H"]; size = truth["chart"]
    names = [c["name"] for c in truth["cams"]]
    out = subprocess.run([TOOL] + [os.path.join(folder, n) for n in names], capture_output=True, text=True).stdout.strip().split("\n")
    obj = np.array([[(x - CENTER[0]) / 1000 * size, (y - CENTER[1]) / 1000 * size, 0] for x, y in MM])
    est, tru, angles, missed = [], [], [], []
    for line, c in zip(out, truth["cams"]):
        p = line.split(); found = p[1] == "1"
        K = np.array(c["K"]); R = np.array(c["R"]); C = np.array(c["C"])
        ang = abs(np.degrees(np.arctan2(C[0], -C[1])))     # ângulo da câmera em relação à frente da cartela
        if not found: missed.append(round(ang)); continue
        pts = np.array([[float(p[2 + 2 * k]) * W, float(p[3 + 2 * k]) * H] for k in range(4)])
        Ke = K.copy(); Ke[0, 0] *= 1 + focal_error; Ke[1, 1] *= 1 + focal_error    # a distância focal que o app conhece (EXIF), com erro
        ok, rv, tv = cv2.solvePnP(obj, pts, Ke, None, flags=cv2.SOLVEPNP_IPPE)
        if not ok: missed.append(round(ang)); continue
        est.append(values(cv2.Rodrigues(rv)[0], tv.ravel(), Ke, W, H, size))
        # A resposta certa: a cartela no mundo (x para a direita = +x, para baixo = -z, centro em (0, -0.2, 1))
        Rw = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float).T    # colunas: eixos da cartela no mundo (x, y para baixo, normal)
        Rw = np.stack([[1, 0, 0], [0, 0, -1], [0, 1, 0]], 1).astype(float)
        tru.append(values(R @ Rw, R @ (np.array([0, -0.20, 1.0]) - C), K, W, H, size)); angles.append(ang)
    if len(est) < 2: return {"ok": False, "found": len(est), "n": len(names), "missed_at_deg": missed}
    d = lambda k: np.array([e[k] for e in est]) - np.array([t[k] for t in tru])
    sc = np.array([e["dist"] for e in est]) / np.array([t["dist"] for t in tru]); sc /= np.median(sc)
    rot = d("rot"); rot = rot - rot.mean()
    return {"ok": True, "found": len(est), "n": len(names), "missed_at_deg": missed, "max_angle_found": round(max(angles)),
            "err_dx": round(float(np.abs(d("dx")).max()), 1), "err_dy": round(float(np.abs(d("dy")).max()), 1), "err_rot": round(float(np.abs(rot).max()), 2), "err_scale_pct": round(float(np.abs(sc - 1).max() * 100), 2)}

if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1])))
