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
 *   - Botón SHIFT (Fase 7): keyCode 16, semántica de mantener pulsado (igual
 *     que la antorcha). Verificado en el juego: keyMapper[16]='shift' (MV
 *     default). NO sirve para correr: el juego fuerza el dash
 *     (TDDP_ManageDashing "Force Dashing": true). Lo usan las condiciones de
 *     eventos de mapa "botón Shift pulsado" (puñalada por la espalda → CE 151
 *     BACKSTAB_OK?, acciones con arco) y ventanas (avance rápido de texto,
 *     teclado de nombres).
 *     Nadie lee event.shiftKey, así que el evento sintético basta tal cual.
 *   - Tamaño por control (Fase 7): en modo Reposicionar, PELLIZCAR un botón
 *     con dos dedos lo redimensiona (60–180%) mientras un dedo lo arrastra
 *     para moverlo (etiqueta en vivo del %). Cada grupo guarda su propia
 *     escala: --fh-sz se setea POR ELEMENTO (no global) y persiste en
 *     fhset_v1.sizes. Se usa calc() en los sizes inline (área de toque =
 *     área visual; el arrastre no divide deltas) y los anclajes de la fila
 *     B/antorcha/Shift y del ≡ escalan con el mismo --fh-sz para no
 *     solaparse a tamaños grandes.
 *   - D-pad Flechas ↔ Joystick (Fase 7): nodo hermano #fh-joy dentro del
 *     contenedor #fh-dpad (misma unidad arrastrable y misma posición
 *     guardada). Zona muerta 22%, histéresis de12°,8 sectores de45°
 *     (diagonal =2 teclas simultáneas; MV soporta diagonal nativo).
 *     Soltar el dedo libera TODAS las flechas (red de seguridad).
 *   - Botón ⚙ arriba-derecha → panel AJUSTES (Fase 5):
 *       · Límite de FPS 30/60 (window.__FH_fpsCap — API del shim; antes era
 *         el botón "30" fijo en pantalla, ahora vive SOLO en el menú)
 *       · Contador de FPS en vivo (window.__FH_fps, contado por el batcher
 *         del shim sobre el bucle real) con indicador junto al ⚙
 *       · Botón antorcha Sí/No (ocultarlo si estorba)
 *       · Botón Shift Sí/No (Fase 7)
 *       · Tamaño por control: pellizcar en modo Reposicionar (Fase 7)
 *       · Control de dirección: Flechas | Joystick (Fase 7)
 *       · "Reposicionar controles": modo edición con arrastre de
 *         D-pad/A/B/Menú/Antorcha/Shift/⚙ (cada pieza se arrastra como unidad)
 *       · "Restablecer controles": posiciones + tamaño + modo de dirección
 *         (los interruptores de features NO se tocan)
 *   - Persistencia en localStorage (origin appassets, igual que los saves):
 *     clave fhset_v1 = { cap, counter, torch, shift, sizes, dpad,
 *     pos:{ grupo:{x,y} } } — x,y en fracción de pantalla para sobrevivir a
 *     cambios de densidad/orientación. Claves nuevas con defaults: las
 *     configuraciones guardadas en v1.0.0 siguen cargando sin tocar nada.
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
  var shOn = st.shift !== false;         // botón Shift: ON por defecto (Fase 7)
  var dpadMode = (st.dpad === 'joy') ? 'joy' : 'flechas';  // dirección (Fase 7)
  var hapOn = st.haptic !== false;       // vibración al pulsar: ON por defecto (Fase 8)
  var OPS = [40, 60, 80, 100];
  var opac = (OPS.indexOf(st.op) >= 0) ? st.op : 100;   // opacidad de controles (Fase 8)
  var sel = null;                        // control seleccionado en modo edición (Fase 8)

  // ---------------- idiomas de la UI del port (Fase 9) ----------------
  // SOLO la UI propia (menú ⚙, barra de edición); el texto del juego no se
  // toca. Inglés = idioma por defecto/fallback. Añadir un idioma = añadir un
  // diccionario aquí (con su nombre nativo en _name) + res/values-xx/strings.xml.
  var I18N = {
    en: {
      _name: 'English',
      settings: 'SETTINGS', fpsCap: 'FPS limit', fpsCnt: 'FPS counter',
      torch: 'Torch button', shift: 'Shift button', dir: 'Movement control',
      arrows: 'Arrows', joy: 'Joystick', opacity: 'Opacity', haptic: 'Vibration',
      lang: 'Language', yes: 'Yes', no: 'No',
      repos: 'Reposition / size', reset: 'Reset controls', close: 'Close',
      hint1: 'The game keeps running behind this menu; controls are locked until you close it.',
      hint2: 'Size: in Reposition, tap a control and use \u2212 / + (or pinch it).',
      tapCtl: 'Tap a control', done: '\u2713 Done',
      n_dpad: 'Movement', n_a: 'A button', n_b: 'B button', n_mn: 'Menu \u2261',
      n_tc: 'Torch', n_sh: 'Shift', n_set: 'Settings \u2699'
    },
    es: {
      _name: 'Espa\u00f1ol',
      settings: 'AJUSTES', fpsCap: 'L\u00edmite de FPS', fpsCnt: 'Contador de FPS',
      torch: 'Bot\u00f3n antorcha', shift: 'Bot\u00f3n Shift', dir: 'Control de direcci\u00f3n',
      arrows: 'Flechas', joy: 'Joystick', opacity: 'Opacidad', haptic: 'Vibraci\u00f3n',
      lang: 'Idioma', yes: 'S\u00ed', no: 'No',
      repos: 'Reposicionar / tama\u00f1o', reset: 'Restablecer controles', close: 'Cerrar',
      hint1: 'El juego sigue activo detr\u00e1s de este men\u00fa; los controles quedan bloqueados hasta cerrarlo.',
      hint2: 'Tama\u00f1o: en Reposicionar, toca un control y usa \u2212 / + (o pell\u00edzcalo).',
      tapCtl: 'Toca un control', done: '\u2713 Listo',
      n_dpad: 'Direcci\u00f3n', n_a: 'Bot\u00f3n A', n_b: 'Bot\u00f3n B', n_mn: 'Men\u00fa \u2261',
      n_tc: 'Antorcha', n_sh: 'Shift', n_set: 'Ajustes \u2699'
    }
  };
  function sysLang() {                   // idioma del sistema si está traducido, si no inglés
    var l = '';
    try { l = String(navigator.language || '').toLowerCase().split('-')[0]; } catch (e) {}
    return I18N[l] ? l : 'en';
  }
  var lang = I18N[st.lang] ? st.lang : sysLang();
  function t(k) {
    var d = I18N[lang] || I18N.en;
    return (d[k] != null) ? d[k] : (I18N.en[k] != null ? I18N.en[k] : k);
  }
  function applyLang() {                 // repinta todos los [data-t] del port
    var els = document.querySelectorAll('#fh-menu [data-t], #fh-edit [data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    try { document.documentElement.setAttribute('data-fh-lang', lang); } catch (e) {}
    paintTools();
  }
  var edit = false;                      // modo reposición
  var menuOpen = false;
  var drag = null;                       // {id, g, v(elem visual), c(elem captura), dx, dy}
  var epts = {};                         // dedos activos por grupo en modo edición (Fase 7)
  var pin = null;                        // pellizco activo {g, d0, s0} (Fase 7)
  var pinLbl = null;                     // etiqueta en vivo del % (Fase 7)
  var G = {};                            // elementos arrastrables por grupo
  var DEF = {};                          // estilo inline original de cada pieza
  var GRP = ['dpad', 'a', 'b', 'mn', 'tc', 'sh', 'set'];
  var arrowsEl = null, joyEl = null, knobEl = null;  // D-pad y joystick (Fase 7)
  var joySt = { id: null, cx: 0, cy: 0, r: 0, sec: -1 };  // estado del joystick

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
    avoidBar(vis.getBoundingClientRect());
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
    // Fase7: el reset restaura LAYOUT completo (posiciones + tamaños
    // individuales + modo de dirección); los interruptores de features (FPS,
    // contador, antorcha, Shift visible) se quedan como los dejó el usuario.
    st.pos = {};
    st.sizes = {};
    st.dpad = 'flechas';
    saveSet(st);
    GRP.forEach(function (g) {
      var el = G[g];
      if (!el || DEF[g] == null) return;
      el.setAttribute('style', DEF[g]);   // --fh-sz inline se va con el style
    });
    dpadMode = 'flechas';
    applyDpadMode();
    applySizes(st.sizes);                 // todos a1 (fallback CSS)
    applyTorchVis();                      // DEF no debe decidir la visibilidad
    applyShVis();
    log('edit: controles restablecidos (posiciones + tamaños + dirección)');
  }
  function applyTorchVis() {
    if (G.tc) G.tc.style.display = torchOn ? '' : 'none';
  }
  function applyShVis() {                // visibilidad del botón Shift (Fase 7)
    if (G.sh) G.sh.style.display = shOn ? '' : 'none';
  }
  function applyAllPos() {               // re-aplica posiciones guardadas (con clamp)
    if (!st.pos) return;
    GRP.forEach(function (g) {
      if (st.pos[g] && G[g]) applyPos(G[g], st.pos[g]);
    });
  }

  // ---------------- tamaño por control (Fase 7) ----------------
  // Cada grupo (dpad/a/b/mn/tc/sh/set) guarda su propia escala en
  // fhset_v1.sizes. La escala es la variable CSS --fh-sz seteada POR
  // ELEMENTO: los sizes inline son calc(base*var(--fh-sz,1)), así que el
  // fallback '1' deja todo en tamaño original si no hay escala guardada.
  var SZ_MIN = 0.6, SZ_MAX = 1.8;
  function curScale(g) {
    var el = G[g];
    var v = el && el.style.getPropertyValue('--fh-sz');
    var n = v ? parseFloat(v) : 1;
    return (typeof n === 'number' && isFinite(n)) ? n : 1;
  }
  function setScale(g, s) {
    var el = G[g];
    if (!el) return;
    s = clamp(s, SZ_MIN, SZ_MAX);
    el.style.setProperty('--fh-sz', String(+s.toFixed(3)));
    if (st.pos && st.pos[g]) applyPos(el, st.pos[g]);  // re-anclar tras redimensionar
  }
  function applySizes(sizes) {           // aplicar tamaños guardados (o defaults)
    GRP.forEach(function (g) {
      var s = sizes && sizes[g];
      if (typeof s === 'number' && s >= SZ_MIN && s <= SZ_MAX) setScale(g, s);
      else if (G[g]) G[g].style.removeProperty('--fh-sz');
    });
  }
  function showPinLbl(g) {               // etiqueta en vivo "120%" sobre el control
    var el = G[g];
    if (!el || !pinLbl) return;
    var r = el.getBoundingClientRect();
    pinLbl.textContent = Math.round(curScale(g) * 100) + '%';
    pinLbl.style.left = (r.left + r.width / 2) + 'px';
    pinLbl.style.top = (r.top - 6) + 'px';
    pinLbl.style.display = 'block';
  }
  function hidePinLbl() {
    if (pinLbl) pinLbl.style.display = 'none';
  }
  function saveSize(g) {
    st.sizes = st.sizes || {};
    st.sizes[g] = +curScale(g).toFixed(2);
    saveSet(st);
  }

  // ------- Fase 8: selección + barra de tamaño (alternativa al pellizco) -------
  // En modo Reposicionar, tocar un control lo SELECCIONA (contorno dorado) y la
  // barra superior muestra su nombre y − / % / + (mantener = repetir) y ↺
  // (volver a 100%). Pellizcar sigue funcionando para quien lo prefiera.
  function selectGrp(g) {
    if (sel && G[sel]) G[sel].classList.remove('fh-sel');
    sel = g;
    if (g && G[g]) G[g].classList.add('fh-sel');
    paintTools();
  }
  function paintTools() {
    var n = document.getElementById('fh-ename');
    var p = document.getElementById('fh-epct');
    var bar = document.getElementById('fh-etools');
    if (!n || !p || !bar) return;
    if (!sel) {
      n.textContent = t('tapCtl');
      p.textContent = '\u2013';
      bar.classList.add('fh-dis');
    } else {
      n.textContent = t('n_' + sel);
      p.textContent = Math.round(curScale(sel) * 100) + '%';
      bar.classList.remove('fh-dis');
    }
  }
  function stepSize(d) {
    if (!sel) return;
    setScale(sel, Math.round((curScale(sel) + d) * 100) / 100);
    saveSize(sel);
    paintTools();
  }
  // La barra de edición se va abajo si un control arrastrado la tapa (y vuelve).
  function avoidBar(r) {
    var box = document.getElementById('fh-edit');
    if (!box) return;
    var b = box.getBoundingClientRect();
    var hit = !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom);
    if (hit) box.classList.toggle('fh-low');
  }
  function buzz() {                      // vibración corta (Fase 8, puente nativo)
    if (!hapOn) return;
    try { if (window.FHBridge && FHBridge.haptic) FHBridge.haptic(); } catch (e) {}
  }
  function applyOpacity() {              // en edición siempre opaco para ver bien
    var r = document.getElementById('fh-touch');
    if (r) r.style.opacity = edit ? '1' : String(opac / 100);
  }

  // --------- edición: arrastre1 dedo + pellizco2 dedos (Fase 7) ---------
  // editDown/editMove/editUp envuelven el dragStart/dragMove/dragEnd
  // existentes:1 dedo = mover (como siempre); al plantar un SEGUNDO dedo en
  // el MISMO grupo se cancela el arrastre y empieza el pellizco (escala =
  // distancia actual / distancia inicial · escala inicial). Al levantar
  // cualquier dedo del pellizco se guarda la escala final. El dedo que
  // quede abajo NO retoma el arrastre (evita saltos): hay que levantar y
  // volver a tocar.
  function editDown(e, g, capEl) {
    if (drag && drag.g !== g) return;     // otro grupo ya se está arrastrando
    var ep = epts[g];
    if (!ep) ep = epts[g] = { ids: {} };
    ep.ids[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ep.ids);
    if (ids.length === 1) {
      selectGrp(g);                       // Fase 8: tocar = seleccionar para − / +
      dragStart(e, g, capEl);             // arrastre clásico
    } else if (ids.length === 2) {
      if (drag && drag.g === g) drag = null;  // cancelar mover al empezar pellizco
      var a = ep.ids[ids[0]], b = ep.ids[ids[1]];
      pin = { g: g,
              d0: Math.max(24, Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2))),
              s0: curScale(g) };
      showPinLbl(g);
      log('edit: pellizco en ' + g);
    }
  }
  function editMove(e, g) {
    var ep = epts[g];
    if (!ep || !ep.ids[e.pointerId]) return;
    ep.ids[e.pointerId].x = e.clientX;
    ep.ids[e.pointerId].y = e.clientY;
    if (!pin || pin.g !== g) return;
    var ids = Object.keys(ep.ids);
    if (ids.length < 2) return;
    var a = ep.ids[ids[0]], b = ep.ids[ids[1]];
    var d = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    setScale(g, pin.s0 * (d / pin.d0));
    showPinLbl(g);
    paintTools();
  }
  function editUp(e, g, capEl) {
    var ep = epts[g];
    if (ep) {
      delete ep.ids[e.pointerId];
      if (Object.keys(ep.ids).length === 0) delete epts[g];
    }
    if (pin && pin.g === g && (!ep || Object.keys(ep.ids).length < 2)) {
      saveSize(g);
      hidePinLbl();
      paintTools();
      pin = null;
      log('edit: tamaño ' + g + ' = ' + Math.round(curScale(g) * 100) + '%');
    }
    if (drag && drag.g === g && drag.c === capEl && e.pointerId === drag.id) {
      dragEnd(e, capEl);                  // guardado de posición existente
    }
  }
  function applyDpadMode() {             // Flechas ↔ Joystick (Fase 7)
    if (!arrowsEl || !joyEl) return;
    joyReleaseAll();                     // nunca flechas pegadas al cambiar de modo
    arrowsEl.style.display = (dpadMode === 'joy') ? 'none' : '';
    joyEl.style.display = (dpadMode === 'joy') ? '' : 'none';
  }

  // ---------------- joystick (Fase 7) ----------------
  // Emula un stick analógico con las MISMAS flechas del teclado:8 sectores
  // de45° (diagonal =2 teclas a la vez, MV soporta8-direcciones nativo),
  // zona muerta22% del radio, soltar por debajo del15% (histéresis) y
  // cambio de sector solo con12° de holgura para no parpadear en los bordes.
  var DIRS = [37, 38, 39, 40];                     // ← ↑ → ↓
  var SECTORS = [[39], [39, 38], [38], [37, 38],   // E NE N NW
                 [37], [37, 40], [40], [39, 40]];  // W  SW S  SE
  function releaseAllDirs() { DIRS.forEach(release); }
  function joyReleaseAll() {
    joySt.sec = -1;
    releaseAllDirs();
    if (knobEl) knobEl.style.transform = 'translate(-50%,-50%)';
  }
  function angDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }
  function joyApply(sec) {
    if (sec === joySt.sec) return;
    joySt.sec = sec;
    if (sec >= 0) buzz();
    var want = {};
    if (sec >= 0) SECTORS[sec].forEach(function (c) { want[c] = 1; });
    DIRS.forEach(function (c) { if (want[c]) press(c); else release(c); });
  }
  function joyMove(e) {
    if (joySt.id !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    var dx = e.clientX - joySt.cx, dy = e.clientY - joySt.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var maxOff = joySt.r * 0.62;                  // knob clamped dentro de la base
    var k = dist > maxOff ? maxOff / dist : 1;
    if (knobEl) knobEl.style.transform =
      'translate(-50%,-50%) translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
    var dead = joySt.r * 0.22, rel = joySt.r * 0.15;
    if (joySt.sec < 0) {
      if (dist < dead) return;                    // aún en zona muerta
    } else if (dist < rel) {
      joyApply(-1);                               // soltar
      return;
    }
    var ang = Math.atan2(-dy, dx) * 180 / Math.PI; // arriba = +90°
    var cand = ((Math.round(ang / 45) % 8) + 8) % 8;
    if (joySt.sec >= 0 && angDiff(ang, joySt.sec * 45) < 22.5 + 12) return; // histéresis
    joyApply(cand);
  }
  function joyEnd(e) {
    if (joySt.id !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    joySt.id = null;
    joyReleaseAll();
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
      if (edit) {                       // en modo edición: mover/pellizcar, no pulsar
        editDown(e, group, b);
        return;
      }
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add('fh-down');
      buzz();
      press(code);
    };
    var up = function (e) {
      e.preventDefault();
      e.stopPropagation();
      editUp(e, group, b);              // no-op fuera del modo edición
      b.classList.remove('fh-down');
      release(code);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('pointermove', function (e) { dragMove(e, b); editMove(e, group); });
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
    paintSeg(segById('fh-shsw'), shOn ? 'on' : 'off');      // Fase 7
    paintSeg(segById('fh-dpsw'), dpadMode);                 // Fase 7
    paintSeg(segById('fh-opsw'), String(opac));             // Fase 8
    paintSeg(segById('fh-hpsw'), hapOn ? 'on' : 'off');     // Fase 8
    paintSeg(segById('fh-lgsw'), lang);                     // Fase 9
  }
  function startEdit() {
    edit = true;
    document.getElementById('fh-touch').classList.add('fh-editing');
    document.getElementById('fh-edit').classList.add('fh-on');
    document.getElementById('fh-edit').classList.remove('fh-low');
    selectGrp(null);
    applyOpacity();
    log('edit: modo reposición ON');
  }
  function stopEdit() {
    edit = false;
    drag = null;
    epts = {};                          // dedos del modo edición (Fase 7)
    pin = null;
    hidePinLbl();
    selectGrp(null);
    document.getElementById('fh-touch').classList.remove('fh-editing');
    document.getElementById('fh-edit').classList.remove('fh-on');
    applyOpacity();
    log('edit: modo reposición OFF');
  }

  function bindSeg(id, cb) {
    var el = segById(id);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var tg = e.target && e.target.getAttribute ? e.target : null;
      var v = tg ? tg.getAttribute('data-v') : null;
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

  function bindRepeat(id, fn) {          // pulsar = 1 paso; mantener = repetir
    var el = segById(id), t1 = null, t2 = null;
    function stop() { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; }
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      stop();
      fn();
      t1 = setTimeout(function () { t2 = setInterval(fn, 110); }, 380);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      el.addEventListener(ev, stop);
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
      /* indicador de FPS junto al ⚙ (escala con --fh-sz como los botones) */
      '#fh-fcnt{pointer-events:none;position:absolute;display:none;align-items:center;' +
      'justify-content:center;min-width:calc(min(9vmin,52px)*var(--fh-sz,1));' +
      'height:calc(min(9vmin,52px)*var(--fh-sz,1));padding:0 10px;' +
      'border-radius:999px;background:rgba(18,18,26,.55);' +
      'border:1px solid rgba(255,220,120,.55);color:rgba(255,220,120,.95);' +
      'font-size:calc(min(4vmin,20px)*var(--fh-sz,1));font-weight:bold;}' +
      /* panel de ajustes (scrolleable: con las filas de la Fase 7 ya no cabe en452px) */
      '#fh-menu{position:fixed;inset:0;z-index:100000;display:none;flex-direction:column;' +
      'align-items:center;justify-content:center;background:rgba(5,5,9,.82);' +
      'pointer-events:auto;font-family:Georgia,"Times New Roman",serif;' +
      'user-select:none;-webkit-user-select:none;}' +
      '#fh-menu.fh-on{display:flex;}' +
      '.fh-panel{width:min(92vw,900px);max-height:94%;overflow-y:auto;' +
      'overscroll-behavior:contain;touch-action:pan-y;background:#14121a;' +
      'border:2px solid #7a6f5a;' +
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
      /* Fase 8: filas en 2 columnas (apaisado) y botones en fila */
      '.fh-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:clamp(16px,5vmin,48px);}' +
      '@media (max-aspect-ratio:1/1){.fh-grid{grid-template-columns:1fr;}}' +
      '.fh-grid .fh-row{margin:clamp(4px,1.4vmin,14px) 0;}' +
      '.fh-btnrow{display:flex;gap:clamp(8px,2vmin,18px);margin-top:clamp(8px,2.4vmin,22px);}' +
      '.fh-btnrow .fh-btn{flex:1;}' +
      '.fh-hint{margin-top:clamp(8px,2.4vmin,24px);font-size:clamp(11px,2.6vmin,22px);' +
      'color:#8a8272;text-align:center;line-height:1.5;}' +
      /* modo edición */
      '#fh-edit{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100001;' +
      'display:none;flex-direction:column;gap:8px;align-items:center;pointer-events:auto;' +
      'touch-action:none;font-family:Arial,sans-serif;}' +
      '#fh-edit.fh-on{display:flex;}' +
      '#fh-edit.fh-low{top:auto;bottom:10px;}' +
      '.fh-etools{display:flex;align-items:center;gap:clamp(6px,1.6vmin,14px);' +
      'background:rgba(14,12,18,.94);border:1px solid #7a6f5a;border-radius:4px;' +
      'padding:clamp(4px,1.2vmin,10px) clamp(8px,2vmin,16px);color:#e8d9b0;' +
      'font-size:clamp(12px,3.2vmin,26px);white-space:nowrap;}' +
      '.fh-etools .fh-btn{padding:clamp(6px,1.8vmin,16px) clamp(10px,3vmin,26px);' +
      'min-width:clamp(34px,9vmin,64px);font-size:clamp(14px,3.6vmin,30px);}' +
      '#fh-ename{min-width:clamp(84px,22vmin,180px);text-align:center;}' +
      '#fh-epct{min-width:clamp(42px,11vmin,84px);text-align:center;color:#ffe9b0;font-weight:bold;}' +
      '.fh-dis .fh-sq{opacity:.3;pointer-events:none;}' +
      '#fh-done{background:#3a4a2a;border-color:#8aa070;color:#eaf5d8;}' +
      '.fh-banner{background:rgba(14,12,18,.92);border:1px solid #7a6f5a;color:#e8d9b0;' +
      'padding:clamp(6px,1.6vmin,14px) clamp(10px,2.4vmin,24px);border-radius:4px;' +
      'font-size:clamp(12px,3vmin,26px);text-align:center;}' +
      '.fh-editing .fh-tbtn,.fh-editing #fh-dpad{' +
      'outline:2px dashed rgba(255,230,160,.8);outline-offset:2px;}' +
      '#fh-touch.fh-editing .fh-sel{outline:3px solid #ffd27a;outline-offset:3px;' +
      'box-shadow:0 0 16px rgba(255,210,122,.65);}';
    document.head.appendChild(css);

    var root = document.createElement('div');
    root.id = 'fh-touch';
    document.body.appendChild(root);

    var S = 'min(11vmin,64px)';            // tamaño botón D-pad
    var O = 'min(2.5vmin,15px)';           // margen exterior (NO escala)
    var SM = 'min(9vmin,52px)';            // botones medianos (antorcha, Shift, ≡, ⚙)
    var AB = 'min(13vmin,76px)';           // botón A
    var BGP = 'min(25vmin,146px)';         // anclaje de la fila B/antorcha/Shift
    var Z = '*var(--fh-sz,1)';             // multiplicador del tamaño global (Fase 7)
    var dp = function (extra) {
      return 'width:calc(' + S + Z + ');height:calc(' + S + Z + ');' +
             'font-size:calc(min(5vmin,28px)' + Z + ');' + extra;
    };

    // D-pad como contenedor: se arrastra como UNA sola pieza. Dentro viven
    // #fh-arrows (las4 flechas) o #fh-joy (stick, Fase 7): se alterna display
    // según st.dpad compartiendo posición, tamaño y modo edición.
    G.dpad = document.createElement('div');
    G.dpad.id = 'fh-dpad';
    G.dpad.setAttribute('style', 'position:absolute;left:' + O + ';bottom:' + O + ';' +
      'width:calc(3*' + S + Z + ');height:calc(3*' + S + Z + ');pointer-events:none;');
    root.appendChild(G.dpad);

    arrowsEl = document.createElement('div');
    arrowsEl.id = 'fh-arrows';
    arrowsEl.setAttribute('style', 'position:absolute;left:0;bottom:0;width:100%;' +
      'height:100%;pointer-events:none;');
    G.dpad.appendChild(arrowsEl);
    mkBtn(arrowsEl, 'fh-up', '▲', 38,
      'left:calc(' + S + Z + ');bottom:calc(2*' + S + Z + ');' + dp(''), 'dpad');
    mkBtn(arrowsEl, 'fh-dn', '▼', 40,
      'left:calc(' + S + Z + ');bottom:0;' + dp(''), 'dpad');
    mkBtn(arrowsEl, 'fh-lf', '◀', 37,
      'left:0;bottom:calc(' + S + Z + ');' + dp(''), 'dpad');
    mkBtn(arrowsEl, 'fh-rt', '▶', 39,
      'left:calc(2*' + S + Z + ');bottom:calc(' + S + Z + ');' + dp(''), 'dpad');

    // Joystick (Fase 7): misma caja que el D-pad, knob interior que sigue al
    // dedo. Las flechas salen por el MISMO canal sintético que las flechas
    // físicas, así que el juego no distingue el origen.
    joyEl = document.createElement('div');
    joyEl.id = 'fh-joy';
    joyEl.setAttribute('style', 'position:absolute;left:0;bottom:0;width:100%;height:100%;' +
      'border-radius:50%;background:rgba(18,18,26,.40);border:2px solid rgba(255,255,255,.35);' +
      'pointer-events:auto;touch-action:none;display:none;' +
      '-webkit-tap-highlight-color:transparent;');
    knobEl = document.createElement('div');
    knobEl.id = 'fh-knob';
    knobEl.setAttribute('style', 'position:absolute;left:50%;top:50%;width:40%;height:40%;' +
      'border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;' +
      'transform:translate(-50%,-50%);');
    joyEl.appendChild(knobEl);
    G.dpad.appendChild(joyEl);
    joyEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (edit) { editDown(e, 'dpad', joyEl); return; }    // modo edición: mover/pellizcar
      if (joySt.id !== null) return;                       // un solo dedo en el stick
      try { joyEl.setPointerCapture(e.pointerId); } catch (err) {}
      var r = joyEl.getBoundingClientRect();
      joySt.id = e.pointerId;
      joySt.cx = r.left + r.width / 2;
      joySt.cy = r.top + r.height / 2;
      joySt.r = r.width / 2;
      joyMove(e);                     // toque inicial fuera del centro = caminar ya
    });
    joyEl.addEventListener('pointermove', function (e) { dragMove(e, joyEl); editMove(e, 'dpad'); });
    joyEl.addEventListener('pointermove', joyMove);
    joyEl.addEventListener('pointerup', function (e) { editUp(e, 'dpad', joyEl); });
    joyEl.addEventListener('pointerup', joyEnd);
    joyEl.addEventListener('pointercancel', function (e) { editUp(e, 'dpad', joyEl); });
    joyEl.addEventListener('pointercancel', joyEnd);
    joyEl.addEventListener('lostpointercapture', function (e) { editUp(e, 'dpad', joyEl); });
    joyEl.addEventListener('lostpointercapture', joyEnd);

    // Botones: A (ok), B (escape), MENÚ (Esc) abajo-derecha. Anclajes de la
    // fila escalan con --fh-sz para no solaparse a tamaños grandes.
    G.a = mkBtn(root, 'fh-a', 'A', 90,
      'right:' + O + ';bottom:' + O + ';width:calc(' + AB + Z + ');height:calc(' + AB + Z +
      ');font-size:calc(min(6vmin,34px)' + Z + ');', 'a');
    G.b = mkBtn(root, 'fh-b', 'B', 88,
      'right:calc(' + O + ' + ' + BGP + Z + ');bottom:calc(' + O + ' + min(3vmin,18px))' +
      ';width:calc(' + AB + ' * .85' + Z + ');height:calc(' + AB + ' * .85' + Z + ');' +
      'font-size:calc(min(5vmin,28px)' + Z + ');', 'b');
    G.mn = mkBtn(root, 'fh-mn', '≡', 27,
      'right:calc(' + O + ' + min(3vmin,18px));bottom:calc(' + O + ' + min(15vmin,88px)' + Z + ')' +
      ';width:calc(' + SM + Z + ');height:calc(' + SM + Z + ');' +
      'font-size:calc(min(5vmin,26px)' + Z + ');', 'mn');

    // Botón ANTORCHA (Fase 6): keyCode 84 = T → YEP_ButtonCommonEvents → CE 289.
    // Por defecto a la izquierda de la B, en su misma fila (alcance del pulgar
    // derecho sin tapar la A). Icono: llama SVG monocroma (hereda color del botón).
    G.tc = mkBtn(root, 'fh-tc',
      '<svg viewBox="0 0 24 24" width="56%" height="56%">' +
      '<path fill="currentColor" d="M12 2s6 5.5 6 10a6 6 0 0 1-12 0c0-2.5 1.2-4.6 2.6-6.3' +
      '.3 1.4 1 2.3 1.9 2.8-.6-2.5-.2-4.8 1.5-6.5z"/></svg>',
      84,
      'right:calc(' + O + ' + ' + BGP + Z + ' + ' + SM + Z + ' + 8px);' +
      'bottom:calc(' + O + ' + min(3vmin,18px));' +
      'width:calc(' + SM + Z + ');height:calc(' + SM + Z + ');', 'tc', true);

    // Botón SHIFT (Fase 7): keyCode16 = Shift → keyMapper[16]='shift' del MV.
    // Mantener pulsado = modificador de acciones del juego (puñalada por la
    // espalda, arco…; NO correr: el dash está forzado). Icono: flecha+barra (glifo de mayúsculas), SVG monocromo.
    // Por defecto a la izquierda de la antorcha, en su misma fila.
    G.sh = mkBtn(root, 'fh-sh',
      '<svg viewBox="0 0 24 24" width="54%" height="54%">' +
      '<path fill="currentColor" d="M12 3l7.5 7.5H15V16H9v-5.5H4.5L12 3z' +
      'M5 18.5h14V21.5H5z"/></svg>',
      16,
      'right:calc(' + O + ' + ' + BGP + Z + ' + ' + SM + Z + ' + 8px + ' + SM + Z + ' + 8px);' +
      'bottom:calc(' + O + ' + min(3vmin,18px));' +
      'width:calc(' + SM + Z + ');height:calc(' + SM + Z + ');', 'sh', true);

    // Botón ⚙ (ajustes) arriba-derecha — antes era el interruptor 30/60
    var set = document.createElement('div');
    set.id = 'fh-set';
    set.className = 'fh-tbtn';
    set.textContent = '\u2699';
    set.setAttribute('style', 'right:' + O + ';top:' + O +
      ';width:calc(' + SM + Z + ');height:calc(' + SM + Z + ');' +
      'font-size:calc(min(5vmin,26px)' + Z + ');');
    set.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (edit) { editDown(e, 'set', set); return; }
      openMenu();
    });
    set.addEventListener('pointermove', function (e) { dragMove(e, set); editMove(e, 'set'); });
    set.addEventListener('pointerup', function (e) { editUp(e, 'set', set); });
    set.addEventListener('pointercancel', function (e) { editUp(e, 'set', set); });
    set.addEventListener('lostpointercapture', function (e) { editUp(e, 'set', set); });
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
      cnt.style.setProperty('--fh-sz', String(curScale('set')));  // sigue el tamaño del ⚙
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
    var YN = '<div data-v="on" data-t="yes"></div><div data-v="off" data-t="no"></div>';
    var row = function (key, segId, inner) {
      return '<div class="fh-row"><span data-t="' + key + '"></span>' +
             '<div class="fh-seg" id="' + segId + '">' + inner + '</div></div>';
    };
    var langSeg = Object.keys(I18N).map(function (k) {
      return '<div data-v="' + k + '">' + I18N[k]._name + '</div>';   // nombre nativo, no se traduce
    }).join('');
    menu.innerHTML =
      '<div class="fh-panel">' +
      '<div class="fh-title" data-t="settings"></div>' +
      '<div class="fh-grid">' +
      row('fpsCap', 'fh-cap', '<div data-v="30">30</div><div data-v="60">60</div>') +
      row('fpsCnt', 'fh-cnt', YN) +
      row('torch', 'fh-tcsw', YN) +
      row('shift', 'fh-shsw', YN) +
      row('dir', 'fh-dpsw', '<div data-v="flechas" data-t="arrows"></div>' +
                            '<div data-v="joy" data-t="joy"></div>') +
      row('opacity', 'fh-opsw', '<div data-v="40">40</div><div data-v="60">60</div>' +
                                '<div data-v="80">80</div><div data-v="100">100%</div>') +
      row('haptic', 'fh-hpsw', YN) +
      row('lang', 'fh-lgsw', langSeg) +
      '</div>' +
      '<div class="fh-btnrow">' +
      '<div class="fh-btn" id="fh-repos" data-t="repos"></div>' +
      '<div class="fh-btn" id="fh-reset" data-t="reset"></div>' +
      '<div class="fh-btn" id="fh-close" data-t="close"></div>' +
      '</div>' +
      '<div class="fh-hint"><span data-t="hint1"></span><br><span data-t="hint2"></span></div>' +
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
    bindSeg('fh-shsw', function (v) {          // Fase 7: visibilidad del Shift
      shOn = (v === 'on');
      st.shift = shOn;
      saveSet(st);
      applyShVis();
      log('menu: botón shift = ' + v);
    });
    bindSeg('fh-dpsw', function (v) {          // Fase 7: Flechas ↔ Joystick
      dpadMode = (v === 'joy') ? 'joy' : 'flechas';
      st.dpad = dpadMode;
      saveSet(st);
      applyDpadMode();
      log('menu: control de dirección = ' + v);
    });
    bindSeg('fh-opsw', function (v) {          // Fase 8: opacidad
      opac = Number(v);
      st.op = opac;
      saveSet(st);
      applyOpacity();
      log('menu: opacidad = ' + v);
    });
    bindSeg('fh-hpsw', function (v) {          // Fase 8: vibración
      hapOn = (v === 'on');
      st.haptic = hapOn;
      saveSet(st);
      buzz();
      log('menu: vibración = ' + v);
    });
    bindSeg('fh-lgsw', function (v) {          // Fase 9: idioma de la UI del port
      if (!I18N[v]) return;
      lang = v;
      st.lang = v;
      saveSet(st);
      try { if (window.FHBridge && FHBridge.setLang) FHBridge.setLang(v); } catch (e) {}
      applyLang();
      log('menu: idioma = ' + v);
    });
    bindCmd('fh-repos', function () { closeMenu(); startEdit(); });
    bindCmd('fh-reset', function () { resetPos(); paintMenu(); });
    bindCmd('fh-close', function () { closeMenu(); });

    // Banner del modo edición
    var editBox = document.createElement('div');
    editBox.id = 'fh-edit';
    editBox.innerHTML =
      '<div class="fh-etools fh-dis" id="fh-etools">' +
      '<span id="fh-ename"></span>' +
      '<div class="fh-btn fh-sq" id="fh-szm">\u2212</div>' +
      '<span id="fh-epct">\u2013</span>' +
      '<div class="fh-btn fh-sq" id="fh-szp">+</div>' +
      '<div class="fh-btn fh-sq" id="fh-sz1">\u21ba</div>' +
      '<div class="fh-btn" id="fh-done" data-t="done"></div>' +
      '</div>';
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
    bindRepeat('fh-szm', function () { stepSize(-0.05); });
    bindRepeat('fh-szp', function () { stepSize(0.05); });
    bindCmd('fh-sz1', function () { if (sel) { setScale(sel, 1); saveSize(sel); paintTools(); } });

    // Etiqueta en vivo del % durante el pellizco (Fase 7)
    pinLbl = document.createElement('div');
    pinLbl.id = 'fh-pinlbl';
    pinLbl.setAttribute('style', 'position:fixed;display:none;z-index:100002;' +
      'pointer-events:none;transform:translate(-50%,-100%);' +
      'background:rgba(14,12,18,.92);border:1px solid #7a6f5a;color:#ffe9b0;' +
      'padding:2px 8px;border-radius:4px;font:bold 13px Arial;');
    document.body.appendChild(pinLbl);

    // Guardar estilos por defecto (para restablecer sin perder los anclajes)
    GRP.forEach(function (g) {
      if (G[g]) DEF[g] = G[g].getAttribute('style');
    });

    // Tamaños por control activos ANTES de medir/anclar (Fase 7)
    applySizes(st.sizes);
    // Posiciones guardadas (Fase 5) → aplicar con el tamaño ya correcto
    applyAllPos();
    applyTorchVis();                     // tras DEF y applyPos (si el usuario lo ocultó)
    applyShVis();
    applyDpadMode();                     // Flechas o Joystick según st.dpad
    applyOpacity();                      // Fase 8
    applyLang();                         // Fase 9: textos según idioma
    paintMenu();

    log('touch: controles activos (D-pad/Joystick + A/B/Menú/Antorcha/Shift + Ajustes ⚙)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
