// Stillpoint — comportamento da interface.
// Recebe os avisos do programa em window.onCoreEvent e chama o programa pelas
// funções que o C++ disponibiliza para a página: uiReady, shoot, identify,
// setPrefix, setOrder, takeOrderPhotos, getOrderPhoto, discardOrderPhotos,
// restartConnections, listSessions, getPhoto, saveSessions (só as sessões escolhidas), deleteSession,
// deleteAllSessions e exitApp.
// As câmeras conectam sozinhas: a lista chega pelo aviso "cameras" sempre que muda.
//
// Textos da tela: frases curtas, sem emojis e sem cara de terminal.

(function () {
  const $ = (id) => document.getElementById(id);

  // =================== Abertura ===================
  // Chuva de código que vai aparecendo coluna por coluna; depois o logo surge e a
  // abertura some sozinha. Clique ou qualquer tecla pula. As câmeras já começam a
  // conectar por trás enquanto ela roda.
  (function splash() {
    const root = $("splash");
    const canvas = $("splashRain");
    if (!root || !canvas) return;
    // Desligada em Settings (o programa marca a página com data-off ao montar)
    if (root.dataset.off === "1") { root.remove(); return; }
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const LOGO_AT = reduced ? 0 : 2300;   // ms até o logo aparecer
    const LEAVE_AT = reduced ? 1200 : 4600; // ms até a abertura começar a sumir
    const ctx = canvas.getContext("2d");
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:=*+-<>";
    const cell = 18;
    let width = 0, height = 0, columns = [], started = 0, last = 0, done = false;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
      const count = Math.ceil(width / cell);
      // Cada coluna começa num momento diferente: a chuva vai "chegando"
      columns = Array.from({ length: count }, () => ({
        y: -Math.random() * height * 0.6,
        speed: 0.6 + Math.random() * 0.8,
        startAt: Math.random() * 1800,
      }));
    }

    function frame() {
      if (done) return;
      const now = performance.now();
      if (!started) started = now;
      const t = now - started;
      if (now - last >= 50) {  // ~20 quadros por segundo, como no filme
        last = now;
        ctx.fillStyle = "rgba(0, 0, 0, 0.09)";
        ctx.fillRect(0, 0, width, height);
        ctx.font = "15px 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'MS Gothic', 'JetBrains Mono', monospace";
        ctx.textBaseline = "top";
        columns.forEach((c, i) => {
          if (t < c.startAt) return;
          const x = i * cell;
          const ch = glyphs[(Math.random() * glyphs.length) | 0];
          // rastro verde e a "cabeça" da coluna mais clara
          ctx.fillStyle = "#00cc33";
          ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], x, c.y - cell);
          ctx.fillStyle = "#c8ffd6";
          ctx.shadowColor = "#00ff41"; ctx.shadowBlur = 8;
          ctx.fillText(ch, x, c.y);
          ctx.shadowBlur = 0;
          c.y += cell * c.speed;
          if (c.y > height + cell && Math.random() > 0.96) c.y = -cell * (1 + Math.random() * 10);
        });
      }
      if (t >= LOGO_AT) root.classList.add("show-logo");
      if (t >= LEAVE_AT) return leave();
      requestAnimationFrame(frame);
    }

    function leave() {
      if (done) return;
      done = true;
      root.classList.add("show-logo", "leaving");
      setTimeout(() => root.remove(), 800);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", leave, true);
    }

    resize();
    window.addEventListener("resize", resize);
    root.addEventListener("click", leave);
    document.addEventListener("keydown", leave, true);
    requestAnimationFrame(frame);
  })();

  const ui = {
    status: $("status"), saveBtn: $("saveBtn"), sessionCount: $("sessionCount"),
    sessionList: $("sessionList"), noSessions: $("noSessions"),
    viewerEmpty: $("viewerEmpty"), sessionGallery: $("sessionGallery"),
    cameraList: $("cameraList"), noCameras: $("noCameras"), searching: $("searching"), orderBtn: $("orderBtn"),
    shootBtn: $("shootBtn"), shootNote: $("shootNote"), countdown: $("countdown"), sessions: $("sessions"), downloadWait: $("downloadWait"),
    progress: $("progress"),
    log: $("log"), logToggle: $("logToggle"), logLast: $("logLast"), logList: $("logList"), techToggle: $("techToggle"),
    restartBtn: $("restartBtn"), copyLogBtn: $("copyLogBtn"), restartAppBtn: $("restartAppBtn"),
    countdownOverlay: $("countdownOverlay"), countdownNumber: $("countdownNumber"), flash: $("flash"),
    orderOverlay: $("orderOverlay"), orderGallery: $("orderGallery"), orderHelp: $("orderHelp"),
    orderRetake: $("orderRetake"), orderCancel: $("orderCancel"), orderSave: $("orderSave"),
    dialogOverlay: $("dialogOverlay"), dialogTitle: $("dialogTitle"), dialogText: $("dialogText"), dialogActions: $("dialogActions"),
    toast: $("toast"),
  };

  const SEARCH_GRACE_MS = 4000;  // tempo procurando antes de mostrar "nenhuma câmera"
  const startedAt = Date.now();
  let busy = false;
  let busyAction = "";
  let shootCancelling = false;   // pediu para cancelar, esperando o núcleo parar
  let shootCancelled = false;    // o bullet time atual foi cancelado
  let lastShootAt = 0;           // quando o último disparo começou/terminou (as sessões que chegam logo depois são dele)
  let shootPlan = null;          // plano enviado no último disparo (para explicar recusas)
  let shootMissing = [];         // fotos recusadas no disparo atual: { camera, index, gap }
  let camSettings = [];          // configurações de cada câmera (evento cameraSettings)
  const csPending = new Set();   // "câmera|chave" enviados e ainda sem resposta ("*" = todas)
  const csTest = { capturing: false, has: false, ratios: {} };  // teste rápido do Camera settings; ratios: proporção real medida por câmera no último Match
  let csPoll = 0;                // releitura a cada 3 s com a janela aberta
  let csRenderLater = false;     // chegou leitura nova com uma lista aberta: redesenha ao sair dela
  let cameras = [];              // última lista recebida (inclui as que estão conectando)
  let sessions = [];
  let currentSession = null;
  let playTimer = null;
  const photoCache = {};         // "loja/sessão/arquivo/tamanho" -> Promise<dataURL|null>

  // =================== Ícones ===================
  const ICONS = {
    alert: '<path d="M7 1.8L13 12.2H1L7 1.8z"/><path d="M7 5.6v3"/><path d="M7 10.4v.1"/>',
    minus: '<path d="M3 7h8"/>',
    plus: '<path d="M3 7h8M7 3v8"/>',
    swap: '<path d="M2.5 5h8l-2.5-2.5M11.5 9h-8l2.5 2.5"/>',
    lens: '<rect x="1.5" y="2.5" width="11" height="9"/><path d="M1.5 5.5c1.4-1.6 2.3-1.6 3.7 0s2.3 1.6 3.7 0 2.3-1.6 3.6 0M4.5 8.5h5"/>',
    // Modo teatro, como no YouTube: tela com barra embaixo e dois ângulos dentro
    // (para fora = entrar; para dentro = sair)
    // Modo teatro: só as setas (para fora = entrar; para dentro = sair), no botão igual ao da janela Project
    // Framing: ⤢ (setas em diagonal para fora) amplia a prévia; ⤡ (para dentro) volta
    // Align photos (pedaço 2 do Framing): dois quadros sobrepostos, um deles tracejado
    alignPhotos: '<rect x="1.5" y="4.5" width="8" height="6"/><path d="M5 1.5h7.5V7" stroke-dasharray="2 1.5"/>',
    enlargeIn: '<path d="M8 2.5h3.5V6M11.5 2.5L7.5 6.5M6 11.5H2.5V8M2.5 11.5L6.5 7.5"/>',
    enlargeOut: '<path d="M11.5 2.5L7.5 6.5M7.5 3.5v3h3M2.5 11.5L6.5 7.5M6.5 10.5v-3h-3"/>',
    theaterIn: '<path d="M4.5 4L1.5 7l3 3M9.5 4l3 3-3 3"/>',
    theaterOut: '<path d="M1.5 4l3 3-3 3M12.5 4l-3 3 3 3"/>',
    up: '<path d="M3 9l4-4 4 4"/>',
    down: '<path d="M3 5l4 4 4-4"/>',
    left: '<path d="M9 3L5 7l4 4"/>',
    right: '<path d="M5 3l4 4-4 4"/>',
    play: '<path d="M4 2.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M4 3v8M10 3v8"/>',
    folder: '<path d="M1.5 4.5v7h13v-8.5h-6.5l-1.5-1.5h-5v3z"/>',
    // Sessão: várias fotos empilhadas (a pasta fica só para o projeto)
    session: '<path d="M4.5 2h8v7.5"/><rect x="1.5" y="4.5" width="8.5" height="8" rx=".8"/><path d="M1.5 10.5l2.4-2.4 1.8 1.8 1.3-1.3 3 3"/>',
    expand: '<path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"/>',
    shrink: '<path d="M5 2v3H2M12 5H9V2M9 12V9h3M2 9h3v3"/>',
    trash: '<path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.6 7.5h5.8l.6-7.5"/>',
    photo: '<rect x="1.5" y="2.5" width="11" height="9" rx="1"/><path d="M1.5 10l3.2-3.2 2.3 2.3 1.6-1.6 3.9 3.9"/><circle cx="9.6" cy="5.4" r="1"/>',
    menu: '<path d="M2.5 4h9M2.5 7h9M2.5 10h9"/>',
    close: '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>',
    // Cortina do Split (Match, passo 3): duas setas, para os dois lados
    curtain: '<path d="M4.5 4.5L2 7l2.5 2.5M9.5 4.5L12 7l-2.5 2.5M2 7h10"/>',
  };
  function icon(name, size) {
    const s = size || 14;
    const box = name === "folder" ? "0 0 16 14" : "0 0 14 14";
    return '<svg width="' + s + '" height="' + s + '" viewBox="' + box + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  // =================== Utilitários ===================
  // short: a versão curta (só os números), usada quando falta espaço na barra de cima
  function setStatus(text, kind, short) {
    ui.status.textContent = "";
    ui.status.append(el("span", "st-full", text));
    if (short) ui.status.append(el("span", "st-short", short));
    ui.status.title = short ? text : "";
    ui.status.className = "status status-" + (kind || "idle");
  }

  function stillSearching() {
    return Date.now() - startedAt < SEARCH_GRACE_MS;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  // Números curtos para a barra de cima: 1284 -> "1.3k", 38520 -> "38.5k", 128400 -> "128k"
  function shortNum(n) {
    n = +n || 0;
    const one = (v, unit) => (v < 100 ? String(Math.round(v * 10) / 10) : String(Math.round(v))) + unit;
    if (n < 1000) return String(n);
    if (n < 999500) return one(n / 1000, "k");
    return one(n / 1e6, "M");
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // Nome do modelo sem "Canon " (cabe melhor nas miniaturas)
  function shortModel(model) {
    return (model || "").replace(/^Canon\s+/i, "");
  }

  // Modelo da câmera pelo apelido (T7_1); se for o único daquele modelo, só o modelo
  function cameraLabel(name, model) {
    const cam = cameras.find((c) => c.name === name);
    const m = model || (cam && cam.model) || "";
    if (!m) return name;
    const sameModel = cameras.filter((c) => c.model === m).length;
    return sameModel > 1 ? m + " (" + name + ")" : m;
  }

  function readyStatus() {
    if (busy) return;
    const ready = cameras.filter((c) => c.connected).length;
    const connecting = cameras.filter((c) => c.state === "connecting").length;
    if (ready && connecting) setStatus(ready + " ready, " + connecting + " connecting", "ok", ready + " + " + connecting);
    else if (ready) setStatus(plural(ready, "camera ready", "cameras ready"), "ok", String(ready));
    else if (connecting) setStatus("Connecting", "busy");
    else if (stillSearching()) setStatus("Looking for cameras", "busy");
    else setStatus("No cameras", "idle");
  }

  // Mensagens do núcleo trazem emojis e espaços do terminal: só para os detalhes técnicos
  function plainText(text) {
    return text.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s+/g, " ").trim();
  }

  // Rodapé: enquanto algo está em andamento (conectando, disparando, salvando...),
  // mostra o que é com reticências animadas; senão, a última mensagem.
  const DOTS = ["", ".", "..", "..."];
  const activity = { last: "", busyText: "", saving: false, closing: false, step: 0 };
  const BUSY_TEXT = {
    restart: "Restarting camera connections", shoot: "Shooting", identify: "Identifying the camera",
    reorder: "Saving the camera order", orderPhotos: "Taking a photo with each camera",
  };

  function ongoingText() {
    if (activity.closing) return "Closing";
    if (activity.saving) return "Exporting sessions";
    if (busy) return activity.busyText || BUSY_TEXT[busyAction] || "Working";
    const connecting = cameras.filter((c) => c.state === "connecting" && !c.waiting);
    if (connecting.length) return "Connecting " + connecting.map((c) => cameraLabel(c.name, c.model)).join(" and ");
    if (!cameras.length && stillSearching()) return "Looking for cameras";
    return "";
  }

  function renderActivity() {
    const text = ongoingText();
    ui.logLast.innerHTML = '<span></span><span class="dots"></span>';
    ui.logLast.firstChild.textContent = text || activity.last;
    ui.logLast.lastChild.textContent = text ? DOTS[activity.step % DOTS.length] : "";
  }

  setInterval(() => {
    activity.step++;
    if (ongoingText() || ui.logLast.lastChild && ui.logLast.lastChild.textContent) renderActivity();
  }, 400);

  // Atividade: frases para a pessoa + detalhes técnicos (ocultos até marcar a opção)
  function log(text, kind, hint) {
    log.lastText = text; log.lastAt = Date.now();
    const li = document.createElement("li");
    if (kind) li.className = kind;
    const now = new Date();
    li.innerHTML = '<span class="log-time"></span><span class="log-mark"></span><span class="log-text"></span>';
    li.children[0].textContent = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
    li.children[2].textContent = text;
    if (hint) {
      const span = document.createElement("span");
      span.className = "log-hint";
      span.textContent = hint;
      li.children[2].appendChild(span);
    }
    const atBottom = ui.logList.scrollTop + ui.logList.clientHeight >= ui.logList.scrollHeight - 4;
    ui.logList.appendChild(li);
    if (atBottom) ui.logList.scrollTop = ui.logList.scrollHeight;
    if (kind !== "tech") {
      activity.last = text + (hint ? " " + hint : "");
      renderActivity();
    }
  }

  // Aviso no rodapé: fica 2,5 s e some devagar; com o ponteiro em cima, espera; X fecha na
  // hora. opts.kind: "undo" / "redo" mostra a seta correspondente.
  const TOAST_MS = 2500;
  function toast(text, ms, opts) {
    const t = ui.toast, o = opts || {};
    // Etiqueta mono (como as tags da lista): chip sólido "↶ UNDO" / "↷ REDO" + a mensagem contornada
    t.innerHTML = '<span class="toast-kind"><span class="toast-arrow" aria-hidden="true"></span><span class="toast-kind-text"></span></span>'
      + '<span class="toast-body"><span class="toast-text"></span><button class="toast-close" type="button" aria-label="Close">' + icon("close", 11) + '</button></span>';
    const body = o.kind ? text.replace(/^(Undo|Redo):\s*/, "") : text;
    t.querySelector(".toast-text").textContent = body;
    t.querySelector(".toast-arrow").textContent = o.kind === "undo" ? "↶" : o.kind === "redo" ? "↷" : "";
    // Sem undo/redo, o chip diz "Event" (renomear, atualização disponível, avisos…)
    t.querySelector(".toast-kind-text").textContent = o.kind === "undo" ? "Undo" : o.kind === "redo" ? "Redo" : o.warn ? "Warning" : "Event";
    t.classList.toggle("with-arrow", !!o.kind);
    t.classList.toggle("kind-event", !o.kind);
    t.classList.toggle("kind-warn", !!o.warn);  // amarelo: validação, "espere as câmeras"…
    t.classList.toggle("kind-undo", o.kind === "undo");
    t.classList.toggle("kind-redo", o.kind === "redo");
    t.querySelector(".toast-close").addEventListener("click", hideToast);
    t.classList.remove("hidden", "fading");
    toast.dwell = ms || TOAST_MS;
    armToast();
    // Tudo que o app avisa fica também na Activity (sem repetir quando quem chamou já registrou);
    // opts.silent: só o aviso (ex.: "Nothing to undo" não é um acontecimento)
    if (!o.silent && !(log.lastText === text && Date.now() - (log.lastAt || 0) < 1500))
      log(text, o.kind ? "ok" : (ms && ms >= 8000 ? "error" : ""));
  }
  function armToast() {
    clearTimeout(toast.timer); clearTimeout(toast.fadeTimer);
    toast.timer = setTimeout(() => {
      ui.toast.classList.add("fading");
      toast.fadeTimer = setTimeout(hideToast, 1500);
    }, toast.dwell || TOAST_MS);
  }
  function hideToast() {
    clearTimeout(toast.timer); clearTimeout(toast.fadeTimer);
    ui.toast.classList.add("hidden");
    ui.toast.classList.remove("fading");
  }
  ui.toast.addEventListener("mouseenter", () => { clearTimeout(toast.timer); clearTimeout(toast.fadeTimer); ui.toast.classList.remove("fading"); });
  ui.toast.addEventListener("mouseleave", () => { if (!ui.toast.classList.contains("hidden")) armToast(); });

  // Listas com linhas (janela Project, Switch project…): o Tab entra numa linha só; ↑ ↓ vão para o
  // mesmo controle na linha de cima/de baixo
  const ROVING = [];
  function makeRoving(cfg) {
    cfg.cur = "";
    cfg.controls = cfg.controls || ((row) => [...row.querySelectorAll("input, button, select, textarea")]);
    const live = (row) => cfg.controls(row).filter((x) => !x.disabled);
    const rows = () => { const r = cfg.root(); return r ? cfg.rows(r).filter((row) => live(row).length) : []; };
    cfg.where = (node) => {
      const r = cfg.root();
      if (!node || !r || !r.contains(node)) return null;
      const row = rows().find((x) => x === node || x.contains(node));
      return row ? { id: cfg.id(row), i: cfg.controls(row).indexOf(node) } : null;
    };
    cfg.apply = () => {
      const all = rows();
      const tabRow = all.find((x) => cfg.id(x) === cfg.cur) || all[0];
      all.forEach((x) => cfg.controls(x).forEach((c) => { c.tabIndex = x === tabRow ? 0 : -1; }));
    };
    cfg.focusAt = (id, i) => {
      const row = rows().find((x) => cfg.id(x) === id);
      if (!row) return false;
      const list = cfg.controls(row), ok = live(row);
      let t = list[i] && !list[i].disabled ? list[i] : ok.reduce((b, c) => Math.abs(list.indexOf(c) - i) < Math.abs(list.indexOf(b) - i) ? c : b, ok[0]);
      cfg.cur = id; cfg.apply();
      t.focus();
      t.scrollIntoView({ block: "nearest" });
      return true;
    };
    cfg.move = (pos, step) => {
      const all = rows();
      for (let k = all.findIndex((x) => cfg.id(x) === pos.id) + step; k >= 0 && k < all.length; k += step)
        if (cfg.focusAt(cfg.id(all[k]), pos.i)) { if (cfg.onMove) cfg.onMove(cfg.id(all[k]), pos.i); return; }
    };
    ROVING.push(cfg);
    return cfg;
  }
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || selectMenu || openMenu || document.querySelector("body > .suggest")) return;
    for (const cfg of ROVING) {
      const pos = cfg.where(document.activeElement);
      if (!pos) continue;
      e.preventDefault(); e.stopImmediatePropagation();
      cfg.move(pos, e.key === "ArrowDown" ? 1 : -1);
      return;
    }
  }, true);
  document.addEventListener("focusin", (e) => {
    for (const cfg of ROVING) { const pos = cfg.where(e.target); if (pos && pos.id !== cfg.cur) { cfg.cur = pos.id; cfg.apply(); } }
  });
  // ---- Desfazer / refazer (Ctrl+Z, Ctrl+Shift+Z; no Mac também com Cmd) ----
  // Cada ação registrada tem um texto e as duas funções (podem devolver uma Promise; false = não deu).
  const history = { undo: [], redo: [] };
  function recordAction(action) {
    if (action.camera) ratioWarned = {};  // câmeras mudaram: o aviso "Mixed ratios" pode aparecer de novo
    history.undo.push(action);
    if (history.undo.length > 50) history.undo.shift();
    history.redo.length = 0;
  }
  // Mudanças de câmera são enfileiradas e aplicadas uma a uma; desfazer/refazer em cima de uma
  // mudança ainda em curso espera ela terminar (senão a câmera recebe ordens cruzadas)
  function camerasBusyFor(a) {
    if (!a || !a.camera || typeof csPending === "undefined" || !csPending.size) return false;
    toast("The cameras are still applying the previous change. Try again in a moment.", TOAST_MS, { silent: true, warn: true });
    return true;
  }
  function doUndo() {
    const a = history.undo[history.undo.length - 1];
    if (camerasBusyFor(a)) return;
    history.undo.pop();
    if (!a) { toast("Nothing to undo", TOAST_MS, { silent: true }); return; }
    if (a.camera) ratioWarned = {};
    Promise.resolve(a.undo()).then((ok) => {
      if (ok === false) return;
      history.redo.push(a);
      toast("Undo: " + a.label, TOAST_MS, { kind: "undo" });  // (a Activity recebe a mesma linha)
    });
  }
  function doRedo() {
    const a = history.redo[history.redo.length - 1];
    if (camerasBusyFor(a)) return;
    history.redo.pop();
    if (!a) { toast("Nothing to redo", TOAST_MS, { silent: true }); return; }
    if (a.camera) ratioWarned = {};
    Promise.resolve(a.redo()).then((ok) => {
      if (ok === false) return;
      history.undo.push(a);
      toast("Redo: " + a.label, TOAST_MS, { kind: "redo" });
    });
  }
  // Cmd+` (Mac): próxima janela do app (principal ↔ Live); com Shift, a anterior. Pela tecla física
  // (e.code), para funcionar também nos teclados em que o ` é tecla de acento
  document.addEventListener("keydown", (e) => {
    if (!e.metaKey || e.ctrlKey || e.altKey || e.code !== "Backquote" || typeof window.cycleWindows !== "function") return;
    e.preventDefault(); e.stopImmediatePropagation();
    window.cycleWindows(e.shiftKey ? "1" : "0");
  }, true);
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== "z" && e.key !== "Z" && e.key !== "y")) return;
    // Uma confirmação ou um aviso aberto: nada é desfeito até a janela sumir (decisão do dono, 2026-11-04)
    if (!ui.dialogOverlay.classList.contains("hidden")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const tag = e.target.tagName;
    // Dentro de um campo de texto, o desfazer é o do texto (caixas de marcar e botões não)
    if (tag === "TEXTAREA" || (tag === "INPUT" && !["checkbox", "radio", "button", "range"].includes(e.target.type))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // Janela de digitar um nome aberta (fora do campo): também não desfaz nada do app
    if (!$("promptOverlay").classList.contains("hidden")) return;
    // Janela Match automatically (passos 1 e 3): desfaz as escolhas feitas nela (caixas e valores)
    if (typeof csMatchHistoryActive === "function" && csMatchHistoryActive()) { if (e.key === "y" || e.shiftKey) csMatchRedo(); else csMatchUndo(); return; }
    if (e.key === "y" || e.shiftKey) doRedo(); else doUndo();
  }, true);

  function dialog(title, text, actions, extra) {
    ui.dialogTitle.textContent = title;
    ui.dialogText.textContent = text;
    ui.dialogActions.innerHTML = "";
    // Conteúdo extra abaixo do texto (ex.: as outras proporções no aviso "Mixed ratios")
    const oldExtra = ui.dialogText.parentElement.querySelector(".dialog-extra");
    if (oldExtra) oldExtra.remove();
    if (extra) { extra.classList.add("dialog-extra"); ui.dialogText.after(extra); }
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.danger ? "btn-danger" : a.primary ? "btn-primary" : a.link ? "btn-link" : "btn-secondary") + (a.left ? " btn-left" : "");
      b.textContent = a.label;
      b.addEventListener("click", () => { if (!a.keep) ui.dialogOverlay.classList.add("hidden"); a.onClick && a.onClick(); });
      ui.dialogActions.appendChild(b);
    });
    ui.dialogOverlay.classList.remove("hidden");
  }

  function sessionLabel(name) {
    // "2026-10-10_18-46-12_AB12_session_01" -> { date: "Oct 10, 18:46:12", detail: "Session 1" }
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_[A-Z0-9]+_session_(\d+))?/.exec(name);
    if (!m) return { date: name, time: "", detail: "" };
    const date = new Date(+m[1], +m[2] - 1, +m[3]);
    return {
      date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + m[4] + ":" + m[5] + ":" + m[6],  // com segundos: sessões no mesmo minuto
      time: m[4] + ":" + m[5] + ":" + m[6],
      detail: m[7] ? "Session " + (+m[7]) : "",
    };
  }

  function intValue(input, min, fallback) {
    const n = parseInt(input.value, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  }

  // Campos do disparo: só números inteiros, até 999 (o Mac deixava digitar letras).
  // Vazio ou abaixo do mínimo volta ao padrão ao sair do campo; setas ↑ ↓ somam 1.
  [[ui.countdown, 0, 0], [ui.sessions, 1, 1], [ui.downloadWait, 1, 10]].forEach(([input, min, fallback]) => {
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "").slice(0, 3);
      if (digits !== input.value) input.value = digits;
    });
    input.addEventListener("blur", () => { input.value = String(intValue(input, min, fallback)); });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const value = intValue(input, min, min) + (e.key === "ArrowUp" ? 1 : -1);
      input.value = String(Math.min(999, Math.max(min, value)));
    });
  });

  function photo(loader, store, session, file, size) {
    const key = store + "/" + session + "/" + file + "/" + size;
    if (!photoCache[key]) photoCache[key] = Promise.resolve(loader(session, file, size));
    return photoCache[key];
  }
  const sessionPhoto = (s, f, size) => photo(window.getPhoto, "sessions", s, f, size);
  const orderPhoto = (s, f, size) => photo(window.getOrderPhoto, "order", s, f, size);

  // =================== Galeria: carrossel + foto grande ===================
  // Usada nas sessões e no "Reorder by photo". Com draggable, as miniaturas podem
  // ser arrastadas para mudar a ordem.
  // Triângulo de alerta (proporção da foto diferente da informada)
  const ALERT_SVG = "<svg width='14' height='14' viewBox='0 0 16 16' aria-hidden='true'><path d='M8 1.5 15 14H1z' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linejoin='round'/><path d='M8 6v4' stroke='currentColor' stroke-width='1.6' stroke-linecap='round'/><circle cx='8' cy='12' r='.9' fill='currentColor'/></svg>";
  // Texto da explicação do alerta de proporção (o mesmo na célula Ratio e na miniatura)
  function ratioWhy(ratio) {
    return "The last test shot from this camera came out " + ratio.shot + ", but the camera reports " + ratio.reported + ". The app sets what the camera accepts over USB; a setting in the camera menu may still change the shape of the photo. Check the aspect ratio in the camera menu, then take a new test shot.";
  }
  function Gallery(root, opts) {
    root.innerHTML =
      '<div class="gallery-head"><div><div class="gallery-title"></div><div class="gallery-sub"></div></div><div class="gallery-actions"></div></div>' +
      '<div class="carousel-wrap"><ol class="carousel"></ol><div class="drop-marker hidden"></div></div>' +
      '<div class="stage"><img alt=""><div class="stage-caption hidden"></div><div class="stage-message hidden"></div><div class="stage-tools"></div></div>';
    let draggable = !!opts.draggable;
    root.classList.toggle("draggable", draggable);

    const el = {
      title: root.querySelector(".gallery-title"), sub: root.querySelector(".gallery-sub"),
      actions: root.querySelector(".gallery-actions"), carousel: root.querySelector(".carousel"),
      wrap: root.querySelector(".carousel-wrap"), marker: root.querySelector(".drop-marker"),
      img: root.querySelector(".stage img"), caption: root.querySelector(".stage-caption"),
      message: root.querySelector(".stage-message"),
    };
    let items = [];
    let index = 0;
    let drag = null;
    // Várias fotos (Shift+← → ou Shift+clique): um intervalo a partir da âncora
    let multi = new Set(), anchor = 0;

    function badge(item, i) {
      return pad(draggable ? i + 1 : item.order || i + 1);
    }

    function render() {
      el.carousel.innerHTML = "";
      items.forEach((item, i) => el.carousel.appendChild(frame(item, i)));
      markSelected(false);
    }

    function frame(item, i) {
      const li = document.createElement("li");
      li.className = "frame";
      // Miniatura só com o número; o nome da câmera aparece na foto grande
      li.innerHTML = '<div class="frame-img"><span class="frame-badge"></span></div>';
      li.querySelector(".frame-badge").textContent = badge(item, i);
      li.title = item.title + (item.subtitle ? " · " + item.subtitle : "");
      const img = li.querySelector(".frame-img");
      if (item.file && item.previewable) {
        opts.load(item, 320).then((url) => {
          if (!url) return;
          img.style.backgroundImage = "url(" + url + ")";
          // Miniatura com a proporção da foto (foto inteira, em pé ou deitada)
          if (opts.fitThumbs) {
            const probe = new Image();
            probe.onload = () => {
              img.style.setProperty("--ar", probe.naturalWidth + " / " + probe.naturalHeight);
            };
            probe.src = url;
          }
        });
      } else {
        // Sem prévia: mostra o tipo do arquivo (ex.: "TIF"), ou nada se a câmera não mandou foto
        img.appendChild(document.createTextNode(item.file ? item.file.split(".").pop().toUpperCase() : ""));
      }
      appBadge(li, item);

      // Clique: Shift marca o intervalo, Cmd/Ctrl marca ou desmarca uma; segurar e arrastar muda a ordem
      // (todas as marcadas vão juntas)
      // Vale a tecla apertada ao pressionar o botão do mouse (soltar o Cmd/Shift antes não muda o clique)
      li.addEventListener("pointerdown", (e) => { downMods = { li, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }; if (e.shiftKey || e.metaKey || e.ctrlKey) e.preventDefault(); });
      li.addEventListener("click", (ev) => {
        const e = downMods && downMods.li === li ? downMods : ev;
        downMods = null;
        if (suppressClick) { suppressClick = false; return; }  // o clique que fecha um arraste não seleciona
        const many = opts.multi || draggable;
        if (e.shiftKey && many) extendTo(i);
        else if ((e.metaKey || e.ctrlKey) && many) toggleAt(i);
        else select(i);
        if (opts.onPick) opts.onPick();
      });
      if (draggable || opts.freeDrag) li.addEventListener("pointerdown", (e) => onFreeDown(e, li, i));
      if (opts.onContext) li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        // Clique numa das fotos marcadas: o menu age em todas (a marcação fica)
        if (multi.size > 1 && multi.has(i)) { index = i; markSelected(false); showLarge(); } else select(i);
        opts.onContext(e);
      });
      return li;
    }

    // Canto de baixo à direita da miniatura: as etiquetas ficam lado a lado ("LR" à direita da proporção)
    function frameCorner(li) {
      const img = li.querySelector(".frame-img");
      let c = img.querySelector(".frame-corner");
      if (!c) { c = document.createElement("span"); c.className = "frame-corner"; img.appendChild(c); }
      return c;
    }
    // Etapa 20: "LR" / "PS" no canto da miniatura enquanto a foto está no Lightroom Classic ou no Photoshop
    function appBadge(li, item) {
      if (!opts.appBadge) return;
      const img = li.querySelector(".frame-img");
      const old = img.querySelector(".frame-app");
      const v = item ? opts.appBadge(item) : "";
      if (!v) { if (old) old.remove(); return; }
      const b = old || document.createElement("span");
      b.className = "frame-app";
      b.textContent = v;
      b.title = v === "PS" ? "Open in Photoshop" : "In Lightroom Classic";
      if (!old) frameCorner(li).appendChild(b);  // à direita da etiqueta da proporção
    }
    function markSelected(scroll) {
      [...el.carousel.children].forEach((li, i) => {
        li.classList.toggle("selected", i === index); li.classList.toggle("multi", multi.size > 1 && multi.has(i));
        // Foto que saiu numa proporção diferente da informada: a seleção fica âmbar tracejada (a etiqueta continua só o número)
        if (opts.warnItem) {
          const warn = !!opts.warnItem(items[i]);
          li.classList.toggle("ratio-warn", warn);
          // Ícone de alerta no canto da miniatura, com a explicação instantânea (data-itip)
          let a = li.querySelector(".frame-alert");
          if (warn && !a) {
            a = document.createElement("span");
            a.className = "frame-alert";
            a.innerHTML = ALERT_SVG;
            a.tabIndex = 0;
            a.setAttribute("role", "img");
            li.querySelector(".frame-img").appendChild(a);
          }
          if (warn) { const why = opts.warnTip ? opts.warnTip(items[i]) : ""; a.dataset.itip = why; a.setAttribute("aria-label", why); }
          else if (a) a.remove();
          // Etiqueta de texto no canto (ex.: "16:9" na sessão com proporções misturadas)
          const text = warn && opts.warnLabel ? opts.warnLabel(items[i]) : "";
          let lab = li.querySelector(".frame-ratio");
          if (text && !lab) { lab = document.createElement("span"); lab.className = "frame-ratio"; frameCorner(li).prepend(lab); }
          if (text) lab.textContent = text; else if (lab) lab.remove();
          if (a && text) a.remove();  // a etiqueta substitui o ícone
        }
      });
      const active = el.carousel.children[index];
      if (scroll && active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    function message(text) {
      el.message.textContent = text;
      el.message.classList.toggle("hidden", !text);
    }

    function showLarge() {
      const item = items[index];
      if (!item) {
        el.img.removeAttribute("src");
        el.caption.classList.add("hidden");
        return;
      }
      el.caption.innerHTML = "<b></b><span></span><span class=\"caption-file\"></span>";
      el.caption.children[0].textContent = badge(item, index);
      el.caption.children[1].textContent = item.title + (item.subtitle ? " · " + item.subtitle : "");
      // Nome do(s) arquivo(s) com a extensão (RAW e JPEG da mesma câmera aparecem juntos)
      const files = item.files ? item.files.map((f) => f.file) : item.file ? [item.file] : [];
      el.caption.children[2].textContent = files.join("  +  ");
      el.caption.children[2].classList.toggle("hidden", !files.length);
      el.caption.classList.remove("hidden");

      if (!item.file) { el.img.removeAttribute("src"); return message("This camera did not send a photo."); }
      if (!item.previewable) { el.img.removeAttribute("src"); return message("No preview for this file type (" + item.file + ")."); }
      message(el.img.getAttribute("src") ? "" : "Loading");
      const wanted = item;
      opts.load(item, 1600).then((url) => {
        if (items[index] !== wanted) return;
        if (url) { el.img.src = url; message(""); }
        else { el.img.removeAttribute("src"); message("Could not open " + item.file + "."); }
      });
      // Pré-carrega as próximas para a reprodução ficar fluida
      for (let k = 1; k <= 2 && items.length > 1; k++) {
        const next = items[(index + k) % items.length];
        if (next.file && next.previewable) opts.load(next, 1600);
      }
    }

    if (opts.onContext) root.querySelector(".stage img").addEventListener("contextmenu", (e) => { if (items[index]) { e.preventDefault(); opts.onContext(e); } });
    function select(i, scroll) {
      if (!items.length) return;
      index = (i + items.length) % items.length;
      multi = new Set(); anchor = index;
      markSelected(scroll !== false);  // (o play passa false: marca a miniatura sem rolar a fileira)
      showLarge();
    }
    function extendTo(i) {
      if (!items.length) return;
      if (!multi.size) { multi = new Set([index]); anchor = index; }
      index = Math.max(0, Math.min(items.length - 1, i));  // sem dar a volta
      multi = new Set();
      for (let k = Math.min(anchor, index); k <= Math.max(anchor, index); k++) multi.add(k);
      markSelected(true);
      showLarge();
    }

    // ----- Arrastar para reordenar -----
    function others() {
      return [...el.carousel.children].filter((li) => !li.classList.contains("dragging"));
    }

    function insertionIndex(x) {
      return others().filter((li) => {
        const r = li.getBoundingClientRect();
        return r.left + r.width / 2 < x;
      }).length;
    }

    function showMarker(target) {
      const list = others();
      const wrapRect = el.wrap.getBoundingClientRect();
      let x;
      if (!list.length) x = 0;
      else if (target < list.length) x = list[target].getBoundingClientRect().left - 5;
      else x = list[list.length - 1].getBoundingClientRect().right + 5;
      el.marker.style.left = (x - wrapRect.left) + "px";
      el.marker.classList.remove("hidden");
    }

    function move(from, to, free, dropRect) { moveMany([from], to, free, dropRect); }
    // Leva as fotos das posições "picks" (em ordem) para a vaga "slot" entre as que ficam
    function moveMany(picks, slot, free, dropRect) {
      picks = picks.filter((k) => k >= 0 && k < items.length).sort((a, b) => a - b);
      const picked = picks.map((k) => items[k]);
      const rest = items.filter((_, k) => !picks.includes(k));
      slot = Math.max(0, Math.min(rest.length, slot));
      const next = rest.slice(0, slot).concat(picked, rest.slice(slot));
      if (!picked.length || next.every((it, k) => it === items[k])) { if (picks.length === 1) select(picks[0]); return; }
      // Onde cada miniatura estava: depois de redesenhar, as que mudaram de lugar deslizam até o novo
      // (como nas câmeras); a arrastada sai de onde foi solta
      const was = rectsBy((it) => it);
      if (dropRect) picked.forEach((it) => was.set(it, dropRect));
      const before = items.slice();
      items = next;
      index = slot;
      if (picked.length > 1) { multi = new Set(picked.map((_, k) => slot + k)); anchor = slot; } else { multi = new Set(); anchor = index; }
      // Arraste fora do modo Reorder: a ordem nova vale na hora (os números das miniaturas também)
      if (free) items.forEach((it, k) => { it.order = k + 1; });
      render();
      slideFrom(was, (it) => it);
      showLarge();
      markSelected(true);
      if (free) { if (opts.onFreeReorder) opts.onFreeReorder(items); }
      else if (opts.onReorder) opts.onReorder(items, before);
    }
    // Posição de cada miniatura na tela, pela chave do item
    function rectsBy(key) {
      const m = new Map();
      [...el.carousel.children].forEach((li, k) => { if (items[k]) m.set(key(items[k]), li.getBoundingClientRect()); });
      return m;
    }
    // Depois de redesenhar: cada miniatura que mudou de lugar desliza da posição antiga até a nova
    function slideFrom(was, key) {
      [...el.carousel.children].forEach((li, k) => {
        const r0 = items[k] && was.get(key(items[k]));
        if (!r0 || !li.animate) return;
        const r1 = li.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) li.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
      });
    }
    // Troca os itens por outros com as mesmas chaves (ex.: os mesmos arquivos depois de renomeados):
    // na mesma ordem, nada se redesenha; em outra ordem, as miniaturas deslizam até o lugar novo.
    // Devolve false quando as chaves não batem (quem chamou redesenha do jeito normal)
    function morph(list, key) {
      const a = items.map(key), b = list.map(key);
      if (a.length !== b.length || a.slice().sort().join("|") !== b.slice().sort().join("|")) return false;
      const cur = key(items[index]), marked = new Set([...multi].map((k) => key(items[k])));
      if (a.join("|") === b.join("|")) { items = list.slice(); return true; }
      const was = rectsBy(key);
      items = list.slice();
      index = Math.max(0, b.indexOf(cur));
      multi = new Set(b.map((k, i) => (marked.has(k) ? i : -1)).filter((i) => i >= 0));
      if (multi.size < 2) multi = new Set();
      anchor = index;
      render();
      slideFrom(was, key);
      showLarge();
      return true;
    }
    // Setas do modo Reorder: a foto (ou o grupo marcado) anda uma casa
    function moveSelected(delta) {
      const picks = multi.size > 1 ? [...multi].sort((a, b) => a - b) : [index];
      const before = picks[0];  // quantas das que ficam estão antes do grupo
      moveMany(picks, before + delta, false);
    }
    function toggleAt(i) {
      if (!items.length) return;
      if (!multi.size) multi = new Set([index]);
      if (multi.has(i) && multi.size > 1) { multi.delete(i); index = Math.min(...multi); }
      else { multi.add(i); index = i; }
      anchor = i;
      markSelected(true);
      showLarge();
    }

    // ----- Arrastar sem o modo Reorder: para o lado (muda a ordem) ou para um alvo de fora (a lixeira) -----
    // Uma cópia da miniatura segue o ponteiro; com várias marcadas, vão todas (só para o alvo de fora)
    let free = null, suppressClick = false, downMods = null;
    function onFreeDown(e, li, i) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || (!draggable && opts.canDrag && !opts.canDrag())) return;
      if (free) endFree(true);
      const picks = multi.size > 1 && multi.has(i) ? [...multi].sort((a, b) => a - b) : [i];
      free = { li, i, picks, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null, slot: null };
      li.setPointerCapture(e.pointerId);
      li.onpointermove = onFreeMove;
      li.onpointerup = () => endFree(false);
      li.onpointercancel = () => endFree(true);
      li.onlostpointercapture = () => { if (free && free.li === li && !free.ending) endFree(true); };
    }
    function onFreeMove(e) {
      const d = free;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (!d.moved) {
        d.moved = true;
        const frames = [...el.carousel.children];
        d.nodes = d.picks.map((k) => frames[k]).filter(Boolean);
        d.nodes.forEach((n) => n.classList.add("dragging"));
        const r = d.li.getBoundingClientRect();
        d.ghost = d.li.cloneNode(true);
        d.ghost.className = "frame frame-ghost" + (d.picks.length > 1 ? " stack" : "");
        Object.assign(d.ghost.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
        if (d.picks.length > 1) d.ghost.appendChild(Object.assign(document.createElement("span"), { className: "frame-ghost-count", textContent: d.picks.length + " photos" }));
        document.body.appendChild(d.ghost);
        document.body.classList.add("photo-drag");
        if (opts.onDragStart && !draggable) opts.onDragStart();
      }
      d.ghost.style.transform = "translate(" + dx + "px," + dy + "px)";
      // No modo Reorder só muda a ordem (a lixeira não recebe)
      const t = opts.dropTarget && !draggable ? opts.dropTarget(e.clientX, e.clientY) : null;
      if (d.over !== t) {
        if (d.over) d.over.classList.remove("drop-ok");
        if (t) t.classList.add("drop-ok");
        d.over = t;
      }
      // Mudar a ordem: fotos de câmera, com o ponteiro na altura das miniaturas (no modo Reorder, em qualquer altura)
      const cr = el.carousel.getBoundingClientRect();
      const movable = d.picks.every((k) => items[k] && items[k].movable !== false);
      if (!t && movable && (draggable || (e.clientY > cr.top - 50 && e.clientY < cr.bottom + 50))) {
        if (e.clientX < cr.left + 40) el.carousel.scrollLeft -= 12;
        if (e.clientX > cr.right - 40) el.carousel.scrollLeft += 12;
        d.slot = insertionIndex(e.clientX);
        showMarker(d.slot);
      } else {
        d.slot = null;
        el.marker.classList.add("hidden");
      }
    }
    function endFree(cancel) {
      const d = free;
      if (!d) return;
      d.ending = true;
      free = null;
      d.li.onpointermove = d.li.onpointerup = d.li.onpointercancel = d.li.onlostpointercapture = null;
      if (d.nodes) d.nodes.forEach((n) => n.classList.remove("dragging"));
      const ghostRect = d.ghost ? d.ghost.getBoundingClientRect() : null;
      if (d.ghost) d.ghost.remove();
      if (d.over) d.over.classList.remove("drop-ok");
      el.marker.classList.add("hidden");
      document.body.classList.remove("photo-drag");
      if (opts.onDragEnd) opts.onDragEnd();
      if (!d.moved) return;  // clique: quem trata é o "click"
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (cancel) return;
      if (d.over && opts.onDropOut) { opts.onDropOut(d.over, d.picks); return; }
      if (d.slot !== null) moveMany(d.picks, d.slot, !draggable, ghostRect);
    }

    return {
      setDraggable(value) {
        draggable = !!value;
        root.classList.toggle("draggable", draggable);
        render();
      },
      setHead(title, sub, tag) { el.title.textContent = title || ""; if (tag) el.title.appendChild(tag); el.sub.textContent = sub || ""; },
      refreshMarks() { markSelected(false); },  // (a proporção medida chegou depois das fotos)
      refreshBadges() { [...el.carousel.children].forEach((li, i) => appBadge(li, items[i])); },
      setActions(nodes) { el.actions.innerHTML = ""; nodes.forEach((n) => el.actions.appendChild(n)); },
      // Botões sobre a foto grande (canto superior direito)
      setStageTools(nodes) {
        const tools = root.querySelector(".stage-tools");
        tools.innerHTML = "";
        nodes.forEach((n) => tools.appendChild(n));
      },
      setItems(list, selectIndex) {
        items = list.slice();
        multi = new Set();
        index = Math.min(selectIndex || 0, Math.max(0, items.length - 1));
        el.img.removeAttribute("src");
        render();
        // Outra sessão (começa da primeira foto): a fileira volta ao início, mesmo que a anterior tivesse sido rolada
        if (!selectIndex) el.carousel.scrollTo({ left: 0, behavior: "instant" });
        showLarge();
        if (!items.length) message("");
      },
      message,
      select,
      next(scroll) { select(index + 1, scroll); },
      prev(scroll) { select(index - 1, scroll); },
      extendTo,
      get selection() { return multi.size > 1 ? [...multi].sort((a, b) => a - b) : [index]; },
      get dragging() { return !!free; },
      moveSelected,
      morph,
      // Volta a uma ordem anterior dos mesmos itens (Desfazer no Reorder by photo), deslizando
      setOrder(list) { return morph(list, (it) => it.name || it.group || it.file); },
      get items() { return items; },
      get index() { return index; },
    };
  }

  function button(label, onClick, opts) {
    const b = document.createElement("button");
    const o = opts || {};
    b.className = "btn btn-small " + (o.kind || "btn-secondary") + (o.icon && !label ? " btn-icon" : "");
    b.innerHTML = o.icon ? icon(o.icon) : "";
    if (label) b.appendChild(document.createTextNode(label));
    if (o.title) { b.title = o.title; b.setAttribute("aria-label", o.title); }
    b.addEventListener("click", onClick);
    return b;
  }

  // =================== Câmeras (tempo real) ===================
  function placedCameras() {
    return cameras.filter((c) => c.order > 0);
  }

  // ---- Teclado na lista de câmeras (a mesma lógica do Camera settings) ----
  // O Tab passa só pelos botões de uma linha (a última usada, ou a primeira); ↑ ↓ vão para o mesmo
  // botão na câmera de cima/de baixo.
  let camTabRow = "";
  const camBtnKey = (b) => b.title || b.getAttribute("aria-label") || b.textContent.trim();
  function camRowButtons(li) { return [...li.querySelectorAll(".camera-actions button")]; }
  function camKeyOf(node) {
    const li = node && node.closest && node.closest("#" + ui.cameraList.id + " li[data-name]");
    if (!li || node.tagName !== "BUTTON") return null;
    return { name: li.dataset.name, key: camBtnKey(node), index: camRowButtons(li).indexOf(node) };
  }
  function camRows() { return [...ui.cameraList.querySelectorAll("li[data-name]")].filter((li) => camRowButtons(li).length); }
  function camRoving() {
    const rows = camRows();
    const row = rows.find((li) => li.dataset.name === camTabRow) || rows[0];
    rows.forEach((li) => camRowButtons(li).forEach((b) => { b.tabIndex = li === row ? 0 : -1; }));
  }
  function camFocus(name, key, index) {
    const li = camRows().find((x) => x.dataset.name === name);
    if (!li) return false;
    const list = camRowButtons(li), live = list.filter((b) => !b.disabled);
    if (!live.length) return false;
    // O mesmo botão; se estiver desligado (ex.: Move up na primeira), o mais próximo
    let t = list.find((b) => camBtnKey(b) === key && !b.disabled);
    if (!t) t = live.reduce((best, b) => Math.abs(list.indexOf(b) - index) < Math.abs(list.indexOf(best) - index) ? b : best, live[0]);
    camTabRow = name;
    camRoving();
    t.focus({ preventScroll: false });
    return true;
  }
  document.addEventListener("focusin", (e) => {
    const k = camKeyOf(e.target);
    if (k && k.name !== camTabRow) { camTabRow = k.name; camRoving(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const k = camKeyOf(document.activeElement);
    if (!k) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const rows = camRows();
    const step = e.key === "ArrowDown" ? 1 : -1;
    for (let i = rows.findIndex((li) => li.dataset.name === k.name) + step; i >= 0 && i < rows.length; i += step)
      if (camFocus(rows[i].dataset.name, k.key, k.index)) return;
  }, true);

  function renderCameras() {
    if (typeof renderTiming === "function") setTimeout(renderTiming, 0);
    // Onde cada linha estava: depois de redesenhar, as que mudaram de lugar deslizam até o novo
    const was = {};
    ui.cameraList.querySelectorAll("li[data-name]").forEach((li) => { if (li.dataset.name) was[li.dataset.name] = li.getBoundingClientRect().top; });
    // Foco do teclado numa linha: volta para o mesmo botão da mesma câmera depois de redesenhar
    const focusWas = camKeyOf(document.activeElement);
    ui.cameraList.innerHTML = "";
    const placed = placedCameras();
    const empty = cameras.length === 0;
    ui.searching.classList.toggle("hidden", !empty || !stillSearching());
    ui.noCameras.classList.toggle("hidden", !empty || stillSearching());

    placed.forEach((cam, index) => ui.cameraList.appendChild(cameraRow(cam, index, placed.length)));
    cameras.filter((c) => c.order === 0).forEach((cam) => ui.cameraList.appendChild(cameraRow(cam, -1, placed.length)));
    camRoving();
    if (focusWas) camFocus(focusWas.name, focusWas.key, focusWas.index);
    $("cameraCount").textContent = cameras.length;
    $("cameraCount").classList.toggle("hidden", cameras.length === 0);
    fitCameraList();
    ui.cameraList.querySelectorAll("li[data-name]").forEach((li) => {
      const top = was[li.dataset.name];
      if (top === undefined || !li.animate) return;
      const d = top - li.getBoundingClientRect().top;
      if (Math.abs(d) > 1) li.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    });
    updateButtons();
  }

  // Lista que rola: espaço entre a barra de rolagem e as câmeras
  function fitCameraList() {
    const list = ui.cameraList;
    list.classList.toggle("scrolling", list.scrollHeight > list.clientHeight + 1);
  }
  if (window.ResizeObserver) new ResizeObserver(() => fitCameraList()).observe(ui.cameraList);
  function cameraRow(cam, index, placedCount) {
    const state = cam.state || (cam.connected ? "connected" : "disconnected");

    const li = document.createElement("li");
    li.className = "camera is-" + state;

    const order = document.createElement("div");
    order.className = "camera-order";
    order.textContent = cam.order ? pad(cam.order) : "";

    const info = document.createElement("div");
    info.style.minWidth = "0";
    const model = document.createElement("div");
    model.className = "camera-model";
    model.innerHTML = '<span class="dot dot-' + state + '"></span>';
    model.appendChild(document.createTextNode(cam.model || cam.name));
    const meta = document.createElement("div");
    meta.className = "camera-meta";
    const stateText =
      state === "connected" ? "Ready"
      : state === "stuck" ? "Not responding. Turn it off and on"
      : state === "connecting" && cam.waiting ? "Waiting for another camera"
      : state === "connecting" ? "Connecting" + (cam.seconds >= 2 ? ", " + cam.seconds + " s" : "")
      : "Disconnected, turn it on to reconnect";
    // Câmera que o USB já mostra e o SDK ainda não: ainda sem nome (T7_1...)
    meta.innerHTML = (cam.name ? '<span></span> · ' : "") + '<span class="state-' + state + '"></span>';
    if (cam.name) meta.firstChild.textContent = cam.name;
    meta.lastChild.textContent = stateText;
    info.append(model, meta);

    if (!cam.compatible) {
      const warn = document.createElement("div");
      warn.className = "camera-warning";
      warn.textContent = "Not on Canon's compatibility list. It may not work correctly.";
      info.appendChild(warn);
    }
    // Configurações: diferente das outras, ou só dá para ajustar na câmera
    const tag = state === "connected" ? cameraSettingsTag(cam.name) : null;
    if (tag) {
      const t = document.createElement("div");
      t.innerHTML = '<span class="cs-tag ' + tag.cls + '"></span>';
      t.firstChild.textContent = tag.text;
      if (tag.title) t.firstChild.title = tag.title;
      info.appendChild(t);
    }

    const actions = document.createElement("div");
    actions.className = "camera-actions";
    if (index >= 0) {
      actions.append(
        smallButton(button("Identify", () => window.identify(cam.name), { title: "Half-press the shutter of this camera" }), state !== "connected", true),
        smallButton(button("", () => moveCamera(cam, -1), { icon: "up", title: "Move up" }), index === 0),
        smallButton(button("", () => moveCamera(cam, +1), { icon: "down", title: "Move down" }), index === placedCount - 1)
      );
    }

    li.append(order, info, actions);
    li.dataset.name = cam.name || "";
    // Arrastar para mudar a ordem (só as câmeras que já têm posição)
    if (index >= 0) {
      li.dataset.placed = "1";
      li.classList.toggle("can-drag", !busy);
      li.addEventListener("pointerdown", (e) => camPointerDown(e, li));
    }
    return li;
  }

  // ----- Arrastar câmeras para reordenar -----
  let camDrag = null;
  function placedRows() { return [...ui.cameraList.querySelectorAll("li.camera[data-placed='1']")]; }
  function camPointerDown(e, li) {
    if (e.button !== 0 || busy || e.target.closest("button")) return;
    e.preventDefault();  // sem seleção de texto pelo caminho do arraste
    camDrag = { li, y: e.clientY, moved: false, scroll: ui.cameraList.scrollTop };
    li.setPointerCapture(e.pointerId);
    li.onpointermove = camPointerMove;
    li.onpointerup = (ev) => camEndDrag(camDrag && camDrag.moved ? camInsertion(ev.clientY) : null);
    li.onpointercancel = () => camEndDrag(null);
  }
  function camInsertion(y) {
    return placedRows().filter((li) => {
      if (li === camDrag.li) return false;
      const r = li.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
  }
  function camPointerMove(e) {
    const d = camDrag;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    d.li.classList.add("dragging");
    // Rola a lista quando o arraste chega perto de cima ou de baixo
    const list = ui.cameraList, r = list.getBoundingClientRect();
    if (e.clientY < r.top + 30) list.scrollTop -= 10;
    if (e.clientY > r.bottom - 30) list.scrollTop += 10;
    d.li.style.transform = "translateY(" + (dy + list.scrollTop - d.scroll) + "px)";
    const others = placedRows().filter((li) => li !== d.li);
    const target = camInsertion(e.clientY);
    let marker = list.querySelector(".camera-drop");
    if (!marker) { marker = document.createElement("div"); marker.className = "camera-drop"; list.appendChild(marker); }
    const top = !others.length ? 0 : target < others.length ? others[target].offsetTop - 5
      : others[others.length - 1].offsetTop + others[others.length - 1].offsetHeight + 3;
    marker.style.top = top + "px";
  }
  function camEndDrag(target) {
    const d = camDrag;
    camDrag = null;
    if (!d) return;
    d.li.onpointermove = d.li.onpointerup = d.li.onpointercancel = null;
    d.li.classList.remove("dragging");
    d.li.style.transform = "";
    const marker = ui.cameraList.querySelector(".camera-drop");
    if (marker) marker.remove();
    if (target === null || busy) return;
    const names = placedRows().filter((li) => li !== d.li).map((li) => li.dataset.name);
    names.splice(target, 0, d.li.dataset.name);
    applyCameraOrder(names, "Camera order (dragged)");
  }

  // Ordem das câmeras com Desfazer: a ordem anterior volta com setOrder
  function cameraOrderNames() { return placedCameras().slice().sort((a, b) => a.order - b.order).map((c) => c.name); }
  function applyCameraOrder(names, what) {
    const before = cameraOrderNames();
    if (names.join("|") === before.join("|")) return;
    window.setOrder(...names);
    log(what || "Camera order changed", "ok");
    log("Camera order: " + names.map((n, i) => (i + 1) + " " + n).join(", "), "tech");
    recordAction({ label: what || "Camera order", undo: () => window.setOrder(...before), redo: () => window.setOrder(...names) });
  }
  function moveCamera(cam, delta) {
    const names = cameraOrderNames();
    const i = names.indexOf(cam.name), j = i + delta;
    if (i < 0 || j < 0 || j >= names.length) return;
    names.splice(i, 1); names.splice(j, 0, cam.name);
    applyCameraOrder(names, "Move " + cameraLabel(cam.name, cam.model) + (delta < 0 ? " up" : " down"));
  }

  function smallButton(b, locked, usesCamera) {
    b.dataset.locked = locked ? "1" : "0";
    b.dataset.sdk = usesCamera ? "1" : "0";
    // Já nasce no estado certo: a lista é redesenhada a cada segundo enquanto uma câmera conecta, e o
    // botão que usa a câmera (Identify) nascia ativo e era desativado logo depois (piscava)
    const sdkBusy = usesCamera && cameras.some((c) => c.state === "connecting" && !c.starting);
    b.disabled = busy || !!locked || sdkBusy;
    return b;
  }

  // Conexão que passa de 1 minuto (a T7 leva ~40 s): o SDK da Canon não deixa
  // cancelar, e o disparo fica bloqueado até ela terminar. Oferece reiniciar o app.
  const SLOW_CONNECT_SECONDS = 60;
  let testRestart = false;   // STILLPOINT_TEST_RESTART=1: botão "Restart app" sempre visível (teste)
  const slowWarned = new Set();
  function checkSlowConnections() {
    const slow = cameras.filter((c) => c.state === "connecting" && !c.starting && !c.waiting && c.seconds >= SLOW_CONNECT_SECONDS);
    ui.restartAppBtn.classList.toggle("hidden", slow.length === 0 && !testRestart);
    if (!slow.length) return;
    const names = slow.map((c) => cameraLabel(c.name, c.model));
    ui.shootNote.classList.remove("hidden");
    ui.shootNote.textContent = names.join(" and ") + (names.length === 1 ? " is" : " are") +
      " taking too long to connect. Turn " + (names.length === 1 ? "that camera" : "those cameras") +
      " off to shoot with the others, or restart the app. Photos that are not saved are kept.";
    const fresh = slow.filter((c) => !slowWarned.has(c.name));
    if (!fresh.length) return;
    fresh.forEach((c) => slowWarned.add(c.name));
    log(names.join(" and ") + " has been connecting for over a minute", "warn");
    if (ui.dialogOverlay.classList.contains("hidden") && $("exportOverlay").classList.contains("hidden") && $("progressOverlay").classList.contains("hidden"))
      dialog("A camera is taking too long to connect",
        names.join(" and ") + " has been connecting for over a minute. Shooting stays blocked until it finishes. " +
        "Turn " + (names.length === 1 ? "that camera" : "those cameras") + " off to shoot with the others right away, " +
        "or restart the app. Photos that are not saved are kept.", [
        { label: "Keep waiting" },
        { label: "Restart app", primary: true, onClick: restartApp },
      ]);
  }
  // Quando a conexão termina, avisa de novo se ela demorar outra vez
  function forgetFinishedSlow() {
    [...slowWarned].forEach((name) => {
      if (!cameras.some((c) => c.name === name && c.state === "connecting")) slowWarned.delete(name);
    });
  }
  function restartApp() {
    log("Restarting the app", "warn");
    Promise.resolve(window.restartApp()).then((r) => {
      if (r && r.ok === false) toast("Could not restart the app. Close it and open it again.", 8000);
    });
  }

  function updateButtons() {
    forgetFinishedSlow();
    const connected = cameras.filter((c) => c.connected).length;
    // Enquanto uma câmera conecta, o SDK da Canon não aceita outros comandos. Uma câmera
    // que só o USB mostra (ainda ligando) não ocupa o SDK: dá para disparar com as outras.
    const connectingNames = cameras.filter((c) => c.state === "connecting" && !c.starting).map((c) => cameraLabel(c.name, c.model));
    const sdkBusy = connectingNames.length > 0;

    // Reiniciar as conexões espera a conexão em andamento terminar: não durante uma
    ui.restartBtn.disabled = busy || sdkBusy;
    // Durante o bullet time, o botão de disparo vira "Cancel bullet time"
    const shooting = busy && busyAction === "shoot";
    ui.shootBtn.textContent = shooting ? (shootCancelling ? "Cancelling…" : "Cancel bullet time") : "It's bullet time";
    ui.shootBtn.classList.toggle("btn-primary", !shooting);
    ui.shootBtn.classList.toggle("btn-danger", shooting);
    ui.shootBtn.disabled = shooting ? shootCancelling : (busy || connected === 0 || sdkBusy);
    ui.orderBtn.disabled = busy || connected === 0 || sdkBusy;
    $("camSettingsBtn").disabled = busy || connected === 0;
    // Fotografando: o botão do Test shot vira "Cancel"
    $("csTest").textContent = csTest.capturing ? (csTest.cancelling ? "Cancelling…" : "Cancel") : "Test shot";
    $("csTest").classList.toggle("btn-danger", csTest.capturing);
    $("csTest").disabled = csTest.capturing ? !!csTest.cancelling : (busy || connected === 0);
    document.querySelectorAll("#cameraList li[data-placed='1']").forEach((li) => li.classList.toggle("can-drag", !busy));
    ui.shootNote.classList.toggle("hidden", !sdkBusy || connected === 0);
    ui.shootNote.textContent = "Available when " + connectingNames.join(" and ") + (connectingNames.length === 1 ? " finishes" : " finish") + " connecting.";
    checkSlowConnections();
    document.querySelectorAll(".camera-actions button").forEach((b) =>
      (b.disabled = busy || b.dataset.locked === "1" || (sdkBusy && b.dataset.sdk === "1")));

    ui.saveBtn.disabled = sessions.length === 0;
    ui.saveBtn.textContent = sessions.length ? "Export sessions (" + sessions.length + ")" : "Export sessions";
    ui.sessionCount.textContent = sessions.length;
    ui.sessionCount.classList.toggle("hidden", sessions.length === 0);
    // A janela de atualização aberta acompanha o estado (ex.: libera "Update now")
    if (upd && upd.release && !updEl.overlay.classList.contains("hidden")) renderUpdate();
  }

  // =================== Sessões ===================
  // O teclado está nas fotos (depois de ← → ou de clicar numa miniatura): a tecla Delete apaga fotos, não a sessão
  let photoKeys = false;
  const sessionGallery = Gallery(ui.sessionGallery, {
    multi: true,
    // Proporções misturadas na sessão (Parte 3 da Proporção): as fotos fora da proporção mais comum ganham
    // borda âmbar tracejada e a proporção no canto
    warnItem: (item) => { const r = ratioInfoCached(item.session); return !!(r && r.mixed && r.marked.includes(item.group)); },
    warnLabel: (item) => { const r = ratioInfoCached(item.session); return r ? r.byGroup[item.group] || "" : ""; },
    appBadge: (item) => { const m = editingBySession[item.session]; const v = m && m[item.group]; return v === "lr" ? "LR" : v === "ps" ? "PS" : ""; },
    onPick: () => { photoKeys = true; },
    // Arrastar uma miniatura: para o lado muda a ordem; até o botão da lixeira apaga
    freeDrag: true,
    canDrag: () => !editing.on && !busy && !!currentSession,
    onDragStart: () => { stopPlay(); photoKeys = true; const t = trashTarget(); if (t) t.classList.add("drop-here"); },
    onDragEnd: () => document.querySelectorAll(".drop-here").forEach((x) => x.classList.remove("drop-here")),
    dropTarget: (x, y) => { const t = trashTarget(); return t && overNode(x, y, t) ? t : null; },
    onDropOut: (node, picks) => deletePhotosNow(picks, true),
    onFreeReorder: () => saveOrder(currentSession),
    load: (item, size) => sessionPhoto(item.session, item.file, size),
    // Botão direito numa foto (miniatura ou foto grande): apagar
    onContext: (e) => {
      if (editing.on || !currentSession) return;
      const item = sessionGallery.items[sessionGallery.index];
      if (!item) return;
      const win = upd.info && upd.info.os === "windows";
      const fileAction = (what) => {
        if (typeof window.photoFile !== "function") { toast("This build cannot do that yet. Build the app again.", 8000); return; }
        Promise.resolve(window.photoFile(item.session || currentSession.name, item.file, what)).then((r) => {
          if (r && r.ok === false) toast(r.error || "Could not open " + item.file + ".", 8000);
        });
      };
      const hasFile = !!item.file;
      const sel = sessionGallery.selection;
      // Fotos (escolhidas) que têm editada em Edited/ (Delete edits)
      const photoEdited = (it) => { const s = sessions.find((x) => x.name === (it.session || currentSession.name)); const p = s && s.photos.find((x) => x.file === it.file); return !!(p && p.edited); };
      const editedPicked = () => sel.map((i) => sessionGallery.items[i]).filter((it) => it && it.file && photoEdited(it));
      if (sel.length > 1) {
        popupMenuAt(e.clientX, e.clientY, [
          { html: el("div", "project-menu-label", plural(sel.length, "photo", "photos") + " selected") },
          { label: "Edit " + sel.length + " photos in Lightroom Classic", onClick: () => {
            const picked = sel.map((i) => sessionGallery.items[i]).filter(Boolean);
            const s = sessions.find((x) => x.name === (item.session || currentSession.name));
            if (s && picked.length && !adobeMissingBuild()) startLightroom(s, item.group, "photos", picked.map((x) => x.group));
          } },
          { label: "Delete " + plural(editedPicked().length, "edit", "edits") + "…", danger: editedPicked().length > 0, disabled: !editedPicked().length, dim: !editedPicked().length, onClick: () => {
            const s = sessions.find((x) => x.name === (item.session || currentSession.name));
            if (s) deleteEdits(s, editedPicked().map((x) => x.file));
          } },
          "-",
          { label: "Delete " + sel.length + " photos…", danger: true, onClick: deleteCurrentPhoto },
        ]);
        return;
      }
      popupMenuAt(e.clientX, e.clientY, [
        { label: "Edit in Lightroom Classic…", disabled: !hasFile, dim: !hasFile, onClick: () => editPhotoInLightroom(item) },
        "-",
        { label: win ? "Show in Explorer" : "Show in Finder", disabled: !hasFile, dim: !hasFile, onClick: () => fileAction("reveal") },
        { label: "Open in default app", disabled: !hasFile, dim: !hasFile, onClick: () => fileAction("open") },
        "-",
        { label: "Delete edit…", danger: hasFile && photoEdited(item), disabled: !(hasFile && photoEdited(item)), dim: !(hasFile && photoEdited(item)), onClick: () => {
          const s = sessions.find((x) => x.name === (item.session || currentSession.name));
          if (s) deleteEdits(s, [item.file]);
        } },
        { label: "Delete photo " + pad(item.order || sessionGallery.index + 1) + "…", danger: true, onClick: deleteCurrentPhoto },
      ]);
    },
  });
  const editing = { on: false };  // reordenando as fotos da sessão aberta
  const playBtn = button("", togglePlay, { icon: "play", title: "Play the sequence (space)" });
  // Fora da tela cheia: só "Delete session" e o botão de tela cheia, ao lado das
  // miniaturas. Os outros controles (navegar, play, reordenar, apagar foto) ficam
  // na tela cheia, junto com a data da sessão.
  const fullBtn = button("", () => setFullscreen(true), { icon: "expand", title: "Full screen (F)" });
  const compactActions = [
    button("Delete session", deleteCurrentSession, { title: "Delete this session (it goes to the Trash for 15 days)" }),
    fullBtn,
  ];
  const exitFullBtn = button("", () => setFullscreen(false), { icon: "shrink", title: "Exit full screen (Esc)" });
  // Na tela cheia a lixeira apaga a sessão (como fora dela); uma foto: botão direito ou a tecla Delete
  const fullTrashBtn = button("Delete session", deleteCurrentSession, { title: "Delete this session (a photo: right-click it, or the Delete key)" });
  // Sem espaço na barra da tela cheia (fitHead), os botões com texto viram só o ícone
  function withShortIcon(b, name) {
    const text = b.lastChild;
    const full = el("span", "hd-full"); full.appendChild(text);
    const short = el("span", "hd-short"); short.innerHTML = icon(name);
    b.append(full, short);
    return b;
  }
  withShortIcon(fullTrashBtn, "trash");
  // "Reverse loop" (ligado por padrão): o play vai e volta (1, 2, 3, 2, 1...);
  // desligado, recomeça do início (1, 2, 3, 1, 2, 3...)
  const reverseLoopOption = document.createElement("label");
  reverseLoopOption.className = "log-option play-option";
  reverseLoopOption.title = "Play back and forth (1, 2, 3, 2, 1...)";
  reverseLoopOption.innerHTML = '<input type="checkbox" checked> <span class="hd-full">Reverse loop</span><span class="hd-short">Loop</span>';
  const reverseLoop = reverseLoopOption.querySelector("input");

  // Velocidade do play: de 0,25x a 5x; 1x = 220 ms por foto
  const PLAY_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];
  let speedIndex = PLAY_SPEEDS.indexOf(1);
  const speedLabel = document.createElement("span");
  speedLabel.className = "play-speed";
  speedLabel.title = "Playback speed";
  const slowerBtn = button("", () => changeSpeed(-1), { icon: "minus", title: "Slower" });
  const fasterBtn = button("", () => changeSpeed(1), { icon: "plus", title: "Faster" });
  function playInterval() { return Math.round(220 / PLAY_SPEEDS[speedIndex]); }
  function renderSpeed() {
    const v = PLAY_SPEEDS[speedIndex];
    speedLabel.textContent = (v % 1 === 0 ? v.toFixed(1) : String(v)) + "x";  // 1.0x, 1.25x, 2.0x
    slowerBtn.disabled = speedIndex === 0;
    fasterBtn.disabled = speedIndex === PLAY_SPEEDS.length - 1;
  }
  function changeSpeed(delta) {
    speedIndex = Math.max(0, Math.min(PLAY_SPEEDS.length - 1, speedIndex + delta));
    renderSpeed();
    if (playTimer) {  // já tocando: continua, na velocidade nova
      clearInterval(playTimer);
      playTimer = setInterval(playStep, playInterval());
    }
  }
  renderSpeed();
  // Velocidade num grupo à parte (com separador), para não se misturar com ‹ ▶ ›
  const speedGroup = document.createElement("div");
  speedGroup.className = "play-group";
  const speedCaption = document.createElement("span");
  speedCaption.className = "play-group-caption";
  speedCaption.textContent = "Speed";
  speedGroup.append(speedCaption, slowerBtn, speedLabel, fasterBtn);

  // Na tela cheia: o mesmo botão da lixeira da barra de cima (abre a Trash; número de itens e espaço)
  const fullTrashOpenBtn = document.createElement("button");
  fullTrashOpenBtn.className = "trash-bar full-trash-bar";
  fullTrashOpenBtn.type = "button";
  fullTrashOpenBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.6 7.5h5.8l.6-7.5"/></svg><span class="trash-count-full"></span><span class="trash-size trash-size-full"></span>';
  fullTrashOpenBtn.addEventListener("click", () => openTrash());
  // Na tela cheia, ‹ ▶ › Speed e Reverse loop ficam sobre a foto grande, no canto de cima à direita, e aparecem
  // quando o mouse se mexe sobre a foto (somem 2 s depois; com o foco do teclado neles, ficam), como no passo 3
  // do Match. Na barra de cima ficam só Reorder, Delete session e sair da tela cheia.
  const stageCtrls = el("div", "cs-review-ctrls stage-ctrls");
  stageCtrls.append(
    button("", () => { stopPlay(); sessionGallery.prev(); }, { icon: "left", title: "Previous photo" }),
    playBtn,
    button("", () => { stopPlay(); sessionGallery.next(); }, { icon: "right", title: "Next photo" }),
    speedGroup,
    reverseLoopOption);
  const showStageCtrls = fadeControls(ui.sessionGallery.querySelector(".stage"), stageCtrls);
  const viewActions = [
    withShortIcon(button("Reorder", startReorder, { title: "Change the order of the photos in this session" }), "swap"),
    fullTrashBtn,
    exitFullBtn,
  ];
  // O botão da lixeira da tela cheia fica à direita do nome da sessão (aparece só na tela cheia)
  {
    const title = ui.sessionGallery.querySelector(".gallery-title");
    const row = el("div", "gallery-title-row");
    title.replaceWith(row);
    row.append(title, fullTrashOpenBtn);
  }
  // Barra da tela cheia: nada quebra linha; sem espaço, some primeiro o que importa menos (como fitTopbar)
  const HEAD_FIT_STEPS = 5;
  let headFitQueued = false;
  let headFitting = false;
  function fitHead() {
    headFitQueued = false;
    const head = ui.sessionGallery.querySelector(".gallery-head");
    if (!head || headFitting) return;
    headFitting = true;
    const wasWrap = head.classList.contains("wrap");
    const before = head.offsetHeight;
    head.style.height = "";
    head.classList.remove("wrap");
    for (let k = 1; k <= HEAD_FIT_STEPS; k++) head.classList.remove("fit-" + k);
    if (isFullscreen()) {
      const overflows = () => head.scrollWidth > head.clientWidth + 1;
      // 1) Os controles encostaram na lixeira: linha nova abaixo. 2) Ainda sem espaço: some o que importa menos
      if (overflows()) head.classList.add("wrap");
      const actions = head.querySelector(".gallery-actions");
      const actionsOverflow = () => actions && actions.scrollWidth > actions.clientWidth + 1;
      for (let k = 1; k <= HEAD_FIT_STEPS && (head.classList.contains("wrap") ? actionsOverflow() : overflows()); k++) head.classList.add("fit-" + k);
    }
    // A mudança de uma para duas linhas (e volta) anima a altura em vez de pular
    const nowWrap = head.classList.contains("wrap");
    if (nowWrap !== wasWrap && before) {
      const after = head.offsetHeight;
      head.style.height = before + "px";
      void head.offsetHeight;
      head.style.height = after + "px";
      setTimeout(() => { head.style.height = ""; }, 200);
    }
    headFitting = false;
  }
  function queueHeadFit() { if (!headFitQueued) { headFitQueued = true; requestAnimationFrame(fitHead); } }
  window.addEventListener("resize", queueHeadFit);
  // (as classes que o próprio fitHead põe na barra não contam, senão ele rodaria sem parar)
  new MutationObserver((list) => { if (list.some((m) => !m.target.classList || !m.target.classList.contains("gallery-head"))) queueHeadFit(); })
    .observe(ui.sessionGallery, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  const editActions = [
    button("", () => sessionGallery.moveSelected(-1), { icon: "left", title: "Move the selected photo earlier" }),
    button("", () => sessionGallery.moveSelected(1), { icon: "right", title: "Move the selected photo later" }),
    button("Cancel", () => stopReorder(false)),
    button("Save order", () => stopReorder(true), { kind: "btn-primary" }),
  ];
  function currentActions() {
    return editing.on ? editActions : isFullscreen() ? viewActions : compactActions;
  }
  sessionGallery.setActions(compactActions);

  function refreshSessions() {
    Promise.resolve(window.listSessions()).then(setSessions);
  }

  function filesOf(session) {
    return session ? session.photos.map((p) => p.file).join("|") : "";
  }

  // A sessão mais recente fica selecionada: ao abrir, quando chega uma sessão
  // nova e quando a selecionada é apagada ou salva
  function setSessions(list) {
    setTimeout(() => {
      // Janela de salvar aberta (ex.: salvamento com erro): mostra só o que ainda está no app
      if ($("exportOverlay").classList.contains("hidden") || !sessions.length) return;
      exp.selected = new Set([...exp.selected].filter((n) => sessions.some((s) => s.name === n)));
      if (!sessions.some((s) => s.name === exp.active)) exp.active = sessions[0].name;
      renderExport();
    }, 0);
    const known = sessions.map((x) => x.name);
    sessions = list || [];
    updateButtons();
    // Proporções: sessões novas de um disparo são medidas já (e avisam se misturadas); o resto na fila
    sessions.forEach((x) => { const r = String(x.crop || "").split("|")[0]; if (RATIOS[r]) sessionCrop[x.name] = r; });
    const fresh = known.length ? sessions.filter((x) => !known.includes(x.name)) : [];
    const afterShoot = busyAction === "shoot" || Date.now() - lastShootAt < 20000;
    if (afterShoot) fresh.forEach((x) => measureSessionRatios(x).then((info) => maybeWarnMixed(x, info, fresh.map((f) => f.name))));
    setTimeout(measureAllSessions, 0);

    const newest = sessions[0] || null;
    const current = currentSession && sessions.find((x) => x.name === currentSession.name);
    const arrivedNewer = newest && !known.includes(newest.name);
    // Projeto acabou de ser aberto: mostra a primeira sessão dele e recolhe "Not in project"
    const firstOfProject = pendingProjectFocus && sessions.find((x) => x.inProject);
    if (firstOfProject) { pendingProjectFocus = false; notInProjectOpen = false; showSession(firstOfProject); return; }

    if (!newest) showSession(null);
    else if (!current || arrivedNewer) showSession(newest);
    else if (filesOf(current) !== filesOf(currentSession)) {
      // Mesmas fotos com outra numeração (ordem mudada aqui ou no Desfazer): desliza em vez de redesenhar
      const camKey = (it) => (it.group || "").replace(/^\d+_/, "") + "|" + (it.files || []).map((f) => f.file.replace(/^\d+_/, "")).join("+");
      if (current.name === currentSession.name && !editing.on && !playTimer && sessionGallery.morph(sessionItems(current), camKey)) {
        currentSession = current;
        sessionTitles = sessionGallery.items.map((i) => i.title).join("|");
        renderSessionList();
      } else showSession(current, true);
    }
    else { currentSession = current; renderSessionList(); }
  }

  // Etiqueta de sessão já salva (lista de sessões e janela Save sessions)
  function savedTag() {
    const t = document.createElement("span");
    t.className = "saved-tag";
    t.textContent = "✓ Exported";
    t.title = "Already exported. It leaves the app when you close Stillpoint (the exported copy stays where you exported it).";
    return t;
  }
  // Etiqueta de sessão guardada no Project: "In project" ou "Edited n/m" (verde quando completa). Com editadas, é um
  // botão: liga e desliga as editadas da sessão nas prévias e no Export (decisão do dono, 2026-11-06)
  function projectTag(s) {
    const total = s.photos.length;
    const complete = s.edited > 0 && s.edited >= total;
    const on = s.showEdited !== false;
    const t = document.createElement(s.edited > 0 ? "button" : "span");
    if (s.edited > 0) t.type = "button";
    t.className = "project-tag" + (complete ? " ok" : s.edited > 0 ? " part" : "") + (s.edited > 0 && !on ? " off" : "");
    t.textContent = s.edited > 0 ? "Edited " + s.edited + " / " + total : "In project";
    if (s.edited > 0) {
      t.setAttribute("aria-pressed", on ? "true" : "false");
      t.title = (on ? "Showing the edited photos (from the project's Edited folder) in the previews and in Export. Click to show the originals."
        : "Showing the originals. Click to show the edited photos (from the project's Edited folder) in the previews and in Export.")
        + (complete ? "" : " Only some photos have an edited version.");
      t.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.stopPropagation(); setShowEdited(s, !on); });
    } else t.title = "Kept in the project folder (originals). It stays in the app until you remove it.";
    return t;
  }
  // Liga/desliga as editadas da sessão; as prévias guardadas dela são esquecidas e a foto grande é refeita
  // É um passo do ⌘Z (decisão do dono, 2026-11-06); undoing = vindo do próprio desfazer/refazer (não grava outro passo)
  function setShowEdited(s, show, undoing) {
    if (typeof window.setShowEdited !== "function") return;
    const name = s.name;
    return Promise.resolve(window.setShowEdited(name, show ? "1" : "0")).then((ok) => {
      if (!ok) return false;
      const cur = sessions.find((x) => x.name === name) || s;
      cur.showEdited = show; s.showEdited = show;
      forgetSessionPreviews(name);
      toast((show ? "Edited photos" : "Originals") + " · " + sessionTitle(cur) + (undoing ? "" : " · ⌘Z undoes"), TOAST_MS);
      if (!undoing) recordAction({ label: (show ? "Show edited photos" : "Show originals") + " · " + sessionLabel(name).date,
        undo: () => setShowEdited(sessions.find((x) => x.name === name) || { name }, !show, true),
        redo: () => setShowEdited(sessions.find((x) => x.name === name) || { name }, show, true) });
      return true;
    });
  }
  // Delete edits (decisão do dono, 2026-11-06): as editadas vão para a lixeira do Stillpoint (Trash), num item só
  // delas; ⌘Z traz de volta. files vazio = a sessão inteira
  function deleteEdits(s, files) {
    if (typeof window.deleteEdits !== "function") { toast("This build cannot do that yet. Build the app again.", 8000); return; }
    const n = files.length || s.edited;
    const what = files.length ? plural(n, "edited photo", "edited photos") : "the " + plural(n, "edited photo", "edited photos") + " of " + sessionTitle(s);
    dialog("Delete " + plural(n, "edit", "edits") + "?",
      "Moves " + what + " from the project's Edited folder to the Stillpoint trash. The originals and your edits in Lightroom Classic stay as they are. ⌘Z or the Trash brings " + (n === 1 ? "it" : "them") + " back.",
      [{ label: "Cancel" },
       { label: "Delete " + plural(n, "edit", "edits"), danger: true, onClick: () => {
         const run = () => Promise.resolve(window.deleteEdits(s.name, ...files)).then((removed) => { forgetSessionPreviews(s.name); return Number(removed) || 0; });
         run().then((count) => {
           if (!count) { toast("No edited files were found.", TOAST_MS); return; }
           toast(plural(count, "edit", "edits") + " moved to the trash · " + sessionTitle(s) + " · ⌘Z undoes", TOAST_MS);
           log("Delete edits: " + plural(count, "edited file", "edited files") + " of " + sessionShort(s) + " moved to the trash", "ok");
           recordAction({ label: "Delete " + plural(count, "edit", "edits") + " · " + sessionLabel(s.name).date,
             undo: () => Promise.resolve(restoreSession(s.name)).then((ok) => { forgetSessionPreviews(s.name); return ok; }),
             redo: () => run() });
         });
       } }]);
  }
  function forgetSessionPreviews(name) {
    Object.keys(photoCache).forEach((k) => { if (k.startsWith("sessions/" + name + "/") || k.startsWith("order/" + name + "/")) delete photoCache[k]; });
    if (currentSession && currentSession.name === name) setTimeout(() => { const cur = sessions.find((x) => x.name === name); if (cur && currentSession && currentSession.name === name) showSession(cur, true); }, 300);
  }
  // Etiqueta de sessão com fotos que a câmera recusou no disparo (arquivo ".missing")
  // Fotos apagadas de uma sessão (estão na lixeira): etiqueta "n deleted", no desenho do "n missing"
  // (decisão do dono, 2026-11-04). Some quando as fotos voltam da lixeira ou a lixeira as descarta.
  let deletedBySession = {};
  // Etapa 20: fotos no Lightroom Classic / Photoshop, por sessão (grupo "02_T7_1" -> "lr" | "ps"). Vem do app
  // (adobeEditing) e muda com o evento "adobeEditing".
  let editingBySession = {};
  function editingOf(session, group) { const m = editingBySession[session]; return m ? m[group] || "" : ""; }
  // Etiqueta "In Lightroom" / "In Photoshop" (no desenho das outras etiquetas, sem o âmbar de aviso)
  function editTagFor(session) {
    const m = editingBySession[session];
    if (!m) return null;
    const v = Object.values(m);
    if (!v.length) return null;
    const lr = v.filter((x) => x === "lr").length, ps = v.length - lr;
    const t = document.createElement("span");
    t.className = "missing-tag edit-tag" + (lrLive.has(session) ? " live" : "");
    t.dataset.session = session;
    const dot = document.createElement("span");
    dot.className = "edit-dot";
    t.appendChild(dot);
    t.appendChild(document.createTextNode(lr ? "In Lightroom" : "In Photoshop"));
    t.dataset.itip = (lr ? plural(lr, "photo of this session is", "photos of this session are") + " being edited in Lightroom Classic" : "")
      + (lr && ps ? "; " : "") + (ps ? plural(ps, "photo is", "photos are") + " open in Photoshop" : "")
      + ". Right-click the session › Done editing when you finish.";
    return t;
  }
  // Opção A (decisão do dono, 2026-11-05): a etiqueta fica até o Done editing; a bolinha só pulsa enquanto o
  // Lightroom está aberto com o plugin respondendo. Pergunta ao app a cada 5 s, só enquanto houver etiqueta.
  // Só nas sessões cuja coleção está no catálogo aberto agora (decisão do dono, 2026-11-06)
  let lrLiveTimer = 0;
  let lrLive = new Set();
  // A cada 3 s: quais sessões "In Lightroom" estão no catálogo aberto (bolinha pulsando) e os recados do plugin
  // (editadas que chegaram com Export to Stillpoint; Go to session in Stillpoint)
  function checkLrLive() {
    clearTimeout(lrLiveTimer);
    const apply = () => document.querySelectorAll(".edit-tag[data-session]").forEach((t) => t.classList.toggle("live", lrLive.has(t.dataset.session)));
    if (typeof window.adobeLive !== "function") { lrLive = new Set(); apply(); return; }
    Promise.resolve(window.adobeLive()).then((r) => {
      lrLive = new Set((r && r.sessions) || []);
      apply();
      ((r && r.exported) || []).forEach(lightroomExported);
      ((r && r.back) || []).forEach((name) => {
        const s = sessions.find((x) => x.name === name);
        toast("Back in Lightroom Classic · " + (s ? sessionTitle(s) : sessionLabel(name).date) + " (undone in Lightroom)", 7000);
      });
      if (r && r.goto) {
        const s = sessions.find((x) => x.name === r.goto);
        if (s) showSession(s); else toast("That session is not in Stillpoint anymore.", 6000, { warn: true });
      }
    }, () => {}).finally(() => { lrLiveTimer = setTimeout(checkLrLive, 3000); });
  }
  // Export to Stillpoint terminou: aviso "Edited n / m · sessão" (a etiqueta da sessão já mudou com a lista nova)
  function lightroomExported(e) {
    // As prévias dessa sessão passam a ser as editadas: esquece as guardadas e mostra de novo
    forgetSessionPreviews(e.session);
    const s = sessions.find((x) => x.name === e.session);
    const title = s ? sessionTitle(s) : sessionLabel(e.session).date;
    let text = e.found && e.total ? "Edited " + e.edited + " / " + e.total + " · " + title : plural(e.count, "edited photo", "edited photos") + " arrived from Lightroom Classic · " + title;
    if (e.failed > 0) text += " · " + plural(e.failed, "photo", "photos") + " could not be exported";
    toast(text, e.failed > 0 ? 9000 : TOAST_MS, e.failed > 0 ? { warn: true } : undefined);
  }
  function setAdobeEditing(map) {
    const next = map || {};
    if (JSON.stringify(next) === JSON.stringify(editingBySession)) return;
    editingBySession = next;
    checkLrLive();
    renderSessionListSoon();
    if (currentSession) sessionHead(currentSession);
    sessionGallery.refreshBadges();
    if (!$("projectOverlay").classList.contains("hidden") && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#projectList input[type=text]"))) renderProjectWindow();
  }
  function deletedTag(count) {
    const t = document.createElement("span");
    t.className = "missing-tag deleted-tag";
    t.textContent = count + " deleted";
    t.dataset.itip = plural(count, "photo of this session is", "photos of this session are") + " in the Trash (top bar). Restore brings " + (count === 1 ? "it" : "them") + " back.";
    return t;
  }
  function refreshDeleted() {
    if (typeof window.trashList !== "function") return;
    Promise.resolve(window.trashList()).then((r) => {
      const map = {};
      (r && r.items || []).forEach((i) => { if (!i.whole && !i.restored && !i.isProject && i.session && (+i.photos || 0) > 0) map[i.session] = (map[i.session] || 0) + (+i.photos || 0); });
      if (JSON.stringify(map) === JSON.stringify(deletedBySession)) return;
      deletedBySession = map;
      renderSessionListSoon();
      if (currentSession) sessionHead(currentSession);
      if (!$("projectOverlay").classList.contains("hidden") && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#projectList input[type=text]"))) renderProjectWindow();
      if (!$("exportOverlay").classList.contains("hidden")) renderExportList();
    }, () => {});
  }
  function missingTag(count) {
    const t = document.createElement("span");
    t.className = "missing-tag";
    t.textContent = count + " missing";
    t.title = plural(count, "photo was", "photos were") + " refused by the camera during the shoot (a camera asked to shoot again too soon after its previous photo).";
    return t;
  }

  // ---- Várias sessões de uma vez (opções A e D, decisão do dono 2026-11-01) ----
  // Cmd/Ctrl+clique marca/desmarca, Shift+clique (e Shift+↑ ↓) marca um intervalo; o botão direito
  // e a tecla Delete agem em todas. A janela Project tem o "Delete…" para as marcadas nela.
  const sessSel = new Set();
  let selAnchor = "";
  function visibleSessionRows() { return [...ui.sessionList.querySelectorAll("li.folder")].filter((x) => !x.classList.contains("hidden")); }
  function selectRange(from, to) {
    const names = visibleSessionRows().map((x) => x.dataset.name);
    let a = names.indexOf(from), b = names.indexOf(to);
    if (a < 0) a = b;
    if (b < 0) return;
    sessSel.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) sessSel.add(names[i]);
  }
  function clearSelection() { if (!sessSel.size) return; sessSel.clear(); renderSessionList(); }
  function selectionActive() { return sessSel.size > 1; }
  let sessDownMods = null;  // teclas apertadas no último "pointerdown" de uma sessão
  function pruneSelection() { [...sessSel].forEach((n) => { if (!sessions.some((x) => x.name === n)) sessSel.delete(n); }); }
  function moveMany(names, toProject) {
    applyMove(names, toProject).then((ok) => {
      if (!ok) return;
      recordAction({ label: (toProject ? "Add to project: " : "Remove from project: ") + plural(names.length, "session", "sessions"),
                     undo: () => applyMove(names, !toProject), redo: () => applyMove(names, toProject) });
      sessSel.clear();
      renderSessionList();
    });
  }
  // Apagar várias (a lista da tela principal e a janela Project): um aviso, um passo no Desfazer
  function deleteMany(names, after) {
    const list = names.map((n) => sessions.find((x) => x.name === n)).filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) { deleteSessionAsk(list[0]); return; }
    const photos = list.reduce((t, x) => t + sessionItems(x).length, 0);
    const inProject = list.filter((x) => x.inProject).length;
    dialog("Delete " + list.length + " sessions?", plural(photos, "photo", "photos") + " from " + list.map((x) => sessionLabel(x.name).date).join(", ") +
      " go to the Trash (top bar), where they stay for " + trash.days + " days." +
      (inProject ? " " + (inProject === list.length ? "They are" : inProject + " of them are") + " in the project; the project keeps them in its own trash." : ""), [
      { label: "Cancel" },
      { label: "Delete " + list.length + " sessions", danger: true, onClick: () => {
        const ns = list.map((x) => x.name);
        sessSel.clear();
        toast(plural(ns.length, "session", "sessions") + " deleted");
        log("Deleted " + plural(ns.length, "session", "sessions") + ": " + ns.map((n) => sessionLabel(n).date).join(", "), "ok");
        ns.forEach((n) => flyToTrash(n, () => window.deleteSession(n)));
        recordAction({ label: "Delete " + plural(ns.length, "session", "sessions"),
          undo: () => Promise.all(ns.map((n) => restoreSession(n))).then((r) => r.some(Boolean)),
          redo: () => { ns.forEach((n) => window.deleteSession(n)); } });
        if (after) after();
      } },
    ]);
  }
  function multiSessionMenu(e) {
    const names = [...sessSel], list = names.map((n) => sessions.find((x) => x.name === n)).filter(Boolean);
    const outside = list.filter((x) => !x.inProject).map((x) => x.name), inside = list.filter((x) => x.inProject).map((x) => x.name);
    const items = [{ html: el("div", "project-menu-label", plural(list.length, "session", "sessions") + " selected") }];
    if (project.open && outside.length) items.push({ label: "Add " + outside.length + " to project", onClick: () => moveMany(outside, true) });
    if (project.open && inside.length) items.push({ label: "Remove " + inside.length + " from project", onClick: () => moveMany(inside, false) });
    // Rótulo em várias sessões de uma vez (um passo só no Desfazer)
    const labeled = list.filter((x) => x.label);
    items.push({ label: "Add label to " + list.length + " sessions…", onClick: () => editManyLabels(list) });
    if (labeled.length) items.push({ label: "Remove " + plural(labeled.length, "label", "labels"), onClick: () => setManyLabels(labeled, "") });
    if (items.length > 1) items.push("-");
    items.push({ label: "Delete " + list.length + " sessions…", danger: true, onClick: () => deleteMany(names) });
    popupMenuAt(e.clientX, e.clientY, items);
  }
  function focusRow(name) {
    const row = [...ui.sessionList.querySelectorAll("li.folder")].find((x) => x.dataset.name === name);
    if (!row) return;
    ui.sessionList.querySelectorAll("li.folder").forEach((x) => { x.tabIndex = x === row ? 0 : -1; });
    row.focus();
  }
  // Redesenho "de fundo" (medição das proporções, lista nova vinda do programa): com o botão do mouse apertado na
  // lista, espera soltar. Redesenhar no meio do clique trocava a linha e o clique se perdia (Record 1, 2026-11-04).
  let listHeld = false, listRenderPending = false;
  ui.sessionList.addEventListener("pointerdown", () => { listHeld = true; }, true);
  window.addEventListener("pointerup", () => { listHeld = false; if (listRenderPending) { listRenderPending = false; setTimeout(() => { if (!sessDrag) renderSessionList(); }, 0); } }, true);
  window.addEventListener("pointercancel", () => { listHeld = false; }, true);
  function renderSessionListSoon() { if (listHeld || sessDrag) { listRenderPending = true; return; } renderSessionList(); }
  function renderSessionList() {
    if (sessDrag) sessEndDrag(null);
    pruneSelection();  // a linha arrastada vai sumir: termina o arraste
    ui.sessionList.innerHTML = "";
    ui.noSessions.classList.toggle("hidden", sessions.length > 0);
    const projectOpen = !!project.open;
    // Com projeto aberto: as sessões do projeto primeiro; as outras sob o grupo "Not in project",
    // recolhido por padrão (abre ao clicar, ao tirar uma sessão do projeto e quando a sessão
    // aberta está nele)
    const ordered = projectOpen ? sessions.filter((s) => s.inProject).concat(sessions.filter((s) => !s.inProject)) : sessions;
    if (projectOpen && currentSession && sessions.some((x) => x.name === currentSession.name && !x.inProject)) notInProjectOpen = true;
    let dividerDone = false;
    const addDivider = () => {
      if (dividerDone) return;
      dividerDone = true;
      const n = sessions.filter((x) => !x.inProject).length;
      const d = el("li", "folder-divider" + (notInProjectOpen && n ? " open" : "") + (n ? "" : " empty"));
      d.innerHTML = '<span class="chev">' + icon("right", 10) + '</span><span>Not in project</span><span class="line"></span><span class="n"></span>';
      d.querySelector(".n").textContent = n;
      d.dataset.tip = "Not in project · " + n;
      d.title = (n ? (notInProjectOpen ? "Hide" : "Show") + " the sessions still only in the app. " : "No session outside the project. ") + "Drop a session here to take it out of the project.";
      d.addEventListener("click", () => { if (n) { notInProjectOpen = !notInProjectOpen; renderSessionList(); } });
      ui.sessionList.appendChild(d);
    };
    if (projectOpen && !sessions.some((x) => x.inProject)) {
      // Projeto sem sessões: um espaço de verdade para soltar (senão a área do projeto some)
      const ph = el("li", "folder-placeholder");
      ph.innerHTML = '<span>' + icon("session", 16) + '</span><span>' + (project.available === false
        ? "The project folder is not reachable.<br>Sessions you shoot now stay in the app."
        : "No sessions in the project yet.<br>Drag one here or shoot.") + '</span>';
      ui.sessionList.appendChild(ph);
    }
    ordered.forEach((s) => {
      if (projectOpen && !s.inProject) addDivider();
      const label = sessionLabel(s.name);
      const count = sessionItems(s).length;
      const li = document.createElement("li");
      li.className = "folder" + (currentSession && currentSession.name === s.name ? " active" : "");
      li.dataset.name = s.name;
      li.dataset.tip = (s.label ? s.label + " · " : "") + label.date;  // legenda da barra só de ícones (tela cheia)
      const mixed = ratioInfoCached(s.name) && ratioInfoCached(s.name).mixed;
      const warns = [s.missing > 0 ? s.missing + " missing" : "", deletedBySession[s.name] ? deletedBySession[s.name] + " deleted" : "", mixed ? "Mixed ratios" : ""].filter(Boolean);
      if (warns.length) { li.classList.add("warn"); li.dataset.tipWarn = warns.join(" · "); }  // aviso âmbar: o ícone da barra só de ícones também fica âmbar
      if (projectOpen && !s.inProject && !notInProjectOpen) li.classList.add("hidden");
      li.innerHTML = icon("session", 16) + '<div><div class="folder-date"></div><div class="folder-meta"></div></div>';
      if (sessSel.has(s.name) && selectionActive()) li.classList.add("multi");
      li.querySelector(".folder-date").textContent = s.label ? s.label + " · " + label.date : label.date;
      li.querySelector(".folder-meta").textContent = [plural(count, "photo", "photos"), label.detail].filter(Boolean).join(" · ");
      if (deletedBySession[s.name]) li.querySelector(".folder-meta").after(deletedTag(deletedBySession[s.name]));
      if (s.missing > 0) li.querySelector(".folder-meta").after(missingTag(s.missing));
      if (mixed) li.querySelector(".folder-meta").after(mixedTag(s.name, ratioInfoCached(s.name)));
      if (editTagFor(s.name)) li.querySelector(".folder-meta").after(editTagFor(s.name));
      if (projectOpen) {
        // Só a etiqueta de editadas (estar no projeto é a posição na lista)
        if (s.inProject && s.edited > 0) li.querySelector(".folder-meta").after(projectTag(s));
        if (!s.inProject) {
          const add = el("button", "btn btn-link btn-small folder-add", "Add to project ↑");
          // Com Cmd/Ctrl/Shift o clique é de seleção: o botão não age e o clique segue para a linha
          add.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.stopPropagation(); moveToProject(s.name, true); });
          li.querySelector("div").appendChild(add);
        }
      }
      // Segurar e arrastar: para o botão do projeto (barra de cima) = entra; para "Not in project" = sai;
      // para o botão da lixeira = apaga (este vale também sem projeto aberto)
      li.addEventListener("pointerdown", (e) => {
        sessDownMods = { name: s.name, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, t: Date.now() };
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        photoKeys = false;
        // Clique simples desfaz a seleção já aqui: o sessPointerDown redesenha a lista e o "click" nem chega à linha
        // Exceção: segurar uma das várias marcadas guarda a seleção para arrastar todas (se não arrastar, o soltar desfaz)
        const keep = e.button === 0 && sessSel.size > 1 && sessSel.has(s.name);
        if (e.button === 0 && sessSel.size && !keep) sessSel.clear();
        sessPointerDown(e, li, s, keep);
      });
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        // Várias selecionadas e o clique numa delas: o menu age em todas
        if (sessSel.size > 1 && sessSel.has(s.name)) { multiSessionMenu(e); return; }
        if (sessSel.size) { sessSel.clear(); visibleSessionRows().forEach((x) => x.classList.remove("multi")); }
        const x = e.clientX, y = e.clientY;
        // Relê a lista antes (fotos editadas podem ter chegado por fora) e abre com os dados novos
        Promise.resolve(window.listSessions()).then((list) => {
          if (Array.isArray(list)) setSessions(list);
          sessionContextMenu({ clientX: x, clientY: y }, sessions.find((z) => z.name === s.name) || s);
        }, () => sessionContextMenu({ clientX: x, clientY: y }, s));
      });
      if (s.saved) {
        li.querySelector(".folder-meta").after(savedTag());
        li.title = "Already exported. It leaves the app when you close Stillpoint (the exported copy stays where you exported it).";
      }
      const toggle = () => { if (sessSel.has(s.name)) sessSel.delete(s.name); else sessSel.add(s.name); selAnchor = s.name; };
      li.addEventListener("click", (ev) => {
        // Vale a tecla que estava apertada ao pressionar o botão do mouse (soltar o Cmd antes de soltar o
        // botão não vira um clique simples)
        const e = sessDownMods && sessDownMods.name === s.name && Date.now() - sessDownMods.t < 2000 ? sessDownMods : ev;
        sessDownMods = null;
        if (e.metaKey || e.ctrlKey) {
          // A aberta entra na seleção junto (como no Finder)
          const open = currentSession && currentSession.name;
          if (!sessSel.size && open && open !== s.name) sessSel.add(open);
          toggle();
          // Nunca fica uma seleção "invisível" de uma sessão só: sobrando uma, ela é a aberta
          if (sessSel.size === 1) {
            const only = [...sessSel][0];
            sessSel.clear();
            const o = sessions.find((x) => x.name === only);
            if (o && only !== open) { showSession(o); return; }
          } else if (sessSel.size > 1 && !sessSel.has(open)) {
            // A aberta saiu da seleção: abre a primeira das que ficaram marcadas
            const next = sessions.find((x) => sessSel.has(x.name));
            if (next) { showSession(next); return; }
          }
          renderSessionList(); return;
        }
        if (e.shiftKey) { selectRange(selAnchor || (currentSession && currentSession.name) || s.name, s.name); renderSessionList(); return; }
        sessSel.clear(); selAnchor = s.name; photoKeys = false;
        showSession(s);
      });
      // Teclado: o Tab passa só por uma sessão (a aberta, ou a primeira); ↑ ↓ trocam de sessão;
      // Shift+↑ ↓ marcam um intervalo; Delete apaga (a seleção, ou esta); Esc desfaz a seleção
      li.tabIndex = -1;
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); e.stopPropagation();
          showSession(s);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (photoKeys && sessSel.size < 2) return;  // o teclado está nas fotos: o Delete é delas (tratador geral)
          e.preventDefault(); e.stopPropagation();
          if (sessSel.size > 1) deleteMany([...sessSel]); else deleteSessionAsk(s);
          return;
        }
        if (e.key === "Escape" && selectionActive()) { e.preventDefault(); e.stopPropagation(); clearSelection(); focusRow(s.name); return; }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault(); e.stopPropagation();
        photoKeys = false;  // de volta às sessões
        const rows = [...ui.sessionList.querySelectorAll("li.folder")].filter((x) => x.getClientRects().length > 0);
        const next = rows[rows.indexOf(li) + (e.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        if (e.shiftKey) {
          if (!selAnchor || !sessSel.size) selAnchor = s.name;
          selectRange(selAnchor, next.dataset.name);
          renderSessionList(); focusRow(next.dataset.name);
          return;
        }
        sessSel.clear();
        const target = sessions.find((z) => z.name === next.dataset.name);
        if (target) showSession(target);
        focusRow(next.dataset.name);
      });
      ui.sessionList.appendChild(li);
    });
    if (projectOpen) addDivider();  // também sem sessões fora: é o alvo para tirar do projeto arrastando
    // Uma sessão só no Tab: a aberta (ou a primeira visível)
    const rowsNow = [...ui.sessionList.querySelectorAll("li.folder")].filter((x) => !x.classList.contains("hidden"));
    const tabRow = rowsNow.find((x) => x.classList.contains("active")) || rowsNow[0];
    if (tabRow) tabRow.tabIndex = 0;
  }

  // Uma foto por câmera: o RAW e o JPEG da mesma câmera ficam juntos (a prévia
  // usa o JPEG quando existe). Nome: o modelo da câmera, quando ela é conhecida.
  function sessionItems(session) {
    const items = [];
    const byGroup = {};
    session.photos.forEach((p) => {
      const group = p.camera ? pad(p.order) + "_" + p.camera : p.file;
      let item = byGroup[group];
      if (!item) {
        const cam = cameras.find((c) => c.name === p.camera);
        item = byGroup[group] = {
          group: group, movable: !!p.camera,
          session: session.name, order: p.order, files: [],
          title: cam ? shortModel(cam.model) : p.camera || p.file,
          subtitle: cam ? p.camera : "",
        };
        items.push(item);
      }
      item.files.push(p);
    });
    items.forEach((item) => {
      const pick = item.files.find((f) => /\.jpe?g$/i.test(f.file)) || item.files.find((f) => f.previewable) || item.files[0];
      item.file = pick.file;
      item.previewable = pick.previewable;
    });
    return items;
  }
  let sessionTitles = "";

  function sessionHead(session) {
    const label = sessionLabel(session.name);
    const r = ratioInfoCached(session.name);
    const mixed = r && r.mixed;
    sessionGallery.setHead(label.date,  // a data já tem os segundos
      editing.on ? "Drag the photos, or select and use the arrows (Shift+click or " + (upd.info && upd.info.os === "windows" ? "Ctrl" : "Cmd") + "+click selects several). Then save the order."
                 : [mixed ? ratioShortText(r) : "", label.detail].filter(Boolean).join(" · "),
      headTags(session, r));
  }
  function headTags(session, r) {
    const f = document.createDocumentFragment();
    if (r && r.mixed) f.appendChild(mixedTag(session.name, r));
    if (deletedBySession[session.name]) f.appendChild(deletedTag(deletedBySession[session.name]));
    if (editTagFor(session.name)) f.appendChild(editTagFor(session.name));
    return f.childNodes.length ? f : null;
  }

  // =================== Proporções misturadas numa sessão (Parte 3 da Proporção) ===================
  // O app mede a proporção de cada foto na prévia (como o Test shot) e compara entre as câmeras da sessão.
  // Fotos fora da proporção mais comum ganham a marca; a sessão ganha a etiqueta "Mixed ratios" (lista,
  // cabeçalho, barra de ícones) e, no primeiro disparo com mistura, uma janela com o que fazer.
  const RATIOS = { "3:2": 3 / 2, "4:3": 4 / 3, "16:9": 16 / 9, "1:1": 1 };
  const RATIO_ORDER = ["3:2", "4:3", "16:9", "1:1"];
  const ratioInfo = {};          // sessão → { key, byGroup, mixed, common, marked, keep, suggest, counts }
  const ratioPending = {};       // sessão → Promise da medida em andamento
  let ratioWarned = {};          // sessão → assinatura já avisada (só em memória: ao reabrir o app avisa de novo)
  const ratioLogged = new Set(); // sessões já anotadas na Activity neste uso do app
  let sessionCrop = {};          // sessão → proporção escolhida para o Export ("Crop on export")
  try { sessionCrop = JSON.parse(localStorage.getItem("stillpoint.sessionCrop") || "{}") || {}; } catch (e) {}
  function saveSessionCrop() { try { localStorage.setItem("stillpoint.sessionCrop", JSON.stringify(sessionCrop)); } catch (e) {} }
  function ratioKey(session) { return session.photos.map((p) => p.file).join("|"); }
  function ratioInfoCached(name) { const r = ratioInfo[name]; return r && r.done ? r : null; }
  // Quanto da foto sobra ao recortar da proporção a para a b (fração da área)
  function keepFraction(a, b) { const ra = RATIOS[a], rb = RATIOS[b]; if (!ra || !rb) return 1; return rb < ra ? rb / ra : ra / rb; }
  function measureSessionRatios(session) {
    const key = ratioKey(session);
    const have = ratioInfo[session.name];
    if (have && have.key === key) return ratioPending[session.name] || Promise.resolve(have);
    const items = sessionItems(session);
    const found = {};
    const probes = items.filter((i) => i.file && i.previewable).map((item) => sessionPhoto(session.name, item.file, 320).then((url) => new Promise((done) => {
      if (!url) return done();
      const probe = new Image();
      probe.onload = () => { found[item.group] = ratioName(probe.naturalWidth, probe.naturalHeight); done(); };
      probe.onerror = () => done();
      probe.src = url;
    })));
    const pending = Promise.all(probes).then(() => {
      delete ratioPending[session.name];
      const groups = Object.keys(found);
      const counts = {};
      groups.forEach((g) => { counts[found[g]] = (counts[found[g]] || 0) + 1; });
      const present = Object.keys(counts);
      // Proporção mais comum; em empate, a de menor área (decisão do dono, 2026-11-02)
      // (a "comum" em empate é a de maior área num sensor 3:2, ex.: 3 em 3:2 e 3 em 16:9 → comum 3:2, marcadas as 16:9)
      const common = present.slice().sort((a, b) => counts[b] - counts[a] || keepFraction("3:2", b) - keepFraction("3:2", a) || RATIO_ORDER.indexOf(a) - RATIO_ORDER.indexOf(b))[0] || "";
      const marked = groups.filter((g) => found[g] !== common);
      // Quanto sobra, em média por foto, ao recortar tudo para cada proporção
      const keep = {};
      RATIO_ORDER.forEach((t) => { keep[t] = groups.length ? Math.round(groups.reduce((sum, g) => sum + keepFraction(found[g], t), 0) / groups.length * 100) : 100; });
      // Sugestão: a proporção presente na sessão que perde menos pixels
      const suggest = present.slice().sort((a, b) => keep[b] - keep[a] || counts[b] - counts[a])[0] || common;
      const info = { key, done: true, byGroup: found, counts, present, common, marked, keep, suggest, mixed: present.length > 1 };
      ratioInfo[session.name] = info;
      if (info.mixed && !ratioLogged.has(session.name)) { ratioLogged.add(session.name); log("Mixed ratios: " + ratioText(info, session), "warn", "Open Camera settings to match the cameras, or crop on export."); }
      // Na tela: miniaturas, cabeçalho e lista
      if (currentSession && currentSession.name === session.name) { sessionGallery.refreshMarks(); if (!playTimer) sessionHead(session); }
      renderSessionListSoon();
      if (!$("projectOverlay").classList.contains("hidden") && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#projectList input[type=text]"))) renderProjectWindow();  // (não no meio de digitar um rótulo)
      return info;
    });
    ratioInfo[session.name] = { key, done: false };
    ratioPending[session.name] = pending;
    return pending;
  }
  // Mede as sessões ainda sem medida, uma de cada vez (as etiquetas da lista aparecem conforme ficam prontas)
  let ratioQueueRunning = false;
  function measureAllSessions() {
    if (ratioQueueRunning) return;
    const next = sessions.find((s) => { const r = ratioInfo[s.name]; return !r || r.key !== ratioKey(s); });
    if (!next) return;
    ratioQueueRunning = true;
    measureSessionRatios(next).then(() => { ratioQueueRunning = false; measureAllSessions(); }, () => { ratioQueueRunning = false; });
  }
  // Número da câmera na sessão ("02"), a partir do grupo "02_T7_1"
  function groupNumber(g) { return g.replace(/_.*$/, ""); }
  // "Cameras 02 and 04 shot 16:9; the others 3:2." (três proporções: "Camera 02 shot 16:9, camera 04 shot 4:3; the others 3:2.")
  function ratioText(info) {
    const parts = info.present.filter((r) => r !== info.common).map((r) => {
      const cams = Object.keys(info.byGroup).filter((g) => info.byGroup[g] === r).map(groupNumber).sort();
      const who = cams.length === 1 ? cams[0] : cams.slice(0, -1).join(", ") + " and " + cams[cams.length - 1];
      return { plural: cams.length > 1, text: who + " shot " + r };
    });
    const list = parts.map((p, i) => (i === 0 ? (p.plural ? "Cameras " : "Camera ") : (p.plural ? "cameras " : "camera ")) + p.text).join(", ");
    return list + "; the others " + info.common + ".";
  }
  // "2 shot 16:9" (subtítulo da sessão)
  function ratioShortText(info) {
    return info.present.filter((r) => r !== info.common).map((r) => Object.keys(info.byGroup).filter((g) => info.byGroup[g] === r).length + " shot " + r).join(", ");
  }
  function mixedTipText(name, info) {
    return ratioText(info) + (sessionCrop[name] ? " Crop on export: " + sessionCrop[name] + " (keeps " + info.keep[sessionCrop[name]] + "%)." : "");
  }
  function mixedTag(name, info) {
    const t = el("span", "missing-tag mixed-tag", "Mixed ratios");
    t.dataset.itip = mixedTipText(name, info);
    return t;
  }
  function ratioButtonLabel(r, info) { return "Crop on export to " + r + " (keeps " + info.keep[r] + "%)"; }
  function chooseSessionCrop(name, r, info) {
    sessionCrop[name] = r;
    saveSessionCrop();
    const s = sessions.find((x) => x.name === name);
    if (s) { s.crop = r + "|0.500|0.500"; if (typeof window.setSessionCrop === "function") window.setSessionCrop(name, s.crop); }
    if (exp.settings[name]) exp.settings[name].crop.loaded = false;  // o Export relê a escolha
    log("Crop on export: " + r + " for " + sessionLabel(name).date, "ok", "Keeps " + info.keep[r] + "% of the photos on average. The photos are not changed; Export sessions will use it.");
    if (currentSession && currentSession.name === name) sessionHead(currentSession);
  }
  // Aviso (janela), uma vez por combinação de câmeras/proporções por uso do app
  // batch: as sessões do mesmo disparo ("Sessions" > 1); a escolha feita na janela vale para todas as misturadas
  function maybeWarnMixed(session, info, batch) {
    if (!info.mixed) return;
    const names = batch && batch.length ? batch : [session.name];
    let memo = null;
    const chooseAll = (r) => { if (memo) memo.choice = r; names.forEach((n) => {
      const s2 = sessions.find((x) => x.name === n);
      if (!s2) return;
      measureSessionRatios(s2).then((i2) => { if (i2 && i2.mixed && !sessionCrop[n]) chooseSessionCrop(n, r, i2); });
    }); };
    const sig = Object.keys(info.byGroup).sort().map((g) => g + "=" + info.byGroup[g]).join(",");
    // Já avisado nesta combinação: a escolha feita na janela vale também para os disparos seguintes (até mudar o
    // Camera settings, que faz o aviso voltar). "Keep as shot" não guarda nada.
    if (ratioWarned[sig]) { const c = ratioWarned[sig].choice; if (c && !sessionCrop[session.name]) chooseSessionCrop(session.name, c, info); return; }
    memo = ratioWarned[sig] = { choice: null };
    // Linha do disparo em âmbar
    if (/^Done/.test(ui.progress.textContent) && !/Mixed ratios/.test(ui.progress.textContent)) { ui.progress.textContent += " · Mixed ratios"; ui.progress.classList.add("warn"); }
    const others = el("div", "ratio-others");
    others.appendChild(el("span", "ratio-others-label", "Other ratios on export"));
    RATIO_ORDER.filter((r) => r !== info.suggest).forEach((r) => {
      const b = el("button", "btn btn-secondary btn-small ratio-chip"); b.type = "button";
      b.appendChild(document.createTextNode(r + " "));
      b.appendChild(el("span", "dim", "· keeps " + info.keep[r] + "%"));
      b.addEventListener("click", () => { ui.dialogOverlay.classList.add("hidden"); chooseAll(r); });
      others.appendChild(b);
    });
    dialog("Mixed ratios",
      ratioText(info) + "\n\nThe photos in " + (names.length > 1 ? "the " + names.length + " sessions of this shoot" : "this session") + " do not all have the same shape. You can match the cameras, or crop every photo to one ratio when you export (the photos are not changed).",
      [{ label: "Keep as shot", link: true, left: true },
       { label: "Open Camera settings", onClick: () => $("camSettingsBtn").click() },
       { label: ratioButtonLabel(info.suggest, info), primary: true, onClick: () => chooseAll(info.suggest) }],
      others);
  }

  function showSession(session, keepIndex) {
    // Tela cheia tocando: a sessão seguinte continua tocando (pausada, fica pausada)
    const resume = !!playTimer && isFullscreen();
    stopPlay();
    if (editing.on) setEditing(false);
    currentSession = session;
    renderSessionList();
    ui.viewerEmpty.classList.toggle("hidden", !!session);
    ui.sessionGallery.classList.toggle("hidden", !session);
    if (!session) {
      if (isFullscreen()) setFullscreen(false);
      return;
    }

    sessionHead(session);
    const items = sessionItems(session);
    sessionTitles = items.map((i) => i.title).join("|");
    sessionGallery.setItems(items, keepIndex ? sessionGallery.index : 0);
    measureSessionRatios(session);  // (as marcas de proporção aparecem quando a medida fica pronta)
    if (resume && isFullscreen() && !editing.on) togglePlay();
  }

  // As câmeras podem conectar depois que a sessão já está na tela: atualiza os nomes
  function refreshSessionTitles() {
    if (!currentSession || playTimer || editing.on) return;
    const titles = sessionItems(currentSession).map((i) => i.title).join("|");
    if (titles !== sessionTitles) showSession(currentSession, true);
  }

  // ----- Reordenar as fotos de uma sessão -----
  function setEditing(on) {
    editing.on = on;
    sessionGallery.setDraggable(on);
    sessionGallery.setActions(currentActions());
    ui.sessionGallery.classList.toggle("editing", on);
    updateButtons();
  }

  function startReorder() {
    if (!currentSession) return;
    stopPlay();
    setEditing(true);
    sessionHead(currentSession);
  }

  function stopReorder(save) {
    const session = currentSession;
    const groups = sessionGallery.items.filter((i) => i.movable).map((i) => i.group);
    const changed = groups.join("|") !== sessionItems(session).filter((i) => i.movable).map((i) => i.group).join("|");
    // Números novos já na tela, enquanto os arquivos são renomeados
    if (save && changed) sessionGallery.items.forEach((item, i) => { item.order = i + 1; });
    setEditing(false);
    if (save && changed) saveOrder(session);
    else showSession(session, true);
  }
  // Os arquivos de uma sessão vão ser renumerados na ordem "groups" ("NN_câmera"): as prévias já
  // carregadas passam para os nomes novos (o app renomeia as prévias dele do mesmo jeito)
  function remapPhotoCache(sessionName, groups) {
    const prefix = "sessions/" + sessionName + "/";
    const moved = {};
    Object.keys(photoCache).filter((k) => k.startsWith(prefix)).forEach((k) => {
      const rest = k.slice(prefix.length), cut = rest.lastIndexOf("/");
      const file = rest.slice(0, cut), size = rest.slice(cut);
      const at = groups.findIndex((g) => file.startsWith(g + "_"));
      const renamed = at < 0 ? file : pad(at + 1) + file.slice(groups[at].indexOf("_"));
      moved[prefix + renamed + size] = photoCache[k];
      delete photoCache[k];
    });
    Object.assign(photoCache, moved);
  }
  // Grava a ordem que está na galeria (modo Reorder ou arraste direto); um passo no Desfazer
  function saveOrder(session) {
    if (!session) return;
    const groups = sessionGallery.items.filter((i) => i.movable).map((i) => i.group);
    // As prévias guardadas usam os nomes antigos dos arquivos
    const before = sessionItems(session).filter((i) => i.movable).map((i) => i.group);
    if (before.join("|") === groups.join("|")) return;
    // As miniaturas já carregadas passam para os nomes novos dos arquivos (não precisam ser lidas de novo)
    const clearCache = (order) => remapPhotoCache(session.name, order);
    clearCache(groups);
    window.reorderSession(session.name, ...groups);
    log("Photo order changed in the session from " + sessionLabel(session.name).date, "ok");
    // Desfazer: a ordem anterior, pelos nomes de grupo que os arquivos têm depois de renumerados
    // (o grupo é "NN_câmera"; depois do rename o número muda, então refaz pelo nome da câmera)
    const camOf = (g) => g.replace(/^\d+_/, "");
    const currentGroupsFor = (camOrder) => { const now = sessionItems(sessions.find((x) => x.name === session.name) || session).filter((i) => i.movable); return camOrder.map((c) => (now.find((i) => camOf(i.group) === c) || {}).group).filter(Boolean); };
    recordAction({ label: "Photo order in " + sessionLabel(session.name).date,
      undo: () => { const g = currentGroupsFor(before.map(camOf)); clearCache(g); window.reorderSession(session.name, ...g); },
      redo: () => { const g = currentGroupsFor(groups.map(camOf)); clearCache(g); window.reorderSession(session.name, ...g); } });
  }

  // ----- Tela cheia -----
  const sessionsPanel = document.querySelector(".sessions-panel");
  function setFullscreen(on) {
    if (on && !currentSession) return;
    if (!on) {
      stopPlay();
      if (editing.on) stopReorder(false);
    }
    const entering = on && !isFullscreen();
    sessionsPanel.classList.toggle("fullscreen", on);
    if (!on) setSideWide(false);
    hideRailTip();
    sessionGallery.setActions(currentActions());
    queueHeadFit();
    if (entering) showStageCtrls(CTRLS_REVEAL_MS);  // os controles sobre a foto já aparecem ao entrar
    // Entrar na tela cheia já toca a sessão
    if (entering && !playTimer && !editing.on) togglePlay();
  }
  function isFullscreen() {
    return sessionsPanel.classList.contains("fullscreen");
  }
  // Barra das sessões na tela cheia: sempre à vista, só com ícones
  const sideAside = ui.sessionList.parentElement;
  // Botão de cima da barra: mostra os nomes (barra larga, fica aberta) ou volta aos ícones
  function setSideWide(on) {
    sessionsPanel.classList.toggle("side-wide", !!on && isFullscreen());
    const b = $("sideWideBtn"), wide = sessionsPanel.classList.contains("side-wide");
    b.title = wide ? "Hide the session names" : "Show the session names";
    b.setAttribute("aria-label", b.title);
    b.setAttribute("aria-pressed", wide ? "true" : "false");
    hideRailTip();
  }
  $("sideWideBtn").addEventListener("click", () => setSideWide(!sessionsPanel.classList.contains("side-wide")));
  // Legenda da barra só de ícones: aparece na hora, ao lado do ícone, no visual do app (no lugar da
  // legenda do sistema, que demora); nos outros lugares fica a do sistema
  const railTip = el("div", "rail-tip hidden");
  document.body.appendChild(railTip);
  let railTipOn = null;
  function railMode() { return isFullscreen() && !sessionsPanel.classList.contains("side-wide"); }
  function hideRailTip() {
    railTip.classList.add("hidden");
    if (railTipOn && railTipOn.dataset.savedTitle !== undefined) { railTipOn.title = railTipOn.dataset.savedTitle; delete railTipOn.dataset.savedTitle; }
    railTipOn = null;
  }
  sideAside.addEventListener("pointerover", (e) => {
    if (!railMode() || sessDrag || e.pointerType === "touch") return;
    const t = e.target.closest("[data-tip], [title]");
    if (!t || !sideAside.contains(t) || t === railTipOn) return;
    hideRailTip();
    const text = t.dataset.tip || t.title;
    if (!text) return;
    // Sem a legenda do sistema por cima desta
    if (t.hasAttribute("title")) { t.dataset.savedTitle = t.title; t.removeAttribute("title"); }
    railTipOn = t;
    railTip.textContent = text;
    // A parte do aviso (data-tip-warn) em âmbar
    if (t.dataset.tipWarn) { railTip.appendChild(document.createTextNode(" · ")); railTip.appendChild(el("span", "warn", t.dataset.tipWarn)); }
    const r = t.getBoundingClientRect();
    railTip.style.left = (sideAside.getBoundingClientRect().right + 8) + "px";
    railTip.style.top = (r.top + r.height / 2) + "px";
    railTip.classList.remove("hidden");
  });
  sideAside.addEventListener("pointerout", (e) => { if (railTipOn && !(e.relatedTarget && railTipOn.contains(e.relatedTarget))) hideRailTip(); });
  sideAside.addEventListener("pointerdown", hideRailTip);
  sideAside.addEventListener("scroll", hideRailTip);
  // A mesma legenda na lista de sessões do Export quando ela está só com miniaturas (tela "Align photos")
  {
    const list = $("exportList");
    list.addEventListener("pointerover", (e) => {
      if (!list.closest(".export-body").classList.contains("aligning") || e.pointerType === "touch") return;
      const t = e.target.closest(".export-item");
      if (!t || t === railTipOn || !t.dataset.tip) return;
      hideRailTip();
      if (t.hasAttribute("title")) { t.dataset.savedTitle = t.title; t.removeAttribute("title"); }
      railTipOn = t;
      railTip.textContent = t.dataset.tip;
      if (t.dataset.tipWarn) { railTip.appendChild(document.createTextNode(" · ")); railTip.appendChild(el("span", "warn", t.dataset.tipWarn)); }
      const r = t.getBoundingClientRect();
      railTip.style.left = (list.getBoundingClientRect().right + 8) + "px";
      railTip.style.top = (r.top + r.height / 2) + "px";
      railTip.classList.remove("hidden");
    });
    list.addEventListener("pointerout", (e) => { if (railTipOn && list.contains(railTipOn) && !(e.relatedTarget && railTipOn.contains(e.relatedTarget))) hideRailTip(); });
    list.addEventListener("pointerdown", hideRailTip);
    list.addEventListener("scroll", hideRailTip);
  }
  // Explicação instantânea ([data-itip]): uma caixa no visual do app, embaixo do elemento, sem a espera da
  // legenda do sistema. Usada no ícone de alerta da proporção (Camera settings).
  const itip = el("div", "itip hidden");
  document.body.appendChild(itip);
  let itipOn = null, itipTitles = [];
  function hideItip() {
    itip.classList.add("hidden"); itipOn = null;
    itipTitles.forEach(([n, title]) => n.setAttribute("title", title)); itipTitles = [];
  }
  function showItip(t) {
    if (!t || t === itipOn) return;
    hideItip();
    itipOn = t;
    // Sem a legenda do sistema (ex.: o nome da câmera na miniatura) por cima da caixa
    for (let n = t; n && n.nodeType === 1; n = n.parentElement) if (n.hasAttribute("title")) { itipTitles.push([n, n.getAttribute("title")]); n.removeAttribute("title"); }
    itip.textContent = t.dataset.itip;
    itip.classList.remove("hidden");
    const r = t.getBoundingClientRect();
    const w = itip.offsetWidth, h = itip.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    itip.style.left = left + "px";
    itip.style.top = top + "px";
  }
  document.addEventListener("pointerover", (e) => { if (e.pointerType !== "touch") showItip(e.target.closest("[data-itip]")); });
  document.addEventListener("pointerout", (e) => { if (itipOn && !(e.relatedTarget && itipOn.contains(e.relatedTarget))) hideItip(); });
  document.addEventListener("focusin", (e) => showItip(e.target.closest("[data-itip]")));
  document.addEventListener("focusout", hideItip);
  document.addEventListener("pointerdown", hideItip, true);
  document.addEventListener("scroll", hideItip, true);
  // Teclas de seleção apertadas: o botão "Add to project" não reage ao ponteiro (o clique só marca)
  const modKeys = (e) => document.body.classList.toggle("mod-keys", e.metaKey || e.ctrlKey || e.shiftKey);
  document.addEventListener("keydown", modKeys, true);
  document.addEventListener("keyup", modKeys, true);
  window.addEventListener("blur", () => document.body.classList.remove("mod-keys"));
  document.addEventListener("mousemove", (e) => { if (document.body.classList.contains("mod-keys") !== (e.metaKey || e.ctrlKey || e.shiftKey)) modKeys(e); });
  function toggleFullscreen() {
    setFullscreen(!isFullscreen());
  }

  // ----- Apagar uma foto -----
  function deleteCurrentPhoto() {
    if (!currentSession || editing.on) return;
    const picked = sessionGallery.selection.map((k) => sessionGallery.items[k]).filter(Boolean);
    if (!picked.length) return;
    stopPlay();
    const session = currentSession.name;
    const one = picked.length === 1, item = picked[0];
    const groups = picked.map((x) => x.group);
    const files = picked.reduce((t, x) => t + x.files.length, 0);
    const what = one ? item.title + (item.subtitle ? " (" + item.subtitle + ")" : "") + ". " : picked.map((x) => pad(x.order || 0)).join(", ") + ". ";
    dialog(one ? "Delete photo " + pad(item.order || sessionGallery.index + 1) + "?" : "Delete " + picked.length + " photos?",
      what + (one ? (item.files.length > 1 ? "Its RAW and JPEG files go" : "The file goes") : plural(files, "file goes", "files go")) + " to the Trash (top bar), where " + (files > 1 ? "they stay" : "it stays") + " for " + trash.days + " days.", [
        { label: "Cancel" },
        { label: "Delete", danger: true, onClick: () => deletePhotosNow(sessionGallery.selection, false) },
      ]);
  }
  // Apaga as fotos (posições na galeria). dropped: soltas em cima da lixeira (a cópia já está lá)
  function deletePhotosNow(indices, dropped) {
    if (!currentSession || editing.on) return;
    const picked = indices.map((k) => sessionGallery.items[k]).filter(Boolean);
    if (!picked.length) return;
    stopPlay();
    const session = currentSession.name;
    const one = picked.length === 1, item = picked[0];
    const groups = picked.map((x) => x.group);
    // As miniaturas encolhem e somem, a foto grande se apaga; só então os arquivos vão embora
    const frames = [...ui.sessionGallery.querySelectorAll(".carousel .frame")];
    const thumbs = indices.map((k) => frames[k]).filter(Boolean);
    const big = ui.sessionGallery.querySelector(".stage img");
    if (dropped) {
      const t = trashTarget();
      if (t && t.animate) t.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" });
    } else flyNodesToTrash(thumbs);  // as miniaturas voam até o ícone da lixeira
    thumbs.forEach((t) => t.animate && t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in", fill: "forwards" }));
    if (big && big.animate && big.getAttribute("src")) big.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.85)" }], { duration: 260, easing: "ease-in", fill: "forwards" });
    // A foto grande volta a aparecer quando a próxima carregar (ou, se nada mudar, em 1,5 s)
    const reveal = () => { if (big) big.getAnimations().forEach((a) => a.cancel()); thumbs.forEach((t) => t.isConnected && t.getAnimations().forEach((a) => a.cancel())); };
    setTimeout(() => {
      window.deletePhotos(session, ...groups);
      if (big) big.addEventListener("load", reveal, { once: true });
      setTimeout(reveal, 1500);
    }, 270);
    const label = one ? "Photo " + pad(item.order || 0) : plural(picked.length, "photo", "photos");
    toast(label + " deleted from the session of " + sessionLabel(session).date);
    recordAction({ label: "Delete " + (one ? "photo " + pad(item.order || 0) : plural(picked.length, "photo", "photos")) + " from " + sessionLabel(session).date,
      undo: () => restoreSession(session), redo: () => window.deletePhotos(session, ...groups) });
  }

  // Mostra uma sessão que acabou de voltar (relê a lista antes, para ela já estar lá)
  function reopenSession(name, full) {
    return Promise.resolve(window.listSessions()).then((list) => {
      if (Array.isArray(list)) setSessions(list);
      const s = sessions.find((x) => x.name === name);
      if (!s) return;
      showSession(s);
      if (full) setFullscreen(true);
    });
  }
  function deleteCurrentSession() { if (currentSession) deleteSessionAsk(currentSession); }
  // Traz de volta da lixeira do app (sessão inteira ou as fotos apagadas); false se não deu
  function restoreSession(name) {
    if (typeof window.restoreSession !== "function") { toast("This build cannot restore deleted sessions yet. Build the app again.", 8000); return false; }
    return Promise.resolve(window.restoreSession(name)).then((r) => {
      if (r && r.ok) return true;
      toast((r && r.error) || "Could not restore the session.", 8000);
      return false;
    });
  }
  // Apagar sessão: uma cópia da linha voa até o botão da lixeira (encolhendo e sumindo), a linha
  // fecha no lugar e a lixeira dá um pulo; só então a sessão é apagada
  function trashTarget() {
    // Na tela cheia, o botão da lixeira dela; fora, o da barra de cima
    if (isFullscreen() && fullTrashOpenBtn.offsetParent) return fullTrashOpenBtn;
    const b = $("trashBtn");
    return b && b.offsetParent && b.getBoundingClientRect().width ? b : null;
  }
  // Cópias de elementos (miniaturas de fotos) voam até o ícone da lixeira
  function flyNodesToTrash(nodes) {
    const trash = trashTarget();
    const to = trash ? trash.getBoundingClientRect() : null;
    nodes.forEach((node, k) => {
      if (!node || !node.animate) return;
      const from = node.getBoundingClientRect();
      if (!from.width) return;
      const ghost = node.cloneNode(true);
      ghost.classList.add("trash-ghost");
      Object.assign(ghost.style, { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px", margin: "0" });
      document.body.appendChild(ghost);
      const dx = to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
      const dy = to ? to.top + to.height / 2 - (from.top + from.height / 2) : -60;
      const a = ghost.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 },
                               { transform: "translate(" + dx * 0.5 + "px, " + (dy * 0.5 - 30) + "px) scale(.55)", opacity: .9, offset: .5 },
                               { transform: "translate(" + dx + "px, " + dy + "px) scale(.08)", opacity: 0 }],
                              { duration: 520, delay: k * 40, easing: "cubic-bezier(.5, 0, .7, 1)", fill: "forwards" });
      a.onfinish = () => ghost.remove();
      setTimeout(() => ghost.remove(), 1200 + k * 40);
    });
    if (trash && trash.animate) setTimeout(() => trash.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" }), 470 + (nodes.length - 1) * 40);
  }
  function flyToTrash(name, done) {
    const full = isFullscreen() && currentSession && currentSession.name === name;
    // Tela cheia: a área da foto (miniaturas + foto grande) vai até o ícone da lixeira da tela cheia
    const li = full ? ui.sessionGallery.querySelector(".stage")
      : [...ui.sessionList.querySelectorAll("li.folder")].find((x) => x.dataset.name === name);
    // Vai para o ícone da lixeira da barra de cima (na tela cheia, para onde ele fica)
    const trash = trashTarget() || (full ? fullTrashBtn : compactActions[0]);
    const from = li && !li.classList.contains("hidden") ? li.getBoundingClientRect() : null;
    const to = trash && trash.offsetParent ? trash.getBoundingClientRect() : null;
    if (!from || !from.width || !li.animate) { done(); return; }
    const ghost = li.cloneNode(true);
    if (full) ghost.classList.add("stage-ghost");
    ghost.classList.add("trash-ghost");
    Object.assign(ghost.style, { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px" });
    document.body.appendChild(ghost);
    const dx = to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
    const dy = to ? to.top + to.height / 2 - (from.top + from.height / 2) : 40;
    ghost.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 },
                   { transform: "translate(" + dx * 0.5 + "px, " + (dy * 0.5 - 30) + "px) scale(.55)", opacity: .9, offset: .5 },
                   { transform: "translate(" + dx + "px, " + dy + "px) scale(.08)", opacity: 0 }],
                  { duration: 520, easing: "cubic-bezier(.5, 0, .7, 1)", fill: "forwards" });
    if (full) {
      // Na tela cheia a foto e as miniaturas se apagam no lugar enquanto a cópia voa
      [li, ui.sessionGallery.querySelector(".carousel-wrap")].forEach((n) => n && n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease", fill: "forwards" }));
      setTimeout(() => [li, ui.sessionGallery.querySelector(".carousel-wrap")].forEach((n) => n && n.getAnimations().forEach((a) => a.cancel())), 900);
    } else {
      li.animate([{ height: from.height + "px", opacity: 1 }, { height: "0px", opacity: 0, marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" }],
                 { duration: 360, delay: 120, easing: "ease", fill: "forwards" });
    }
    setTimeout(() => { if (to && trash.animate) trash.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" }); }, 470);
    setTimeout(() => { ghost.remove(); done(); }, 540);
  }
  // Soltar no botão da lixeira já é a confirmação: apaga sem perguntar (Cmd+Z ou a Trash trazem de volta)
  function deleteSessionsNow(names) {
    const list = names.map((n) => sessions.find((x) => x.name === n)).filter(Boolean);
    if (!list.length || busy) return;
    const ns = list.map((x) => x.name);
    const wasFull = isFullscreen() && currentSession && ns.includes(currentSession.name);
    const openName = currentSession && currentSession.name;
    sessSel.clear();
    toast(ns.length === 1 ? "Session deleted: " + sessionLabel(ns[0]).date + (list[0].inProject ? " (from the project folder)" : "") : plural(ns.length, "session", "sessions") + " deleted");
    log("Deleted " + (ns.length === 1 ? "session " + sessionLabel(ns[0]).date : plural(ns.length, "session", "sessions") + ": " + ns.map((n) => sessionLabel(n).date).join(", ")), "ok");
    ns.forEach((n) => flyToTrash(n, () => window.deleteSession(n)));
    recordAction({ label: "Delete " + (ns.length === 1 ? "session " + sessionLabel(ns[0]).date : plural(ns.length, "session", "sessions")),
      undo: () => Promise.all(ns.map((n) => restoreSession(n))).then((r) => {
        const ok = r.some(Boolean);
        // A que estava aberta volta aberta (na tela cheia, se foi apagada nela)
        if (ok && ns.includes(openName)) reopenSession(openName, wasFull);
        return ok;
      }),
      redo: () => { ns.forEach((n) => window.deleteSession(n)); } });
  }
  function deleteSessionAsk(s) {
    const label = sessionLabel(s.name);
    dialog("Delete this session?", "The photos from " + label.date + " go to the Trash (top bar, next to the project), where they stay for " + trash.days + " days" +
      (s.inProject ? ". They leave the session list and the project's Originals folder; the project keeps them in its own trash." : "."), [
      { label: "Cancel" },
      { label: "Delete", danger: true, onClick: () => {
        toast("Session deleted: " + label.date + (s.inProject ? " (from the project folder)" : ""));
        const wasFull = isFullscreen() && currentSession && currentSession.name === s.name;
        flyToTrash(s.name, () => window.deleteSession(s.name));
        // Desfazer: a sessão volta e fica aberta (na tela cheia, se foi apagada nela)
        recordAction({ label: "Delete session " + label.date, undo: () => Promise.resolve(restoreSession(s.name)).then((ok) => { if (ok) reopenSession(s.name, wasFull); return ok; }),
                       redo: () => window.deleteSession(s.name) });
      } },
    ]);
  }

  let playDirection = 1;
  function playStep() {
    const count = sessionGallery.items.length;
    if (count < 2 || !reverseLoop.checked) return sessionGallery.next(false);
    let i = sessionGallery.index + playDirection;
    if (i >= count) { playDirection = -1; i = count - 2; }
    else if (i < 0) { playDirection = 1; i = 1; }
    sessionGallery.select(i, false);  // sem rolar a fileira: só a marca da miniatura anda
  }

  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.innerHTML = icon("play");
  }

  function togglePlay() {
    if (playTimer) return stopPlay();
    if (!currentSession || editing.on) return;
    playBtn.innerHTML = icon("pause");
    playDirection = 1;
    playTimer = setInterval(playStep, playInterval());
  }

  // =================== Reordenar por foto ===================
  const order = { open: false, capturing: false, session: null };
  const orderGallery = Gallery(ui.orderGallery, {
    draggable: true,
    // Cada mudança de ordem (arrastar ou setas) é um passo no Desfazer, mesmo antes de "Save";
    // esses passos somem quando a janela fecha
    onReorder: (items, before) => {
      const after = items.slice();
      recordAction({ label: "Photo order in Reorder by photo", orderWindow: true,
        undo: () => (order.open ? orderGallery.setOrder(before) : false),
        redo: () => (order.open ? orderGallery.setOrder(after) : false) });
    },
    load: (item, size) => orderPhoto(item.session, item.file, size),
  });
  // Teste rápido do Camera settings (fotos temporárias, as mesmas do "Reorder by photo")
  const csGallery = Gallery($("csGallery"), {
    draggable: false,
    fitThumbs: true,
    // Foto que saiu numa proporção diferente da que a câmera informa (medida pelo Match): seleção âmbar tracejada
    warnItem: (item) => !!(csTest.ratios[item.name] && csTest.ratios[item.name].differs),
    warnTip: (item) => ratioWhy(csTest.ratios[item.name]),
    load: (item, size) => orderPhoto(item.session, item.file, size),
  });
  // Só a fileira de miniaturas (maiores); clicar numa abre a foto grande por cima da
  // janela, com ← → e Esc. "Hide photos" recolhe a fileira.
  let csZoom = false, csCollapsed = false;
  const csHideBtn = button("Hide photos", () => csSetCollapsed(!csCollapsed), { kind: "btn-link" });
  csGallery.setActions([csHideBtn]);
  csGallery.setStageTools([
    button("", () => csGallery.prev(), { icon: "left", title: "Previous camera" }),
    button("", () => csGallery.next(), { icon: "right", title: "Next camera" }),
    button("Close", () => csSetZoom(false), { title: "Close (Esc)" }),
  ]);
  function csSetZoom(on) {
    csZoom = !!on && csTest.has;
    $("csTestBox").classList.toggle("zoom", csZoom);
  }
  function csSetCollapsed(on) {
    const wrap = $("csTestBox").querySelector(".carousel-wrap");
    if (on && !csCollapsed && wrap && !wrap.classList.contains("hidden") && wrap.offsetHeight) {
      // Recolhe deslizando; no fim esconde de fato
      csCollapsed = true;
      csHideBtn.textContent = "Show photos";
      csSetZoom(false);
      slideClosed(wrap, () => { if (csCollapsed) $("csTestBox").classList.add("collapsed"); });
      return;
    }
    const opening = !on && csCollapsed;
    csCollapsed = !!on;
    $("csTestBox").classList.toggle("collapsed", csCollapsed);
    if (opening && wrap) slideOpen(wrap);
    csHideBtn.textContent = csCollapsed ? "Show photos" : "Hide photos";
    if (csCollapsed) csSetZoom(false);
  }
  $("csGallery").querySelector(".carousel").addEventListener("click", (e) => { if (e.target.closest(".frame")) csSetZoom(true); });
  $("csGallery").querySelector(".stage").addEventListener("click", (e) => { if (e.target === e.currentTarget) csSetZoom(false); });
  orderGallery.setActions([
    button("Move earlier", () => orderGallery.moveSelected(-1), { icon: "left" }),
    button("Move later", () => orderGallery.moveSelected(1), { icon: "right" }),
  ]);

  function openOrder() {
    order.open = true;
    ui.orderOverlay.classList.remove("hidden");
    takeOrderPhotos();
  }

  function takeOrderPhotos() {
    order.capturing = true;
    order.session = null;
    orderGallery.setItems([]);
    orderGallery.setHead("Taking a photo with each camera", "");
    orderGallery.message("Taking a photo with each camera");
    updateOrderButtons();
    window.takeOrderPhotos(intValue(ui.downloadWait, 1, 10));
  }

  function showOrderPhotos(list) {
    order.capturing = false;
    const session = (list || [])[0];
    order.session = session ? session.name : null;

    // Uma foto por câmera conectada, na ordem atual (JPEG quando houver RAW + JPEG)
    const items = placedCameras().filter((c) => c.connected).map((cam) => {
      const photos = session ? session.photos.filter((p) => p.camera === cam.name) : [];
      const pick = photos.find((p) => /\.jpe?g$/i.test(p.file)) || photos.find((p) => p.previewable) || photos[0];
      return {
        name: cam.name, session: order.session,
        file: pick ? pick.file : "", previewable: pick ? pick.previewable : false,
        title: shortModel(cam.model), subtitle: cam.name,
      };
    });
    orderGallery.setItems(items, 0);
    const missing = items.filter((i) => !i.file).length;
    orderGallery.setHead(plural(items.length, "camera", "cameras"),
      missing ? plural(missing, "camera", "cameras") + " did not send a photo" : "Drag a photo, or select it and use Move earlier / Move later");
    updateOrderButtons();
  }

  function closeOrder(save) {
    // Os passos de ordem da janela não valem fora dela
    history.undo = history.undo.filter((a) => !a.orderWindow);
    history.redo = history.redo.filter((a) => !a.orderWindow);
    if (save) {
      const names = orderGallery.items.map((i) => i.name);
      applyCameraOrder(names, "Camera order from photos");
      log("Camera order updated from photos", "ok");
    }
    order.open = false;
    order.capturing = false;
    ui.orderOverlay.classList.add("hidden");
    window.discardOrderPhotos();
    Object.keys(photoCache).filter((k) => k.startsWith("order/")).forEach((k) => delete photoCache[k]);
  }

  function updateOrderButtons() {
    ui.orderRetake.disabled = order.capturing;
    ui.orderSave.disabled = order.capturing || orderGallery.items.length < 1;
  }

  ui.orderBtn.addEventListener("click", openOrder);
  ui.orderRetake.addEventListener("click", takeOrderPhotos);
  ui.orderCancel.addEventListener("click", () => closeOrder(false));
  ui.orderSave.addEventListener("click", () => closeOrder(true));

  // =================== Teclado ===================
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || !ui.dialogOverlay.classList.contains("hidden")) return;
    const target = order.open ? orderGallery : currentSession ? sessionGallery : null;
    if (!target) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); stopPlay();
      if (target === sessionGallery) photoKeys = true;
      const d = e.key === "ArrowRight" ? 1 : -1;
      // Shift+← →: marca várias fotos (só na sessão aberta)
      if (e.shiftKey && target === sessionGallery && !editing.on) target.extendTo(target.index + d);
      else if (d > 0) target.next(); else target.prev();
    }
    if (e.key === " " && !order.open && (isFullscreen() || playTimer)) { e.preventDefault(); togglePlay(); }
    if (order.open) return;
    // Sessão: Esc sai da reordenação ou da tela cheia; F tela cheia; Delete apaga a foto
    if (e.key === "Escape") {
      if (editing.on) stopReorder(false);
      else if (isFullscreen()) setFullscreen(false);
    }
    // preventDefault: no Mac, uma tecla que a página não marca como usada faz o sistema dar o som de erro
    if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey && !editing.on) { e.preventDefault(); toggleFullscreen(); }
    if ((e.key === "Delete" || e.key === "Backspace") && !editing.on && (isFullscreen() || photoKeys)) { e.preventDefault(); deleteCurrentPhoto(); }
  });

  // Mac: letra solta fora de um campo de texto, que nenhum atalho usou, não faz o som de erro do sistema
  // (o espaço fica de fora: ele aperta botões e caixas de marcar)
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
    const t = e.target;
    if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
    e.preventDefault();
  });

  // =================== Salvar / sair ===================
  // "Save sessions" pergunta Photos ou Sequence. Depois, uma janela com todas as
  // sessões: cada uma tem a sua configuração (formato, ou formatos, velocidade,
  // loops...), que pode ser copiada para todas. As sessões não marcadas podem ser
  // apagadas, só depois que as marcadas forem salvas.
  const FPS_STEPS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30];
  const PHOTO_FORMATS = [["original", "Original"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WEBP"], ["tiff", "TIFF"], ["heic", "HEIC"]];
  const SEQ_FORMATS = ["mp4", "mov", "gif", "webp", "avif"];
  const SIZES = [[720, "720p"], [1080, "1080p"], [2160, "4K"]];
  const QUALITIES = [["standard", "Standard"], ["high", "High"], ["maximum", "Maximum"]];
  const LOSSY_PHOTOS = ["jpg", "webp", "heic"];  // PNG e TIFF são sempre sem perda
  // Lenticular (etapa 19): lâminas e saídas de fábrica (decisão do dono, 2026-10-30); "Other" = digitar
  const LENSES = [[40, "40 LPI"], [50, "50 LPI"], [60, "60 LPI"], [75, "75 LPI"], [100, "100 LPI"]];
  const LENSES_3D = [[20, "20 LPI"], [30, "30 LPI"], [40, "40 LPI"]];
  const PRINTERS = [[600, "600 dpi"], [720, "720 dpi"], [1200, "1200 dpi"], [1440, "1440 dpi"]];
  const PRINTER_HELP = "Use the printer's native resolution, not the maximum: Epson photo printers work at 720 or 1440 dpi; HP and Canon at 600 or 1200. For a print shop, ask them.";
  const CM_PER_IN = 2.54;
  function qualityLabel(q) { return QUALITIES.find((x) => x[0] === q)[1]; }
  // As três saídas de uma sessão (seções da janela de salvar); a chave de configuração de cada uma
  const OUTPUTS = [["photos", "Photos", "one file per camera"], ["sequence", "Sequence", "video or animated image"],
                   ["lenticular", "Lenticular", "interlaced TIFF for a lens sheet"]];
  const OUTPUT_KINDS = OUTPUTS.map(([k]) => k);
  const OUTPUT_KEYS = ["outputs", "photos", "seq", "lent", "naming"];
  const exp = { step: 1, mode: "photos", exitAfter: false, selected: new Set(), active: "", settings: {}, heic: { ok: true, reason: "" },
                timer: null, frame: 0, photo: 0, project: false,
                // "Same settings for all sessions", uma por saída (decisão do dono, 2026-11-04); o nome é sempre comum
                same: { photos: true, sequence: true, lenticular: true }, sameFraming: true };
  const OUTPUT_KEY_OF = { photos: "photos", sequence: "seq", lenticular: "lent" };
  function anyPerSession() { return OUTPUT_KINDS.some((k) => !exp.same[k]); }
  // O que se compara entre as sessões em cada passo: o Framing (passo 1) ou as saídas (passo 2; uma saída ou todas)
  function stepConfig(name, step, kind) {
    const st = settingsFor(name);
    if (step === 1) { const s = sessions.find((x) => x.name === name); if (s) cropLoad(s, st); return st.crop.ratio + "|" + st.crop.x.toFixed(3) + "|" + st.crop.y.toFixed(3); }
    const kinds = kind ? [kind] : OUTPUT_KINDS;
    return JSON.stringify(kinds.map((k) => [!!st.outputs[k], st[OUTPUT_KEY_OF[k]]]));
  }
  // "Different": as sessões marcadas que fogem da configuração mais comum (empate: a da primeira da lista). Não depende
  // de qual sessão está aberta, então a etiqueta não muda de lugar ao clicar nas sessões.
  function differentSessions(step, kind) {
    const chosen = chosenSessions(); if (chosen.length < 2) return new Set();
    const keys = chosen.map((o) => stepConfig(o.name, step, kind)), count = {};
    keys.forEach((k) => { count[k] = (count[k] || 0) + 1; });
    let common = keys[0]; keys.forEach((k) => { if (count[k] > count[common]) common = k; });
    return new Set(chosen.filter((o, i) => keys[i] !== common).map((o) => o.name));
  }
  // Estado da caixa "Same … for all sessions" (o mesmo nos dois passos): marcada = iguais e ligadas (mudar uma muda
  // todas); traço = algumas diferentes; vazia = iguais, mas cada uma pode mudar sozinha
  function sameState(linked, step, kind) {
    const differs = differentSessions(step, kind).size > 0;
    return differs ? "mixed" : linked ? "on" : "off";
  }

  // Configuração da sessão aberta igual nas outras (saídas ligadas, as três configurações e o nome)
  // As duas sessões têm a mesma configuração numa saída (framing: proporção, posição e Same size)
  function sameKind(a, b, kind) {
    const x = settingsFor(a), y = settingsFor(b);
    const keys = kind === "framing" ? ["crop"] : kind === "photos" ? ["photos"] : kind === "sequence" ? ["seq"] : ["lent"];
    const pick = (st) => keys.map((k) => { const v = Object.assign({}, st[k]); delete v.loaded; return v; });
    return JSON.stringify(pick(x)) === JSON.stringify(pick(y)) && (kind === "framing" || !!x.outputs[kind] === !!y.outputs[kind]);
  }
  function sameAsActive(name) {
    const a = settingsFor(exp.active), o = settingsFor(name);
    return OUTPUT_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(o[k]));
  }
  // "Same settings for all sessions" ligado: o que muda na sessão aberta vale para todas
  function syncAll() {
    if (!exp.active) return;
    const st = settingsFor(exp.active);
    sessions.forEach((o) => {
      if (o.name === exp.active) return;
      const t = settingsFor(o.name);
      // Cada saída com "Same settings for all sessions" ligado é copiada (configurações e a caixa da aba); o nome sempre
      OUTPUT_KINDS.forEach((k) => { if (!exp.same[k]) return; t[OUTPUT_KEY_OF[k]] = JSON.parse(JSON.stringify(st[OUTPUT_KEY_OF[k]])); t.outputs[k] = st.outputs[k]; });
      t.naming = JSON.parse(JSON.stringify(st.naming));
    });
  }

  // Últimas configurações usadas (gravadas pelo programa em settings.txt): valem como padrão
  // da próxima vez, nesta e nas próximas aberturas do app
  let exportPrefs = null;
  function defaultSettings() {
    const base = { naming: { kind: "date", text: "", date: true, position: "after" },
                   outputs: { photos: true, sequence: false, lenticular: false },
                   // original: copiar como a câmera salvou; convert + format: uma cópia convertida (os dois podem)
                   // sameSize sempre ligado (decisão do dono, 2026-11-03): um recorte para a sessão inteira, todas as fotos no mesmo tamanho
                   photos: { original: true, convert: false, format: "jpg", quality: "high", sameSize: true },
                   // Parte 4 da Proporção: um recorte por sessão (Converted e Sequence; Lenticular usa só a posição)
                   crop: { ratio: "asshot", x: 0.5, y: 0.5, loaded: false },
                   // Pedaço 2 do Framing: alinhamento por foto (arquivo → { dx, dy, scale, rot }), em session.json
                   align: { byFile: {}, loaded: false },
                   seq: { formats: ["mp4"], fps: 6, loops: 3, reverse: true, height: 1080, alsoPhotos: true, quality: "high" },
                   // lpi: lâmina; pitch: medido na folha de teste (0 = usar o nominal); dpi: impressora;
                   // tamanho em cm (unit "cm"|"in" só muda a exibição); effect "flip" (animação) | "3d"
                   lent: { lpi: 60, pitch: 0, dpi: 720, widthCm: 15, heightCm: 10, unit: "cm", effect: "flip", reverse: false,
                           // marcas (entrega 2, decisão do dono em 2026-10-30): corte e alinhamento ligados, sangria 3 mm
                           cropMarks: true, alignMarks: true, bleedMm: 3, placement: "fill" } };
    const p = exportPrefs && exportPrefs.settings;
    if (p) ["naming", "outputs", "photos", "seq", "lent"].forEach((k) => { if (p[k] && typeof p[k] === "object") Object.assign(base[k], JSON.parse(JSON.stringify(p[k]))); });
    // Preferências de antes da 2.14 (um modo só): o modo vira a saída ligada; Sequence com
    // "Also save the photos" liga Photos (Original) também
    if (p && !p.outputs && exportPrefs.mode) {
      const m = exportPrefs.mode;
      base.outputs = { photos: m === "photos" || (m === "sequence" && p.seq && p.seq.alsoPhotos !== false), sequence: m === "sequence", lenticular: m === "lenticular" };
      if (m === "sequence" && base.outputs.photos) base.photos.format = "original";
    }
    delete base.seq.alsoPhotos;
    // Fotos de antes da 2.14 (um formato só, "original" ou outro)
    const oldPhotos = p && (!p.photos || p.photos.original === undefined);
    if (oldPhotos && (p.photos || base.photos.format === "original")) {
      const f = base.photos.format;
      base.photos.original = f === "original";
      base.photos.convert = f !== "original";
    }
    if (base.photos.format === "original") base.photos.format = "jpg";
    return base;
  }
  let exportPrefsTimer = null;
  function rememberExportPrefs() {
    if (!exp.active || typeof window.savePref !== "function") return;
    exportPrefs = { mode: exp.mode, same: exp.same, sameFraming: exp.sameFraming, collapsed: exp.collapsed || {}, previewHidden: !!exp.previewHidden, settings: JSON.parse(JSON.stringify(settingsFor(exp.active))) };
    clearTimeout(exportPrefsTimer);
    exportPrefsTimer = setTimeout(() => window.savePref("export", JSON.stringify(exportPrefs)), 300);
  }
  const startPrefs = { splash: true };  // abertura (logo + chuva de código) ao abrir o app
  function loadPrefs(info) {
    const prefs = (info && info.prefs) || {};
    try { exportPrefs = prefs.export ? JSON.parse(prefs.export) : null; } catch (e) { exportPrefs = null; }
    if (exportPrefs && exportPrefs.same && typeof exportPrefs.same === "object") exp.same = Object.assign({ photos: true, sequence: true, lenticular: true }, exportPrefs.same);
    else if (exportPrefs && typeof exportPrefs.sameForAll === "boolean") exp.same = { photos: exportPrefs.sameForAll, sequence: exportPrefs.sameForAll, lenticular: exportPrefs.sameForAll };
    if (exportPrefs && typeof exportPrefs.sameFraming === "boolean") exp.sameFraming = exportPrefs.sameFraming;
    pitchAsk = prefs.pitchAsk !== "off";
    startPrefs.splash = prefs.splash !== "off";
    lentBand = prefs.lentBand === "white" ? "white" : "black";
  }
  let lentBand = "black";  // Lenticular, Placement Fit: cor da faixa (ajuste geral do app; decisão do dono, 2026-11-03)
  function settingsFor(name) {
    if (!exp.settings[name]) exp.settings[name] = defaultSettings();
    return exp.settings[name];
  }
  // Mesma conta do app (Export::CycleOrder): 1..n e, com reverse, volta até 2
  function cycleOrder(n, reverse) {
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    if (reverse) for (let i = n - 2; i >= 1; i--) order.push(i);
    return order;
  }
  // Data e hora da sessão como fica no nome da pasta: "2026-10-14 16.31.00"
  function dateName(session) {
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(session);
    return m ? m[1] + " " + m[2] + "." + m[3] + "." + m[4] : session;
  }
  function cleanName(text) { return text.replace(/[\/\\:*?"<>|\x00-\x1f]/g, "-").trim().replace(/[ .]+$/, ""); }
  // Nome previsto da pasta (os números finais dependem da pasta escolhida)
  function folderName(session) {
    const n = settingsFor(session.name).naming;
    const text = cleanName(n.text || "");
    if (n.kind === "number") return "01, 02…";
    if (n.kind === "custom" && text) {
      if (n.date) return n.position === "before" ? dateName(session.name) + " " + text : text + " " + dateName(session.name);
      const same = sessions.filter((o) => exp.selected.has(o.name) && settingsFor(o.name).naming.kind === "custom" &&
        !settingsFor(o.name).naming.date && cleanName(settingsFor(o.name).naming.text || "") === text).length;
      return same > 1 ? text + " 01, 02…" : text;
    }
    return dateName(session.name);
  }
  function seconds(v) { return (Math.round(v * 10) / 10).toFixed(1) + " s"; }
  function seqTotal(session, s) {
    const cycle = cycleOrder(sessionItems(session).length, s.reverse).length;
    return { cycle: cycle, frames: cycle * s.loops, seconds: cycle * s.loops / s.fps };
  }
  // Texto com "⚠" → o mesmo texto com o ícone de alerta amarelo no lugar
  function setWarnText(node, text) {
    node.textContent = "";
    String(text).split("⚠").forEach((part, i) => {
      if (i > 0) { const w = el("span", "warn-icon"); w.innerHTML = icon("alert", 14); w.title = "Check the lenticular settings: the printer cannot separate the photos well"; node.appendChild(w); }
      if (part) node.appendChild(document.createTextNode(part));
    });
  }
  function summaryText(session) {
    return folderName(session) + " · " + settingsText(session);
  }
  // Lista de sessões: as saídas ligadas, curtas ("Original + MP4 + Lenticular 60/720")
  function settingsText(session) {
    const st = settingsFor(session.name);
    const parts = [];
    if (st.outputs.photos) parts.push(photosText(st.photos) || "no photos");
    if (st.outputs.sequence) parts.push(st.seq.formats.length ? st.seq.formats.map((f) => f.toUpperCase()).join(" · ") : "no sequence format");
    if (st.outputs.lenticular) {
      const l = st.lent, plan = lentPlan(l, sessionItems(session).filter((i) => i.previewable).length);
      parts.push("Lenticular " + lentPitch(l) + "/" + l.dpi + (plan.warn ? " ⚠" : ""));
    }
    return parts.length ? "→ " + parts.join(" + ") : "Nothing to export";
  }
  // "Originals + JPG", "Originals", "JPG" ("" = nada escolhido)
  function photosText(p) {
    return [p.original ? "Originals" : "", p.convert ? PHOTO_FORMATS.find((f) => f[0] === p.format)[1] : ""].filter(Boolean).join(" + ");
  }
  // Cabeçalho de cada seção: o resumo daquela saída
  function outputText(session, kind) {
    const st = settingsFor(session.name);
    if (kind === "framing") {
      const info = ratioInfoCached(session.name);
      const r = st.crop.ratio === "asshot" || !st.crop.ratio ? "As shot" : st.crop.ratio;
      return r + (info && info.mixed && r === "As shot" ? " ⚠ mixed ratios" : "");
    }
    if (kind === "photos") {
      const p = st.photos;
      if (!p.original && !p.convert) return "Choose originals or a format";
      return photosText(p) + (p.convert && LOSSY_PHOTOS.includes(p.format) ? " · " + qualityLabel(p.quality) : "");
    }
    if (kind === "lenticular") {
      const l = st.lent, plan = lentPlan(l, sessionItems(session).filter((i) => i.previewable).length);
      return lentPitch(l) + " LPI · " + l.dpi + " dpi · " + lentSizeText(l) + " · " + (l.effect === "3d" ? "3D" : "Animation") + (plan.warn ? " ⚠" : "");
    }
    const s = st.seq;
    if (!s.formats.length) return "No format chosen";
    return s.formats.map((f) => f.toUpperCase()).join(" · ") + " · " + s.fps + " fps · " + plural(s.loops, "loop", "loops") + " · " + seconds(seqTotal(session, s).seconds);
  }

  // Save sessions abre direto a janela com as três saídas (a escolha de modo saiu na 2.14)
  function startSave(exitAfter) {
    if (!sessions.length) return;
    exp.exitAfter = exitAfter;
    openExport();
  }

  function openExport(projectNames) {
    if (exportPrefs && (OUTPUT_KINDS.includes(exportPrefs.mode) || exportPrefs.mode === "framing")) exp.mode = exportPrefs.mode;
    if (exportPrefs && exportPrefs.collapsed) exp.collapsed = Object.assign({}, exportPrefs.collapsed);
    exp.previewHidden = false;  // a prévia abre sempre visível; "Hide preview" vale até fechar a janela (decisão do dono, 2026-11-03)
    exp.aligning = false; exp.aligningShown = false;
    exp.theater = false;  // reabrir o Export nunca volta em modo teatro (decisão do dono, 2026-11-04)
    exp.step = 1;         // reabrir o Export volta sempre ao passo 1 · Sessions (decisão do dono, 2026-11-04)
    exp.project = Array.isArray(projectNames);
    const all = exportable();
    // Salvando para fechar: só as que ainda não foram salvas (as já salvas ficam marcadas fora)
    const unsaved = all.filter((s) => !s.saved);
    // Seleção: a do Project (vinda da janela Project), a que a pessoa deixou da última vez
    // (só as sessões que ainda existem) ou todas
    const kept = exp.selectedTouched ? [...exp.selected].filter((n) => all.some((s) => s.name === n)) : [];
    exp.selected = new Set(exp.project ? projectNames : kept.length ? kept : (exp.exitAfter && unsaved.length ? unsaved : all).map((s) => s.name));
    Object.keys(exp.settings).forEach((k) => { if (!all.some((s) => s.name === k)) delete exp.settings[k]; });
    if (!all.some((s) => s.name === exp.active)) exp.active = (currentSession && all.some((s) => s.name === currentSession.name) && currentSession.name) || all[0].name;
    // "Keep the originals" vem sempre marcada ao abrir (decisão do dono, 2026-11-06)
    Object.values(exp.settings).forEach((st) => { if (st && st.photos) st.photos.original = true; });
    exp.photo = 0;
    // Já diferentes ao abrir: a caixa vem com o traço e nada é igualado sozinho
    if (exp.sameFraming && differentSessions(1).size) exp.sameFraming = false;
    OUTPUT_KINDS.forEach((k) => { if (exp.same[k] && differentSessions(2, k).size) exp.same[k] = false; });
    exp.dest = null;  // outra pasta escolhida vale só para uma vez
    expSnap = null;
    if (typeof window.exportDestination === "function")
      Promise.resolve(window.exportDestination()).then((d) => {
        if (!d) return;
        exp.destDefault = d.folder; exp.destProject = !!d.project;
        if (!$("exportOverlay").classList.contains("hidden")) { renderExportSettings(); if (renderExportSettings.restoreScroll) renderExportSettings.restoreScroll(); }
      });
    Promise.resolve(window.exportFormats && window.exportFormats()).then((f) => {
      if (f) exp.heic = { ok: f.heic, reason: f.heicReason || "" };
      renderExport();
    });
    renderExport();
    $("exportOverlay").classList.remove("hidden");
  }

  // ← → no Save sessions: trocam a foto da prévia (Photos) e a do Tilt (Lenticular)
  document.addEventListener("keydown", (e) => {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!arrows[e.key] || selectMenu || openMenu) return;
    if ($("exportOverlay").classList.contains("hidden") || tabScope() !== $("exportOverlay")) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(t.type)))) return;
    // Tela de alinhamento: ⌘ + setas movem a foto 1 px (⇧ 10); ↑ ↓ sozinhas trocam de sessão
    if (exp.keyMove && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); exp.keyMove(arrows[e.key][0], arrows[e.key][1], e.shiftKey); return; }
    if (exp.aligning && (e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.altKey) {
      const items = [...$("exportList").children];
      const i = items.findIndex((li) => li.dataset.name === exp.active);
      const n = items[i + (e.key === "ArrowDown" ? 1 : -1)];
      e.preventDefault(); e.stopImmediatePropagation();
      if (n) { const inList = document.activeElement && document.activeElement.closest("#exportList"); n.click(); if (inList) { const again = [...$("exportList").children].find((li) => li.dataset.name === exp.active); if (again) again.focus(); } }
      return;
    }
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !exp.keyNav) return;
    e.preventDefault(); e.stopImmediatePropagation();
    exp.keyNav(e.key === "ArrowRight" ? 1 : -1);
  }, true);
  // Espaço segurado na tela "Align photos": arrastar desloca a vista (como no Photoshop/Lightroom)
  {
    const isText = (t) => t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["checkbox", "radio", "button", "range"].includes(t.type)));
    const setSpace = (on) => { exp.spaceDown = on; const o = $("exportSettings"); if (o) o.classList.toggle("space-pan", on); if (on && exp.alignQuiet) exp.alignQuiet(); };
    document.addEventListener("keydown", (e) => {
      if (e.key !== " " || !exp.aligning || $("exportOverlay").classList.contains("hidden") || isText(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!exp.spaceDown) setSpace(true);
    }, true);
    document.addEventListener("keyup", (e) => {
      if (e.key !== " " || !exp.spaceDown) return;
      e.preventDefault(); e.stopImmediatePropagation();
      setSpace(false);
    }, true);
    window.addEventListener("blur", () => { if (exp.spaceDown) setSpace(false); });
    // ⌘0 (Ctrl+0 no Windows): a vista volta ao centro e a 100%
    document.addEventListener("keydown", (e) => {
      if (e.key !== "0" || !(e.metaKey || e.ctrlKey) || !exp.aligning || $("exportOverlay").classList.contains("hidden") || isText(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (exp.alignView) Object.assign(exp.alignView, { zoom: 1, px: 0, py: 0 });
      if (exp.alignLayout) exp.alignLayout();
    }, true);
  }
  // Sair do Export sessions (Cancel, Esc ou clique fora): pergunta antes, avisando que nada se perde
  function askCloseExport() {
    dialog("Leave Export sessions?",
      "Nothing is exported. Your choices are kept: the outputs, the framing and the photo alignment will be here when you open Export sessions again.",
      [{ label: "Stay" }, { label: "Leave", primary: true, onClick: closeExport }]);
  }
  function closeExport() {
    stopPreview();
    $("exportOverlay").classList.add("hidden");
    exp.project = false;
    // As mudanças da janela só valem com ela aberta: saem do desfazer ao fechar
    history.undo = history.undo.filter((a) => !a.exportWin);
    history.redo = history.redo.filter((a) => !a.exportWin);
  }
  // Desfazer no Save sessions: cada mudança (saídas, formatos, nome, seleção, pasta) vira um passo
  let expSnap = null;
  function expSnapshot() {
    // Recorte e alinhamento carregados da sessão antes da foto (senão o primeiro passo desfaria para os padrões), e
    // o alinhamento só com as fotos ajustadas (uma entrada vazia não é uma mudança)
    exportable().forEach((x) => { const st = settingsFor(x.name); cropLoad(x, st); alignLoad(x, st); });
    return JSON.stringify({ s: exportable().map((x) => [x.name, settingsFor(x.name)]), same: exp.same, sameFraming: exp.sameFraming,
      sel: [...exp.selected].sort(), dest: exp.dest || null },
      (key, v) => (key === "byFile" && v ? Object.fromEntries(Object.entries(v).filter(([, al]) => !alignIsIdentity(al))) : v));
  }
  function expTrack() {
    if ($("exportOverlay").classList.contains("hidden")) return;
    const now = expSnapshot();
    if (expSnap !== null && now !== expSnap) {
      const before = expSnap;
      // Regra do ⌘Z (decisão do dono, 2026-11-04): desfazer e refazer levam até onde a mudança aconteceu (passo,
      // sessão, aba, foto, "Align photos") antes de aplicar, e o aviso diz o quê e onde. Navegar não é um passo.
      const where = expWhere();
      const go = (snap) => { if ($("exportOverlay").classList.contains("hidden")) return false; Object.assign(exp, where); return expApply(snap); };
      recordAction({ label: expWhereText(where), exportWin: true, where, undo: () => go(before), redo: () => go(now) });
    }
    expSnap = now;
  }
  function expWhere() { return { step: exp.step, active: exp.active, mode: exp.mode, photo: exp.photo || 0, aligning: exp.step === 1 && !!exp.aligning }; }
  function expWhereText(w) {
    const date = sessionLabel(w.active || "").date;
    const place = w.step === 1 ? (w.aligning ? "Align photos" : "Framing") : w.step === 2 ? "Outputs › " + ((OUTPUTS.find(([k]) => k === w.mode) || [, "Photos"])[1]) : "Review";
    return place + (w.step === 3 || !date ? "" : " · " + date);
  }
  function expApply(snap) {
    if ($("exportOverlay").classList.contains("hidden")) return false;
    const o = JSON.parse(snap);
    o.s.forEach(([name, st]) => {
      exp.settings[name] = st;
      // O recorte e o alinhamento moram também em session.json: desfazer/refazer grava lá
      const session = sessions.find((x) => x.name === name);
      if (!session) return;
      if (st.align && alignText(st) !== (session.align || "")) alignSave(session, st);
      if (st.crop && (st.crop.ratio + "|" + st.crop.x.toFixed(3) + "|" + st.crop.y.toFixed(3)) !== (session.crop || "")) cropSave(session, st);
    });
    exp.same = o.same; exp.sameFraming = o.sameFraming !== false; exp.selected = new Set(o.sel); exp.dest = o.dest;
    expSnap = snap;
    renderExport();
  }

  // ---- Três passos (decisão do dono, 2026-11-04, protótipo "Export em três passos") ----
  // 1 Sessions: quais sessões e o Framing de cada uma; 2 Outputs: o que sai; 3 Review: conferir, nome e pasta.
  const EXPORT_STEPS = [[1, "Sessions"], [2, "Outputs"], [3, "Review"]];
  const EXPORT_SUBS = {
    1: "Tick the sessions to export and set the framing of each one: the aspect ratio, where the crop sits, and the photo alignment.",
    2: "Tick what each session should become: photos, a sequence, a lenticular print, or several.",
    3: "Check what will be exported, name the folders and choose where they go.",
  };
  function chosenSessions() { return exportable().filter((s) => exp.selected.has(s.name)); }
  // O que impede avançar de cada passo ("" = pode)
  function exportStepProblem(step) {
    const chosen = chosenSessions();
    if (step >= 1 && !chosen.length) return "Tick at least one session";
    if (step >= 2) {
      const sts = chosen.map((s) => settingsFor(s.name));
      if (sts.some((st) => !OUTPUT_KINDS.some((k) => st.outputs[k]))) return "Tick at least one output for each selected session";
      if (sts.some((st) => st.outputs.photos && !st.photos.original && !st.photos.convert)) return "Photos: choose the originals, a format, or both";
      if (sts.some((st) => st.outputs.lenticular && !lentValid(st.lent))) return "Check the lens, printer and size values";
      if (sts.some((st) => st.outputs.sequence && !st.seq.formats.length)) return "Choose at least one sequence format for each selected session";
    }
    return "";
  }
  function goExportStep(step) {
    if (step === exp.step) return;
    if (step > exp.step && exportStepProblem(step - 1)) return;  // para a frente só com o passo atual pronto
    exp.step = step;
    exp.aligning = false;
    if (step === 2 && !OUTPUT_KINDS.includes(exp.mode)) exp.mode = OUTPUT_KINDS.find((k) => settingsFor(exp.active).outputs[k]) || "photos";
    if (step === 2 && !exp.selected.has(exp.active)) { const first = chosenSessions()[0]; if (first) exp.active = first.name; }
    renderExport();
  }
  function renderExportSteps() {
    const box = $("exportSteps");
    box.innerHTML = "";
    EXPORT_STEPS.forEach(([n, name], i) => {
      if (i) box.appendChild(el("span", "export-step-sep", "—"));
      const done = n < exp.step;
      const b = el("button", "export-step" + (n === exp.step ? " on" : done ? " done" : ""), n + " " + name + (done ? " ✓" : ""));
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", n === exp.step ? "true" : "false");
      // Caminho B (decisão do dono, 2026-11-04): os passos de trás voltam com um clique; os da frente são só
      // indicação (avança-se pelo botão verde do rodapé, que confere o passo aberto)
      const ahead = n > exp.step;
      b.disabled = ahead;
      if (ahead) { b.classList.add("ahead"); b.title = "Continue with the green button below"; }
      b.addEventListener("click", () => { if (n < exp.step) goExportStep(n); });
      box.appendChild(b);
    });
  }

  function renderExport() {
    // Reaberto sem nenhuma sessão marcada: volta ao passo 1; no passo 2 a sessão aberta é uma das marcadas
    if (exp.step > 1 && exportStepProblem(1)) exp.step = 1;
    if (exp.step === 2 && !exp.selected.has(exp.active)) { const f = chosenSessions()[0]; if (f) exp.active = f.name; }
    $("exportTitle").textContent = "Export sessions";
    $("exportSub").textContent = EXPORT_SUBS[exp.step];
    renderExportSteps();
    const body = document.querySelector(".export-body");
    if (body) { body.classList.toggle("step-2", exp.step === 2); body.classList.toggle("step-3", exp.step === 3); }
    renderExportList();
    renderExportSettings();
    if (renderExportSettings.restoreScroll) renderExportSettings.restoreScroll();  // já com o conteúdo montado
    updateExportCount();
    // WebKit (Mac) às vezes desenha a fileira de miniaturas com o tamanho errado até a janela
    // mudar de tamanho: um "esconde e mostra" no quadro seguinte obriga a medir de novo
    requestAnimationFrame(() => {
      const strip = document.querySelector(".export-strip");
      if (!strip) return;
      strip.style.display = "none"; void strip.offsetHeight; strip.style.display = "";
    });
  }

  // Sessões que a janela de salvar mostra: todas, ou só as do Project (Export… da janela Project)
  function exportable() { return exp.project ? sessions.filter((s) => s.inProject) : sessions; }
  // Teclado: o Tab para numa sessão só; ↑ ↓ trocam de sessão (e mostram as opções dela, como o clique)
  const exportRoving = makeRoving({ root: () => $("exportList"), rows: (r) => [...r.querySelectorAll("li.export-item")],
    controls: (row) => (exp.step === 2 ? [row] : [row.querySelector("input")]), id: (row) => row.dataset.name,  // passo 2: sem caixa, a linha é o controle
    onMove: (name, i) => {
      if (exp.active === name) return;
      if (exp.aligning) { const s = sessions.find((x) => x.name === name), tst = s && settingsFor(name); if (s && needsRatio(s, tst)) { askRatioForAlign(s, tst, renderExport); return; } }
      exp.active = name; exp.photo = 0; renderExportList(); renderExportSettings(); exportRoving.focusAt(name, i); } });
  function renderExportList() {
    const list = $("exportList");
    const focusWas = exportRoving.where(document.activeElement);
    list.innerHTML = "";
    const diffNow = differentSessions(exp.step);  // etiqueta "Different" (pela configuração mais comum)
    // Passo 2: só as sessões marcadas no passo 1
    exportable().filter((s) => exp.step !== 2 || exp.selected.has(s.name)).forEach((s) => {
      const label = sessionLabel(s.name);
      const li = document.createElement("li");
      li.className = "export-item" + (s.name === exp.active ? " active" : "") + (exp.selected.has(s.name) ? "" : " off");
      li.innerHTML = '<label class="export-check"><input type="checkbox"><span class="save-check" aria-hidden="true"></span></label>' +
        '<span class="export-thumb"></span><span><span class="folder-date"></span><span class="folder-meta"></span>' +
        '<span class="export-summary"></span><span class="export-diff">Different</span></span>';
      const box = li.querySelector("input");
      box.checked = exp.selected.has(s.name);
      if (!li.title) li.title = label.date;  // na tela de alinhamento a lista mostra só a miniatura: a data fica na dica
      if (exp.step !== 2) li.tabIndex = exp.aligning && s.name === exp.active ? 0 : -1;
      // legenda instantânea (como a barra da tela cheia): data, fotos e o que vai sair
      li.dataset.tip = [s.label || "", label.date, plural(sessionItems(s).length, "photo", "photos"), label.detail].filter(Boolean).join(" · ");
      { const r = ratioInfoCached(s.name); const warns = []; if (s.missing) warns.push(s.missing + " missing"); if (r && r.mixed) warns.push("Mixed ratios"); if (warns.length) li.dataset.tipWarn = warns.join(" · "); }
      box.addEventListener("change", () => {
        exp.selectedTouched = true; if (box.checked) exp.selected.add(s.name); else exp.selected.delete(s.name);
        li.classList.toggle("off", !box.checked);
        updateExportCount();
      });
      li.querySelector(".export-check").addEventListener("click", (e) => e.stopPropagation());
      li.querySelector(".folder-date").textContent = label.date;
      li.querySelector(".folder-meta").textContent = [plural(sessionItems(s).length, "photo", "photos"), label.detail].filter(Boolean).join(" · ");
      if (deletedBySession[s.name]) li.querySelector(".folder-meta").after(deletedTag(deletedBySession[s.name]));
      if (s.missing > 0) li.querySelector(".folder-meta").after(missingTag(s.missing));
      if (s.inProject && s.edited > 0) li.querySelector(".folder-meta").after(projectTag(s));  // "Edited n / m" também aqui
      if (s.saved) li.querySelector(".folder-meta").after(savedTag());
      if (exp.step === 1) {
        // Passo 1: o selo com o Framing da sessão ("3:2 · aligned", "As shot · mixed ratios" em âmbar)
        const sst = settingsFor(s.name); cropLoad(s, sst);
        const r = ratioInfoCached(s.name), asShot = sst.crop.ratio === "asshot", aligned = sessionAligned(s, sst);
        const chip = el("span", "export-chip" + (asShot && r && r.mixed && !aligned ? " warn" : !asShot || aligned ? " ok" : ""),
          (asShot ? "As shot" : sst.crop.ratio) + (aligned ? " · aligned" : asShot && r && r.mixed ? " · mixed ratios" : ""));
        li.querySelector(".export-summary").replaceWith(chip);
      } else setWarnText(li.querySelector(".export-summary"), settingsText(s));
      li.classList.toggle("different", exp.step < 3 && diffNow.has(s.name));
      const first = sessionItems(s).find((i) => i.previewable);
      if (first) sessionPhoto(s.name, first.file, 320).then((url) => { if (url) li.querySelector(".export-thumb").style.backgroundImage = "url(" + url + ")"; });
      li.addEventListener("click", () => {
        if (exp.aligning && s.name !== exp.active) {
          const tst = settingsFor(s.name);
          if (needsRatio(s, tst)) { askRatioForAlign(s, tst, renderExport); return; }  // Cancel: continua na sessão de antes
        }
        exp.active = s.name;
        exp.photo = 0;
        renderExportList();
        renderExportSettings();
      });
      li.dataset.name = s.name;
      list.appendChild(li);
    });
    exportRoving.cur = exp.active;
    exportRoving.apply();
    if (focusWas) exportRoving.focusAt(focusWas.id, focusWas.i);
  }

  function updateExportCount() {
    const all = exportable();
    const chosen = exp.selected.size;
    const chosenSt = all.filter((s) => exp.selected.has(s.name)).map((s) => settingsFor(s.name));
    const noOutput = chosenSt.some((st) => !OUTPUT_KINDS.some((k) => st.outputs[k]));
    const seqEmpty = chosenSt.some((st) => st.outputs.sequence && !st.seq.formats.length);
    const lentBad = chosenSt.some((st) => st.outputs.lenticular && !lentValid(st.lent));
    const photosEmpty = chosenSt.some((st) => st.outputs.photos && !st.photos.original && !st.photos.convert);
    // Project: sessão com só parte das fotos editadas misturaria editadas e originais
    const partial = all.filter((s) => exp.selected.has(s.name) && s.inProject && s.showEdited !== false && s.edited > 0 && s.edited < s.photos.length);
    // Sessões em "As shot" com proporções misturadas e sem alinhamento (a sequência pula)
    const mixedAsShot = all.filter((s) => { if (!exp.selected.has(s.name)) return false; const st = settingsFor(s.name); const r = ratioInfoCached(s.name); return st.crop.ratio === "asshot" && r && r.mixed && !sessionAligned(s, st); }).length;
    const mixedText = mixedAsShot ? plural(mixedAsShot, "session", "sessions") + " with mixed ratios on As shot" : "";
    const block = noOutput || photosEmpty || lentBad || seqEmpty;
    let text = "", warn = false;
    if (exp.step === 1) {
      text = chosen + " of " + plural(all.length, "session", "sessions") + (mixedAsShot ? " · " + mixedAsShot + " with mixed ratios on As shot" : "");
      warn = !chosen;
    } else if (exp.step === 2) {
      const kinds = OUTPUTS.filter(([k]) => chosenSt.some((st) => st.outputs[k])).map(([, t]) => t);
      text = noOutput ? "Tick at least one output for each selected session" : photosEmpty ? "Photos: choose the originals, a format, or both" : lentBad ? "Check the lens, printer and size values" : seqEmpty ? "Choose at least one sequence format for each selected session"
        : plural(chosen, "session", "sessions") + (kinds.length ? " · " + kinds.join(", ").replace(/, ([^,]*)$/, " and $1") : "");
      warn = block;
    } else {
      text = partial.length ? (partial.length === 1 ? sessionTitle(partial[0]) + " has" : partial.length + " sessions have") + " only some photos edited: edited and original frames would be mixed."
        : block ? exportStepProblem(2) : mixedText;
      warn = !!text;
    }
    $("exportCount").textContent = text;
    $("exportCount").classList.toggle("warn", warn);
    // Botão verde: avança ("Outputs →", "Review →") e, no passo 3, exporta
    const next = exp.step === 1 ? "Outputs →" : exp.step === 2 ? "Review →" : chosen ? "Export " + plural(chosen, "session", "sessions") : "Export";
    // Dentro de "Align photos" (decisão do dono, 2026-11-04, caminho A): um botão só, que volta ao Framing
    const aligningNow = exp.step === 1 && !!exp.aligning;
    $("exportConfirm").textContent = aligningNow ? "Done aligning" : next;
    $("exportConfirm").disabled = aligningNow ? false : exp.step === 1 ? chosen === 0 : chosen === 0 || block;
    $("exportCancel").classList.toggle("hidden", aligningNow);
    $("exportBack").classList.toggle("hidden", exp.step === 1);
    $("exportBack").textContent = exp.step === 3 ? "← Outputs" : "← Sessions";
    $("exportSelectAll").disabled = chosen === all.length;
    $("exportUnselectAll").disabled = chosen === 0;
    renderExportSteps();
    setTimeout(expTrack, 0);  // depois de a mudança terminar (pode haver mais de um redesenho)
  }
  function sessionTitle(s) { const l = sessionLabel(s.name); return s.label ? s.label + " · " + l.date : l.date; }

  // Trocar de foto (← → ou clique na miniatura): só a coluna da direita; a lista não muda e não perde o foco
  function photoRerender() { renderExportSettings(); if (renderExportSettings.restoreScroll) renderExportSettings.restoreScroll(); }
  function refreshSummaries() {
    if (exp.step === 1) { renderExportList(); updateExportCount(); return; }  // os selos do Framing mudam com a sessão
    const diffNow = differentSessions(exp.step);
    [...$("exportList").children].forEach((li) => {
      const s = sessions.find((x) => x.name === li.dataset.name);
      if (!s) return;
      const sum = li.querySelector(".export-summary");  // no passo 1 a linha mostra o selo do Framing
      if (sum) setWarnText(sum, settingsText(s));
      li.classList.toggle("different", exp.step < 3 && diffNow.has(s.name));
    });
    updateExportCount();
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function row(label) {
    const r = el("div", "export-row");
    if (label) r.appendChild(el("span", "export-label", label));
    return r;
  }
  // Explicação de uma opção num "?" ao lado do nome dela (como no Camera settings), em vez de
  // texto solto embaixo. label: o nome da linha (sem: a última linha de box)
  function addTip(box, text, label) {
    const rows = [...box.querySelectorAll(":scope > .export-row")];
    const r = label ? rows.find((x) => { const lab = x.querySelector(".export-label"); return lab && lab.textContent === label; }) : rows[rows.length - 1];
    if (!r) { box.appendChild(el("div", "export-note", text)); return; }
    const tip = makeTip(text);
    const lab = r.querySelector(".export-label");
    if (lab) { lab.classList.add("with-tip"); lab.appendChild(tip); } else r.prepend(tip);
  }
  function makeTip(text) {
    const tip = el("span", "info-tip float", "?");
    tip.tabIndex = 0;
    tip.setAttribute("aria-label", text);
    tip.appendChild(el("span", "info-tip-text", text));
    return tip;
  }
  // A caixa do "?" fica por cima de tudo (fixa na tela), sem ser cortada por áreas que rolam
  function placeTip(tip) {
    const box = tip.querySelector(".info-tip-text");
    if (!box) return;
    const r = tip.getBoundingClientRect();
    box.style.left = "0px"; box.style.top = "0px";
    const w = box.offsetWidth || 340, h = box.offsetHeight || 80;
    let x = r.right + 8, y = r.top - 8;
    if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
    if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
    box.style.left = x + "px"; box.style.top = y + "px";
  }
  document.addEventListener("mouseover", (e) => { const t = e.target.closest && e.target.closest(".info-tip.float"); if (t) placeTip(t); });
  document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest(".info-tip.float"); if (t) placeTip(t); });
  // Clicar no "?" deixava a explicação aberta (o clique dá foco); ao tirar o mouse, ela fecha
  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest && e.target.closest(".info-tip");  // todos os "?" (também o do Camera settings)
    if (t && !t.contains(e.relatedTarget) && document.activeElement === t) t.blur();
  });
  function segmented(options, current, onPick, disabledReason) {
    const box = el("span", "segmented");
    options.forEach(([value, label]) => {
      const b = el("button", value === current ? "on" : "", label);
      const reason = disabledReason && disabledReason(value);
      if (reason) { b.disabled = true; b.title = reason; }
      b.addEventListener("click", () => onPick(value));
      box.appendChild(b);
    });
    return box;
  }
  function stepper(text, sub, onMinus, onPlus, minDisabled, maxDisabled) {
    const box = el("span", "stepper");
    const minus = button("", onMinus, { icon: "minus", title: "Less" });
    const plus = button("", onPlus, { icon: "plus", title: "More" });
    minus.disabled = minDisabled;
    plus.disabled = maxDisabled;
    const value = el("span", "value", text);
    if (sub) value.appendChild(el("small", "", sub));
    box.append(minus, value, plus);
    return box;
  }
  function checkOption(label, checked, onChange) {
    const l = el("label", "log-option");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = checked;
    c.addEventListener("change", () => onChange(c.checked));
    l.append(c, document.createTextNode(" " + label));
    return l;
  }

  function stopPreview() {
    clearInterval(exp.timer);
    exp.timer = null;
  }

  // ---- Lenticular: contas e textos ----
  const lentPitch = (l) => (l.pitch > 0 ? l.pitch : l.lpi);  // pitch medido na folha de teste, senão o nominal
  const lentValid = (l) => lentPitch(l) > 0 && l.dpi > 0 && l.widthCm > 0 && l.heightCm > 0;
  function lentPlan(l, photos) {
    const pitch = lentPitch(l), cols = pitch > 0 ? l.dpi / pitch : 0;
    const w = Math.round(l.widthCm / CM_PER_IN * l.dpi), h = Math.round(l.heightCm / CM_PER_IN * l.dpi);
    const per = photos > 0 ? cols / photos : 0;
    const lenses = Math.round((l.effect === "3d" ? l.widthCm : l.heightCm) / CM_PER_IN * pitch);
    // < 1 ponto por foto: a impressora não consegue separar as faixas; < 2: funciona, mas umas fotos
    // ficam com 1 ponto e outras com 2 (transição menos uniforme)
    const warn = photos > 0 && per < 1 ? "bad" : photos > 0 && per < 2 ? "tight" : "";
    // Arquivo: impressão + sangria em volta + margem de 0,4 pol para as marcas (como o programa faz)
    const bleed = Math.round((l.bleedMm || 0) / 25.4 * l.dpi), margin = l.cropMarks || l.alignMarks ? Math.round(0.4 * l.dpi) : 0;
    return { cols, w, h, per, lenses, warn, fileW: w + 2 * (bleed + margin), fileH: h + 2 * (bleed + margin) };
  }
  const cmText = (v) => (Math.round(v * 10) / 10).toString();
  const inText = (v) => (Math.round(v / CM_PER_IN * 100) / 100).toString();
  const lentSizeText = (l) => (l.unit === "in" ? inText(l.widthCm) + " × " + inText(l.heightCm) + " in" : cmText(l.widthCm) + " × " + cmText(l.heightCm) + " cm");
  // Campo numérico pequeno (aceita vírgula); onChange só com valor válido
  function numField(value, onChange, opts) {
    opts = opts || {};
    const i = document.createElement("input");
    i.type = "text"; i.inputMode = "decimal"; i.className = "lent-num" + (opts.cls ? " " + opts.cls : "");
    i.value = value === 0 || value === "" ? "" : String(value);
    if (opts.placeholder) i.placeholder = opts.placeholder;
    if (opts.width) i.style.width = opts.width;
    const commit = () => {
      const t = i.value.trim().replace(",", ".");
      if (t === "" && opts.allowEmpty) { onChange(0); return; }
      const v = parseFloat(t);
      if (!isFinite(v) || v <= 0) { i.classList.add("invalid"); return; }
      i.classList.remove("invalid"); onChange(v);
    };
    i.addEventListener("change", commit);
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); i.blur(); } });
    return i;
  }

  // Zoom das lupas (prévia Interlaced e folha de teste): 1×, 1,5×, 2×, 3×, 4×, 6×, 8×
  // Mira no centro da lupa: um "+" fino, com 80% do tamanho do quadrado
  let loupePressed = false;  // botão esquerdo apertado sobre a lupa: sem a mira (para ver o ponto limpo)
  function drawLoupeCross(canvas) {
    if (loupePressed) return;
    const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height, cx = Math.floor(w / 2) + 0.5, cy = Math.floor(h / 2) + 0.5;
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(0, 0, 0, .55)";  // contorno escuro: aparece no branco e no preto
    const ax = w * 0.4, ay = h * 0.4;  // braços maiores: o "+" ocupa 80% do quadrado
    g.beginPath(); g.moveTo(cx - ax, cy + 1); g.lineTo(cx + ax, cy + 1); g.moveTo(cx + 1, cy - ay); g.lineTo(cx + 1, cy + ay); g.stroke();
    g.strokeStyle = "#00ff41";
    g.beginPath(); g.moveTo(cx - ax, cy); g.lineTo(cx + ax, cy); g.moveTo(cx, cy - ay); g.lineTo(cx, cy + ay); g.stroke();
    g.restore();
  }
  // Contínuo: cada movimento da roda muda um pouco (o trackpad manda dezenas de passos por gesto)
  function loupeZoomStep(z, deltaY, deltaMode) {
    const d = deltaMode === 1 ? deltaY * 16 : deltaY;  // linhas → pixels
    const next = z * Math.exp(-Math.max(-60, Math.min(60, d)) * 0.0025);
    return Math.round(Math.max(0.5, Math.min(8, next)) * 100) / 100;  // 0,5× afasta (números inteiros na lupa)
  }
  const zoomText = (z) => (Math.round(z * 10) / 10).toFixed(1).replace(/\.0$/, "") + "×";
  // Marcas de corte e de alinhamento no canvas da prévia, com as mesmas medidas do programa
  // (Export: DrawPrintMarks); f = escala da prévia em relação ao arquivo
  function drawPrintMarks(g, l, f, d) {
    const M = d.margin, B = d.bleed;
    if (!M) return;
    const t = Math.max(1, Math.round(l.dpi * 0.004 * f)), gap = l.dpi * 0.06 * f, start = M * 0.15;
    const left = M + B, right = M + B + d.w, top = M + B, bottom = M + B + d.h;
    g.fillStyle = "#000"; g.strokeStyle = "#000"; g.lineWidth = t;
    if (l.cropMarks) {
      [top, bottom].forEach((y) => { g.fillRect(start, y - t / 2, M - gap - start, t); g.fillRect(d.fw - M + gap, y - t / 2, M - gap - start, t); });
      [left, right].forEach((x) => { g.fillRect(x - t / 2, start, t, M - gap - start); g.fillRect(x - t / 2, d.fh - M + gap, t, M - gap - start); });
    }
    if (l.alignMarks) {
      const r = M * 0.28;
      const cross = (cx, cy) => {
        g.fillRect(cx - r - r / 3, cy - t / 2, 2 * (r + r / 3), t);
        g.fillRect(cx - t / 2, cy - r - r / 3, t, 2 * (r + r / 3));
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      };
      cross((left + right) / 2, M / 2); cross((left + right) / 2, d.fh - M / 2);
      cross(M / 2, (top + bottom) / 2); cross(d.fw - M / 2, (top + bottom) / 2);
    }
  }

  // ---- Folha de teste de pitch (entrega 2) ----
  // Abre de três lugares: "Print pitch test…" na seção Lenticular, o botão no rodapé da janela de
  // salvar e o ícone da tela principal. 11 faixas, cada uma desenhada para um LPI um pouco
  // diferente, em volta do LPI da lâmina (ou do pitch já medido).
  // A janela é montada uma vez; ao mudar uma opção só o conteúdo é refeito (sem piscar).
  // Opção A (decisão do dono, 2026-10-31): 21 faixas de 0,05 numa folha só (cobre ±0,5 com o
  // dobro de precisão); sem "Finer steps". Papel mínimo A4.
  // "Finer steps" (mantido, decisão do dono em 2026-10-31): 21 faixas de 0,02 (±0,2) em volta do
  // pitch medido (ou do LPI da embalagem, sem ele); sempre disponível
  const pitchState = { l: null, step: 0.05, zoom: 2, print: null, fine: false };
  const PITCH_STRIPS = 21;
  function openPitchTest(from) {
    const base = from || (exportPrefs && exportPrefs.settings && exportPrefs.settings.lent) || defaultSettings().lent;
    // Cópia: mexer aqui não muda a impressão; o papel começa em A4 (ou Letter em polegadas)
    const l = JSON.parse(JSON.stringify(base));
    // A impressão de referência (para avisar se ela for mais comprida que as faixas do teste)
    const print = { widthCm: base.widthCm, heightCm: base.heightCm };
    l.widthCm = l.unit === "in" ? 8.5 * CM_PER_IN : 21; l.heightCm = l.unit === "in" ? 11 * CM_PER_IN : 29.7;
    Object.assign(pitchState, { l, step: 0.05, print, fine: false });
    pitchSnap = null;
    let ov = $("pitchOverlay");
    if (!ov) {
      ov = el("div", "overlay pitch-overlay hidden"); ov.id = "pitchOverlay";
      ov.addEventListener("click", (e) => { if (e.target === ov) closePitchTest(); });
      const d = el("div", "dialog pitch-dialog");
      d.appendChild(el("h3", "", "Pitch test"));
      d.appendChild(el("p", "pitch-sub", "Finds the real LPI of your lens sheet on the printer you will use. Print it at 100% on that printer, lay the lens sheet on top, " +
        "and type the number of the strip that stays the same from end to end in \"Measured pitch\"."));
      const main = el("div", "pitch-main");
      main.append(el("div", "pitch-body"), el("div", "pitch-preview"));
      d.appendChild(main);
      const actions = el("div", "dialog-actions");
      actions.appendChild(el("span", "spacer"));
      actions.appendChild(button("Cancel", closePitchTest));
      const ok = button("Save pitch test", savePitchTest, { kind: "btn-primary" });
      ok.classList.add("pitch-save");
      actions.appendChild(ok);
      d.appendChild(actions);
      ov.appendChild(d);
      document.body.appendChild(ov);
    }
    if (typeof window.exportDestination === "function" && !exp.destDefault)
      Promise.resolve(window.exportDestination()).then((r) => { if (r) { exp.destDefault = r.folder; renderPitchTest(); } });
    renderPitchTest();
    ov.classList.remove("hidden");
  }
  function closePitchTest() {
    const ov = $("pitchOverlay"); if (ov) ov.classList.add("hidden");
    // As mudanças do Pitch test só valem com a janela aberta: saem do desfazer ao fechar
    history.undo = history.undo.filter((a) => !a.pitch);
    history.redo = history.redo.filter((a) => !a.pitch);
  }
  // Desfazer no Pitch test: cada mudança vira um passo (estado inteiro antes/depois)
  let pitchSnap = null;
  const pitchSnapshot = () => JSON.stringify({ l: pitchState.l, step: pitchState.step, fine: pitchState.fine });
  function pitchApply(s) {
    if (!$("pitchOverlay") || $("pitchOverlay").classList.contains("hidden")) return false;
    const o = JSON.parse(s);
    pitchState.l = o.l; pitchState.step = o.step; pitchState.fine = o.fine;
    pitchSnap = s;
    renderPitchTest();
  }
  // Fonte 5×7 do programa (Export: Glyph), para os números na lupa
  const PITCH_GLYPHS = { "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E], "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F], "3": [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E], "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E], "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E], "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C], ".": [0, 0, 0, 0, 0, 0x0C, 0x0C] };
  // Mesmas contas do programa (Export::WritePitchTest): margens, faixas, área do número
  function pitchLayout(l, step) {
    const dpi = l.dpi, W = Math.round(l.widthCm / CM_PER_IN * dpi), H = Math.round(l.heightCm / CM_PER_IN * dpi);
    const horizontal = l.effect !== "3d", center = l.pitch > 0 ? l.pitch : l.lpi;
    const edge = Math.round(0.25 * dpi), gap = Math.max(2, Math.round(0.08 * dpi));
    const digitScale = Math.max(1, Math.round(0.16 * dpi / 7));
    const decimals = Math.abs(step * 100 - Math.round(step * 100)) > 1e-6 ? 3 : step < 0.0999 ? 2 : 1;
    const label = Math.max(Math.round(0.45 * dpi), ((decimals + 4) * 6 - 1) * digitScale + Math.round(0.2 * dpi));
    const along = horizontal ? W : H, across = horizontal ? H : W;
    const band = Math.max(1, Math.floor((along - 2 * edge - gap * (PITCH_STRIPS - 1)) / PITCH_STRIPS));
    const first = center - step * (PITCH_STRIPS - 1) / 2;
    const lpis = Array.from({ length: PITCH_STRIPS }, (_, b) => first + step * b);
    const bandAt = (p) => { const q = p - edge; if (q < 0) return -1; const b = Math.floor(q / (band + gap)); return b >= PITCH_STRIPS || q - b * (band + gap) >= band ? -1 : b; };
    // 0 = preto, 255 = branco; os números com a mesma fonte e as mesmas posições do programa
    const texts = lpis.map((v) => v.toFixed(decimals));
    const th = 7 * digitScale;
    const digitAt = (x, y, b) => {
      const t = texts[b], tw = (t.length * 6 - 1) * digitScale, bandStart = edge + b * (band + gap);
      let gx, gy, i;
      if (horizontal) {  // em pé: o texto corre de cima para baixo
        const tx = bandStart + Math.floor((band - th) / 2), ty = edge + Math.floor((label - tw) / 2);
        if (y < ty || y >= ty + tw || x < tx || x >= tx + th) return false;
        const col = Math.floor((y - ty) / digitScale); i = Math.floor(col / 6); gx = col % 6;
        gy = 6 - Math.floor((x - tx) / digitScale);
      } else {
        const tx = edge + Math.floor((label - tw) / 2), ty = bandStart + Math.floor((band - th) / 2);
        if (y < ty || y >= ty + th || x < tx || x >= tx + tw) return false;
        const col = Math.floor((x - tx) / digitScale); i = Math.floor(col / 6); gx = col % 6;
        gy = Math.floor((y - ty) / digitScale);
      }
      if (gx > 4 || gy < 0 || gy > 6) return false;
      const g = PITCH_GLYPHS[t[i]];
      return !!(g && (g[gy] & (0x10 >> gx)));
    };
    const at = (x, y) => {
      const p = horizontal ? x : y, a = horizontal ? y : x, b = bandAt(p);
      if (b < 0 || a < edge || a >= across - edge) return 255;
      if (a < edge + label) return digitAt(x, y, b) ? 0 : 255;
      const pos = (a - edge - label + 0.5) * lpis[b] / dpi;
      return pos - Math.floor(pos) < 0.5 ? 0 : 255;
    };
    // Comprimento útil de cada faixa (no sentido em que o erro se acumula), em cm
    const stripCm = (across - 2 * edge - label) / dpi * CM_PER_IN;
    return { W, H, horizontal, center, edge, gap, label, band, lpis, decimals, digitScale, at, across, stripCm };
  }
  function renderPitchTest() {
    const ov = $("pitchOverlay");
    if (!ov || !pitchState.l) return;
    const now = pitchSnapshot();
    if (pitchSnap !== null && now !== pitchSnap) {
      const before = pitchSnap;
      recordAction({ label: "Pitch test settings", pitch: true, undo: () => pitchApply(before), redo: () => pitchApply(now) });
    }
    const l = pitchState.l;
    const body = ov.querySelector(".pitch-body");
    const scroll = body.scrollTop;
    const wasAt = body.contains(document.activeElement) ? focusables(body).indexOf(document.activeElement) : -1;
    if (wasAt >= 0) setTimeout(() => { if (body.contains(document.activeElement)) return; const l = focusables(body); const t = l[Math.min(wasAt, l.length - 1)]; if (t) t.focus({ preventScroll: true }); }, 0);
    body.innerHTML = "";
    const rerender = () => renderPitchTest();
    lentEffectRows(l, body, rerender, { noReverse: true });
    lentLensRows(l, body, rerender);
    lentPrinterRows(l, body, rerender);
    lentSizeRow(l, body, rerender, "Paper size");
    const step = pitchState.step, P = pitchLayout(l, step);
    const lo = P.lpis[0].toFixed(P.decimals), hi = P.lpis[PITCH_STRIPS - 1].toFixed(P.decimals);
    const strips = row("Strips");
    strips.appendChild(el("span", "pitch-range", PITCH_STRIPS + " strips · " + lo + " to " + hi + " LPI, every " + step));
    if (!pitchState.fine) strips.appendChild(button("Finer steps", () => { pitchState.fine = true; pitchState.step = 0.025; rerender(); }, { kind: "btn-link" }));
    else strips.appendChild(button("Normal steps", () => { pitchState.fine = false; pitchState.step = 0.05; rerender(); }, { kind: "btn-link" }));
    body.appendChild(strips);
    if (pitchState.fine) {
      // Cada passo com o seu "?": quanto cobre em volta do valor e até que tamanho de impressão serve
      // (erro máximo = metade do passo; serve até ~1 ÷ passo polegadas no sentido em que o erro se acumula)
      const ref = l.pitch > 0 ? "your measured pitch (" + l.pitch + ")" : "the LPI of the package (" + l.lpi + "; there is no measured pitch yet)";
      const dir = l.effect === "3d" ? "wide (side to side)" : "tall (top to bottom)";
      const fine = row("Finer");
      const opts = el("span", "fine-steps");
      [0.04, 0.03, 0.025, 0.02, 0.01].forEach((v) => {
        const item = el("span", "fine-step");
        const b = el("button", "chip fine-chip" + (Math.abs(step - v) < 1e-9 ? " on" : ""), "every " + v);
        b.type = "button";
        b.addEventListener("click", (e) => { if (e.target.closest(".info-tip")) return; pitchState.step = v; rerender(); });
        const half = Math.round(v * 10 * 1000) / 1000, upTo = Math.round(2.54 / v);
        item.append(b);
        b.appendChild(makeTip("Every " + v + ": the 21 strips cover " + half + " below to " + half + " above " + ref + ". " +
          "Enough for prints up to about " + (upTo >= 100 ? (upTo / 100).toFixed(upTo % 100 ? 1 : 0).replace(".", ",") + " m" : upTo + " cm") + " " + dir + ". " +
          (v <= 0.01 ? "Only for very large pieces, and only around a value you already measured: the range is narrow." :
           v <= 0.02 ? "For large posters, around a value you already measured." :
           "A second, more precise sheet after the normal one, or for posters.")));
        opts.appendChild(item);
      });
      fine.appendChild(opts);
      body.appendChild(fine);
    }
    addTip(body, "Each strip is printed for a slightly different LPI, " + lo + " to " + hi + (l.pitch > 0 ? ", around your measured pitch (" + l.pitch + ")" : "") +
      ". With the lens sheet on top, the right strip turns black and then white all at once, the same from end to end; the wrong ones show a dark area moving along them. " +
      "The normal sheet (every 0.05) covers ±0.5 and is enough for prints up to about 50 cm. Finer steps: smaller steps for bigger prints; each one has its own ? with when to use it.", "Strips");
    // Papel mínimo A4; e as faixas pelo menos do comprimento da impressão (o erro se acumula ao longo dela)
    const shortCm = Math.min(l.widthCm, l.heightCm), longCm = Math.max(l.widthCm, l.heightCm);
    const small = shortCm < 20.9 || longCm < 27.8;
    const printLen = pitchState.print ? (l.effect === "3d" ? pitchState.print.widthCm : pitchState.print.heightCm) : 0;
    const short = !small && printLen > P.stripCm + 0.05;
    if (small) body.appendChild(el("div", "export-note exp-none", "Use A4 / Letter or bigger: on smaller paper the 21 strips get too narrow to read."));
    else if (short) body.appendChild(el("div", "export-note exp-none", "Your print is " + cmText(printLen) + " cm " + (l.effect === "3d" ? "wide" : "tall") +
      ", but the strips on this sheet are " + cmText(P.stripCm) + " cm long. A small error can show only past that length: use a paper at least that long in this direction" +
      (l.effect === "3d" ? " (turn it sideways or choose a bigger one)." : " (choose a bigger one).")));
    pitchState.blocked = small;
    body.appendChild(el("div", "export-note", P.W + " × " + P.H + " px, black and white TIFF · saved in " + (exp.destDefault || "the Exports folder") + " and shown in the " + (upd.info && upd.info.os === "windows" ? "Explorer" : "Finder") + "."));
    body.scrollTop = scroll;
    const save = $("pitchOverlay").querySelector(".pitch-save");
    if (save) save.disabled = !!pitchState.blocked;
    pitchSnap = pitchSnapshot();
    drawPitchPreview(P);
  }
  // Prévia da folha: a página inteira reduzida (as listras aparecem maiores do que são, só para mostrar
  // a direção) e, com o mouse em cima, uma lupa com as listras de verdade (2×)
  function drawPitchPreview(P) {
    const pane = $("pitchOverlay").querySelector(".pitch-preview");
    pane.innerHTML = "";
    // Cabe na coluna (deitado ou em pé), sem rolagem
    const maxW = 290, maxH = 400, sc = Math.min(maxW / P.W, maxH / P.H);
    const cw = Math.max(1, Math.round(P.W * sc)), ch = Math.max(1, Math.round(P.H * sc));
    const c = document.createElement("canvas"); c.width = cw * 2; c.height = ch * 2; c.style.width = cw + "px"; c.style.height = ch + "px";
    c.className = "pitch-canvas";
    const g = c.getContext("2d"); g.scale(2 * sc, 2 * sc);
    g.fillStyle = "#fff"; g.fillRect(0, 0, P.W, P.H);
    const s = 1 / sc;  // um pixel da prévia, em pixels da folha
    for (let b = 0; b < PITCH_STRIPS; b++) {
      const p0 = P.edge + b * (P.band + P.gap), a0 = P.edge + P.label, a1 = P.across - P.edge;
      // listras de 3 px da prévia (bem maiores que as reais): só a direção e a área
      g.fillStyle = "#000";
      for (let a = a0; a < a1; a += 6 * s) {
        if (P.horizontal) g.fillRect(p0, a, P.band, 3 * s); else g.fillRect(a, p0, 3 * s, P.band);
      }
      g.fillStyle = "#000";
      const fontPx = 7 * P.digitScale;
      g.font = "600 " + fontPx + "px 'JetBrains Mono', monospace"; g.textBaseline = "middle"; g.textAlign = "center";
      const t = P.lpis[b].toFixed(P.decimals);
      if (P.horizontal) {
        g.save(); g.translate(p0 + P.band / 2, P.edge + P.label / 2); g.rotate(Math.PI / 2); g.fillText(t, 0, 0); g.restore();
      } else g.fillText(t, P.edge + P.label / 2, p0 + P.band / 2);
    }
    const wrap = el("div", "pitch-canvas-wrap");
    wrap.appendChild(c);
    const loupe = document.createElement("canvas"); loupe.width = 160; loupe.height = 160; loupe.className = "pitch-loupe hidden";
    const tag = el("span", "pitch-loupe-tag hidden", zoomText(pitchState.zoom) + " · real stripes");
    tag.title = "Scroll to zoom in and out";
    wrap.append(loupe, tag);
    pane.appendChild(wrap);
    pane.appendChild(el("div", "export-note", "Move the mouse over the sheet for a close-up; scroll to zoom; hold the left button to hide the crosshair. The reduced sheet shows the stripes bigger than they print."));
    let last = null;
    const move = (e) => {
      last = { clientX: e.clientX, clientY: e.clientY };
      const z = pitchState.zoom;
      const r = c.getBoundingClientRect();
      const fx = Math.round((e.clientX - r.left) / r.width * P.W), fy = Math.round((e.clientY - r.top) / r.height * P.H);
      const n = loupe.width / z;  // pixels da folha dentro da lupa
      const img = loupe.getContext("2d").createImageData(loupe.width, loupe.height);
      for (let y = 0; y < loupe.height; y++)
        for (let x = 0; x < loupe.width; x++) {
          const v = P.at(Math.floor(fx - n / 2 + x / z), Math.floor(fy - n / 2 + y / z)), k = (y * loupe.width + x) * 4;
          img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
        }
      loupe.getContext("2d").putImageData(img, 0, 0);
      drawLoupeCross(loupe);
      const wr = wrap.getBoundingClientRect();
      let lx = e.clientX - wr.left + 14, ly = e.clientY - wr.top + 14;
      if (lx + loupe.width > wr.width) lx = e.clientX - wr.left - loupe.width - 14;
      if (ly + loupe.height > wr.height) ly = e.clientY - wr.top - loupe.height - 14;
      lx = Math.max(0, lx); ly = Math.max(0, ly);
      loupe.style.left = lx + "px"; loupe.style.top = ly + "px";
      tag.style.left = (lx + 4) + "px"; tag.style.top = (ly + 4) + "px";
      loupe.classList.remove("hidden"); tag.classList.toggle("hidden", loupePressed);
    };
    c.addEventListener("pointermove", move);
    // Clique: sem arrastar a imagem nem selecionar (no Mac isso tirava a mira); redesenha a lupa
    c.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); loupePressed = true; move(e); });
    c.addEventListener("pointerup", (e) => { loupePressed = false; move(e); });
    c.addEventListener("pointerleave", () => { loupePressed = false; });
    c.addEventListener("dragstart", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      pitchState.zoom = loupeZoomStep(pitchState.zoom, e.deltaY, e.deltaMode);
      tag.textContent = zoomText(pitchState.zoom) + " · real stripes";
      if (last) move(last);
    }, { passive: false });
    c.addEventListener("pointerleave", () => { loupe.classList.add("hidden"); tag.classList.add("hidden"); });
  }
  function savePitchTest() {
    const l = pitchState.l, P = pitchLayout(l, pitchState.step);
    if (typeof window.lenticularPitchTest !== "function") { toast("This build cannot do that yet. Build the app again.", 8000); return; }
    if (!(P.center > 0 && l.dpi > 0 && l.widthCm > 0 && l.heightCm > 0)) { toast("Check the lens, printer and size values.", 6000, { warn: true }); return; }
    if (pitchState.blocked) { toast("Use A4 / Letter or bigger for the pitch test.", 6000, { warn: true }); return; }
    window.lenticularPitchTest(String(l.dpi), (l.widthCm / CM_PER_IN).toFixed(4), (l.heightCm / CM_PER_IN).toFixed(4), l.effect, String(P.center), String(pitchState.step), "", String(PITCH_STRIPS));
    toast("Making the pitch test sheet…");
    closePitchTest();
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("pitchOverlay") && !$("pitchOverlay").classList.contains("hidden") && !selectMenu) { e.stopImmediatePropagation(); closePitchTest(); } }, true);

  // ---- Lenticular: controles usados na janela de salvar e na folha de teste ----
  function lentEffectRows(l, box, rerender) {
      const effect = row("Effect");
      effect.appendChild(segmented([["flip", "Animation (tilt up/down)"], ["3d", "3D (left/right)"]], l.effect, (v) => {
        l.effect = v;
        const list = v === "3d" ? LENSES_3D : LENSES;
        if (!list.some(([x]) => x === l.lpi) && !l.lpiOther) l.lpi = list[list.length - 1][0];
        rerender();
      }));
      if (!(arguments[3] && arguments[3].noReverse)) effect.appendChild(checkOption("Reverse order", l.reverse, (v) => { l.reverse = v; rerender(); }));
      box.appendChild(effect);
      addTip(box, (l.effect === "3d"
        ? "3D needs photos taken side by side along a straight line (left to right). A bullet-time arc only works partly. Lens strips stand vertical."
        : "Animation shows one photo after another as the print tilts up and down: the bullet-time turn. Lens strips lie horizontal.") +
        " Reverse order: the photos change in the opposite direction when you tilt.", "Effect");
  }
  function lentLensRows(l, box, rerender, opts) {
      const lens = row("Lens sheet");
      const lensList = l.effect === "3d" ? LENSES_3D : LENSES;
      const lensOpts = lensList.concat([["other", "Other"]]);
      const lensCurrent = l.lpiOther ? "other" : l.lpi;
      lens.appendChild(segmented(lensOpts, lensCurrent, (v) => { if (v === "other") { l.lpiOther = true; } else { l.lpiOther = false; l.lpi = v; } rerender(); }));
      if (l.lpiOther) lens.appendChild(numField(l.lpi, (v) => { l.lpi = v; rerender(); }, { placeholder: "LPI", width: "64px" }));
      if (opts && opts.measured) {
        // Nome e campo juntos: se a linha quebrar, os dois descem juntos
        const pair = el("span", "lent-pair");
        pair.append(el("span", "export-label lent-sub", "Measured pitch"),
                    numField(l.pitch, (v) => { l.pitch = v; rerender(); }, { placeholder: String(l.lpi), width: "72px", allowEmpty: true }));
        lens.appendChild(pair);
      }
      box.appendChild(lens);
      addTip(box, "LPI = lenses per inch, printed on the sheet's package. 40–75 LPI for photo-size animation; 20–40 for 3D and posters." +
        (opts && opts.measured ? " Measured pitch: the number of the strip that stays even from end to end on the pitch test (Print pitch test, at the bottom). Empty = use the LPI of the package." : ""), "Lens sheet");
  }
  function lentPrinterRows(l, box, rerender) {
      const printer = row("Printer");
      const dpiOpts = PRINTERS.concat([["other", "Other"]]);
      printer.appendChild(segmented(dpiOpts, l.dpiOther ? "other" : l.dpi, (v) => { if (v === "other") { l.dpiOther = true; } else { l.dpiOther = false; l.dpi = v; } rerender(); }));
      if (l.dpiOther) printer.appendChild(numField(l.dpi, (v) => { l.dpi = Math.round(v); rerender(); }, { placeholder: "dpi", width: "64px" }));
      box.appendChild(printer);
      addTip(box, PRINTER_HELP, "Printer");
  }
  // ---- Parte 4 da Proporção: linha "Aspect ratio", recorte (um por sessão), "Same size" e Placement ----
  const CROP_RATIOS = [["asshot", "As shot"], ["3:2", "3:2"], ["4:3", "4:3"], ["16:9", "16:9"], ["1:1", "1:1"]];
  // A escolha guardada na sessão (session.json, também fora do Project) entra uma vez por abertura
  function cropLoad(session, st) {
    if (st.crop.loaded) return;
    st.crop.loaded = true;
    const [ratio, x, y] = String(session.crop || (sessionCrop[session.name] ? sessionCrop[session.name] + "|0.5|0.5" : "")).split("|");
    if (ratio === "asshot" || RATIOS[ratio]) st.crop.ratio = ratio;
    if (x !== undefined && !isNaN(+x)) st.crop.x = Math.max(0, Math.min(1, +x));
    if (y !== undefined && !isNaN(+y)) st.crop.y = Math.max(0, Math.min(1, +y));
  }
  // Uma fonte só: a sessão (o programa grava em session.json) e a memória do app (a etiqueta "Mixed ratios" usa)
  // Framing igual em todas as sessões marcadas (caixa no passo 1, ligada por padrão): a mudança na sessão aberta vai
  // para as outras (proporção e posição; o alinhamento é por foto e fica em cada sessão)
  function cropShare(session, st) {
    cropSave(session, st);
    if (!exp.sameFraming || $("exportOverlay").classList.contains("hidden") || !exp.selected.has(session.name)) return;
    chosenSessions().forEach((o) => { if (o.name === session.name) return; const ost = settingsFor(o.name); cropLoad(o, ost); ost.crop = Object.assign({}, st.crop, { loaded: true }); cropSave(o, ost); });
  }
  // A caixa "Same … for all ticked sessions" (passos 1 e 2): o mesmo desenho e o mesmo comportamento.
  // Clicar com traço ou vazia: todas passam a usar a configuração da sessão aberta e ficam ligadas (desfaz com ⌘Z);
  // clicar marcada: desliga (cada sessão guarda o que tem e pode mudar sozinha). Ao lado, quantas diferem.
  function sameBox(label, state, onLink, onUnlink, nDiff, title) {
    const r = el("div", "export-row same-row");
    const l = el("label", "log-option");
    const c = document.createElement("input"); c.type = "checkbox"; c.className = "cs-check";
    c.checked = state === "on"; c.indeterminate = state === "mixed";
    c.setAttribute("aria-checked", state === "mixed" ? "mixed" : state === "on" ? "true" : "false");
    c.addEventListener("change", () => { if (state === "on") onUnlink(); else onLink(); });
    l.append(c, document.createTextNode(" " + label));
    if (title) l.title = title;
    r.appendChild(l);
    if (state === "mixed") r.appendChild(el("span", "export-note same-note", plural(nDiff, "session is", "sessions are") + " different · tick to give all of them these settings"));
    return r;
  }
  function framingAllSame() {
    const list = chosenSessions().map((o) => { const ost = settingsFor(o.name); cropLoad(o, ost); return ost.crop.ratio + "|" + ost.crop.x.toFixed(3) + "|" + ost.crop.y.toFixed(3); });
    return list.every((x) => x === list[0]);
  }
  function cropSave(session, st) {
    const text = st.crop.ratio + "|" + st.crop.x.toFixed(3) + "|" + st.crop.y.toFixed(3);
    if (st.crop.ratio !== "asshot") sessionCrop[session.name] = st.crop.ratio; else delete sessionCrop[session.name];
    saveSessionCrop();
    session.crop = text;
    if (typeof window.setSessionCrop === "function") window.setSessionCrop(session.name, text);
    if (currentSession && currentSession.name === session.name) sessionHead(currentSession);
  }
  // Prévia do recorte (seção Framing): a foto escolhida apagada fora do quadro, o quadro aceso e arrastável.
  // onPick(i): trocar de foto; a instrução dos gestos fica na etiqueta de baixo.
  function cropStage(session, items, st, targetRatio, onChange) {
    const box = el("div", "crop-box crop-stage");
    const img = document.createElement("img"); img.alt = "";
    const frame = el("div", "crop-frame");
    const tag = el("span", "crop-tag");
    box.append(img, frame, tag);
    const item = items[Math.max(0, Math.min(items.length - 1, exp.photo || 0))] || items[0];
    let nat = null;      // largura/altura natural da prévia
    let sizesAll = null; // tamanho real de cada foto (o canvas depende delas)
    let slack = null;    // folga da foto atrás do quadro, em px da tela (para arrastar)
    const label = (text) => { tag.textContent = (item ? pad(item.order || 1) + " · " : "") + text; };
    const layout = () => {
      if (!nat) return;
      const bw = box.clientWidth, bh = box.clientHeight;
      img.style.transform = ""; img.style.transformOrigin = "center center";
      const sz = sizesAll && sizesAll[item.file], canvas = (targetRatio || sessionAligned(session, st)) && sz && commonFrame(items, sizesAll, st);
      if (canvas) {
        // O quadro (o canvas da exportação) fica parado, do mesmo tamanho em todas as fotos; cada foto aparece atrás
        // dele como vai sair (posição, tamanho e giro). Decisão do dono, 2026-11-04: a prévia não muda o tamanho do canvas.
        let maxW = 0, maxH = 0;
        items.forEach((it) => { const z = sizesAll[it.file]; if (z) { maxW = Math.max(maxW, z.w); maxH = Math.max(maxH, z.h); } });
        const K = Math.min(bw / (maxW * 1.04), bh / (maxH * 1.04)), cx = bw / 2, cy = bh / 2;
        const al = effectiveAlign(sz, alignOf(st, item.file), canvas, st);
        const w = sz.w * K, h = sz.h * K;
        img.style.width = w + "px"; img.style.height = h + "px";
        img.style.left = (cx + al.dx * K - w / 2) + "px"; img.style.top = (cy + al.dy * K - h / 2) + "px";
        img.style.transform = "scale(" + al.scale + ") rotate(" + al.rot + "deg)";
        frame.style.transform = "";
        frame.style.width = canvas.w * K + "px"; frame.style.height = canvas.h * K + "px";
        frame.style.left = (cx + canvas.x * K) + "px"; frame.style.top = (cy + canvas.y * K) + "px";
        frame.style.display = ""; frame.classList.add("free");
        // Arrastar só vale para fotos sem alinhamento próprio: elas seguem a posição do recorte da sessão
        const touched = !alignIsIdentity(alignOf(st, item.file)) && sessionAligned(session, st);
        slack = touched ? null : { x: (sz.w * al.scale - canvas.w) * K, y: (sz.h * al.scale - canvas.h) * K };
        const free = slack && (slack.x > 1 || slack.y > 1);
        label(free ? "Drag the photo to choose the part that stays · ← → other photos" : touched ? "This photo is aligned: move it in Align photos · ← → other photos" : "Nothing to cut: the photo fills the frame · ← → other photos");
        return;
      }
      // Sem proporção ("As shot") ou antes de saber os tamanhos: a foto inteira, sem quadro
      slack = null;
      const s = Math.min(bw / nat.w, bh / nat.h);
      const iw = nat.w * s, ih = nat.h * s;
      img.style.width = iw + "px"; img.style.height = ih + "px"; img.style.left = (bw - iw) / 2 + "px"; img.style.top = (bh - ih) / 2 + "px";
      frame.style.display = "none";
      label(targetRatio ? "Measuring the photos…" : "As shot: nothing is cut · choose a ratio below");
    };
    if (item) sessionPhoto(session.name, item.file, 1600).then((url) => { if (!url) return; img.onload = () => { nat = { w: img.naturalWidth, h: img.naturalHeight }; layout(); }; img.src = url; });
    Promise.all(items.map((it) => photoSizeOf(session.name, it.file).then((sz) => [it.file, sz]))).then((pairs) => {
      sizesAll = {}; pairs.forEach(([f, sz]) => { if (sz) sizesAll[f] = sz; }); layout();
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(box);
    let drag = null;
    box.addEventListener("dragstart", (e) => e.preventDefault());  // sem o arraste nativo da imagem (prendia o mouse)
    box.addEventListener("pointerdown", (e) => { if (!slack || e.target.closest("button")) return; drag = { x: e.clientX, y: e.clientY, cx: st.crop.x, cy: st.crop.y }; box.setPointerCapture(e.pointerId); document.body.classList.add("photo-drag"); e.preventDefault(); });
    let cropRaf = 0;
    box.addEventListener("pointermove", (e) => {
      if (!drag || !slack) return;
      const ev = e;
      if (cropRaf) cancelAnimationFrame(cropRaf);
      cropRaf = requestAnimationFrame(() => { cropRaf = 0; cropMove(ev); });
    });
    const cropMove = (e) => {
      if (!drag || !slack) return;
      // A foto acompanha o mouse: arrastar para a direita mostra mais do lado esquerdo dela
      if (slack.x > 1) st.crop.x = Math.max(0, Math.min(1, drag.cx - (e.clientX - drag.x) / slack.x));
      if (slack.y > 1) st.crop.y = Math.max(0, Math.min(1, drag.cy - (e.clientY - drag.y) / slack.y));
      layout();
    };
    const endDrag = () => { if (!drag) return; drag = null; document.body.classList.remove("photo-drag"); onChange(true); };
    box.addEventListener("pointerup", endDrag); box.addEventListener("pointercancel", endDrag); box.addEventListener("lostpointercapture", endDrag);
    box.relayout = layout;
    return box;
  }
  // Seção "Framing" do Export (decisão do dono, 2026-11-03, protótipo W1): proporção + Same size (pedaço 1);
  // o alinhamento das fotos (referências, Move/Size/Rotate) vem no pedaço 2
  // O que acontece em "As shot" com proporções misturadas (decisão do dono, 2026-11-04: cobrir a sequência e o
  // lenticular, com o ícone de alerta âmbar)
  const MIXED_EFFECT = '"As shot" keeps each photo as it is: the sequence will jump (black bands come and go), and in the lenticular print the subject changes size between photos. Choose a ratio to give every photo the same frame.';
  function mixedWarn(text) {
    const d = el("div", "export-note exp-warn mixed-warn");
    const ic = el("span", "mixed-warn-icon"); ic.innerHTML = icon("alert"); ic.setAttribute("aria-hidden", "true");
    d.append(ic, el("span", "", text));
    return d;
  }
  function framingRows(session, st, box, rerender) {
    cropLoad(session, st);
    const info = ratioInfoCached(session.name);
    const r = row("Aspect ratio");
    r.appendChild(segmented(CROP_RATIOS, st.crop.ratio, (v) => { st.crop.ratio = v; cropShare(session, st); rerender(); }));
    if (st.crop.ratio !== "asshot" && info && info.keep && info.keep[st.crop.ratio] != null) r.appendChild(el("span", "export-keep", "keeps " + info.keep[st.crop.ratio] + "%"));
    box.appendChild(r);
    if (info && info.mixed && st.crop.ratio === "asshot" && !sessionAligned(session, st)) box.appendChild(mixedWarn("Mixed ratios · " + ratioText(info).replace(/^Camera/, "camera") + " " + MIXED_EFFECT));
    else if (info && info.mixed) box.appendChild(el("div", "export-note", "Mixed ratios · " + ratioText(info).replace(/^Camera/, "camera") + " Every photo goes through the same frame, so nothing jumps."));
    addTip(box, "The shape every export gets: converted photos, the sequence and the lenticular print (Fill) are cut to it; the originals are never cropped. " +
      "One crop for the whole session, and every converted photo comes out with the same pixel size (the smallest camera's).", "Aspect ratio");
    if (st.crop.ratio !== "asshot") {
      const pos = row("Position");
      const dots = el("div", "crop-dots");
      const names = ["Top left", "Top", "Top right", "Left", "Center", "Right", "Bottom left", "Bottom", "Bottom right"];
      [0, 0.5, 1].forEach((y, yi) => [0, 0.5, 1].forEach((x, xi) => {
        const d = el("button", "crop-dot" + (Math.abs(x - st.crop.x) < 0.01 && Math.abs(y - st.crop.y) < 0.01 ? " on" : "")); d.type = "button"; d.title = names[yi * 3 + xi];
        d.addEventListener("click", () => { st.crop.x = x; st.crop.y = y; cropShare(session, st); rerender(); });
        dots.appendChild(d);
      }));
      pos.append(dots, el("span", "export-note-inline", "Or drag the photo in the preview. One crop for the whole session."));
      box.appendChild(pos);
    }
  }
  // =================== Alinhamento das fotos (pedaço 2 do Framing) ===================
  // Cada foto pode ser movida, redimensionada e girada sobre as outras ("Align photos", no Export). Unidades: pixels
  // do original (dx, dy), fração do tamanho (scale) e graus (rot, sentido horário). Guardado em session.json
  // ("align": "arquivo:dx,dy,scale,rot;..."); os originais não mudam; o programa aplica na exportação (Converted,
  // Sequence e Lenticular Fill) e corta tudo ao "quadro comum" (o que todas as fotos cobrem depois do ajuste).
  const photoSizes = {};  // "sessão/arquivo" → Promise<{ w, h }> (tamanho real da foto, pelo programa)
  function photoSizeOf(sessionName, file) {
    const key = sessionName + "/" + file;
    if (!photoSizes[key]) {
      photoSizes[key] = (typeof window.photoSize === "function" ? window.photoSize(sessionName, file) : Promise.resolve(null))
        .then((r) => (r && r.width > 0 ? { w: r.width, h: r.height } : null)).catch(() => null);
    }
    return photoSizes[key];
  }
  let alignPrefs = { prev: true, next: true, opacity: 0.6 };
  try { Object.assign(alignPrefs, JSON.parse(localStorage.getItem("stillpoint.alignPrefs") || "{}") || {}); } catch (e) {}
  function saveAlignPrefs() { try { localStorage.setItem("stillpoint.alignPrefs", JSON.stringify(alignPrefs)); } catch (e) {} }
  // base: o tamanho escolhido pela pessoa; scale: o tamanho em uso (o base, ou mais, quando o giro obriga a crescer
  // para continuar cobrindo a área útil; volta ao base conforme o giro é desfeito)
  const ALIGN_ID = () => ({ dx: 0, dy: 0, scale: 1, rot: 0, base: 1 });
  function alignIsIdentity(a) { return !a || (Math.abs(a.dx) < 1e-6 && Math.abs(a.dy) < 1e-6 && Math.abs(a.scale - 1) < 1e-9 && Math.abs(a.rot) < 1e-9); }
  function alignLoad(session, st) {
    if (st.align.loaded) return;
    st.align.loaded = true;
    st.align.byFile = {};
    String(session.align || "").split(";").forEach((item) => {
      const colon = item.lastIndexOf(":");
      if (colon <= 0) return;
      const [dx, dy, scale, rot, base] = item.slice(colon + 1).split(",").map(Number);
      st.align.byFile[item.slice(0, colon)] = { dx: dx || 0, dy: dy || 0, scale: scale > 0 ? scale : 1, rot: rot || 0, base: base > 0 ? base : (scale > 0 ? scale : 1) };
    });
  }
  function alignText(st) {
    return Object.keys(st.align.byFile).filter((f) => !alignIsIdentity(st.align.byFile[f]))
      .map((f) => { const a = st.align.byFile[f]; return f + ":" + a.dx.toFixed(2) + "," + a.dy.toFixed(2) + "," + a.scale.toFixed(5) + "," + a.rot.toFixed(3) + "," + (a.base || a.scale).toFixed(5); }).join(";");
  }
  function alignSave(session, st) {
    const text = alignText(st);
    session.align = text;
    if (typeof window.setSessionAlign === "function") window.setSessionAlign(session.name, text);
  }
  function alignOf(st, file) { return st.align.byFile[file] || ALIGN_ID(); }  // só lê: uma foto sem ajuste não ganha entrada
  // Alinhamento em uso: só com uma proporção escolhida (decisão do dono, 2026-11-04, opção B: "As shot" é sempre como
  // saiu; o alinhamento guardado volta a valer quando se escolhe uma proporção)
  // Revisto em 2026-11-04 (decisão do dono): só a sessão com proporções misturadas precisa de uma proporção para
  // alinhar; numa sessão toda igual, "As shot" já é uma forma só (o canvas é a própria foto) e o alinhamento vale.
  function sessionMixed(session) { const r = ratioInfoCached(session.name); return !!(r && r.mixed); }
  function needsRatio(session, st) { cropLoad(session, st); return st.crop.ratio === "asshot" && sessionMixed(session); }
  function sessionAligned(session, st) { alignLoad(session, st); cropLoad(session, st); return !needsRatio(session, st) && Object.keys(st.align.byFile).some((f) => !alignIsIdentity(st.align.byFile[f])); }
  // "Align photos" com "As shot": pede uma proporção antes (a escolhida aparece depois na tela de alinhamento)
  // Escolher: a sessão passa a essa proporção e a tela "Align photos" abre nela (vinda da aba Framing ou de outra
  // sessão, já dentro de "Align photos"). Cancel: nada muda. ⌘Z desfaz a escolha e volta para onde estava; ⇧⌘Z abre
  // a tela de novo.
  function askRatioForAlign(session, st, rerender) {
    const fromActive = exp.active, fromAligning = !!exp.aligning, fromPhoto = exp.photo;
    const info = ratioInfoCached(session.name);
    const suggest = info && info.suggest && RATIO_ORDER.includes(info.suggest) ? info.suggest : "";
    const choose = (r) => {
        ui.dialogOverlay.classList.add("hidden");
        expTrack();  // o que estava antes da escolha
        st.crop.ratio = r; cropShare(session, st);
        exp.active = session.name; if (fromActive !== session.name) exp.photo = 0; exp.aligning = true;
        renderExport();
        expTrack();
        const top = history.undo[history.undo.length - 1];
        if (top && top.exportWin && !top.alignRatio) {
          const u0 = top.undo, r0 = top.redo;
          top.alignRatio = true;
          top.label = "Ratio " + r + " for Align photos";
          top.undo = () => { const r = u0(); if (r === false) return false; exp.active = fromActive; exp.photo = fromPhoto; exp.aligning = fromAligning; renderExport(); };
          top.redo = () => r0();  // o lugar guardado já é "Align photos" na sessão escolhida
        }
    };
    const box = el("div", "ratio-others");
    box.appendChild(el("span", "ratio-others-label", suggest ? "Other ratios" : "Ratio for the alignment"));
    RATIO_ORDER.filter((r) => r !== suggest).forEach((r) => {
      const b = el("button", "btn btn-small ratio-chip btn-secondary"); b.type = "button";
      b.appendChild(document.createTextNode(r + " "));
      if (info && info.keep && info.keep[r] != null) b.appendChild(el("span", "dim", "· keeps " + info.keep[r] + "%"));
      b.addEventListener("click", () => choose(r));
      box.appendChild(b);
    });
    // A sugerida (a que perde menos) é o botão verde, ao lado direito do Cancel (decisão do dono, 2026-11-04)
    const buttons = [{ label: "Cancel" }];
    if (suggest) buttons.push({ label: "Use " + suggest + (info.keep && info.keep[suggest] != null ? " · keeps " + info.keep[suggest] + "%" : ""), primary: true, onClick: () => choose(suggest) });
    dialog("Choose a ratio first",
      "Aligning moves and rotates the photos, so they need one frame in the same shape: \"As shot\" keeps each photo as the camera made it and cannot be aligned. Choose the ratio the alignment will use; you can change it later in Align photos.",
      buttons, box);
  }
  // A foto (w×h, com o seu tamanho e giro, centrada em dx,dy) cobre inteiro o retângulo reto r? Conferência exata
  // pelos quatro cantos de r levados ao espaço da foto (a mesma conta do programa, Export::Covers)
  function photoCovers(w, h, a, r) {
    const rad = a.rot * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad), eps = 0.01;
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].every(([px, py]) => {
      const x = px - a.dx, y = py - a.dy;
      const ux = (x * cs + y * sn) / a.scale, uy = (-x * sn + y * cs) / a.scale;
      return Math.abs(ux) <= w / 2 + eps && Math.abs(uy) <= h / 2 + eps;
    });
  }
  // O canvas (centro em 0,0): a interseção das fotos como saíram da câmera e, com proporção escolhida, o maior
  // retângulo nessa proporção que cabe nela. Nenhuma foto é ampliada (decisão do dono, 2026-11-03: ampliar mudaria o
  // tamanho do objeto fotografado entre as câmeras). Mover, redimensionar ou girar uma foto não muda o canvas (a mesma
  // conta do programa, Export::ComputeCommonFrame)
  function commonFrame(items, sizes, st) {
    let left = -1e18, top = -1e18, right = 1e18, bottom = 1e18;
    items.forEach((item) => {
      const sz = sizes[item.file]; if (!sz) return;
      left = Math.max(left, -sz.w / 2); right = Math.min(right, sz.w / 2);
      top = Math.max(top, -sz.h / 2); bottom = Math.min(bottom, sz.h / 2);
    });
    let cw = right - left, ch = bottom - top;
    const r = st && st.crop.ratio !== "asshot" ? RATIOS[st.crop.ratio] : 0;
    if (r && cw > 0 && ch > 0) { const t = cw >= ch ? r : 1 / r; if (cw / ch > t) cw = ch * t; else ch = cw / t; }
    if (cw < 16 || ch < 16) return null;
    return { x: -cw / 2, y: -ch / 2, w: cw, h: ch };
  }
  // O menor tamanho (a partir de from) com que a foto w×h, nessa posição e giro, cobre o retângulo r; 0 se nem 20× basta
  function minCoverOf(w, h, al, from, r) {
    if (photoCovers(w, h, Object.assign({}, al, { scale: from }), r)) return from;
    let lo = from, hi = 20;
    if (!photoCovers(w, h, Object.assign({}, al, { scale: hi }), r)) return 0;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (photoCovers(w, h, Object.assign({}, al, { scale: mid }), r)) hi = mid; else lo = mid; }
    return hi;
  }
  // O que vale para uma foto na tela e na exportação: sem ajuste da pessoa (entrada igual à identidade), ela fica
  // centrada no menor tamanho que cobre o canvas, com a posição do recorte (posX/posY) repartindo a folga; com ajuste,
  // o que a pessoa fez, com o tamanho em uso nunca abaixo do necessário
  function effectiveAlign(sz, al, frame, st) {
    if (alignIsIdentity(al)) {
      const base = { dx: 0, dy: 0, scale: 1, rot: 0, base: 1 };
      const need = minCoverOf(sz.w, sz.h, base, 1, frame) || 1;
      return { dx: (0.5 - st.crop.x) * (sz.w * need - frame.w), dy: (0.5 - st.crop.y) * (sz.h * need - frame.h), scale: need, rot: 0, base: 1 };
    }
    const need = minCoverOf(sz.w, sz.h, al, Math.max(0.05, al.base || al.scale), frame);
    return Object.assign({}, al, { scale: need ? Math.max(al.scale, need) : al.scale });
  }

  // A foto como sai na exportação: cortada ao canvas (com a proporção) e com o alinhamento da sessão. Montada num
  // canvas a partir da prévia; guardada por foto e Framing. Sem proporção nem alinhamento, a própria prévia.
  const framedCache = new Map();
  function framedUrl(session, items, st, item, url, maxPx) {
    const px = maxPx || 1600;
    cropLoad(session, st); alignLoad(session, st);
    if (st.crop.ratio === "asshot" && !sessionAligned(session, st)) return Promise.resolve(url);
    const key = [session.name, item.file, st.crop.ratio, st.crop.x, st.crop.y, alignText(st), px].join("|");
    if (framedCache.has(key)) return framedCache.get(key);
    const p = Promise.all(items.map((it) => photoSizeOf(session.name, it.file).then((sz) => [it.file, sz]))).then((pairs) => {
      const sizes = {}; pairs.forEach(([f, sz]) => { if (sz) sizes[f] = sz; });
      const sz = sizes[item.file], frame = sz && commonFrame(items, sizes, st);
      if (!frame) return url;
      return new Promise((done) => {
        const im = new Image();
        im.onload = () => {
          const al = effectiveAlign(sz, alignOf(st, item.file), frame, st);
          const k = Math.min(1, px / Math.max(frame.w, frame.h));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(frame.w * k)); c.height = Math.max(1, Math.round(frame.h * k));
          const ctx = c.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.translate(c.width / 2, c.height / 2);  // o canvas tem o centro em 0,0
          ctx.translate(al.dx * k, al.dy * k);
          ctx.rotate(al.rot * Math.PI / 180);
          ctx.scale(al.scale, al.scale);
          ctx.drawImage(im, -sz.w * k / 2, -sz.h * k / 2, sz.w * k, sz.h * k);
          let out = url; try { out = c.toDataURL("image/jpeg", 0.9); } catch (e) {}
          done(out);
        };
        im.onerror = () => done(url);
        im.src = url;
      });
    });
    framedCache.set(key, p);
    return p;
  }

  // A tela "Align photos" dentro da janela do Export (protótipo X2, 2026-11-03): prévia grande com as referências
  // tingidas por cima, a fileira de miniaturas embaixo e, numa coluna à direita, References, This photo, Common frame e
  // Aspect ratio/Position. Arrastar move a foto, a roda redimensiona, ⌥ + roda gira, ← → trocam de foto, ⌘ + setas
  // movem 1 px (⇧ 10).
  function alignScreen(session, items, st, outer, rows, top, rerender) {
    alignLoad(session, st); cropLoad(session, st);
    const REF_COLORS = { prev: "#4da3ff", next: "#ff8a3d" };
    const n = items.length;
    let cur = Math.max(0, Math.min(n - 1, exp.photo || 0));
    const item = items[cur];
    top.innerHTML = "";
    // Sem "Back to Framing" aqui: sair é pelo "Done aligning" do rodapé ou pelo Esc (decisão do dono, 2026-11-04)
    const where = el("span", "align-where", "Photo " + pad(item.order || cur + 1) + " of " + pad(n) + " · ← → other photos");
    top.appendChild(where);
    rows.classList.add("hidden");
    const wrap = el("div", "align-wrap");
    const left = el("div", "align-left");
    const keepPanel = alignScreen.panelScroll || 0;  // a coluna é redesenhada a cada mudança: mantém a rolagem
    const stage = el("div", "export-preview align-stage");
    const layers = el("div", "align-layers");
    const common = el("div", "align-common");
    const ratio = el("div", "crop-frame align-ratio");
    // Caixa de transformação sobre a foto atual: cantos redimensionam (em volta do centro), a alça de cima gira,
    // o meio move (como arrastar a prévia)
    const box = el("div", "align-box");
    const handles = {};
    ["tl", "tr", "bl", "br"].forEach((c) => { handles[c] = el("div", "align-handle align-handle-" + c); box.appendChild(handles[c]); });
    const rotLine = el("div", "align-rot-line"); const rotHandle = el("div", "align-rot-handle");
    box.append(rotLine, rotHandle);
    const tagText = pad(item.order || cur + 1) + " · Drag to move · scroll to zoom · hold space and drag to pan · ⌥ scroll to rotate · ⌘ arrows 1 px (⇧ 10)";
    const tag = el("span", "crop-tag", tagText);
    const wait = el("div", "align-wait", "Measuring the photos…");
    stage.append(layers, common, ratio, box, tag, wait);
    left.appendChild(stage);
    // Fileira de miniaturas, com um ponto da cor da referência
    const stripScroll = el("div", "export-strip-scroll");
    const strip = el("ul", "export-strip");
    stripScroll.appendChild(strip);
    const refIndex = { prev: cur - 1, next: cur + 1 };
    const mixedInfo = ratioInfoCached(session.name);
    items.forEach((it, k) => {
      const li = el("li", "frame" + (k === cur ? " selected" : ""));
      li.innerHTML = '<div class="frame-img"><img alt=""><span class="frame-badge"></span></div>';
      li.querySelector(".frame-badge").textContent = pad(it.order || k + 1);
      ["prev", "next"].forEach((key) => { if (alignPrefs[key] && refIndex[key] === k && k !== cur) { const dot = el("span", "align-refdot"); dot.style.background = REF_COLORS[key]; li.appendChild(dot); } });
      if (!alignIsIdentity(st.align.byFile[it.file])) li.classList.add("aligned");
      // Proporções misturadas: a mesma marca da tela principal (borda tracejada âmbar e a proporção no canto)
      if (mixedInfo && mixedInfo.mixed && mixedInfo.marked.includes(it.group)) { li.classList.add("ratio-warn"); li.appendChild(el("span", "frame-ratio", mixedInfo.byGroup[it.group] || "")); }
      sessionPhoto(session.name, it.file, 320).then((url) => { if (url) li.querySelector("img").src = url; });
      li.addEventListener("click", () => { exp.photo = k; photoRerender(); });
      strip.appendChild(li);
    });
    const slot = el("div", "export-strip-slot"); slot.appendChild(stripScroll); left.appendChild(slot);
    exp.keyNav = (d) => { const k = Math.max(0, Math.min(n - 1, cur + d)); if (k === cur) return; exp.photo = k; photoRerender(); };
    wrap.appendChild(left);

    // Coluna de controles
    const panel = el("div", "align-panel");
    const block = (title, extra) => { const b = el("div", "align-block"); if (title) { const h = el("h3", "", title); if (extra) h.appendChild(extra); b.appendChild(h); } panel.appendChild(b); return b; };
    const refs = block("References");
    // Opacidade: uma barra por referência; a barra "All" move as três juntas (decisão do dono, 2026-11-03)
    if (!alignPrefs.op) alignPrefs.op = {};
    const opOf = (key) => (alignPrefs.op[key] != null ? alignPrefs.op[key] : alignPrefs.opacity);
    const slider = (value, onInput) => {
      const r = el("div", "align-opacity");
      const inp = document.createElement("input"); inp.type = "range"; inp.className = "noct-range"; inp.min = "5"; inp.max = "100"; inp.value = String(Math.round(value * 100));
      const val = el("span", "align-opval", inp.value + "%");
      inp.addEventListener("input", () => { val.textContent = inp.value + "%"; onInput((+inp.value) / 100); layout(); });
      inp.addEventListener("change", saveAlignPrefs);
      r.append(inp, val);
      return { row: r, input: inp, val };
    };
    const refSliders = {};
    // Ordem (decisão do dono, 2026-11-03): Previous photo, Current photo (#n, a própria foto, sem caixa), Next photo.
    // Cada uma com a sua barra de opacidade; a barra da Current photo move as três juntas, e mexer numa referência a
    // desprende até a próxima vez que a da Current photo for usada. Nas pontas, a referência que não existe fica
    // desativada.
    const refRow = (key, label, k) => {
      const isCur = key === "cur";
      const off = !isCur && (k < 0 || k >= n);
      const r = el("div", "align-ref" + (off ? " dimmed" : "") + (isCur ? " align-ref-me" : ""));
      const head = el(isCur ? "div" : "label", "align-ref-head");
      if (!isCur) {
        const c = document.createElement("input"); c.type = "checkbox"; c.className = "cs-check"; c.checked = !!alignPrefs[key]; c.disabled = off;
        c.addEventListener("change", () => { alignPrefs[key] = c.checked; saveAlignPrefs(); rerender(); });
        head.appendChild(c);
      }
      const sw = el("span", "align-sw" + (isCur ? " align-sw-me" : "")); if (!isCur) sw.style.background = REF_COLORS[key];
      head.append(sw, document.createTextNode(label), el("span", "align-who", isCur ? pad(item.order || cur + 1) : !off ? pad(items[k].order || k + 1) : "none"));
      const sl = slider(isCur ? alignPrefs.opacity : opOf(key), (v) => {
        if (isCur) {
          alignPrefs.opacity = v; alignPrefs.op = {};  // as três juntas
          Object.keys(refSliders).forEach((o) => { refSliders[o].input.value = String(Math.round(v * 100)); refSliders[o].val.textContent = Math.round(v * 100) + "%"; });
        } else alignPrefs.op[key] = v;
      });
      sl.input.title = isCur ? "Opacity of every photo at once (the current photo and the references)" : "Opacity of this reference only";
      sl.input.disabled = off;
      if (!isCur) refSliders[key] = sl;
      r.append(head, sl.row);
      refs.appendChild(r);
    };
    refRow("prev", "Previous photo", cur - 1);
    refRow("cur", "Current photo", cur);
    refRow("next", "Next photo", cur + 1);

    const self = block("This photo", el("span", "align-cur", pad(item.order || cur + 1)));
    // Cópia de trabalho: só vai para a sessão (e para o desfazer) quando a pessoa termina uma mudança (save)
    const a = Object.assign({}, alignOf(st, item.file));
    const fields = {};
    // Trava (como o Lightroom ao girar): a foto nunca deixa de cobrir a área útil — o quadro da proporção (ou o quadro
    // comum, sem proporção) como está no começo do gesto. Um passo que descobriria parte dela é recusado.
    let lockRect = null;
    const lockStart = () => { lockRect = usefulRect(); };
    // O menor tamanho (a partir de from) com que a foto cobre a área útil nessa posição e giro; null se nem 4× basta
    const minCoverScale = (cand, from) => {
      if (covers(Object.assign({}, cand, { scale: from }))) return from;
      let lo = from, hi = Math.min(20, from * 4);
      if (!covers(Object.assign({}, cand, { scale: hi }))) return null;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (covers(Object.assign({}, cand, { scale: mid }))) hi = mid; else lo = mid; }
      return hi;
    };
    const covers = (cand) => {
      const sz = sizes[item.file]; if (!sz || !lockRect) return true;
      // A área útil de referência não depende do tamanho desta foto: para a trava, ela é calculada com a foto no base
      return photoCovers(sz.w, sz.h, cand, lockRect);
    };
    // Tenta aplicar uma mudança; se descobrir a área útil, mantém o que havia (nos movimentos, tenta cada eixo)
    const tryApply = (change) => {
      const cand = Object.assign({}, a); change(cand);
      if (cand.scale !== a.scale) cand.base = cand.scale;  // tamanho mexido pela pessoa: vira o novo base
      // Girar (ou mover com giro): o tamanho em uso é o base, ou o mínimo acima dele que ainda cobre a área (como o
      // Lightroom); ao desfazer o giro ele volta ao base
      if (cand.rot !== a.rot || (cand.scale === a.scale && (cand.dx !== a.dx || cand.dy !== a.dy))) {
        const need = minCoverScale(cand, cand.base || cand.scale);
        if (need != null && cand.rot !== a.rot) { cand.scale = need; Object.assign(a, cand); return true; }
      }
      if (covers(cand)) { Object.assign(a, cand); return true; }
      if ((cand.dx !== a.dx || cand.dy !== a.dy) && cand.scale === a.scale && cand.rot === a.rot) {
        // Mover além do limite: cada eixo vai até onde ainda cobre a área útil (a foto encosta na borda, sem parar
        // antes) e o outro eixo continua livre
        const before = { dx: a.dx, dy: a.dy };
        ["dx", "dy"].forEach((axis) => {
          if (cand[axis] === a[axis]) return;
          const t = Object.assign({}, a, { [axis]: cand[axis] });
          if (covers(t)) { a[axis] = cand[axis]; return; }
          let lo = a[axis], hi = cand[axis];
          for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; t[axis] = mid; if (covers(t)) lo = mid; else hi = mid; }
          a[axis] = lo;
        });
        stage.classList.add("locked"); clearTimeout(lockFlash); lockFlash = setTimeout(() => stage.classList.remove("locked"), 300);
        return a.dx !== before.dx || a.dy !== before.dy;
      }
      stage.classList.add("locked"); clearTimeout(lockFlash); lockFlash = setTimeout(() => stage.classList.remove("locked"), 300);
      return false;
    };
    let lockFlash = 0;
    const stepOnce = (change) => { lockStart(); tryApply(change); sync(); layout(); save(); };
    // Até onde a foto pode ir num eixo sem descobrir a área útil (procura a partir de onde está)
    const reach = (axis, dir) => {
      const sz = sizes[item.file]; if (!sz) return a[axis];
      let lo = a[axis], hi = a[axis] + dir * Math.max(sz.w, sz.h) * a.scale;
      if (!covers(Object.assign({}, a, { [axis]: lo }))) return a[axis];
      if (covers(Object.assign({}, a, { [axis]: hi }))) return hi;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (covers(Object.assign({}, a, { [axis]: mid }))) lo = mid; else hi = mid; }
      return lo;
    };
    const placePhoto = (x, y) => {
      lockStart();
      const minX = reach("dx", -1), maxX = reach("dx", 1), minY = reach("dy", -1), maxY = reach("dy", 1);
      // Ponto da esquerda = a foto empurrada para a esquerda até o limite (o seu lado esquerdo cola no da área)
      a.dx = Math.round(minX + (maxX - minX) * x); a.dy = Math.round(minY + (maxY - minY) * y);
      sync(); layout(); save();
    };
    // O ponto aceso é onde a foto está dentro da folga (sem folga num eixo, conta como o meio)
    let posDots = null;
    const markPosDots = () => {
      if (!posDots || !sizes[item.file]) return;
      lockStart();
      const minX = reach("dx", -1), maxX = reach("dx", 1), minY = reach("dy", -1), maxY = reach("dy", 1);
      const fx = maxX - minX > 1 ? (a.dx - minX) / (maxX - minX) : 0.5, fy = maxY - minY > 1 ? (a.dy - minY) / (maxY - minY) : 0.5;
      [...posDots.children].forEach((d) => d.classList.toggle("on", Math.abs(+d.dataset.x - fx) < 0.02 && Math.abs(+d.dataset.y - fy) < 0.02));
    };
    // Segurar o − ou o + repete o passo (400 ms para começar, depois a cada 60 ms)
    const holdButton = (icon, title, step, bigStep, apply) => {
      const b = button("", () => {}, { icon, title, kind: "btn-secondary" });
      let timer = 0, repeat = 0;
      const stop = () => { clearTimeout(timer); clearInterval(repeat); timer = repeat = 0; };
      b.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); b.setPointerCapture(e.pointerId);
        const amount = e.shiftKey ? bigStep : step;
        lockStart(); tryApply((c) => apply(c, amount)); sync(); layout();
        timer = setTimeout(() => { repeat = setInterval(() => { if (!tryApply((c) => apply(c, amount))) stop(); sync(); layout(); }, 60); }, 400);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => b.addEventListener(ev, () => { if (timer || repeat) { stop(); save(); } }));
      return b;
    };
    const control = (key, label, unit, step, bigStep, decimals, get, apply) => {
      const r = el("div", "align-ctl");
      const inp = document.createElement("input"); inp.type = "text"; inp.className = "lent-num align-num"; inp.value = get().toFixed(decimals);
      inp.setAttribute("aria-label", label);
      const typed = () => { const v = parseFloat(inp.value.replace(",", ".")); if (!isNaN(v)) stepOnce((c) => apply(c, v - get())); else sync(); };
      inp.addEventListener("change", typed);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { typed(); inp.blur(); } if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); stepOnce((c) => apply(c, (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? bigStep : step))); } e.stopPropagation(); });
      const minus = holdButton("minus", "−" + step + " (⇧ " + bigStep + "); hold to repeat", step, bigStep, (c, amt) => apply(c, -amt));
      const plus = holdButton("plus", "+" + step + " (⇧ " + bigStep + "); hold to repeat", step, bigStep, (c, amt) => apply(c, amt));
      inp.title = unit;  // a unidade e os passos ficam na dica (sem legenda ao lado; decisão do dono, 2026-11-03)
      r.append(el("span", "align-lab", label), minus, inp, plus);
      fields[key] = inp;
      self.appendChild(r);
    };
    control("dx", "Move X", "Pixels of the original · steps of 1 (⇧ 10)", 1, 10, 0, () => a.dx, (c, d) => { c.dx += d; });
    control("dy", "Move Y", "Pixels of the original · steps of 1 (⇧ 10)", 1, 10, 0, () => a.dy, (c, d) => { c.dy += d; });
    control("scale", "Size", "Percent of the original · steps of 0.1 (⇧ 1)", 0.1, 1, 1, () => a.scale * 100, (c, d) => { c.scale = Math.max(0.05, Math.min(20, c.scale + d / 100)); });
    control("rot", "Rotate", "Degrees, clockwise · steps of 0.05 (⇧ 0.5)", 0.05, 0.5, 2, () => a.rot, (c, d) => { c.rot = Math.round((c.rot + d) * 1000) / 1000; });
    const resets = el("div", "align-resets");
    // Fit to canvas: a foto centrada, com o giro que tem, no menor tamanho que ainda cobre a área útil
    resets.appendChild(button("Fit to canvas", () => {
      if (!sizes[item.file]) return;
      lockStart();
      const sz = sizes[item.file];
      const need = minCoverOf(sz.w, sz.h, Object.assign({}, a, { dx: 0, dy: 0 }), 0.05, lockRect);
      if (!need) return;
      a.dx = 0; a.dy = 0; a.scale = need; a.base = need;
      sync(); layout(); save();
    }, { kind: "btn-secondary", title: "Centre this photo and make it the smallest size that still covers the canvas (the rotation stays)" }));
    resets.appendChild(button("Reset photo", () => { delete st.align.byFile[item.file]; alignSave(session, st); expTrack(); rerender(); }, { kind: "btn-secondary" }));
    resets.appendChild(button("Reset all", () => { st.align.byFile = {}; alignSave(session, st); expTrack(); rerender(); }, { kind: "btn-secondary" }));
    self.appendChild(resets);
    const cf = el("div", "align-cf", "Measuring the photos…");  // o quadro comum numa linha, aqui mesmo
    self.appendChild(cf);
    // Proporção (a mesma da aba Framing; vale para a sessão inteira) e a posição da foto atual dentro da folga que
    // ela tem sobre a área útil (decisão do dono, 2026-11-03: o recorte não se move aqui; a foto, sim)
    const ar = block("");
    const arRows = el("div", "align-rows");
    {
      const info = ratioInfoCached(session.name);
      const r = row("Aspect ratio");
      r.appendChild(segmented(CROP_RATIOS, st.crop.ratio, (v) => { st.crop.ratio = v; cropShare(session, st); rerender(); },
        (v) => (v === "asshot" && sessionMixed(session) ? "Aligned photos need a ratio. To keep each photo as shot, go back to Framing and choose As shot there (the alignment is kept for later)." : "")));
      if (st.crop.ratio !== "asshot" && info && info.keep && info.keep[st.crop.ratio] != null) r.appendChild(el("span", "export-keep", "keeps " + info.keep[st.crop.ratio] + "%"));
      arRows.appendChild(r);
      addTip(arRows, "The shape every export gets, for the whole session; the crop frame stays where the Framing tab put it.", "Aspect ratio");
      const pos = row("Position");
      const dots = el("div", "crop-dots");
      const names = ["Top left", "Top", "Top right", "Left", "Center", "Right", "Bottom left", "Bottom", "Bottom right"];
      [0, 0.5, 1].forEach((y, yi) => [0, 0.5, 1].forEach((x, xi) => {
        const d = el("button", "crop-dot"); d.type = "button"; d.title = names[yi * 3 + xi]; d.dataset.x = x; d.dataset.y = y;
        d.addEventListener("click", () => placePhoto(x, y));
        dots.appendChild(d);
      }));
      pos.appendChild(dots);
      posDots = dots;
      arRows.appendChild(pos);
    }
    ar.appendChild(arRows);
    wrap.appendChild(panel);
    outer.insertBefore(wrap, rows);
    panel.addEventListener("scroll", () => { alignScreen.panelScroll = panel.scrollTop; });
    if (keepPanel) { panel.scrollTop = keepPanel; requestAnimationFrame(() => { panel.scrollTop = keepPanel; }); }

    const sync = () => { fields.dx.value = a.dx.toFixed(0); fields.dy.value = a.dy.toFixed(0); fields.scale.value = (a.scale * 100).toFixed(1); fields.rot.value = a.rot.toFixed(2); markPosDots(); };
    let saveTimer = 0;
    // Fim de uma mudança: vai para a sessão, para session.json (logo em seguida) e vira um passo do desfazer
    const save = () => {
      clearTimeout(saveSoonTimer);
      if (alignIsIdentity(a)) delete st.align.byFile[item.file]; else st.align.byFile[item.file] = Object.assign({}, a);
      clearTimeout(saveTimer); saveTimer = setTimeout(() => alignSave(session, st), 150);
      expTrack();
    };
    // Para gestos contínuos (roda): um passo só depois de parar
    let saveSoonTimer = 0;
    const saveSoon = () => { clearTimeout(saveSoonTimer); saveSoonTimer = setTimeout(save, 350); };

    // Tamanhos reais e as imagens das camadas
    const sizes = {};
    let scaleK = 1, cx = 0, cy = 0, baseK = 1;  // canvas (px do original) → tela; baseK: a escala com zoom 100%
    // Zoom e deslocamento da prévia (só a vista; não mexe nas fotos): a roda aproxima e afasta, espaço + arrastar desloca
    if (!exp.alignView) exp.alignView = { zoom: 1, px: 0, py: 0 };
    const view = exp.alignView;
    const layerOf = {};
    const makeLayer = (it, key) => {
      const l = el("div", "align-layer" + (key ? " align-ref" : " align-current"));
      const im = document.createElement("img"); im.alt = "";
      l.appendChild(im);
      if (key) { const tint = el("div", "align-tint"); tint.style.background = REF_COLORS[key]; l.appendChild(tint); }
      sessionPhoto(session.name, it.file, 1600).then((url) => { if (url) im.src = url; });
      return l;
    };
    // As referências embaixo, tingidas; a foto atual por cima. Cada camada com a sua opacidade (onion skin)
    const order = [];
    ["prev", "next"].forEach((key) => { const k = refIndex[key]; if (alignPrefs[key] && k >= 0 && k < n && k !== cur && !order.some((o) => o.k === k)) order.push({ k, key }); });
    const refKeyOf = {};
    order.forEach((o) => { layerOf[o.k] = makeLayer(items[o.k], o.key); refKeyOf[o.k] = o.key; layers.appendChild(layerOf[o.k]); });
    layerOf[cur] = makeLayer(item, ""); layers.appendChild(layerOf[cur]);

    // A área útil é o canvas (o recorte na proporção escolhida); a foto tem de cobri-lo sempre
    const usefulRect = () => commonFrame(items, sizes, st);  // o recorte é o canvas inteiro
    const layout = () => {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H || !sizes[item.file]) return;
      // Escala da tela: a maior foto (com margem) cabe inteira com zoom 100%
      let maxW = 0, maxH = 0;
      items.forEach((it) => { const sz = sizes[it.file]; if (sz) { maxW = Math.max(maxW, sz.w); maxH = Math.max(maxH, sz.h); } });
      baseK = Math.min(W / (maxW * 1.12), H / (maxH * 1.12)); scaleK = baseK * view.zoom;
      const frame = commonFrame(items, sizes, st);
      // Limite do deslocamento: sempre ao menos 80 px do canvas (ou metade dele, se for menor) à vista
      if (frame) {
        const fw = frame.w * scaleK, fh = frame.h * scaleK, mx = Math.min(80, fw / 2), my = Math.min(80, fh / 2);
        view.px = Math.max(mx - W / 2 - (frame.x * scaleK + fw), Math.min(W / 2 - mx - frame.x * scaleK, view.px));
        view.py = Math.max(my - H / 2 - (frame.y * scaleK + fh), Math.min(H / 2 - my - frame.y * scaleK, view.py));
      }
      cx = W / 2 + view.px; cy = H / 2 + view.py;
      tag.textContent = tagText + (Math.abs(view.zoom - 1) > 0.001 ? " · zoom " + Math.round(view.zoom * 100) + "%" : "");
      if (!frame) { common.style.display = "none"; ratio.style.display = "none"; box.style.display = "none"; cf.textContent = "Could not work out the canvas from the photo sizes."; cf.classList.add("exp-warn"); return; }
      cf.classList.remove("exp-warn");
      Object.keys(layerOf).forEach((k) => {
        const it = items[k], sz = sizes[it.file], l = layerOf[k]; if (!sz) { l.style.display = "none"; return; }
        const al = +k === cur ? a : effectiveAlign(sz, alignOf(st, it.file), frame, st);
        const w = sz.w * scaleK, h = sz.h * scaleK;
        l.style.display = ""; l.style.width = w + "px"; l.style.height = h + "px";
        l.style.left = (cx + al.dx * scaleK - w / 2) + "px"; l.style.top = (cy + al.dy * scaleK - h / 2) + "px";
        l.style.transform = "scale(" + al.scale + ") rotate(" + al.rot + "deg)";
        l.style.opacity = l.classList.contains("align-ref") ? opOf(refKeyOf[k]) : alignPrefs.opacity;
        if (+k === cur) { box.style.display = ""; box.style.width = w + "px"; box.style.height = h + "px"; box.style.left = l.style.left; box.style.top = l.style.top; box.style.transform = l.style.transform;
          // alças com o mesmo tamanho na tela, seja qual for o zoom da foto
          const inv = 1 / al.scale; [...box.children].forEach((hd) => { hd.style.setProperty("--inv", inv); }); }
      });
      // Proporção de um tamanho: a mais próxima das quatro; "~" quando não é exata
      const rn = (w, h) => { const n = ratioName(w, h); const exact = Math.abs(Math.max(w, h) / Math.min(w, h) - RATIOS[n]) < 0.01; return exact ? n : "~" + n; };
      // Um quadro só: o canvas, que é o recorte (neon, sólido); fora dele a prévia escurece
      common.style.display = "none";
      ratio.style.display = ""; ratio.classList.add("free");
      ratio.style.left = (cx + frame.x * scaleK) + "px"; ratio.style.top = (cy + frame.y * scaleK) + "px"; ratio.style.width = (frame.w * scaleK) + "px"; ratio.style.height = (frame.h * scaleK) + "px";
      ratio.setAttribute("data-size", "Canvas · " + Math.round(frame.w) + " × " + Math.round(frame.h) + " px · " + rn(frame.w, frame.h));
      const sz = sizes[item.file];
      cf.textContent = "Canvas " + Math.round(frame.w) + " × " + Math.round(frame.h) + " px (" + rn(frame.w, frame.h) + ")" + (sz ? " · this photo " + sz.w + " × " + sz.h + " px (" + rn(sz.w, sz.h) + ")" : "");
      cf.title = "The canvas is what every export gets: what every photo covers as shot and, with an aspect ratio, the largest frame in that ratio inside it. No photo is enlarged on its own; each one is moved, resized and rotated behind the canvas.";
    };
    Promise.all(items.map((it) => photoSizeOf(session.name, it.file).then((sz) => { if (sz) sizes[it.file] = sz; }))).then(() => {
      wait.remove();
      if (!sizes[item.file]) { cf.textContent = "Could not read the size of this photo."; cf.classList.add("exp-warn"); return; }
      const frame0 = commonFrame(items, sizes, st);
      if (frame0) Object.assign(a, effectiveAlign(sizes[item.file], a, frame0, st));  // o que vale para esta foto (só grava quando a pessoa mexer)
      sync(); layout(); markPosDots();
    });
    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);

    // Etiquetas da prévia (o tamanho do canvas e a instrução embaixo): somem enquanto o mouse se mexe sobre a prévia ou
    // o espaço está seguro, e voltam 2 s depois de parar
    let quietTimer = 0;
    const quiet = () => { stage.classList.add("quiet"); clearTimeout(quietTimer); quietTimer = setTimeout(() => { if (exp.spaceDown) quiet(); else stage.classList.remove("quiet"); }, 2000); };
    stage.addEventListener("pointermove", quiet);
    stage.addEventListener("wheel", quiet, { passive: true });
    exp.alignQuiet = quiet;
    exp.alignLayout = layout;
    // Gestos na prévia: mover (arrastar a prévia ou o meio da caixa), redimensionar (cantos da caixa ou a roda),
    // girar (alça de cima ou ⌥ + roda). Todos presos à área útil (lockStart/tryApply).
    let drag = null;
    const centerOnScreen = () => { const r = stage.getBoundingClientRect(); return { x: r.left + cx + a.dx * scaleK, y: r.top + cy + a.dy * scaleK }; };
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button") || !sizes[item.file]) return;
      e.preventDefault(); stage.setPointerCapture(e.pointerId);
      document.body.classList.add("photo-drag");  // a mão fechada continua fora da prévia
      if (exp.spaceDown) { drag = { kind: "pan", x: e.clientX, y: e.clientY, px: view.px, py: view.py }; stage.classList.add("panning"); return; }
      lockStart();
      const c = centerOnScreen();
      if (e.target === rotHandle) {
        drag = { kind: "rot", rot: a.rot, angle: Math.atan2(e.clientY - c.y, e.clientX - c.x) }; stage.classList.add("rotating");
      } else if (e.target.classList.contains("align-handle")) {
        drag = { kind: "scale", scale: a.scale, dist: Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y)) }; stage.classList.add("resizing");
      } else {
        drag = { kind: "move", x: e.clientX, y: e.clientY, dx: a.dx, dy: a.dy }; stage.classList.add("dragging");
      }
    });
    let moveEv = null, moveRaf = 0;
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      moveEv = e;
      if (!moveRaf) moveRaf = requestAnimationFrame(() => { moveRaf = 0; if (drag && moveEv) dragMove(moveEv); });
    });
    const dragMove = (e) => {
      if (drag.kind === "pan") { view.px = drag.px + e.clientX - drag.x; view.py = drag.py + e.clientY - drag.y; layout(); return; }
      const c = centerOnScreen();
      if (drag.kind === "move") tryApply((cand) => { cand.dx = drag.dx + (e.clientX - drag.x) / scaleK; cand.dy = drag.dy + (e.clientY - drag.y) / scaleK; });
      else if (drag.kind === "scale") tryApply((cand) => { cand.scale = Math.max(0.05, Math.min(20, drag.scale * Math.max(1, Math.hypot(e.clientX - c.x, e.clientY - c.y)) / drag.dist)); });
      else { const ang = Math.atan2(e.clientY - c.y, e.clientX - c.x); let d = (ang - drag.angle) * 180 / Math.PI; if (e.shiftKey) d = Math.round(d / 15) * 15; tryApply((cand) => { cand.rot = Math.round((drag.rot + d) * 100) / 100; }); }
      sync(); layout();
    };
    const endDrag = (e) => {
      if (!drag) return;
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; if (moveEv) dragMove(moveEv); }  // a última posição do mouse vale
      const pan = drag.kind === "pan";
      drag = null; stage.classList.remove("dragging", "resizing", "rotating", "panning"); document.body.classList.remove("photo-drag");
      if (pan) return;  // deslocar a vista não muda a foto
      a.dx = Math.round(a.dx); a.dy = Math.round(a.dy); sync(); layout(); save();
    };
    stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag); stage.addEventListener("lostpointercapture", endDrag);
    stage.addEventListener("dragstart", (e) => e.preventDefault());
    stage.addEventListener("wheel", (e) => {
      if (!sizes[item.file]) return;
      e.preventDefault();
      const d = Math.max(-40, Math.min(40, e.deltaY));
      if (e.altKey) {  // ⌥ + roda: gira a foto
        lockStart();
        tryApply((cand) => { cand.rot = Math.round((cand.rot - d * 0.01) * 100) / 100; });
        sync(); layout(); saveSoon();
        return;
      }
      // Roda: zoom da vista (30% a 800%), em volta do ponto sob o mouse
      const r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const ux = (mx - cx) / scaleK, uy = (my - cy) / scaleK;
      view.zoom = Math.max(0.3, Math.min(8, view.zoom * Math.exp(-d * 0.004)));
      const k = baseK * view.zoom, W = stage.clientWidth, H = stage.clientHeight;
      view.px = mx - W / 2 - ux * k; view.py = my - H / 2 - uy * k;
      layout();
    }, { passive: false });
    exp.keyMove = (ddx, ddy, big) => { const step = big ? 10 : 1; stepOnce((cand) => { cand.dx += ddx * step; cand.dy += ddy * step; }); };
  }

  function lentSizeRow(l, box, rerender, label) {
      const size = row(label || "Print size");
      const unitIn = l.unit === "in";
      const wField = numField(unitIn ? inText(l.widthCm) : cmText(l.widthCm), (v) => { l.widthCm = unitIn ? v * CM_PER_IN : v; rerender(); }, { width: "64px" });
      const hField = numField(unitIn ? inText(l.heightCm) : cmText(l.heightCm), (v) => { l.heightCm = unitIn ? v * CM_PER_IN : v; rerender(); }, { width: "64px" });
      size.append(wField, el("span", "lent-x", "×"), hField);
      size.appendChild(segmented([["cm", "cm"], ["in", "in"]], l.unit, (v) => { l.unit = v; rerender(); }));
      const swap = button("", () => { const w = l.widthCm; l.widthCm = l.heightCm; l.heightCm = w; rerender(); }, { icon: "swap", title: "Swap width and height" });
      swap.classList.add("btn-small");
      size.appendChild(swap);
      const presets = el("span", "chips lent-presets");
      // Em cm: tamanhos de foto métricos; em polegadas: os americanos (4 × 6, 5 × 7, 8 × 10, Letter)
      const presetList = unitIn
        ? [["4 × 6", 4 * CM_PER_IN, 6 * CM_PER_IN], ["6 × 4", 6 * CM_PER_IN, 4 * CM_PER_IN], ["5 × 7", 5 * CM_PER_IN, 7 * CM_PER_IN], ["8 × 10", 8 * CM_PER_IN, 10 * CM_PER_IN], ["Letter", 8.5 * CM_PER_IN, 11 * CM_PER_IN]]
        : [["10 × 15", 10, 15], ["15 × 10", 15, 10], ["20 × 30", 20, 30], ["30 × 20", 30, 20], ["A4", 21, 29.7]];
      presetList.forEach(([t, w, h]) => {
        const c = el("button", "chip" + (Math.abs(l.widthCm - w) < 0.05 && Math.abs(l.heightCm - h) < 0.05 ? " on" : ""), t);
        c.addEventListener("click", () => { l.widthCm = w; l.heightCm = h; rerender(); });
        presets.appendChild(c);
      });
      size.appendChild(presets);
      box.appendChild(size);
  }

  // Deslizar a altura de um bloco de "antes" para a altura de agora (o conteúdo novo já está lá).
  // Com fade: o conteúdo novo aparece aos poucos.
  const EASE_MS = 220;
  function slideHeight(node, from, opts) {
    if (!node || !node.animate || node.classList.contains("hidden")) return;
    const to = node.offsetHeight;
    if (Math.abs(to - from) < 2) return;
    // flex-grow 0 durante a animação: um bloco que estica (a prévia no teatro) seguiria a altura
    node.animate([{ height: from + "px", overflow: "hidden", flexGrow: 0, flexShrink: 0 }, { height: to + "px", overflow: "hidden", flexGrow: 0, flexShrink: 0 }], { duration: EASE_MS, easing: "ease" });
    if (opts && opts.fade) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EASE_MS, easing: "ease" });
  }
  // Fechar deslizando até 0 e então esconder (done: o que fazer no fim)
  function slideClosed(node, done) {
    if (!node || !node.animate || node.classList.contains("hidden")) { if (done) done(); return; }
    const a = node.animate([{ height: node.offsetHeight + "px", opacity: 1, overflow: "hidden" }, { height: "0px", opacity: 0, overflow: "hidden" }],
      { duration: EASE_MS, easing: "ease", fill: "forwards" });
    a.onfinish = () => { if (done) done(); a.cancel(); };
  }
  // Abrir deslizando de 0 (o bloco já visível)
  function slideOpen(node) {
    if (!node || !node.animate) return;
    node.animate([{ height: "0px", opacity: 0, overflow: "hidden" }, { height: node.offsetHeight + "px", opacity: 1, overflow: "hidden" }], { duration: EASE_MS, easing: "ease" });
  }

  // Prévia grande e fileira de miniaturas: abrem e fecham deslizando em vez de aparecer e sumir
  // de uma vez (a coluna é redesenhada a cada mudança; o que sai volta por um instante e fecha).
  // A fileira anima por uma caixa em volta dela (.export-strip-slot): a área que rola fica
  // intacta, com a barra de rolagem, e não muda de altura no fim. Depois, um empurrão na
  // rolagem: o WebKit do Mac às vezes desenha a fileira cortada até ela rolar.
  const SLIDE_MS = 240;
  function slideBlocks(outer, before, rows) {
    const nudge = (s) => { if (s) { s.scrollLeft += 1; s.scrollLeft -= 1; } };
    [".export-preview", ".export-strip-slot"].forEach((sel) => {
      const now = outer.querySelector(sel + ":not(.leaving)");
      const old = before[sel];
      // Entrando, ou redesenhada no meio da entrada (continua de onde a anterior estava)
      const midway = now && old.el && old.el.classList.contains("slide") && old.h < now.offsetHeight;
      if (now && (!old.el || midway)) {
        // Fecha sem transição, e só então liga a transição e abre (com a transição já ligada,
        // fechar também animaria, de 200 para 0, e a abertura não sairia do lugar)
        const h = now.offsetHeight;
        if (midway) now.style.height = old.h + "px"; else now.classList.add("slide-closed");
        void now.offsetHeight;
        now.classList.add("slide");
        now.classList.remove("slide-closed");
        now.style.height = h + "px";
        setTimeout(() => { now.classList.remove("slide"); now.style.height = ""; nudge(now.querySelector(".export-strip-scroll")); }, SLIDE_MS + 30);
      } else if (!now && old.el) {
        old.el.classList.add("leaving", "slide");
        old.el.style.height = old.h + "px";
        outer.insertBefore(old.el, rows);
        void old.el.offsetHeight;
        old.el.style.height = "";
        old.el.classList.add("slide-closed");
        setTimeout(() => old.el.remove(), SLIDE_MS + 30);
      }
    });
    const strip = outer.querySelector(".export-strip-slot:not(.leaving) .export-strip-scroll");
    if (strip) {
      setTimeout(() => nudge(strip), 50);
      strip.querySelectorAll("img").forEach((i) => i.addEventListener("load", () => nudge(strip), { once: true }));
    }
  }

  function renderExportSettings() {
    stopPreview();
    // Uma janela, três saídas (decisão do dono, 2026-10-30, opção A): Photos, Sequence e
    // Lenticular são seções com interruptor; as marcadas abrem as configurações, as
    // desmarcadas ficam recolhidas. A prévia de cima é a da seção em foco (exp.mode).
    // outer: prévia e fileira de miniaturas (não rolam); rows: o resto, que rola se faltar
    // altura. A fileira rola para o lado e não pode ficar dentro de outra área que rola
    // (o WebKit do Mac pinta as miniaturas deslocadas nesse caso).
    const outer = $("exportSettings");
    // O que está na tela agora, medido antes de sair (para a animação)
    const before = {};
    [".export-preview", ".export-strip-slot"].forEach((sel) => {
      const e = outer.querySelector(sel + ":not(.leaving)");
      before[sel] = { el: e, h: e ? e.offsetHeight : 0 };
    });
    const prevRows = outer.querySelector(".export-rows");
    const keepScroll = prevRows ? prevRows.scrollTop : 0;  // a coluna é redesenhada a cada mudança: mantém a rolagem
    outer.innerHTML = "";
    const rows = el("div", "export-rows");
    outer.appendChild(rows);
    renderExportSettings.restoreScroll = () => { if (keepScroll) { rows.scrollTop = keepScroll; requestAnimationFrame(() => { rows.scrollTop = keepScroll; }); } };
    // As caixas terminam no mesmo ponto que a prévia: o espaço da direita (18 px) é dividido
    // entre a barra de rolagem, quando ela existe e ocupa lugar, e um respiro até as caixas
    const fitRows = () => {
      const bar = rows.offsetWidth - rows.clientWidth - (parseFloat(getComputedStyle(rows).borderLeftWidth) || 0) - (parseFloat(getComputedStyle(rows).borderRightWidth) || 0);
      rows.style.paddingRight = Math.max(0, 18 - Math.max(0, bar)) + "px";
    };
    if (exp.rowsObserver) exp.rowsObserver.disconnect();
    if (window.ResizeObserver) {
      exp.rowsObserver = new ResizeObserver(() => fitRows());
      exp.rowsObserver.observe(rows);
      requestAnimationFrame(() => { [...rows.children].forEach((c) => exp.rowsObserver && exp.rowsObserver.observe(c)); fitRows(); });
    }
    const session = sessions.find((s) => s.name === exp.active);
    if (!session) return;
    const items = sessionItems(session).filter((i) => i.previewable);
    const st = settingsFor(session.name);
    const label = sessionLabel(session.name).date;
    const rerender = () => { syncAll(); renderExportSettings(); if (renderExportSettings.restoreScroll) renderExportSettings.restoreScroll(); refreshSummaries(); rememberExportPrefs(); };

    // Passo 3 (Review): tabela, nome e pasta; sem prévia nem lista
    if (exp.step === 3) { exp.keyNav = null; exp.aligning = false; outer.classList.remove("aligning", "theater"); renderReview(outer, rows, rerender); return; }
    if (exp.step === 1) exp.mode = "framing";
    else if (!OUTPUT_KINDS.includes(exp.mode)) exp.mode = OUTPUT_KINDS.find((k) => st.outputs[k]) || "photos";
    // Barra de cima: no passo 1 o nome da sessão aberta; no 2, mesma configuração para todas (padrão) ou uma por
    // sessão; nos dois, mostrar/esconder a prévia (foto grande e miniaturas)
    const top = el("div", "export-scope");
    if (exp.step === 1) top.appendChild(el("span", "export-step1-title", "Framing · " + label));
    top.appendChild(el("span", "spacer"));
    const pv = button(exp.previewHidden ? "Show preview" : "Hide preview", () => {
      exp.previewHidden = !exp.previewHidden;
      if (exp.previewHidden) { exp.theater = false; }
      rerender();
    }, { kind: "btn-link", icon: exp.previewHidden ? "down" : "up", title: exp.previewHidden ? "Show the photo and the thumbnails" : "Hide the photo and the thumbnails: more room for the settings" });
    pv.classList.add("export-preview-toggle");
    // Passo 2: sem barra de cima; "Hide preview" vai para a linha das abas, encostado à direita (decisão do dono, 2026-11-04)
    if (exp.step === 1) outer.insertBefore(top, rows);  // passo 1: sem "Hide preview" (decisão do dono, 2026-11-04)
    // (o modo de cada passo já foi fixado acima)
    // Modo teatro (Photos, Sequence e Lenticular): vale para a aba onde foi ligado; trocar de aba ou de passo desliga
    if (exp.theaterKind !== exp.mode || exp.step !== 2) exp.theater = false;
    if (!exp.theater) outer.classList.remove("theater", "theater-strip");
    exp.keyMove = null;
    // Tela "Align photos" (pedaço 2 do Framing): toma a coluna inteira no lugar das abas
    if (exp.mode !== "framing") exp.aligning = false;
    outer.classList.toggle("aligning", !!exp.aligning);
    const body = document.querySelector(".export-body");
    if (body) body.classList.toggle("aligning", !!exp.aligning);  // lista de sessões só com as miniaturas (como a barra da tela cheia)
    // Na tela de alinhamento a caixa de cada sessão some: a lista vira uma parada só do Tab (a sessão aberta) e
    // ↑ ↓ trocam de sessão (decisão do dono, 2026-11-03)
    // (no passo 2 a linha da lista é o próprio controle do Tab: quem cuida é o exportRoving)
    if (exp.step !== 2) [...$("exportList").children].forEach((li) => { li.tabIndex = exp.aligning && li.dataset.name === exp.active ? 0 : -1; });
    // Entrar ou sair da tela de alinhamento: a coluna surge num fade curto (a lista estreita/alarga com transição no CSS)
    if (exp.aligningShown !== !!exp.aligning) {
      exp.aligningShown = !!exp.aligning;
      exp.alignView = { zoom: 1, px: 0, py: 0 };  // cada entrada começa sem zoom
      outer.classList.remove("layout-change"); void outer.offsetWidth; outer.classList.add("layout-change");
      setTimeout(() => outer.classList.remove("layout-change"), 400);
    }
    if (exp.aligning && needsRatio(session, st)) exp.aligning = false;  // sessão misturada sem proporção não alinha (ex.: depois de um ⌘Z)
    if (exp.aligning) { exp.keyNav = null; alignScreen(session, items, st, outer, rows, top, rerender); return; }

    // Monta a prévia (só a da seção em foco entra na tela) e as configurações de uma saída
    exp.keyNav = null;
    const buildKind = (kind, box, focused) => {
      const preview = el("div", "export-preview");
      const img = document.createElement("img");
      img.alt = "";
      const caption = el("div", "stage-caption");
      preview.append(img, caption);
      if (focused && (exp.step === 1 || !exp.previewHidden)) outer.insertBefore(preview, rows);
      if (focused && exp.step === 2 && (kind === "photos" || kind === "sequence")) {
        // Modo teatro também em Photos e Sequence (decisão do dono, 2026-11-04); em Photos as miniaturas ficam
        const tb = button("", () => { const from = preview.offsetHeight; exp.theater = !exp.theater; exp.theaterKind = kind; applyT(); slideHeight(preview, from);
          if (!exp.theater) { const n = outer.querySelector(".export-rows"); if (n && n.animate) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EASE_MS, easing: "ease" }); } },
          { icon: "theaterIn", title: "Theater mode: larger preview, settings hidden", kind: "btn-secondary" });
        tb.classList.add("lent-theater-btn");
        tb.addEventListener("pointerdown", (e) => e.stopPropagation());
        preview.appendChild(tb);
        const applyT = () => {
          outer.classList.toggle("theater", !!exp.theater);
          outer.classList.toggle("theater-strip", !!exp.theater && kind === "photos");
          tb.classList.toggle("on", !!exp.theater);
          tb.innerHTML = icon(exp.theater ? "theaterOut" : "theaterIn");
          tb.title = exp.theater ? "Leave theater mode" : "Theater mode: larger preview, settings hidden";
        };
        applyT();
      }
      const show = (i, text, file) => {
        const item = items[i];
        if (!item) return;
        // Passo 2: a prévia já com o Framing do passo 1 (proporção, posição e alinhamento), como sai na exportação
        sessionPhoto(session.name, item.file, 1600).then((url) => (url && exp.step === 2 ? framedUrl(session, items, st, item, url) : url))
          .then((url) => { if (url && exp.active === session.name) img.src = url; });
        caption.innerHTML = "";
        caption.append(el("b", "", text[0]), document.createTextNode(text[1]));
        if (file) caption.appendChild(el("span", "caption-file", file));
      };
      if (kind === "framing") {
        cropLoad(session, st);
        // Em foco: a prévia (o recorte sobre a foto) em cima, as linhas embaixo, a fileira de miniaturas entre as duas.
        // Sem modo teatro nesta aba (decisão do dono, 2026-11-03): o ⤢ amplia a prévia, mas as linhas do Framing
        // (Aspect ratio, Same size, Position) continuam à vista; o resto da janela (Name etc.) some. ⤡ volta.
        if (focused && (exp.step === 1 || !exp.previewHidden)) {  // passo 1: a prévia está sempre à vista
          preview.remove();
          const stage = cropStage(session, items, st, st.crop.ratio !== "asshot" ? RATIOS[st.crop.ratio] : 0, (changed) => { cropShare(session, st); if (changed) rerender(); });
          stage.classList.add("export-preview", "framing-stage");
          // "Align photos" (pedaço 2): abre a tela de alinhamento no lugar do ⤢ (decisão do dono, 2026-11-03, protótipo X1)
          const alignBtn = button("Align photos", () => { if (needsRatio(session, st)) askRatioForAlign(session, st, rerender); else { exp.aligning = true; rerender(); } },
            { icon: "alignPhotos", title: "Align photos: move, resize and rotate each photo over the others", kind: "btn-secondary" });
          alignBtn.classList.add("framing-align-btn");
          alignBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
          stage.appendChild(alignBtn);
          if (sessionAligned(session, st)) stage.appendChild(el("span", "framing-aligned-tag", "Aligned"));
          outer.insertBefore(stage, rows);
          const stripScroll = el("div", "export-strip-scroll");
          const strip = el("ul", "export-strip");
          stripScroll.appendChild(strip);
          items.forEach((item, k) => {
            const li = el("li", "frame" + (k === (exp.photo || 0) ? " selected" : ""));
            li.innerHTML = '<div class="frame-img"><img alt=""><span class="frame-badge"></span></div>';
            li.querySelector(".frame-badge").textContent = pad(item.order || k + 1);
            sessionPhoto(session.name, item.file, 320).then((url) => { if (url) li.querySelector("img").src = url; });
            li.addEventListener("click", () => { exp.photo = k; photoRerender(); });
            strip.appendChild(li);
          });
          exp.keyNav = (d) => { const k = Math.max(0, Math.min(items.length - 1, (exp.photo || 0) + d)); if (k === exp.photo) return; exp.photo = k; photoRerender(); };
          const slot = el("div", "export-strip-slot");
          slot.appendChild(stripScroll);
          outer.insertBefore(slot, rows);
        }
        framingRows(session, st, box, rerender);  // as configurações embaixo da prévia, em linhas (decisão do dono, 2026-11-03)
      } else if (kind === "photos") {
      const s = st.photos;
      // A fileira (ul) fica dentro de uma caixa que rola (div): o WebKit do Mac pintava os
      // filhos diretos da área de rolagem deslocados (sem a borda e o espaço interno deles)
      const stripScroll = el("div", "export-strip-scroll");
      const strip = el("ul", "export-strip");
      stripScroll.appendChild(strip);
      const showPhoto = () => {
        const item = items[exp.photo];
        if (!item) return;
        const stem = item.file.replace(/\.[^.]+$/, "");
        const target = s.convert ? " → " + stem + "." + s.format : "";
        show(exp.photo, [pad(item.order), item.title + (item.subtitle ? " · " + item.subtitle : "")], item.file + target);
        [...strip.children].forEach((li, k) => li.classList.toggle("selected", k === exp.photo));
      };
      items.forEach((item, k) => {
        const li = el("li", "frame");
        const thumb = el("div", "frame-img");
        // Miniatura como <img> (não como imagem de fundo): no WebKit do Mac o fundo desta fileira
        // era pintado maior que a caixa até algo forçar um redesenho
        const pic = document.createElement("img"); pic.alt = "";
        thumb.appendChild(pic);
        thumb.appendChild(el("span", "frame-badge", pad(item.order)));
        li.appendChild(thumb);
        // Passo 2: a miniatura também com o Framing do passo 1, inteira na caixa (sem cortar de novo)
        sessionPhoto(session.name, item.file, 320).then((url) => (url && exp.step === 2 ? framedUrl(session, items, st, item, url, 320) : url))
          .then((url) => {
            if (!url) return;
            const framed = exp.step === 2 && !(st.crop.ratio === "asshot" && !sessionAligned(session, st));
            // A caixa da miniatura acompanha a forma do recorte (decisão do dono, 2026-11-04): a mesma altura de
            // sempre, a largura pela proporção da imagem recortada; a imagem enche a caixa sem cortar
            if (framed) pic.onload = () => {
              const r = pic.naturalWidth / Math.max(1, pic.naturalHeight), h = 47, w = Math.max(24, Math.round(h * r));
              thumb.style.width = w + "px"; li.style.width = (w + 6) + "px"; li.style.flexBasis = (w + 6) + "px"; li.style.setProperty("--frame-w", (w + 6) + "px");
            };
            pic.src = url;
          });
        li.addEventListener("click", () => { exp.photo = k; showPhoto(); });
        strip.appendChild(li);
      });
      if (focused) exp.keyNav = (d) => { const k = Math.max(0, Math.min(items.length - 1, exp.photo + d)); if (k === exp.photo) return; exp.photo = k; showPhoto(); const li = strip.children[k]; if (li) li.scrollIntoView({ block: "nearest", inline: "nearest" }); };
      if (focused && !exp.previewHidden) {
        const slot = el("div", "export-strip-slot");
        slot.appendChild(stripScroll);
        outer.insertBefore(slot, rows);
        showPhoto();
      }
      // Originais e/ou uma cópia convertida, independentes; com os dois, Photos/Originals/ e Photos/<FORMATO>/
      const ro = row("Originals");
      ro.appendChild(checkOption("Keep the originals, exactly as each camera sent them (RAW and non-RAW)", s.original, (v) => { s.original = v; rerender(); }));
      box.appendChild(ro);
      const r = row("Converted");
      r.appendChild(checkOption("", s.convert, (v) => { s.convert = v; rerender(); }));
      const fmts = segmented(PHOTO_FORMATS.filter(([f]) => f !== "original"), s.format, (v) => { s.format = v; s.convert = true; rerender(); },
        (v) => (v === "heic" && !exp.heic.ok ? exp.heic.reason || "Not available on this computer" : ""));
      if (!s.convert) fmts.classList.add("dimmed");
      r.appendChild(fmts);
      box.appendChild(r);
      if (s.original && s.convert) {
        const o = settingsFor(session.name).outputs;
        const pre = o.sequence || o.lenticular ? "Photos/" : "";
        box.appendChild(el("div", "export-note", "Both are exported, each in its own folder: " + pre + "Originals/ and " + pre + s.format.toUpperCase() + "/."));
      }
      if (!s.original && !s.convert) box.appendChild(el("div", "export-note exp-none", "Choose the originals, a format, or both."));
      if (s.convert && LOSSY_PHOTOS.includes(s.format)) {
        const q = row("Quality");
        q.appendChild(segmented(QUALITIES, s.quality, (v) => { s.quality = v; rerender(); }));
        box.appendChild(q);
        const max = { jpg: "JPG at the highest quality, with full color detail.", webp: "Lossless: every pixel is kept.",
                      heic: "HEIC at the highest quality." };
        addTip(box, "Standard: smaller files, good for sharing online. High: very close to the original photos, with smaller files; good for most uses. " +
          "Maximum: " + max[s.format] + " Largest files.", "Quality");
      } else if (s.convert && (s.format === "png" || s.format === "tiff")) {
        addTip(box, s.format.toUpperCase() + " keeps every pixel: no quality is lost in the conversion.", "Converted");
      }
      addTip(box, "The originals are the highest quality: each file exactly as the camera saved it. A converted copy makes one file per camera; RAW photos are converted from the " +
        "full-size image the camera keeps inside them, and when a camera saved RAW + JPG, the JPG is used.", "Originals");
      } else if (kind === "lenticular") {
      const l = st.lent;
      const n = items.length;
      const plan = lentPlan(l, n);
      // Prévia do efeito: arrastar para os lados troca a foto, como inclinar a lâmina
      preview.classList.add("lent-preview");
      // Animação: as lentes ficam deitadas e o efeito aparece inclinando a folha para cima e para
      // baixo; 3D: lentes em pé, girando para os lados
      const vertical = l.effect !== "3d";
      preview.classList.toggle("tilt-vertical", vertical);
      // Tilt: a foto dentro de um "papel" com a proporção da impressão (cabe na prévia); Fill cobre o papel na
      // posição do recorte da Framing, Fit mostra inteira com a faixa
      const paper = el("div", "lent-paper");
      paper.style.aspectRatio = l.widthCm + " / " + l.heightCm;
      paper.style.background = lentBand === "white" ? "#fff" : "#000";
      paper.classList.toggle("place-fit", (l.placement || "fill") === "fit");
      img.remove(); paper.appendChild(img); preview.insertBefore(paper, caption);
      // O papel cabe inteiro na prévia mantendo a proporção da impressão, no tamanho normal e no teatro (como o
      // Interlaced): só CSS deformava o papel quando a prévia era mais estreita do que ele pedia
      const fitPaper = () => {
        const W = preview.clientWidth, H = preview.clientHeight;
        if (!W || !H) return;
        const r = l.widthCm / l.heightCm;
        let w = W, h = W / r;
        if (h > H) { h = H; w = H * r; }
        paper.style.width = Math.floor(w) + "px"; paper.style.height = Math.floor(h) + "px";
      };
      fitPaper();
      new ResizeObserver(fitPaper).observe(preview);
      img.style.objectPosition = Math.round(st.crop.x * 100) + "% " + Math.round(st.crop.y * 100) + "%";
      const order = l.reverse ? items.map((_, i) => n - 1 - i) : items.map((_, i) => i);
      let frameAt = Math.min(exp.frame >= 0 ? exp.frame : 0, Math.max(0, n - 1));
      const showFrame = (k) => {
        frameAt = Math.max(0, Math.min(n - 1, k));
        exp.frame = frameAt;
        const i = order[frameAt];
        show(i, ["Tilt preview", " " + label + " · photo " + (i + 1) + " of " + n + (vertical ? " · drag up and down" : " · drag left and right")]);
      };
      if (focused) showFrame(frameAt);
      if (focused) exp.keyNav = (d) => { if (exp.lentView !== "interlaced") showFrame(frameAt + d); };
      items.forEach((item) => sessionPhoto(session.name, item.file, 1600));
      let drag = null;
      preview.addEventListener("pointerdown", (e) => {
        // Interlaced: o clique não arrasta a imagem nem seleciona (no Mac isso tirava a mira da lupa)
        if (exp.lentView === "interlaced" && !e.target.closest("button")) {
          e.preventDefault();
          if (e.button === 0) loupePressed = true;  // segurando: a lupa sem a mira
          requestAnimationFrame(() => preview.dispatchEvent(new PointerEvent("pointermove", { clientX: e.clientX, clientY: e.clientY })));
          return;
        }
        if (exp.lentView === "interlaced" || e.target.closest("button")) return;  // botões (teatro, vistas) não começam arrasto
        drag = { x: e.clientX, y: e.clientY, start: frameAt }; preview.setPointerCapture(e.pointerId); e.preventDefault();
        document.documentElement.classList.add(vertical ? "drag-ns" : "drag-ew");
      });
      preview.addEventListener("pointermove", (e) => {
        if (!drag) return;
        // Metade do tamanho da prévia por foto (no sentido do arrasto)
        const span = vertical ? preview.clientHeight : preview.clientWidth;
        const step = Math.max(vertical ? 12 : 24, span / Math.max(2, n) / 2);
        showFrame(drag.start + Math.round(((vertical ? e.clientY - drag.y : e.clientX - drag.x)) / step));
      });
      const endDrag = () => { drag = null; document.documentElement.classList.remove("drag-ns", "drag-ew"); };
      // Soltou (ou saiu): a mira volta
      const releaseLoupe = (e) => {
        if (!loupePressed) return;
        loupePressed = false;
        if (exp.lentView === "interlaced" && e && e.clientX !== undefined) preview.dispatchEvent(new PointerEvent("pointermove", { clientX: e.clientX, clientY: e.clientY }));
      };
      preview.addEventListener("pointerup", releaseLoupe);
      preview.addEventListener("pointerleave", () => { loupePressed = false; });
      preview.addEventListener("pointerup", endDrag); preview.addEventListener("pointercancel", endDrag);

      // Segunda vista: o arquivo entrelaçado em si — a imagem inteira como vai sair impressa (reduzida
      // para caber; a olho nu as faixas se misturam, como no papel sem a lâmina) e uma lupa que mostra
      // o ponto sob o mouse em pixels reais. Montada na página com as mesmas contas do app.
      const canvas = document.createElement("canvas");
      canvas.className = "lent-canvas hidden";
      preview.insertBefore(canvas, caption);
      const loupe = document.createElement("canvas");
      loupe.className = "lent-loupe hidden"; loupe.width = 180; loupe.height = 180;
      preview.appendChild(loupe);
      const loupeTag = el("span", "lent-loupe-tag hidden", "2×");
      preview.appendChild(loupeTag);
      const views = el("div", "segmented lent-views");
      let full = null;  // canvas com a imagem entrelaçada inteira (ou reduzida, se for grande demais)
      const setView = (v) => {
        exp.lentView = v;
        [...views.children].forEach((b) => b.classList.toggle("on", b.dataset.view === v));
        const inter = v === "interlaced";
        img.classList.toggle("hidden", inter);
        canvas.classList.toggle("hidden", !inter);
        if (!inter) { loupe.classList.add("hidden"); loupeTag.classList.add("hidden"); }
        preview.classList.toggle("interlaced", inter);
        if (inter) drawInterlaced(); else showFrame(frameAt);
      };
      [["interlaced", "Interlaced"], ["tilt", "Tilt"]].forEach(([v, t]) => {  // Interlaced primeiro e padrão (decisão do dono, 2026-11-03)
        const b = el("button", "", t); b.dataset.view = v; b.title = v === "tilt" ? "Drag to see the photos change, as when tilting the print" : "The whole interlaced file, as it prints; move the mouse over it for a close-up";
        b.addEventListener("click", (e) => { e.stopPropagation(); setView(v); });
        views.appendChild(b);
      });
      views.addEventListener("pointerdown", (e) => e.stopPropagation());
      preview.appendChild(views);
      // Modo teatro: a prévia ocupa a coluna toda e as configurações somem; o botão de novo volta
      const theater = button("", () => {
        const from = preview.offsetHeight;
        exp.theater = !exp.theater; exp.theaterKind = "lenticular";
        applyTheater();
        slideHeight(preview, from);
        if (!exp.theater) [outer.querySelector(".export-rows"), outer.querySelector(".export-scope")].forEach((n) => n && n.animate && n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EASE_MS, easing: "ease" }));
        if (exp.lentView === "interlaced") setTimeout(() => requestAnimationFrame(fitCanvas), EASE_MS + 20);
      }, { icon: "theaterIn", title: "Theater mode: larger preview, settings hidden", kind: "btn-secondary" });
      theater.classList.add("lent-theater-btn");
      theater.addEventListener("pointerdown", (e) => e.stopPropagation());
      preview.insertBefore(theater, views);  // à esquerda na tela: vem antes de Tilt / Interlaced no Tab
      const applyTheater = () => {
        outer.classList.toggle("theater", !!exp.theater);
        theater.classList.toggle("on", !!exp.theater);
        theater.innerHTML = icon(exp.theater ? "theaterOut" : "theaterIn");  // ângulos para fora = entrar; para dentro = sair
        theater.title = exp.theater ? "Leave theater mode" : "Theater mode: larger preview, settings hidden";
        if (exp.lentView === "interlaced") requestAnimationFrame(fitCanvas);
      };
      if (window.ResizeObserver) { let lastSize = ""; const ro = new ResizeObserver(() => { const now = preview.clientWidth + "x" + preview.clientHeight; if (now === lastSize) return; lastSize = now; if (full && exp.lentView === "interlaced") fitCanvas(); }); ro.observe(preview); }
      const fitCanvas = () => {
        if (!full) return;
        // Cabe na prévia mantendo a proporção do arquivo (com margem e marcas); o navegador reduz
        // (as faixas se misturam, como a olho nu)
        const pw = Math.max(50, preview.clientWidth - 2), ph = Math.max(50, preview.clientHeight - 2);
        const scale = Math.min(pw / plan.fileW, ph / plan.fileH);
        canvas.width = Math.max(1, Math.round(plan.fileW * scale)); canvas.height = Math.max(1, Math.round(plan.fileH * scale));
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
        // Marcas de novo, na escala da tela (no arquivo elas têm ~0,1 mm e somem ao reduzir)
        const ds = canvas.width / plan.fileW;
        const bleedPx = Math.round((l.bleedMm || 0) / 25.4 * l.dpi), marginPx = l.cropMarks || l.alignMarks ? Math.round(0.4 * l.dpi) : 0;
        drawPrintMarks(ctx, l, ds, { fw: canvas.width, fh: canvas.height, margin: marginPx * ds, bleed: bleedPx * ds, w: plan.w * ds, h: plan.h * ds });
      };
      const drawInterlaced = () => {
        const horizontal = l.effect !== "3d";
        // A imagem inteira é cara de montar: fica guardada enquanto nada que entra nela muda (sessão, fotos,
        // lâmina, tamanho, marcas, recorte, Placement, faixa)
        const cacheKey = [session.name, items.map((i) => i.file).join(","), JSON.stringify(l), st.crop.ratio, st.crop.x, st.crop.y, alignText(st), lentBand].join("|");
        const cached = exp.lentFull;
        if (cached && cached.key === cacheKey && cached.full) {
          full = cached.full; lentBuiltAt = cached.builtAt; setLoupeTag();
          caption.innerHTML = ""; caption.append(el("b", "", "Interlaced"), interCaptionText(), interCaptionMore());
          fitCanvas();
          if (!cached.ready) cached.waiters.push(fitCanvas);  // as fotos ainda estão entrando na imagem guardada
          return;
        }
        // Imagem inteira em pixels reais; acima de ~24 Mpx monta reduzida (a lupa avisa)
        const limit = 24e6;
        const f = plan.fileW * plan.fileH > limit ? Math.sqrt(limit / (plan.fileW * plan.fileH)) : 1;
        // O arquivo inteiro: margem branca com as marcas e, no meio, a imagem com a sangria
        const bleed = Math.round((l.bleedMm || 0) / 25.4 * l.dpi), margin = l.cropMarks || l.alignMarks ? Math.round(0.4 * l.dpi) : 0;
        const FW = Math.max(1, Math.round(plan.fileW * f)), FH = Math.max(1, Math.round(plan.fileH * f));
        const off = Math.round(margin * f), b = bleed * f;
        const W = Math.max(1, Math.round((plan.w + 2 * bleed) * f)), H = Math.max(1, Math.round((plan.h + 2 * bleed) * f));
        const perLens = plan.cols * f;
        const ownerOf = (i) => { const pos = (i - b + 0.5) / perLens, frac = pos - Math.floor(pos); let k = Math.min(n - 1, Math.floor(frac * n)); return l.reverse ? n - 1 - k : k; };
        const token = (drawInterlaced.token = (drawInterlaced.token || 0) + 1);
        full = document.createElement("canvas"); full.width = FW; full.height = FH;
        const fctx = full.getContext("2d");
        fctx.fillStyle = "#fff"; fctx.fillRect(0, 0, FW, FH);
        const fitPlace = (l.placement || "fill") === "fit";
        fctx.fillStyle = fitPlace && lentBand === "white" ? "#fff" : "#000"; fctx.fillRect(off, off, W, H);
        drawPrintMarks(fctx, l, f, { fw: FW, fh: FH, margin: margin * f, bleed: b, w: plan.w * f, h: plan.h * f });
        lentBuiltAt = f;
        setLoupeTag();
        caption.innerHTML = "";
        caption.append(el("b", "", "Interlaced"), interCaptionText(), interCaptionMore());
        fitCanvas();
        const cacheEntry = exp.lentFull = { key: cacheKey, full, builtAt: f, ready: false, waiters: [] };
        // Faixas de cada foto: desenha a foto (cobrindo o papel) só nas linhas/colunas dela
        const lines = horizontal ? H : W;
        const runs = [];  // [início, comprimento, foto]
        for (let i = 0; i < lines;) { const k = ownerOf(i); let j = i + 1; while (j < lines && ownerOf(j) === k) j++; runs.push([i, j - i, k]); i = j; }
        let loaded = 0;
        items.forEach((item, k) => {
          // Cada foto já com o Framing do passo 1 (canvas, posição e alinhamento), como no arquivo exportado
          sessionPhoto(session.name, item.file, 1600).then((url) => (url ? framedUrl(session, items, st, item, url) : url)).then((url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url || ""; })).then((im) => {
            if (token !== drawInterlaced.token) return;
            if (im) {
              const s = fitPlace ? Math.min(W / im.naturalWidth, H / im.naturalHeight) : Math.max(W / im.naturalWidth, H / im.naturalHeight);
              const fw = im.naturalWidth * s, fh = im.naturalHeight * s;
              // Fill: a parte escolhida (posição do recorte da sessão); Fit: centrada (sobra a faixa)
              const ox = fitPlace ? (fw - W) / 2 : (fw - W) * st.crop.x, oy = fitPlace ? (fh - H) / 2 : (fh - H) * st.crop.y;
              fctx.imageSmoothingEnabled = true;
              runs.forEach(([start, len, owner]) => {
                if (owner !== k) return;
                if (horizontal) fctx.drawImage(im, ox / s, (oy + start) / s, W / s, len / s, off, off + start, W, len);
                else fctx.drawImage(im, (ox + start) / s, oy / s, len / s, H / s, off + start, off, len, H);
              });
            }
            if (++loaded === n) { fitCanvas(); cacheEntry.ready = true; cacheEntry.waiters.forEach((fn) => { try { fn(); } catch (e) {} }); cacheEntry.waiters = []; }
          });
        });
      };
      // Legenda do Interlaced recolhida (decisão do dono, 2026-11-03): uma linha curta; clicar nela mostra o resto
      const interCaptionText = () => document.createTextNode(" " + plan.fileW + " × " + plan.fileH + " px · " + lentSizeText(l));
      const interCaptionMore = () => {
        const horizontal = l.effect !== "3d";
        const more = el("span", "caption-more", " · " + (plan.cols ? plan.cols.toFixed(2).replace(/\.?0+$/, "") : "—") + " px per lens · strips " + (horizontal ? "horizontal" : "vertical") +
          " · move the mouse for a close-up, scroll to zoom, hold the left button to hide the crosshair");
        return more;
      };
      caption.classList.add("collapsible");
      caption.title = "Click for details";
      caption.addEventListener("pointerdown", (e) => e.stopPropagation());
      caption.addEventListener("click", (e) => { e.stopPropagation(); caption.classList.toggle("open"); });
      // Lupa: segue o mouse; mostra o ponto em pixels reais ampliados (2× de início; a roda do
      // mouse aproxima e afasta, de 1× a 8×)
      let lentBuiltAt = 1, lastMove = null;
      const setLoupeTag = () => {
        const z = exp.loupeZoom || 2;
        loupeTag.textContent = lentBuiltAt < 1 ? zoomText(z) + " · built at " + Math.round(lentBuiltAt * 100) + "%" : zoomText(z) + " · real pixels";
        loupeTag.title = (lentBuiltAt < 1 ? "The preview of the file was built at " + Math.round(lentBuiltAt * 100) + "% of the real size. " : "") + "Scroll to zoom in and out";
      };
      preview.addEventListener("wheel", (e) => {
        if (exp.lentView !== "interlaced" || !full || loupe.classList.contains("hidden")) return;
        e.preventDefault();
        exp.loupeZoom = loupeZoomStep(exp.loupeZoom || 2, e.deltaY, e.deltaMode);
        setLoupeTag();
        if (lastMove) preview.dispatchEvent(new PointerEvent("pointermove", { clientX: lastMove.x, clientY: lastMove.y }));
      }, { passive: false });
      preview.addEventListener("pointermove", (e) => {
        if (exp.lentView !== "interlaced" || !full) return;
        lastMove = { x: e.clientX, y: e.clientY };
        // Área desenhada de fato (no teatro o canvas ocupa a caixa toda com object-fit: contain)
        const box = canvas.getBoundingClientRect();
        const sc = Math.min(box.width / canvas.width, box.height / canvas.height);
        const r = { left: box.left + (box.width - canvas.width * sc) / 2, top: box.top + (box.height - canvas.height * sc) / 2, width: canvas.width * sc, height: canvas.height * sc };
        const inside = e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
        loupe.classList.toggle("hidden", !inside); loupeTag.classList.toggle("hidden", !inside || loupePressed);
        if (!inside) return;
        const fx = (e.clientX - r.left) / r.width * full.width, fy = (e.clientY - r.top) / r.height * full.height;
        // Tamanho conforme a prévia (fora do teatro ela tem 200 px de altura): sempre cabe
        const pr = preview.getBoundingClientRect();
        const size = Math.round(Math.max(80, Math.min(180, pr.height - 40, pr.width / 3)));
        if (loupe.width !== size) { loupe.width = size; loupe.height = size; }
        const half = loupe.width / 2 / (exp.loupeZoom || 2);  // zoom: cada pixel real vira z na tela
        const lctx = loupe.getContext("2d");
        lctx.imageSmoothingEnabled = false;
        lctx.fillStyle = "#000"; lctx.fillRect(0, 0, loupe.width, loupe.height);
        lctx.drawImage(full, fx - half, fy - half, half * 2, half * 2, 0, 0, loupe.width, loupe.height);
        drawLoupeCross(loupe);
        let lx = e.clientX - pr.left + 18, ly = e.clientY - pr.top + 18;
        if (lx + size > pr.width - 8) lx = e.clientX - pr.left - size - 18;
        if (ly + size > pr.height - 8) ly = e.clientY - pr.top - size - 18;
        lx = Math.max(8, Math.min(lx, pr.width - size - 8)); ly = Math.max(8, Math.min(ly, pr.height - size - 8));
        loupe.style.left = lx + "px"; loupe.style.top = ly + "px";
        // A etiqueta vai dentro da lupa, no canto de cima (embaixo ela saía da prévia)
        loupeTag.style.left = (lx + 4) + "px"; loupeTag.style.top = (ly + 4) + "px";
      });
      preview.addEventListener("pointerleave", () => { loupe.classList.add("hidden"); loupeTag.classList.add("hidden"); });
      if (focused) {
        applyTheater();
        setView(exp.lentView === "tilt" ? "tilt" : "interlaced");
      }

      // Leitura: o que a combinação lâmina + impressora dá para esta sessão
      const read = el("div", "lent-readout" + (plan.warn ? " " + plan.warn : ""));
      const cols = el("div", "lent-cols");
      cols.append(el("b", "", plan.cols ? plan.cols.toFixed(2).replace(/\.?0+$/, "") : "—"), el("span", "", " columns per lens"),
                  el("span", "lent-dim", " (" + l.dpi + " dpi ÷ " + lentPitch(l) + " LPI)"));
      read.appendChild(cols);
      const perText = plan.per ? plan.per.toFixed(2).replace(/\.?0+$/, "") : "—";
      read.appendChild(el("div", "", plural(n, "photo", "photos") + " → " + perText + " printer " + (plan.per === 1 ? "dot" : "dots") + " per photo in each lens"));
      read.appendChild(el("div", "lent-dim", plan.w + " × " + plan.h + " px · " + plural(plan.lenses, "lens", "lenses") + " across the print · TIFF, no compression" +
        (plan.fileW !== plan.w ? " · file " + plan.fileW + " × " + plan.fileH + " px with " + [l.bleedMm ? l.bleedMm + " mm bleed" : "", l.cropMarks || l.alignMarks ? "marks" : ""].filter(Boolean).join(" and ") : "")));
      if (plan.warn === "bad") read.appendChild(el("div", "lent-warn", "Less than one printer dot per photo: the printer cannot separate the strips. Use a higher dpi, a coarser lens (fewer LPI), or a session with fewer photos."));
      else if (plan.warn === "tight") read.appendChild(el("div", "lent-warn", "Under 2 dots per photo: it works, but some photos get 1 dot and others 2, so the change between them is less even. A higher dpi (1440 instead of 720), a coarser lens or fewer photos gives a cleaner result."));
      if (!l.pitch) read.appendChild(el("div", "lent-note", "Using the nominal LPI. Real sheets differ a little (59.8 instead of 60, say): print a pitch test to measure yours and type it in \"Measured pitch\"."));
      box.appendChild(read);

      // Efeito, lâmina, impressora e tamanho: os mesmos controles da folha de teste de pitch
      lentEffectRows(l, box, rerender);
      lentLensRows(l, box, rerender, { measured: true });
      lentPrinterRows(l, box, rerender);
      lentSizeRow(l, box, rerender);
      // Placement (Parte 4 da Proporção): Fill cobre o papel e corta (a posição escolhe a parte); Fit mostra a foto
      // inteira com uma faixa (cor em Settings, igual para todas as sessões)
      cropLoad(session, st);
      const place = row("Placement");
      place.appendChild(segmented([["fill", "Fill"], ["fit", "Fit"]], l.placement || "fill", (v) => { l.placement = v; rerender(); }));
      if ((l.placement || "fill") === "fit") {
        const note = el("span", "export-note-inline", "Band: " + lentBand + " · change it in ");
        const go = el("button", "note-link", "Settings › Export"); go.type = "button";
        go.title = "Open Settings at the Lenticular band color (Export tab)";
        go.addEventListener("click", () => openSettings("export"));
        note.appendChild(go);
        place.appendChild(note);
      }
      box.appendChild(place);
      // Framing e papel com formas diferentes (decisão do dono, 2026-11-04, opção A): em Fill o papel manda e corta
      // o Framing de novo; o aviso diz isso e lembra o Fit (o Framing inteiro, com faixa)
      if (st.crop.ratio !== "asshot" && (l.placement || "fill") === "fill" && l.widthCm > 0 && l.heightCm > 0) {
        const fr = RATIOS[st.crop.ratio], pr = l.widthCm / l.heightCm;
        const prL = Math.max(pr, 1 / pr), landscapePaper = pr >= 1;
        const off = Math.abs(prL - fr) / fr > 0.01 || (fr > 1.001 && !landscapePaper);
        if (off) {
          const paperName = ratioName(l.widthCm, l.heightCm);
          const cut = !landscapePaper || prL < fr ? "the sides" : "the top and bottom";
          box.appendChild(mixedWarn("Framing " + st.crop.ratio + " · paper " + lentSizeText(l) + " (" + (Math.abs(Math.max(l.widthCm, l.heightCm) / Math.min(l.widthCm, l.heightCm) - RATIOS[paperName]) < 0.01 ? paperName : "~" + paperName) + (landscapePaper ? "" : ", portrait") +
            "): in Fill the paper shape wins, so " + cut + " of the framing are cut. Choose Fit to keep the whole framing, with a band."));
        }
      }
      addTip(box, "Fill: the photo covers the sheet and is cropped at the position chosen in Framing. Fit: the whole photo, with a band where it does not reach the edge of the sheet.", "Placement");
      // Marcas de impressão (entrega 2)
      const marks = row("Marks");
      marks.appendChild(checkOption("Crop marks", !!l.cropMarks, (v) => { l.cropMarks = v; rerender(); }));
      marks.appendChild(checkOption("Alignment marks", !!l.alignMarks, (v) => { l.alignMarks = v; rerender(); }));
      marks.appendChild(el("span", "export-label lent-sub", "Bleed"));
      marks.appendChild(segmented([["0", "None"], ["3", "3 mm"]], String(l.bleedMm || 0), (v) => { l.bleedMm = Number(v); rerender(); }));
      box.appendChild(marks);
      addTip(box, "Crop marks: short lines in the margin showing where to cut. Alignment marks: crosses on each side to place the lens sheet. " +
        "Bleed: the picture goes a little past the cut line, so a cut slightly off leaves no white edge. With marks, the file has a white margin around the print.", "Marks");
      addTip(box, "The photos are scaled to cover this size exactly (cropped at the edges if the shape differs). " +
        "Print at 100% / actual size, never \"fit to page\": the file already has the right dpi and size.", "Print size");
      } else {
      const s = st.seq;
      const order = cycleOrder(items.length, s.reverse);
      const play = button("", () => { if (exp.timer) stopPreview(); else startPreview(); setPlayIcon(); }, { icon: "pause", title: "Play / pause", kind: "btn-overlay" });
      play.classList.add("preview-play");
      preview.appendChild(play);
      const setPlayIcon = () => { play.innerHTML = icon(exp.timer ? "pause" : "play"); };
      const step = () => {
        if (!order.length) return;
        exp.frame = (exp.frame + 1) % order.length;
        const i = order[exp.frame];
        show(i, ["Preview", " " + label + " · photo " + (i + 1) + " of " + items.length + " · " + s.fps + " fps"]);
      };
      const startPreview = () => { stopPreview(); exp.timer = setInterval(step, 1000 / s.fps); };
      if (focused) {
        exp.frame = -1;
        step();
        startPreview();
        setPlayIcon();
      }
      // Carrega todas as prévias antes, para tocar sem falhas
      items.forEach((item) => sessionPhoto(session.name, item.file, 1600));

      const formats = row("Formats");
      const chips = el("span", "chips");
      SEQ_FORMATS.forEach((f) => {
        const c = el("button", "chip" + (s.formats.includes(f) ? " on" : ""), f.toUpperCase());
        c.addEventListener("click", () => {
          s.formats = s.formats.includes(f) ? s.formats.filter((x) => x !== f) : SEQ_FORMATS.filter((x) => x === f || s.formats.includes(x));
          rerender();
        });
        chips.appendChild(c);
      });
      formats.appendChild(chips);
      box.appendChild(formats);

      const k = FPS_STEPS.indexOf(s.fps);
      const speed = row("Speed");
      speed.appendChild(stepper(s.fps + " fps", (1 / s.fps).toFixed(2) + " s per photo",
        () => { s.fps = FPS_STEPS[Math.max(0, k - 1)]; rerender(); },
        () => { s.fps = FPS_STEPS[Math.min(FPS_STEPS.length - 1, k + 1)]; rerender(); },
        k <= 0, k >= FPS_STEPS.length - 1));
      const loopsLabel = el("span", "export-label", "Loops");
      loopsLabel.style.minWidth = "auto";
      speed.appendChild(loopsLabel);
      speed.appendChild(stepper(String(s.loops), "",
        () => { s.loops = Math.max(1, s.loops - 1); rerender(); },
        () => { s.loops = Math.min(20, s.loops + 1); rerender(); }, s.loops <= 1, s.loops >= 20));
      speed.appendChild(checkOption("Reverse loop", s.reverse, (v) => { s.reverse = v; rerender(); }));
      box.appendChild(speed);

      const size = row("Size");
      size.appendChild(segmented(SIZES, s.height, (v) => { s.height = v; rerender(); }));
      box.appendChild(size);
      addTip(box, "4K only for MP4 and MOV. GIF, WEBP and AVIF go up to 1080p.", "Size");

      const quality = row("Quality");
      quality.appendChild(segmented(QUALITIES, s.quality, (v) => { s.quality = v; rerender(); }));
      box.appendChild(quality);
      addTip(box, "Standard: smaller files, good for sharing online. High: very close to the photos, with smaller files; good for most uses. " +
        "Maximum: as close to the photos as each format allows (WEBP keeps every pixel; MP4, MOV and AVIF get much more detail); large files, and AVIF takes longer. " +
        "GIF always has 256 colors, at any quality.", "Quality");

      const t = seqTotal(session, s);
      const total = el("div", "export-total");
      const path = order.length > 1 ? (s.reverse && items.length > 2 ? "1 → " + items.length + " → 2" : "1 → " + items.length) : "1";
      total.append(el("span", "", "1 loop: " + path + " · " + plural(t.cycle, "frame", "frames")),
                   el("span", "", "× " + plural(s.loops, "loop", "loops")), el("span", "spacer"));
      const sum = el("span", "", "Total ");
      sum.appendChild(el("b", "", seconds(t.seconds)));
      total.appendChild(sum);
      box.appendChild(total);
      addTip(box, "MP4 and MOV have the loops inside the video. GIF, WEBP and AVIF repeat without stopping. Reverse loop: plays forward and back (1 → 9 → 2) instead of starting over.", "Speed");
          }
    };

    // Abas (decisão do dono, 2026-11-03, protótipo W1): Framing · Photos · Sequence · Lenticular, no topo da coluna,
    // acima da prévia; chips, com a caixa de ligar/desligar dentro da aba de cada saída. Só o conteúdo da aba atual
    // aparece, abaixo da prévia.
    const tabs = el("div", "export-tabs");
    tabs.setAttribute("role", "tablist");
    // Passo 2: Photos · Sequence · Lenticular (o Framing é o passo 1)
    (exp.step === 2 ? OUTPUTS : []).forEach(([kind, title, sub]) => {
      const always = kind === "framing";
      const on = always || !!st.outputs[kind];
      const current = kind === exp.mode;
      const tab = el("button", "export-tab" + (current ? " on" : "") + (on ? "" : " off"), ""); tab.type = "button";
      tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", current ? "true" : "false"); tab.tabIndex = 0;  // o Tab passa por todas as abas
      if (!always) {
        const check = el("label", "export-check export-tab-check");
        const input = document.createElement("input");
        input.type = "checkbox"; input.checked = on; input.setAttribute("aria-label", "Export " + title);
        check.append(input, el("span", "save-check"));
        check.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("change", () => { st.outputs[kind] = input.checked; if (input.checked) exp.mode = kind; rerender(); });
        tab.appendChild(check);
      }
      tab.appendChild(document.createTextNode(title));
      // Esta sessão difere das outras nesta saída (só com "Same settings for all sessions" desligado): marca na aba
      const differs = differentSessions(2, kind).size > 0;
      if (differs) { tab.classList.add("different"); tab.appendChild(el("span", "export-tab-diff", "")); }
      tab.title = sub + (always ? "" : on ? " · exported" : " · not exported") + (differs ? " · different from the other sessions" : "");
      tab.addEventListener("click", () => { if (!current) { exp.mode = kind; rerender(); } });
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const all = [...tabs.children]; const i = all.indexOf(tab); const n = all[(i + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length];
        if (n) { e.preventDefault(); n.click(); setTimeout(() => { const t = outer.querySelector(".export-tab.on"); if (t) t.focus(); }, 0); }
      });
      tabs.appendChild(tab);
    });
    if (exp.step === 2) { pv.classList.add("export-tabs-end"); tabs.appendChild(pv); outer.insertBefore(tabs, rows); }
    {
      const kind = exp.mode;
      const always = kind === "framing";
      const on = always || !!st.outputs[kind];
      const body = el("div", "export-tab-body");
      if (!always) {
        const sum = el("div", "export-tab-sum");
        // O resumo lembra o Framing do passo 1 (não muda aqui)
        const cut = st.crop.ratio !== "asshot" && kind !== "lenticular" ? " · cut to " + st.crop.ratio + " (step 1)" : "";
        setWarnText(sum, on ? outputText(session, kind) + cut : "Off · tick the box in the tab to export it");
        body.appendChild(sum);
      }
      buildKind(kind, body, true);
      if (kind === "lenticular") {
        // "Print pitch test" mora na aba Lenticular (ferramenta dela), não mais no rodapé
        const pr = el("div", "export-pitch-row");
        const b = button("Print pitch test", () => { const n = lentSession(); if (n) openPitchTest(settingsFor(n).lent); },
          { kind: "btn-secondary", title: "A sheet to measure the real LPI of your lens sheet with your printer" });
        b.disabled = !lentSession();
        pr.append(b, el("span", "export-note", "Measure the real LPI of your lens sheet with your printer."));
        body.appendChild(pr);
      }
      if (always && chosenSessions().length > 1) {
        // Passo 1: "Same framing for all ticked sessions" (ligada por padrão; o alinhamento é por foto e não é copiado)
        const nd = differentSessions(1).size;
        body.appendChild(sameBox("Same framing for all ticked sessions", sameState(exp.sameFraming, 1), () => {
          exp.sameFraming = true;
          chosenSessions().forEach((o) => { if (o.name === session.name) return; const ost = settingsFor(o.name); cropLoad(o, ost); ost.crop = Object.assign({}, st.crop, { loaded: true }); cropSave(o, ost); });
          toast("Same framing on " + plural(chosenSessions().length, "session", "sessions") + " · ⌘Z undoes");
          rerender();
        }, () => { exp.sameFraming = false; rerender(); }, nd, "The aspect ratio and the crop position. The photo alignment stays per session."));
      }
      if (!always && chosenSessions().length > 1) {
        // Passo 2: a mesma caixa, uma por saída, na última linha da aba
        const kd = kind, key = OUTPUT_KEY_OF[kd], nd = differentSessions(2, kd).size;
        body.appendChild(sameBox("Same settings for all sessions", sameState(exp.same[kd], 2, kd), () => {
          exp.same[kd] = true;
          chosenSessions().forEach((o) => { if (o.name === session.name) return; const t = settingsFor(o.name); t[key] = JSON.parse(JSON.stringify(st[key])); t.outputs[kd] = st.outputs[kd]; });
          toast(OUTPUTS.find(([k]) => k === kd)[1] + ": same settings on " + plural(chosenSessions().length, "session", "sessions") + " · ⌘Z undoes");
          rerender();
        }, () => { exp.same[kd] = false; rerender(); }, nd));
      }
      if (!always && session.inProject && session.edited > 0) {
        // "Use edited photos" ao lado de "Same settings for all sessions" (decisão do dono, 2026-11-06): é a mesma
        // chave da etiqueta "Edited n / m" da sessão (prévias e Export juntos)
        const last = body.lastElementChild;
        const row = last && last.classList.contains("same-row") ? last : body.appendChild(el("div", "export-row same-row"));
        const l = el("label", "log-option export-edited-opt");
        const c = document.createElement("input"); c.type = "checkbox"; c.className = "cs-check";
        c.checked = session.showEdited !== false;
        c.addEventListener("change", () => { Promise.resolve(setShowEdited(session, c.checked)).then(() => rerender()); });
        l.append(c, document.createTextNode(" Use edited photos"));
        l.title = plural(session.edited, "photo of this session has", "photos of this session have") + " an edited version in the project's Edited folder. The same as the Edited tag of the session.";
        row.appendChild(l);
      }
      rows.appendChild(body);
    }
    if (exp.step === 2 && !OUTPUT_KINDS.some((k) => st.outputs[k])) rows.appendChild(el("div", "export-note exp-none", "Tick at least one output: Photos, Sequence or Lenticular."));
    slideBlocks(outer, before, rows);
    if (exp.step === 1) return;  // nome e pasta: passo 3; "Apply to all sessions": passo 2

    // ("Apply to all sessions" saiu: a caixa "Same settings for all sessions" da aba faz isso)
  }

  // Passo 3 (Review): uma linha por sessão marcada, o nome das pastas e "Export to"
  function renderReview(outer, rows, rerender) {
    rows.remove();
    // O nome vale para todas as marcadas; a sessão "ativa" tem de ser uma delas (syncAll copia dela)
    if (!exp.selected.has(exp.active)) { const f = chosenSessions()[0]; if (f) exp.active = f.name; }
    const wrap = el("div", "export-review");
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th></th><th>Session</th><th>Framing</th><th>Outputs</th><th>Folder</th></tr></thead>";
    const tbody = document.createElement("tbody");
    const chosen = chosenSessions();
    const editLink = (step, s, mode) => {
      const b = el("button", "review-edit", "Edit"); b.type = "button";
      b.title = step === 1 ? "Change the framing of this session (step 1)" : "Change the outputs of this session (step 2)";
      b.addEventListener("click", () => { exp.active = s.name; exp.photo = 0; if (mode) exp.mode = mode; exp.step = step; exp.aligning = false; renderExport(); });
      return b;
    };
    chosen.forEach((s) => {
      const st = settingsFor(s.name); cropLoad(s, st); alignLoad(s, st);
      const label = sessionLabel(s.name);
      const tr = document.createElement("tr");
      const tdT = document.createElement("td"); const th = el("span", "review-thumb"); tdT.appendChild(th);
      const first = sessionItems(s).find((i) => i.previewable);
      if (first) sessionPhoto(s.name, first.file, 320).then((url) => { if (url) th.style.backgroundImage = "url(" + url + ")"; });
      const tdS = document.createElement("td");
      tdS.append(document.createTextNode((s.label ? s.label + " · " : "") + label.date), document.createElement("br"), el("span", "dim", plural(sessionItems(s).length, "photo", "photos")));
      const tdF = document.createElement("td");
      const r = ratioInfoCached(s.name), aligned = needsRatio(s, st) ? 0 : Object.keys(st.align.byFile).filter((f) => !alignIsIdentity(st.align.byFile[f])).length;
      const names = { 0: "left", 0.5: "centre", 1: "right" }, vnames = { 0: "top", 0.5: "", 1: "bottom" };
      const warned = st.crop.ratio === "asshot" && r && r.mixed && !aligned;
      if (warned) { const w = mixedWarn("As shot · mixed ratios: the sequence will jump and the lenticular subject changes size"); const e = editLink(1, s, "framing"); e.classList.add("in-warn"); w.lastChild.append(" ", e); tdF.appendChild(w); }
      else {
        const pos = st.crop.ratio === "asshot" ? "" : " · " + ([vnames[st.crop.y], names[st.crop.x]].filter((x) => x && x !== undefined).join(" ") || "custom position");
        tdF.appendChild(document.createTextNode((st.crop.ratio === "asshot" ? "As shot" : st.crop.ratio) + pos));
        if (aligned) { tdF.appendChild(document.createElement("br")); tdF.appendChild(el("span", "dim", plural(aligned, "photo", "photos") + " aligned")); }
      }
      if (!warned) tdF.appendChild(editLink(1, s, "framing"));
      const tdO = document.createElement("td");
      const kinds = OUTPUT_KINDS.filter((k) => st.outputs[k]);
      if (!kinds.length) tdO.appendChild(el("span", "amb", "No output ticked"));
      kinds.forEach((k, i) => { if (i) tdO.appendChild(document.createElement("br")); const line = el("span", "", ""); setWarnText(line, outputText(s, k)); tdO.appendChild(line); });
      tdO.appendChild(editLink(2, s, kinds[0] || "photos"));
      const tdD = document.createElement("td"); tdD.textContent = folderName(s);
      tr.append(tdT, tdS, tdF, tdO, tdD);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    // Só a lista de sessões rola; "Name" e "Export to" ficam presos embaixo (decisão do dono, 2026-11-04)
    const listBox = el("div", "export-review-list");
    listBox.appendChild(table);
    wrap.appendChild(listBox);

    // Nome (vale para todas as sessões marcadas) e pasta
    const boxes = el("div", "export-review-boxes");
    const nameBox = el("div", "export-review-box"); nameBox.appendChild(el("h4", "", "Name"));
    const st = settingsFor(exp.active);
    const n = st.naming;
    const setAll = (fn) => { chosen.forEach((s) => fn(settingsFor(s.name).naming)); };
    const nameRow = row("Folders");
    const nameCol = el("div", "export-name-col");
    nameCol.appendChild(segmented([["date", "Date + time"], ["number", "Number"], ["custom", "Custom"]], n.kind, (v) => { setAll((x) => { x.kind = v; }); rerender(); }));
    nameRow.appendChild(nameCol);
    nameBox.appendChild(nameRow);
    if (n.kind === "custom") {
      const custom = el("div", "export-name-custom");
      const input = document.createElement("input");
      input.className = "export-name"; input.placeholder = "Name, e.g. Studio test"; input.maxLength = 80; input.value = n.text;
      input.addEventListener("input", () => {
        const v = input.value.replace(/\|/g, ""); setAll((x) => { x.text = v; });
        [...tbody.children].forEach((tr, i) => { tr.lastChild.textContent = folderName(chosen[i]); });
        refreshSummaries();
      });
      custom.appendChild(input);
      custom.appendChild(checkOption("Add date + time", n.date, (v) => { setAll((x) => { x.date = v; }); rerender(); }));
      if (n.date) custom.appendChild(segmented([["before", "Before"], ["after", "After"]], n.position, (v) => { setAll((x) => { x.position = v; }); rerender(); }));
      nameCol.appendChild(custom);
    }
    addTip(nameBox, "Date + time: each session folder is named after when it was shot. Number: 01, 02… continuing from the ones already in the destination folder. " +
      "Custom: a name you type; sessions with the same name get numbers (01, 02…). The name applies to every ticked session.", "Folders");
    // Onde salva: com Project aberto, <Project>/Exports; sem, <pasta do Stillpoint>/Exports.
    // "Choose another folder…" vale só para este salvamento (como no New project)
    const destBox = el("div", "export-review-box"); destBox.appendChild(el("h4", "", "Export to"));
    const where = exp.dest || exp.destDefault || "";
    const path = el("span", "export-dest", where ? "\u200E" + where + "\u200E" : "…"); path.title = where;
    destBox.appendChild(path);
    const destBtns = el("div", "export-pitch-row");
    destBtns.appendChild(button("Choose another folder…", () => {
      if (typeof window.chooseExportFolder !== "function") { toast("This build cannot do that yet. Build the app again.", 8000); return; }
      Promise.resolve(window.chooseExportFolder(where)).then((r) => { if (r && r.folder) { exp.dest = r.folder; rerender(); } });
    }, { kind: "btn-secondary" }));
    // Sempre à vista (decisão do dono, 2026-11-04); apagado quando já é a pasta padrão
    const resetDest = button("Use the default folder", () => { exp.dest = null; rerender(); },
      { kind: "btn-secondary", title: exp.dest ? "Back to " + (exp.destProject ? "the project's Exports folder" : "the default folder") + ": " + (exp.destDefault || "") : "Already the default folder" });
    resetDest.disabled = !exp.dest;
    destBtns.appendChild(resetDest);
    destBox.appendChild(destBtns);
    destBox.appendChild(el("span", "export-note", plural(chosen.length, "folder", "folders") + " · one per session"));
    boxes.append(nameBox, destBox);
    wrap.appendChild(boxes);
    outer.appendChild(wrap);
  }

  function exportSpec(name) {
    const st = settingsFor(name);
    const n = st.naming;
    const head = [name, n.kind, (n.text || "").replace(/\|/g, ""), n.date ? 1 : 0, n.position];
    // "outputs": fotos (formato|qualidade; formato vazio = não), sequência (formatos vazios = não)
    // e lenticular (1|0 e os valores), tudo numa linha por sessão
    const o = st.outputs, s = st.seq, l = st.lent;
    return [...head, "outputs",
      o.photos ? [st.photos.original ? "original" : "", st.photos.convert ? st.photos.format : ""].filter(Boolean).join(",") : "", st.photos.quality,
      o.sequence ? s.formats.join(",") : "", s.fps, s.loops, s.reverse ? 1 : 0, s.height, s.quality,
      o.lenticular ? 1 : 0, lentPitch(l), l.dpi, (l.widthCm / CM_PER_IN).toFixed(4), (l.heightCm / CM_PER_IN).toFixed(4), l.effect, l.reverse ? 1 : 0,
      l.cropMarks ? 1 : 0, l.alignMarks ? 1 : 0, l.bleedMm || 0, l.lpi,
      // Parte 4 da Proporção: 25 proporção | 26 posição x | 27 posição y | 28 same size | 29 placement | 30 faixa
      st.crop.ratio || "asshot", st.crop.x.toFixed(3), st.crop.y.toFixed(3), 1, l.placement || "fill", lentBand].join("|");
  }

  function runExport(deleteRest) {
    const names = exportable().filter((s) => exp.selected.has(s.name)).map((s) => s.name);
    exp.waiting = true;  // a janela fica aberta até salvar de fato
    // Project: "project" = direto para <Project>/Exports; "edited" = usar as editadas quando houver
    // "dest": o 3º argumento é a pasta (vazio = a padrão), sem perguntar
    // As editadas: cada sessão segue a etiqueta "Edited n / m" (ou "Use edited photos" em Outputs), lida pelo app
    const flags = [deleteRest ? "delete" : "", "dest"].filter(Boolean).join(",");
    if (exp.project) window.projectExportDefaults(JSON.stringify({ mode: exp.mode }));
    window.exportSessions(exp.project ? "project" : exp.exitAfter ? "exit" : "", flags, exp.dest || "", ...names.map(exportSpec));
  }

  // Formatos misturados: salvando como Original, umas câmeras mandaram RAW e outras só JPEG
  // (Quality diferente). Avisa antes, para a pessoa igualar em Camera settings se quiser.
  const RAW_RE = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|raf|orf|rw2|pef|raw)$/i;
  function mixedFormats() {
    const raw = new Set(), jpeg = new Set();
    sessions.filter((s) => exp.selected.has(s.name) && settingsFor(s.name).outputs.photos && settingsFor(s.name).photos.original).forEach((s) => {
      const byCam = {};
      s.photos.forEach((p) => { if (!p.camera) return; byCam[p.camera] = byCam[p.camera] || { raw: false }; if (RAW_RE.test(p.file)) byCam[p.camera].raw = true; });
      Object.keys(byCam).forEach((cam) => (byCam[cam].raw ? raw : jpeg).add(cam));
    });
    jpeg.forEach((c) => { if (raw.has(c)) jpeg.delete(c); });
    return raw.size && jpeg.size ? { raw: [...raw].sort(), jpeg: [...jpeg].sort() } : null;
  }
  // Sessão escolhida com o Lenticular marcado (a aberta, se for o caso)
  function lentSession() {
    const names = [exp.active].concat([...exp.selected]).filter((n) => exp.selected.has(n));
    return names.find((n) => settingsFor(n).outputs.lenticular) || null;
  }
  let pitchAsk = true;  // "Don't ask again" (pref.pitchAsk = "off")
  function confirmExport() {
    const chosen = exp.selected.size;
    if (!chosen) return;
    // Lenticular com o LPI de fábrica (sem pitch medido): sugere a folha de teste antes
    const lentName = lentSession();
    if (lentName && pitchAsk && !exp.pitchChecked && !(settingsFor(lentName).lent.pitch > 0)) {
      const l = settingsFor(lentName).lent;
      dialog("Print a pitch test first?",
        "The lenticular print uses the LPI on the lens package (" + l.lpi + "). Real lens sheets differ a little with each printer, and a small " +
        "difference makes the effect blurry or striped. A pitch test (one sheet) shows the real value: type it in \"Measured pitch\" and then export.", [
        { label: "Don't ask again", link: true, onClick: () => { pitchAsk = false; window.savePref("pitchAsk", "off"); exp.pitchChecked = true; confirmExport(); exp.pitchChecked = false; } },
        { label: "Print pitch test", onClick: () => openPitchTest(l) },
        { label: "Export anyway", primary: true, onClick: () => { exp.pitchChecked = true; confirmExport(); exp.pitchChecked = false; } },
      ]);
      return;
    }
    const mixed = mixedFormats();
    if (mixed && !exp.formatsChecked) {
      dialog("Not every camera sent RAW",
        "RAW: " + mixed.raw.join(", ") + ". JPEG only: " + mixed.jpeg.join(", ") + ". Exported as Original, each camera keeps the format it shot. " +
        "To make them the same, set Quality in Camera settings before the next session, or export as JPG to convert all of them now.", [
        { label: "Back" },
        { label: "Export as is", primary: true, onClick: () => { exp.formatsChecked = true; confirmExport(); exp.formatsChecked = false; } },
      ]);
      return;
    }
    const left = exportable().length - chosen;
    if (!left || exp.project) return runExport(false);  // Project: exportar nunca apaga nada
    dialog("Delete the sessions you did not select?",
      plural(left, "session was", "sessions were") + " not selected. You can delete " + (left === 1 ? "it" : "them") +
      " after the others are exported, or keep " + (left === 1 ? "it" : "them") + " in the app to export later.", [
      { label: "Back" },
      { label: "Keep " + (left === 1 ? "it" : "them"), onClick: () => runExport(false) },
      { label: "Delete " + (left === 1 ? "it" : "them"), danger: true, onClick: () => runExport(true) },
    ]);
  }

  ui.saveBtn.addEventListener("click", () => startSave(false));
  $("exportSelectAll").addEventListener("click", () => { exp.selectedTouched = true; exp.selected = new Set(exportable().map((s) => s.name)); renderExportList(); updateExportCount(); });
  $("exportUnselectAll").addEventListener("click", () => { exp.selectedTouched = true; exp.selected.clear(); renderExportList(); updateExportCount(); });
  $("exportCancel").addEventListener("click", askCloseExport);
  $("exportConfirm").addEventListener("click", () => {
    if (exp.step === 1 && exp.aligning) { exp.aligning = false; renderExport(); return; }  // "Done aligning"
    if (exp.step < 3) goExportStep(exp.step + 1); else confirmExport();
  });
  $("exportBack").addEventListener("click", () => goExportStep(exp.step - 1));
  $("progressCancel").addEventListener("click", () => {
    $("progressCancel").disabled = true;
    $("progressStep").textContent = "Cancelling…";
    window.cancelExport();
  });

  function showProgress(e) {
    const overlay = $("progressOverlay");
    if (overlay.classList.contains("hidden")) {
      overlay.classList.remove("hidden");
      $("progressCancel").disabled = false;
    }
    const total = e.total || 1;
    $("progressTitle").textContent = "Exporting " + plural(total, "session", "sessions");
    const stepNames = { photos: "reading the photos", "photos-save": "saving the photos", lenticular: "interlacing the lenticular print", "lenticular-save": "saving the lenticular print", done: "done" };
    const step = stepNames[e.step] || (/^(MP4|MOV|GIF|WEBP|AVIF)$/.test(e.step) ? "making the " + e.step : "converting to " + String(e.step).toUpperCase());
    $("progressStep").textContent = sessionLabel(e.session).date + " · " + step;
    const pct = Math.round(((e.index + Math.min(1, e.fraction || 0)) / total) * 100);
    $("progressBar").style.width = pct + "%";
    $("progressSession").textContent = "Session " + (e.index + 1) + " of " + total;
    $("progressPercent").textContent = pct + "%";
  }

  function confirmExit(count) {
    // Salvando: continuar e fechar no fim, ou parar e fechar
    if (!$("progressOverlay").classList.contains("hidden")) {
      dialog("Export in progress",
        "Stillpoint is exporting your sessions. You can close when it finishes, or stop now: the sessions that were not exported yet stay in the app for next time.", [
        { label: "Stop and close", danger: true, onClick: () => { exp.closeWhenDone = "stop"; window.cancelExport(); } },
        { label: "Close when done", primary: true, onClick: () => { exp.closeWhenDone = "wait"; toast("Stillpoint will close when the export finishes"); } },
      ]);
      return;
    }
    // Janela de salvar aberta: voltar para ela ou apagar e fechar
    const exportOpen = !$("exportOverlay").classList.contains("hidden");
    if (exportOpen) {
      $("exportOverlay").classList.add("hidden");
      stopPreview();
      const back = () => { $("exportOverlay").classList.remove("hidden"); renderExportSettings(); };
      dialog("Export your sessions before closing?",
        plural(count, "session is", "sessions are") + " not exported yet. If you close without exporting, the photos are deleted.", [
        { label: "Delete and close", danger: true, onClick: () => window.exitApp(true) },
        { label: "Continue exporting", primary: true, onClick: back },
      ]);
      return;
    }
    dialog(
      "Export your sessions before closing?",
      plural(count, "session is", "sessions are") + " not exported yet. If you close without exporting, the photos are deleted.",
      [
        { label: "Cancel" },
        { label: "Delete and close", danger: true, onClick: () => window.exitApp(true) },
        { label: "Export and close", primary: true, onClick: () => startSave(true) },
      ]
    );
  }

  function offerRecovery(count) {
    dialog(
      "Sessions from last time",
      "The app closed before " + plural(count, "session was", "sessions were") + " exported. The photos are safe and shown in Sessions.",
      [
        { label: "Delete", link: true, onClick: () => dialog("Delete the kept sessions?", "Their photos will be deleted permanently.", [
          { label: "Cancel" },
          { label: "Delete", danger: true, onClick: () => window.deleteAllSessions() },
        ]) },
        { label: "Later" },
        { label: "Export", primary: true, onClick: () => startSave(false) },
      ]
    );
  }

  // =================== Avisos do programa ===================
  // Enquanto as fotos do "Reorder by photo" são tiradas, os avisos de disparo
  // vão para essa janela, não para a atividade nem para a contagem.
  const orderCapture = () => (order.open && order.capturing) || csTest.capturing;
  const captureGallery = () => (csTest.capturing ? csGallery : orderGallery);

  const handlers = {
    // Etapa 20: fotos que entraram no Lightroom Classic (ou saíram com "Done editing")
    adobeEditing(e) { setAdobeEditing(e.sessions); },
    busy(e) {
      busy = e.busy;
      busyAction = e.busy ? e.action : "";
      if (e.busy && e.action === "shoot") { shootCancelling = false; shootCancelled = false; ui.progress.classList.remove("warn"); lastShootAt = Date.now(); }
      activity.busyText = "";
      renderActivity();
      if (busy) {
        const labels = { restart: "Restarting connections", shoot: "Shooting", identify: "Identifying", reorder: "Saving order", orderPhotos: "Taking photos" };
        setStatus(labels[e.action] || "Working", "busy");
        if (e.action === "restart") log("Camera connections restarted");
      } else {
        if (csTest.capturing) {
          // Teste do Camera settings terminou sem fotos (ex.: uma câmera ainda conectando)
          csTest.capturing = false;
          const wasCancelled = csTest.cancelling;
          csTest.cancelling = false;
          $("camSettingsOverlay").querySelector(".cs-sheet").classList.remove("capturing");
          csGallery.setHead(wasCancelled ? "Test shot cancelled" : "No photos", "");
          csGallery.message(wasCancelled ? "Cancelled. Nothing was kept." : "The photos could not be taken. Try again when all cameras are ready.");
          if (wasCancelled) window.discardOrderPhotos();
        } else if (orderCapture()) {
          // O pedido terminou sem fotos (ex.: uma câmera ainda conectando)
          order.capturing = false;
          orderGallery.setHead("No photos", "");
          orderGallery.message("The photos could not be taken. Try again when all cameras are ready.");
          updateOrderButtons();
        }
        readyStatus();
      }
      updateButtons();
    },

    cameras(e) {
      e.cameras.forEach((cam) => {
        const before = cameras.find((c) => c.name === cam.name);
        if (before && before.connected && !cam.connected) log(cameraLabel(cam.name, cam.model) + " turned off or disconnected. Turn it on to reconnect.", "warn");
      });
      cameras = e.cameras;
      // Câmera que só o USB mostra há mais de 1 minuto: o SDK não a encontrou. Não
      // bloqueia o disparo; deixa de aparecer como "conectando" e pede para religá-la.
      cameras.forEach((c) => {
        if (c.starting && c.seconds >= SLOW_CONNECT_SECONDS) c.state = "stuck";
      });
      renderCameras();
      readyStatus();
      refreshSessionTitles();

      renderActivity();
    },

    closing() {
      setStatus("Closing", "busy");
      activity.closing = true;
      busy = true;
      updateButtons();
    },
    waitConnecting() {
      toast("A camera is still connecting. Try again when it is ready.");
    },

    sdkFailed() {
      setStatus("Canon SDK error", "error");
      log("The Canon SDK could not start.", "error");
    },

    // Conexão
    connecting(e) { log("Connecting " + cameraLabel(e.camera, e.model)); },
    connected(e) {
      log(cameraLabel(e.camera, e.model) + " connected", "ok");
      if (!e.compatible) log(e.model + " is not on Canon's compatibility list.", "warn", "It may not work correctly.");
    },
    connectFailed(e) {
      log(cameraLabel(e.camera, e.model) + " did not connect. Trying again automatically.", "warn", e.hint);
    },

    // Sequência
    sessionStarted(e) {
      if (orderCapture()) return;
      if (e.total > 1) log("Session " + e.index + " of " + e.total);
      ui.progress.textContent = e.total > 1 ? "Session " + e.index + " of " + e.total : "Shooting";
      activity.busyText = e.total > 1 ? "Shooting session " + e.index + " of " + e.total : "Shooting";
    },
    sessionFolderFailed() { log("Could not create the folder for the session.", "error"); },
    countdownStarted() {
      if (orderCapture()) return;
      $("countdownCancel").disabled = shootCancelling;
      ui.countdownOverlay.classList.remove("hidden");
    },
    countdownTick(e) {
      if (orderCapture()) return;
      ui.countdownOverlay.classList.remove("hidden");
      ui.countdownNumber.textContent = e.seconds;
    },
    trigger() {
      ui.countdownOverlay.classList.add("hidden");
      if (orderCapture()) return;
      // Clarão rápido no lugar de texto
      ui.flash.classList.remove("hidden");
      ui.flash.style.animation = "none";
      void ui.flash.offsetWidth;
      ui.flash.style.animation = "";
      setTimeout(() => ui.flash.classList.add("hidden"), 500);
    },
    // Disparo do plano recusado pela câmera: anota (resumo no fim) e mostra na linha de andamento
    shotFired(e) {
      if (e.ok || orderCapture()) return;
      const shot = shootPlan && shootPlan.shots[e.index - 1];
      const gap = shot ? repeatGap(shootPlan.shots, shot) : Infinity;
      shootMissing.push({ camera: e.camera, index: e.index, gap });
      ui.progress.textContent = "Shot " + e.index + " of " + e.total + " · " + cameraLabel(e.camera) + " refused";
      ui.progress.classList.add("warn");
    },
    shotFailed(e) {
      // As explicações do núcleo vêm em minúsculas ("no memory card"): vira frase
      const hint = e.hint ? e.hint.charAt(0).toUpperCase() + e.hint.slice(1) + "." : "";
      // Com plano, o resumo no fim da sessão explica tudo numa linha só
      if (!shootPlan || timing.mode === "all") log(cameraLabel(e.camera) + " did not take the photo.", "warn", hint);
    },
    waitingDownloads() {
      activity.busyText = "Receiving photos";
      if (orderCapture()) return captureGallery().message("Receiving photos");
      ui.progress.textContent = "Receiving photos";
    },
    downloadProgress(e) {
      const text = "Receiving photos, " + e.done + " of " + e.total;
      activity.busyText = text;
      if (orderCapture()) return captureGallery().message(text);
      ui.progress.textContent = text;
    },
    downloadTimeout(e) {
      log("Some photos did not arrive in time.", "error",
        e.lost.length ? "Lost connection: " + e.lost.map((n) => cameraLabel(n)).join(", ") + "." : "No camera was disconnected. Try a longer download wait.");
    },
    sessionInterrupted() { if (!orderCapture()) log("The session stopped before the end.", "error"); },
    sessionCompleted() {},
    sequenceCancelled() {
      ui.countdownOverlay.classList.add("hidden");
      if (orderCapture()) return;
      shootCancelled = true;
      log("Bullet time cancelled", "warn", "Photos that already arrived stay in the session.");
      ui.progress.textContent = "Cancelled.";
    },
    sequenceFinished(e) {
      if (orderCapture()) return;
      lastShootAt = Date.now();
      if (shootCancelled) return;  // já avisado em sequenceCancelled
      ui.progress.classList.remove("warn");
      if (e.completed && shootMissing.length) {
        // Resumo das fotos recusadas: uma linha só, com a causa e o que fazer
        const items = shootMissing.map((m) => cameraLabel(m.camera) + " (shot " + m.index + ")").join(", ");
        const tooSoon = shootMissing.filter((m) => m.gap < CAMERA_REPEAT_MS);
        const why = tooSoon.length === shootMissing.length && tooSoon.length
          ? " — asked " + fmtS(Math.min(...tooSoon.map((m) => m.gap))) + (tooSoon.length > 1 ? " or less" : "") + " after their previous shot."
          : tooSoon.length ? " — some asked too soon after their previous shot; the camera was busy." : " — the camera was busy.";
        const text = "Done with " + plural(shootMissing.length, "photo", "photos") + " missing: " + items + why;
        const hint = tooSoon.length ? "Give each camera at least " + fmtS(CAMERA_REPEAT_MS) + " between its own shots in Timing." : "Check the camera and try again.";
        log(text, "warn", hint);
        ui.progress.textContent = text;
        ui.progress.classList.add("warn");
      } else if (e.completed) {
        log("Bullet time complete", "ok");
        ui.progress.textContent = "Done. The new session is shown above.";
      } else {
        log("Bullet time stopped before the end.", "error");
        ui.progress.textContent = "";
      }
    },

    deleteFailed(e) {
      toast(e.error, 8000);
      log("The photo could not be deleted.", "error", e.error);
    },
    reorderFailed(e) {
      toast(e.error, 8000);
      log("The photo order could not be changed.", "error", e.error);
    },

    // Reordenar por foto
    // Modo debug: Test shot simples guardado
    debugSaved(e) {
      log("Debug data saved", "ok", e.folder);
      toast("Debug data saved");
    },
    // Test shot com "Match automatically"
    autoMatchProgress(e) {
      csGallery.setHead("Test shot · matching", "Photo " + e.shot + " of up to " + e.shots + " · " + e.stage);
      csGallery.message(e.stage);
      csMatchProgress(e);
    },
    // Cartão cinza: depois da primeira foto, conferir onde está o cartão
    grayCardPick(e) {
      if ($("camSettingsOverlay").classList.contains("hidden")) { window.cancelTest(); return; }  // janela fechada: ninguém para conferir
      csCardShow(e.sessions, e.regions || []);
    },
    // Cartela de cores
    chartPick(e) {
      if ($("camSettingsOverlay").classList.contains("hidden")) { window.cancelTest(); return; }
      csChartShow(e.sessions, e.quads || []);
    },
    chartProgress(e) {
      csGallery.setHead("Chart calibration", "Photo " + e.shot + " of " + e.shots + " · " + e.stage);
      csGallery.message(e.stage);
    },
    chartResult(e) {
      csCardHide();
      const notes = e.notes || [];
      if (e.cancelled) {
        toast("Chart calibration cancelled. The cameras are back to how they were.");
        log("Chart calibration cancelled; camera settings restored", "warn");
        csMatchReturn();
        return;
      }
      const actions = [{ label: "OK", primary: true, onClick: csMatchReturn }];
      if (e.debugFolder) actions.unshift({ label: "Open debug folder", link: true, onClick: () => window.openDebugFolder() });
      if (!e.ok) {
        dialog("Chart calibration did not finish", [e.error || "Try again."].concat(notes).join("\n\n"), actions);
        log("Chart calibration did not finish", "warn", e.error);
        return;
      }
      const parts = [(e.models || []).join("\n\n"),
        "Saved. From now on, Match automatically gives each model these Contrast, Saturation and Color tone differences. Differences under half a step are not changed. All camera settings are back to how they were."];
      if (notes.length) parts.push(notes.join("\n"));
      dialog("Cameras calibrated", parts.join("\n\n"), actions);
      log("Chart calibration saved", "ok");
    },
    autoMatchResult(e) {
      csCardHide();
      const notes = e.notes || [];
      if (e.cancelled) {
        toast("Test shot cancelled. The cameras are back to how they were.");
        log("Match automatically cancelled; camera settings restored", "warn");
        csMatchClose();
        return;
      }
      if (e.review) { csMatchReview(e); return; }
      if (!e.matched) {
        if (!e.ok) toast(e.error || "The photos could not be taken.", 8000);
        if (notes.length) dialog("Not matched automatically", notes.join("\n"), [{ label: "OK", primary: true }]);
        return;
      }
      const changes = e.changes || [];
      const blocks = changes.map((c) => c.camera + "\n" + c.items.map(([what, from, to]) => "   " + what + ":  " + from + "  →  " + to).join("\n"));
      const parts = [];
      if (!e.ok) parts.push(e.error || "Try again.");
      parts.push(blocks.length ? blocks.join("\n\n") : (e.ok ? "The cameras already look alike. Nothing was changed." : "Nothing was changed."));
      if (notes.length) parts.push(notes.join("\n"));
      if (e.ok) parts.push("The photos show the result. Use ← → to compare.");
      const title = !e.ok ? "Matching did not finish" : blocks.length ? "Cameras matched" : "Nothing to change";
      const actions = [{ label: "OK", primary: true }];
      if (e.debugFolder) actions.unshift({ label: "Open debug folder", link: true, onClick: () => window.openDebugFolder() });
      dialog(title, parts.join("\n\n"), actions);
      // Desfazer: as câmeras voltam ao que eram antes do Match; Refazer: ao resultado do Match
      if (blocks.length && csTest.before) {
        const before = csTest.before;
        let after = null;
        recordAction({ label: "Match automatically (" + plural(blocks.length, "camera", "cameras") + ")", camera: true,
          undo: () => { after = csSnapshot(); return csRestore(before); },
          redo: () => (after ? csRestore(after) : false) });
      }
      csTest.before = null;
      if (e.debugFolder) log("Debug data saved", "tech", e.debugFolder);
      log("Match automatically: " + (blocks.length ? plural(blocks.length, "camera", "cameras") + " changed" : "no change"), e.ok ? "ok" : "warn");
    },
    orderPhotos(e) {
      csCardHide();
      if (csTest.capturing && csTest.cancelling) return;  // cancelado: as fotos não são mostradas
      csTest.sessions = e.sessions || [];
      if (csTest.capturing) showCsTest(e.sessions);
      else if (order.open) showOrderPhotos(e.sessions);
    },

    // Atualização
    updateProgress(e) {
      if (upd.state !== "downloading") return;
      const total = e.total || (upd.release.asset && upd.release.asset.size) || 0;
      const pct = total ? Math.min(100, Math.round((e.done * 100) / total)) : 0;
      updEl.bar.style.width = pct + "%";
      updEl.bytes.textContent = mb(e.done) + " of " + mb(total) + " MB";
      updEl.percent.textContent = pct + "%";
    },
    updateReady() {
      upd.state = "installing";
      renderUpdate();
      Promise.resolve(window.installUpdate()).then((res) => {
        if (res && res.ok) return;
        upd.state = "failed";
        upd.error = (res && res.error) || "The update could not be installed.";
        renderUpdate();
      });
    },
    updateFailed(e) {
      upd.state = e.cancelled ? restingState() : "failed";
      upd.error = e.cancelled ? "" : e.error;
      if (!e.cancelled) log("The update did not finish.", "error", e.error);
      renderUpdate();
    },

    // Fotos guardadas
    sessions(e) { setSessions(e.sessions); if (e.project) setProject(e.project); },
    // Lixeira: número de itens e espaço (botão ao lado do projeto); com a janela aberta, relê a lista
    trash(e) { setTrashInfo(e); },  // sessões antes: a janela Project desenha a partir delas
    // Som do disparo (botão da barra de cima e das janelas Live): um ajuste só, do app
    soundChanged(e) { sound = { sound: !!e.sound, sounds: !!e.sounds }; renderSoundBtn(); },
    saving() { activity.saving = true; renderActivity(); },
    exportProgress(e) { showProgress(e); },
    exportFolderError(e) { toast(e.error, 8000, { warn: true }); },
    pitchTestDone(e) {
      if (e.ok) { toast("Pitch test saved: " + e.file.split(/[\\/]/).pop()); log("Pitch test saved", "ok", e.file); }
      else { toast(e.error || "Could not make the pitch test.", 8000, { warn: true }); log("Pitch test failed", "warn", e.error); }
    },
    saveCancelled() {
      if (exp.waiting) exp.waiting = false;  // a janela continua aberta como estava
      else toast("Export cancelled");
    },
    exportConflict(e) {
      const labels = e.names.map((n) => sessionLabel(n).date);
      const one = e.names.length === 1;
      dialog(one ? "This session was already exported here" : "Some sessions were already exported here",
        "The folder " + e.folder + " already has " + (one ? "a folder" : "folders") + " for " + labels.join(", ") + ". " +
        "Keep both exports to a new folder with (2) in the name. Replace deletes everything inside the existing " +
        (one ? "folder" : "folders") + " and keeps only this new export.", [
        { label: "Cancel", onClick: () => window.resolveExportConflict("cancel") },
        { label: "Keep both", onClick: () => window.resolveExportConflict("both") },
        { label: "Replace", danger: true, onClick: () => window.resolveExportConflict("replace") },
      ]);
    },
    saved(e) {
      activity.saving = false;
      $("progressOverlay").classList.add("hidden");
      // Salvo: a janela de salvar fecha. Com erro, continua aberta com o que faltou
      exp.waiting = false;
      if (!e.error) closeExport();
      const saved = (e.sessions || []).filter((name) => sessions.some((s) => s.name === name));
      if (exp.closeWhenDone) {
        // Fechando o app: as salvas saem do app sem perguntar (já estão na pasta escolhida)
        const how = exp.closeWhenDone;
        exp.closeWhenDone = "";
        saved.forEach((name) => window.deleteSession(name));
        const left = sessions.length - saved.length;
        if (how === "stop" || !e.error)
          setTimeout(() => { if (how === "stop" || !left) window.exitApp(false); else confirmExit(left); }, 500);
        saved.length = 0;
      }
      if (e.error) {
        toast(e.error, 8000);
        log(e.error, "error");
      } else {
        const text = "Exported " + plural(e.count, "session", "sessions") + " to " + e.folder;
        toast(text);
        log(text, "ok");
      }
      // Salvas (sem fechar o app): descartar do app ou manter
      if (saved.length) {
        const one = saved.length === 1;
        dialog(one ? "Discard the exported session?" : "Discard the " + saved.length + " exported sessions?",
          (one ? "The session was exported to " : "The sessions were exported to ") + e.folder + ". Discard " + (one ? "it" : "them") +
          " from Stillpoint now, or keep " + (one ? "it" : "them") + " in the app until you close it. The exported copies are not touched.", [
          { label: "Keep until I close" },
          { label: "Discard from app", primary: true, onClick: () => {
            saved.forEach((name) => window.deleteSession(name));
            log("Discarded " + plural(saved.length, "exported session", "exported sessions") + " from the app", "tech");
          } },
        ]);
      }
    },
    confirmExit(e) { confirmExit(e.unsavedSessions); },

    log(e) {
      const text = plainText(e.text);
      if (text) log(text, "tech");
    },
    // Item escolhido no menu do Mac (barra de cima)
    menu(e) { menuAction(e.item); },

    // Uso do computador (rodapé do Activity): resposta do systemStats()
    stats(e) { renderStats(e); },
    // Configurações das câmeras (lidas quando as câmeras mudam ou depois de uma mudança)
    cameraSettings(e) {
      const next = e.cameras || [];
      const same = JSON.stringify(next) === JSON.stringify(camSettings);
      camSettings = next;
      if (same) return;  // releitura sem mudança: nada a redesenhar
      renderCameras();
      if (!$("camSettingsOverlay").classList.contains("hidden")) csRender();
    },
    cameraSettingResult(e) {
      const keys = e.key === "kelvin" || e.key === "wb" ? ["wb", "kelvin"] : [e.key];
      [...csPending].forEach((p) => {
        const [cam, key] = p.split("|");
        if (keys.includes(key) && (e.camera === "*" || cam === e.camera || cam === "*")) csPending.delete(p);
      });
      if (!e.ok) {
        toast(e.error || "A camera did not accept the change.", 8000);
        log("A camera setting was not changed.", "warn", e.error);
      }
      if (!$("camSettingsOverlay").classList.contains("hidden")) csRender();
    },
  };

  window.onCoreEvent = function (event) {
    const handler = handlers[event.type];
    if (handler) handler(event);
  };

  // Sem o menu do botão direito do navegador ("Reload" deixava a janela em branco);
  // nos campos de texto ele continua, para copiar e colar.
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("input, textarea")) e.preventDefault();
  });

  // =================== Atualização (versão nova no GitHub) ===================
  // Ao abrir, o app pergunta ao GitHub qual é a última versão. Se for mais nova,
  // aparece o botão "Update x.y.z" no topo; a janela mostra o que mudou e baixa,
  // confere e instala a versão nova (o app fecha e abre de novo sozinho).
  // var: updateButtons() pode rodar antes desta linha (fica undefined até aqui)
  var upd = {
    info: null,       // do uiReady: versão, sistema, se dá para atualizar pelo app
    release: null,    // { version, page, notes, asset }
    state: "offer",   // offer | manual | downloading | installing | failed
    error: "",
  };
  const updEl = {
    chip: $("updateChip"), chipText: $("updateChipText"), overlay: $("updateOverlay"), title: $("updateTitle"),
    versions: $("updateVersions"), notes: $("updateNotes"), progress: $("updateProgress"), bar: $("updateBar"),
    bytes: $("updateBytes"), percent: $("updatePercent"), hint: $("updateHint"), busyNote: $("updateBusy"),
    actions: $("updateActions"),
  };

  function versionParts(v) { return String(v || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0); }
  function isNewer(a, b) {
    const x = versionParts(a), y = versionParts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  }

  // Itens "- ..." logo abaixo do título "What's new" no texto da versão no GitHub
  function releaseNotes(body) {
    const items = [];
    let inside = false;
    for (const line of String(body || "").split(/\r?\n/)) {
      const t = line.trim();
      if (/^#+\s/.test(t) || /^\*\*[^*]+\*\*:?$/.test(t)) { inside = /what.?s new/i.test(t); continue; }
      if (inside && /^[-*]\s+/.test(t)) items.push(t.replace(/^[-*]\s+/, "").replace(/[*`]/g, "").trim());
      if (items.length >= 6) break;
    }
    return items.filter(Boolean);
  }

  const mb = (bytes) => (bytes / 1048576).toFixed(1);
  const restingState = () => (upd.info && upd.info.canSelfUpdate && upd.release && upd.release.asset ? "offer" : "manual");

  // Não atualiza no meio de um disparo nem enquanto uma câmera conecta
  function updateBlockedReason() {
    if (busy) return "Stillpoint is busy. Update when it finishes.";
    if (cameras.some((c) => c.state === "connecting" && !c.starting)) return "A camera is connecting. Update when it finishes.";
    return "";
  }

  function renderUpdate() {
    const r = upd.release;
    if (!r) return;
    const s = upd.state;
    updEl.title.textContent =
      s === "downloading" ? "Downloading the update"
      : s === "installing" ? "Installing the update"
      : s === "failed" ? "The update did not finish"
      : "Stillpoint " + r.version + " is available";

    const strong = (text) => { const b = document.createElement("b"); b.textContent = text; return b; };
    updEl.versions.innerHTML = "";
    if (s === "downloading" || s === "installing") updEl.versions.append("Stillpoint ", strong(r.version));
    else updEl.versions.append("You have ", strong(upd.info.version), "  →  new ", strong(r.version));

    updEl.notes.innerHTML = "";
    r.notes.forEach((n) => { const li = document.createElement("li"); li.textContent = n; updEl.notes.appendChild(li); });
    updEl.notes.classList.toggle("hidden", !((s === "offer" || s === "manual") && r.notes.length));
    updEl.progress.classList.toggle("hidden", s !== "downloading");

    updEl.hint.textContent =
      s === "offer" ? "Stillpoint closes, installs the update and opens again. Your sessions stay saved."
      : s === "manual" ? ((upd.info.selfUpdateReason ? upd.info.selfUpdateReason + " " : "") + "Download the new version from its release page.")
      : s === "installing" ? (upd.info.os === "windows"
          ? "Stillpoint closes now. Allow the installer if Windows asks; Stillpoint opens again when it finishes."
          : "Stillpoint closes now and opens again in a moment.")
      : s === "failed" ? upd.error
      : "";
    updEl.hint.classList.toggle("error", s === "failed");
    updEl.hint.classList.toggle("hidden", !updEl.hint.textContent);

    const blocked = s === "offer" || s === "failed" ? updateBlockedReason() : "";
    updEl.busyNote.textContent = blocked ? "● " + blocked : "";
    updEl.busyNote.classList.toggle("hidden", !blocked);

    updEl.actions.innerHTML = "";
    const add = (label, kind, onClick, disabled) => {
      const b = document.createElement("button");
      b.className = "btn " + kind;
      b.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener("click", onClick);
      updEl.actions.appendChild(b);
    };
    const openPage = () => { window.openUrl(r.page); closeUpdate(); };
    if (s === "offer") {
      add("Later", "btn-secondary", closeUpdate);
      add("Update now", "btn-primary", startUpdate, !!blocked);
    } else if (s === "manual") {
      add("Later", "btn-secondary", closeUpdate);
      add("Open download page", "btn-primary", openPage);
    } else if (s === "downloading") {
      add("Cancel", "btn-secondary", () => window.cancelUpdate());
    } else if (s === "failed") {
      add("Open download page", "btn-secondary", openPage);
      if (r.asset && upd.info.canSelfUpdate) add("Try again", "btn-primary", startUpdate, !!blocked);
    }
  }

  function openUpdate() {
    if (!upd.release) return;
    renderUpdate();
    updEl.overlay.classList.remove("hidden");
  }
  function closeUpdate() {
    if (upd.state === "downloading" || upd.state === "installing") return;
    if (upd.state === "failed") upd.state = restingState();
    updEl.overlay.classList.add("hidden");
  }

  function startUpdate() {
    const a = upd.release.asset;
    if (!a || updateBlockedReason()) return renderUpdate();
    upd.state = "downloading";
    updEl.bar.style.width = "0%";
    updEl.bytes.textContent = "0.0 of " + mb(a.size) + " MB";
    updEl.percent.textContent = "0%";
    renderUpdate();
    log("Downloading Stillpoint " + upd.release.version);
    Promise.resolve(window.downloadUpdate(a.url, a.digest || "", a.name, String(a.size))).then((res) => {
      if (res && res.ok) return;
      upd.state = "failed";
      upd.error = "The download could not start. Try again.";
      renderUpdate();
    });
  }

  // manual: pedido pelo menu ("Check for updates"); responde mesmo sem versão nova
  function checkForUpdate(manual) {
    if (!upd.info || (!manual && !upd.info.checkUpdates)) return;
    // Já achou uma versão nova: mostra de novo. Se ela ainda não tinha o arquivo deste
    // sistema (publicado num segundo momento), procura outra vez.
    if (manual && upd.release && upd.release.asset) { openUpdate(); return; }
    if (manual) toast("Checking for updates…");
    const answer = (title, text) => {
      if (!manual) return;
      hideToast();
      dialog(title, text, [{ label: "OK", primary: true }]);
    };
    const failed = () => answer("Could not check for updates", "Stillpoint could not reach GitHub. Check the internet connection and try again.");
    Promise.resolve(window.checkForUpdate()).then((text) => {
      if (!text) return failed();  // sem internet ou GitHub fora: na abertura, segue sem avisar
      let rel;
      try { rel = JSON.parse(text); } catch (e) { return failed(); }
      if (!rel || rel.draft || rel.prerelease || !rel.tag_name) return failed();
      const version = rel.tag_name.replace(/^v/i, "");
      if (!isNewer(version, upd.info.version))
        return answer("Stillpoint is up to date", "You have the latest version, " + upd.info.version + ".");
      const suffix = upd.info.os === "windows" ? "-windows-x64-setup.exe" : "-macos-arm64.dmg";
      const asset = (rel.assets || []).find((x) => x.name && x.name.endsWith(suffix));
      upd.release = {
        version: version,
        page: rel.html_url,
        notes: releaseNotes(rel.body),
        asset: asset ? { url: asset.browser_download_url, size: asset.size, digest: asset.digest, name: asset.name } : null,
      };
      upd.state = restingState();
      updEl.chipText.textContent = "Update " + version;
      updEl.chip.classList.remove("hidden");
      log("Stillpoint " + version + " is available", "ok");
      if (manual) { hideToast(); openUpdate(); }
    });
  }
  updEl.chip.addEventListener("click", openUpdate);

  // =================== Menu do app, About e Settings ===================
  // Mac: os itens vêm do menu do sistema, na barra de cima (evento "menu").
  // Windows: botão no canto da barra do app, com os mesmos itens.
  const REPO_PAGE = "https://github.com/astronaut954/stillpoint-bullet-time-photography";
  const menuEl = { btn: $("menuBtn"), list: $("appMenu") };
  menuEl.btn.innerHTML = icon("menu");

  function setMenuOpen(open) {
    menuEl.list.classList.toggle("hidden", !open);
    menuEl.btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function menuAction(item) {
    setMenuOpen(false);
    const version = (upd.info && upd.info.version) || "";
    if (item === "about") openAbout();
    else if (item === "updates") checkForUpdate(true);
    else if (item === "settings") openSettings();
    else if (item === "help") window.openUrl(REPO_PAGE + "#how-to-use");
    else if (item === "cameras") window.openUrl(REPO_PAGE + "#compatibility");
    else if (item === "whatsnew") window.openUrl(REPO_PAGE + (version ? "/releases/tag/v" + version : "/releases"));
    else if (item === "report") window.openUrl(REPO_PAGE + "/issues/new");
  }

  menuEl.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenuOpen(menuEl.list.classList.contains("hidden"));
  });
  menuEl.list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-item]");
    if (b) menuAction(b.dataset.item);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".app-menu-wrap")) setMenuOpen(false); });

  // About
  function openAbout() {
    $("aboutVersion").textContent = upd.info && upd.info.version ? "Version " + upd.info.version : "";
    $("aboutOverlay").classList.remove("hidden");
  }
  $("aboutClose").addEventListener("click", () => $("aboutOverlay").classList.add("hidden"));
  $("aboutLicenses").addEventListener("click", () => window.openUrl(REPO_PAGE + "/blob/main/THIRD_PARTY_NOTICES.md"));
  $("aboutGithub").addEventListener("click", () => window.openUrl(REPO_PAGE));

  // Settings: tema e idioma. Gravados na hora; valem ao abrir o app de novo.
  const prefs = { theme: "", language: "", restart: false, debug: false };
  // tab (opcional): "general" | "projects" | "export" | "adobe" | "advanced"; sem tab abre em General
  function openSettings(tab) {
    if (!upd.info) return;
    if (!prefs.theme) { prefs.theme = upd.info.theme; prefs.language = upd.info.language; prefs.debug = !!upd.info.debug; }
    renderSettings();
    refreshDebugSize();
    refreshProjectsFolder();
    settingsTab(tab || "general");
    $("settingsOverlay").classList.remove("hidden");
    refreshAdobe();
  }
  // Abas do Settings (etapa 20): no desenho das abas do Export
  function settingsTab(tab) {
    document.querySelectorAll("#settingsTabs .export-tab").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("#settingsOverlay .settings-pane").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== tab));
  }
  // Abrir a aba "Lightroom & Photoshop" procura os programas de novo (instalados ou tirados com o app aberto)
  document.querySelectorAll("#settingsTabs .export-tab").forEach((b) => b.addEventListener("click", () => { settingsTab(b.dataset.tab); if (b.dataset.tab === "adobe") refreshAdobe(); }));
  // Settings › Lightroom & Photoshop: os programas achados, o plugin e o catálogo
  const adobe = { info: null };
  function refreshAdobe() {
    if (typeof window.adobeInfo !== "function") { renderAdobeSettings(); return; }
    Promise.resolve(window.adobeInfo()).then((r) => { adobe.info = r || null; renderAdobeSettings(); }, () => {});
  }
  function renderAdobeSettings() {
    const i = adobe.info;
    const status = (id, parts) => { const x = $(id); x.innerHTML = ""; parts.forEach((p) => x.appendChild(p)); };
    const dot = (ok, text) => { const sp = el("span", ok ? "lr-ok" : "lr-bad"); sp.appendChild(el("span", "lr-dot", "●")); sp.appendChild(document.createTextNode(text)); return sp; };
    if (!i) {
      status("settingsLrStatus", [el("span", "", "This build cannot use Lightroom Classic yet. Build the app again.")]);
      status("settingsLrButtons", []); status("settingsPsStatus", []); status("settingsPsButtons", []);
      $("settingsLrCatalog").innerHTML = "";
      return;
    }
    const lr = i.lightroom || {}, ps = i.photoshop || {}, pl = i.plugin || {};
    const lrParts = [];
    if (!lr.found) lrParts.push(dot(false, "Not found"));
    else if (lr.tooOld) lrParts.push(dot(false, "Found: Lightroom Classic " + lr.version + ", too old (needs " + lr.minimum + " or newer)"));
    else lrParts.push(dot(true, "Found: Lightroom Classic " + (lr.version || "")));
    const short = (v) => String(v || "").split("+")[0];  // "2.17.0+1a2b3c4d" -> "2.17.0" (o código só serve para trocar o plugin)
    if (lr.found) lrParts.push(el("span", "", "· " + (!pl.installed ? "Stillpoint plugin not installed yet (it installs the first time you use Edit in Lightroom Classic)"
      : pl.upToDate ? "Stillpoint plugin " + short(pl.version) + ", up to date" : "Stillpoint plugin " + short(pl.version) + ", updates the next time you use it")));
    if (lr.found && lr.path) lrParts[0].title = lr.path;
    status("settingsLrStatus", lrParts);
    const lrBtns = [];
    if (lr.found) lrBtns.push(button(pl.installed ? "Reinstall plugin" : "Install plugin", () => {
      Promise.resolve(window.adobeInstallPlugin()).then((x) => {
        if (x && x.info) adobe.info = x.info;
        renderAdobeSettings();
        if (x && x.ok) { toast("Stillpoint plugin installed. If Lightroom Classic is open, quit it and open it again."); log("Lightroom plugin installed in " + x.folder, "ok"); }
        else dialog("Could not install the Stillpoint plugin", (x && x.error) || "The plugin could not be copied.", [{ label: "OK", primary: true }]);
      });
    }, { title: "Copy the Stillpoint plugin to the Lightroom Classic plugin folder again" }));
    lrBtns.push(button("Locate…", () => locateAdobe("lightroom"), { title: "Choose where Lightroom Classic is on this computer" }));
    if (!lr.found) lrBtns.push(button("Get Lightroom Classic", () => window.adobeGetApp("lightroom"), { kind: "btn-link" }));
    status("settingsLrButtons", lrBtns);
    $("settingsLrCatalog").innerHTML = "";
    $("settingsLrCatalog").appendChild(segmented([["open", "The open catalog"], ["project", "One catalog per project"]], i.catalog || "project", (v) => {
      Promise.resolve(window.adobeSetCatalog(v)).then((x) => { if (x) adobe.info = x; renderAdobeSettings(); log("Lightroom catalog: " + (v === "project" ? "one per project" : "the open catalog"), "tech"); });
    }));
    status("settingsPsStatus", [ps.found ? dot(true, "Found: Photoshop " + (ps.version || "")) : dot(false, "Not found")]);
    const psBtns = [button("Locate…", () => locateAdobe("photoshop"), { title: "Choose where Photoshop is on this computer" })];
    if (!ps.found) psBtns.push(button("Get Photoshop", () => window.adobeGetApp("photoshop"), { kind: "btn-link" }));
    status("settingsPsButtons", psBtns);
  }
  function renderSettings() {
    const info = upd.info;
    renderProjectsFolder();
    const themes = (info.themes && info.themes.length) ? info.themes : [{ id: info.theme, name: info.theme }];
    const languages = (info.languages && info.languages.length) ? info.languages : [{ id: info.language, name: info.language }];
    $("settingsThemes").innerHTML = "";
    $("settingsThemes").appendChild(segmented(themes.map((t) => [t.id, t.name]), prefs.theme, (v) => saveSettings(v, prefs.language)));
    $("settingsLanguages").innerHTML = "";
    $("settingsLanguages").appendChild(segmented(languages.map((l) => [l.id, l.name]), prefs.language, (v) => saveSettings(prefs.theme, v)));
    $("settingsRestart").classList.toggle("hidden", !prefs.restart);
    // Abertura: vale da próxima vez que o app abrir
    $("settingsSplash").innerHTML = "";
    $("settingsSplash").appendChild(segmented([["on", "On"], ["off", "Off"]], startPrefs.splash ? "on" : "off", (v) => {
      startPrefs.splash = v === "on";
      Promise.resolve(window.savePref("splash", v)).then(() => log("Opening animation " + v, "tech"));
      renderSettings();
    }));
    // Lenticular (Parte 4 da Proporção): cor da faixa do Placement Fit, igual para todas as sessões
    if ($("settingsLentBand")) {
      $("settingsLentBand").innerHTML = "";
      $("settingsLentBand").appendChild(segmented([["black", "Black"], ["white", "White"]], lentBand, (v) => {
        const before = lentBand;
        if (v === before) return;
        setLentBand(v);
        recordAction({ label: "Lenticular band: " + v, undo: () => setLentBand(before), redo: () => setLentBand(v) });
      }));
    }
    // Modo debug: vale na hora
    $("settingsDebug").innerHTML = "";
    $("settingsDebug").appendChild(segmented([["off", "Off"], ["on", "On"]], prefs.debug ? "on" : "off", (v) => {
      // App compilado antes do modo debug existir (página nova com o programa antigo)
      if (typeof window.setDebugMode !== "function") { toast("This build has no debug mode yet. Build the app again.", 8000); return; }
      Promise.resolve(window.setDebugMode(v === "on")).then((r) => {
        if (!r || !r.ok) { toast("Could not save the settings"); return; }
        prefs.debug = !!r.debug;
        log("Debug mode " + (prefs.debug ? "on" : "off"), "tech");
        renderSettings();
        showDebugSize(r);
      });
    }));
  }
  function setLentBand(v) {
    lentBand = v;
    Promise.resolve(window.savePref("lentBand", v)).then(() => log("Lenticular band: " + v, "tech"));
    if (!$("settingsOverlay").classList.contains("hidden")) renderSettings();
    if (!$("exportOverlay").classList.contains("hidden")) renderExport();
  }
  $("settingsDebugFolder").addEventListener("click", () => window.openDebugFolder());
  // Espaço ocupado pelos dados de debug
  function sizeText(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " bytes";
  }
  function showDebugSize(r) {
    const bytes = r && typeof r.bytes === "number" ? r.bytes : null;
    $("settingsDebugSize").textContent = bytes === null ? "" : bytes > 0 ? "Debug data: " + sizeText(bytes) : "No debug data saved.";
    $("settingsDebugDelete").classList.toggle("hidden", !bytes);
  }
  function refreshDebugSize() {
    if (typeof window.debugInfo !== "function") { showDebugSize(null); return; }
    Promise.resolve(window.debugInfo()).then(showDebugSize);
  }
  $("settingsDebugDelete").addEventListener("click", () => {
    dialog("Delete debug data?", "Deletes the photos and reports saved by debug mode. Your sessions are not touched.", [
      { label: "Cancel" },
      { label: "Delete", danger: true, onClick: () => {
        Promise.resolve(window.deleteDebugData()).then((r) => {
          showDebugSize(r);
          if (r && r.bytes > 0) toast("Some debug files could not be deleted");
          else { toast("Debug data deleted"); log("Debug data deleted", "tech"); }
        });
      } },
    ]);
  });
  function saveSettings(theme, language) {
    if (theme === prefs.theme && language === prefs.language) return;
    Promise.resolve(window.saveSettings(theme, language)).then((r) => {
      if (!r || !r.ok) { toast("Could not save the settings"); return; }
      log("Settings: theme " + theme + ", language " + language + (r.restart ? " (applies after restart)" : ""), "ok");
      prefs.theme = theme;
      prefs.language = language;
      prefs.restart = !!r.restart;
      renderSettings();
    });
  }
  $("settingsDone").addEventListener("click", () => $("settingsOverlay").classList.add("hidden"));
  $("settingsRestartBtn").addEventListener("click", () => {
    const reason = updateBlockedReason();
    if (reason) { toast(reason.replace("Update", "Restart")); return; }
    restartApp();
  });

  // =================== Camera settings ===================
  // ISO, velocidade, abertura... de cada câmera, lidos da própria câmera e mudados na
  // hora. "All cameras" muda em todas as que dá para ajustar. Cada lista só tem os
  // valores que aquela câmera aceita agora.
  // Quality fica no popover "±" (com o Picture Style) e o Focus vira etiqueta ao lado do nome:
  // a tabela cabe sem rolagem lateral (decisão do dono, 2026-10-30)
  // Na tabela, o que define a captura (ISO, Shutter, Aperture, Exp. comp., Metering, Format, Aspect ratio);
  // a cor (White balance, WB fine-tune, Picture Style e os ajustes dele) fica no painel "Color" (botão ±)
  // (reorganização pedida pelo dono, 2026-11-02)
  const CS_COLS = [["iso", "ISO"], ["tv", "Shutter"], ["av", "Aperture"], ["expcomp", "Exp. comp."], ["metering", "Metering"],
    ["quality", "Format"], ["aspect", "Ratio"], ["color", "Color"]];
  const CS_NAMES = { quality: "Format", aspect: "Aspect ratio", wb: "White balance", style: "Picture Style", focus: "Focus", kelvin: "Color temperature", shiftab: "WB fine-tune A/B", shiftgm: "WB fine-tune G/M" };
  // Configurações que ficam no painel "Color" (botão ±), fora das colunas
  const CS_POP_KEYS = [["wb"], ["shift"], ["style"]];
  const isoText = (l) => String(l).replace(/^ISO\s+/i, "");  // "ISO 400" → "400": o cabeçalho já diz ISO
  // Disparo único (o app põe sozinho; não é escolha). Único silencioso também vale.
  const isSingleShot = (v) => v === 0x00 || v === 0x06 || v === 0x13;
  const KELVINS = [];
  for (let k = 2800; k <= 10000; k += 100) KELVINS.push(k);
  const shiftLabel = (v, neg, pos) => (v === 0 ? "0" : (v < 0 ? neg : pos) + Math.abs(v));

  // Valor para comparar entre câmeras (null = a câmera não tem)
  function csLabel(c, key) {
    if (key === "shift") return c.shiftAvailable ? c.shiftAB + "/" + c.shiftGM : null;
    const st = c.settings && c.settings[key];
    if (!st || !st.available) return null;
    if (key === "wb" && st.value === 9) return "K" + c.kelvin;
    return st.label;
  }
  // Valor mais comum de cada configuração entre as câmeras ajustáveis (empate: a primeira na ordem)
  function csReference() {
    const ref = {};
    const cams = camSettings.filter((c) => c.adjustable);
    CS_COLS.concat(CS_POP_KEYS).forEach(([k]) => {  // wb e style: no painel ±, mas contam como diferença
      if (k === "focus" || k === "shift" || k === "color") return;  // ajuste fino: correção por câmera, diferente de propósito
      const counts = new Map();
      cams.forEach((c) => { const l = csLabel(c, k); if (l !== null) counts.set(l, (counts.get(l) || 0) + 1); });
      let best = null, n = 0;
      counts.forEach((v, l) => { if (v > n) { n = v; best = l; } });
      ref[k] = counts.size > 1 ? best : null;  // null: todas iguais (nada a marcar)
    });
    return ref;
  }
  // Ajustes do Picture Style (contraste, saturação, tom): diferente do mais comum entre as câmeras
  // Cada opção do ± (Contrast, Saturation, Color tone): o valor mais comum, ou null se é
  // igual em todas as câmeras
  // Calibração com a cartela: quantos passos este modelo anda de propósito em relação ao
  // modelo mais comum (essa diferença não conta como "diferente")
  function csChartAdjust(c, f) {
    if (!c.chart) return 0;
    const cams = camSettings.filter((x) => x.adjustable && x.styleDetail);
    const count = {};
    cams.forEach((x) => { count[x.model] = (count[x.model] || 0) + 1; });
    let common = null;
    cams.forEach((x) => { if (x.chart && (!common || count[x.model] > count[common.model])) common = x; });
    if (!common || common.model === c.model) return 0;
    return Math.round(c.chart[f] - common.chart[f]);
  }
  const csStyleValue = (c, f) => c[f] - csChartAdjust(c, f);
  function csStyleDetailRefs() {
    const cams = camSettings.filter((c) => c.adjustable && c.styleDetail);
    const out = {};
    STYLE_DETAILS.forEach(([, , f]) => {
      const counts = new Map();
      cams.forEach((c) => counts.set(csStyleValue(c, f), (counts.get(csStyleValue(c, f)) || 0) + 1));
      let best = null, n = 0;
      counts.forEach((v, k) => { if (v > n) { n = v; best = k; } });
      out[f] = counts.size > 1 ? best : null;
    });
    return out;
  }
  // "" = igual às outras; "partial" = só algumas opções do ± diferentes; "diff" = todas
  function csStyleDetailLevel(c) {
    if (!c.styleDetail) return "";
    const refs = csStyleDetailRefs();
    const n = STYLE_DETAILS.filter(([, , f]) => refs[f] !== null && csStyleValue(c, f) !== refs[f]).length;
    return n === 0 ? "" : n === STYLE_DETAILS.length ? "diff" : "partial";
  }
  const csStyleDetailDiffers = (c) => csStyleDetailLevel(c) !== "";
  const csDiffers = (c, k, ref) => ref[k] !== null && ref[k] !== undefined && csLabel(c, k) !== null && csLabel(c, k) !== ref[k];

  // Aviso no painel Cameras
  function cameraSettingsTag(name) {
    const c = camSettings.find((x) => x.camera === name);
    if (!c) return null;
    const drive = c.settings && c.settings.drive;
    if (drive && drive.available && !isSingleShot(drive.value))
      return { cls: "diff", text: "Not on single shot", title: "The camera is on " + drive.label + " and did not accept single shooting. Set it to single shooting on the camera." };
    if (!c.adjustable) return { cls: "locked", text: "Settings on the camera only", title: c.reason };
    const ref = csReference();
    if (CS_COLS.concat(CS_POP_KEYS).some(([k]) => k !== "focus" && k !== "color" && csDiffers(c, k, ref)) || csStyleDetailDiffers(c)) return { cls: "diff", text: "Settings differ", title: "Open Camera settings to match the cameras." };
    return null;
  }

  function csSelect(options, current, onPick, extraClass) {
    const sel = document.createElement("select");
    sel.className = "cs-sel" + (extraClass ? " " + extraClass : "");
    options.forEach(([value, label, disabled]) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      if (disabled) o.disabled = true;
      sel.appendChild(o);
    });
    sel.value = current;
    sel.addEventListener("change", () => onPick(sel.value));
    appSelect(sel);
    return sel;
  }
  // ---- Teclado: Tab passa por todos os controles (no Mac o WebKit só passa pelos campos de texto,
  // a não ser que a navegação por teclado esteja ligada no sistema) e fica dentro da janela aberta
  function focusables(scope) {
    return [...scope.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter((x) =>
      !x.disabled && x.tabIndex >= 0 && x.getClientRects().length > 0 && getComputedStyle(x).visibility !== "hidden" && !x.closest(".hidden"));
  }
  function tabScope() {
    const open = [...document.querySelectorAll(".overlay:not(.hidden)")].filter((o) => o.getClientRects().length > 0);
    // Sessão em tela cheia: o Tab fica nela
    const full = document.querySelector(".sessions-panel.fullscreen");
    if (!open.length && full) return full;
    if (!open.length) return ui.log.classList.contains("expanded") ? ui.log : document.body;  // Activity aberto: só ele
    const top = open.reduce((t, o) => ((parseInt(getComputedStyle(o).zIndex, 10) || 0) >= (parseInt(getComputedStyle(t).zIndex, 10) || 0) ? o : t));
    // Camera settings: a janela Match automatically (ou a conferência do cartão cinza) por cima da tabela fica com o Tab
    if (top.id === "camSettingsOverlay")
      for (const id of ["csCardPick", "csMatch"]) { const w = $(id); if (w && !w.classList.contains("hidden")) return w; }
    return top;
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (selectMenu) closeSelectMenu();  // lista aberta: fecha e segue para o próximo
    // Menu aberto (ex.: o do projeto): o Tab fecha o menu e segue a partir do botão que o abriu
    let fromMenu = null;
    if (openMenu) { fromMenu = openMenu.anchor && openMenu.anchor.isConnected ? openMenu.anchor : null; closeMenu(); }
    const scope = tabScope();
    const list = focusables(scope);
    if (!list.length) return;
    e.preventDefault();
    document.documentElement.classList.add("kbd-focus");
    let a = fromMenu || document.activeElement;
    // Dentro da caixa do ±: o Tab sai dela e segue a partir do botão ± (a caixa fecha)
    const pop = $("csStylePop");
    if (pop && pop.contains(a) && csStylePop) a = document.querySelector('.cs-more[data-style-cam="' + csStylePop.camera + '"]') || a;
    let i = list.indexOf(a);
    let next;
    if (i >= 0) next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
    else if (a && a !== document.body && scope.contains(a)) {
      // Fora da ordem do Tab (ex.: linha de uma câmera): segue a partir dele, na ordem da tela
      const after = list.filter((x) => a.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
      const before = list.filter((x) => a.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING);
      next = e.shiftKey ? (before[before.length - 1] || list[list.length - 1]) : (after[0] || list[0]);
    } else next = e.shiftKey ? list[list.length - 1] : list[0];
    next.focus();
  }, true);
  // Enter/Espaço num controle que redesenha a tela (modos de disparo, formatos do Save sessions…)
  // ou que fica desligado (ex.: Unselect all): o foco volta para o mesmo controle redesenhado (mesmo
  // nome) ou, se ele não existir mais, para o que ficou no mesmo lugar da ordem do Tab
  const focusSig = (x) => {
    const lab = x.tagName === "INPUT" && x.closest("label");
    return [x.tagName, x.type || "", x.getAttribute("aria-label") || "", x.title || "",
            x.tagName === "INPUT" ? (lab ? lab.textContent.trim().slice(0, 60) : "") : (x.textContent || "").trim().slice(0, 60)].join("|");
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const a = document.activeElement;
    if (!a || a === document.body) return;
    const before = focusables(tabScope());
    const at = before.indexOf(a);
    if (at < 0) return;
    const sig = focusSig(a), nth = before.filter((x) => focusSig(x) === sig).indexOf(a);
    const kindA = a.tagName + "|" + (a.type || "") + "|" + [...a.classList].filter((c) => c !== "on" && c !== "current").sort().join(".");
    const fix = () => {
      const now = document.activeElement;
      if (now && now !== document.body && now !== a) return;            // o foco já foi para outro lugar de propósito
      const list = focusables(tabScope());
      if (now === a && list.includes(a)) return;                          // continua onde estava
      const same = list.filter((x) => focusSig(x) === sig);
      // Sem o mesmo nome (ex.: o título mudou com o estado): o do mesmo tipo mais perto do lugar de antes
      const kind = (x) => x.tagName + "|" + (x.type || "") + "|" + [...x.classList].filter((c) => c !== "on" && c !== "current").sort().join(".");
      const alike = list.filter((x) => kind(x) === kindA);
      const near = alike.length ? alike.reduce((best, x) => Math.abs(list.indexOf(x) - at) < Math.abs(list.indexOf(best) - at) ? x : best) : null;
      const t = same[nth] || near || list[Math.min(at, list.length - 1)];
      if (t) t.focus({ preventScroll: true });
    };
    setTimeout(fix, 0); setTimeout(fix, 150); setTimeout(fix, 400);
  }, true);
  // Rede de segurança (teclado): se a tela for redesenhada a qualquer momento (não só logo depois do
  // Enter — no Mac, alguns redesenhos chegam depois) e o foco cair no nada, volta para o mesmo
  // controle redesenhado, na mesma janela
  let lastFocus = null;
  const focusKind = (x) => x.tagName + "|" + (x.type || "") + "|" + [...x.classList].filter((c) => c !== "on" && c !== "current").sort().join(".");
  document.addEventListener("focusin", (e) => {
    const x = e.target;
    if (!x || x === document.body || !x.tagName) return;
    const scope = tabScope(), list = focusables(scope);
    const at = list.indexOf(x);
    if (at < 0) return;
    const sig = focusSig(x);
    lastFocus = { el: x, scope, at, sig, nth: list.filter((y) => focusSig(y) === sig).indexOf(x), kind: focusKind(x) };
  });
  setInterval(() => {
    if (!lastFocus || !document.documentElement.classList.contains("kbd-focus")) return;
    const now = document.activeElement;
    if (now && now !== document.body) return;
    const f = lastFocus;
    if (tabScope() !== f.scope || !f.scope.isConnected) { lastFocus = null; return; }  // outra janela por cima / janela fechada
    const list = focusables(f.scope);
    if (f.el.isConnected && list.includes(f.el)) { f.el.focus({ preventScroll: true }); return; }
    const same = list.filter((x) => focusSig(x) === f.sig);
    const alike = list.filter((x) => focusKind(x) === f.kind);
    const near = alike.length ? alike.reduce((b, x) => Math.abs(list.indexOf(x) - f.at) < Math.abs(list.indexOf(b) - f.at) ? x : b) : null;
    const t = same[f.nth] || same[0] || near || list[Math.min(f.at, list.length - 1)];
    if (t) t.focus({ preventScroll: true });
  }, 200);
  // Enter numa caixa de marcar: marca/desmarca (o Mac só faz isso com o Espaço)
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !t || t.tagName !== "INPUT" || (t.type !== "checkbox" && t.type !== "radio")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    t.click();
  }, true);
  // Mouse de volta: some o contorno de foco do teclado
  document.addEventListener("mousedown", () => document.documentElement.classList.remove("kbd-focus"), true);

  // Lista de opções do app no lugar da do sistema (que no Mac e no Windows tem outra cara).
  // O <select> continua por baixo: valor, "change" e teclado de foco funcionam como antes.
  let selectMenu = null;
  function closeSelectMenu() {
    if (!selectMenu) return;
    const m = selectMenu; selectMenu = null;
    m.sel.classList.remove("open");
    m.remove();
    if (csRenderLater) setTimeout(() => { if (csRenderLater && !$("camSettingsOverlay").classList.contains("hidden")) csRender(); }, 0);
  }
  function appSelect(sel) {
    const open = () => {
      closeMenu();
      const opts = [...sel.options];
      const m = el("div", "app-menu project-menu select-menu");
      m.setAttribute("role", "listbox");
      m.sel = sel;
      m.inPop = !!sel.closest("#csStylePop");  // (a caixa do ± pode ser redesenhada antes do clique chegar ao documento)
      const buttons = opts.map((o) => {
        const b = el("button", o.value === sel.value ? "current" : "", o.textContent);
        b.type = "button";
        b.setAttribute("role", "option");
        if (o.disabled) b.disabled = true;
        b.addEventListener("click", () => {
          closeSelectMenu();
          sel.focus();
          // Escolher costuma redesenhar a tela (a caixa é trocada por uma nova): o foco volta para a
          // caixa que ficou no mesmo lugar, para o próximo Tab seguir dali
          // (na caixa do ±, a posição é contada só entre as listas dela, que é redesenhada sozinha)
          const inPop = !!sel.closest("#csStylePop");
          const listNow = () => inPop ? ($("csStylePop") ? [...$("csStylePop").querySelectorAll("select")] : []) : focusables(tabScope());
          const at = listNow().indexOf(sel);
          if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
          const refocus = () => { if (!sel.isConnected && at >= 0) { const list = listNow(); const t = list[Math.min(at, list.length - 1)]; if (t) t.focus({ preventScroll: true }); } };
          refocus(); setTimeout(refocus, 0); setTimeout(refocus, 120);
        });
        m.appendChild(b);
        return b;
      });
      document.body.appendChild(m);
      const r = sel.getBoundingClientRect();
      m.style.minWidth = Math.round(r.width) + "px";
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const down = below >= Math.min(m.offsetHeight, 240) || below >= above;
      m.style.maxHeight = Math.max(120, Math.floor(down ? below : above) - 4) + "px";
      m.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8))) + "px";
      m.style.top = Math.round(down ? r.bottom + 4 : r.top - 4 - m.offsetHeight) + "px";
      const cur = buttons.find((b) => b.classList.contains("current")) || buttons.find((b) => !b.disabled);
      // Destaque do teclado: uma marca na opção (o foco fica na caixa; no Mac o foco nos botões da
      // lista não funcionava e as setas iam para a lista do sistema)
      m.buttons = buttons;
      m.mark = (b) => { buttons.forEach((x) => x.classList.toggle("kbd", x === b)); m.active = b; if (b) b.scrollIntoView({ block: "nearest" }); };
      if (cur) { cur.scrollIntoView({ block: "center" }); m.mark(cur); }
      buttons.forEach((b) => b.addEventListener("mouseenter", () => { if (!b.disabled) m.mark(b); }));
      sel.classList.add("open");
      selectMenu = m;
    };
    sel.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || sel.disabled) return;
      e.preventDefault();
      if (sel.justClosed) return;  // o clique que fechou a lista não a abre de novo
      sel.focus();
      open();
    });
    sel.appMenu = open;  // as teclas são tratadas na captura (antes do Mac abrir a lista dele)
  }
  // Lista do app aberta: ↑ ↓ (e Home/End) andam, Enter ou Espaço escolhem; na captura, antes de
  // qualquer outro tratador (o do Camera settings parava as teclas) e sem deixar a lista do Mac abrir
  document.addEventListener("keydown", (e) => {
    if (!selectMenu) return;
    const m = selectMenu, live = m.buttons.filter((b) => !b.disabled);
    const i = live.indexOf(m.active);
    const nav = { ArrowDown: 1, Down: 1, ArrowUp: -1, Up: -1, PageDown: 8, PageUp: -8 };
    if (e.key in nav || e.key === "Home" || e.key === "End") {
      e.preventDefault(); e.stopImmediatePropagation();
      const j = e.key === "Home" ? 0 : e.key === "End" ? live.length - 1 : Math.max(0, Math.min(live.length - 1, (i < 0 ? 0 : i + nav[e.key])));
      m.mark(live[j]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); e.stopImmediatePropagation();
      if (m.active) m.active.click(); else closeSelectMenu();
    }
  }, true);
  document.addEventListener("keypress", (e) => { if (selectMenu && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // Setas, Espaço e Enter numa lista do app abrem a lista do app; na captura e sem deixar seguir,
  // para o WebKit do Mac não abrir a lista dele
  ["keydown", "keypress"].forEach((type) => document.addEventListener(type, (e) => {
    const sel = e.target;
    if (!sel || sel.tagName !== "SELECT" || !sel.appMenu || selectMenu) return;
    const inTable = !!sel.closest("table.cs, #csStylePop");
    const arrow = e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Down" || e.key === "Up";
    if (arrow && inTable) { e.preventDefault(); return; }  // tabela do Camera settings: as setas trocam de câmera (outro tratador)
    if (e.key === " " || e.key === "Enter" || arrow) {
      e.preventDefault(); e.stopPropagation();
      if (type === "keydown") sel.appMenu();
    }
  }, true));
  // Fora da lista: fecha (no próprio menu de escolha, marca para o mesmo clique não reabrir)
  document.addEventListener("pointerdown", (e) => {
    if (!selectMenu || selectMenu.contains(e.target)) return;
    const s = selectMenu.sel;
    if (e.target === s) { s.justClosed = true; setTimeout(() => { s.justClosed = false; }, 0); }
    closeSelectMenu();
  }, true);
  // Esc fecha só a lista (não a janela de baixo)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectMenu) { e.preventDefault(); e.stopImmediatePropagation(); const s = selectMenu.sel; closeSelectMenu(); s.focus(); }
  }, true);
  window.addEventListener("resize", () => closeSelectMenu());
  document.addEventListener("scroll", (e) => { if (selectMenu && !selectMenu.contains(e.target)) closeSelectMenu(); }, true);
  function csText(text, cls, title) {
    const v = el("span", "cs-val" + (cls ? " " + cls : ""), text);
    if (title) v.title = title;
    return v;
  }
  let csRecord = true;  // false enquanto um Desfazer/Copy aplica várias mudanças de uma vez
  // Nome do ajuste e valor como a pessoa vê na tela ("ISO 400", "Aperture f/5.6"), para a Activity e o
  // Desfazer — o código da Canon (120, 56…) só no detalhe técnico (2.12.1)
  function csDescribe(camera, key, value) {
    const col = CS_COLS.find(([k]) => k === key);
    const det = STYLE_DETAILS.find(([k]) => k === key);
    const name = col ? col[1] : det ? "Picture Style " + det[1].toLowerCase() : CS_NAMES[key] || key;
    let text = String(value);
    if (key === "kelvin") text = value + " K";
    else if (key === "shiftab" || key === "shiftgm" || det) text = signed(+value);
    else {
      const cams = camera === "*" ? camSettings : camSettings.filter((c) => c.camera === camera);
      for (const c of cams) {
        const st = c.settings && c.settings[key];
        const hit = st && st.choices && st.choices.find(([v]) => v === +value);
        if (hit) { text = hit[1]; break; }
      }
      if (key === "iso") text = isoText(text);
    }
    return { name, text, code: key + " = " + value };
  }
  function csSet(camera, key, value) {
    if (csRecord) {
      // Desfazer: o retrato de antes (só o que mudou volta)
      const before = csSnapshot();
      const target = camera === "*" ? "all cameras" : camera;
      const d = csDescribe(camera, key, value);
      recordAction({ label: d.name + " → " + d.text + " (" + target + ")", camera: true,
        // Desfazer volta só este ajuste (e só nesta câmera): mudanças feitas depois, por outra
        // ação ou pelo Match automatically, ficam como estão
        undo: () => { csRecord = false; try { csRestore(before, { keys: csKeyGroup(key), camera }); } finally { csRecord = true; } },
        redo: () => { csRecord = false; try { csSet(camera, key, value); } finally { csRecord = true; } } });
      // Activity: o resumo com o valor; o código da Canon só em Show technical details
      if (!(log.lastText === "Camera settings changed (" + target + ")" && Date.now() - (log.lastAt || 0) < 2000))
        log("Camera settings changed (" + target + ")", "ok");
      log(d.name + " → " + d.text + " on " + target + " (" + d.code + ")", "tech");
    }
    csPending.add(camera + "|" + key);
    renderCamSettings();
    window.setCameraSetting(camera, key, String(value));
  }
  // Espera as câmeras terminarem de aplicar (csPending vazio) antes de seguir; desiste em 10 s
  function csWhenIdle(fn) {
    const started = Date.now();
    const tick = () => { if (!csPending.size || Date.now() - started > 10000) fn(); else setTimeout(tick, 150); };
    setTimeout(tick, 150);
  }
  function csIsPending(camera, keys) {
    return keys.some((k) => csPending.has(camera + "|" + k) || csPending.has("*|" + k));
  }
  const COL_KEYS = { wb: ["wb", "kelvin"], shift: ["shiftab", "shiftgm"], style: ["style", "contrast", "saturation", "colortone"],
    color: ["wb", "kelvin", "shiftab", "shiftgm", "style", "contrast", "saturation", "colortone"] };

  // ----- Ajustes do Picture Style (contraste, saturação, tom de cor), como o INFO da
  // câmera: um botão na célula abre uma caixa com os três -----
  const STYLE_DETAILS = [["contrast", "Contrast", "contrast"], ["saturation", "Saturation", "saturation"], ["colortone", "Color tone", "colorTone"]];
  let csStylePop = null;  // { camera } aberto ("*" = All cameras)
  const signed = (v) => (v > 0 ? "+" + v : String(v));
  // level: "" igual; "partial" algumas opções diferentes (âmbar tracejado); "diff" todas (âmbar)
  function csStyleButton(camera, level, values) {
    const differs = !!level;
    const b = document.createElement("button");
    b.className = "cs-more" + (level ? " " + level : "") + (csStylePop && csStylePop.camera === camera ? " open" : "");
    b.textContent = "±";
    const chartNote = values && values.chart && STYLE_DETAILS.some(([, , f]) => csChartAdjust(values, f))
      ? " · calibrated with the chart: " + STYLE_DETAILS.filter(([, , f]) => csChartAdjust(values, f)).map(([, label, f]) => label + " " + signed(csChartAdjust(values, f))).join(", ") + " for this model"
      : "";
    b.title = (values ? "Contrast " + signed(values.contrast) + " · Saturation " + signed(values.saturation) + " · Color tone " + signed(values.colorTone) + chartNote
                      : "Contrast, saturation and color tone") + (level === "partial" ? " (some are different from the other cameras)" : differs ? " (different from the other cameras)" : "");
    b.dataset.styleCam = camera;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      csStylePop = csStylePop && csStylePop.camera === camera ? null : { camera };
      renderStylePop();
      if (e.detail === 0 && csStylePop) { const first = $("csStylePop") && $("csStylePop").querySelector("select"); if (first) first.focus(); }  // pelo teclado
    });
    return b;
  }
  function renderStylePop() {
    let pop = $("csStylePop");
    document.querySelectorAll(".cs-more.open").forEach((b) => b.classList.remove("open"));
    const anchor = csStylePop && document.querySelector('.cs-more[data-style-cam="' + csStylePop.camera + '"]');
    if (!csStylePop || !anchor || $("camSettingsOverlay").classList.contains("hidden")) {
      if (pop) pop.remove();
      csStylePop = anchor ? csStylePop : null;
      return;
    }
    anchor.classList.add("open");
    if (!pop) {
      pop = el("div", "cs-pop");
      pop.id = "csStylePop";
      pop.addEventListener("click", (e) => e.stopPropagation());
      pop.addEventListener("focusout", () => { if (csRenderLater) setTimeout(csRender, 0); });
      $("camSettingsOverlay").appendChild(pop);
    }
    const all = csStylePop.camera === "*";
    const target = all ? camSettings.filter((c) => c.adjustable) : camSettings.filter((c) => c.camera === csStylePop.camera);
    const styleCams = target.filter((c) => c.styleDetail);
    const cams = styleCams;
    const ref = csReference();
    const wasAt = pop.contains(document.activeElement) ? [...pop.querySelectorAll("select")].indexOf(document.activeElement) : -1;
    if (wasAt >= 0) setTimeout(() => { const p = $("csStylePop"); if (!p || p.contains(document.activeElement)) return; const l = p.querySelectorAll("select"); const t = l[Math.min(wasAt, l.length - 1)]; if (t) t.focus({ preventScroll: true }); }, 0);
    pop.innerHTML = "";
    pop.appendChild(el("div", "cs-pop-title", (all ? "All cameras" : csStylePop.camera) + " · Color"));
    const popRow = (label, keys, cls) => el("label", "cs-pop-row" + (csIsPending(csStylePop.camera, keys) ? " applying" : "") + (cls ? " " + cls : ""));
    // White balance (predefinidos e Kelvin): a mesma lista que ficava na coluna
    {
      const node = all ? csAllCell("wb", target) : csCell(target[0], "wb", ref);
      const row = popRow("White balance", ["wb", "kelvin"]);
      row.appendChild(el("span", "", "White balance"));
      const ctl = node.firstChild;
      if (ctl) { if (ctl.tagName === "SELECT") ctl.classList.add("pop-wide"); row.appendChild(ctl); }
      pop.appendChild(row);
    }
    // WB fine-tune A/B e G/M
    {
      const node = all ? csAllCell("shift", target) : csCell(target[0], "shift", ref);
      const row = popRow("WB fine-tune", ["shiftab", "shiftgm"]);
      row.appendChild(el("span", "", "WB fine-tune"));
      if (node.firstChild) row.appendChild(node.firstChild);
      pop.appendChild(row);
    }
    // Picture Style
    {
      const node = all ? csAllCell("style", target) : csCell(target[0], "style", ref);
      const row = popRow("Picture Style", ["style"], "cs-pop-sep");
      row.appendChild(el("span", "", "Picture Style"));
      const ctl = node.firstChild;
      if (ctl) { if (ctl.tagName === "SELECT") ctl.classList.add("pop-wide"); row.appendChild(ctl); }
      pop.appendChild(row);
    }
    const range = [];
    for (let v = -4; v <= 4; v++) range.push(v);
    if (styleCams.length) STYLE_DETAILS.forEach(([key, label, field]) => {
      const values = new Set(cams.map((c) => c[field]));
      const current = values.size === 1 ? [...values][0] : null;
      const refs = all ? null : csStyleDetailRefs();
      const off = current === null || (refs && refs[field] !== null && current - csChartAdjust(cams[0], field) !== refs[field]);
      const options = range.map((v) => [String(v), signed(v)]);
      if (current === null) options.unshift(["", "—", true]);
      const row = el("label", "cs-pop-row" + (csIsPending(csStylePop.camera, [key]) ? " applying" : ""));
      row.appendChild(el("span", "", label));
      row.appendChild(csSelect(options, current === null ? "" : String(current), (v) => csSet(csStylePop.camera, key, +v), "small" + (off ? " diff" : "")));
      pop.appendChild(row);
    });
    if (styleCams.length) pop.appendChild(el("div", "cs-pop-note", "Color tone: − redder, + more yellow (skin tones)."));
    const r = anchor.getBoundingClientRect();
    const w = 290;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    // Abaixo do botão; sem espaço embaixo (câmeras do fim da lista), acima dele; se não couber nem
    // acima, encostado na borda de baixo da janela, para nenhuma linha ficar escondida
    pop.style.top = "0px";
    const h = pop.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - 6 - h;
    if (top < 8) top = Math.max(8, window.innerHeight - 8 - h);
    pop.style.top = top + "px";
  }
  // Clique fora fecha a caixa; escolher numa lista dela (a lista fica fora da caixa) não fecha
  document.addEventListener("click", (e) => {
    if (!csStylePop) return;
    const m = e.target.closest && e.target.closest(".select-menu");
    if (m && m.inPop) return;
    csStylePop = null; renderStylePop();
  });

  // ab ou gm null: câmeras com valores diferentes ("—" na lista; qualquer valor, até 0, aplica)
  // flip: modelo que o app mediu com o sentido invertido (troca os rótulos daquele eixo)
  function shiftPair(ab, gm, onAB, onGM, diff, flip) {
    const f = flip || {};
    const box = el("span", "cs-pair");
    const range = [];
    for (let v = -9; v <= 9; v++) range.push(v);
    const list = (current, neg, pos, onPick, differs) => {
      const options = range.map((v) => [String(v), shiftLabel(v, neg, pos)]);
      if (current === null) options.unshift(["", "—", true]);
      return csSelect(options, current === null ? "" : String(current), (v) => onPick(+v), "small" + (differs ? " diff" : ""));
    };
    // No SDK, + = âmbar e + = verde (conferido na T7 e na SL3)
    box.append(list(ab, f.ab ? "A" : "B", f.ab ? "B" : "A", onAB, diff || ab === null),
               list(gm, f.gm ? "G" : "M", f.gm ? "M" : "G", onGM, diff || gm === null));
    box.title = "Blue (B) ↔ amber (A) and green (G) ↔ magenta (M)";
    return box;
  }

  // Célula de uma câmera
  function csCell(c, k, ref) {
    const td = document.createElement("td");
    td.className = "cs-cell" + (csIsPending(c.camera, COL_KEYS[k] || [k]) ? " applying" : "");
    const diff = csDiffers(c, k, ref);
    if (k === "focus") {
      const f = c.settings.focus;
      if (!f || !f.available) td.appendChild(csText("—", "na", "Not available on this camera"));
      else if (c.focusManual) td.appendChild(csText("MF", "ok"));
      else td.appendChild(csText(f.label, "warn", "Autofocus is on. Turn the lens switch to MF so the camera fires without delay."));
      return td;
    }
    if (k === "shift") {
      if (!c.shiftAvailable) td.appendChild(csText("—", "na", "Not available on this camera"));
      else td.appendChild(shiftPair(c.shiftAB, c.shiftGM, (v) => csSet(c.camera, "shiftab", v), (v) => csSet(c.camera, "shiftgm", v), diff, { ab: c.abFlip, gm: c.gmFlip }));
      return td;
    }
    if (k === "color") {
      // Resumo (balanço de branco · estilo) e o botão ± que abre o painel Color
      const wbL = csLabel(c, "wb"), stL = csLabel(c, "style");
      td.classList.add("cs-color");
      td.appendChild(csStyleButton(c.camera, csColorLevel(c, ref), c));
      td.appendChild(csColorSummary(wbL, stL, csDiffers(c, "wb", ref), csDiffers(c, "style", ref) || csStyleDetailDiffers(c)));
      return td;
    }
    const st = c.settings[k];
    if (!st || !st.available) { td.appendChild(csText("—", "na", "Not available on this camera")); return td; }
    const current = k === "wb" && st.value === 9 ? "k" + c.kelvin : String(st.value);
    const currentLabel = k === "wb" && st.value === 9 ? c.kelvin + " K" : st.label;
    if (!st.choices.length) {
      // Tem o valor, mas não deixa mudar agora: valor dentro do tracejado
      td.appendChild(csText(currentLabel, "na" + (diff ? " diff" : ""), k === "quality" || k === "aspect"
        ? "This camera does not allow changing this over USB. Change it in the camera menu." + (k === "aspect" ? " Match automatically sets the other cameras to this ratio." : "")
        : "The camera does not allow changing this now."));
      return td;
    }
    let options = st.choices.filter(([v]) => !(k === "wb" && v === 9)).map(([v, l]) => [String(v), k === "iso" ? isoText(l) : l]);
    if (k === "wb" && st.choices.some(([v]) => v === 9)) {
      options = options.concat(KELVINS.map((kv) => ["k" + kv, kv + " K"]));
      if (st.value === 9 && !KELVINS.includes(c.kelvin)) options.push(["k" + c.kelvin, c.kelvin + " K"]);
    }
    if (!options.some(([v]) => v === current)) options.unshift([current, currentLabel]);
    const sel = csSelect(options, current, (v) => {
      if (k === "wb" && v.startsWith("k")) csSet(c.camera, "kelvin", +v.slice(1));
      else csSet(c.camera, k, +v);
    }, diff ? "diff" : "");
    td.appendChild(sel);
    // Ratio: a última foto de teste saiu numa proporção diferente da informada → marca amarela
    const ratio = k === "aspect" && csTest.ratios[c.camera];
    if (ratio && ratio.differs && ratio.reported === currentLabel) {
      sel.classList.add("shot-warn");
      const why = ratioWhy(ratio);
      sel.title = why;
      td.appendChild(csText(ratio.shot, "shot-ratio", ""));
      const alert = el("span", "cs-ratio-alert");
      alert.innerHTML = ALERT_SVG;
      alert.setAttribute("role", "img"); alert.setAttribute("aria-label", why);
      alert.dataset.itip = why;
      alert.tabIndex = 0;
      td.appendChild(alert);
    }
    return td;
  }
  // Resumo da coluna Color: duas linhas (balanço de branco, estilo), na altura do botão ±
  function csColorSummary(wb, style, wbDiff, styleDiff) {
    const box = el("span", "cs-color-sum");
    if (wb !== null) box.appendChild(el("span", wbDiff ? "diff" : "", "· " + wb));
    if (style !== null) box.appendChild(el("span", styleDiff ? "diff" : "", "· " + style));
    return box;
  }
  // Quanto da cor difere das outras câmeras: "" nada; "partial" algo; "diff" tudo o que a câmera tem
  function csColorLevel(c, ref) {
    const checks = [];
    if (c.settings && c.settings.wb && c.settings.wb.available) checks.push(csDiffers(c, "wb", ref));
    if (c.shiftAvailable) checks.push(csDiffers(c, "shift", ref));
    if (c.settings && c.settings.style && c.settings.style.available) checks.push(csDiffers(c, "style", ref));
    if (c.styleDetail) checks.push(csStyleDetailDiffers(c));
    const n = checks.filter(Boolean).length;
    return n === 0 ? "" : n === checks.length ? "diff" : "partial";
  }
  function csHasQuality(c) { const q = c.settings && c.settings.quality; return !!(q && q.available && q.choices && q.choices.length); }
  function csShowsQuality(c) { const q = c.settings && c.settings.quality; return !!(q && q.available); }
  function csHasAspect(c) { const a = c.settings && c.settings.aspect; return !!(a && a.available); }
  function csCanChangeAspect(c) { const a = c.settings && c.settings.aspect; return !!(a && a.available && a.choices && a.choices.length); }

  // Célula de "All cameras": só os valores que todas as câmeras ajustáveis aceitam
  function csAllCell(k, cams) {
    const td = document.createElement("td");
    td.className = "cs-cell" + (csIsPending("*", COL_KEYS[k] || [k]) ? " applying" : "");
    const labels = new Set(cams.map((c) => csLabel(c, k)).filter((l) => l !== null));
    const same = labels.size === 1;
    if (k === "focus") {
      const af = camSettings.filter((c) => c.settings.focus && c.settings.focus.available && !c.focusManual).length;
      td.appendChild(af ? csText("AF on " + af, "warn", "Autofocus is on in " + plural(af, "camera", "cameras") + ". Turn the lens switch to MF.")
                        : csText("All MF", "ok"));
      return td;
    }
    if (!cams.length) { td.appendChild(csText("—", "na")); return td; }
    if (k === "shift") {
      if (!cams.every((c) => c.shiftAvailable)) { td.appendChild(csText("—", "na", "Not available on every camera")); return td; }
      const one = (key) => (new Set(cams.map((c) => c[key])).size === 1 ? cams[0][key] : null);
      td.appendChild(shiftPair(one("shiftAB"), one("shiftGM"), (v) => csSet("*", "shiftab", v), (v) => csSet("*", "shiftgm", v), false));
      return td;
    }
    if (k === "color") {
      td.classList.add("cs-color");
      const refs = csStyleDetailRefs();
      const anyDiff = ["wb", "style"].some((key) => new Set(cams.map((c) => csLabel(c, key)).filter((l) => l !== null)).size > 1)
        || (cams.some((c) => c.shiftAvailable) && new Set(cams.filter((c) => c.shiftAvailable).map((c) => c.shiftAB + "/" + c.shiftGM)).size > 1)
        || STYLE_DETAILS.some(([, , f]) => refs[f] !== null);
      const wbs = new Set(cams.map((c) => csLabel(c, "wb")).filter((l) => l !== null)), sts = new Set(cams.map((c) => csLabel(c, "style")).filter((l) => l !== null));
      td.appendChild(csStyleButton("*", anyDiff ? "partial" : "", null));
      td.appendChild(csColorSummary(wbs.size === 1 ? [...wbs][0] : wbs.size ? "Different" : null, sts.size === 1 ? [...sts][0] : sts.size ? "Different" : null,
        wbs.size > 1, sts.size > 1 || STYLE_DETAILS.some(([, , f]) => refs[f] !== null)));
      return td;
    }
    if (k === "wb") {
      // Os predefinidos que todas aceitam e, se todas aceitarem, o atalho de Kelvin
      // (a SL3 e a T7, por exemplo, não têm Kelvin)
      const wbs = cams.map((c) => c.settings.wb).filter((w) => w && w.available);
      const wbText = (c) => (c.settings.wb.value === 9 ? c.kelvin + " K" : c.settings.wb.label);
      if (!wbs.length || wbs.some((w) => !w.choices.length)) {
        td.appendChild(csText("—", "na", "Not changeable on every camera"));
        return td;
      }
      const accepted = (v) => wbs.every((w) => w.choices.some(([x]) => x === v));
      let options = wbs[0].choices.filter(([v]) => v !== 9 && accepted(v)).map(([v, l]) => [String(v), l]);
      if (accepted(9)) options = options.concat(KELVINS.map((kv) => ["k" + kv, kv + " K"]));
      if (!options.length) { td.appendChild(csText("—", "na", "The cameras have no white balance in common")); return td; }
      let current = "";
      const first = cams.find((c) => c.settings.wb && c.settings.wb.available);
      if (same) {
        current = first.settings.wb.value === 9 ? "k" + first.kelvin : String(first.settings.wb.value);
        if (!options.some(([x]) => x === current)) current = "";
      }
      if (!current) options.unshift(["", same ? wbText(first) : "Different", true]);
      td.appendChild(csSelect(options, current, (v) => {
        if (v.startsWith("k")) csSet("*", "kelvin", +v.slice(1));
        else csSet("*", "wb", +v);
      }, same ? "" : "diff"));
      return td;
    }
    // Format e Ratio: câmeras que não aceitam mudar pelo USB ficam de fora; a mudança vai às outras
    if (k === "quality" || k === "aspect") {
      const can = cams.filter((c) => c.settings[k] && c.settings[k].available && c.settings[k].choices.length);
      const fixedNames = cams.filter((c) => c.settings[k] && c.settings[k].available && !c.settings[k].choices.length).map((c) => c.camera);
      if (!can.length) { td.appendChild(csText(same && labels.size ? [...labels][0] : "—", "na" + (same ? "" : " diff"), "No camera allows changing this over USB. Change it in the camera menus.")); return td; }
      const lists = can.map((c) => c.settings[k].choices);
      const common = lists[0].filter(([v]) => lists.every((l) => l.some(([x]) => x === v)));
      if (!common.length) { td.appendChild(csText("—", "na", "The cameras have no value in common")); return td; }
      const options = common.map(([v, l]) => [String(v), l]);
      let current = "";
      if (same) { const v = String(can[0].settings[k].value); if (options.some(([x]) => x === v)) current = v; }
      if (!current) options.unshift(["", same ? [...labels][0] : "Different", true]);
      const sel = csSelect(options, current, (v) => can.forEach((c) => { if (c.settings[k].value !== +v) csSet(c.camera, k, +v); }), same ? "" : "diff");
      if (fixedNames.length) sel.title = fixedNames.join(", ") + (fixedNames.length === 1 ? " does" : " do") + " not allow changing this over USB; the change goes to the other cameras.";
      td.appendChild(sel);
      return td;
    }
    const lists = cams.filter((c) => c.settings[k] && c.settings[k].available).map((c) => c.settings[k].choices);
    // Alguma câmera não deixa mudar agora: "—" tracejado (não dá para aplicar em todas)
    if (!lists.length || lists.some((l) => !l.length)) {
      const fixed = cams.filter((c) => !(c.settings[k] && c.settings[k].available && c.settings[k].choices.length)).map((c) => c.camera);
      td.appendChild(csText("—", "na", "Not changeable on every camera" + (fixed.length ? " (" + fixed.join(", ") + " does not allow it now)" : "")));
      return td;
    }
    const common = lists[0].filter(([v]) => lists.every((l) => l.some(([x]) => x === v)));
    if (!common.length) { td.appendChild(csText("—", "na", "The cameras have no value in common")); return td; }
    const options = common.map(([v, l]) => [String(v), k === "iso" ? isoText(l) : l]);
    let current = "";
    if (same) {
      const v = String(cams.find((c) => c.settings[k] && c.settings[k].available).settings[k].value);
      if (options.some(([x]) => x === v)) current = v;
    }
    if (!current) options.unshift(["", same ? [...labels][0] : "Different", true]);
    td.appendChild(csSelect(options, current, (v) => csSet("*", k, +v), same ? "" : "diff"));
    return td;
  }

  // Redesenha, mas não com uma lista aberta (a lista fecharia sozinha): espera sair dela
  function csRender() {
    // Só espera com a lista do app aberta (redesenhar sumiria com ela). Com o foco numa caixa,
    // redesenha já: o foco volta para o mesmo lugar (antes esperava o foco sair, e com o teclado
    // o valor novo não aparecia até sair da caixa)
    if (selectMenu) { csRenderLater = true; return; }
    csRenderLater = false;
    renderCamSettings();
  }
  $("csBody").addEventListener("focusout", () => { if (csRenderLater) setTimeout(csRender, 0); });
  // Teclado: o foco saiu da caixa do ± (e do botão dela): fecha a caixa
  document.addEventListener("focusin", (e) => {
    if (!csStylePop) return;
    const pop = $("csStylePop"), t = e.target;
    if ((pop && pop.contains(t)) || (t.closest && t.closest(".cs-more")) || (selectMenu && selectMenu.contains(t))) return;
    csStylePop = null; renderStylePop();
  });

  // Posição de um controle na tabela: linha (entre as linhas com controles), coluna e ordem na célula
  function csControls(td) { return [...td.querySelectorAll("select, button, input")]; }
  function csRows() { const t = $("csBody").querySelector("table.cs"); return t ? [...t.querySelectorAll("tr")].filter((tr) => tr.querySelector("select, button, input")) : []; }
  function csPos(node) {
    if (!node || !$("csBody").contains(node)) return null;
    const td = node.closest("td"), tr = node.closest("tr");
    if (!td || !tr) return null;
    return { r: csRows().indexOf(tr), c: [...tr.children].indexOf(td), k: csControls(td).indexOf(node) };
  }
  function csAt(pos) {
    const tr = csRows()[pos.r];
    const td = tr && tr.children[pos.c];
    if (!td) return null;
    const list = csControls(td);
    return list[Math.min(Math.max(0, pos.k), list.length - 1)] || null;
  }
  // ↑ ↓ num controle da tabela (com a lista fechada): a mesma coluna na câmera de cima/de baixo
  document.addEventListener("keydown", (e) => {
    if (selectMenu || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const pop = $("csStylePop");
    if (pop && pop.contains(document.activeElement)) {
      // Caixa do ±: ↑ ↓ andam entre as listas dela (Enter abre a lista)
      e.preventDefault(); e.stopImmediatePropagation();
      const list = [...pop.querySelectorAll("select")].filter((x) => !x.disabled);
      const t = list[list.indexOf(document.activeElement) + (e.key === "ArrowDown" ? 1 : -1)];
      if (t) t.focus();
      return;
    }
    const pos = csPos(document.activeElement);
    if (!pos) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const rows = csRows();
    for (let r = pos.r + (e.key === "ArrowDown" ? 1 : -1); r >= 0 && r < rows.length; r += (e.key === "ArrowDown" ? 1 : -1)) {
      const t = csAt({ r, c: pos.c, k: pos.k });
      if (t && !t.disabled) { t.focus(); return; }
    }
  }, true);
  function renderCamSettings() {
    const body = $("csBody");
    const scroll = body.scrollTop;
    // O foco (teclado) estava na tabela: volta para a mesma linha/coluna depois de redesenhar
    const was = csPos(document.activeElement);
    if (was) setTimeout(() => { const t = csAt(was); if (t && !body.contains(document.activeElement)) t.focus({ preventScroll: true }); }, 0);
    body.innerHTML = "";
    const copy = $("csCopy");
    copy.innerHTML = "";
    if (!camSettings.length) {
      body.appendChild(el("div", "cs-empty", "No camera connected."));
      copy.disabled = true;
      return;
    }
    const ref = csReference();
    const adjustable = camSettings.filter((c) => c.adjustable);
    const table = document.createElement("table");
    table.className = "cs";
    const head = document.createElement("tr");
    head.appendChild(document.createElement("th"));
    CS_COLS.forEach(([, label]) => head.appendChild(el("th", "", label)));
    const thead = document.createElement("thead");  // (o grupo inteiro fica preso, com fundo: sem fresta acima das colunas)
    thead.appendChild(head);
    table.appendChild(thead);

    const all = document.createElement("tr");
    all.className = "all";
    const allName = el("td", "name", "All cameras");
    const afOn = camSettings.filter((c) => c.adjustable && c.settings.focus && c.settings.focus.available && !c.focusManual);
    if (afOn.length) { const tag = el("span", "cs-focus-tag warn", "AF on " + afOn.length); tag.title = "Autofocus on: " + afOn.map((c) => c.camera).join(", ") + ". Turn the lens switch to MF."; allName.appendChild(tag); }
    allName.appendChild(el("small", "", "applies to every camera"));
    all.appendChild(allName);
    CS_COLS.forEach(([k]) => all.appendChild(csAllCell(k, adjustable)));
    table.appendChild(all);

    camSettings.forEach((c) => {
      const tr = document.createElement("tr");
      const name = el("td", "name", pad(c.order) + " " + c.camera);
      // Foco (só leitura) como etiqueta ao lado do nome: MF verde; AF âmbar com o aviso
      const f = c.settings && c.settings.focus;
      if (f && f.available) {
        const tag = el("span", "cs-focus-tag" + (c.focusManual ? "" : " warn"), c.focusManual ? "MF" : f.label);
        tag.title = c.focusManual ? "Manual focus" : "Autofocus is on. Turn the lens switch to MF so the camera fires without delay.";
        name.appendChild(tag);
      }
      // Câmera simulada com comportamento de propósito (ex.: a 02 entrega sempre 16:9): etiqueta âmbar
      if (c.quirk) { const q = el("span", "cs-focus-tag warn", "always 16:9"); q.title = c.quirk; name.appendChild(q); }
      name.appendChild(el("small", "", c.model + (c.mode ? " · " + c.mode : "")));
      tr.appendChild(name);
      if (!c.adjustable) {
        tr.className = "locked";
        const msg = el("td", "msg", "⚠  " + (c.reason || "Settings can only be changed on the camera."));
        msg.colSpan = CS_COLS.length;
        tr.appendChild(msg);
        table.appendChild(tr);
        return;
      }
      CS_COLS.forEach(([k]) => tr.appendChild(csCell(c, k, ref)));
      table.appendChild(tr);
      const drive = c.settings.drive;
      const driveNote = drive && drive.available && !isSingleShot(drive.value)
        ? "The camera is on " + drive.label + " and did not accept single shooting. Set it to single shooting on the camera." : "";
      const noteText = [c.reason, driveNote].filter(Boolean).join(" ");
      if (noteText) {
        tr.classList.add("has-note");
        const note = document.createElement("tr");
        note.className = "note";
        note.appendChild(document.createElement("td"));
        const td = el("td", "", "⚠  " + noteText);
        td.colSpan = CS_COLS.length;
        note.appendChild(td);
        table.appendChild(note);
      }
    });
    // Teclado: o Tab passa só pela linha "All cameras"; nas linhas das câmeras chega-se com ↑ ↓
    table.querySelectorAll("tr:not(.all) select, tr:not(.all) button, tr:not(.all) input").forEach((x) => { x.tabIndex = -1; });
    body.appendChild(table);
    // A linha "All cameras" gruda logo abaixo do cabeçalho, na altura real dele (um valor fixo deixava uma fresta
    // por onde as linhas de trás apareciam)
    csStickAllRow();
    body.scrollTop = scroll;
    renderStylePop();

    copy.disabled = adjustable.length < 2;
    copy.appendChild(new Option("Choose…", ""));
    adjustable.forEach((c) => copy.appendChild(new Option(pad(c.order) + " " + c.camera, c.camera)));
    copy.value = "";
  }

  // Deixa todas as câmeras iguais a uma escolhida
  // Retrato das configurações de cada câmera (para desfazer o "Copy from camera")
  function csSnapshot() {
    const keys = ["iso", "tv", "av", "expcomp", "metering", "style", "quality", "aspect", "wb"];
    return camSettings.filter((c) => c.adjustable).map((c) => {
      const snap = { camera: c.camera, values: {} };
      keys.forEach((k) => { const st = c.settings[k]; if (st && st.available && st.choices.length) snap.values[k] = st.value; });
      if (snap.values.wb === 9) snap.values.kelvin = c.kelvin;
      if (c.shiftAvailable) { snap.values.shiftab = c.shiftAB; snap.values.shiftgm = c.shiftGM; }
      if (c.styleDetail) STYLE_DETAILS.forEach(([key, , f]) => { snap.values[key] = c[f]; });
      return snap;
    });
  }
  // only: { keys, camera } — volta só esses ajustes (e só essa câmera); sem only, tudo o que mudou
  function csRestore(snapshot, only) {
    const wasRecording = csRecord; csRecord = false;
    try { csRestoreNow(snapshot, only); } finally { csRecord = wasRecording; }
    return true;
  }
  function csRestoreNow(snapshot, only) {
    const live = csSnapshot();
    snapshot.forEach((snap) => {
      if (only && only.camera && only.camera !== "*" && only.camera !== snap.camera) return;
      const now = live.find((x) => x.camera === snap.camera);
      if (!now) return;
      Object.keys(snap.values).forEach((k) => {
        if (k === "kelvin") return;
        if (only && only.keys && !only.keys.includes(k)) return;
        const kelvinOff = k === "wb" && snap.values.wb === 9 && now.values.kelvin !== snap.values.kelvin;
        if (snap.values[k] === now.values[k] && !kelvinOff) return;
        if (k === "wb" && snap.values.wb === 9) csSet(snap.camera, "kelvin", snap.values.kelvin);
        else csSet(snap.camera, k, snap.values[k]);
      });
    });
    return true;
  }
  // Ajustes que andam juntos: o balanço de branco com a temperatura; o estilo com os seus ajustes
  function csKeyGroup(key) {
    if (key === "wb" || key === "kelvin") return ["wb", "kelvin"];
    if (key === "style") return ["style", "contrast", "saturation", "colortone"];
    return [key];
  }
  function copyFromCamera(name, silent) {
    const before = csSnapshot();
    csRecord = false;
    try { copyFromCameraNow(name); } finally { csRecord = true; }
    if (silent) return true;
    recordAction({ label: "Copy settings from " + name, camera: true, undo: () => csRestore(before), redo: () => copyFromCamera(name, true) });  // redo roda com csRecord desligado dentro de copyFromCamera
    return true;
  }
  function copyFromCameraNow(name) {
    const c = camSettings.find((x) => x.camera === name);
    if (!c) return;
    ["iso", "tv", "av", "expcomp", "metering", "style", "quality"].forEach((k) => {
      const st = c.settings[k];
      if (st && st.available && st.choices.length) csSet("*", k, st.value);
    });
    // Proporção: só para as câmeras que aceitam mudar (a de origem pode ser uma fixa)
    if (csHasAspect(c)) camSettings.filter((x) => x.adjustable && x.camera !== name && csCanChangeAspect(x) && x.settings.aspect.value !== c.settings.aspect.value)
      .forEach((x) => csSet(x.camera, "aspect", c.settings.aspect.value));
    const wb = c.settings.wb;
    if (wb && wb.available && wb.choices.length) {
      if (wb.value === 9) csSet("*", "kelvin", c.kelvin);
      else csSet("*", "wb", wb.value);
    }
    if (c.shiftAvailable) { csSet("*", "shiftab", c.shiftAB); csSet("*", "shiftgm", c.shiftGM); }
    // Ajustes do Picture Style (Contrast, Saturation, Color tone): depois do estilo (cada
    // estilo guarda os seus). Com a calibração da cartela, cada modelo recebe o valor que
    // o deixa parecido com a câmera escolhida (o mesmo que o Match faria).
    if (c.styleDetail) {
      camSettings.filter((x) => x.adjustable && x.styleDetail && x.camera !== name).forEach((x) => {
        STYLE_DETAILS.forEach(([key, , f]) => {
          const v = Math.max(-4, Math.min(4, c[f] - csChartAdjust(c, f) + csChartAdjust(x, f)));
          const styleChanges = (c.settings.style && c.settings.style.value) !== (x.settings.style && x.settings.style.value);
          if (v !== x[f] || styleChanges) csSet(x.camera, key, v);
        });
      });
    }
    toast("Copying the settings of " + name + " to the other cameras");
  }

  // ----- Test shot: dispara todas as câmeras (fotos temporárias, como no "Reorder by
  // photo") para conferir lado a lado. Com "Match automatically", o app também muda as
  // câmeras para ficarem parecidas (até 5 fotos) e mostra as últimas. -----
  function csTakeTest(skipIsoCheck, skipMeteringCheck) {
    if (csTest.capturing) {  // o botão virou "Cancel"
      if (csTest.cancelling) return;
      csTest.cancelling = true;
      window.cancelTest();
      csGallery.message("Cancelling");
      updateButtons();
      return;
    }
    const connected = cameras.filter((c) => c.connected).length;
    if (busy || !connected) return;
    const match = $("csAuto").checked && connected >= 2;  // csAuto: ligado só pela janela Match automatically
    // ISO em Auto: o brilho não tem como ser igualado; avisa antes de começar
    const isoAuto = camSettings.filter((c) => c.adjustable && c.settings.iso && c.settings.iso.available && c.settings.iso.value === 0).map((c) => c.camera);
    if (match && isoAuto.length && skipIsoCheck !== true) {
      dialog("ISO is on Auto",
        (isoAuto.length === 1 ? isoAuto[0] + " has" : isoAuto.join(", ") + " have") + " ISO on Auto, so each camera picks its own brightness and the app cannot match it. " +
        "Set an ISO first (for example in All cameras), or continue to match only the color.",
        [{ label: "Cancel" }, { label: "Continue anyway", primary: true, onClick: () => csTakeTest(true) }]);
      return;
    }
    // Metering diferente entre câmeras (etapa 18): em modos automáticos cada uma mede o brilho de um
    // jeito e o Match não iguala; a pessoa escolhe pôr todas no mesmo modo ou seguir assim
    if (match && skipMeteringCheck !== true) {
      const withMetering = camSettings.filter((c) => c.adjustable && c.settings.metering && c.settings.metering.available);
      const modes = new Map();
      withMetering.forEach((c) => { const m = c.settings.metering; if (!modes.has(m.value)) modes.set(m.value, { label: m.label, cams: [] }); modes.get(m.value).cams.push(c.camera); });
      if (modes.size > 1) {
        const [topValue, top] = [...modes.entries()].sort((a, b) => b[1].cams.length - a[1].cams.length)[0];
        const list = [...modes.values()].map((m) => m.label + ": " + m.cams.join(", ")).join(" · ");
        dialog("Metering modes differ",
          "The cameras measure light differently (" + list + "). In automatic modes this changes the brightness each camera picks, so the match may not line up. " +
          "Set every camera to " + top.label + ", or keep them as they are?",
          [{ label: "Cancel" }, { label: "Keep as they are", onClick: () => csTakeTest(true, true) },
           { label: "Set all to " + top.label, primary: true, onClick: () => { csSet("*", "metering", topValue); csWhenIdle(() => csTakeTest(true, true)); } }]);
        return;
      }
    }
    csTest.capturing = true;
    csTest.cancelling = false;
    csTest.has = false;
    csTest.mode = match ? "match" : "test";
    $("camSettingsOverlay").querySelector(".cs-sheet").classList.add("capturing");
    $("csTestBox").classList.remove("hidden", "has-photos");
    csSetZoom(false);
    csSetCollapsed(false);
    csGallery.setItems([]);
    csGallery.setHead(match ? "Test shot · matching" : "Test shot", "");
    csGallery.message("Taking a photo with each camera");
    csTest.before = match ? csSnapshot() : null;  // para desfazer o Match automatically de uma vez
    if (match) window.autoMatch(intValue(ui.downloadWait, 1, 10), $("csCard").checked ? 1 : 0, csMatchFlags(), csMatchTargets());
    else window.takeOrderPhotos(intValue(ui.downloadWait, 1, 10));
  }
  // ----- Match automatically em três passos (decisão do dono, 2026-11-01): 1 Choose (o que igualar),
  // 2 Test shot (até 5 fotos; nada muda nas câmeras: no fim elas voltam ao "antes"), 3 Review (tabela
  // por câmera + fotos antes/depois; só o Apply mexe nas câmeras; um ⌘Z desfaz tudo) -----
  const MATCH_ITEMS = [
    ["exposure", 1, "Shutter, aperture, exposure comp.", "same value on every camera", "set"],
    ["iso", 2, "ISO", "same value on every camera", "set"],
    ["wb", 8, "White balance", "a common white balance", "set"],
    ["style", 32, "Picture Style", "same style and adjustments", "set"],
    ["format", 64, "Format", "same size and file format", "set"],
    ["aspect", 128, "Aspect ratio", "to the cameras that cannot change it", "set"],
    ["brightness", 4, "Brightness", "ISO fine-tune, measured in the test shot", "measure"],
    ["color", 16, "Color", "WB fine-tune, measured in the test shot", "measure"],
  ];
  const matchWin = { step: 0, choices: null, result: null, cam: null, mode: "split", split: 50, playing: 0, dir: 1, picked: new Set(), before: null, targets: {}, undo: [], redo: [] };
  // Desfazer dentro da janela (⌘Z / Ctrl+Z nos passos 1 e 3): caixas marcadas e valores escolhidos
  function csMatchHistoryActive() { return !$("csMatch").classList.contains("hidden") && (matchWin.step === 1 || matchWin.step === 3) && $("dialogOverlay").classList.contains("hidden"); }
  function csMatchRecord(label, undo, redo) { matchWin.undo.push({ label, undo, redo }); if (matchWin.undo.length > 50) matchWin.undo.shift(); matchWin.redo.length = 0; }
  function csMatchUndo() {
    const a = matchWin.undo.pop();
    if (!a) { toast("Nothing to undo", TOAST_MS, { silent: true }); return; }
    a.undo(); matchWin.redo.push(a);
    toast("Undo: " + a.label, TOAST_MS, { kind: "undo" });
  }
  function csMatchRedo() {
    const a = matchWin.redo.pop();
    if (!a) { toast("Nothing to redo", TOAST_MS, { silent: true }); return; }
    a.redo(); matchWin.undo.push(a);
    toast("Redo: " + a.label, TOAST_MS, { kind: "redo" });
  }
  // Valores de "Set the same value on every camera" (decisão do dono, 2026-11-02): o passo 1 já calcula o
  // valor que o Match poria em todas, mostra e deixa trocar. A regra é a mesma do núcleo (auto_match.cpp):
  // shutter/aperture/exp. comp./ISO: o valor mais perto da média (em stops) que todas aceitam; Picture
  // Style: o mais comum (nunca Auto); Format e Ratio: o das câmeras que não aceitam mudar, senão o mais
  // comum; White balance: Daylight e a foto de teste escolhe o predefinido comum mais perto, ou um fixo.
  const MATCH_SET_KEYS = { exposure: [["tv", "Shutter"], ["av", "Aperture"], ["expcomp", "Exp. comp."]], iso: [["iso", "ISO"]],
    wb: [["wb", "White balance"]], style: [["style", "Picture Style"]], format: [["quality", "Format"]], aspect: [["aspect", "Aspect ratio"]] };
  // Escala de luz da Canon (8 = 1 stop); null: sem valor fixo (ISO Auto, Bulb...)
  function csLightUnits(key, code) {
    if (key === "iso") return code === 0 ? null : code;
    if (key === "tv") return code < 0x10 ? null : code;
    if (key === "av") return code < 0x08 || code === 0x85 ? null : code;
    if (key === "expcomp") return code < 0 || code > 0xFF ? null : code >= 0x80 ? code - 256 : code;
    return null;
  }
  // Proposta para uma configuração: { options: [[valor, rótulo]], value, note } ou null (nada a igualar)
  function csMatchPropose(key) {
    const cams = camSettings.filter((c) => c.adjustable && c.settings[key] && c.settings[key].available);
    const can = cams.filter((c) => c.settings[key].choices.length);
    if (can.length < 2 && !(key === "quality" || key === "aspect")) return null;
    if (!can.length) return null;
    const accepted = (v) => can.every((c) => c.settings[key].choices.some(([x]) => x === v));
    const label = (v) => { const ch = can.map((c) => c.settings[key].choices.find(([x]) => x === v)).find(Boolean); return ch ? (key === "iso" ? isoText(ch[1]) : ch[1]) : String(v); };
    if (key === "wb") {
      const options = [["auto", "Let the test shot choose"]];
      can[0].settings.wb.choices.filter(([v]) => v !== 9 && v !== 0 && v !== 23 && accepted(v)).forEach(([v, l]) => options.push([String(v), l]));
      if (accepted(9)) KELVINS.forEach((kv) => options.push(["k" + kv, kv + " K"]));
      return { options, value: "auto", note: "Starts at Daylight; the test shot picks the common white balance closest to the scene" };
    }
    if (key === "style") {
      const common = can[0].settings.style.choices.filter(([v]) => v !== 0x87 && accepted(v));
      if (!common.length) return { options: [["", "No style in common", true]], value: "", note: "" };
      const counts = new Map();
      can.forEach((c) => { const v = c.settings.style.value; if (v !== 0x87) counts.set(v, (counts.get(v) || 0) + 1); });
      let best = null, n = 0;
      can.forEach((c) => { const v = c.settings.style.value; if (v !== 0x87 && counts.get(v) > n && accepted(v)) { n = counts.get(v); best = v; } });
      if (best === null) best = accepted(0x81) ? 0x81 : common[0][0];
      const same = can.every((c) => c.settings.style.value === can[0].settings.style.value) && can[0].settings.style.value !== 0x87;
      return { options: common.map(([v, l]) => [String(v), l]), value: String(best), note: same ? "Already the same on every camera" : "The most common style; Auto is never used" };
    }
    if (key === "quality" || key === "aspect") {
      const fixed = cams.filter((c) => !c.settings[key].choices.length);
      const fixedValues = new Set(fixed.map((c) => c.settings[key].value));
      let target = null, note = "";
      if (fixed.length && fixedValues.size === 1) { target = [...fixedValues][0]; note = "The value of " + plural(fixed.length, "camera", "cameras") + " that cannot change it (" + fixed.map((c) => c.camera).join(", ") + ")"; }
      else {
        if (fixed.length) note = fixed.map((c) => c.camera).join(", ") + ": cannot be changed from the app and disagree. Set it in their menus.";
        else note = "The most common value";
        const counts = new Map();
        cams.forEach((c) => counts.set(c.settings[key].value, (counts.get(c.settings[key].value) || 0) + 1));
        let n = 0;
        cams.forEach((c) => { const v = c.settings[key].value; if (counts.get(v) > n) { n = counts.get(v); target = v; } });
      }
      const union = [];
      can.forEach((c) => c.settings[key].choices.forEach(([v, l]) => { if (!union.some(([x]) => x === v)) union.push([v, l]); }));
      const options = union.map(([v, l]) => [String(v), l + (accepted(v) ? "" : " (not on every camera)")]);
      if (target !== null && !union.some(([v]) => v === target)) options.unshift([String(target), label(target) + " (no camera can change to it)", true]);
      if (cams.every((c) => c.settings[key].value === cams[0].settings[key].value)) note = "Already the same on every camera";
      return { options, value: String(target), note };
    }
    // Escala de luz: a média do que as câmeras usam, no valor mais perto que todas aceitam
    const common = can[0].settings[key].choices.filter(([v]) => csLightUnits(key, v) !== null && accepted(v));
    if (!common.length) return { options: [["", "No value in common: each camera goes to its closest", true]], value: "", note: "" };
    let sum = 0, n = 0;
    can.forEach((c) => { const u = csLightUnits(key, c.settings[key].value); if (u !== null) { sum += u; n++; } });
    const same = can.every((c) => c.settings[key].value === can[0].settings[key].value);
    let best = common[0][0], err = 1e9;
    if (n) { const avg = sum / n; common.forEach(([v]) => { const e = Math.abs(csLightUnits(key, v) - avg); if (e < err - 1e-9) { err = e; best = v; } }); }
    return { options: common.map(([v]) => [String(v), label(v)]), value: String(best), note: same ? "Already the same on every camera" : n ? "Closest to the average of the cameras" : "" };
  }
  // Os valores do passo 1 para o núcleo: "tv=93 av=40 wb=1" ("kelvin=5200" para temperatura; sem wb = a foto escolhe)
  function csMatchTargets() {
    const c = csMatchChoices(), out = [];
    Object.keys(MATCH_SET_KEYS).forEach((item) => {
      if (!c[item]) return;
      MATCH_SET_KEYS[item].forEach(([key]) => {
        const p = csMatchPropose(key);
        if (!p) return;
        let v = matchWin.targets[key] !== undefined && p.options.some(([x, , d]) => x === matchWin.targets[key] && !d) ? matchWin.targets[key] : p.value;
        if (v === "" || v === "auto") return;
        if (key === "wb" && v.startsWith("k")) out.push("kelvin=" + v.slice(1));
        else out.push(key + "=" + v);
      });
    });
    return out.join(" ");
  }
  function csMatchChoices() {
    if (matchWin.choices) return matchWin.choices;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("stillpoint.matchChoices") || "null"); } catch (e) {}
    matchWin.choices = Object.assign({ exposure: true, iso: true, wb: true, style: true, format: true, aspect: true, brightness: true, color: true }, saved || {});
    matchWin.choices.grayCard = false;  // o cartão cinza começa desligado a cada abertura (decisão do dono, 2026-11-02)
    return matchWin.choices;
  }
  function csMatchSaveChoices() { try { const c = Object.assign({}, csMatchChoices()); delete c.grayCard; localStorage.setItem("stillpoint.matchChoices", JSON.stringify(c)); } catch (e) {} }
  function csMatchFlags() {
    const c = csMatchChoices();
    return MATCH_ITEMS.reduce((f, [key, bit]) => f | (c[key] ? bit : 0), 0) | 256;
  }
  function csMatchSetStep(n) {
    matchWin.step = n;
    [1, 2, 3].forEach((k) => $("csStep" + k).classList.toggle("on", k === n));
    $("csMatchBack").classList.toggle("hidden", n !== 3);
    $("csMatchKeep").classList.toggle("hidden", n !== 3);
    $("csMatchCancel").classList.toggle("hidden", n === 3);
    $("csMatchGo").textContent = n === 1 ? "Take the test shot" : n === 2 ? "Cancel the test shot" : "Apply";
    $("csMatchGo").classList.toggle("btn-primary", n !== 2);
    $("csMatchGo").classList.toggle("btn-secondary", n === 2);
  }
  function csMatchOpen() {
    if (busy || csTest.capturing) return;
    const connected = cameras.filter((c) => c.connected).length;
    if (connected < 2) { toast("Match automatically needs at least two connected cameras.", 6000, { warn: true }); return; }
    matchWin.result = null; matchWin.picked = new Set(); matchWin.before = null; matchWin.targets = {};  // valores: recalculados a cada abertura
    matchWin.undo = []; matchWin.redo = [];
    $("csMatch").classList.remove("hidden");
    $("camSettingsOverlay").querySelector(".cs-sheet").classList.add("matching");
    csMatchRenderChoose();
  }
  // Calibração aberta de dentro do Match: no fim (ou ao desistir), a janela Match volta ao passo 1
  function csMatchReturn() {
    if (!matchWin.returnAfterChart) return;
    matchWin.returnAfterChart = false;
    if (!$("camSettingsOverlay").classList.contains("hidden")) csMatchOpen();
  }
  function csMatchClose() {
    csMatchStopPlay();
    $("csMatch").classList.add("hidden");
    $("camSettingsOverlay").querySelector(".cs-sheet").classList.remove("matching");
    matchWin.step = 0;
    $("csAuto").checked = false;
  }
  function csMatchRenderChoose() {
    csMatchSetStep(1);
    $("csMatchBody").className = "cs-match-body choose";
    $("csMatchSub").textContent = "Choose what the app may change. The test shot fires every camera (the photos are not kept: up to 5 until the cameras agree, plus one with the result); nothing changes on the cameras before you review it in step 3.";
    const c = csMatchChoices();
    const body = $("csMatchBody");
    body.innerHTML = "";
    const grid = el("div", "cs-match-grid");
    const col = (title) => { const d = el("div", "cs-match-col"); d.appendChild(el("div", "cs-match-coltitle", title)); grid.appendChild(d); return d; };
    const left = col("Set the same value on every camera"), right = col("Measure in the test shot and fine-tune each camera");
    // Cada item como as saídas do Export sessions: caixa do app, título, explicação e o resumo à direita.
    // Nos itens "Set", o valor que o app poria em todas, já calculado, numa lista para trocar.
    const item = (checked, label, hint, sum, onChange, keys) => {
      const row = el("div", "cs-match-row" + (checked ? " on" : "") + (keys ? " has-vals" : ""));
      const box = document.createElement("input"); box.type = "checkbox"; box.className = "cs-check"; box.checked = checked;
      box.addEventListener("change", () => {
        row.classList.toggle("on", box.checked); onChange(box.checked);
        const v = box.checked;
        csMatchRecord(label + (v ? " on" : " off"), () => { onChange(!v); csMatchRenderChoose(); }, () => { onChange(v); csMatchRenderChoose(); });
      });
      // A linha inteira marca/desmarca, menos as listas de valor
      row.addEventListener("click", (e) => { if (e.target === box || (e.target.closest && e.target.closest(".cs-match-vals"))) return; box.checked = !box.checked; box.dispatchEvent(new Event("change")); });
      const name = el("span", "cs-match-name");
      const hintEl = el("span", "cs-match-hint", hint);
      name.append(el("b", "cs-match-label", label), hintEl);
      if (keys) {
        // A explicação vira o porquê do valor ("Closest to the average…"); com mais de um valor, cada um com o nome
        const vals = el("div", "cs-match-vals");
        const notes = [];
        keys.forEach(([key, title]) => {
          const p = csMatchPropose(key);
          const pair = el("label", "cs-match-val");
          pair.title = title;
          if (!p) { pair.appendChild(csText("—", "na", "Not changeable from the app on at least two cameras")); vals.appendChild(pair); return; }
          const chosen = matchWin.targets[key] !== undefined && p.options.some(([x, , d]) => x === matchWin.targets[key] && !d) ? matchWin.targets[key] : p.value;
          const sel = csSelect(p.options, chosen, (v) => {
            const prev = matchWin.targets[key];
            const text = (x) => (p.options.find(([o]) => o === x) || ["", x])[1];
            const set = (x) => { if (x === undefined) delete matchWin.targets[key]; else matchWin.targets[key] = x; csMatchRenderChoose(); };
            set(v);
            csMatchRecord(title + " → " + text(v), () => set(prev), () => set(v));
          }, "match-val" + (chosen !== p.value ? " mine" : ""));
          sel.title = chosen !== p.value ? "Your choice (the app would pick " + (p.options.find(([x]) => x === p.value) || ["", "—"])[1] + ")" : p.note;
          pair.appendChild(sel);
          vals.appendChild(pair);
          if (chosen !== p.value) notes.push(title + ": your choice");
          else if (p.note && !notes.includes(p.note)) notes.push(p.note);
        });
        if (notes.length) hintEl.textContent = notes.join(" · ");
        // Layout G (decisão do dono, 2026-11-02): uma linha por item, as listas à direita no lugar do "Set"
        vals.classList.add("aside"); if (keys.length > 1) vals.classList.add("multi"); row.append(box, name, vals); return row;
      }
      row.append(box, name, el("span", "cs-match-sum", sum));
      return row;
    };
    MATCH_ITEMS.forEach(([key, , label, hint, kind]) => {
      (kind === "set" ? left : right).appendChild(item(!!c[key], label, hint, kind === "set" ? "Set" : "Measured", (v) => { c[key] = v; csMatchSaveChoices(); csMatchCount(); }, kind === "set" ? MATCH_SET_KEYS[key] : null));
    });
    right.appendChild(item(!!c.grayCard, "Use the gray card", "the app measures only the card; you check where it is after the first photo", "Option", (v) => { c.grayCard = v; csMatchSaveChoices(); }));
    // Modelos misturados (decisão do dono, 2026-11-02, opção A): bloco "Camera models" na coluna da direita.
    // Sem calibração da cartela: aviso âmbar com "Calibrate with chart"; calibrados: uma linha com "Recalibrate".
    // O botão do rodapé do Camera settings continua.
    {
      const styleCams = camSettings.filter((c) => c.adjustable && c.styleDetail && cameras.some((x) => x.name === c.camera && x.connected));
      const models = [...new Set(styleCams.map((c) => c.model))];
      const missing = models.filter((m) => !styleCams.some((c) => c.model === m && c.chart));
      if (models.length > 1) {
        right.appendChild(el("div", "cs-match-coltitle cs-match-models", "Camera models"));
        const warn = el("div", "cs-match-info" + (missing.length ? " warn" : " done"));
        const b = el("button", "btn btn-secondary btn-small", missing.length ? "Calibrate with chart" : "Recalibrate"); b.type = "button";
        // A janela Match fica atrás da explicação; só sai quando a calibração começa (Start) e volta no fim
        b.addEventListener("click", () => { matchWin.returnAfterChart = true; csChartIntro(() => { matchWin.returnAfterChart = false; }); });
        const text = el("span", "", missing.length
          ? (missing.length === models.length ? models : missing).map(shortModel).join(" and ") + (missing.length === 1 ? " has" : " have") + " not been calibrated with the chart. Without it, Contrast, Saturation and Color tone only get the same value on every camera, and different models may still look a little different. It is done once per camera model."
          : models.map(shortModel).join(" and ") + " are calibrated with the chart: Match automatically uses it for Contrast, Saturation and Color tone.");
        warn.append(text, b);
        right.appendChild(warn);
      }
    }
    body.appendChild(grid);
    csMatchCount();
  }
  function csMatchCount() {
    if (matchWin.step !== 1) return;
    const c = csMatchChoices();
    const n = MATCH_ITEMS.filter(([key]) => c[key]).length;
    $("csMatchNote").textContent = n + " of " + MATCH_ITEMS.length + " settings selected";
    $("csMatchGo").disabled = n === 0;
  }
  function csMatchStart() {
    csMatchSetStep(2);
    $("csMatchBody").className = "cs-match-body progress";
    $("csMatchSub").textContent = "Taking test photos. The cameras are changed only to measure; they go back to how they were before you review.";
    $("csMatchNote").textContent = "";
    $("csMatchGo").disabled = false;
    const body = $("csMatchBody");
    body.innerHTML = "";
    const box = el("div", "cs-match-progress");
    box.appendChild(el("div", "cs-match-stage", "Taking a photo with each camera"));
    const bar = el("div", "cs-match-bar"); bar.appendChild(el("div", "cs-match-bar-fill")); box.appendChild(bar);
    box.appendChild(el("div", "cs-match-shot", ""));
    body.appendChild(box);
    matchWin.before = csSnapshot();
    $("csAuto").checked = true;
    $("csCard").checked = !!csMatchChoices().grayCard;
    csTakeTest();
  }
  function csMatchProgress(e) {
    if (matchWin.step !== 2) return;
    const stage = $("csMatchBody").querySelector(".cs-match-stage"), fill = $("csMatchBody").querySelector(".cs-match-bar-fill"), shot = $("csMatchBody").querySelector(".cs-match-shot");
    if (stage) stage.textContent = e.stage;
    if (fill) fill.style.width = Math.round((e.shot / Math.max(1, e.shots)) * 100) + "%";
    if (shot) shot.textContent = "Photo " + e.shot + " of up to " + e.shots;
  }
  // Passo 3: o resultado veio, as câmeras já voltaram ao "antes"
  function csMatchReview(e) {
    const notes = e.notes || [];
    matchWin.result = e;
    if (!e.ok || !e.matched) {
      dialog(e.matched ? "Matching did not finish" : "Not matched automatically", [e.error || "Try again."].concat(notes).join("\n\n"), [{ label: "OK", primary: true }]);
      log("Match automatically did not finish", "warn", e.error);
      csMatchClose();
      return;
    }
    const changes = e.changes || [];
    // Proporção real de cada foto contra a informada (Parte 2 da Proporção): fica para a tabela do Camera settings
    csTest.ratios = {};
    (e.ratios || []).forEach((r) => { csTest.ratios[r.camera] = r; });
    csGallery.refreshMarks();
    const wrong = (e.ratios || []).filter((r) => r.differs);
    if (wrong.length) log("Aspect ratio: " + wrong.map((r) => r.camera + " shot " + r.shot + " but reports " + r.reported).join(" · "), "warn");
    matchWin.picked = new Set(changes.map((c) => c.camera));
    matchWin.cam = changes.length ? changes[0].camera : (placedCameras()[0] || {}).name;
    csMatchSetStep(3);
    matchWin.revealCtrls = true;
    $("csMatchBody").className = "cs-match-body review";
    $("csMatchSub").textContent = changes.length
      ? plural(changes.length, "camera would change", "cameras would change") + " · nothing has been changed on the cameras yet"
      : "The cameras already look alike. Nothing to change.";
    csMatchRenderReview();
    if (e.debugFolder) log("Debug data saved", "tech", e.debugFolder);
  }
  // Fotos do teste: a primeira sessão é o "antes", a última o "depois"
  function csMatchSessions() {
    const list = (csTest.sessions || []).slice().sort((a, b) => (a.name < b.name ? -1 : 1));
    return { before: list[0] || null, after: list[list.length - 1] || null };
  }
  function csMatchPhoto(session, camName, size) {
    if (!session) return Promise.resolve(null);
    const photos = session.photos.filter((p) => p.camera === camName);
    const pick = photos.find((p) => /\.jpe?g$/i.test(p.file)) || photos.find((p) => p.previewable) || photos[0];
    if (!pick) return Promise.resolve(null);
    return orderPhoto(session.name, pick.file, size);
  }
  function csMatchRenderReview() {
    const e = matchWin.result;
    const changes = e.changes || [];
    const body = $("csMatchBody");
    body.innerHTML = "";
    const wrap = el("div", "cs-review");
    // Tabela: uma linha por câmera
    const table = el("div", "cs-review-table");
    const head = el("div", "cs-review-head");
    const allBox = document.createElement("input"); allBox.type = "checkbox"; allBox.className = "cs-check"; allBox.setAttribute("aria-label", "All cameras");
    const syncAll = () => { const n = changes.filter((c) => matchWin.picked.has(c.camera)).length; allBox.checked = changes.length > 0 && n === changes.length; allBox.indeterminate = n > 0 && n < changes.length; };
    syncAll();
    allBox.disabled = !changes.length;
    allBox.addEventListener("click", (ev) => ev.stopPropagation());
    allBox.addEventListener("change", () => {
      const prev = new Set(matchWin.picked), next = new Set(allBox.checked ? changes.map((c) => c.camera) : []);
      matchWin.picked = next; csMatchRenderReview();
      csMatchRecord(allBox.checked ? "Apply to all cameras" : "Apply to no camera", () => { matchWin.picked = new Set(prev); csMatchRenderReview(); }, () => { matchWin.picked = new Set(next); csMatchRenderReview(); });
    });
    head.append(allBox, el("span", "", "Camera"), el("span", "", "Changes"), el("span", "cs-review-th-after", "After"));
    table.appendChild(head);
    const rowsBox = el("div", "cs-review-rows");  // as linhas rolam aqui dentro; a prévia à direita não cresce com elas
    table.appendChild(rowsBox);
    const { before, after } = csMatchSessions();
    placedCameras().filter((c) => c.connected).forEach((cam) => {
      const ch = changes.find((x) => x.camera === cam.name);
      const row = el("div", "cs-review-row" + (ch ? "" : " same") + (matchWin.cam === cam.name ? " current" : ""));
      row.tabIndex = matchWin.cam === cam.name ? 0 : -1;  // o Tab para uma vez na lista; ↑ ↓ andam pelas câmeras
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", matchWin.cam === cam.name ? "true" : "false");
      const box = document.createElement("input"); box.type = "checkbox"; box.className = "cs-check"; box.tabIndex = -1;
      box.checked = !!ch && matchWin.picked.has(cam.name); box.disabled = !ch;
      box.setAttribute("aria-label", "Apply to " + cam.name);
      box.addEventListener("click", (ev) => ev.stopPropagation());
      const pick = (on) => { if (on) matchWin.picked.add(cam.name); else matchWin.picked.delete(cam.name); box.checked = on; syncAll(); csMatchFootNote(); csMatchSyncMinis(); };
      box.addEventListener("change", () => { const v = box.checked; pick(v); csMatchRecord("Apply to " + cam.name + (v ? " on" : " off"), () => { if (box.isConnected) pick(!v); else { if (v) matchWin.picked.delete(cam.name); else matchWin.picked.add(cam.name); csMatchRenderReview(); } }, () => { if (box.isConnected) pick(v); else { if (v) matchWin.picked.add(cam.name); else matchWin.picked.delete(cam.name); csMatchRenderReview(); } }); });
      const name = el("span", "cs-review-name"); name.append(el("b", "", pad(cam.order)), document.createTextNode(" " + cam.name));
      const list = el("span", "cs-review-changes");
      if (ch) ch.items.forEach(([what, from, to]) => { const it = el("span", "cs-review-change"); it.append(el("s", "", from), el("span", "to", to)); it.title = what; list.appendChild(it); });
      else list.appendChild(el("span", "cs-review-none", changes.length && cam.name === (changes[0] || {}).camera ? "reference" : "no change"));
      const ratio = csTest.ratios[cam.name];
      if (ratio && ratio.differs) {
        const w = el("span", "cs-review-ratio", "Shot " + ratio.shot + " · camera reports " + ratio.reported);
        w.title = "The test photo came out " + ratio.shot + ", but the camera says its aspect ratio is " + ratio.reported + ". Check the camera menu (some settings only apply to JPEG, not RAW).";
        list.appendChild(w);
      }
      const thumb = el("span", "cs-review-thumb" + (ch ? " changed" : "") + (ratio && ratio.differs ? " ratio-warn" : ""));
      csMatchPhoto(after, cam.name, 320).then((url) => { if (url) thumb.style.backgroundImage = "url(" + url + ")"; });
      row.append(box, name, list, thumb);
      row.addEventListener("click", () => { matchWin.cam = cam.name; csMatchRenderReview(); });
      row.matchBox = ch ? box : null;  // (teclado: ↑ ↓ e Espaço tratados no documento, antes do tratador do Camera settings)
      rowsBox.appendChild(row);
    });
    const tnote = el("div", "cs-review-tnote", "Click a row to see that camera on the right. Play runs the whole sequence, before and after at once. Untick a camera to keep it as it is.");
    table.appendChild(tnote);
    wrap.appendChild(table);
    // Fotos: a câmera escolhida, antes e depois
    const photos = el("div", "cs-review-photos");
    const top = el("div", "cs-review-top");
    const camLabel = el("span", "cs-review-cam", matchWin.cam || "");
    const ctrls = el("div", "cs-review-ctrls");
    const prev = button("", () => csMatchStep(-1), { icon: "left", title: "Previous camera" });
    const play = button("", () => csMatchTogglePlay(), { icon: matchWin.playing ? "pause" : "play", title: matchWin.playing ? "Pause" : "Play the sequence" });
    play.classList.add("cs-review-play");
    const next = button("", () => csMatchStep(1), { icon: "right", title: "Next camera" });
    // Velocidade: muda o texto e o ritmo do play no lugar, sem redesenhar a janela (os controles não piscam)
    const speed = el("span", "cs-review-speed");
    const showSpeed = () => { const v = PLAY_SPEEDS[speedIndex]; speed.textContent = (v % 1 === 0 ? v.toFixed(1) : String(v)) + "x"; slower.disabled = speedIndex === 0; faster.disabled = speedIndex === PLAY_SPEEDS.length - 1; };
    const setSpeed = (d) => { speedIndex = Math.max(0, Math.min(PLAY_SPEEDS.length - 1, speedIndex + d)); renderSpeed(); showSpeed(); csMatchRestartPlay(); };
    const slower = button("", () => setSpeed(-1), { icon: "minus", title: "Slower" });
    const faster = button("", () => setSpeed(1), { icon: "plus", title: "Faster" });
    showSpeed();
    const rev = el("label", "cs-review-rev log-option"); const revBox = document.createElement("input"); revBox.type = "checkbox"; revBox.checked = reverseLoop.checked;
    revBox.addEventListener("change", () => { reverseLoop.checked = revBox.checked; });
    rev.append(revBox, document.createTextNode(" Reverse loop"));
    ctrls.append(prev, play, next, el("span", "cs-review-speedlabel", "Speed"), slower, speed, faster, rev);
    // Os controles não arrastam a cortina nem viram a foto (Flip)
    ["pointerdown", "click"].forEach((t) => ctrls.addEventListener(t, (ev) => ev.stopPropagation()));
    const modes = el("div", "cs-review-modes");
    [["split", "Split"], ["side", "Side by side"], ["flip", "Flip"]].forEach(([m, label]) => {
      const b = el("button", "cs-review-mode" + (matchWin.mode === m ? " on" : ""), label); b.type = "button";
      b.addEventListener("click", () => { matchWin.mode = m; csMatchRenderReview(); });
      modes.appendChild(b);
    });
    top.append(camLabel, modes);
    photos.appendChild(top);
    const stage = el("div", "cs-review-stage " + matchWin.mode);
    const showCtrls = fadeControls(stage, ctrls);
    if (matchWin.revealCtrls) { matchWin.revealCtrls = false; setTimeout(() => showCtrls(CTRLS_REVEAL_MS), 0); }  // ao chegar no passo 3, já aparecem
    const imgB = el("div", "cs-review-img before"), imgA = el("div", "cs-review-img after");
    imgB.appendChild(el("span", "cs-review-tag", "Before")); imgA.appendChild(el("span", "cs-review-tag on", "After"));
    const ch = changes.find((x) => x.camera === matchWin.cam);
    if (ch) { imgB.querySelector(".cs-review-tag").textContent = "Before · " + ch.items.map((i) => i[1]).join(" · "); imgA.querySelector(".cs-review-tag").textContent = "After · " + ch.items.map((i) => i[2]).join(" · "); }
    csMatchPhoto(before, matchWin.cam, 1600).then((url) => { if (url) imgB.style.backgroundImage = "url(" + url + ")"; });
    csMatchPhoto(after, matchWin.cam, 1600).then((url) => { if (url) imgA.style.backgroundImage = "url(" + url + ")"; });
    stage.prepend(imgB, imgA);
    if (matchWin.mode === "split") {
      imgA.style.clipPath = "inset(0 0 0 " + matchWin.split + "%)";
      const handle = el("div", "cs-review-handle"); handle.style.left = matchWin.split + "%";
      const knob = el("span", "cs-review-knob"); knob.innerHTML = icon("curtain", 16); handle.appendChild(knob);
      stage.appendChild(handle);
      let dragging = false;
      const move = (ev) => { const r = stage.getBoundingClientRect(); matchWin.split = Math.max(2, Math.min(98, ((ev.clientX - r.left) / r.width) * 100)); imgA.style.clipPath = "inset(0 0 0 " + matchWin.split + "%)"; handle.style.left = matchWin.split + "%"; };
      stage.addEventListener("pointerdown", (ev) => { ev.preventDefault(); dragging = true; stage.setPointerCapture(ev.pointerId); move(ev); });
      stage.addEventListener("pointermove", (ev) => { if (dragging) move(ev); });
      stage.addEventListener("pointerup", () => { dragging = false; });
      stage.addEventListener("pointercancel", () => { dragging = false; });
      stage.addEventListener("dblclick", () => { matchWin.split = 50; imgA.style.clipPath = "inset(0 0 0 50%)"; handle.style.left = "50%"; });  // dois cliques: cortina no centro
    } else if (matchWin.mode === "flip") {
      stage.classList.toggle("show-after", !!matchWin.flipAfter);
      stage.title = "Click to switch between before and after";
      stage.addEventListener("click", () => { matchWin.flipAfter = !matchWin.flipAfter; stage.classList.toggle("show-after", !!matchWin.flipAfter); });
    }
    photos.appendChild(stage);
    // Fileiras de miniaturas: antes e depois
    // Fileira de miniaturas: cada uma com a metade esquerda do "antes" e a direita do "depois";
    // fora do Tab (← → trocam de câmera, como na tela principal)
    const strip = el("div", "cs-review-strip");
    placedCameras().filter((c) => c.connected).forEach((cam) => {
      const chg = changes.some((x) => x.camera === cam.name);
      const t = el("button", "cs-review-mini" + (chg ? " changed" : "") + (matchWin.cam === cam.name ? " current" : "") + (chg && matchWin.picked.has(cam.name) ? "" : " off") + (csTest.ratios[cam.name] && csTest.ratios[cam.name].differs ? " ratio-warn" : "")); t.type = "button"; t.tabIndex = -1;
      t.title = cam.name + " · before (left) and after (right)"; t.setAttribute("aria-label", cam.name); t.dataset.cam = cam.name;
      const half = (cls) => { const h = el("span", "cs-review-half " + cls); t.appendChild(h); return h; };
      const hb = half("before"), ha = half("after");
      t.appendChild(el("span", "cs-review-minilabel", pad(cam.order)));
      csMatchPhoto(before, cam.name, 320).then((url) => { if (url) hb.style.backgroundImage = "url(" + url + ")"; });
      csMatchPhoto(after, cam.name, 320).then((url) => { if (url) ha.style.backgroundImage = "url(" + url + ")"; });
      t.addEventListener("click", () => { matchWin.cam = cam.name; csMatchRenderReview(); });
      strip.appendChild(t);
    });
    photos.appendChild(strip);
    wrap.appendChild(photos);
    body.appendChild(wrap);
    csMatchFootNote();
  }
  // Miniaturas: câmera desmarcada (ou sem mudança) mostra só o "antes", inteiro
  function csMatchSyncMinis() {
    const changes = (matchWin.result && matchWin.result.changes) || [];
    $("csMatchBody").querySelectorAll(".cs-review-mini").forEach((m) => { const n = m.dataset.cam; m.classList.toggle("off", !(changes.some((x) => x.camera === n) && matchWin.picked.has(n))); });
  }
  function csMatchFootNote() {
    const n = matchWin.picked.size;
    $("csMatchNote").textContent = "After Apply, one " + (upd.info && upd.info.os === "windows" ? "Ctrl+Z" : "⌘Z") + " brings every camera back.";
    $("csMatchGo").textContent = n ? "Apply to " + plural(n, "camera", "cameras") : "Apply";
    $("csMatchGo").disabled = n === 0;
  }
  // ‹ › e as setas: como na tela cheia da sessão, param o play e andam uma câmera (sem redesenhar a janela)
  function csMatchStep(d, focusRow) {
    const cams = placedCameras().filter((c) => c.connected).map((c) => c.name);
    const i = cams.indexOf(matchWin.cam);
    if (!cams.length) return;
    if (matchWin.playing) csMatchStopPlay();
    matchWin.cam = cams[(i + d + cams.length) % cams.length];
    csMatchSwapPhotos();
    const m = $("csMatchBody").querySelector(".cs-review-mini.current");
    if (m) m.scrollIntoView({ block: "nearest", inline: "nearest" });  // (o play não rola; ‹ › e as setas sim)
    if (focusRow) { const r = $("csMatchBody").querySelector(".cs-review-row.current"); if (r) r.focus({ preventScroll: false }); }
  }
  function csMatchPlayButton() {
    const b = $("csMatchBody").querySelector(".cs-review-play");
    if (!b) return;
    b.innerHTML = icon(matchWin.playing ? "pause" : "play");
    b.title = matchWin.playing ? "Pause" : "Play the sequence"; b.setAttribute("aria-label", b.title);
  }
  function csMatchStopPlay() { clearInterval(matchWin.playing); matchWin.playing = 0; csMatchPlayButton(); }
  function csMatchPlayTick() {
    const cams = placedCameras().filter((c) => c.connected).map((c) => c.name);
    if (cams.length < 2 || matchWin.step !== 3) { csMatchStopPlay(); return; }
    let i = cams.indexOf(matchWin.cam);
    if (!reverseLoop.checked) i = (i + 1) % cams.length;
    else { i += matchWin.dir; if (i >= cams.length) { matchWin.dir = -1; i = cams.length - 2; } else if (i < 0) { matchWin.dir = 1; i = 1; } }
    matchWin.cam = cams[i];
    csMatchSwapPhotos();
  }
  // Velocidade mudou no meio do play: continua, no ritmo novo
  function csMatchRestartPlay() { if (!matchWin.playing) return; clearInterval(matchWin.playing); matchWin.playing = setInterval(csMatchPlayTick, playInterval()); }
  function csMatchTogglePlay() {
    if (matchWin.playing) { csMatchStopPlay(); return; }
    matchWin.dir = 1;
    matchWin.playing = setInterval(csMatchPlayTick, playInterval());
    csMatchPlayButton();
  }
  // Controles sobre uma prévia: aparecem quando o mouse se mexe sobre ela e somem 2 s depois de parado (ou ao
  // sair); em cima deles não somem; com o foco do teclado neles, ficam (CSS :focus-within). Clicar neles não
  // chega à prévia (não arrasta a cortina nem vira a foto).
  function fadeControls(stage, ctrls) {
    stage.appendChild(ctrls);
    let hideTimer = 0;
    // show(ms): mostra e some depois de ms parado (2 s pelo mouse; mais ao entrar na tela, para a pessoa ver que existem)
    const show = (ms) => { ctrls.classList.add("show"); clearTimeout(hideTimer); hideTimer = setTimeout(() => ctrls.classList.remove("show"), typeof ms === "number" ? ms : 2000); };
    stage.addEventListener("pointermove", () => show());
    stage.addEventListener("pointerenter", () => show());
    stage.addEventListener("pointerleave", () => { clearTimeout(hideTimer); ctrls.classList.remove("show"); });
    ctrls.addEventListener("pointermove", (ev) => { ev.stopPropagation(); ctrls.classList.add("show"); clearTimeout(hideTimer); });
    ["pointerdown", "click", "dblclick"].forEach((t) => ctrls.addEventListener(t, (ev) => ev.stopPropagation()));
    return show;
  }
  const CTRLS_REVEAL_MS = 4000;  // ao entrar na tela cheia / no passo 3: os controles já aparecem e ficam 4 s
  // Tocando: só as fotos trocam (sem redesenhar tudo a cada passo)
  function csMatchSwapPhotos() {
    const { before, after } = csMatchSessions();
    const body = $("csMatchBody");
    const imgB = body.querySelector(".cs-review-img.before"), imgA = body.querySelector(".cs-review-img.after");
    const label = body.querySelector(".cs-review-cam");
    if (label) label.textContent = matchWin.cam;
    body.querySelectorAll(".cs-review-row").forEach((r) => { const on = r.querySelector(".cs-review-name") && r.querySelector(".cs-review-name").textContent.trim().endsWith(matchWin.cam); r.classList.toggle("current", on); r.tabIndex = on ? 0 : -1; });
    body.querySelectorAll(".cs-review-mini").forEach((m) => m.classList.toggle("current", m.dataset.cam === matchWin.cam));
    csMatchPhoto(before, matchWin.cam, 1600).then((url) => { if (url && imgB) imgB.style.backgroundImage = "url(" + url + ")"; });
    csMatchPhoto(after, matchWin.cam, 1600).then((url) => { if (url && imgA) imgA.style.backgroundImage = "url(" + url + ")"; });
  }
  // Apply: só as câmeras marcadas; um passo no Desfazer para todas
  function csMatchApply() {
    const e = matchWin.result;
    if (!e) return;
    const chosen = (e.changes || []).filter((c) => matchWin.picked.has(c.camera));
    if (!chosen.length) return;
    const before = matchWin.before || csSnapshot();
    const applyAll = () => { csRecord = false; try { chosen.forEach((c) => (c.apply || []).forEach(([key, value]) => csSet(c.camera, key, value))); } finally { csRecord = true; } return true; };
    applyAll();
    recordAction({ label: "Match automatically (" + plural(chosen.length, "camera", "cameras") + ")", camera: true,
      undo: () => csRestore(before), redo: () => applyAll() });
    toast("Matched: " + plural(chosen.length, "camera", "cameras") + " changed");
    log("Match automatically: " + plural(chosen.length, "camera", "cameras") + " changed" + (chosen.length < (e.changes || []).length ? " (" + ((e.changes || []).length - chosen.length) + " kept as they were)" : ""), "ok");
    csMatchClose();
  }
  $("csMatchBtn").addEventListener("click", csMatchOpen);
  $("csMatchCancel").addEventListener("click", () => { if (csTest.capturing && !csTest.cancelling) csTakeTest(); csMatchClose(); });
  $("csMatchBack").addEventListener("click", () => { csMatchStopPlay(); csMatchRenderChoose(); });
  $("csMatchKeep").addEventListener("click", () => { log("Match automatically: result not applied", "ok"); csMatchClose(); });
  $("csMatchGo").addEventListener("click", () => {
    if (matchWin.step === 1) csMatchStart();
    else if (matchWin.step === 2) { if (csTest.capturing && !csTest.cancelling) csTakeTest(); }
    else if (matchWin.step === 3) csMatchApply();
  });
  // Sair no meio (Esc, clique fora, Done): no passo 2 e no 3 pergunta antes (decisão do dono, 2026-11-02)
  function csMatchLeave(then) {
    if (matchWin.step === 2)
      dialog("Leave Match automatically?", "The test shot is still running. Leaving cancels it and the cameras stay as they were.",
        [{ label: "Keep matching" }, { label: "Leave and cancel", primary: true, onClick: then }]);
    else if (matchWin.step === 3)
      dialog("Leave without applying?", "The result has not been applied to the cameras yet. You can still apply it, or discard the changes.",
        [{ label: "Stay" }, { label: "Leave without applying", primary: true, onClick: then }]);
    else then();
  }
  document.addEventListener("keydown", (e) => {
    // Passo 3 pelo teclado (aqui, na captura: o tratador do Camera settings para as teclas): ← → trocam de
    // câmera; na linha da lista, ↑ ↓ também e Espaço marca/desmarca a câmera
    if (matchWin.step === 3 && !$("csMatch").classList.contains("hidden") && $("dialogOverlay").classList.contains("hidden") && !selectMenu && !openMenu) {
      const onRow = e.target.classList && e.target.classList.contains("cs-review-row");
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.tagName !== "SELECT") {
        e.preventDefault(); e.stopImmediatePropagation();
        csMatchStep(e.key === "ArrowLeft" ? -1 : 1, onRow);
        return;
      }
      if (onRow && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault(); e.stopImmediatePropagation();
        csMatchStep(e.key === "ArrowUp" ? -1 : 1, true);
        return;
      }
      if (onRow && (e.key === " " || e.key === "Enter")) {
        e.preventDefault(); e.stopImmediatePropagation();
        const box = e.target.matchBox;
        if (box) { box.checked = !box.checked; box.dispatchEvent(new Event("change")); }
        return;
      }
    }
    // Enter numa caixa de marcar da janela (passo 1 e cabeçalho do passo 3): marca/desmarca, como o Espaço
    if (!$("csMatch").classList.contains("hidden") && e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type === "checkbox" && $("csMatch").contains(e.target) && $("dialogOverlay").classList.contains("hidden")) {
      e.preventDefault(); e.stopImmediatePropagation();
      e.target.click();
      return;
    }
    if (e.key !== "Escape" || $("csMatch").classList.contains("hidden") || csCardOpen() || selectMenu || !$("dialogOverlay").classList.contains("hidden")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    csMatchLeave(() => {
      if (matchWin.step === 2) { if (csTest.capturing && !csTest.cancelling) csTakeTest(); }
      csMatchClose();
    });
  }, true);

  // ----- Cartão cinza: o app achou o cartão em cada foto; a pessoa confere ou clica nele -----
  const csCard = { regions: {}, mode: "card", quads: {}, moved: {} };
  function csCardHide() { $("csCardPick").classList.add("hidden"); }
  function csCardOpen() { return !$("csCardPick").classList.contains("hidden"); }
  function csCardBox(tile, r) {
    const box = tile.querySelector(".cs-card-box");
    const label = tile.querySelector(".cs-card-label");
    const found = r && r.found;
    box.style.display = found ? "" : "none";
    if (found) {
      box.style.left = (r.x0 * 100) + "%";
      box.style.top = (r.y0 * 100) + "%";
      box.style.width = ((r.x1 - r.x0) * 100) + "%";
      box.style.height = ((r.y1 - r.y0) * 100) + "%";
    }
    label.textContent = tile.dataset.title + (found ? "" : " · not found, click the card");
    label.classList.toggle("missing", !found);
  }
  function csCardStatus() {
    if (csCard.mode === "chart") return csChartStatus();
    const all = Object.keys(csCard.regions);
    const found = all.filter((k) => csCard.regions[k] && csCard.regions[k].found).length;
    $("csCardStatus").textContent = found + " of " + all.length + " cameras with the card marked";
    $("csCardContinue").disabled = found < 2;
  }
  function csCardShow(list, regions) {
    csCard.mode = "card";
    $("csCardTitle").textContent = "Gray card";
    $("csCardText").textContent = "Check that the box is on the gray card in every photo. If it is wrong or missing, click the card in that photo, or drag to draw a box over it.";
    const session = (list || [])[0];
    csCard.regions = {};
    regions.forEach((r) => { csCard.regions[r.camera] = r; });
    const grid = $("csCardGrid");
    grid.innerHTML = "";
    placedCameras().filter((c) => c.connected && csCard.regions[c.name]).forEach((cam) => {
      const photos = session ? session.photos.filter((p) => p.camera === cam.name) : [];
      const pick = photos.find((p) => /\.jpe?g$/i.test(p.file)) || photos.find((p) => p.previewable);
      const tile = document.createElement("div");
      tile.className = "cs-card-tile";
      tile.dataset.title = shortModel(cam.model) + " · " + cam.name;
      tile.innerHTML = '<div class="cs-card-photo"><img alt=""><div class="cs-card-box"></div></div><div class="cs-card-label"></div>';
      const img = tile.querySelector("img");
      if (session && pick) orderPhoto(session.name, pick.file, 900).then((url) => { if (url) img.src = url; });
      // Clicar: o app acha o cartão em volta do ponto. Arrastar: a pessoa desenha a área.
      img.draggable = false;
      const photoEl = tile.querySelector(".cs-card-photo");
      const at = (e) => {
        const rect = img.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                 y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)), ok: rect.width > 0 && rect.height > 0 };
      };
      const apply = (r) => {
        if (!r) return;
        csCard.regions[cam.name] = r;
        csCardBox(tile, r);
        csCardStatus();
      };
      let drag = null;
      photoEl.addEventListener("dragstart", (e) => e.preventDefault());
      photoEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const p = at(e);
        if (!p.ok) return;
        drag = { x0: p.x, y0: p.y, sx: e.clientX, sy: e.clientY, moved: false };
        photoEl.setPointerCapture(e.pointerId);
      });
      photoEl.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.moved = true;
        const p = at(e);
        csCardBox(tile, { found: true, x0: Math.min(drag.x0, p.x), y0: Math.min(drag.y0, p.y), x1: Math.max(drag.x0, p.x), y1: Math.max(drag.y0, p.y) });
      });
      const finish = (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        const p = at(e);
        const k = (v) => String(Math.round(v * 1000));
        if (!d.moved) {
          Promise.resolve(window.grayCardFind(cam.name, k(p.x), k(p.y))).then(apply);
          return;
        }
        const x0 = Math.min(d.x0, p.x), y0 = Math.min(d.y0, p.y), x1 = Math.max(d.x0, p.x), y1 = Math.max(d.y0, p.y);
        if (x1 - x0 < 0.005 || y1 - y0 < 0.005) { csCardBox(tile, csCard.regions[cam.name]); return; }
        Promise.resolve(window.grayCardSet(cam.name, k(x0), k(y0), k(x1), k(y1))).then((r) => apply(r || csCard.regions[cam.name]));
      };
      photoEl.addEventListener("pointerup", finish);
      photoEl.addEventListener("pointercancel", () => { drag = null; csCardBox(tile, csCard.regions[cam.name]); });
      grid.appendChild(tile);
      csCardBox(tile, csCard.regions[cam.name]);
    });
    csCardStatus();
    csSetZoom(false);
    $("csCardSkip").classList.remove("hidden");
    $("csCardPick").classList.remove("hidden");
    csGallery.message("Waiting for you to check the gray card");
  }
  $("csCardContinue").addEventListener("click", () => {
    csCardHide();
    csGallery.message(csCard.mode === "chart" ? "Calibrating with the chart" : "Matching with the gray card");
    window.grayCardConfirm(0);
  });
  // Desistir do cartão no meio: o Match segue medindo a foto inteira
  $("csCardSkip").addEventListener("click", () => {
    csCardHide();
    csGallery.message("Matching without the gray card");
    log("Gray card skipped: matching with the whole photo", "ok");
    window.grayCardConfirm(1);
  });

  // ----- Cartela de cores: o app achou as 4 marcas; a pessoa confere ou arrasta os cantos -----
  // Cantos na ordem da cartela: 0 em cima à esquerda (o da bolinha), 1 em cima à direita,
  // 2 embaixo à direita, 3 embaixo à esquerda
  function csChartDraw(tile, q) {
    const svg = tile.querySelector("svg");
    const pts = [0, 1, 2, 3].map((k) => (q.x[k] * 100) + "," + (q.y[k] * 100)).join(" ");
    svg.querySelector("polygon").setAttribute("points", pts);
    tile.querySelectorAll(".cs-chart-handle").forEach((h, k) => {
      h.style.left = (q.x[k] * 100) + "%";
      h.style.top = (q.y[k] * 100) + "%";
    });
    const marked = q.found || csCard.moved[tile.dataset.camera];
    const label = tile.querySelector(".cs-card-label");
    label.textContent = tile.dataset.title + (marked ? "" : " · not found, drag the 4 dots onto the 4 corner marks");
    label.classList.toggle("missing", !marked);
    tile.classList.toggle("unmarked", !marked);
  }
  function csChartStatus() {
    const all = Object.keys(csCard.quads);
    const marked = all.filter((k) => csCard.quads[k].found || csCard.moved[k]).length;
    $("csCardStatus").textContent = marked + " of " + all.length + " cameras with the chart marked";
    $("csCardContinue").disabled = marked < 2;
  }
  function csChartShow(list, quads) {
    csCard.mode = "chart";
    csCard.quads = {};
    csCard.moved = {};
    quads.forEach((q) => { csCard.quads[q.camera] = q; });
    $("csCardTitle").textContent = "Chart";
    $("csCardText").textContent = "Check that the 4 dots are on the centers of the 4 corner marks in every photo. Dot 1 goes on the mark next to the small black dot. To fix one, drag it (or click where it should go).";
    const session = (list || [])[0];
    const grid = $("csCardGrid");
    grid.innerHTML = "";
    placedCameras().filter((c) => c.connected && csCard.quads[c.name]).forEach((cam) => {
      const photos = session ? session.photos.filter((p) => p.camera === cam.name) : [];
      const pick = photos.find((p) => /\.jpe?g$/i.test(p.file)) || photos.find((p) => p.previewable);
      const tile = document.createElement("div");
      tile.className = "cs-card-tile cs-chart-tile";
      tile.dataset.title = shortModel(cam.model) + " · " + cam.name;
      tile.dataset.camera = cam.name;
      tile.innerHTML = '<div class="cs-card-photo"><img alt="">' +
        '<svg class="cs-chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon></polygon></svg>' +
        [1, 2, 3, 4].map((n) => '<span class="cs-chart-handle' + (n === 1 ? " first" : "") + '">' + n + "</span>").join("") +
        '</div><div class="cs-card-label"></div>';
      const img = tile.querySelector("img");
      img.draggable = false;
      if (session && pick) orderPhoto(session.name, pick.file, 900).then((url) => { if (url) img.src = url; });
      const photoEl = tile.querySelector(".cs-card-photo");
      const at = (e) => {
        const rect = img.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                 y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)), ok: rect.width > 0 && rect.height > 0 };
      };
      let drag = -1;
      photoEl.addEventListener("dragstart", (e) => e.preventDefault());
      photoEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const p = at(e);
        if (!p.ok) return;
        const q = csCard.quads[cam.name];
        // O canto pego (ou o mais perto do clique) vai para onde está o ponteiro
        const handle = e.target.closest(".cs-chart-handle");
        drag = handle ? [...tile.querySelectorAll(".cs-chart-handle")].indexOf(handle)
                      : [0, 1, 2, 3].reduce((best, k) => (Math.hypot(q.x[k] - p.x, q.y[k] - p.y) < Math.hypot(q.x[best] - p.x, q.y[best] - p.y) ? k : best), 0);
        if (!handle) { q.x[drag] = p.x; q.y[drag] = p.y; csChartDraw(tile, q); }
        photoEl.setPointerCapture(e.pointerId);
      });
      photoEl.addEventListener("pointermove", (e) => {
        if (drag < 0) return;
        const p = at(e);
        const q = csCard.quads[cam.name];
        q.x[drag] = p.x;
        q.y[drag] = p.y;
        csChartDraw(tile, q);
      });
      const finish = () => {
        if (drag < 0) return;
        drag = -1;
        const q = csCard.quads[cam.name];
        csCard.moved[cam.name] = true;
        const args = [cam.name];
        for (let k = 0; k < 4; k++) args.push(String(Math.round(q.x[k] * 1000)), String(Math.round(q.y[k] * 1000)));
        Promise.resolve(window.chartSetQuad(...args)).then(() => { csChartDraw(tile, q); csChartStatus(); });
      };
      photoEl.addEventListener("pointerup", finish);
      photoEl.addEventListener("pointercancel", finish);
      grid.appendChild(tile);
      csChartDraw(tile, csCard.quads[cam.name]);
    });
    csChartStatus();
    csSetZoom(false);
    $("csCardSkip").classList.add("hidden");  // (a cartela não tem "pular")
    $("csCardPick").classList.remove("hidden");
    csGallery.message("Waiting for you to check the chart");
  }

  // Botão "Calibrate with chart": instruções, abrir a cartela e começar
  // onCancel: chamado se a pessoa desistir antes de começar (o Match reabre, se veio de lá)
  function csChartIntro(onCancel) {
    const cams = camSettings.filter((c) => c.adjustable && c.styleDetail && cameras.some((x) => x.name === c.camera && x.connected));
    const models = new Set(cams.map((c) => c.model));
    if (models.size < 2) {
      dialog("Calibrate with chart",
        "This compares camera models, so it needs at least two different models connected whose Picture Style can be changed from the app (for example, an SL3 and a T7).\n\n" +
        "Cameras of the same model already look alike: Match automatically is enough for them.",
        [{ label: "Open chart", link: true, onClick: () => { window.openChart(); csChartIntro(onCancel); } }, { label: "OK", primary: true, onClick: onCancel }]);
      return;
    }
    dialog("Calibrate with chart",
      "Makes cameras of different models look alike in contrast, saturation and color tone. Do it once for each new camera model; Match automatically then uses the result.\n\n" +
      "1. Click Open chart and print it at 100% (actual size, no scaling), on matte paper.\n" +
      "2. Put it where every camera sees the whole chart, including the 4 corner marks: flat, under even light, without glare. It should fill about a quarter of each photo or more.\n" +
      "3. Set the exposure so the chart looks normal in every camera (tip: run Test shot with Match automatically first).\n" +
      "4. Click Start. The app takes 4 photos, changing contrast, saturation and color tone, and then puts every setting back as it was.\n\n" +
      "After the first photo, you check that the chart corners are marked right.",
      [{ label: "Cancel", onClick: onCancel },
       { label: "Open chart", link: true, onClick: () => {
         Promise.resolve(window.openChart()).then((r) => { if (!r || !r.ok) toast("The chart file was not found. Build the app again."); });
         csChartIntro(onCancel);
       } },
       { label: "Start", primary: true, onClick: csChartStart }]);
  }
  function csChartStart() {
    const connected = cameras.filter((c) => c.connected).length;
    if (busy || !connected || csTest.capturing) return;
    if (matchWin.returnAfterChart) csMatchClose();  // veio do Match: a janela sai durante a calibração e volta no fim
    csTest.capturing = true;
    csTest.cancelling = false;
    csTest.has = false;
    csTest.mode = "chart";
    $("camSettingsOverlay").querySelector(".cs-sheet").classList.add("capturing");
    $("csTestBox").classList.remove("hidden", "has-photos");
    csSetZoom(false);
    csSetCollapsed(false);
    csGallery.setItems([]);
    csGallery.setHead("Chart calibration", "");
    csGallery.message("Taking a photo with each camera");
    updateButtons();
    window.chartCalibrate(intValue(ui.downloadWait, 1, 10));
  }
  $("csChart").addEventListener("click", () => { if (!csTest.capturing) csChartIntro(); });
  $("csCardCancel").addEventListener("click", () => {
    csCardHide();
    if (csTest.capturing) csTakeTest();  // o mesmo que o botão Cancel do Test shot
  });
  // ("Use gray card" e "Match automatically" saíram do rodapé: agora são o passo 1 da janela Match automatically)

  function showCsTest(list) {
    csTest.capturing = false;
    csTest.cancelling = false;
    csTest.has = true;
    $("camSettingsOverlay").querySelector(".cs-sheet").classList.remove("capturing");
    const session = (list || [])[0];
    // Uma foto por câmera, na ordem atual (JPEG quando houver RAW + JPEG)
    const items = placedCameras().filter((c) => c.connected).map((cam) => {
      const photos = session ? session.photos.filter((p) => p.camera === cam.name) : [];
      const pick = photos.find((p) => /\.jpe?g$/i.test(p.file)) || photos.find((p) => p.previewable) || photos[0];
      return { name: cam.name, session: session ? session.name : "", order: cam.order,
               file: pick ? pick.file : "", previewable: pick ? pick.previewable : false,
               title: shortModel(cam.model), subtitle: cam.name };
    });
    csGallery.setItems(items, 0);
    if (csTest.mode !== "chart" && csTest.mode !== "match") csMeasureRatios(items);
    $("csTestBox").classList.toggle("has-photos", items.length > 0);
    const missing = items.filter((i) => !i.file).length;
    csGallery.setHead(csTest.mode === "chart" ? "Chart calibration" : csTest.mode === "match" ? "Test shot · matched" : "Test shot",
      (missing ? plural(missing, "camera", "cameras") + " did not send a photo · " : "") + "Not saved · click a photo to enlarge · ← → to compare");
  }
  // Nome da proporção de uma foto: a mais perto entre 3:2, 4:3, 16:9 e 1:1 (como RatioName no programa)
  function ratioName(w, h) {
    if (!w || !h) return "";
    const r = Math.max(w, h) / Math.min(w, h);
    const known = [["3:2", 1.5], ["4:3", 4 / 3], ["16:9", 16 / 9], ["1:1", 1]];
    return known.reduce((best, k) => (Math.abs(k[1] - r) < Math.abs(best[1] - r) ? k : best))[0];
  }
  // Test shot simples: mede a proporção real de cada foto na prévia e compara com o que a câmera informa
  // (coluna Ratio), como o Match faz no programa. Resultado em csTest.ratios: célula Ratio, ícone de alerta,
  // seleção âmbar na fileira e linha na Activity.
  function csMeasureRatios(items) {
    const found = {};
    const probes = items.filter((i) => i.file && i.previewable).map((item) => orderPhoto(item.session, item.file, 320).then((url) => new Promise((done) => {
      if (!url) return done();
      const probe = new Image();
      probe.onload = () => { found[item.name] = ratioName(probe.naturalWidth, probe.naturalHeight); done(); };
      probe.onerror = () => done();
      probe.src = url;
    })));
    Promise.all(probes).then(() => {
      if (!csTest.has) return;  // as fotos já foram descartadas
      csTest.ratios = {};
      Object.keys(found).forEach((name) => {
        const c = camSettings.find((x) => x.camera === name);
        const a = c && c.settings && c.settings.aspect;
        const reported = a && a.available ? a.label : "";
        csTest.ratios[name] = { camera: name, shot: found[name], reported, differs: !!reported && reported !== found[name] };
      });
      const wrong = Object.values(csTest.ratios).filter((r) => r.differs);
      if (wrong.length) log("Aspect ratio: " + wrong.map((r) => r.camera + " shot " + r.shot + " but reports " + r.reported).join(" · "), "warn");
      csGallery.refreshMarks();
      csRender();
    });
  }
  function csDiscardTest() {
    if (!csTest.has && !csTest.capturing) return;
    csTest.has = false;
    csSetZoom(false);
    $("csTestBox").classList.add("hidden");
    $("csTestBox").classList.remove("has-photos");
    csGallery.setItems([]);
    if (!csTest.capturing) window.discardOrderPhotos();
    Object.keys(photoCache).filter((k) => k.startsWith("order/")).forEach((k) => delete photoCache[k]);
  }
  function closeCamSettings() {
    // No meio do Match automatically (foto de teste ou revisão): pergunta antes de fechar
    if (!$("csMatch").classList.contains("hidden") && (matchWin.step === 2 || matchWin.step === 3) && $("dialogOverlay").classList.contains("hidden")) { csMatchLeave(closeCamSettingsNow); return; }
    closeCamSettingsNow();
  }
  function closeCamSettingsNow() {
    matchWin.returnAfterChart = false;
    // Fechar esperando o cartão cinza: cancela (senão o Match ficaria esperando)
    if (csCardOpen()) $("csCardCancel").click();
    // Fechar no meio do Test shot, do Match ou da calibração: cancela também (as câmeras voltam
    // como estavam; sem isso o programa ficava esperando a conferência numa janela fechada)
    else if (csTest.capturing && !csTest.cancelling) csTakeTest();
    $("camSettingsOverlay").classList.add("hidden");
    csMatchClose();
    csStylePop = null;
    renderStylePop();
    clearInterval(csPoll);
    csPoll = 0;
    csDiscardTest();
  }
  // Com a janela aberta, lê as câmeras de novo a cada 3 s (mudanças feitas na própria
  // câmera aparecem sozinhas). Não lê durante fotos, mudanças ou com o app ocupado.
  function csPollTick() {
    if ($("camSettingsOverlay").classList.contains("hidden")) return;
    if (busy || csTest.capturing || csPending.size || !cameras.some((c) => c.connected)) return;
    window.readCameraSettings();
  }

  // A linha "All cameras" gruda logo abaixo do cabeçalho, na altura real dele. Com a janela ainda escondida a
  // medida dá 0 (a linha sumiria por baixo do cabeçalho): nesse caso fica para a próxima vez
  function csStickAllRow() {
    const table = $("csBody").querySelector("table.cs");
    const headRow = table && (table.querySelector("thead") || table.querySelector("tr"));
    if (!headRow) return;
    const h = headRow.getBoundingClientRect().height;
    if (h > 0) table.querySelectorAll("tr.all td").forEach((td) => { td.style.top = h + "px"; });
  }
  // A área que rola é encaixada num pixel inteiro da tela: a janela é centrada e pode cair em meio pixel, e aí o
  // recorte da rolagem e o cabeçalho preso arredondam para pixels diferentes (uma fresta por onde as linhas passam)
  function csSnapBody() {
    const body = $("csBody");
    if ($("camSettingsOverlay").classList.contains("hidden")) return;
    body.style.top = "0px";
    const r = body.getBoundingClientRect();
    const dy = Math.round(r.top) - r.top;
    body.style.top = (Math.abs(dy) < 0.01 ? 0 : dy) + "px";
  }
  window.addEventListener("resize", () => requestAnimationFrame(csSnapBody));
  if (window.ResizeObserver) new ResizeObserver(() => csSnapBody()).observe($("csBody"));
  $("camSettingsBtn").addEventListener("click", () => {
    renderCamSettings();
    $("camSettingsOverlay").classList.remove("hidden");
    csStickAllRow();
    requestAnimationFrame(csSnapBody);
    setTimeout(csSnapBody, 260);  // depois da animação de entrada da janela
    window.readCameraSettings();
    clearInterval(csPoll);
    csPoll = setInterval(csPollTick, 3000);
  });
  $("csTest").addEventListener("click", () => csTakeTest());
  $("csDone").addEventListener("click", closeCamSettings);
  $("csRead").addEventListener("click", () => window.readCameraSettings());
  $("csCopy").addEventListener("change", (e) => { if (e.target.value) copyFromCamera(e.target.value); });
  appSelect($("csCopy"));

  // Esc fecha o menu, o About e o Settings; com eles abertos, as teclas não
  // chegam à tela de trás. Windows: Ctrl+, abre o Settings.
  document.addEventListener("keydown", (e) => {
    if (!menuEl.list.classList.contains("hidden") && e.key === "Escape") {
      setMenuOpen(false);
      e.stopImmediatePropagation();
      return;
    }
    // Uma confirmação (ex.: "Calibrate with chart") por cima: o Esc fecha só ela
    if (overlayKeydown(e)) return;  // (já parou o evento)
    const open = ["aboutOverlay", "settingsOverlay", "camSettingsOverlay"].find((id) => !$(id).classList.contains("hidden"));
    if (open === "camSettingsOverlay" && csTest.has && e.target.tagName !== "SELECT" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "ArrowLeft") csGallery.prev(); else csGallery.next();
      return;
    }
    if (open) {
      if (e.key === "Escape") {
        if (open === "camSettingsOverlay" && csCardOpen()) $("csCardCancel").click();  // cartão cinza: Esc = Cancel
        else if (open === "camSettingsOverlay" && csStylePop) {
          const anchor = document.querySelector('.cs-more[data-style-cam="' + csStylePop.camera + '"]');
          csStylePop = null; renderStylePop();
          if (anchor) anchor.focus();
        }
        else if (open === "camSettingsOverlay" && csZoom) csSetZoom(false);  // primeiro fecha a foto grande
        else if (open === "camSettingsOverlay") closeCamSettings();
        else $(open).classList.add("hidden");
      }
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === "," && e.ctrlKey && upd.info && upd.info.os === "windows") {
      e.preventDefault();
      openSettings();
    }
  }, true);

  // ---- Clicar fora de uma janela flutuante = Cancel (ou fechar) ----
  // Só quando o clique começa e termina no fundo escuro (arrastar para fora não fecha).
  // Confirmação (dialog): o botão "de sair" é o "Cancel"; sem ele, o primeiro que não é o
  // principal (ex.: "Fix timing" ao lado de "Shoot anyway"); com um botão só, ele mesmo.
  function dialogCancelButton() {
    const buttons = [...ui.dialogActions.children];
    return buttons.find((x) => x.textContent === "Cancel") || buttons.find((x) => !x.classList.contains("btn-primary") && !x.classList.contains("btn-danger")) || (buttons.length === 1 ? buttons[0] : null);
  }
  const OVERLAY_CANCEL = {
    promptOverlay: () => $("promptCancel").click(),
    projectOverlay: () => closeProjectWindow(),
    projectPickOverlay: () => $("projectPickOverlay").classList.add("hidden"),
    exportOverlay: () => { if (!exp.waiting) askCloseExport(); },
    settingsOverlay: () => $("settingsOverlay").classList.add("hidden"),
    aboutOverlay: () => $("aboutOverlay").classList.add("hidden"),
    orderOverlay: () => ui.orderCancel.click(),
    camSettingsOverlay: () => closeCamSettings(),
    dialogOverlay: () => { const b = dialogCancelButton(); if (b) b.click(); },
  };
  Object.keys(OVERLAY_CANCEL).forEach((id) => {
    const overlay = $(id);
    if (!overlay) return;
    let downOutside = false;
    overlay.addEventListener("mousedown", (e) => { downOutside = e.target === overlay && e.button === 0; });
    overlay.addEventListener("mouseup", (e) => { if (downOutside && e.target === overlay) OVERLAY_CANCEL[id](); downOutside = false; });
  });
  // Teclado nas confirmações: Enter = o botão principal (verde), Esc = sair (como clicar fora).
  // Esc também fecha as outras janelas flutuantes; Enter só vale nas confirmações (dialog).
  // Chamada aqui (captura) e também no começo do tratador de teclas do Camera settings /
  // Settings / About, que é registrado antes e pararia o evento: devolve true se tratou.
  function overlayKeydown(e) {
    if (e.overlayHandled || openMenu) return false;
    const open = ["promptOverlay", "dialogOverlay", "projectPickOverlay", "projectOverlay", "exportOverlay", "orderOverlay"]
      .find((id) => !$(id).classList.contains("hidden"));
    if (!open) return false;
    // Settings ou About por cima (de qualquer janela): o Esc é deles; a janela de baixo continua como estava
    if (open !== "promptOverlay" && open !== "dialogOverlay" && ["settingsOverlay", "aboutOverlay"].some((id) => !$(id).classList.contains("hidden"))) return false;
    if (e.key === "Escape") {
      if (open === "promptOverlay") return false;  // o campo já trata Enter/Esc
      e.overlayHandled = true;
      e.preventDefault(); e.stopImmediatePropagation();
      // Dentro de "Align photos", o Esc volta ao Framing, como "Done aligning" (decisão do dono, 2026-11-04)
      if (open === "exportOverlay" && exp.step === 1 && exp.aligning && !exp.waiting) { exp.aligning = false; renderExport(); return true; }
      OVERLAY_CANCEL[open]();
      return true;
    }
    if (e.key === "Enter" && open === "dialogOverlay" && e.target.tagName === "BUTTON" && ui.dialogActions.contains(e.target)) {
      e.overlayHandled = true;
      e.preventDefault(); e.stopImmediatePropagation();
      e.target.click();  // o botão com o foco (Tab), não o principal
      return true;
    }
    if (e.key === "Enter" && open === "dialogOverlay" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      const primary = [...ui.dialogActions.children].filter((x) => x.classList.contains("btn-primary"));
      if (primary.length !== 1) return false;
      e.overlayHandled = true;
      e.preventDefault(); e.stopImmediatePropagation();
      primary[0].click();
      return true;
    }
    return false;  // outras teclas seguem o caminho normal (ex.: digitar num campo)
  }
  document.addEventListener("keydown", overlayKeydown, true);

  // =================== Project (etapa 17) ===================
  // A pasta escolhida pela pessoa onde as sessões ficam guardadas (docs/project.md). O app
  // manda o estado junto com a lista de sessões (evento "sessions", campo project).
  let project = { open: false };
  const projectSel = new Set();  // sessões marcadas na janela Project
  function setProject(p) {
    p = p || { open: false };
    // O tamanho (bytes) só vem quando a janela Project pede; nas outras atualizações fica o último
    if (p.open && p.bytes === undefined && project.open && project.folder === p.folder && project.bytes !== undefined) p.bytes = project.bytes;
    project = p;
    renderProjectBar();
    renderSessionList();
    if (!$("projectOverlay").classList.contains("hidden")) renderProjectWindow();
  }
  function fmtBytes(b) {
    if (!(b > 0)) return "";
    return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.round(b / 1e3) + " KB";
  }
  // Menu flutuante (fixo na tela, fecha ao clicar fora ou com Esc). items: {label, onClick, dim, html} ou "-"
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  // Menu do botão direito numa sessão: rótulo, projeto, apagar
  // =================== Etapa 20, pedaço 1: Edit in Lightroom Classic ===================
  // O app manda a sessão para o plugin do Stillpoint no Lightroom Classic (por arquivos, ver src/gui/adobe.h):
  // as fotos entram no catálogo no lugar onde estão, na coleção "Stillpoint › projeto › sessão", e o Lightroom
  // abre no Develop com a foto escolhida. Enquanto isso, um aviso "waiting for Lightroom" com Cancel.
  const lrJob = { id: null, timer: 0 };
  function lrCollectionTitle(s) {
    const l = sessionLabel(s.name);
    return [s.label, l.date, l.detail].filter(Boolean).join(" · ");
  }
  function sessionShort(s) { return s.label || sessionLabel(s.name).date; }
  function adobeMissingBuild() {
    if (typeof window.adobeEditInLightroom === "function") return false;
    toast("This build cannot open Lightroom Classic yet. Build the app again.", 8000);
    return true;
  }
  // Uma foto (menu da foto, botão sobre a foto grande): pergunta se vai a sessão inteira
  function editPhotoInLightroom(item) {
    if (adobeMissingBuild() || !item) return;
    const s = sessions.find((x) => x.name === (item.session || (currentSession && currentSession.name)));
    if (!s) return;
    const n = sessionItems(s).length;
    const num = pad(item.order || 1);
    dialog("Edit the whole session?", "Bullet time edits usually go on every photo of the session. Just this photo sends only photo " + num + " to Lightroom Classic; Edit the whole session sends all " + n + " and opens photo " + num + ".", [
      { label: "Cancel", link: true, left: true },
      { label: "Just this photo", onClick: () => startLightroom(s, item.group, "photo") },
      { label: "Edit the whole session", primary: true, onClick: () => startLightroom(s, item.group, "session") },
    ]);
  }
  function editSessionInLightroom(s) {
    if (adobeMissingBuild() || !s) return;
    const first = sessionItems(s)[0];
    // A sessão aberta: a foto ativa no Lightroom é a que está na foto grande
    const open = currentSession && currentSession.name === s.name ? sessionGallery.items[sessionGallery.index] : null;
    startLightroom(s, (open || first || {}).group || "", "session");
  }
  // scope: "session" (todas), "photo" (a do grupo) ou "photos" (as de groups)
  function startLightroom(s, group, scope, groups) {
    if (lrJob.id) { toast("Lightroom Classic is still opening the last session. Wait for it, or click Cancel in the message below.", 8000, { warn: true }); lrWaitToast(s); return; }
    const list = groups && groups.length ? groups : [];
    Promise.resolve(window.adobeEditInLightroom(s.name, lrCollectionTitle(s), group, scope, ...list)).then((r) => {
      if (!r) return;
      if (!r.ok) { lightroomProblem(r, s, group, scope, list); return; }
      log("Edit in Lightroom Classic: " + sessionShort(s) + (scope === "photo" ? " (photo " + group.slice(0, 2) + ")" : scope === "photos" ? " (" + plural(list.length, "photo", "photos") + ")" : ""), "ok");
      lrWait(r, s, group, scope, list);
    });
  }
  function lightroomProblem(r, s, group, scope, groups) {
    const again = () => startLightroom(s, group, scope, groups);
    if (r.problem === "missing") {
      dialog("Lightroom Classic is not installed", "Edit in Lightroom Classic needs Adobe Lightroom Classic on this computer. If it is installed in another place, choose it with Locate.", [
        { label: "Cancel", link: true, left: true },
        { label: "Get Lightroom Classic", onClick: () => window.adobeGetApp("lightroom") },
        { label: "Locate…", primary: true, onClick: () => locateAdobe("lightroom", again) },
      ]);
    } else if (r.problem === "old") {
      dialog("Lightroom Classic is too old", "The Stillpoint plugin needs a newer Lightroom Classic. Update it from the Adobe Creative Cloud app, then try again.", [
        { label: "Cancel", link: true, left: true },
        { label: "OK", primary: true },
      ], kvBox([["Found", "Lightroom Classic " + r.version], ["Needed", "Lightroom Classic " + r.minimum + " or newer"]]));
    } else if (r.problem === "catalog") {
      // Sem o catálogo vazio guardado (ou de outra versão do Lightroom): a janela com os slides. Ao achar o catálogo
      // vazio na Mesa, o app guarda uma cópia e cria o catálogo do projeto; "Send to Lightroom Classic" manda de novo.
      catGuide.open({
        variant: r.template === "outdated" ? "updated" : "first",
        os: upd.info && upd.info.os === "windows" ? "win" : "mac",
        project: r.name, from: r.templateVersion || "", to: r.lrVersion || "",
        api: {
          watch: () => window.adobeTemplateWatch(),
          send: again,
          cancel: () => {},
          openSettings: () => openSettings("adobe"),
        },
      });
    } else if (r.problem === "install") {
      dialog("Could not install the Stillpoint plugin", r.error || "The plugin could not be copied to the Lightroom Classic plugin folder.", [{ label: "OK", primary: true }]);
    } else {
      toast(r.error || "Could not open Lightroom Classic.", 8000);
    }
  }
  function kvBox(rows) {
    const box = el("div", "dlg-kv");
    rows.forEach(([k, v]) => { box.appendChild(el("span", "", k)); box.appendChild(el("b", "", v)); });
    return box;
  }
  function stepsBox(lines) {
    const box = el("div"), ol = el("ol", "dlg-steps");
    lines.forEach((t) => ol.appendChild(el("li", "", t)));
    box.appendChild(ol);
    return box;
  }
  function locateAdobe(program, then) {
    if (typeof window.adobeLocate !== "function") return;
    Promise.resolve(window.adobeLocate(program)).then((r) => {
      if (!r) return;
      if (r.info) { adobe.info = r.info; if (!$("settingsOverlay").classList.contains("hidden")) renderAdobeSettings(); }
      if (r.cancelled) return;
      if (!r.ok) { toast(r.error || "That is not the right program.", 8000, { warn: true }); return; }
      log((program === "photoshop" ? "Photoshop" : "Lightroom Classic") + " located", "ok");
      if (then) then();
    });
  }
  // Aviso de espera com Cancel no lugar do ×
  function lrWaitToast(s) {
    toast("Opening " + sessionShort(s) + " in Lightroom Classic… waiting for Lightroom", 600000, { silent: true });
    const body = ui.toast.querySelector(".toast-body");
    const close = body.querySelector(".toast-close");
    const b = el("button", "btn btn-link btn-small toast-action", "Cancel");
    b.type = "button";
    b.addEventListener("click", cancelLightroom);
    close.replaceWith(b);
  }
  function cancelLightroom() {
    if (!lrJob.id) return;
    window.adobeCancel(lrJob.id);
    clearTimeout(lrJob.timer);
    lrJob.id = null;
    hideToast();
    toast("Edit in Lightroom Classic cancelled");
  }
  function lrWait(r, s, group, scope, groups) {
    const id = r.id, start = Date.now();
    let runningSince = r.running ? start : 0, aliveSince = r.alive ? start : 0, otherSince = 0;
    lrJob.id = id;
    lrWaitToast(s);
    const again = () => startLightroom(s, group, scope, groups);
    const finish = () => { clearTimeout(lrJob.timer); lrJob.id = null; };
    const tick = () => {
      if (lrJob.id !== id) return;
      Promise.resolve(window.adobeStatus(id)).then((st) => {
        if (lrJob.id !== id || !st) return;
        const now = Date.now();
        if (st.state === "done") {
          finish(); hideToast();
          toast(sessionShort(s) + " is in Lightroom Classic: Stillpoint › " + (s.inProject && project.open ? project.name : "No project") + " › " + lrCollectionTitle(s));
          return;
        }
        if (st.state === "error") {
          finish(); hideToast();
          dialog("Lightroom Classic could not open the session", st.message || "The Stillpoint plugin reported a problem.", [{ label: "OK", primary: true }]);
          return;
        }
        if (st.state === "wrong-catalog") {
          finish(); hideToast();
          dialog("Lightroom Classic has another catalog open", "This project's sessions go to the project's catalog (Settings › Lightroom & Photoshop › One catalog per project), but Lightroom Classic has another one open. Open the project's catalog in Lightroom Classic (File › Open Catalog…), then try again.", [
            { label: "Cancel", link: true, left: true },
            { label: "Try again", primary: true, onClick: again },
          ], kvBox([["Open now", st.catalog || "?"]]));
          return;
        }
        // Pedido para o catálogo do projeto com outro aberto: o Lightroom pergunta se troca ("Relaunch"). Espera até
        // 90 s (o Lightroom reinicia e o plugin espera ele abrir); se ele continuar no outro catálogo (Cancel lá), mostra a janela do outro catálogo.
        if (st.state === "other-catalog") {
          if (!otherSince) {
            otherSince = now;
            toast("Lightroom Classic is asking to switch to the project's catalog: click Relaunch there", 600000, { silent: true });
            const body = ui.toast.querySelector(".toast-body"), close = body && body.querySelector(".toast-close");
            if (close) { const b = el("button", "btn btn-link btn-small toast-action", "Cancel"); b.type = "button"; b.addEventListener("click", cancelLightroom); close.replaceWith(b); }
          }
          if (now - otherSince > 90000) {
            finish(); hideToast(); window.adobeCancel(id);
            dialog("Lightroom Classic has another catalog open", "This project's sessions go to the project's catalog (Settings › Lightroom & Photoshop › One catalog per project), but Lightroom Classic has another one open. Open the project's catalog in Lightroom Classic (File › Open Catalog…), then try again.", [
              { label: "Cancel", link: true, left: true },
              { label: "Try again", primary: true, onClick: again },
            ], kvBox([["Open now", st.catalog || "?"]]));
            return;
          }
          lrJob.timer = setTimeout(tick, 500);
          return;
        }
        if (otherSince) { otherSince = 0; aliveSince = st.alive ? now : 0; runningSince = st.running ? now : 0; }
        if (st.running && !runningSince) runningSince = now;
        if (st.alive && !aliveSince) aliveSince = now;
        // Quanto esperar: o plugin já pegou o pedido ("working") = até 5 min (muitas fotos); plugin ligado = 30 s;
        // Lightroom aberto sem o plugin = 20 s; abrindo agora (ou trocando de catálogo) = 2 min
        const working = st.state === "working";
        // Lightroom aberto agora há pouco (pelo Stillpoint): 45 s depois de ele aparecer aberto, sem o plugin, desiste
        const late = working ? now - start > 300000
          : aliveSince ? now - aliveSince > 30000
          : runningSince && !r.switchCatalog && r.running ? now - runningSince > 20000
          : runningSince && !r.switchCatalog ? now - runningSince > 45000
          : now - start > 120000;
        if (late) {
          finish(); hideToast();
          window.adobeCancel(id);  // o pedido não fica esperando: um Lightroom aberto depois não recebe um pedido velho
          log("Lightroom Classic did not answer: " + Math.round((now - start) / 1000) + " s, Lightroom " + (st.running ? "open" : "not seen open") + ", plugin " + (st.alive ? "on" : "not answering") + (working ? ", request taken" : ", request not taken"), "warn");
          noAnswer(r, s, group, scope, !!st.running, groups);
          return;
        }
        lrJob.timer = setTimeout(tick, 500);
      }, () => { if (lrJob.id === id) lrJob.timer = setTimeout(tick, 1000); });
    };
    lrJob.timer = setTimeout(tick, 400);
  }
  function noAnswer(r, s, group, scope, running, groups) {
    const again = () => startLightroom(s, group, scope, groups);
    const reinstall = () => Promise.resolve(window.adobeInstallPlugin()).then((x) => {
      if (x && x.ok) { toast("Stillpoint plugin reinstalled. Quit Lightroom Classic and open it again, then click Try again."); log("Lightroom plugin reinstalled", "ok"); }
      else dialog("Could not install the Stillpoint plugin", (x && x.error) || "The plugin could not be copied.", [{ label: "OK", primary: true }]);
    });
    const buttons = [
      { label: "Cancel", link: true, left: true, onClick: () => window.adobeCancel(r.id) },
      { label: "Reinstall the plugin", keep: true, onClick: reinstall },
      { label: "Try again", primary: true, onClick: again },
    ];
    if (r.justInstalled && running) {
      dialog("Restart Lightroom Classic", "The Stillpoint plugin was just installed, and Lightroom Classic only loads new plugins when it opens. Quit Lightroom Classic, open it again, then click Try again.", buttons);
      return;
    }
    dialog("The Stillpoint plugin did not answer", running ? "Lightroom Classic is open, but the plugin did not answer in 20 seconds. It may be turned off:"
      : "Lightroom Classic did not open in 2 minutes, or the plugin did not answer. If Lightroom Classic is open, the plugin may be turned off:", buttons,
      stepsBox(["In Lightroom Classic, open File › Plug-in Manager…", "Select Stillpoint in the list on the left.", "Click Enable, then Done."]));
  }
  // Done editing da sessão: tira a etiqueta e a coleção do Lightroom
  function doneEditing(s) {
    if (typeof window.adobeDoneSession !== "function") return;
    Promise.resolve(window.adobeDoneSession(s.name, lrCollectionTitle(s))).then((r) => { if (r && r.sessions) setAdobeEditing(r.sessions); });
  }
  function refreshEditing() {
    if (typeof window.adobeEditing !== "function") return;
    Promise.resolve(window.adobeEditing()).then((r) => { if (r && r.sessions) setAdobeEditing(r.sessions); }, () => {});
  }
  // Botão sobre a foto grande (aparece com o mouse em cima da foto)
  {
    const b = button("Edit in Lightroom Classic…", () => { const it = sessionGallery.items[sessionGallery.index]; if (it && !editing.on) editPhotoInLightroom(it); },
      { title: "Send this session to Lightroom Classic (asks whether to edit the whole session or just this photo)" });
    b.classList.add("btn-small", "stage-hover");
    sessionGallery.setStageTools([b]);
    // Ordem do Tab: o botão vem depois dos controles do play (Reverse loop) — vai para o fim da foto grande
    const tools = b.parentElement;
    if (tools && tools.parentElement) tools.parentElement.appendChild(tools);
  }

  // ---- Etapa 20: janela "Create the project's catalog first" com 5 slides (protótipo aprovado em 2026-11-06) ----
  // catGuide.open({ variant: "first" | "updated", os: "mac" | "win", project, from, to, api })
  // api: watch() -> Promise({ found, made }) (procura o catálogo vazio na Mesa), send(), cancel(), openSettings()
  const catGuide = (() => {
    const $g = (id) => document.getElementById(id);
    let st = null, timer = 0, advanceTimer = 0;
    const SLIDES = [
      { t: "One empty catalog, once", x: () => st.variant === "updated"
        ? "Stillpoint copies an empty catalog into each project. That empty catalog has to come from the Lightroom Classic you have now."
        : "Stillpoint copies an empty catalog into each new project. You make that empty catalog in Lightroom Classic, once; Stillpoint keeps a copy." },
      { t: "Open New Catalog", x: () => "In Lightroom Classic, choose <b>File › New Catalog…</b>" },
      { t: "Save it on the Desktop", x: () => st.os === "win"
        ? "Click <b>Desktop</b> on the left, name it <b>Template</b>, and click <b>Create</b>."
        : "Name it <b>Template</b>, choose <b>Desktop</b> in Where, and click <b>Create</b>." },
      { t: "Lightroom Classic opens the empty catalog", x: () => "Lightroom Classic restarts with it. Stillpoint finds it on the Desktop and keeps a copy; this step moves on by itself." },
      { t: "All set", x: () => "Stillpoint made the <b>" + esc(st.project) + "</b> catalog. Lightroom Classic asks <b>Relaunch Lightroom with this Catalog?</b>: click <b>Relaunch</b>. The Template folder on the Desktop goes to the " + (st.os === "win" ? "Recycle Bin" : "Trash") + " by itself." },
    ];
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    function render() {
      const box = document.querySelector("#catGuideOverlay .cat-guide");
      box.dataset.os = st.os;
      $g("cgHead").textContent = st.variant === "updated" ? "Make a new catalog template" : "Create the project's catalog first";
      $g("cgLead").textContent = st.variant === "updated"
        ? "Lightroom Classic was updated (" + st.from + " → " + st.to + ") and the empty catalog Stillpoint keeps is from the old version. Create a new one, the same way as the first time."
        : "Each project gets its own Lightroom Classic catalog. Stillpoint makes them from one empty catalog that you create once. It takes about a minute.";
      $g("cgProj1").textContent = st.project;
      $g("cgRelaunchPath").textContent = "Do you want to relaunch Lightroom with …/" + st.project + "/Lightroom/" + st.project + "/" + st.project + ".lrcat?";
      document.querySelectorAll("#cgStage .cg-slide").forEach((s, i) => s.classList.toggle("on", i === st.step));
      const dots = $g("cgDots");
      if (dots.children.length !== SLIDES.length) { dots.innerHTML = ""; SLIDES.forEach(() => dots.appendChild(document.createElement("span"))); }
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === st.step));
      $g("cgStep").textContent = "Step " + (st.step + 1) + " of " + SLIDES.length;
      $g("cgTitle").textContent = SLIDES[st.step].t;
      $g("cgText").innerHTML = SLIDES[st.step].x();
      const s = $g("cgStatus");
      s.classList.toggle("hidden", st.step !== 3);
      s.classList.toggle("found", st.found);
      $g("cgStatusText").textContent = st.found ? "Found Template on the Desktop. Stillpoint kept a copy." : "Waiting for Template on the Desktop…";
      $g("cgBack").disabled = st.step === 0;
      $g("cgNext").textContent = st.step === SLIDES.length - 1 ? "Send to Lightroom Classic" : "Next";
      $g("cgNext").disabled = st.step === 3 && !st.found;
      play(st.step);
      if (st.step === 3 && st.found && !advanceTimer) advanceTimer = setTimeout(() => { advanceTimer = 0; if (st && st.step === 3) { st.step = 4; render(); } }, 1200);
    }
    function poll() {
      clearTimeout(timer);
      if (!st || st.found) return;
      Promise.resolve(st.api.watch()).then((r) => {
        if (!st) return;
        if (r && r.found) { st.found = true; render(); return; }
        timer = setTimeout(poll, 1000);
      }, () => { if (st) timer = setTimeout(poll, 2000); });
    }
    // ---- Animação dos slides: o cursor vai até cada coisa (pela posição real dela na ilustração) e clica ----
    let playToken = 0, playing = -1;
    const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function play(step) {
      const key = step + ":" + st.os;
      if (playing === key) return;
      playing = key;
      const token = ++playToken;
      const slide = document.querySelectorAll("#cgStage .cg-slide")[step];
      if (!slide) return;
      const lr = slide.querySelector(".lr");
      const cur = slide.querySelector(".cursor");
      const q = (sel) => [...slide.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
      const alive = () => token === playToken && st && slide.classList.contains("on");
      const reset = () => {
        slide.querySelectorAll(".hl,.open,.focus,.down").forEach((e) => e.classList.remove("hl", "open", "focus", "down"));
        slide.querySelectorAll(".x-typed").forEach((e) => { e.textContent = ""; });
        const wv = slide.querySelector(".x-wval"); if (wv) wv.textContent = "Pictures";
        const pics = slide.querySelector(".x-wpics"); if (pics) pics.classList.add("sel");
        const desk = slide.querySelector(".x-wdesk"); if (desk) desk.classList.remove("sel");
        if (cur) { cur.classList.remove("text", "press"); place(lr.clientWidth * .62, lr.clientHeight * .82, 0); }
      };
      // Posição dentro da ilustração (o cursor é filho de .lr)
      function place(x, y, ms) {
        if (!cur) return;
        cur.style.setProperty("--cd", ms + "ms");
        cur.style.setProperty("--cx", Math.round(x) + "px");
        cur.style.setProperty("--cy", Math.round(y) + "px");
      }
      function pointOf(el, fx, fy) {
        const a = el.getBoundingClientRect(), b = lr.getBoundingClientRect();
        // a ilustração pode estar reduzida (o protótipo encolhe a janela): volta para o tamanho dela
        const k = b.width / lr.offsetWidth || 1;
        return [(a.left - b.left + a.width * (fx == null ? .5 : fx)) / k, (a.top - b.top + a.height * (fy == null ? .55 : fy)) / k];
      }
      const chk = () => { if (!alive()) throw new Error("stop"); };
      async function move(el, ms, fx, fy) { chk(); const [x, y] = pointOf(el, fx, fy); place(x, y, ms); await sleep(ms + 60); }
      async function click(el) { chk(); cur && cur.classList.add("press"); if (el) el.classList.add("down"); await sleep(140); cur && cur.classList.remove("press"); if (el) el.classList.remove("down"); await sleep(120); }
      async function type(el, text) { for (const ch of text) { chk(); el.textContent += ch; await sleep(110); } }
      const scripts = {
        1: async () => {   // File › New Catalog…
          const file = q(".x-file"), menu = q(".lr-menu"), item = q(".x-target");
          await sleep(500); await move(file, 900); await click(); file.classList.add("hl"); menu.classList.add("open");
          await sleep(450); await move(item, 600, .35); item.classList.add("hl"); await sleep(350); await click(); await sleep(1400);
        },
        2: async () => {
          if (st.os === "win") {   // Desktop à esquerda, nome, Create
            const desk = q(".x-wdesk"), pics = q(".x-wpics"), name = q(".x-name"), typed = name.querySelector(".x-typed"), create = q(".x-create");
            await sleep(500); await move(desk, 900, .4); desk.classList.add("hl"); await click(); desk.classList.remove("hl"); pics.classList.remove("sel"); desk.classList.add("sel");
            await sleep(300); await move(name, 700, .3); cur.classList.add("text"); await click(); name.classList.add("focus");
            await sleep(250); await type(typed, "Template"); await sleep(400); cur.classList.remove("text");
            await move(create, 800); await click(create); await sleep(1400);
          } else {                 // nome, Where › Desktop, Create
            const name = q(".x-name"), typed = name.querySelector(".x-typed"), where = q(".x-where"), dd = q(".x-dd"), opt = dd.children[0], create = q(".x-create");
            await sleep(500); await move(name, 900, .3); cur.classList.add("text"); await click(); name.classList.add("focus");
            await sleep(250); await type(typed, "Template"); await sleep(400); cur.classList.remove("text"); name.classList.remove("focus");
            await move(where, 700, .5); await click(); dd.classList.add("open");
            await sleep(350); await move(opt, 500, .3); opt.classList.add("hl"); await sleep(300); await click();
            dd.classList.remove("open"); opt.classList.remove("hl"); where.querySelector(".x-wval").textContent = "Desktop";
            await sleep(350); await move(create, 800); await click(create); await sleep(1400);
          }
        },
        4: async () => {   // Relaunch
          const go = q(".x-go");
          await sleep(700); await move(go, 1000); await click(go); await sleep(1600);
        },
      };
      if (lr) lr.classList.remove("fade");
      reset();
      const run = scripts[step];
      if (!run || !cur) return;
      if (reduced()) return;   // sem movimento: fica a primeira imagem do passo
      (async () => {
        await sleep(30);
        let first = true;
        while (alive()) {
          // Antes de recomeçar, tudo some devagar (0,45 s), volta ao começo e reaparece
          if (!first) { lr.classList.add("fade"); await sleep(480); if (!alive()) { lr.classList.remove("fade"); return; } }
          reset(); await sleep(40); lr.classList.remove("fade");
          if (!first) await sleep(500);
          first = false;
          try { await run(); } catch (e) { return; }
        }
      })();
    }
    function close() {
      playToken++; playing = -1;
      clearTimeout(timer); clearTimeout(advanceTimer); advanceTimer = 0;
      st = null;
      $g("catGuideOverlay").classList.add("hidden");
    }
    function open(opts) {
      st = Object.assign({ variant: "first", os: "mac", project: "", from: "", to: "", step: 0, found: false }, opts);
      $g("catGuideOverlay").classList.remove("hidden");
      render();
      poll();
      $g("cgNext").focus();
    }
    $g("cgNext").addEventListener("click", () => {
      if (!st) return;
      if (st.step < SLIDES.length - 1) { st.step++; render(); return; }
      const api = st.api; close(); api.send();
    });
    $g("cgBack").addEventListener("click", () => { if (st && st.step > 0) { st.step--; render(); } });
    $g("cgCancel").addEventListener("click", () => { if (!st) return; const api = st.api; close(); api.cancel && api.cancel(); });
    $g("cgOpen").addEventListener("click", () => { if (!st) return; const api = st.api; close(); api.openSettings(); });
    document.addEventListener("keydown", (e) => {
      if (!st) return;
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); $g("cgNext").click(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); $g("cgBack").click(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); $g("cgCancel").click(); }
    }, true);
    return { open, close, isOpen: () => !!st, _found: () => { if (st) { st.found = true; render(); } } };
  })();

  function sessionContextMenu(e, s) {
    const items = [];
    items.push({ label: (s.label ? "Rename label…" : "Add label…"), onClick: () => editSessionLabel(s) });
    if (s.label) items.push({ label: "Remove label", onClick: () => setSessionLabelUndoable(s, "") });
    items.push({ label: "Show session", onClick: () => showSession(s) });
    items.push({ label: "Edit in Lightroom Classic", onClick: () => editSessionInLightroom(s) });
    const inEdit = !!editTagFor(s.name);
    items.push({ label: "Done editing", disabled: !inEdit, dim: !inEdit, onClick: () => doneEditing(s) });
    if (s.inProject) items.push({ label: "Delete edits…", sub: s.edited > 0 ? s.edited + " edited" : "", danger: s.edited > 0, disabled: !(s.edited > 0), dim: !(s.edited > 0), onClick: () => deleteEdits(s, []) });
    items.push({ label: s.inProject ? "Open originals folder" : "Open folder", onClick: () => {
      if (typeof window.openSessionFolder !== "function") { toast("This build cannot open session folders yet. Build the app again.", 8000); return; }
      window.openSessionFolder(s.name);
    } });
    if (s.inProject) items.push({ label: "Open edited folder", sub: s.edited > 0 ? s.edited + " edited" : "", disabled: !(s.edited > 0), dim: !(s.edited > 0), onClick: () => {
      if (typeof window.openEditedFolder !== "function") { toast("This build cannot open the Edited folder yet. Build the app again.", 8000); return; }
      window.openEditedFolder(s.name);
    } });
    if (project.open) {
      items.push("-");
      items.push({ label: s.inProject ? "Remove from project" : "Add to project", onClick: () => moveToProject(s.name, !s.inProject) });
    }
    items.push("-");
    items.push({ label: "Delete session…", danger: true, onClick: () => deleteSessionAsk(s) });
    popupMenuAt(e.clientX, e.clientY, items);
  }
  function setSessionLabelUndoable(s, after) {
    const before = s.label || "";
    if (before === after) return;
    window.setSessionLabel(s.name, after);
    toast(after ? 'Label "' + after + '" on ' + sessionLabel(s.name).date : "Label removed from " + sessionLabel(s.name).date);
    recordAction({ label: after ? 'Label "' + after + '" on ' + sessionLabel(s.name).date : "Remove label from " + sessionLabel(s.name).date,
                   undo: () => window.setSessionLabel(s.name, before), redo: () => window.setSessionLabel(s.name, after) });
  }
  // Rótulos já usados nas outras sessões: sugestões num menu do app, abaixo do campo
  function editManyLabels(list) {
    const input = $("promptInput");
    delete input.dataset.folderName;
    if (promptSuggestOff) promptSuggestOff();
    promptSuggestOff = attachSuggest(input, () => labelSuggestions(""));
    const same = list.every((x) => (x.label || "") === (list[0].label || "")) ? list[0].label || "" : "";
    const had = list.filter((x) => x.label).length;
    promptDialog("Add label", "A short name for the " + list.length + " selected sessions (shown next to the date)." + (had ? " It replaces the labels they have now." : ""), same, "Add",
      (v) => !v ? "Type a label." : v.length > 60 ? "Up to 60 characters." : "", (v) => setManyLabels(list, v));
  }
  function setManyLabels(list, after) {
    const before = list.map((x) => [x.name, x.label || ""]);
    const apply = (pairs) => pairs.forEach(([name, label]) => window.setSessionLabel(name, label));
    apply(list.map((x) => [x.name, after]));
    const what = after ? 'Label "' + after + '" on ' + plural(list.length, "session", "sessions") : "Labels removed from " + plural(list.length, "session", "sessions");
    toast(what);
    recordAction({ label: after ? 'Label "' + after + '" on ' + plural(list.length, "session", "sessions") : "Remove labels from " + plural(list.length, "session", "sessions"),
                   undo: () => apply(before), redo: () => apply(list.map((x) => [x.name, after])) });
  }
  function labelSuggestions(except) {
    return [...new Set(sessions.filter((x) => x.label && x.name !== except).map((x) => x.label))].sort((a, b) => a.localeCompare(b));
  }
  // Liga um campo de texto a uma lista de sugestões (filtra ao digitar; ↑ ↓ Enter escolhem; clique também)
  function attachSuggest(input, getItems, onPick) {
    let box = null, items = [], active = -1;
    const close = () => { if (box) { box.remove(); box = null; } items = []; active = -1; };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      // Só depois de digitar algo (campo vazio não sugere)
      items = q ? getItems().filter((l) => l.toLowerCase() !== q && l.toLowerCase().includes(q)) : [];
      if (!items.length) { close(); return; }
      if (!box) {
        box = el("div", "suggest");
        box.addEventListener("pointerdown", (e) => e.preventDefault());  // não tira o foco do campo
        document.body.appendChild(box);
      }
      box.innerHTML = "";
      items.forEach((l, i) => {
        const b = el("button", "suggest-item" + (i === active ? " active" : ""), l);
        b.type = "button";
        b.addEventListener("click", () => { input.value = l; close(); onPick && onPick(l); });
        box.appendChild(b);
      });
      const r = input.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.top = (r.bottom + 4) + "px"; box.style.width = r.width + "px";
    };
    const onInput = () => { active = -1; render(); };
    const onBlur = () => setTimeout(close, 120);
    const onKey = (e) => {
      if (!box) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = e.key === "ArrowDown" ? (active + 1) % items.length : (active - 1 + items.length) % items.length;
        render();
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault(); e.stopImmediatePropagation();
        input.value = items[active]; close(); onPick && onPick(items[active]);
      } else if (e.key === "Escape") { e.stopImmediatePropagation(); close(); }
    };
    input.addEventListener("input", onInput);
    input.addEventListener("focus", onInput);
    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", onKey, true);
    return () => { close(); input.removeEventListener("input", onInput); input.removeEventListener("focus", onInput); input.removeEventListener("blur", onBlur); input.removeEventListener("keydown", onKey, true); };
  }
  let promptSuggestOff = null;
  function editSessionLabel(s) {
    const input = $("promptInput");
    delete input.dataset.folderName;
    if (promptSuggestOff) promptSuggestOff();
    promptSuggestOff = attachSuggest(input, () => labelSuggestions(s.name));
    promptDialog(s.label ? "Rename label" : "Add label", "A short name for the session " + sessionLabel(s.name).date + " (shown next to the date).", s.label || "", s.label ? "Rename" : "Add",
      (v) => v.length > 60 ? "Up to 60 characters." : "", (v) => setSessionLabelUndoable(s, v));
  }
  // Menu numa posição da tela (botão direito): sempre à direita do ponteiro; se não couber, encosta na borda direita
  function popupMenuAt(x, y, items) {
    const m = buildMenu(items);
    document.body.appendChild(m);
    const left = Math.min(x + 2, window.innerWidth - m.offsetWidth - 8);
    const top = Math.min(y + 2, window.innerHeight - m.offsetHeight - 8);
    m.style.left = Math.max(8, left) + "px"; m.style.top = Math.max(8, top) + "px";
    m.anchor = document.activeElement !== document.body ? document.activeElement : null;
    openMenu = m;
    armMenuClose(m);
    menuKeyboardStart(m);
  }
  function buildMenu(items) {
    closeMenu();
    const m = el("div", "app-menu project-menu");
    m.setAttribute("role", "menu");
    items.forEach((it) => {
      if (it === "-") { m.appendChild(document.createElement("hr")); return; }
      if (it.html) { m.appendChild(it.html); return; }
      const b = el("button", (it.dim ? "dim " : "") + (it.name ? "name " : "") + (it.danger ? "danger" : ""), it.label);
      b.setAttribute("role", "menuitem");
      if (it.sub) { const k = el("span", "app-menu-key", it.sub); b.appendChild(k); }
      if (it.disabled) b.disabled = true;
      b.addEventListener("click", () => { closeMenu(); it.onClick && it.onClick(); });
      m.appendChild(b);
    });
    return m;
  }
  function armMenuClose(m) {
    // pointerdown, não mousedown: as linhas de sessão cancelam o mousedown (arraste) e o menu não fecharia
    setTimeout(() => {
      const away = (e) => { if (!m.contains(e.target)) { closeMenu(); document.removeEventListener("pointerdown", away, true); } };
      document.addEventListener("pointerdown", away, true);
    }, 0);
  }
  function popupMenu(anchor, items, align) {
    const m = buildMenu(items);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 6) + "px";
    if (align === "right") m.style.right = Math.round(window.innerWidth - r.right) + "px";
    else m.style.left = Math.round(Math.min(r.left, window.innerWidth - m.offsetWidth - 12)) + "px";
    m.anchor = anchor;
    openMenu = m;
    armMenuClose(m);
    menuKeyboardStart(m);
  }
  // Teclado nos menus do app: aberto pelo teclado, o foco vai para a primeira opção; ↑ ↓ (Home/End)
  // andam pelas opções, Enter escolhe, Esc fecha e volta para o botão; o Tab fecha e segue (tratador do Tab)
  function menuItems(m) { return [...m.querySelectorAll("button")].filter((b) => !b.disabled && b.getClientRects().length > 0); }
  function menuKeyboardStart(m) {
    if (!document.documentElement.classList.contains("kbd-focus")) return;
    const first = menuItems(m).find((b) => !b.classList.contains("project-menu-clear")) || menuItems(m)[0];
    if (first) first.focus();
  }
  document.addEventListener("keydown", (e) => {
    if (!openMenu || selectMenu) return;
    const m = openMenu;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation();
      const anc = m.anchor; closeMenu();
      if (anc && anc.isConnected) anc.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault(); e.stopImmediatePropagation();
    document.documentElement.classList.add("kbd-focus");
    const list = menuItems(m);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const j = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1
      : i < 0 ? (e.key === "ArrowDown" ? 0 : list.length - 1)
      : Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    list[j].focus();
  }, true);
  function projectMenuItems(withCurrent) {
    const items = [];
    if (project.open) {
      if (withCurrent) {
        const h = el("div", "project-menu-current");
        h.innerHTML = '<span class="project-menu-label" style="padding:0">Current</span><b></b><small></small>';
        h.querySelector("b").textContent = project.name;
        h.querySelector("small").textContent = project.folder + (project.available === false ? "  ·  not reachable" : "");
        items.push({ html: h });
      }
      const off = project.available === false;  // pasta fora do ar: só o que não precisa dela
      if (off) items.push({ label: "Check the folder again", onClick: reloadProjectNow });
      items.push({ label: "Project window…", onClick: openProjectWindow });
      items.push({ label: "Open folder", onClick: () => window.projectOpenFolder(), disabled: off, dim: off });
      items.push({ label: "Rename project…", onClick: renameProject, disabled: off, dim: off });
      items.push("-");
    }
    return items;
  }
  // Lista de recentes + abrir/novo/fechar; abre o menu já com os recentes carregados
  function openProjectMenu(anchor, align, withCurrent) {
    // O menu abre na hora com o que está na tela; a releitura do projeto (pasta que voltou, contagens)
    // corre em paralelo e atualiza a barra — ela não pode segurar o clique
    openProjectMenuNow(anchor, align, withCurrent);
    refreshProject();
  }
  function openProjectMenuNow(anchor, align, withCurrent) {
    Promise.resolve(window.projectRecent && window.projectRecent()).then((r) => {
      const recent = ((r && r.projects) || []).filter((p) => !project.open || p.folder !== project.folder);
      const items = projectMenuItems(withCurrent);
      if (recent.length) {
        // "Recent" à esquerda e, na mesma linha à direita, "Clear recent" discreto (texto, acende no hover)
        const lab = el("div", "project-menu-label project-menu-recent", "Recent");
        if (typeof window.projectRecentSet === "function") {
          const clear = el("button", "project-menu-clear", "Clear recent");
          clear.type = "button";
          clear.title = "Empty this list (Cmd/Ctrl+Z brings it back)";
          clear.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); clearRecentProjects(((r && r.projects) || []).map((p) => p.folder)); });
          lab.appendChild(clear);
        }
        items.push({ html: lab });
        recent.slice(0, 5).forEach((p) => items.push({
          label: p.name, name: true, sub: p.available ? "" : "not reachable", disabled: !p.available, dim: !p.available,
          onClick: () => Promise.resolve(window.projectOpen(p.folder)).then(projectResult),
        }));
        items.push("-");
      }
      items.push({ label: project.open ? "Switch project…" : "Open project…", onClick: pickProject });  // a mesma janela de recentes do "Switch…"
      items.push({ label: "New project…", onClick: newProject });
      if (project.open) items.push({ label: "Close project", onClick: closeProjectUndoable });
      if (project.open) items.push({ label: "Delete project…", danger: true, onClick: deleteProjectAsk });
      popupMenu(anchor, items, align);
    });
  }
  // ---- Segurar e arrastar uma sessão (eventos de ponteiro, como a lista de câmeras) ----
  // Alvos: o botão do projeto na barra (entra no projeto) e o grupo "Not in project" (sai).
  let notInProjectOpen = false;  // grupo "Not in project" aberto?
  let pendingProjectFocus = false;  // projeto recém-aberto: selecionar a primeira sessão dele quando a lista chegar
  let sessDrag = null;
  // Retângulo do grupo do projeto na lista (do alto da lista até o divisor "Not in project"),
  // em coordenadas da tela, já cortado pela caixa da coluna (o que está rolado para fora não conta)
  function projectGroupRect() {
    const aside = ui.sessionList.parentElement;
    const list = ui.sessionList.getBoundingClientRect(), box = aside.getBoundingClientRect();
    const divider = ui.sessionList.querySelector(".folder-divider");
    const rawTop = list.top - 4, rawBottom = divider ? divider.getBoundingClientRect().top - 6 : list.bottom;
    const top = Math.max(rawTop, box.top), bottom = Math.min(rawBottom, box.bottom - 2);
    return { left: box.left + 6, top, width: aside.clientWidth - 12, height: Math.max(0, bottom - top), rawTop, rawBottom };
  }
  // Posição da zona dentro da coluna (rola junto; a coluna corta e a barra de rolagem fica por cima)
  function placeDropZone(zone, toProject) {
    const aside = ui.sessionList.parentElement;
    const r = toProject ? projectGroupRect() : outsideGroupRect(), box = aside.getBoundingClientRect();
    if (!r) { zone.style.display = "none"; return; }
    zone.style.display = "";
    zone.style.left = "6px"; zone.style.right = "6px";
    zone.style.top = (r.rawTop - box.top + aside.scrollTop) + "px";
    zone.style.height = Math.max(40, r.rawBottom - r.rawTop) + "px";
  }
  // Retângulo do grupo "Not in project" (do divisor até o fim da lista), cortado pela coluna
  function outsideGroupRect() {
    const aside = ui.sessionList.parentElement;
    const list = ui.sessionList.getBoundingClientRect(), box = aside.getBoundingClientRect();
    const divider = ui.sessionList.querySelector(".folder-divider");
    if (!divider) return null;
    // Vai até o fim da coluna: soltar em qualquer ponto abaixo do divisor tira do projeto
    const rawTop = divider.getBoundingClientRect().top - 4, rawBottom = Math.max(list.bottom, box.bottom - 8, rawTop + 64);
    const top = Math.max(rawTop, box.top), bottom = Math.min(rawBottom, box.bottom - 2);
    return { left: box.left + 6, top, width: aside.clientWidth - 12, height: Math.max(0, bottom - top), rawTop, rawBottom };
  }
  // Em cima de um botão (com uma folga em volta, para facilitar soltar em botões pequenos)
  function overNode(x, y, node, pad) {
    const r = node.getBoundingClientRect(), p = pad === undefined ? 8 : pad;
    return r.width > 0 && x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
  }
  function inRect(x, y, r) { return r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height; }
  function sessDropTarget(x, y) {
    const d = sessDrag;
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    const trashBtn = trashTarget();
    if (trashBtn && overNode(x, y, trashBtn)) return { el: trashBtn, trash: true };
    if (!project.open) return null;
    if (!d.s.inProject) {
      if (under.closest("#projectBarBtn")) return { el: $("projectBarBtn"), toProject: true };
      if (d.zone && inRect(x, y, projectGroupRect())) return { el: d.zone, toProject: true };
    } else if (d.zone && (inRect(x, y, outsideGroupRect()) || under.closest(".folder-divider"))) {
      return { el: d.zone, toProject: false };
    }
    return null;
  }
  function sessPointerDown(e, li, s, multi) {
    if (e.button !== 0 || e.target.closest("button")) return;
    if (busy) { if (!multi && (!currentSession || currentSession.name !== s.name)) showSession(s); return; }  // ocupado: escolhe, mas não arrasta
    if (sessDrag) sessEndDrag(null);
    e.preventDefault();  // sem seleção de texto pelo caminho do arraste (o clique continua valendo)
    // Várias marcadas: vão juntas as do mesmo lado da segurada (todas do projeto, ou todas de fora)
    let names = null, all = null;
    if (multi) {
      all = sessions.filter((x) => sessSel.has(x.name)).map((x) => x.name);
      names = all.filter((n) => !!sessions.find((x) => x.name === n).inProject === !!s.inProject);
      if (names.length < 2) names = null;
      if (all.length < 2) all = null;
    }
    // A sessão segurada passa a ser a selecionada (a lista é redesenhada: pega a linha nova)
    if (!all && (!currentSession || currentSession.name !== s.name)) {
      showSession(s);
      li = ui.sessionList.querySelector('li.folder[data-name="' + CSS.escape(s.name) + '"]') || li;
    }
    sessDrag = { li, s, names, all, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
    li.setPointerCapture(e.pointerId);
    li.onpointermove = sessPointerMove;
    li.onpointerup = (ev) => {
      const d = sessDrag;
      if (d && !d.moved && d.all) {
        // Clique simples (sem arrastar) numa das marcadas: desfaz a seleção e abre essa sessão
        sessEndDrag(null);
        sessSel.clear();
        if (!currentSession || currentSession.name !== s.name) showSession(s); else renderSessionList();
        return;
      }
      sessEndDrag(d && d.moved ? sessDropTarget(ev.clientX, ev.clientY) : null);
    };
    // Se a linha sumir no meio (lista redesenhada) ou o sistema cancelar, termina sem soltar
    li.onpointercancel = () => sessEndDrag(null);
    li.onlostpointercapture = () => { if (sessDrag && sessDrag.li === li && !sessDrag.ending) sessEndDrag(null); };
  }
  function sessPointerMove(e) {
    const d = sessDrag;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      d.li.classList.add("dragging");
      if (d.all) ui.sessionList.querySelectorAll("li.folder.multi").forEach((x) => x.classList.add("dragging"));
      document.body.classList.add("session-drag", d.s.inProject ? "from-project" : "from-app");
      // Fantasma: cópia da linha que segue o ponteiro
      const r = d.li.getBoundingClientRect();
      d.ghost = d.li.cloneNode(true);
      d.ghost.className = "folder session-ghost";
      d.ghost.style.width = Math.max(r.width, 260) + "px";
      d.ghost.style.left = r.left + "px"; d.ghost.style.top = r.top + "px";
      if (d.all) {
        // Várias: o fantasma vira uma pilha com a contagem
        d.ghost.classList.add("stack");
        d.ghost.appendChild(el("span", "session-ghost-count", plural(d.all.length, "session", "sessions")));
      }
      document.body.appendChild(d.ghost);
      // Zona tracejada: a área do projeto (sessão de fora) ou a área "Not in project" (sessão do projeto)
      if (project.open) d.zone = el("div", "session-drop-zone" + (d.s.inProject ? " out" : ""));
      const what = d.names ? plural(d.names.length, "session", "sessions") + " " : "";
      if (d.zone) d.zone.innerHTML = '<span>' + (d.s.inProject ? "Drop to remove " + what + "from project" : "Drop to add " + what + "to project") + '</span>';
      if (d.zone) ui.sessionList.parentElement.appendChild(d.zone);
      const t = trashTarget();
      if (t) t.classList.add("drop-here");
    }
    if (d.zone) placeDropZone(d.zone, !d.s.inProject);
    d.ghost.style.transform = "translate(" + dx + "px," + dy + "px)";
    const t = sessDropTarget(e.clientX, e.clientY);
    const el2 = t ? t.el : null;
    if (d.over !== el2) {
      if (d.over) d.over.classList.remove("drop-ok");
      if (el2) el2.classList.add("drop-ok");
      d.over = el2;
    }
  }
  function sessEndDrag(target) {
    const d = sessDrag;
    if (!d) return;
    d.ending = true;
    sessDrag = null;
    d.li.onpointermove = d.li.onpointerup = d.li.onpointercancel = d.li.onlostpointercapture = null;
    d.li.classList.remove("dragging");
    ui.sessionList.querySelectorAll("li.folder.dragging").forEach((x) => x.classList.remove("dragging"));
    if (d.ghost) d.ghost.remove();
    if (d.zone) d.zone.remove();
    if (d.over) d.over.classList.remove("drop-ok");
    document.body.classList.remove("session-drag", "from-project", "from-app");
    document.querySelectorAll(".drop-here").forEach((x) => x.classList.remove("drop-here"));
    if (!target || busy) return;
    if (target.trash) { deleteSessionsNow(d.all || [d.s.name]); return; }
    if (d.names) moveMany(d.names, target.toProject);
    else moveToProject(d.s.name, target.toProject);
  }
  function moveToProject(name, toProject) {
    const s = sessions.find((x) => x.name === name);
    if (!s || !project.open || !!s.inProject === toProject) return;
    applyMove([name], toProject).then((ok) => {
      if (ok) recordAction({ label: (toProject ? "Add to project: " : "Remove from project: ") + sessionLabel(name).date,
                              undo: () => applyMove([name], !toProject), redo: () => applyMove([name], toProject) });
    });
  }
  // Move de fato (uma ou várias); devolve Promise<true/false>
  function applyMove(names, toProject) {
    if (!project.open) return Promise.resolve(false);
    if (!toProject) notInProjectOpen = true;  // a sessão que saiu fica à vista
    return Promise.resolve(toProject ? window.addToProject(...names) : window.removeFromProject(...names)).then((r) => {
      if (r && r.error) { toast(r.error, 8000); log(r.error, "error"); return false; }
      toast((toProject ? "Added to project: " : "Removed from project: ") + names.map((n) => sessionLabel(n).date).join(", "));
      return true;
    });
  }
  // Pergunta com campo de texto. validate(valor) devolve uma mensagem de erro ou "".
  function promptDialog(title, text, value, okLabel, validate, onOk, opts) {
    opts = opts || {};
    $("promptTitle").textContent = title;
    $("promptText").textContent = text;
    const input = $("promptInput"), err = $("promptError"), extra = $("promptExtra");
    input.value = value || ""; err.textContent = ""; err.classList.add("hidden");
    $("promptOk").textContent = okLabel || "OK";
    // Botão extra à esquerda (ex.: "Choose another folder…" no New project): fecha a caixa e age
    extra.classList.toggle("hidden", !opts.extra);
    extra.textContent = opts.extra ? opts.extra.label : "";
    $("promptReset").classList.add("hidden");  // "Reset to default" só aparece quando quem abriu a caixa pede
    const close = () => { $("promptOverlay").classList.add("hidden"); $("promptOk").onclick = $("promptCancel").onclick = extra.onclick = $("promptReset").onclick = input.onkeydown = null; };
    extra.onclick = opts.extra ? () => { if (!opts.extra.keepOpen) close(); opts.extra.onClick(); } : null;
    let checking = false;
    const ok = () => {
      if (checking) return;
      const v = input.value.trim();
      checking = true;
      // validate pode devolver o aviso na hora ou numa Promise (ex.: perguntar ao app se o nome existe)
      Promise.resolve(validate ? validate(v) : "").then((problem) => {
        checking = false;
        if (problem) { err.textContent = problem; err.classList.remove("hidden"); input.focus(); return; }
        close(); onOk(v);
      }).catch(() => { checking = false; close(); onOk(v); });
    };
    $("promptOk").onclick = ok;
    $("promptCancel").onclick = close;
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } if (e.key === "Escape") { e.preventDefault(); close(); } };
    $("promptOverlay").classList.remove("hidden");
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }
  function renameProject() {
    if (!project.open) return;
    $("promptInput").dataset.folderName = "1";
    promptDialog("Rename project", "The project folder is renamed too (" + project.folder + ").", project.name, "Rename",
      (v) => !v ? "Type a name." : v[0] === "." ? "The name cannot start with a dot." : "",
      (v) => {
        if (v === project.name) return;
        const before = project.name;
        applyRename(v).then((ok) => {
          if (ok) recordAction({ label: 'Rename project "' + before + '" → "' + v + '"', undo: () => applyRename(before), redo: () => applyRename(v) });
        });
      });
  }
  // Renomeia de fato; devolve Promise<true/false>
  function applyRename(name) {
    if (typeof window.projectRename !== "function") { toast("This build cannot rename projects yet. Build the app again.", 8000); return Promise.resolve(false); }
    return Promise.resolve(window.projectRename(name)).then((r) => {
      if (r && r.error) { dialog("Could not rename the project", r.error, [{ label: "OK", primary: true }]); log(r.error, "error"); return false; }
      if (r && r.project) setProject(r.project);
      toast("Project renamed: " + name); log("Project renamed: " + name, "ok");
      refreshSessions();
      return true;
    });
  }
  function projectCounts(sep) {
    return [plural(project.sessions || 0, "session", "sessions"), plural(project.photos || 0, "photo", "photos"),
            project.edited ? project.edited + " edited" : "", fmtBytes(project.bytes)].filter(Boolean).join(sep);
  }
  // =================== Lixeira (etapa 20) ===================
  // Sessões e fotos apagadas ficam 15 dias. A do app fica na pasta de dados; a do Project, dentro da
  // pasta dele (mesmo disco), e só aparece com ele aberto.
  const trash = { count: 0, bytes: 0, days: 15 };
  function setTrashInfo(e) {
    trash.count = e.count || 0; trash.bytes = +e.bytes || 0; trash.days = e.days || 15;
    refreshDeleted();
    const b = $("trashBtn");
    b.classList.toggle("has", trash.count > 0);
    $("trashCount").textContent = trash.count ? shortNum(trash.count) : "";
    fullTrashOpenBtn.querySelector(".trash-count-full").textContent = trash.count ? shortNum(trash.count) : "";
    // Espaço ocupado, sempre em GB (com mais casas quando é pouco)
    const gb = trash.bytes / 1e9;
    $("trashSize").textContent = !trash.count ? "" : gb >= 999.5 ? (gb / 1000 >= 100 ? (gb / 1000).toFixed(0) : (Math.round(gb / 100) / 10).toString()) + " TB"
      : (gb >= 10 ? gb.toFixed(0) : gb >= 0.1 ? gb.toFixed(1) : gb >= 0.01 ? gb.toFixed(2) : "<0.01") + " GB";
    fullTrashOpenBtn.querySelector(".trash-size-full").textContent = $("trashSize").textContent;
    fullTrashOpenBtn.classList.toggle("has", trash.count > 0);
    b.title = trash.count ? "Trash: " + plural(trash.count, "item", "items") + " · " + fmtBytes(trash.bytes) + " · kept " + trash.days + " days"
                          : "Trash: empty. Deleted sessions and photos stay here for " + trash.days + " days.";
    b.setAttribute("aria-label", b.title);
    fullTrashOpenBtn.title = b.title; fullTrashOpenBtn.setAttribute("aria-label", b.title);
    if ($("trashOverlay") && !$("trashOverlay").classList.contains("hidden")) renderTrash();
  }
  const trashRoving = makeRoving({ root: () => $("trashList"), rows: (r) => [...r.querySelectorAll("li.trash-row")], id: (row) => row.dataset.id });
  function agoText(seconds) {
    const days = Math.floor(seconds / 86400);
    if (days >= 1) return days === 1 ? "yesterday" : days + " days ago";
    const hours = Math.floor(seconds / 3600);
    if (hours >= 1) return plural(hours, "hour", "hours") + " ago";
    const minutes = Math.floor(seconds / 60);
    return minutes >= 1 ? plural(minutes, "minute", "minutes") + " ago" : "just now";
  }
  function openTrash() {
    let ov = $("trashOverlay");
    if (!ov) {
      ov = el("div", "overlay hidden"); ov.id = "trashOverlay";
      ov.addEventListener("click", (e) => { if (e.target === ov) closeTrash(); });
      const d = el("div", "dialog trash-dialog");
      d.appendChild(el("h3", "", "Trash"));
      d.appendChild(el("p", "trash-sub"));
      const list = el("ul", "trash-list"); list.id = "trashList";
      d.appendChild(list);
      const actions = el("div", "dialog-actions");
      const empty = button("Empty trash", () => {
        dialog("Empty the trash?", "Everything in the trash is deleted for good" + (trashProjectName ? ", including the items of the project " + trashProjectName : "") + ". This cannot be undone.", [
          { label: "Cancel" },
          { label: "Empty trash", danger: true, onClick: () => Promise.resolve(window.trashEmpty()).then(() => { toast("Trash emptied"); log("Trash emptied", "ok"); renderTrash(); }) },
        ]);
      }, { kind: "btn-danger" });
      empty.classList.add("trash-empty-btn");
      const all = button("Restore everything", restoreEverything, { title: "Put every session and photo in the trash back where it was" });
      all.classList.add("trash-restore-all");
      actions.append(empty, el("span", "spacer"), all, button("Close", closeTrash));
      d.appendChild(actions);
      ov.appendChild(d);
      document.body.appendChild(ov);
    }
    renderTrash();
    ov.classList.remove("hidden");
  }
  function closeTrash() { const ov = $("trashOverlay"); if (ov) ov.classList.add("hidden"); }
  let trashProjectName = "";
  function renderTrash() {
    if (typeof window.trashList !== "function") return;
    Promise.resolve(window.trashList()).then((r) => {
      const ov = $("trashOverlay"), list = $("trashList");
      if (!ov || !list || !r) return;
      const items = r.items || [];
      trashProjectName = r.project || "";
      const restoredIds = new Set(items.filter((i) => i.restored).map((i) => i.id));
      const top = items.filter((i) => !i.restored && (!i.parent || restoredIds.has(i.parent)));  // os de dentro de um projeto apagado contam no projeto
      const total = top.reduce((t, i) => t + (+i.bytes || 0), 0);
      ov.querySelector(".trash-sub").textContent = "Deleted projects, sessions and photos stay here for " + r.days + " days, then are deleted for good. " +
        (top.length ? plural(top.length, "item", "items") + " · " + fmtBytes(total) + "." : "");
      const focusWas = trashRoving.where(document.activeElement);
      list.innerHTML = "";
      ov.querySelector(".trash-empty-btn").disabled = !items.length;
      ov.querySelector(".trash-restore-all").disabled = !items.length;
      if (!items.length) { list.appendChild(el("li", "trash-empty", "The trash is empty.")); return; }
      const now = Date.now() / 1000;
      const tree = trashTree(items);
      [false, true].forEach((inProject) => {
        const group = tree.filter((n) => n.group === inProject);
        if (!group.length) return;
        if (tree.some((n) => n.group !== inProject) || inProject)
          list.appendChild(el("li", "trash-group", inProject ? "In the project " + (r.project || "") : "In the app"));
        group.forEach(({ item, level, blockedBy }) => {
          const li = el("li", "trash-row lvl" + level + (item.whole ? " is-session" : " is-photos"));
          li.dataset.id = item.id;
          const label = sessionLabel(item.session);
          if (blockedBy || item.restored) li.classList.add("blocked");
          const kindIcon = el("span", "trash-kind");
          if (item.editsOnly) { kindIcon.appendChild(el("span", "trash-app lr", "Lr")); kindIcon.title = "Edited photos from Lightroom Classic"; }
          else {
            kindIcon.innerHTML = icon(item.isProject ? "folder" : item.whole ? "session" : "photo", 16);
            kindIcon.title = item.isProject ? "A whole project" : item.whole ? "A whole session" : "Photos from a session";
          }
          li.appendChild(kindIcon);
          const offDisk = item.isProject && !item.reachable && !item.restored;
          if (offDisk) li.classList.add("offdisk");
          const main = el("div", "trash-main");
          const title = el("b", "", item.isProject ? item.session : label.date + (label.detail ? " · " + label.detail : ""));
          if (item.restored) title.appendChild(el("span", "trash-restored", "✓ Restored"));
          main.appendChild(title);
          const left = Math.max(0, Math.ceil((item.deletedAt + r.days * 86400 - now) / 86400));
          const what = item.isProject ? "Project" + (item.sessions ? " · " + plural(item.sessions, "session", "sessions") : "")
            : item.editsOnly ? plural(item.edits, "Lightroom Classic edit", "Lightroom Classic edits") + " from this session"
            : item.whole ? "Session" + (item.photos ? " · " + plural(item.photos, "photo", "photos") : "") : plural(item.photos, "photo", "photos") + " from this session";
          const meta = el("small", "", what + (+item.bytes ? " · " + fmtBytes(+item.bytes) : "") + " · deleted " + agoText(now - item.deletedAt));
          if (!item.restored) {
            meta.appendChild(document.createTextNode(" · "));
            if (blockedBy && blockedBy.isProject) meta.appendChild(el("span", "", "follows the project"));  // o prazo é o do projeto
            else meta.appendChild(el("span", left <= 2 ? "soon" : "", left <= 1 ? "deleted for good within a day" : "deleted for good in " + left + " days"));
          }
          main.appendChild(meta);
          // Editadas que foram junto com as fotos (ou com a sessão): uma linha embaixo, com o ícone do Lightroom
          if (!item.editsOnly && item.edits > 0 && !item.restored) {
            const sub = el("div", "trash-edits");
            sub.append(el("span", "trash-app lr", "Lr"), el("small", "", plural(item.edits, "Lightroom Classic edit", "Lightroom Classic edits") + " · come back with " + (item.whole ? "the session" : item.photos === 1 ? "the photo" : "the photos")));
            main.appendChild(sub);
          }
          const these = item.editsOnly ? (item.edits === 1 ? "This edit was" : "These edits were") : item.whole ? "This session was" : item.photos === 1 ? "This photo was" : "These photos were";
          if (item.restored) main.appendChild(el("small", "trash-note done", "Restored. It stays here until the " + (item.isProject ? "items from its trash" : "photos deleted before it") + " below are restored or deleted."));
          else if (offDisk) main.appendChild(el("small", "trash-note", "The disk with this project is not connected. Connect it to restore or delete the project."));
          else if (blockedBy && blockedBy.isProject) main.appendChild(el("small", "trash-note", these + " in the trash of the project " + blockedBy.session + ", which was deleted after. Restore the project first."));
          else if (blockedBy && item.editsOnly) main.appendChild(el("small", "trash-note", "The photo was deleted after " + (item.edits === 1 ? "this edit" : "these edits") + ". Restore the photo first."))
          else if (blockedBy) main.appendChild(el("small", "trash-note", item.photos === 1
            ? "The whole session was deleted after this photo. Restore the session first to bring it back."
            : "The whole session was deleted after these photos. Restore the session first to bring them back."));
          li.appendChild(main);
          if (!item.restored) {
            const restore = button("Restore", () => restoreTrashItem(item, label), { title: item.isProject ? "Put the project folder back" : item.whole ? "Put the session back in the list" : "Put the photos back in their session" });
            if (blockedBy) { restore.disabled = true; restore.title = blockedBy.isProject ? "Restore the project first" : blockedBy.whole ? "Restore the session first" : "Restore the photo first"; }
            if (offDisk) { restore.disabled = true; restore.title = "Connect the disk with this project first"; }
            li.appendChild(restore);
            // Apagar de vez leva junto o que dependia dele (fotos apagadas antes; a lixeira do projeto)
            const linked = tree.filter((n) => n.under === item.id).map((n) => n.item).filter((o) => !o.restored);
            li.appendChild(button("Delete permanently", () => {
              dialog("Delete permanently?", (item.isProject ? "The project " + item.session + " and everything in its folder" : (item.editsOnly ? (item.edits === 1 ? "This edit of " : "These edits of ") : item.whole ? "The session " : item.photos === 1 ? "This photo of " : "These photos of ") + label.date) + " will be deleted for good" +
                (linked.length ? (item.isProject ? ", together with " + plural(linked.length, "item", "items") + " that " + (linked.length === 1 ? "was" : "were") + " in its trash"
                  : ", together with " + plural(linked.reduce((t, o) => t + o.photos, 0), "photo", "photos") + " of it deleted before") : "") + ". This cannot be undone.", [
                { label: "Cancel" },
                { label: "Delete permanently", danger: true, onClick: () => Promise.all([item, ...(item.isProject ? [] : linked)].map((o) => window.trashDelete(o.id))).then(() => { log("Deleted permanently from the trash: " + label.date, "tech"); renderTrash(); }) },
              ]);
            }, { kind: "btn-link", title: "Delete this item for good" }));
            if (offDisk) li.lastChild.disabled = true;
          }
          list.appendChild(li);
        });
      });
      trashRoving.apply();
      if (focusWas && !trashRoving.focusAt(focusWas.id, focusWas.i)) {
        const first = list.querySelector("li.trash-row button") || ov.querySelector(".dialog-actions button:not(:disabled)");
        if (first && document.documentElement.classList.contains("kbd-focus")) first.focus();
      }
    });
  }
  // Árvore da lixeira: projeto → sessões → fotos (o que foi apagado antes e depende do de cima fica abaixo
  // dele, recuado). blockedBy = o de cima, enquanto ele não for restaurado; under = id do de cima.
  function trashTree(items) {
    const out = [];
    const used = new Set();
    // Editada apagada antes da foto dela (Delete edits e depois Delete photo): fica embaixo da foto, como as fotos
    // embaixo da sessão (decisão do dono, 2026-11-06)
    const editParent = (e) => e.editsOnly ? items.find((p) => !p.whole && !p.editsOnly && !p.isProject && !p.restored && p.session === e.session
      && !!p.inProject === !!e.inProject && trashLater(p, e) && (p.bases || []).some((b) => (e.bases || []).includes(b))) : null;
    const photosOf = (session, pool) => pool.filter((x) => !x.whole && !used.has(x.id) && x.session === session.session && trashLater(session, x) && !editParent(x));
    const add = (item, level, parentItem, group) => {
      used.add(item.id);
      out.push({ item, level, under: parentItem ? parentItem.id : "", blockedBy: parentItem && !parentItem.restored ? parentItem : null, group });
      if (!item.whole && !item.editsOnly && !item.isProject)
        items.filter((e) => !used.has(e.id) && editParent(e) === item).forEach((e) => add(e, level + 1, item, group));
    };
    const addSession = (sess, level, parentItem, pool, group) => {
      add(sess, level, parentItem, group);
      if (sess.whole) photosOf(sess, pool).forEach((ph) => add(ph, level + 1, sess, group));
    };
    const tops = items.filter((i) => !i.parent);
    [false, true].forEach((inProject) => {
      const pool = tops.filter((i) => !!i.inProject === inProject);
      // fotos que dependem de uma sessão do mesmo grupo entram depois dela
      const dependent = (o) => (!o.whole && !o.isProject && pool.some((w) => w.whole && !w.isProject && w.session === o.session && trashLater(w, o))) || !!editParent(o);
      pool.forEach((o) => {
        if (used.has(o.id) || dependent(o)) return;
        if (o.isProject) {
          add(o, 0, null, inProject);
          const kids = items.filter((x) => x.parent === o.id);
          const kidDependent = (k) => !k.whole && kids.some((w) => w.whole && w.session === k.session && trashLater(w, k));
          kids.forEach((k) => { if (!used.has(k.id) && !kidDependent(k)) addSession(k, 1, o, kids, inProject); });
        } else addSession(o, 0, null, pool, inProject);
      });
    });
    return out;
  }
  // a foi apagado depois de b? (ordem exata em texto: números do mesmo tamanho; senão, pelos segundos)
  function trashLater(a, b) {
    const x = String(a.order || ""), y = String(b.order || "");
    if (x && y && x.length === y.length) return x > y;
    return a.deletedAt > b.deletedAt;
  }
  function restoreTrashItem(item, label) {
    Promise.resolve(window.trashRestore(item.id)).then((r) => {
      if (!r || !r.ok) { toast((r && r.error) || "Could not restore this item.", 8000, { warn: true }); return; }
      if (item.isProject) {
        // Sem projeto aberto, o restaurado já abre (senão parecia que tinha sumido); com outro aberto, fica nos recentes
        const opens = !project.open && r.folder;
        const t = "Project restored: " + item.session + (opens ? "" : ". Open it from the project menu (Recent).");
        toast(t, 6000); log(t, "ok"); renderTrash();
        if (opens) Promise.resolve(window.projectOpen(r.folder)).then(projectResult);
        // Desfazer: a pasta volta para a lixeira (o projeto estava fechado); refazer restaura de novo
        let current = item.id;
        recordAction({ label: "Restore project " + item.session,
          undo: () => Promise.resolve(window.projectDelete(r.folder)).then((x) => { if (x && x.ok) { current = x.id; return true; } toast((x && x.error) || "Could not move the project back to the trash.", 8000, { warn: true }); return false; }),
          // Refazer: restaura de novo e, como no Restore, abre se não houver projeto aberto
          redo: () => Promise.resolve(window.trashRestore(current)).then((x) => {
            if (!x || !x.ok) return false;
            if (!project.open && x.folder) return Promise.resolve(window.projectOpen(x.folder)).then((o) => { projectResult(o); return true; });
            refreshSessions();
            return true;
          }) });
        return;
      }
      const text = (item.whole ? "Session restored: " : plural(item.photos, "photo", "photos") + " restored to ") + label.date;
      toast(text); log(text, "ok");
      renderTrash();
      // Desfazer: volta para a lixeira (a sessão inteira, ou só as fotos que voltaram); refazer restaura de novo
      const files = (r.files || []).slice();
      recordAction({ label: item.whole ? "Restore session " + label.date : "Restore " + plural(item.photos, "photo", "photos") + " to " + label.date,
        undo: () => item.whole ? window.deleteSession(item.session) : (files.length ? window.deletePhotos(item.session, ...files) : false),
        redo: () => restoreSession(item.session) });
    });
  }
  // Restore everything: primeiro as sessões inteiras, depois as fotos (as que dependiam de uma sessão
  // apagada depois delas voltam para dentro dela). Um passo só no Desfazer.
  function restoreEverything() {
    // Em rodadas: o que está liberado volta (sessões e projetos primeiro); o que dependia dele fica
    // liberado na rodada seguinte (fotos apagadas antes, a lixeira de um projeto)
    const done = [];
    let failed = 0;
    const tried = new Set();
    const round = (n) => Promise.resolve(window.trashList()).then((r) => {
      const ready = trashTree((r && r.items) || []).filter((x) => !x.item.restored && !x.blockedBy && !tried.has(x.item.id) && !(x.item.isProject && !x.item.reachable)).map((x) => x.item);
      if (!ready.length || n > 6) return;
      const ordered = ready.filter((i) => i.whole).concat(ready.filter((i) => !i.whole));
      const step = (k) => {
        if (k >= ordered.length) return Promise.resolve();
        const item = ordered[k];
        tried.add(item.id);
        return Promise.resolve(window.trashRestore(item.id)).then((x) => {
          if (x && x.ok) done.push({ session: item.session, whole: item.whole, files: x.files || [], project: item.isProject ? x.folder : "" }); else failed++;
          return step(k + 1);
        });
      };
      return step(0).then(() => round(n + 1));
    });
    {
      const step = round;
      step(0).then(() => {
        renderTrash();
        const text = "Restored from the trash: " + plural(done.length, "item", "items") + (failed ? " (" + failed + " could not be restored)" : "");
        toast(text, failed ? 8000 : undefined, failed ? { warn: true } : undefined); log(text, failed ? "warn" : "ok");
        if (!done.length) return;
        const projects = done.filter((d) => d.project);
        // Sem projeto aberto: abre o projeto que voltou (o primeiro, se forem vários); os outros ficam nos recentes
        if (projects.length && !project.open) Promise.resolve(window.projectOpen(projects[0].project)).then(projectResult);
        if (projects.length) toast(text + " · " + (projects.length === 1 ? "the project " + projects[0].session + (project.open ? " is in Recent" : " is open again") : plural(projects.length, "project", "projects") + " back in Recent"), 6000);
        const plain = done.filter((d) => !d.project);
        const wholeSessions = [...new Set(plain.filter((d) => d.whole).map((d) => d.session))];
        const photoOnly = plain.filter((d) => !d.whole && !wholeSessions.includes(d.session));
        const sessionsBack = [...new Set(plain.map((d) => d.session))];
        const projectIds = {};
        recordAction({ label: "Restore everything (" + plural(done.length, "item", "items") + ")",
          // Desfazer: as sessões que voltaram inteiras voltam para a lixeira inteiras; as fotos que
          // voltaram para sessões que estavam na lista, só elas
          undo: () => {
            wholeSessions.forEach((s) => window.deleteSession(s)); photoOnly.forEach((d) => d.files.length && window.deletePhotos(d.session, ...d.files));
            return Promise.all(projects.map((d) => Promise.resolve(window.projectDelete(d.project)).then((x) => { if (x && x.ok) projectIds[d.project] = x.id; })));
          },
          redo: () => Promise.all(sessionsBack.map((s) => restoreSession(s)).concat(projects.map((d) => projectIds[d.project] ? window.trashRestore(projectIds[d.project]) : null))).then(() => {
            if (projects.length && !project.open) return Promise.resolve(window.projectOpen(projects[0].project)).then((o) => { projectResult(o); return true; });
            return true;
          }) });
      });
    }
  }
  $("trashBtn").addEventListener("click", openTrash);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || selectMenu || !$("trashOverlay") || $("trashOverlay").classList.contains("hidden") || !$("dialogOverlay").classList.contains("hidden")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    closeTrash();
    $("trashBtn").focus();
  }, true);

  function renderProjectBar() {
    const open = !!project.open;
    const b = $("projectBarBtn");
    b.classList.toggle("on", open);
    b.classList.toggle("unavailable", open && project.available === false);
    // Nome com limite de caracteres, para não ocupar a barra; o nome inteiro aparece ao parar o mouse
    const PROJECT_NAME_MAX = 24;
    const name = open ? project.name || "" : "No project";
    $("projectBarName").textContent = name.length > PROJECT_NAME_MAX ? name.slice(0, PROJECT_NAME_MAX - 1).trimEnd() + "…" : name;
    $("projectBarMeta").textContent = open ? (project.available === false ? "not reachable" : [shortNum(project.sessions || 0), shortNum(project.photos || 0), project.edited ? shortNum(project.edited) + " edited" : ""].filter((x) => x !== "").join(" · ")) : "";
    b.title = open ? project.name + "\n" + project.folder + (project.available === false ? "" : "\n" + plural(project.sessions || 0, "session", "sessions") + " · " + plural(project.photos || 0, "photo", "photos") + (project.edited ? " · " + project.edited + " edited" : "")) : "Open or create a project (a folder of yours that keeps the sessions)";
    $("projectReload").classList.toggle("hidden", !(open && project.available === false));
    $("projectWindowBtn").classList.toggle("hidden", !open);
  }
  $("projectBarBtn").addEventListener("click", (e) => {
    if (e.target.closest("#projectReload")) return;  // o ↻ só relê a pasta, sem abrir o menu
    openProjectMenu(e.currentTarget, "left", true);
  });
  // ↻ (pasta do projeto fora do ar): tenta ler de novo agora; se voltou, as sessões aparecem
  function reloadProjectNow() {
    const was = project.available;
    const r = $("projectReload");
    r.classList.remove("spin"); void r.offsetWidth; r.classList.add("spin");
    refreshProject(() => {
      if (was === false && project.available !== false) toast("Project reachable again: " + project.name);
      else if (project.available === false) toast("Project folder still not reachable: " + project.folder, 3000, { warn: true, silent: true });
    });
  }
  $("projectReload").addEventListener("click", (e) => { e.stopPropagation(); reloadProjectNow(); });
  $("projectReload").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); reloadProjectNow(); } });
  $("projectWindowBtn").addEventListener("click", openProjectWindow);
  // Campo de nome de pasta: os caracteres proibidos nem entram (sem precisar de aviso depois)
  const FOLDER_FORBIDDEN = /[\\/:*?"<>|]/g;
  function blockFolderChars(input, onlyWhenFlagged) {
    input.addEventListener("beforeinput", (e) => {
      if (onlyWhenFlagged && !input.dataset.folderName) return;
      // Tecla com caractere proibido: barra; colar com vários: o "input" abaixo limpa
      if (e.data && e.data.length === 1 && FOLDER_FORBIDDEN.test(e.data)) { FOLDER_FORBIDDEN.lastIndex = 0; e.preventDefault(); toast("A folder name cannot have / \\ : * ? \" < > |", TOAST_MS, { silent: true, warn: true }); }
      FOLDER_FORBIDDEN.lastIndex = 0;
    });
    input.addEventListener("input", () => {  // colar com caracteres proibidos: limpa
      if (onlyWhenFlagged && !input.dataset.folderName) return;
      const clean = input.value.replace(FOLDER_FORBIDDEN, "");
      if (clean !== input.value) { const pos = Math.max(0, (input.selectionStart || 0) - (input.value.length - clean.length)); input.value = clean; try { input.setSelectionRange(pos, pos); } catch (e) {} toast("Characters a folder name cannot have were removed (/ \\ : * ? \" < > |)", TOAST_MS, { silent: true, warn: true }); }
    });
  }
  blockFolderChars($("promptInput"), true);  // só quando o campo pede um nome de pasta (Rename project)
  // Nome do projeto no topo da janela Project: editar e Enter (ou sair do campo) renomeia a pasta
  (function () {
    const input = $("projectNameInput");
    blockFolderChars(input);
    const problem = (v) => !v ? "Type a name." : v[0] === "." ? "The name cannot start with a dot." : "";
    const commit = () => {
      const v = input.value.trim();
      if (!project.open || v === project.name) { input.value = project.name || ""; input.classList.remove("invalid"); return; }
      const why = problem(v);
      if (why) { input.classList.add("invalid"); toast(why, 5000, { silent: true, warn: true }); input.focus(); return; }
      const before = project.name;
      applyRename(v).then((ok) => {
        if (ok) recordAction({ label: 'Rename project "' + before + '" → "' + v + '"', undo: () => applyRename(before), redo: () => applyRename(v) });
        else input.value = project.name || "";
        input.classList.remove("invalid");
      });
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { e.preventDefault(); input.value = project.name || ""; input.classList.remove("invalid"); input.blur(); }
    });
    input.addEventListener("input", () => input.classList.toggle("invalid", !!problem(input.value.trim())));
    input.addEventListener("change", commit);
  })();

  function projectResult(r) {
    if (!r || r.cancelled) return;
    if (r.error) { toast(r.error, 8000); log(r.error, "error"); return; }
    if (r.notProject) {
      dialog("Not a project folder", "This folder has no " + "stillpoint-project.json" + ". Create a new project in it? Stillpoint adds the project file and the Originals, Edited and Exports folders; nothing already there is touched.", [
        { label: "Cancel" },
        { label: "Create project here", primary: true, onClick: () => Promise.resolve(window.projectCreateAt(r.folder)).then(projectResult) },
      ]);
      return;
    }
    const opened = r.project && r.project.open && (!project.open || project.folder !== r.project.folder);
    if (opened) pendingProjectFocus = true;
    if (r.project) setProject(r.project);
    if (r.project && r.project.open) { toast("Project: " + r.project.name); log("Project opened: " + r.project.name, "ok"); }
    refreshSessions();
  }
  function callProject(fn, ...args) {
    if (typeof window[fn] !== "function") { toast("This build has no project support (" + fn + ")", 8000); log("Missing app function: " + fn, "error"); return Promise.resolve(null); }
    return Promise.resolve(window[fn](...args)).catch((e) => { log("Project: " + fn + " failed: " + e, "error"); return null; });
  }
  // Pasta onde os projetos novos são criados (uiReady/projectsFolderInfo; Settings → Change…)
  let projectsFolder = "";
  const shortPath = (p) => String(p || "").replace(/^\/Users\/[^/]+(?=\/)/, "~");  // Mac: ~/Pictures/Stillpoint
  function newProject() {
    log("New project…", "tech");
    if (typeof window.projectsFolderInfo !== "function") { callProject("projectNew").then(projectResult); return; }  // app antigo
    $("promptInput").dataset.folderName = "1";
    // Outra pasta (só para este projeto): a caixa continua aberta; depois de escolher, a pessoa dá o nome
    let base = "";
    const where = () => "A folder with this name will be created in " + shortPath(base || projectsFolder) + ".";
    promptDialog("New project", where(), "", "Create",
      (v) => {
        if (!v) return "Type a name for the project.";
        if (v[0] === ".") return "The name cannot start with a dot.";
        if (typeof window.projectNameFree !== "function") return "";
        return Promise.resolve(window.projectNameFree(v, base)).then((r) => !r || r.free ? ""
          : (r.project ? "There is already a project named \"" + v + "\" in " + shortPath(r.folder) + ". Open it from Recent or choose another name."
                       : "There is already a folder named \"" + v + "\" in " + shortPath(r.folder) + ". Choose another name."));
      },
      (v) => {
        const before = project.open ? project.folder : "";
        return callProject("projectNew", v, base).then((r) => {
          projectResult(r);
          // Desfazer: volta ao projeto de antes (ou a nenhum) e apaga a pasta criada, se ela ainda
          // estiver vazia (com algo dentro, fica no disco e o app avisa). Refazer cria de novo.
          if (r && r.project && r.project.open && !r.error) {
            const made = r.project.folder, name = r.project.name;
            recordAction({ label: "New project " + name,
              undo: () => (before ? Promise.resolve(window.projectOpen(before)) : Promise.resolve(window.projectClose())).then((x) => {
                projectResult(x);
                if (x && x.error) return false;
                if (typeof window.projectDiscardNew !== "function") return true;
                return Promise.resolve(window.projectDiscardNew(made)).then((d) => {
                  if (d && !d.ok && d.reason === "notEmpty") toast("The folder " + shortPath(made) + " already has files, so it stays on the disk.", 6000, { warn: true });
                  return true;
                });
              }),
              redo: () => Promise.resolve(window.projectCreateAt ? window.projectCreateAt(made) : window.projectOpen(made)).then((x) => { projectResult(x); return !(x && x.error); }) });
          }
        });
      },
      { extra: { label: "Choose another folder…", keepOpen: typeof window.projectChooseParent === "function", onClick: () => {
        if (typeof window.projectChooseParent !== "function") { callProject("projectNew", "").then(projectResult); return; }  // app antigo
        Promise.resolve(window.projectChooseParent(base || projectsFolder)).then((r) => {
          if (r && r.folder) { base = r.folder; $("promptText").textContent = where(); $("promptError").classList.add("hidden"); }
          $("promptReset").classList.toggle("hidden", !base);
          $("promptInput").focus();
        });
      } } });
    // Voltar para a pasta padrão (aparece depois de escolher outra)
    $("promptReset").onclick = () => {
      base = "";
      $("promptText").textContent = where(); $("promptError").classList.add("hidden");
      $("promptReset").classList.add("hidden");
      $("promptInput").focus();
    };
  }
  // Apagar o projeto: a pasta inteira vai para a lixeira (no mesmo disco, 15 dias); Cmd+Z traz de volta e abre
  function deleteProjectAsk() {
    if (!project.open) return;
    const name = project.name, folder = project.folder;
    dialog("Delete the project " + name + "?",
      "The whole project folder (" + plural(project.sessions || 0, "session", "sessions") + (project.bytes ? ", " + fmtBytes(project.bytes) : "") + ") goes to the Trash, where it stays for " + trash.days +
      " days. It stays on the same disk, in a hidden folder next to it, so nothing is copied. The project closes.", [
      { label: "Cancel" },
      { label: "Delete project", danger: true, onClick: () => {
        closeProjectWindow();
        const del = () => Promise.resolve(window.projectDelete()).then((r) => {
          if (!r || !r.ok) { const msg = (r && r.error) || "Could not delete the project."; toast(msg, 8000, { warn: true }); log(msg, "error"); return null; }
          if (r.project) setProject(r.project);
          refreshSessions();
          toast("Project moved to the Trash: " + name); log("Project moved to the Trash: " + name, "ok");
          return r.id;
        });
        del().then((id) => {
          if (!id) return;
          let current = id;
          recordAction({ label: "Delete project " + name,
            undo: () => Promise.resolve(window.trashRestore(current)).then((x) => {
              if (!x || !x.ok) { toast((x && x.error) || "Could not restore the project.", 8000, { warn: true }); return false; }
              return Promise.resolve(window.projectOpen(folder)).then((o) => { projectResult(o); return true; });
            }),
            redo: () => del().then((nid) => { if (nid) current = nid; return !!nid; }) });
        });
      } },
    ]);
  }
  // Fechar o projeto com desfazer (Ctrl/Cmd+Z abre de novo; refazer fecha outra vez)
  function closeProjectUndoable() {
    const name = project.name, folder = project.folder;
    const close = () => Promise.resolve(window.projectClose()).then((r) => { toast("Project closed: " + name + " (the sessions stay in its folder)"); projectResult(r); return !(r && r.error); });
    close().then((ok) => {
      if (!ok) return;
      recordAction({ label: "Close project " + name,
        undo: () => Promise.resolve(window.projectOpen(folder)).then((r) => { projectResult(r); return !(r && (r.error || r.notProject)); }),
        redo: close });
    });
  }
  function clearRecentProjects(all) {
    const keep = all.filter((f) => project.open && f === project.folder);
    const apply = (list) => Promise.resolve(window.projectRecentSet(...list));
    apply(keep).then(() => {
      toast("Recent projects cleared");
      recordAction({ label: "Clear recent projects", undo: () => apply(all), redo: () => apply(keep) });
    });
  }
  let projectsFolderCustom = false;  // escolhida em Settings (senão a padrão)
  function renderProjectsFolder() {
    const el_ = $("settingsProjectsFolder");
    if (el_) el_.textContent = shortPath(projectsFolder) || "—";
    $("settingsProjectsFolderReset").classList.toggle("hidden", !projectsFolderCustom);
  }
  function refreshProjectsFolder() {
    if (typeof window.projectsFolderInfo !== "function") return;
    Promise.resolve(window.projectsFolderInfo()).then((r) => {
      if (!r) return;
      projectsFolder = r.folder || projectsFolder; projectsFolderCustom = !!r.custom;
      renderProjectsFolder();
    });
  }
  // Volta para a pasta padrão (Imagens/Stillpoint); a pasta de salvar sem projeto vai junto (…/Exports)
  $("settingsProjectsFolderReset").addEventListener("click", () => {
    Promise.resolve(window.projectsFolderChange("reset")).then((r) => {
      if (!r) return;
      projectsFolder = r.folder || projectsFolder; projectsFolderCustom = false;
      exp.destDefault = null;
      renderProjectsFolder();
      toast("New projects folder: " + shortPath(projectsFolder) + " (default)");
    });
  });
  $("settingsProjectsFolderChange").addEventListener("click", () => {
    if (typeof window.projectsFolderChange !== "function") { toast("This build cannot change the projects folder yet. Build the app again.", 8000); return; }
    Promise.resolve(window.projectsFolderChange()).then((r) => {
      if (!r || r.cancelled) return;
      projectsFolder = r.folder || projectsFolder;
      projectsFolderCustom = r.custom !== false;
      exp.destDefault = null;
      renderProjectsFolder();
      toast("New projects folder: " + shortPath(projectsFolder));
    });
  });
  function browseProject() { callProject("projectOpen", "").then(projectResult); }
  // Escolher um Project: recentes + "Choose folder…" + "New project…"
  const pickRoving = makeRoving({ root: () => $("projectRecentList"), rows: (r) => [...r.querySelectorAll(".project-recent-item")], controls: (row) => [row], id: (row) => row.dataset.folder });
  function pickProject() {
    const list = $("projectRecentList"); list.innerHTML = "";
    Promise.resolve(window.projectRecent()).then((r) => {
      const recent = (r && r.projects) || [];
      if (!recent.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "No recent projects."; list.appendChild(p); }
      recent.forEach((p) => {
        const b = document.createElement("button");
        b.className = "btn btn-secondary project-recent-item" + (project.open && p.folder === project.folder ? " current" : "");
        b.disabled = !p.available;
        b.innerHTML = '<b></b><small></small>';
        b.querySelector("b").textContent = p.name + (p.available ? "" : "  ·  not reachable");
        b.querySelector("small").textContent = p.folder;
        b.addEventListener("click", () => { $("projectPickOverlay").classList.add("hidden"); Promise.resolve(window.projectOpen(p.folder)).then(projectResult); });
        b.dataset.folder = p.folder;
        list.appendChild(b);
      });
      pickRoving.cur = "";
      pickRoving.apply();
    });
    $("projectPickOverlay").classList.remove("hidden");
  }
  $("projectPickCancel").addEventListener("click", () => $("projectPickOverlay").classList.add("hidden"));
  $("projectPickBrowse").addEventListener("click", () => { $("projectPickOverlay").classList.add("hidden"); browseProject(); });
  $("projectPickNew").addEventListener("click", () => { $("projectPickOverlay").classList.add("hidden"); newProject(); });

  // ---- Janela Project ----
  function projectSessions() { return sessions.filter((s) => s.inProject); }
  let projectSelTouched = false;  // a pessoa já mexeu na seleção? (senão, todas marcadas)
  function openProjectWindow() {
    if (!project.open) return;
    const names = projectSessions().map((s) => s.name);
    [...projectSel].forEach((n) => { if (!names.includes(n)) projectSel.delete(n); });
    if (!projectSelTouched || !projectSel.size) names.forEach((n) => projectSel.add(n));
    renderProjectWindow();
    $("projectOverlay").classList.remove("hidden");
    refreshProject(null, true);  // com o tamanho das pastas (só aqui: é a parte lenta)
    // O campo do nome já vem com o foco (cursor no fim, como se tivesse clicado nele)
    setTimeout(() => { const i = $("projectNameInput"); i.focus(); const n = i.value.length; i.setSelectionRange(n, n); }, 0);
  }
  // Relê as sessões e o estado do Project (ex.: fotos que o Lightroom acabou de gravar em
  // Edited/): ao abrir a janela Project e sempre que o app volta a ser a janela da frente.
  // Relê o projeto e as sessões (ao voltar ao primeiro plano, ao abrir o menu do botão e no ↻).
  // Se a pasta estava fora do ar e voltou, o app religa sozinho (projectInfo faz isso do lado C++).
  function refreshProject(done, withSize) {
    if (!project.open || typeof window.projectInfo !== "function") { if (done) done(); return; }
    Promise.all([window.projectInfo(withSize ? "size" : ""), window.listSessions()]).then(([r, list]) => {
      if (r && r.project) setProject(r.project);
      setSessions(list);
      if (done) done();
    }).catch(() => { if (done) done(); });
  }
  window.addEventListener("focus", () => refreshProject());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshProject(); });
  function closeProjectWindow() { $("projectOverlay").classList.add("hidden"); }
  const projectRoving = makeRoving({ root: () => $("projectList"), rows: (r) => [...r.querySelectorAll("li.project-row")], id: (row) => row.dataset.name });
  function renderProjectWindow() {
    const list = projectSessions();
    const nameInput = $("projectNameInput");
    if (document.activeElement !== nameInput) { nameInput.value = project.name || ""; nameInput.classList.remove("invalid"); }
    $("projectSub").textContent = [project.folder, plural(project.sessions || 0, "session", "sessions"), plural(project.photos || 0, "photo", "photos"), fmtBytes(project.bytes)].filter(Boolean).join(" · ");
    const ul = $("projectList");
    const focusWas = projectRoving.where(document.activeElement);
    ul.innerHTML = "";
    $("projectEmpty").classList.toggle("hidden", list.length > 0);
    [...projectSel].forEach((n) => { if (!list.some((s) => s.name === n)) projectSel.delete(n); });
    list.forEach((s) => {
      const label = sessionLabel(s.name);
      const total = s.photos.length;
      const li = document.createElement("li");
      li.className = "project-row" + (projectSel.has(s.name) ? " sel" : "");
      li.innerHTML = '<label class="export-check"><input type="checkbox"><span class="save-check" aria-hidden="true"></span></label>' +
        '<span class="export-thumb"></span>' +
        '<span class="project-row-main"><input class="project-label" type="text" maxlength="60" placeholder="Label (optional)"><span class="folder-meta"></span></span>' +
        '<span class="project-row-count"></span><span class="project-row-edited"></span>' +
        '<button class="btn btn-link btn-small project-row-play" title="Show this session">Show</button>';
      const box = li.querySelector("input[type=checkbox]"); box.checked = projectSel.has(s.name);
      box.addEventListener("change", () => { projectSelTouched = true; if (box.checked) projectSel.add(s.name); else projectSel.delete(s.name); li.classList.toggle("sel", box.checked); updateProjectCount(); });
      const labelInput = li.querySelector(".project-label"); labelInput.value = s.label || "";
      attachSuggest(labelInput, () => labelSuggestions(s.name), () => labelInput.dispatchEvent(new Event("change")));
      labelInput.title = "Click to name this session, for example \"Pose 7\"";
      labelInput.addEventListener("change", () => setSessionLabelUndoable(s, labelInput.value.trim()));
      labelInput.addEventListener("keydown", (e) => { if (e.key === "Enter") labelInput.blur(); e.stopPropagation(); });
      li.querySelector(".folder-meta").textContent = [label.date, s.timing || label.detail].filter(Boolean).join(" · ");
      li.querySelector(".project-row-count").textContent = String(total);
      const ed = li.querySelector(".project-row-edited");
      if (s.edited > 0) { const t = projectTag(s); ed.appendChild(t); }
      else { const t = document.createElement("span"); t.className = "project-tag dim"; t.textContent = "originals"; ed.appendChild(t); }
      // Avisos na coluna Session, embaixo da data, como na lista Sessions (a coluna Edited fica só com as editadas)
      const warnBox = el("span", "project-row-warns");
      { const ri = ratioInfoCached(s.name); if (ri && ri.mixed) warnBox.appendChild(mixedTag(s.name, ri)); }
      if (s.missing > 0) warnBox.appendChild(missingTag(s.missing));
      if (deletedBySession[s.name]) warnBox.appendChild(deletedTag(deletedBySession[s.name]));
      if (editTagFor(s.name)) warnBox.appendChild(editTagFor(s.name));
      if (warnBox.childNodes.length) li.querySelector(".project-row-main").appendChild(warnBox);
      // Botão direito numa linha: mandar a sessão para o Lightroom Classic (etapa 20)
      li.addEventListener("contextmenu", (e) => {
        if (e.target.closest("input")) return;
        e.preventDefault();
        popupMenuAt(e.clientX, e.clientY, [
          { label: "Edit in Lightroom Classic", onClick: () => editSessionInLightroom(s) },
        ]);
      });
      const first = s.photos.find((p) => p.previewable);
      if (first) sessionPhoto(s.name, first.file, 320).then((url) => { if (url) li.querySelector(".export-thumb").style.backgroundImage = "url(" + url + ")"; });
      li.querySelector(".project-row-play").addEventListener("click", () => { closeProjectWindow(); showSession(s); });
      li.dataset.name = s.name;
      ul.appendChild(li);
    });
    updateProjectCount();
    projectRoving.apply();
    if (focusWas) projectRoving.focusAt(focusWas.id, focusWas.i);
  }
  function updateProjectCount() {
    const list = projectSessions();
    const n = projectSel.size;
    $("projectListCount").textContent = n + " of " + plural(list.length, "session", "sessions") + " selected";
    $("projectExportBtn").disabled = n === 0 || project.available === false;
    $("projectExportBtn").textContent = n ? "Export " + plural(n, "session", "sessions") + "…" : "Export…";
    $("projectRemoveBtn").disabled = n === 0;
    $("projectDeleteBtn").disabled = n === 0;
    $("projectDeleteBtn").textContent = n > 1 ? "Delete " + n + " sessions…" : n === 1 ? "Delete 1 session…" : "Delete…";
    $("projectSelectAll").disabled = n === list.length;
    $("projectUnselectAll").disabled = n === 0;
    const editedOnes = list.filter((s) => s.edited > 0 && s.edited >= s.photos.length);
    $("projectSelectEdited").disabled = !editedOnes.length;
    $("projectHint").textContent = project.available === false ? "The project folder is not reachable." : "";
  }
  $("projectSelectAll").addEventListener("click", () => { projectSelTouched = true; projectSessions().forEach((s) => projectSel.add(s.name)); renderProjectWindow(); });
  $("projectUnselectAll").addEventListener("click", () => { projectSelTouched = true; projectSel.clear(); renderProjectWindow(); });
  $("projectSelectEdited").addEventListener("click", () => { projectSelTouched = true; projectSel.clear(); projectSessions().filter((s) => s.edited > 0 && s.edited >= s.photos.length).forEach((s) => projectSel.add(s.name)); renderProjectWindow(); });
  $("projectCloseBtn").addEventListener("click", closeProjectWindow);
  $("projectFolderBtn").addEventListener("click", () => window.projectOpenFolder());
  $("projectSwitchBtn").addEventListener("click", () => pickProject());  // a janela Project fica aberta por baixo
  $("projectDeleteProjectBtn").addEventListener("click", deleteProjectAsk);
  $("projectCloseProjectBtn").addEventListener("click", () => {
    dialog("Close the project?", "The project's sessions leave the list (they stay in " + project.folder + "; nothing is deleted). New sessions go back to staying in the app until you export them. You can open the project again any time.", [
      { label: "Cancel" },
      { label: "Close project", primary: true, onClick: () => { closeProjectWindow(); closeProjectUndoable(); } },
    ]);
  });
  $("projectDeleteBtn").addEventListener("click", () => {
    const names = projectSessions().filter((s) => projectSel.has(s.name)).map((s) => s.name);
    if (names.length === 1) { deleteSessionAsk(sessions.find((x) => x.name === names[0])); return; }
    deleteMany(names, () => { names.forEach((n) => projectSel.delete(n)); });
  });
  $("projectRemoveBtn").addEventListener("click", () => {
    const names = [...projectSel];
    dialog(names.length === 1 ? "Remove the session from the project?" : "Remove " + names.length + " sessions from the project?",
      "The photos move back to the app (out of the project folder); nothing is deleted. They count as not exported again.", [
      { label: "Cancel" },
      { label: "Remove", primary: true, onClick: () => applyMove(names, false).then((ok) => {
        renderProjectWindow();
        if (ok) recordAction({ label: "Remove from project: " + plural(names.length, "session", "sessions"), undo: () => applyMove(names, true), redo: () => applyMove(names, false) });
      }) },
    ]);
  });
  // Export…: a janela de salvar, só com as sessões do Project e "Use edited photos"
  $("projectExportBtn").addEventListener("click", () => {
    const names = [...projectSel];
    if (!names.length) return;
    closeProjectWindow();
    exp.exitAfter = false;
    openExport(names);
  });

  // =================== Ações ===================
  ui.restartBtn.addEventListener("click", () => {
    dialog("Restart camera connections?", "Use this when a camera is on and plugged in but does not connect. All cameras reconnect.", [
      { label: "Cancel" },
      { label: "Restart", primary: true, onClick: () => window.restartConnections() },
    ]);
  });
  ui.shootBtn.addEventListener("click", () => startShoot(false));
  function startShoot(confirmed) {
    if (busy && busyAction === "shoot") return cancelShoot();
    const plan = timingPlan();
    if (plan.warn && !plan.shots.length) { toast(plan.warn, 6000); return; }
    // Câmera repetindo cedo demais: a foto vai faltar; pergunta antes (decisão de 2026-10-22)
    const repeat = timingTightestRepeat(plan.shots);
    if (!confirmed && repeat && repeat.gap < CAMERA_REPEAT_MS) {
      const early = plan.shots.filter((sh) => sh.pass > 0 && repeatGap(plan.shots, sh) < CAMERA_REPEAT_MS);
      const cams = [...new Set(early.map((sh) => sh.order))].sort((a, b) => a - b);
      dialog(plural(early.length, "photo", "photos") + " will be missing",
        (cams.length === 1 ? "Camera " + cams[0] + " repeats" : "Cameras " + cams.join(", ") + " repeat") + " too soon: " +
        "a camera needs at least " + fmtS(CAMERA_REPEAT_MS) + " between its own shots and refuses the photo otherwise. " +
        "Fix it in Timing (a longer interval or gap, or a direction without the return) or shoot anyway with " +
        (early.length === 1 ? "that photo" : "those photos") + " missing.",
        [{ label: "Fix timing" }, { label: "Shoot anyway", primary: true, onClick: () => startShoot(true) }]);
      return;
    }
    shootPlan = plan;
    shootMissing = [];
    const schedule = timing.mode === "all" ? "" : plan.shots.map((s) => s.cam + ":" + s.t).join(",");
    // Som: "disparo,grupos" (1/0)
    const sounds = (sound.sound ? "1" : "0") + "," + (sound.sound && sound.sounds ? "1" : "0");
    window.shoot(String(intValue(ui.countdown, 0, 0)), String(intValue(ui.sessions, 1, 1)), String(intValue(ui.downloadWait, 1, 10)), schedule, sounds,
      timing.mode === "all" ? "All at once" : timingSummaryText(plan));
  }
  // Espaço entre esta foto e a anterior da mesma câmera no plano (ms); Infinity se é a primeira
  function repeatGap(shots, shot) {
    let prev = -Infinity;
    shots.forEach((sh) => { if (sh.order === shot.order && sh.t < shot.t && sh.t > prev) prev = sh.t; });
    return prev === -Infinity ? Infinity : shot.t - prev;
  }

  // =================== Live view (janela separada: assets/ui/live.html) ===================
  // O botão abre (ou traz de volta) a janela Live 1; dentro dela dá para abrir a 2ª.
  // As janelas Live pedem o disparo e o cancelamento por aqui (o plano do Timing é desta página).
  $("liveBtn").addEventListener("click", () => { log("Live view opened", "tech"); window.openLive("1"); });
  // Folha de teste do lenticular direto da tela principal (sem abrir a janela de salvar)
  $("pitchBtn").innerHTML = icon("lens", 15);
  $("pitchBtn").addEventListener("click", () => openPitchTest(null));
  window.liveShootRequest = () => { if (!ui.shootBtn.disabled && !(busy && busyAction === "shoot")) ui.shootBtn.click(); };
  window.liveCancelRequest = () => cancelShoot();
  // Som do disparo (contagem, "it's bullet time", bip dos grupos): ajuste do app, guardado em
  // settings.txt (live=); o botão da barra de cima e o das janelas Live mudam o mesmo valor
  var sound = { sound: true, sounds: true };
  function renderSoundBtn() {
    $("soundBtn").classList.toggle("off", !sound.sound);
    $("soundBtn").title = "Sound of the countdown and the shots: " + (sound.sound ? "on" : "off");
  }
  $("soundBtn").addEventListener("click", () => window.liveSetSound(sound.sound ? "0" : "1", sound.sounds ? "1" : "0"));

  // =================== Timing: como as câmeras disparam ===================
  // Modos: todas juntas; Sweep (uma câmera depois da outra: intervalo livre a partir de
  // 0,05 s, atalhos 0,1/0,2/0,3/0,4, direção, loops); grupos; ímpares/pares; custom (passos:
  // câmeras + tempo depois do passo anterior).
  // O plano vira "câmera:ms,..." para o app; vazio = todas juntas, como sempre.
  // Decisão de 2026-10-21: "One after another" e "Sweep" eram o mesmo plano com duas caras;
  // viraram um modo só, "Sweep". Um settings.txt antigo (mode "seq", ou "sweep" com os campos
  // sweep/sweepDirection) é convertido ao carregar.
  // Direction (Sweep: câmeras; Groups: grupos; Odd / even: ímpares/pares): fwd = 1 → N,
  // back = N → 1, pingpong = 1 → N → 1 (os do meio repetem; com loops, 1…N…2 repetido e o 1 no fim).
  const TIMING_DEFAULT = { mode: "all", interval: 0.2, direction: "fwd", loops: 1, groups: 2, gap: 1, groupsDirection: "fwd", oeGap: 1, oeDirection: "fwd", stepsDirection: "fwd", steps: [{ after: 0, cams: [1, 2, 3] }, { after: 1, cams: [4, 5, 6] }] };
  const TIMING_MODES = [["all", "All at once"], ["sweep", "Sweep"], ["groups", "Groups"], ["oddeven", "Odd / even"], ["custom", "Custom"]];
  const TIMING_SHORT = { all: "At once", sweep: "Sweep", groups: "Groups", oddeven: "Odd / even", custom: "Custom" };
  const SWEEP_INTERVALS = [0.1, 0.2, 0.3, 0.4];  // atalhos; o campo aceita qualquer valor
  // Medido em 2026-10-22 (T7, RAW, SdkMultiprocTest --repeat): a câmera recusa ("busy") uma
  // nova foto até ~0,93 s depois da anterior ACEITA, e a ordem de disparo leva 0,1–0,23 s para
  // chegar; com 1,0 s no plano ela recusou um sim, outro não. Abaixo de 1,2 s, o app avisa.
  const CAMERA_REPEAT_MS = 1200;
  let timing = JSON.parse(JSON.stringify(TIMING_DEFAULT));
  let timingOpen = false;
  let timingSaveTimer = 0;
  function timingLoad(text) {
    if (!text) return;
    try {
      const t = JSON.parse(text);
      if (t && typeof t === "object") {
        // Formatos antigos (antes da fusão): "seq" vira Sweep com o mesmo intervalo;
        // "sweep" antigo guardava o intervalo em `sweep` e a direção em `sweepDirection`.
        if (t.mode === "seq") t.mode = "sweep";
        else if (t.mode === "sweep" && t.sweep !== undefined) { t.interval = t.sweep; if (t.sweepDirection) t.direction = t.sweepDirection; }
        delete t.sweep; delete t.sweepDirection;
        timing = Object.assign(JSON.parse(JSON.stringify(TIMING_DEFAULT)), t);
      }
      if (!TIMING_MODES.some(([m]) => m === timing.mode)) timing.mode = "all";
      if (!Array.isArray(timing.steps) || !timing.steps.length) timing.steps = JSON.parse(JSON.stringify(TIMING_DEFAULT.steps));
    } catch (e) { timing = JSON.parse(JSON.stringify(TIMING_DEFAULT)); }
  }
  function timingSave() {
    clearTimeout(timingSaveTimer);
    timingSaveTimer = setTimeout(() => {
      if (typeof window.saveTiming === "function") window.saveTiming(JSON.stringify(timing));
      const t = $("timingText"); if (t && t.textContent) log("Timing: " + t.textContent, "tech");
    }, 300);
  }
  const num = (v, min, max, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  const fmtS = (ms) => (Math.round(ms / 100) / 10) + " s";
  // Plano: lista de { cam (nome), order, t (ms), pass (0 = primeira foto da câmera) }
  function timingPlan() {
    const cams = placedCameras().filter((c) => c.connected).sort((a, b) => a.order - b.order);
    const N = cams.length;
    const byOrder = (o) => cams[o - 1];
    const shots = [];
    let warn = "";
    const add = (o, t) => { const c = byOrder(o); if (!c) return; shots.push({ cam: c.name, order: o, t: Math.round(t), pass: shots.filter((s) => s.order === o).length }); };
    const loops = Math.max(1, Math.round(num(timing.loops, 1, 99, 1)));
    if (N === 0) return { shots, warn: "", total: "", N };
    if (timing.mode === "all") {
      for (let o = 1; o <= N; o++) add(o, 0);
    } else if (timing.mode === "sweep") {
      const ms = num(timing.interval, 0.05, 600, 0.2) * 1000;
      const slots = directionSlots(timing.direction, N, loops);
      slots.forEach((o, k) => add(o, k * ms));
    } else if (timing.mode === "groups") {
      const g = Math.max(1, Math.min(N, Math.round(num(timing.groups, 1, 99, 2))));
      const gap = num(timing.gap, 0.05, 600, 1) * 1000;
      const size = Math.ceil(N / g);
      // Cada "slot" é um grupo inteiro disparando junto; a direção ordena os grupos
      const slots = directionSlots(timing.groupsDirection, g, loops);
      slots.forEach((grp, k) => { for (let o = 1; o <= N; o++) if (Math.floor((o - 1) / size) === grp - 1) add(o, k * gap); });
    } else if (timing.mode === "oddeven") {
      const gap = num(timing.oeGap, 0.05, 600, 1) * 1000;
      // Dois "slots": 1 = ímpares, 2 = pares; a direção diz quem vai primeiro (e a ida e volta)
      const slots = directionSlots(timing.oeDirection, 2, loops);
      slots.forEach((set, k) => { for (let o = 1; o <= N; o++) if ((o % 2 === 1) === (set === 1)) add(o, k * gap); });
    } else if (timing.mode === "custom") {
      // Passos como "slots" na direção escolhida; o tempo entre dois passos vizinhos é o "after"
      // do passo de número maior, nos dois sentidos (1 → 2 e 2 → 1 usam o after do passo 2).
      // Entre o fim de uma volta e o começo da seguinte: o after do passo 2 (ou 1 s com um passo só).
      const after = (i) => num(timing.steps[i].after, 0, 600, 1) * 1000;
      const slots = directionSlots(timing.stepsDirection, timing.steps.length, loops);
      const repeatGap = timing.steps.length > 1 ? after(1) : 1000;
      let t = 0;
      slots.forEach((stepNo, k) => {
        if (k > 0) {
          const prev = slots[k - 1];
          // Passos vizinhos: o after do maior; volta de loop (último → primeiro): o after do passo 2
          t += Math.abs(prev - stepNo) === 1 ? after(Math.max(prev, stepNo) - 1) : repeatGap;
        }
        (timing.steps[stepNo - 1].cams || []).filter((o) => o >= 1 && o <= N).sort((x, y) => x - y).forEach((o) => add(o, t));
      });
      const used = new Set(); timing.steps.forEach((st) => (st.cams || []).forEach((o) => used.add(o)));
      const missing = []; for (let o = 1; o <= N; o++) if (!used.has(o)) missing.push(o);
      if (missing.length) warn = (missing.length === 1 ? "Camera " + missing[0] + " is" : "Cameras " + missing.join(", ") + " are") + " not in any step and will not fire.";
      if (!shots.length) warn = "No camera is in any step. Add cameras to the steps.";
    }
    shots.sort((a, b) => a.t - b.t || a.order - b.order);
    // Mesma câmera repetindo cedo demais (loops, ida e volta, custom): a câmera recusa a
    // foto. Menor espaço entre duas fotos da mesma câmera, em qualquer modo.
    const repeat = timingTightestRepeat(shots);
    if (repeat && repeat.gap < CAMERA_REPEAT_MS) {
      const text = "Camera " + repeat.order + " would shoot again " + fmtS(repeat.gap) + " after its previous shot" +
        (repeat.count > 1 ? " (" + repeat.count + " cameras repeat too soon)" : "") +
        ". A camera needs at least " + fmtS(CAMERA_REPEAT_MS) + " between its own shots; that photo will be missing.";
      warn = warn ? warn + " " + text : text;
    }
    const span = shots.length ? shots[shots.length - 1].t : 0;
    const total = !shots.length ? "" : span === 0 ? shots.length + " shots at once" : shots.length + " shots over " + fmtS(span);
    return { shots, warn, total, N };
  }
  // Ordem de 1..n segundo a direção, repetida `loops` vezes: fwd 1..n; back n..1;
  // pingpong 1..n..2 repetido e o 1 no fim (nunca a mesma posição duas vezes seguidas).
  function directionSlots(direction, n, loops) {
    const fwd = Array.from({ length: n }, (_, i) => i + 1);
    let order = fwd;
    if (direction === "back") order = fwd.slice().reverse();
    else if (direction === "pingpong") order = n > 1 ? fwd.concat(fwd.slice(1, -1).reverse()) : fwd;
    const out = [];
    for (let l = 0; l < loops; l++) out.push(...order);
    if (direction === "pingpong" && n > 1) out.push(1);
    return out;
  }
  function directionLabel(direction, n, first, last) {
    const a = first || "1", b = last || String(n);
    return direction === "back" ? b + " → " + a : direction === "pingpong" ? a + " → " + b + " → " + a : a + " → " + b;
  }
  // Menor espaço entre duas fotos da mesma câmera no plano (ms), qual câmera e quantas
  // câmeras ficam abaixo do limite. null quando nenhuma câmera repete.
  function timingTightestRepeat(shots) {
    const byCam = new Map();
    shots.forEach((s) => { if (!byCam.has(s.order)) byCam.set(s.order, []); byCam.get(s.order).push(s.t); });
    let best = null, count = 0;
    byCam.forEach((times, order) => {
      times.sort((a, b) => a - b);
      let gap = Infinity;
      for (let i = 1; i < times.length; i++) gap = Math.min(gap, times[i] - times[i - 1]);
      if (gap === Infinity) return;
      if (gap < CAMERA_REPEAT_MS) count++;
      if (!best || gap < best.gap) best = { order, gap };
    });
    return best ? { order: best.order, gap: best.gap, count } : null;
  }
  function timingLabel(orders) {
    if (orders.length === 1) return String(orders[0]);
    const sorted = orders.slice().sort((a, b) => a - b);
    if (sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1)) return sorted[0] + "–" + sorted[sorted.length - 1];
    if (sorted.every((v) => v % 2 === 1)) return "odd (" + sorted.length + ")";
    if (sorted.every((v) => v % 2 === 0)) return "even (" + sorted.length + ")";
    return sorted.length > 6 ? sorted.length + " cams" : sorted.join(",");
  }
  function renderTimeline(root, plan, small) {
    root.innerHTML = "";
    root.classList.remove("stagger");
    const axis = el("div", "axis"); root.appendChild(axis);
    if (!plan.shots.length) return;
    const tmax = Math.max(1, plan.shots[plan.shots.length - 1].t);
    const width = root.clientWidth || 500;
    const X = (t) => 14 + (plan.shots[plan.shots.length - 1].t ? (t / tmax) * (width - 28) : 0);
    const groups = new Map();
    plan.shots.forEach((s) => { const k = s.t + "|" + (s.pass ? 1 : 0); if (!groups.has(k)) groups.set(k, { t: s.t, pass: s.pass, orders: [] }); groups.get(k).orders.push(s.order); });
    const list = [...groups.values()];
    // Apertado (bolinhas a menos de 20 px): alterna em duas alturas para os números lerem
    let minGap = Infinity;
    for (let i = 1; i < list.length; i++) minGap = Math.min(minGap, X(list[i].t) - X(list[i - 1].t));
    const stagger = list.length > 1 && minGap < 20;
    if (stagger) root.classList.add("stagger");
    list.forEach((g, i) => {
      const d = el("span", "dot" + (g.pass ? " second" : "") + (stagger && i % 2 ? " low" : ""), timingLabel(g.orders));
      d.style.left = X(g.t) + "px";
      d.title = (g.orders.length === 1 ? "Camera " + g.orders[0] : "Cameras " + g.orders.join(", ")) + " at " + fmtS(g.t);
      root.appendChild(d);
    });
    if (!small) [0, 0.5, 1].forEach((f) => {
      if (plan.shots[plan.shots.length - 1].t === 0 && f > 0) return;
      const tick = el("span", "tick" + (f === 0 ? " first" : ""), fmtS(f * tmax)); tick.style.left = X(f * tmax) + "px"; root.appendChild(tick);
    });
  }
  function timingSummaryText(plan) {
    const name = TIMING_MODES.find(([m]) => m === timing.mode)[1];
    const parts = [name];
    const loops = Math.round(num(timing.loops, 1, 99, 1));
    if (timing.mode === "sweep") parts.push(num(timing.interval, 0.05, 600, 0.2) + " s", directionLabel(timing.direction, plan.N));
    if (timing.mode === "groups") {
      const g = Math.max(1, Math.min(Math.max(plan.N, 1), Math.round(num(timing.groups, 1, 99, 2))));
      parts.push(g + " groups · " + num(timing.gap, 0.05, 600, 1) + " s", directionLabel(timing.groupsDirection, g));
    }
    if (timing.mode === "oddeven") parts.push(directionLabel(timing.oeDirection, 2, "odd", "even") + " · " + num(timing.oeGap, 0.05, 600, 1) + " s");
    if (timing.mode === "custom") parts.push(timing.steps.length + " steps", directionLabel(timing.stepsDirection, timing.steps.length));
    if (timing.mode !== "all" && loops > 1) parts.push("×" + loops);
    return parts.join(" · ");
  }
  function directionOptions(n, first, last) {
    return [["fwd", directionLabel("fwd", n, first, last)], ["back", directionLabel("back", n, first, last)], ["pingpong", directionLabel("pingpong", n, first, last)]];
  }
  function field(label, unit, value, onChange, opts) {
    const o = opts || {};
    const lab = el("label", "field"); lab.appendChild(el("span", "", label));
    const wrap = el("span", "input-unit");
    const input = document.createElement("input"); input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off"; input.value = String(value);
    input.addEventListener("change", () => { onChange(input.value); renderTiming(); });
    wrap.appendChild(input); if (unit) wrap.appendChild(el("em", "", unit)); lab.appendChild(wrap);
    if (o.title) lab.title = o.title;
    return lab;
  }
  function selectField(label, options, current, onChange) {
    const lab = el("label", "field"); lab.appendChild(el("span", "", label));
    lab.appendChild(csSelect(options, current, (v) => { onChange(v); renderTiming(); }));
    return lab;
  }
  // Redesenha o Timing deslizando a altura (troca de modo, passos, campos). still: sem
  // animação (mudança de tamanho da janela)
  let timingMode = null;
  function renderTiming(still) {
    const adv = $("timingAdv"), fields = $("timingFields");
    const was = timingOpen && !adv.classList.contains("hidden") ? adv.offsetHeight : null;
    const modeChanged = timingMode !== null && timingMode !== timing.mode;
    timingMode = timing.mode;
    renderTimingNow();
    if (still === true || was === null || !timingOpen) return;
    slideHeight(adv, was);
    if (modeChanged) [fields, $("timingCustom")].forEach((n) => n.animate && !n.classList.contains("hidden") && n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EASE_MS, easing: "ease" }));
  }
  function renderTimingNow() {
    const plan = timingPlan();
    const custom = timing.mode !== "all";
    $("timingText").textContent = timingSummaryText(plan) + (plan.total ? " · " + plan.total : "");
    $("timingTag").classList.toggle("hidden", !custom);
    // Verde: só avisa que o disparo não é simultâneo; amarelo quando o plano tem um problema
    $("timingTag").classList.toggle("warn", !!plan.warn);
    $("timingTag").title = plan.warn || "The cameras do not all fire at once (" + timingSummaryText(plan) + ")";
    $("timingToggle").textContent = timingOpen ? "Hide" : "Advanced";
    $("timingAdv").classList.toggle("hidden", !timingOpen);
    $("timingMini").classList.toggle("hidden", timingOpen || !custom || !plan.shots.length);
    if (!timingOpen && custom) renderTimeline($("timingMini").querySelector(".tl"), plan, true);
    if (!timingOpen) return;
    const modes = $("timingModes"); modes.innerHTML = "";
    const seg = segmented(TIMING_MODES.map(([m]) => [m, TIMING_SHORT[m]]), timing.mode, (v) => { timing.mode = v; timingSave(); renderTiming(); });
    while (seg.firstChild) modes.appendChild(seg.firstChild);
    const f = $("timingFields"); f.innerHTML = "";
    if (timing.mode === "sweep") {
      // Intervalo: campo livre (a partir de 0,05 s) e atalhos 0,1 / 0,2 / 0,3 / 0,4 s
      const interval = num(timing.interval, 0.05, 600, 0.2);
      f.appendChild(field("Interval", "sec", interval, (v) => { timing.interval = num(v, 0.05, 600, 0.2); timingSave(); }, { title: "Time from one camera to the next. Shortcuts on the right; any value from 0.05 s." }));
      const lab = el("label", "field sweep-field"); lab.appendChild(el("span", "", "Shortcuts"));
      lab.appendChild(segmented(SWEEP_INTERVALS.map((v) => [String(v), String(v)]), String(interval), (v) => { timing.interval = Number(v); timingSave(); renderTiming(); }));
      f.appendChild(lab);
      f.appendChild(selectField("Direction", directionOptions(plan.N), timing.direction, (v) => { timing.direction = v; timingSave(); }));
    }
    if (timing.mode === "groups") {
      const g = Math.max(1, Math.min(Math.max(plan.N, 1), Math.round(num(timing.groups, 1, 99, 2))));
      f.appendChild(field("Groups", "", timing.groups, (v) => { timing.groups = Math.round(num(v, 1, 99, 2)); timingSave(); }));
      f.appendChild(field("Gap", "sec", timing.gap, (v) => { timing.gap = num(v, 0.05, 600, 1); timingSave(); }, { title: "Time between one group and the next." }));
      f.appendChild(selectField("Direction", directionOptions(g), timing.groupsDirection, (v) => { timing.groupsDirection = v; timingSave(); }));
    }
    if (timing.mode === "oddeven") {
      f.appendChild(field("Gap", "sec", timing.oeGap, (v) => { timing.oeGap = num(v, 0.05, 600, 1); timingSave(); }, { title: "Time between the odd cameras and the even ones." }));
      f.appendChild(selectField("Direction", directionOptions(2, "odd", "even"), timing.oeDirection, (v) => { timing.oeDirection = v; timingSave(); }));
    }
    if (timing.mode !== "all") f.appendChild(field("Loops", "", timing.loops, (v) => { timing.loops = Math.round(num(v, 1, 99, 1)); timingSave(); }, { title: "Repeats the whole pattern this many times." }));
    if (timing.mode === "custom") f.appendChild(selectField("Direction", directionOptions(timing.steps.length), timing.stepsDirection, (v) => { timing.stepsDirection = v; timingSave(); }));
    const cust = $("timingCustom"); cust.innerHTML = ""; cust.classList.toggle("hidden", timing.mode !== "custom");
    if (timing.mode === "custom") renderTimingSteps(cust, plan.N);
    $("timingTotal").textContent = plan.total;
    renderTimeline($("timingTimeline"), plan, false);
    $("timingWarn").textContent = plan.warn; $("timingWarn").classList.toggle("hidden", !plan.warn);
  }
  function renderTimingSteps(root, N) {
    const used = new Map(); timing.steps.forEach((st, i) => (st.cams || []).forEach((o) => { if (!used.has(o)) used.set(o, i); }));
    timing.steps.forEach((st, i) => {
      const row = el("div", "timing-step");
      row.appendChild(el("span", "step-n", "Step " + (i + 1)));
      const after = el("span", "step-after");
      if (i === 0) after.appendChild(el("span", "", "at start"));
      else {
        after.appendChild(el("span", "", "after"));
        const wrap = el("span", "input-unit");
        const input = document.createElement("input"); input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off"; input.value = String(st.after);
        input.addEventListener("change", () => { st.after = num(input.value, 0, 600, 1); timingSave(); renderTiming(); });
        wrap.appendChild(input); wrap.appendChild(el("em", "", "s")); after.appendChild(wrap);
      }
      row.appendChild(after);
      const chips = el("span", "step-cams");
      for (let o = 1; o <= Math.max(N, 1); o++) {
        const on = (st.cams || []).includes(o);
        const chip = el("button", "cam-chip" + (on ? " on" : "") + (!on && used.has(o) && used.get(o) !== i ? " used" : ""), String(o));
        chip.type = "button";
        chip.title = on ? "Click to take camera " + o + " out of this step" : used.has(o) ? "Camera " + o + " is in step " + (used.get(o) + 1) + "; click to move it here" : "Click to add camera " + o + " to this step";
        chip.addEventListener("click", () => {
          if (on) st.cams = st.cams.filter((x) => x !== o);
          else { timing.steps.forEach((other) => { other.cams = (other.cams || []).filter((x) => x !== o); }); st.cams = (st.cams || []).concat(o); }
          timingSave(); renderTiming();
        });
        chips.appendChild(chip);
      }
      row.appendChild(chips);
      const remove = button("", () => { timing.steps.splice(i, 1); timingSave(); renderTiming(); }, { icon: "close", title: "Remove this step", kind: "btn-link step-x" });
      remove.disabled = timing.steps.length <= 1;
      row.appendChild(remove);
      // Segurar e arrastar muda a ordem dos passos (como nas câmeras); cada passo leva o seu "after"
      row.classList.toggle("can-drag", timing.steps.length > 1);
      row.addEventListener("pointerdown", (e) => stepPointerDown(e, row, i, root));
      root.appendChild(row);
    });
    root.appendChild(button("Add step", () => { timing.steps.push({ after: 1, cams: [] }); timingSave(); renderTiming(); }, { kind: "btn-link" }));
  }

  // ----- Arrastar passos do Custom para reordenar -----
  let stepDrag = null;
  function stepRows(root) { return [...root.querySelectorAll(".timing-step")]; }
  function stepPointerDown(e, row, index, root) {
    if (e.button !== 0 || timing.steps.length <= 1 || e.target.closest("button, input, select")) return;
    e.preventDefault();  // sem seleção de texto pelo caminho do arraste
    stepDrag = { row, index, root, y: e.clientY, moved: false };
    row.setPointerCapture(e.pointerId);
    row.onpointermove = stepPointerMove;
    row.onpointerup = (ev) => stepEndDrag(stepDrag && stepDrag.moved ? stepInsertion(ev.clientY) : null);
    row.onpointercancel = () => stepEndDrag(null);
  }
  function stepInsertion(y) {
    return stepRows(stepDrag.root).filter((r) => {
      if (r === stepDrag.row) return false;
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < y;
    }).length;
  }
  function stepPointerMove(e) {
    const d = stepDrag;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    d.row.classList.add("dragging");
    d.row.style.transform = "translateY(" + dy + "px)";
    const others = stepRows(d.root).filter((r) => r !== d.row);
    const target = stepInsertion(e.clientY);
    let marker = d.root.querySelector(".camera-drop");
    if (!marker) { marker = document.createElement("div"); marker.className = "camera-drop"; d.root.appendChild(marker); }
    const top = !others.length ? 0 : target < others.length ? others[target].offsetTop - 5
      : others[others.length - 1].offsetTop + others[others.length - 1].offsetHeight + 3;
    marker.style.top = top + "px";
  }
  function stepEndDrag(target) {
    const d = stepDrag;
    stepDrag = null;
    if (!d) return;
    d.row.onpointermove = d.row.onpointerup = d.row.onpointercancel = null;
    d.row.classList.remove("dragging");
    d.row.style.transform = "";
    const marker = d.root.querySelector(".camera-drop");
    if (marker) marker.remove();
    if (target === null || target === d.index) return;
    const [step] = timing.steps.splice(d.index, 1);
    timing.steps.splice(target, 0, step);
    timingSave(); renderTiming();
  }
  $("timingToggle").addEventListener("click", () => {
    timingOpen = !timingOpen;
    document.body.classList.toggle("timing-open", timingOpen);  // o painel Bullet time cresce (deslizando, no CSS)
    if (timingOpen) {
      renderTiming(true);
      slideOpen($("timingAdv"));
    } else {
      // Fecha deslizando; só no fim some (e aparece o resumo pequeno)
      $("timingToggle").textContent = "Advanced";
      slideClosed($("timingAdv"), () => { renderTiming(true); const mini = $("timingMini"); if (!mini.classList.contains("hidden")) slideOpen(mini); });
    }
  });
  window.addEventListener("resize", () => renderTiming(true));

  // Cancelar o bullet time: botão na contagem, Esc na contagem ou o botão de disparo
  // (que vira "Cancel bullet time" enquanto roda). O que já foi disparado não volta.
  function cancelShoot() {
    if (!(busy && busyAction === "shoot") || shootCancelling) return;
    shootCancelling = true;
    $("countdownCancel").disabled = true;
    updateButtons();
    window.cancelShoot();
  }
  $("countdownCancel").addEventListener("click", cancelShoot);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || ui.countdownOverlay.classList.contains("hidden")) return;
    e.stopImmediatePropagation();
    cancelShoot();
  }, true);
  ui.logToggle.addEventListener("click", () => {
    ui.log.classList.toggle("expanded");
    ui.log.classList.toggle("collapsed");
    ui.logList.scrollTop = ui.logList.scrollHeight;
    statsWatch(ui.log.classList.contains("expanded"));
  });
  // Esc com o Activity aberto fecha ele (se nada estiver por cima: janela, menu, aviso ou tela cheia)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !ui.log.classList.contains("expanded")) return;
    if ([...document.querySelectorAll(".overlay:not(.hidden)")].some((o) => o.getClientRects().length > 0)) return;
    if (selectMenu || document.querySelector("body > .project-menu") || isFullscreen()) return;
    e.preventDefault();
    ui.logToggle.click();
    ui.logToggle.focus();
  });
  // Barra de cima: o texto não quebra; quando falta espaço, some primeiro o que importa menos
  // (1 tamanho da lixeira, 2 números do projeto, 3 versão do app, 4 texto do "Update", 5 só o número
  // de câmeras)
  const topbar = document.querySelector(".topbar");
  const FIT_STEPS = 5;  // 5: "30 cameras ready" vira só "30"
  let fitting = false, fitQueued = false;
  function fitTopbar() {
    fitQueued = false;
    if (!topbar || fitting) return;
    fitting = true;
    for (let k = 1; k <= FIT_STEPS; k++) topbar.classList.remove("fit-" + k);
    for (let k = 1; k <= FIT_STEPS && topbar.scrollWidth > topbar.clientWidth + 1; k++) topbar.classList.add("fit-" + k);
    fitting = false;
  }
  function queueFit() { if (!fitQueued) { fitQueued = true; requestAnimationFrame(fitTopbar); } }
  if (topbar) {
    window.addEventListener("resize", queueFit);
    // Textos da barra mudando (projeto, lixeira, câmeras, atualização): confere de novo
    new MutationObserver((list) => { if (list.some((m) => m.target !== topbar)) queueFit(); })
      .observe(topbar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    queueFit();
  }
  ui.restartAppBtn.addEventListener("click", restartApp);
  // Show technical details: as linhas técnicas entram e saem sem a lista "pular". A linha comum que
  // estava no alto da área visível fica no mesmo lugar (se a lista estava no fim, continua no fim);
  // as linhas técnicas que aparecem surgem devagar.
  ui.techToggle.addEventListener("change", () => {
    const list = ui.logList, on = ui.techToggle.checked;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 4;
    const top = list.getBoundingClientRect().top;
    const anchor = [...list.children].find((li) => !li.classList.contains("tech") && li.getBoundingClientRect().bottom > top + 1);
    const before = anchor ? anchor.getBoundingClientRect().top - top : 0;
    list.classList.toggle("show-tech", on);
    ui.log.classList.toggle("show-tech", on);
    if (atEnd) list.scrollTop = list.scrollHeight;
    else if (anchor) list.scrollTop += (anchor.getBoundingClientRect().top - top) - before;
    if (on) {
      const box = list.getBoundingClientRect();
      [...list.querySelectorAll("li.tech")].forEach((li) => {
        const r = li.getBoundingClientRect();
        if (r.bottom >= box.top && r.top <= box.bottom && li.animate) li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      });
    }
  });

  // ----- Uso do computador no rodapé do Activity (2.12.4) -----
  // Mede só com o painel aberto (a cada 2 s); fechado, custo zero. A primeira amostra só dá a
  // base da % de CPU, então os primeiros 2 s mostram "—".
  let statsTimer = null;
  let statsLast = null;  // último evento, para a cópia da Activity
  function statsWatch(on) {
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    if (!on || typeof window.systemStats !== "function") return;
    const ask = () => { try { window.systemStats(); } catch (e) {} };
    ask();
    statsTimer = setInterval(ask, 2000);
  }
  const fmtGB = (b) => (b > 0 ? (b >= 100e9 ? Math.round(b / 1e9) : (b / 1e9).toFixed(1)) + " GB" : "—");
  const fmtMB = (b) => (b > 0 ? Math.round(b / 1e6) + " MB" : "—");
  const fmtPct = (v) => (typeof v === "number" ? v.toFixed(v < 10 ? 1 : 0) + "%" : "—");
  function statsText(e, tech) {
    if (!e || !e.ok) return { app: "Stillpoint —", sys: "Computer —" };
    const app = ["Stillpoint " + fmtPct(e.appCpu) + " CPU", fmtMB(e.appMemory),
      "1 + " + plural(Math.max(0, (e.processes || 1) - 1), "camera process", "camera processes")]
      .concat(tech ? [plural(e.threads || 0, "thread", "threads")] : []).join(" · ");
    const sys = ["Computer " + fmtPct(e.systemCpu) + " CPU", fmtGB(e.memoryAvailable) + " of " + fmtGB(e.memoryTotal) + " free",
      (e.diskLabel || "Disk") + " " + (e.diskFree >= 0 ? fmtGB(e.diskFree) + " free" : "—")].join(" · ");
    return { app, sys };
  }
  function renderStats(e) {
    statsLast = e;
    const t = statsText(e, false);
    const appEl = $("logStatsApp"), sysEl = $("logStatsSys");
    appEl.textContent = t.app;
    if (e && e.ok) { const th = el("span", "tech-only", " · " + plural(e.threads || 0, "thread", "threads")); appEl.appendChild(th); }
    sysEl.textContent = t.sys;
  }

  // Copia a atividade que está na tela (com os detalhes técnicos, se ligados)
  function copyText(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    if (!ok && navigator.clipboard) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(ok);
  }
  ui.copyLogBtn.addEventListener("click", () => {
    const lines = [...ui.logList.children]
      .filter((li) => li.offsetParent !== null)
      .map((li) => li.querySelector(".log-time").textContent + "  " + li.querySelector(".log-text").textContent);
    if (statsLast && statsLast.ok) { const t = statsText(statsLast, ui.techToggle.checked); lines.push("Usage: " + t.app + " | " + t.sys); }
    copyText(lines.join("\n")).then((ok) => toast(ok ? "Activity copied (" + plural(lines.length, "line", "lines") + ")" : "Could not copy the activity"));
  });

  updateButtons();
  renderCameras();
  readyStatus();
  // Ao fim da procura inicial, mostra o guia se nenhuma câmera apareceu
  setTimeout(() => { renderCameras(); readyStatus(); }, SEARCH_GRACE_MS + 100);
  // Lixeira: o número no botão desde a abertura
  if (typeof window.trashList === "function")
    Promise.resolve(window.trashList()).then((r) => { const all = r ? (r.items || []) : [], rids = new Set(all.filter((i) => i.restored).map((i) => i.id)); const top = all.filter((i) => !i.restored && (!i.parent || rids.has(i.parent))); if (r) setTrashInfo({ count: top.length, bytes: top.reduce((t, i) => t + (+i.bytes || 0), 0), days: r.days }); });
  Promise.resolve(window.uiReady()).then((info) => {
    refreshSessions();
    refreshEditing();
    checkLrLive();  // recados do plugin (editadas que chegaram), mesmo sem sessão "In Lightroom"
    if (info && info.unsavedSessions > 0) offerRecovery(info.unsavedSessions);
    if (info && info.testRestart) { testRestart = true; ui.restartAppBtn.classList.remove("hidden"); }
    upd.info = info || null;
    loadPrefs(info);
    if (info && info.project) setProject(info.project);
    if (info && info.projectsFolder) { projectsFolder = info.projectsFolder; renderProjectsFolder(); }
    timingLoad(info && info.timing);
    renderTiming();
    if (info && info.live) {
      try { const l = JSON.parse(info.live); sound = { sound: l.sound !== false, sounds: l.sounds !== false }; } catch (e) {}
    }
    renderSoundBtn();
    if (info && info.fakeCameras) log("Fake cameras: " + info.fakeCameras + " (STILLPOINT_FAKE_CAMERAS). Shots make test photos.", "warn");
    if (info && info.os === "windows") menuEl.btn.classList.remove("hidden");
    if (info && info.version) {
      $("brandVersion").textContent = "v" + info.version;
      $("brandVersion").title = "Stillpoint " + info.version;
    }
    if (info && info.previousVersion && isNewer(info.version, info.previousVersion))
      toast("Updated to Stillpoint " + info.version, 5000);
    checkForUpdate();
  });
})();
