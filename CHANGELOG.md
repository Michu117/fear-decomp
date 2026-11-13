# Changelog

## 1.1.0 — 2026-10-19

- **Shift button** (`keyCode 16`, hold — same channel as a physical key): the
  modifier the game checks when you interact on the map (backstab, bow actions —
  map-event conditions "Button Shift pressed") and that speeds up text in menus.
  It does **not** toggle running: the game forces dashing
  (`TDDP_ManageDashing` "Force Dashing": true). Toggleable in the ⚙ menu,
  repositionable, persisted.
- **Per-control button size**: while repositioning, **tap a control to select it**
  (gold outline) and use the **− / % / +** toolbar (hold to repeat, ↺ = 100%), or
  **pinch it with two fingers** (60–180%, live % label); one finger keeps dragging it.
  The toolbar moves top↔bottom by itself if a dragged control covers it.
  Each control stores its own scale (`--fh-sz` set per element inside `calc()`);
  touch area always equals the visual area; inter-button anchors scale with it;
  positions re-clamped on change.
- **D-pad mode: Arrows ↔ Joystick** in the ⚙ menu. The joystick lives in the same
  container (shared saved position, edit mode and reset):22% dead zone,12°
  hysteresis,8 sectors of45° (diagonals = two simultaneous keys, MV handles8-way
  natively), knob follows the finger, releasing frees every direction key.
- **Controls opacity** (40/60/80/100%) and **haptic feedback** on button presses /
  joystick direction changes (native `performHapticFeedback`, no extra permission),
  both in the ⚙ menu.
- **Multi-language app UI (English default + Spanish)**: the setup screen
  (`res/values*/strings.xml`) and the overlay/⚙ menu (`I18N` dictionary in
  `android-touch.js`) follow the device language, falling back to English; ⚙ →
  Language overrides it for both (persisted; native side via `FHBridge.setLang`).
  Only the port's own UI is translated — never the game's text.
- **Release build for users**: the published APK is now `assembleRelease` — no
  `FH-PORT` logs, in-page console not mirrored to logcat, WebView remote debugging
  off, not debuggable. Same signing key as 1.0.0, so it updates in place (saves
  kept). The `debug` variant keeps logs and `chrome://inspect` for development.
- ⚙ panel redesigned in **two columns** with the actions in one row, so it fits a
  landscape screen without scrolling (still scrollable as a fallback).
- "Restablecer controles" now restores layout (positions + size + direction mode);
  feature toggles are left untouched.
- Persistence `fhset_v1` grows `shift`, `sizes`, `dpad`, `op`, `haptic`, `lang` keys **with defaults**:
  v1.0.0 settings keep loading unchanged.

## 1.0.0 — 2026-10-18 (first public release)

- WebView APK (Java-only, minSdk 26) that runs **your own PC copy** of Fear & Hunger
  (RPG Maker MV 1.6.0, game v1.4.1) on Android. Zero game bytes in the APK.
- **Bring-your-own-copy** first-run flow: SAF folder picker → validation
  (`package.json`, `System.json` `versionId` 14145329, `rpg_core.js` v1.6.0) → private
  extraction; runtime scripts refreshed on every launch (app updates never require
  re-picking the folder).
- **Audio fixed** on WebView: hardened the game's fatal `checkWebAudioError`, resume
  AudioContext on first gesture, force `.ogg` streams.
- **Performance**: rAF frame-batcher with 30 FPS cap (default) / 60 FPS, light & fog
  filters at half resolution (`PIXI.settings.FILTER_RESOLUTION=0.5`), both toggleable.
- **Touch controls**: D-pad, A (Z), B (X), ≡ (Esc) and a **torch button** (T —
  `YEP_ButtonCommonEvents` common event 289), multitouch + pointer capture.
- **In-game settings menu (⚙)**: FPS cap 30/60, live FPS counter (fed by the real
  render loop), torch button on/off, drag-to-reposition layout editor with per-control
  positions persisted in localStorage + reset to defaults.
- **Immersive fullscreen** (system bars hidden, swipe-reveal) and back-gesture proofed;
  keep-screen-on while playing.
- Saves imported once into app-private localStorage; original game folder never
  modified.
- Identity: app label "Fear & Hunger", adaptive launcher icon (original art), dark
  task-card.
- Publish lint `um publish check`: 0 failures (no game files, no keys, no decompiled
  code).
