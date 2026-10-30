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
  let shootPlan = null;          // plano enviado no último disparo (para explicar recusas)
  let shootMissing = [];         // fotos recusadas no disparo atual: { camera, index, gap }
  let camSettings = [];          // configurações de cada câmera (evento cameraSettings)
  const csPending = new Set();   // "câmera|chave" enviados e ainda sem resposta ("*" = todas)
  const csTest = { capturing: false, has: false };  // teste rápido do Camera settings
  let csPoll = 0;                // releitura a cada 3 s com a janela aberta
  let csRenderLater = false;     // chegou leitura nova com uma lista aberta: redesenha ao sair dela
  let cameras = [];              // última lista recebida (inclui as que estão conectando)
  let sessions = [];
  let currentSession = null;
  let playTimer = null;
  const photoCache = {};         // "loja/sessão/arquivo/tamanho" -> Promise<dataURL|null>

  // =================== Ícones ===================
  const ICONS = {
    minus: '<path d="M3 7h8"/>',
    plus: '<path d="M3 7h8M7 3v8"/>',
    swap: '<path d="M2.5 5h8l-2.5-2.5M11.5 9h-8l2.5 2.5"/>',
    // Modo teatro, como no YouTube: tela com barra embaixo e dois ângulos dentro
    // (para fora = entrar; para dentro = sair)
    // Modo teatro: só as setas (para fora = entrar; para dentro = sair), no botão igual ao da janela Project
    theaterIn: '<path d="M4.5 4L1.5 7l3 3M9.5 4l3 3-3 3"/>',
    theaterOut: '<path d="M1.5 4l3 3-3 3M12.5 4l-3 3 3 3"/>',
    up: '<path d="M3 9l4-4 4 4"/>',
    down: '<path d="M3 5l4 4 4-4"/>',
    left: '<path d="M9 3L5 7l4 4"/>',
    right: '<path d="M5 3l4 4-4 4"/>',
    play: '<path d="M4 2.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M4 3v8M10 3v8"/>',
    folder: '<path d="M1.5 4.5v7h13v-8.5h-6.5l-1.5-1.5h-5v3z"/>',
    expand: '<path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"/>',
    shrink: '<path d="M5 2v3H2M12 5H9V2M9 12V9h3M2 9h3v3"/>',
    trash: '<path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.6 7.5h5.8l.6-7.5"/>',
    menu: '<path d="M2.5 4h9M2.5 7h9M2.5 10h9"/>',
    close: '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>',
  };
  function icon(name, size) {
    const s = size || 14;
    const box = name === "folder" ? "0 0 16 14" : "0 0 14 14";
    return '<svg width="' + s + '" height="' + s + '" viewBox="' + box + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  // =================== Utilitários ===================
  function setStatus(text, kind) {
    ui.status.textContent = text;
    ui.status.className = "status status-" + (kind || "idle");
  }

  function stillSearching() {
    return Date.now() - startedAt < SEARCH_GRACE_MS;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
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
    if (ready && connecting) setStatus(ready + " ready, " + connecting + " connecting", "ok");
    else if (ready) setStatus(plural(ready, "camera ready", "cameras ready"), "ok");
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
    if (activity.saving) return "Saving sessions";
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

  // ---- Desfazer / refazer (Ctrl+Z, Ctrl+Shift+Z; no Mac também com Cmd) ----
  // Cada ação registrada tem um texto e as duas funções (podem devolver uma Promise; false = não deu).
  const history = { undo: [], redo: [] };
  function recordAction(action) {
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
    Promise.resolve(a.redo()).then((ok) => {
      if (ok === false) return;
      history.undo.push(a);
      toast("Redo: " + a.label, TOAST_MS, { kind: "redo" });
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== "z" && e.key !== "Z" && e.key !== "y")) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;  // dentro de um campo, o desfazer é o do texto
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === "y" || e.shiftKey) doRedo(); else doUndo();
  }, true);

  function dialog(title, text, actions) {
    ui.dialogTitle.textContent = title;
    ui.dialogText.textContent = text;
    ui.dialogActions.innerHTML = "";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.danger ? "btn-danger" : a.primary ? "btn-primary" : a.link ? "btn-link" : "btn-secondary");
      b.textContent = a.label;
      b.addEventListener("click", () => { ui.dialogOverlay.classList.add("hidden"); a.onClick && a.onClick(); });
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
            probe.onload = () => img.style.setProperty("--ar", probe.naturalWidth + " / " + probe.naturalHeight);
            probe.src = url;
          }
        });
      } else {
        // Sem prévia: mostra o tipo do arquivo (ex.: "TIF"), ou nada se a câmera não mandou foto
        img.appendChild(document.createTextNode(item.file ? item.file.split(".").pop().toUpperCase() : ""));
      }

      if (draggable) {
        li.addEventListener("pointerdown", (e) => onPointerDown(e, li, i));
      } else {
        li.addEventListener("click", () => select(i));
      }
      if (opts.onContext) li.addEventListener("contextmenu", (e) => { e.preventDefault(); select(i); opts.onContext(e); });
      return li;
    }

    function markSelected(scroll) {
      [...el.carousel.children].forEach((li, i) => li.classList.toggle("selected", i === index));
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
    function select(i) {
      if (!items.length) return;
      index = (i + items.length) % items.length;
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

    function onPointerDown(e, li, i) {
      if (e.button !== 0) return;
      drag = { li, i, x: e.clientX, y: e.clientY, scroll: el.carousel.scrollLeft, moved: false };
      li.setPointerCapture(e.pointerId);
      li.onpointermove = onPointerMove;
      li.onpointerup = onPointerUp;
      li.onpointercancel = () => endDrag(null);
    }

    function onPointerMove(e) {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6 && Math.abs(e.clientY - drag.y) < 6) return;
      drag.moved = true;
      drag.li.classList.add("dragging");

      // Rola o carrossel quando o arraste chega perto das bordas
      const r = el.carousel.getBoundingClientRect();
      if (e.clientX < r.left + 40) el.carousel.scrollLeft -= 12;
      if (e.clientX > r.right - 40) el.carousel.scrollLeft += 12;

      drag.li.style.transform = "translateX(" + (dx + el.carousel.scrollLeft - drag.scroll) + "px)";
      showMarker(insertionIndex(e.clientX));
    }

    function onPointerUp(e) {
      if (!drag) return;
      endDrag(drag.moved ? insertionIndex(e.clientX) : null);
    }

    function endDrag(target) {
      const d = drag;
      drag = null;
      if (!d) return;
      d.li.onpointermove = d.li.onpointerup = d.li.onpointercancel = null;
      d.li.classList.remove("dragging");
      d.li.style.transform = "";
      el.marker.classList.add("hidden");
      if (target === null) {
        if (!d.moved) select(d.i);
        return;
      }
      move(d.i, target);
    }

    function move(from, to) {
      if (to < 0 || to >= items.length || from === to) { select(from); return; }
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      index = to;
      render();
      showLarge();
      markSelected(true);
      if (opts.onReorder) opts.onReorder(items);
    }

    return {
      setDraggable(value) {
        draggable = !!value;
        root.classList.toggle("draggable", draggable);
        render();
      },
      setHead(title, sub) { el.title.textContent = title || ""; el.sub.textContent = sub || ""; },
      setActions(nodes) { el.actions.innerHTML = ""; nodes.forEach((n) => el.actions.appendChild(n)); },
      // Botões sobre a foto grande (canto superior direito)
      setStageTools(nodes) {
        const tools = root.querySelector(".stage-tools");
        tools.innerHTML = "";
        nodes.forEach((n) => tools.appendChild(n));
      },
      setItems(list, selectIndex) {
        items = list.slice();
        index = Math.min(selectIndex || 0, Math.max(0, items.length - 1));
        el.img.removeAttribute("src");
        render();
        showLarge();
        if (!items.length) message("");
      },
      message,
      select,
      next() { select(index + 1); },
      prev() { select(index - 1); },
      moveSelected(delta) { move(index, index + delta); },
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

  function renderCameras() {
    if (typeof renderTiming === "function") setTimeout(renderTiming, 0);
    // Onde cada linha estava: depois de redesenhar, as que mudaram de lugar deslizam até o novo
    const was = {};
    ui.cameraList.querySelectorAll("li[data-name]").forEach((li) => { if (li.dataset.name) was[li.dataset.name] = li.getBoundingClientRect().top; });
    ui.cameraList.innerHTML = "";
    const placed = placedCameras();
    const empty = cameras.length === 0;
    ui.searching.classList.toggle("hidden", !empty || !stillSearching());
    ui.noCameras.classList.toggle("hidden", !empty || stillSearching());

    placed.forEach((cam, index) => ui.cameraList.appendChild(cameraRow(cam, index, placed.length)));
    cameras.filter((c) => c.order === 0).forEach((cam) => ui.cameraList.appendChild(cameraRow(cam, -1, placed.length)));
    $("cameraCount").textContent = cameras.length;
    $("cameraCount").classList.toggle("hidden", cameras.length === 0);
    ui.cameraList.querySelectorAll("li[data-name]").forEach((li) => {
      const top = was[li.dataset.name];
      if (top === undefined || !li.animate) return;
      const d = top - li.getBoundingClientRect().top;
      if (Math.abs(d) > 1) li.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    });
    updateButtons();
  }

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
    b.disabled = busy || !!locked;
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
    ui.saveBtn.textContent = sessions.length ? "Save sessions (" + sessions.length + ")" : "Save sessions";
    ui.sessionCount.textContent = sessions.length;
    ui.sessionCount.classList.toggle("hidden", sessions.length === 0);
    // A janela de atualização aberta acompanha o estado (ex.: libera "Update now")
    if (upd && upd.release && !updEl.overlay.classList.contains("hidden")) renderUpdate();
  }

  // =================== Sessões ===================
  const sessionGallery = Gallery(ui.sessionGallery, {
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
      popupMenuAt(e.clientX, e.clientY, [
        { label: win ? "Show in Explorer" : "Show in Finder", disabled: !hasFile, dim: !hasFile, onClick: () => fileAction("reveal") },
        { label: "Open in default app", disabled: !hasFile, dim: !hasFile, onClick: () => fileAction("open") },
        "-",
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
    button("", deleteCurrentSession, { icon: "trash", title: "Delete this session" }),
    fullBtn,
  ];
  const exitFullBtn = button("", () => setFullscreen(false), { icon: "shrink", title: "Exit full screen (Esc)" });
  // Na tela cheia a lixeira apaga a sessão (como fora dela); uma foto: botão direito ou a tecla Delete
  const fullTrashBtn = button("", deleteCurrentSession, { icon: "trash", title: "Delete this session (a photo: right-click it, or the Delete key)" });
  // "Reverse loop" (ligado por padrão): o play vai e volta (1, 2, 3, 2, 1...);
  // desligado, recomeça do início (1, 2, 3, 1, 2, 3...)
  const reverseLoopOption = document.createElement("label");
  reverseLoopOption.className = "log-option play-option";
  reverseLoopOption.title = "Play back and forth (1, 2, 3, 2, 1...)";
  reverseLoopOption.innerHTML = '<input type="checkbox" checked> Reverse loop';
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

  const viewActions = [
    button("", () => { stopPlay(); sessionGallery.prev(); }, { icon: "left", title: "Previous photo" }),
    playBtn,
    button("", () => { stopPlay(); sessionGallery.next(); }, { icon: "right", title: "Next photo" }),
    speedGroup,
    reverseLoopOption,
    button("Reorder", startReorder, { title: "Change the order of the photos in this session" }),
    fullTrashBtn,
    exitFullBtn,
  ];
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

    const newest = sessions[0] || null;
    const current = currentSession && sessions.find((x) => x.name === currentSession.name);
    const arrivedNewer = newest && !known.includes(newest.name);
    // Projeto acabou de ser aberto: mostra a primeira sessão dele e recolhe "Not in project"
    const firstOfProject = pendingProjectFocus && sessions.find((x) => x.inProject);
    if (firstOfProject) { pendingProjectFocus = false; notInProjectOpen = false; showSession(firstOfProject); return; }

    if (!newest) showSession(null);
    else if (!current || arrivedNewer) showSession(newest);
    else if (filesOf(current) !== filesOf(currentSession)) showSession(current, true);
    else { currentSession = current; renderSessionList(); }
  }

  // Etiqueta de sessão já salva (lista de sessões e janela Save sessions)
  function savedTag() {
    const t = document.createElement("span");
    t.className = "saved-tag";
    t.textContent = "✓ Saved";
    t.title = "Already saved. It leaves the app when you close Stillpoint (the saved copy stays where you saved it).";
    return t;
  }
  // Etiqueta de sessão guardada no Project: "In project" ou "Edited n/m" (verde quando completa)
  function projectTag(s) {
    const t = document.createElement("span");
    const total = s.photos.length;
    const complete = s.edited > 0 && s.edited >= total;
    t.className = "project-tag" + (complete ? " ok" : s.edited > 0 ? " part" : "");
    t.textContent = s.edited > 0 ? "Edited " + s.edited + " / " + total : "In project";
    t.title = complete ? "Every photo has an edited version in the project's Edited folder."
      : s.edited > 0 ? "Some photos have an edited version in the project's Edited folder; the others do not."
      : "Kept in the project folder (originals). It stays in the app until you remove it.";
    return t;
  }
  // Etiqueta de sessão com fotos que a câmera recusou no disparo (arquivo ".missing")
  function missingTag(count) {
    const t = document.createElement("span");
    t.className = "missing-tag";
    t.textContent = count + " missing";
    t.title = plural(count, "photo was", "photos were") + " refused by the camera during the shoot (a camera asked to shoot again too soon after its previous photo).";
    return t;
  }

  function renderSessionList() {
    if (sessDrag) sessEndDrag(null);  // a linha arrastada vai sumir: termina o arraste
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
      d.title = (n ? (notInProjectOpen ? "Hide" : "Show") + " the sessions still only in the app. " : "No session outside the project. ") + "Drop a session here to take it out of the project.";
      d.addEventListener("click", () => { if (n) { notInProjectOpen = !notInProjectOpen; renderSessionList(); } });
      ui.sessionList.appendChild(d);
    };
    if (projectOpen && !sessions.some((x) => x.inProject)) {
      // Projeto sem sessões: um espaço de verdade para soltar (senão a área do projeto some)
      const ph = el("li", "folder-placeholder");
      ph.innerHTML = '<span>' + icon("folder", 16) + '</span><span>' + (project.available === false
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
      if (projectOpen && !s.inProject && !notInProjectOpen) li.classList.add("hidden");
      li.innerHTML = icon("folder", 16) + '<div><div class="folder-date"></div><div class="folder-meta"></div></div>';
      li.querySelector(".folder-date").textContent = s.label ? s.label + " · " + label.date : label.date;
      li.querySelector(".folder-meta").textContent = [plural(count, "photo", "photos"), label.detail].filter(Boolean).join(" · ");
      if (s.missing > 0) li.querySelector(".folder-meta").after(missingTag(s.missing));
      if (projectOpen) {
        // Só a etiqueta de editadas (estar no projeto é a posição na lista)
        if (s.inProject && s.edited > 0) li.querySelector(".folder-meta").after(projectTag(s));
        if (!s.inProject) {
          const add = el("button", "btn btn-link btn-small folder-add", "Add to project ↑");
          add.addEventListener("click", (e) => { e.stopPropagation(); moveToProject(s.name, true); });
          li.querySelector("div").appendChild(add);
        }
        // Segurar e arrastar: para o botão do projeto (barra de cima) = entra; para "Not in project" = sai
        li.addEventListener("pointerdown", (e) => sessPointerDown(e, li, s));
      }
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const x = e.clientX, y = e.clientY;
        // Relê a lista antes (fotos editadas podem ter chegado por fora) e abre com os dados novos
        Promise.resolve(window.listSessions()).then((list) => {
          if (Array.isArray(list)) setSessions(list);
          sessionContextMenu({ clientX: x, clientY: y }, sessions.find((z) => z.name === s.name) || s);
        }, () => sessionContextMenu({ clientX: x, clientY: y }, s));
      });
      if (s.saved) {
        li.querySelector(".folder-meta").after(savedTag());
        li.title = "Already saved. It leaves the app when you close Stillpoint (the saved copy stays where you saved it).";
      }
      li.addEventListener("click", () => showSession(s));
      ui.sessionList.appendChild(li);
    });
    if (projectOpen) addDivider();  // também sem sessões fora: é o alvo para tirar do projeto arrastando
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
    sessionGallery.setHead(label.date + (label.time ? label.time.slice(5) : ""),
      editing.on ? "Drag the photos, or select one and use the arrows. Then save the order."
                 : label.detail);
  }

  function showSession(session, keepIndex) {
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
    if (save && changed) {
      // As prévias guardadas usam os nomes antigos dos arquivos
      const before = sessionItems(session).filter((i) => i.movable).map((i) => i.group);
      const clearCache = () => Object.keys(photoCache).filter((k) => k.startsWith("sessions/" + session.name + "/")).forEach((k) => delete photoCache[k]);
      clearCache();
      window.reorderSession(session.name, ...groups);
      log("Photo order changed in the session from " + sessionLabel(session.name).date, "ok");
      // Desfazer: a ordem anterior, pelos nomes de grupo que os arquivos têm depois de renumerados
      // (o grupo é "NN_câmera"; depois do rename o número muda, então refaz pelo nome da câmera)
      const camOf = (g) => g.replace(/^\d+_/, "");
      const currentGroupsFor = (camOrder) => { const now = sessionItems(sessions.find((x) => x.name === session.name) || session).filter((i) => i.movable); return camOrder.map((c) => (now.find((i) => camOf(i.group) === c) || {}).group).filter(Boolean); };
      recordAction({ label: "Photo order in " + sessionLabel(session.name).date,
        undo: () => { clearCache(); window.reorderSession(session.name, ...currentGroupsFor(before.map(camOf))); },
        redo: () => { clearCache(); window.reorderSession(session.name, ...currentGroupsFor(groups.map(camOf))); } });
    } else {
      showSession(session, true);
    }
  }

  // ----- Tela cheia -----
  const sessionsPanel = document.querySelector(".sessions-panel");
  function setFullscreen(on) {
    if (on && !currentSession) return;
    if (!on) {
      stopPlay();
      if (editing.on) stopReorder(false);
    }
    sessionsPanel.classList.toggle("fullscreen", on);
    sessionGallery.setActions(currentActions());
  }
  function isFullscreen() {
    return sessionsPanel.classList.contains("fullscreen");
  }
  function toggleFullscreen() {
    setFullscreen(!isFullscreen());
  }

  // ----- Apagar uma foto -----
  function deleteCurrentPhoto() {
    if (!currentSession || editing.on) return;
    const item = sessionGallery.items[sessionGallery.index];
    if (!item) return;
    stopPlay();
    const session = currentSession.name;
    const what = item.title + (item.subtitle ? " (" + item.subtitle + ")" : "");
    dialog("Delete photo " + pad(item.order || sessionGallery.index + 1) + "?",
      what + ". " + (item.files.length > 1 ? "Its RAW and JPEG files are" : "The file is") + " deleted permanently.", [
        { label: "Cancel" },
        { label: "Delete", danger: true, onClick: () => {
          // A miniatura encolhe e some, a foto grande se apaga; só então o arquivo vai embora
          const thumb = ui.sessionGallery.querySelector(".carousel .frame.selected");
          const big = ui.sessionGallery.querySelector(".stage img");
          if (thumb && thumb.animate) thumb.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.4) translateY(30%)" }], { duration: 260, easing: "ease-in", fill: "forwards" });
          if (big && big.animate && big.getAttribute("src")) big.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.85)" }], { duration: 260, easing: "ease-in", fill: "forwards" });
          // A foto grande volta a aparecer quando a próxima carregar (ou, se nada mudar, em 1,5 s)
          const reveal = () => { if (big) big.getAnimations().forEach((a) => a.cancel()); if (thumb && thumb.isConnected) thumb.getAnimations().forEach((a) => a.cancel()); };
          setTimeout(() => {
            window.deletePhotos(session, item.group);
            if (big) big.addEventListener("load", reveal, { once: true });
            setTimeout(reveal, 1500);
          }, 270);
          toast("Photo " + pad(item.order || 0) + " deleted from the session of " + sessionLabel(session).date);
          recordAction({ label: "Delete photo " + pad(item.order || 0) + " from " + sessionLabel(session).date,
            undo: () => restoreSession(session), redo: () => window.deletePhotos(session, item.group) });
        } },
      ]);
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
  function flyToTrash(name, done) {
    const full = isFullscreen() && currentSession && currentSession.name === name;
    // Tela cheia: a área da foto (miniaturas + foto grande) vai até o ícone da lixeira da tela cheia
    const li = full ? ui.sessionGallery.querySelector(".stage")
      : [...ui.sessionList.querySelectorAll("li.folder")].find((x) => x.dataset.name === name);
    const trash = full ? fullTrashBtn : compactActions[0];
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
  function deleteSessionAsk(s) {
    const label = sessionLabel(s.name);
    dialog("Delete this session?", "The photos from " + label.date + " will be deleted permanently" +
      (s.inProject ? " (from the project folder too)." : "."), [
      { label: "Cancel" },
      { label: "Delete", danger: true, onClick: () => {
        toast("Session deleted: " + label.date + (s.inProject ? " (from the project folder)" : ""));
        flyToTrash(s.name, () => window.deleteSession(s.name));
        recordAction({ label: "Delete session " + label.date, undo: () => restoreSession(s.name), redo: () => window.deleteSession(s.name) });
      } },
    ]);
  }

  let playDirection = 1;
  function playStep() {
    const count = sessionGallery.items.length;
    if (count < 2 || !reverseLoop.checked) return sessionGallery.next();
    let i = sessionGallery.index + playDirection;
    if (i >= count) { playDirection = -1; i = count - 2; }
    else if (i < 0) { playDirection = 1; i = 1; }
    sessionGallery.select(i);
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
    load: (item, size) => orderPhoto(item.session, item.file, size),
  });
  // Teste rápido do Camera settings (fotos temporárias, as mesmas do "Reorder by photo")
  const csGallery = Gallery($("csGallery"), {
    draggable: false,
    fitThumbs: true,
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
    if (e.key === "ArrowLeft") { e.preventDefault(); stopPlay(); target.prev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); stopPlay(); target.next(); }
    if (e.key === " " && !order.open && (isFullscreen() || playTimer)) { e.preventDefault(); togglePlay(); }
    if (order.open) return;
    // Sessão: Esc sai da reordenação ou da tela cheia; F tela cheia; Delete apaga a foto
    if (e.key === "Escape") {
      if (editing.on) stopReorder(false);
      else if (isFullscreen()) setFullscreen(false);
    }
    if ((e.key === "f" || e.key === "F") && !editing.on) toggleFullscreen();
    if ((e.key === "Delete" || e.key === "Backspace") && !editing.on && isFullscreen()) { e.preventDefault(); deleteCurrentPhoto(); }
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
  const exp = { mode: "photos", exitAfter: false, selected: new Set(), active: "", settings: {}, heic: { ok: true, reason: "" },
                timer: null, frame: 0, photo: 0, sameForAll: true, project: false };

  // Configuração da sessão aberta igual nas outras (saídas ligadas, as três configurações e o nome)
  function sameAsActive(name) {
    const a = settingsFor(exp.active), o = settingsFor(name);
    return OUTPUT_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(o[k]));
  }
  // "Same settings for all sessions" ligado: o que muda na sessão aberta vale para todas
  function syncAll() {
    if (!exp.sameForAll || !exp.active) return;
    const st = settingsFor(exp.active);
    sessions.forEach((o) => {
      if (o.name === exp.active) return;
      const t = settingsFor(o.name);
      OUTPUT_KEYS.forEach((k) => { t[k] = JSON.parse(JSON.stringify(st[k])); });
    });
  }

  // Últimas configurações usadas (gravadas pelo programa em settings.txt): valem como padrão
  // da próxima vez, nesta e nas próximas aberturas do app
  let exportPrefs = null;
  function defaultSettings() {
    const base = { naming: { kind: "date", text: "", date: true, position: "after" },
                   outputs: { photos: true, sequence: false, lenticular: false },
                   // original: copiar como a câmera salvou; convert + format: uma cópia convertida (os dois podem)
                   photos: { original: true, convert: false, format: "jpg", quality: "high" },
                   seq: { formats: ["mp4"], fps: 6, loops: 3, reverse: true, height: 1080, alsoPhotos: true, quality: "high" },
                   // lpi: lâmina; pitch: medido na folha de teste (0 = usar o nominal); dpi: impressora;
                   // tamanho em cm (unit "cm"|"in" só muda a exibição); effect "flip" (animação) | "3d"
                   lent: { lpi: 60, pitch: 0, dpi: 720, widthCm: 15, heightCm: 10, unit: "cm", effect: "flip", reverse: false } };
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
    exportPrefs = { mode: exp.mode, sameForAll: exp.sameForAll, collapsed: exp.collapsed || {}, settings: JSON.parse(JSON.stringify(settingsFor(exp.active))) };
    clearTimeout(exportPrefsTimer);
    exportPrefsTimer = setTimeout(() => window.savePref("export", JSON.stringify(exportPrefs)), 300);
  }
  function loadPrefs(info) {
    const prefs = (info && info.prefs) || {};
    try { exportPrefs = prefs.export ? JSON.parse(prefs.export) : null; } catch (e) { exportPrefs = null; }
    if (exportPrefs && typeof exportPrefs.sameForAll === "boolean") exp.sameForAll = exportPrefs.sameForAll;
  }
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
    return parts.length ? "→ " + parts.join(" + ") : "Nothing to save";
  }
  // "Originals + JPG", "Originals", "JPG" ("" = nada escolhido)
  function photosText(p) {
    return [p.original ? "Originals" : "", p.convert ? PHOTO_FORMATS.find((f) => f[0] === p.format)[1] : ""].filter(Boolean).join(" + ");
  }
  // Cabeçalho de cada seção: o resumo daquela saída
  function outputText(session, kind) {
    const st = settingsFor(session.name);
    if (kind === "photos") {
      const p = st.photos;
      if (!p.original && !p.convert) return "Choose originals or a format";
      return photosText(p) + (p.convert && LOSSY_PHOTOS.includes(p.format) ? " · " + qualityLabel(p.quality) : "");
    }
    if (kind === "lenticular") {
      const l = st.lent, plan = lentPlan(l, sessionItems(session).filter((i) => i.previewable).length);
      return lentPitch(l) + " LPI · " + l.dpi + " dpi · " + lentSizeText(l) + " · " + (l.effect === "3d" ? "3D" : "Animation") + (plan.warn ? " · ⚠" : "");
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
    if (exportPrefs && OUTPUT_KINDS.includes(exportPrefs.mode)) exp.mode = exportPrefs.mode;
    if (exportPrefs && exportPrefs.collapsed) exp.collapsed = Object.assign({}, exportPrefs.collapsed);
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
    if (exp.project && project.exportDefaults) {
      $("exportEdited").checked = project.exportDefaults.useEdited !== false;
    }
    exp.photo = 0;
    exp.dest = null;  // outra pasta escolhida vale só para uma vez
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

  function closeExport() {
    stopPreview();
    $("exportOverlay").classList.add("hidden");
    exp.project = false;
  }

  function renderExport() {
    $("exportTitle").textContent = exp.project ? "Export sessions" : "Save sessions";
    $("exportSub").textContent = "Tick what each session should become: photos, a sequence, a lenticular print, or several. Each session is saved in one folder.";
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
  function renderExportList() {
    const list = $("exportList");
    list.innerHTML = "";
    exportable().forEach((s) => {
      const label = sessionLabel(s.name);
      const li = document.createElement("li");
      li.className = "export-item" + (s.name === exp.active ? " active" : "") + (exp.selected.has(s.name) ? "" : " off");
      li.innerHTML = '<label class="export-check"><input type="checkbox"><span class="save-check" aria-hidden="true"></span></label>' +
        '<span class="export-thumb"></span><span><span class="folder-date"></span><span class="folder-meta"></span>' +
        '<span class="export-summary"></span><span class="export-diff">Different</span></span>';
      const box = li.querySelector("input");
      box.checked = exp.selected.has(s.name);
      box.addEventListener("change", () => {
        exp.selectedTouched = true; if (box.checked) exp.selected.add(s.name); else exp.selected.delete(s.name);
        li.classList.toggle("off", !box.checked);
        updateExportCount();
      });
      li.querySelector(".export-check").addEventListener("click", (e) => e.stopPropagation());
      li.querySelector(".folder-date").textContent = label.date;
      li.querySelector(".folder-meta").textContent = [plural(sessionItems(s).length, "photo", "photos"), label.detail].filter(Boolean).join(" · ");
      if (s.missing > 0) li.querySelector(".folder-meta").after(missingTag(s.missing));
      if (s.inProject && s.edited > 0) li.querySelector(".folder-meta").after(projectTag(s));  // "Edited n / m" também aqui
      if (s.saved) li.querySelector(".folder-meta").after(savedTag());
      li.querySelector(".export-summary").textContent = summaryText(s);
      li.classList.toggle("different", !exp.sameForAll && s.name !== exp.active && !sameAsActive(s.name));
      const first = sessionItems(s).find((i) => i.previewable);
      if (first) sessionPhoto(s.name, first.file, 320).then((url) => { if (url) li.querySelector(".export-thumb").style.backgroundImage = "url(" + url + ")"; });
      li.addEventListener("click", () => {
        exp.active = s.name;
        exp.photo = 0;
        renderExportList();
        renderExportSettings();
      });
      list.appendChild(li);
    });
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
    const partial = exp.project && $("exportEdited").checked
      ? all.filter((s) => exp.selected.has(s.name) && s.edited > 0 && s.edited < s.photos.length) : [];
    $("exportCount").textContent = noOutput ? "Tick at least one output for each selected session" : photosEmpty ? "Photos: choose the originals, a format, or both" : lentBad ? "Check the lens, printer and size values" : seqEmpty ? "Choose at least one sequence format for each selected session"
      : partial.length ? (partial.length === 1 ? sessionTitle(partial[0]) + " has" : partial.length + " sessions have") + " only some photos edited: edited and original frames would be mixed."
      : chosen + " of " + plural(all.length, "session", "sessions") + " selected";
    // Aviso que impede salvar (ou que pede atenção): em amarelo
    $("exportCount").classList.toggle("warn", partial.length > 0 || noOutput || photosEmpty || lentBad || seqEmpty);
    $("exportConfirm").disabled = chosen === 0 || noOutput || seqEmpty || lentBad || photosEmpty;
    $("exportConfirm").textContent = chosen ? (exp.project ? "Export " : "Save ") + plural(chosen, "session", "sessions") : (exp.project ? "Export" : "Save");
    $("exportSelectAll").disabled = chosen === all.length;
    $("exportUnselectAll").disabled = chosen === 0;
    $("exportEditedLabel").classList.toggle("hidden", !exp.project);
  }
  function sessionTitle(s) { const l = sessionLabel(s.name); return s.label ? s.label + " · " + l.date : l.date; }

  function refreshSummaries() {
    [...$("exportList").children].forEach((li, i) => {
      if (!sessions[i]) return;
      li.querySelector(".export-summary").textContent = summaryText(sessions[i]);
      li.classList.toggle("different", !exp.sameForAll && sessions[i].name !== exp.active && !sameAsActive(sessions[i].name));
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
    return { cols, w, h, per, lenses, warn };
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
    renderExportSettings.restoreScroll = () => { if (keepScroll) rows.scrollTop = keepScroll; };
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

    // Mesma configuração para todas (padrão) ou uma por sessão
    if (sessions.length > 1) {
      const scope = checkOption("Same settings for all sessions", exp.sameForAll, (v) => { exp.sameForAll = v; rerender(); });
      scope.classList.add("export-scope");
      outer.insertBefore(scope, rows);
    }
    // Foco da prévia: a seção clicada por último, se marcada; senão a primeira marcada
    if (!st.outputs[exp.mode]) exp.mode = OUTPUTS.map(([k]) => k).find((k) => st.outputs[k]) || "photos";
    if (exp.mode !== "lenticular") { exp.lentTheater = false; outer.classList.remove("theater"); }

    // Monta a prévia (só a da seção em foco entra na tela) e as configurações de uma saída
    const buildKind = (kind, box, focused) => {
      const preview = el("div", "export-preview");
      const img = document.createElement("img");
      img.alt = "";
      const caption = el("div", "stage-caption");
      preview.append(img, caption);
      if (focused) outer.insertBefore(preview, rows);
      const show = (i, text, file) => {
        const item = items[i];
        if (!item) return;
        sessionPhoto(session.name, item.file, 1600).then((url) => { if (url && exp.active === session.name) img.src = url; });
        caption.innerHTML = "";
        caption.append(el("b", "", text[0]), document.createTextNode(text[1]));
        if (file) caption.appendChild(el("span", "caption-file", file));
      };
      if (kind === "photos") {
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
        sessionPhoto(session.name, item.file, 320).then((url) => { if (url) pic.src = url; });
        li.addEventListener("click", () => { exp.photo = k; showPhoto(); });
        strip.appendChild(li);
      });
      if (focused) {
        const slot = el("div", "export-strip-slot");
        slot.appendChild(stripScroll);
        outer.insertBefore(slot, rows);
        showPhoto();
      }
      // Originais e/ou uma cópia convertida, independentes; com os dois, Photos/Originals/ e Photos/<FORMATO>/
      const ro = row("Originals");
      ro.appendChild(checkOption("Keep the originals, exactly as each camera saved them (JPG and RAW)", s.original, (v) => { s.original = v; rerender(); }));
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
        box.appendChild(el("div", "export-note", "Both are saved, each in its own folder: " + pre + "Originals/ and " + pre + s.format.toUpperCase() + "/."));
      }
      if (!s.original && !s.convert) box.appendChild(el("div", "export-note exp-none", "Choose the originals, a format, or both."));
      if (s.convert && LOSSY_PHOTOS.includes(s.format)) {
        const q = row("Quality");
        q.appendChild(segmented(QUALITIES, s.quality, (v) => { s.quality = v; rerender(); }));
        box.appendChild(q);
        const max = { jpg: "JPG at the highest quality, with full color detail.", webp: "Lossless: every pixel is kept.",
                      heic: "HEIC at the highest quality." };
        box.appendChild(el("div", "export-note", s.quality === "standard" ? "Smaller files, good for sharing online."
          : s.quality === "high" ? "Very close to the original photos, with smaller files. Good for most uses."
          : max[s.format] + " Largest files."));
      } else if (s.convert && (s.format === "png" || s.format === "tiff")) {
        box.appendChild(el("div", "export-note", s.format.toUpperCase() + " keeps every pixel: no quality is lost in the conversion."));
      }
      box.appendChild(el("div", "export-note",
        "The originals are the highest quality. A converted copy makes one file per camera; RAW photos are converted from the " +
        "full-size image the camera keeps inside them, and when a camera saved RAW + JPG, the JPG is used."));
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
      const order = l.reverse ? items.map((_, i) => n - 1 - i) : items.map((_, i) => i);
      let frameAt = Math.min(exp.frame >= 0 ? exp.frame : 0, Math.max(0, n - 1));
      const showFrame = (k) => {
        frameAt = Math.max(0, Math.min(n - 1, k));
        exp.frame = frameAt;
        const i = order[frameAt];
        show(i, ["Tilt preview", " " + label + " · photo " + (i + 1) + " of " + n + (vertical ? " · drag up and down" : " · drag left and right")]);
      };
      if (focused) showFrame(frameAt);
      items.forEach((item) => sessionPhoto(session.name, item.file, 1600));
      let drag = null;
      preview.addEventListener("pointerdown", (e) => {
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
      [["tilt", "Tilt"], ["interlaced", "Interlaced"]].forEach(([v, t]) => {
        const b = el("button", "", t); b.dataset.view = v; b.title = v === "tilt" ? "Drag to see the photos change, as when tilting the print" : "The whole interlaced file, as it prints; move the mouse over it for a close-up";
        b.addEventListener("click", (e) => { e.stopPropagation(); setView(v); });
        views.appendChild(b);
      });
      views.addEventListener("pointerdown", (e) => e.stopPropagation());
      preview.appendChild(views);
      // Modo teatro: a prévia ocupa a coluna toda e as configurações somem; o botão de novo volta
      const theater = button("", () => {
        const from = preview.offsetHeight;
        exp.lentTheater = !exp.lentTheater;
        applyTheater();
        slideHeight(preview, from);
        if (!exp.lentTheater) [outer.querySelector(".export-rows"), outer.querySelector(".export-scope")].forEach((n) => n && n.animate && n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: EASE_MS, easing: "ease" }));
        if (exp.lentView === "interlaced") setTimeout(() => requestAnimationFrame(fitCanvas), EASE_MS + 20);
      }, { icon: "theaterIn", title: "Theater mode: larger preview, settings hidden", kind: "btn-secondary" });
      theater.classList.add("lent-theater-btn");
      theater.addEventListener("pointerdown", (e) => e.stopPropagation());
      preview.appendChild(theater);
      const applyTheater = () => {
        outer.classList.toggle("theater", !!exp.lentTheater);
        theater.classList.toggle("on", !!exp.lentTheater);
        theater.innerHTML = icon(exp.lentTheater ? "theaterOut" : "theaterIn");  // ângulos para fora = entrar; para dentro = sair
        theater.title = exp.lentTheater ? "Leave theater mode" : "Theater mode: larger preview, settings hidden";
        if (exp.lentView === "interlaced") requestAnimationFrame(fitCanvas);
      };
      const fitCanvas = () => {
        if (!full) return;
        // Cabe na prévia mantendo a proporção do papel; o navegador reduz (as faixas se misturam, como a olho nu)
        const pw = Math.max(50, preview.clientWidth - 2), ph = Math.max(50, preview.clientHeight - 2);
        const scale = Math.min(pw / plan.w, ph / plan.h);
        canvas.width = Math.max(1, Math.round(plan.w * scale)); canvas.height = Math.max(1, Math.round(plan.h * scale));
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
      };
      const drawInterlaced = () => {
        const horizontal = l.effect !== "3d";
        // Imagem inteira em pixels reais; acima de ~24 Mpx monta reduzida (a lupa avisa)
        const limit = 24e6;
        const f = plan.w * plan.h > limit ? Math.sqrt(limit / (plan.w * plan.h)) : 1;
        const W = Math.max(1, Math.round(plan.w * f)), H = Math.max(1, Math.round(plan.h * f));
        const perLens = plan.cols * f;
        const ownerOf = (i) => { const pos = (i + 0.5) / perLens, frac = pos - Math.floor(pos); let k = Math.min(n - 1, Math.floor(frac * n)); return l.reverse ? n - 1 - k : k; };
        const token = (drawInterlaced.token = (drawInterlaced.token || 0) + 1);
        full = document.createElement("canvas"); full.width = W; full.height = H;
        const fctx = full.getContext("2d");
        fctx.fillStyle = "#000"; fctx.fillRect(0, 0, W, H);
        loupeTag.textContent = f < 1 ? "2× · built at " + Math.round(f * 100) + "%" : "2× · real pixels";
        loupeTag.title = f < 1 ? "The preview of the file was built at " + Math.round(f * 100) + "% of the real size" : "";
        caption.innerHTML = "";
        caption.append(el("b", "", "Interlaced"), document.createTextNode(" the whole file as it prints · " + plan.w + " × " + plan.h + " px · " + lentSizeText(l) + " · " +
          (plan.cols ? plan.cols.toFixed(2).replace(/\.?0+$/, "") : "—") + " px per lens · strips " + (horizontal ? "horizontal" : "vertical") + " · move the mouse for a close-up"));
        fitCanvas();
        // Faixas de cada foto: desenha a foto (cobrindo o papel) só nas linhas/colunas dela
        const lines = horizontal ? H : W;
        const runs = [];  // [início, comprimento, foto]
        for (let i = 0; i < lines;) { const k = ownerOf(i); let j = i + 1; while (j < lines && ownerOf(j) === k) j++; runs.push([i, j - i, k]); i = j; }
        let loaded = 0;
        items.forEach((item, k) => {
          sessionPhoto(session.name, item.file, 1600).then((url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url || ""; })).then((im) => {
            if (token !== drawInterlaced.token) return;
            if (im) {
              const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
              const fw = im.naturalWidth * s, fh = im.naturalHeight * s;
              const ox = (fw - W) / 2, oy = (fh - H) / 2;
              fctx.imageSmoothingEnabled = true;
              runs.forEach(([start, len, owner]) => {
                if (owner !== k) return;
                if (horizontal) fctx.drawImage(im, ox / s, (oy + start) / s, W / s, len / s, 0, start, W, len);
                else fctx.drawImage(im, (ox + start) / s, oy / s, len / s, H / s, start, 0, len, H);
              });
            }
            if (++loaded === n) fitCanvas();
          });
        });
      };
      // Lupa: segue o mouse; mostra o ponto em pixels reais ampliados 2×
      preview.addEventListener("pointermove", (e) => {
        if (exp.lentView !== "interlaced" || !full) return;
        // Área desenhada de fato (no teatro o canvas ocupa a caixa toda com object-fit: contain)
        const box = canvas.getBoundingClientRect();
        const sc = Math.min(box.width / canvas.width, box.height / canvas.height);
        const r = { left: box.left + (box.width - canvas.width * sc) / 2, top: box.top + (box.height - canvas.height * sc) / 2, width: canvas.width * sc, height: canvas.height * sc };
        const inside = e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
        loupe.classList.toggle("hidden", !inside); loupeTag.classList.toggle("hidden", !inside);
        if (!inside) return;
        const fx = (e.clientX - r.left) / r.width * full.width, fy = (e.clientY - r.top) / r.height * full.height;
        // Tamanho conforme a prévia (fora do teatro ela tem 200 px de altura): sempre cabe
        const pr = preview.getBoundingClientRect();
        const size = Math.round(Math.max(80, Math.min(180, pr.height - 40, pr.width / 3)));
        if (loupe.width !== size) { loupe.width = size; loupe.height = size; }
        const half = loupe.width / 4;  // 2×: cada pixel real vira 2 na tela
        const lctx = loupe.getContext("2d");
        lctx.imageSmoothingEnabled = false;
        lctx.fillStyle = "#000"; lctx.fillRect(0, 0, loupe.width, loupe.height);
        lctx.drawImage(full, fx - half, fy - half, half * 2, half * 2, 0, 0, loupe.width, loupe.height);
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
        setView(exp.lentView === "interlaced" ? "interlaced" : "tilt");
      }

      // Leitura: o que a combinação lâmina + impressora dá para esta sessão
      const read = el("div", "lent-readout" + (plan.warn ? " " + plan.warn : ""));
      const cols = el("div", "lent-cols");
      cols.append(el("b", "", plan.cols ? plan.cols.toFixed(2).replace(/\.?0+$/, "") : "—"), el("span", "", " columns per lens"),
                  el("span", "lent-dim", " (" + l.dpi + " dpi ÷ " + lentPitch(l) + " LPI)"));
      read.appendChild(cols);
      const perText = plan.per ? plan.per.toFixed(2).replace(/\.?0+$/, "") : "—";
      read.appendChild(el("div", "", plural(n, "photo", "photos") + " → " + perText + " printer " + (plan.per === 1 ? "dot" : "dots") + " per photo in each lens"));
      read.appendChild(el("div", "lent-dim", plan.w + " × " + plan.h + " px · " + plural(plan.lenses, "lens", "lenses") + " across the print · TIFF, no compression"));
      if (plan.warn === "bad") read.appendChild(el("div", "lent-warn", "Less than one printer dot per photo: the printer cannot separate the strips. Use a higher dpi, a coarser lens (fewer LPI), or a session with fewer photos."));
      else if (plan.warn === "tight") read.appendChild(el("div", "lent-warn", "Under 2 dots per photo: it works, but some photos get 1 dot and others 2, so the change between them is less even. A higher dpi (1440 instead of 720), a coarser lens or fewer photos gives a cleaner result."));
      if (!l.pitch) read.appendChild(el("div", "lent-note", "Using the nominal LPI. Real sheets differ a little (59.8 instead of 60, say): print a pitch test to measure yours and type it in \"Measured pitch\"."));
      box.appendChild(read);

      // Efeito
      const effect = row("Effect");
      effect.appendChild(segmented([["flip", "Animation (tilt up/down)"], ["3d", "3D (left/right)"]], l.effect, (v) => {
        l.effect = v;
        const list = v === "3d" ? LENSES_3D : LENSES;
        if (!list.some(([x]) => x === l.lpi) && !l.lpiOther) l.lpi = list[list.length - 1][0];
        rerender();
      }));
      effect.appendChild(checkOption("Reverse order", l.reverse, (v) => { l.reverse = v; rerender(); }));
      box.appendChild(effect);
      box.appendChild(el("div", "export-note", l.effect === "3d"
        ? "3D needs photos taken side by side along a straight line (left to right). A bullet-time arc only works partly. Lens strips stand vertical."
        : "Animation shows one photo after another as the print tilts up and down: the bullet-time turn. Lens strips lie horizontal."));

      // Lâmina
      const lens = row("Lens sheet");
      const lensList = l.effect === "3d" ? LENSES_3D : LENSES;
      const lensOpts = lensList.concat([["other", "Other"]]);
      const lensCurrent = l.lpiOther ? "other" : l.lpi;
      lens.appendChild(segmented(lensOpts, lensCurrent, (v) => { if (v === "other") { l.lpiOther = true; } else { l.lpiOther = false; l.lpi = v; } rerender(); }));
      if (l.lpiOther) lens.appendChild(numField(l.lpi, (v) => { l.lpi = v; rerender(); }, { placeholder: "LPI", width: "64px" }));
      const pitchLabel = el("span", "export-label lent-sub", "Measured pitch");
      lens.appendChild(pitchLabel);
      lens.appendChild(numField(l.pitch, (v) => { l.pitch = v; rerender(); }, { placeholder: String(l.lpi), width: "72px", allowEmpty: true }));
      box.appendChild(lens);
      box.appendChild(el("div", "export-note", "LPI = lenses per inch, printed on the sheet's package. 40–75 LPI for photo-size animation; 20–40 for 3D and posters. Leave \"Measured pitch\" empty until you have printed a pitch test (next version)."));

      // Impressora / saída
      const printer = row("Printer");
      const dpiOpts = PRINTERS.concat([["other", "Other"]]);
      printer.appendChild(segmented(dpiOpts, l.dpiOther ? "other" : l.dpi, (v) => { if (v === "other") { l.dpiOther = true; } else { l.dpiOther = false; l.dpi = v; } rerender(); }));
      if (l.dpiOther) printer.appendChild(numField(l.dpi, (v) => { l.dpi = Math.round(v); rerender(); }, { placeholder: "dpi", width: "64px" }));
      box.appendChild(printer);
      box.appendChild(el("div", "export-note", PRINTER_HELP));

      // Tamanho
      const size = row("Print size");
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
      box.appendChild(el("div", "export-note", "The photos are scaled to cover this size exactly (cropped at the edges if the shape differs). " +
        "Print at 100% / actual size, never \"fit to page\": the file already has the right dpi and size."));
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
      size.appendChild(el("span", "export-note", "4K only for MP4 and MOV. GIF, WEBP and AVIF go up to 1080p."));
      box.appendChild(size);

      const quality = row("Quality");
      quality.appendChild(segmented(QUALITIES, s.quality, (v) => { s.quality = v; rerender(); }));
      box.appendChild(quality);
      box.appendChild(el("div", "export-note", (s.quality === "standard" ? "Smaller files, good for sharing online."
        : s.quality === "high" ? "Very close to the photos, with smaller files. Good for most uses."
        : "As close to the photos as each format allows: WEBP keeps every pixel, MP4, MOV and AVIF get much more detail. " +
          "Large files, and AVIF takes longer.") + (s.formats.includes("gif") ? " GIF always has 256 colors, at any quality." : "")));

      const t = seqTotal(session, s);
      const total = el("div", "export-total");
      const path = order.length > 1 ? (s.reverse && items.length > 2 ? "1 → " + items.length + " → 2" : "1 → " + items.length) : "1";
      total.append(el("span", "", "1 loop: " + path + " · " + plural(t.cycle, "frame", "frames")),
                   el("span", "", "× " + plural(s.loops, "loop", "loops")), el("span", "spacer"));
      const sum = el("span", "", "Total ");
      sum.appendChild(el("b", "", seconds(t.seconds)));
      total.appendChild(sum);
      box.appendChild(total);
      box.appendChild(el("div", "export-note", "MP4 and MOV have the loops inside the video. GIF, WEBP and AVIF repeat without stopping."));
          }
    };

    OUTPUTS.forEach(([kind, title, sub]) => {
      const on = !!st.outputs[kind];
      const focused = on && kind === exp.mode;
      const sec = el("section", "exp-sec" + (on ? " on" : "") + (focused ? " focus" : ""));
      const head = el("div", "exp-sec-head");
      const check = el("label", "export-check exp-sec-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = on;
      input.setAttribute("aria-label", title);
      check.append(input, el("span", "save-check"));
      check.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", () => {
        st.outputs[kind] = input.checked;
        if (input.checked) exp.mode = kind;  // a que acabou de ligar vira a prévia
        rerender();
      });
      // Ligar (se desligada) e levar a prévia para esta saída
      const pick = (e) => { e.stopPropagation(); st.outputs[kind] = true; exp.mode = kind; rerender(); };
      const name = el("span", "exp-sec-name");
      name.append(el("b", "exp-sec-title", title), el("span", "exp-sec-sub", sub));
      if (!on) { head.classList.add("pick"); head.title = "Turn on " + title; head.addEventListener("click", pick); }
      head.append(check, name);
      const sum = el("span", "exp-sec-sum", on ? outputText(session, kind) : "Off");
      head.appendChild(sum);
      if (on) {
        // Fica nas seções ligadas; na que está na prévia, aceso
        const hint = el("button", "exp-sec-hint" + (focused ? " on" : ""), "Preview");
        hint.type = "button";
        hint.title = focused ? "This output is in the preview" : "Show the " + title + " preview";
        hint.setAttribute("aria-pressed", focused ? "true" : "false");
        hint.addEventListener("click", (e) => { e.stopPropagation(); if (!focused) pick(e); });
        head.appendChild(hint);
      }
      // Recolher / abrir as configurações (a saída continua ligada); vale para todas as sessões
      exp.collapsed = exp.collapsed || {};
      const folded = on && !!exp.collapsed[kind];
      if (on) {
        const fold = button("", (e) => { e.stopPropagation(); exp.collapsed[kind] = !folded; rerender(); },
          { icon: folded ? "down" : "up", title: folded ? "Show the " + title + " settings" : "Hide the " + title + " settings" });
        fold.classList.add("exp-sec-fold");
        head.appendChild(fold);
      }
      if (folded) sec.classList.add("folded");
      sec.appendChild(head);
      if (on) {
        const body = el("div", "exp-sec-body" + (folded ? " hidden" : ""));
        sec.appendChild(body);
        buildKind(kind, body, focused);
      }
      rows.appendChild(sec);
    });
    if (!OUTPUT_KINDS.some((k) => st.outputs[k])) rows.appendChild(el("div", "export-note exp-none", "Tick at least one output: Photos, Sequence or Lenticular."));
    slideBlocks(outer, before, rows);

    // Nome da pasta e dos arquivos
    const n = st.naming;
    const nameRow = row("Name");
    nameRow.appendChild(segmented([["date", "Date + time"], ["number", "Number"], ["custom", "Custom"]], n.kind,
      (v) => { n.kind = v; rerender(); }));
    rows.appendChild(nameRow);
    if (n.kind === "custom") {
      const custom = row("");
      custom.style.paddingLeft = "84px";
      const input = document.createElement("input");
      input.className = "export-name";
      input.placeholder = "Name, e.g. Studio test";
      input.maxLength = 80;
      input.value = n.text;
      input.addEventListener("input", () => { n.text = input.value.replace(/\|/g, ""); syncAll(); folderLine.textContent = "Folder: " + folderName(session); refreshSummaries(); });
      custom.appendChild(input);
      custom.appendChild(checkOption("Add date + time", n.date, (v) => { n.date = v; rerender(); }));
      if (n.date) custom.appendChild(segmented([["before", "Before"], ["after", "After"]], n.position, (v) => { n.position = v; rerender(); }));
      rows.appendChild(custom);
    }
    const folderLine = el("div", "export-note", "Folder: " + folderName(session));
    rows.appendChild(folderLine);
    if (n.kind === "number" || (n.kind === "custom" && !n.date))
      rows.appendChild(el("div", "export-note", n.kind === "number"
        ? "Numbers continue from the ones already in the destination folder."
        : "Sessions with the same name get numbers (01, 02…), continuing from the destination folder."));
    // Onde salva: com Project aberto, <Project>/Exports; sem, <pasta do Stillpoint>/Exports.
    // "Choose another folder…" vale só para este salvamento (como no New project)
    const dest = row("Save to");
    const where = exp.dest || exp.destDefault || "";
    // Marcas de direção: o corte é no começo (rtl), mas o caminho continua lido da esquerda para a direita
    const path = el("span", "export-dest", where ? "\u200E" + where + "\u200E" : "…");
    path.title = where;
    dest.appendChild(path);
    dest.appendChild(button("Choose another folder…", () => {
      if (typeof window.chooseExportFolder !== "function") { toast("This build cannot do that yet. Build the app again.", 8000); return; }
      Promise.resolve(window.chooseExportFolder(where)).then((r) => { if (r && r.folder) { exp.dest = r.folder; rerender(); } });
    }, { kind: "btn-link" }));
    if (exp.dest) dest.appendChild(button("Use " + (exp.destProject ? "the project's Exports" : "the default"), () => { exp.dest = null; rerender(); }, { kind: "btn-link" }));
    rows.appendChild(dest);

    if (!exp.sameForAll && sessions.length > 1) {
      const apply = el("div", "export-apply");
      const same = sessions.length > 1 && sessions.every((o) => sameAsActive(o.name));
      const note = el("span", "export-note", sessions.length === 1 ? "" : same
        ? "All sessions use these settings." : "These settings are only for " + label + ".");
      apply.appendChild(note);
      apply.appendChild(button("Apply to all sessions", () => {
        sessions.forEach((other) => {
          if (other.name === session.name) return;
          OUTPUT_KEYS.forEach((k) => { settingsFor(other.name)[k] = JSON.parse(JSON.stringify(st[k])); });
        });
        rerender();
        toast("Applied to all " + plural(sessions.length, "session", "sessions"));
      }));
      rows.appendChild(apply);
    } else if (sessions.length > 1) {
      rows.appendChild(el("div", "export-note export-apply", "Changes apply to all sessions. Turn off \"Same settings for all sessions\" to set each one."));
    }
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
      o.lenticular ? 1 : 0, lentPitch(l), l.dpi, (l.widthCm / CM_PER_IN).toFixed(4), (l.heightCm / CM_PER_IN).toFixed(4), l.effect, l.reverse ? 1 : 0].join("|");
  }

  function runExport(deleteRest) {
    const names = exportable().filter((s) => exp.selected.has(s.name)).map((s) => s.name);
    exp.waiting = true;  // a janela fica aberta até salvar de fato
    // Project: "project" = direto para <Project>/Exports; "edited" = usar as editadas quando houver
    // "dest": o 3º argumento é a pasta (vazio = a padrão), sem perguntar
    const flags = [deleteRest ? "delete" : "", exp.project && $("exportEdited").checked ? "edited" : "", "dest"].filter(Boolean).join(",");
    if (exp.project) window.projectExportDefaults(JSON.stringify({ mode: exp.mode, useEdited: $("exportEdited").checked }));
    window.exportSessions(exp.project ? "project" : exp.exitAfter ? "exit" : "", flags, exp.dest || "", ...names.map(exportSpec));
  }
  $("exportEdited").addEventListener("change", updateExportCount);

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
  function confirmExport() {
    const chosen = exp.selected.size;
    if (!chosen) return;
    const mixed = mixedFormats();
    if (mixed && !exp.formatsChecked) {
      dialog("Not every camera sent RAW",
        "RAW: " + mixed.raw.join(", ") + ". JPEG only: " + mixed.jpeg.join(", ") + ". Saved as Original, each camera keeps the format it shot. " +
        "To make them the same, set Quality in Camera settings before the next session, or save as JPG to convert all of them now.", [
        { label: "Back" },
        { label: "Save as is", primary: true, onClick: () => { exp.formatsChecked = true; confirmExport(); exp.formatsChecked = false; } },
      ]);
      return;
    }
    const left = exportable().length - chosen;
    if (!left || exp.project) return runExport(false);  // Project: exportar nunca apaga nada
    dialog("Delete the sessions you did not select?",
      plural(left, "session was", "sessions were") + " not selected. You can delete " + (left === 1 ? "it" : "them") +
      " after the others are saved, or keep " + (left === 1 ? "it" : "them") + " in the app to save later.", [
      { label: "Back" },
      { label: "Keep " + (left === 1 ? "it" : "them"), onClick: () => runExport(false) },
      { label: "Delete " + (left === 1 ? "it" : "them"), danger: true, onClick: () => runExport(true) },
    ]);
  }

  ui.saveBtn.addEventListener("click", () => startSave(false));
  $("exportSelectAll").addEventListener("click", () => { exp.selectedTouched = true; exp.selected = new Set(exportable().map((s) => s.name)); renderExportList(); updateExportCount(); });
  $("exportUnselectAll").addEventListener("click", () => { exp.selectedTouched = true; exp.selected.clear(); renderExportList(); updateExportCount(); });
  $("exportCancel").addEventListener("click", closeExport);
  $("exportConfirm").addEventListener("click", confirmExport);
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
    $("progressTitle").textContent = "Saving " + plural(total, "session", "sessions");
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
      dialog("Saving in progress",
        "Stillpoint is saving your sessions. You can close when it finishes, or stop now: the sessions that were not saved yet stay in the app for next time.", [
        { label: "Stop and close", danger: true, onClick: () => { exp.closeWhenDone = "stop"; window.cancelExport(); } },
        { label: "Close when done", primary: true, onClick: () => { exp.closeWhenDone = "wait"; toast("Stillpoint will close when saving finishes"); } },
      ]);
      return;
    }
    // Janela de salvar aberta: voltar para ela ou apagar e fechar
    const exportOpen = !$("exportOverlay").classList.contains("hidden");
    if (exportOpen) {
      $("exportOverlay").classList.add("hidden");
      stopPreview();
      const back = () => { $("exportOverlay").classList.remove("hidden"); renderExportSettings(); };
      dialog("Save your sessions before closing?",
        plural(count, "session is", "sessions are") + " not saved yet. If you close without saving, the photos are deleted.", [
        { label: "Delete and close", danger: true, onClick: () => window.exitApp(true) },
        { label: "Continue saving", primary: true, onClick: back },
      ]);
      return;
    }
    dialog(
      "Save your sessions before closing?",
      plural(count, "session is", "sessions are") + " not saved yet. If you close without saving, the photos are deleted.",
      [
        { label: "Cancel" },
        { label: "Delete and close", danger: true, onClick: () => window.exitApp(true) },
        { label: "Save and close", primary: true, onClick: () => startSave(true) },
      ]
    );
  }

  function offerRecovery(count) {
    dialog(
      "Sessions from last time",
      "The app closed before " + plural(count, "session was", "sessions were") + " saved. The photos are safe and shown in Sessions.",
      [
        { label: "Delete", link: true, onClick: () => dialog("Delete the kept sessions?", "Their photos will be deleted permanently.", [
          { label: "Cancel" },
          { label: "Delete", danger: true, onClick: () => window.deleteAllSessions() },
        ]) },
        { label: "Later" },
        { label: "Save", primary: true, onClick: () => startSave(false) },
      ]
    );
  }

  // =================== Avisos do programa ===================
  // Enquanto as fotos do "Reorder by photo" são tiradas, os avisos de disparo
  // vão para essa janela, não para a atividade nem para a contagem.
  const orderCapture = () => (order.open && order.capturing) || csTest.capturing;
  const captureGallery = () => (csTest.capturing ? csGallery : orderGallery);

  const handlers = {
    busy(e) {
      busy = e.busy;
      busyAction = e.busy ? e.action : "";
      if (e.busy && e.action === "shoot") { shootCancelling = false; shootCancelled = false; ui.progress.classList.remove("warn"); }
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
    },
    // Cartão cinza: depois da primeira foto, conferir onde está o cartão
    grayCardPick(e) { csCardShow(e.sessions, e.regions || []); },
    // Cartela de cores
    chartPick(e) { csChartShow(e.sessions, e.quads || []); },
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
        return;
      }
      const actions = [{ label: "OK", primary: true }];
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
        return;
      }
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
    sessions(e) { setSessions(e.sessions); if (e.project) setProject(e.project); },  // sessões antes: a janela Project desenha a partir delas
    // Som do disparo (botão da barra de cima e das janelas Live): um ajuste só, do app
    soundChanged(e) { sound = { sound: !!e.sound, sounds: !!e.sounds }; renderSoundBtn(); },
    saving() { activity.saving = true; renderActivity(); },
    exportProgress(e) { showProgress(e); },
    exportFolderError(e) { toast(e.error, 8000, { warn: true }); },
    saveCancelled() {
      if (exp.waiting) exp.waiting = false;  // a janela continua aberta como estava
      else toast("Save cancelled");
    },
    exportConflict(e) {
      const labels = e.names.map((n) => sessionLabel(n).date);
      const one = e.names.length === 1;
      dialog(one ? "This session was already saved here" : "Some sessions were already saved here",
        "The folder " + e.folder + " already has " + (one ? "a folder" : "folders") + " for " + labels.join(", ") + ". " +
        "Keep both saves a new folder with (2) in the name. Replace deletes everything inside the existing " +
        (one ? "folder" : "folders") + " and keeps only this new save.", [
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
        const text = "Saved " + plural(e.count, "session", "sessions") + " to " + e.folder;
        toast(text);
        log(text, "ok");
      }
      // Salvas (sem fechar o app): descartar do app ou manter
      if (saved.length) {
        const one = saved.length === 1;
        dialog(one ? "Discard the saved session?" : "Discard the " + saved.length + " saved sessions?",
          (one ? "The session was saved to " : "The sessions were saved to ") + e.folder + ". Discard " + (one ? "it" : "them") +
          " from Stillpoint now, or keep " + (one ? "it" : "them") + " in the app until you close it. The saved copies are not touched.", [
          { label: "Keep until I close" },
          { label: "Discard from app", primary: true, onClick: () => {
            saved.forEach((name) => window.deleteSession(name));
            log("Discarded " + plural(saved.length, "saved session", "saved sessions") + " from the app", "tech");
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
      if (!$("camSettingsOverlay").classList.contains("hidden")) renderCamSettings();
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
  function openSettings() {
    if (!upd.info) return;
    if (!prefs.theme) { prefs.theme = upd.info.theme; prefs.language = upd.info.language; prefs.debug = !!upd.info.debug; }
    renderSettings();
    refreshDebugSize();
    $("settingsOverlay").classList.remove("hidden");
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
  const CS_COLS = [["iso", "ISO"], ["tv", "Shutter"], ["av", "Aperture"], ["expcomp", "Exp. comp."], ["metering", "Metering"], ["wb", "White balance"],
    ["shift", "WB fine-tune"], ["style", "Picture Style"]];
  const CS_NAMES = { quality: "Quality", focus: "Focus", kelvin: "Color temperature", shiftab: "WB fine-tune A/B", shiftgm: "WB fine-tune G/M" };
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
    CS_COLS.concat([["quality"]]).forEach(([k]) => {  // quality: no popover ±, mas conta como diferença
      if (k === "focus" || k === "shift") return;  // ajuste fino: correção por câmera, diferente de propósito
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
    if (CS_COLS.concat([["quality"]]).some(([k]) => k !== "focus" && csDiffers(c, k, ref)) || csStyleDetailDiffers(c)) return { cls: "diff", text: "Settings differ", title: "Open Camera settings to match the cameras." };
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
  // Lista de opções do app no lugar da do sistema (que no Mac e no Windows tem outra cara).
  // O <select> continua por baixo: valor, "change" e teclado de foco funcionam como antes.
  let selectMenu = null;
  function closeSelectMenu() {
    if (!selectMenu) return;
    const m = selectMenu; selectMenu = null;
    m.sel.classList.remove("open");
    m.remove();
  }
  function appSelect(sel) {
    const open = () => {
      closeMenu();
      const opts = [...sel.options];
      const m = el("div", "app-menu project-menu select-menu");
      m.setAttribute("role", "listbox");
      m.sel = sel;
      const buttons = opts.map((o) => {
        const b = el("button", o.value === sel.value ? "current" : "", o.textContent);
        b.type = "button";
        b.setAttribute("role", "option");
        if (o.disabled) b.disabled = true;
        b.addEventListener("click", () => {
          closeSelectMenu();
          sel.focus();
          if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
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
      if (cur) { cur.scrollIntoView({ block: "center" }); cur.focus({ preventScroll: true }); }
      // ↑ ↓ andam pela lista; Enter escolhe (é um botão); Esc e Tab fecham
      m.addEventListener("keydown", (e) => {
        const live = buttons.filter((b) => !b.disabled);
        const i = live.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = live[Math.max(0, Math.min(live.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
          if (n) n.focus();
        } else if (e.key === "Tab") { e.preventDefault(); closeSelectMenu(); sel.focus(); }
      });
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
    sel.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
  }
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
  const COL_KEYS = { wb: ["wb", "kelvin"], shift: ["shiftab", "shiftgm"], style: ["style", "contrast", "saturation", "colortone"] };

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
    const styleCams = all ? camSettings.filter((c) => c.adjustable && c.styleDetail) : camSettings.filter((c) => c.camera === csStylePop.camera && c.styleDetail);
    const qualityCams = (all ? camSettings.filter((c) => c.adjustable) : camSettings.filter((c) => c.camera === csStylePop.camera)).filter(csHasQuality);
    const cams = styleCams;
    pop.innerHTML = "";
    pop.appendChild(el("div", "cs-pop-title", (all ? "All cameras" : csStylePop.camera) + " · " + [styleCams.length ? "Picture Style" : "", qualityCams.length ? "Quality" : ""].filter(Boolean).join(" & ")));
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
    // Quality (RAW, L fine…): saiu da tabela para ela caber; em All cameras só as opções comuns
    if (qualityCams.length) {
      const lists = qualityCams.map((c) => c.settings.quality.choices);
      const common = lists[0].filter(([v]) => lists.every((l) => l.some(([x]) => x === v)));
      const values = new Set(qualityCams.map((c) => c.settings.quality.value));
      const current = values.size === 1 ? String([...values][0]) : "";
      const options = common.map(([v, l]) => [String(v), l]);
      if (!current) options.unshift(["", "Different", true]);
      else if (!options.some(([x]) => x === current)) options.unshift([current, qualityCams[0].settings.quality.label]);
      const ref = csReference();
      const off = !all && ref.quality !== undefined && ref.quality !== null && csLabel(qualityCams[0], "quality") !== ref.quality;
      const row = el("label", "cs-pop-row" + (csIsPending(csStylePop.camera, ["quality"]) ? " applying" : "") + (styleCams.length ? " cs-pop-sep" : ""));
      row.appendChild(el("span", "", "Quality"));
      row.appendChild(csSelect(options, current, (v) => csSet(csStylePop.camera, "quality", +v), "pop-wide" + (off || !current ? " diff" : "")));
      pop.appendChild(row);
    }
    const r = anchor.getBoundingClientRect();
    const w = 230;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    pop.style.top = Math.min(window.innerHeight - 190, r.bottom + 6) + "px";
  }
  document.addEventListener("click", () => { if (csStylePop) { csStylePop = null; renderStylePop(); } });

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
    const st = c.settings[k];
    if (!st || !st.available) { td.appendChild(csText("—", "na", "Not available on this camera")); return td; }
    const current = k === "wb" && st.value === 9 ? "k" + c.kelvin : String(st.value);
    const currentLabel = k === "wb" && st.value === 9 ? c.kelvin + " K" : st.label;
    if (!st.choices.length) {
      // Tem o valor, mas não deixa mudar agora: valor dentro do tracejado
      td.appendChild(csText(currentLabel, "na" + (diff ? " diff" : ""), "The camera does not allow changing this now."));
      return td;
    }
    let options = st.choices.filter(([v]) => !(k === "wb" && v === 9)).map(([v, l]) => [String(v), k === "iso" ? isoText(l) : l]);
    if (k === "wb" && st.choices.some(([v]) => v === 9)) {
      options = options.concat(KELVINS.map((kv) => ["k" + kv, kv + " K"]));
      if (st.value === 9 && !KELVINS.includes(c.kelvin)) options.push(["k" + c.kelvin, c.kelvin + " K"]);
    }
    if (!options.some(([v]) => v === current)) options.unshift([current, currentLabel]);
    td.appendChild(csSelect(options, current, (v) => {
      if (k === "wb" && v.startsWith("k")) csSet(c.camera, "kelvin", +v.slice(1));
      else csSet(c.camera, k, +v);
    }, diff ? "diff" : ""));
    if (k === "style" && (c.styleDetail || csHasQuality(c))) td.appendChild(csStyleButton(c.camera, csStyleDetailLevel(c) || (csDiffers(c, "quality", ref) ? "partial" : ""), c));
    return td;
  }
  function csHasQuality(c) { const q = c.settings && c.settings.quality; return !!(q && q.available && q.choices && q.choices.length); }

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
    if (k === "style" && cams.some((c) => c.styleDetail || csHasQuality(c))) {
      const refs = csStyleDetailRefs();
      const n = cams.some((c) => c.styleDetail) ? STYLE_DETAILS.filter(([, , f]) => refs[f] !== null).length : 0;
      td.appendChild(csStyleButton("*", n === 0 ? "" : n === STYLE_DETAILS.length ? "diff" : "partial", null));
    }
    return td;
  }

  // Redesenha, mas não com uma lista aberta (a lista fecharia sozinha): espera sair dela
  function csRender() {
    const a = document.activeElement;
    const pop = $("csStylePop");
    if (a && a.tagName === "SELECT" && ($("csBody").contains(a) || (pop && pop.contains(a)))) { csRenderLater = true; return; }
    csRenderLater = false;
    renderCamSettings();
  }
  $("csBody").addEventListener("focusout", () => { if (csRenderLater) setTimeout(csRender, 0); });

  function renderCamSettings() {
    const body = $("csBody");
    const scroll = body.scrollTop;
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
    table.appendChild(head);

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
    body.appendChild(table);
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
    const keys = ["iso", "tv", "av", "expcomp", "metering", "style", "quality", "wb"];
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
    const match = $("csAuto").checked && connected >= 2;
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
    if (match) window.autoMatch(intValue(ui.downloadWait, 1, 10), $("csCard").checked ? 1 : 0);
    else window.takeOrderPhotos(intValue(ui.downloadWait, 1, 10));
  }
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
    $("csCardPick").classList.remove("hidden");
    csGallery.message("Waiting for you to check the gray card");
  }
  $("csCardContinue").addEventListener("click", () => {
    csCardHide();
    csGallery.message(csCard.mode === "chart" ? "Calibrating with the chart" : "Matching with the gray card");
    window.grayCardConfirm();
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
    $("csCardPick").classList.remove("hidden");
    csGallery.message("Waiting for you to check the chart");
  }

  // Botão "Calibrate with chart": instruções, abrir a cartela e começar
  function csChartIntro() {
    const cams = camSettings.filter((c) => c.adjustable && c.styleDetail && cameras.some((x) => x.name === c.camera && x.connected));
    const models = new Set(cams.map((c) => c.model));
    if (models.size < 2) {
      dialog("Calibrate with chart",
        "This compares camera models, so it needs at least two different models connected whose Picture Style can be changed from the app (for example, an SL3 and a T7).\n\n" +
        "Cameras of the same model already look alike: Match automatically is enough for them.",
        [{ label: "Open chart", link: true, onClick: () => window.openChart() }, { label: "OK", primary: true }]);
      return;
    }
    dialog("Calibrate with chart",
      "Makes cameras of different models look alike in contrast, saturation and color tone. Do it once for each new camera model; Match automatically then uses the result.\n\n" +
      "1. Click Open chart and print it at 100% (actual size, no scaling), on matte paper.\n" +
      "2. Put it where every camera sees the whole chart, including the 4 corner marks: flat, under even light, without glare. It should fill about a quarter of each photo or more.\n" +
      "3. Set the exposure so the chart looks normal in every camera (tip: run Test shot with Match automatically first).\n" +
      "4. Click Start. The app takes 4 photos, changing contrast, saturation and color tone, and then puts every setting back as it was.\n\n" +
      "After the first photo, you check that the chart corners are marked right.",
      [{ label: "Cancel" },
       { label: "Open chart", link: true, onClick: () => {
         Promise.resolve(window.openChart()).then((r) => { if (!r || !r.ok) toast("The chart file was not found. Build the app again."); });
         csChartIntro();
       } },
       { label: "Start", primary: true, onClick: csChartStart }]);
  }
  function csChartStart() {
    const connected = cameras.filter((c) => c.connected).length;
    if (busy || !connected || csTest.capturing) return;
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
  // "Use gray card" só vale com "Match automatically"
  function csCardOption() {
    const on = $("csAuto").checked;
    $("csCard").disabled = !on;
    document.querySelector(".cs-card-option").classList.toggle("off", !on);
  }
  $("csAuto").addEventListener("change", csCardOption);
  csCardOption();

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
    $("csTestBox").classList.toggle("has-photos", items.length > 0);
    const missing = items.filter((i) => !i.file).length;
    csGallery.setHead(csTest.mode === "chart" ? "Chart calibration" : csTest.mode === "match" ? "Test shot · matched" : "Test shot",
      (missing ? plural(missing, "camera", "cameras") + " did not send a photo · " : "") + "Not saved · click a photo to enlarge · ← → to compare");
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
    // Fechar esperando o cartão cinza: cancela (senão o Match ficaria esperando)
    if (csCardOpen()) $("csCardCancel").click();
    $("camSettingsOverlay").classList.add("hidden");
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

  $("camSettingsBtn").addEventListener("click", () => {
    renderCamSettings();
    $("camSettingsOverlay").classList.remove("hidden");
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
        else if (open === "camSettingsOverlay" && csStylePop) { csStylePop = null; renderStylePop(); }
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
    exportOverlay: () => { if (!exp.waiting) closeExport(); },
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
    if (e.key === "Escape") {
      if (open === "promptOverlay") return false;  // o campo já trata Enter/Esc
      e.overlayHandled = true;
      e.preventDefault(); e.stopImmediatePropagation();
      OVERLAY_CANCEL[open]();
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
  function sessionContextMenu(e, s) {
    const items = [];
    items.push({ label: (s.label ? "Rename label…" : "Add label…"), onClick: () => editSessionLabel(s) });
    if (s.label) items.push({ label: "Remove label", onClick: () => setSessionLabelUndoable(s, "") });
    items.push({ label: "Show session", onClick: () => showSession(s) });
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
    openMenu = m;
    armMenuClose(m);
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
    openMenu = m;
    armMenuClose(m);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openMenu) closeMenu(); });
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
      if (project.open) items.push({ label: "Close project", onClick: () => { const name = project.name; Promise.resolve(window.projectClose()).then((r) => { toast("Project closed: " + name + " (the sessions stay in its folder)"); projectResult(r); }); } });
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
  function inRect(x, y, r) { return r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height; }
  function sessDropTarget(x, y) {
    const d = sessDrag;
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    if (!d.s.inProject) {
      if (under.closest("#projectBarBtn")) return { el: $("projectBarBtn"), toProject: true };
      if (d.zone && inRect(x, y, projectGroupRect())) return { el: d.zone, toProject: true };
    } else if (d.zone && (inRect(x, y, outsideGroupRect()) || under.closest(".folder-divider"))) {
      return { el: d.zone, toProject: false };
    }
    return null;
  }
  function sessPointerDown(e, li, s) {
    if (e.button !== 0 || busy || e.target.closest("button")) return;
    if (sessDrag) sessEndDrag(null);
    e.preventDefault();  // sem seleção de texto pelo caminho do arraste (o clique continua valendo)
    // A sessão segurada passa a ser a selecionada (a lista é redesenhada: pega a linha nova)
    if (!currentSession || currentSession.name !== s.name) {
      showSession(s);
      li = ui.sessionList.querySelector('li.folder[data-name="' + CSS.escape(s.name) + '"]') || li;
    }
    sessDrag = { li, s, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
    li.setPointerCapture(e.pointerId);
    li.onpointermove = sessPointerMove;
    li.onpointerup = (ev) => sessEndDrag(sessDrag && sessDrag.moved ? sessDropTarget(ev.clientX, ev.clientY) : null);
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
      document.body.classList.add("session-drag", d.s.inProject ? "from-project" : "from-app");
      // Fantasma: cópia da linha que segue o ponteiro
      const r = d.li.getBoundingClientRect();
      d.ghost = d.li.cloneNode(true);
      d.ghost.className = "folder session-ghost";
      d.ghost.style.width = r.width + "px";
      d.ghost.style.left = r.left + "px"; d.ghost.style.top = r.top + "px";
      document.body.appendChild(d.ghost);
      // Zona tracejada: a área do projeto (sessão de fora) ou a área "Not in project" (sessão do projeto)
      d.zone = el("div", "session-drop-zone" + (d.s.inProject ? " out" : ""));
      d.zone.innerHTML = '<span>' + (d.s.inProject ? "Drop to remove from project" : "Drop to add to project") + '</span>';
      ui.sessionList.parentElement.appendChild(d.zone);
    }
    placeDropZone(d.zone, !d.s.inProject);
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
    if (d.ghost) d.ghost.remove();
    if (d.zone) d.zone.remove();
    if (d.over) d.over.classList.remove("drop-ok");
    document.body.classList.remove("session-drag", "from-project", "from-app");
    if (!target || busy) return;
    moveToProject(d.s.name, target.toProject);
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
    const close = () => { $("promptOverlay").classList.add("hidden"); $("promptOk").onclick = $("promptCancel").onclick = extra.onclick = input.onkeydown = null; };
    extra.onclick = opts.extra ? () => { close(); opts.extra.onClick(); } : null;
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
  function renderProjectBar() {
    const open = !!project.open;
    const b = $("projectBarBtn");
    b.classList.toggle("on", open);
    b.classList.toggle("unavailable", open && project.available === false);
    $("projectBarName").textContent = open ? project.name : "No project";
    $("projectBarMeta").textContent = open ? (project.available === false ? "not reachable" : [project.sessions || 0, project.photos || 0, project.edited ? project.edited + " edited" : ""].filter((x) => x !== "").join(" · ")) : "";
    b.title = open ? project.folder : "Open or create a project (a folder of yours that keeps the sessions)";
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
    promptDialog("New project", "A folder with this name will be created in " + shortPath(projectsFolder) + ".", "", "Create",
      (v) => {
        if (!v) return "Type a name for the project.";
        if (v[0] === ".") return "The name cannot start with a dot.";
        if (typeof window.projectNameFree !== "function") return "";
        return Promise.resolve(window.projectNameFree(v)).then((r) => !r || r.free ? ""
          : (r.project ? "There is already a project named \"" + v + "\" in " + shortPath(r.folder) + ". Open it from Recent or choose another name."
                       : "There is already a folder named \"" + v + "\" in " + shortPath(r.folder) + ". Choose another name."));
      },
      (v) => callProject("projectNew", v).then(projectResult),
      { extra: { label: "Choose another folder…", onClick: () => callProject("projectNew", "").then(projectResult) } });
  }
  function clearRecentProjects(all) {
    const keep = all.filter((f) => project.open && f === project.folder);
    const apply = (list) => Promise.resolve(window.projectRecentSet(...list));
    apply(keep).then(() => {
      toast("Recent projects cleared");
      recordAction({ label: "Clear recent projects", undo: () => apply(all), redo: () => apply(keep) });
    });
  }
  function renderProjectsFolder() {
    const el_ = $("settingsProjectsFolder");
    if (el_) el_.textContent = shortPath(projectsFolder) || "—";
  }
  $("settingsProjectsFolderChange").addEventListener("click", () => {
    if (typeof window.projectsFolderChange !== "function") { toast("This build cannot change the projects folder yet. Build the app again.", 8000); return; }
    Promise.resolve(window.projectsFolderChange()).then((r) => {
      if (!r || r.cancelled) return;
      projectsFolder = r.folder || projectsFolder;
      renderProjectsFolder();
      toast("New projects folder: " + shortPath(projectsFolder));
    });
  });
  function browseProject() { callProject("projectOpen", "").then(projectResult); }
  // Escolher um Project: recentes + "Choose folder…" + "New project…"
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
        list.appendChild(b);
      });
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
  function renderProjectWindow() {
    const list = projectSessions();
    const nameInput = $("projectNameInput");
    if (document.activeElement !== nameInput) { nameInput.value = project.name || ""; nameInput.classList.remove("invalid"); }
    $("projectSub").textContent = [project.folder, plural(project.sessions || 0, "session", "sessions"), plural(project.photos || 0, "photo", "photos"), fmtBytes(project.bytes)].filter(Boolean).join(" · ");
    const ul = $("projectList"); ul.innerHTML = "";
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
      if (s.missing > 0) ed.appendChild(missingTag(s.missing));
      const first = s.photos.find((p) => p.previewable);
      if (first) sessionPhoto(s.name, first.file, 320).then((url) => { if (url) li.querySelector(".export-thumb").style.backgroundImage = "url(" + url + ")"; });
      li.querySelector(".project-row-play").addEventListener("click", () => { closeProjectWindow(); showSession(s); });
      ul.appendChild(li);
    });
    updateProjectCount();
  }
  function updateProjectCount() {
    const list = projectSessions();
    const n = projectSel.size;
    $("projectListCount").textContent = n + " of " + plural(list.length, "session", "sessions") + " selected";
    $("projectExportBtn").disabled = n === 0 || project.available === false;
    $("projectExportBtn").textContent = n ? "Export " + plural(n, "session", "sessions") + "…" : "Export…";
    $("projectRemoveBtn").disabled = n === 0;
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
  $("projectCloseProjectBtn").addEventListener("click", () => {
    dialog("Close the project?", "The project's sessions leave the list (they stay in " + project.folder + "; nothing is deleted). New sessions go back to staying in the app until you save them. You can open the project again any time.", [
      { label: "Cancel" },
      { label: "Close project", primary: true, onClick: () => { const name = project.name; closeProjectWindow(); Promise.resolve(window.projectClose()).then((r) => { toast("Project closed: " + name + " (the sessions stay in its folder)"); projectResult(r); }); } },
    ]);
  });
  $("projectRemoveBtn").addEventListener("click", () => {
    const names = [...projectSel];
    dialog(names.length === 1 ? "Remove the session from the project?" : "Remove " + names.length + " sessions from the project?",
      "The photos move back to the app (out of the project folder); nothing is deleted. They count as unsaved again.", [
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
  ui.restartAppBtn.addEventListener("click", restartApp);
  ui.techToggle.addEventListener("change", () => { ui.logList.classList.toggle("show-tech", ui.techToggle.checked); ui.log.classList.toggle("show-tech", ui.techToggle.checked); });

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
  Promise.resolve(window.uiReady()).then((info) => {
    refreshSessions();
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
