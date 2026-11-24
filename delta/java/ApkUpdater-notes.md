# Android: yama ile APK güncelleme

Dosyalar: `FcDelta.java` (FCD1 uygulayıcı, saf Java 8) + `ApkPatchInstaller.java` (Android
yardımcısı). İkisini uygulamanın kaynağına `com/departuresmil/ortak/` altına kopyalayın
(ya da paket adını değiştirin). Dış bağımlılık yok; yalnızca `androidx.core` (FileProvider).
**androidx'siz kabuk** (Gradle'sız, apktool/aapt2+d8): `noandroidx/ApkPatchInstaller.java` + `noandroidx/FcApkProvider.java`
kullanın (aşağıda "androidx'siz sürüm").

## Akış

1. `latest.json` indir (`https://github.com/departures-mil/<repo>/releases/latest/download/latest.json`).
2. `version` > kurulu `BuildConfig.VERSION_NAME` ise:
   `a = assets.android`, `p = a.patches[VERSION_NAME]` (yoksa null).
3. Arka planda:
   ```java
   ApkPatchInstaller up = new ApkPatchInstaller(ctx, ctx.getPackageName() + ".fileprovider");
   String base = "https://github.com/departures-mil/" + REPO + "/releases/download/v" + version + "/";
   File apk = up.obtainApk(base + a.file, a.sha256, a.size,
                           p != null ? base + p.file : null,
                           p != null ? p.sha256 : null,
                           p != null ? p.size : 0, listener);
   ```
   - Yama modu: kurulu APK `getApplicationInfo().sourceDir` (ör.
     `/data/app/~~xyz/com.paket-1/base.apk`, uygulama kendisi okuyabilir) + yama →
     `cacheDir/updates/update.apk`. `FcDelta.apply` önce kaynağın SHA-256'sını, sonra sonucun
     SHA-256'sını başlıkla karşılaştırır; ayrıca sonuç `assets.android.sha256` ile karşılaştırılır.
   - Herhangi bir hata (yama yok, kurulu APK farklı — ör. Play'den/başka imzayla kurulmuş,
     split APK, ağ hatası, SHA uyuşmazlığı) → `listener.onPatchFailed(e)` ve otomatik **tam APK**.
4. Ana iş parçacığında `up.install(apk)` → paket yükleyici (FileProvider `content://` URI).
   Android 8+ izin yoksa "bilinmeyen kaynaklar" ayar ekranı açılır, `false` döner; kullanıcı
   dönünce (`onResume`) tekrar `install` çağırın.
5. Açılışta `up.cleanup()` ile eski dosyaları silin.

İlerleme göstergesi (SPEC): `listener.onProgress(patchMode, done, total, bps)` →
yüzde, "X.X MB / Y.Y MB", "kalan Z.Z MB", "N.N MB/sn"; `patchMode` iken
"yalnızca değişen kısımlar" / "changed parts only" / "الأجزاء المتغيرة فقط".

## Manifest gereksinimleri

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>

<application ...>
  <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true">
    <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
               android:resource="@xml/file_paths"/>
  </provider>
</application>
```

`res/xml/file_paths.xml`:
```xml
<paths>
  <cache-path name="updates" path="updates/"/>
</paths>
```

## Önemli notlar

- **İmza**: yama ile üretilen APK, CI'da imzalanmış APK'nın bayt bayt aynısıdır; imza
  bozulmaz. Tüm sürümler aynı anahtarla imzalanmalı (yoksa Android kurulumu reddeder).
- **Yama kaynağı imzalı son APK olmalı**: CI yamaları release'e yüklenen APK'lar arasında üretir.
  Kullanıcı APK'yı başka yerden kurduysa (farklı bayt) kaynak SHA-256 tutmaz → tam APK.
- **Split APK**: `splitSourceDirs` doluysa yama kullanılmaz (`canPatch()`), tam APK indirilir.
- **Bellek/disk**: `FcDelta.apply` ~1 MB bellek kullanır; disk için cacheDir'de yeni APK
  boyutu + yama boyutu kadar boş yer gerekir.
- **Süre**: uygulama ağırlıklı olarak disk okuma/yazma + SHA-256'dır (50 MB APK için orta
  seviye telefonda birkaç saniye). UI iş parçacığında çalıştırmayın.
- minSdk 21 önerilir (`splitSourceDirs` API 21). Kod Java 8 dil düzeyindedir, lambda yok.
- Kurulumdan sonra uygulama süreci yükleyici tarafından sonlandırılır; güncellenmiş sürüm
  ilk açılışta `cleanup()` çağırmalıdır.

## androidx'siz sürüm (`noandroidx/`)

Gradle'sız kabuklarda (kitaplik, organizer) androidx yok. `noandroidx/ApkPatchInstaller.java` aynı API'dir (ana dosyadan
`node delta/java/noandroidx/gen.js` ile üretilir, `delta/test/run.sh` güncelliğini denetler); APK'yı paket yükleyiciye
`content://<authority>/updates/<ad>.apk` adresiyle verir. Bu adresi `FcApkProvider` sunar (yalnız `cacheDir/updates/*.apk`, salt okunur):
```xml
<provider android:name="com.departuresmil.ortak.FcApkProvider" android:authorities="${applicationId}.guncelleme"
          android:exported="false" android:grantUriPermissions="true"/>
```
```java
ApkPatchInstaller up = new ApkPatchInstaller(ctx, ctx.getPackageName() + ".guncelleme");
```
`FcDelta.java` + iki dosya `com/departuresmil/ortak/` altına kopyalanır. Web arayüzü kullanılıyorsa indirme+kurulum Java'da yapılır ve
`FC.host.update.run(plan, ilerleme)` ile çekirdeğe bağlanır (bkz. `web/README.md` → Android).
