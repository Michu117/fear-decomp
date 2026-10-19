/*
 * shim-nw.js — Fear & Hunger (RPG Maker MV 1.6.0) fuera de NW.js.
 * Versión definitiva validada en el PoC PC (Chrome/WebGL).
 *
 * Reglas descubiertas al hacer el PoC:
 *  1. Archeia_Steamworks.js llama require("./js/libs/greenworks") en top-level
 *     SIN guard → window.require debe existir y devolver stubs (Proxy no-op).
 *  2. F&H modificó Utils.isNwjs() a `typeof require === 'function' &&
 *     typeof process === 'object'` → el shim NO debe definir window.process,
 *     o el runtime creería estar en NW.js e intentaría guardar vía fs
 *     (process.mainModule.filename → TypeError). Solo require basta:
 *     isNwjs() queda FALSE y los saves van a localStorage.
 */
(function () {
  'use strict';

  var noop = function () {};
  var stubFS = {
    readFileSync: function () { return ''; },
    writeFileSync: noop,
    appendFileSync: noop,
    existsSync: function () { return false; },
    mkdirSync: noop,
    readdirSync: function () { return []; },
    unlinkSync: noop,
    renameSync: noop,
    statSync: function () {
      return { isDirectory: function () { return false; }, isFile: function () { return true; }, size: 0 };
    }
  };
  var stubPath = {
    join: function () { return Array.prototype.join.call(arguments, '/'); },
    dirname: function (p) { return p; },
    basename: function (p) { return String(p).split('/').pop(); },
    sep: '/'
  };
  var stubGuiWindow = { focus: noop, show: noop, hide: noop, on: noop, once: noop, close: noop };
  var modules = {
    'fs': stubFS,
    'path': stubPath,
    'nw.gui': { Window: { get: function () { return stubGuiWindow; } } }
  };

  window.require = function (name) {
    if (modules[name]) return modules[name];
    try {
      return new Proxy({}, {
        get: function (t, k) {
          if (k === 'then' || k === 'prototype') return undefined;
          if (k === 'toString') return function () { return '[stub]'; };
          return noop;
        }
      });
    } catch (e) {
      return {};
    }
  };

  // Registro de errores para diagnóstico (logcat vía FHBridge en el APK).
  window.addEventListener('error', function (e) {
    var msg = '[FH-SHIM-ERR] ' + (e.message || 'error') + ' @ ' +
              (e.filename || '') + ':' + (e.lineno || '');
    try { if (window.FHBridge) FHBridge.log(msg); } catch (ignored) {}
  });
})();

/*
 * Tope de FPS (Fase 3 — rendimiento móvil).
 * MV/PIXI impulsan el juego con requestAnimationFrame al ritmo del panel
 * (60–120 Hz). Limitamos la frecuencia global a 30 FPS por defecto: reduce
 * a la mitad la carga de CPU/GPU y alarga la batería en móviles. El juego
 * mantiene su velocidad real porque PIXI avanza por tiempo transcurrido.
 * Ajustable en caliente con window.__FH_fpsCap (30 | 60) — el botón del
 * overlay táctil (android-touch.js) lo conmuta.
 */
(function () {
  'use strict';
  var cap = 30;
  try {
    Object.defineProperty(window, '__FH_fpsCap', {
      configurable: true,
      get: function () { return cap; },
      set: function (v) { cap = (Number(v) === 60) ? 60 : 30; }
    });
  } catch (e) {}
  var nativeRaf = window.requestAnimationFrame.bind(window);
  var pending = [];
  var last = 0;
  var scheduled = false;
  var fc = 0;   // frames despachados en la ventana actual
  var ft = 0;   // inicio de la ventana (ms)
  function pump(t) {
    if (t - last >= (1000 / cap) - 4) {
      scheduled = false;
      last = t;
      var cbs = pending;
      pending = [];
      for (var i = 0; i < cbs.length; i++) cbs[i](t);
      // Contador de FPS real (Fase 5): este bucle ES el que dibuja el juego,
      // así que lo que aquí se despacha son frames de verdad. Se expone en
      // window.__FH_fps para el indicador del overlay táctil.
      if (cbs.length) {
        fc++;
        if (!ft) ft = t;
        if (t - ft >= 1000) {
          window.__FH_fps = Math.round(fc * 1000 / (t - ft));
          fc = 0;
          ft = t;
        }
      }
    } else {
      nativeRaf(pump);
    }
  }
  window.requestAnimationFrame = function (cb) {
    pending.push(cb);
    if (!scheduled) {
      scheduled = true;
      nativeRaf(pump);
    }
    return pending.length;
  };
  /*
   * cancelAnimationFrame NEUTRALIZADO (por diseño):
   * el batcher multiplexa todos los consumidores en UN único callback nativo.
   * Librerías del juego (fpsmeter.js → D.b.pause) llaman cancelAnimationFrame(1)
   * al hacer pause, y con ids nativos que empiezan en 1 eso mataba el único
   * pump del bucle → pantalla negra permanente. Ningún código de MV depende
   * de que cancel realmente cancele; el peor caso es un tick de fpsmeter
   * huérfano (inofensivo, y de todos modos limitado a 30 fps por el cap).
   */
  window.cancelAnimationFrame = function () {};
})();
