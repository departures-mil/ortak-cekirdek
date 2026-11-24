package android.net;
public abstract class Uri {
  public static Uri parse(String s) { return null; }
  public static Uri fromFile(java.io.File f) { return null; }
  public static String encode(String s) { return s; }
  public abstract java.util.List<String> getPathSegments();
}
