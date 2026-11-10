"""Um Lightroom Classic de mentira para o teste automático do Stillpoint (tests/host).

Faz o papel do plugin, pelos mesmos arquivos da pasta da conversa (<dados do app>/lightroom):
  request.txt -> status.txt      (Edit in Lightroom Classic: a coleção com as fotos)
  alive.txt                      (a cada 0,3 s: catálogo, coleções e as fotos de cada uma)
  done-*.txt                     (Done editing / sessão apagada: a coleção sai)
  reset-*.txt / bringback-*.txt  (Delete edit e o ⌘Z dele: a foto volta ao original / a edição volta)
  remove-*.txt / readd-*.txt     (foto apagada / restaurada: sai / volta para a coleção)
E o que a pessoa faria dentro do Lightroom, chamado pelo teste: editar uma foto, Export to Stillpoint (inclusive
"edição tirada"), Remove from Collection, Edit › Undo de uma coleção tirada, Cancel editing.
O comportamento imita o do plugin de verdade (Bridge.lua, Actions.lua), conferido pelo teste do plugin no Lightroom.
"""
import os
import threading
import time

from PIL import Image


def read_pairs(path):
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    if "\nend=1" not in "\n" + text:
        return None
    out = {"_list": {}}
    for line in text.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k] = v
            out["_list"].setdefault(k, []).append(v)
    return out


def write_whole(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


class FakeLightroom:
    def __init__(self, bridge, catalog):
        self.bridge = bridge
        self.catalog = catalog
        self.collections = {}   # (projeto, título) -> lista de caminhos das fotos
        self.removed = []       # coleções tiradas (para o Edit › Undo)
        self.edit = {}          # caminho -> edição atual (None = original)
        self.saved = {}         # caminho -> edição guardada pelo Delete edit (para o ⌘Z)
        self.crops = {}         # caminho -> (esquerda, topo, direita, base) pedido pelo Stillpoint
        self.framing = {}       # título da coleção -> proporção pedida ("asshot" = sem recorte)
        self.log = []
        self.lock = threading.RLock()
        self.counter = 0
        self.running = True
        self.paused = False
        os.makedirs(bridge, exist_ok=True)
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    # ---------------- a volta do "plugin" ----------------

    def _loop(self):
        while self.running:
            if not self.paused:
                try:
                    with self.lock:
                        self.tick()
                except Exception as e:  # noqa: BLE001
                    self.note("tick problem: %r" % e)
            time.sleep(0.3)

    def note(self, text):
        self.log.append(time.strftime("%H:%M:%S ") + text)

    def write_alive(self):
        lines = ["time=%d" % int(time.time()), "catalog=" + self.catalog, "version=test", "collections=1"]
        for (project, title), photos in self.collections.items():
            lines.append("collection=%s\t%s" % (project, title))
            lines.append("members=%s\t%s\t%s" % (project, title, "|".join(os.path.basename(p) for p in photos)))
        write_whole(os.path.join(self.bridge, "alive.txt"), "\n".join(lines) + "\nend=1\n")

    def tick(self):
        self.write_alive()
        # Done editing / sessão apagada (como o plugin: tira a coleção, atualiza o alive, só então apaga o pedido)
        for name in sorted(os.listdir(self.bridge)):
            if name.startswith("done-") and name.endswith(".txt"):
                r = read_pairs(os.path.join(self.bridge, name))
                if r is None:
                    continue
                self.remove_collection(r.get("project", ""), r.get("title", ""), "done editing")
                self.write_alive()
                os.remove(os.path.join(self.bridge, name))
        # Pedidos em fila, na ordem em que foram feitos (<tipo>-<hora>-<número>.txt)
        queued = []
        for name in os.listdir(self.bridge):
            for kind in ("reset", "bringback", "remove", "readd"):
                if name.startswith(kind + "-") and name.endswith(".txt"):
                    parts = name[:-4].split("-")
                    try:
                        key = (int(parts[1]), int(parts[2]))
                    except (IndexError, ValueError):
                        key = (0, 0)
                    queued.append((key, kind, name))
        for _, kind, name in sorted(queued):
            path = os.path.join(self.bridge, name)
            r = read_pairs(path)
            if r is None:
                continue
            os.remove(path)
            photos = r["_list"].get("photo", [])
            key = (r.get("project", ""), r.get("title", ""))
            if kind == "reset":
                for p in photos:
                    if self.edit.get(p) is not None:  # já no original: não troca a guardada
                        self.saved[p] = self.edit[p]
                    self.edit[p] = None
                self.note("reset %s" % [os.path.basename(p) for p in photos])
            elif kind == "bringback":
                for p in photos:
                    if p in self.saved:
                        self.edit[p] = self.saved[p]
                self.note("bringback %s" % [os.path.basename(p) for p in photos])
            elif kind == "remove":
                if key in self.collections:
                    self.collections[key] = [p for p in self.collections[key] if p not in photos]
                self.note("remove %s" % [os.path.basename(p) for p in photos])
            elif kind == "readd":
                current = self.collections.setdefault(key, [])
                for p in photos:
                    if p not in current:
                        current.append(p)
                current.sort(key=os.path.basename)
                self.note("readd %s" % [os.path.basename(p) for p in photos])
            self.write_alive()
        # Edit in Lightroom Classic
        req_path = os.path.join(self.bridge, "request.txt")
        r = read_pairs(req_path)
        if r is not None:
            os.remove(req_path)
            key = (r.get("project", ""), r.get("title", ""))
            photos = r["_list"].get("photo", [])
            current = self.collections.setdefault(key, [])
            for p in photos:
                if p not in current:
                    current.append(p)
                self.edit.setdefault(p, None)
            current.sort(key=os.path.basename)
            if "framing" in r:
                self.framing[key[1]] = r["framing"]
                for p in photos:
                    self.crops[p] = (0.0, 0.0, 1.0, 1.0)
                for line in r["_list"].get("crop", []):
                    parts = line.split("\t")
                    if len(parts) in (5, 8):  # com giro: mais o ângulo e o tamanho da foto
                        self.crops[parts[0]] = tuple(float(x) for x in parts[1:])
            self.write_alive()
            write_whole(os.path.join(self.bridge, "status.txt"),
                        "id=%s\nstate=done\nadded=%d\nmissing=0\ncatalog=%s\nend=1\n" % (r.get("id", ""), len(photos), self.catalog))
            self.note("edit request %s: %d photos" % (r.get("id"), len(photos)))

    def remove_collection(self, project, title, why):
        key = (project, title)
        if key in self.collections:
            self.removed.append((key, list(self.collections[key])))
            del self.collections[key]
            self.note("collection %r removed (%s)" % (title, why))

    def message(self, prefix, lines):
        self.counter += 1
        name = "%s-%d-%04d.txt" % (prefix, int(time.time()), self.counter)
        write_whole(os.path.join(self.bridge, name), "\n".join(lines) + "\nend=1\n")

    # ---------------- o que a pessoa faz no Lightroom ----------------

    def set_edit(self, path, value):
        with self.lock:
            self.edit[path] = value

    def shape(self, crop):
        """Largura e altura (em pixels da foto) do recorte: (esq, topo, dir, base, ângulo, largura, altura)."""
        import math
        l, t, r, b, angle, w, h = crop
        rad = math.radians(angle)
        dx, dy = (r - l) * w, (b - t) * h
        return abs(dx * math.cos(rad) - dy * math.sin(rad)), abs(dx * math.sin(rad) + dy * math.cos(rad))

    def export(self, session_dir, root, session, crops=None):
        """Export to Stillpoint (o painel): a sessão inteira; só as fotos com edição vão; as sem edição que têm
        editada no Stillpoint mandam tirá-la (cleared=); complete=1. crops: {foto: (esq, topo, dir, base, ângulo)}
        = o recorte que a pessoa ajustou no Lightroom (vai no recado; a editada sai com a forma dele). Sem isso, a
        editada sai com a forma do recorte que o Stillpoint mandou."""
        crops = crops or {}
        with self.lock:
            edited_dir = os.path.join(root, "Edited", session)
            os.makedirs(edited_dir, exist_ok=True)
            files, cleared = [], []
            photos = sorted(p for p in self.edit if os.path.dirname(p) == session_dir)
            for p in photos:
                base = os.path.splitext(os.path.basename(p))[0]
                target = os.path.join(edited_dir, base + ".jpg")
                if self.edit.get(p) is not None:
                    color = self.edit[p]
                    size = (120, 80)
                    sent = self.crops.get(p) or ()
                    if len(sent) == 7:
                        now = tuple(crops[p]) + tuple(sent[5:]) if p in crops else sent
                        cw, ch = self.shape(now)
                        if cw > 0 and ch > 0:
                            size = (max(1, round(cw / 4)), max(1, round(ch / 4)))
                    Image.new("RGB", size, color).save(target, quality=85)
                    files.append(os.path.basename(target))
                elif os.path.exists(target):
                    cleared.append(os.path.basename(p))
            lines = ["session=" + session, "project=" + root, "count=%d" % len(files), "failed=0", "color=AdobeRGB", "complete=1"]
            lines += ["file=" + f for f in files]
            lines += ["crop=%s\t%.7f\t%.7f\t%.7f\t%.7f\t%.5f" % ((os.path.basename(p),) + tuple(crops[p])) for p in photos if p in crops and self.edit.get(p) is not None]
            lines += ["cleared=" + c for c in cleared]
            self.message("exported", lines)
            self.note("export %s: %d files, cleared %s" % (session, len(files), cleared))
            return files, cleared

    def remove_from_collection(self, project, title, names):
        with self.lock:
            key = (project, title)
            self.collections[key] = [p for p in self.collections.get(key, []) if os.path.basename(p) not in names]
            self.write_alive()

    def undo_collection_removal(self):
        with self.lock:
            if not self.removed:
                return False
            key, photos = self.removed.pop()
            self.collections[key] = photos
            self.write_alive()
            self.note("Edit › Undo: collection %r back" % (key[1],))
            return True

    def undo_remove_from_collection(self, project, title, paths):
        with self.lock:
            current = self.collections.setdefault((project, title), [])
            for p in paths:
                if p not in current:
                    current.append(p)
            current.sort(key=os.path.basename)
            self.write_alive()

    def cancel_editing(self, project, title, session, root, discard_to=None):
        with self.lock:
            if discard_to:
                for p, value in discard_to.items():
                    self.edit[p] = value
            self.remove_collection(project, title, "cancel editing")
            self.write_alive()
            self.message("cancelled", ["session=" + session, "project=" + root, "discarded=%d" % len(discard_to or {}),
                                       "time=%d" % int(time.time())])

    def stop(self):
        self.running = False
