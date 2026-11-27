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
import re
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


def rig_ratio(t, label):
    """Passo 3 do Align cameras: escolhe a proporção das sessões novas (bloco New sessions)."""
    t.js("(l) => { const b = [...document.querySelectorAll('#alignNewSessions .segmented:not(.orient-seg) button')].find((x) => x.textContent.trim() === l); if (b) b.click(); }", label)
    time.sleep(1.2)


def rig_state(t):
    return t.js("""() => ({ seg: [...document.querySelectorAll('#alignNewSessions .segmented:not(.orient-seg) button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '') + (b.disabled ? '-' : '')).join(' '),
      orient: [...document.querySelectorAll('#alignNewSessions .orient-seg button')].map((b) => (b.classList.contains('on') ? '*' : '.') + (b.disabled ? '-' : '')).join(' '),
      mixed: (document.getElementById('csAlignMixed') || { dataset: {} }).dataset.itip || '', keeps: (document.getElementById('alignKeeps') || {}).textContent || '',
      save: [...document.querySelectorAll('#csAlign button')].filter((b) => /^Save/.test(b.textContent.trim())).map((b) => b.textContent.trim() + (b.disabled ? '-' : '')).join(),
      canvas: (document.querySelector('#csAlignMain .align-cf') || {}).textContent || '', title: (document.querySelector('#alignNewSessions h3') || {}).textContent || '' })""")


def align_open(t):
    """Abre o Align cameras pelo botão da janela principal (painel Cameras); com o Camera settings aberto, fecha-o
    antes (o Test shot não tem mais o botão); com alinhamento guardado, confirma na janela de aviso."""
    if t.js("() => !document.getElementById('camSettingsOverlay').classList.contains('hidden')"):
        t.js("() => document.getElementById('csDone').click()")
        time.sleep(0.5)
    t.wait(lambda: t.js("() => !document.getElementById('alignBtn').disabled"), 30)
    t.js("() => document.getElementById('alignBtn').click()")
    t.wait(lambda: t.js("() => !document.getElementById('csAlign').classList.contains('hidden') || !document.getElementById('dialogOverlay').classList.contains('hidden')"), 8)
    t.js("() => { const o = document.getElementById('dialogOverlay'); if (o.classList.contains('hidden')) return; const b = [...o.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Align cameras'); if (b) b.click(); }")
    time.sleep(0.3)


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
        self.mixed_asked = bool(self.wait(lambda: self.dialog_title() == "Mixed ratios", 4))
        if self.mixed_asked:
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
        if text == "Cancel":
            self.leave_align()

    def leave_align(self):
        """Cancel no Align cameras com trabalho feito pergunta antes de sair: confirma."""
        if self.js("() => { const b = [...document.querySelectorAll('#dialogOverlay button')].find((x) => x.textContent.trim() === 'Leave without saving' && x.offsetParent); if (!b) return false; b.click(); return true; }"):
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
    # A foto 01 um passo para a esquerda (Move X −; o Position saiu desta tela em 2026-11-26), depois espelhada na horizontal
    t.page.click("#exportSettings .align-ctl input >> nth=0"); t.page.keyboard.type("-150"); t.page.keyboard.press("Enter")
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
        check(t, "align: the Test shot no longer has an 'Align cameras' button (the way in is the main window)",
              t.js("() => [...document.querySelectorAll('#csGallery .gallery-actions button')].map(b => b.textContent.trim()).join('|')") == "Hide photos")
        align_open(t)
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
              ok and head.startswith(b"%PDF-1.4") and head.count(b"1 0.416 0 rg") == 6 and b"edge to edge" in head and b"centers of the bands" not in head and head.rstrip().endswith(b"%%EOF"), (save_dir, len(head)))
        check(t, "align: Prepare offers Cancel and Fire",
              t.js("() => [...document.querySelectorAll('#csAlignFoot button')].map(b => b.textContent).join('|')") == "Cancel|Fire")
        before = sorted(os.listdir(os.path.join(t.data, "Order photos")))
        t.button("Fire")
        check(t, "align: Fire takes the photos and goes to Mark and aim",
              t.wait(lambda: t.js("() => document.querySelector('#csAlignStep2').classList.contains('on') && document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 40))
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
        t.wait(lambda: t.js("() => !!document.querySelector('#csAlignMain .align-stage') && !document.querySelector('#csAlignMain .align-wait') && /Keeps/.test(document.getElementById('alignKeeps').textContent)"), 15)
        s3 = lambda: t.js("() => { const f = [...document.querySelectorAll('#csAlignMain .align-num')].map((i) => i.value); return { on: document.getElementById('csAlignStep3').classList.contains('on'), thumbs: document.querySelectorAll('#csAlignMain .export-strip li.frame:not(.gone)').length, where: (document.querySelector('#csAlignMain .align-where') || {}).textContent || '', fields: f, tools: !!document.getElementById('alignTools'), flip: !!document.querySelector('#csAlignMain .flip-row'), ratio: /Aspect ratio/.test(document.getElementById('csAlignMain').textContent), note: document.getElementById('csAlignNote').textContent, back: document.getElementById('alignBackStick').disabled, play: (document.getElementById('alignPlay') || {}).title || '', bar: (() => { const b = document.getElementById('alignPlayBar'), s = document.querySelector('#csAlignMain .align-stage').getBoundingClientRect(), r = b.getBoundingClientRect(); return [b.parentNode.classList.contains('align-stage'), Math.round(s.right - r.right), Math.round(r.top - s.top), b.textContent.includes('Speed') && b.textContent.includes('Reverse loop')]; })(), topRow: document.querySelector('#csAlignMain .rig-top').textContent, sub: document.getElementById('csAlignSub').textContent }; }")
        # (a barra de tocar fica escondida em cima e aparece com o mouse perto da borda de cima da foto grande)
        sb0 = t.page.locator("#csAlignMain .align-stage").bounding_box()
        t.page.mouse.move(sb0["x"] + sb0["width"] / 2, sb0["y"] + sb0["height"] / 2); time.sleep(0.8)
        hid = t.js("() => { const b = document.getElementById('alignPlayBar'), s = document.querySelector('#csAlignMain .align-stage').getBoundingClientRect(), r = b.getBoundingClientRect(); return [getComputedStyle(b).opacity, Math.round(s.top - r.top), Math.round(r.height / 2), Math.round(r.bottom - s.top)]; }")
        check(t, "align, step 3: away from it, the play bar sits dim in its place at the top right of the big photo (no grip)", hid[0] == "0.3" and -14 <= hid[1] <= 0 and not t.js("() => !!document.querySelector('.align-play-grip, .align-tools-grip')"), hid)
        t.page.mouse.move(sb0["x"] + sb0["width"] / 2, sb0["y"] + 6); time.sleep(0.5)
        d3 = s3()
        check(t, "align, step 3: with the mouse over it the play bar lights up", t.js("() => getComputedStyle(document.getElementById('alignPlayBar')).opacity") == "1" and t.js("() => document.querySelector('#csAlignMain .align-stage').classList.contains('play-near')"))
        check(t, "align: step 3 is the Align photos editor on the four photos (big photo, tools, Move/Size/Rotate, thumbnails), opening with the values from the stick",
              d3["on"] and d3["thumbs"] == 4 and d3["where"].startswith("Camera 01 of 04") and len(d3["fields"]) == 4 and d3["tools"] and "Adjust any photo by hand and play the sequence" in d3["sub"], d3)
        check(t, "align: step 3 has no Flip (the camera alignment does not keep it), the Aspect ratio of the new sessions, 'Play the sequence' and 'Back to the stick values' (off: nothing adjusted)",
              not d3["flip"] and d3["ratio"] and d3["play"].startswith("Play the sequence") and d3["back"] and d3["note"] == "Values from the stick · 0 photos adjusted by hand", d3)
        check(t, "align: step 3 has the play controls over the big photo, at the top right (‹ ▶ › Speed, Reverse loop), and the top row keeps only the camera, Keeps and Back to the stick values",
              d3["bar"][0] and 0 <= d3["bar"][1] <= 14 and 0 <= d3["bar"][2] <= 14 and d3["bar"][3] and "Play" not in d3["topRow"] and "Speed" not in d3["topRow"] and "Back to the stick values" in d3["topRow"], (d3["bar"], d3["topRow"]))
        keeps = t.js("() => { const e = document.getElementById('alignKeeps'); return e ? [e.className, e.textContent] : null; }")
        check(t, "align: step 3 says how much of each photo the alignment keeps (amber below 80%)",
              bool(keeps) and keeps[1].startswith("Keeps ") and keeps[1].endswith("% of each photo") and ("warn" in keeps[0]) == (int(keeps[1].split("Keeps ")[1].split("%")[0]) < 80), keeps)
        # Move, além do limite: a foto (girada) desliza encostada na borda acompanhando o mouse, sem travar num canto
        # e sem saltar; ao voltar para dentro, segue o mouse de novo (gravação do dono, 2026-11-26)
        t.page.keyboard.press("m"); time.sleep(0.2)
        sbm = t.page.locator("#csAlignMain .align-stage").bounding_box()
        mx0, my0 = sbm["x"] + sbm["width"] / 2 - 70, sbm["y"] + sbm["height"] / 2 - 50  # (fora do losango da âncora, que fica na marca do meio)
        pos = lambda: [float(x) for x in s3()["fields"][:2]]
        p0 = pos(); rot0 = float(s3()["fields"][3])
        t.page.mouse.move(mx0, my0); t.page.mouse.down(); t.page.mouse.move(mx0 + 60, my0 + 2); time.sleep(0.15)
        track = []
        for dy in (0, 12, 24, 36, 48):
            t.page.mouse.move(mx0 + 700, my0 + dy); time.sleep(0.15); track.append(pos())
        t.page.mouse.move(mx0 + 700, my0 + 400); time.sleep(0.15); corner = pos()
        t.page.mouse.move(mx0 + 700, my0 + 398); time.sleep(0.15); corner2 = pos()
        # Voltando o mouse só um pouco, a foto já volta junto (não é preciso refazer o caminho até o ponto de partida)
        t.page.mouse.move(mx0 + 700 - 30, my0 + 398 - 20); time.sleep(0.15); back1 = pos()
        t.page.mouse.move(mx0 + 700 - 60, my0 + 398 - 40); time.sleep(0.15); back2 = pos()
        t.page.mouse.up(); time.sleep(0.4)
        steps = [round(track[i + 1][1] - track[i][1], 1) for i in range(4)]
        check(t, "align, Move past the limit: the rotated photo slides along the edge following the mouse (even steps, no sticking)",
              abs(rot0) > 0.2 and all(x > 0 for x in steps) and max(steps) - min(steps) <= 2 and abs(track[-1][0] - track[0][0]) <= 6, (rot0, p0, track, steps))
        check(t, "align, Move past the limit: it does not jump at the corner, and coming back the photo moves back at once, with the mouse (no need to go all the way back)",
              abs(corner[0] - corner2[0]) <= 8 and abs(corner[1] - corner2[1]) <= 8 and back1[0] < corner2[0] - 5 and back1[1] < corner2[1] - 3 and back2[0] < back1[0] - 5 and back2[1] < back1[1] - 3, (p0, corner, corner2, back1, back2))
        t.page.keyboard.press("a"); time.sleep(0.2)
        t.js("() => { const b = document.getElementById('alignBackStick'); if (b && !b.disabled) b.click(); }"); time.sleep(0.5)
        # Cancel com trabalho feito pergunta antes: "Keep aligning" fica; (o "Leave without saving" é conferido adiante)
        t.js("() => [...document.querySelectorAll('#csAlignFoot button')].find((b) => b.textContent.trim() === 'Cancel').click()"); time.sleep(0.5)
        ask = t.js("() => { const o = document.getElementById('dialogOverlay'); return [!o.classList.contains('hidden'), o.textContent.includes('Leave without saving?'), [...o.querySelectorAll('button')].map((b) => b.textContent.trim() + (b.classList.contains('btn-primary') ? '*' : ''))]; }")
        check(t, "align: Cancel with marks and adjustments made asks before leaving ('Keep aligning' in green / 'Leave without saving')", ask[0] and ask[1] and ask[2] == ["Keep aligning*", "Leave without saving"], ask)
        t.js("() => [...document.querySelectorAll('#dialogOverlay button')].find((b) => b.textContent.trim() === 'Keep aligning').click()"); time.sleep(0.4)
        check(t, "align: 'Keep aligning' stays in the window, with everything as it was", t.js("() => !document.getElementById('csAlign').classList.contains('hidden') && document.getElementById('csAlignStep3').classList.contains('on')") and len(s3()["fields"]) == 4)
        # Esc na janela faz a mesma pergunta; Esc na pergunta é o "Keep aligning"
        t.page.keyboard.press("Escape"); time.sleep(0.5)
        e1 = t.js("() => !document.getElementById('dialogOverlay').classList.contains('hidden') && document.getElementById('dialogOverlay').textContent.includes('Leave without saving?')")
        t.page.keyboard.press("Escape"); time.sleep(0.5)
        e2 = t.js("() => document.getElementById('dialogOverlay').classList.contains('hidden') && !document.getElementById('csAlign').classList.contains('hidden') && document.getElementById('csAlignStep3').classList.contains('on')")
        check(t, "align: Esc asks the same question, and Esc on the question is 'Keep aligning' (nothing is lost)", e1 and e2 and len(s3()["fields"]) == 4, (e1, e2))
        # Tocar a sequência: na própria tela, sem as referências por cima e sem as alças; ‹ pausa ›, Speed, Reverse loop
        bar_idle = t.js("() => [Math.round(document.getElementById('alignPlayBar').getBoundingClientRect().width), document.getElementById('alignPlayStop').disabled]")
        geo_idle = t.js("() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; const m = document.getElementById('csAlignMain'); return { top: r(m.querySelector('.rig-top')), stage: r(m.querySelector('.align-stage')), panel: r(m.querySelector('.align-panel')), strip: r(m.querySelector('.export-strip')), back: !!document.getElementById('alignBackStick'), keeps: r(document.getElementById('alignKeeps')) }; }")
        t.js("() => document.getElementById('alignPlay').click()")
        t.wait(lambda: t.js("() => !!document.querySelector('#csAlignMain .align-stage.playing') && [...document.querySelectorAll('#csAlignMain .align-layer')].some((l) => l.style.visibility === 'visible')"), 10)
        pl = lambda: t.js("() => { const st = document.querySelector('#csAlignMain .align-stage'), ls = [...document.querySelectorAll('#csAlignMain .align-layer')]; return { stage: !!st, layers: ls.length, vis: ls.filter((l) => l.style.visibility === 'visible').length, refs: document.querySelectorAll('#csAlignMain .align-layer.align-ref').length, box: getComputedStyle(document.querySelector('#csAlignMain .align-box')).display, tools: getComputedStyle(document.getElementById('alignTools')).display, clip: document.querySelector('#csAlignMain .align-layers').style.clipPath.slice(0, 5), tag: document.querySelector('#csAlignMain .align-stage .crop-tag').textContent, where: document.querySelector('#csAlignMain .align-where').textContent, ctl: (document.querySelector('#csAlignMain .rig-play-ctl') || {}).textContent || '', stop: !document.getElementById('alignPlayStop').disabled, barW: Math.round(document.getElementById('alignPlayBar').getBoundingClientRect().width), play: !!document.getElementById('alignPlay'), panel: document.querySelector('#csAlignMain .align-panel').classList.contains('playing'), sel: [...document.querySelectorAll('#csAlignMain .export-strip li.frame')].findIndex((l) => l.classList.contains('selected')) }; }")
        d = pl()
        geo = lambda: t.js("() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; const m = document.getElementById('csAlignMain'); return { top: r(m.querySelector('.rig-top')), stage: r(m.querySelector('.align-stage')), panel: r(m.querySelector('.align-panel')), strip: r(m.querySelector('.export-strip')), back: !!document.getElementById('alignBackStick'), keeps: r(document.getElementById('alignKeeps')) }; }")
        check(t, "align, play the sequence: nothing changes place or height on entering the play mode, and 'Back to the stick values' stays", geo() == geo_idle and geo()["back"], (geo_idle, geo()))
        check(t, "align, play the sequence: it plays in the same screen (the editor stays), one photo at a time, with no reference photos over it",
              d["stage"] and d["layers"] == 4 and d["vis"] == 1 and d["refs"] == 0 and "as it will be after the alignment" in d["tag"] and "playing" in d["where"], d)
        check(t, "align, play the sequence: while it plays the handles, the tool bar and what is outside the canvas are hidden, and the panel on the right waits",
              d["box"] == "none" and d["tools"] == "none" and d["clip"] == "inset" and d["panel"], d)
        check(t, "align, play the sequence: Stop is always in the bar, off until it plays, so the bar keeps its size", bar_idle[1] is True and d["stop"] and d["barW"] == bar_idle[0], (bar_idle, d["barW"]))
        check(t, "align, play the sequence: in the same bar over the photo the play button becomes pause and Stop lights up", "Speed" in d["ctl"] and "Reverse loop" in d["ctl"] and "1.0x" in d["ctl"] and d["stop"] and not d["play"], d)
        tag0 = d["tag"]
        moved = t.wait(lambda: pl()["tag"] != tag0, 3)
        t.js("() => document.getElementById('alignPlayPause').click()"); time.sleep(0.2)
        d1 = pl(); time.sleep(0.7); d2 = pl()
        check(t, "align, play the sequence: it plays by itself, the thumbnails follow, and the pause button stops it", moved and d1["tag"] == d2["tag"] and d2["sel"] >= 0, (tag0, d1["tag"], d2["sel"]))
        t.page.keyboard.press("ArrowRight"); time.sleep(0.3)
        d3b = pl()
        check(t, "align, play the sequence: → goes one photo forward while paused", d3b["tag"] != d2["tag"] and d3b["vis"] == 1, (d2["tag"], d3b["tag"]))
        t.shot("align-step3-play")
        shown = d3b["sel"]
        t.js("() => document.getElementById('alignPlayStop').click()"); time.sleep(0.8)
        t.wait(lambda: t.js("() => !document.querySelector('#csAlignMain .align-wait')"), 10)
        d4b = pl()
        check(t, "align, play the sequence: Stop goes back to adjusting on the photo that was showing (handles, tools and references back)",
              d4b["play"] and not d4b["stop"] and d4b["box"] != "none" and d4b["tools"] != "none" and not d4b["panel"] and d4b["where"].startswith("Camera %02d of 04" % (shown + 1)), (shown, d4b))
        # Janela com pouca altura: a barra de ferramentas se reorganiza em colunas e cabe inteira na foto grande; a
        # barra de tocar quebra de linha quando a foto grande é estreita
        vp = t.page.viewport_size
        t.page.set_viewport_size({"width": vp["width"], "height": 600}); time.sleep(0.8)
        t.page.mouse.move(sb0["x"] + 4, t.page.locator("#csAlignMain .align-stage").bounding_box()["y"] + 60); time.sleep(0.5)
        fit = t.js("() => { const s = document.querySelector('#csAlignMain .align-stage').getBoundingClientRect(), tb = document.getElementById('alignTools'), bs = [...tb.querySelectorAll('button')].map((b) => b.getBoundingClientRect()); return { stage: Math.round(s.height), cols: getComputedStyle(tb).getPropertyValue('--cols').trim(), n: bs.length, inside: bs.every((b) => b.top >= s.top - 0.5 && b.bottom <= s.bottom + 0.5 && b.left >= s.left - 0.5), near: document.querySelector('#csAlignMain .align-stage').classList.contains('tools-near') }; }")
        check(t, "align tools, short window: the tool bar reorganises into more columns and every button stays inside the big photo", fit["near"] and fit["n"] >= 8 and fit["inside"] and int(fit["cols"] or 1) >= 2, fit)
        t.shot("align-step3-short")
        t.page.set_viewport_size({"width": 900, "height": vp["height"]}); time.sleep(0.8)
        sbn = t.page.locator("#csAlignMain .align-stage").bounding_box()
        t.page.mouse.move(sbn["x"] + sbn["width"] / 2, sbn["y"] + 5); time.sleep(0.5)
        fitp = t.js("() => { const s = document.querySelector('#csAlignMain .align-stage').getBoundingClientRect(), b = document.getElementById('alignPlayBar').getBoundingClientRect(); return [Math.round(s.width), b.left >= s.left - 0.5 && b.right <= s.right + 0.5, Math.round(b.height)]; }")
        check(t, "align, play bar, narrow window: the controls wrap and stay inside the big photo", fitp[1], fitp)
        t.shot("align-step3-narrow")
        t.page.set_viewport_size(vp); time.sleep(0.8)
        # Clicar na foto grande enquanto toca sai do modo de tocar
        t.js("() => document.getElementById('alignPlay').click()")
        t.wait(lambda: t.js("() => !!document.querySelector('#csAlignMain .align-stage.playing')"), 10); time.sleep(0.4)
        sb = t.page.locator("#csAlignMain .align-stage").bounding_box()
        t.page.mouse.click(sb["x"] + sb["width"] / 2, sb["y"] + sb["height"] / 2); time.sleep(0.7)
        check(t, "align, play the sequence: a click on the big photo while it plays leaves the play mode", pl()["play"] and not t.js("() => !!document.querySelector('#csAlignMain .align-stage.playing')"), pl()["where"])
        # Clicar, segurar e arrastar enquanto toca: sai do modo de tocar e o mesmo gesto já desloca a vista
        t.wait(lambda: t.js("() => !document.querySelector('#csAlignMain .align-wait')"), 10)
        t.js("() => document.getElementById('alignPlay').click()")
        t.wait(lambda: t.js("() => !!document.querySelector('#csAlignMain .align-stage.playing') && [...document.querySelectorAll('#csAlignMain .align-layer')].some((l) => l.style.visibility === 'visible')"), 10); time.sleep(0.4)
        cx0 = lambda: t.js("() => { const r = document.querySelector('#csAlignMain .align-ratio, #csAlignMain .crop-ratio'); return r ? Math.round(r.getBoundingClientRect().left) : null; }")
        x0 = cx0()
        px, py = sb["x"] + sb["width"] / 2, sb["y"] + sb["height"] * 0.7
        t.page.mouse.move(px, py); t.page.mouse.down(); t.page.mouse.move(px + 20, py + 4); t.page.mouse.move(px + 60, py + 8); time.sleep(0.3)
        mid = [t.js("() => !!document.querySelector('#csAlignMain .align-stage.playing')"), cx0(), t.js("() => getComputedStyle(document.querySelector('#csAlignMain .align-stage')).cursor")]
        t.page.mouse.up(); time.sleep(0.4)
        check(t, "align, play the sequence: press, hold and drag on the big photo while it plays stops the play and the same gesture pans the view (closed hand)",
              x0 is not None and mid[0] is False and mid[1] is not None and 50 <= mid[1] - x0 <= 70 and mid[2] == "grabbing" and pl()["play"], (x0, mid))
        t.page.keyboard.press("Control+0"); time.sleep(0.3)
        t.js("() => document.querySelectorAll('#csAlignMain .export-strip li.frame')[0].click()"); time.sleep(0.6)
        # Ajuste na mão: Rotate + na câmera 01; o rodapé conta, Ctrl+Z desfaz, "Back to the stick values" também
        t.wait(lambda: t.js("() => !document.querySelector('#csAlignMain .align-wait')"), 10)
        f0 = s3()["fields"]
        rb = t.js("() => { const b = [...document.querySelectorAll('#csAlignMain .align-ctl')].find((r) => /Rotate/.test(r.textContent)).querySelectorAll('button')[1].getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }")
        for _ in range(6):
            t.page.mouse.click(rb[0], rb[1]); time.sleep(0.12)
        time.sleep(0.5)
        d4 = s3()
        check(t, "align, step 3: adjusting a photo by hand changes its value, the footer counts it and 'Back to the stick values' lights up",
              abs(float(d4["fields"][3]) - float(f0[3]) - 0.3) < 0.011 and d4["note"] == "Values from the stick · 1 photo adjusted by hand" and not d4["back"], (f0, d4))
        t.shot("align-step3-adjusted")
        t.page.keyboard.press("ArrowRight"); time.sleep(0.5)
        t.page.keyboard.press("Control+z"); time.sleep(0.6)
        d5 = s3()
        check(t, "align, step 3: Ctrl+Z takes the last adjustment back and returns to the photo where it was made (as in Export)", d5["where"].startswith("Camera 01 of 04") and abs(float(d5["fields"][3]) - float(f0[3]) - 0.25) < 0.011, (d5["where"], d5["fields"]))
        t.js("() => document.getElementById('alignBackStick').click()"); time.sleep(0.6)
        d6 = s3()
        check(t, "align, step 3: 'Back to the stick values' drops the adjustments", d6["fields"] == f0 and d6["note"] == "Values from the stick · 0 photos adjusted by hand" and d6["back"], d6)
        # De novo, e fica: o que for salvo tem de ser a receita da haste com este giro a mais só na câmera 01
        for _ in range(4):
            t.page.mouse.click(rb[0], rb[1]); time.sleep(0.12)
        time.sleep(0.5)
        hand_rot = float(s3()["fields"][3])
        ed1 = [float(x) for x in s3()["fields"]]
        t.page.keyboard.press("ArrowRight"); time.sleep(0.6)
        ed2 = [float(x) for x in s3()["fields"]]
        check(t, "align, step 3: → goes to the next camera (the adjusted one is marked in the thumbnails)", s3()["where"].startswith("Camera 02 of 04") and t.js("() => document.querySelectorAll('#csAlignMain .export-strip li.frame.aligned').length") == 1, s3()["where"])
        t.shot("align-step3")
        # Janela estreita (protótipo K3, 2026-11-26): os avisos viram uma etiqueta com a contagem e o Keeps encurta
        vp = t.page.viewport_size
        topst = lambda: t.js("() => { const top = document.querySelector('#csAlignMain .rig-top'); return { compact: top.classList.contains('compact'), h: top.offsetHeight, vis: [...top.querySelectorAll('.align-auto > *')].filter((e) => !e.classList.contains('hidden')).map((e) => e.textContent) }; }")
        w0 = topst()
        t.js("() => { const k = document.getElementById('alignKeeps'); const c = document.createElement('span'); c.className = 'al-chip'; c.id = 'csAlignUneven'; c.textContent = 'Marks not at equal distances'; c.dataset.itip = 'Probe.'; k.before(c); }")
        t.page.set_viewport_size({"width": 1000, "height": vp["height"]}); time.sleep(0.8)
        w1 = topst()
        t.page.hover("#csAlignWarns"); time.sleep(0.3)
        wp = t.js("() => (document.getElementById('csAlignWarnPop') || {}).textContent || ''")
        t.page.mouse.move(5, 5); time.sleep(0.2)
        t.page.set_viewport_size(vp); time.sleep(0.8)
        w2 = topst()
        t.js("() => { const c = document.getElementById('csAlignUneven'); if (c) c.remove(); window.dispatchEvent(new Event('resize')); }"); time.sleep(0.3)
        check(t, "align, step 3, narrow window: the top row stays on one line, the warnings join in '2 warnings' (the list opens on hover) and Keeps gets short; wide again, the full texts are back",
              not w0["compact"] and w1["compact"] and w1["h"] == w0["h"] and w1["vis"][0] == "2 warnings" and re.match(r"^Keeps \d+%$", w1["vis"][1] or "") and "Mixed ratios" in wp and "Uneven marks" in wp and "Camera 02 shot 16:9" in wp
              and not w2["compact"] and "Marks not at equal distances" in w2["vis"], (w0, w1, wp, w2))
        # Bloco New sessions (protótipo A1; decisões B e S4 do dono, 2026-11-26): a câmera 02 fotografa em 16:9 e as
        # outras em 3:2, então "As shot" não vale e é preciso escolher uma proporção antes de salvar
        r0 = rig_state(t)
        check(t, "align, step 3: with cameras in different shapes, New sessions offers the ratios with As shot unavailable and nothing chosen; Save alignment waits",
              r0["title"] == "New sessions" and r0["seg"] == "As shot- 3:2 4:3 16:9 1:1" and r0["save"] == "Save alignment-", r0)
        check(t, "align, step 3: the Mixed ratios label next to Keeps says which camera and asks for a ratio", "Camera 02 shot 16:9; the others 3:2." in r0["mixed"] and "Choose an aspect ratio in New sessions" in r0["mixed"], r0["mixed"])
        rig_ratio(t, "16:9")
        r1 = rig_state(t)
        rig_ratio(t, "3:2")
        r2 = rig_state(t)
        check(t, "align, step 3: choosing a ratio changes the canvas and Keeps, and Save alignment lights up", "(16:9)" in r1["canvas"] and "(3:2)" in r2["canvas"] and r1["keeps"] != r2["keeps"] and r2["seg"] == "As shot- 3:2* 4:3 16:9 1:1" and r2["save"] == "Save alignment" and "cropped to 3:2" in r2["mixed"], (r1, r2))
        check(t, "align, step 3: the adjustment made by hand survives the change of ratio (same rotation, still counted)", abs(float(s3()["fields"][3]) - ed2[3]) < 0.011 and s3()["note"] == "Values from the stick · 1 photo adjusted by hand", (s3()["fields"], ed2, s3()["note"]))
        t.page.keyboard.press("Control+z"); time.sleep(1.0)
        r3 = rig_state(t)
        t.page.keyboard.press("Control+Shift+z"); time.sleep(1.0)
        r4 = rig_state(t)
        check(t, "align, step 3: Ctrl+Z and Ctrl+Shift+Z undo and redo the ratio", r3["seg"] == "As shot- 3:2 4:3 16:9* 1:1" and r4["seg"] == r2["seg"], (r3["seg"], r4["seg"]))
        t.button("Save alignment")
        time.sleep(0.6)
        rig = json.load(open(os.path.join(t.project, "stillpoint-rig.json")))
        al = rig.get("alignment") or {}
        check(t, "align: the ratio of the new sessions is saved with the alignment", al.get("ratio") == "3:2" and al.get("orient", "") == "", (al.get("ratio"), al.get("orient")))
        byo = sorted(al.get("cameras", []), key=lambda c: c.get("order", 0))
        check(t, "align: the photo adjusted by hand is saved with its new rotation; the others keep the values from the stick",
              len(byo) == 4 and abs(byo[0]["rot"] - hand_rot) < 0.006 and all(abs(c["rot"]) < abs(hand_rot) or abs(c["rot"] - hand_rot) > 0.05 for c in byo[1:]), [(c.get("order"), c.get("rot"), c.get("scale")) for c in byo])
        logged = t.js("() => [...document.querySelectorAll('li')].map((l) => l.textContent).filter((x) => /Cameras aligned \\(/.test(x)).pop() || ''")
        check(t, "align: the Activity says how many were adjusted by hand", "(4 cameras, 1 adjusted by hand)" in logged, logged)
        check(t, "align: the alignment is saved with the project (stillpoint-rig.json), one entry per camera, by serial number",
              len(al.get("cameras", [])) == 4 and all(c.get("serial") and len(c.get("marks", [])) == 3 for c in al["cameras"]), al.get("cameras"))
        check(t, "align: after saving, back in the main window (Camera settings closed)",
              t.js("() => !document.querySelector('.cs-sheet').classList.contains('aligning') && document.getElementById('camSettingsOverlay').classList.contains('hidden')"))
        # Com alinhamento guardado, o botão abre antes uma janela de aviso (pedido do dono, 2026-11-24)
        t.js("() => document.getElementById('alignBtn').click()")
        time.sleep(0.8)
        d = t.js("() => { const o = document.getElementById('dialogOverlay'); return { open: !o.classList.contains('hidden'), text: o.textContent, btns: [...o.querySelectorAll('button')].map((b) => b.textContent.trim()), aligning: document.querySelector('.cs-sheet').classList.contains('aligning'), behind: !document.getElementById('camSettingsOverlay').classList.contains('hidden') }; }")
        check(t, "align: with a saved alignment, a window warns before opening, over the main window (date, 'replaces that one when you save', Cancel / Align cameras)",
              d["open"] and not d["aligning"] and not d["behind"] and "This project already has an alignment" in d["text"] and "The cameras were aligned on " in d["text"] and "replaces that one when you save" in d["text"] and d["btns"] == ["Cancel", "Align cameras"], d)
        t.js("() => [...document.querySelectorAll('#dialogOverlay button')].find((b) => b.textContent.trim() === 'Cancel').click()")
        time.sleep(0.3)
        check(t, "align: Cancel in that window leaves everything as it was (back in the main window)", t.js("() => document.getElementById('dialogOverlay').classList.contains('hidden') && !document.querySelector('.cs-sheet').classList.contains('aligning') && document.getElementById('camSettingsOverlay').classList.contains('hidden')"))
        # Align cameras (na janela) › Fire › Fire again: as marcas são achadas sozinhas (pela foto de referência guardada)
        align_open(t)
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
        check(t, "align: Cancel goes back without changing the saved alignment",
              t.js("() => !document.querySelector('.cs-sheet').classList.contains('aligning')") and json.load(open(os.path.join(t.project, "stillpoint-rig.json")))["alignment"]["savedAt"] == al["savedAt"])
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
        # Decisões B e M1 (2026-11-26): a sessão nasce com a proporção do alinhamento e a janela Mixed ratios não abre
        check(t, "align: a new session starts with the ratio saved with the alignment (session.json)", info.get("crop") == "3:2|0.500|0.500", info.get("crop"))
        tag = t.js("(n) => { const g = document.querySelector('#sessionList li.folder[data-name=\"' + n + '\"] .mixed-tag'); return g ? g.dataset.itip : ''; }", s)
        check(t, "align: with the cameras aligned, the Mixed ratios window does not open after the shot; the label stays in the list, with the crop",
              not t.mixed_asked and "Camera 02 shot 16:9" in (tag or "") and "Crop on export: 3:2" in (tag or ""), (t.mixed_asked, tag))
        # ---- Parte 4: o Export usa o alinhamento da sessão (Align photos, seletor Alignment) ----
        import math
        o = t.originals(s)
        files = sorted(f for f in os.listdir(o) if f.lower().endswith(".jpg"))
        marks = {f: _mark_centers(os.path.join(o, f)) for f in files}
        sizes = {f: Image.open(os.path.join(o, f)).size for f in files}
        # A medida das fotos vem do cabeçalho do arquivo (sem decodificar): tem de dar o tamanho real de cada uma
        got = t.js("(a) => Promise.all(a[1].map((f) => window.photoSize(a[0], f).then((r) => [f, r.width, r.height])))", [s, files])
        check(t, "photo sizes: read from the file header, they match the real size of every photo", all(sizes[f] == (w, h) for f, w, h in got) and len(got) == len(files), got)
        check(t, "photo queue: the session on screen can be put first (photoHurry)", t.js("(n) => typeof window.photoHurry === 'function' && window.photoHurry(n).then((r) => r === true)", s))
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
        # O que foi ajustado na mão no passo 3 chega igual ao Export: mesma posição em relação ao tamanho, mesmo giro,
        # e a mesma relação de tamanho com a câmera 02 (o tamanho comum muda com a proporção escolhida)
        ex = parse(saved()); x1, x2 = ex.get(files[0]) or [0, 0, 1, 0], ex.get(files[1]) or [0, 0, 1, 0]
        rt = (abs(x1[0] / x1[2] - ed1[0] / (ed1[2] / 100)), abs(x1[1] / x1[2] - ed1[1] / (ed1[2] / 100)), abs(x1[3] - ed1[3]), abs(x1[2] / x2[2] - ed1[2] / ed2[2]))
        check(t, "export: the photo adjusted by hand in step 3 comes out as it was left there (position, rotation and size against camera 02)",
              rt[0] < 1.5 and rt[1] < 1.5 and rt[2] < 0.006 and rt[3] < 0.002, (rt, ed1, ed2, x1, x2))
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
        # A conferência do alinhamento do rig sai nos detalhes técnicos da Activity ao entrar no Align photos; a haste
        # alinhada (haste × tamanho) tem de dar o mesmo em todas as câmeras
        tech = t.js("() => [...document.querySelectorAll('.log-list li')].map((l) => l.textContent).filter((x) => /Rig alignment check|aligned pole/.test(x))")
        poles = [float(re.search(r"aligned pole (\d+) px", x).group(1)) for x in tech if "aligned pole" in x]
        check(t, "Align photos: entering it logs the rig alignment check, and the aligned pole is the same in every camera",
              any("Rig alignment check" in x for x in tech) and len(poles) >= 3 and max(poles) - min(poles) <= max(poles) * 0.02, (poles, tech[-4:]))
        auto_text = saved()
        b = t.page.locator('#exportSettings .align-ctl', has_text="Size").locator("button").nth(1)
        b.click(modifiers=["Shift"])
        time.sleep(0.8)
        check(t, "Align photos: an adjustment on top turns 'Back to automatic' on", saved() != auto_text and back_off() is False)
        # Alinhamento diferente do rig (protótipos B e C, 2026-11-26): o seletor diz "· edited", a miniatura mexida tem
        # o quadrado e "Edited", e o This photo mostra a etiqueta e o valor do rig ao lado da caixa mudada
        marks = lambda: t.js("""() => { const s = document.getElementById('alignModeSel'), ex = document.getElementById('exportSettings');
            return { sel: s.options[0].textContent, amber: s.classList.contains('edited'),
              thumbs: [...ex.querySelectorAll('.export-strip > li')].map((l) => (l.querySelector('.frame-edit-dot') ? 'd' : '-') + (l.querySelector('.frame-edited') ? 'w' : '-')).join(' '),
              tag: [...ex.querySelectorAll('.align-edited-tag')].some((e) => !e.classList.contains('hidden') && e.offsetParent),
              notes: [...ex.querySelectorAll('.align-rig:not(.hidden)')].map((e) => e.closest('.align-ctl').querySelector('.align-lab').textContent + ':' + e.textContent),
              boxes: [...ex.querySelectorAll('.align-num.rig-edited')].length }; }""")
        m1 = marks()
        check(t, "Align photos: an edited photo is marked (selector '· edited' in amber, square and 'Edited' on its thumbnail, 'Edited' tag and the rig value next to Size; with the anchor off the photo centre, Move changes too)",
              m1["sel"].endswith(" · edited") and m1["amber"] and m1["thumbs"].count("dw") == 1 and m1["tag"] and any(re.match(r"Size:Rig \d+\.\d$", n) for n in m1["notes"]) and m1["boxes"] == len(m1["notes"]), m1)
        t.button("Back to automatic")
        check(t, "Align photos: 'Back to automatic' returns to the alignment of the rig", t.wait(lambda: saved() == auto_text and back_off() is True, 8), saved())
        time.sleep(0.6)
        m2 = marks()
        check(t, "Align photos: back on the alignment of the rig, the marks are gone", m2["sel"].startswith("Rig · ") and "edited" not in m2["sel"] and not m2["amber"] and "d" not in m2["thumbs"] and "w" not in m2["thumbs"] and not m2["tag"] and not m2["notes"] and m2["boxes"] == 0, m2)
        # "Reset all" e "Reset photo", com Rig escolhido, voltam ao alinhamento do rig (antes zeravam tudo: defeito
        # apontado pelo dono em 2026-11-26)
        reset = lambda name: t.js("(n) => [...document.querySelectorAll('#exportSettings .align-resets button')].find(b => b.textContent.trim() === n).click()", name)
        for name in ("Reset all", "Reset photo"):
            b.click(modifiers=["Shift"])
            time.sleep(0.8)
            changed = saved() != auto_text
            reset(name)
            check(t, "Align photos: with 'Rig', '%s' returns to the alignment of the rig (not to zero)" % name,
                  changed and t.wait(lambda: saved() == auto_text and back_off() is True, 8), saved())
        t.undo()
        check(t, "Align photos: undo of 'Reset photo' brings the adjustment back in one step", t.wait(lambda: saved() != auto_text and len(parse(saved())) == 4, 8), saved())
        t.button("Back to automatic")
        t.wait(lambda: saved() == auto_text, 8)
        # Âncora (AN2): a grade no título, o losango na foto, e Size e Rotate em volta dela (o ponto não sai do lugar)
        amark = lambda: t.js("() => { const m = document.querySelector('#exportSettings .align-anchor-mark').getBoundingClientRect(); return [Math.round(m.left), Math.round(m.top)]; }")
        agrid = lambda: t.js("() => [...document.querySelectorAll('#exportSettings .align-anchor-dot')].map((d) => (d.classList.contains('on') ? 'X' : '.')).join('')")
        fvals = lambda: t.js("() => [...document.querySelectorAll('#exportSettings .align-ctl .align-num')].map((i) => parseFloat(i.value))")
        time.sleep(0.6)
        t.page.click("#exportSettings .align-anchor-btn")   # (o ícone da âncora abre a caixa com as opções)
        time.sleep(0.4)
        pop = t.js("() => { const p = document.querySelector('#exportSettings .align-anchor-pop'); return { open: !p.classList.contains('hidden'), items: [...p.querySelectorAll('.align-anchor-item')].map((b) => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')), dots: p.querySelectorAll('.align-anchor-dot').length }; }")
        check(t, "anchor: the anchor icon in the title of This photo opens the box with 'Canvas center' (lit: the anchor starts there) and the 9 points of the photo", pop["open"] and pop["items"] == ["Canvas center*"] and pop["dots"] == 9, pop)
        t.page.click("#exportSettings .align-anchor-dot:nth-child(5)")
        time.sleep(0.6)
        a0, v0 = amark(), fvals()
        check(t, "anchor: the grid in the box puts the anchor on a point of the photo (centre) and lights that square", agrid() == "....X...." and len(parse(saved())) == 4 and ",0.5000,0.5000" in saved(), (agrid(), saved()))
        t.page.mouse.move(a0[0], a0[1]); t.page.mouse.down(); t.page.mouse.move(a0[0] - 160, a0[1] - 120, steps=4); t.page.mouse.up()
        time.sleep(0.6)
        a1 = amark()
        check(t, "anchor: dragging the mark on the photo moves the anchor freely (no square lit), and the photo stays", abs(a1[0] - (a0[0] - 160)) <= 2 and abs(a1[1] - (a0[1] - 120)) <= 2 and agrid() == "........." and fvals() == v0, (a0, a1, agrid(), fvals(), v0))
        b.click(modifiers=["Shift"])
        time.sleep(0.6)
        t.page.locator('#exportSettings .align-ctl', has_text="Rotate").locator("button").nth(1).click(modifiers=["Shift"])
        time.sleep(0.6)
        a2, v2 = amark(), fvals()
        check(t, "anchor: Size and Rotate act around it (the anchor stays where it was on the screen; Move X and Move Y follow)",
              abs(a2[0] - a1[0]) <= 1 and abs(a2[1] - a1[1]) <= 1 and v2[2] != v0[2] and v2[3] != v0[3] and (v2[0] != v0[0] or v2[1] != v0[1]), (a1, a2, v0, v2))
        t.button("Back to automatic")
        t.wait(lambda: saved() == auto_text, 8)
        time.sleep(0.6)
        # Edição global (G2): o botão da barra de ferramentas; ligado, a mudança numa foto vale para todas, como a
        # mesma mudança em volta da âncora do canvas; sem lugar em alguma, todas vão até onde a mais apertada deixa
        nums = lambda: [[float(v) for v in x.split(":")[1].split(",")[:4]] for x in saved().split(";") if ":" in x]
        g0 = nums()
        t.page.click("#exportSettings .align-all-btn")
        time.sleep(0.5)
        gs = t.js("() => { const ex = document.getElementById('exportSettings'), blk = ex.querySelector('.align-block.all-on'); return { on: ex.querySelector('.align-all-btn').classList.contains('on'), title: blk ? blk.querySelector('h3').firstChild.textContent : '', cur: blk ? blk.querySelector('.align-cur').textContent : '', strip: ex.querySelector('.export-strip').classList.contains('all-on') }; }")
        check(t, "edit all: the button in the tool bar turns it on (the panel says 'All photos · 01–04' and the thumbnails are outlined)", gs["on"] and gs["title"] == "All photos" and gs["cur"] == "01–04" and gs["strip"], gs)
        b.click(modifiers=["Shift"])
        time.sleep(0.8)
        g1 = nums()
        ratios = [g1[k][2] / g0[k][2] for k in range(4)] if len(g1) == 4 and len(g0) == 4 else []
        check(t, "edit all: Size + on one photo resizes the four by the same factor", len(ratios) == 4 and ratios[0] > 1.001 and max(ratios) - min(ratios) < 1e-4, (ratios, g0, g1))
        t.page.locator('#exportSettings .align-ctl', has_text="Rotate").locator("button").nth(1).click(modifiers=["Shift"])
        time.sleep(0.8)
        g2 = nums()
        drot = [round(g2[k][3] - g1[k][3], 3) for k in range(4)] if len(g2) == 4 else []
        check(t, "edit all: Rotate + turns the four by the same angle", drot == [0.5] * 4, (drot, g2))
        for _ in range(40):
            t.page.locator('#exportSettings .align-ctl', has_text="Size").locator("button").nth(0).click(modifiers=["Shift"]); time.sleep(0.03)
        time.sleep(0.8)
        g3 = nums()
        r3 = [g3[k][2] / g2[k][2] for k in range(4)] if len(g3) == 4 else []
        check(t, "edit all: shrinking past what the tightest photo allows stops all of them at the same factor", len(r3) == 4 and r3[0] < 0.999 and max(r3) - min(r3) < 1e-4, r3)
        t.page.click("#exportSettings .align-all-btn")
        time.sleep(0.5)
        b.click(modifiers=["Shift"])
        time.sleep(0.8)
        g4 = nums()
        check(t, "edit all: turned off, a change goes to the open photo only", len(g4) == 4 and sum(1 for k in range(4) if abs(g4[k][2] - g3[k][2]) > 1e-6) == 1 and t.js("() => !document.querySelector('#exportSettings .align-block.all-on')"), (g3, g4))
        t.button("Back to automatic")
        t.wait(lambda: saved() == auto_text, 8)
        time.sleep(0.6)
        # Ferramenta do canvas (C1): no grupo do Resize photo (tecla C); o bloco "Canvas" entra no lugar do This photo;
        # o canvas só diminui e anda dentro do canvas inteiro, e o que a pessoa escolhe vai guardado como "@canvas"
        cvs = lambda: t.js("() => { const ex = document.getElementById('exportSettings'), b = ex.querySelector('.align-block.for-canvas'); return { tool: ex.querySelector('.align-stage').dataset.tool, canvas: !!b.offsetParent, photo: !!ex.querySelector('.align-block.for-photo').offsetParent, nums: [...b.querySelectorAll('.align-num')].map((i) => parseFloat(i.value)), size: b.querySelector('.align-cur').textContent, handles: [...ex.querySelectorAll('.align-canvas-handle')].filter((h) => h.offsetParent).length }; }")
        entry = lambda: [x for x in saved().split(";") if x.startswith("@canvas:")]
        t.page.keyboard.press("c")
        time.sleep(0.5)
        c0 = cvs()
        check(t, "canvas tool: key C picks 'Resize canvas'; the Canvas block takes the place of This photo and the canvas gets eight handles", c0["tool"] == "canvas" and c0["canvas"] and not c0["photo"] and c0["handles"] == 8 and c0["nums"] == [0, 0, 100] and not entry(), c0)
        w_full = int(c0["size"].split(" ")[0])
        ci = t.page.locator('#exportSettings .align-block.for-canvas .align-ctl', has_text="Size").locator("input")
        ci.click(); ci.fill("80"); ci.press("Enter")
        time.sleep(0.9)
        c1 = cvs()
        check(t, "canvas tool: Size 80 makes the canvas 80% of the full one (fewer pixels) and it is saved with the session", c1["nums"][2] == 80 and abs(int(c1["size"].split(" ")[0]) - round(w_full * 0.8)) <= 1 and len(entry()) == 1 and ",0.80000," in entry()[0], (c1, entry()))
        ci.click(); ci.fill("140"); ci.press("Enter")
        time.sleep(0.9)
        check(t, "canvas tool: the canvas never goes above 100% (no photo is enlarged)", cvs()["nums"][2] == 100 and not entry(), (cvs(), entry()))
        ci.click(); ci.fill("70"); ci.press("Enter")
        time.sleep(0.6)
        mxi = t.page.locator('#exportSettings .align-block.for-canvas .align-ctl', has_text="Move X").locator("input")
        mxi.click(); mxi.fill("5000"); mxi.press("Enter")
        time.sleep(0.9)
        c2 = cvs()
        check(t, "canvas tool: moving the canvas stops where the photos (and the full canvas) end", 0 < c2["nums"][0] <= w_full * 0.15 + 1, c2)
        t.button("Reset canvas")
        time.sleep(0.9)
        check(t, "canvas tool: 'Reset canvas' goes back to the full canvas and nothing stays saved", cvs()["nums"] == [0, 0, 100] and not entry() and saved() == auto_text, (cvs(), saved()))
        t.page.click('#exportSettings #alignTools .align-tool[data-group^="pointer"]')
        time.sleep(0.4)
        check(t, "canvas tool: back on Select, This photo returns", cvs()["photo"] and not cvs()["canvas"], cvs())
        # Espelhada conta como mexida: ganha as marcas, acende o "Back to automatic", e ele tira o espelhamento
        time.sleep(0.6)
        t.page.click("#exportSettings .flip-btn[data-flip=h]")
        time.sleep(1.0)
        m3 = marks()
        check(t, "Align photos: a flipped photo is marked as edited and turns 'Back to automatic' on", m3["sel"].endswith(" · edited") and m3["thumbs"].count("dw") == 1 and m3["tag"] and m3["boxes"] == 0 and back_off() is False, (m3, back_off()))
        t.button("Back to automatic")
        ok = t.wait(lambda: saved() == auto_text and back_off() is True, 8)
        time.sleep(0.6)
        m4 = marks()
        check(t, "Align photos: 'Back to automatic' takes the flip off too", ok and "d" not in m4["thumbs"] and not m4["tag"] and "edited" not in m4["sel"], (saved(), m4))
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
            return t.js("() => { const n = document.querySelector('#csGallery .al-saved'); return [n.querySelector('.al-again-text').textContent.split(' since the alignment of ')[0], n.classList.contains('warn'), n.classList.contains('hidden'), n.querySelector('.al-again-kind').textContent + '|' + n.querySelector('.al-again-btn').textContent, n.previousElementSibling.className, n.querySelector('.al-again-text').textContent]; }")
        note = test_shot_note()
        check(t, "realign: nothing changed, so the Test shot shows no alignment text next to 'Hide photos'", note[0] == "" and not note[1] and note[2], note)
        t.button("Done")
        t.env["STILLPOINT_FAKE_FOCAL"] = "35,35,50,35"   # a terceira câmera mudou o zoom
        t.restart_app()
        note = test_shot_note()
        check(t, "realign: one camera changed its zoom: amber 'Align again · SL3_2 zoom changed'", note[:5] == ["SL3_2 zoom changed", True, False, "Align again|Align cameras", "gallery-head"] and note[5].endswith("It gets no automatic alignment until you align again; the others stay aligned."), note)
        t.shot("align-again-bar")
        t.js("() => document.querySelector('#csGallery .al-again-btn').click()"); time.sleep(0.8)
        dg = t.js("() => { const o = document.getElementById('dialogOverlay'); return [!o.classList.contains('hidden'), o.textContent.includes('This project already has an alignment'), o.textContent.includes('SL3_2 zoom changed')]; }")
        check(t, "realign: 'Align cameras' in the amber bar asks the same question as the button of the main window", dg == [True, True, True], dg)
        t.button("Align cameras"); time.sleep(0.8)
        check(t, "realign: confirming opens the Align cameras window at step 1", t.js("() => !document.getElementById('csAlign').classList.contains('hidden') && document.getElementById('csAlignStep1').classList.contains('on')"))
        t.button("Cancel"); time.sleep(0.6)
        check(t, "realign: Cancel goes back to Camera settings with the Test shot (opened from there)", t.js("() => !document.getElementById('camSettingsOverlay').classList.contains('hidden') && document.getElementById('csAlign').classList.contains('hidden')"))
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
        check(t, "realign: a camera was added: amber 'Align again · 1 new camera'", note[:5] == ["1 new camera", True, False, "Align again|Align cameras", "gallery-head"] and note[5].endswith("It gets no automatic alignment until you align again; the others stay aligned."), note)
        t.button("Done")
        t.env["STILLPOINT_FAKE_CAMERAS"] = "3"            # saiu uma câmera
        t.restart_app()
        note = test_shot_note()
        check(t, "realign: a camera was removed: amber 'Align again · T7_2 not connected'", note[:5] == ["T7_2 not connected", True, False, "Align again|Align cameras", "gallery-head"] and note[5].endswith("It gets no automatic alignment until you align again; the others stay aligned."), note)
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
        align_open(t)  # "Align cameras" ou, com alinhamento guardado, "Align again"
        time.sleep(0.3)
        t.button("Fire")
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
              A("() => [...document.querySelectorAll('.ga-side button:not(.hidden)')].map(b => b.textContent).join('|')") == "● Live aim on"
              and A("() => [...document.querySelectorAll('#gaUnder button')].map(b => b.textContent).join('|')") == "← Previous camera|Next camera →"
              and A("() => { const u = document.getElementById('gaUnder').getBoundingClientRect(), p = document.getElementById('gaPhoto').getBoundingClientRect(); return u.top >= p.bottom && Math.abs(u.width - p.width) < 2; }")
              and "one camera at a time" in A("() => document.querySelector('.ga-note').textContent"))
        # Os instrumentos (forma G2a): um bloco por ajuste, com o desenho; mexem com a câmera ao vivo
        inst = lambda: A("() => [...document.querySelectorAll('#gaInst .inst')].map((i) => i.dataset.k + ':' + i.className.replace('inst ', '') + ':' + i.querySelector('.inst-v').textContent + ':' + (i.querySelector('svg rect[fill]:last-of-type, svg g') || i).outerHTML.length)")
        i0 = inst()
        check(t, "guided aim: four instruments (Aim, Level, Size, Height), each with its drawing, and the text list out of sight",
              [x.split(":")[0] for x in i0] == ["aim", "level", "size", "height"] and A("() => document.querySelectorAll('#gaInst .inst svg').length") == 4
              and A("() => { const r = document.getElementById('gaLines').getBoundingClientRect(); return r.width <= 1 && r.height <= 1; }"), i0)
        moved = t.wait(lambda: A("() => document.getElementById('gaInst').innerHTML") != A("() => window.__inst0 || (window.__inst0 = document.getElementById('gaInst').innerHTML)"), 8)
        check(t, "guided aim: with Live aim the instruments change as the camera moves", moved, (i0, inst()))
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
        fire = A("() => { const f = document.getElementById('gaFire'); return [f.classList.contains('hidden'), f.textContent, f.disabled]; }")
        check(t, "guided aim: with Live aim off, 'Fire again' shows in the window", fire == [False, "Fire again", False], fire)
        check(t, "guided aim: clicking 'Live aim on' turns it off (no LIVE tag, the last photo)", ok, A("() => [document.getElementById('gaLive').textContent, document.getElementById('gaInfo').textContent]"))
        cur = A("() => document.getElementById('gaName').textContent")
        time.sleep(2.0)
        check(t, "guided aim: with Live aim off the camera does not change by itself", A("() => document.getElementById('gaName').textContent") == cur)
        # Fire again na janela: uma foto nova só da câmera da tela; as fotos das outras ficam as mesmas
        fire_cam = cur.split(" · ")[1]
        od = os.path.join(t.data, "Order photos")
        files = lambda: {d: sorted((f, os.path.getmtime(os.path.join(od, d, f))) for f in os.listdir(os.path.join(od, d)) if "_IMG_" in f) for d in os.listdir(od) if not d.startswith(".")}
        f0 = files()
        t.js("() => { window.__mainFlash = 0; new MutationObserver(() => { if (!document.getElementById('flash').classList.contains('hidden')) window.__mainFlash++; }).observe(document.getElementById('flash'), { attributes: true }); }")
        act0 = t.js("() => document.querySelectorAll('.log-list li').length")
        aim.evaluate("() => { window.__aimFlash = 0; new MutationObserver(() => { if (!document.getElementById('gaFlash').classList.contains('hidden')) window.__aimFlash++; }).observe(document.getElementById('gaFlash'), { attributes: true }); }")
        aim.click("#gaFire")
        took = t.wait(lambda: A("() => document.getElementById('gaFire').textContent") != "Fire again", 5)
        back = t.wait(lambda: A("() => document.getElementById('gaFire').textContent") == "Fire again" and t.js("() => !document.getElementById('csAlignWait')") and A("() => document.querySelectorAll('#gaInst .inst').length") >= 1, 40)
        time.sleep(0.5)
        f1 = files()
        same_others = len(f0) == 1 and list(f0) == list(f1) and all(x in list(f1.values())[0] for x in list(f0.values())[0] if ("_" + fire_cam + "_IMG_") not in x[0])
        new_one = [x for x in list(f1.values())[0] if ("_" + fire_cam + "_IMG_") in x[0]]; old_one = [x for x in list(f0.values())[0] if ("_" + fire_cam + "_IMG_") in x[0]]
        check(t, "guided aim: 'Fire again' in the window takes a new photo with this camera only (the other photos stay as they were)",
              back and same_others and len(new_one) == 1 and new_one != old_one and len(list(f1.values())[0]) == len(list(f0.values())[0]), (took, back, f0, f1))
        fl = (A("() => window.__aimFlash"), t.js("() => window.__mainFlash"), [x for x in t.js("() => [...document.querySelectorAll('.log-list li')].map((l) => l.textContent)")[act0:] if "Bullet time" in x])
        check(t, "guided aim: the flash of that shot shows in the Guided aim window, not in the main one, and the Activity says nothing about a bullet time", fl[0] >= 1 and fl[1] == 0 and fl[2] == [], fl)
        check(t, "guided aim: after it, the instruments of this camera are back and the camera on screen is the same",
              A("() => document.querySelectorAll('#gaInst .inst').length") == 4 and A("() => document.getElementById('gaName').textContent") == cur,
              (A("() => [document.getElementById('gaInst').textContent, document.getElementById('gaFire').textContent, document.getElementById('gaName').textContent]"), cur))
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
            if want == "plain":
                # O projeto ficou com 200 câmeras e agora há 8: o aviso resume em vez de listar as 192
                said = lambda: t.js("() => [...document.querySelectorAll('li')].map((l) => l.textContent).filter((x) => /rig is not the one/.test(x)).pop() || ''")
                t.wait(lambda: bool(said()), 12)
                check(t, "rig notice with many cameras missing: the count and the first three, not the whole list", "192 cameras not connected (" in said() and " and 189 more)" in said() and len(said()) < 200, said()[:300])
                lines = t.js("() => [...document.querySelectorAll('.log-list li')].filter((l) => /rig is not the one/.test(l.textContent)).map((l) => l.className)")
                check(t, "rig notice: one line in the Activity, amber (not two, one of them red)", lines == ["warn"], lines)
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
        short = steps()
        d = t.js("() => { const r = document.querySelector('#timingCustom .timing-step'); return { cells: r.querySelectorAll('.step-bar i').length, on: r.querySelectorAll('.step-bar i.on').length, chipsOn: r.querySelectorAll('.cam-chip.on').length, usedBar: document.querySelectorAll('#timingCustom .timing-step')[1].querySelectorAll('.step-bar i.used').length, nums: [...r.querySelectorAll('.step-bar-nums span')].map((e) => e.textContent), count: r.querySelector('.step-count').textContent, btn: r.querySelector('.step-grid-btn').textContent, grid: getComputedStyle(r.querySelector('.step-cams')).display }; }")
        check(t, "custom, 200 cameras: each step is a bar of the whole rig with its cameras lit, the others' dimmed, and the count", short[0][1] < 70 and d["cells"] == 200 and d["on"] == d["chipsOn"] > 0 and d["usedBar"] == d["on"] and d["nums"] == ["1", "50", "100", "150", "200"] and d["count"].lower().endswith("cameras"), (short, d))
        check(t, "custom, 200 cameras: the grid of numbers starts closed, behind the 'Grid' button", d["grid"] == "none" and d["btn"] == "▾ Grid", d)
        t.js("() => document.querySelectorAll('#timingCustom .step-grid-btn').forEach((b) => b.click())")
        time.sleep(0.1)
        half = steps()
        time.sleep(0.5)
        before = steps()
        d = t.js("() => document.querySelector('#timingCustom .step-grid-btn').textContent")
        check(t, "custom, 200 cameras: 'Grid' opens every number, with an animation, and turns into 'Hide grid'", before[0][1] > 300 and short[0][1] < half[0][1] < before[0][1] and d == "▴ Hide grid", (short, half, before))
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        x, y = t.js("() => { const r = document.querySelector('#timingCustom .timing-step'), n = r.querySelector('.step-n'); n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return [b.x + 8, b.y + b.height / 2]; }")
        t.page.mouse.move(x, y)
        t.page.mouse.down()
        t.page.mouse.move(x, y + 12, steps=2)
        time.sleep(0.3)
        mid = t.js("() => ({ rows: [...document.querySelectorAll('#timingCustom .timing-step')].map((r) => Math.round(r.getBoundingClientRect().height)), sum: [...document.querySelectorAll('#timingCustom .step-sum')].map((e) => e.textContent), y: (() => { const b = document.querySelector('#timingCustom .timing-step.dragging').getBoundingClientRect(); return [b.top, b.bottom]; })() })")
        time.sleep(0.4)
        mid = t.js("() => ({ rows: [...document.querySelectorAll('#timingCustom .timing-step')].map((r) => Math.round(r.getBoundingClientRect().height)), sum: [...document.querySelectorAll('#timingCustom .step-sum')].map((e) => e.textContent), y: (() => { const b = document.querySelector('#timingCustom .timing-step.dragging').getBoundingClientRect(); return [b.top, b.bottom]; })() })")
        check(t, "custom, 200 cameras: while a step is dragged every step shrinks to its one line with the bar", before[0][1] > 300 and max(mid["rows"]) < 70, (before, mid))
        check(t, "custom, 200 cameras: the dragged step stays under the mouse", mid["y"][0] <= y + 12 <= mid["y"][1], (mid["y"], y + 12))
        t.page.mouse.move(x, y + 150, steps=5)
        time.sleep(0.3)
        t.page.mouse.up()
        time.sleep(0.6)
        after = steps()
        check(t, "custom, 200 cameras: dropping it below the other step changes the order, and the numbers come back", [a[0] for a in after] == [b[0] for b in before][::-1] and before[0][0] != before[1][0] and after[1][1] > 300, (before, after))
        t.js("() => document.querySelector('#timingCustom .step-grid-btn').click()")
        time.sleep(0.5)
        again = steps()
        check(t, "custom, 200 cameras: 'Hide grid' closes the step again", again[0][1] < 70 and again[1][1] > 300, again)
        x0, y0, x1, y1 = t.js("() => { const r = document.querySelectorAll('#timingCustom .timing-step')[1], c = (o) => { const b = r.querySelector('.cam-chip[data-o=\"' + o + '\"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }; r.querySelector('.cam-chip[data-o=\"150\"]').scrollIntoView({ block: 'center' }); return [...c(150), ...c(152)]; }")
        t.page.mouse.move(x0, y0); t.page.mouse.down(); t.page.mouse.move(x1, y1, steps=3); t.page.mouse.up()
        time.sleep(0.5)
        d = t.js("() => { const r = document.querySelectorAll('#timingCustom .timing-step')[1]; return [[...r.querySelectorAll('.step-bar i')].map((e, k) => e.classList.contains('on') ? k + 1 : 0).filter((n) => n >= 150 && n <= 152), r.querySelector('.step-bar').title]; }")
        check(t, "custom, 200 cameras: marking numbers on the grid lights the same cameras on the bar, and the bar says which", d[0] == [150, 151, 152] and "150–152" in d[1], d)
        check(t, "custom drag: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        t.js("() => { try { localStorage.removeItem('timing'); } catch (e) {} }")
        t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
        t.restart_app()


def scenario_align_gone(t, name, photos):
    line("\n== 26. Align cameras: a camera of the rig that is not connected is shown and warned about, not hidden")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    t.env["STILLPOINT_FAKE_FIXED"] = "all"
    gone = ""
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
        align_open(t)
        time.sleep(0.3)
        t.button("Fire")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 20)
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        order_dir = os.path.join(t.data, "Order photos")
        sess = sorted(d for d in os.listdir(order_dir) if not d.startswith("."))[-1]
        sel = t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera")
        f = [x for x in os.listdir(os.path.join(order_dir, sess)) if "_" + sel + "_IMG_" in x][0]
        centers = _mark_centers(os.path.join(order_dir, sess, f))
        # (depois de um cenário com 200 câmeras o aviso "The rig is not the one of this project" lista todas e cobre a foto)
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        for k in range(3):
            t.page.mouse.click(box["x"] + centers[k][0] * box["width"], box["y"] + centers[k][1] * box["height"])
            time.sleep(0.25)
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        check(t, "align gone: the marks clicked in one photo are found in the four", ok)
        check(t, "align, evenly spaced marks: no note about uneven marks", t.js("() => !document.getElementById('csAlignUneven')"))
        check(t, "align, all connected: no camera is shown as not connected", t.js("() => document.querySelectorAll('#csAlignMain .ma-item.gone').length") == 0)
        names = t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item')].map(i => [i.querySelector('.al-num').textContent, i.dataset.camera]).sort().map(x => x[1])")
        # (não a câmera da foto onde as marcas foram clicadas: esse caso não está coberto aqui)
        gone = [n for n in names if n != sel][-1]
        num = "%02d" % (names.index(gone) + 1)
        place = names.index(gone)
        t.js("(n) => window.fakeUnplug(n, '1')", gone)
        live = lambda: t.js("() => { const g = [...document.querySelectorAll('#csAlignMain .ma-item.gone')], b = document.getElementById('csAlignOff'), f = [...document.querySelectorAll('#csAlignFoot button')].find((x) => /^Fire/.test(x.textContent.trim())); return { gone: g.map((i) => i.dataset.camera), text: g.map((i) => i.textContent).join(' | '), n: document.querySelectorAll('#csAlignMain .ma-item').length, band: b.classList.contains('hidden') ? '' : b.querySelector('.al-again-kind').textContent + ': ' + b.querySelector('.al-again-text').textContent, note: document.getElementById('csAlignNote').textContent, warn: document.getElementById('csAlignNote').classList.contains('warn'), fireOff: f.disabled, toast: false, sel: (document.querySelector('#csAlignMain .ma-item.sel') || { dataset: {} }).dataset.camera || '' }; }")
        t.wait(lambda: live()["gone"] == [gone], 10)
        d = live()
        check(t, "align, a camera drops at step 2: at once it is greyed in the list, in place, as 'Not connected · Turn it on to reconnect'", d["gone"] == [gone] and d["n"] == 4 and "Not connected" in d["text"] and "Turn it on to reconnect" in d["text"], d)
        check(t, "align, a camera drops: an amber band at the top names it and says it comes back by itself", d["band"] == "Not connected: Camera %s (%s) turned off or disconnected. Turn it on to reconnect: it comes back by itself. Until then it is left out of the alignment." % (num, gone), d["band"])
        check(t, "align, a camera drops: the footer counts it and 'Fire again' stays on", "1 not connected" in d["note"] and not d["fireOff"], d)
        t.shot("align-camera-dropped")
        t.js("(n) => window.fakeUnplug(n, '0')", gone)
        ok = t.wait(lambda: live()["gone"] == [] and live()["band"] == "", 15)
        d = live()
        check(t, "align, the camera is turned on again: it comes back to the list by itself, with its marks, and the band goes away", ok and d["n"] == 4 and "not connected" not in d["note"] and t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length") == 4, d)
        # Todas caem: a faixa diz "No camera connected" e o Fire again fica apagado
        for n in names:
            t.js("(n) => window.fakeUnplug(n, '1')", n)
        t.wait(lambda: len(live()["gone"]) == 4, 10)
        d = live()
        check(t, "align, every camera drops: band 'No camera connected', footer 'No camera connected' in amber, 'Fire again' off",
              d["band"] == "No camera connected: All 4 cameras turned off or disconnected. Turn them on to reconnect: they come back by themselves." and d["note"] == "No camera connected" and d["warn"] and d["fireOff"], d)
        t.shot("align-no-camera")
        for n in names:
            if n != gone:
                t.js("(n) => window.fakeUnplug(n, '0')", n)
        t.wait(lambda: live()["gone"] == [gone] and not live()["fireOff"], 15)
        check(t, "align, the others come back: only the one still off stays greyed, and a connected camera is the chosen one", live()["gone"] == [gone] and live()["sel"] not in ("", gone), live())
        time.sleep(1.0)
        t.button("Fire again")
        t.wait(lambda: t.js("() => /last one it took/.test((document.querySelector('#csAlignMain .ma-item.gone') || {}).textContent || '')"), 60)
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.gone').length === 1 && document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item:not(.gone).needs').length === 3 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        d = t.js("() => { const its = [...document.querySelectorAll('#csAlignMain .ma-item')], g = its.find((i) => i.classList.contains('gone')); return g ? { pos: its.indexOf(g), n: its.length, cam: g.dataset.camera, text: g.textContent, photo: g.querySelector('.al-photo').style.backgroundImage.length > 10, foot: document.querySelector('#csAlign').textContent } : null; }")
        check(t, "align, one unplugged, after 'Fire again': it stays in the list, in its place, marked 'Not connected' with its last photo", bool(d) and d["n"] == 4 and d["pos"] == place and d["cam"] == gone and "Not connected" in d["text"] and "last one it took" in d["text"] and d["photo"], d)
        check(t, "align, one unplugged: the line under the list counts it ('1 not connected')", bool(d) and "of 3 cameras need a change · 1 not connected" in d["foot"], d and d["foot"][-200:])
        t.js("() => document.querySelector('#csAlignMain .ma-item.gone').click()")
        time.sleep(0.3)
        check(t, "align, one unplugged: clicking it does not choose it", t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera") != gone)
        t.button("Review alignment")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .export-strip li.frame').length") == 4, 10)
        d = t.js("() => { const cs = [...document.querySelectorAll('#csAlignMain .export-strip li.frame')], g = cs.find((c) => c.classList.contains('gone')), w = document.getElementById('csAlignGone'); return { pos: cs.indexOf(g), cell: g ? g.textContent : '', warn: w ? w.textContent : '', btns: [...document.querySelectorAll('#csAlign .btn-primary')].map((b) => b.textContent.trim()) }; }")
        check(t, "align, save: the unplugged camera is in the row of thumbnails, in its place, as 'Not connected' (no alignment)", d["pos"] == place and "Not connected" in d["cell"] and num in d["cell"] and t.js("() => /is not connected: no alignment/.test(document.querySelector('#csAlignMain .export-strip li.frame.gone').title)"), d)
        check(t, "align, save: the warning names the camera and says what saving does", ("1 camera of the rig is not connected: Camera " + num + ".") in d["warn"] and "the one it had is erased" in d["warn"] and "fire again" in d["warn"], d["warn"])
        check(t, "align, save: the button says 'Save without it' (the warning does not block)", "Save without it" in d["btns"] and "Save alignment" not in d["btns"], d["btns"])
        rig_ratio(t, "3:2")
        t.button("Save without it")
        t.wait(lambda: t.js("() => document.getElementById('csAlign').classList.contains('hidden')"), 10)
        time.sleep(0.5)
        logged = t.js("() => [...document.querySelectorAll('li')].map((l) => l.textContent).filter((x) => /Cameras aligned \\(/.test(x)).pop() || ''")
        check(t, "align, saved without it: the Activity says 3 cameras and which one was left without alignment", "(3 cameras)" in logged and ("Not connected, left without alignment: Camera " + num + ".") in logged, logged)
        t.js("(n) => window.fakeUnplug(n, '0')", gone)
        gone = ""
        time.sleep(1.5)
        check(t, "align gone: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        if gone:
            t.js("(n) => window.fakeUnplug(n, '0')", gone)
        t.js("() => { const c = [...document.querySelectorAll('#csAlign button')].find((b) => b.textContent.trim() === 'Cancel'); if (c && !document.getElementById('csAlign').classList.contains('hidden')) c.click(); }")
        time.sleep(0.3); t.leave_align()
        t.env.pop("STILLPOINT_FAKE_FIXED", None)
        t.restart_app()


def scenario_align_uneven(t, name, photos):
    line("\n== 27. Align cameras: marks that are not evenly spaced get an amber note (and the alignment still works)")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    t.env["STILLPOINT_FAKE_FIXED"] = "all"
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
        align_open(t)
        time.sleep(0.3)
        # Your marks (passo 1): dois cartões, "Equal distances" escolhido; a pessoa diz que as marcas não são iguais
        m0 = t.js("() => [...document.querySelectorAll('#csAlignMain .al-mark')].map((b) => b.dataset.marks + (b.classList.contains('on') ? '*' : '') + ':' + b.querySelector('b').textContent)")
        check(t, "align, your marks: step 1 asks about the marks, with 'Equal distances' chosen", m0 == ["even*:Equal distances", "uneven:Not equal"] and "Kept with the project" in t.js("() => document.getElementById('csAlignMain').textContent"), m0)
        # Primeiro com "Equal distances" e marcas que não estão a distâncias iguais: o programa avisa, sem trocar a conta
        stage = "equal"
        t.button("Fire")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 20)
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        order_dir = os.path.join(t.data, "Order photos")
        sess = sorted(d for d in os.listdir(order_dir) if not d.startswith("."))[-1]
        sel = t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera")
        f = [x for x in os.listdir(os.path.join(order_dir, sess)) if "_" + sel + "_IMG_" in x][0]
        c = _mark_centers(os.path.join(order_dir, sess, f))
        # A terceira "marca" é um ponto da haste abaixo da marca azul: a do meio deixa de estar no meio
        low = (c[2][0] + (c[2][0] - c[1][0]) * 0.55, c[2][1] + (c[2][1] - c[1][1]) * 0.55)
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        for q in (c[0], c[1], low):
            t.page.mouse.click(box["x"] + q[0] * box["width"], box["y"] + q[1] * box["height"])
            time.sleep(0.25)
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        time.sleep(0.5)
        mm = t.js("() => { const w = document.getElementById('csAlignUneven'); return { text: w ? w.textContent + ' | ' + (w.dataset.itip || '') : '', mis: w ? w.dataset.mismatch || '' : '', inst: [...document.querySelectorAll('#csAlignInst .inst')].map((i) => i.dataset.k + ':' + i.querySelector('.inst-v').textContent) }; }")
        check(t, "align, your marks: with 'Equal distances' chosen and marks that are not, an amber note says so (and the height is still estimated: the app does not switch by itself)",
              ok and mm["mis"] == "1" and "do not look evenly spaced" in mm["text"] and "choose Not equal" in mm["text"] and not any("Not estimated" in x for x in mm["inst"]), mm)
        # Volta ao passo 1 e escolhe "Not equal": as mesmas fotos, a outra conta
        t.js("() => [...document.querySelectorAll('#csAlignFoot button')].find((b) => /Back$/.test(b.textContent.trim())).click()"); time.sleep(0.5)
        t.js("() => document.querySelector('#csAlignMain .al-mark[data-marks=uneven]').click()"); time.sleep(0.4)
        check(t, "align, your marks: clicking 'Not equal' chooses it, and it is kept with the project", t.js("() => document.querySelector('#csAlignMain .al-mark.on').dataset.marks") == "uneven" and t.js("() => window.alignMarks('')") == "uneven")
        t.button("Fire")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 20)
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        # (as fotos novas: as marcas são achadas sozinhas, pela foto de referência de antes)
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        time.sleep(0.5)
        d = t.js("() => { const w = document.getElementById('csAlignUneven'); return { text: w ? w.textContent + ' | ' + (w.dataset.itip || '') : '', label: w ? w.textContent : '', first: w ? !!w.previousElementSibling && w.previousElementSibling.classList.contains('al-hint') && w.tagName === 'SPAN' : false, found: document.querySelectorAll('#csAlignMain .ma-item .cs-tag').length }; }")
        check(t, "align, uneven marks: a short amber label under the hint of the points in step 2; the whole explanation shows on hover",
              ok and d["first"] and d["label"] == "Marks not at equal distances" and "Marks not at equal distances" in d["text"] and "matched by the length of the pole" in d["text"] and "height of each camera is not estimated" in d["text"] and "use three marks at equal distances" in d["text"], d)
        # A explicação da etiqueta aparece na caixa padrão do app (a mesma do "?"), à direita, e não na legenda do sistema
        t.page.hover("#csAlignUneven"); time.sleep(0.4)
        hb = t.js("""() => { const w = document.getElementById('csAlignUneven'), b = document.querySelector('.itip'), cs = getComputedStyle(b), r = w.getBoundingClientRect(), q = b.getBoundingClientRect();
          return { shown: !b.classList.contains('hidden'), text: b.textContent, title: w.getAttribute('title') || '', font: cs.fontSize, pad: cs.paddingLeft, right: q.left >= r.right || q.right <= r.left, cursor: getComputedStyle(w).cursor }; }""")
        check(t, "help cursor: the uneven marks label shows its explanation in the app's own box, beside it, like the ? of the options (no system tooltip)",
              hb["shown"] and "matched by the length of the pole" in hb["text"] and hb["title"] == "" and hb["font"] == "12px" and hb["pad"] == "14px" and hb["right"] and hb["cursor"] == "help", hb)
        t.page.mouse.move(5, 5); time.sleep(0.2)
        # Padrão: um elemento com cursor de ajuda e só a legenda do sistema também usa a caixa do app
        g = t.js("""() => { const x = document.createElement('span'); x.id = 'helpProbe'; x.title = 'Probe text'; x.textContent = 'probe'; x.style.cssText = 'cursor:help;position:fixed;left:200px;top:200px;z-index:999'; document.body.appendChild(x); return true; }""")
        t.page.hover("#helpProbe"); time.sleep(0.3)
        gp = t.js("() => { const b = document.querySelector('.itip'); const r = { shown: !b.classList.contains('hidden'), text: b.textContent }; document.getElementById('helpProbe').remove(); return r; }")
        check(t, "help cursor: any element with the ? cursor and only a system tooltip also uses the app's box", gp["shown"] and gp["text"] == "Probe text", gp)
        t.page.mouse.move(5, 5); time.sleep(0.2)
        check(t, "align, uneven marks: the Height instrument says 'Not estimated'", "Not estimated" in t.js("() => (document.getElementById('csAlignInst') || {}).textContent || ''"), t.js("() => document.querySelector('#csAlignMain .ma-view') ? document.querySelector('#csAlignMain .ma-view').textContent.slice(0, 400) : document.getElementById('csAlignMain').textContent.slice(-500)"))
        lines = t.js("() => document.querySelector('#csAlignMain .in-list') ? document.querySelector('#csAlignMain .in-list').textContent : document.querySelector('#csAlignMain').textContent")
        check(t, "align, uneven marks: no instruction about the height of the camera", "igher than" not in lines and "ower than" not in lines, lines[-300:])
        can = t.js("() => { const b = [...document.querySelectorAll('#csAlign button')].find((x) => x.textContent.trim() === 'Review alignment'); return !!b && !b.disabled; }")
        check(t, "align, uneven marks: the note does not block 'Review alignment'", can)
        t.button("Review alignment")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .export-strip li.frame').length") == 4, 10)
        d = t.js("() => { const w = document.getElementById('csAlignUneven'), sv = document.querySelector('#csAlignMain .rig-outer'), foot = [...document.querySelectorAll('#csAlign button')].find((x) => x.textContent.trim() === 'Save alignment'); return { text: w ? w.textContent + ' | ' + (w.dataset.itip || '') : '', label: w ? w.textContent : '', after: !!w && !!w.closest('.rig-top') && w.nextElementSibling && w.nextElementSibling.id === 'alignKeeps', save: !!foot && !foot.disabled }; }")
        check(t, "align, uneven marks: the same label in step 3, in the top row next to Keeps, and 'Save alignment' still works", d["label"] == "Marks not at equal distances" and "matched by the length of the pole" in d["text"] and "use three marks" not in d["text"] and d["after"] and d["save"], d)
        # (o projeto já tem um alinhamento salvo em 3:2, do cenário anterior: o passo 3 começa nessa proporção)
        ru = rig_state(t)
        check(t, "align, step 3: a new alignment starts from the ratio saved with the previous one", ru["seg"] == "As shot- 3:2* 4:3 16:9 1:1" and ru["save"] == "Save alignment" and "cropped to 3:2" in ru["mixed"], ru)
        check(t, "align uneven: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        t.js("() => { const c = [...document.querySelectorAll('#csAlign button')].find((b) => b.textContent.trim() === 'Cancel'); if (c && !document.getElementById('csAlign').classList.contains('hidden')) c.click(); }")
        time.sleep(0.3); t.leave_align()
        t.js("() => window.alignMarks && window.alignMarks('even')")  # (fica guardado com o projeto: os outros cenários contam com 'even')
        t.env.pop("STILLPOINT_FAKE_FIXED", None)
        t.restart_app()


def scenario_align_drag(t, name, photos):
    line("\n== 29. Align cameras: a found point can be dragged (fine-tune), taken back and put back to automatic")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    t.env["STILLPOINT_FAKE_FIXED"] = "all"
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => document.getElementById('camSettingsBtn').click()")
        time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
        align_open(t)
        time.sleep(0.3)
        t.button("Fire")
        t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 4"), 20)
        t.wait(lambda: t.js("() => { const p = document.querySelector('#csAlignMain .ma-row .al-zoom'); return !!p && p.style.backgroundImage.length > 10; }"), 15)
        order_dir = os.path.join(t.data, "Order photos")
        sess = sorted(d for d in os.listdir(order_dir) if not d.startswith("."))[-1]
        sel = t.js("() => document.querySelector('#csAlignMain .ma-item.sel').dataset.camera")
        f = [x for x in os.listdir(os.path.join(order_dir, sess)) if "_" + sel + "_IMG_" in x][0]
        c = _mark_centers(os.path.join(order_dir, sess, f))
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        box = t.page.locator("#csAlignMain .ma-row > .al-photo").bounding_box()
        for q in c:
            t.page.mouse.click(box["x"] + q[0] * box["width"], box["y"] + q[1] * box["height"])
            time.sleep(0.25)
        ok = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item.ready, #csAlignMain .ma-item.needs').length === 4 && !/Finding/.test(document.querySelector('#csAlignMain').textContent)"), 60)
        time.sleep(0.5)
        # Os pontos da foto grande (em fração da foto) e os das miniaturas das outras câmeras
        dots = lambda: t.js("() => [...document.querySelectorAll('#csAlignMain .ma-row .al-zoom .al-dot')].map((d) => [parseFloat(d.style.left) / 100, parseFloat(d.style.top) / 100])")
        others = lambda: t.js("() => [...document.querySelectorAll('#csAlignMain .ma-item:not(.sel) .al-dot')].map((d) => d.style.left + d.style.top).join('|')")
        side = lambda: t.js("() => { const s = document.querySelector('#csAlignMain .ma-side'); return { text: s ? s.textContent : '', tag: !!document.getElementById('csAlignAdjusted'), auto: !!document.getElementById('csAlignDotsAuto') && !document.getElementById('csAlignDotsAuto').disabled, rows: [...document.querySelectorAll('#csAlignMain .al-point')].map((r) => r.querySelector('.s').textContent + (r.querySelector('.al-point-back').disabled ? '' : '*')) }; }")
        lines = lambda: t.js("() => { const l = document.querySelector('#csAlignMain .in-list'); return l ? l.textContent : ''; }")
        d0 = dots(); o0 = others(); s0 = side(); l0 = lines()
        check(t, "align drag: with the marks found, the side of the photo says a point can be dragged (no tag yet)", ok and len(d0) == 3 and "Points" in s0["text"] and "Drag a point" in s0["text"] and not s0["tag"] and not s0["auto"] and s0["rows"] == ["Automatic"] * 3, s0)
        box = t.page.locator("#csAlignMain .ma-row .al-zoom").bounding_box()
        px = lambda m: (box["x"] + m[0] * box["width"], box["y"] + m[1] * box["height"])
        x, y = px(d0[1])
        t.page.mouse.move(x + 3, y + 2); time.sleep(0.15)
        cur = t.js("() => getComputedStyle(document.querySelector('#csAlignMain .ma-row .al-frame')).cursor")
        t.page.mouse.down(); t.page.mouse.move(x + 3 + 40, y + 2 + 10, steps=4); t.page.mouse.up(); time.sleep(0.6)
        d1 = dots(); s1 = side()
        t.shot("align-drag")
        moved = abs((d1[1][0] - d0[1][0]) * box["width"] - 40) < 1.5 and abs((d1[1][1] - d0[1][1]) * box["height"] - 10) < 1.5
        check(t, "align drag: dragging the middle point moves just that point, exactly by the drag (no snapping), with the move cursor", cur == "move" and moved and d1[0] == d0[0] and d1[2] == d0[2], (cur, d0, d1))
        check(t, "align drag: the panel says '1 by hand' and marks the middle point, with 'Back to automatic'; no new mark was started", s1["tag"] and s1["auto"] and s1["rows"] == ["Automatic", "By hand*", "Automatic"] and "1 by hand" in s1["text"] and "Click the marks" not in s1["text"] and t.js("() => [...document.querySelectorAll('#csAlignMain .ma-row .al-zoom .al-dot')].map((d) => d.classList.contains('hand'))") == [False, True, False], s1)
        check(t, "align drag: the other photos keep their points and the instructions of this camera change", others() == o0 and lines() != l0, (l0, lines()))
        can = t.js("() => { const b = [...document.querySelectorAll('#csAlign button')].find((x) => x.textContent.trim() === 'Review alignment'); return !!b && !b.disabled; }")
        check(t, "align drag: 'Review alignment' stays available", can)
        t.page.keyboard.press("ControlOrMeta+z"); time.sleep(0.5)
        d2 = dots()
        check(t, "align drag: Ctrl+Z takes the drag back (and the tag goes)", d2 == d0 and not side()["tag"], (d0, d2))
        t.page.keyboard.press("ControlOrMeta+Shift+z"); time.sleep(0.5)
        check(t, "align drag: Ctrl+Shift+Z redoes the drag", dots() == d1 and side()["tag"], (d1, dots()))
        t.page.keyboard.press("ControlOrMeta+z"); time.sleep(0.5)
        x, y = px(d0[0])
        t.page.mouse.move(x, y); t.page.mouse.down(); t.page.mouse.move(x - 25, y + 6, steps=3); t.page.mouse.up(); time.sleep(0.5)
        x, y = px(d0[2])
        t.page.mouse.move(x, y); t.page.mouse.down(); t.page.mouse.move(x + 18, y - 4, steps=3); t.page.mouse.up(); time.sleep(0.5)
        d3 = dots()
        # A volta de um ponto só (o de cima), e o Ctrl+Z dela
        t.js("() => document.querySelector('#csAlignMain .al-point-back[data-k=\"0\"]').click()"); time.sleep(0.5)
        one = dots(); r1 = side()["rows"]
        t.page.keyboard.press("ControlOrMeta+z"); time.sleep(0.5)
        check(t, "align drag: the ↺ of one point puts just that point back, and Ctrl+Z takes that back too", one[0] == d0[0] and one[2] == d3[2] and r1 == ["Automatic", "Automatic", "By hand*"] and dots() == d3, (one, r1, dots()))
        t.js("() => document.getElementById('csAlignDotsAuto').click()"); time.sleep(0.5)
        check(t, "align drag: 'Back to automatic' puts the three points back where the app found them", d3[0] != d0[0] and d3[2] != d0[2] and dots() == d0 and not side()["tag"] and lines() == l0, (d0, d3, dots()))
        # Um clique parado em cima de um ponto não começa uma marcação; um clique fora dos pontos começa
        x, y = px(d0[1])
        t.page.mouse.click(x, y); time.sleep(0.5)
        on_dot = "Click the marks" not in side()["text"]
        t.page.mouse.click(box["x"] + box["width"] * 0.15, box["y"] + box["height"] * 0.8); time.sleep(0.5)
        check(t, "align drag: a plain click on a point starts nothing; a click away from the points starts marking again, as before", on_dot and "Click the marks" in side()["text"], side())
        t.page.keyboard.press("ControlOrMeta+z"); time.sleep(0.4)
        check(t, "align drag: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        for k in ("STILLPOINT_FAKE_PHOTOS", "STILLPOINT_FAKE_FIXED"):
            t.env.pop(k, None)
        t.restart_app()


def scenario_align_entry(t, name, photos):
    line("\n== 30. Align cameras from the main window (Cameras panel), without a Test shot")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "3"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.wait(lambda: t.js("() => !document.getElementById('alignBtn').disabled"), 20)
        b = t.js("() => { const a = document.getElementById('alignBtn'), o = document.getElementById('orderBtn'); return [a.getAttribute('aria-label'), a.parentNode === o.parentNode, a.previousElementSibling === o]; }")
        check(t, "align entry: 'Align cameras' sits in the Cameras panel of the main window, after 'Reorder by photo'", b == ["Align cameras", True, True], b)
        ic = t.js("() => ['camSettingsBtn', 'orderBtn', 'alignBtn'].map((id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return [e.getAttribute('aria-label'), e.textContent.trim(), !!e.querySelector('svg'), Math.round(r.width), Math.round(r.height), e.title.split(':')[0]]; })")
        check(t, "cameras panel: the three buttons are icons of the same size, with the name in the tooltip and for screen readers",
              ic == [["Camera settings", "", True, 34, 34, "Camera settings"], ["Reorder by photo", "", True, 34, 34, "Reorder by photo"], ["Align cameras", "", True, 34, 34, "Align cameras"]], ic)
        # Download wait saiu do painel Bullet time: está em Settings › Advanced (e continua valendo para o disparo)
        dw = t.js("() => { const d = document.getElementById('downloadWait'); return { pane: d.closest('.settings-pane') ? d.closest('.settings-pane').dataset.pane : '', shoot: !!d.closest('.shoot-panel'), fields: [...document.querySelectorAll('.shoot-panel > .fields .field > span:first-child')].map((x) => x.textContent), label: d.closest('.settings-row').querySelector('.export-label').textContent }; }")
        check(t, "settings: 'Download wait' is in Settings › Advanced, and the Bullet time panel keeps Countdown and Sessions", dw == {"pane": "advanced", "shoot": False, "fields": ["Countdown", "Sessions"], "label": "Download wait"}, dw)
        note = t.js("() => document.getElementById('downloadWait').closest('.settings-row').querySelector('.export-note').textContent")
        check(t, "settings: the Download wait text says it is the time with no photo arriving, not the time of the whole session", "with no photo arriving" in note and "While photos keep arriving, the app keeps waiting" in note, note)
        # As fotos não chegaram a tempo: faixa âmbar com o caminho até o ajuste
        # (pede a faixa e lê na mesma hora: o aviso do rig deste teste pode entrar no lugar logo depois)
        tw = t.js("() => { window.onCoreEvent({ type: 'downloadTimeout', lost: [] }); const x = document.getElementById('toast'), b = document.getElementById('toastWaitBtn'); return { shown: !x.classList.contains('hidden'), warn: x.classList.contains('kind-warn'), kind: x.querySelector('.toast-kind-text').textContent, text: x.querySelector('.toast-text').textContent, btn: b ? b.textContent : '', close: !!x.querySelector('.toast-close') }; }")
        check(t, "download wait: when the photos do not arrive, an amber warning says so and offers 'Change Download wait'",
              tw == {"shown": True, "warn": True, "kind": "Warning", "text": "Some photos did not arrive in time. Nothing arrived for %s sec." % t.js("() => document.getElementById('downloadWait').value"), "btn": "Change Download wait", "close": True}, tw)
        t.shot("download-wait-toast")
        # (o aviso do rig deste teste pode ter entrado no lugar: pede a faixa de novo e clica na hora)
        t.js("() => { window.onCoreEvent({ type: 'downloadTimeout', lost: [] }); document.getElementById('toastWaitBtn').click(); }"); time.sleep(0.5)
        go = t.js("() => ({ open: !document.getElementById('settingsOverlay').classList.contains('hidden'), tab: (document.querySelector('#settingsTabs .export-tab.on') || document.querySelector('#settingsTabs .export-tab[aria-selected=\"true\"]') || {}).textContent || '', focus: document.activeElement && document.activeElement.id, toast: document.getElementById('toast').classList.contains('hidden'), visible: document.getElementById('downloadWait').getBoundingClientRect().width > 0 })")
        check(t, "download wait: the button opens Settings on Advanced with the Download wait field ready to type", go["open"] and go["tab"] == "Advanced" and go["focus"] == "downloadWait" and go["visible"], go)
        t.js("() => { const o = document.getElementById('settingsOverlay'); const b = [...o.querySelectorAll('button')].find((x) => /^(Done|Close)$/.test(x.textContent.trim())); if (b) b.click(); else o.classList.add('hidden'); }"); time.sleep(0.3)
        check(t, "download wait: Settings closes again", t.js("() => document.getElementById('settingsOverlay').classList.contains('hidden')"))
        # Com câmera caída, o aviso diz qual foi e não oferece o ajuste (não é caso de aumentar o tempo)
        t.js("() => window.onCoreEvent({ type: 'downloadTimeout', lost: ['T7_2'] })"); time.sleep(0.4)
        tl = t.js("() => { window.onCoreEvent({ type: 'downloadTimeout', lost: ['T7_2'] }); const x = document.getElementById('toast'); return [x.classList.contains('kind-warn'), /^Some photos did not arrive in time\\. Lost connection: .+\\.$/.test(x.querySelector('.toast-text').textContent), !!document.getElementById('toastWaitBtn')]; }")
        check(t, "download wait: with a camera lost, the warning names it and does not offer the setting", tl == [True, True, False], tl)
        t.js("() => document.querySelector('#toast .toast-close').click()")
        t.js("() => document.getElementById('alignBtn').click()")
        ok = t.wait(lambda: t.js("() => !document.getElementById('csAlign').classList.contains('hidden') || !document.getElementById('dialogOverlay').classList.contains('hidden')"), 8)
        # (um projeto que já tem alinhamento pergunta antes; a resposta é "Align cameras")
        t.js("() => { const o = document.getElementById('dialogOverlay'); if (!o.classList.contains('hidden')) [...o.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Align cameras').click(); }")
        time.sleep(0.6)
        st = t.js("() => ({ open: !document.getElementById('csAlign').classList.contains('hidden'), step1: document.getElementById('csAlignStep1').classList.contains('on'), foot: [...document.querySelectorAll('#csAlignFoot button')].map((x) => x.textContent.trim()) })")
        check(t, "align entry: it opens the Align cameras window at step 1 with no Test shot, with its own Fire", ok and st["open"] and st["step1"] and st["foot"] == ["Cancel", "Fire"], st)
        cams3 = ["SL3_1", "T7_1", "SL3_2"]
        for n in cams3:
            t.js("(n) => window.fakeUnplug(n, '1')", n)
        s1 = lambda: t.js("() => { const b = document.getElementById('csAlignOff'), f = [...document.querySelectorAll('#csAlignFoot button')].find((x) => x.textContent.trim() === 'Fire'); return [b.classList.contains('hidden') ? '' : b.querySelector('.al-again-kind').textContent, document.getElementById('csAlignNote').textContent, f ? f.disabled : null]; }")
        okd = t.wait(lambda: s1() == ["No camera connected", "No camera connected", True], 15)
        check(t, "align entry, step 1 with every camera off: band and footer say 'No camera connected' and Fire is off (it was lit and did nothing)", okd and len(cams3) == 3, (cams3, s1()))
        for n in cams3:
            t.js("(n) => window.fakeUnplug(n, '0')", n)
        okd = t.wait(lambda: s1() == ["", "3 cameras", False], 20)
        check(t, "align entry, step 1: when the cameras come back the band goes away and Fire lights up again", okd, s1())
        # (atalho de teste, só com câmeras simuladas: Ctrl + Alt + número desliga e liga a câmera dessa posição)
        t.page.keyboard.press("Control+Alt+Digit2")
        okk = t.wait(lambda: s1()[1] == "2 cameras · 1 not connected", 15)
        t.page.keyboard.press("Control+Alt+Digit2")
        check(t, "simulated cameras: Ctrl+Alt+2 turns camera 02 off, and again turns it on", okk and t.wait(lambda: s1() == ["", "3 cameras", False], 15), s1())
        t.button("Cancel"); time.sleep(0.6)
        check(t, "align entry: Cancel goes back to the main window (Camera settings does not stay open)", t.js("() => document.getElementById('camSettingsOverlay').classList.contains('hidden')"))
        # Pelo botão: Fire, e o passo 2 chega com as fotos
        t.js("() => document.getElementById('alignBtn').click()"); time.sleep(0.8)
        t.js("() => { const o = document.getElementById('dialogOverlay'); if (!o.classList.contains('hidden')) [...o.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Align cameras').click(); }")
        time.sleep(0.5)
        t.button("Fire")
        got = t.wait(lambda: t.js("() => document.querySelectorAll('#csAlignMain .ma-item').length === 3"), 60)
        check(t, "align entry: Fire from there takes the photos and goes to step 2", got)
        t.button("Cancel"); time.sleep(0.6)
        check(t, "align entry: Cancel at step 2 also goes back to the main window", t.js("() => document.getElementById('camSettingsOverlay').classList.contains('hidden')"))
        # O Test shot não tem mais o botão (um caminho só)
        t.js("() => document.getElementById('camSettingsBtn').click()"); time.sleep(1.0)
        t.js("() => document.getElementById('csTest').click()")
        t.wait(lambda: t.js("() => document.getElementById('csTestBox').classList.contains('has-photos')"), 30)
        check(t, "align entry: the Test shot has no 'Align cameras' button any more", t.js("() => !document.getElementById('csAlignBtn') && [...document.querySelectorAll('#csGallery .gallery-actions button')].map(b => b.textContent.trim()).join('|') === 'Hide photos'"))
        t.js("() => document.getElementById('csDone').click()")
        check(t, "align entry: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        t.env.pop("STILLPOINT_FAKE_PHOTOS", None)
        t.restart_app()


def scenario_align_tools(t, name, photos):
    line("\n== 28. Export › Align photos: the tool bar inside the big photo, the center cross and the guides")
    t.dismiss()
    t.env["STILLPOINT_FAKE_CAMERAS"] = "4"
    t.env["STILLPOINT_FAKE_PHOTOS"] = "pole"
    try:
        t.restart_app()
        t.dismiss()
        errors_before = len(t.errors)
        t.js("() => { try { localStorage.removeItem('stillpoint.alignPrefs'); } catch (e) {} }")
        t.js("() => document.getElementById('shootBtn').click()")
        t.wait(lambda: t.js("() => !document.getElementById('shootBtn').disabled && !document.getElementById('saveBtn').disabled"), 60)
        time.sleep(1.5)
        t.js("() => document.querySelectorAll('.toast').forEach((e) => e.remove())")
        t.dismiss()
        t.js("() => document.getElementById('saveBtn').click()")
        time.sleep(1.2)
        t.button("Align photos")
        time.sleep(0.8)
        t.js("() => { const o = document.getElementById('dialogOverlay'); if (!o.classList.contains('hidden')) { const b = [...o.querySelectorAll('button')].find((x) => /^Use /.test(x.textContent.trim())) || o.querySelectorAll('button')[0]; b.click(); } }")
        t.wait(lambda: t.js("() => !!document.querySelector('.align-stage .align-tools') && !document.querySelector('.align-stage .align-wait')"), 20)
        time.sleep(0.8)
        st = lambda: t.js("() => { const s = document.querySelector('.align-stage'), b = s.querySelector('.align-tools').getBoundingClientRect(), r = s.getBoundingClientRect(), c = s.querySelector('.align-cross'), f = s.querySelector('.align-ratio').getBoundingClientRect(), cb = c.getBoundingClientRect(); return { near: s.classList.contains('tools-near'), barIn: b.left >= r.left && b.right <= r.right && b.top >= r.top, barOp: getComputedStyle(s.querySelector('.align-tools')).opacity, half: [Math.round(r.left - b.left), Math.round(b.width / 2)], tool: s.dataset.tool, tools: [...s.querySelectorAll('.align-tool')].map((x) => x.dataset.tool + (x.classList.contains('on') ? '*' : '')), guides: [...s.querySelectorAll('.align-guide')].map((x) => x.dataset.guide + (x.classList.contains('on') ? '*' : '')), cross: !c.classList.contains('hidden'), crossAt: [Math.round(cb.left - (f.left + f.width / 2)), Math.round(cb.top - (f.top + f.height / 2))], clean: s.classList.contains('clean'), clip: s.querySelector('.align-layers').style.clipPath, handle: getComputedStyle(s.querySelector('.align-handle')).display }; }")
        vals = lambda: t.js("() => [...document.querySelectorAll('.align-panel .align-ctl input')].map((i) => i.value)")
        d = st()
        check(t, "align tools: away from it the bar sits dim in its place, inside the big photo (no grip)", not d["near"] and d["barOp"] == "0.3" and d["barIn"], d)
        check(t, "align tools: the cross in the middle of the canvas is on from the start, with the handles", d["cross"] and abs(d["crossAt"][0]) <= 1 and abs(d["crossAt"][1]) <= 1 and not d["clean"] and d["handle"] != "none" and d["guides"] == ["cross*", "edges*"], d)
        box = t.page.locator(".align-stage").bounding_box()
        t.page.mouse.move(box["x"] + 30, box["y"] + 60)
        time.sleep(0.5)
        d = st()
        check(t, "align tools: with the mouse in its area the bar lights up", d["near"] and d["barIn"] and d["barOp"] == "1", d)
        check(t, "align tools: six buttons (Select and Direct select share one), Select chosen from the start", d["tools"] == ["pointer*", "move", "rotate", "scale", "pan", "zoom"] and d["tool"] == "pointer", d["tools"])
        # Grupo de ferramentas, como no Illustrator (decisão do dono, 2026-11-26): triângulo no canto, lista com o botão
        # direito ou segurando o esquerdo
        grp = t.js("() => { const b = document.querySelector('.align-tool[data-group]'); return { group: b.dataset.group, more: b.classList.contains('has-more'), mark: getComputedStyle(b, '::after').borderBottomWidth, others: [...document.querySelectorAll('.align-tool.has-more')].length }; }")
        check(t, "tool groups: the Select button holds Select and Direct select and shows the corner mark; the others hold one tool", grp["group"] == "pointer handles" and grp["more"] and grp["mark"] == "5px" and grp["others"] == 1, grp)
        t.page.click(".align-tool[data-group='pointer handles']", button="right"); time.sleep(0.3)
        fl = t.js("() => { const f = document.getElementById('alignFlyout'); return f ? [...f.querySelectorAll('.align-fly-item')].map((x) => x.textContent + (x.classList.contains('on') ? '*' : '')) : null; }")
        check(t, "tool groups: right-click opens the list with the tools of the group (name and letter), the current one lit", fl == ["SelectV*", "Direct selectA"], fl)
        t.page.click("#alignFlyout .align-fly-item[data-tool=handles]"); time.sleep(0.3)
        g2 = t.js("() => ({ tool: document.querySelector('.align-stage').dataset.tool, shown: document.querySelector('.align-tool[data-group]').dataset.tool, open: !!document.getElementById('alignFlyout') })")
        check(t, "tool groups: choosing in the list picks the tool, shows it on the button and closes the list", g2 == {"tool": "handles", "shown": "handles", "open": False}, g2)
        bb = t.page.locator(".align-tool[data-group='pointer handles']").bounding_box()
        t.page.mouse.move(bb["x"] + 10, bb["y"] + 10); t.page.mouse.down(); time.sleep(0.6)
        held = t.js("() => !!document.getElementById('alignFlyout')")
        ib = t.page.locator("#alignFlyout .align-fly-item[data-tool=pointer]").bounding_box() if held else None
        if ib: t.page.mouse.move(ib["x"] + 30, ib["y"] + 10, steps=4)
        t.page.mouse.up(); time.sleep(0.3)
        g3 = t.js("() => ({ tool: document.querySelector('.align-stage').dataset.tool, open: !!document.getElementById('alignFlyout') })")
        check(t, "tool groups: holding the left button opens the list; releasing over a tool picks it", held and g3 == {"tool": "pointer", "open": False}, (held, g3))
        t.page.click(".align-tool[data-group='pointer handles']", button="right"); time.sleep(0.2)
        t.page.keyboard.press("Escape"); time.sleep(0.2)
        check(t, "tool groups: Esc closes the list and nothing else", t.js("() => !document.getElementById('alignFlyout') && !!document.querySelector('.align-stage .align-tools')"))
        t.page.mouse.move(box["x"] + 30, box["y"] + 60); time.sleep(0.3)
        t.shot("align-tools-bar")
        cx, cy = box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5
        def drag(dx, dy):
            t.page.mouse.move(cx, cy); t.page.mouse.down(); t.page.mouse.move(cx + dx, cy + dy, steps=4); t.page.mouse.up(); time.sleep(0.5)
        def pick(sel):
            t.js("(q) => document.querySelector(q).click()", sel); time.sleep(0.3)
        v0 = vals()
        pick(".align-tool[data-tool=rotate]")
        drag(0, 60)
        v1 = vals()
        # (o giro pode obrigar a foto a crescer para continuar cobrindo o canvas: regra que já existia)
        check(t, "align tools: with Rotate, dragging anywhere turns the photo (and does not move it)", abs(float(v1[3]) - float(v0[3])) > 1 and [float(x) for x in v1[:2]] == [float(x) for x in v0[:2]], (v0, v1))
        pick(".align-tool[data-tool=scale]")
        drag(70, 0)
        v2 = vals()
        check(t, "align tools: with Scale, dragging anywhere resizes it (and does not turn or move it)", v2[2] != v1[2] and v2[3] == v1[3] and v2[:2] == v1[:2], (v1, v2))
        pick(".align-tool[data-tool=move]")
        drag(14, 9)
        v3 = vals()
        check(t, "align tools: with Move the photo, dragging moves it", v3[:2] != v2[:2] and v3[2:] == v2[2:], (v2, v3))
        pick(".align-tool[data-tool=pan]")
        drag(40, 25)
        v4 = vals()
        check(t, "align tools: with Move the view, dragging moves the view and leaves the photo as it is", v4 == v3, (v3, v4))
        pick(".align-guide[data-guide=cross]")
        pick(".align-guide[data-guide=edges]")
        d = st()
        check(t, "align tools: the two guides switch off on their own: no cross, no handles, nothing outside the canvas", not d["cross"] and d["clean"] and d["handle"] == "none" and d["clip"].startswith("inset(") and d["guides"] == ["cross", "edges"] and d["tools"][4] == "pan*", d)
        t.page.mouse.move(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.5)
        time.sleep(1.2)
        t.shot("align-tools-clean")
        t.js("() => { exp_next = [...document.querySelectorAll('.export-strip li')][1]; if (exp_next) exp_next.click(); }")
        time.sleep(1.0)
        d = st()
        check(t, "align tools: the tool and the guides stay as chosen on the next photo", d["tool"] == "pan" and not d["cross"] and d["clean"], d)
        pick(".align-tool[data-tool=pointer]")
        pick(".align-guide[data-guide=cross]")
        pick(".align-guide[data-guide=edges]")
        # A barra começa a sumir assim que o mouse sai da área dela (sem espera)
        t.page.mouse.move(box["x"] + 5, box["y"] + box["height"] * 0.8); time.sleep(0.4)
        on_edge = t.js("() => document.querySelector('.align-stage').classList.contains('tools-near')")
        t.page.mouse.move(box["x"] + 30, box["y"] + 60); time.sleep(0.1)
        t.page.mouse.move(box["x"] + 120, box["y"] + 60); time.sleep(0.08)
        left = t.js("() => document.querySelector('.align-stage').classList.contains('tools-near')")
        check(t, "align tools: the bar shows with the mouse on the left edge and starts hiding as soon as it leaves the bar", on_edge and not left, (on_edge, left))
        # Pointer: em cima da foto, o cursor de mover (e arrastar move a foto); fora dela, o de deslocar a vista
        cur = lambda: t.js("() => { const s = document.querySelector('.align-stage'); return [s.dataset.over, getComputedStyle(s).cursor]; }")
        # (a foto precisa de folga para poder sair do lugar: a 100% a trava da área útil recusa o movimento)
        pick(".align-tool[data-tool=scale]")
        sx = box["x"] + box["width"] * 0.9
        t.page.mouse.move(sx, cy); t.page.mouse.down(); t.page.mouse.move(sx + 8, cy, steps=3); t.page.mouse.up(); time.sleep(0.5)
        pick(".align-tool[data-tool=pointer]")
        t.page.mouse.move(cx, cy); time.sleep(0.2)
        c_in = cur(); va = vals()
        drag(10, 6)
        vb = vals()
        t.page.mouse.move(box["x"] + box["width"] - 6, box["y"] + box["height"] - 6); time.sleep(0.2)
        c_out = cur()
        t.page.mouse.down(); t.page.mouse.move(box["x"] + box["width"] - 40, box["y"] + box["height"] - 30, steps=3); t.page.mouse.up(); time.sleep(0.4)
        vc = vals()
        check(t, "align tools: Pointer over the photo shows the move cursor and dragging moves the photo", c_in == ["in", "move"] and vb[:2] != va[:2], (c_in, va, vb))
        check(t, "align tools: Pointer outside the photo shows the hand and dragging moves the view only", c_out == ["out", "grab"] and vc == vb, (c_out, vb, vc))
        pick(".align-tool[data-tool=rotate]")
        check(t, "align tools: Rotate uses the round arrow cursor of the rotate handle", "url(" in cur()[1], cur())
        pick(".align-tool[data-tool=pointer]")
        # Atalhos: uma letra escolhe a ferramenta
        tool = lambda: t.js("() => document.querySelector('.align-stage').dataset.tool")
        got = []
        for k in "amrshzv":
            t.page.keyboard.press(k); time.sleep(0.15); got.append(tool())
        check(t, "align tools: the letters A M R S H Z V pick the tools", got == ["handles", "move", "rotate", "scale", "pan", "zoom", "pointer"], got)
        # Zoom: clicar aproxima em volta do ponto; com Alt, afasta
        zw = lambda: t.js("() => document.querySelector('.align-stage .align-ratio').getBoundingClientRect().width")
        t.page.keyboard.press("z"); time.sleep(0.15)
        z0 = zw(); vz = vals()
        t.page.mouse.click(cx, cy); time.sleep(0.3)
        z1 = zw()
        t.page.keyboard.down("Alt"); t.page.mouse.click(cx, cy); t.page.keyboard.up("Alt"); time.sleep(0.3)
        z2 = zw()
        check(t, "align tools: with Zoom, a click zooms the view in and Alt + click zooms out, without touching the photo", z1 > z0 * 1.4 and abs(z2 - z0) < 1 and vals() == vz, (z0, z1, z2))
        # Segurar e arrastar: para a direita aproxima, para a esquerda afasta; o cursor é a lupa sem sinal, na tela toda
        t.page.mouse.move(cx, cy); t.page.mouse.down(); t.page.mouse.move(cx + 80, cy, steps=4)
        z3 = zw(); zc = t.js("() => [getComputedStyle(document.querySelector('.align-stage')).cursor.slice(0, 4), getComputedStyle(document.querySelector('.export-settings h2, .export-settings')).cursor.slice(0, 4)]")
        t.page.mouse.move(cx - 60, cy, steps=4); z4 = zw()
        t.page.mouse.up(); time.sleep(0.3)
        check(t, "align tools: with Zoom, holding and dragging right zooms in and left zooms out, with the plain magnifier everywhere", z3 > z0 * 1.5 and z4 < z0 and zc == ["url(", "url("] and vals() == vz, (z0, z3, z4, zc))
        t.page.keyboard.down("Alt"); time.sleep(0.15)
        alt_cur = t.js("() => getComputedStyle(document.querySelector('.align-stage')).cursor")
        t.page.keyboard.up("Alt"); time.sleep(0.15)
        check(t, "align tools: holding Alt turns the Zoom cursor into zoom out at once, without moving the mouse", alt_cur == "zoom-out" and t.js("() => getComputedStyle(document.querySelector('.align-stage')).cursor") == "zoom-in", alt_cur)
        # Pinça do trackpad (roda + Ctrl sem a tecla Ctrl): zoom da vista, a foto não sai do lugar
        t.page.keyboard.press("v"); time.sleep(0.15)
        p0 = zw(); pv = vals()
        t.js("([x, y]) => document.querySelector('.align-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -20, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }))", [cx, cy]); time.sleep(0.5)
        check(t, "align tools: a trackpad pinch zooms the view and leaves the photo alone", zw() > p0 * 1.1 and vals() == pv, (p0, zw(), pv, vals()))
        # Ctrl + roda desloca a vista para cima e para baixo; com Alt junto, para os lados. A foto não se mexe
        pos = lambda: t.js("() => { const r = document.querySelector('.align-stage .align-ratio').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }")
        t.page.mouse.move(cx, cy)
        w0 = vals(); q0 = pos()
        t.page.keyboard.down("Control"); t.page.mouse.wheel(0, 30); time.sleep(0.3); q1 = pos()
        t.page.keyboard.down("Alt"); t.page.mouse.wheel(0, 30); time.sleep(0.3); q2 = pos()
        t.page.keyboard.up("Alt"); t.page.keyboard.up("Control"); time.sleep(0.3)
        check(t, "align tools: Ctrl + scroll pans the view up or down, Ctrl + Alt + scroll sideways, and the photo stays", q1[1] != q0[1] and q1[0] == q0[0] and q2[0] != q1[0] and q2[1] == q1[1] and vals() == w0, (q0, q1, q2))
        # Só as alças (A): arrastar no meio da foto ou fora dela não faz nada; a alça de canto muda o tamanho
        t.page.keyboard.press("a"); time.sleep(0.15)
        h0 = vals(); hq = pos()
        drag(20, 12)
        t.page.mouse.move(box["x"] + box["width"] - 6, box["y"] + box["height"] - 6); t.page.mouse.down(); t.page.mouse.move(box["x"] + box["width"] - 40, box["y"] + box["height"] - 30, steps=3); t.page.mouse.up(); time.sleep(0.3)
        still = vals() == h0 and pos() == hq
        hb = t.page.locator(".align-handle-br").bounding_box()
        t.page.mouse.move(hb["x"] + 5, hb["y"] + 5); t.page.mouse.down(); t.page.mouse.move(hb["x"] + 45, hb["y"] + 35, steps=3); t.page.mouse.up(); time.sleep(0.4)
        check(t, "align tools: with Handles only, dragging the photo or the empty area does nothing and a corner handle resizes", still and vals()[2] != h0[2] and vals()[:2] == h0[:2], (h0, vals(), still))
        t.page.keyboard.press("v"); time.sleep(0.15)
        # Diminuir de uma vez só além do limite: a foto vai até o limite (não fica parada no tamanho de antes)
        pick(".align-tool[data-tool=scale]")
        sx = box["x"] + box["width"] * 0.9
        t.page.mouse.move(sx, cy); t.page.mouse.down(); t.page.mouse.move(sx + 60, cy, steps=3); t.page.mouse.up(); time.sleep(0.4)
        big = float(vals()[2])
        t.page.mouse.move(sx, cy); t.page.mouse.down(); t.page.mouse.move(cx + 3, cy, steps=1)
        res_cur = t.js("() => getComputedStyle(document.querySelector('.align-stage')).cursor")
        t.page.mouse.up(); time.sleep(0.4)
        small = float(vals()[2])
        t.page.mouse.move(sx, cy); t.page.mouse.down(); t.page.mouse.move(cx + 3, cy, steps=1); t.page.mouse.up(); time.sleep(0.4)
        again = float(vals()[2])
        check(t, "align tools: shrinking past the limit in one go stops at the limit, not before", small < big - 5 and abs(again - small) < 0.15, (big, small, again))
        check(t, "align tools: the cursor stays the resize one while the button is down", res_cur == "nwse-resize", res_cur)
        pick(".align-tool[data-tool=pointer]")
        # Botão apertado: o cursor do gesto vale fora da foto grande também
        t.page.mouse.move(cx, cy); t.page.mouse.down(); t.page.mouse.move(cx + 2, cy + 2)
        out_cur = t.js("() => getComputedStyle(document.querySelector('.export-settings')).cursor")
        t.page.mouse.up(); time.sleep(0.3)
        check(t, "align tools: while the button is down the cursor is the same outside the big photo", out_cur == "move" and not t.js("() => document.body.classList.contains('align-drag')"), out_cur)
        # Select, girando pela alça de cima: o cursor é o de girar, e não a mão da área fora da foto (gravação do dono)
        t.page.keyboard.press("v"); time.sleep(0.2)
        t.page.mouse.move(cx, cy)
        for _ in range(6):
            t.page.mouse.wheel(0, 40); time.sleep(0.05)
        time.sleep(0.3)
        rh = t.js("() => { const r = document.querySelector('.align-rot-handle').getBoundingClientRect(), s = document.querySelector('.align-stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.top > s.top && r.bottom < s.bottom]; }")
        t.page.mouse.move(rh[0] - 2, rh[1]); t.page.mouse.move(rh[0], rh[1]); t.page.mouse.down(); t.page.mouse.move(rh[0] + 8, rh[1] + 2); time.sleep(0.1)
        rot_cur = t.js("() => [getComputedStyle(document.querySelector('.align-stage')).cursor.slice(0, 4), getComputedStyle(document.querySelector('.export-settings')).cursor.slice(0, 4)]")
        t.page.mouse.move(rh[0], rh[1]); t.page.mouse.up(); time.sleep(0.3)
        t.page.keyboard.press("Control+z"); time.sleep(0.3)
        check(t, "align tools: with Select, rotating by the top handle keeps the rotate cursor (not the hand), inside and outside the big photo", rh[2] and rot_cur == ["url(", "url("], (rh, rot_cur))
        t.page.keyboard.press("Control+0"); t.page.keyboard.press("a"); time.sleep(0.3)
        # Caixas de número: só algarismos, vírgula ou ponto e o menos no começo; vazia = 0 (Size: 100)
        def field(i, text):
            f = t.page.locator(".align-panel .align-ctl input").nth(i); f.click(); t.page.keyboard.press("ControlOrMeta+a"); t.page.keyboard.press("Backspace")
            if text: t.page.keyboard.type(text)
            shown = f.input_value(); t.page.keyboard.press("Enter"); time.sleep(0.4); return shown
        field(3, "-0,001")  # (a caixa passa a mostrar "-0.00": o caso que já enganou a limpeza)
        typed = field(3, "a1x,5..2-")
        after = vals()[3]
        check(t, "align tools: the number boxes take only digits and one comma or dot", typed == "1,52" and abs(float(after) - 1.52) < 0.011, (typed, after))
        field(3, ""); field(2, ""); field(0, "")
        v = vals()
        check(t, "align tools: an emptied box goes back to 0 (Size: 100, or the smallest that still covers)", float(v[3]) == 0 and float(v[0]) == 0 and 99.9 <= float(v[2]) < 130, v)
        # Sair do Align photos e entrar de novo: a ferramenta volta a ser a Select
        pick(".align-tool[data-tool=rotate]")
        t.button("Done aligning"); time.sleep(0.8)
        # Na aba Framing, a mão de arrastar só aparece quando arrastar faz algo (dono, 2026-11-26): foto com alinhamento
        # próprio se move no Align photos, então o cursor é o normal
        fr = t.js("() => { const b = document.querySelector('.crop-box'); return b ? { cursor: getComputedStyle(b).cursor, tag: (b.querySelector('.crop-tag') || {}).textContent || '' } : {}; }")
        check(t, "framing: the drag hand shows only when dragging does something (aligned photo: normal cursor; free photo: hand)",
              (fr.get("cursor") == "default") == ("Drag the photo" not in fr.get("tag", "")) and fr.get("cursor") in ("default", "grab"), fr)
        t.button("Align photos"); time.sleep(0.8)
        t.wait(lambda: t.js("() => !!document.querySelector('.align-stage .align-tools') && !document.querySelector('.align-stage .align-wait')"), 20)
        check(t, "align tools: leaving Align photos and coming back picks Select again", t.js("() => document.querySelector('.align-stage').dataset.tool") == "pointer")
        # Caixa de número com o valor selecionado: uma letra não entra e também não apaga o que estava (gravação do dono, 2026-11-26)
        t.page.click(".align-panel .align-ctl input >> nth=2"); time.sleep(0.2)
        nb = t.js("() => document.querySelectorAll('.align-panel .align-ctl input')[2].value")
        t.page.keyboard.type("x"); time.sleep(0.1)
        n1 = t.js("() => document.querySelectorAll('.align-panel .align-ctl input')[2].value")
        t.page.keyboard.type("9"); time.sleep(0.1)
        n2 = t.js("() => document.querySelectorAll('.align-panel .align-ctl input')[2].value")
        t.page.keyboard.press("Escape"); time.sleep(0.2)
        check(t, "align numbers: with the value selected, a letter neither goes in nor erases it; a digit still replaces it", n1 == nb and n2 == "9", (nb, n1, n2))
        n3 = t.js("() => ({ still: !!document.querySelector('.align-stage .align-tools'), value: document.querySelectorAll('.align-panel .align-ctl input')[2].value })")
        check(t, "align numbers: Esc in the box only gives up what was typed; the screen stays", n3 == {"still": True, "value": nb}, n3)
        # O tocador do Align cameras também no Align photos do Export (pedido do dono, 2026-11-26)
        pb = t.js("() => { const b = document.getElementById('alignPlayBar'); return b ? { text: b.textContent, ids: [...b.querySelectorAll('button')].map((x) => x.id + (x.disabled ? '-' : '')).filter(Boolean), inStage: !!b.closest('.align-stage') } : {}; }")
        check(t, "export align: the play bar is over the big photo (‹ ▶ › Speed, Reverse loop, Stop off)", pb.get("inStage") and "Speed" in pb.get("text", "") and "Reverse loop" in pb.get("text", "") and pb.get("ids") == ["alignPlay", "alignPlayStop-"], pb)
        w0 = t.js("() => document.querySelector('.align-where').textContent")
        t.js("() => document.getElementById('alignPlay').click()"); time.sleep(0.5)
        p1 = t.js("() => ({ where: document.querySelector('.align-where').textContent, stage: document.querySelector('.align-stage').className, stop: document.getElementById('alignPlayStop').disabled })")
        time.sleep(1.2)
        p2 = t.js("() => document.querySelector('.align-where').textContent")
        check(t, "export align: Play shows the sequence in place (clean stage, photos changing, Stop on)", p1["where"].endswith("· playing") and p1["where"].startswith("Photo ") and "playing" in p1["stage"] and "clean" in p1["stage"] and not p1["stop"] and p2 != p1["where"], (p1, p2))
        t.js("() => document.getElementById('alignPlayStop').click()"); time.sleep(0.6)
        p3 = t.js("() => ({ where: document.querySelector('.align-where').textContent, stage: document.querySelector('.align-stage').className, tools: !!document.querySelector('.align-stage .align-tools') })")
        check(t, "export align: Stop goes back to adjusting, on the photo that was showing", "other photos" in p3["where"] and "playing" not in p3["stage"] and p3["tools"], (w0, p3))
        t.js("() => document.getElementById('alignPlay').click()"); time.sleep(0.4)
        t.button("Done aligning"); time.sleep(0.8)
        t.button("Align photos"); time.sleep(0.8)
        t.wait(lambda: t.js("() => !!document.querySelector('.align-stage .align-tools') && !document.querySelector('.align-stage .align-wait')"), 20)
        check(t, "export align: leaving while it plays stops it (coming back, it is not playing)", t.js("() => !document.querySelector('.align-stage').classList.contains('playing') && document.getElementById('alignPlayStop').disabled"))
        check(t, "align tools: no page error", len(t.errors) == errors_before, t.errors[errors_before:])
    finally:
        t.js("() => { try { localStorage.removeItem('stillpoint.alignPrefs'); } catch (e) {} }")
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
                           scenario_export_edit, scenario_export_trash, scenario_lightroom_crop, scenario_undo_own_item, scenario_orientation, scenario_selection_kept, scenario_align_undo, scenario_flip, scenario_photoshop, scenario_rig_state, scenario_align_marks, scenario_align_cameras, scenario_camera_tags, scenario_guided_aim, scenario_live_many, scenario_custom_drag, scenario_align_gone, scenario_align_uneven, scenario_align_tools, scenario_align_drag, scenario_align_entry) if any(o in x.__name__ for o in only.split(","))]:  # vários, separados por vírgula
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
