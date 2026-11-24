# Asistan Agent — Flutter / Dart

`fc_agent.dart` + `fc_agent_dil.dart` (ÜRETİLİR: `cd web && node tools/build-agent-dart.js`) uygulamanın `lib/services/` klasörüne kopyalanır.
Gerekenler: `http`, `shared_preferences`. `MaterialApp(scaffoldMessengerKey: FcAgent.messengerKey)`, AppBar'a `FcAgentButton()`,
Ayarlar'a `FcAgentCard()`, açılışta `FcAgent.instance.init(app:, version:, lang:, ai:)`. LAN eşitlemesi: `exportShare()/importShare()`.
