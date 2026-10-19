/*
 * android-compat.js v2 — Fear & Hunger (RPG Maker MV 1.6.0 custom) en WebView Android.
 * Se inyecta en index.html DESPUÉS de main.js.
 *
 * 1) AUDIO EXT: AudioManager.audioFileExt() elige '.m4a' por UA móvil, pero el
 *    juego solo trae sonido OGG cifrado (.rpgmvo). El WebView Chromium SÍ
 *    decodifica Vorbis (verificado), así que forzamos '.ogg';
 *    Decrypter.extToEncryptExt lo mapea a .rpgmvo automáticamente.
 *
 * 2) ERRORES DE AUDIO NO FATALES: MV lanza excepción ante cualquier buffer roto
 *    ("Failed to load: ...") y la pantalla de error mata el juego. En móvil es
 *    preferible silenciar el sonido problemático y seguir jugando: convertimos
 *    el throw en log.
 *
 * 3) AudioContext: en dispositivos reales el contexto puede arrancar
 *    'suspended' hasta el primer gesto. Reanudamos en el primer touch/click.
 *
 * 4) Diagnóstico: los rechazos de decodeAudioData sin handler (MV no pasa
 *    callback de error) se loguean para no perderlos.
 */
(function () {
  'use strict';

  function log(msg) {
    try { if (window.FHBridge) FHBridge.log(msg); } catch (e) {}
  }

  /* 1) extensión .ogg */
  try {
    if (typeof AudioManager !== 'undefined' && AudioManager.audioFileExt) {
      AudioManager.audioFileExt = function () { return '.ogg'; };
      log('compat: audioFileExt forzado a .ogg');
    }
  } catch (e) { log('compat ext err: ' + e); }

  /* 1b) filtros a media resolución: niebla, iluminación y tono son filtros
   *     a pantalla completa; a la mitad de resolución la carga de relleno se
   *     reduce ~4x con diferencia visual mínima (son efectos difusos). */
  try {
    if (window.PIXI && PIXI.settings) {
      PIXI.settings.FILTER_RESOLUTION = 0.5;
      log('compat: FILTER_RESOLUTION=0.5 (filtros a media res)');
    }
  } catch (e) { log('compat filtro err: ' + e); }

  /* 2) checkWebAudioError no fatal */
  try {
    if (typeof AudioManager !== 'undefined' && AudioManager.checkWebAudioError) {
      AudioManager.checkWebAudioError = function (webAudio) {
        if (webAudio && webAudio.isError && webAudio.isError()) {
          log('compat: audio roto ignorado (juego continúa): ' + webAudio.url);
        }
      };
      log('compat: checkWebAudioError ahora no fatal');
    }
  } catch (e) { log('compat soften err: ' + e); }

  /* 3) reanudar AudioContext en el primer gesto */
  try {
    var resumeHandler = function () {
      try {
        var candidates = [];
        if (window.WebAudio && WebAudio._context) candidates.push(WebAudio._context);
        candidates.forEach(function (c) {
          if (c && c.state === 'suspended' && c.resume) {
            c.resume().then(function () { log('compat: AudioContext reanudado'); }).catch(function () {});
          }
        });
      } catch (e) {}
    };
    ['touchend', 'mousedown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, resumeHandler, { passive: true });
    });
    log('compat: reanudación de AudioContext armada');
  } catch (e) { log('compat resume err: ' + e); }

  /* 4) visibilidad de rechazos de decodeAudioData */
  try {
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      if (r && /decode|encoding/i.test(String(r))) {
        log('compat: decodeAudioData rechazado: ' + r);
      }
    });
  } catch (e) {}
})();
