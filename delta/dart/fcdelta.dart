// FCD1 yama uygulayıcı (yalnızca apply) — Flutter/Dart (dart:io), dış paket yok.
// Format: delta/FORMAT.md
//
// Kullanım (arka planda, UI'ı dondurmadan):
//   final h = await FcDelta.apply(oldPath, patchPath, outPath);   // Isolate.run ile
// ya da senkron:
//   FcDelta.applySync(oldPath, patchPath, outPath, onProgress: (w, t) {...});
//
// Kaynak ya da sonuç SHA-256 uyuşmazsa FcDeltaException fırlatır; outPath oluşmaz.
// Bellek sabittir (~1 MB): eski dosya RandomAccessFile ile okunur, zlib akış halinde açılır.
// SHA-256 dart:io'da olmadığı için aşağıda saf Dart ile yazılmıştır (package:crypto gerekmez).

import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

class FcDeltaException implements Exception {
  final String message;
  FcDeltaException(this.message);
  @override
  String toString() => 'FcDeltaException: $message';
}

class FcdHeader {
  final int srcLen;
  final Uint8List srcSha256;
  final int dstLen;
  final Uint8List dstSha256;
  FcdHeader(this.srcLen, this.srcSha256, this.dstLen, this.dstSha256);
  String get srcSha256Hex => _hex(srcSha256);
  String get dstSha256Hex => _hex(dstSha256);
}

class FcDelta {
  static const int headerLen = 85;
  static const int codecZlib = 0x01;
  static const int _opEnd = 0, _opCopy = 1, _opInsert = 2;
  static const int _ioBlock = 1 << 20;

  static FcdHeader parseHeader(Uint8List h) {
    if (h.length < headerLen) throw FcDeltaException('FCD1: yama çok kısa');
    if (h[0] != 0x46 || h[1] != 0x43 || h[2] != 0x44 || h[3] != 0x31) {
      throw FcDeltaException('FCD1: yama dosyası değil');
    }
    if (h[4] != codecZlib) throw FcDeltaException('FCD1: bilinmeyen codec ${h[4]}');
    final bd = ByteData.sublistView(h);
    final src = bd.getUint32(5, Endian.little) + bd.getUint32(9, Endian.little) * 0x100000000;
    final dst = bd.getUint32(45, Endian.little) + bd.getUint32(49, Endian.little) * 0x100000000;
    if (bd.getUint32(9, Endian.little) >= 0x200000 || bd.getUint32(49, Endian.little) >= 0x200000) {
      throw FcDeltaException('FCD1: uzunluk çok büyük');
    }
    return FcdHeader(src, Uint8List.fromList(h.sublist(13, 45)), dst, Uint8List.fromList(h.sublist(53, 85)));
  }

  static FcdHeader readHeader(String patchPath) {
    final raf = File(patchPath).openSync();
    try {
      return parseHeader(_readExact(raf, headerLen));
    } finally {
      raf.closeSync();
    }
  }

  static Uint8List sha256File(String path) {
    final raf = File(path).openSync();
    try {
      final sha = _Sha256();
      final buf = Uint8List(_ioBlock);
      while (true) {
        final n = raf.readIntoSync(buf);
        if (n <= 0) break;
        sha.add(buf, 0, n);
      }
      return sha.close();
    } finally {
      raf.closeSync();
    }
  }

  /// Arka plan isolate'inde uygular (Dart 2.19+ / Flutter 3.7+).
  static Future<String> apply(String oldPath, String patchPath, String outPath) {
    return Isolate.run(() => applySync(oldPath, patchPath, outPath).dstSha256Hex);
  }

  static FcdHeader applySync(String oldPath, String patchPath, String outPath,
      {void Function(int written, int total)? onProgress}) {
    final hd = readHeader(patchPath);
    if (File(oldPath).lengthSync() != hd.srcLen || !_eq(sha256File(oldPath), hd.srcSha256)) {
      throw FcDeltaException('FCD1: kurulu dosya yamanın kaynağı değil');
    }
    final tmp = File('$outPath.part');
    final old = File(oldPath).openSync();
    final out = tmp.openSync(mode: FileMode.write);
    final pin = File(patchPath).openSync();
    var ok = false;
    try {
      pin.setPositionSync(headerLen);
      final sha = _Sha256();
      final parser = _Parser(hd, old, out, sha, onProgress);
      final sink = ZLibDecoder().startChunkedConversion(_ParserSink(parser));
      final buf = Uint8List(256 * 1024);
      while (true) {
        final n = pin.readIntoSync(buf);
        if (n <= 0) break;
        sink.add(Uint8List.sublistView(buf, 0, n));
      }
      sink.close();
      parser.finish();
      out.closeSync();
      if (!_eq(sha.close(), hd.dstSha256)) throw FcDeltaException('FCD1: sonuç SHA-256 uyuşmuyor');
      final dest = File(outPath);
      if (dest.existsSync()) dest.deleteSync();
      tmp.renameSync(outPath);
      ok = true;
      return hd;
    } on FormatException catch (e) {
      throw FcDeltaException('FCD1: bozuk zlib verisi: ${e.message}');
    } finally {
      try { out.closeSync(); } catch (_) {}
      pin.closeSync();
      old.closeSync();
      if (!ok && tmp.existsSync()) tmp.deleteSync();
    }
  }

  static Uint8List _readExact(RandomAccessFile f, int n) {
    final b = Uint8List(n);
    var got = 0;
    while (got < n) {
      final k = f.readIntoSync(b, got, n);
      if (k <= 0) throw FcDeltaException('FCD1: yama çok kısa');
      got += k;
    }
    return b;
  }
}

class _ParserSink implements Sink<List<int>> {
  final _Parser p;
  _ParserSink(this.p);
  @override
  void add(List<int> data) => p.feed(data);
  @override
  void close() {}
}

class _Parser {
  final FcdHeader hd;
  final RandomAccessFile old;
  final RandomAccessFile out;
  final _Sha256 sha;
  final void Function(int, int)? progress;
  final Uint8List copyBuf = Uint8List(FcDelta._ioBlock);
  int state = 0, op = 0, need = 0, nf = 0, shift = 0;
  final List<int> fields = [0, 0];
  int v = 0, remain = 0, written = 0, emitted = 0;
  bool ended = false;

  _Parser(this.hd, this.old, this.out, this.sha, this.progress);

  void feed(List<int> c) {
    var i = 0;
    final n = c.length;
    while (i < n) {
      if (ended) throw FcDeltaException('FCD1: END sonrası fazla veri');
      if (state == 0) {
        op = c[i++];
        if (op == FcDelta._opEnd) {
          ended = true;
          continue;
        }
        if (op == FcDelta._opCopy) {
          need = 2;
        } else if (op == FcDelta._opInsert) {
          need = 1;
        } else {
          throw FcDeltaException('FCD1: geçersiz op $op');
        }
        nf = 0;
        v = 0;
        shift = 0;
        state = 1;
      } else if (state == 1) {
        final b = c[i++];
        if (shift > 56) throw FcDeltaException('FCD1: varint çok uzun');
        v |= (b & 0x7F) << shift;
        shift += 7;
        if (b < 0x80) {
          if (v < 0) throw FcDeltaException('FCD1: varint çok büyük');
          fields[nf++] = v;
          v = 0;
          shift = 0;
          if (nf == need) _exec();
        }
      } else {
        final k = remain < n - i ? remain : n - i;
        _emit(c, i, i + k);
        i += k;
        remain -= k;
        if (remain == 0) state = 0;
      }
    }
  }

  void _grow(int len) {
    written += len;
    if (written > hd.dstLen) throw FcDeltaException('FCD1: çıktı dstLen değerini aşıyor');
  }

  void _exec() {
    if (op == FcDelta._opCopy) {
      var off = fields[0];
      var len = fields[1];
      if (off + len > hd.srcLen) throw FcDeltaException('FCD1: COPY aralığı kaynak dışında');
      _grow(len);
      old.setPositionSync(off);
      while (len > 0) {
        final k = len < copyBuf.length ? len : copyBuf.length;
        var got = 0;
        while (got < k) {
          final r = old.readIntoSync(copyBuf, got, k);
          if (r <= 0) throw FcDeltaException('FCD1: kaynak dosya beklenenden kısa');
          got += r;
        }
        _emit(copyBuf, 0, k);
        len -= k;
      }
      state = 0;
    } else {
      final len = fields[0];
      _grow(len);
      remain = len;
      state = len > 0 ? 2 : 0;
    }
  }

  void _emit(List<int> b, int start, int end) {
    out.writeFromSync(b, start, end);
    sha.add(b, start, end);
    emitted += end - start;
    progress?.call(emitted, hd.dstLen);
  }

  void finish() {
    if (!ended) throw FcDeltaException('FCD1: END op yok (yama kesik)');
    if (written != hd.dstLen) throw FcDeltaException('FCD1: çıktı uzunluğu dstLen ile uyuşmuyor');
  }
}

bool _eq(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

String _hex(Uint8List b) {
  final sb = StringBuffer();
  for (final x in b) {
    sb.write(x.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

/// Saf Dart SHA-256 (FIPS 180-4), akış halinde. Dart VM 64-bit int varsayar.
class _Sha256 {
  static const List<int> _k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  static const int _m = 0xFFFFFFFF;
  final Uint32List _h = Uint32List.fromList([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  final Uint8List _block = Uint8List(64);
  final Uint32List _w = Uint32List(64);
  int _blen = 0;
  int _total = 0;

  void add(List<int> data, [int start = 0, int? end]) {
    final e = end ?? data.length;
    _total += e - start;
    var i = start;
    if (_blen > 0) {
      while (_blen < 64 && i < e) {
        _block[_blen++] = data[i++];
      }
      if (_blen < 64) return;
      _compress(_block, 0);
      _blen = 0;
    }
    while (e - i >= 64) {
      _compress(data, i);
      i += 64;
    }
    while (i < e) {
      _block[_blen++] = data[i++];
    }
  }

  static int _rotr(int x, int n) => ((x >> n) | (x << (32 - n))) & _m;

  void _compress(List<int> b, int o) {
    final w = _w;
    for (var t = 0; t < 16; t++) {
      final p = o + 4 * t;
      w[t] = (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    }
    for (var t = 16; t < 64; t++) {
      final x = w[t - 15], y = w[t - 2];
      final s0 = _rotr(x, 7) ^ _rotr(x, 18) ^ (x >> 3);
      final s1 = _rotr(y, 17) ^ _rotr(y, 19) ^ (y >> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) & _m;
    }
    var a = _h[0], bb = _h[1], c = _h[2], d = _h[3], e = _h[4], f = _h[5], g = _h[6], h = _h[7];
    for (var t = 0; t < 64; t++) {
      final s1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
      final ch = (e & f) ^ ((~e) & g);
      final t1 = (h + s1 + ch + _k[t] + w[t]) & _m;
      final s0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
      final maj = (a & bb) ^ (a & c) ^ (bb & c);
      final t2 = (s0 + maj) & _m;
      h = g;
      g = f;
      f = e;
      e = (d + t1) & _m;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) & _m;
    }
    _h[0] = (_h[0] + a) & _m;
    _h[1] = (_h[1] + bb) & _m;
    _h[2] = (_h[2] + c) & _m;
    _h[3] = (_h[3] + d) & _m;
    _h[4] = (_h[4] + e) & _m;
    _h[5] = (_h[5] + f) & _m;
    _h[6] = (_h[6] + g) & _m;
    _h[7] = (_h[7] + h) & _m;
  }

  Uint8List close() {
    final bits = _total * 8;
    final pad = <int>[0x80];
    var len = (_blen + 1) % 64;
    while (len != 56) {
      pad.add(0);
      len = (len + 1) % 64;
    }
    for (var s = 56; s >= 0; s -= 8) {
      pad.add((bits >> s) & 0xFF);
    }
    add(pad);
    final out = Uint8List(32);
    for (var i = 0; i < 8; i++) {
      out[4 * i] = (_h[i] >> 24) & 0xFF;
      out[4 * i + 1] = (_h[i] >> 16) & 0xFF;
      out[4 * i + 2] = (_h[i] >> 8) & 0xFF;
      out[4 * i + 3] = _h[i] & 0xFF;
    }
    return out;
  }
}

// Test CLI: dart run fcdelta.dart apply <old> <patch> <out>
void main(List<String> args) {
  if (args.length != 4 || args[0] != 'apply') {
    stderr.writeln('kullanım: dart fcdelta.dart apply <old> <patch> <out>');
    exit(2);
  }
  try {
    final h = FcDelta.applySync(args[1], args[2], args[3]);
    stdout.writeln('ok ${args[3]} sha256=${h.dstSha256Hex}');
  } on FcDeltaException catch (e) {
    stderr.writeln('hata: ${e.message}');
    exit(1);
  }
}
