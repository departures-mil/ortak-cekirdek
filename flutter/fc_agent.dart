// Asistan Agent — Flutter / Dart sürümü (ortak-cekirdek/flutter/fc_agent.dart + fc_agent_dil.dart).
// Web (web/js/agent.js), Python ve .NET sürümleriyle aynı kurallar, aynı 3 dilli metinler, aynı veri biçimi.
// Yalnızca SAYILAR tutulur (etkin dakika, oturum, sekme/düğme adları, saatler); yazılan metin/kayıt içeriği okunmaz.
//   await FcAgent.instance.init(app: 'kalori-hesaplayici', version: '1.0.12', lang: () => Settings.instance.lang,
//                               ai: () => key.isEmpty ? null : {'provider': 'gemini', 'key': key});
//   FcAgentButton() (AppBar), FcAgentCard() (Ayarlar), FcAgent.instance.track('Sekme: Ajanda')
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'fc_agent_dil.dart';

const _freq = ['instant', 'daily', 'weekly', 'manual'];

class FcAgent extends ChangeNotifier with WidgetsBindingObserver {
  FcAgent._();
  static final FcAgent instance = FcAgent._();
  static final GlobalKey<ScaffoldMessengerState> messengerKey = GlobalKey<ScaffoldMessengerState>();

  late SharedPreferences _p;
  late Map<String, dynamic> _dil;
  Map<String, dynamic> d = {};
  String app = 'app', version = '';
  String Function() _lang = () => 'tr';
  Map<String, String>? Function()? _ai;
  DateTime _lastInput = DateTime.now();
  int _streak = 0;
  bool _busy = false, _ready = false, _fg = true;
  Timer? _t1, _t2;

  Future<void> init({required String app, String version = '', String Function()? lang, Map<String, String>? Function()? ai}) async {
    if (_ready) return;
    this.app = app;
    this.version = version;
    if (lang != null) _lang = lang;
    _ai = ai;
    _dil = jsonDecode(fcAgentDilJson) as Map<String, dynamic>;
    _p = await SharedPreferences.getInstance();
    try {
      d = jsonDecode(_p.getString('fc.agent') ?? '{}') as Map<String, dynamic>;
    } catch (_) {
      d = {};
    }
    d['cfg'] ??= <String, dynamic>{};
    d['notes'] ??= <dynamic>[];
    d['peers'] ??= <String, dynamic>{};
    if ((d['device'] ?? '') == '') {
      final r = Random();
      d['device'] = List.generate(18, (_) => '0123456789abcdef'[r.nextInt(16)]).join();
    }
    final m = d['mine'];
    if (m is! Map || m['app'] != app) {
      d['mine'] = {'app': app, 'dev': d['device'], 'v': version, 'u': 0, 'days': <String, dynamic>{}, 'tasks': <String, dynamic>{}};
    }
    _ready = true;
    final t = _today();
    t['ses'] = _i(t['ses']) + 1;
    _storeMine();
    WidgetsBinding.instance.addObserver(this);
    _t1 = Timer.periodic(const Duration(minutes: 1), (_) => tick());
    _t2 = Timer.periodic(const Duration(minutes: 30), (_) => schedule());
    Timer(const Duration(seconds: 20), schedule);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _fg = state == AppLifecycleState.resumed;
    if (_fg) input();
  }

  // ------------------------------------------------------------ yardımcılar
  static int _i(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? 0}') ?? 0;
  static String _dk([DateTime? t]) {
    final x = t ?? DateTime.now();
    return '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
  }

  static String _ago(int n) => _dk(DateTime.now().subtract(Duration(days: n)));
  static int _now() => DateTime.now().millisecondsSinceEpoch;

  String get lang {
    final l = _lang();
    final s = l.length >= 2 ? l.substring(0, 2).toLowerCase() : 'tr';
    return _dil.containsKey(s) ? s : 'tr';
  }

  bool get rtl => lang == 'ar';

  String t(String k, [Map<String, Object> v = const {}]) {
    var s = ((_dil[lang] as Map)[k] ?? (_dil['tr'] as Map)[k] ?? k).toString();
    v.forEach((a, b) => s = s.replaceAll('{$a}', '$b'));
    return s;
  }

  void _save() => _p.setString('fc.agent', jsonEncode(d));

  // ------------------------------------------------------------ ayarlar
  Map<String, dynamic> get _cfg => d['cfg'] as Map<String, dynamic>;
  bool get on => _ready && (_cfg['on'] ?? true) == true;
  bool get notify => (_cfg['notify'] ?? true) == true;
  bool get panel => (_cfg['panel'] ?? true) == true;
  bool get aiOn => (_cfg['ai'] ?? true) == true;
  String get freq => _freq.contains(_cfg['freq']) ? _cfg['freq'] as String : 'daily';
  void configure(String k, Object? v) {
    _cfg[k] = v;
    _save();
    notifyListeners();
  }

  // ------------------------------------------------------------ kayıt
  Map<String, dynamic> get _mine => d['mine'] as Map<String, dynamic>;
  Map<String, dynamic> _today() {
    final days = _mine['days'] as Map<String, dynamic>;
    return (days[_dk()] ??= <String, dynamic>{'act': 0, 'ses': 0, 'mx': 0, 'a': <String, dynamic>{}, 'h': <dynamic>[], 'err': 0}) as Map<String, dynamic>;
  }

  void _storeMine() {
    _mine['u'] = _now();
    _mine['v'] = version;
    final days = _mine['days'] as Map<String, dynamic>;
    final lim = _ago(60);
    days.removeWhere((k, _) => k.compareTo(lim) < 0);
    _save();
  }

  static String clean(String? name) {
    var s = (name ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
    s = s.replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.]+'), '@').replaceAll(RegExp(r'\d+([.,:/-]\d+)*'), '#');
    return s.length > 40 ? s.substring(0, 40) : s;
  }

  void track(String? name, [int n = 1]) {
    if (!on) return;
    final k = clean(name);
    if (k.isEmpty) return;
    final a = _today()['a'] as Map<String, dynamic>;
    a[k] = _i(a[k]) + n;
    _storeMine();
    if (freq == 'instant') schedule();
  }

  void input() => _lastInput = DateTime.now();

  void tick() {
    if (!on) return;
    if (!_fg || DateTime.now().difference(_lastInput).inSeconds >= 120) {
      _streak = 0;
      return;
    }
    final day = _today();
    final h = DateTime.now().hour;
    final arr = day['h'] as List<dynamic>;
    while (arr.length <= h) {
      arr.add(0);
    }
    day['act'] = _i(day['act']) + 1;
    arr[h] = _i(arr[h]) + 1;
    _streak++;
    if (_streak > _i(day['mx'])) day['mx'] = _streak;
    _storeMine();
  }

  // ------------------------------------------------------------ paylaşım (LAN eşitlemesi için)
  Map<String, dynamic> exportShare() => {'schema': 1, 'sources': [_mine, ...(d['peers'] as Map).values]};
  int importShare(Object? obj) {
    final list = obj is Map ? (obj['sources'] as List? ?? [obj]) : (obj is List ? obj : const []);
    final p = d['peers'] as Map<String, dynamic>;
    final me = '$app@${d['device']}';
    var n = 0;
    for (final s in list) {
      if (s is! Map || s['app'] == null || s['dev'] == null || s['days'] is! Map) continue;
      final k = '${s['app']}@${s['dev']}';
      if (k == me) continue;
      if (p[k] == null || _i(s['u']) > _i((p[k] as Map)['u'])) {
        p[k] = Map<String, dynamic>.from(s);
        n++;
      }
    }
    if (n > 0) {
      _save();
      notifyListeners();
    }
    return n;
  }

  // ------------------------------------------------------------ analiz
  String appName(String id) {
    final k = 'app.$id';
    final v = (_dil[lang] as Map)[k] ?? (_dil['tr'] as Map)[k];
    if (v != null) return v.toString();
    return id.replaceAll(RegExp('[-_]'), ' ');
  }

  List<String> knownApps() {
    final a = <String>[app];
    for (final s in (d['peers'] as Map).values) {
      final n = (s as Map)['app'].toString();
      if (!a.contains(n)) a.add(n);
    }
    return a;
  }

  Map<String, dynamic> summary() {
    final w0 = _ago(6), p0 = _ago(13);
    final apps = <String, Map<String, dynamic>>{};
    final h = List<int>.filled(24, 0);
    final days = <String>{};
    final tasks = <Map<String, dynamic>>[];
    var w = 0, pw = 0, mx = 0;
    final sel = _cfg['apps'] is List ? List<String>.from(_cfg['apps'] as List) : null;
    final srcs = [_mine, ...(d['peers'] as Map).values.map((e) => Map<String, dynamic>.from(e as Map))];
    for (final s in srcs) {
      final an = s['app'].toString();
      if (sel != null && !sel.contains(an)) continue;
      final A = apps.putIfAbsent(an, () => {'w': 0, 'pw': 0, 'ses': 0, 'err': 0, 'early': 0, 'a': <String, int>{}});
      (s['days'] as Map).forEach((k, v) {
        final dd = v as Map;
        final act = _i(dd['act']);
        if ((k as String).compareTo(w0) >= 0) {
          A['w'] = _i(A['w']) + act;
          A['ses'] = _i(A['ses']) + _i(dd['ses']);
          A['err'] = _i(A['err']) + _i(dd['err']);
          w += act;
          if (act > 0) days.add(k);
          mx = max(mx, _i(dd['mx']));
          final hh = (dd['h'] as List?) ?? const [];
          for (var i = 0; i < hh.length && i < 24; i++) {
            h[i] += _i(hh[i]);
          }
          ((dd['a'] as Map?) ?? const {}).forEach((x, y) {
            final aa = A['a'] as Map<String, int>;
            aa['$x'] = (aa['$x'] ?? 0) + _i(y);
          });
        } else if (k.compareTo(p0) >= 0) {
          A['pw'] = _i(A['pw']) + act;
          pw += act;
        } else {
          A['early'] = _i(A['early']) + act;
        }
      });
      ((s['tasks'] as Map?) ?? const {}).forEach((k, v) => tasks.add({'app': an, 'label': (v as Map)['label'] ?? k, 'since': _i(v['since'])}));
    }
    return {'apps': apps, 'w': w, 'pw': pw, 'mx': mx, 'h': h, 'days': days, 'tasks': tasks};
  }

  String hm(int m) => m >= 60 ? t('hm', {'h': m ~/ 60, 'm': m % 60}) : t('m', {'m': m});

  List<Map<String, dynamic>> rules([Map<String, dynamic>? smIn]) {
    final sm = smIn ?? summary();
    final out = <Map<String, dynamic>>[];
    void add(String id, int prio, String key, [Map<String, Object> v = const {}]) => out.add({'id': id, 'prio': prio, 'key': key, 'vars': v});
    final w = sm['w'] as int, pw = sm['pw'] as int, mx = sm['mx'] as int;
    final h = sm['h'] as List<int>;
    final apps = sm['apps'] as Map<String, Map<String, dynamic>>;
    if (w < 5 && pw < 5) {
      add('start', 1, 'r.start');
      return out;
    }
    if (pw >= 30) {
      final ch = ((w - pw) / pw * 100).round();
      if (ch >= 25) add('up', 2, 'r.up', {'p': ch, 't': hm(w)});
      if (ch <= -25) add('down', 3, 'r.down', {'p': -ch, 't': hm(w)});
    }
    final used = apps.keys.where((n) => _i(apps[n]!['w']) > 0).toList()..sort((a, b) => _i(apps[b]!['w']) - _i(apps[a]!['w']));
    if (used.length > 1 && w > 0) add('top', 2, 'r.top', {'a': appName(used[0]), 'p': (_i(apps[used[0]]!['w']) / w * 100).round(), 'n': used.length});
    final night = [23, 0, 1, 2, 3, 4].fold<int>(0, (a, i) => a + h[i]);
    if (w >= 60 && night / w >= 0.2) add('night', 4, 'r.night', {'p': (night / w * 100).round()});
    if (mx >= 90) add('break', 4, 'r.break', {'t': hm(mx)});
    final pv = h.reduce(max);
    if (pv > 0 && w >= 120) {
      final pk = h.indexOf(pv);
      add('peak', 1, 'r.peak', {'h': '${pk.toString().padLeft(2, '0')}:00', 'h2': '${((pk + 1) % 24).toString().padLeft(2, '0')}:00'});
    }
    String? repA, repX;
    var repN = 0;
    apps.forEach((n, A) {
      final aa = A['a'] as Map<String, int>;
      aa.forEach((x, c) {
        if (!x.startsWith('fc.') && c >= 30 && c > repN) {
          repA = n;
          repX = x;
          repN = c;
        }
      });
      if (_i(A['err']) >= 3) add('err:$n', 5, 'r.err', {'a': appName(n), 'n': _i(A['err'])});
      if (_i(A['w']) == 0 && _i(A['pw']) + _i(A['early']) >= 60) add('idle:$n', 1, 'r.idle', {'a': appName(n)});
      if (_i(A['ses']) >= 40 && _i(A['w']) / _i(A['ses']) < 3) add('frag:$n', 2, 'r.frag', {'a': appName(n), 'n': _i(A['ses'])});
    });
    if (repA != null) add('rep:$repA', 3, 'r.repeat', {'a': appName(repA!), 'x': repX!, 'n': repN});
    final tasks = sm['tasks'] as List<Map<String, dynamic>>;
    final old = tasks.where((x) => _now() - _i(x['since']) > 3 * 86400000).toList();
    if (old.isNotEmpty) add('tasks', 5, 'r.tasks', {'n': old.length, 'x': old.take(3).map((x) => '${x['label']} (${appName('${x['app']}')})').join(', ')});
    final dn = (sm['days'] as Set<String>).length;
    if (dn >= 5) add('streak', 1, 'r.streak', {'n': dn});
    out.sort((a, b) => _i(b['prio']) - _i(a['prio']));
    return out;
  }

  List<dynamic> get notes => d['notes'] as List<dynamic>;
  int get unread => notes.where((n) => (n as Map)['read'] != true).length;
  String noteText(Map n) {
    final tx = n['text'];
    if (tx is Map) return (tx[lang] ?? tx.values.first).toString();
    if (tx is String) return tx;
    final v = <String, Object>{};
    ((n['vars'] as Map?) ?? const {}).forEach((a, b) => v['$a'] = '$b');
    return t('${n['key']}', v);
  }

  List<Map<String, dynamic>> _addNotes(List<Map<String, dynamic>> list, String src) {
    final now = _now();
    final fresh = <Map<String, dynamic>>[];
    for (final r in list) {
      final sig = '${r['id']}|${jsonEncode(r['vars'] ?? r['text'] ?? '')}';
      if (notes.any((n) => (n as Map)['sig'] == sig && now - _i(n['t']) < 3 * 86400000)) continue;
      final n = <String, dynamic>{'id': '${now.toRadixString(36)}${Random().nextInt(9999)}', 't': now, 'sig': sig, 'src': src, 'rid': r['id'],
        'key': r['key'], 'vars': r['vars'], 'text': r['text'], 'prio': r['prio'] ?? 2, 'read': false};
      notes.insert(0, n);
      fresh.add(n);
    }
    while (notes.length > 60) {
      notes.removeLast();
    }
    _save();
    return fresh;
  }

  int get aiToday => (d['ai'] is Map && (d['ai'] as Map)['d'] == _dk()) ? _i((d['ai'] as Map)['n']) : 0;
  Map<String, String>? get _aiCfg {
    try {
      final a = _ai?.call();
      return (a != null && (a['key'] ?? '').isNotEmpty && a['provider'] == 'gemini') ? a : null;
    } catch (_) {
      return null;
    }
  }

  bool get hasAi => _aiCfg != null;

  Future<List<Map<String, dynamic>>> _askAi(Map<String, dynamic> sm) async {
    final a = _aiCfg!;
    final L = {'tr': 'Türkçe', 'en': 'English', 'ar': 'العربية'}[lang]!;
    final apps = <String, dynamic>{};
    (sm['apps'] as Map<String, Map<String, dynamic>>).forEach((n, A) {
      final aa = A['a'] as Map<String, int>;
      final top = aa.keys.toList()..sort((x, y) => aa[y]! - aa[x]!);
      apps[appName(n)] = {'weekMin': A['w'], 'prevWeekMin': A['pw'], 'sessions': A['ses'], 'topActions': top.take(8).map((k) => '$k ×${aa[k]}').toList()};
    });
    final digest = {'weekMin': sm['w'], 'prevWeekMin': sm['pw'], 'activeDays': (sm['days'] as Set).length, 'longestStretchMin': sm['mx'], 'minutesByHour': sm['h'], 'apps': apps};
    final p = 'You are a friendly productivity coach inside a set of free desktop/mobile apps. Below are anonymous usage COUNTS (no content) '
        'of one person across their apps over the last 7 days compared to the 7 days before. Write 3 to 5 short, concrete, encouraging suggestions '
        'to improve how they work (focus, breaks, routines, using features better). Each suggestion max 2 sentences, in $L. '
        'Answer ONLY with a JSON array of strings.\n\n${jsonEncode(digest)}';
    d['ai'] = {'d': _dk(), 'n': aiToday + 1};
    _save();
    final model = a['model'] ?? 'gemini-flash-latest';
    final r = await http
        .post(Uri.parse('https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=${a['key']}'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'contents': [
                {'parts': [{'text': p}]}
              ]
            }))
        .timeout(const Duration(seconds: 40));
    if (r.statusCode != 200) throw Exception('HTTP_${r.statusCode}');
    final j = jsonDecode(utf8.decode(r.bodyBytes)) as Map;
    final s = (((j['candidates'] as List).first as Map)['content']['parts'] as List).first['text'].toString();
    final m = RegExp(r'\[[\s\S]*\]').firstMatch(s);
    List<dynamic> arr;
    try {
      arr = jsonDecode(m != null ? m.group(0)! : s) as List<dynamic>;
    } catch (_) {
      arr = s.split('\n');
    }
    final list = arr.map((x) => '$x'.trim()).where((x) => x.isNotEmpty).take(5).toList();
    if (list.isEmpty) throw Exception('EMPTY');
    var i = 0;
    return list.map((x) => <String, dynamic>{'id': 'ai${i++}', 'prio': 3, 'text': {lang: x.length > 400 ? x.substring(0, 400) : x}}).toList();
  }

  bool _due() {
    final last = DateTime.fromMillisecondsSinceEpoch(_i(d['lastRun']));
    final now = DateTime.now();
    switch (freq) {
      case 'manual':
        return false;
      case 'instant':
        return now.difference(last).inMinutes >= 30;
      case 'weekly':
        return now.difference(last).inDays >= 7;
      default:
        return _dk(last) != _dk() && now.difference(last).inHours >= 12;
    }
  }

  void schedule() {
    if (on && _due()) analyze();
  }

  Future<List<Map<String, dynamic>>> analyze({bool manual = false}) async {
    if (!on || _busy) return [];
    _busy = true;
    var fresh = <Map<String, dynamic>>[];
    try {
      d['lastRun'] = _now();
      final sm = summary();
      fresh = _addNotes(rules(sm).take(manual ? 6 : 4).toList(), 'offline');
      if (aiOn && hasAi && aiToday < 4) {
        try {
          fresh = [...fresh, ..._addNotes(await _askAi(sm), 'ai')];
        } catch (_) {}
      }
    } finally {
      _busy = false;
    }
    notifyListeners();
    if (fresh.isNotEmpty && notify) {
      final top = (fresh.toList()..sort((a, b) => _i(b['prio']) - _i(a['prio']))).first;
      messengerKey.currentState?.showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Text('✦ ${t('title')}${fresh.length > 1 ? ' (${fresh.length})' : ''}: ${noteText(top)}'),
      ));
    }
    return fresh;
  }

  void markRead() {
    for (final n in notes) {
      (n as Map)['read'] = true;
    }
    _save();
    notifyListeners();
  }

  void clear() {
    d['notes'] = <dynamic>[];
    d['peers'] = <String, dynamic>{};
    d.remove('lastRun');
    d['mine'] = {'app': app, 'dev': d['device'], 'v': version, 'u': 0, 'days': <String, dynamic>{}, 'tasks': <String, dynamic>{}};
    _save();
    notifyListeners();
  }

  @override
  void dispose() {
    _t1?.cancel();
    _t2?.cancel();
    super.dispose();
  }
}

/// Üst çubuk (AppBar actions) için ✦ düğmesi — okunmamış sayısıyla; panel kapalıysa görünmez.
class FcAgentButton extends StatelessWidget {
  const FcAgentButton({super.key});

  @override
  Widget build(BuildContext context) {
    final ag = FcAgent.instance;
    return ListenableBuilder(
      listenable: ag,
      builder: (context, _) {
        if (!ag.on || !ag.panel) return const SizedBox.shrink();
        final n = ag.unread;
        return IconButton(
          tooltip: ag.t('title'),
          onPressed: () => showFcAgentPanel(context),
          icon: Badge(isLabelVisible: n > 0, label: Text('$n'), child: const Text('✦', style: TextStyle(fontSize: 20))),
        );
      },
    );
  }
}

Future<void> showFcAgentPanel(BuildContext context) async {
  final ag = FcAgent.instance;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => Directionality(
      textDirection: ag.rtl ? TextDirection.rtl : TextDirection.ltr,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (ctx, sc) => ListenableBuilder(
          listenable: ag,
          builder: (ctx, _) {
            final sm = ag.summary();
            final apps = sm['apps'] as Map<String, Map<String, dynamic>>;
            final names = apps.keys.where((n) => FcAgent._i(apps[n]!['w']) > 0).toList()
              ..sort((a, b) => FcAgent._i(apps[b]!['w']) - FcAgent._i(apps[a]!['w']));
            final mxw = names.isEmpty ? 1 : FcAgent._i(apps[names.first]!['w']);
            return ListView(controller: sc, padding: const EdgeInsets.fromLTRB(18, 0, 18, 24), children: [
              Row(children: [
                Text('✦ ${ag.t('title')}', style: Theme.of(ctx).textTheme.titleLarge),
                const Spacer(),
                FilledButton.tonal(onPressed: () => ag.analyze(manual: true), child: Text('⚡ ${ag.t('analyze')}')),
              ]),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 6, children: [
                Chip(label: Text(ag.t('week', {'t': ag.hm(sm['w'] as int)}))),
                Chip(label: Text(ag.t('days', {'n': (sm['days'] as Set).length}))),
              ]),
              for (final n in names.take(8))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    SizedBox(width: 120, child: Text(ag.appName(n), overflow: TextOverflow.ellipsis)),
                    Expanded(child: LinearProgressIndicator(value: FcAgent._i(apps[n]!['w']) / mxw, minHeight: 8)),
                    const SizedBox(width: 8),
                    Text(ag.hm(FcAgent._i(apps[n]!['w']))),
                  ]),
                ),
              const SizedBox(height: 12),
              Text(ag.t('notes'), style: Theme.of(ctx).textTheme.titleMedium),
              if (ag.notes.isEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(ag.t('none'))),
              for (final n in ag.notes.take(30))
                Card(
                  child: ListTile(
                    subtitle: Text('${ag.t((n as Map)['src'] == 'ai' ? 'srcAi' : 'srcOff')} · '
                        '${DateTime.fromMillisecondsSinceEpoch(FcAgent._i(n['t'])).toLocal().toString().substring(0, 16)}'),
                    title: Text(ag.noteText(n), style: TextStyle(fontWeight: n['read'] == true ? FontWeight.normal : FontWeight.w700)),
                  ),
                ),
            ]);
          },
        ),
      ),
    ),
  );
  ag.markRead();
}

/// Ayarlar kartı: aç/kapa, bildirim, panel, çevrim içi AI, sıklık, kayıtları sil.
class FcAgentCard extends StatelessWidget {
  const FcAgentCard({super.key});

  @override
  Widget build(BuildContext context) {
    final ag = FcAgent.instance;
    return ListenableBuilder(
      listenable: ag,
      builder: (context, _) {
        final small = Theme.of(context).textTheme.bodySmall;
        Widget sw(String k, String label, bool v) => SwitchListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(label),
              value: v,
              onChanged: (x) => ag.configure(k, x),
            );
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ag.t('desc')),
              sw('on', ag.t('on'), ag.on),
              if (ag.on) ...[
                sw('notify', ag.t('notify'), ag.notify),
                sw('panel', ag.t('panel'), ag.panel),
                sw('ai', ag.t('ai'), ag.aiOn),
                if (ag.aiOn && !ag.hasAi) Text(ag.t('noKey'), style: small),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: ag.freq,
                  decoration: InputDecoration(labelText: ag.t('freq')),
                  items: [for (final f in _freq) DropdownMenuItem(value: f, child: Text(ag.t('freq.$f')))],
                  onChanged: (v) => ag.configure('freq', v),
                ),
                const SizedBox(height: 8),
                Text(ag.t('status', {'t': ag.hm(ag.summary()['w'] as int), 'n': ag.notes.length, 'a': ag.aiToday, 'm': 4}), style: small),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FilledButton(
                    onPressed: () async {
                      final f = await ag.analyze(manual: true);
                      if (context.mounted && f.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ag.t('nothing'))));
                      }
                    },
                    child: Text('⚡ ${ag.t('analyze')}'),
                  ),
                  OutlinedButton(onPressed: () => showFcAgentPanel(context), child: Text('✦ ${ag.t('showNotes')}')),
                  TextButton(
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (c) => AlertDialog(
                          content: Text(ag.t('clearQ')),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('✕')),
                            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ag.t('clear'))),
                          ],
                        ),
                      );
                      if (ok == true) ag.clear();
                    },
                    child: Text(ag.t('clear')),
                  ),
                ]),
              ],
              const SizedBox(height: 8),
              Text(ag.t('privacy'), style: small),
            ]),
          ),
        );
      },
    );
  }
}
