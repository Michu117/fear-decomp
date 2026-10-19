/* debug-hook.js — PoC: captura la excepción ORIGINAL del boot de MV.
 * Se inyecta DESPUÉS de main.js, antes de que se dispare window.onload. */
(function () {
  'use strict';
  var origCatch = SceneManager.catchException;
  SceneManager.catchException = function (e) {
    console.error('[FH-POC-BOOT]', (e && e.stack) ? e.stack : String(e));
    try { return origCatch.call(this, e); } catch (e2) {
      console.error('[FH-POC-BOOT2] printError también falló:', e2 && e2.stack || String(e2));
    }
  };
  // Envuelve también el onload del runtime (Scene_Boot)
  var origOnload = window.onload;
  window.onload = function () {
    try {
      return origOnload.apply(this, arguments);
    } catch (e) {
      console.error('[FH-POC-ONLOAD]', (e && e.stack) ? e.stack : String(e));
      throw e;
    }
  };
  console.error('[FH-POC] debug-hook instalado');

  // --- Re-arme del bucle de update ----------------------------------------
  // MV mueve todo su engine desde requestAnimationFrame (SceneManager.update
  // se re-programa a sí mismo). En Chrome headless con --virtual-time-budget
  // los BeginFrames del compositor no se bombean de forma fiable: el bucle
  // avanza 1-2 ticks y se muere (el juego se queda en Scene_Boot / mapa sin
  // setup). Sustituimos rAF por setTimeout(16), que SÍ se bombea con virtual
  // time: el juego corre completo (y acelerado). En el APK Android real esto
  // NO hace falta: el WebView sí produce frames a 60 Hz.
  var __ticks = 0;
  var __origUpdate = SceneManager.update;
  SceneManager.update = function () {
    __ticks++;
    return __origUpdate.apply(this, arguments);
  };
  SceneManager.requestUpdate = function () {
    var self = this;
    setTimeout(function () { self.update(); }, 16);
  };

  // Telemetría de estado → document.title (la recoge --dump-dom)
  setInterval(function () {
    try {
      var st = {
        scene: (SceneManager._scene && SceneManager._scene.constructor) ? SceneManager._scene.constructor.name : null,
        renderer: Graphics._renderer ? (Graphics._renderer.constructor ? Graphics._renderer.constructor.name : 'si') : null,
        webglOK: !!(Graphics._renderer && Graphics._renderer instanceof PIXI.WebGLRenderer),
        canvasOK: !!(Graphics._canvas && Graphics._canvas.width),
        pixiApp: !!Graphics._app,
        dataSystem: !!$dataSystem,
        mapId: (typeof $gameMap !== 'undefined' && $gameMap) ? $gameMap.mapId() : -1,
        mapName: (typeof $dataMap !== 'undefined' && $dataMap && $dataMap.info) ? $dataMap.info.displayName : null,
        playerXY: (typeof $gamePlayer !== 'undefined' && $gamePlayer) ? [$gamePlayer._x, $gamePlayer._y] : null,
        lightmask: (SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._lightmask) ? 'present' : 'none',
        sceneCount: SceneManager._scenes ? SceneManager._scenes.length : 0,
        errors: (window.__pocErrors || []).length,
        // diagnóstico del cuelgue de transferencia
        dataMap: (typeof $dataMap !== 'undefined' && $dataMap) ? ($dataMap.width + 'x' + $dataMap.height) : 'null',
        transfer: SceneManager._scene ? !!SceneManager._scene._transfer : null,
        mapLoadedFlag: SceneManager._scene ? !!SceneManager._scene._mapLoaded : null,
        sceneStarted: !!SceneManager._sceneStarted,
        newMapId: (typeof $gamePlayer !== 'undefined' && $gamePlayer) ? $gamePlayer._newMapId : null,
        transferring: (typeof $gamePlayer !== 'undefined' && $gamePlayer) ? !!$gamePlayer._transferring : null,
        errUrl: DataManager._errorUrl || null,
        mapLoaderBusy: !!DataManager._mapLoader,
        ticks: __ticks,
        saveTest: window.__saveTest || 'n/a',
        importState: window.__importState
      };
      // Test '?nolight': oculta la lightmask de TerraxLighting (diagnóstico de
      // pantalla negra: la máscara multiplica todo a negro si falla su refresh)
      if (location.search.indexOf('nolight') >= 0 &&
          SceneManager._scene && SceneManager._scene._spriteset &&
          SceneManager._scene._spriteset._lightmask) {
        SceneManager._scene._spriteset._lightmask.visible = false;
      }
      document.title = 'FH-POC-STATE ' + JSON.stringify(st);
      console.error('[FH-POC-STATE]', JSON.stringify(st));    } catch (e) { document.title = 'FH-POC-STATE-ERR ' + String(e); }
  }, 1000);

  // --- Modo automático '?auto' ---------------------------------------------
  // Secuencia guiada del PoC (sin input real en headless):
  //   1) En Scene_Title → New Game.
  //   2) En Scene_Map → round-trip de save en localStorage (StorageManager
  //      modo navegador) y reporte en la telemetría como saveTest.
  window.__saveTest = 'pend';
  window.__importState = 'none';
  var __phase = 0;

  // --- Modo '?importsave' ---------------------------------------------------
  // Puente de migración BYOC: convierte los .rpgsave reales del jugador de la
  // copia PC (formato NW: LZString-base64 en fichero) al formato webStorage
  // (mismo string en localStorage). Claves: 'RPG FileN' / 'RPG Global' /
  // 'RPG Config'. Es exactamente lo que hará el extractor del APK Android.
  if (location.search.indexOf('importsave') >= 0) {
    window.__importState = 'run';
    Promise.all([
      fetch('save/file1.rpgsave').then(function (r) { return r.text(); }).then(function (t) {
        localStorage.setItem('RPG File1', t.trim());
      }),
      fetch('save/global.rpgsave').then(function (r) { return r.text(); }).then(function (t) {
        localStorage.setItem('RPG Global', t.trim());
      }),
      fetch('save/config.rpgsave').then(function (r) { return r.text(); }).then(function (t) {
        localStorage.setItem('RPG Config', t.trim());
      })
    ]).then(function () {
      window.__importState = 'ok';
      console.error('[FH-POC-IMPORT] saves PC importados a localStorage');
    }).catch(function (e) {
      window.__importState = 'ERR ' + String(e);
      console.error('[FH-POC-IMPORT-ERR]', String(e));
    });
  }

  setInterval(function () {
    if (location.search.indexOf('auto') < 0) return;
    try {
      var scene = SceneManager._scene;
      if (__phase === 0 && typeof Scene_Title !== 'undefined' && scene instanceof Scene_Title) {
        if (location.search.indexOf('importsave') >= 0) {
          if (window.__importState !== 'ok') return; // espera al import async
          var ok = DataManager.loadGame(1);
          console.error('[FH-POC-AUTO] loadGame(1) =', ok,
            'mapa:', ok && $gameMap ? $gameMap.mapId() : '?');
          if (ok) SceneManager.goto(Scene_Map);
          __phase = 1;
        } else if (scene.commandNewGame) {
          scene.commandNewGame();
        } else {
          DataManager.setupNewGame();
          SceneManager.goto(Scene_Map);
        }
        __phase = 1;
        console.error('[FH-POC-AUTO] New Game lanzado');
      } else if (__phase === 1 && typeof Scene_Map !== 'undefined' &&
                 scene instanceof Scene_Map && SceneManager._sceneStarted) {
        // Ya en el mapa: guardamos el $gameSystem completo y lo releemos.
        var json = JsonEx.stringify($gameSystem);
        StorageManager.save(1, json);
        var back = StorageManager.load(1);
        window.__saveTest = back ? ('ok(' + back.length + '/' + json.length + ' B)') : 'FAIL-null';
        console.error('[FH-POC-AUTO] save round-trip:', window.__saveTest);
        __phase = 2;
      }
    } catch (e) {
      window.__saveTest = 'ERR: ' + (e && e.message);
      console.error('[FH-POC-AUTO-ERR]', e && e.stack || String(e));
    }
  }, 500);
})();
