package android.content;
public class Intent {
  public static final String ACTION_VIEW = "android.intent.action.VIEW";
  public static final int FLAG_GRANT_READ_URI_PERMISSION = 1, FLAG_ACTIVITY_NEW_TASK = 0x10000000;
  public Intent(String a) {}
  public Intent(String a, android.net.Uri u) {}
  public Intent addFlags(int f) { return this; }
  public Intent setDataAndType(android.net.Uri u, String t) { return this; }
}
