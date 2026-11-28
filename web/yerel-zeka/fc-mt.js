/* FC MT — cihaz üstünde (çevrimdışı) çeviri: tr ↔ en ↔ ar, havacılık terminolojisine sadık, resmi dil.
   Sıra:
     1) Çeviri belleği / terim sözlüğü (uygulamanın verdiği [tr, en, ar] üçlüleri): birebir eşleşme → aynen.
     2) Bilgisayardaki yerel büyük dil modeli (Ollama), varsa ve açıksa: terimler zorunlu sözlük olarak verilir.
     3) NLLB-200 sinirsel çeviri modeli (Meta, ONNX, cihaz üstünde; Windows'ta DirectML ile GPU).
   Çalıştığı yer: Electron ana sürecindeki yerel zeka iş parçacığı (yz-worker.js). `transformers` dışarıdan verilir. */
'use strict';

const NLLB = { tr: 'tur_Latn', en: 'eng_Latn', ar: 'arb_Arab' };
const NAMES = { tr: 'Turkish', en: 'English', ar: 'Modern Standard Arabic' };
const AR_RE = /[؀-ۿ]/;

function detect(s) {
  s = String(s || '');
  if (AR_RE.test(s)) return 'ar';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s) || /\b(ve|ile|için|bir|bu|olan|değil|gibi)\b/i.test(s)) return 'tr';
  return 'en';
}
const lower = (s, l) => String(s || '').toLocaleLowerCase(l === 'tr' ? 'tr' : l === 'en' ? 'en' : undefined);
const norm = (s, l) => lower(s, l).replace(/[“”"«»]/g, '').replace(/\s+/g, ' ').replace(/[.。!?؟]+$/, '').trim();
const IDX = { tr: 0, en: 1, ar: 2 };

class Memory {
  constructor() { this.map = { tr: new Map(), en: new Map(), ar: new Map() }; this.terms = []; this.sig = ''; }
  load(entries) { // [[tr, en, ar], ...] ya da [{tr,en,ar}]
    const list = (entries || []).map((e) => Array.isArray(e) ? e : [e.tr, e.en, e.ar]).filter((e) => e[0] && e[1] && e[2]);
    const sig = list.length + ':' + (list[0] || []).join('|') + ':' + (list[list.length - 1] || []).join('|');
    if (sig === this.sig) return; this.sig = sig;
    this.map = { tr: new Map(), en: new Map(), ar: new Map() }; this.terms = [];
    for (const e of list) {
      for (const l of ['tr', 'en', 'ar']) { const k = norm(e[IDX[l]], l); if (k && !this.map[l].has(k)) this.map[l].set(k, e); }
      if (String(e[0]).split(/\s+/).length <= 6) this.terms.push(e);
    }
  }
  exact(text, from, to) { const e = this.map[from].get(norm(text, from)); return e ? e[IDX[to]] : null; }
  termsIn(text, from) { // metinde geçen terimler (uzun olan önce)
    const t = ' ' + norm(text, from).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ', hits = [];
    const sorted = this.terms.slice().sort((a, b) => String(b[IDX[from]]).length - String(a[IDX[from]]).length);
    for (const e of sorted) {
      const k = ' ' + norm(e[IDX[from]], from).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
      if (k.trim().length > 1 && t.includes(k) && !hits.some((h) => norm(h[IDX[from]], from).includes(k.trim()))) hits.push(e);
      if (hits.length >= 40) break;
    }
    return hits;
  }
}

function sentences(text) { // satırları ve cümleleri koru; boş satırlar aynen
  return String(text).split(/(\r?\n)/).map((part) => {
    if (/^\r?\n$/.test(part) || !part.trim()) return { raw: part };
    const segs = part.match(/[^.!?؟…]+(?:[.!?؟…]+["'”’)]*\s*|$)/g) || [part];
    return { segs: segs.filter((s) => s.length) };
  });
}

function create(opts) {
  const o = Object.assign({ modelDir: null, modelId: 'nllb-200-distilled-600M', dtype: 'fp32', devices: null, ollama: true, ollamaUrl: 'http://127.0.0.1:11434', fetch: globalThis.fetch }, opts || {});
  const mem = new Memory();
  let nllbP = null, ollamaModel, ollamaChecked = 0;

  async function nllb() {
    if (!nllbP) nllbP = (async () => {
      const T = o.transformers; if (!T) throw new Error('NLLB: transformers yok');
      T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = o.modelDir; T.env.useFSCache = false;
      const devices = o.devices || (process.platform === 'win32' ? ['dml', 'cpu'] : ['cpu']);
      let last;
      for (const device of devices) {
        try { const p = await T.pipeline('translation', o.modelId, { dtype: o.dtype, device }); p._fcDevice = device; return p; } catch (e) { last = e; }
      }
      throw last;
    })();
    nllbP.catch(() => { nllbP = null; });
    return nllbP;
  }

  async function findOllama() {
    if (!o.ollama || !o.fetch) return null;
    if (Date.now() - ollamaChecked < 60000) return ollamaModel;
    ollamaChecked = Date.now(); ollamaModel = null;
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 1500);
      const r = await o.fetch(o.ollamaUrl + '/api/tags', { signal: ac.signal }); clearTimeout(t);
      const models = ((await r.json()).models || []).map((m) => m.name);
      // çeviri için güçlü çok dilli modeller öncelikli
      const pref = [/gemma3:27b/, /qwen3:32b|qwen2\.5:32b/, /aya-expanse:32b|aya:35b/, /gemma3:12b/, /qwen3:14b|qwen2\.5:14b/, /aya/, /gemma/, /qwen/, /llama3/, /mistral/];
      for (const re of pref) { const m = models.find((n) => re.test(n)); if (m) { ollamaModel = m; break; } }
    } catch (e) { ollamaModel = null; }
    return ollamaModel;
  }

  async function viaOllama(text, from, to, terms) {
    const model = await findOllama(); if (!model) return null;
    const gl = terms.map((e) => `- ${e[IDX[from]]} → ${e[IDX[to]]}`).join('\n');
    const prompt = `You are a certified aviation translator (ICAO, EASA, FAA terminology). Translate the text from ${NAMES[from]} to ${NAMES[to]}.\n` +
      `Use formal, official register suitable for aviation training and regulatory documents — never colloquial.\n` +
      `Keep numbers, units, codes, call signs and abbreviations (e.g. AGL, VFR, METAR) exactly as written. Keep line breaks.\n` +
      (gl ? `Mandatory terminology (always use these translations):\n${gl}\n` : '') +
      `Output ONLY the translation, nothing else.\n\nText:\n${text}`;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), Math.max(30000, text.length * 200));
    try {
      const r = await o.fetch(o.ollamaUrl + '/api/generate', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.1 } }) });
      const j = await r.json(); const out = String(j.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return out ? { text: out, engine: 'ollama:' + model } : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }

  async function viaNllb(text, from, to) {
    const p = await nllb(), parts = sentences(text), flat = [];
    for (const part of parts) if (part.segs) for (const s of part.segs) flat.push(s);
    const out = new Map();
    for (const s of flat) {
      const core = s.trim(); if (!core || out.has(core)) continue;
      const exact = mem.exact(core, from, to);
      if (exact) { out.set(core, exact); continue; }
      if (!/[\p{L}]/u.test(core)) { out.set(core, core); continue; } // yalnız sayı / sembol
      const n = core.length;
      const r = await p(core, { src_lang: NLLB[from], tgt_lang: NLLB[to], max_new_tokens: Math.min(1024, Math.round(n * 1.5) + 32), num_beams: o.beams || 1 });
      out.set(core, String((Array.isArray(r) ? r[0] : r).translation_text || '').trim());
    }
    const joined = parts.map((part) => part.raw !== undefined ? part.raw : part.segs.map((s) => {
      const core = s.trim(), lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
      return lead + (out.get(core) || core) + trail;
    }).join('')).join('');
    return { text: joined, engine: 'nllb:' + (p._fcDevice || 'cpu') };
  }

  return {
    detect,
    async translate(text, from, to, x = {}) {
      text = String(text || ''); if (!text.trim()) return { text, engine: 'bos' };
      if (!from || from === 'auto') from = detect(text);
      if (from === to) return { text, engine: 'ayni' };
      if (!NLLB[from] || !NLLB[to]) throw new Error('Desteklenmeyen dil: ' + from + ' → ' + to);
      if (x.memory) mem.load(x.memory);
      const exact = mem.exact(text, from, to); if (exact) return { text: exact, engine: 'bellek' };
      const terms = mem.termsIn(text, from);
      if (x.ollama !== false) { const r = await viaOllama(text, from, to, terms); if (r) return Object.assign(r, { terms: terms.length }); }
      const r = await viaNllb(text, from, to); r.terms = terms.length; return r;
    },
    async warm() { await nllb(); return true; },
    status: () => ({ nllbLoaded: !!nllbP, ollama: ollamaModel || null }),
  };
}

module.exports = { create, detect, sentences, Memory, NLLB };
