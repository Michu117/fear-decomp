/*
 * android-touch.js — controles táctiles + menú propio para Fear & Hunger (MV)
 * en Android. Se inyecta en index.html tras android-compat.js.
 *
 * Superposición:
 *   - D-pad (4 direcciones) abajo-izquierda, A (Z=ok), B (X=escape),
 *     MENÚ (Esc) y ANTORCHA abajo-derecha.
 *   - Botón antorcha (Fase 6): llama SVG, keyCode 84 (T en PC). El plugin del
 *     juego YEP_ButtonCommonEvents (params js/plugins.js "Key T":"289") hace
 *     keyMapper[84]='t' y dispara el common event 289 al pulsar, SOLO en mapas
 *     de campo (igual que el teclado físico). Semántica de mantener pulsado:
 *     pointerdown→keydown, pointerup→keyup.
 *   - Botón ⚙ arriba-derecha → panel AJUSTES (Fase 5):
 *       · Límite de FPS 30/60 (window.__FH_fpsCap — API del shim; antes era
 *         el botón "30" fijo en pantalla, ahora vive SOLO en el menú)
 *       · Contador de FPS en vivo (window.__FH_fps, contado por el batcher
 *         del shim sobre el bucle real) con indicador junto al ⚙
 *       · Botón antorcha Sí/No (ocultarlo si estorba)
 *       · "Reposicionar controles": modo edición con arrastre de
 *         D-pad/A/B/Menú/Antorcha/⚙ (cada pieza se arrastra como unidad)
 *       · "Restablecer posiciones"
 *   - Persistencia en localStorage (origin appassets, igual que los saves):
 *     clave fhset_v1 = { cap, counter, torch, pos:{ grupo:{x,y} } } — x,y en
 *     fracción de pantalla para sobrevivir a cambios de densidad/orientación.
 *
 * El panel bloquea toques y teclado al juego mientras está abierto; el juego
 * sigue corriendo detrás (NO congelamos el bucle: TDDP_FluidTimestep castigaría
 * un salto de dt al reanudar).
 *
 * Los botones generan KeyboardEvents sintéticos con los MISMOS keycodes que un
 * teclado físico, así que el mapeo del juego (YEP_ButtonCommonEvents incluido)
 * funciona idéntico. Los eventos de la superposición se cortan
 * (stopPropagation + preventDefault) para que TouchInput del juego no los vea.
 */
(function () {
  'use strict';
  if (window.__FH_TOUCH_LOADED) return;
  window.__FH_TOUCH_LOADED = true;

  // Solo en dispositivos táctiles
  try {
    if (!navigator.maxTouchPoints && !('ontouchstart' in window)) return;
  } catch (e) { return; }

  var SET_KEY = 'fhset_v1';

  function log(m) {
    try { if (window.FHBridge) FHBridge.log(m); } catch (e) {}
  }
  function loadSet() {
    try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSet(s) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function synth(type, keyCode) {
    var ev;
    try {
      ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    } catch (e) {
      ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
    }
    Object.defineProperty(ev, 'keyCode', { get: function () { return keyCode; } });
    Object.defineProperty(ev, 'which', { get: function () { return keyCode; } });
    document.dispatchEvent(ev);
  }

  var held = {};
  function press(code) {
    if (!held[code]) { held[code] = true; synth('keydown', code); }
  }
  function release(code) {
    if (held[code]) { held[code] = false; synth('keyup', code); }
  }

  // ---------------- estado ----------------
  var st = loadSet();                    // ajustes persistentes
  var counterOn = st.counter !== false;  // contador de FPS: ON por defecto
  var torchOn = st.torch !== false;      // botón antorcha: ON por defecto
  var edit = false;                      // modo reposición
  var menuOpen = false;
  var drag = null;                       // {id, g, v(elem visual), c(elem captura), dx, dy}
  var G = {};                            // elementos arrastrables por grupo
  var DEF = {};                          // estilo inline original de cada pieza
  var GRP = ['dpad', 'a', 'b', 'mn', 'tc', 'set'];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---------------- arrastre (modo reposición) ----------------
  function dragStart(e, group, capEl) {
    if (drag) return;                    // un dedo a la vez
    var vis = (group === 'dpad') ? G.dpad : capEl;
    var r = vis.getBoundingClientRect();
    vis.style.right = 'auto';
    vis.style.bottom = 'auto';
    vis.style.left = r.left + 'px';
    vis.style.top = r.top + 'px';
    try { capEl.setPointerCapture(e.pointerId); } catch (err) {}
    drag = { id: e.pointerId, g: group, v: vis, c: capEl,
             dx: e.clientX - r.left, dy: e.clientY - r.top };
  }
  function dragMove(e, capEl) {
    if (!drag || drag.c !== capEl || e.pointerId !== drag.id) return;
    e.preventDefault();
    e.stopPropagation();
    var vis = drag.v;
    var r = vis.getBoundingClientRect();
    vis.style.left = clamp(e.clientX - drag.dx, 0, Math.max(0, innerWidth - r.width)) + 'px';
    vis.style.top = clamp(e.clientY - drag.dy, 0, Math.max(0, innerHeight - r.height)) + 'px';
  }
  function dragEnd(e, capEl) {
    if (!drag || drag.c !== capEl || e.pointerId !== drag.id) return;
    e.preventDefault();
    e.stopPropagation();
    var r = drag.v.getBoundingClientRect();
    st.pos = st.pos || {};
    st.pos[drag.g] = { x: +(r.left / innerWidth).toFixed(4),
                       y: +(r.top / innerHeight).toFixed(4) };
    saveSet(st);
    log('edit: guardado ' + drag.g);
    drag = null;
  }
  function applyPos(el, p) {
    var r = el.getBoundingClientRect();
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = clamp(p.x * innerWidth, 0, Math.max(0, innerWidth - r.width)) + 'px';
    el.style.top = clamp(p.y * innerHeight, 0, Math.max(0, innerHeight - r.height)) + 'px';
  }
  function resetPos() {
    // Restaurar el estilo inline ORIGINAL completo. Los anclajes por defecto
    // (right/bottom, o left/bottom del D-pad) existen SOLO inline: si se
    // borran, el elemento absoluto sin anclajes cae a la esquina superior
    // izquierda. (Bug reportado en la Fase 5: reset → todo arriba-izquierda.)
    st.pos = {};
    saveSet(st);
    GRP.forEach(function (g) {
      var el = G[g];
      if (!el || DEF[g] == null) return;
      el.setAttribute('style', DEF[g]);
    });
    applyTorchVis();                     // DEF no debe decidir la visibilidad
    log('edit: posiciones restablecidas');
  }
  function applyTorchVis() {
    if (G.tc) G.tc.style.display = torchOn ? '' : 'none';
  }

  // ---------------- botones ----------------
  function mkBtn(parent, id, label, code, css, group, html) {
    var b = document.createElement('div');
    b.id = id;
    b.className = 'fh-tbtn';
    if (html) b.innerHTML = label;       // p. ej. el icono SVG de la antorcha
    else b.textContent = label;
    b.setAttribute('style', css);
    var down = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (edit) {                       // en modo edición: arrastrar, no pulsar
        dragStart(e, group, b);
        return;
      }
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add('fh-down');
      press(code);
    };
    var up = function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragEnd(e, b);                    // no-op fuera del modo edición
      b.classList.remove('fh-down');
      release(code);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('pointermove', function (e) { dragMove(e, b); });
    parent.appendChild(b);
    return b;
  }

  // ---------------- menú ----------------
  function openMenu() {
    paintMenu();
    menuOpen = true;
    document.getElementById('fh-menu').classList.add('fh-on');
    window.addEventListener('keydown', onMenuKey, true);
    log('menu: abierto');
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    document.getElementById('fh-menu').classList.remove('fh-on');
    window.removeEventListener('keydown', onMenuKey, true);
    log('menu: cerrado');
  }
  function onMenuKey(e) {               // el teclado no llega al juego con el menú abierto
    e.stopPropagation();
    e.preventDefault();
    if (e.keyCode === 27) closeMenu();  // Esc cierra
  }
  function segById(id) { return document.getElementById(id); }
  function paintSeg(el, v) {
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].className = (kids[i].getAttribute('data-v') === v) ? 'fh-act' : '';
    }
  }
  function paintMenu() {
    paintSeg(segById('fh-cap'), String(window.__FH_fpsCap || 30));
    paintSeg(segById('fh-cnt'), counterOn ? 'on' : 'off');
    paintSeg(segById('fh-tcsw'), torchOn ? 'on' : 'off');
  }
  function startEdit() {
    edit = true;
    document.getElementById('fh-touch').classList.add('fh-editing');
    document.getElementById('fh-edit').classList.add('fh-on');
    log('edit: modo reposición ON');
  }
  function stopEdit() {
    edit = false;
    drag = null;
    document.getElementById('fh-touch').classList.remove('fh-editing');
    document.getElementById('fh-edit').classList.remove('fh-on');
    log('edit: modo reposición OFF');
  }

  function bindSeg(id, cb) {
    var el = segById(id);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var t = e.target && e.target.getAttribute ? e.target : null;
      var v = t ? t.getAttribute('data-v') : null;
      if (!v) return;
      cb(v);
      paintSeg(el, v);
    });
  }
  function bindCmd(id, cb) {
    var el = segById(id);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      cb();
    });
  }

  function build() {
    if (!document.body || window.__FH_TOUCH_BUILT) return;
    window.__FH_TOUCH_BUILT = true;

    if (st.cap === 60) window.__FH_fpsCap = 60;   // cap recordado del uso anterior

    var css = document.createElement('style');
    css.textContent =
      /* superposición */
      '#fh-touch{position:fixed;inset:0;z-index:99999;pointer-events:none;' +
      'font-family:Arial,Helvetica,sans-serif;user-select:none;-webkit-user-select:none;}' +
      '.fh-tbtn{pointer-events:auto;position:absolute;display:flex;align-items:center;' +
      'justify-content:center;border-radius:50%;background:rgba(18,18,26,.40);' +
      'border:2px solid rgba(255,255,255,.35);color:rgba(255,255,255,.85);font-weight:bold;' +
      'touch-action:none;-webkit-tap-highlight-color:transparent;}' +
      '.fh-down{background:rgba(255,255,255,.32);border-color:rgba(255,255,255,.7);}' +
      /* indicador de FPS junto al ⚙ */
      '#fh-fcnt{pointer-events:none;position:absolute;display:none;align-items:center;' +
      'justify-content:center;min-width:min(9vmin,52px);height:min(9vmin,52px);padding:0 10px;' +
      'border-radius:999px;background:rgba(18,18,26,.55);' +
      'border:1px solid rgba(255,220,120,.55);color:rgba(255,220,120,.95);' +
      'font-size:min(4vmin,20px);font-weight:bold;}' +
      /* panel de ajustes */
      '#fh-menu{position:fixed;inset:0;z-index:100000;display:none;flex-direction:column;' +
      'align-items:center;justify-content:center;background:rgba(5,5,9,.82);' +
      'pointer-events:auto;touch-action:none;font-family:Georgia,"Times New Roman",serif;' +
      'user-select:none;-webkit-user-select:none;}' +
      '#fh-menu.fh-on{display:flex;}' +
      '.fh-panel{width:min(86vw,660px);background:#14121a;border:2px solid #7a6f5a;' +
      'border-radius:4px;padding:clamp(14px,3vmin,34px) clamp(16px,4vmin,44px);color:#d8cfb8;' +
      'box-shadow:0 0 26px rgba(0,0,0,.8);}' +
      '.fh-title{text-align:center;font-size:clamp(17px,4.6vmin,40px);letter-spacing:.2em;' +
      'color:#e8d9b0;border-bottom:1px solid #4a4335;' +
      'padding-bottom:clamp(6px,1.6vmin,16px);margin-bottom:clamp(8px,2.4vmin,24px);}' +
      '.fh-row{display:flex;align-items:center;justify-content:space-between;' +
      'gap:clamp(8px,2vmin,24px);margin:clamp(6px,2vmin,22px) 0;' +
      'font-size:clamp(14px,3.6vmin,32px);}' +
      '.fh-seg{display:flex;border:1px solid #7a6f5a;border-radius:3px;overflow:hidden;' +
      'flex-shrink:0;}' +
      '.fh-seg>div{padding:clamp(6px,1.6vmin,16px) clamp(12px,3.4vmin,34px);color:#a89f88;' +
      'pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;}' +
      '.fh-seg .fh-act{background:#5a4f3a;color:#ffe9b0;}' +
      '.fh-btn{padding:clamp(8px,2vmin,20px) clamp(12px,3vmin,30px);border:1px solid #7a6f5a;' +
      'border-radius:3px;background:#221f18;color:#d8cfb8;text-align:center;' +
      'font-size:clamp(14px,3.4vmin,30px);pointer-events:auto;touch-action:none;' +
      '-webkit-tap-highlight-color:transparent;}' +
      '.fh-btn:active{background:#3a342a;}' +
      '.fh-wide{width:100%;margin-top:clamp(6px,2vmin,22px);}' +
      '.fh-hint{margin-top:clamp(8px,2.4vmin,24px);font-size:clamp(11px,2.6vmin,22px);' +
      'color:#8a8272;text-align:center;line-height:1.5;}' +
      /* modo edición */
      '#fh-edit{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100001;' +
      'display:none;flex-direction:column;gap:8px;align-items:center;pointer-events:auto;' +
      'touch-action:none;font-family:Arial,sans-serif;}' +
      '#fh-edit.fh-on{display:flex;}' +
      '.fh-banner{background:rgba(14,12,18,.92);border:1px solid #7a6f5a;color:#e8d9b0;' +
      'padding:clamp(6px,1.6vmin,14px) clamp(10px,2.4vmin,24px);border-radius:4px;' +
      'font-size:clamp(12px,3vmin,26px);text-align:center;}' +
      '.fh-editing .fh-tbtn,.fh-editing #fh-dpad{' +
      'outline:2px dashed rgba(255,230,160,.8);outline-offset:2px;}';
    document.head.appendChild(css);

    var root = document.createElement('div');
    root.id = 'fh-touch';
    document.body.appendChild(root);

    var S = 'min(11vmin,64px)';            // tamaño botón D-pad
    var O = 'min(2.5vmin,15px)';           // margen exterior
    var dp = function (extra) {
      return 'width:' + S + ';height:' + S + ';font-size:min(5vmin,28px);' + extra;
    };

    // D-pad como contenedor: se arrastra como UNA sola pieza
    G.dpad = document.createElement('div');
    G.dpad.id = 'fh-dpad';
    G.dpad.setAttribute('style', 'position:absolute;left:' + O + ';bottom:' + O + ';' +
      'width:calc(3*' + S + ');height:calc(3*' + S + ');pointer-events:none;');
    root.appendChild(G.dpad);
    mkBtn(G.dpad, 'fh-up', '▲', 38, 'left:' + S + ';bottom:calc(2*' + S + ');' + dp(''), 'dpad');
    mkBtn(G.dpad, 'fh-dn', '▼', 40, 'left:' + S + ';bottom:0;' + dp(''), 'dpad');
    mkBtn(G.dpad, 'fh-lf', '◀', 37, 'left:0;bottom:' + S + ';' + dp(''), 'dpad');
    mkBtn(G.dpad, 'fh-rt', '▶', 39, 'left:calc(2*' + S + ');bottom:' + S + ';' + dp(''), 'dpad');

    // Botones: A (ok), B (escape), MENÚ (Esc) abajo-derecha
    var AB = 'min(13vmin,76px)';
    G.a = mkBtn(root, 'fh-a', 'A', 90,
      'right:' + O + ';bottom:' + O + ';width:' + AB + ';height:' + AB +
      ';font-size:min(6vmin,34px);', 'a');
    G.b = mkBtn(root, 'fh-b', 'B', 88,
      'right:calc(' + O + ' + min(25vmin,146px));bottom:calc(' + O + ' + min(3vmin,18px))' +
      ';width:calc(' + AB + ' * .85);height:calc(' + AB + ' * .85);' +
      'font-size:min(5vmin,28px);', 'b');
    G.mn = mkBtn(root, 'fh-mn', '≡', 27,
      'right:calc(' + O + ' + min(3vmin,18px));bottom:calc(' + O + ' + min(15vmin,88px))' +
      ';width:min(9vmin,52px);height:min(9vmin,52px);font-size:min(5vmin,26px);', 'mn');

    // Botón ANTORCHA (Fase 6): keyCode 84 = T → YEP_ButtonCommonEvents → CE 289.
    // Por defecto a la izquierda de la B, en su misma fila (alcance del pulgar
    // derecho sin tapar la A). Icono: llama SVG monocroma (hereda color del botón).
    G.tc = mkBtn(root, 'fh-tc',
      '<svg viewBox="0 0 24 24" width="56%" height="56%">' +
      '<path fill="currentColor" d="M12 2s6 5.5 6 10a6 6 0 0 1-12 0c0-2.5 1.2-4.6 2.6-6.3' +
      '.3 1.4 1 2.3 1.9 2.8-.6-2.5-.2-4.8 1.5-6.5z"/></svg>',
      84,
      'right:calc(' + O + ' + min(25vmin,146px) + min(9vmin,52px) + 8px);' +
      'bottom:calc(' + O + ' + min(3vmin,18px));' +
      'width:min(9vmin,52px);height:min(9vmin,52px);', 'tc', true);

    // Botón ⚙ (ajustes) arriba-derecha — antes era el interruptor 30/60
    var set = document.createElement('div');
    set.id = 'fh-set';
    set.className = 'fh-tbtn';
    set.textContent = '\u2699';
    set.setAttribute('style', 'right:' + O + ';top:' + O +
      ';width:min(9vmin,52px);height:min(9vmin,52px);font-size:min(5vmin,26px);');
    set.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (edit) { dragStart(e, 'set', set); return; }
      openMenu();
    });
    set.addEventListener('pointermove', function (e) { dragMove(e, set); });
    set.addEventListener('pointerup', function (e) { dragEnd(e, set); });
    set.addEventListener('pointercancel', function (e) { dragEnd(e, set); });
    set.addEventListener('lostpointercapture', function (e) { dragEnd(e, set); });
    root.appendChild(set);
    G.set = set;

    // Indicador de FPS en vivo (junto al ⚙, sigue su posición)
    var cnt = document.createElement('div');
    cnt.id = 'fh-fcnt';
    root.appendChild(cnt);
    setInterval(function () {
      if (menuOpen || edit || !counterOn) { cnt.style.display = 'none'; return; }
      cnt.textContent = (window.__FH_fps != null) ? String(window.__FH_fps) : '\u2013';
      cnt.style.display = 'flex';
      var r = set.getBoundingClientRect();
      var w = cnt.offsetWidth;
      var x = r.left - w - 8;
      if (x < 6) x = Math.min(innerWidth - w - 6, r.right + 8);
      cnt.style.left = x + 'px';
      cnt.style.top = r.top + 'px';
      cnt.style.right = 'auto';
    }, 500);

    // Panel de AJUSTES
    var menu = document.createElement('div');
    menu.id = 'fh-menu';
    menu.innerHTML =
      '<div class="fh-panel">' +
      '<div class="fh-title">AJUSTES</div>' +
      '<div class="fh-row"><span>L\u00edmite de FPS</span>' +
      '<div class="fh-seg" id="fh-cap"><div data-v="30">30</div><div data-v="60">60</div></div></div>' +
      '<div class="fh-row"><span>Contador de FPS</span>' +
      '<div class="fh-seg" id="fh-cnt"><div data-v="on">S\u00ed</div><div data-v="off">No</div></div></div>' +
      '<div class="fh-row"><span>Bot\u00f3n antorcha</span>' +
      '<div class="fh-seg" id="fh-tcsw"><div data-v="on">S\u00ed</div><div data-v="off">No</div></div></div>' +
      '<div class="fh-btn fh-wide" id="fh-repos">Reposicionar controles</div>' +
      '<div class="fh-btn fh-wide" id="fh-reset">Restablecer posiciones</div>' +
      '<div class="fh-btn fh-wide" id="fh-close">Cerrar</div>' +
      '<div class="fh-hint">El juego sigue activo detr\u00e1s de este men\u00fa; ' +
      'los controles quedan bloqueados hasta cerrarlo.</div>' +
      '</div>';
    document.body.appendChild(menu);
    // Bloquear TODO al juego mientras el menú está abierto (teclado incluido)
    ['pointerdown', 'pointerup', 'pointermove', 'pointercancel',
     'touchstart', 'touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
      menu.addEventListener(ev, function (e) { e.stopPropagation(); }, false);
    });
    menu.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (e.target === menu) closeMenu();   // toque fuera del panel = cerrar
    });
    bindSeg('fh-cap', function (v) {
      window.__FH_fpsCap = Number(v);
      st.cap = Number(v);
      saveSet(st);
      log('menu: FPS cap = ' + v);
    });
    bindSeg('fh-cnt', function (v) {
      counterOn = (v === 'on');
      st.counter = counterOn;
      saveSet(st);
      log('menu: contador FPS = ' + v);
    });
    bindSeg('fh-tcsw', function (v) {
      torchOn = (v === 'on');
      st.torch = torchOn;
      saveSet(st);
      applyTorchVis();
      log('menu: botón antorcha = ' + v);
    });
    bindCmd('fh-repos', function () { closeMenu(); startEdit(); });
    bindCmd('fh-reset', function () { resetPos(); paintMenu(); });
    bindCmd('fh-close', function () { closeMenu(); });

    // Banner del modo edición
    var editBox = document.createElement('div');
    editBox.id = 'fh-edit';
    editBox.innerHTML =
      '<div class="fh-banner">Arrastra los botones a donde quieras</div>' +
      '<div class="fh-btn" id="fh-done">\u2713 Listo</div>';
    document.body.appendChild(editBox);
    editBox.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (ev) {
      editBox.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    editBox.querySelector('#fh-done').addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      stopEdit();
    });

    // Guardar estilos por defecto (para restablecer sin perder los anclajes)
    GRP.forEach(function (g) {
      if (G[g]) DEF[g] = G[g].getAttribute('style');
    });

    // Posiciones guardadas (Fase 5) → aplicar
    if (st.pos) {
      GRP.forEach(function (g) {
        if (st.pos[g] && G[g]) applyPos(G[g], st.pos[g]);
      });
    }
    applyTorchVis();                     // tras DEF y applyPos (si el usuario lo ocultó)
    paintMenu();

    log('touch: controles táctiles activos (D-pad + A/B/Menú/Antorcha + Ajustes ⚙)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
