import numpy as np, cv2, json, os, pycolmap, solve
from PIL import Image
folder = "m0"; truth = json.load(open(folder + "/truth.json")); W, H = truth["W"], truth["H"]
rec = pycolmap.Reconstruction(folder + "/_colmap/sparse/0")
est = {}
for im in rec.images.values():
    T = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
    R = np.array(T.rotation.matrix()); t = np.array(T.translation); est[im.name] = (R, -R.T @ t)
f = list(rec.cameras.values())[0].params[0]; K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
names = sorted(est); _, _, rc = solve.recipe([est[n] for n in names], K, W, H)
mean_rot = np.mean([r["rot"] for r in rc]); frames = []; resid = []
for n, r in zip(names, rc):
    img = cv2.imread(os.path.join(folder, n))
    # mover o ponto central para o meio, depois girar e mudar o tamanho em torno do meio (o que o Align photos faz)
    rot = -(r["rot"] - mean_rot)  # (o OpenCV gira no sentido contrário)
    M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, r["scale"]); M[:, 2] += M[:, :2] @ np.array([r["dx"], r["dy"]])
    al = cv2.warpAffine(img, M, (W, H))
    for im_, lab in ((img, "BEFORE"), (al, "AFTER")):
        cv2.line(im_, (W // 2, 0), (W // 2, H), (255, 255, 255), 1); cv2.line(im_, (0, H // 2), (W, H // 2), (255, 255, 255), 1)
        cv2.putText(im_, lab + "  " + n[:2], (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3)
    both = np.hstack([cv2.resize(img, (600, 400)), np.full((400, 8, 3), 0, np.uint8), cv2.resize(al, (600, 400))])
    frames.append(Image.fromarray(cv2.cvtColor(both, cv2.COLOR_BGR2RGB)))
seq = frames + frames[-2:0:-1]
seq[0].save("antes-depois.gif", save_all=True, append_images=seq[1:], duration=140, loop=0)
cv2.imwrite("antes-depois-05.jpg", cv2.cvtColor(np.array(frames[4]), cv2.COLOR_RGB2BGR))
print(os.path.getsize("antes-depois.gif"))
