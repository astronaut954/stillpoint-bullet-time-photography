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
    lensMouse: 0, lensGoal: 0, lensPos: -1, lensK: 0, lensWant: false, lensRaf: 0,   // a lupa do mapa: o ponteiro (px), o centro da lente (segue o ponteiro com um pequeno atraso) e o quanto está aberta
    drag: false, dragCam: "", dragSent: "", dragTimer: 0,  // clicar e arrastar no mapa
    hereCam: null,               // a câmera marcada como "a da tela" nas abas e no mapa (arrastando, a do ponteiro)
    photoKey: "", photoUrl: "",  // a foto parada à mostra (sessão/arquivo) e o endereço dela
  };
  // As medidas do mapa das câmeras, guardadas (mapMeasure): n traços, W largura, w largura de um traço, R raio da lupa...
  const G = { n: 0, W: 0, w: 0, R: 66, x0: 0, hostW: 0, cw: 0, sw: 1, tabW: 0, tab0: 0, tabStep: 1, winLo: 0, winHi: -1, hereI: -1, lo: 0, hi: -1, tipI: -2, tipState: "", tipW: 0,
              snap: (v) => v, left: 0, RW: 110, bl: [], bw: [] };
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
    // (a marca da câmera da tela, "here", é posta à parte: trocar de câmera não refaz as abas nem o mapa)
    const tabs = (st.tabs || []).map((t) => '<button type="button" data-camera="' + esc(t.camera) + '" class="' + t.state + '">' +
      pad(t.order) + (t.state === "done" ? "<i> · READY</i>" : t.state === "needs" ? "<i> · CHANGE</i>" : "") + "</button>").join("");
    if (S.tabsHtml !== tabs) {
      S.tabsHtml = tabs;
      $("gaProg").innerHTML = tabs;
      // (com as abas só no número, o estado aparece ao parar o mouse)
      $("gaProg").querySelectorAll("button").forEach((b) => { b.title = "Camera " + b.textContent.replace(" · ", ": ").replace("READY", "ready").replace("CHANGE", "needs a change"); });
      $("gaMini").innerHTML = (st.tabs || []).map((t) => '<span class="' + t.state + '" data-camera="' + esc(t.camera) + '" title="Camera ' + pad(t.order) + '"></span>').join("");
      S.hereCam = null;
      setHere(dragHere() || st.camera);
      fitTabs(true);
    } else {
      setHere(dragHere() || st.camera);
      fitTabs(false);
    }
    const lines = $("gaLines");
    lines.innerHTML = "";
    (st.lines || []).forEach(([cls, text]) => { const li = document.createElement("li"); li.className = cls; li.textContent = text; lines.appendChild(li); });
    $("gaNum").textContent = pad(st.order);
    $("gaLiveTag").classList.toggle("hidden", !live);
    // Live aim: ligado (cheio), desligado (vazado) ou sem imagem ao vivo nesta câmera (apagado)
    const b = $("gaLive");
    const want = !!(st.live && st.live.want), can = !(st.live && st.live.none);
    b.textContent = !can ? "No live image" : want && st.live.starting ? "Starting live image…" : want ? "● Live aim on" : "Live aim off";
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
    if (measure !== false) mapMeasure();
    // (arrastando no mapa, a faixa já acompanha o ponteiro: dragTo)
    if (mode === "strip" && st && !S.drag && S.tabsCam !== S.hereCam) { S.tabsCam = S.hereCam; centerTab(); }
    stripChanged();
  }
  // Arrastando no mapa (e até a página principal confirmar a última câmera pedida), a câmera marcada é a do ponteiro
  function dragHere() {
    if (S.dragWait && !S.drag && S.state && S.state.camera === S.dragCam) S.dragWait = false;
    return (S.drag || S.dragWait) && S.dragCam ? S.dragCam : "";
  }
  // Marca a câmera da tela na aba e no mapa (true se mudou)
  function setHere(camera) {
    if (S.hereCam === camera) return false;
    S.hereCam = camera;
    const i = S.state && S.state.tabs ? S.state.tabs.findIndex((t) => t.camera === camera) : -1;
    [$("gaProg"), $("gaMini")].forEach((box) => {
      const old = box.querySelector(".here");
      if (old) old.classList.remove("here");
      if (i >= 0 && box.children[i]) box.children[i].classList.add("here");
    });
    const was = G.hereI;
    G.hereI = i;
    paintBar(was); paintBar(i);
    return true;
  }
  // A aba da câmera na tela vai para o meio da faixa
  function centerTab() {
    const prog = $("gaProg"), here = prog.querySelector("button.here");
    if (here) prog.scrollLeft = here.offsetLeft - prog.offsetLeft - (prog.clientWidth - here.offsetWidth) / 2;
  }
  // A faixa andou: as setas das pontas e, no mapa, o trecho que a faixa está mostrando (os traços acesos e a moldura).
  // Só contas com as medidas guardadas (G): isto roda a cada movimento da faixa, e medir a tela aqui engasgava.
  function stripChanged() {
    const prog = $("gaProg");
    if (!prog.classList.contains("strip")) return;
    const a = prog.scrollLeft, atStart = a <= 1, atEnd = a >= G.sw - G.cw - 1;
    if ($("gaTabsPrev").disabled !== atStart) $("gaTabsPrev").disabled = atStart;
    if ($("gaTabsNext").disabled !== atEnd) $("gaTabsNext").disabled = atEnd;
    if (!G.n) return;
    // as abas com o meio dentro da faixa
    const lo = Math.max(0, Math.ceil((a - G.tab0 - G.tabW / 2) / G.tabStep)), hi = Math.min(G.n - 1, Math.floor((a + G.cw - G.tab0 - G.tabW / 2) / G.tabStep));
    const oldLo = G.winLo, oldHi = G.winHi;
    G.winLo = lo; G.winHi = hi;
    for (let i = Math.min(lo, oldLo); i <= Math.max(hi, oldHi); ++i) if ((i >= lo && i <= hi) !== (i >= oldLo && i <= oldHi)) paintBar(i);
    $("gaFrame").style.transform = "translateX(" + G.snap(G.x0 + a / G.sw * G.W - 4) + "px)";
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
  $("gaTabsPrev").addEventListener("click", () => slideTabs(-1));
  $("gaTabsNext").addEventListener("click", () => slideTabs(1));
  $("gaNextChange").addEventListener("click", () => send("nextchange"));
  $("gaProg").addEventListener("scroll", stripChanged);
  // O mapa e o mouse (decisões do dono, 2026-11-22): a lupa e a etiqueta com a câmera embaixo do ponteiro; clicar leva
  // àquela câmera; clicar, segurar e arrastar vai passando pelas câmeras.
  // A lupa é uma lente em volta do ponteiro: os traços a menos de R dele se abrem e crescem, e o ponto embaixo do
  // ponteiro não sai do lugar (por isso a câmera da etiqueta é sempre a do traço embaixo do ponteiro). Ela abre e
  // fecha com uma animação curta (S.lensK vai de 0 a 1 e volta).
  function miniIndex(pos) { return G.n ? Math.max(0, Math.min(G.n - 1, Math.floor(pos / G.W * G.n))) : -1; }
  // As medidas do mapa, tiradas uma vez (quando as abas são refeitas ou a janela muda de tamanho), e os traços postos
  // no lugar. Depois disso, mexer o mouse ou a faixa só muda a altura e o brilho de poucos traços, sem medir nada na
  // tela: medir e reposicionar os 200 traços a cada quadro deixava o movimento aos trancos (gravações do dono,
  // 2026-11-22).
  function mapMeasure() {
    const mini = $("gaMini"), frame = $("gaFrame"), tip = $("gaTip"), prog = $("gaProg"), marks = mini.children;
    const dpr = window.devicePixelRatio || 1;
    G.snap = (v) => Math.round(v * dpr) / dpr;
    // (as medidas da faixa valem também sem o mapa, com menos de 50 câmeras: sem elas as setas ‹ › ficavam apagadas;
    // teste do dono, 2026-11-22)
    G.cw = prog.clientWidth; G.sw = prog.scrollWidth;
    G.n = mini.classList.contains("hidden") ? 0 : marks.length;
    G.W = G.n ? mini.clientWidth : 0;
    if (!G.n || !G.W || !prog.classList.contains("strip")) { G.n = 0; frame.classList.add("hidden"); tip.classList.add("hidden"); stripChanged(); return; }
    G.w = G.W / G.n;
    G.R = Math.max(66, 8.4 * G.w);    // até onde os traços crescem e acendem
    G.RW = Math.max(110, 14 * G.w);   // até onde a lente mexe na largura dos traços
    G.bl = []; G.bw = [];
    frame.classList.remove("hidden");
    const host = frame.offsetParent.getBoundingClientRect(), box = mini.getBoundingClientRect();
    G.x0 = box.left - host.left; G.hostW = host.width; G.left = box.left;
    G.tabW = prog.children[0].offsetWidth; G.tab0 = prog.children[0].offsetLeft - prog.offsetLeft;
    G.tabStep = G.n > 1 ? prog.children[1].offsetLeft - prog.children[0].offsetLeft : G.tabW;
    // bordas em pixels inteiros da tela (os vãos entre os traços ficam sempre iguais)
    let left = 0;
    for (let i = 0; i < G.n; ++i) {
      const right = G.snap((i + 1) * G.w), size = right - left, gap = size >= 3 ? 1 : size >= 1.5 ? 1 / dpr : 0;
      G.bl[i] = left + "px"; G.bw[i] = Math.max(0, size - gap) + "px";
      marks[i].style.left = G.bl[i];
      marks[i].style.width = G.bw[i];
      marks[i]._moved = false;
      left = right;
    }
    frame.style.left = "0"; frame.style.top = (box.bottom - host.top - 12 - 5) + "px";
    frame.style.width = G.snap(G.cw / G.sw * G.W + 7) + "px"; frame.style.height = "21px";
    tip.style.left = "0"; tip.style.top = (box.bottom - host.top + 8) + "px";
    G.hereI = S.state && S.state.tabs ? S.state.tabs.findIndex((t) => t.camera === S.hereCam) : -1;
    G.winLo = 0; G.winHi = -1; G.lo = 0; G.hi = -1; G.tipI = -2;
    stripChanged();
    for (let i = 0; i < G.n; ++i) paintBar(i);
    paintLens();
  }
  // A forma da lente: para onde vai cada ponto (0 a 1, do centro à borda da lente). No meio abre 2x; em volta aperta
  // (no máximo até uns 0,7); a soma dá 1, então fora da lente nada sai do lugar.
  const LENS = (() => {
    const K = 240, sigma = 0.2, peak = 2, bump = (t) => Math.exp(-(t / sigma) * (t / sigma));
    let area = 0;
    for (let j = 0; j < K; ++j) area += bump((j + 0.5) / K) / K;
    const min = Math.max(0.4, (1 - peak * area) / (1 - area)), top = (1 - min) / area, g = [0];
    for (let j = 0; j < K; ++j) g.push(g[j] + (min + top * bump((j + 0.5) / K)) / K);
    return (t) => { const x = Math.min(1, Math.max(0, t)) * K, j = Math.min(K - 1, Math.floor(x)); return (g[j] + (g[j + 1] - g[j]) * (x - j)) / g[K]; };
  })();
  // A altura e o brilho de um traço: a câmera da tela (branca, mais alta), o trecho à mostra (aceso; o resto,
  // apagado) e a lupa (os traços em volta do ponteiro crescem e acendem, numa curva lisa de topo achatado). A altura
  // cresce por escala (sem refazer o desenho da tela).
  function paintBar(i) {
    const el = i >= 0 && i < G.n ? $("gaMini").children[i] : null;
    if (!el) return;
    const here = i === G.hereI, win = i >= G.winLo && i <= G.winHi, base = here ? 18 : 12;
    const k = S.lensPos >= 0 ? S.lensK : 0, m = S.lensPos;
    // A largura (decisão do dono, 2026-11-23, forma B): os traços do meio da lupa ficam com o dobro da largura; em
    // volta apertam um pouco, e fora da lente nada sai do lugar
    let center = (i + 0.5) * G.w;
    if (k > 0 && Math.abs(center - m) < G.RW + G.w) {
      const f = (x) => { const d = x - m, a = Math.abs(d), r = Math.min(G.RW, d < 0 ? m : G.W - m); if (a >= r || r <= 0) return x; const t = a / r; return m + Math.sign(d) * r * (t + k * (LENS(t) - t)); };
      const left = f(i * G.w), right = f((i + 1) * G.w), size = right - left;
      el.style.left = left.toFixed(2) + "px";
      el.style.width = Math.max(0, size - Math.min(1, size * 0.22)).toFixed(2) + "px";
      el._moved = true;
      center = (left + right) / 2;
    } else if (el._moved) { el.style.left = G.bl[i]; el.style.width = G.bw[i]; el._moved = false; }
    const far = k > 0 ? Math.min(1, Math.abs(center - m) / G.R) : 1, near = far < 1 ? Math.pow(Math.cos(far * Math.PI / 2), 2.6) * k : 0;
    // (a altura não é arredondada para pixels inteiros: arredondada, cada traço subia e descia em degraus de meio
    // pixel enquanto a lupa andava, e o conjunto tremia; teste do dono, 2026-11-22)
    const h = Math.max(base, 12 + 28 * near), normal = win ? 1 : 0.3;
    el.style.height = base + "px";
    el.style.transform = h > base + 0.01 ? "scaleY(" + (h / base).toFixed(5) + ")" : "";
    el.style.opacity = here ? "1" : (normal + (1 - normal) * near).toFixed(3);
  }
  // A lupa andou: só os traços perto dela (e os que estavam perto no quadro anterior) são refeitos; e a etiqueta
  function paintLens() {
    if (!G.n) return;
    const k = S.lensPos >= 0 ? S.lensK : 0;
    const lo = k > 0 ? Math.max(0, Math.floor((S.lensPos - G.RW) / G.w) - 1) : 0, hi = k > 0 ? Math.min(G.n - 1, Math.ceil((S.lensPos + G.RW) / G.w) + 1) : -1;
    for (let i = Math.min(lo, G.lo); i <= Math.max(hi, G.hi); ++i) paintBar(i);
    G.lo = lo; G.hi = hi;
    // A etiqueta diz a câmera embaixo do ponteiro (a lupa chega um instante depois)
    const tip = $("gaTip"), i = S.lensWant && k > 0 ? miniIndex(S.lensMouse) : -1, t = i >= 0 && S.state && S.state.tabs ? S.state.tabs[i] : null;
    if (!t) { if (G.tipI !== -1) { G.tipI = -1; tip.classList.add("hidden"); } return; }
    if (G.tipI !== i || G.tipState !== t.state) {
      G.tipI = i; G.tipState = t.state;
      tip.innerHTML = "Camera " + pad(t.order) + (t.state ? ' · <b class="' + t.state + '">' + (t.state === "needs" ? "change" : "ready") + "</b>" : "");
      tip.classList.remove("hidden");
      G.tipW = tip.offsetWidth;
    }
    tip.style.transform = "translateX(" + G.snap(Math.max(8, Math.min(G.hostW - G.tipW - 8, G.x0 + S.lensMouse - G.tipW / 2))) + "px)";
  }
  // O centro da lupa vai para o ponteiro com um pequeno atraso (movimento suave; pedido do dono, 2026-11-22), e ela
  // abre e fecha com uma animação curta (S.lensK vai de 0 a 1 e volta)
  function lensAnimate() {
    if (S.lensRaf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(50, now - last); last = now;
      // O alvo da lupa tem uma folga de 2 px em relação ao ponteiro: o tremor da mão (1 ou 2 px para lá e para cá) não
      // mexe a lupa; andando de verdade, ela segue o ponteiro
      if (S.lensMouse > S.lensGoal + 2) S.lensGoal = S.lensMouse - 2; else if (S.lensMouse < S.lensGoal - 2) S.lensGoal = S.lensMouse + 2;
      const want = S.lensWant ? 1 : 0, goal = S.lensGoal;
      // (só anda quando falta: com a lupa já toda aberta, a conta antiga fechava um pouco e abria de novo a cada
      // quadro, e todos os traços altos subiam e desciam uns 3 px, sem parar. Era o tremor; achado em 2026-11-22.)
      if (S.lensK < want) S.lensK = Math.min(1, S.lensK + dt / 140); else if (S.lensK > want) S.lensK = Math.max(0, S.lensK - dt / 140);
      if (S.lensWant && S.lensPos >= 0) { S.lensPos += (goal - S.lensPos) * (1 - Math.exp(-dt / (S.drag ? 40 : 80))); if (Math.abs(goal - S.lensPos) < 0.15) S.lensPos = goal; }
      paintLens();
      if (!S.lensWant && S.lensK <= 0) S.lensPos = -1;
      S.lensRaf = S.lensK !== want || (S.lensWant && S.lensPos !== goal) ? requestAnimationFrame(step) : 0;
    };
    S.lensRaf = requestAnimationFrame(step);
  }
  function lensAt(clientX, want) {
    if (!G.n) return;
    if (want) { S.lensMouse = Math.max(0, Math.min(G.W - 0.01, clientX - G.left)); if (S.lensPos < 0) S.lensPos = S.lensGoal = S.lensMouse; }
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
    S.drag = true; S.dragWait = true; S.dragSent = "";
    lensAt(e.clientX, true);
    dragTo();
  });
  // Arrastando: a marca da câmera, a faixa de abas e a moldura acompanham o ponteiro na hora, aqui mesmo; o pedido de
  // troca de câmera (imagem e instruções) segue atrás, no máximo um a cada 150 ms. Esperar a resposta para mexer na
  // marca e na faixa fazia tudo andar aos pulos (gravação do dono, 2026-11-22).
  function dragTo() {
    const t = S.state && S.state.tabs ? S.state.tabs[miniIndex(S.lensMouse)] : null;
    if (!t) return;
    if (setHere(t.camera)) $("gaName").textContent = "Camera " + pad(t.order) + " · " + t.camera;
    // A faixa de abas acompanha o ponteiro de forma contínua (o ponto do mapa embaixo dele fica no meio da faixa)
    const prog = $("gaProg");
    if (G.n) { prog.scrollLeft = S.lensMouse / G.W * G.sw - G.cw / 2; stripChanged(); }
    miniGo();
  }
  document.addEventListener("mousemove", (e) => { if (S.drag) { lensAt(e.clientX, true); dragTo(); } });
  document.addEventListener("mouseup", (e) => {
    if (!S.drag) return;
    dragTo();
    S.drag = false;
    S.tabsCam = S.hereCam;
    setTimeout(() => { if (!S.drag) S.dragWait = false; }, 1500);
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
