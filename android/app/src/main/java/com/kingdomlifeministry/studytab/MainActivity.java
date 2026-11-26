package com.kingdomlifeministry.studytab;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Kingdom Life Study - Tablet edition.
 *
 * The whole web app is bundled in assets/www and served to the WebView as if it
 * came from https://app.kingdom-life-ministry.com, so it needs no internet and
 * old Android never has to trust the site's security certificate. Notes,
 * highlights and installed books are kept by the WebView under that address.
 */
public class MainActivity extends Activity {

    static final String HOST = "app.kingdom-life-ministry.com";
    static final String START = "https://" + HOST + "/index.html";

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        web.addJavascriptInterface(new Bridge(), "KLAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    // ------------------------------------------------------------ serving ---

    private static String assetPath(Uri u) {
        String p = u.getPath();
        if (p == null || p.equals("") || p.equals("/")) p = "/index.html";
        p = Uri.decode(p);
        if (p.contains("..")) return null;
        return "www" + p;
    }

    private static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".txt") || p.endsWith(".xml")) return "text/plain";
        return "application/octet-stream";
    }

    private WebResourceResponse serve(String url) {
        Uri u = Uri.parse(url);
        if (!HOST.equalsIgnoreCase(u.getHost())) return null;   // everything else goes to the network
        String path = assetPath(u);
        if (path == null) return null;
        InputStream in;
        try {
            in = getAssets().open(path);
        } catch (IOException e) {
            return null;
        }
        String type = mime(path);
        String enc = type.startsWith("text/") || type.endsWith("json") || type.endsWith("javascript") ? "UTF-8" : null;
        if (Build.VERSION.SDK_INT >= 21) {
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            return new WebResourceResponse(type, enc, 200, "OK", h, in);
        }
        return new WebResourceResponse(type, enc, in);
    }

    private class Client extends WebViewClient {
        @SuppressWarnings("deprecation")
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serve(url);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
            return serve(req.getUrl().toString());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return route(req.getUrl().toString());
        }
    }

    /** true = handled outside the WebView */
    private boolean route(String url) {
        Uri u = Uri.parse(url);
        if (HOST.equalsIgnoreCase(u.getHost())) {
            String p = u.getPath() == null ? "" : u.getPath().toLowerCase();
            if (p.endsWith(".pdf")) { openPdf(u); return true; }
            return false;                                   // stays in the app
        }
        openOutside(u);
        return true;
    }

    private void openOutside(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            toast("No app on this tablet can open that link");
        }
    }

    /** Handout PDFs: copy the bundled file out and hand it to a PDF viewer. */
    private void openPdf(Uri u) {
        String path = assetPath(u);
        if (Build.VERSION.SDK_INT >= 24 || path == null) { openOutside(u); return; }
        try {
            File dir = new File(getExternalCacheDir(), "pdf");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("no cache dir");
            File out = new File(dir, new File(path).getName());
            InputStream in = getAssets().open(path);
            OutputStream os = new FileOutputStream(out);
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            in.close();
            os.close();
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.fromFile(out), "application/pdf");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (IOException e) {
            openOutside(u);
        } catch (ActivityNotFoundException e) {
            toast("Install a PDF viewer to open handouts");
        }
    }

    private void toast(final String msg) {
        ui.post(new Runnable() {
            @Override public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
        });
    }

    // ------------------------------------------------------------- bridge ---

    /** window.KLAndroid, used by legacy/boot.js for share and copy. */
    private class Bridge {
        @JavascriptInterface
        public void share(String title, String text, String url) {
            String body = text == null ? "" : text;
            if (url != null && url.length() > 0 && !body.contains(url)) body = body.length() > 0 ? body + "\n" + url : url;
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            if (title != null && title.length() > 0) i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.putExtra(Intent.EXTRA_TEXT, body);
            Intent chooser = Intent.createChooser(i, "Share");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { startActivity(chooser); } catch (ActivityNotFoundException e) { toast("Nothing to share with"); }
        }

        @JavascriptInterface
        public void copy(final String text) {
            ui.post(new Runnable() {
                @Override public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Kingdom Life Study", text));
                }
            });
        }
    }
}
