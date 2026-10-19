# Fear & Hunger — Android Port

> Play **Fear & Hunger** on your Android phone or tablet using **your own copy** of the
> game. This project ships a tiny Android app (~1.6 MB) with **zero game files** inside:
> on first launch it asks you to pick your game folder and prepares a private,
> on-device copy.

| | |
|---|---|
| Game | Fear & Hunger (PC · RPG Maker MV 1.6.0) by Miro Haverinen |
| App | `com.fhport.app` · minSdk 26 (Android 8.0+) · **no internet permission** |
| Tested on | Samsung Galaxy A56 (Android 16) |

---

## English

### What you get
- **Touch controls**: D-pad + A (interact/confirm) + B (cancel) + ≡ (menu) +
  a **torch button** (the PC `T` key).
- **In-game settings menu (⚙)**: FPS cap 30/60, live FPS counter, show/hide the torch
  button, **reposition every control** by dragging (saved) + reset to defaults.
- **Performance mode**: 30 FPS cap + half-resolution light/fog filters by default
  (smooth on mid-range phones); switch to 60 FPS in the menu.
- **Saves on your device only** — imported once into the app's private storage.
- Fully offline. No account, no telemetry, no uploads.

### Requirements
- Android 8.0+ (64-bit).
- **Your own legitimate copy** of Fear & Hunger for PC — the folder that contains
  `package.json` and `www/` (Steam or any other source you own).
- ~1 GB of free storage (the copy is extracted into private app storage).

### Install
1. Download `fh-android-port-v1.0.0.apk` from the **Releases** page.
2. Open it and allow "install from unknown apps" for your browser/file manager
   if Android asks.
3. Launch **Fear & Hunger** from your launcher (icon: a torch on a dark background).

### First launch — bring your own copy
1. The app asks for your game folder. Select the `Fear & Hunger` directory
   (the one containing `package.json` and `www/`).
2. It validates the copy (`package.json`, `www/data/System.json`, `rpg_core.js` v1.6.0)
   and extracts it privately. Your original folder is never modified.
3. The game boots. Done.

### Uninstall
Uninstall the app. Everything (saves included) lives in the app's private storage only;
your game folder stays untouched.

### Build from source
```bash
cd android
gradle assembleDebug        # JDK 21 + Android SDK required
# output: android/app/build/outputs/apk/debug/app-debug.apk
```
The APK is debug-signed (fine for sideloading). For your own release signing,
generate a keystore and configure a `release` signingConfig.

### Troubleshooting
- **Picker rejects the folder**: it must contain `package.json` directly and
  `www/data/System.json` with `versionId` `14145329` (game v1.4.1 / MV 1.6.0).
- **Black screen**: force-close the app and relaunch — runtime scripts are
  refreshed on every start, so app updates never require re-picking the folder.
- **Logs for bug reports**: `adb logcat -s FH-PORT:V` (port messages) and
  `adb logcat -d | grep chromium` (in-page JS console).

### Known quirks (harmless)
- One `SyntaxError: Unexpected identifier 'Object'` in the console comes from a
  dead bundled plugin of the game — harmless on PC and Android alike.
- `Steamworks failed to initialize` in the logs — expected outside Steam; Steam
  integration is stubbed.
- TerraxLighting PIXI deprecation warnings — cosmetic.

### Legal
- This repository and its APK contain **no game files, no game assets and no
  decompiled game code**. All game data comes from the copy **you** provide at
  runtime (bring-your-own-copy), stays on your device, and is never redistributed.
- You must own Fear & Hunger to use this port. Buy the game on
  [Steam](https://store.steampowered.com/app/865600/Fear__Hunger/).
- This project is not affiliated with or endorsed by the developer.

### Credits
- **Fear & Hunger** — Miro Haverinen. [Buy it on Steam](https://store.steampowered.com/app/865600/Fear__Hunger/).
- RPG Maker MV 1.6.0 runtime — taken from the player's own copy; never redistributed.
- [YEP_ButtonCommonEvents](https://yanflychannel.wordpress.com/) (Yanfly) — public plugin
  used by the game; referenced for the torch key mapping.
- App icon: original SVG art generated locally with Inkscape (no game assets).
- **AI disclosure**: built with AI assistance — an [OpenCode](https://opencode.ai) coding
  agent (model: MiMo), directed, tested and approved by a human.

### License
Port code: [MIT](LICENSE). The game itself is not included and remains property of its
developer.

---
---

## Español

### Qué obtienes
- **Controles táctiles**: D-pad + A (interactuar/confirmar) + B (cancelar) + ≡ (menú) +
  **botón de antorcha** (la tecla `T` del PC).
- **Menú de ajustes dentro del juego (⚙)**: límite de FPS 30/60, contador de FPS en
  vivo, mostrar/ocultar el botón de antorcha, **reposicionar cada control** arrastrando
  (se guarda) + restablecer valores por defecto.
- **Modo rendimiento**: límite de 30 FPS + filtros de luz/niebla a media resolución por
  defecto (fluido en gama media); cambia a 60 FPS desde el menú.
- **Partidas solo en tu dispositivo**: se importan una única vez al almacenamiento
  privado de la app.
- Totalmente offline. Sin cuenta, sin telemetría, sin subidas.

### Requisitos
- Android 8.0+ (64 bits).
- **Tu propia copia legítima** de Fear & Hunger para PC — la carpeta que contiene
  `package.json` y `www/` (Steam u otra fuente de la que seas dueño).
- ~1 GB de espacio libre (la copia se extrae al almacenamiento privado de la app).

### Instalación
1. Descarga `fh-android-port-v1.0.0.apk` desde la página de **Releases**.
2. Ábrelo y permite "instalar apps de orígenes desconocidos" para tu navegador o
   gestor de archivos si Android lo pide.
3. Lanza **Fear & Hunger** desde tu cajón de aplicaciones (icono: antorcha sobre
   fondo oscuro).

### Primer arranque — trae tu propia copia
1. La app pide tu carpeta del juego. Selecciona el directorio `Fear & Hunger`
   (el que contiene `package.json` y `www/`).
2. Valida la copia (`package.json`, `www/data/System.json`, `rpg_core.js` v1.6.0) y
   la extrae de forma privada. Tu carpeta original nunca se modifica.
3. El juego arranca. Listo.

### Desinstalación
Desinstala la app. Todo (partidas incluidas) vive solo en el almacenamiento privado
de la app; tu carpeta del juego queda intacta.

### Compilar desde el código
```bash
cd android
gradle assembleDebug        # requiere JDK 21 + Android SDK
# salida: android/app/build/outputs/apk/debug/app-debug.apk
```
El APK viene firmado en modo debug (suficiente para sideload). Para tu propia firma
de release, genera un keystore y configura un `signingConfig` de `release`.

### Solución de problemas
- **El selector rechaza la carpeta**: debe contener `package.json` directamente y
  `www/data/System.json` con `versionId` `14145329` (juego v1.4.1 / MV 1.6.0).
- **Pantalla negra**: fuerza el cierre de la app y relánzala — los scripts de runtime
  se refrescan en cada arranque, así que actualizar la app nunca obliga a volver a
  elegir la carpeta.
- **Logs para reportar fallos**: `adb logcat -s FH-PORT:V` (mensajes del port) y
  `adb logcat -d | grep chromium` (consola JS en la página).

### peculiaridades conocidas (inofensivas)
- Un `SyntaxError: Unexpected identifier 'Object'` en la consola viene de un plugin
  muerto incluido en el juego — inofensivo tanto en PC como en Android.
- `Steamworks failed to initialize` en los logs — esperado fuera de Steam; la
  integración con Steam queda anulada (stub).
- Avisos de deprecación PIXI de TerraxLighting — solo cosméticos.

### Aspectos legales
- Este repositorio y su APK **no contienen archivos del juego, assets del juego ni
  código decompilado del juego**. Todos los datos del juego provienen de la copia
  que **tú** proporcionas en tiempo de ejecución (bring-your-own-copy), se quedan en
  tu dispositivo y nunca se redistribuyen.
- Debes ser dueño de Fear & Hunger para usar este port. Compra el juego en
  [Steam](https://store.steampowered.com/app/865600/Fear__Hunger/).
- Este proyecto no está afiliado ni respaldado por el desarrollador.

### Créditos
- **Fear & Hunger** — Miro Haverinen. [Cómpralo en Steam](https://store.steampowered.com/app/865600/Fear__Hunger/).
- Runtime de RPG Maker MV 1.6.0 — proviene de la copia del jugador; nunca se redistribuye.
- [YEP_ButtonCommonEvents](https://yanflychannel.wordpress.com/) (Yanfly) — plugin público
  que usa el juego; se referencia para el mapeo de la tecla de antorcha.
- Icono de la app: arte SVG original generado localmente con Inkscape (sin assets del juego).
- **Transparencia de IA**: construido con asistencia de IA — un agente de
  [OpenCode](https://opencode.ai) (modelo: MiMo), dirigido, probado y aprobado por una
  persona.

### Licencia
Código del port: [MIT](LICENSE). El juego en sí no está incluido y sigue siendo
propiedad de su desarrollador.
