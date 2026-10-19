# MODDING_PLAN — Fear & Hunger → Android (puerto "bring your own copy")

Recon: 2026-10-18 · Herramientas: um (game-recon) + REA 6.7.0 · Estado: **propuesta, pendiente de aprobación**

## 1. Identidad del objetivo

| Campo | Valor |
|---|---|
| Juego | Fear & Hunger (copia Steam del usuario, carpeta local) |
| Tamaño | 991 MB (www/ = 838 MB) |
| Motor | **RPG Maker MV 1.6.0** sobre **NW.js (node-webkit)** |
| Entrada | `package.json` → `www/index.html` |
| Tipo | Single-player, sin anti-cheat, sin componente online |

### Evidencia del stack
- NW.js: `nw.dll` (84 MB), `node.dll`, `Game.exe` (launcher), `nw_*.pak`, `swiftshader/`
- MV runtime estándar: `js/rpg_core.js v1.6.0`, `rpg_managers/objects/scenes/sprites/windows.js`
- Libs: `pixi.js`, `pixi-tilemap`, `pixi-picture`, `fpsmeter`, `lz-string`, `iphone-inline-video.browser.js` (¡el runtime ya trae el helper de video móvil!)
- Contenido: 198 `data/*.json`, 3886 `img/**/*.rpgmvp` (cifrado MV), 445 `audio/**/*.rpgmvo`, `movies/intro.webm`, `save/*.rpgsave` (LZString)
- `main.js` es stock (`SceneManager.run(Scene_Boot)`), **0 llamadas a require()**
- 67 plugins JS (lista en `www/js/plugins/`), entre ellos Steam: `greenworks.js`, `Archeia_Steamworks.js`, `OrangeGreenworks.js`
- `System.json` válido pero sin `title`/`gameId` (stripped por el dev)

## 2. Análisis de dependencias NW.js/Node (riesgo de port)

| Superficie | Estado | Implicación Android |
|---|---|---|
| Runtime MV (fs saves) | Guardado tras `Utils.isNwjs()` | En navegador cae a localStorage → funciona |
| `require('nw.gui')` (alert wrapper) | Guardado tras `Utils.isNwjs()` | No se ejecuta en WebView |
| Steamworks (greenworks nativo) | **Addon nativo de Node → no existe en Android** | **Shim obligatorio**: stub de `require`/greenworks → no-op |
| Plugins YEP (varios con `require`) | Uso guardado/ventana NW | Verificar en PoC; bajo riesgo |
| Cifrado rpgmvp/rpgmvo | Pipeline `'decrypting'→'decryptCompleted'` en Bitmap | El propio runtime descifra en JS ✓ |
| Vídeo intro.webm | Chromium reproduce webm ✓ | OK |
| Audio .ogg vía WebAudio | WebAudio presente (4 refs en core) | OK + gate de autoplay (gesto inicial) |

**Veredicto técnico**: riesgo **BAJO-MEDIO**. MV es multiplataforma por diseño (móvil/iOS/Android son targets oficiales del motor). El juego no tiene código nativo propio ni Unity: todo es JS+assets. El único bloqueo real es Steamworks (resoluble con shim) y la capa táctil.

## 3. Propuesta: APK "OpenCE-style" (sin bytes del juego dentro)

El APK no distribuye NI UN solo byte del juego ni código decompilado del mismo. En primer arranque pide al usuario su copia de Steam y la prepara localmente.

```
APK (Kotlin, minSdk 26)
├─ SetupActivity (primer arranque)
│   ├─ Selector de carpeta vía Storage Access Framework (o .zip)
│   ├─ Validación de la copia: www/index.html + js/rpg_core.js + data/System.json
│   │   (+ hash de Game.exe y versionId=14145329 para detectar versión y elegir parches)
│   └─ Extracción a files/www/ + aplicación de overlay de parches
├─ GameActivity (WebView endurecida)
│   ├- Servidor local (http://127.0.0.1) → evita quirks de file://
│   ├─ Shims inyectados: greenworks/Steamworks → no-op; save-bridge (localStorage→fs de la app)
│   └─ Flags: WebGL, autoplay gate "toca para empezar"
├─ TouchLayer (overlay): joystick virtual → eventos WASD/teclado, menú/inventario,
│   taps→clics ratón (MV ya soporta táctil; F&H añade WASD+ratón vía plugins)
└─ Ajustes: letterbox 816×624 vs escalado, resolución, límite de FPS, idioma
```

### Validación de la copia (como OpenCE)
1. Presencia de la estructura MV (`www/index.html`, `js/rpg_core.js`, `data/`)
2. `versionId` de System.json = 14145329 (fingerprint de versión → matriz de parches)
3. Opcional: hash de `Game.exe` (analizable con REA+Ghidra si queremos un check más fuerte)
4. El usuario selecciona la carpeta **él mismo** con el SAF de Android; el APK nunca la descarga

## 4. Fases

- **Fase 0 — Recon** ✅ (este documento)
- **Fase 1 — PoC de riesgo (PC, sin Android)**: servir `www/` con un shim mínimo de Steamworks en Chromium local, arrancar hasta título → nueva partida → guardar/cargar. Valida el 90% del riesgo (runtime browser-mode, cifrado, saves, vídeo, audio). Herramientas: um `game-automation` (capturas) + REA browser observation.
- **Fase 2 — APK vertical slice**: Android SDK (user-level, sin sudo) + proyecto Gradle + WebView + SAF + extractor + shims. Objetivo: título → partida → moverse en el mapa inicial → save/load.
- **Fase 3 — Táctil y rendimiento**: virtual gamepad, letterbox, gate de audio, rendimiento PIXI v4 en GPUs móviles (mapas MV grandes), intro.webm.
- **Fase 4 — Pulido**: validación robusta, icono, ajustes, field note en la KB (`um kb new … --from-scan`) + PR con OK del usuario (`um kb pr`).

## 5. Asignación de herramientas

| Herramienta | Uso en este port |
|---|---|
| um `game-recon` | Hecho (este plan) |
| um `reverse-engineering` | Inspección JS/plugins, ILSpy no aplica (no hay .NET) |
| um `port-a-mod` | Adaptación por unidades + tests anti-drift |
| um `game-automation` / `showcase-video` | Verificación PoC + vídeo del port |
| REA `analyze-javascript-application` | Mapa de módulos/imports de www/, detección de dependencias NW residuales |
| REA browser observation | PoC Fase 1 (páginas, scripts, red, capturas) |
| REA + Ghidra (`Game.exe`) | Opcional: extraer checks de versión/ownership para la validación |

## 6. Marco legal / reglas que seguimos (skill safety)

- Single-player, sin anti-cheat, sin DRM a saltar, sin online → dentro de las reglas de `mod-any-game`
- APK sin archivos del juego ni código decompilado del juego (los datos y el runtime JS salen de la copia del usuario en su dispositivo)
- REA/modding local por interoperabilidad; el usuario aporta su propia copia de Steam
- Antes de publicar: lint `um publish check` (bloquea game files, decompilados y claves)

## 7. Riesgos abiertos

1. `System.json` sin gameId/title → comprobar comportamiento de StorageManager/paths en browser-mode (PoC)
2. Plugin `Arisu_WASD` + `DisableMouse` + `YEP_KeyboardConfig` → mapeo táctil a keycodes (Fase 3)
3. Rendimiento de PIXI v4 con mapas grandes en GPUs móviles (Fase 3; candidato a `downscale` de texturas)
4. Compatibilidad de WebView antiguas (minSdk 26 + WebView via Google Play System Update; Chromium moderno recomendado)
5. `js_copies/` y ediciones previas visibles en la copia (`.DS_Store`, `__MACOSX`, PSDs) → el extractor debe filtrar

---

## 8. Fase 1 — PoC navegador: RESULTADO ✅ (2026-10-18)

El juego completo corre en Chrome (WebGL real) desde `www/` con un shim NW.js
mínimo. El PoC vive en `poc/` (symlinks al juego + `index.html` parcheado +
`shim-nw.js` + `debug-hook.js`). Servidor: `python3 -m http.server 8377` en `poc/`.

### Validado (todo con el mismo harness)
1. **Boot** → pretitle map72 → **pantalla de título** (arte + menú, v1.4.1).
2. **New Game** → eventos de apertura → selección de personaje (imágenes + choices).
3. **Pipeline WebGL** con `TerraxLighting` lightmask activa en mapa (niebla/iluminación).
4. **Save/load** round-trip en localStorage: `ok(850/850 B)` y `ok(930/930 B)`.
5. **Puente BYOC de saves**: `.rpgsave` PC (LZString-base64) → `localStorage`
   (`RPG FileN`/`RPG Global`/`RPG Config`) → Continue → `loadGame(1)=true`,
   mapa 73 → transfer a 74 → **batalla completa** con el save real del jugador.
6. **1 solo error JS** en toda la sesión: SyntaxError de `physical_attack_animation.js`
   (plugin muerto que también falla en PC real; inofensivo).

### Hallazgos críticos para el extractor del APK
- `Archeia_Steamworks.js:446` hace `require("./js/libs/greenworks")` **top-level
  sin guard** → el shim DEBE ofrecer `window.require` con stubs (Proxy no-op;
  `initAPI()` devuelve undefined y el plugin sigue).
- **F&H modificó `Utils.isNwjs()`** a `typeof require==='function' && typeof process==='object'`
  (sin `versions.nw`): el shim **NO debe definir `window.process`**, o el runtime
  cree estar en NW.js e intente saves por `fs` (`process.mainModule.filename` → TypeError).
  Definir solo `require` es suficiente y deja isNwjs=false (saves → localStorage).
- `StorageManager` vive en `rpg_managers.js` (build custom), claves webStorage:
  `'RPG Config'` (-1), `'RPG Global'` (0), `'RPG FileN'` (N). Los `.rpgsave` PC ya
  son LZString-base64 → migración = volcar el contenido a la clave equivalente.
- Escena custom `Scene_PretitleMap` (HIME_PreTitleEvents, map 72) antes del título.

### Rendimiento (niebla en móvil — requisito del usuario)
- Stack de niebla identificado y CONFIRMADO activo en runtime: `TerraxLighting`
  (lightmask full-screen), `VE_FogAndOverlay`, `FilterController` (filtros PIXI).
- Palanca nativa: el juego ya tiene toggle **"Filter Effects"** en Opciones
  (switch 3520 vía YEP_OptionsCore + FilterController) → el port puede ofrecer
  preset "Bajo rendimiento" (filters OFF + lightmask a media resolución).
- Mitigaciones candidatas (validar en Fase 3): `PIXI.settings.FILTER_RESOLUTION=0.5`,
  cap 30 FPS en móvil, cache de la lightmask (Evitar recálculo por frame).
- Nota de harness: en Chrome headless con `--virtual-time-budget` el bucle rAF de
  MV se para tras 1-2 ticks; el harness lo re-arma con `setTimeout(16)`
  (`debug-hook.js`). **No aplica al APK**: el WebView real produce frames a 60 Hz.

### Repro del PoC
```bash
cd "poc" && python3 -m http.server 8377 --bind 127.0.0.1 &
google-chrome --headless=new --window-size=816,624 --virtual-time-budget=90000 \
  --enable-unsafe-swiftshader --use-angle=vulkan --enable-features=Vulkan \
  --use-vulkan=swiftshader --screenshot=out.png "http://127.0.0.1:8377/?auto&importsave"
```
Parámetros de prueba: `?auto` (new game → mapa → save test), `?importsave`
(importa saves PC y carga Continue), `?nolight` (oculta lightmask).

### Siguiente (Fase 2)
Android SDK user-level + proyecto Gradle + WebView shell + extractor SAF
(validación por estructura + versionId 14145329) + shim idéntico a `shim-nw.js`
+ puente de saves ya probado. Riesgo residual cae a: rendimiento GPU móvil (Fase 3).

## 9. Fase 2.5 — Investigación y fix de los crashes de audio: RESULTADO ✅ (2026-10-18)

El usuario reportó: "el juego crasheaba más adelante con errores de audio".
No llegó ningún directorio de evidencia, así que reproducimos y diagnosticamos nosotros.

### Esquema de criptografía del juego (verificado con ffmpeg/PNG, no con suposiciones)

- `System.json.encryptionKey` = MD5 de la cadena vacía (key efectivamente vacía —
  el literal se omite por política de publicación del repo).
- Los `.rpgmvo`/`.rpgmvp` = cabecera `RPGMV` (16 B) + contenido donde **solo los
  primeros 16 bytes** están XOR con la key hex-decodificada; el resto en claro.
- La función **custom** de `Decrypter.decryptArrayBuffer` (rpg_core.js:9208,
  reemplaza la de MV: corta 16 B y XOR solo 16 B con `parseInt(hex,16)`) lo
  descifra correctamente — por eso funciona en PC.
- Validación masiva: **433/433 audios** decodifican con esa regla (ffprobe:
  vorbis 11–96 kHz, mono–5.1, 0 fallos) y **2073/2074 imágenes** son PNG válidos.

### Prueba empírica en el WebView del emulador

Página de prueba que descifra y llama `decodeAudioData` a **todos los SE
(400) + 2 BGM grandes**: **`ok=402 fails=0`**. Chromium decodifica Vorbis sin
problema, incluidos los sospechosos (`growl` 6 canales, `rat_*` y
`footstep_tile` a 96 kHz). ⇒ El decodificador NO es el problema.

### Causa real de los crashes + fix (android-compat.js v2)

- MV lanza `throw new Error('Failed to load: ...')` desde
  `AudioManager.checkWebAudioError` ante **cualquier** buffer de audio en error
  → pantalla roja y fin del juego. Cualquier 404 o fallo puntual de audio =
  "crash".
- En dispositivos reales el `AudioContext` puede arrancar `suspended` hasta el
  primer gesto → silencios/estados raros.
- Fix v2 (inyectado tras main.js por MainActivity):
  1. `audioFileExt()` forzado a `.ogg` (el juego solo trae `.rpgmvo`;
     extToEncryptExt lo mapea bien; el UA móvil pediría `.m4a` inexistente).
  2. `checkWebAudioError` **no fatal**: log por FHBridge + el juego continúa.
  3. Reanudación de `WebAudio._context` en el primer touch/click/tecla.
  4. Logger de `unhandledrejection` para diagnóstico.
- MainActivity ahora escribe `android-compat.js` durante la extracción y lo
  **refresca en cada arranque** (`refreshRuntime`) — los updates de APK no
  exigen re-elegir la carpeta Steam.

### Verificación en el emulador (sesión completa, PID estable, cero errores)

título (BGM+arte completo) → Continue → save importado del PC → mapa (pasos
96 kHz) → batalla aleatoria vs Hounds (BGM de batalla, SEs de ataque, gruñidos
de 6 canales) → muerte → pantalla game over. Logcat: solo los 3 logs de
arranque de compat + el SyntaxError conocido e inofensivo del plugin muerto
`physical_attack_animation.js`. Consola chromium limpia (pipeline de audio
iniciada: `audioHardwareBufferSize = 4360`).

### Entregable

- `android/app/build/outputs/apk/debug/app-debug.apk` (1,49 MB, cero bytes de
  juego — verificado; `um publish check`: 0 fallos, README añadido).

## 10. Fase 3 — Controles táctiles + rendimiento (completada)

### Controles táctiles (`android-touch.js`, inyectado tras android-compat.js)

- Superposición con **D-pad** (4 direcciones), **A** (Z=ok), **B** (X=escape),
  **≡** (Esc=menú) e interruptor **30/60 FPS**; `pointer events` + multitouch
  (un dedo camina mientras otro confirma), `setPointerCapture` para no perder
  el botón si el dedo se sale.
- Los botones generan `KeyboardEvent` sintéticos con los **mismos keycodes que
  un teclado real** (37/38/39/40, 90, 88, 27) → el keyMapper del juego no
  necesita conocerse ni tocarse. Prueba en emulador: el D-pad + A navegaron
  título → Continue → selección de archivo → mapa.
- Los eventos táctiles de la superposición hacen `stopPropagation` para que
  `TouchInput` del juego no los interprete como clics en el mapa.
- El overlay se salta el arranque si no hay soporte táctil (PC intacto).

### Rendimiento

- `PIXI.settings.FILTER_RESOLUTION = 0.5` (android-compat.js): niebla,
  iluminación y tono son filtros a pantalla completa → ~4x menos carga de
  relleno, diferencia visual mínima (efectos difusos).
- **Tope de 30 FPS por defecto** vía envoltorio de `requestAnimationFrame` en
  `shim-nw.js` (se ejecuta antes que pixi.js): mitad de CPU/GPU/batería; el
  juego mantiene la velocidad real porque PIXI avanza por tiempo transcurrido.
  Ajustable en caliente con `window.__FH_fpsCap` (botón del overlay).
- Medido en Chromium real (misma base que el WebView): **30,2 fps** con cap →
  **60,2 fps** tras el toggle → **30,0 fps** al volver.

### Hallazgo crítico: `fpsmeter.js` cancela `cancelAnimationFrame(1)`

- El primer diseño de cap (batcher) dejaba la pantalla **negra en el arranque**
  (escena nula, rAF sin entregar). Diagnóstico con instrumentación pre-shim vía
  CDP: el pump quedaba agendado con el **id nativo 1** y `fpsmeter.js`
  (`D.b.pause`, al perder foco/visibilidad) ejecutaba `cancel(1)` y `cancel(2)`
  → mataba el único callback nativo del batcher → deadlock permanente.
- Fix definitivo: `window.cancelAnimationFrame` **neutralizado** junto al
  batcher (MV no depende de que cancel cancele; peor caso = un tick huérfano
  de fpsmeter, inofensivo). Verificado: arranque a Scene_Title + FPS medidos.
- Nota de diseño: el cap multiplexa todos los consumidores en UN callback
  nativo → sin este fix, cualquier cancel externo rompería el bucle entero.

## 11. Fase 4 — Identidad (nombre + icono)

- `android:label` → **"Fear & Hunger"** (antes "Fear & Hunger Port (PoC)"); tema oscuro
  (`Theme.Material.NoActionBar`, la UI de MainActivity ya era #101014); `ActivityManager.TaskDescription`
  con nombre + color `#0E0C12` para la tarjeta de multitarea.
- Icono **adaptivo** original: SVGs propios en `assets/gen/icon/icon-{torch,bonfire,sigil}.svg`,
  render con Inkscape 1.4 a 1024, densidades 108/162/216/324/432 (`ic_launcher_foreground.png`)
  + PNGs planos de respaldo 48–192 aplomados sobre `#0E0C12`; capas en `mipmap-anydpi-v26`
  (launcher + round), color de fondo en `values/colors.xml`. Instalado: **antorcha** (vincula con el
  botón T de la Fase 6); variantes hoguera y símbolo listas para cambiar (1 rebuild).
- Sin fal key en esta máquina → icono SVG local (upgrade con `um fal key set` + `um fal sprite`).
- **Gotcha Inkscape**: `feGaussianBlur` en el export PNG deja halos rojos/banding → el resplandor
  se hace solo con `radialGradient` (sin filtro). Previsualizar sobre el color de fondo real
  (`magick … -background '#0E0C12' -flatten`), no sobre blanco.
- Gotchas Android: `TaskDescription(String,Bitmap,int)` vive en `ActivityManager` (no `Activity`,
  error de compilación la primera vez); con minSdk 26 solo hace falta `mipmap-anydpi-v26`.
- Verificado en el Galaxy A56: icono+nombre en launcher Samsung, tarjeta de recents, arranque
  directo al título; `um publish check .` → **0 fallos** (97 warnings = rutas absolutas de
  `android/app/build/`, intermedios de Gradle). APK 1.660.600 bytes (subió ~173 KB = recursos de icono).

## 12. Fase 5 — Menú propio (ajustes + contador FPS + reposicionado)

- **Opción B: panel HTML/JS dentro del WebView** (cero cambios Java). Todo en
  `android-touch.js` + ~10 líneas en el batcher de `shim-nw.js`. Origen appassets =
  mismo localStorage que los saves (clave propia `fhset_v1` = `{cap, counter, pos}`).
- **⚙ (arriba-derecha) reemplaza al viejo botón "30"**: el límite de FPS vive SOLO en el
  menú (petición del usuario). El menú tiene: segmentado Límite de FPS 30/60, segmentado
  Contador de FPS Sí/No, botones Reposicionar controles / Restablecer posiciones / Cerrar.
  Estilo F&H: serif, panel #14121a con borde #7a6f5a, tipografía con `clamp()` (el viewport
  del A56 es **980×452 CSS** ≈ dpr 2.45, así que vmin≈4.5px → caps y clamps son obligatorios).
- **Contador de FPS real**: el rAF-batcher del shim ES el bucle que dibuja, así que cuenta
  los frames que despacha cada ≥1000 ms y expone `window.__FH_fps`. La píldora amarilla junto
  al ⚙ lo muestra y **sigue la posición del ⚙** (también tras arrastrarlo). Verificado:
  30 fps con cap 30; 55-60 con cap 60.
- **Bloqueo mientras el menú está abierto**: el panel cubre toda la pantalla y corta en
  `pointerdown/up/move/cancel` + `touchstart/end/move/cancel` con `stopPropagation` (nunca
  `freeze` del bucle: TDDP_FluidTimestep castigaría un salto de dt al reanudar); el teclado
  se bloquea con un listener en fase `capture` (Esc cierra). El juego sigue corriendo detrás.
- **Reposicionado**: modo edición con banner; el **D-pad se arrastra como UNA pieza**
  (contenedor `#fh-dpad` de 3S×3S con las flechas dentro relativas), A/B/Menú/⚙
  individuales. `setPointerCapture` sobre el botón tocado aunque el elemento visual sea el
  contenedor (evita depender de eventos con capture en `pointer-events:none`). Clamp al
  viewport; posiciones guardadas como **fracciones** (x/ancho, y/alto) → sobreviven a
  cambios de viewport/densidad. `.fh-editing` pinta contornos discontinuos.
- **Bug real encontrado y corregido en pruebas con el usuario**: `resetPos` borraba
  `el.style.left/top/right/bottom` pensando que los anclajes por defecto estaban en la
  stylesheet — pero los estilos por defecto de los botones se inyectan con
  `setAttribute('style', css)` y viven **SOLO inline**; al borrarlos, el absoluto sin
  anclajes cae a la posición estática = **esquina superior izquierda** (todos los controles
  se iban arriba-izquierda al resetear, y el modo reposición heredaba el desorden).
  Fix: `DEF[g] = getAttribute('style')` al construir y `setAttribute('style', DEF[g])` en
  reset. **Regla**: cualquier botón con posición por defecto inline debe restaurarse con el
  string completo, nunca-property-a-property.
- Verificado en el A56 con el usuario probando: menú abre/cierra; preferencias persisten
  tras reinstalar (cap 60 + contador del usuario se conservaron); reset devuelve todo a sus
  posiciones por defecto; contador en vivo OK; `um publish check .` → **0 fallos**.
- Screenshots: `/tmp/opencode/f5-title4.png` (píldora+⚙), `f5-fix-awake2.png` (menú completo).

## 13. Fase 6 — Botón de antorcha (tecla T)

- **Botón circular con llama SVG inline** (path monocromo con `fill="currentColor"` →
  hereda el color del botón; `mkBtn` acepta un flag `html` para iconos). Por defecto a la
  izquierda de la B, en su misma fila (alcance del pulgar derecho sin tapar la A). Es
  repositionable como el resto (grupo `tc` en GRP) y arrastrable en el modo edición.
- **Mecanismo (recon Fase 3 + verificado en vivo)**: `js/plugins.js` params
  `"Key T":"289"` → `YEP_ButtonCommonEvents.js:811` `Input.keyMapper[84]='t'` → MV recibe
  el KeyboardEvent en `document` (mismo canal que A/B/D-pad). Semántica de **mantener
  pulsado**: `pointerdown→keydown(84)`, `pointerup→keyup(84)` reutilizando `press/release`.
  El CE 289 solo dispara en mapas de campo (diseño del plugin) — igual que en PC.
- **Verificado en el Galaxy A56**: por CDP `Input.keyMapper[84]==='t'` (mapeo del plugin
  vivo tras el boot); botón visible en su posición por defecto; incluido en el modo
  reposición (contorno punteado); y **prueba en juego real del usuario: encendió una
  antorcha con el botón** (personaje con antorcha iluminada en el mapa inicial, "funciona").
- Menú: fila **"Botón antorcha" Sí/No** (`#fh-tcsw`), persiste en `st.torch` (default ON);
  la visibilidad se aplica DESPUÉS de capturar DEF y de restaurar/resetear posiciones
  (`applyTorchVis`), para que el estilo por defecto no decida la visibilidad.
- `um publish check .` → **0 fallos**.
- **Gotchas**: (1) `input swipe X Y X Y d` con punto idéntico degrada a tap rápido en
  Android — para simular un hold hay que desplazar 2-3 px; (2) al probar en el teléfono
  con el usuario jugando, las pruebas por CDP pueden perder el forward tras
  reinstalar/rotar — re-hacer `adb forward` con el PID actual; (3) el botón antorcha no
  marca `.fh-tbtn` con texto sino SVG → usar `currentColor` y no `textContent`.
