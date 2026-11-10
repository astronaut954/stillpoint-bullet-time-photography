// Teste que junta o Stillpoint e o Lightroom Classic de verdade (decisões do dono, 2026-11-10).
// Roda dentro da página do Stillpoint, aberto por tests/e2e/run_e2e.sh com câmeras simuladas, no projeto de teste.
// Faz o que a pessoa faz (cliques na janela do Stillpoint) e, no Lightroom, o que ela faria à mão por comandos de teste
// ao plugin (TestCmd.lua). Escreve o relatório pelo e2eReport. No Linux, o mesmo roteiro roda contra o Lightroom de
// mentira (tests/host/fake_lightroom.py), para ser conferido antes de ir para a máquina do dono.
(function () {
  "use strict";
  if (typeof window.e2eReport !== "function") return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let passed = 0, failed = 0;
  const out = (text) => window.e2eReport(String(text));
  const show = (d) => (typeof d === "string" ? d : JSON.stringify(d));
  async function check(name, ok, detail) {
    if (ok) passed++; else failed++;
    await out((ok ? "PASS  " : "FAIL  ") + name + (ok || detail === undefined ? "" : "   [" + show(detail) + "]"));
    return !!ok;
  }
  async function waitFor(fn, ms, step) {
    const end = Date.now() + (ms || 12000);
    let last = false;
    while (Date.now() < end) {
      try { last = await fn(); if (last) return last; } catch (e) { last = false; }
      await sleep(step || 300);
    }
    return false;
  }
  const near = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

  // ---- o que o Stillpoint tem ----
  async function sessions() { const r = await window.listSessions(); return Array.isArray(r) ? r : (r && r.sessions) || []; }
  async function sessionOf(name) { return (await sessions()).find((s) => s.name === name) || null; }
  const alignOf = async (name) => ((await sessionOf(name)) || {}).align || "";
  const editedOf = async (name) => ((await sessionOf(name)) || {}).edited;

  // ---- o que a pessoa faz no Stillpoint ----
  const dialogOpen = () => !$("#dialogOverlay").classList.contains("hidden");
  const dialogTitle = () => (dialogOpen() ? $("#dialogTitle").textContent : "");
  function dialogClick(starts) {
    const b = $$("#dialogActions button").find((x) => x.textContent.trim().startsWith(starts));
    if (b) b.click();
    return !!b;
  }
  async function dismiss() {
    for (let i = 0; i < 3 && dialogOpen(); i++) {
      const b = $("#dialogActions button.btn-primary") || $("#dialogActions button");
      if (b) b.click();
      await sleep(400);
    }
  }
  const exportOpen = () => !$("#exportOverlay").classList.contains("hidden");
  const stepName = () => { const b = $("#exportSteps .export-step.on"); return b ? b.textContent.trim() : ""; };
  const toastText = () => { const t = $("#toast"); return t && !t.classList.contains("hidden") ? t.textContent : ""; };
  const editTag = (name) => !!$('#sessionList li.folder[data-name="' + name + '"] .edit-tag');
  function lrBlockButton(starts) {
    const b = $$("#exportSettings .lr-block button").find((x) => x.textContent.trim().startsWith(starts));
    if (b) b.click();
    return !!b;
  }
  // A sessão ficou In Lightroom? (com o Lightroom ainda abrindo, o aviso "plugin did not answer" pode aparecer: Try again)
  const lrAnswered = (name) => () => {
    if (editTag(name)) return true;
    if (dialogTitle().startsWith("The Stillpoint plugin did not answer")) dialogClick("Try again");
    return false;
  };
  async function shoot() {
    const before = new Set((await sessions()).map((s) => s.name));
    const d = $("#downloadWait");
    if (d) { d.value = "1"; d.dispatchEvent(new Event("input")); d.dispatchEvent(new Event("change")); }
    await waitFor(() => !$("#shootBtn").disabled, 30000);
    $("#shootBtn").click();
    const fresh = await waitFor(async () => { const l = (await sessions()).filter((s) => !before.has(s.name) && s.photos.length >= 4); return l.length ? l : false; }, 90000, 500);
    if (await waitFor(() => dialogTitle() === "Mixed ratios", 5000)) { dialogClick("Keep as shot"); await sleep(500); }
    await dismiss();
    // (as fotos ainda podem estar chegando: espera a contagem parar)
    if (!fresh) return null;
    let n = -1;
    await waitFor(async () => { const s = await sessionOf(fresh[0].name); const now = s ? s.photos.length : 0; const same = now === n; n = now; return same; }, 20000, 1500);
    return fresh[0].name;
  }
  async function openExportOn(name) {
    await dismiss();
    if (!exportOpen()) { $("#saveBtn").click(); await waitFor(exportOpen, 6000); await sleep(700); }
    const first = $("#exportSteps .export-step");
    if (first && !first.classList.contains("on")) { first.click(); await sleep(700); }
    $("#exportUnselectAll").click();
    await sleep(300);
    const box = $('#exportList li.export-item[data-name="' + name + '"] .export-check input');
    if (box && !box.checked) box.click();
    await sleep(400);
    const row = $('#exportList li.export-item[data-name="' + name + '"] .folder-date');
    if (row) row.click();
    await sleep(700);
  }
  async function goStep(n) {
    const want = ["", "1 Sessions", "2 Edit", "3 Outputs", "4 Review"][n];
    if (stepName() === want) return true;
    if (n === 1) $("#exportSteps .export-step").click();
    else if (n === 2 && stepName() === "1 Sessions") $("#exportConfirm").click();
    else $$("#exportSteps .export-step")[n - 1].click();
    const ok = await waitFor(() => stepName() === want, 6000);
    await sleep(700);
    return ok;
  }
  async function closeExport() {
    for (let i = 0; i < 3 && exportOpen(); i++) {
      if (dialogOpen() && dialogTitle() !== "Leave Export sessions?") await dismiss();
      $("#exportCancel").click();
      if (await waitFor(() => dialogTitle() === "Leave Export sessions?", 3000)) dialogClick("Leave");
      await waitFor(() => !exportOpen(), 3000);
    }
  }
  function stripMenu(index, starts) {
    const li = $$("#exportSettings .export-strip > li")[index];
    if (!li) return false;
    const r = li.getBoundingClientRect();
    li.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 2 }));
    const b = $$(".app-menu button").find((x) => x.textContent.trim().startsWith(starts));
    if (b) b.click();
    return !!b;
  }
  function undo() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", ctrlKey: true, bubbles: true, cancelable: true }));
  }

  // ---- o que a pessoa faria no Lightroom (comandos de teste ao plugin) ----
  async function lr(cmd, fields, ms) {
    const lines = ["cmd=" + cmd];
    Object.entries(fields || {}).forEach(([k, v]) => {
      if (k === "photos") v.forEach((p) => lines.push("photo=" + p));
      else if (k === "set") Object.entries(v).forEach(([a, b]) => lines.push("set=" + a + "=" + b));
      else lines.push(k + "=" + v);
    });
    const id = await window.e2eLrSend(lines.join("\n"));
    const got = await waitFor(async () => { const r = await window.e2eLrResult(id); return r && r.text ? r : false; }, ms || 30000, 400);
    if (!got) throw new Error("Lightroom did not answer the test command " + cmd);
    const res = {};
    got.text.split("\n").forEach((line) => { const i = line.indexOf("="); if (i > 0) res[line.slice(0, i)] = line.slice(i + 1).replace(/\r$/, ""); });
    if (res.ok !== "1") throw new Error("test command " + cmd + ": " + (res.error || "failed"));
    return res;
  }

  async function run() {
    const info = await window.e2eInfo();
    await out("Stillpoint + Lightroom Classic test · " + new Date().toISOString().replace("T", " ").slice(0, 19) + " · project " + info.project);
    await waitFor(() => !!$("#shootBtn"), 30000);
    await sleep(2500);
    await dismiss();

    await out("");
    await out("== 1. A new session goes to Lightroom Classic in 1:1");
    const name = await shoot();
    if (!(await check("a new session with the simulated cameras", !!name))) return;
    const s0 = await sessionOf(name);
    const photos = s0.photos.filter((p) => p.previewable).sort((a, b) => a.order - b.order);
    const sep = info.originals.includes("\\") ? "\\" : "/";
    const pathOf = (p) => info.originals + sep + name + sep + p.file;
    const all = photos.map(pathOf);
    await check("the session is in the test project (" + photos.length + " photos)", s0.inProject && photos.length >= 4, s0.inProject);
    await openExportOn(name);
    { const b = $$("#exportSettings .segmented button").find((x) => x.textContent.trim() === "1:1"); if (b) b.click(); }
    await sleep(800);
    await check("Framing 1:1 chosen", ((await sessionOf(name)) || {}).crop.startsWith("1:1"), ((await sessionOf(name)) || {}).crop);
    await goStep(2);
    lrBlockButton("Edit in Lightroom Classic");
    // (Lightroom abrindo, catálogo do projeto de teste sendo criado: pode demorar)
    const inLr = await waitFor(lrAnswered(name), 240000, 1000);
    if (!(await check("Edit in Lightroom Classic: the session shows In Lightroom", inLr, dialogTitle() || "no answer in 4 minutes"))) { await dismiss(); await closeExport(); return; }
    await lr("ping", {}, 60000);
    await lr("record", {});
    const p2 = photos[1], p3 = photos[2], p4 = photos[3];
    const a2 = await lr("settings", { photos: [pathOf(p2)] });
    await check("in Lightroom, photo 02 is cropped to a square", near(a2.width, a2.height, 2), a2.width + " x " + a2.height);
    await check("... and has no edit yet", a2.edit === "0");

    await out("");
    await out("== 2. The crop moved in Lightroom becomes the alignment in Stillpoint");
    const align0 = await alignOf(name);
    const L = Number(a2.CropLeft), T = Number(a2.CropTop), Rr = Number(a2.CropRight), B = Number(a2.CropBottom);
    // 10% menor em volta do centro e deslocado: a mesma proporção, outro lugar e outro tamanho
    const cx = (L + Rr) / 2, cy = (T + B) / 2, hw = (Rr - L) * 0.45, hh = (B - T) * 0.45;
    const dx = Math.min(0.02, 1 - (cx + hw)), moved = { CropLeft: cx - hw + dx, CropTop: cy - hh, CropRight: cx + hw + dx, CropBottom: cy + hh };
    await lr("develop", { photos: [pathOf(p2)], set: Object.assign({ Exposure2012: 0.5 }, moved) });
    const b2 = await lr("settings", { photos: [pathOf(p2)] });
    await check("in Lightroom, photo 02 is still a square after the crop was moved", near(b2.width, b2.height, 2), b2.width + " x " + b2.height);
    const e1 = await lr("export", { photos: all, answers: "ok,ok" }, 180000);
    await check("Export to Stillpoint ran (no block)", !/blocked/i.test(e1.seen || ""), e1.seen);
    await check("Stillpoint: the session is Edited 1 / " + photos.length, await waitFor(async () => (await editedOf(name)) === 1, 60000, 500), await editedOf(name));
    await check("... and the alignment of photo 02 changed", await waitFor(async () => { const a = await alignOf(name); return a !== align0 && a.includes(p2.file + ":"); }, 20000, 500), await alignOf(name));
    await check("... the notice says so", await waitFor(() => /photo 02 aligned from Lightroom/.test(toastText()), 10000), toastText());
    const align1 = await alignOf(name);

    await out("");
    await out("== 3. Edit again: Lightroom gets back the crop the person left");
    await waitFor(() => !editTag(name), 20000);
    await openExportOn(name);
    await goStep(2);
    lrBlockButton("Edit");
    await check("Edit again in Lightroom Classic: In Lightroom again", await waitFor(lrAnswered(name), 120000, 1000), dialogTitle());
    await sleep(1500);
    const c2 = await lr("settings", { photos: [pathOf(p2)] });
    await check("photo 02 has the crop the person left (not the first one)",
      near(c2.CropLeft, moved.CropLeft, 0.002) && near(c2.CropTop, moved.CropTop, 0.002) && near(c2.CropRight, moved.CropRight, 0.002) && near(c2.CropBottom, moved.CropBottom, 0.002),
      [c2.CropLeft, c2.CropTop, c2.CropRight, c2.CropBottom, moved]);

    await out("");
    await out("== 4. Another aspect ratio blocks Export to Stillpoint");
    const a3 = await lr("settings", { photos: [pathOf(p3)] });
    const l3 = Number(a3.CropLeft), t3 = Number(a3.CropTop), r3 = Number(a3.CropRight), b3 = Number(a3.CropBottom);
    // metade da altura, a mesma largura: outra proporção
    await lr("develop", { photos: [pathOf(p3)], set: { Exposure2012: 0.3, CropLeft: l3, CropRight: r3, CropTop: t3 + (b3 - t3) * 0.25, CropBottom: b3 - (b3 - t3) * 0.25 } });
    const e2 = await lr("export", { photos: all, answers: "ok" }, 60000);
    await check("the alert appears (Export to Stillpoint blocked)", /Export to Stillpoint blocked/.test(e2.seen || ""), e2.seen);
    await sleep(4000);
    await check("... and nothing new reaches Stillpoint", (await editedOf(name)) === 1, await editedOf(name));
    const e3 = await lr("export", { photos: all, answers: "other" }, 60000);
    await check("Put back the Stillpoint crop: answered in the alert", /-> other/.test(e3.seen || ""), e3.seen);
    const d3 = await lr("settings", { photos: [pathOf(p3)] });
    await check("... photo 03 is a square again in Lightroom", near(d3.width, d3.height, 2), d3.width + " x " + d3.height);
    const e4 = await lr("export", { photos: all, answers: "ok,ok" }, 180000);
    await check("export again: no block", !/blocked/i.test(e4.seen || ""), e4.seen);
    await check("Stillpoint: the session is Edited 2 / " + photos.length, await waitFor(async () => (await editedOf(name)) === 2, 60000, 500), await editedOf(name));

    await out("");
    await out("== 5. Revert to original and its undo");
    await waitFor(() => !editTag(name), 20000);
    await openExportOn(name);
    await goStep(2);
    await sleep(800);
    await check("right-click on thumbnail 02 > Revert to original…", stripMenu(1, "Revert to original"));
    await check("... asks Revert 1 photo to the original?", await waitFor(() => dialogTitle() === "Revert 1 photo to the original?", 4000), dialogTitle());
    dialogClick("Revert to original");
    await check("Stillpoint: Edited 1 / " + photos.length + ", and the alignment of 02 is back to what it was", await waitFor(async () => (await editedOf(name)) === 1 && (await alignOf(name)) === align0, 15000, 500), [await editedOf(name), await alignOf(name)]);
    const r2 = await waitFor(async () => { const x = await lr("settings", { photos: [pathOf(p2)] }); return Number(x.Exposure2012) === 0 ? x : false; }, 30000, 2000);
    await check("Lightroom: photo 02 is back to the original (no exposure change)", !!r2);
    undo();
    await check("undo: Edited 2 / " + photos.length + " and the alignment from Lightroom again", await waitFor(async () => (await editedOf(name)) === 2 && (await alignOf(name)) === align1, 15000, 500), [await editedOf(name), await alignOf(name), align1]);

    await out("");
    await out("== 6. A file saved by hand with another shape is not used");
    await lr("seen", {});
    await window.e2eImage(name, p4.file, "2.5");
    const refused = async () => { const s = await sessionOf(name); const p = s && s.photos.find((x) => x.file === p4.file); return p ? p.refused || "" : ""; };
    await check("Stillpoint marks photo 04 as not used", await waitFor(async () => !!(await refused()), 20000, 500), await refused());
    await check("... it does not count as edited", (await editedOf(name)) === 2, await editedOf(name));
    await check("... the notice warns", await waitFor(() => /edited file not used/.test(toastText()), 10000), toastText());
    const seen = await waitFor(async () => { const x = await lr("seen", {}); return /Stillpoint did not use/.test(x.seen || "") ? x : false; }, 30000, 2000);
    await check("Lightroom shows Stillpoint did not use 1 edited photo", !!seen);
    await window.e2eImage(name, p4.file, "0");
    await check("file removed: the mark goes away", await waitFor(async () => !(await refused()), 20000, 500), await refused());

    await out("");
    await out("== 7. Tidy up");
    await closeExport();
    await lr("record", { off: "1" });
    await check("the Export closes", !exportOpen());
  }

  window.addEventListener("load", () => {
    setTimeout(async () => {
      try { await run(); }
      catch (e) { failed++; await out("FAIL  the test stopped   [" + (e && e.message ? e.message : e) + "]"); try { await window.e2eLrSend("cmd=record\noff=1"); } catch (x) { /* sem plugin */ } }
      await out("");
      await out(passed + " passed, " + failed + " failed");
      await out("END");
    }, 1500);
  });
})();
