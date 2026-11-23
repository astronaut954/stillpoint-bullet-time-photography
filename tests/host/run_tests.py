"""Teste automático do Stillpoint no Linux: o app de verdade (StillpointHost, sem janela), a página de verdade num
Chromium sem tela, câmeras simuladas e um Lightroom de mentira (fake_lightroom.py) pelos arquivos do plugin.
Confere o que o Stillpoint faz com o que vem do Lightroom: etiquetas In Lightroom e Edited n / m, selos LR, lixeira,
⌘Z / ⌘⇧Z (inclusive rápidos), restaurar, Cancel editing, edição tirada.

    cmake -S tests/host -B build/host-test -DCMAKE_BUILD_TYPE=Release && cmake --build build/host-test -j
    python3 tests/host/run_tests.py [nome-do-cenário ...]

Relatório em build/host-test/report.txt (e capturas de tela de cada falha ao lado).
"""
from PIL import Image
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "build", "host-test")
sys.path.insert(0, HERE)
from fake_lightroom import FakeLightroom  # noqa: E402

PORT = 8765 + (os.getpid() % 200)
PROJECT = "TestProject"

report, passed, failed = [], 0, 0


def line(text):
    report.append(text)
    print(text, flush=True)


class T:
    """Tudo de uma rodada: pastas, o app, o Lightroom de mentira e a página."""

    def __init__(self, pw):
        self.tmp = tempfile.mkdtemp(prefix="stillpoint-host-")
        self.home = os.path.join(self.tmp, "home")
        self.data = os.path.join(self.tmp, "data")
        self.project = os.path.join(self.tmp, "Projects", PROJECT)
        os.makedirs(self.home)
        os.makedirs(self.data)
        for sub in ("Originals", "Edited", "Exports"):
            os.makedirs(os.path.join(self.project, sub))
        with open(os.path.join(self.project, "stillpoint-project.json"), "w") as f:
            json.dump({"stillpoint": "project", "version": 1, "name": PROJECT, "created": "2026-11-06T00:00:00", "sessions": []}, f)
        self.catalog = os.path.join(self.project, "Lightroom", PROJECT, PROJECT + ".lrcat")
        os.makedirs(os.path.dirname(self.catalog))
        open(self.catalog, "w").close()
        lr_app = os.path.join(self.tmp, "Adobe Lightroom Classic.app")
        os.makedirs(lr_app)
        self.ps_app = os.path.join(self.tmp, "Adobe Photoshop 2026.app")   # (o Photoshop de mentira: só precisa existir)
        os.makedirs(self.ps_app)
        with open(os.path.join(self.data, "settings.txt"), "w") as f:
            f.write("project=%s\nlightroomPath=%s\nphotoshopPath=%s\npref.splash=off\n" % (self.project, lr_app, self.ps_app))
        env = dict(os.environ, HOME=self.home, STILLPOINT_DATA=self.data, STILLPOINT_RESOURCES=ROOT,
                   STILLPOINT_FAKE_CAMERAS="4", STILLPOINT_TEST_PORT=str(PORT), STILLPOINT_TEST_LR_RUNNING="1",
                   STILLPOINT_TEST_CAMERAS=os.path.join(self.tmp, "cameras-changed.txt"))
        self.app_log = open(os.path.join(self.tmp, "app-stderr.txt"), "w")
        self.env = env
        self.app = subprocess.Popen([os.path.join(BUILD, "StillpointHost")], env=env, stdout=self.app_log, stderr=self.app_log)
        self.lr = FakeLightroom(os.path.join(self.data, "lightroom"), self.catalog)
        self.browser = pw.chromium.launch()
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 900})
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        for _ in range(100):
            try:
                self.page.goto("http://127.0.0.1:%d/" % PORT)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)
        self.page.wait_for_selector("#shootBtn", timeout=15000)
        time.sleep(1.5)

    def restart_app(self):
        """Fecha o Stillpoint e abre de novo, com os mesmos dados (o que ficou gravado é o que volta)."""
        self.app.kill()
        self.app.wait()
        time.sleep(0.5)
        self.app = subprocess.Popen([os.path.join(BUILD, "StillpointHost")], env=self.env, stdout=self.app_log, stderr=self.app_log)
        for _ in range(100):
            try:
                self.page.goto("http://127.0.0.1:%d/" % PORT)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)
        self.page.wait_for_selector("#shootBtn", timeout=15000)
        time.sleep(1.5)

    def close(self):
        try:
            self.browser.close()
        finally:
            self.lr.stop()
            self.app.kill()
            self.app.wait()

    # ---------------- o que o app tem ----------------

    def js(self, expr, *args):
        return self.page.evaluate(expr, *args)

    def sessions(self):
        return self.js("() => window.listSessions()") or []

    def session(self, name):
        return next((s for s in self.sessions() if s["name"] == name), None)

    def editing(self):
        return (self.js("() => window.adobeEditing()") or {}).get("sessions", {})

    def trash(self):
        return (self.js("() => window.trashList()") or {}).get("items", [])

    def edit_tag(self, name):
        """A etiqueta In Lightroom da sessão na lista (o que a pessoa vê)."""
        return self.js("(n) => !!document.querySelector('#sessionList li.folder[data-name=\"' + n + '\"] .edit-tag')", name)

    def project_tag(self, name):
        return self.js("(n) => { const t = document.querySelector('#sessionList li.folder[data-name=\"' + n + '\"] .project-tag'); return t ? t.textContent : null; }", name)

    def badges(self):
        """Fotos com o selo LR na fileira de miniaturas (sessão aberta)."""
        return self.js("() => [...document.querySelectorAll('#sessionGallery .carousel > li')].map((li, i) => !!li.querySelector('.frame-app'))")

    def wait(self, cond, timeout=12, step=0.3):
        end = time.time() + timeout
        last = None
        while time.time() < end:
            try:
                last = cond()
                if last:
                    return last
            except Exception as e:  # noqa: BLE001
                last = e
            time.sleep(step)
        return last if not last else False

    # ---------------- o que a pessoa faz no Stillpoint ----------------

    def dialog_title(self):
        return self.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden') && document.getElementById('dialogTitle').textContent")

    def dialog_click(self, starts):
        return self.js("(t) => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => x.textContent.trim().startsWith(t)); if (!b) return false; b.click(); return true; }", starts)

    def shoot(self, keep_as_shot=True):
        """Fotografa com as câmeras simuladas. O aviso Mixed ratios (só no primeiro disparo de cada combinação de
        câmeras) é respondido com Keep as shot (padrão) ou com o recorte sugerido."""
        before = {s["name"] for s in self.sessions()}
        self.js("() => { const d = document.getElementById('downloadWait'); if (d) { d.value = '1'; d.dispatchEvent(new Event('input')); d.dispatchEvent(new Event('change')); } }")
        self.wait(lambda: self.js("() => !document.getElementById('shootBtn').disabled"), 20)
        self.page.click("#shootBtn")
        new = self.wait(lambda: [s["name"] for s in self.sessions() if s["name"] not in before and len(s["photos"]) >= 4], 40)
        if self.wait(lambda: self.dialog_title() == "Mixed ratios", 4):
            if keep_as_shot:
                self.dialog_click("Keep as shot")
            else:
                self.js("() => { const b = document.querySelector('#dialogActions button.btn-primary'); b && b.click(); }")
            time.sleep(0.4)
        self.dismiss()
        return new[0] if new else None

    def dismiss(self):
        """Fecha avisos que aparecem sozinhos (Mixed ratios etc.)."""
        for _ in range(3):
            if self.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden')"):
                self.js("() => { const b = document.querySelector('#dialogActions button.btn-primary') || document.querySelector('#dialogActions button'); b && b.click(); }")
                time.sleep(0.3)

    def open_session(self, name):
        self.dismiss()
        # Na data: no meio da linha pode estar a etiqueta In Lightroom, que abre o Export › Edit
        self.page.click('#sessionList li.folder[data-name="%s"] .folder-date' % name)
        time.sleep(0.8)

    def session_menu(self, name, item):
        self.dismiss()
        self.page.click('#sessionList li.folder[data-name="%s"] .folder-date' % name, button="right")
        time.sleep(0.3)
        self.menu(item)

    def photo_menu(self, index, item):
        self.page.click("#sessionGallery .carousel > li:nth-child(%d)" % (index + 1), button="right")
        time.sleep(0.3)
        self.menu(item)

    def menu(self, item):
        ok = self.js("(t) => { const b = [...document.querySelectorAll('.app-menu button')].find(x => x.textContent.trim().startsWith(t)); if (!b) return false; b.click(); return true; }", item)
        if not ok:
            raise RuntimeError("menu item not found: " + item)
        time.sleep(0.4)

    def button(self, text):
        ok = self.js("(t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t && x.offsetParent); if (!b) return false; b.click(); return true; }", text)
        if not ok:
            raise RuntimeError("button not found: " + text)
        time.sleep(0.4)

    def undo(self):
        self.page.keyboard.press("Control+z")
        time.sleep(0.15)

    def redo(self):
        self.page.keyboard.press("Control+Shift+z")
        time.sleep(0.15)

    # ---- Export › 2 Edit (a edição no Lightroom fica no Export desde 2026-11-07; a janela principal só mostra) ----
    def export_open(self):
        return self.js("() => !document.getElementById('exportOverlay').classList.contains('hidden')")

    def export_step(self):
        return self.js("() => { const b = document.querySelector('#exportSteps .export-step.on'); return b ? b.textContent.trim() : null; }")

    def export_edit(self, name):
        """Abre o Export (Export sessions, na barra de cima) e vai ao passo 2 · Edit da sessão."""
        self.dismiss()
        if not self.export_open():
            self.page.click("#saveBtn")
            self.wait(lambda: self.export_open(), 5)
            time.sleep(0.6)
        if self.export_step() == "1 Sessions":
            self.js("() => document.getElementById('exportConfirm').click()")
            self.wait(lambda: self.export_step() == "2 Edit", 5)
        self.page.click('#exportList li.export-item[data-name="%s"]' % name)
        time.sleep(0.5)

    def close_export(self):
        for _ in range(3):
            if not self.export_open():
                return True
            self.dismiss_other()
            self.js("() => document.getElementById('exportCancel').click()")
            if self.wait(lambda: self.dialog_title() == "Leave Export sessions?", 3):
                self.dialog_click("Leave")
            if self.wait(lambda: not self.export_open(), 3):
                time.sleep(0.3)
                return True
        line("      (could not close Export: dialog %r)" % self.dialog_title())
        return False

    def dismiss_other(self):
        t = self.dialog_title()
        if t and t != "Leave Export sessions?":
            line("      (closing a dialog: %r)" % t)
            self.dismiss()

    def lr_block_button(self, starts):
        return self.js("(t) => { const b = [...document.querySelectorAll('#exportSettings .lr-block button')].find(x => x.textContent.trim().startsWith(t)); if (!b) return false; b.click(); return true; }", starts)

    def strip_menu(self, index, item):
        """Botão direito numa miniatura da fileira do Export › Edit."""
        self.page.click("#exportSettings .export-strip > li:nth-child(%d)" % (index + 1), button="right")
        time.sleep(0.3)
        self.menu(item)

    def edit_in_lightroom(self, name, crop_answer="Send as shot", keep_open=False):
        self.export_edit(name)
        self.lr_block_button("Edit")
        if self.wait(lambda: self.dialog_title() == "Crop before Lightroom Classic?", 2):
            self.dialog_click(crop_answer)
        ok = self.wait(lambda: self.edit_tag(name), 15)
        if not keep_open:
            self.close_export()
        return ok

    def delete_edit(self, name, index):
        """Revert to original… de uma foto: botão direito na miniatura do Export › Edit, confirma e fecha o Export."""
        self.export_edit(name)
        self.strip_menu(index, "Revert to original")
        self.button("Revert to original")
        self.close_export()

    def open_trash(self):
        self.page.click("#trashBtn")
        self.page.wait_for_selector("#trashOverlay:not(.hidden)", timeout=5000)
        time.sleep(0.6)

    def close_trash(self):
        self.js("() => { const o = document.getElementById('trashOverlay'); const b = o && [...o.querySelectorAll('button')].find(x => x.textContent.trim() === 'Close'); b && b.click(); }")
        time.sleep(0.4)

    def restore_in_trash(self, match=None, item_id=None):
        """Restore na linha da lixeira: a do item item_id, ou a primeira cujo texto tem match."""
        ok = self.js("([m, id]) => { const li = [...document.querySelectorAll('#trashOverlay li.trash-row')].find(x => id ? x.dataset.id === id : x.textContent.includes(m)); if (!li) return false; const b = [...li.querySelectorAll('button')].find(x => x.textContent.trim() === 'Restore'); if (!b) return false; b.click(); return true; }", [match, item_id])
        time.sleep(0.6)
        self.dismiss_restore_all()
        return ok

    def dismiss_restore_all(self):
        if self.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden')"):
            self.js("() => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => x.textContent.trim() === 'Restore all') || document.querySelector('#dialogActions button.btn-primary'); b && b.click(); }")
            time.sleep(0.6)

    # ---------------- o que o Lightroom tem ----------------

    def originals(self, name):
        return os.path.join(self.project, "Originals", name)

    def lr_collection(self, name):
        title = self.lr_title(name)
        for (project, t), photos in self.lr.collections.items():
            if t == title:
                return [os.path.basename(p) for p in photos]
        return None

    def lr_title(self, name):
        return self.js("(n) => { const s = (window.__lastSessions || []).find(x => x.name === n); return null; }", name) or self._title(name)

    def _title(self, name):
        # O título que o Stillpoint deu à coleção (está no pedido que o Lightroom recebeu)
        for (project, t) in list(self.lr.collections.keys()) + [k for k, _ in self.lr.removed]:
            return t
        return None

    def shot(self, label):
        path = os.path.join(BUILD, "fail-%s.png" % "".join(c if c.isalnum() else "-" for c in label)[:60])
        try:
            self.page.screenshot(path=path)
        except Exception:  # noqa: BLE001
            pass
        return path


def check(t, name, ok, detail=None):
    global passed, failed
    if ok:
        passed += 1
        line("PASS  " + name)
    else:
        failed += 1
        line("FAIL  " + name + ("   [%s]" % (detail,) if detail is not None else ""))
        line("      screenshot: " + t.shot(name))
    return ok


def photo_state(t, name):
    """Por foto: tem editada no Stillpoint? tem edição no Lightroom?"""
    s = t.session(name)
    out = []
    for p in sorted(s["photos"], key=lambda x: x["order"]):
        path = os.path.join(t.originals(name), p["file"])
        out.append((p["file"], bool(p["edited"]), t.lr.edit.get(path) is not None))
    return out


# =================== cenários ===================

def scenario_open_and_export(t):
    line("\n== 1. Edit in Lightroom Classic, then Export to Stillpoint from Lightroom")
    name = t.shoot()
    check(t, "a session was shot with the 4 simulated cameras", name is not None)
    if not name:
        return None
    t.open_session(name)
    check(t, "Edit in Lightroom Classic: the session shows In Lightroom", t.edit_in_lightroom(name))
    col = t.wait(lambda: t.lr_collection(name))
    check(t, "Lightroom has the collection with the 4 photos", col and len(col) == 4, col)
    check(t, "the 4 thumbnails show the LR badge", t.wait(lambda: all(t.badges()) and len(t.badges()) == 4), t.badges())
    # Edita 01 e 02 no Lightroom e exporta a sessão inteira
    o = t.originals(name)
    files = sorted(os.listdir(o))
    photos = [os.path.join(o, f) for f in files if not f.startswith(".") and f != "session.json"]
    t.lr.set_edit(photos[0], (200, 40, 40))
    t.lr.set_edit(photos[1], (40, 200, 40))
    t.lr.export(o, t.project, name)
    check(t, "after the export: Edited 2 / 4", t.wait(lambda: t.project_tag(name) == "Edited 2 / 4"), t.project_tag(name))
    check(t, "the whole session was looked at: it leaves Lightroom (no In Lightroom)", t.wait(lambda: not t.edit_tag(name)))
    check(t, "and the collection leaves Lightroom", t.wait(lambda: t.lr_collection(name) is None), t.lr_collection(name))
    return name, photos


def scenario_cleared(t, name, photos):
    line("\n== 2. An edit taken off in Lightroom and exported leaves Stillpoint")
    check(t, "Edit in Lightroom Classic again", t.edit_in_lightroom(name))
    t.lr.set_edit(photos[1], None)
    t.lr.export(t.originals(name), t.project, name)
    check(t, "Edited 1 / 4", t.wait(lambda: t.project_tag(name) == "Edited 1 / 4"), t.project_tag(name))
    check(t, "the edit of photo 02 is in the trash", t.wait(lambda: any(i.get("editsOnly") and i["session"] == name for i in t.trash())))


def scenario_delete_edit_undo(t, name, photos):
    line("\n== 3. Delete edit, ⌘Z and ⌘⇧Z (also quickly)")
    t.open_session(name)
    t.delete_edit(name, 0)
    check(t, "Delete edit: Edited tag gone (no edited photo)", t.wait(lambda: t.session(name)["edited"] == 0), t.session(name)["edited"])
    check(t, "Delete edit: photo 01 back to the original in Lightroom", t.wait(lambda: t.lr.edit.get(photos[0]) is None))
    t.undo()
    check(t, "⌘Z: the edit is back in Stillpoint", t.wait(lambda: t.session(name)["edited"] == 1))
    check(t, "⌘Z: the edit is back in Lightroom", t.wait(lambda: t.lr.edit.get(photos[0]) is not None))
    check(t, "⌘Z: the session does not go back to Lightroom (no In Lightroom)", not t.wait(lambda: t.edit_tag(name), 4))
    check(t, "⌘Z: no collection in Lightroom", t.lr_collection(name) is None, t.lr_collection(name))
    for _ in range(4):
        t.redo()
        t.undo()
    t.redo()
    time.sleep(6)
    st = photo_state(t, name)
    check(t, "⌘⇧Z/⌘Z quickly, ending on ⌘⇧Z: no edit in Stillpoint", not st[0][1], st)
    check(t, "... and no edit in Lightroom (both the same)", st[0][1] == st[0][2], st)
    t.undo()
    time.sleep(6)
    st = photo_state(t, name)
    check(t, "one more ⌘Z: the edit in both", st[0][1] and st[0][2], st)
    check(t, "no In Lightroom after all that", not t.edit_tag(name))
    check(t, "no collection in Lightroom after all that", t.lr_collection(name) is None, t.lr_collection(name))


def scenario_photo_delete_restore(t, name, photos):
    line("\n== 4. Delete photo / restore while in Lightroom")
    check(t, "Edit in Lightroom Classic again", t.edit_in_lightroom(name))
    t.open_session(name)
    t.photo_menu(2, "Delete photo 03")
    t.button("Delete")
    check(t, "photo 03 leaves the Lightroom collection", t.wait(lambda: t.lr_collection(name) is not None and len(t.lr_collection(name)) == 3), t.lr_collection(name))
    t.undo()
    check(t, "⌘Z: photo 03 back in the collection", t.wait(lambda: t.lr_collection(name) is not None and len(t.lr_collection(name)) == 4), t.lr_collection(name))
    t.photo_menu(2, "Delete photo 03")
    t.button("Delete")
    t.wait(lambda: len(t.lr_collection(name) or []) == 3)
    t.open_trash()
    t.restore_in_trash("Photo 03")
    t.close_trash()
    check(t, "Restore in the trash: photo 03 back in the collection", t.wait(lambda: len(t.lr_collection(name) or []) == 4), t.lr_collection(name))
    check(t, "the 4 thumbnails show the LR badge", t.wait(lambda: len(t.badges()) == 4 and all(t.badges())), t.badges())


def scenario_remove_from_collection(t, name, photos):
    line("\n== 5. Remove from Collection inside Lightroom")
    title = t._title(name)
    t.lr.remove_from_collection(PROJECT, title, [os.path.basename(photos[1])])
    check(t, "photo 02 loses the LR badge", t.wait(lambda: t.badges()[1] is False), t.badges())
    t.lr.undo_remove_from_collection(PROJECT, title, [photos[1]])
    check(t, "Edit › Undo in Lightroom: the badge is back", t.wait(lambda: t.badges()[1] is True), t.badges())
    t.lr.remove_from_collection(PROJECT, title, [os.path.basename(p) for p in photos])
    check(t, "all photos removed from the collection: no In Lightroom", t.wait(lambda: not t.edit_tag(name)))
    t.lr.undo_remove_from_collection(PROJECT, title, photos)
    check(t, "Edit › Undo in Lightroom: In Lightroom again", t.wait(lambda: t.edit_tag(name)))


def scenario_delete_session(t, name, photos):
    line("\n== 6. Session deleted in Stillpoint while in Lightroom")
    t.session_menu(name, "Delete session")
    t.dismiss_delete()
    check(t, "the session is in the trash", t.wait(lambda: t.session(name) is None))
    check(t, "its collection leaves Lightroom", t.wait(lambda: t.lr_collection(name) is None), t.lr_collection(name))
    t.open_trash()
    item = next((i for i in t.trash() if i["session"] == name and i.get("whole") and not i.get("restored") and not i.get("isProject")), None)
    check(t, "the trash lists the whole session", item is not None, [(i["session"], i.get("whole")) for i in t.trash()])
    check(t, "its Restore button is clicked", item is not None and t.restore_in_trash(item_id=item["id"]))
    t.close_trash()
    check(t, "Restore in the trash: the session is back", t.wait(lambda: t.session(name) is not None))
    check(t, "... without In Lightroom (only an action in Lightroom puts it back there)", not t.wait(lambda: t.edit_tag(name), 5))
    check(t, "... and Lightroom has no collection", t.lr_collection(name) is None, t.lr_collection(name))
    check(t, "Edit in Lightroom Classic again", t.edit_in_lightroom(name))
    t.session_menu(name, "Delete session")
    t.dismiss_delete()
    t.wait(lambda: t.lr_collection(name) is None)
    t.lr.undo_collection_removal()
    check(t, "Edit › Undo in Lightroom: the session comes back from the trash", t.wait(lambda: t.session(name) is not None, 15))
    check(t, "... with In Lightroom", t.wait(lambda: t.edit_tag(name)))


def scenario_cancel(t, name, photos):
    line("\n== 7. Cancel editing in the Lightroom panel")
    if not t.edit_tag(name):
        t.edit_in_lightroom(name)
    other = next((s["name"] for s in t.sessions() if s["name"] != name), None) or t.shoot()
    if other:
        t.open_session(other)
    if not t.edit_tag(name):
        t.edit_in_lightroom(name)
    t.lr.cancel_editing(PROJECT, t._title(name), name, t.project)
    check(t, "Cancel editing: no In Lightroom", t.wait(lambda: not t.edit_tag(name)))
    check(t, "the toast says Editing cancelled", t.wait(lambda: "Editing cancelled" in (t.js("() => document.body.innerText") or "")))
    check(t, "Stillpoint shows the session (comes to the front with it)", t.wait(lambda: t.js("(n) => !!document.querySelector('#sessionList li.folder.active[data-name=\"' + n + '\"]')", name)))


def scenario_rapid_in_lightroom(t, name, photos):
    line("\n== 8. ⌘Z / ⌘⇧Z quickly while the session is in Lightroom")
    if not t.edit_tag(name):
        check(t, "Edit in Lightroom Classic again", t.edit_in_lightroom(name))
    t.open_session(name)
    # Delete edit da 01 e desfazer/refazer rápido: a coleção e o In Lightroom ficam
    if t.session(name)["photos"][0]["edited"]:
        t.delete_edit(name, 0)
        for _ in range(3):
            t.undo()
            t.redo()
        t.undo()
        time.sleep(6)
        st = photo_state(t, name)
        check(t, "Delete edit + quick ⌘Z/⌘⇧Z, ending on ⌘Z: the edit in both programs", st[0][1] and st[0][2], st)
        check(t, "... still In Lightroom", t.edit_tag(name))
        check(t, "... the collection still has the 4 photos", len(t.lr_collection(name) or []) == 4, t.lr_collection(name))
    # Apagar a foto 04 e desfazer/refazer rápido
    t.photo_menu(3, "Delete photo 04")
    t.button("Delete")
    for _ in range(3):
        t.undo()
        t.redo()
    t.undo()
    time.sleep(6)
    here = [p["file"] for p in t.session(name)["photos"]]
    col = t.lr_collection(name) or []
    check(t, "Delete photo + quick ⌘Z/⌘⇧Z, ending on ⌘Z: 4 photos in Stillpoint", len(here) == 4, here)
    check(t, "... and the same 4 in the Lightroom collection", sorted(here) == sorted(col), (here, col))
    check(t, "... every thumbnail with the LR badge", t.wait(lambda: len(t.badges()) == 4 and all(t.badges())), t.badges())
    # Apagar a sessão e desfazer/refazer rápido, terminando com ela de volta
    t.session_menu(name, "Delete session")
    t.dismiss_delete()
    for _ in range(3):
        t.undo()
        t.redo()
    t.undo()
    time.sleep(7)
    check(t, "Delete session + quick ⌘Z/⌘⇧Z, ending on ⌘Z: the session is here", t.session(name) is not None)
    tag, col = t.edit_tag(name), t.lr_collection(name)
    check(t, "... In Lightroom only if Lightroom has the collection (they agree)", bool(tag) == (col is not None), (tag, col))


def scenario_crop_before_lightroom(t, name, photos):
    line("\n== 9. Mixed ratios kept as shot: Stillpoint asks to crop before Lightroom")
    s1 = t.shoot()
    check(t, "a new session, Keep as shot", s1 is not None and not (t.session(s1) or {}).get("crop"), t.session(s1) and t.session(s1).get("crop"))
    if not s1:
        return
    t.export_edit(s1)
    t.lr_block_button("Edit")
    title = t.wait(lambda: t.dialog_title(), 6)
    check(t, "it asks \"Crop before Lightroom Classic?\"", title == "Crop before Lightroom Classic?", title)
    t.js("() => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => x.textContent.trim().startsWith('Crop to 3:2')); b && b.click(); }")
    check(t, "Crop to 3:2: the session goes to Lightroom", t.wait(lambda: t.edit_tag(s1), 15))
    t.close_export()
    check(t, "the session keeps the crop for Export (3:2)", str((t.session(s1) or {}).get("crop", "")).startswith("3:2"), (t.session(s1) or {}).get("crop"))
    o = t.originals(s1)
    sizes = {}
    from PIL import Image
    for p in sorted(os.listdir(o)):
        if p.startswith(".") or p == "session.json":
            continue
        with Image.open(os.path.join(o, p)) as im:
            sizes[os.path.join(o, p)] = im.size
    ok, details = True, []
    for path, (w, h) in sizes.items():
        c = t.lr.crops.get(path)
        if c is None:
            ok = False
            details.append(os.path.basename(path) + ": no crop sent")
            continue
        cw, ch = (c[2] - c[0]) * w, (c[3] - c[1]) * h
        if abs(cw / ch - 1.5) > 0.01:
            ok = False
        details.append("%s %dx%d -> %.0fx%.0f" % (os.path.basename(path)[:2], w, h, cw, ch))
    check(t, "Lightroom gets a 3:2 crop for every photo (the 16:9 ones cut at the sides)", ok, "; ".join(details))
    s2 = t.shoot()
    t.export_edit(s2)
    t.lr_block_button("Edit")
    t.wait(lambda: t.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden')"), 6)
    t.js("() => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => x.textContent.trim() === 'Send as shot'); b && b.click(); }")
    check(t, "Send as shot: the session goes to Lightroom", t.wait(lambda: t.edit_tag(s2), 15))
    t.close_export()
    o2 = t.originals(s2)
    crops2 = [c for p, c in t.lr.crops.items() if os.path.dirname(p) == o2]
    check(t, "... with no crop", crops2 and all(c == (0.0, 0.0, 1.0, 1.0) for c in crops2), crops2)
    check(t, "... and the session still without a crop", not (t.session(s2) or {}).get("crop"), (t.session(s2) or {}).get("crop"))


def scenario_export_edit(t, name, photos):
    line("\n== 10. The editing lives in Export › 2 Edit; the main window only shows")
    s = t.shoot()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.dismiss()
    t.page.click('#sessionList li.folder[data-name="%s"] .folder-date' % s, button="right")
    time.sleep(0.3)
    items = t.js("() => [...document.querySelectorAll('.app-menu button')].map(b => b.textContent.trim())")
    t.page.keyboard.press("Escape")
    check(t, "session menu: no Edit in Lightroom Classic / Done editing / Delete edits", items and not any(("Lightroom" in i) or i.startswith("Done editing") or i.startswith("Delete edits") for i in items), items)
    t.open_session(s)
    t.page.click("#sessionGallery .carousel > li:nth-child(1)", button="right")
    time.sleep(0.3)
    items = t.js("() => [...document.querySelectorAll('.app-menu button')].map(b => b.textContent.trim())")
    t.page.keyboard.press("Escape")
    check(t, "photo menu: no Lightroom item", items and not any("Lightroom" in i or i.startswith("Delete edit") for i in items), items)
    check(t, "no Edit in Lightroom Classic button over the large photo", not t.js("() => [...document.querySelectorAll('#sessionGallery button')].some(b => b.textContent.includes('Lightroom'))"))
    # Pelo Export: passos e o bloco do Lightroom
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    steps = t.js("() => [...document.querySelectorAll('#exportSteps .export-step')].map(b => b.textContent.trim().replace(' ✓', ''))")
    check(t, "Export has 4 steps: Sessions, Edit, Outputs, Review", steps == ["1 Sessions", "2 Edit", "3 Outputs", "4 Review"], steps)
    # Framing 1:1 no passo 1 (o recorte vai para as miniaturas, a prévia e o Lightroom)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s)
    time.sleep(0.4)
    t.js("() => [...document.querySelectorAll('#exportSettings .segmented button')].find(b => b.textContent === '1:1').click()")
    time.sleep(0.6)
    t.export_edit(s)
    check(t, "step 1's green button was Edit → and now step 2 · Edit is open", t.export_step() == "2 Edit", t.export_step())
    check(t, "the footer buttons: ← Sessions and Outputs →", t.js("() => document.getElementById('exportBack').textContent === '← Sessions' && document.getElementById('exportConfirm').textContent === 'Outputs →'"))
    check(t, "Lightroom Classic box: Edit in Lightroom Classic, with no Not edited text", t.js("() => { const b = document.querySelector('#exportSettings .app-pair').parentElement; return !!b && !b.textContent.includes('Not edited') && b.textContent.includes('Edit in Lightroom Classic'); }"))
    check(t, "Original / Edited is there, not clickable with no edits", t.js("() => { const v = document.querySelector('#exportSettings .edit-view'); return !!v && [...v.querySelectorAll('button')].every(b => b.disabled); }"))
    cap = lambda: t.js("() => { const c = document.querySelector('#exportSettings .edit-preview .stage-caption b'); return c ? c.textContent : null; }")
    seen = set()
    for _ in range(12):
        seen.add(cap())
        time.sleep(0.12)
    check(t, "the preview plays by itself (play on)", len(seen) >= 3, sorted(x for x in seen if x))
    t.js("() => document.activeElement && document.activeElement.blur()")
    t.page.keyboard.press(" ")
    time.sleep(0.4)
    a = cap(); time.sleep(0.8); b = cap()
    check(t, "space pauses the preview", a == b, (a, b))
    check(t, "outside theater mode: only play/pause and theater buttons (no ‹ › Speed)", t.js("() => { const c = document.querySelector('#exportSettings .edit-ctrls'); return !!c && getComputedStyle(c).display === 'none' && !!document.querySelector('#exportSettings .edit-play') && !!document.querySelector('#exportSettings .edit-preview .lent-theater-btn'); }"))
    t.js("() => document.querySelector('#exportSettings .edit-preview .lent-theater-btn').click()")
    time.sleep(0.5)
    check(t, "theater mode: ‹ ▶ › Speed and Reverse loop appear; the Lightroom box hides", t.js("() => { const o = document.getElementById('exportSettings'); const c = o.querySelector('.edit-ctrls'); return o.classList.contains('theater') && getComputedStyle(c).display === 'flex' && c.querySelectorAll('button').length === 5 && c.textContent.includes('Reverse loop') && getComputedStyle(o.querySelector('.export-rows')).display === 'none'; }"))
    t.js("() => { const c = document.querySelector('#exportSettings .edit-ctrls'); [...c.querySelectorAll('button')].find(b => b.title === 'Slower').click(); }")
    check(t, "Slower: 0.75x", t.js("() => document.querySelector('#exportSettings .edit-ctrls .play-speed').textContent") == "0.75x")
    t.js("() => document.querySelector('#exportSettings .edit-preview .lent-theater-btn').click()")
    time.sleep(0.4)
    # Mandar para o Lightroom pelo bloco
    t.lr_block_button("Edit in Lightroom Classic")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Send as shot")
    check(t, "Edit in Lightroom Classic from the box: In Lightroom", t.wait(lambda: t.edit_tag(s), 15))
    check(t, "the box shows In Lightroom Classic · 4 photos and Done editing", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .app-pair').parentElement; return !!b && b.textContent.includes('In Lightroom Classic · 4 photos') && b.textContent.includes('Done editing'); }"), 6))
    check(t, "the strip shows LR on the 4 photos", t.js("() => document.querySelectorAll('#exportSettings .export-strip .frame-app:not(.ed)').length") == 4)
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    t.lr.set_edit(ph[0], (220, 80, 40))
    t.lr.export(o, t.project, s)
    check(t, "Export to Stillpoint: the box shows 1 of 4 photos edited", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .app-pair').parentElement; return !!b && b.textContent.includes('1 of 4 photos edited'); }"), 10))
    check(t, "... ED on photo 01 only", t.wait(lambda: t.js("() => [...document.querySelectorAll('#exportSettings .export-strip > li')].map(li => !!li.querySelector('.frame-app.ed'))") == [True, False, False, False], 5))
    check(t, "... Original / Edited clickable, on Edited", t.js("() => { const v = document.querySelector('#exportSettings .edit-view'); const on = v && v.querySelector('button.on'); return !!on && on.textContent === 'Edited' && ![...v.querySelectorAll('button')].some(b => b.disabled); }"))
    check(t, "... the partial warning", t.js("() => !!document.querySelector('#exportSettings .lr-warn')"))
    # A prévia e a miniatura mostram a editada que chegou (sem precisar fechar e abrir o Export)
    t.page.click("#exportSettings .export-strip > li:nth-child(1)")
    pix = """(sel) => new Promise((done) => { const i = document.querySelector(sel); if (!i || !i.src) return done(null);
      const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); done([...x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data].slice(0, 3)); }; im.onerror = () => done(null); im.src = i.src; })"""
    near = lambda p: p is not None and abs(p[0] - 220) < 30 and abs(p[1] - 80) < 30 and abs(p[2] - 40) < 30
    check(t, "... the large preview shows the edited photo 01 right away", t.wait(lambda: near(t.js(pix, "#exportSettings .edit-preview > img")), 8), t.js(pix, "#exportSettings .edit-preview > img"))
    check(t, "... and so does the thumbnail 01", t.wait(lambda: near(t.js(pix, "#exportSettings .export-strip > li:nth-child(1) img")), 8), t.js(pix, "#exportSettings .export-strip > li:nth-child(1) img"))
    t.js("() => [...document.querySelectorAll('#exportSettings .edit-view button')].find(b => b.textContent === 'Original').click()")
    check(t, "Original: the session shows the originals (Edited tag off)", t.wait(lambda: (t.session(s) or {}).get("showEdited") is False, 5), (t.session(s) or {}).get("showEdited"))
    t.js("() => [...document.querySelectorAll('#exportSettings .edit-view button')].find(b => b.textContent === 'Edited').click()")
    t.wait(lambda: (t.session(s) or {}).get("showEdited") is not False, 5)
    # A sessão inteira foi exportada: saiu do Lightroom. Edit again in Lightroom Classic a manda de novo
    check(t, "the whole session came back: it left Lightroom", t.wait(lambda: not t.edit_tag(s), 10))
    t.lr_block_button("Edit again in Lightroom Classic")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Send as shot")
    check(t, "Edit again in Lightroom Classic: In Lightroom again", t.wait(lambda: t.edit_tag(s), 15))
    t.close_export()
    # Reabrir com a sessão no Lightroom: direto no Edit, nela
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.6)
    check(t, "Export opened again with a session In Lightroom: step 2 · Edit", t.export_step() == "2 Edit", t.export_step())
    check(t, "... on that session", t.js("(n) => { const a = document.querySelector('#exportList li.export-item.active'); return !!a && a.dataset.name === n; }", s))
    t.close_export()
    # A etiqueta In Lightroom da janela principal abre o Export › Edit
    t.js("(n) => document.querySelector('#sessionList li.folder[data-name=\"' + n + '\"] .edit-tag').click()", s)
    time.sleep(0.6)
    check(t, "clicking In Lightroom in the session list opens Export › Edit of the session", t.export_open() and t.export_step() == "2 Edit" and t.js("(n) => { const a = document.querySelector('#exportList li.export-item.active'); return !!a && a.dataset.name === n; }", s))
    t.lr_block_button("Done editing")
    check(t, "Done editing in the box: In Lightroom goes away", t.wait(lambda: not t.edit_tag(s), 10))
    check(t, "... the box shows Edit again in Lightroom Classic", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .app-pair').parentElement; return !!b && b.textContent.includes('Edit again in Lightroom Classic'); }"), 6))
    t.close_export()


def scenario_export_trash(t, name, photos):
    line("\n== 11. Export: no trash; framing locked after editing; Revert to original; alignment goes to Lightroom")
    s = t.shoot()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.dismiss()
    # Uma foto girada 5 graus no Align photos: o recorte de cada foto vai para o Lightroom com o ângulo
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    t.js("(a) => window.setSessionAlign(a[0], a[1] + ':0.00,0.00,1.00000,5.000,1.00000')", [s, os.path.basename(ph[0])])
    t.wait(lambda: "5.000" in str((t.session(s) or {}).get("align", "")), 5)
    # Só esta sessão marcada (as dos cenários de antes podem estar no Lightroom e também bloqueariam)
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", s)
    time.sleep(0.3)
    t.export_edit(s)
    vis = lambda: t.js("() => { const b = document.getElementById('exportTrashBtn'); return !!b && !!b.offsetParent && b.getBoundingClientRect().width > 0; }")
    check(t, "Edit: no trash in the Export", not vis())
    # Bloqueia enquanto está no Lightroom
    t.lr_block_button("Edit in Lightroom Classic")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Crop to")  # com proporção: as câmeras simuladas têm formas diferentes, e o alinhamento pede uma
    t.wait(lambda: t.edit_tag(s), 15)
    t.wait(lambda: t.js("() => document.getElementById('exportConfirm').disabled"), 6)
    check(t, "while the session is In Lightroom, Outputs → is blocked", t.js("() => document.getElementById('exportConfirm').disabled"))
    check(t, "... and the footer says why", "still in Lightroom Classic" in (t.js("() => document.getElementById('exportCount').textContent") or ""), t.js("() => document.getElementById('exportCount').textContent"))
    # O Lightroom aberto em outro catálogo: o bloco diz qual abrir (decisão do dono, 2026-11-10)
    block = lambda: t.js("() => (document.querySelector('#exportSettings .app-pair').parentElement || {}).textContent || ''")
    check(t, "in the catalog of the session: the box does not name the catalog", "open the catalog" not in block(), block())
    home = t.lr.catalog
    t.lr.catalog = os.path.join(os.path.dirname(home), "Another.lrcat")
    check(t, "Lightroom open on another catalog: the box says which catalog to open",
          t.wait(lambda: "open the catalog " + os.path.splitext(os.path.basename(home))[0] + " to see them" in block(), 12), block())
    t.js("() => document.querySelector('#exportSettings .lr-block .lr-catalog-link').click()")
    opened = lambda: open(os.path.join(t.data, "test-opened.txt")).read() if os.path.exists(os.path.join(t.data, "test-opened.txt")) else ""
    check(t, "... the text is a link that opens that catalog in Lightroom", t.wait(lambda: opened().strip().splitlines()[-1].endswith("| " + home), 6), opened()[-300:])
    t.lr.catalog = home
    check(t, "... back on the catalog of the session: the text goes away", t.wait(lambda: "open the catalog" not in block(), 12), block())
    turned = t.lr.crops.get(ph[0]) or ()
    check(t, "the turned photo goes to Lightroom with its own crop and the angle (5 degrees)", len(turned) == 7 and abs(turned[4] - 5) < 0.01, [list(turned), (t.session(s) or {}).get("align"), sorted(t.lr.crops)[-4:], ph[0]])
    other = t.lr.crops.get(ph[1]) or ()
    check(t, "... and the others with the crop of the common area, no angle", len(other) == 7 and other[4] == 0 and other[:4] != (0.0, 0.0, 1.0, 1.0), list(other))
    step1 = lambda: (t.js("() => document.querySelector('#exportSteps .export-step').click()"), time.sleep(0.7))
    lock = lambda: t.js("""() => ({ note: (document.querySelector('#exportSettings .lock-note') || {}).textContent || '',
        seg: [...document.querySelectorAll('#exportSettings .segmented button')].some(b => /^(1:1|16:9|As shot)$/.test(b.textContent.trim()) && !b.disabled),
        align: [...document.querySelectorAll('#exportSettings .framing-align-btn')].map(b => b.disabled),
        chip: !!document.querySelector('#exportList li.export-item.active .export-chip.chip-locked') })""")
    step1()
    k = lock()
    check(t, "Sessions, while in Lightroom: Framing locked (note, ratio buttons and Align photos off, lock on the chip)",
          k["note"].startswith("Framing locked while this session is in Lightroom Classic") and not k["seg"] and k["align"] == [True] and k["chip"], k)
    t.js("() => { const b = [...document.querySelectorAll('#exportSettings .lock-note button')].find(x => x.textContent.trim() === 'Go to 2 Edit'); b && b.click(); }")
    check(t, "... Go to 2 Edit opens the Edit step", t.wait(lambda: t.js("() => !!document.querySelector('#exportSettings .app-pair').parentElement"), 4))
    t.lr.set_edit(ph[0], (30, 160, 200))
    t.lr.export(o, t.project, s)
    check(t, "after Export to Stillpoint (the session leaves Lightroom): Outputs → works again", t.wait(lambda: not t.js("() => document.getElementById('exportConfirm').disabled"), 12))
    t.wait(lambda: t.js("() => !!document.querySelector('#exportSettings .export-strip .frame-app.ed')"), 8)

    count = lambda: len((t.session(s) or {}).get("photos", []))
    before = count()
    step1()
    k = lock()
    check(t, "Sessions, with an edited photo: Framing locked, and the note says how to unlock",
          k["note"].startswith("Framing locked. 1 photo of this session was edited") and "Revert to original" in k["note"] and not k["seg"] and k["align"] == [True] and k["chip"], k)
    t.export_edit(s)
    # Botão direito: sem Delete photo; Revert to original só na editada
    menu = lambda i: (t.page.click("#exportSettings .export-strip > li:nth-child(%d)" % i, button="right"), time.sleep(0.3),
                      t.js("() => [...document.querySelectorAll('.app-menu button')].map(x => x.textContent.trim()).filter(Boolean)"))[2]
    m1 = menu(1); t.page.keyboard.press("Escape"); time.sleep(0.2)
    m2 = menu(2); t.page.keyboard.press("Escape"); time.sleep(0.2)
    check(t, "right-click on the edited photo: Revert to original…, no Delete photo", any(x.startswith("Revert to original") for x in m1) and not any(x.startswith("Delete") for x in m1), m1)
    check(t, "right-click on a photo with no edit: only Edit just this photo", m2 and not any(x.startswith("Revert") or x.startswith("Delete") for x in m2), m2)
    t.lr_block_button("Revert to original")
    check(t, "Revert to original… asks \"Revert 1 photo to the original?\"", t.wait(lambda: t.dialog_title() == "Revert 1 photo to the original?", 3), t.dialog_title())
    t.dialog_click("Revert to original")
    check(t, "Revert to original: only the edit goes (still %d photos)" % before, t.wait(lambda: (t.session(s) or {}).get("edited", 1) == 0 and count() == before, 8), ((t.session(s) or {}).get("edited"), count()))
    step1()
    k = lock()
    check(t, "... and the Framing unlocks in Sessions", not k["note"] and k["seg"] and k["align"] == [False] and not k["chip"], k)
    t.close_export()
    # Janela principal: foto com editada solta na lixeira da barra de cima também pergunta
    t.lr.set_edit(ph[0], (30, 160, 200))
    t.lr.export(o, t.project, s)
    t.wait(lambda: (t.session(s) or {}).get("edited", 0) >= 1, 10)
    t.wait(lambda: str(t.project_tag(s) or "").startswith("Edited"), 10)  # a página já sabe da editada
    sess = t.session(s) or {}
    first = sorted(sess.get("photos", []), key=lambda x: x["order"])
    if first and first[0].get("edited"):
        t.open_session(s)
        a = t.js("() => { const r = document.querySelector('#sessionGallery .carousel > li:nth-child(1)').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        b = t.js("() => { const r = document.getElementById('trashBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        t.page.mouse.move(a[0], a[1]); t.page.mouse.down()
        t.page.mouse.move(a[0] + 20, a[1] + 10, steps=4); t.page.mouse.move(b[0], b[1], steps=10)
        time.sleep(0.15); t.page.mouse.up(); time.sleep(0.4)
        check(t, "main window: a photo with an edit dropped on the trash asks \"Delete the edit or the photo?\"", t.wait(lambda: t.dialog_title() == "Delete the edit or the photo?", 3), t.dialog_title())
        t.dialog_click("Cancel")
        time.sleep(0.3)
        check(t, "... Cancel: nothing is deleted", len(t.session(s)["photos"]) == len(first) and t.session(s)["edited"] >= 1)
    else:
        check(t, "main window check needs photo 01 with an edit (it came back with ⌘Z)", False, [p.get("edited") for p in first])
    # Janela Project › Edited only: as sessões com alguma foto editada (pedido do dono, 2026-11-10)
    t.dismiss()
    t.js("() => { const b = document.getElementById('projectWindowBtn'); b.classList.remove('hidden'); b.click(); }")
    t.wait(lambda: t.js("() => !document.getElementById('projectOverlay').classList.contains('hidden')"), 5)
    time.sleep(0.4)
    t.js("() => document.getElementById('projectSelectEdited').click()")
    time.sleep(0.4)
    want = sorted(x["name"] for x in t.sessions() if x.get("inProject") and x.get("edited", 0) > 0)
    got = sorted(t.js("() => [...document.querySelectorAll('#projectList li')].filter(li => { const c = li.querySelector('input[type=checkbox]'); return c && c.checked; }).map(li => li.dataset.name)") or [])
    check(t, "Project window › Edited only ticks every session with an edited photo (partly edited too)", want and got == want, (got, want))
    t.js("() => document.getElementById('projectCloseBtn').click()")
    time.sleep(0.3)


def scenario_lightroom_crop(t, name, photos):
    line("\n== 12. Crop adjusted in Lightroom becomes the alignment; an edited file with another shape is not used")
    s = t.shoot()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.dismiss()
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    f2 = os.path.basename(ph[1])
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", s)
    time.sleep(0.3)
    t.export_edit(s)

    def send(first):
        t.lr_block_button("Edit")
        if first and t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
            t.dialog_click("Crop to")
        t.wait(lambda: t.edit_tag(s), 15)
        time.sleep(0.5)

    send(True)
    sent = t.lr.crops.get(ph[1]) or ()
    check(t, "the photo goes to Lightroom with its crop and its size (for the shape check)", len(sent) == 7 and sent[5] > 0 and sent[6] > 0, list(sent))
    if len(sent) != 7:
        return
    align0 = (t.session(s) or {}).get("align", "")
    # A pessoa move o recorte da foto 02 no Lightroom (mesmo tamanho, 3% para o lado que tem espaço) e exporta
    d = 0.03 if sent[2] + 0.03 <= 1 else -0.03
    if not (0 <= sent[0] + d and sent[2] + d <= 1):
        d = 0.0
        moved = (sent[0] + 0.02, sent[1] + 0.02, sent[2] - 0.02, sent[3] - 0.02, 0.0)  # sem espaço para os lados: menor
    else:
        moved = (sent[0] + d, sent[1], sent[2] + d, sent[3], 0.0)
    t.lr.set_edit(ph[1], (40, 150, 210))
    t.lr.export(o, t.project, s, crops={ph[1]: moved})
    check(t, "Export to Stillpoint with the crop moved: the alignment of photo 02 changes in Stillpoint",
          t.wait(lambda: f2 + ":" in str((t.session(s) or {}).get("align", "")) and (t.session(s) or {}).get("align", "") != align0, 12), (t.session(s) or {}).get("align"))
    check(t, "... and the toast says so", t.wait(lambda: "photo 02 aligned from Lightroom" in (t.js("() => document.getElementById('toast').textContent") or ""), 6),
          t.js("() => document.getElementById('toast').textContent"))
    check(t, "... the photo counts as edited (same shape: it is used)", (t.session(s) or {}).get("edited") == 1, (t.session(s) or {}).get("edited"))
    align1 = (t.session(s) or {}).get("align", "")
    # Ida e volta: mandar de novo leva ao Lightroom o mesmo recorte que a pessoa deixou
    t.wait(lambda: not t.edit_tag(s), 10)
    t.export_edit(s)
    send(False)
    back = t.lr.crops.get(ph[1]) or ()
    close = len(back) == 7 and all(abs(back[i] - moved[i]) < 2e-4 for i in range(4)) and abs(back[4]) < 1e-3
    check(t, "Edit again in Lightroom Classic: photo 02 goes with the crop the person left there", close, [list(back), list(moved)])
    t.lr_block_button("Done editing")
    t.wait(lambda: not t.edit_tag(s), 10)
    time.sleep(0.5)
    # Revert to original: o alinhamento volta ao de antes de a foto ir; ⌘Z traz o do Lightroom de volta
    t.lr_block_button("Revert to original")
    t.wait(lambda: t.dialog_title().startswith("Revert 1 photo"), 3)
    t.dialog_click("Revert to original")
    check(t, "Revert to original: the alignment goes back to what it was before the photo went",
          t.wait(lambda: (t.session(s) or {}).get("edited") == 0 and (t.session(s) or {}).get("align", "") == align0, 8), (t.session(s) or {}).get("align"))
    t.undo()
    check(t, "⌘Z: the edited photo and the alignment from Lightroom come back",
          t.wait(lambda: (t.session(s) or {}).get("edited") == 1 and (t.session(s) or {}).get("align", "") == align1, 8), [(t.session(s) or {}).get("align"), align1, (t.session(s) or {}).get("edited")])
    # Um arquivo salvo à mão na pasta Edited com outra proporção: não é usado
    ed = os.path.join(t.project, "Edited", s)
    f3 = os.path.splitext(os.path.basename(ph[2]))[0] + ".jpg"
    want = t.lr.shape(sent)
    wrong = (200, 100) if abs(want[0] / want[1] - 2.0) > 0.2 else (100, 100)
    Image.new("RGB", wrong, (200, 60, 60)).save(os.path.join(ed, f3), quality=85)
    ref = lambda: next((p.get("refused") for p in (t.session(s) or {}).get("photos", []) if p["order"] == 3), None)
    check(t, "a file saved by hand with another shape: photo 03 is marked, not counted as edited",
          t.wait(lambda: bool(ref()), 10) and (t.session(s) or {}).get("edited") == 1, (ref(), (t.session(s) or {}).get("edited")))
    check(t, "... the toast warns", t.wait(lambda: "edited file not used" in (t.js("() => document.getElementById('toast').textContent") or ""), 6),
          t.js("() => document.getElementById('toast').textContent"))
    notices = [f for f in os.listdir(t.lr.bridge) if f.startswith("notice-")]
    text = open(os.path.join(t.lr.bridge, notices[0])).read() if notices else ""
    check(t, "... and a notice goes to Lightroom (photo, shapes)", "photo=" + ph[2] in text and "have=" in text and "want=" in text and "end=1" in text, text)
    t.export_edit(s)
    time.sleep(0.8)
    check(t, "... Edit: the triangle on thumbnail 03", t.wait(lambda: t.js("() => !!document.querySelector('#exportSettings .export-strip > li:nth-child(3) .frame-app.refused')"), 5))
    block = t.js("() => document.querySelector('#exportSettings .app-pair').parentElement.textContent") or ""
    check(t, "... and the line in the Lightroom Classic box", "1 not used" in block and "Photo 03 not used: it is" in block, block)
    # O arquivo certo no lugar: passa a valer
    Image.new("RGB", (max(1, round(want[0] / 4)), max(1, round(want[1] / 4))), (60, 200, 60)).save(os.path.join(ed, f3), quality=85)
    check(t, "the file replaced by one with the right shape: photo 03 is edited, no mark",
          t.wait(lambda: not ref() and (t.session(s) or {}).get("edited") == 2, 10), (ref(), (t.session(s) or {}).get("edited")))
    t.close_export()


def scenario_undo_own_item(t, name, photos):
    line("\n== 13. ⌘Z after deleting a photo brings back only what that action deleted")
    s = t.shoot()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.dismiss()
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    # Só esta sessão marcada no Export (os cenários de antes deixam outras marcadas)
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", s)
    time.sleep(0.3)
    t.edit_in_lightroom(s)
    t.lr.set_edit(ph[0], (30, 160, 200))
    t.lr.export(o, t.project, s)
    t.wait(lambda: (t.session(s) or {}).get("edited") == 1, 12)
    count = lambda: len((t.session(s) or {}).get("photos", []))
    before = count()
    t.open_session(s)
    t.photo_menu(2, "Delete photo 03")
    t.button("Delete")
    check(t, "photo 03 deleted", t.wait(lambda: count() == before - 1, 8), count())
    # Outra coisa da mesma sessão vai para a lixeira depois, sem ser uma ação da janela (como a editada que o
    # Lightroom manda tirar): a editada da foto 01
    t.js("(n) => window.deleteEdits(n)", s)
    check(t, "later, the edit of photo 01 goes to the trash too", t.wait(lambda: (t.session(s) or {}).get("edited") == 0, 8), (t.session(s) or {}).get("edited"))
    t.undo()
    check(t, "⌘Z: photo 03 comes back", t.wait(lambda: count() == before, 8), count())
    time.sleep(1.0)
    check(t, "... and only it (the edit of 01 stays in the trash)", (t.session(s) or {}).get("edited") == 0 and count() == before, ((t.session(s) or {}).get("edited"), count()))
    t.redo()
    check(t, "⌘⇧Z: photo 03 deleted again", t.wait(lambda: count() == before - 1, 8), count())
    t.undo()
    check(t, "⌘Z again: photo 03 back, still only it", t.wait(lambda: count() == before, 8) and (t.session(s) or {}).get("edited") == 0, ((t.session(s) or {}).get("edited"), count()))


def scenario_selection_kept(t, name, photos):
    line("\n== 15. Export selection is kept after closing Stillpoint; a new session comes ticked")
    a = t.shoot()
    t.dismiss()
    if not a:
        check(t, "a new session for this scenario", False)
        return
    ticked = lambda: t.js("() => [...document.querySelectorAll('#exportList li.export-item')].filter(li => li.querySelector('.export-check input').checked).map(li => li.dataset.name)")
    listed = lambda: t.js("() => [...document.querySelectorAll('#exportList li.export-item')].map(li => li.dataset.name)")
    def open_export():
        t.page.click("#saveBtn")
        t.wait(lambda: t.export_open(), 5)
        time.sleep(0.6)
    open_export()
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", a)
    time.sleep(0.3)
    check(t, "only the one session is ticked", ticked() == [a], ticked())
    before = listed()
    t.close_export()
    time.sleep(0.6)
    t.restart_app()
    t.dismiss()
    open_export()
    check(t, "after opening Stillpoint again: the same sessions are listed", listed() == before, (listed(), before))
    check(t, "after opening Stillpoint again: still only that session ticked", ticked() == [a], ticked())
    t.close_export()
    b = t.shoot()
    t.dismiss()
    open_export()
    check(t, "a new session comes ticked, the others stay as left", sorted(ticked()) == sorted([a, b]), ticked())
    t.js("() => document.getElementById('exportSelectAll').click()")
    time.sleep(0.3)
    t.close_export()
    time.sleep(0.6)
    saved = [l for l in open(os.path.join(t.data, "settings.txt")).read().splitlines() if l.startswith("pref.exportOff=")]
    check(t, "Select all leaves nothing recorded as unticked", saved == ["pref.exportOff={}"], saved)


def scenario_align_undo(t, name, photos):
    line("\n== 16. Undo and redo in Align photos (quick steps, orientation in the middle)")
    s = t.shoot()
    t.dismiss()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.6)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s)
    time.sleep(0.6)
    t.js("() => [...document.querySelectorAll('#exportSettings .segmented:not(.orient-seg) button')].find(x => x.textContent.trim() === '16:9').click()")
    time.sleep(0.8)
    t.js("() => document.querySelector('#exportSettings .framing-align-btn').click()")
    time.sleep(1.5)
    size = lambda: t.js("() => (document.querySelector('#exportSettings input[aria-label=Size]') || {}).value")
    vert = lambda: t.js("() => { const b = document.querySelectorAll('#exportSettings .orient-seg button')[1]; return !!b && b.classList.contains('on'); }")
    saved = lambda: (t.session(s) or {}).get("align") or ""
    def bigger():
        b = t.page.locator('#exportSettings .align-ctl', has_text="Size").locator("button").nth(1)
        for _ in range(3):
            b.click(modifiers=["Shift"])
            time.sleep(0.25)   # mais depressa do que a gravação volta do app
        time.sleep(0.6)
    bigger()
    check(t, "three steps of Size: 103.0", size() == "103.0", size())
    t.js("() => document.querySelectorAll('#exportSettings .orient-seg button')[1].click()")
    time.sleep(1.2)
    bigger()
    check(t, "vertical, then three more: 106.0", size() == "106.0" and vert(), (size(), vert()))
    def go(keys, want_size, want_vert, label):
        for k in keys:
            (t.undo if k == "u" else t.redo)()
            time.sleep(0.8)
        check(t, label, size() == want_size and vert() == want_vert and ("%.5f" % (float(want_size) / 100)) in saved(), (size(), vert(), saved()))
    go("u", "105.0", True, "undo: one step back (105.0), and it is what is saved")
    go("u", "104.0", True, "undo again: 104.0")
    go("rr", "106.0", True, "redo twice: 106.0")
    go("r", "106.0", True, "redo with nothing left: stays at 106.0")
    go("uuu", "103.0", True, "undo three times: 103.0, still vertical")
    go("u", "103.0", False, "one more undo: back to horizontal")
    go("rr", "104.0", True, "redo twice: vertical and 104.0")
    # Com o cursor dentro da caixa do número: o ⌘Z desfaz o ajuste da foto (decisão do dono, 2026-11-11)
    box = t.page.locator('#exportSettings input[aria-label=Size]')
    box.click(); box.fill("90"); t.page.keyboard.press("Enter")   # o cursor continua na caixa depois do Enter
    time.sleep(0.8)
    check(t, "typing 90 in Size and Enter: the photo is at 90.0", size() == "90.0" and "0.90000" in saved(), (size(), saved()))
    inside = t.js("() => document.activeElement && document.activeElement.classList.contains('align-num')")
    t.undo()
    time.sleep(0.9)
    check(t, "undo with the cursor in a number box: back to 104.0, saved", inside and size() == "104.0" and "1.04000" in saved(), (inside, size(), saved()))
    box = t.page.locator('#exportSettings input[aria-label=Size]')
    box.click(); box.fill("77")
    t.undo()
    time.sleep(0.6)
    check(t, "a number typed and not confirmed: the first undo only drops it", size() == "104.0" and "1.04000" in saved(), (size(), saved()))
    t.js("() => document.activeElement && document.activeElement.blur()")
    time.sleep(0.4)
    check(t, "... and leaving the box changes nothing", size() == "104.0" and "1.04000" in saved(), (size(), saved()))
    t.close_export()


def scenario_flip(t, name, photos):
    line("\n== 17. Flip in Align photos (per photo, Apply to all, undo, and what goes to Lightroom)")
    math = os.path.join(BUILD, "ExporterMathTest")
    if os.path.exists(math):
        out = subprocess.run([math], capture_output=True, text=True)
        for ln in out.stdout.splitlines():
            if ln.startswith(("PASS", "FAIL")):
                check(t, "exporter: " + ln[6:].split("   [")[0], ln.startswith("PASS"), ln)
    else:
        check(t, "the exporter math test was built (ExporterMathTest)", False, math)
    s = t.shoot()
    t.dismiss()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.6)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", s)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s)
    time.sleep(0.6)
    t.js("() => [...document.querySelectorAll('#exportSettings .segmented:not(.orient-seg) button')].find(x => x.textContent.trim() === '1:1').click()")
    time.sleep(0.8)
    t.js("() => document.querySelector('#exportSettings .framing-align-btn').click()")
    time.sleep(1.8)
    saved = lambda: (t.session(s) or {}).get("align") or ""
    entry = lambda k: dict(x.rsplit(":", 1) for x in saved().split(";") if ":" in x).get(os.path.basename(ph[k]), "")
    flip_of = lambda k: (entry(k).split(",") + ["0"] * 6)[5]
    state = lambda: t.js("""() => ({
        on: [...document.querySelectorAll('#exportSettings .flip-btn')].map(b => b.classList.contains('on')),
        marks: [...document.querySelectorAll('#exportSettings .export-strip .frame')].map(li => !!li.querySelector('.frame-flip')),
        thumbs: [...document.querySelectorAll('#exportSettings .export-strip .frame img')].map(i => i.style.transform),
        stage: (document.querySelector('#exportSettings .align-current img') || {style: {}}).style.transform,
        row: (() => { const r = document.querySelector('#exportSettings .flip-row'), p = document.querySelector('#exportSettings .align-panel'); if (!r) return null;
                      const a = r.getBoundingClientRect(), b = p.getBoundingClientRect(), pair = r.querySelector('.flip-pair').getBoundingClientRect(),
                            ctl = document.querySelector('#exportSettings .align-ctl'), first = ctl.querySelector('button').getBoundingClientRect(), last = [...ctl.querySelectorAll('button')].pop().getBoundingClientRect();
                      return { inside: a.right <= b.right + 0.5, left: Math.round(pair.left - first.left), right: Math.round(pair.right - last.right) }; })() })""")
    st = state()
    check(t, "the Flip row is there, under Rotate, as wide as the − number + above it", st["row"] == {"inside": True, "left": 0, "right": 0}, st["row"])
    check(t, "nothing flipped at first", st["on"] == [False, False] and not any(st["marks"]), st)
    # A foto 01 para a esquerda do quadro (Position › Left), depois espelhada na horizontal
    t.js("() => document.querySelector('#exportSettings .crop-dot[title=\"Left\"]').click()")
    time.sleep(0.8)
    moved = entry(0)
    t.page.click("#exportSettings .flip-btn[data-flip=h]")
    time.sleep(0.9)
    st = state()
    check(t, "Flip left to right on photo 01: the button is on, the photo and its thumbnail are mirrored, the thumbnail has the mark",
          st["on"] == [True, False] and "scale(-1, 1)" in st["stage"] and "scale(-1, 1)" in st["thumbs"][0] and st["marks"] == [True, False, False, False], st)
    check(t, "... saved with the flip, and the position did not change", flip_of(0) == "1" and entry(0).split(",")[:4] == moved.split(",")[:4], (moved, entry(0)))
    # Uma foto só espelhada (sem mexer no lugar) é guardada também
    t.page.click("#exportSettings .export-strip > li:nth-child(3)")
    time.sleep(1.2)
    t.page.click("#exportSettings .flip-btn[data-flip=v]")
    time.sleep(0.9)
    st = state()
    check(t, "Flip top to bottom on photo 03 (not moved): saved as a flip only", flip_of(2) == "2" and entry(2).startswith("0.00,0.00,1.00000,0.000") and st["marks"][2] and "scale(1, -1)" in st["stage"], (entry(2), st))
    t.undo()
    time.sleep(0.9)
    check(t, "undo: photo 03 is not flipped anymore, photo 01 still is", flip_of(2) == "0" and flip_of(0) == "1", saved())
    t.redo()
    time.sleep(0.9)
    check(t, "redo: flipped again", flip_of(2) == "2", saved())
    # Apply to all: todas com o espelhamento da foto aberta (a 03: na vertical)
    t.page.click("#exportSettings .flip-all")
    time.sleep(0.9)
    st = state()
    check(t, "Apply to all: the four photos get the flip of photo 03", [flip_of(k) for k in range(4)] == ["2"] * 4 and all(st["marks"]), (saved(), st["marks"]))
    check(t, "... photo 01 keeps where it was moved to", entry(0).split(",")[:4] == moved.split(",")[:4], (moved, entry(0)))
    check(t, "... and the toast says so", "Flip of photo 03 on the 4 photos" in (t.js("() => document.getElementById('toast').textContent") or ""), t.js("() => document.getElementById('toast').textContent"))
    t.undo()
    time.sleep(0.9)
    check(t, "undo of Apply to all: back to photo 01 left to right and photo 03 top to bottom", [flip_of(k) for k in range(4)] == ["1", "0", "2", "0"], saved())
    # Os dois sentidos na foto 02 (a que tem a etiqueta 16:9): a marca tem um ícone só e não encosta na etiqueta
    t.page.click("#exportSettings .export-strip > li:nth-child(2)")
    time.sleep(1.2)
    t.page.click("#exportSettings .flip-btn[data-flip=h]")
    time.sleep(0.9)
    t.page.click("#exportSettings .flip-btn[data-flip=v]")
    time.sleep(0.9)
    both = t.js("""() => { const li = document.querySelectorAll('#exportSettings .export-strip .frame')[1], m = li.querySelector('.frame-flip'), r = li.querySelector('.frame-ratio');
        if (!m) return null; const a = m.getBoundingClientRect(), b = r ? r.getBoundingClientRect() : null;
        return { icons: m.querySelectorAll('svg').length, title: m.title, gap: b ? Math.round(b.left - a.right) : 99 }; }""")
    check(t, "flipped both ways: the thumbnail mark is one icon and stays clear of the 16:9 tag", flip_of(1) == "3" and both and both["icons"] == 1 and both["title"] == "Flipped both ways" and both["gap"] >= 2, both)
    t.js("() => [...document.querySelectorAll('#exportSettings .align-resets button')].find(b => b.textContent.trim() === 'Reset photo').click()")
    time.sleep(0.9)
    t.page.click("#exportSettings .export-strip > li:nth-child(3)")
    time.sleep(1.2)
    t.js("() => [...document.querySelectorAll('#exportSettings .align-resets button')].find(b => b.textContent.trim() === 'Reset photo').click()")
    time.sleep(0.9)
    check(t, "Reset photo takes the flip off too (photo 03)", flip_of(2) == "0" and flip_of(0) == "1", saved())
    # Para o Lightroom a foto vai sem espelhar: o recorte da 01 é o do outro lado do espelho
    dx = float(entry(0).split(",")[0])
    t.js("() => document.getElementById('exportConfirm').click()")  # Done aligning
    time.sleep(0.8)
    t.export_edit(s)
    t.lr_block_button("Edit")
    t.wait(lambda: t.edit_tag(s), 15)
    time.sleep(0.5)
    sent = t.lr.crops.get(ph[0]) or ()
    from PIL import Image
    with Image.open(ph[0]) as im:
        w, h = im.size
    with Image.open(ph[1]) as im:
        w2, h2 = im.size
    side = min(w, h, w2, h2)   # o canvas 1:1: o maior quadrado que cabe em todas as fotos
    want_left = (w / 2 - side / 2 + dx) / w   # espelhada: o deslocamento troca de sinal
    plain_left = (w / 2 - side / 2 - dx) / w
    check(t, "photo 01 was moved off centre (so the mirror shows in the crop)", abs(dx) > 1, dx)
    check(t, "Lightroom gets photo 01 not mirrored: the crop is the mirror of the Stillpoint one", len(sent) == 7 and abs(sent[0] - want_left) < 0.002 and abs(sent[0] - plain_left) > 0.01,
          (list(sent), want_left, plain_left))
    # A editada volta sem mexer no recorte: a foto continua espelhada no Stillpoint
    t.lr.set_edit(ph[0], (40, 150, 210))
    t.lr.export(o, t.project, s)
    t.wait(lambda: (t.session(s) or {}).get("edited", 0) >= 1, 12)
    time.sleep(1.0)
    check(t, "after Export to Stillpoint the photo is edited and still flipped", (t.session(s) or {}).get("edited", 0) >= 1 and flip_of(0) == "1", saved())
    # ... e movendo o recorte no Lightroom, o alinhamento que volta continua espelhado
    d = 0.02 if sent[2] + 0.02 <= 1 else -0.02
    t.export_edit(s)
    t.lr_block_button("Edit")
    t.wait(lambda: t.edit_tag(s), 15)
    time.sleep(0.5)
    sent = t.lr.crops.get(ph[0]) or sent
    t.lr.set_edit(ph[0], (50, 150, 210))
    t.lr.export(o, t.project, s, crops={ph[0]: (sent[0] + d, sent[1], sent[2] + d, sent[3], sent[4])})
    time.sleep(2.5)
    new_dx = float((entry(0).split(",") + ["0"])[0] or 0)
    check(t, "crop moved in Lightroom on a flipped photo: the alignment moves the mirrored way and stays flipped",
          flip_of(0) == "1" and abs((new_dx - dx) - d * w) < 1.5, (dx, new_dx, d * w, entry(0)))
    t.close_export()


def scenario_orientation(t, name, photos):
    line("\n== 14. Orientation of the aspect ratio (Horizontal / Vertical)")
    s = t.shoot()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    t.dismiss()
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.js("() => document.getElementById('exportUnselectAll').click()")
    t.js("(n) => document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-check input').click()", s)
    time.sleep(0.3)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s)
    time.sleep(0.6)
    ratios = lambda: t.js("() => [...document.querySelectorAll('#exportSettings .ratio-group .segmented:not(.orient-seg) button')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : ''))")
    orient = lambda: t.js("() => [...document.querySelectorAll('#exportSettings .orient-seg button')].map(b => (b.classList.contains('on') ? 'on' : 'off') + (b.disabled ? ' disabled' : ''))")
    chip = lambda: t.js("(n) => (document.querySelector('#exportList li.export-item[data-name=\"' + n + '\"] .export-chip') || {}).textContent || ''", s)
    pick = lambda label: t.js("(l) => [...document.querySelectorAll('#exportSettings .ratio-group .segmented:not(.orient-seg) button')].find(b => b.textContent.trim() === l).click()", label)
    pick("As shot")
    time.sleep(0.6)
    check(t, "As shot: the two orientation buttons are there, off", orient() == ["off disabled", "off disabled"], orient())
    pick("3:2")
    time.sleep(0.8)
    check(t, "3:2 on photos lying down: Horizontal is lit", t.wait(lambda: orient() == ["on", "off"], 6), orient())
    check(t, "... the session keeps 3:2 with no orientation written (it follows the photos)", (t.session(s) or {}).get("crop", "").startswith("3:2|"), (t.session(s) or {}).get("crop"))
    t.js("() => document.querySelectorAll('#exportSettings .orient-seg button')[1].click()")
    check(t, "Vertical: the list becomes As shot, 2:3, 3:4, 9:16, 1:1 with 2:3 chosen", t.wait(lambda: ratios() == ["As shot", "2:3*", "3:4", "9:16", "1:1"], 6), ratios())
    check(t, "... Vertical is lit", orient() == ["off", "on"], orient())
    check(t, "... the session is saved as 3:2/v", t.wait(lambda: (t.session(s) or {}).get("crop", "").startswith("3:2/v|"), 6), (t.session(s) or {}).get("crop"))
    check(t, "... the tag in the list says 2:3", t.wait(lambda: chip().startswith("2:3"), 6), chip())
    frame = t.js("() => { const r = document.querySelector('#exportSettings .crop-frame').getBoundingClientRect(); return [r.width, r.height]; }")
    check(t, "... the frame in the preview stands up (2:3)", frame[1] > 0 and abs(frame[0] / frame[1] - 2 / 3) < 0.02, frame)
    pick("1:1")
    time.sleep(0.6)
    check(t, "1:1: the orientation buttons go off", orient() == ["off disabled", "off disabled"], orient())
    pick("2:3")
    time.sleep(0.6)
    check(t, "back to 2:3: Vertical is still the choice", orient() == ["off", "on"] and (t.session(s) or {}).get("crop", "").startswith("3:2/v|"), (orient(), (t.session(s) or {}).get("crop")))
    # Align photos tem os mesmos dois botões
    t.js("() => document.querySelector('#exportSettings .framing-align-btn').click()")
    check(t, "Align photos: the two orientation buttons are there, Vertical lit", t.wait(lambda: orient() == ["off", "on"], 6), orient())
    canvas = lambda: t.js("() => (document.querySelector('#exportSettings').textContent.match(/Canvas \\d+ × \\d+ px \\(([^)]+)\\)/) || [])[1] || ''")
    check(t, "... and the canvas is named 2:3", t.wait(lambda: canvas() == "2:3", 6), canvas())
    t.js("() => document.querySelectorAll('#exportSettings .orient-seg button')[0].click()")
    check(t, "... Horizontal there: the session is saved as 3:2/h", t.wait(lambda: (t.session(s) or {}).get("crop", "").startswith("3:2/h|"), 6), (t.session(s) or {}).get("crop"))
    t.js("() => document.querySelectorAll('#exportSettings .orient-seg button')[1].click()")
    t.wait(lambda: (t.session(s) or {}).get("crop", "").startswith("3:2/v|"), 6)
    t.js("() => document.getElementById('exportConfirm').click()")  # Done aligning
    time.sleep(0.8)
    # No Lightroom: cada foto vai com o recorte em pé, e a editada em pé é aceita
    t.export_edit(s)
    t.lr_block_button("Edit")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Send")
    t.wait(lambda: t.edit_tag(s), 15)
    time.sleep(0.5)
    sent = t.lr.crops.get(ph[0]) or ()
    shape = t.lr.shape(sent) if len(sent) == 7 else (0, 1)
    check(t, "Edit in Lightroom Classic: photo 01 goes with a standing 2:3 crop", abs(shape[0] / shape[1] - 2 / 3) < 0.01, [list(sent), shape])
    title = next((v for k, v in t.lr.framing.items()), None)
    check(t, "... and the request names it 2:3", "2:3" in list(t.lr.framing.values()), list(t.lr.framing.values())[-3:])
    t.lr.set_edit(ph[0], (30, 160, 200))
    t.lr.export(o, t.project, s)
    check(t, "the edited photo comes back standing and is used (Edited 1, not refused)",
          t.wait(lambda: (t.session(s) or {}).get("edited") == 1, 12) and not any(p.get("refused") for p in (t.session(s) or {}).get("photos", [])),
          [(t.session(s) or {}).get("edited"), [p.get("refused") for p in (t.session(s) or {}).get("photos", [])]])
    t.js("() => document.querySelector('#exportSteps .export-step').click()")
    time.sleep(0.8)
    check(t, "with an edited photo the orientation is locked too", orient() == ["off disabled", "on disabled"], orient())
    t.close_export()
    time.sleep(0.8)
    tip = t.js("(n) => { const g = document.querySelector('#sessionList li.folder[data-name=\"' + n + '\"] .mixed-tag'); return g ? g.dataset.itip : null; }", s)
    check(t, "main window: the Mixed ratios note names the crop standing (2:3), not 3:2", bool(tip) and "Crop on export: 2:3 (keeps" in tip, tip)


def scenario_rig_state(t, name, photos):
    line("\n== 18. The project keeps the rig: Bullet time panel, camera order and camera settings")
    rig_file = os.path.join(t.project, "stillpoint-rig.json")
    changed_file = t.env["STILLPOINT_TEST_CAMERAS"]
    def rig():
        try:
            with open(rig_file) as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}
    cam = lambda serial: next((c for c in rig().get("cameras", []) if c["serial"] == serial), {"settings": {}})
    value = lambda serial, key: cam(serial)["settings"].get(key, {}).get("value")
    on_screen = lambda: t.js("() => [...document.querySelectorAll('#cameraList li.camera, #cameras li.camera, li.camera')].map(li => (li.textContent.match(/(SL3|T7)_\\d+/) || [''])[0])")
    panel = lambda: t.js("() => ['countdown', 'sessions', 'downloadWait'].map(id => document.getElementById(id).value)")
    toast = lambda: t.js("() => { const x = document.getElementById('toast'); return x.classList.contains('hidden') ? '' : x.querySelector('.toast-text').textContent; }")
    rows = lambda: t.js("() => [...document.querySelectorAll('#dialogOverlay .rig-diff tbody tr')].map(tr => [...tr.children].map(td => td.textContent).join('|'))")
    lines = lambda: t.js("() => [...document.querySelectorAll('#dialogOverlay .rig-diff .rig-line')].map(p => p.textContent)")
    text = lambda: t.js("() => document.getElementById('dialogText').textContent")
    TITLE = "The cameras are not as this project left them"
    def set_input(id_, v):
        t.js("([id, v]) => { const d = document.getElementById(id); d.value = v; d.dispatchEvent(new Event('input')); d.dispatchEvent(new Event('change')); d.dispatchEvent(new Event('blur')); }", [id_, v])
    def restart(cameras=4, changed=""):
        t.dismiss()
        t.env["STILLPOINT_FAKE_CAMERAS"] = str(cameras)
        if changed:
            with open(changed_file, "w") as f:
                f.write(changed)
        t.restart_app()

    t.dismiss()
    t.wait(lambda: len(rig().get("cameras", [])) == 4, 15)
    check(t, "the project took the cameras as they are, without asking", len(rig().get("cameras", [])) == 4 and rig().get("order") == ["fake1", "fake2", "fake3", "fake4"] and t.dialog_title() != TITLE, rig().get("order"))

    # O painel Bullet time
    set_input("countdown", "3")
    t.wait(lambda: rig().get("panel", {}).get("countdown") == 3, 5)
    p = rig().get("panel", {})
    check(t, "a change in the Bullet time panel goes to the project right away", p.get("countdown") == 3 and p.get("sessions") == 1 and "timing" in p, p)

    # Uma configuração de câmera e a ordem
    t.js("() => window.setCameraSetting('SL3_1', 'iso', '100')")
    t.wait(lambda: value("fake1", "iso") == 100, 8)
    check(t, "a camera setting changed in Stillpoint goes to the project", value("fake1", "iso") == 100 and cam("fake1")["settings"]["iso"]["label"] == "ISO 100", cam("fake1"))
    t.js("() => window.setOrder('T7_1', 'SL3_1', 'SL3_2', 'T7_2')")
    t.wait(lambda: rig().get("order") == ["fake2", "fake1", "fake3", "fake4"], 8)
    check(t, "the camera order changed by hand goes to the project", rig().get("order") == ["fake2", "fake1", "fake3", "fake4"], rig().get("order"))

    # Fechar e abrir o Stillpoint: as câmeras (de mentira) voltam ao padrão, o Project tem ISO 100 na SL3_1
    before = open(rig_file).read()
    restart()
    asked = t.wait(lambda: t.dialog_title() == TITLE, 20)
    check(t, "opening again with a camera changed: Stillpoint asks before touching the cameras", bool(asked), t.dialog_title())
    check(t, "... the text counts the cameras", text() == PROJECT + " was saved with other settings on 1 of the 4 cameras connected now.", text())
    check(t, "... one row: the camera, the setting, how it is now and how the project has it", rows() == ["02|Canon EOS Rebel SL3 (SL3_1)|ISO|ISO 400|ISO 100"], rows())
    check(t, "... the two buttons of the approved layout", t.js("() => [...document.querySelectorAll('#dialogActions button')].map(b => b.textContent.trim())") == ["Keep the cameras as they are", "Apply the project settings"])
    check(t, "the Bullet time panel comes back as the project left it", panel()[0] == "3", panel())
    check(t, "the cameras come back in the order of the project", on_screen()[:4] == ["T7_1", "SL3_1", "SL3_2", "T7_2"], on_screen())
    try:
        t.page.screenshot(path=os.path.join(BUILD, "rig-dialog.png"))
    except Exception:  # noqa: BLE001
        pass
    t.dialog_click("Keep the cameras as they are")
    time.sleep(4)
    check(t, "Keep the cameras as they are: the project file does not change", open(rig_file).read() == before)
    check(t, "... and Stillpoint does not ask again while the project stays open", t.dialog_title() != TITLE, t.dialog_title())
    # ⌘Z do Keep: o aviso volta, com a mesma linha (pedido do dono, 2026-11-11)
    t.undo()
    back = t.wait(lambda: t.dialog_title() == TITLE, 5)
    check(t, "undo after Keep the cameras as they are: the dialog comes back, with the same row", bool(back) and rows() == ["02|Canon EOS Rebel SL3 (SL3_1)|ISO|ISO 400|ISO 100"], rows())
    t.dialog_click("Keep the cameras as they are")
    time.sleep(2)
    check(t, "... and Keep again leaves the project as it was", open(rig_file).read() == before and t.dialog_title() != TITLE)
    t.js("() => window.setCameraSetting('SL3_1', 'tv', '200')")
    t.wait(lambda: value("fake1", "tv") == 200, 8)
    check(t, "... what is changed afterwards is saved; the difference that was kept is not", value("fake1", "tv") == 200 and value("fake1", "iso") == 100, cam("fake1"))

    # De novo, agora com Apply; a T7_2 de mentira foi mexida no corpo (ISO 800) e não aceita o ISO de volta
    restart(changed="T7_2 iso 800\n")
    asked = t.wait(lambda: t.dialog_title() == TITLE, 20)
    check(t, "next time the project opens, Stillpoint asks again", bool(asked) and len(rows()) == 3 and "on 2 of the 4 cameras" in text(), (rows(), text()))
    t.dialog_click("Apply the project settings")
    said = t.wait(lambda: toast().startswith("Project settings applied") and toast(), 15)
    check(t, "Apply the project settings: the toast counts the cameras and says what a camera refused", said == "Project settings applied to 1 camera · 1 setting not accepted", said)
    time.sleep(1.5)
    check(t, "... the project keeps its value for the refused setting", value("fake4", "iso") == 400 and value("fake1", "iso") == 100 and value("fake1", "tv") == 200, (cam("fake4"), cam("fake1")))
    # (as câmeras receberam mesmo: uma mudança qualquer faz o app reler; se a SL3_1 não estivesse em ISO 100, o Project mudaria)
    t.js("() => window.readCameraSettings()")
    time.sleep(2)
    check(t, "... and the cameras really got the project values", value("fake1", "iso") == 100 and value("fake1", "tv") == 200 and t.dialog_title() != TITLE, cam("fake1"))

    # Uma câmera do Project desligada e outra diferente: o aviso traz a linha da que falta
    restart(cameras=3)
    asked = t.wait(lambda: t.dialog_title() == TITLE, 20)
    check(t, "a camera not connected and another one changed: the dialog says both", bool(asked) and "on 1 of the 3 cameras" in text() and
          lines() == ["Not connected: Canon EOS Rebel T7 (T7_2), camera 04 of this project."], (text(), lines()))
    t.dialog_click("Keep the cameras as they are")
    time.sleep(4)
    check(t, "... and the warning toast does not repeat what the dialog said", not toast().startswith("The rig is not"), toast())

    # Uma câmera do Project desligada e as outras iguais: só o recado âmbar
    same = "SL3_1 iso 100\nSL3_1 tv 200\n"
    restart(cameras=3, changed=same)
    said = t.wait(lambda: toast().startswith("The rig is not") and toast(), 20)
    check(t, "a camera of the project not connected, nothing to apply: only the warning toast", said == "The rig is not the one of this project · T7_2 not connected" and t.dialog_title() != TITLE, (said, t.dialog_title()))
    check(t, "... it is a warning (amber)", t.js("() => document.getElementById('toast').classList.contains('kind-warn')"))
    check(t, "... the missing camera keeps its place in the project", rig().get("order") == ["fake2", "fake1", "fake3", "fake4"] and len(rig().get("cameras", [])) == 4, rig().get("order"))
    check(t, "... and the others close the gap on screen", on_screen()[:3] == ["T7_1", "SL3_1", "SL3_2"], on_screen())

    # Uma câmera nova: fica como está, entra no fim
    restart(cameras=5, changed=same)
    said = t.wait(lambda: toast().startswith("The rig is not") and toast(), 20)
    fifth = (on_screen() + [""] * 5)[4]
    check(t, "a camera the project does not know: the warning toast names it", bool(said) and said.endswith(" is new") and "not connected" not in said, said)
    check(t, "... it goes to the end, the missing one back to its place", on_screen()[:4] == ["T7_1", "SL3_1", "SL3_2", "T7_2"] and fifth != "", on_screen())
    t.wait(lambda: len(rig().get("cameras", [])) == 5, 8)
    check(t, "... and the project now knows it", len(rig().get("cameras", [])) == 5 and rig().get("order") == ["fake2", "fake1", "fake3", "fake4", "fake5"], rig().get("order"))

    # Sem Project: padrão de fábrica e a ordem em que as câmeras conectaram; nada é gravado
    before = open(rig_file).read()
    t.js("() => window.projectClose()")
    t.wait(lambda: panel() == ["0", "1", "10"], 8)
    check(t, "closing the project: the Bullet time panel goes to the factory default", panel() == ["0", "1", "10"], panel())
    t.wait(lambda: on_screen()[:2] == ["SL3_1", "T7_1"], 8)
    check(t, "... the cameras go back to the order they connected in", on_screen()[:4] == ["SL3_1", "T7_1", "SL3_2", "T7_2"], on_screen())
    set_input("countdown", "7")
    t.js("() => window.setCameraSetting('SL3_2', 'av', '110')")
    time.sleep(2.5)
    check(t, "... and nothing done without a project is written to it", open(rig_file).read() == before and t.dialog_title() != TITLE)
    # Abrir o Project de novo: a SL3_2 ficou diferente (f/11 na câmera, f/8 no Project)
    t.js("(f) => window.projectOpen(f)", t.project)
    asked = t.wait(lambda: t.dialog_title() == TITLE, 20)
    check(t, "opening the project again: the panel is the project's, and Stillpoint asks about the camera changed meanwhile", bool(asked) and panel()[0] == "3" and
          len(rows()) == 1 and rows()[0].endswith("(SL3_2)|Aperture|f/11|f/8"), (panel(), rows()))
    check(t, "... with the cameras in the order of the project again", on_screen()[:4] == ["T7_1", "SL3_1", "SL3_2", "T7_2"], on_screen())
    t.dialog_click("Apply the project settings")
    said = t.wait(lambda: toast().startswith("Project settings applied") and toast(), 15)
    check(t, "... Apply: one camera, nothing refused", said == "Project settings applied to 1 camera", said)
    # ⌘Z do Apply: a câmera volta ao que tinha e o Project não muda; ⇧⌘Z aplica de novo
    time.sleep(1.5)
    applied = open(rig_file).read()
    def reopen():
        t.js("() => window.projectClose()")
        time.sleep(1.5)
        t.js("(f) => window.projectOpen(f)", t.project)
    t.undo()
    kind = lambda k: t.js("(k) => document.getElementById('toast').classList.contains('kind-' + k)", k)
    said = t.wait(lambda: kind("undo") and toast().startswith("Apply the project settings") and toast(), 10)
    time.sleep(2)
    check(t, "undo after Apply the project settings: the toast says so and the project does not change", said == "Apply the project settings (1 camera)" and open(rig_file).read() == applied and t.dialog_title() != TITLE, said)
    reopen()
    asked = t.wait(lambda: t.dialog_title() == TITLE, 20)
    check(t, "... the camera is back to what it had (opening the project again asks the same)", bool(asked) and len(rows()) == 1 and rows()[0].endswith("(SL3_2)|Aperture|f/11|f/8"), rows())
    t.dialog_click("Apply the project settings")
    t.wait(lambda: toast().startswith("Project settings applied"), 15)
    time.sleep(1.5)
    t.undo()
    t.wait(lambda: kind("undo") and toast().startswith("Apply the project"), 10)
    time.sleep(1.5)
    t.redo()
    said = t.wait(lambda: kind("redo") and toast().startswith("Apply the project settings") and toast(), 10)
    time.sleep(2)
    reopen()
    time.sleep(6)
    check(t, "redo: the project settings are applied again (opening the project again asks nothing)", bool(said) and t.dialog_title() != TITLE and open(rig_file).read() == applied, (said, t.dialog_title()))
    # Deixa como estava para o que vier depois
    set_input("countdown", "0")
    t.js("() => window.setOrder('SL3_1', 'T7_1', 'SL3_2', 'T7_2', '" + fifth + "')")
    time.sleep(1.5)
    restart(changed="SL3_1 iso 100\nSL3_1 tv 200\n")
    time.sleep(3)
    t.js("() => window.setCameraSetting('SL3_1', 'iso', '400')")
    t.js("() => window.setCameraSetting('SL3_1', 'tv', '125')")
    time.sleep(2)


def scenario_photoshop(t, name, photos):
    line("\n== 19. Edit in Photoshop: working copy, save, the PS mark, RAW and Lightroom dialogs")
    import struct
    from PIL import Image
    def tiff_info(path):
        """Largura, altura e bits por cor de um TIFF simples (o que o Stillpoint grava)."""
        with open(path, "rb") as f:
            d = f.read(4096)
        if d[:4] != b"II*\x00":
            return None
        ifd = struct.unpack_from("<I", d, 4)[0]
        n = struct.unpack_from("<H", d, ifd)[0]
        out = {}
        for i in range(n):
            tag, typ, count, value = struct.unpack_from("<HHII", d, ifd + 2 + i * 12)
            if tag in (256, 257):
                out[tag] = value
            if tag == 258:
                out[258] = struct.unpack_from("<H", d, value)[0] if count > 2 else value & 0xFFFF
            if tag == 34675:
                out["icc"] = count
        return out.get(256), out.get(257), out.get(258), out.get("icc", 0)
    opened = lambda: [l for l in open(os.path.join(t.data, "test-opened.txt")).read().splitlines() if "Photoshop" in l] if os.path.exists(os.path.join(t.data, "test-opened.txt")) else []
    toast = lambda: t.js("() => { const x = document.getElementById('toast'); return x.classList.contains('hidden') ? '' : x.querySelector('.toast-text').textContent; }")
    block = lambda: t.js("() => { const b = document.querySelector('#exportSettings .ps-block'); return b ? { state: (b.querySelector('.lr-state') || {}).textContent || '', buttons: [...b.querySelectorAll('.lr-actions button')].map(x => x.textContent.trim()), tip: !!b.querySelector('.lr-head .info-tip'), notes: b.querySelectorAll('.export-note').length } : null; }")
    marks = lambda: t.js("() => [...document.querySelectorAll('#exportSettings .export-strip > li')].map(li => [...li.querySelectorAll('.frame-app')].map(b => b.querySelector('.edit-dot') ? b.textContent.trim().toLowerCase() : b.textContent.trim()).join('+'))")  # (âmbar em minúsculas, verde em maiúsculas)
    def pick(k):
        t.page.click("#exportSettings .export-strip > li:nth-child(%d)" % k)
        time.sleep(0.5)
    def ps_button(starts):
        return t.js("(s) => { const b = [...document.querySelectorAll('#exportSettings .ps-block button')].find(x => x.textContent.trim().startsWith(s)); if (!b) return false; b.click(); return true; }", starts)
    def save_as_photoshop(path, color, size=None):
        """O que o ⌘S do Photoshop faz: troca o arquivo, no mesmo lugar (aqui um TIFF de 8 bits de uma cor só)."""
        w, h, _, _ = tiff_info(path) if size is None else (size[0], size[1], 0, 0)
        time.sleep(1.1)
        Image.new("RGB", (w, h), color).save(path, format="TIFF")
    pix = """(sel) => new Promise((done) => { const i = document.querySelector(sel); if (!i || !i.src) return done(null);
      const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); done([...x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data].slice(0, 3)); }; im.onerror = () => done(null); im.src = i.src; })"""
    near = lambda p, c: p is not None and all(abs(p[i] - c[i]) < 30 for i in range(3))

    t.dismiss()
    t.close_export()
    s = t.shoot()
    t.dismiss()
    if not s:
        check(t, "a new session for this scenario", False)
        return
    edited_dir = os.path.join(t.project, "Edited", s)
    o = t.originals(s)
    files = sorted(f for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    copy3 = os.path.join(edited_dir, os.path.splitext(files[2])[0] + ".tif")
    t.export_edit(s)
    t.js("() => document.activeElement && document.activeElement.blur()")
    t.page.keyboard.press(" ")   # (pausa a prévia: a foto selecionada fica parada)
    time.sleep(0.3)
    pick(3)

    # Os dois blocos compactos (pedido do dono): a explicação num "?", sem legenda embaixo
    b = block()
    check(t, "2 Edit has a Photoshop box under Lightroom Classic, with the button of the selected photo", bool(b) and b["buttons"] == ["Edit photo 03 in Photoshop"] and b["state"] == "", b)
    check(t, "... compact: the explanation is in a ? next to the title, no caption under the buttons", bool(b) and b["tip"] and b["notes"] == 0, b)
    check(t, "... the Lightroom Classic box too", t.js("() => { const b = document.querySelector('#exportSettings .app-pair .lr-block:not(.ps-block)'); return !!b.querySelector('.lr-head .info-tip') && b.querySelectorAll('.export-note').length === 0; }"))
    pick(1)
    check(t, "the button follows the selected photo", block()["buttons"] == ["Edit photo 01 in Photoshop"], block())
    pick(3)
    t.page.click("#exportSettings .export-strip > li:nth-child(3)", button="right")
    time.sleep(0.3)
    items = t.js("() => [...document.querySelectorAll('.app-menu button')].map(b => b.textContent.trim())")
    t.page.keyboard.press("Escape")
    check(t, "right-click on a photo: Edit just this photo in Photoshop", "Edit just this photo in Photoshop" in items, items)

    # Abrir: a cópia de trabalho (TIFF de 16 bits, com o perfil), a marca PS, e a foto ainda não conta como editada
    before = len(opened())
    ps_button("Edit photo 03 in Photoshop")
    t.wait(lambda: os.path.exists(copy3), 10)
    info = tiff_info(copy3) if os.path.exists(copy3) else None
    w0, h0 = Image.open(os.path.join(o, files[2])).size
    check(t, "Edit photo 03 in Photoshop: a working copy in the Edited folder, with the photo's name", bool(info), os.listdir(edited_dir) if os.path.isdir(edited_dir) else None)
    check(t, "... a 16-bit TIFF with a colour profile, the whole photo (As shot)", bool(info) and info[2] == 16 and info[3] > 100 and (info[0], info[1]) == (w0, h0), (info, (w0, h0)))
    t.wait(lambda: len(opened()) > before, 5)
    check(t, "... Photoshop is asked to open that file", len(opened()) > before and opened()[-1].endswith(os.path.basename(copy3)) and "Adobe Photoshop 2026.app" in opened()[-1], opened()[-1:] )
    t.wait(lambda: "ps" in marks()[2], 8)
    b = block()
    check(t, "... PS on the thumbnail, no ED: it is not an edited photo yet", marks()[2] == "ps" and t.session(s)["edited"] == 0, (marks(), t.session(s)["edited"]))
    check(t, "... the box says it waits for the save, with Open photo 03 again and Cancel", bool(b) and b["state"] == "Photo 03 sent to Photoshop · save there (⌘S) to bring it back" and b["buttons"] == ["Open photo 03 again", "Cancel"], b)

    # Cancel: a marca sai e a cópia é apagada
    ps_button("Cancel")
    t.wait(lambda: not os.path.exists(copy3), 8)
    t.wait(lambda: marks()[2] == "", 8)
    check(t, "Cancel: the working copy is removed and the PS mark goes away", not os.path.exists(copy3) and marks()[2] == "" and block()["buttons"] == ["Edit photo 03 in Photoshop"], (marks(), block()))

    # De novo, e agora o Photoshop salva
    ps_button("Edit photo 03 in Photoshop")
    t.wait(lambda: os.path.exists(copy3) and "ps" in marks()[2], 10)
    save_as_photoshop(copy3, (40, 90, 200))
    said = t.wait(lambda: toast().startswith("Photo 03 edited in Photoshop") and toast(), 15)
    check(t, "saving in Photoshop: the toast says the photo was edited", bool(said), toast())
    t.wait(lambda: marks()[2] == "PS", 8)
    b = block()
    check(t, "... ED on the thumbnail, with a still PS next to it (edited in Photoshop); the session counts 1 edited photo", marks()[2] == "PS" and t.session(s)["edited"] == 1 and
          t.js("() => { const b = document.querySelector('#exportSettings .export-strip > li:nth-child(3) .frame-app.ps-done'); return !!b && !b.classList.contains('live') && !b.querySelector('.edit-dot'); }"), (marks(), t.session(s)["edited"]))
    check(t, "... the box: Photo 03 edited in Photoshop, Edit photo 03 again in Photoshop", bool(b) and b["state"] == "Photo 03 edited in Photoshop" and b["buttons"] == ["Edit photo 03 again in Photoshop"], b)
    check(t, "... the Edited photos strip, above the two programs, counts it, has Revert to original… and the framing line", t.js("() => { const b = document.querySelector('#exportSettings .ed-strip'); return !!b && b.querySelector('.lr-title').textContent === 'Edited photos' && b.textContent.includes('1 of 4 photos edited') && [...b.querySelectorAll('button')].some(x => x.textContent.trim() === 'Revert to original…') && [...b.querySelectorAll('.export-note')].some(n => n.textContent.startsWith('Framing locked (')) && b.compareDocumentPosition(document.querySelector('#exportSettings .app-pair')) & Node.DOCUMENT_POSITION_FOLLOWING; }"))
    check(t, "... Lightroom Classic and Photoshop side by side, with only their own buttons", t.js("() => { const p = document.querySelector('#exportSettings .app-pair'); const [a, b] = [...p.children].map(x => x.getBoundingClientRect()); const lr = p.children[0]; return p.children.length === 2 && Math.abs(a.top - b.top) < 2 && b.left > a.right && !lr.textContent.includes('photos edited') && ![...lr.querySelectorAll('button')].some(x => x.textContent.includes('Revert')); }"))
    pick(3)
    check(t, "... the large preview shows what Photoshop saved", t.wait(lambda: near(t.js(pix, "#exportSettings .edit-preview > img"), (40, 90, 200)), 10), t.js(pix, "#exportSettings .edit-preview > img"))
    # Outro ⌘S: a foto é atualizada
    save_as_photoshop(copy3, (200, 60, 40))
    pick(3)
    check(t, "saving again in Photoshop updates the photo here", t.wait(lambda: (pick(3), near(t.js(pix, "#exportSettings .edit-preview > img"), (200, 60, 40)))[1], 14), t.js(pix, "#exportSettings .edit-preview > img"))
    before = len(opened())
    ps_button("Edit photo 03 again in Photoshop")
    t.wait(lambda: len(opened()) > before, 5)
    check(t, "Edit photo 03 again in Photoshop opens the same file", len(opened()) > before and opened()[-1].endswith(os.path.basename(copy3)) and len([f for f in os.listdir(edited_dir) if f.endswith('.tif')]) == 1, opened()[-1:])

    # Outra proporção salva pelo Photoshop (a foto foi cortada lá): recusada, como qualquer editada
    # (só com proporção na sessão; aqui As shot não confere nada)

    # A foto com acabamento do Photoshop fica fora do Lightroom (caminho A, 2026-11-12)
    lrbox = lambda: t.js("() => { const b = document.querySelector('#exportSettings .app-pair > .lr-block:not(.ps-block)'); const n = b.querySelector('.stay-note'); const st = b.querySelector('.lr-state'); return { buttons: [...b.querySelectorAll('.lr-actions button')].map(x => x.textContent.trim()), note: n ? n.textContent : '', state: st ? st.textContent.trim() : '' }; }")
    check(t, "a photo edited in Photoshop stays out of Lightroom: the box says so and the button loses 'again'", lrbox()["note"] == "Photo 03 stays out: edited in Photoshop." and lrbox()["buttons"] == ["Edit in Lightroom Classic"], lrbox())
    t.page.click("#exportSettings .export-strip > li:nth-child(3)", button="right")
    time.sleep(0.3)
    t.js("() => [...document.querySelectorAll('.app-menu button')].find(b => b.textContent.trim() === 'Edit just this photo in Lightroom Classic').click()")
    asked = t.wait(lambda: t.dialog_title().startswith("Photo 03 was edited in Photoshop"), 6)
    check(t, "... asking Lightroom for that photo explains and offers Revert to original, with a ? for the details", bool(asked) and t.js("() => [...document.querySelectorAll('#dialogActions button')].map(b => b.textContent.trim())") == ["Cancel", "Revert to original"]
          and t.js("() => { const q = document.querySelector('#dialogTitle .info-tip'); return !!q && q.getAttribute('aria-label').includes('Stillpoint trash'); }"), t.dialog_title())
    t.dialog_click("Cancel")
    time.sleep(0.4)
    # Revert to original nessa janela reverte direto; na lixeira a editada aparece como do Photoshop
    t.page.click("#exportSettings .export-strip > li:nth-child(3)", button="right")
    time.sleep(0.3)
    t.js("() => [...document.querySelectorAll('.app-menu button')].find(b => b.textContent.trim() === 'Edit just this photo in Lightroom Classic').click()")
    t.wait(lambda: (t.dialog_title() or "").startswith("Photo 03 was edited in Photoshop"), 6)
    t.dialog_click("Revert to original")
    t.wait(lambda: marks()[2] == "", 10)
    base3 = os.path.splitext(files[2])[0]
    tr = t.js("async () => { const r = await window.trashList(); return (r.items || r.list || r).filter(x => x.editsOnly); }")
    check(t, "... Revert to original there reverts at once, and the trash knows the edit came from Photoshop", marks()[2] == "" and any(base3 in (x.get("psBases") or []) for x in tr), (marks(), [(x.get("bases"), x.get("psBases")) for x in tr]))
    t.undo()
    t.wait(lambda: marks()[2] == "PS", 10)
    check(t, "... undo brings the Photoshop edit back", marks()[2] == "PS", marks())
    t.dismiss()
    t.lr_block_button("Edit in Lightroom Classic")
    asked = t.wait(lambda: t.dialog_title() == "Photo 03 stays out of Lightroom Classic", 6)
    check(t, "... sending the session: a dialog says which photo stays out, the first time", bool(asked) and t.js("() => [...document.querySelectorAll('#dialogActions button')].map(b => b.textContent.trim())") == ["Cancel", "Send 3 photos"], t.dialog_title())
    t.dialog_click("Send 3 photos")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Send as shot")
    t.wait(lambda: t.edit_tag(s), 15)
    t.dismiss_other()
    t.wait(lambda: "lr" in marks()[0], 8)
    check(t, "... the session goes without it: 3 photos in Lightroom Classic, photo 03 keeps PS and ED only", lrbox()["state"] == "In Lightroom Classic · 3 photos" and marks()[2] == "PS" and "lr" in marks()[1] and lrbox()["note"] == "Photo 03 stays out: edited in Photoshop."
          and len(t.lr.requests[-1]["photos"]) == 3 if hasattr(t.lr, "requests") and t.lr.requests else lrbox()["state"] == "In Lightroom Classic · 3 photos" and marks()[2] == "PS", (lrbox(), marks()))
    pick(1)
    ps_button("Edit photo 01 in Photoshop")
    asked = t.wait(lambda: t.dialog_title() == "Photo 01 is in Lightroom Classic", 6)
    check(t, "a photo that is in Lightroom Classic: Stillpoint asks first", bool(asked) and t.js("() => [...document.querySelectorAll('#dialogActions button')].map(b => b.textContent.trim())") == ["Cancel", "Open in Photoshop anyway"], t.dialog_title())
    t.dialog_click("Cancel")
    time.sleep(0.5)
    copy1 = os.path.join(edited_dir, os.path.splitext(files[0])[0] + ".tif")
    check(t, "... Cancel opens nothing", not os.path.exists(copy1))
    ps_button("Edit photo 01 in Photoshop")
    t.wait(lambda: t.dialog_title() == "Photo 01 is in Lightroom Classic", 6)
    t.dialog_click("Open in Photoshop anyway")
    check(t, "... Open in Photoshop anyway makes the working copy", t.wait(lambda: os.path.exists(copy1), 10))
    # Salva no Photoshop: a foto sai do Lightroom
    time.sleep(1.2)
    save_as_photoshop(copy1, (90, 40, 160))
    t.wait(lambda: marks()[0] == "PS", 15)
    check(t, "saving in Photoshop a photo that is in Lightroom: it leaves Lightroom (PS and ED, no LR; 2 photos there)", marks()[0] == "PS" and lrbox()["state"] == "In Lightroom Classic · 2 photos" and lrbox()["note"] == "Photos 01, 03 stay out: edited in Photoshop.", (marks(), lrbox()))
    t.dismiss()
    os.remove(copy1)
    t.wait(lambda: marks()[0] == "", 15)
    # Segundo envio da mesma sessão, com a mesma foto protegida: sem janela, só o aviso âmbar
    t.lr_block_button("Done editing")
    time.sleep(1.5)
    t.dismiss()
    t.lr_block_button("Edit in Lightroom Classic")
    if t.wait(lambda: t.dialog_title() == "Crop before Lightroom Classic?", 2):
        t.dialog_click("Send as shot")
    warned = t.wait(lambda: toast().startswith("3 photos sent to Lightroom Classic · Photo 03 stays out: edited in Photoshop") and toast(), 20)
    check(t, "... the second time: no dialog, an amber toast after sending", bool(warned) and t.dialog_title() != "Photo 03 stays out of Lightroom Classic" and t.js("() => document.querySelector('#toast').classList.contains('kind-warn')"), (toast(), t.dialog_title()))
    t.dismiss_other()
    # O Lightroom exporta por cima da foto 03: a editada deixa de ser a do Photoshop, o PS parado sai
    t.lr.set_edit(os.path.join(o, files[2]), (20, 200, 30))
    t.lr.export(o, t.project, s)
    t.wait(lambda: marks()[2].upper() == "LR", 15)
    pick(3)
    check(t, "a later Export to Stillpoint from Lightroom replaces the Photoshop edit: only ED stays", marks()[2].upper() == "LR" and block()["state"] == "", (marks(), block()))
    t.lr_block_button("Done editing")
    time.sleep(1.5)
    t.dismiss()
    # Editada do Lightroom aberta e salva no Photoshop: a miniatura mostra os dois programas, em verde (sem ED)
    check(t, "an edit from Lightroom shows a green LR on the thumbnail (no ED)", marks()[2] == "LR", marks())
    lr_file = [f for f in os.listdir(edited_dir) if f.startswith(os.path.splitext(files[2])[0] + ".")]
    pick(3)
    ps_button("Edit photo 03 in Photoshop")
    time.sleep(2.5)
    if lr_file:
        fp = os.path.join(edited_dir, lr_file[0])
        im = Image.open(fp); size = im.size; fmt = im.format; im.close()
        Image.new("RGB", size, (210, 40, 120)).save(fp, format=fmt)
    t.wait(lambda: marks()[2] == "LR+PS", 15)
    check(t, "... saved in Photoshop afterwards: green LR and green PS", marks()[2] == "LR+PS", (marks(), lr_file))
    t.dismiss()

    # Original RAW sem editada: não abre, explica e oferece o Lightroom
    raw = os.path.join(o, os.path.splitext(files[3])[0] + ".CR2")
    os.rename(os.path.join(o, files[3]), raw)
    t.close_export()
    time.sleep(1.0)
    t.export_edit(s)
    t.js("() => document.activeElement && document.activeElement.blur()")
    t.page.keyboard.press(" ")
    time.sleep(0.3)
    pick(4)
    ps_button("Edit photo 04 in Photoshop")
    asked = t.wait(lambda: t.dialog_title() == "Photo 04 is a RAW file", 6)
    check(t, "a RAW original with no edited version: the dialog explains and offers Lightroom Classic", bool(asked) and t.js("() => [...document.querySelectorAll('#dialogActions button')].map(b => b.textContent.trim())") == ["Cancel", "Edit in Lightroom Classic"], t.dialog_title())
    t.dialog_click("Cancel")
    os.rename(raw, os.path.join(o, files[3]))
    t.close_export()

    # Sessão com proporção: a cópia vai recortada, e um arquivo salvo com outra forma é recusado
    s2 = t.shoot()
    t.dismiss()
    if not s2:
        check(t, "a second session for this scenario", False)
        return
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.5)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.4)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s2)
    time.sleep(0.4)
    t.js("() => [...document.querySelectorAll('#exportSettings .segmented button')].find(b => b.textContent === '1:1').click()")
    time.sleep(0.6)
    t.export_edit(s2)
    t.js("() => document.activeElement && document.activeElement.blur()")
    t.page.keyboard.press(" ")
    time.sleep(0.3)
    pick(1)
    o2 = t.originals(s2)
    files2 = sorted(f for f in os.listdir(o2) if not f.startswith(".") and f != "session.json")
    sq = os.path.join(t.project, "Edited", s2, os.path.splitext(files2[0])[0] + ".tif")
    ps_button("Edit photo 01 in Photoshop")
    t.wait(lambda: os.path.exists(sq), 10)
    info = tiff_info(sq) if os.path.exists(sq) else None
    check(t, "a 1:1 session: the working copy is already cut to the framing (square)", bool(info) and info[0] == info[1] and info[2] == 16, info)
    t.wait(lambda: marks()[0] == "ps", 8)
    t.close_export()
    t.page.click("#saveBtn")
    t.wait(lambda: t.export_open(), 5)
    time.sleep(0.6)
    t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
    time.sleep(0.5)
    t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s2)
    time.sleep(0.5)
    check(t, "... the framing is locked in step 1 while the photo is open in Photoshop", t.js("() => { const g = [...document.querySelectorAll('#exportSettings .segmented button')].filter(b => ['3:2','4:3','16:9','1:1','As shot'].includes(b.textContent)); return g.length > 0 && g.every(b => b.disabled); }"))
    t.export_edit(s2)
    t.js("() => document.activeElement && document.activeElement.blur()")
    t.page.keyboard.press(" ")
    time.sleep(0.3)
    pick(1)
    save_as_photoshop(sq, (30, 160, 90))
    t.wait(lambda: marks()[0] == "PS", 15)
    check(t, "... saved with the same shape: it is the edited photo", marks()[0] == "PS" and t.session(s2)["edited"] == 1, marks())
    save_as_photoshop(sq, (30, 160, 90), size=(300, 200))
    t.wait(lambda: t.session(s2)["edited"] == 0, 15)
    check(t, "... saved with another shape (cut in Photoshop): refused, as any edited file", t.session(s2)["edited"] == 0 and bool(next((p for p in t.session(s2)["photos"] if p.get("refused")), None)), [p.get("refused") for p in t.session(s2)["photos"]])
    # A recusada não tem como ser consertada se o Photoshop já fechou: Revert to original… também vale para ela
    t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .ed-strip'); return !!b && b.textContent.includes('1 not used') && [...b.querySelectorAll('button')].some(x => x.textContent.trim() === 'Revert to original…'); }"), 10)
    check(t, "... the Edited photos strip offers Revert to original… for the photo that was not used", t.lr_block_button("Revert to original…"))
    asked = t.wait(lambda: t.dialog_title() == "Revert 1 photo to the original?", 5)
    t.dialog_click("Revert to original")
    t.wait(lambda: not os.path.exists(sq), 8)
    time.sleep(1.5)
    check(t, "... it moves the refused file to the trash and the photo is as shot again", bool(asked) and not os.path.exists(sq) and not any(p.get("refused") for p in t.session(s2)["photos"]) and t.session(s2)["edited"] == 0, (t.dialog_title(), [p.get("refused") for p in t.session(s2)["photos"]]))
    t.undo()
    t.wait(lambda: os.path.exists(sq), 8)
    check(t, "... and undo brings the file back", os.path.exists(sq))
    os.remove(sq)
    time.sleep(3)
    t.dismiss()
    t.close_export()


def dismiss_delete(self):
    if self.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden')"):
        self.js("() => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => /^Delete/.test(x.textContent.trim())); b && b.click(); }")
        time.sleep(0.6)


T.dismiss_delete = dismiss_delete


def scenario_camera_tags(t, name, photos):
    line("\n== 22. Camera settings: many warning tags next to a camera name")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "6"
    t.env["STILLPOINT_FAKE_TAGS"] = "1"
    try:
        t.restart_app()
        t.dismiss()
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.5)
        rows = t.js("() => [...document.querySelectorAll('#csBody td.name')].filter(td => /^0[1-6] /.test(td.textContent)).map(td => [td.querySelectorAll('.cs-focus-tag.warn').length, (td.querySelector('.cs-tag-more') || { dataset: {} }).dataset.count || '', !!td.querySelector('.cs-tag-more svg')])")
        # 01: nenhum aviso; 02: always 16:9 + 1; 03: 2; 04: 3; 05: 4; 06: 5
        check(t, "tags: no warning tags next to the name; a camera with warnings shows one alert (the triangle), with 1 or many",
              rows == [[0, "", False], [0, "2", True], [0, "2", True], [0, "3", True], [0, "4", True], [0, "5", True]], rows)
        # Com o MF junto (como nas câmeras de verdade), nada é cortado: o contador fica inteiro dentro da célula
        t.js("() => document.querySelectorAll('#csBody td.name').forEach(td => { if (!/^0[1-6] /.test(td.textContent) || td.querySelector('.cs-focus-tag:not(.warn)')) return; const m = document.createElement('span'); m.className = 'cs-focus-tag'; m.textContent = 'MF'; td.insertBefore(m, td.querySelector('.cs-focus-tag, small')); })")
        time.sleep(0.3)
        check(t, "tags: with the MF tag too, the alert is whole inside the name cell (nothing cut with '…')",
              t.js("() => [...document.querySelectorAll('#csBody td.name .cs-tag-more')].every(m => { const r = m.getBoundingClientRect(), c = m.closest('td').getBoundingClientRect(); return r.width > 8 && r.right <= c.right + 0.5 && getComputedStyle(m.closest('td')).overflow === 'visible'; })"))
        t.shot("camera-tags-mf")
        t.page.hover("#csBody tr:nth-of-type(6) td.name .cs-tag-more")
        time.sleep(0.4)
        pop = t.js("() => { const p = document.querySelector('.cs-tag-pop'); return p ? [p.querySelector('b').textContent, p.querySelectorAll('.cs-tag-pop-row').length, p.getBoundingClientRect().bottom <= window.innerHeight] : null; }")
        check(t, "tags: the mouse over the alert opens the whole list, inside the window", bool(pop) and pop[1] >= 3 and pop[0] == "%d warnings" % pop[1] and pop[2], pop)
        t.shot("camera-tags")
        t.page.mouse.move(5, 5)
        time.sleep(0.3)
        check(t, "tags: the list closes when the mouse leaves", t.js("() => !document.querySelector('.cs-tag-pop')"))
        t.js("() => document.querySelector('#csBody .cs-tag-more').click()")
        time.sleep(0.2)
        opened = t.js("() => !!document.querySelector('.cs-tag-pop')")
        t.button("Done")
        time.sleep(0.3)
        check(t, "tags: a click opens the list too, and closing Camera settings closes it", opened and t.js("() => !document.querySelector('.cs-tag-pop')"))
    finally:
        del t.env["STILLPOINT_FAKE_TAGS"]
        t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
        t.restart_app()


def _mark_centers(path):
    """Os centros das bolas vermelha, verde e azul numa foto da cena da haste (frações da foto)."""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((w // 4, h // 4))
    sums = {k: [0, 0, 0] for k in ("r", "g", "b")}
    for i, (r, g, b) in enumerate(small.getdata()):
        x, y = i % small.width, i // small.width
        k = "r" if r > 150 and g < 90 and b < 90 else "g" if g > 120 and r < 90 and b < 110 else "b" if b > 150 and r < 90 and g < 120 else None
        if k:
            sums[k][0] += x; sums[k][1] += y; sums[k][2] += 1
    return [((sums[k][0] / sums[k][2] + 0.5) / small.width, (sums[k][1] / sums[k][2] + 0.5) / small.height) if sums[k][2] else None for k in ("r", "g", "b")]


def scenario_align_cameras(t, name, photos):
    line("\n== 21. Align cameras in the Test shot (the pole scene)")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_FOCAL"] = "35"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    t.env["STILLPOINT_TEST_SAVE_FOLDER"] = os.path.join(t.tmp, "bands-out")
    os.makedirs(t.env["STILLPOINT_TEST_SAVE_FOLDER"], exist_ok=True)
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        check(t, "align: the Test shot shows the photos", t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30))
        check(t, "align: 'Align cameras' is next to 'Hide photos'",
              t.js("() => [...document.querySelectorAll('#csGallery .gallery-actions button')].map(b => b.textContent.trim()).join('|')") == "Align cameras|Hide photos")
        t.button("Align cameras")
        check(t, "align: step 1 Prepare, with the three objects, the line with the PDF button under them, and Fire",
              t.js("() => !document.getElementById('csAlign').classList.contains('hidden') && document.querySelector('#csAlignStep1').classList.contains('on') && document.querySelectorAll('#csAlignMain .al-obj').length === 3 && !!document.querySelector('#csAlignMain .al-bands #csAlignBands')")
              and t.js("() => getComputedStyle(document.getElementById('csBody')).display === 'none' && getComputedStyle(document.querySelector('.cs-head')).display === 'none'"))
        t.shot("align-prepare")
        # Printed bands: o app grava a folha das faixas em PDF na pasta escolhida
        save_dir = t.env.get("STILLPOINT_TEST_SAVE_FOLDER") or ""
        t.js("() => document.getElementById('csAlignBands').click()")
        pdf = os.path.join(save_dir, "Stillpoint bands.pdf")
        ok = bool(save_dir) and t.wait(lambda: os.path.exists(pdf), 5)
        head = open(pdf, "rb").read() if ok else b""
        check(t, "align: 'Save bands (PDF)' saves 'Stillpoint bands.pdf' (a PDF with the three orange bands)",
              ok and head.startswith(b"%PDF-1.4") and head.count(b"1 0.416 0 rg") == 3 and head.rstrip().endswith(b"%%EOF"), (save_dir, len(head)))
        check(t, "align: Prepare offers 'Use the Test shot photos' next to Fire",
              t.js("() => [...document.querySelectorAll('#csAlignFoot button')].map(b => b.textContent).join('|')") == "Cancel|Use the Test shot photos|Fire")
        before = sorted(os.listdir(os.path.join(t.data, "Order photos")))
        t.button("Use the Test shot photos")
        check(t, "align: it goes to Mark and aim with the photos of the Test shot, without firing again",
              t.wait(lambda: t.js("() => document.querySelector('#csAlignStep2').classList.contains('on') && document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 10)
              and sorted(os.listdir(os.path.join(t.data, "Order photos"))) == before)
        t.button("← Back")
        t.button("Fire")
        check(t, "align: after Fire, step 2 Mark and aim with one row per camera",
              t.wait(lambda: t.js("() => document.querySelector('#csAlignStep2').classList.contains('on') && document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 30))
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        time.sleep(0.5)
        t.shot("align-step2-before")
        # Os cliques na foto da câmera escolhida (a 01), a uns pixels do centro de cada bola
        order_dir = os.path.join(t.data, "Order photos")
        sess = sorted(d for d in os.listdir(order_dir) if not d.startswith("."))[-1]
        sel = t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera")
        f = [x for x in os.listdir(os.path.join(order_dir, sess)) if "_" + sel + "_IMG_" in x][0]
        centers = _mark_centers(os.path.join(order_dir, sess, f))
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        click = lambda k: (t.page.mouse.click(box["x"] + centers[k][0] * box["width"] + 12, box["y"] + centers[k][1] * box["height"] - 9), time.sleep(0.25))
        order = lambda: t.js("() => [...document.querySelectorAll('#csAlignOrder .al-ord')].map(e => e.classList.contains('done') ? 'done' : e.classList.contains('on') ? 'on' : '-').join(' ')")
        check(t, "align: the order of the clicks is shown (Top mark is the one to click), with the link cursor over the photo",
              order() == "on - -" and t.js("() => getComputedStyle(document.querySelector('#csAlignMain .ma-row > .al-photo')).cursor") == "pointer", order())
        check(t, "align: the marking instructions are to the right of the big photo",
              t.js("() => document.getElementById('csAlignOrder').getBoundingClientRect().left >= document.querySelector('#csAlignMain .ma-row > .al-photo').getBoundingClientRect().right"))
        # Zoom: a roda aproxima em volta do mouse; o clique continua caindo no lugar certo da foto
        cx0, cy0 = box["x"] + centers[0][0] * box["width"], box["y"] + centers[0][1] * box["height"]
        t.page.mouse.move(cx0, cy0)
        for _ in range(6):
            t.page.mouse.wheel(0, -100)
            time.sleep(0.05)
        time.sleep(0.4)
        t.shot("align-zoom")
        z = t.js("() => document.querySelector('#csAlignMain .al-ztag').textContent")
        check(t, "align: scrolling over the big photo zooms in around the mouse (the tag shows the zoom)", z.startswith("zoom ") and int(z[5:-1]) > 150, z)
        t.page.mouse.click(cx0 + 20, cy0 - 14)   # 20 px na tela, com zoom, é menos que isso na foto
        time.sleep(0.3)
        dot = t.js("() => { const d = document.querySelector('#csAlignMain .al-dot.num'); return [parseFloat(d.style.left) / 100, parseFloat(d.style.top) / 100]; }")
        zf = int(z[5:-1]) / 100
        check(t, "align: a click with zoom lands on the right place of the photo",
              abs(dot[0] - (centers[0][0] + 20 / zf / box["width"])) < 0.004 and abs(dot[1] - (centers[0][1] - 14 / zf / box["height"])) < 0.004, dot)
        # Espaço + arrastar: a mão aberta sobre a foto; arrastando, a mão fechada vale até fora da foto
        t.page.keyboard.down("Space")
        t.page.mouse.move(cx0, cy0 + 60)
        grab = t.js("() => getComputedStyle(document.querySelector('#csAlignMain .ma-row > .al-photo')).cursor")
        tr0 = t.js("() => document.querySelector('#csAlignMain .al-zoom').style.transform")
        t.page.mouse.down()
        t.page.mouse.move(box["x"] - 80, box["y"] + box["height"] + 60, steps=4)
        grabbing = t.js("() => { const e = document.elementFromPoint(%d, %d); return e ? getComputedStyle(e).cursor : ''; }" % (box["x"] - 80, box["y"] + box["height"] + 60))
        tr1 = t.js("() => document.querySelector('#csAlignMain .al-zoom').style.transform")
        t.page.mouse.up()
        t.page.keyboard.up("Space")
        time.sleep(0.2)
        check(t, "align: holding space shows the open hand over the photo; while dragging, the closed hand stays even outside the photo, and the photo moves",
              grab == "grab" and grabbing == "grabbing" and tr0 != tr1 and not t.js("() => !!document.querySelector('.al-shield')"), (grab, grabbing))
        # Com zoom, arrastar direto (sem espaço) desloca e não marca; clique duplo volta à foto inteira e não marca
        marks0 = t.js("() => document.querySelectorAll('#csAlignMain .al-dot.num').length")
        t.page.mouse.move(cx0, cy0 + 60)
        t.page.mouse.down()
        t.page.mouse.move(cx0 + 50, cy0 + 100, steps=4)
        t.page.mouse.up()
        time.sleep(0.2)
        tr2 = t.js("() => document.querySelector('#csAlignMain .al-zoom').style.transform")
        check(t, "align: with zoom, dragging moves the photo without the space key and does not mark",
              tr2 != tr1 and t.js("() => document.querySelectorAll('#csAlignMain .al-dot.num').length") == marks0, (tr1, tr2))
        t.page.mouse.dblclick(cx0, cy0 + 60)
        time.sleep(0.5)
        check(t, "align: a double-click shows the whole photo again and does not mark",
              t.js("() => document.querySelector('#csAlignMain .al-ztag').classList.contains('hidden')") and t.js("() => document.querySelectorAll('#csAlignMain .al-dot.num').length") == marks0)
        t.js("() => [...document.querySelectorAll('#csAlignMain .al-zbtns button')].find(b => b.textContent === '+').click()")
        zplus = t.js("() => document.querySelector('#csAlignMain .al-ztag').textContent")
        t.js("() => [...document.querySelectorAll('#csAlignMain .al-zbtns button')].find(b => b.textContent === 'Fit').click()")
        check(t, "align: the + button zooms in (150%) and Fit shows the whole photo, without marking",
              zplus == "zoom 150%" and t.js("() => document.querySelector('#csAlignMain .al-ztag').classList.contains('hidden')") and t.js("() => document.querySelectorAll('#csAlignMain .al-dot.num').length") == marks0, zplus)
        for _ in range(6):
            t.page.mouse.wheel(0, -100)
            time.sleep(0.05)
        t.page.keyboard.press("Control+z")
        t.page.mouse.move(cx0, cy0 + 60)
        for _ in range(12):
            t.page.mouse.wheel(0, 100)
            time.sleep(0.05)
        time.sleep(0.4)
        check(t, "align: scrolling back returns to the whole photo", t.js("() => document.querySelector('#csAlignMain .al-ztag').classList.contains('hidden')"))
        click(0)
        click(1)
        check(t, "align: after two clicks, Top and Middle are ticked, Bottom is next, and the clicks are numbered on the photo",
              order() == "done done on" and t.js("() => [...document.querySelectorAll('#csAlignMain .ma-view2 .al-dot.num')].map(e => e.textContent).join('')") == "12", order())
        t.shot("align-clicking")
        t.page.keyboard.press("Control+z")
        time.sleep(0.3)
        check(t, "align: Ctrl+Z takes back the last click", order() == "done on -", order())
        click(1)
        click(2)
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4"), 60)
        t.page.keyboard.press("Control+z")
        time.sleep(0.5)
        check(t, "align: Ctrl+Z right after the third click undoes the marking (two clicks back on the photo, no camera marked)",
              order() == "done done on" and t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length") == 0, order())
        click(2)
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && ![...document.querySelectorAll('#csAlignMain .cs-tag')].some(e => e.textContent === 'Marks not found') && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        check(t, "align: after three clicks, the app finds the marks in every photo and gives each camera its instructions", ok,
              t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item')].map(i => i.textContent).join(' | ')"))
        t.shot("align-step2-after")
        lines = t.js("() => [...document.querySelectorAll('#csAlignMain .ma-under .in-list li')].map(l => l.className + ':' + l.textContent)")
        check(t, "align: the chosen camera shows what to change (aim, level, size)", any(l.startswith("fix:Turn") or l.startswith("ok:Aim") for l in lines)
              and any("Level" in l for l in lines) and any("Size" in l or "Sees it" in l for l in lines), lines)
        # Os cliques foram levados ao centro: o ponto do meio fica perto do centro da bola verde
        mid = t.js("() => { const d = [...document.querySelectorAll('#csAlignMain .ma-row > .al-photo .al-dot')][1]; return d ? [parseFloat(d.style.left) / 100, parseFloat(d.style.top) / 100] : null; }")
        err = abs(mid[0] - centers[1][0]) * 1800 + abs(mid[1] - centers[1][1]) * 1200 if mid else 999
        check(t, "align: the clicks go to the center of the marks (within 4 px)", err < 4, err)
        t.button("Review alignment")
        check(t, "align: step 3 Save shows the four photos already aligned, with the values",
              t.js("() => document.querySelector('#csAlignStep3').classList.contains('on') && document.querySelectorAll('#csAlignMain .sv-cell').length === 4 && /Move .* px/.test(document.querySelector('#csAlignMain .sv-vals').textContent)"))
        keeps = t.js("() => { const e = document.getElementById('csAlignKeeps'); return e ? [e.className, e.textContent] : null; }")
        check(t, "align: step 3 says how much of each photo the alignment keeps (amber warning below 80%)",
              bool(keeps) and "keeps" in keeps[1] and "%" in keeps[1] and (keeps[0] == "al-warn") == (int(keeps[1].split("keeps ")[1].split("%")[0]) < 80), keeps)
        t.shot("align-step3")
        t.button("Save alignment")
        time.sleep(0.6)
        rig = json.load(open(os.path.join(t.project, "stillpoint-rig.json")))
        al = rig.get("alignment") or {}
        check(t, "align: the alignment is saved with the project (stillpoint-rig.json), one entry per camera, by serial number",
              len(al.get("cameras", [])) == 4 and all(c.get("serial") and len(c.get("marks", [])) == 3 for c in al["cameras"]), al.get("cameras"))
        check(t, "align: back in the Test shot, 'Cameras aligned · date' and 'Align again'",
              t.js("() => !document.querySelector('.cs-sheet').classList.contains('aligning') && /^Cameras aligned · /.test(document.querySelector('#csGallery .al-saved').textContent) && document.getElementById('csAlignBtn').textContent === 'Align again'"))
        # Align again › Fire › Fire again: as marcas são achadas sozinhas (pela foto de referência guardada)
        t.button("Align again")
        t.button("Fire")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 30)
        check(t, "align: a new alignment starts without marks (click them again)", t.wait(lambda: t.js("() => /Click the three marks/.test(document.getElementById('csAlignMain').textContent)"), 10))
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        time.sleep(0.5)
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        for (x, y) in centers:
            t.page.mouse.click(box["x"] + x * box["width"], box["y"] + y * box["height"])
            time.sleep(0.25)
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && ![...document.querySelectorAll('#csAlignMain .cs-tag')].some(e => e.textContent === 'Marks not found')"), 60)
        t.button("Fire again")
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && ![...document.querySelectorAll('#csAlignMain .cs-tag')].some(e => e.textContent === 'Marks not found') && !/Finding|Taking/.test(document.getElementById('csAlignFoot').textContent + document.getElementById('csAlignMain').textContent)"), 60)
        check(t, "align: after Fire again, the marks are found in every new photo by themselves", ok)
        t.button("Cancel")
        check(t, "align: Cancel goes back to the Test shot without changing the saved alignment",
              t.js("() => !document.querySelector('.cs-sheet').classList.contains('aligning')") and json.load(open(os.path.join(t.project, "stillpoint-rig.json")))["alignment"]["savedAt"] == al["savedAt"])
        t.button("Done")
        time.sleep(0.5)
        # Uma sessão nova guarda o alinhamento que valia
        s = t.shoot()
        t.dismiss()
        info = {}
        if s:
            p = os.path.join(t.originals(s), "session.json")
            info = json.load(open(p)) if os.path.exists(p) else {}
        check(t, "align: a new session keeps the alignment that was valid when it was shot (session.json)",
              (info.get("alignment") or {}).get("savedAt") == al.get("savedAt"), list(info.keys()))
        # ---- Parte 4: o Export usa o alinhamento da sessão (Align photos, seletor Alignment) ----
        import math
        o = t.originals(s)
        files = sorted(f for f in os.listdir(o) if f.lower().endswith(".jpg"))
        marks = {f: _mark_centers(os.path.join(o, f)) for f in files}
        sizes = {f: Image.open(os.path.join(o, f)).size for f in files}
        def parse(text):
            out = {}
            for item in (text or "").split(";"):
                if ":" in item:
                    f, v = item.rsplit(":", 1)
                    out[f] = [float(x) for x in v.split(",")]
            return out
        def spread(text, only=(0, 1, 2)):
            # onde cada marca cai no canvas, em cada foto; devolve a maior distância entre câmeras (px)
            al = parse(text)
            worst = 0.0
            for k in only:
                pts = []
                for f in files:
                    w, h = sizes[f]
                    dx, dy, sc, rot = (al.get(f) or [0, 0, 1, 0])[:4]
                    x, y = marks[f][k][0] * w - w / 2, marks[f][k][1] * h - h / 2
                    r = math.radians(rot)
                    pts.append((dx + sc * (x * math.cos(r) - y * math.sin(r)), dy + sc * (x * math.sin(r) + y * math.cos(r))))
                for a in pts:
                    for b in pts:
                        worst = max(worst, math.hypot(a[0] - b[0], a[1] - b[1]))
            return worst
        saved = lambda: (t.session(s) or {}).get("align") or ""
        before_px = spread("")
        t.page.click("#saveBtn")
        t.wait(lambda: t.export_open(), 5)
        time.sleep(0.6)
        t.js("() => { const b = document.querySelector('#exportSteps .export-step'); if (!b.classList.contains('on')) b.click(); }")
        time.sleep(0.4)
        t.page.click('#exportList li.export-item[data-name="%s"] .folder-date' % s)
        time.sleep(0.6)
        t.js("() => [...document.querySelectorAll('#exportSettings .segmented:not(.orient-seg) button')].find(x => x.textContent.trim() === '16:9').click()")
        ok = t.wait(lambda: len(parse(saved())) == 4, 15)
        check(t, "export: a session shot with aligned cameras gets the alignment of the rig by itself (one entry per photo)", ok, saved())
        after_px, mid_px = spread(saved()), spread(saved(), (1,))
        # (a marca do meio fica no mesmo ponto; as de cima e de baixo, a poucos pixels: câmeras em alturas diferentes
        # veem a haste um pouco encurtada, e isso mover, girar e mudar o tamanho não desfaz)
        check(t, "export: with it, the middle mark lands on the same point in every photo (within 2 px) and the others within 20 px (before: far apart)",
              mid_px < 2 and after_px < 20 and before_px > 100, (round(before_px, 1), round(mid_px, 1), round(after_px, 1)))
        t.js("() => document.querySelector('#exportSettings .framing-align-btn').click()")
        time.sleep(1.5)
        sel = lambda: t.js("() => { const e = document.getElementById('alignModeSel'); return e ? [e.value, [...e.options].map(o => o.textContent).join('|')] : null; }")
        back_off = lambda: t.js("() => { const b = document.getElementById('alignBackAuto'); return b ? b.disabled : null; }")
        v = sel()
        check(t, "Align photos: the Alignment selector shows 'Rig · date' and 'None', on Rig; 'Back to automatic' is off",
              bool(v) and v[0] == "rig" and v[1].startswith("Rig · ") and v[1].endswith("|None") and back_off() is True, (v, back_off()))
        kp = t.js("() => { const e = document.getElementById('alignKeeps'); return [e.textContent, e.classList.contains('warn')]; }")
        check(t, "Align photos: 'Keeps N% of the photos' next to Alignment, amber below 80%",
              kp[0].startswith("Keeps ") and kp[1] == (int(kp[0].split()[1].rstrip("%")) < 80), kp)
        auto_text = saved()
        b = t.page.locator('#exportSettings .align-ctl', has_text="Size").locator("button").nth(1)
        b.click(modifiers=["Shift"])
        time.sleep(0.8)
        check(t, "Align photos: an adjustment on top turns 'Back to automatic' on", saved() != auto_text and back_off() is False)
        t.button("Back to automatic")
        check(t, "Align photos: 'Back to automatic' returns to the alignment of the rig", t.wait(lambda: saved() == auto_text and back_off() is True, 8), saved())
        t.js("() => { const e = document.getElementById('alignModeSel'); e.value = 'none'; e.dispatchEvent(new Event('change', { bubbles: true })); }")
        check(t, "Align photos: 'None' removes the alignment (photos as they came out)", t.wait(lambda: saved() == "" and (t.session(s) or {}).get("alignMode") == "none", 8), saved())
        time.sleep(1.5)
        check(t, "Align photos: with 'None' it stays without alignment (not applied again by itself)", saved() == "" and sel()[0] == "none")
        t.js("() => { const e = document.getElementById('alignModeSel'); e.value = 'rig'; e.dispatchEvent(new Event('change', { bubbles: true })); }")
        check(t, "Align photos: back to 'Rig', the alignment returns", t.wait(lambda: saved() == auto_text, 8), saved())
        t.shot("align-photos-rig")
        t.close_export()
        # ---- Parte 5: aviso de alinhar de novo quando as câmeras mudam ----
        def test_shot_note():
            t.dismiss()
            t.js("() => document.getElementById('camSettingsBtn').click()")
            time.sleep(1.0)
            t.js("() => document.getElementById('csTest').click()")
            t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
            time.sleep(0.8)
            return t.js("() => { const n = document.querySelector('#csGallery .al-saved'); return [n.textContent, n.classList.contains('warn')]; }")
        note = test_shot_note()
        check(t, "realign: nothing changed, so the Test shot still says 'Cameras aligned · date' (no warning)", note[0].startswith("Cameras aligned · ") and not note[1], note)
        t.button("Done")
        t.env["STILLPOINT_FAKE_FOCAL"] = "35,35,50,35"   # a terceira câmera mudou o zoom
        t.restart_app()
        note = test_shot_note()
        check(t, "realign: one camera changed its zoom: amber 'Align again · SL3_2 zoom changed'", note == ["Align again · SL3_2 zoom changed", True], note)
        t.button("Done")
        time.sleep(0.4)
        s2 = t.shoot()
        t.dismiss()
        info2 = json.load(open(os.path.join(t.originals(s2), "session.json"))) if s2 else {}
        cams2 = sorted(c.get("camera") for c in (info2.get("alignment") or {}).get("cameras", []))
        check(t, "realign: the new session keeps the alignment of the cameras that did not change, and none for the one that changed",
              cams2 == ["SL3_1", "T7_1", "T7_2"], cams2)
        t.env["STILLPOINT_FAKE_FOCAL"] = "35"
        t.env["STILLPOINT_FAKE_CAMERAS"] = "5"            # entrou uma câmera
        t.restart_app()
        note = test_shot_note()
        check(t, "realign: a camera was added: amber 'Align again · 1 new camera'", note == ["Align again · 1 new camera", True], note)
        t.button("Done")
        t.env["STILLPOINT_FAKE_CAMERAS"] = "3"            # saiu uma câmera
        t.restart_app()
        note = test_shot_note()
        check(t, "realign: a camera was removed: amber 'Align again · T7_2 not connected'", note == ["Align again · T7_2 not connected", True], note)
        t.shot("realign-note")
        t.button("Done")
        check(t, "align: no page errors", len(t.errors) == errors_before, t.errors[errors_before:][-3:])
    finally:
        del t.env["STILLPOINT_FAKE_PHOTOS"]
        del t.env["STILLPOINT_TEST_SAVE_FOLDER"]
        del t.env["STILLPOINT_FAKE_FOCAL"]
        t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
        t.restart_app()


def scenario_guided_aim(t, name, photos):
    line("\n== 23. Guided aim: its own window, one camera at a time, with Live aim (simulated cameras)")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    t.env["STILLPOINT_FAKE_LIVE_STEP"] = "0.34"
    aim = None
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
        t.js("() => document.getElementById('csAlignBtn').click()")  # "Align cameras" ou, com alinhamento guardado, "Align again"
        time.sleep(0.3)
        t.button("Use the Test shot photos")
        t.wait(lambda: t.js("() => document.querySelector('#csAlignStep2').classList.contains('on') && document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 20)
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        check(t, "guided aim: the button is under the big photo and waits for the three marks",
              t.js("() => { const b = document.getElementById('csAlignGuided'); return !!b && b.textContent === 'Guided aim' && b.disabled && !!b.closest('.ma-under'); }"))
        order_dir = os.path.join(t.data, "Order photos")
        sess = sorted(d for d in os.listdir(order_dir) if not d.startswith("."))[-1]
        sel = t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera")
        f = [x for x in os.listdir(os.path.join(order_dir, sess)) if "_" + sel + "_IMG_" in x][0]
        centers = _mark_centers(os.path.join(order_dir, sess, f))
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        for k in range(3):
            t.page.mouse.click(box["x"] + centers[k][0] * box["width"] + 5, box["y"] + centers[k][1] * box["height"] - 4)
            time.sleep(0.25)
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        names = t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item')].map(i => [i.querySelector('.al-num').textContent, i.dataset.camera]).sort().map(x => x[1])")
        needs = t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item.needs')].map(i => i.dataset.camera)")
        check(t, "guided aim: the simulated cameras start needing changes", len(needs) >= 3, needs)
        check(t, "guided aim: with the marks, the button is on", t.js("() => !document.getElementById('csAlignGuided').disabled"))
        check(t, "guided aim: the button ends at the right edge of the big photo, on the line of the camera name",
              t.js("() => { const b = document.getElementById('csAlignGuided').getBoundingClientRect(), p = document.querySelector('#csAlignMain .ma-row > .al-photo').getBoundingClientRect(), h = document.querySelector('#csAlignMain .ma-under h4').getBoundingClientRect(); return Math.abs(b.right - p.right) <= 1 && b.top >= p.bottom && Math.abs(b.top - h.top) < 12; }"),
              t.js("() => { const b = document.getElementById('csAlignGuided').getBoundingClientRect(), p = document.querySelector('#csAlignMain .ma-row > .al-photo').getBoundingClientRect(); return [b.right, p.right, b.top, p.bottom]; }"))
        t.shot("guided-aim-button")
        t.js("() => document.getElementById('csAlignGuided').click()")
        import urllib.request
        titles = lambda: json.loads(urllib.request.urlopen("http://127.0.0.1:%d/windows" % PORT).read().decode())
        check(t, "guided aim: it opens its own window, 'Stillpoint · Guided aim'", t.wait(lambda: "Stillpoint · Guided aim" in titles(), 5), titles())
        index = titles().index("Stillpoint · Guided aim")
        aim = t.browser.new_page(viewport={"width": 1140, "height": 760})
        aim_errors = []
        aim.on("pageerror", lambda e: aim_errors.append(str(e)))
        aim.goto("http://127.0.0.1:%d/w/%d/" % (PORT, index))
        aim.wait_for_selector("#gaName", timeout=10000)
        A = lambda expr: aim.evaluate(expr)
        first = [n for n in names if n in needs][0]
        num = lambda cam: "%02d" % (names.index(cam) + 1)
        ok = t.wait(lambda: A("() => document.getElementById('gaName').textContent") == "Camera %s · %s" % (num(first), first), 10)
        check(t, "guided aim: it starts on the first camera that needs a change, by its number and name", ok, A("() => document.getElementById('gaName').textContent"))
        ok = t.wait(lambda: A("() => /^Camera \\d of 4 · live$/.test(document.getElementById('gaInfo').textContent) && !document.getElementById('gaLiveTag').classList.contains('hidden') && (document.getElementById('gaImg').getAttribute('src') || '').startsWith('data:image/jpeg')"), 15)
        check(t, "guided aim: Live aim is on by itself: the live image, the LIVE tag and 'Camera n of 4 · live'", ok,
              A("() => [document.getElementById('gaInfo').textContent, document.getElementById('gaLiveTag').className, (document.getElementById('gaImg').getAttribute('src') || '').length]"))
        aim.screenshot(path=os.path.join(BUILD, "fail-guided-aim-window.png"))
        tabs = lambda: A("() => [...document.querySelectorAll('#gaProg button')].map(b => b.textContent + (b.classList.contains('here') ? '*' : ''))")
        check(t, "guided aim: one tab per camera with its number and state; the one on screen is filled (amber: it needs a change)",
              len(tabs()) == 4 and tabs()[names.index(first)] == num(first) + " · CHANGE*" and sum(x.endswith("*") for x in tabs()) == 1
              and A("() => { const b = document.querySelector('#gaProg button.here'); return b.classList.contains('needs') && getComputedStyle(b).borderRadius === '0px'; }"), tabs())
        check(t, "guided aim: Live aim on, Previous camera, Next camera and the note about one camera at a time",
              A("() => [...document.querySelectorAll('.ga-side button')].map(b => b.textContent).join('|')") == "● Live aim on|← Previous camera|Next camera →"
              and "one camera at a time" in A("() => document.querySelector('.ga-note').textContent"))
        check(t, "guided aim: the options bar is the one of the Live window (Display, Always on top, Close)",
              A("() => [...document.querySelectorAll('#gaTools .segmented button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|')") == "Window*|Full screen"
              and A("() => document.getElementById('gaClose').textContent") == "CloseEsc" and A("() => !!document.getElementById('gaOnTop')"))
        check(t, "guided aim: the main window follows (the same camera is chosen there)", t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera") == first)
        # A câmera simulada vai sendo acertada sozinha: as instruções mudam e a janela passa para a próxima
        second = [n for n in names if n in needs and n != first][0]
        ok = t.wait(lambda: A("() => document.getElementById('gaName').textContent") == "Camera %s · %s" % (num(second), second), 40)
        check(t, "guided aim: when the camera is right, it goes to the next one that needs a change by itself", ok, A("() => [document.getElementById('gaName').textContent, [...document.querySelectorAll('#gaLines li')].map(l => l.className + ':' + l.textContent)]"))
        check(t, "guided aim: the tab of the camera that became right says READY", tabs()[names.index(first)] == num(first) + " · READY", tabs())
        check(t, "guided aim: in the main window that camera shows Ready",
              t.wait(lambda: t.js("(c) => { const i = [...document.querySelectorAll('#csAlignMain .ma-item')].find(x => x.dataset.camera === c); return !!i && i.classList.contains('ready'); }", first), 5))
        check(t, "guided aim: after moving a camera with Live aim, 'Review alignment' asks to fire again",
              t.js("() => { const b = [...document.querySelectorAll('#csAlignFoot button')].find(x => x.textContent === 'Review alignment'); return b.disabled && /Fire again/.test(b.title); }"))
        # Live aim off: a foto parada, sem a etiqueta LIVE
        aim.click("#gaLive")
        ok = t.wait(lambda: A("() => document.getElementById('gaLive').textContent === 'Live aim off' && document.getElementById('gaLiveTag').classList.contains('hidden') && /^Camera \\d of 4$/.test(document.getElementById('gaInfo').textContent)"), 5)
        check(t, "guided aim: clicking 'Live aim on' turns it off (no LIVE tag, the last photo)", ok, A("() => [document.getElementById('gaLive').textContent, document.getElementById('gaInfo').textContent]"))
        cur = A("() => document.getElementById('gaName').textContent")
        time.sleep(2.0)
        check(t, "guided aim: with Live aim off the camera does not change by itself", A("() => document.getElementById('gaName').textContent") == cur)
        # Next camera / Previous camera passam por todas, na ordem, dando a volta; a aba leva direto
        name_of = lambda cam: "Camera %s · %s" % (num(cam), cam)
        cur_cam = [n for n in names if name_of(n) == cur][0]
        nxt = names[(names.index(cur_cam) + 1) % 4]
        aim.click("#gaNext")
        ok = t.wait(lambda: A("() => document.getElementById('gaName').textContent") == name_of(nxt), 5)
        check(t, "guided aim: 'Next camera →' goes to the next camera in order", ok, A("() => document.getElementById('gaName').textContent"))
        aim.click("#gaPrev")
        aim.click("#gaPrev")
        prv = names[(names.index(cur_cam) - 1) % 4]
        ok = t.wait(lambda: A("() => document.getElementById('gaName').textContent") == name_of(prv), 5)
        check(t, "guided aim: '← Previous camera' goes back, also to a camera that is already right (and stays there)", ok and prv == first, A("() => document.getElementById('gaName').textContent"))
        aim.click("#gaProg button:nth-child(%d)" % (names.index(names[3]) + 1))
        ok = t.wait(lambda: A("() => document.getElementById('gaName').textContent") == name_of(names[3]), 5)
        check(t, "guided aim: a click on a camera's tab goes straight to that camera", ok and tabs()[3].endswith("*"), tabs())
        # Liga o Live aim de novo: as câmeras que faltam ficam boas, uma depois da outra
        aim.click("#gaLive")
        ok = t.wait(lambda: A("() => document.getElementById('gaInfo').textContent") == "All 4 cameras ready · live", 90)
        check(t, "guided aim: when every camera is right: 'All 4 cameras ready', every tab READY, and the buttons stay on",
              ok and all("READY" in x for x in tabs()) and A("() => !document.getElementById('gaNext').disabled && !document.getElementById('gaPrev').disabled"), (A("() => document.getElementById('gaInfo').textContent"), tabs()))
        shown = A("() => document.getElementById('gaName').textContent")
        aim.click("#gaNext")
        after = t.wait(lambda: A("() => document.getElementById('gaName').textContent") != shown, 5) and A("() => document.getElementById('gaName').textContent")
        time.sleep(2.5)
        check(t, "guided aim: at the end 'Next camera →' still goes through the cameras, and a camera that is right is not left by itself",
              bool(after) and A("() => document.getElementById('gaName').textContent") == after, after)
        aim.screenshot(path=os.path.join(BUILD, "fail-guided-aim-end.png"))
        # Fire again: as fotos novas saem com as câmeras já acertadas; sem mexer depois, dá para rever o alinhamento
        t.button("Fire again")
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready').length === 4 && !/Finding|Taking/.test(document.querySelector('#csAlign').textContent)"), 60)
        check(t, "guided aim: after 'Fire again' the cameras fixed with Live aim show Ready in the photos too", ok,
              t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item')].map(i => i.dataset.camera + ':' + i.className)"))
        time.sleep(1.5)
        check(t, "guided aim: with new photos and no camera moved since, 'Review alignment' is on again",
              t.js("() => ![...document.querySelectorAll('#csAlignFoot button')].find(x => x.textContent === 'Review alignment').disabled"))
        # Display: tela cheia (um monitor só: direto) e de volta
        aim.mouse.move(300, 300)
        aim.mouse.move(320, 320)
        check(t, "guided aim: moving the mouse shows the options bar", t.wait(lambda: A("() => document.getElementById('aim').classList.contains('tools-visible')"), 3))
        aim.click("#gaTools [data-display=full]")
        check(t, "guided aim: 'Full screen' makes everything bigger and hides 'Always on top'",
              t.wait(lambda: A("() => document.getElementById('aim').classList.contains('full') && document.getElementById('gaOnTopLabel').classList.contains('hidden')"), 3))
        aim.screenshot(path=os.path.join(BUILD, "fail-guided-aim-full.png"))
        saved = open(os.path.join(t.data, "settings.txt")).read()
        check(t, "guided aim: the display choice is saved for next time", 'aim={"display":"full"' in saved, [l for l in saved.splitlines() if l.startswith("aim=")])
        aim.keyboard.press("Escape")
        check(t, "guided aim: Esc leaves the full screen first", t.wait(lambda: A("() => !document.getElementById('aim').classList.contains('full')"), 3))
        aim.keyboard.press("Escape")
        check(t, "guided aim: Esc again closes the window; the main window keeps working",
              t.wait(lambda: t.js("() => !document.getElementById('csAlignGuided').disabled"), 3))
        time.sleep(0.6)
        aim.evaluate("() => { window.__frames = 0; const old = window.onCoreEvent; window.onCoreEvent = (e) => { if (e.type === 'aimFrame') window.__frames++; old(e); }; }")
        time.sleep(1.5)
        check(t, "guided aim: closing the window stops the live image", A("() => window.__frames") == 0, A("() => window.__frames"))
        # Abre de novo e sai do Align cameras: a janela fecha junto
        t.js("() => document.getElementById('csAlignGuided').click()")
        check(t, "guided aim: the button opens the window again", t.wait(lambda: A("() => /^Camera \\d\\d · /.test(document.getElementById('gaName').textContent)"), 5))
        t.button("Cancel")
        time.sleep(0.8)
        A("() => { window.__frames = 0; }")
        time.sleep(1.2)
        check(t, "guided aim: leaving Align cameras closes it (no live image running)", A("() => window.__frames") == 0 and t.js("() => document.getElementById('csAlign').classList.contains('hidden')"))
        check(t, "guided aim: no page error in the two windows", len(t.errors) == errors_before and not aim_errors, (t.errors[errors_before:], aim_errors))
    finally:
        if aim:
            aim.close()
        for k in ("STILLPOINT_FAKE_PHOTOS", "STILLPOINT_FAKE_LIVE_STEP"):
            t.env.pop(k, None)
        t.restart_app()


def scenario_live_many(t, name, photos):
    line("\n== 24. Live window with many cameras: dots that fit, numbers outside every 10")
    import urllib.request
    t.dismiss()
    live = None
    try:
        for count, want in (("200", "tiny"), ("8", "plain")):
            t.env["STILLPOINT_FAKE_CAMERAS"] = count
            t.restart_app()
            time.sleep(3)
            t.dismiss()
            t.js("() => document.getElementById('liveBtn').click()")
            titles = lambda: json.loads(urllib.request.urlopen("http://127.0.0.1:%d/windows" % PORT).read().decode())
            t.wait(lambda: any(x and "Live" in x for x in titles()), 5)
            idx = [i for i, x in enumerate(titles()) if x and "Live" in x][0]
            live = t.browser.new_page(viewport={"width": 1200, "height": 700})
            errs = []
            live.on("pageerror", lambda e: errs.append(str(e)))
            live.goto("http://127.0.0.1:%d/w/%d/" % (PORT, idx))
            t.wait(lambda: live.evaluate("() => document.querySelectorAll('.live-cam').length") == int(count), 6)
            for lay in ("arc", "circle", "line"):
                live.evaluate("(l) => document.querySelector('[data-layout=\"' + l + '\"]').click()", lay)
                time.sleep(0.3)
                d = live.evaluate("""() => { const r = document.querySelector('.live-rig'), ns = [...r.querySelectorAll('.live-cam')], b = ns.map((n) => n.getBoundingClientRect());
                    let gap = 1e9; for (let i = 1; i < b.length; ++i) gap = Math.min(gap, Math.hypot(b[i].x - b[i - 1].x, b[i].y - b[i - 1].y));
                    const box = r.getBoundingClientRect();
                    return { cls: r.className, size: b[0].width, gap, tens: [...r.querySelectorAll('.live-ten')].map((e) => e.textContent), num: getComputedStyle(ns[0].firstChild).display,
                      inside: b.every((q) => q.left >= box.left - 1 && q.right <= box.right + 1) }; }""")
                if want == "tiny":
                    check(t, "live, %s cameras, %s: one dot per camera, none over another, inside the window" % (count, lay), "tiny" in d["cls"] and d["size"] >= 4 and d["gap"] >= d["size"] and d["inside"] and d["num"] == "none", d)
                    check(t, "live, %s cameras, %s: numbers outside, the first and every 10" % (count, lay), d["tens"][:3] == ["1", "10", "20"] and len(d["tens"]) >= 20, d["tens"])
                else:
                    check(t, "live, %s cameras, %s: as before (numbered circles, no outside numbers)" % (count, lay), "many" not in d["cls"] and d["size"] >= 30 and not d["tens"] and d["num"] != "none", d)
            if want == "tiny":
                d = live.evaluate("""() => { const n = document.querySelectorAll('.live-cam')[120]; n.classList.add('cur'); const b = n.getBoundingClientRect(); const r = [b.width, getComputedStyle(n.firstChild).display, n.firstChild.textContent]; n.classList.remove('cur'); return r; }""")
                check(t, "live, 200 cameras: only the firing camera grows and shows its number", d[0] >= 27 and d[1] != "none" and d[2] == "121", d)
            if want == "tiny":
                # Timeline da janela principal, a fileira de miniaturas e a barra do disparo com muitas câmeras
                mode = lambda name: t.js("(n) => [...document.querySelectorAll('#timingModes button')].find((b) => b.textContent.trim().toLowerCase() === n).click()", name)
                t.js("() => { if (document.getElementById('timingAdv').classList.contains('hidden')) document.getElementById('timingToggle').click(); }")
                time.sleep(0.8)
                mode("sweep")
                time.sleep(0.8)
                t.js("() => { const i = document.querySelector('#timingFields input'); i.value = '0.05'; i.dispatchEvent(new Event('change')); }")
                time.sleep(0.8)
                d = t.js("() => { const r = document.getElementById('timingTimeline'); return { cls: r.className, dots: r.querySelectorAll('.dot').length, shots: r.querySelectorAll('.tl-shot').length, nums: [...r.querySelectorAll('.tl-num')].map((e) => e.textContent), box: [...r.querySelectorAll('.tl-num')].map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.right]; }) }; }")
                apart = all(d["box"][i][0] >= d["box"][i - 1][1] for i in range(1, len(d["box"])))
                check(t, "timeline, 200 cameras: a band with one thin mark per shot instead of the labels", "band" in d["cls"] and d["dots"] == 0 and d["shots"] == 200, d)
                check(t, "timeline, 200 cameras: camera numbers on top only where they fit (first and last always)", d["nums"][0] == "1" and d["nums"][-1] == "200" and 3 <= len(d["nums"]) <= 30 and apart, d)
                t.js("() => document.getElementById('shootBtn').click()")
                ok = t.wait(lambda: live.evaluate("() => document.querySelectorAll('#liveBarTicks i.done').length") >= 20, 20)
                d = live.evaluate("() => { const ts = [...document.querySelectorAll('#liveBarTicks i')], vis = ts.filter((i) => getComputedStyle(i).display !== 'none'); return { n: ts.length, crowded: document.getElementById('liveBar').className, main: ts.filter((i) => i.classList.contains('main')).map((i) => i.textContent), vis: vis.length }; }")
                check(t, "live, 200 cameras firing: the bar shows marks and numbers only for the first camera and every 10", ok and "crowded" in d["crowded"] and d["n"] == 200 and d["main"][:3] == ["1", "10", "20"] and d["main"][-1] == "200" and d["vis"] <= 22, d)
                ok = t.wait(lambda: live.evaluate("() => document.getElementById('liveFilm').classList.contains('win') && !document.getElementById('liveFilm').classList.contains('hidden')"), 60)
                time.sleep(1)
                d = live.evaluate("() => { const f = document.getElementById('liveFilm'), ds = [...f.querySelectorAll('div')]; return { n: ds.length, w: ds[0] ? ds[0].getBoundingClientRect().width : 0, cur: ds.filter((x) => x.classList.contains('cur')).length, edges: [...f.querySelectorAll('.edge')].map((e) => e.textContent.replace(/\\s+/g, ' ')), stage: document.getElementById('liveStage').getBoundingClientRect().top - f.getBoundingClientRect().bottom }; }")
                check(t, "live, 200 photos playing: only the thumbnails around the current photo, at a size one can see", ok and 3 <= d["n"] <= 9 and d["w"] >= 80 and d["cur"] == 1, d)
                check(t, "live, 200 photos playing: the first and the last number at the ends, the photo below the numbers", len(d["edges"]) == 2 and "1" in d["edges"][0] and "200" in d["edges"][1] and d["stage"] >= 20, d)
                mode("at once")
                time.sleep(0.5)
            check(t, "live, %s cameras: no page error" % count, not errs, errs)
            live.close()
            live = None
    finally:
        if live:
            live.close()
        t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
        t.restart_app()


def scenario_custom_drag(t, name, photos):
    line("\n== 25. Timing › Custom: click, hold and drag over the camera numbers")
    t.dismiss()
    try:
        t.env["STILLPOINT_FAKE_CAMERAS"] = "12"
        t.restart_app()
        time.sleep(3)
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => { if (document.getElementById('timingAdv').classList.contains('hidden')) document.getElementById('timingToggle').click(); }")
        time.sleep(0.6)
        t.js("() => [...document.querySelectorAll('#timingModes button')].find((b) => b.textContent.trim().toLowerCase() === 'custom').click()")
        time.sleep(0.6)
        on = lambda step: t.js("(s) => [...document.querySelectorAll('#timingCustom .timing-step')[s].querySelectorAll('.cam-chip.on')].map((c) => Number(c.textContent))", step)
        pos = lambda step, o: t.js("([s, o]) => { const c = document.querySelectorAll('#timingCustom .timing-step')[s].querySelector('.cam-chip[data-o=\"' + o + '\"]'); c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }", [step, o])
        def drag(step, a, b):
            pos(step, a)
            (x0, y0), (x1, y1) = t.js("([s, a, b]) => [a, b].map((o) => { const r = document.querySelectorAll('#timingCustom .timing-step')[s].querySelector('.cam-chip[data-o=\"' + o + '\"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })", [step, a, b])
            t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")  # o aviso do rig diferente (12 câmeras) cobre os números
            t.page.mouse.move(x0, y0)
            t.page.mouse.down()
            t.page.mouse.move(x1, y1, steps=3)
            t.page.mouse.up()
            time.sleep(0.5)
        t.js("() => { while (document.querySelectorAll('#timingCustom .timing-step').length < 2) [...document.querySelectorAll('#timingCustom button')].find((b) => b.textContent.trim() === 'Add step').click(); }")
        time.sleep(0.5)
        before = on(0)
        free = [o for o in range(1, 13) if o not in before]
        a, b = free[0], free[-1]
        drag(0, a, b)
        got = on(0)
        check(t, "custom drag: dragging from an unmarked camera marks every camera on the way", all(o in got for o in range(a, b + 1)), (before, got))
        check(t, "custom drag: the cameras leave the other step", not [o for o in on(1) if a <= o <= b], on(1))
        drag(0, 3, 8)
        got = on(0)
        check(t, "custom drag: dragging from a marked camera takes them out", not [o for o in got if 3 <= o <= 8] and 2 in got and 9 in got, got)
        x, y = pos(0, 5)
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        t.page.mouse.click(x, y)
        time.sleep(0.4)
        check(t, "custom drag: a plain click still marks one camera", [o for o in on(0) if 3 <= o <= 8] == [5], on(0))
        t.js("() => { const c = document.querySelectorAll('#timingCustom .timing-step')[0].querySelector('.cam-chip[data-o=\"6\"]'); c.focus(); c.click(); }")
        time.sleep(0.4)
        check(t, "custom drag: the keyboard (Enter on a number) still works", 6 in on(0), on(0))
        # Arrastar um passo com muitas câmeras: os passos encolhem para uma linha durante o arraste
        t.env["STILLPOINT_FAKE_CAMERAS"] = "200"
        t.restart_app()
        time.sleep(3)
        t.dismiss()
        t.js("() => { if (document.getElementById('timingAdv').classList.contains('hidden')) document.getElementById('timingToggle').click(); }")
        time.sleep(0.6)
        t.js("() => [...document.querySelectorAll('#timingModes button')].find((b) => b.textContent.trim().toLowerCase() === 'custom').click()")
        time.sleep(0.6)
        t.js("() => { while (document.querySelectorAll('#timingCustom .timing-step').length < 2) [...document.querySelectorAll('#timingCustom button')].find((b) => b.textContent.trim() === 'Add step').click(); }")
        time.sleep(0.5)
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        steps = lambda: t.js("() => [...document.querySelectorAll('#timingCustom .timing-step')].map((r) => [r.querySelectorAll('.cam-chip.on').length, Math.round(r.getBoundingClientRect().height)])")
        before = steps()
        x, y = t.js("() => { const r = document.querySelector('#timingCustom .timing-step'), n = r.querySelector('.step-n'); n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return [b.x + 8, b.y + b.height / 2]; }")
        t.page.mouse.move(x, y)
        t.page.mouse.down()
        t.page.mouse.move(x, y + 12, steps=2)
        time.sleep(0.3)
        mid = t.js("() => ({ rows: [...document.querySelectorAll('#timingCustom .timing-step')].map((r) => Math.round(r.getBoundingClientRect().height)), sum: [...document.querySelectorAll('#timingCustom .step-sum')].map((e) => e.textContent), y: (() => { const b = document.querySelector('#timingCustom .timing-step.dragging').getBoundingClientRect(); return [b.top, b.bottom]; })() })")
        check(t, "custom, 200 cameras: while a step is dragged every step shrinks to one line with its cameras summed up", before[0][1] > 300 and max(mid["rows"]) < 70 and "camera" in mid["sum"][0].lower() + mid["sum"][1].lower(), (before, mid))
        check(t, "custom, 200 cameras: the dragged step stays under the mouse", mid["y"][0] <= y + 12 <= mid["y"][1], (mid["y"], y + 12))
        t.page.mouse.move(x, y + 150, steps=5)
        time.sleep(0.3)
        t.page.mouse.up()
        time.sleep(0.6)
        after = steps()
        check(t, "custom, 200 cameras: dropping it below the other step changes the order, and the numbers come back", [a[0] for a in after] == [b[0] for b in before][::-1] and before[0][0] != before[1][0] and after[1][1] > 300, (before, after))
        check(t, "custom drag: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        t.js("() => { try { localStorage.removeItem('timing'); } catch (e) {} }")
        t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
        t.restart_app()


def scenario_align_marks(t, name, photos):
    line("\n== 20. Automatic alignment: the three marks and the recipe (calculation only, no window yet)")
    prog = os.path.join(BUILD, "AlignMarksTest")
    if not os.path.exists(prog):
        check(t, "the alignment test was built (AlignMarksTest)", False, prog)
        return
    out = subprocess.run([prog], capture_output=True, text=True)
    for ln in out.stdout.splitlines():
        if ln.startswith(("PASS", "FAIL")):
            check(t, "alignment: " + ln[6:].split("   [")[0], ln.startswith("PASS"), ln)

    # Parte 2: as câmeras simuladas entregam fotos de verdade de uma pasta (STILLPOINT_FAKE_PHOTOS)
    folder = os.path.join(t.tmp, "fake-photos")
    os.makedirs(folder, exist_ok=True)
    colors = [(200, 40, 40), (40, 160, 60), (40, 70, 210)]
    for k, c in enumerate(colors):
        Image.new("RGB", (600, 400), c).save(os.path.join(folder, "rig_%02d.JPG" % (k + 1)), quality=90)
    open(os.path.join(folder, ".hidden.jpg"), "w").close()
    open(os.path.join(folder, "notes.txt"), "w").close()
    source = [open(os.path.join(folder, "rig_%02d.JPG" % (k + 1)), "rb").read() for k in range(3)]
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = folder
    try:
        t.restart_app()
        t.dismiss()
        s = t.shoot()
        t.dismiss()
        check(t, "fake photos: the shot made a session", bool(s))
        if s:
            o = t.originals(s)
            got = {}
            for f in sorted(os.listdir(o)):
                if f.startswith(".") or f == "session.json":
                    continue
                with open(os.path.join(o, f), "rb") as fh:
                    got[f] = fh.read()
            check(t, "fake photos: one photo per camera, with the extension of the source (.JPG)", len(got) == 4 and all(f.endswith(".JPG") for f in got), sorted(got))
            # A foto segue a câmera (fake1 = SL3_1, fake2 = T7_1, fake3 = SL3_2, fake4 = T7_2), qualquer que seja a ordem
            by_cam = {cam: next((v for f, v in got.items() if "_" + cam + "_IMG_" in f), None) for cam in ("SL3_1", "T7_1", "SL3_2", "T7_2")}
            check(t, "fake photos: camera 1 gets the 1st photo, 2 the 2nd, 3 the 3rd, and 4 starts over from the 1st",
                  [by_cam[c] for c in ("SL3_1", "T7_1", "SL3_2", "T7_2")] == [source[0], source[1], source[2], source[0]], sorted(got))
            check(t, "fake photos: hidden files and files that are not photos are skipped", b"" not in got.values())
        # A cena de mentira com a haste (STILLPOINT_FAKE_PHOTOS=pole): cada câmera vê a haste de um lugar
        t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
        t.restart_app()
        t.dismiss()
        s = t.shoot()
        t.dismiss()
        if s:
            o = t.originals(s)
            imgs = [Image.open(os.path.join(o, f)).convert("RGB") for f in sorted(os.listdir(o)) if f.lower().endswith(".jpg")]
            # a bola vermelha de cima: bem vermelha, em algum lugar de cada foto
            reds = [sum(1 for (r, g, b) in im.resize((360, 240)).getdata() if r > 150 and g < 80 and b < 80) for im in imgs]
            check(t, "pole scene: each camera delivers a photo of the pole with the marks (1800 px wide)",
                  len(imgs) == 4 and all(im.width == 1800 for im in imgs) and all(r > 5 for r in reds), (len(imgs), reds))
            check(t, "pole scene: each camera sees it from a different place", len({im.tobytes()[:200000] for im in imgs}) == len(imgs))
        else:
            check(t, "pole scene: the shot made a session", False)
    finally:
        del t.env["STILLPOINT_FAKE_PHOTOS"]
        t.restart_app()


def main():
    with sync_playwright() as pw:
        t = T(pw)
        try:
            line("Stillpoint host test · " + time.strftime("%Y-%m-%d %H:%M:%S") + " · data in " + t.tmp)
            first = None
            try:
                first = scenario_open_and_export(t)
            except Exception:  # noqa: BLE001
                check(t, "scenario 1 ran to the end", False, traceback.format_exc(limit=3))
            if first:
                name, photos = first
                only = os.environ.get("STILLPOINT_TEST_ONLY", "")  # para depurar: só os cenários com este nome
                for sc in [x for x in (scenario_cleared, scenario_delete_edit_undo, scenario_photo_delete_restore,
                           scenario_remove_from_collection, scenario_delete_session, scenario_cancel, scenario_rapid_in_lightroom, scenario_crop_before_lightroom,
                           scenario_export_edit, scenario_export_trash, scenario_lightroom_crop, scenario_undo_own_item, scenario_orientation, scenario_selection_kept, scenario_align_undo, scenario_flip, scenario_photoshop, scenario_rig_state, scenario_align_marks, scenario_align_cameras, scenario_camera_tags, scenario_guided_aim, scenario_live_many, scenario_custom_drag) if only in x.__name__]:
                    try:
                        sc(t, name, photos)
                    except Exception:  # noqa: BLE001
                        check(t, sc.__name__ + " ran to the end", False, traceback.format_exc(limit=3))
            line("\n%d passed, %d failed" % (passed, failed))
            if t.errors:
                line("page errors: " + " | ".join(t.errors[:10]))
            line("\n---- fake Lightroom log ----")
            report.extend(t.lr.log)
        finally:
            t.close()
            report.append("\n---- app stderr (tail) ----")
            try:
                with open(os.path.join(t.tmp, "app-stderr.txt")) as f:
                    report.extend(f.read().splitlines()[-40:])
            except OSError:
                pass
            with open(os.path.join(BUILD, "report.txt"), "w") as f:
                f.write("\n".join(report) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
