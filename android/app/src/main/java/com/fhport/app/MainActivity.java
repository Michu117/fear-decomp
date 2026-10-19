package com.fhport.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.documentfile.provider.DocumentFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fase 2 — PoC Android del port de Fear & Hunger (RPG Maker MV 1.6.0).
 *
 * Modelo "OpenCE-style": el APK NO contiene bytes del juego. El jugador
 * selecciona su propia carpeta de Steam vía SAF (ACTION_OPEN_DOCUMENT_TREE),
 * la app valida la copia (package.json + System.json versionId + rpg_core.js
 * v1.6.0) y extrae www/ al almacenamiento interno, parcheando index.html con
 * el shim NW.js (shim-nw.js) que permite correr el runtime sin NW.js.
 */
public class MainActivity extends Activity {

    static final String GAME_DIR = "game";            // filesDir/game/www
    static final String VALIDATED_MARKER = ".validated"; // content: versionId
    static final String SAVES_IMPORTED_MARKER = ".saves_imported";
    static final String PENDING_SAVES_DIR = "pending_saves";
    static final String EXPECTED_VERSION_ID = "14145329";

    private static final int REQ_PICK_FOLDER = 42;

    private TextView statusView;
    private ProgressBar progressBar;
    private Button pickButton;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.parseColor("#101014"));

        TextView title = new TextView(this);
        title.setText("Fear & Hunger — Port PoC");
        title.setTextColor(Color.parseColor("#e8d9b0"));
        title.setTextSize(22);
        root.addView(title);

        statusView = new TextView(this);
        statusView.setTextColor(Color.parseColor("#c8c8d0"));
        statusView.setTextSize(14);
        statusView.setPadding(0, pad, 0, pad);
        root.addView(statusView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        progressBar = new ProgressBar(this, null,
                android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setVisibility(ProgressBar.GONE);
        root.addView(progressBar);

        pickButton = new Button(this);
        pickButton.setText("Seleccionar carpeta del juego (Steam)");
        pickButton.setOnClickListener(v -> pickFolder());
        root.addView(pickButton);

        setContentView(root);

        File marker = new File(getFilesDir(), GAME_DIR + "/" + VALIDATED_MARKER);
        if (marker.exists()) {
            statusView.setText("Copia ya extraída. Abriendo el juego…");
            refreshRuntime();
            launchGame();
        } else {
            statusView.setText(
                    "Elige la carpeta \"Fear & Hunger\" de tu Steam.\n" +
                    "La app valida tu copia y la prepara para jugar. " +
                    "No se envía nada a ningún servidor.");
        }
    }

    private void pickFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(intent, REQ_PICK_FOLDER);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FOLDER && resultCode == RESULT_OK && data != null) {
            Uri tree = data.getData();
            if (tree == null) return;
            final int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                getContentResolver().takePersistableUriPermission(tree, takeFlags);
            } catch (SecurityException ignored) {
            }
            getSharedPreferences("fhport", MODE_PRIVATE).edit()
                    .putString("tree", tree.toString()).apply();
            executor.execute(() -> validateAndExtract(tree));
        }
    }

    // ---------------------------------------------------------------------
    // Validación de la copia (solo estructura + huella; sin modificar nada)
    // ---------------------------------------------------------------------
    private void validateAndExtract(Uri tree) {
        DocumentFile root = DocumentFile.fromTreeUri(this, tree);
        if (root == null || !root.isDirectory()) {
            fail("No se pudo abrir la carpeta seleccionada.");
            return;
        }
        setStatus("Validando la copia…");

        DocumentFile pkg = root.findFile("package.json");
        DocumentFile www = root.findFile("www");
        if (pkg == null || www == null || !www.isDirectory()) {
            fail("No parece una copia de Fear & Hunger (falta package.json o www/).");
            return;
        }
        String pkgText = readText(pkg);
        if (pkgText == null || !pkgText.contains("www/index.html")) {
            fail("package.json inválido (no referencia www/index.html).");
            return;
        }
        DocumentFile sysJson = findPath(www, "data", "System.json");
        DocumentFile rpgCore = findPath(www, "js", "rpg_core.js");
        if (sysJson == null || rpgCore == null) {
            fail("Faltan data/System.json o js/rpg_core.js.");
            return;
        }
        String sysText = readText(sysJson);
        String coreText = readText(rpgCore);
        if (sysText == null || !sysText.contains(EXPECTED_VERSION_ID)) {
            fail("Versión de copia no soportada (versionId != " + EXPECTED_VERSION_ID + ").");
            return;
        }
        if (coreText == null || !coreText.contains("rpg_core.js v1.6.0")) {
            fail("No es RPG Maker MV 1.6.0.");
            return;
        }
        setStatus("Copia válida (versionId " + EXPECTED_VERSION_ID + "). Extrayendo…");
        // La extracción SAF puede tardar varios minutos: evitar que apague
        // la pantalla y ralentice (o interrumpa) la copia. (getWindow toca la
        // vista: validateAndExtract corre en hilo de pool → runOnUiThread.)
        runOnUiThread(() -> getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));

        // Extracción limpia previa
        deleteRecursively(new File(getFilesDir(), GAME_DIR));
        File gameDir = new File(getFilesDir(), GAME_DIR);
        File wwwOut = new File(gameDir, "www");
        if (!wwwOut.mkdirs() && !wwwOut.isDirectory()) {
            fail("No se pudo crear el directorio del juego.");
            return;
        }

        // Guardar el shim NW.js (inyectado en index.html) desde los assets
        try {
            byte[] shim = readAsset("shim-nw.js");
            writeBytes(new File(wwwOut, "shim-nw.js"), shim);
        } catch (Exception e) {
            fail("Error escribiendo shim-nw.js: " + e);
            return;
        }

        // Guardar android-compat.js (inyectado tras main.js): audio .ogg,
        // errores de audio no fatales, reanudación de AudioContext
        try {
            byte[] compat = readAsset("android-compat.js");
            writeBytes(new File(wwwOut, "android-compat.js"), compat);
        } catch (Exception e) {
            fail("Error escribiendo android-compat.js: " + e);
            return;
        }

        // Guardar android-touch.js (overlay de controles táctiles)
        try {
            byte[] touch = readAsset("android-touch.js");
            writeBytes(new File(wwwOut, "android-touch.js"), touch);
        } catch (Exception e) {
            fail("Error escribiendo android-touch.js: " + e);
            return;
        }

        long[] counters = {0, 0}; // archivos, bytes
        // Copiar el CONTENIDO de www/ hacia wwwOut (la raíz web es
        // filesDir/game/www; copiar el propio dir "www" anidaba www/www).
        for (DocumentFile child : www.listFiles()) {
            if (!copyTree(child, wwwOut, counters)) {
                fail("Error extrayendo los archivos del juego.");
                return;
            }
        }

        // Parchear index.html: shim ANTES de pixi.js (mismo approach que el PoC PC)
        File indexOut = new File(wwwOut, "index.html");
        String index = readTextFile(indexOut);
        if (index == null || !index.contains("shim-nw.js")) {
            String marker = "<script type=\"text/javascript\" "
                    + "src=\"js/libs/pixi.js\"></script>";
            if (index != null && index.contains(marker)) {
                index = index.replace(marker,
                        "    <script type=\"text/javascript\" src=\"shim-nw.js\"></script>\n"
                                + marker);
                writeTextFile(indexOut, index);
            } else {
                fail("index.html inesperado (no se encontró la referencia a pixi.js).");
                return;
            }
        }

        // Parchear index.html: compat + controles táctiles DESPUÉS de main.js
        index = readTextFile(indexOut);
        if (index != null && !index.contains("android-compat.js")) {
            String mainMarker = "<script type=\"text/javascript\" "
                    + "src=\"js/main.js\"></script>";
            if (index.contains(mainMarker)) {
                index = index.replace(mainMarker,
                        mainMarker + "\n"
                                + "    <script type=\"text/javascript\" "
                                + "src=\"android-compat.js\"></script>\n"
                                + "    <script type=\"text/javascript\" "
                                + "src=\"android-touch.js\"></script>");
                writeTextFile(indexOut, index);
            } else {
                fail("index.html inesperado (no se encontró la referencia a main.js).");
                return;
            }
        }

        // Importar saves PC → pending_saves (los inyecta GameActivity en localStorage)
        File pending = new File(getFilesDir(), PENDING_SAVES_DIR);
        deleteRecursively(pending);
        pending.mkdirs();
        DocumentFile saveDir = www.findFile("save");
        int saves = 0;
        if (saveDir != null && saveDir.isDirectory()) {
            for (DocumentFile f : saveDir.listFiles()) {
                String n = f.getName();
                if (n == null) continue;
                if (n.matches("(global|config|file[1-8])\\.rpgsave")) {
                    String content = readText(f);
                    if (content != null) {
                        writeTextFile(new File(pending, n.substring(0, n.length() - 8)),
                                content);
                        saves++;
                    }
                }
            }
        }
        new File(getFilesDir(), GAME_DIR + "/" + SAVES_IMPORTED_MARKER).delete();

        // Marcador de copia validada
        writeTextFile(new File(gameDir, VALIDATED_MARKER), EXPECTED_VERSION_ID);

        final int finalSaves = saves;
        runOnUiThread(() -> {
            status.setTextPlaceholder("Listo (" + counters[0] + " archivos, "
                    + (counters[1] / (1024 * 1024)) + " MB, "
                    + finalSaves + " saves PC importados). Abriendo el juego…");
            launchGame();
        });
    }

    // ---------------------------------------------------------------------
    // Copia recursiva www/ → filesDir/game/www (con filtros del plan)
    // ---------------------------------------------------------------------
    private boolean copyTree(DocumentFile src, File dstDir, long[] counters) {
        String name = src.getName();
        if (name == null) name = "";
        // Filtros: arte de modders y basura de macOS que arrastra la copia
        if (name.equals("js_copies") || name.equals("__MACOSX")
                || name.equals(".DS_Store") || name.equalsIgnoreCase("save")) {
            return true; // save/ se importa a parte (pending_saves)
        }
        if (src.isDirectory()) {
            File dir = new File(dstDir, name);
            if (!dir.mkdirs() && !dir.isDirectory()) return false;
            for (DocumentFile child : src.listFiles()) {
                if (!copyTree(child, dir, counters)) return false;
            }
            return true;
        } else {
            if (name.endsWith(".psd") || name.endsWith(".PSD")) return true;
            File out = new File(dstDir, name);
            try (android.content.res.AssetFileDescriptor afd =
                         getContentResolver().openAssetFileDescriptor(src.getUri(), "r")) {
                if (afd == null) return false;
                try (java.io.InputStream in = afd.createInputStream();
                     OutputStream os = new java.io.FileOutputStream(out)) {
                    byte[] buf = new byte[256 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        counters[1] += n;
                    }
                }
                counters[0]++;
                if (counters[0] % 200 == 0) {
                    final long mb = counters[1] / (1024 * 1024);
                    runOnUiThread(() -> status.setTextPlaceholder(
                            "Extrayendo… " + counters[0] + " archivos (" + mb + " MB)"));
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    private interface StatusSetter { void setTextPlaceholder(String s); }
    private final StatusSetter status = this::setStatus;

    private void setStatus(String s) { runOnUiThread(() -> statusView.setText(s)); }
    private void fail(String s) {
        runOnUiThread(() -> {
            statusView.setText("Error: " + s);
            progressBar.setVisibility(ProgressBar.GONE);
            pickButton.setEnabled(true);
        });
    }

    private void launchGame() {
        startActivity(new Intent(this, GameActivity.class));
        finish();
    }

    /**
     * Actualiza los archivos de runtime (shim + compat) tras una actualización
     * de la APK sin re-extracción: los archivos del juego no cambian, pero el
     * shim/compat puede haberse mejorado entre versiones.
     */
    private void refreshRuntime() {
        try {
            File www = new File(new File(getFilesDir(), GAME_DIR), "www");
            if (!www.isDirectory()) return;
            writeBytes(new File(www, "shim-nw.js"), readAsset("shim-nw.js"));
            writeBytes(new File(www, "android-compat.js"), readAsset("android-compat.js"));
            writeBytes(new File(www, "android-touch.js"), readAsset("android-touch.js"));
            File indexOut = new File(www, "index.html");
            String index = readTextFile(indexOut);
            if (index == null) return;
            boolean changed = false;
            if (!index.contains("shim-nw.js")) {
                String pixi = "<script type=\"text/javascript\" "
                        + "src=\"js/libs/pixi.js\"></script>";
                if (index.contains(pixi)) {
                    index = index.replace(pixi,
                            "    <script type=\"text/javascript\" src=\"shim-nw.js\"></script>\n"
                                    + pixi);
                    changed = true;
                }
            }
            if (!index.contains("android-compat.js") ||
                    !index.contains("android-touch.js")) {
                String main = "<script type=\"text/javascript\" "
                        + "src=\"js/main.js\"></script>";
                if (index.contains(main)) {
                    String inj = main;
                    if (!index.contains("android-compat.js")) {
                        inj += "\n    <script type=\"text/javascript\" "
                                + "src=\"android-compat.js\"></script>";
                    }
                    if (!index.contains("android-touch.js")) {
                        inj += "\n    <script type=\"text/javascript\" "
                                + "src=\"android-touch.js\"></script>";
                    }
                    index = index.replace(main, inj);
                    changed = true;
                }
            }
            if (changed) writeTextFile(indexOut, index);
        } catch (Exception ignored) {
            // Nunca bloquear el arranque por fallo de refresco
        }
    }

    private DocumentFile findPath(DocumentFile base, String... parts) {
        DocumentFile cur = base;
        for (String p : parts) {
            if (cur == null) return null;
            cur = cur.findFile(p);
        }
        return cur;
    }

    private String readText(DocumentFile f) {
        try (android.content.res.AssetFileDescriptor afd =
                     getContentResolver().openAssetFileDescriptor(f.getUri(), "r");
             BufferedReader r = new BufferedReader(new InputStreamReader(
                     afd.createInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = r.read(buf)) > 0) sb.append(buf, 0, n);
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private String readTextFile(File f) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new java.io.FileInputStream(f), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = r.read(buf)) > 0) sb.append(buf, 0, n);
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void writeTextFile(File f, String text) {
        try (OutputStream os = new java.io.FileOutputStream(f)) {
            os.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }

    private void writeBytes(File f, byte[] data) throws Exception {
        try (OutputStream os = new java.io.FileOutputStream(f)) {
            os.write(data);
        }
    }

    private byte[] readAsset(String name) throws Exception {
        try (java.io.InputStream in = getAssets().open(name)) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        }
    }

    private void deleteRecursively(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) for (File c : children) deleteRecursively(c);
        }
        f.delete();
    }
}
