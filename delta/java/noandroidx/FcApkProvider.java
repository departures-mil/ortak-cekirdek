package com.departuresmil.ortak;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/**
 * androidx'siz ApkPatchInstaller'ın APK'yı paket yükleyiciye verdiği salt okunur ContentProvider.
 * Yalnız content://&lt;authority&gt;/updates/&lt;ad&gt;.apk → cacheDir/updates/&lt;ad&gt;.apk (başka dosya verilmez).
 * Kaynak: kitaplik / organizer UpdateFileProvider. Manifest:
 * <pre>
 * &lt;provider android:name="com.departuresmil.ortak.FcApkProvider" android:authorities="${paket}.guncelleme"
 *     android:exported="false" android:grantUriPermissions="true"/&gt;
 * </pre>
 */
public class FcApkProvider extends ContentProvider {
    /** "updates/&lt;ad&gt;.apk" yolu geçerli mi? (saf, test edilir) */
    public static boolean validName(List<String> seg) {
        return seg != null && seg.size() == 2 && "updates".equals(seg.get(0)) && seg.get(1) != null
                && seg.get(1).matches("[A-Za-z0-9._-]+\\.apk") && !seg.get(1).startsWith(".");
    }

    private File file(Uri u) throws FileNotFoundException {
        List<String> seg = u.getPathSegments();
        if (!validName(seg)) throw new FileNotFoundException();
        File f = new File(new File(getContext().getCacheDir(), "updates"), seg.get(1));
        if (!f.isFile()) throw new FileNotFoundException();
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(u), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri u, String[] p, String s, String[] a, String o) {
        try {
            File f = file(u);
            MatrixCursor c = new MatrixCursor(new String[]{"_display_name", "_size"});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (Exception e) {
            return null;
        }
    }

    @Override public String getType(Uri u) { return "application/vnd.android.package-archive"; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
