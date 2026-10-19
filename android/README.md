# Fear & Hunger — Port para Android (BYOC)

Lleva tu copia de **Fear & Hunger** de Steam a tu teléfono. La APK **no incluye
ningún archivo del juego**: en el primer arranque eliges tu carpeta de Steam y
la app valida y prepara tu propia copia en el dispositivo (single-player,
solo lectura de tu copia original).

## Requisitos

- Android 8.0 (API 26) o superior
- Tu copia de Fear & Hunger de Steam (PC), versión 1.4.1 (`versionId 14145329`)
- ~1 GB de espacio libre (el juego ocupa ~837 MB)

## Instalación

1. Transfiere `app-debug.apk` al teléfono y ábrelo (activa "Instalar apps de
   orígenes desconocidos" si tu Android lo pide).
2. Abre la app y toca el botón para elegir la carpeta.
3. Navega hasta `.../steamapps/common/Fear & Hunger` y selecciónala.
4. La app valida tu copia (estructura + versión) y la copia al almacenamiento
   interno. La primera vez tarda ~1–2 minutos.
5. Juega. Tus saves se importan automáticamente desde la carpeta `save` de tu
   copia de PC la primera vez.

## Actualizaciones

Instala la nueva APK **encima** de la anterior (no hace falta volver a elegir
la carpeta): los archivos del juego se conservan y solo se actualizan los
archivos de compatibilidad.

## Controles

- **Pantalla táctil**: overlay con D-pad (izquierda) y botones **A**
  (confirmar/Z), **B** (cancelar/X) y **≡** (menú/Esc). Arriba a la derecha
  hay un interruptor **30/60** de FPS (por defecto 30 para ahorrar batería;
  ponlo a 60 si tu móvil va holgado).
- Los menús también responden al toque directo (del propio juego).
- Teclado Bluetooth: flechas + Z (confirmar) + X (cancelar) + Esc (menú).

## Cómo funciona (transparencia)

- La app **no** modifica ni envía tu copia: la valida (existe `package.json`,
  `www/data/System.json` con el `versionId` correcto y `js/rpg_core.js`) y la
  copia a su directorio privado.
- El runtime MV se ejecuta en un WebView con un shim mínimo de NW.js y una
  capa de compatibilidad de audio (extensión `.ogg`, manejo de errores no
  fatal, reanudación de AudioContext).
- Cero bytes del juego dentro de la APK (verificado con `um publish check`).

## Credits

- Fear & Hunger © Miro Haverinen (compra el juego en Steam: https://store.steampowered.com/app/1534920/Fear__Hunger/)
- Este port es solo un visor/runtime para tu copia legítima. No distribuye
  contenido del juego. Hecho con orientación de universal-modder (um).
