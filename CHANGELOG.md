# Changelog

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
