"""Teste automático do Stillpoint no Linux: o app de verdade (StillpointHost, sem janela), a página de verdade num
Chromium sem tela, câmeras simuladas e um Lightroom de mentira (fake_lightroom.py) pelos arquivos do plugin.
Confere o que o Stillpoint faz com o que vem do Lightroom: etiquetas In Lightroom e Edited n / m, selos LR, lixeira,
⌘Z / ⌘⇧Z (inclusive rápidos), restaurar, Cancel editing, edição tirada.

    cmake -S tests/host -B build/host-test -DCMAKE_BUILD_TYPE=Release && cmake --build build/host-test -j
    python3 tests/host/run_tests.py [nome-do-cenário ...]

Relatório em build/host-test/report.txt (e capturas de tela de cada falha ao lado).
"""
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
        with open(os.path.join(self.data, "settings.txt"), "w") as f:
            f.write("project=%s\nlightroomPath=%s\npref.splash=off\n" % (self.project, lr_app))
        env = dict(os.environ, HOME=self.home, STILLPOINT_DATA=self.data, STILLPOINT_RESOURCES=ROOT,
                   STILLPOINT_FAKE_CAMERAS="4", STILLPOINT_TEST_PORT=str(PORT), STILLPOINT_TEST_LR_RUNNING="1")
        self.app_log = open(os.path.join(self.tmp, "app-stderr.txt"), "w")
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
        """Delete edit… de uma foto: botão direito na miniatura do Export › Edit, confirma e fecha o Export."""
        self.export_edit(name)
        self.strip_menu(index, "Delete edit")
        self.button("Delete 1 edit")
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
        line("FAIL  " + name + ("   [%s]" % detail if detail is not None else ""))
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
    t.export_edit(s)
    check(t, "step 1's green button was Edit → and now step 2 · Edit is open", t.export_step() == "2 Edit", t.export_step())
    check(t, "the footer buttons: ← Sessions and Outputs →", t.js("() => document.getElementById('exportBack').textContent === '← Sessions' && document.getElementById('exportConfirm').textContent === 'Outputs →'"))
    check(t, "Lightroom Classic box: Not edited · Edit in Lightroom Classic", t.js("() => { const b = document.querySelector('#exportSettings .lr-block'); return !!b && b.textContent.includes('Not edited') && b.textContent.includes('Edit in Lightroom Classic'); }"))
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
    check(t, "the box shows In Lightroom Classic · 4 photos and Done editing", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .lr-block'); return !!b && b.textContent.includes('In Lightroom Classic · 4 photos') && b.textContent.includes('Done editing'); }"), 6))
    check(t, "the strip shows LR on the 4 photos", t.js("() => document.querySelectorAll('#exportSettings .export-strip .frame-app:not(.ed)').length") == 4)
    o = t.originals(s)
    ph = sorted(os.path.join(o, f) for f in os.listdir(o) if not f.startswith(".") and f != "session.json")
    t.lr.set_edit(ph[0], (220, 80, 40))
    t.lr.export(o, t.project, s)
    check(t, "Export to Stillpoint: the box shows 1 of 4 photos edited", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .lr-block'); return !!b && b.textContent.includes('1 of 4 photos edited'); }"), 10))
    check(t, "... ED on photo 01 only", t.wait(lambda: t.js("() => [...document.querySelectorAll('#exportSettings .export-strip > li')].map(li => !!li.querySelector('.frame-app.ed'))") == [True, False, False, False], 5))
    check(t, "... Original / Edited clickable, on Edited", t.js("() => { const v = document.querySelector('#exportSettings .edit-view'); const on = v && v.querySelector('button.on'); return !!on && on.textContent === 'Edited' && ![...v.querySelectorAll('button')].some(b => b.disabled); }"))
    check(t, "... the partial warning", t.js("() => !!document.querySelector('#exportSettings .lr-warn')"))
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
    check(t, "... the box shows Edit again in Lightroom Classic", t.wait(lambda: t.js("() => { const b = document.querySelector('#exportSettings .lr-block'); return !!b && b.textContent.includes('Edit again in Lightroom Classic'); }"), 6))
    t.close_export()


def dismiss_delete(self):
    if self.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden')"):
        self.js("() => { const b = [...document.querySelectorAll('#dialogActions button')].find(x => /^Delete/.test(x.textContent.trim())); b && b.click(); }")
        time.sleep(0.6)


T.dismiss_delete = dismiss_delete


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
                for sc in (scenario_cleared, scenario_delete_edit_undo, scenario_photo_delete_restore,
                           scenario_remove_from_collection, scenario_delete_session, scenario_cancel, scenario_rapid_in_lightroom, scenario_crop_before_lightroom,
                           scenario_export_edit):
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
