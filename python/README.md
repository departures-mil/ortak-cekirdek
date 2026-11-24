# Asistan Agent — Python / PySide6

`fc_agent.py` tek dosyadır; uygulamanın kaynak klasörüne kopyalanır. ÜRETİLİR: `cd web && node tools/build-agent-py.js`
(`fc_agent_src.py` + `web/js/agent.js` içindeki 3 dilli metinler). Kurallar ve veri biçimi web sürümüyle aynıdır;
aynı bilgisayardaki bütün programlar `%APPDATA%/FalconCekirdek/agent/` klasöründe sayaç paylaşır.

    import fc_agent
    ajan = fc_agent.Agent('bereket-defter', APP_VERSION, lang=lambda: LANG, ai=lambda: None)
    ajan.start(app, ana_pencere)            # ✦ düğmesi sağ altta, olay süzgeci, zamanlayıcılar
    ayarlar_layout.addWidget(ajan.card())   # "Admin ile iletişim"in önüne

Test: `QT_QPA_PLATFORM=offscreen python3 test_fc_agent.py`
