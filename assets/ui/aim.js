// Janela Guided aim (etapa 21, parte 6; desenho aprovado pelo dono em 2026-11-14).
// Uma câmera por vez: a foto (ou a imagem ao vivo, Live aim), as marcas, as setas e as instruções em letra grande.
// Esta página só mostra: quem decide a câmera da vez, as instruções e o progresso é a página principal
// (Test shot › Align cameras), que manda o estado por window.aimState(estado). O que a pessoa faz aqui volta por
// aimAction({type: "next" | "prev" | "live"}) ou aimAction({type: "go", camera}) (clique na aba de uma câmera).
// Display: janela (sempre à frente ou não) ou tela cheia num monitor escolhido, como a janela Live.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = $("aim");
  const S = {
    state: null,                 // o último estado mandado pela página principal
    frame: null,                 // o último quadro ao vivo: { camera, url }
    opts: { display: "window", screen: "", onTop: false },
    screens: [],
    hideTimer: 0,
    photoKey: "", photoUrl: "",  // a foto parada à mostra (sessão/arquivo) e o endereço dela
  };
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const send = (type, camera) => { if (typeof window.aimAction === "function") window.aimAction(JSON.stringify(camera ? { type, camera } : { type })); };

  // ----- O que a página principal mandou -----
  function render() {
    const st = S.state;
    const on = !!(st && st.camera);
    root.classList.toggle("ga-empty", !on);
    if (!on) {
      $("gaName").textContent = "Guided aim";
      $("gaInfo").textContent = "";
      $("gaProg").innerHTML = ""; S.tabsHtml = "";
      $("gaLines").innerHTML = '<li class="info">Open Test shot › Align cameras in the main window.</li>';
      $("gaImg").removeAttribute("src");
      $("gaMarks").innerHTML = "";
      $("gaNum").textContent = "";
      $("gaLiveTag").classList.add("hidden");
      ["gaLive", "gaPrev", "gaNext"].forEach((id) => { $(id).disabled = true; });
      return;
    }
    const live = !!(st.live && st.live.on);
    $("gaName").textContent = "Camera " + pad(st.order) + " · " + st.camera;
    $("gaInfo").textContent = (st.ready ? "All " + st.total + " cameras ready" : "Camera " + st.index + " of " + st.total) + (live ? " · live" : "");
    // As abas só são refeitas quando mudam (um clique não se perde no meio de um quadro ao vivo)
    const tabs = (st.tabs || []).map((t) => '<button type="button" data-camera="' + esc(t.camera) + '" class="' + t.state + (t.camera === st.camera ? " here" : "") + '">' +
      pad(t.order) + (t.state === "done" ? "<i> · READY</i>" : t.state === "needs" ? "<i> · CHANGE</i>" : "") + "</button>").join("");
    if (S.tabsHtml !== tabs) {
      S.tabsHtml = tabs;
      $("gaProg").innerHTML = tabs;
      // (com as abas só no número, o estado aparece ao parar o mouse)
      $("gaProg").querySelectorAll("button").forEach((b) => { b.title = "Camera " + b.textContent.replace(" · ", ": ").replace("READY", "ready").replace("CHANGE", "needs a change"); });
      fitTabs();
    }
    const lines = $("gaLines");
    lines.innerHTML = "";
    (st.lines || []).forEach(([cls, text]) => { const li = document.createElement("li"); li.className = cls; li.textContent = text; lines.appendChild(li); });
    $("gaNum").textContent = pad(st.order);
    $("gaLiveTag").classList.toggle("hidden", !live);
    // Live aim: ligado (cheio), desligado (vazado) ou sem imagem ao vivo nesta câmera (apagado)
    const b = $("gaLive");
    const want = !!(st.live && st.live.want), can = !(st.live && st.live.none);
    b.textContent = !can ? "No live image" : want ? "● Live aim on" : "Live aim off";
    b.className = "btn " + (want && can ? "btn-primary" : "btn-secondary");
    b.disabled = !can;
    b.title = can ? "" : "This camera has no live image. Change it and use Fire again in the main window.";
    $("gaPrev").disabled = st.total < 2;
    $("gaNext").disabled = st.total < 2;
    // A imagem: o quadro ao vivo desta câmera ou a última foto
    const img = $("gaImg");
    if (live && S.frame && S.frame.camera === st.camera) { if (img.getAttribute("src") !== S.frame.url) img.src = S.frame.url; }
    else if (!live) showPhoto(st);
    const box = $("gaPhoto");
    box.style.aspectRatio = String(st.ratio || 1.5);
    drawMarks(st);
    fit();
  }
  function showPhoto(st) {
    const key = st.session + "/" + st.file;
    const img = $("gaImg");
    if (!st.file) { img.removeAttribute("src"); S.photoKey = ""; return; }
    if (S.photoKey === key) { if (S.photoUrl && img.getAttribute("src") !== S.photoUrl) img.src = S.photoUrl; return; }
    S.photoKey = key; S.photoUrl = "";
    img.removeAttribute("src");
    if (typeof window.getOrderPhoto !== "function") return;
    Promise.resolve(window.getOrderPhoto(st.session, st.file, 1600)).then((url) => {
      if (S.photoKey !== key || !url) return;
      S.photoUrl = url;
      const now = S.state;
      if (now && !(now.live && now.live.on) && now.session + "/" + now.file === key) img.src = url;
    }).catch(() => {});
  }
  // As marcas (três pontos e a linha entre a de cima e a de baixo), a mira no centro e as setas
  function drawMarks(st) {
    const host = $("gaMarks");
    let html = "";
    const m = st.marks;
    if (m && m.length === 3) {
      html += '<span class="al-seg" data-ax="' + m[0][0] + '" data-ay="' + m[0][1] + '" data-bx="' + m[2][0] + '" data-by="' + m[2][1] + '" style="left:' + (m[0][0] * 100) + "%;top:" + (m[0][1] * 100) + '%"></span>';
      m.forEach((p) => { html += '<span class="al-dot" style="left:' + (p[0] * 100) + "%;top:" + (p[1] * 100) + '%"></span>'; });
    }
    html += '<span class="al-aim"></span>';
    const a = st.arrows || {};
    if (a.pan) html += '<span class="al-arrow" style="left:' + (a.pan < 0 ? 38 : 56) + '%;top:42%">' + (a.pan < 0 ? "←" : "→") + "</span>";
    if (a.tilt) html += '<span class="al-arrow" style="left:47.5%;top:' + (a.tilt > 0 ? 24 : 58) + '%">' + (a.tilt > 0 ? "↑" : "↓") + "</span>";
    host.innerHTML = html;
  }
  // Muitas câmeras: quando o texto não cabe nas abas, fica só o número (a cor continua dizendo o estado) e, se
  // ainda assim não couber, as abas quebram em mais de uma linha
  function fitTabs() {
    const prog = $("gaProg");
    prog.classList.remove("compact");
    const tight = Array.from(prog.children).some((b) => b.scrollWidth > b.clientWidth + 1);
    prog.classList.toggle("compact", tight);
  }
  // A imagem no maior tamanho que cabe na coluna, sem deformar
  function fit() {
    const box = $("gaPhotoBox"), ph = $("gaPhoto");
    const ratio = parseFloat(ph.style.aspectRatio) || 1.5;
    const w = Math.max(120, Math.min(box.clientWidth, box.clientHeight * ratio));
    ph.style.width = w + "px";
    ph.querySelectorAll(".al-seg").forEach((s) => {
      const W = ph.clientWidth, H = ph.clientHeight;
      const ax = s.dataset.ax * W, ay = s.dataset.ay * H, bx = s.dataset.bx * W, by = s.dataset.by * H;
      s.style.height = Math.hypot(bx - ax, by - ay) + "px";
      s.style.transform = "rotate(" + (-Math.atan2(bx - ax, by - ay) * 180 / Math.PI) + "deg)";
    });
  }
  window.addEventListener("resize", () => { fitTabs(); fit(); });

  window.aimState = function (state) { S.state = state || null; render(); };
  window.onCoreEvent = function (event) {
    if (event.type === "aimFrame") {
      S.frame = { camera: event.camera, url: event.url };
      const st = S.state;
      if (st && st.camera === event.camera && st.live && st.live.on) { $("gaImg").src = event.url; $("gaLiveTag").classList.remove("hidden"); }
      return;
    }
    if (event.type === "screens") { S.screens = event.screens || []; fixScreen(); renderOpts(); return; }
  };

  // ----- Botões -----
  $("gaLive").addEventListener("click", () => send("live"));
  $("gaPrev").addEventListener("click", () => send("prev"));
  $("gaNext").addEventListener("click", () => send("next"));
  $("gaProg").addEventListener("click", (e) => { const b = e.target.closest("button[data-camera]"); if (b && !b.classList.contains("here")) send("go", b.dataset.camera); });

  // ----- Display (igual à janela Live): janela ou tela cheia num monitor escolhido -----
  const displayBtns = Array.from(document.querySelectorAll("#gaTools [data-display]"));
  function renderOpts() {
    displayBtns.forEach((b) => b.classList.toggle("on", b.dataset.display === S.opts.display));
    $("gaOnTop").checked = S.opts.onTop;
    $("gaOnTopLabel").classList.toggle("hidden", S.opts.display === "full");
    $("gaChangeDisplay").classList.toggle("hidden", !(S.opts.display === "full" && S.screens.length > 1));
    root.classList.toggle("full", S.opts.display === "full");
    requestAnimationFrame(() => { fitTabs(); fit(); });
  }
  function setOpts(change, silent) {
    const before = JSON.stringify([S.opts.display, S.opts.screen, S.opts.onTop]);
    const apply = !!change.applyDisplay;
    delete change.applyDisplay;
    Object.assign(S.opts, change);
    if (["window", "full"].indexOf(S.opts.display) < 0) S.opts.display = "window";
    S.opts.onTop = !!S.opts.onTop;
    S.opts.screen = String(S.opts.screen || "");
    if (S.opts.display === "full" && !S.screens.some((sc) => sc.name === S.opts.screen))
      S.opts.screen = (S.screens.find((sc) => !sc.primary) || S.screens[0] || { name: "" }).name;
    if (!silent && typeof window.aimSaveWindow === "function") window.aimSaveWindow(JSON.stringify(S.opts));
    const after = JSON.stringify([S.opts.display, S.opts.screen, S.opts.onTop]);
    if (((!silent && before !== after) || apply) && typeof window.aimDisplay === "function")
      window.aimDisplay(S.opts.display, S.opts.screen, S.opts.onTop ? "1" : "0");
    renderOpts();
  }
  // O monitor da tela cheia foi desligado: vai para o principal
  function fixScreen() {
    if (S.opts.display === "full" && S.screens.length && !S.screens.some((sc) => sc.name === S.opts.screen)) {
      const main = S.screens.find((sc) => sc.primary) || S.screens[0];
      setOpts({ display: "full", screen: main.name, applyDisplay: true });
    }
  }
  // Com um monitor, direto; com um monitor já escolhido antes e ainda ligado, direto também; senão, pergunta
  function askFullScreen(always) {
    if (S.screens.length < 2) { setOpts({ display: "full", screen: S.screens[0] ? S.screens[0].name : "" }); return; }
    if (!always && S.opts.screen && S.screens.some((sc) => sc.name === S.opts.screen)) { setOpts({ display: "full", applyDisplay: S.opts.display === "full" }); return; }
    chooseScreen();
  }
  function chooseScreen() {
    const list = $("gaScreensList");
    list.innerHTML = "";
    S.screens.forEach((sc, i) => {
      const b = document.createElement("button");
      b.className = "btn btn-secondary" + (sc.name === S.opts.screen ? " current" : "");
      b.innerHTML = '<span class="live-screen-n"></span>';
      b.querySelector(".live-screen-n").textContent = String(i + 1);
      b.appendChild(document.createTextNode(sc.name + (sc.primary ? "  ·  main display" : "")));
      b.addEventListener("click", () => { $("gaScreens").classList.add("hidden"); setOpts({ display: "full", screen: sc.name, applyDisplay: true }); });
      list.appendChild(b);
    });
    $("gaScreens").classList.remove("hidden");
  }
  function close() {
    if (S.opts.display === "full") setOpts({ display: "window" });
    if (typeof window.aimClose === "function") window.aimClose();
  }
  displayBtns.forEach((b) => b.addEventListener("click", () => { if (b.dataset.display === "full") askFullScreen(); else setOpts({ display: "window" }); }));
  $("gaOnTop").addEventListener("change", () => setOpts({ onTop: $("gaOnTop").checked }));
  $("gaChangeDisplay").addEventListener("click", () => chooseScreen());
  $("gaScreensCancel").addEventListener("click", () => $("gaScreens").classList.add("hidden"));
  $("gaScreensIdentify").addEventListener("click", () => { if (typeof window.aimIdentify === "function") window.aimIdentify(); });
  $("gaClose").addEventListener("click", close);

  // As opções aparecem quando o mouse se mexe e somem sozinhas
  function showTools() {
    root.classList.add("tools-visible");
    clearTimeout(S.hideTimer);
    S.hideTimer = setTimeout(function hide() {
      const a = document.activeElement;
      if (document.documentElement.classList.contains("kbd-focus") && a && a !== document.body && root.contains(a)) { S.hideTimer = setTimeout(hide, 2500); return; }
      root.classList.remove("tools-visible");
    }, 2500);
  }
  root.addEventListener("mousemove", showTools);
  root.addEventListener("mousedown", () => { document.documentElement.classList.remove("kbd-focus"); showTools(); });
  document.addEventListener("keydown", (e) => {
    // Cmd+` / Cmd+Shift+`: passa para a outra janela do app
    if (e.metaKey && e.code === "Backquote" && typeof window.cycleWindows === "function") { e.preventDefault(); window.cycleWindows(e.shiftKey ? "1" : "0"); return; }
    if (e.key === "Tab") { document.documentElement.classList.add("kbd-focus"); showTools(); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!$("gaScreens").classList.contains("hidden")) $("gaScreens").classList.add("hidden");
      else if (S.opts.display === "full") setOpts({ display: "window" });
      else close();
    } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      e.preventDefault();
      if (S.opts.display === "full") setOpts({ display: "window" }); else askFullScreen();
    }
  }, true);

  // ----- Começo: as opções guardadas, os monitores e o estado de agora -----
  render();
  renderOpts();
  if (typeof window.aimReady === "function")
    Promise.resolve(window.aimReady()).then((info) => {
      info = info || {};
      S.screens = Array.isArray(info.screens) ? info.screens : [];
      let opts = {};
      try { opts = info.opts ? JSON.parse(info.opts) : {}; } catch (e) { opts = {}; }
      // Aplica o display guardado (tela cheia no monitor de antes, sempre à frente)
      setOpts(Object.assign({}, opts, { applyDisplay: true }), true);
      if (info.state) { S.state = info.state; render(); }
    }).catch(() => {});
})();
