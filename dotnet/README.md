# Asistan Agent — .NET / WinForms

`FcAgent.cs` + `FcAgentDil.cs` (ÜRETİLİR: `cd web && node tools/build-agent-net.js`) uygulamanın `src/` klasörüne kopyalanır.
`var ajan = new FcAgent.Agent("uygulama", surum, () => Lang.Current); ajan.Start(anaForm, tepsiSimgesi);`
Panel: `ajan.ShowPanel(this)`, ayarlar: `ajan.ShowSettings(this)`, düğme metni `ajan.ButtonText`.
Aynı bilgisayardaki programlarla `%APPDATA%\FalconCekirdek\agent` üzerinden paylaşım (web ve Python sürümleriyle aynı biçim).
