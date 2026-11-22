// Janela Guided aim (etapa 21, parte 6; desenho aprovado pelo dono em 2026-11-14).
// Uma câmera por vez: a foto (ou a imagem ao vivo, Live aim), as marcas, as setas e as instruções em letra grande.
// Esta página só mostra: quem decide a câmera da vez, as instruções e o progresso é a página principal
// (Test shot › Align cameras), que manda o estado por window.aimState(estado). O que a pessoa faz aqui volta por
// aimAction({type: "next" | "prev" | "nextchange" | "live"}) ou aimAction({type: "go", camera}) (clique na aba de uma câmera).
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
    lensMouse: 0, lensPos: -1, lensK: 0, lensWant: false, lensRaf: 0,   // a lupa do mapa: o ponteiro (px), o centro da lente (segue o ponteiro com um pequeno atraso) e o quanto está aberta
    drag: false, dragCam: "", dragSent: "", dragTimer: 0,  // clicar e arrastar no mapa
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
      $("gaProg").innerHTML = ""; $("gaMini").innerHTML = ""; S.tabsHtml = ""; fitTabs();
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
      $("gaMini").innerHTML = (st.tabs || []).map((t) => '<span class="' + t.state + '" data-camera="' + esc(t.camera) + '" title="Camera ' + pad(t.order) + '"></span>').join("");
      fitTabs(true);
      lensLayout();  // (os traços foram refeitos, talvez com o mouse em cima)
    } else fitTabs(false);
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
  // As abas, do jeito que couber (decisões do dono, 2026-11-22):
  //   - cabem com o texto: "01 · READY";  - não cabem: só o número (a cor diz o estado);
  //   - nem assim cabem numa linha: uma faixa que desliza, com setas nas pontas e Next to change (forma A);
  //   - 50 câmeras ou mais: a faixa e, em cima, o mapa de todas as câmeras (forma C).
  const MAP_FROM = 50;
  // measure: as abas ou o tamanho da janela mudaram (mede de novo o que cabe); sem isso só acerta o resto
  function fitTabs(measure) {
    const prog = $("gaProg"), st = S.state, n = prog.children.length;
    const extra = ["gaTabsPrev", "gaTabsNext", "gaNextChange"];
    const map = n >= MAP_FROM;
    let mode = S.tabsMode || "full";
    if (measure !== false) {
      const at = prog.scrollLeft;
      prog.classList.remove("compact", "strip");
      extra.forEach((id) => $(id).classList.add("hidden"));
      $("gaMini").classList.toggle("hidden", !map);
      mode = "full";
      if (map || Array.from(prog.children).some((b) => b.scrollWidth > b.clientWidth + 1)) {
        prog.classList.add("compact");
        mode = "compact";
        // (só o número precisa de uns 30 px por aba)
        if (map || n * 34 > prog.clientWidth) {
          mode = "strip";
          extra.forEach((id) => $(id).classList.remove("hidden"));
          prog.classList.add("strip");
          prog.scrollLeft = at;
        }
      }
    }
    const left = st && st.tabs ? st.tabs.filter((t) => t.state === "needs" && t.camera !== st.camera).length : 0;
    const jump = $("gaNextChange");
    jump.textContent = "Next to change" + (!map && left ? " · " + left + " left" : "");
    jump.disabled = !left;
    jump.classList.toggle("needs", left > 0);
    if (mode !== S.tabsMode) { S.tabsMode = mode; S.tabsCam = ""; }
    if (mode === "strip" && st && S.tabsCam !== st.camera) { S.tabsCam = st.camera; centerTab(); }
    stripChanged();
  }
  // A aba da câmera na tela vai para o meio da faixa
  function centerTab() {
    const prog = $("gaProg"), here = prog.querySelector("button.here");
    if (here) prog.scrollLeft = here.offsetLeft - prog.offsetLeft - (prog.clientWidth - here.offsetWidth) / 2;
  }
  // A faixa andou: as setas das pontas e, no mapa, o trecho que a faixa está mostrando
  function stripChanged() {
    const prog = $("gaProg");
    if (!prog.classList.contains("strip")) return;
    $("gaTabsPrev").disabled = prog.scrollLeft <= 1;
    $("gaTabsNext").disabled = prog.scrollLeft >= prog.scrollWidth - prog.clientWidth - 1;
    const marks = $("gaMini").children;
    if ($("gaMini").classList.contains("hidden") || !marks.length) return;
    const a = prog.scrollLeft, b = a + prog.clientWidth;
    Array.from(prog.children).forEach((t, i) => {
      const x = t.offsetLeft - prog.offsetLeft + t.offsetWidth / 2;
      if (marks[i]) marks[i].classList.toggle("win", x >= a && x <= b);
    });
    lensLayout();  // (o brilho dos traços depende de estarem no trecho à mostra)
  }
  function slideTabs(dir) {
    const prog = $("gaProg");
    prog.scrollBy({ left: dir * Math.max(80, prog.clientWidth - 84), behavior: "smooth" });
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
  window.addEventListener("resize", () => { fitTabs(); fit(); lensLayout(); });

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
  $("gaTabsPrev").addEventListener("click", () => slideTabs(-1));
  $("gaTabsNext").addEventListener("click", () => slideTabs(1));
  $("gaNextChange").addEventListener("click", () => send("nextchange"));
  $("gaProg").addEventListener("scroll", stripChanged);
  // O mapa e o mouse (decisões do dono, 2026-11-22): a lupa e a etiqueta com a câmera embaixo do ponteiro; clicar leva
  // àquela câmera; clicar, segurar e arrastar vai passando pelas câmeras.
  // A lupa é uma lente em volta do ponteiro: os traços a menos de R dele se abrem e crescem, e o ponto embaixo do
  // ponteiro não sai do lugar (por isso a câmera da etiqueta é sempre a do traço embaixo do ponteiro). Ela abre e
  // fecha com uma animação curta (S.lensK vai de 0 a 1 e volta).
  function miniIndex(pos) {
    const mini = $("gaMini"), n = mini.children.length;
    return n ? Math.max(0, Math.min(n - 1, Math.floor(pos / mini.clientWidth * n))) : -1;
  }
  // A forma da lente: quanto cada ponto se abre (até uns 3,6x no meio) ou se aperta (no máximo até a metade, na
  // borda da lente), em função da distância ao centro (0 a 1). A soma dá 1: o que abre no meio é compensado em
  // volta, e fora da lente nada sai do lugar. Sem apertar mais que a metade: traços finos demais tremiam na tela
  // (teste do dono, 2026-11-22). LENS_G[j] = para onde vai o ponto j/LENS_N, com a lente toda aberta.
  const LENS_N = 240, LENS_MIN = 0.5, LENS_SIGMA = 0.18, LENS_G = (() => {
    const bump = (t) => Math.exp(-(t / LENS_SIGMA) * (t / LENS_SIGMA));
    let area = 0;
    for (let j = 0; j < LENS_N; ++j) area += bump((j + 0.5) / LENS_N) / LENS_N;
    const peak = (1 - LENS_MIN) / area, g = [0];
    for (let j = 0; j < LENS_N; ++j) g.push(g[j] + (LENS_MIN + peak * bump((j + 0.5) / LENS_N)) / LENS_N);
    return g.map((v) => v / g[LENS_N]);
  })();
  const lensG = (t) => { const x = Math.min(1, Math.max(0, t)) * LENS_N, j = Math.min(LENS_N - 1, Math.floor(x)); return LENS_G[j] + (LENS_G[j + 1] - LENS_G[j]) * (x - j); };
  // Os traços do mapa são postos no lugar aqui (posição, largura, altura e brilho de cada um), com ou sem a lupa
  function lensLayout() {
    const mini = $("gaMini"), tip = $("gaTip"), marks = mini.children, n = marks.length;
    const W = mini.clientWidth;
    if (!n || !W) { tip.classList.add("hidden"); return; }
    const k = S.lensPos >= 0 ? S.lensK : 0, w = W / n, m = S.lensPos, R = Math.max(110, 14 * w);
    // (perto de uma ponta do mapa a lente encolhe desse lado: as pontas não saem do lugar)
    const f = (x) => {
      if (k <= 0) return x;
      const d = x - m, a = Math.abs(d), r = Math.min(R, d < 0 ? m : W - m);
      if (a >= r || r <= 0) return x;
      const t = a / r;
      return m + Math.sign(d) * r * (t + k * (lensG(t) - t));
    };
    let left = f(0);
    for (let i = 0; i < n; ++i) {
      const right = f((i + 1) * w), size = right - left, gap = Math.min(1, size * 0.22);
      const near = k > 0 ? Math.max(0, 1 - Math.abs((left + right) / 2 - m) / (R * 0.6)) : 0, lit = near * near * (3 - 2 * near);
      const st = marks[i].style, cls = marks[i].classList;
      st.left = left.toFixed(2) + "px";
      st.width = (size - gap).toFixed(2) + "px";
      // (curva acentuada: o pico bem mais alto que os vizinhos; pedido do dono, 2026-11-22)
      st.height = (12 + 28 * k * Math.pow(near, 1.7)).toFixed(2) + "px";
      // Com a lupa aberta, o resto do mapa apaga um pouco e os traços da lente acendem (sem degrau: o brilho muda aos poucos)
      const normal = cls.contains("needs") || cls.contains("win") ? 1 : 0.55, dim = cls.contains("needs") ? 0.6 : 0.28, base = normal + (dim - normal) * k;
      st.opacity = (base + (1 - base) * lit).toFixed(3);
      left = right;
    }
    if (k <= 0) { tip.classList.add("hidden"); return; }
    // A etiqueta diz a câmera embaixo do ponteiro (a lente chega um instante depois)
    const t = S.state && S.state.tabs ? S.state.tabs[miniIndex(S.lensMouse)] : null;
    tip.classList.toggle("hidden", !t || !S.lensWant);
    if (!t || !S.lensWant) return;
    tip.innerHTML = "Camera " + pad(t.order) + (t.state ? ' · <b class="' + t.state + '">' + (t.state === "needs" ? "change" : "ready") + "</b>" : "");
    const host = tip.offsetParent.getBoundingClientRect(), box = mini.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(host.width - tip.offsetWidth - 8, box.left + S.lensMouse - host.left - tip.offsetWidth / 2)) + "px";
    tip.style.top = (box.bottom - host.top + 8) + "px";
  }
  function lensAnimate() {
    if (S.lensRaf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(50, now - last); last = now;
      const want = S.lensWant ? 1 : 0;
      S.lensK = want > S.lensK ? Math.min(1, S.lensK + dt / 140) : Math.max(0, S.lensK - dt / 140);
      // O centro da lente vai atrás do ponteiro com um pequeno atraso (movimento suave; pedido do dono, 2026-11-22)
      if (S.lensWant && S.lensPos >= 0) { S.lensPos += (S.lensMouse - S.lensPos) * (1 - Math.exp(-dt / 70)); if (Math.abs(S.lensMouse - S.lensPos) < 0.3) S.lensPos = S.lensMouse; }
      if (!S.lensWant && S.lensK <= 0) S.lensPos = -1;
      lensLayout();
      S.lensRaf = S.lensK !== want || (S.lensWant && S.lensPos !== S.lensMouse) ? requestAnimationFrame(step) : 0;
    };
    S.lensRaf = requestAnimationFrame(step);
  }
  function lensAt(clientX, want) {
    const r = $("gaMini").getBoundingClientRect();
    if (want) { S.lensMouse = Math.max(0, Math.min(r.width - 0.01, clientX - r.left)); if (S.lensPos < 0) S.lensPos = S.lensMouse; }
    S.lensWant = want;
    lensAnimate();
  }
  // Vai para a câmera embaixo do ponteiro; arrastando, no máximo uma troca a cada 150 ms (e sempre a última)
  function miniGo() {
    const t = S.state && S.state.tabs ? S.state.tabs[miniIndex(S.lensMouse)] : null;
    if (!t) return;
    S.dragCam = t.camera;
    if (S.dragTimer) return;
    const fire = () => {
      S.dragTimer = 0;
      const cam = S.dragCam;
      if (!cam || cam === S.dragSent || (S.state && S.state.camera === cam && !S.dragSent)) return;
      S.dragSent = cam;
      send("go", cam);
      S.dragTimer = setTimeout(fire, 150);
    };
    fire();
  }
  $("gaMini").addEventListener("mousemove", (e) => { if (!S.drag) lensAt(e.clientX, true); });
  $("gaMini").addEventListener("mouseleave", () => { if (!S.drag) lensAt(0, false); });
  $("gaMini").addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    S.drag = true; S.dragSent = "";
    lensAt(e.clientX, true);
    miniGo();
  });
  document.addEventListener("mousemove", (e) => { if (S.drag) { lensAt(e.clientX, true); miniGo(); } });
  document.addEventListener("mouseup", (e) => {
    if (!S.drag) return;
    S.drag = false;
    miniGo();
    const r = $("gaMini").getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) lensAt(0, false);
  });
  $("gaProg").addEventListener("click", (e) => { const b = e.target.closest("button[data-camera]"); if (b && !b.classList.contains("here")) send("go", b.dataset.camera); });

  // ----- Display (igual à janela Live): janela ou tela cheia num monitor escolhido -----
  const displayBtns = Array.from(document.querySelectorAll("#gaTools [data-display]"));
  function renderOpts() {
    displayBtns.forEach((b) => b.classList.toggle("on", b.dataset.display === S.opts.display));
    $("gaOnTop").checked = S.opts.onTop;
    $("gaOnTopLabel").classList.toggle("hidden", S.opts.display === "full");
    $("gaChangeDisplay").classList.toggle("hidden", !(S.opts.display === "full" && S.screens.length > 1));
    root.classList.toggle("full", S.opts.display === "full");
    requestAnimationFrame(() => { fitTabs(); fit(); lensLayout(); });
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
