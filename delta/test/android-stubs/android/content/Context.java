package android.content;
public abstract class Context {
  public abstract Context getApplicationContext();
  public abstract java.io.File getCacheDir();
  public abstract android.content.pm.ApplicationInfo getApplicationInfo();
  public abstract android.content.pm.PackageManager getPackageManager();
  public abstract String getPackageName();
  public abstract void startActivity(Intent i);
}
