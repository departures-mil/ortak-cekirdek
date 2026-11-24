package com.departuresmil.ortak;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Android güncelleme yardımcısı: kurulu APK + FCD1 yama → yeni APK → paket yükleyici.
 * Yama yoksa ya da herhangi bir adım başarısız olursa otomatik olarak tam APK indirilir.
 *
 * ANDROIDX'SİZ SÜRÜM (Gradle'sız / apktool kabukları): FileProvider yerine FcApkProvider. ÜRETİLİR: delta/java/ApkPatchInstaller.java'dan
 * (node delta/java/noandroidx/gen.js; delta/test/run.sh denetler) — elle düzenlemeyin.
 *
 * ARKA PLAN İŞ PARÇACIĞINDA çağırın (ağ + disk). install() ana iş parçacığından çağrılabilir.
 * Ayrıntılar: ApkUpdater-notes.md
 */
public final class ApkPatchInstaller {

    /** İndirme/yama ilerlemesi. patchMode=true iken "yalnızca değişen kısımlar" gösterin. */
    public interface Listener {
        void onProgress(boolean patchMode, long done, long total, double bytesPerSec);
        /** Yama denendi ama başarısız oldu, tam dosyaya geçiliyor (günlük/telemetri için). */
        void onPatchFailed(Exception e);
    }

    private final Context ctx;
    private final String authority; // ör. context.getPackageName() + ".guncelleme" (FcApkProvider'ın authorities değeri)

    public ApkPatchInstaller(Context ctx, String authority) {
        this.ctx = ctx.getApplicationContext();
        this.authority = authority;
    }

    /** Güncelleme dosyalarının tutulduğu klasör (file_paths.xml: <cache-path name="updates" path="updates/"/>). */
    public File updatesDir() {
        File d = new File(ctx.getCacheDir(), "updates");
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    /**
     * Yeni APK'yı hazırlar. patchUrl null olabilir. Başarılıysa SHA-256'sı fullSha256 olan dosyayı döndürür.
     *
     * @param fullUrl    latest.json → assets.android.file için indirme adresi
     * @param fullSha256 latest.json → assets.android.sha256 (hex)
     * @param fullSize   latest.json → assets.android.size
     * @param patchUrl   latest.json → assets.android.patches[kuruluSürüm].file adresi (yoksa null)
     * @param patchSha256 patches[kuruluSürüm].sha256 (yama dosyasının kendi özeti)
     * @param patchSize  patches[kuruluSürüm].size
     */
    public File obtainApk(String fullUrl, String fullSha256, long fullSize,
                          String patchUrl, String patchSha256, long patchSize,
                          Listener listener) throws IOException {
        File dir = updatesDir();
        File out = new File(dir, "update.apk");
        if (out.exists() && fullSha256.equalsIgnoreCase(FcDelta.hex(FcDelta.sha256(out)))) return out; // önceden hazır

        if (patchUrl != null && canPatch()) {
            File patch = new File(dir, "update.patch");
            try {
                download(patchUrl, patch, patchSize, true, listener);
                if (patchSha256 != null && !patchSha256.equalsIgnoreCase(FcDelta.hex(FcDelta.sha256(patch))))
                    throw new IOException("yama dosyası bozuk indi");
                File installed = new File(ctx.getApplicationInfo().sourceDir);
                FcDelta.Header h = FcDelta.apply(installed, patch, out, null);
                if (!fullSha256.equalsIgnoreCase(h.dstSha256Hex()))
                    throw new IOException("yama başka bir sürüm üretiyor");
                return out;
            } catch (Exception e) {
                out.delete();
                if (listener != null) listener.onPatchFailed(e);
            } finally {
                patch.delete();
            }
        }

        // Tam APK'ya geri dönüş
        download(fullUrl, out, fullSize, false, listener);
        if (!fullSha256.equalsIgnoreCase(FcDelta.hex(FcDelta.sha256(out)))) {
            out.delete();
            throw new IOException("indirilen APK SHA-256 uyuşmuyor");
        }
        return out;
    }

    /** Split APK (App Bundle) kurulumlarında tek sourceDir yeni APK'yı temsil etmez → yama kullanılamaz. */
    public boolean canPatch() {
        ApplicationInfo ai = ctx.getApplicationInfo();
        if (ai.sourceDir == null || !new File(ai.sourceDir).canRead()) return false;
        return Build.VERSION.SDK_INT < 21 || ai.splitSourceDirs == null || ai.splitSourceDirs.length == 0;
    }

    /**
     * Paket yükleyiciyi açar. Android 8+ "bilinmeyen kaynaklardan yükleme" izni yoksa önce ayarlar
     * ekranını açar ve false döndürür (kullanıcı izin verip geri dönünce tekrar çağırın).
     */
    public boolean install(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            return false;
        }
        Uri uri;
        Intent i = new Intent(Intent.ACTION_VIEW);
        if (Build.VERSION.SDK_INT >= 24) {
            // androidx'siz: FcApkProvider (aynı klasörde) content://<authority>/updates/<dosya> → cacheDir/updates/<dosya>
            uri = Uri.parse("content://" + authority + "/updates/" + Uri.encode(apk.getName()));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            uri = Uri.fromFile(apk);
        }
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /** Eski güncelleme dosyalarını temizler (uygulama açılışında çağırın). */
    public void cleanup() {
        File[] fs = updatesDir().listFiles();
        if (fs != null) for (File f : fs) f.delete();
    }

    private void download(String url, File dest, long expectedSize, boolean patchMode, Listener l) throws IOException {
        File part = new File(dest.getPath() + ".part");
        HttpURLConnection c = null;
        InputStream in = null;
        OutputStream out = null;
        try {
            URL u = new URL(url);
            // GitHub release adresleri başka bir alana (objects.githubusercontent.com) yönlendirir;
            // https→https yönlendirmeyi HttpURLConnection kendisi izler.
            c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "ortak-cekirdek-updater");
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code + " " + url);
            long total = c.getContentLength() > 0 ? c.getContentLength() : expectedSize;
            in = c.getInputStream();
            out = new FileOutputStream(part);
            byte[] buf = new byte[64 * 1024];
            long done = 0, t0 = System.nanoTime(), lastReport = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                long now = System.nanoTime();
                if (l != null && (now - lastReport > 200_000_000L || done == total)) {
                    double secs = Math.max(1e-3, (now - t0) / 1e9);
                    l.onProgress(patchMode, done, total, done / secs);
                    lastReport = now;
                }
            }
            out.close();
            out = null;
            if (expectedSize > 0 && part.length() != expectedSize) throw new IOException("eksik indirme");
            if (dest.exists()) dest.delete();
            if (!part.renameTo(dest)) throw new IOException("taşınamadı: " + dest);
        } finally {
            if (in != null) try { in.close(); } catch (IOException ignored) { }
            if (out != null) try { out.close(); } catch (IOException ignored) { }
            if (c != null) c.disconnect();
            part.delete();
        }
    }
}
