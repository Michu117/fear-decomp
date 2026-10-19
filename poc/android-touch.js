/*
 * android-touch.js — controles táctiles para Fear & Hunger (MV) en Android.
 * Se inyecta en index.html tras android-compat.js.
 *
 * Crea una superposición con:
 *   - D-pad (4 direcciones) abajo-izquierda
 *   - A (Z = ok/confirmar), B (X = escape/cancelar), MENÚ (Esc) abajo-derecha
 *   - Interruptor 30/60 FPS arriba-derecha (usa window.__FH_fpsCap del shim)
 *
 * Los botones generan KeyboardEvents sintéticos con los MISMOS keycodes que un
 * teclado físico, así que el mapeo del juego funciona idéntico. Los eventos
 * táctiles de la superposición se cortan (stopPropagation) para que TouchInput
 * del juego no los interprete como clics en el mapa.
 */
(function () {
  'use strict';
  if (window.__FH_TOUCH_LOADED) return;
  window.__FH_TOUCH_LOADED = true;

  // Solo en dispositivos táctiles
  try {
    if (!navigator.maxTouchPoints && !('ontouchstart' in window)) return;
  } catch (e) { return; }

  function log(m) {
    try { if (window.FHBridge) FHBridge.log(m); } catch (e) {}
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

  function mkBtn(parent, id, label, code, css) {
    var b = document.createElement('div');
    b.id = id;
    b.className = 'fh-tbtn';
    b.textContent = label;
    b.setAttribute('style', css);
    var down = function (e) {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      b.classList.add('fh-down');
      press(code);
    };
    var up = function (e) {
      e.preventDefault(); e.stopPropagation();
      b.classList.remove('fh-down');
      release(code);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    parent.appendChild(b);
    return b;
  }

  function build() {
    if (!document.body || window.__FH_TOUCH_BUILT) return;
    window.__FH_TOUCH_BUILT = true;

    var css = document.createElement('style');
    css.textContent =
      '#fh-touch{position:fixed;inset:0;z-index:99999;pointer-events:none;' +
      'font-family:Arial,Helvetica,sans-serif;user-select:none;' +
      '-webkit-user-select:none;}' +
      '.fh-tbtn{pointer-events:auto;position:absolute;display:flex;' +
      'align-items:center;justify-content:center;border-radius:50%;' +
      'background:rgba(18,18,26,.40);border:2px solid rgba(255,255,255,.35);' +
      'color:rgba(255,255,255,.85);font-weight:bold;touch-action:none;' +
      '-webkit-tap-highlight-color:transparent;}' +
      '.fh-down{background:rgba(255,255,255,.32);' +
      'border-color:rgba(255,255,255,.7);}' +
      '#fh-fps{border-radius:25%;font-size:min(3.6vmin,20px);' +
      'color:rgba(255,220,120,.95);}';
    document.head.appendChild(css);

    var root = document.createElement('div');
    root.id = 'fh-touch';
    document.body.appendChild(root);

    var S = 'min(11vmin,64px)';            // tamaño botón D-pad
    var O = 'min(2.5vmin,15px)';           // margen exterior
    var dp = function (extra) {
      return 'width:' + S + ';height:' + S + ';font-size:min(5vmin,28px);' + extra;
    };
    // D-pad: cruz abajo-izquierda
    mkBtn(root, 'fh-up', '▲', 38,
      'left:calc(' + O + ' + min(11vmin,64px));bottom:calc(' + O + ' + 2*min(11vmin,64px));' + dp(''));
    mkBtn(root, 'fh-dn', '▼', 40,
      'left:calc(' + O + ' + min(11vmin,64px));bottom:' + O + ';' + dp(''));
    mkBtn(root, 'fh-lf', '◀', 37,
      'left:' + O + ';bottom:calc(' + O + ' + min(11vmin,64px));' + dp(''));
    mkBtn(root, 'fh-rt', '▶', 39,
      'left:calc(' + O + ' + 2*min(11vmin,64px));bottom:calc(' + O + ' + min(11vmin,64px));' + dp(''));

    // Botones: A (ok), B (escape), MENÚ (Esc) abajo-derecha
    var AB = 'min(13vmin,76px)';
    mkBtn(root, 'fh-a', 'A', 90,
      'right:' + O + ';bottom:' + O + ';width:' + AB + ';height:' + AB +
      ';font-size:min(6vmin,34px);');
    mkBtn(root, 'fh-b', 'B', 88,
      'right:calc(' + O + ' + min(25vmin,146px));bottom:calc(' + O + ' + min(3vmin,18px))' +
      ';width:calc(' + AB + ' * .85);height:calc(' + AB + ' * .85);' +
      'font-size:min(5vmin,28px);');
    mkBtn(root, 'fh-mn', '≡', 27,
      'right:calc(' + O + ' + min(3vmin,18px));bottom:calc(' + O + ' + min(15vmin,88px))' +
      ';width:min(9vmin,52px);height:min(9vmin,52px);font-size:min(5vmin,26px);');

    // Interruptor 30/60 FPS arriba-derecha
    var fps = document.createElement('div');
    fps.id = 'fh-fps';
    fps.className = 'fh-tbtn';
    fps.textContent = String(window.__FH_fpsCap || 30);
    fps.setAttribute('style',
      'right:' + O + ';top:' + O + ';width:min(9vmin,52px);height:min(9vmin,52px);');
    fps.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var cur = (window.__FH_fpsCap === 60) ? 30 : 60;
      window.__FH_fpsCap = cur;
      fps.textContent = String(cur);
      log('touch: FPS cap = ' + cur);
    });
    root.appendChild(fps);

    log('touch: controles táctiles activos (D-pad + A/B/Menú + FPS toggle)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
