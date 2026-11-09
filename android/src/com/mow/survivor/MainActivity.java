package com.mow.survivor;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * 无尽割草 · 安卓壳。
 * 整个游戏是 assets 里的 HTML5 + Canvas，这里只负责全屏 WebView 容器、
 * 横屏锁定、保持常亮、文件选择（玩家导入自己的音乐）、
 * 返回键把「暂停 / 退出」的判定交给 JS（window.__onBack）。
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private static final int FILE_CHOOSER_CODE = 7701;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyFullscreenFlags();
        // 强制横屏（与 manifest 的 screenOrientation 一致，双保险）
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } catch (Throwable ignored) {
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#080b12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        try {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) {
            // 老版本 / 新版本行为差异，忽略
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.setWebViewClient(new WebViewClient() {
            // 外链一律不在 WebView 里打开：安装包走系统下载管理器，其它交给系统浏览器。
            // 注意：绝不能把正在加载的 WebView 塞进 WebViewTransport 去抢新窗口，
            // 那样会在部分机型上直接让 WebView 渲染进程崩溃（表现为点「下载新版 APK」闪退）。
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl() != null ? req.getUrl().toString() : null);
            }
        });
        // WebView 决定「下载」而不是「渲染」时（附件 / 安装包）走同一条处理
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (isApkUrl(url) || (mimeType != null && mimeType.contains("android.package-archive"))) {
                    startApkDownload(url);
                } else {
                    openExternal(url);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                android.util.Log.d("MOW", cm.message() + " @" + cm.lineNumber());
                return true;
            }

            // 玩家经 <input type="file" accept="audio/*"> 导入本地音乐
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_CODE);
                } catch (Throwable t) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
        hideSystemBars();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE) {
            if (filePathCallback == null) {
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    results = new Uri[]{uri};
                } else if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new Uri[n];
                    for (int i = 0; i < n; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            try {
                filePathCallback.onReceiveValue(results);
            } catch (Throwable ignored) {
            }
            filePathCallback = null;
            hideSystemBars();
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 统一处理外部链接：安装包交给系统下载管理器，其它交给系统浏览器。 */
    private boolean handleUrl(String url) {
        if (url == null || url.startsWith("file://")) return false;
        if (isApkUrl(url)) {
            startApkDownload(url);
            return true;
        }
        openExternal(url);
        return true;
    }

    /** 判断是不是「要下载安装包」的链接。 */
    private boolean isApkUrl(String url) {
        if (url == null) return false;
        String u = url.toLowerCase();
        int q = u.indexOf('?');
        if (q > 0) u = u.substring(0, q);
        return u.endsWith(".apk") || u.contains("/releases/download/");
    }

    /**
     * 用系统下载管理器下载新版本 APK：下载完点通知栏即可安装（覆盖安装，存档不丢），
     * 不离开游戏、也不依赖系统浏览器 —— 老版本「点下载闪退」就是浏览器跳转那条路引发的。
     */
    private void startApkDownload(String url) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                openExternal(url);
                return;
            }
            String name = "survivor-update.apk";
            String u = url;
            int q = u.indexOf('?');
            if (q > 0) u = u.substring(0, q);
            int slash = u.lastIndexOf('/');
            if (slash >= 0 && slash + 1 < u.length()) {
                String tail = u.substring(slash + 1);
                if (tail.toLowerCase().endsWith(".apk")) name = tail;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType("application/vnd.android.package-archive");
            req.setTitle("无尽割草 · 新版本");
            req.setDescription("下载完成后点通知栏安装，覆盖安装不会丢存档");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            dm.enqueue(req);
            toast("已开始下载新版本，完成后点通知栏安装");
        } catch (Throwable t) {
            // 个别机型没有可用的下载器，退回浏览器
            openExternal(url);
        }
    }

    /** 把外部 URL（公告链接、发布页等）交给系统浏览器打开；失败给一句提示，绝不崩。 */
    private void openExternal(String url) {
        try {
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Throwable t) {
            toast("无法打开链接，请在浏览器访问 github.com/gu0766964-beep/9178/releases");
        }
    }

    private void toast(String msg) {
        try {
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        } catch (Throwable ignored) {
        }
    }

    private void applyFullscreenFlags() {
        Window w = getWindow();
        w.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (getActionBar() != null) {
            getActionBar().hide();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // 交给游戏内逻辑：返回 true 表示已处理（暂停 / 关弹层），false 表示可以退出
        web.evaluateJavascript(
                "(function(){try{if(window.__onBack&&window.__onBack()){return '1';}"
                        + "return '0';}catch(e){return '0';}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || !value.contains("1")) {
                            MainActivity.super.onBackPressed();
                        }
                    }
                });
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
