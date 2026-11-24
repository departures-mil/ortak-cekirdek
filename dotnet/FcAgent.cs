// Asistan Agent — .NET / WinForms sürümü (ortak-cekirdek/dotnet/FcAgent.cs + FcAgentDil.cs).
// Web (web/js/agent.js) ve Python sürümüyle aynı kurallar, aynı 3 dilli metinler, aynı veri biçimi: aynı bilgisayardaki
// programlar %APPDATA%\FalconCekirdek\agent\<uygulama>@<cihaz>.json ile sayaç paylaşır; agent TÜM uygulamaları birlikte yorumlar.
// Yalnızca SAYILAR tutulur (etkin dakika, oturum, düğme adları, saatler); yazılan metin/kayıt içeriği asla okunmaz.
//   var ajan = new FcAgent.Agent("desktop-duzen", "1.0.12", () => Lang.Current);
//   ajan.Start(mainForm, tray);                // girdi süzgeci, zamanlayıcılar, düğme izleme, balon bildirimi
//   ajan.ShowPanel(owner); ajan.ShowSettings(owner);
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace FcAgent;

public sealed class Agent : IMessageFilter
{
    static readonly string[] Freq = { "instant", "daily", "weekly", "manual" };
    const int KeepDays = 60, MaxNotes = 60, IdleS = 120;
    readonly string app, version, file;
    readonly Func<string> langFn;
    readonly JsonObject dil;
    JsonObject d;
    DateTime lastInput = DateTime.Now;
    int streak;
    bool busy;
    NotifyIcon? tray;
    Form? main;
    readonly List<Action> redraw = new();
    public event Action? Changed;

    public Agent(string appId, string version, Func<string>? lang = null)
    {
        app = appId; this.version = version; langFn = lang ?? (() => "tr");
        dil = (JsonNode.Parse(Dil.Json) as JsonObject)!;
        var dir = Path.Combine(SharedBase(), "yerel", app);
        Directory.CreateDirectory(dir);
        file = Path.Combine(dir, "fc-agent.json");
        d = Load();
    }

    static string SharedBase() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FalconCekirdek");
    static string SharedDir() => Path.Combine(SharedBase(), "agent");
    static long NowMs() => DateTimeOffset.Now.ToUnixTimeMilliseconds();
    static string DayKey(DateTime? t = null) => (t ?? DateTime.Now).ToString("yyyy-MM-dd");
    static string DaysAgo(int n) => DayKey(DateTime.Now.AddDays(-n));
    static int I(JsonNode? n) { try { return n == null ? 0 : (int)n.GetValue<double>(); } catch { try { return n!.GetValue<int>(); } catch { return 0; } } }
    static long L(JsonNode? n) { try { return n == null ? 0 : (long)n.GetValue<double>(); } catch { try { return n!.GetValue<long>(); } catch { return 0; } } }

    JsonObject Load()
    {
        JsonObject o;
        try { o = (JsonNode.Parse(File.ReadAllText(file)) as JsonObject) ?? new JsonObject(); } catch { o = new JsonObject(); }
        o["cfg"] ??= new JsonObject(); o["peers"] ??= new JsonObject(); o["notes"] ??= new JsonArray();
        if (string.IsNullOrEmpty((string?)o["device"])) o["device"] = Guid.NewGuid().ToString("N")[..18];
        var m = o["mine"] as JsonObject;
        if (m == null || (string?)m["app"] != app)
            o["mine"] = new JsonObject { ["app"] = app, ["dev"] = (string?)o["device"], ["v"] = version, ["u"] = 0, ["days"] = new JsonObject(), ["tasks"] = new JsonObject() };
        return o;
    }

    void Save() { try { File.WriteAllText(file + ".tmp", d.ToJsonString()); File.Move(file + ".tmp", file, true); } catch { } }

    public string Lang { get { var l = (langFn() ?? "tr"); l = l.Length >= 2 ? l[..2].ToLowerInvariant() : "tr"; return dil.ContainsKey(l) ? l : "tr"; } }
    public bool Rtl => Lang == "ar";

    public string T(string k, params (string, object)[] v)
    {
        var s = (string?)dil[Lang]?[k] ?? (string?)dil["tr"]?[k] ?? k;
        foreach (var (a, b) in v) s = s.Replace("{" + a + "}", Convert.ToString(b, System.Globalization.CultureInfo.InvariantCulture));
        return s;
    }

    // ---------------------------------------------------------------- ayarlar
    JsonObject Cfg => (JsonObject)d["cfg"]!;
    public bool On => (bool?)Cfg["on"] ?? true;
    public bool Notify => (bool?)Cfg["notify"] ?? true;
    public bool Panel => (bool?)Cfg["panel"] ?? true;
    public string FreqV { get { var f = (string?)Cfg["freq"] ?? "daily"; return Array.IndexOf(Freq, f) >= 0 ? f : "daily"; } }
    List<string>? Apps => Cfg["apps"] is JsonArray a ? a.Select(x => (string)x!).ToList() : null;
    public void Set(string k, JsonNode? v) { Cfg[k] = v; Save(); Emit(); }
    string SrcKey => app + "@" + (string?)d["device"];

    // ---------------------------------------------------------------- kayıt
    JsonObject Mine => (JsonObject)d["mine"]!;
    JsonObject Today()
    {
        var days = (JsonObject)Mine["days"]!; var k = DayKey();
        if (days[k] is not JsonObject t) { t = new JsonObject { ["act"] = 0, ["ses"] = 0, ["mx"] = 0, ["a"] = new JsonObject(), ["h"] = new JsonArray(), ["err"] = 0 }; days[k] = t; }
        return t;
    }
    void StoreMine()
    {
        Mine["u"] = NowMs(); Mine["v"] = version;
        var days = (JsonObject)Mine["days"]!; var lim = DaysAgo(KeepDays);
        foreach (var k in days.Select(p => p.Key).Where(k => string.CompareOrdinal(k, lim) < 0).ToList()) days.Remove(k);
        Save();
    }
    public static string Clean(string? name)
    {
        var s = Regex.Replace(name ?? "", @"\s+", " ").Trim().Replace("&", "");
        s = Regex.Replace(s, @"[\w.+-]+@[\w-]+\.[\w.]+", "@");
        s = Regex.Replace(s, @"\d+([.,:/-]\d+)*", "#");
        return s.Length > 40 ? s[..40] : s;
    }
    public void Track(string? name, int n = 1)
    {
        if (!On) return;
        var k = Clean(name); if (k.Length == 0) return;
        if (Regex.IsMatch(k, @"^\W{0,3}\s*(e[sş]itle|sync|مزامن)", RegexOptions.IgnoreCase)) k = Regex.IsMatch(k, "wi.?fi|lan|qr", RegexOptions.IgnoreCase) ? "fc.sync.lan" : "fc.sync";
        var a = (JsonObject)Today()["a"]!;
        a[k] = I(a[k]) + n;
        if (a.Count > 120) a.Remove(a.OrderBy(p => I(p.Value)).First().Key);
        StoreMine();
    }
    public void Tick(bool? active = null)
    {
        if (!On) return;
        var act = active ?? ((DateTime.Now - lastInput).TotalSeconds < IdleS);
        if (!act) { streak = 0; return; }
        var t = Today(); var h = DateTime.Now.Hour; var arr = (JsonArray)t["h"]!;
        while (arr.Count <= h) arr.Add(0);
        t["act"] = I(t["act"]) + 1; arr[h] = I(arr[h]) + 1;
        streak++; if (streak > I(t["mx"])) t["mx"] = streak;
        StoreMine();
    }
    public void Input() => lastInput = DateTime.Now;
    public bool PreFilterMessage(ref Message m)
    {
        if (m.Msg == 0x100 || m.Msg == 0x201 || m.Msg == 0x204 || m.Msg == 0x20A) lastInput = DateTime.Now;
        return false;
    }

    // ---------------------------------------------------------------- paylaşım
    public int ImportShare(IEnumerable<JsonObject> list)
    {
        var p = (JsonObject)d["peers"]!; int n = 0;
        foreach (var s in list)
        {
            var a = (string?)s["app"]; var dv = (string?)s["dev"];
            if (a == null || dv == null || s["days"] is not JsonObject) continue;
            var k = a + "@" + dv; if (k == SrcKey) continue;
            if (p[k] is not JsonObject old || L(s["u"]) > L(old["u"])) { p[k] = JsonNode.Parse(s.ToJsonString()); n++; }
        }
        if (n > 0) { Save(); Emit(); }
        return n;
    }
    public void Share()
    {
        try
        {
            var dir = SharedDir(); Directory.CreateDirectory(dir);
            var f = Path.Combine(dir, Regex.Replace(SrcKey, @"[^\w@.-]", "_") + ".json");
            File.WriteAllText(f + ".tmp", Mine.ToJsonString()); File.Move(f + ".tmp", f, true);
            var list = new List<JsonObject>();
            foreach (var x in Directory.GetFiles(dir, "*.json").Take(200))
                try { if (JsonNode.Parse(File.ReadAllText(x)) is JsonObject o) list.Add(o); } catch { }
            ImportShare(list);
        }
        catch { }
    }

    // ---------------------------------------------------------------- analiz
    IEnumerable<JsonObject> Sources()
    {
        var apps = Apps;
        var all = new List<JsonObject> { Mine };
        all.AddRange(((JsonObject)d["peers"]!).Select(p => (JsonObject)p.Value!));
        return all.Where(s => apps == null || apps.Contains((string)s["app"]!));
    }
    public List<string> KnownApps()
    {
        var a = new List<string> { app };
        foreach (var p in (JsonObject)d["peers"]!) { var n = (string)p.Value!["app"]!; if (!a.Contains(n)) a.Add(n); }
        return a;
    }
    public string AppName(string id)
    {
        var s = (string?)dil[Lang]?["app." + id] ?? (string?)dil["tr"]?["app." + id];
        return s ?? System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(id.Replace('-', ' ').Replace('_', ' '));
    }

    sealed class AppSum { public int W, Pw, Ses, Err, Sync, Early; public Dictionary<string, int> A = new(); }
    sealed class Sum { public Dictionary<string, AppSum> Apps = new(); public int W, Pw, Mx; public int[] H = new int[24]; public HashSet<string> Days = new(); public List<(string app, string label, long since)> Tasks = new(); }

    Sum Summary()
    {
        var w0 = DaysAgo(6); var p0 = DaysAgo(13); var sm = new Sum();
        foreach (var s in Sources())
        {
            var an = (string)s["app"]!;
            if (!sm.Apps.TryGetValue(an, out var A)) sm.Apps[an] = A = new AppSum();
            foreach (var kv in (JsonObject)s["days"]!)
            {
                if (kv.Value is not JsonObject dd) continue;
                var act = I(dd["act"]);
                if (string.CompareOrdinal(kv.Key, w0) >= 0)
                {
                    A.W += act; A.Ses += I(dd["ses"]); A.Err += I(dd["err"]); sm.W += act;
                    if (act > 0) sm.Days.Add(kv.Key);
                    sm.Mx = Math.Max(sm.Mx, I(dd["mx"]));
                    if (dd["h"] is JsonArray h) for (int i = 0; i < h.Count && i < 24; i++) sm.H[i] += I(h[i]);
                    if (dd["a"] is JsonObject ac) foreach (var x in ac) { A.A[x.Key] = A.A.GetValueOrDefault(x.Key) + I(x.Value); if (x.Key.StartsWith("fc.sync")) A.Sync += I(x.Value); }
                }
                else if (string.CompareOrdinal(kv.Key, p0) >= 0) { A.Pw += act; sm.Pw += act; }
                else A.Early += act;
            }
            if (s["tasks"] is JsonObject ts) foreach (var t in ts) sm.Tasks.Add((an, (string?)t.Value?["label"] ?? t.Key, L(t.Value?["since"])));
        }
        return sm;
    }
    string Hm(int min) { var h = min / 60; var m = min % 60; return h > 0 ? T("hm", ("h", h), ("m", m)) : T("m", ("m", m)); }

    sealed record Rule(string Id, int Prio, string Key, (string, object)[] Vars);
    List<Rule> Rules(Sum sm)
    {
        var o = new List<Rule>();
        void Add(string id, int p, string k, params (string, object)[] v) => o.Add(new Rule(id, p, k, v));
        if (sm.W < 5 && sm.Pw < 5) { Add("start", 1, "r.start"); return o; }
        if (sm.Pw >= 30)
        {
            var ch = (int)Math.Round((sm.W - sm.Pw) * 100.0 / sm.Pw);
            if (ch >= 25) Add("up", 2, "r.up", ("p", ch), ("t", Hm(sm.W)));
            else if (ch <= -25) Add("down", 3, "r.down", ("p", -ch), ("t", Hm(sm.W)));
        }
        var used = sm.Apps.Where(x => x.Value.W > 0).OrderByDescending(x => x.Value.W).Select(x => x.Key).ToList();
        if (used.Count > 1 && sm.W > 0) Add("top", 2, "r.top", ("a", AppName(used[0])), ("p", (int)Math.Round(sm.Apps[used[0]].W * 100.0 / sm.W)), ("n", used.Count));
        var night = new[] { 23, 0, 1, 2, 3, 4 }.Sum(i => sm.H[i]);
        if (sm.W >= 60 && night * 1.0 / sm.W >= 0.2) Add("night", 4, "r.night", ("p", (int)Math.Round(night * 100.0 / sm.W)));
        if (sm.Mx >= 90) Add("break", 4, "r.break", ("t", Hm(sm.Mx)));
        var pv = sm.H.Max();
        if (pv > 0 && sm.W >= 120) { var pk = Array.IndexOf(sm.H, pv); Add("peak", 1, "r.peak", ("h", $"{pk:00}:00"), ("h2", $"{(pk + 1) % 24:00}:00")); }
        (string a, string x, int n)? rep = null;
        foreach (var (n, A) in sm.Apps)
        {
            var best = A.A.Where(x => !x.Key.StartsWith("fc.")).OrderByDescending(x => x.Value).FirstOrDefault();
            if (best.Key != null && best.Value >= 30 && (rep == null || best.Value > rep.Value.n)) rep = (n, best.Key, best.Value);
            if (A.Err >= 3) Add("err:" + n, 5, "r.err", ("a", AppName(n)), ("n", A.Err));
            if (A.W == 0 && A.Pw + A.Early >= 60) Add("idle:" + n, 1, "r.idle", ("a", AppName(n)));
            if (A.Ses >= 40 && A.W * 1.0 / A.Ses < 3) Add("frag:" + n, 2, "r.frag", ("a", AppName(n)), ("n", A.Ses));
        }
        if (rep != null) Add("rep:" + rep.Value.a, 3, "r.repeat", ("a", AppName(rep.Value.a)), ("x", rep.Value.x), ("n", rep.Value.n));
        var old = sm.Tasks.Where(t => NowMs() - t.since > 3L * 86400000).ToList();
        if (old.Count > 0) Add("tasks", 5, "r.tasks", ("n", old.Count), ("x", string.Join(", ", old.Take(3).Select(t => $"{t.label} ({AppName(t.app)})"))));
        if (sm.Days.Count >= 5) Add("streak", 1, "r.streak", ("n", sm.Days.Count));
        return o.OrderByDescending(r => r.Prio).ToList();
    }

    JsonArray Notes => (JsonArray)d["notes"]!;
    public int Unread => Notes.Count(n => !((bool?)n!["read"] ?? false));
    public string NoteText(JsonNode n)
    {
        var key = (string?)n["key"] ?? "";
        var s = (string?)dil[Lang]?[key] ?? (string?)dil["tr"]?[key] ?? key;
        if (n["vars"] is JsonObject v) foreach (var x in v) s = s.Replace("{" + x.Key + "}", x.Value?.ToString());
        return s;
    }
    List<JsonObject> AddNotes(List<Rule> rules)
    {
        var t = NowMs(); var fresh = new List<JsonObject>();
        foreach (var r in rules)
        {
            var vars = new JsonObject(); foreach (var (a, b) in r.Vars) vars[a] = Convert.ToString(b, System.Globalization.CultureInfo.InvariantCulture);
            var sig = r.Id + "|" + vars.ToJsonString();
            if (Notes.Any(n => (string?)n!["sig"] == sig && t - L(n!["t"]) < 3L * 86400000)) continue;
            var n = new JsonObject { ["id"] = t.ToString("x") + Random.Shared.Next(65535).ToString("x"), ["t"] = t, ["sig"] = sig, ["src"] = "offline", ["rid"] = r.Id, ["key"] = r.Key, ["vars"] = vars, ["prio"] = r.Prio, ["read"] = false };
            Notes.Insert(0, n); fresh.Add(n);
        }
        while (Notes.Count > MaxNotes) Notes.RemoveAt(Notes.Count - 1);
        Save();
        return fresh;
    }
    bool Due()
    {
        var last = DateTimeOffset.FromUnixTimeMilliseconds(L(d["lastRun"])).LocalDateTime; var now = DateTime.Now;
        return FreqV switch
        {
            "manual" => false,
            "instant" => (now - last).TotalMinutes >= 30,
            "weekly" => (now - last).TotalDays >= 7,
            _ => DayKey(last) != DayKey() && (now - last).TotalHours >= 12
        };
    }
    public List<JsonObject> Analyze(bool manual)
    {
        if (!On || busy) return new();
        busy = true;
        try
        {
            d["lastRun"] = NowMs(); Save();
            Share();
            var fresh = AddNotes(Rules(Summary()).Take(manual ? 6 : 4).ToList());
            Emit();
            if (fresh.Count > 0 && Notify && tray != null)
                try { tray.ShowBalloonTip(9000, T("title") + (fresh.Count > 1 ? $" ({fresh.Count})" : ""), NoteText(fresh.OrderByDescending(n => I(n["prio"])).First()), ToolTipIcon.Info); } catch { }
            return fresh;
        }
        finally { busy = false; }
    }

    // ---------------------------------------------------------------- başlat
    public void Start(Form mainForm, NotifyIcon? notify)
    {
        main = mainForm; tray = notify;
        Today()["ses"] = I(Today()["ses"]) + 1; StoreMine();
        Application.AddMessageFilter(this);
        var t1 = new System.Windows.Forms.Timer { Interval = 60000 };
        t1.Tick += (_, _) => Tick(mainForm.ContainsFocus && (DateTime.Now - lastInput).TotalSeconds < IdleS);
        t1.Start();
        var t2 = new System.Windows.Forms.Timer { Interval = 1800000 };
        t2.Tick += (_, _) => { Share(); if (On && Due()) Analyze(false); };
        t2.Start();
        var t3 = new System.Windows.Forms.Timer { Interval = 20000 };
        t3.Tick += (_, _) => { t3.Stop(); Share(); if (On && Due()) Analyze(false); };
        t3.Start();
        if (tray != null) tray.BalloonTipClicked += (_, _) => { if (Panel) ShowPanel(main); };
        HookButtons(mainForm);
    }
    void HookButtons(Control c)
    {
        foreach (Control x in c.Controls)
        {
            if (x is ButtonBase b && b.Tag as string != "fcAgent") b.Click += (_, _) => Track(string.IsNullOrWhiteSpace(b.Text) ? b.AccessibleName ?? b.Name : b.Text);
            HookButtons(x);
        }
        c.ControlAdded += (_, e) => { if (e.Control != null) HookButtons(e.Control); };
    }
    void Emit() { foreach (var r in redraw.ToList()) try { r(); } catch { } Changed?.Invoke(); }
    void MarkRead() { foreach (var n in Notes) n!["read"] = true; Save(); Emit(); }

    public void Clear()
    {
        d["peers"] = new JsonObject(); d["notes"] = new JsonArray(); d.Remove("lastRun");
        d["mine"] = new JsonObject { ["app"] = app, ["dev"] = (string?)d["device"], ["v"] = version, ["u"] = 0, ["days"] = new JsonObject(), ["tasks"] = new JsonObject() };
        Save();
        try { File.Delete(Path.Combine(SharedDir(), Regex.Replace(SrcKey, @"[^\w@.-]", "_") + ".json")); } catch { }
        Emit();
    }

    // ---------------------------------------------------------------- arayüz (koyu, Falcon renkleri)
    static readonly Color Bg = Color.FromArgb(15, 23, 42), Card = Color.FromArgb(30, 41, 59), Fg = Color.FromArgb(226, 232, 240), Sub = Color.FromArgb(148, 163, 184), Acc = Color.FromArgb(56, 189, 248);

    Form NewForm(string title, int w, int h)
    {
        var f = new Form
        {
            Text = "✦ " + title, Width = w, Height = h, StartPosition = FormStartPosition.CenterParent, BackColor = Bg, ForeColor = Fg,
            Font = new Font("Segoe UI", 9.5f), RightToLeft = Rtl ? RightToLeft.Yes : RightToLeft.No, RightToLeftLayout = Rtl, MinimizeBox = false, MaximizeBox = false,
        };
        return f;
    }
    static Label Lbl(string t, Font? f = null, Color? c = null) => new() { Text = t, AutoSize = true, MaximumSize = new Size(560, 0), ForeColor = c ?? Fg, Font = f ?? new Font("Segoe UI", 9.5f), Margin = new Padding(0, 4, 0, 4) };
    static Button Btn(string t, Color bg) => new() { Text = t, AutoSize = true, BackColor = bg, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Tag = "fcAgent", Padding = new Padding(8, 3, 8, 3), Margin = new Padding(0, 6, 8, 0) };

    public void ShowPanel(IWin32Window? owner)
    {
        using var f = NewForm(T("title"), 620, 640);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(14), BackColor = Bg };
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(12, 6, 12, 6), BackColor = Card };
        void Render()
        {
            flow.Controls.Clear();
            var sm = Summary();
            flow.Controls.Add(Lbl($"{T("week", ("t", Hm(sm.W)))} · {T("days", ("n", sm.Days.Count))} · {T("open", ("n", sm.Tasks.Count))}", new Font("Segoe UI Semibold", 10f)));
            var names = sm.Apps.Where(x => x.Value.W > 0).OrderByDescending(x => x.Value.W).Take(8).ToList();
            var mx = names.Count > 0 ? names[0].Value.W : 1;
            foreach (var (n, A) in names)
            {
                var row = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0, 2, 0, 2) };
                row.Controls.Add(new Label { Text = AppName(n), Width = 150, ForeColor = Fg });
                row.Controls.Add(new Panel { Width = Math.Max(8, 300 * A.W / mx), Height = 8, BackColor = Acc, Margin = new Padding(0, 6, 8, 0) });
                row.Controls.Add(new Label { Text = Hm(A.W), AutoSize = true, ForeColor = Sub });
                flow.Controls.Add(row);
            }
            flow.Controls.Add(Lbl(T("notes"), new Font("Segoe UI Semibold", 10f)));
            if (Notes.Count == 0) flow.Controls.Add(Lbl(T("none"), null, Sub));
            foreach (var n in Notes.Take(30))
            {
                var p = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, BackColor = Card, Padding = new Padding(10, 6, 10, 6), Margin = new Padding(0, 4, 0, 4), WrapContents = false };
                p.Controls.Add(Lbl(T("srcOff") + " · " + DateTimeOffset.FromUnixTimeMilliseconds(L(n!["t"])).LocalDateTime.ToString("dd.MM HH:mm"), new Font("Segoe UI", 8.5f), Sub));
                p.Controls.Add(Lbl(NoteText(n), new Font("Segoe UI", 9.5f, (bool?)n["read"] == true ? FontStyle.Regular : FontStyle.Bold)));
                flow.Controls.Add(p);
            }
        }
        Render();
        var an = Btn("⚡ " + T("analyze"), Color.FromArgb(37, 99, 235)); an.Click += (_, _) => { Analyze(true); Render(); };
        var cl = Btn("✕", Color.FromArgb(71, 85, 105)); cl.Click += (_, _) => f.Close();
        bottom.Controls.Add(an); bottom.Controls.Add(cl);
        f.Controls.Add(flow); f.Controls.Add(bottom);
        f.ShowDialog(owner);
        MarkRead();
    }

    public void ShowSettings(IWin32Window? owner)
    {
        using var f = NewForm(T("title"), 640, 700);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(16), BackColor = Bg };
        void Build()
        {
            flow.SuspendLayout(); flow.Controls.Clear();
            flow.Controls.Add(Lbl("✦ " + T("title"), new Font("Segoe UI Semibold", 12f)));
            flow.Controls.Add(Lbl(T("desc"), null, Sub));
            CheckBox Chk(string key, string label, bool val)
            {
                var c = new CheckBox { Text = label, Checked = val, AutoSize = true, MaximumSize = new Size(580, 0), ForeColor = Fg, Tag = "fcAgent", Margin = new Padding(0, 4, 0, 2) };
                c.CheckedChanged += (_, _) => { Set(key, c.Checked); f.BeginInvoke(Build); };
                return c;
            }
            flow.Controls.Add(Chk("on", T("on"), On));
            if (On)
            {
                flow.Controls.Add(Chk("notify", T("notify"), Notify));
                flow.Controls.Add(Chk("panel", T("panel"), Panel));
                flow.Controls.Add(Lbl(T("freq"), null, Sub));
                var cmb = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 260, Tag = "fcAgent" };
                foreach (var x in Freq) cmb.Items.Add(T("freq." + x));
                cmb.SelectedIndex = Array.IndexOf(Freq, FreqV);
                cmb.SelectedIndexChanged += (_, _) => Set("freq", Freq[cmb.SelectedIndex]);
                flow.Controls.Add(cmb);
                flow.Controls.Add(Lbl(T("apps"), new Font("Segoe UI Semibold", 10f)));
                var known = KnownApps(); var sel = Apps;
                foreach (var a in known)
                {
                    var c = new CheckBox { Text = AppName(a), Checked = sel == null || sel.Contains(a), AutoSize = true, ForeColor = Fg, Tag = "fcAgent" };
                    c.CheckedChanged += (_, _) =>
                    {
                        var cur = (Apps ?? known).Where(x => x != a).ToList(); if (c.Checked) cur.Add(a);
                        Set("apps", cur.Count >= KnownApps().Count ? null : new JsonArray(cur.Select(x => (JsonNode)x!).ToArray()));
                    };
                    flow.Controls.Add(c);
                }
                flow.Controls.Add(Lbl(T("appsHint"), new Font("Segoe UI", 8.5f), Sub));
                var sm = Summary();
                flow.Controls.Add(Lbl(T("status", ("t", Hm(sm.W)), ("n", Notes.Count), ("a", 0), ("m", 0)), new Font("Segoe UI", 8.5f), Sub));
                var row = new FlowLayoutPanel { AutoSize = true, WrapContents = true, MaximumSize = new Size(580, 0) };
                var b1 = Btn("⚡ " + T("analyze"), Color.FromArgb(37, 99, 235));
                b1.Click += (_, _) => { var fr = Analyze(true); MessageBox.Show(f, fr.Count > 0 ? T("newNotes", ("n", fr.Count)) : T("nothing"), T("title")); Build(); };
                var b2 = Btn("✦ " + T("showNotes"), Color.FromArgb(71, 85, 105)); b2.Click += (_, _) => ShowPanel(f);
                var b3 = Btn(T("clear"), Color.FromArgb(127, 29, 29));
                b3.Click += (_, _) => { if (MessageBox.Show(f, T("clearQ"), T("clear"), MessageBoxButtons.YesNo) == DialogResult.Yes) { Clear(); Build(); } };
                row.Controls.AddRange(new Control[] { b1, b2, b3 });
                flow.Controls.Add(row);
            }
            flow.Controls.Add(Lbl(T("privacy"), new Font("Segoe UI", 8.5f), Sub));
            flow.ResumeLayout();
        }
        Build();
        f.Controls.Add(flow);
        f.ShowDialog(owner);
    }

    /// <summary>Okunmamış sayısıyla düğme metni ("✦" ya da "✦ 3").</summary>
    public string ButtonText => "✦" + (Unread > 0 ? " " + Unread : "");
    public void OnRedraw(Action a) => redraw.Add(a);
}
