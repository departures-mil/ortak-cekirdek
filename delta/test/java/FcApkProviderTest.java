import com.departuresmil.ortak.FcApkProvider;
import java.util.Arrays;

/** FcApkProvider.validName: yalnız updates/<ad>.apk (delta/test/run.sh çalıştırır) */
public class FcApkProviderTest {
    static int fail = 0;
    static void is(boolean want, String... seg) {
        boolean got = FcApkProvider.validName(Arrays.asList(seg));
        if (got != want) { fail++; System.out.println("FAIL " + Arrays.toString(seg) + " -> " + got); }
    }
    public static void main(String[] a) {
        is(true, "updates", "Kitaplik-2.5.0.apk");
        is(true, "updates", "full_1.apk");
        is(false, "updates", "../x.apk");
        is(false, "updates", ".apk");
        is(false, "updates", "a.zip");
        is(false, "files", "a.apk");
        is(false, "updates", "a", "b.apk");
        is(false, "updates");
        if (FcApkProvider.validName(null)) fail++;
        System.out.println(fail == 0 ? "FcApkProviderTest OK" : "FcApkProviderTest FAIL " + fail);
        System.exit(fail == 0 ? 0 : 1);
    }
}
