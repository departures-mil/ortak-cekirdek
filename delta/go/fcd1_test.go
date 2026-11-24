package fcd1

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Vektörler Node üreticisiyle (delta/node/fcdelta.js) üretilir: node testdata/gen.js (küçük, depoda).
// FCD1_TESTDATA başka bir klasör gösterebilir: delta/test/run.sh tüm çapraz dil durumlarını taze üretip buraya verir.
func testdata(t *testing.T) string {
	if d := os.Getenv("FCD1_TESTDATA"); d != "" {
		return d
	}
	return "testdata"
}

func load(t *testing.T, dir, name string) (src, dst, patch []byte) {
	t.Helper()
	var err error
	if src, err = os.ReadFile(filepath.Join(dir, name+".src")); err != nil {
		t.Fatal(err)
	}
	if dst, err = os.ReadFile(filepath.Join(dir, name+".dst")); err != nil {
		t.Fatal(err)
	}
	if patch, err = os.ReadFile(filepath.Join(dir, name+".bin")); err != nil {
		t.Fatal(err)
	}
	return
}

func names(t *testing.T, dir string) []string {
	ents, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), ".bin") {
			out = append(out, strings.TrimSuffix(e.Name(), ".bin"))
		}
	}
	if len(out) < 3 {
		t.Fatalf("vektör eksik: %v", out)
	}
	return out
}

func TestNodeVectors(t *testing.T) {
	dir := testdata(t)
	for _, n := range names(t, dir) {
		src, dst, patch := load(t, dir, n)
		got, err := Apply(src, patch)
		if err != nil {
			t.Fatalf("%s: %v", n, err)
		}
		if !bytes.Equal(got, dst) {
			t.Fatalf("%s: sonuç farklı", n)
		}
	}
}

func TestFormatVector(t *testing.T) {
	// FORMAT.md §6: boş kaynak → "abc"; başlık alanları
	_, _, patch := load(t, "testdata", "bos-abc")
	h, err := ParseHeader(patch)
	if err != nil {
		t.Fatal(err)
	}
	if h.SrcLen != 0 || h.DstLen != 3 {
		t.Fatalf("uzunluk: %d %d", h.SrcLen, h.DstLen)
	}
	if hex.EncodeToString(h.SrcSha[:]) != "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" {
		t.Fatal("boş SHA")
	}
	if hex.EncodeToString(h.DstSha[:]) != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal("abc SHA")
	}
}

func expect(t *testing.T, what string, err, want error) {
	t.Helper()
	if err != want {
		t.Fatalf("%s: hata %v, beklenen %v", what, err, want)
	}
}

func TestRejects(t *testing.T) {
	src, _, patch := load(t, "testdata", "metin")

	// yanlış kaynak
	bad := append([]byte{}, src...)
	bad[10] ^= 1
	_, err := Apply(bad, patch)
	expect(t, "kaynak", err, ErrSourceMismatch)
	_, err = Apply(src[:len(src)-1], patch)
	expect(t, "kaynak uzunluğu", err, ErrSourceMismatch)

	// sihirli sözcük / codec
	p := append([]byte{}, patch...)
	p[0] = 'X'
	_, err = Apply(src, p)
	expect(t, "magic", err, ErrBadMagic)
	p = append([]byte{}, patch...)
	p[4] = 2
	_, err = Apply(src, p)
	expect(t, "codec", err, ErrBadCodec)

	// hedef SHA bozuk
	p = append([]byte{}, patch...)
	p[60] ^= 1
	_, err = Apply(src, p)
	expect(t, "hedef sha", err, ErrResult)

	// zlib akışından sonra fazladan bayt
	p = append(append([]byte{}, patch...), 0)
	_, err = Apply(src, p)
	expect(t, "fazladan bayt", err, ErrTrailing)

	// kesik akış
	p = append([]byte{}, patch[:len(patch)-6]...)
	if _, err = Apply(src, p); err == nil {
		t.Fatal("kesik akış kabul edildi")
	}
	// kısa dosya
	_, err = Apply(src, patch[:40])
	expect(t, "kısa", err, ErrBadMagic)
}

func TestVarint(t *testing.T) {
	v, err := readVarint(bytes.NewReader([]byte{0xAC, 0x02}))
	if err != nil || v != 300 {
		t.Fatalf("300 → %d %v", v, err)
	}
	_, err = readVarint(bytes.NewReader(bytes.Repeat([]byte{0x80}, 10)))
	expect(t, "uzun varint", err, ErrBadVarint)
}

func TestHugeDstLenNoPanic(t *testing.T) {
	// başlıkta dev hedef uzunluğu: bellek ayırmadan reddedilmeli
	src, _, patch := load(t, "testdata", "bos-abc")
	p := append([]byte{}, patch...)
	for i := 45; i < 53; i++ {
		p[i] = 0
	}
	p[51] = 0x10 // 2^52
	if _, err := Apply(src, p); err == nil {
		t.Fatal("kabul edildi")
	}
}

func TestApplyFile(t *testing.T) {
	d := t.TempDir()
	src, dst, patch := load(t, "testdata", "metin")
	os.WriteFile(filepath.Join(d, "a"), src, 0o644)
	os.WriteFile(filepath.Join(d, "p"), patch, 0o644)
	if err := ApplyFile(filepath.Join(d, "a"), filepath.Join(d, "p"), filepath.Join(d, "b")); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(filepath.Join(d, "b"))
	if !bytes.Equal(got, dst) {
		t.Fatal("sonuç farklı")
	}
	if err := ApplyFile(filepath.Join(d, "b"), filepath.Join(d, "p"), filepath.Join(d, "c")); err != ErrSourceMismatch {
		t.Fatalf("yanlış kaynak: %v", err)
	}
	if _, err := os.Stat(filepath.Join(d, "c")); err == nil {
		t.Fatal("başarısız uygulama dosya bıraktı")
	}
}
