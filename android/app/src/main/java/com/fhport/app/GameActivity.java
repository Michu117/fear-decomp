package com.fhport.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Ejecuta el juego (www/ extraído) dentro de un WebView.
 *
 * - Se sirve por https://appassets.androidplatform.net/assets/… vía
 *   WebViewAssetLoader + PathHandler sobre filesDir/game/www. Ese origin
 *   https estable es lo que hace funcional el localStorage (saves MV).
 * - El shim NW.js (shim-nw.js) ya está inyectado en index.html al extraer.
 * - Los saves PC del jugador (pending_saves) se importan a localStorage
 *   antes de que el runtime arranque (puente probado en el PoC PC).
 */
public class GameActivity extends Activity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);
        // Barra de navegación del sistema oculta: los controles táctiles
        // (A/B/menú) viven pegados al borde derecho y la barra los pisaba.
        applyImmersive();
        // Tarjeta de multitarea con el nombre y color propios de la app.
        @SuppressWarnings("deprecation")
        ActivityManager.TaskDescription td =
                new ActivityManager.TaskDescription("Fear & Hunger", null, 0xFF0E0C12);
        setTaskDescription(td);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // ← saves en localStorage
        s.setMediaPlaybackRequiresUserGesture(false); // BGM sin tocar pantalla
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);           // todo pasa por el asset loader
        s.setAllowContentAccess(false);
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        WebView.setWebContentsDebuggingEnabled(true);

        final File wwwRoot = new File(getFilesDir(), MainActivity.GAME_DIR + "/www");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                                                              WebResourceRequest request) {
                return serveLocal(wwwRoot, request.getUrl().getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                importSaves();
            }
        });

        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void log(String msg) {
                android.util.Log.i("FH-PORT", msg);
            }
        }, "FHBridge");

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    /** PathHandler manual: mapea /assets/** → filesDir/game/www/** */
    private WebResourceResponse serveLocal(File root, String path) {
        if (path == null || !path.startsWith("/assets/")) return null;
        String rel = path.substring("/assets/".length());
        if (rel.isEmpty() || rel.contains("..")) return null;
        File f = new File(root, rel);
        if (!f.isFile()) return null;
        try {
            InputStream in = new FileInputStream(f);
            String mime = mimeFor(rel);
            String encoding = ("application/json".equals(mime)
                    || mime.startsWith("text/") || mime.endsWith("+javascript"))
                    ? "utf-8" : null;
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, encoding, in) {
                @Override
                public Map<String, String> getResponseHeaders() {
                    return headers;
                }
            };
        } catch (Exception e) {
            return null;
        }
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".png") || n.endsWith(".rpgmvp")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".ogg") || n.endsWith(".rpgmvo")) return "audio/ogg";
        if (n.endsWith(".m4a") || n.endsWith(".mp4")) return "audio/mp4";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".ttf")) return "font/ttf";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    /**
     * Importa los saves PC del jugador a localStorage (una sola vez por
     * extracción): 'RPG Global' / 'RPG Config' / 'RPG FileN'. El contenido ya
     * viene en LZString-base64 (mismo formato que webStorage) — puente
     * validado en el PoC PC (?auto&importsave).
     */
    private void importSaves() {
        File pending = new File(getFilesDir(), MainActivity.PENDING_SAVES_DIR);
        File importedMarker = new File(getFilesDir(),
                MainActivity.GAME_DIR + "/" + MainActivity.SAVES_IMPORTED_MARKER);
        if (!pending.isDirectory() || importedMarker.exists()) return;

        StringBuilder js = new StringBuilder();
        File[] files = pending.listFiles();
        if (files == null) return;
        for (File f : files) {
            String name = f.getName();
            String content = readTextFile(f);
            if (content == null || content.isEmpty()) continue;
            String key = name.equals("global") ? "RPG Global"
                    : name.equals("config") ? "RPG Config"
                    : name.startsWith("file") ? "RPG File" + name.substring(4)
                    : null;
            if (key == null) continue;
            js.append("try{localStorage.setItem(")
                    .append(org.json.JSONObject.quote(key)).append(",")
                    .append(org.json.JSONObject.quote(content))
                    .append(");}catch(e){FHBridge.log('save-import err: '+e);}");
        }
        if (js.length() > 0) {
            final String script = js.toString();
            runOnUiThread(() -> webView.evaluateJavascript(script, value -> {
                android.util.Log.i("FH-PORT", "saves importados a localStorage: " + value);
                try {
                    importedMarker.createNewFile();
                } catch (Exception ignored) {
                }
            }));
        }
    }

    private String readTextFile(File f) {
        try (InputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onBackPressed() {
        // No salir con el gesto de "atrás": en modo inmersivo un deslizar
        // accidental desde el borde mataría la partida. Salir = botón
        // Inicio/gestos del sistema (la app queda en segundo plano).
    }

    /** Ocultar barras del sistema (inmersivo pegajoso): un deslizamiento
     *  desde el borde las muestra un instante y vuelven a ocultarse solas. */
    private void applyImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive(); // Samsung/restauraciones de UI
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
