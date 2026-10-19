/* ToolBench 纯逻辑层 —— 不碰 DOM，方便用 node 直接跑单测。
   挂到 globalThis.ToolCore，浏览器和 node 都能用。 */
(function () {
  'use strict';

  /* ---------------- 通用 ---------------- */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bytesToBinary(bytes) {
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return bin;
  }

  /* ---------------- 1. JSON ---------------- */
  function fmtJson(text, indent, sortKeys) {
    if (!String(text).trim()) return { ok: false, out: '', error: 'Input is empty.' };
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, out: '', error: e.message };
    }
    if (sortKeys) data = sortDeep(data);
    var pad = indent === 'tab' ? '\t' : Number(indent) || 2;
    return { ok: true, out: JSON.stringify(data, null, pad), error: '' };
  }

  function minifyJson(text) {
    var r = fmtJson(text, 0, false);
    if (!r.ok) return r;
    return { ok: true, out: JSON.stringify(JSON.parse(text)), error: '' };
  }

  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v)
        .sort(function (a, b) {
          return a.localeCompare(b);
        })
        .forEach(function (k) {
          o[k] = sortDeep(v[k]);
        });
      return o;
    }
    return v;
  }

  /* ---------------- 2. Base64 ---------------- */
  function b64Encode(str) {
    var bytes = new TextEncoder().encode(String(str));
    return btoa(bytesToBinary(bytes));
  }
  function b64Decode(str) {
    var clean = String(str).replace(/\s+/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  function b64UrlEncode(str) {
    return b64Encode(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64UrlDecode(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (s.length % 4) s += '=';
    return b64Decode(s);
  }

  /* ---------------- 3. URL ---------------- */
  // fullUrl = true 时按整条 URL 编码（保留 : / ? & #），否则按单个参数值编码
  function urlEncode(str, fullUrl) {
    return fullUrl ? encodeURI(String(str)) : encodeURIComponent(String(str));
  }
  function urlDecode(str) {
    try {
      return decodeURIComponent(String(str).replace(/\+/g, ' '));
    } catch (e) {
      return decodeURI(String(str));
    }
  }
  function parseQuery(qs) {
    var s = String(qs).trim().replace(/^[?#]/, '');
    var out = [];
    s.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? '' : pair.slice(i + 1);
      out.push([urlDecode(k), urlDecode(v)]);
    });
    return out;
  }

  /* ---------------- 4. 时间戳 ---------------- */
  function tsToDate(input) {
    var s = String(input).trim();
    if (!s) return { ok: false, error: 'Input is empty.' };
    var n = Number(s);
    var ms;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      ms = Math.abs(n) >= 1e12 ? n : n * 1000; // 秒 -> 毫秒
    } else {
      var parsed = Date.parse(s);
      if (isNaN(parsed)) return { ok: false, error: 'Cannot parse that as a timestamp or date.' };
      ms = parsed;
    }
    var d = new Date(ms);
    if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date.' };
    return {
      ok: true,
      ms: ms,
      seconds: Math.floor(ms / 1000),
      iso: d.toISOString(),
      utc: d.toUTCString(),
      local: d.toString(),
      ymd: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
      hms: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
      relative: relativeFrom(ms),
    };
  }
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function relativeFrom(ms) {
    var diff = ms - Date.now();
    var abs = Math.abs(diff);
    var units = [
      [31536000000, 'year'],
      [2592000000, 'month'],
      [604800000, 'week'],
      [86400000, 'day'],
      [3600000, 'hour'],
      [60000, 'minute'],
      [1000, 'second'],
    ];
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var v = Math.round(abs / units[i][0]);
        var u = units[i][1] + (v === 1 ? '' : 's');
        return (diff < 0 ? v + ' ' + u + ' ago' : 'in ' + v + ' ' + u);
      }
    }
    return 'just now';
  }

  /* ---------------- 5. UUID ---------------- */
  function uuidv4() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    var b = new Uint8Array(16);
    rnd(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map
      .call(b, function (x) {
        return x.toString(16).padStart(2, '0');
      })
      .join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function rnd(arr) {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
  }
  function uuidList(count, uppercase, braces) {
    var n = Math.min(Math.max(Number(count) || 1, 1), 500);
    var out = [];
    for (var i = 0; i < n; i++) {
      var u = uuidv4();
      if (uppercase) u = u.toUpperCase();
      if (braces) u = '{' + u + '}';
      out.push(u);
    }
    return out;
  }

  /* ---------------- 6. 密码 ---------------- */
  var PW_SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/',
  };
  function genPassword(len, opts) {
    opts = opts || {};
    var pool = '';
    ['lower', 'upper', 'digits', 'symbols'].forEach(function (k) {
      if (opts[k] !== false) pool += PW_SETS[k];
    });
    if (!pool) pool = PW_SETS.lower;
    var noAmbiguous = !!opts.noAmbiguous;
    if (noAmbiguous) pool = pool.replace(/[Il1O0o]/g, '');
    var n = Math.min(Math.max(Number(len) || 16, 4), 256);
    var chars = new Uint32Array(n * 2);
    rnd32(chars);
    var out = '';
    for (var i = 0; i < n; i++) out += pool[chars[i] % pool.length];
    var entropy = n * Math.log2(pool.length);
    return { password: out, entropy: Math.round(entropy * 10) / 10, pool: pool.length };
  }
  function rnd32(arr) {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 4294967296);
    }
  }
  function strengthOf(entropy) {
    if (entropy < 40) return { label: 'Weak', pct: 25 };
    if (entropy < 60) return { label: 'Fair', pct: 50 };
    if (entropy < 80) return { label: 'Strong', pct: 78 };
    return { label: 'Very strong', pct: 100 };
  }

  /* ---------------- 7. 哈希 ---------------- */
  async function hashText(text, algo) {
    var enc = new TextEncoder().encode(String(text));
    var buf = await globalThis.crypto.subtle.digest(algo, enc);
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      })
      .join('');
  }

  /* ---------------- 8. 颜色 ---------------- */
  function normalizeHex(input) {
    var s = String(input).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (/^[0-9a-f]{8}$/i.test(s)) s = s.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return s.toLowerCase();
  }
  function colorConvert(input) {
    var hex = normalizeHex(input);
    if (!hex) return { ok: false, error: 'Enter a hex color like #1f6feb or 1f6feb.' };
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    var rn = r / 255,
      gn = g / 255,
      bn = b / 255;
    var max = Math.max(rn, gn, bn),
      min = Math.min(rn, gn, bn);
    var l = (max + min) / 2;
    var h = 0,
      s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }
    return {
      ok: true,
      hex: '#' + hex,
      rgb: 'rgb(' + r + ', ' + g + ', ' + b + ')',
      rgba: 'rgba(' + r + ', ' + g + ', ' + b + ', 1)',
      hsl: 'hsl(' + Math.round(h * 360) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)',
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
      luminance: Math.round((0.2126 * rn + 0.7152 * gn + 0.0722 * bn) * 100) / 100,
      textOn: 0.2126 * rn + 0.7152 * gn + 0.0722 * bn > 0.55 ? '#14161a' : '#ffffff',
    };
  }

  /* ---------------- 9. 文本统计 ---------------- */
  function textStats(text) {
    var s = String(text);
    // CJK 逐字计数，同时把这些字从西文分词里剔除，避免同一段文字被算两遍
    var cjkRe = /[\u4e00-\u9fff\u3040-\u30ff]/g;
    var cjk = (s.match(cjkRe) || []).length;
    var rest = s.replace(cjkRe, ' ');
    var words = rest.trim() ? rest.trim().split(/\s+/).filter(Boolean) : [];
    var wordCount = words.length + cjk;
    var sentences = (s.match(/[^.!?。！？\n]+[.!?。！？]+/g) || []).length || (s.trim() ? 1 : 0);
    var paragraphs = s.trim() ? s.trim().split(/\n{2,}/).filter(function (p) {
      return p.trim();
    }).length : 0;
    return {
      chars: s.length,
      charsNoSpace: s.replace(/\s/g, '').length,
      words: wordCount,
      lines: s ? s.split(/\n/).length : 0,
      sentences: sentences,
      paragraphs: paragraphs,
      readingSeconds: Math.round((wordCount / 220) * 60),
      speakingSeconds: Math.round((wordCount / 130) * 60),
    };
  }

  /* ---------------- 10. 大小写 ---------------- */
  function wordsOf(s) {
    return String(s)
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
      .filter(Boolean);
  }
  function convertCase(text, mode) {
    var s = String(text);
    var w = wordsOf(s);
    switch (mode) {
      case 'upper':
        return s.toUpperCase();
      case 'lower':
        return s.toLowerCase();
      case 'title':
        return s.replace(/\w\S*/g, function (t) {
          return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        });
      case 'sentence':
        return s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, function (t) {
          return t.toUpperCase();
        });
      case 'camel':
        return w
          .map(function (x, i) {
            var l = x.toLowerCase();
            return i === 0 ? l : l.charAt(0).toUpperCase() + l.slice(1);
          })
          .join('');
      case 'pascal':
        return w
          .map(function (x) {
            var l = x.toLowerCase();
            return l.charAt(0).toUpperCase() + l.slice(1);
          })
          .join('');
      case 'snake':
        return w
          .map(function (x) {
            return x.toLowerCase();
          })
          .join('_');
      case 'kebab':
        return w
          .map(function (x) {
            return x.toLowerCase();
          })
          .join('-');
      case 'constant':
        return w
          .map(function (x) {
            return x.toUpperCase();
          })
          .join('_');
      case 'alternating':
        return s
          .split('')
          .map(function (c, i) {
            return i % 2 ? c.toLowerCase() : c.toUpperCase();
          })
          .join('');
      default:
        return s;
    }
  }

  /* ---------------- 11. Lorem ---------------- */
  var LOREM_WORDS =
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
      ' '
    );
  function lorem(count, type) {
    var n = Math.min(Math.max(Number(count) || 3, 1), 50);
    var r = new Uint32Array(n * 200);
    rnd32(r);
    var k = 0;
    function next(max) {
      return r[(k = (k + 1) % r.length)] % max;
    }
    function sentence() {
      var len = 8 + next(12);
      var out = [];
      for (var i = 0; i < len; i++) out.push(LOREM_WORDS[next(LOREM_WORDS.length)]);
      var s = out.join(' ');
      return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    }
    function paragraph() {
      var len = 3 + next(4);
      var out = [];
      for (var i = 0; i < len; i++) out.push(sentence());
      return out.join(' ');
    }
    var res = [];
    for (var i = 0; i < n; i++) res.push(type === 'words' ? Array.from({ length: 20 }, function () {
      return LOREM_WORDS[next(LOREM_WORDS.length)];
    }).join(' ') + '.' : type === 'sentences' ? sentence() : paragraph());
    return res.join(type === 'paragraphs' ? '\n\n' : ' ');
  }

  /* ---------------- 12. 正则 ---------------- */
  function regexTest(pattern, flags, text) {
    if (!pattern) return { ok: false, error: 'Enter a pattern.', matches: [] };
    var re;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      return { ok: false, error: e.message, matches: [] };
    }
    var src = String(text);
    var matches = [];
    if (re.global) {
      re.lastIndex = 0;
      var m,
        guard = 0;
      while ((m = re.exec(src)) !== null) {
        matches.push({
          text: m[0],
          index: m.index,
          groups: m.slice(1),
          named: m.groups || null,
        });
        if (m[0] === '' || guard++ > 5000) re.lastIndex++;
        if (matches.length > 5000) break;
      }
    } else {
      var one = re.exec(src);
      if (one) matches.push({ text: one[0], index: one.index, groups: one.slice(1), named: one.groups || null });
    }
    var html = '';
    var last = 0;
    matches.forEach(function (mm) {
      if (mm.index < last) return;
      html += escapeHtml(src.slice(last, mm.index));
      html += '<mark>' + escapeHtml(mm.text || '(empty)') + '</mark>';
      last = mm.index + mm.text.length;
    });
    html += escapeHtml(src.slice(last));
    return { ok: true, error: '', matches: matches, highlighted: html || escapeHtml(src) };
  }

  /* ---------------- 13. 文本对比 ---------------- */
  function diffLines(a, b) {
    var A = String(a).split('\n');
    var B = String(b).split('\n');
    if (A.length * B.length > 4000000) {
      return A.map(function (l) {
        return { type: 'del', text: l };
      }).concat(
        B.map(function (l) {
          return { type: 'add', text: l };
        })
      );
    }
    var n = A.length,
      m = B.length;
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        out.push({ type: 'same', text: A[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ type: 'del', text: A[i++] });
      } else {
        out.push({ type: 'add', text: B[j++] });
      }
    }
    while (i < n) out.push({ type: 'del', text: A[i++] });
    while (j < m) out.push({ type: 'add', text: B[j++] });
    var added = out.filter(function (x) {
      return x.type === 'add';
    }).length;
    var removed = out.filter(function (x) {
      return x.type === 'del';
    }).length;
    return { lines: out, added: added, removed: removed };
  }

  /* ---------------- 14. 单位换算 ---------------- */
  var UNITS = {
    length: {
      label: 'Length',
      base: 'm',
      units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
    },
    mass: {
      label: 'Weight / mass',
      base: 'kg',
      units: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
    },
    temperature: { label: 'Temperature', base: 'C', units: { C: 1, F: 1, K: 1 } },
    data: {
      label: 'Digital storage',
      base: 'B',
      units: { B: 1, KB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776 },
    },
    time: { label: 'Time', base: 's', units: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31536000 } },
    speed: { label: 'Speed', base: 'm/s', units: { 'm/s': 1, 'km/h': 0.277777778, mph: 0.44704, kn: 0.514444444 } },
    area: { label: 'Area', base: 'm2', units: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 10000, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336 } },
    volume: { label: 'Volume', base: 'L', units: { L: 1, mL: 0.001, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625 } },
  };

  function convertUnits(cat, from, to, value) {
    var c = UNITS[cat];
    if (!c) return { ok: false, error: 'Unknown category.' };
    var v = Number(value);
    if (!isFinite(v)) return { ok: false, error: 'Enter a number.' };
    if (!(from in c.units) || !(to in c.units)) return { ok: false, error: 'Unknown unit.' };
    var out;
    if (cat === 'temperature') {
      var cel = from === 'C' ? v : from === 'F' ? ((v - 32) * 5) / 9 : v - 273.15;
      out = to === 'C' ? cel : to === 'F' ? (cel * 9) / 5 + 32 : cel + 273.15;
    } else {
      out = (v * c.units[from]) / c.units[to];
    }
    return { ok: true, value: out, pretty: prettyNum(out), error: '' };
  }
  function prettyNum(n) {
    if (!isFinite(n)) return String(n);
    if (n !== 0 && (Math.abs(n) < 1e-6 || Math.abs(n) >= 1e12)) return n.toExponential(6);
    var r = Number(n.toPrecision(12));
    return String(r);
  }

  /* ---------------- 15. HTML 实体 ---------------- */
  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function htmlEncode(s, all) {
    var out = String(s).replace(/[&<>"']/g, function (c) {
      return ENTITIES[c];
    });
    if (all) {
      out = out.replace(/[\u00a0-\uffff]/g, function (c) {
        return '&#' + c.charCodeAt(0) + ';';
      });
    }
    return out;
  }
  function htmlDecode(s) {
    var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', laquo: '\u00ab', raquo: '\u00bb' };
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
        return String.fromCodePoint(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (_, d) {
        return String.fromCodePoint(Number(d));
      })
      .replace(/&([a-z]+);/gi, function (m, name) {
        var v = named[name.toLowerCase()];
        return v === undefined ? m : v;
      });
  }

  /* ---------------- 16. 进制 ---------------- */
  function numBase(input) {
    var s = String(input).trim().replace(/^0[bxo]/i, '').replace(/[\s_,]/g, '');
    if (!s) return { ok: false, error: 'Input is empty.' };
    var n;
    if (/^-?0x[0-9a-f]+$/i.test(String(input).trim())) n = parseInt(String(input).trim(), 16);
    else if (/^-?[0-9]+$/.test(s)) n = parseInt(s, 10);
    else if (/^-?[0-9a-f]+$/i.test(s)) {
      n = parseInt(s, 16);
      if (!/^-?\d+$/.test(s) && !/[a-f]/i.test(s)) n = parseInt(s, 10);
    } else return { ok: false, error: 'Not a valid number.' };
    if (!isFinite(n)) return { ok: false, error: 'Not a valid number.' };
    var neg = n < 0;
    var abs = Math.abs(n);
    return {
      ok: true,
      dec: String(n),
      bin: (neg ? '-' : '') + abs.toString(2),
      oct: (neg ? '-' : '') + abs.toString(8),
      hex: (neg ? '-' : '') + abs.toString(16).toUpperCase(),
      bytes: Math.ceil(abs.toString(2).length / 8) + ' bit-width',
    };
  }
  function textToBinary(text) {
    return Array.from(new TextEncoder().encode(String(text)))
      .map(function (b) {
        return b.toString(2).padStart(8, '0');
      })
      .join(' ');
  }
  function binaryToText(bin) {
    var bits = String(bin).replace(/[^01]/g, '');
    if (!bits.length) return '';
    var bytes = [];
    for (var i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  /* ---------------- 17. Slug ---------------- */
  function slugify(text, sep, lower) {
    var s = sep || '-';
    var out = String(text)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, s);
    if (lower !== false) out = out.toLowerCase();
    return out.replace(new RegExp('^' + escapeRe(s) + '+|' + escapeRe(s) + '+$', 'g'), '');
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ---------------- 18. 行处理 ---------------- */
  function processLines(text, opts) {
    opts = opts || {};
    var lines = String(text).split('\n');
    if (opts.trim) {
      lines = lines.map(function (l) {
        return l.trim();
      });
    }
    if (opts.removeEmpty) {
      lines = lines.filter(function (l) {
        return l.trim() !== '';
      });
    }
    if (opts.dedupe) {
      var seen = Object.create(null);
      lines = lines.filter(function (l) {
        var k = opts.caseInsensitive ? l.toLowerCase() : l;
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });
    }
    if (opts.sort === 'alpha') lines.sort(function (a, b) { return a.localeCompare(b); });
    else if (opts.sort === 'numeric') lines.sort(function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); });
    else if (opts.sort === 'length') lines.sort(function (a, b) { return a.length - b.length; });
    else if (opts.sort === 'shuffle') {
      var r = new Uint32Array(lines.length || 1);
      rnd32(r);
      lines = lines
        .map(function (v, i) {
          return [r[i] || i, v];
        })
        .sort(function (a, b) {
          return a[0] - b[0];
        })
        .map(function (p) {
          return p[1];
        });
    }
    if (opts.reverse) lines.reverse();
    return lines;
  }

  /* ---------------- 19. CSV <-> JSON ---------------- */
  function parseCsv(text, delimiter) {
    var d = delimiter || ',';
    var rows = [];
    var row = [];
    var field = '';
    var inQ = false;
    var s = String(text).replace(/\r\n?/g, '\n');
    var HEADER = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === d) {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += c;
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    rows = rows.filter(function (r) {
      return r.length > 1 || (r[0] && r[0].trim() !== '');
    });
    if (!rows.length) return { ok: false, error: 'No rows found.', rows: [], header: [], objects: [] };
    var header = rows[HEADER].map(function (h) {
      return h.trim();
    });
    var objects = rows.slice(1).map(function (r) {
      var o = {};
      header.forEach(function (h, idx) {
        o[h] = r[idx] === undefined ? '' : r[idx];
      });
      return o;
    });
    return { ok: true, error: '', rows: rows, header: header, objects: objects };
  }

  function jsonToCsv(jsonText, delimiter) {
    var d = delimiter || ',';
    var data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      return { ok: false, error: e.message, out: '' };
    }
    var arr = Array.isArray(data) ? data : [data];
    if (!arr.length) return { ok: false, error: 'JSON array is empty.', out: '' };
    var isObj = typeof arr[0] === 'object' && arr[0] !== null;
    if (!isObj) {
      return {
        ok: true,
        error: '',
        out: 'value\n' + arr.map(function (v) {
          return csvCell(String(v), d);
        }).join('\n'),
      };
    }
    var cols = [];
    arr.forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) {
        if (cols.indexOf(k) < 0) cols.push(k);
      });
    });
    var lines = [cols.map(function (c) { return csvCell(c, d); }).join(d)];
    arr.forEach(function (o) {
      lines.push(
        cols
          .map(function (c) {
            var v = o ? o[c] : '';
            if (v && typeof v === 'object') v = JSON.stringify(v);
            return csvCell(v === undefined || v === null ? '' : String(v), d);
          })
          .join(d)
      );
    });
    return { ok: true, error: '', out: lines.join('\n'), columns: cols };
  }
  function csvCell(v, d) {
    if (v.indexOf('"') >= 0 || v.indexOf(d) >= 0 || /[\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  /* ---------------- 20. JWT ---------------- */
  function decodeJwt(token) {
    var t = String(token).trim().replace(/^Bearer\s+/i, '');
    var parts = t.split('.');
    if (parts.length < 2) return { ok: false, error: 'A JWT has 3 dot-separated parts (header.payload.signature).' };
    var out = { ok: true, error: '' };
    try {
      out.header = JSON.parse(b64UrlDecode(parts[0]));
    } catch (e) {
      return { ok: false, error: 'Header is not valid base64url JSON: ' + e.message };
    }
    try {
      out.payload = JSON.parse(b64UrlDecode(parts[1]));
    } catch (e) {
      return { ok: false, error: 'Payload is not valid base64url JSON: ' + e.message };
    }
    out.signature = parts[2] || '';
    out.claims = claimsDecoded(out.payload);
    return out;
  }
  function claimsDecoded(p) {
    var out = [];
    var map = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'JWT ID', scope: 'Scope', azp: 'Authorized party' };
    Object.keys(map).forEach(function (k) {
      if (p[k] === undefined) return;
      if (['exp', 'nbf', 'iat'].indexOf(k) >= 0) {
        var d = new Date(Number(p[k]) * 1000);
        out.push({ key: k, label: map[k], value: isNaN(d.getTime()) ? String(p[k]) : d.toISOString() });
      } else {
        out.push({ key: k, label: map[k], value: typeof p[k] === 'string' ? p[k] : JSON.stringify(p[k]) });
      }
    });
    return out;
  }

  /* ---------------- 21. Markdown ---------------- */
  function mdToHtml(md) {
    var src = String(md).replace(/\r\n?/g, '\n');
    var fences = [];
    src = src.replace(/```([a-z0-9]*)\n([\s\S]*?)```/gi, function (_, lang, code) {
      fences.push('<pre class="out"><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000FENCE' + (fences.length - 1) + '\u0000';
    });
    var lines = src.split('\n');
    var html = [];
    var listType = null;
    function closeList() {
      if (listType) {
        html.push('</' + listType + '>');
        listType = null;
      }
    }
    lines.forEach(function (raw) {
      var line = raw;
      if (/^\s*$/.test(line)) {
        closeList();
        return;
      }
      if (/^\u0000FENCE\d+\u0000$/.test(line.trim())) {
        closeList();
        html.push(fences[Number(line.trim().slice(6, -1))]);
        return;
      }
      var m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        html.push('<h' + m[1].length + '>' + inlineMd(m[2]) + '</h' + m[1].length + '>');
        return;
      }
      if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) || /^\s*---+\s*$/.test(line)) {
        closeList();
        html.push('<hr>');
        return;
      }
      if ((m = line.match(/^\s*>\s?(.*)$/))) {
        closeList();
        html.push('<blockquote>' + inlineMd(m[1]) + '</blockquote>');
        return;
      }
      if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        html.push('<li>' + inlineMd(m[1]) + '</li>');
        return;
      }
      if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
        if (listType !== 'ol') {
          closeList();
          html.push('<ol>');
          listType = 'ol';
        }
        html.push('<li>' + inlineMd(m[1]) + '</li>');
        return;
      }
      closeList();
      html.push('<p>' + inlineMd(line) + '</p>');
    });
    closeList();
    return html.join('\n');
  }
  function inlineMd(s) {
    var out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return out;
  }

  /* ---------------- 22. 图片 -> base64 用的大小格式化 ---------------- */
  function formatBytes(n) {
    if (!n) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(n) / Math.log(1024));
    i = Math.min(i, u.length - 1);
    return (n / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + u[i];
  }

  /* ---------------- 23. Base32 ---------------- */
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32Encode(text, noPad) {
    var bytes = new TextEncoder().encode(String(text));
    var out = '';
    var bits = 0;
    var value = 0;
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += B32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    if (!noPad) while (out.length % 8) out += '=';
    return out;
  }
  function b32Decode(text) {
    var s = String(text).toUpperCase().replace(/[=\s]/g, '');
    var bytes = [];
    var bits = 0;
    var value = 0;
    for (var i = 0; i < s.length; i++) {
      var idx = B32.indexOf(s[i]);
      if (idx < 0) throw new Error('Invalid Base32 character: ' + s[i]);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  }

  /* ---------------- 24. 摩尔斯电码 ---------------- */
  var MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-',
    '"': '.-..-.', $: '...-..-', '@': '.--.-.',
  };
  var MORSE_REV = (function () {
    var o = {};
    Object.keys(MORSE).forEach(function (k) {
      o[MORSE[k]] = k;
    });
    return o;
  })();

  function toMorse(text) {
    var words = String(text).toUpperCase().trim().split(/\s+/);
    return words
      .map(function (w) {
        return w
          .split('')
          .map(function (ch) {
            return MORSE[ch] || ''; // 未知字符直接丢掉
          })
          .filter(Boolean)
          .join(' ');
      })
      .filter(Boolean)
      .join(' / ');
  }
  function fromMorse(code) {
    return String(code)
      .trim()
      .split(/\s*\/\s*/)
      .map(function (w) {
        return w
          .trim()
          .split(/\s+/)
          .map(function (c) {
            return MORSE_REV[c] || '';
          })
          .join('');
      })
      .join(' ')
      .trim();
  }

  /* ---------------- 25. 罗马数字 ---------------- */
  var ROMAN = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  function toRoman(n) {
    var num = Math.floor(Number(n));
    if (!isFinite(num) || num < 1 || num > 3999) return { ok: false, error: 'Enter an integer between 1 and 3999.' };
    var out = '';
    var rest = num;
    for (var i = 0; i < ROMAN.length; i++) {
      while (rest >= ROMAN[i][0]) {
        out += ROMAN[i][1];
        rest -= ROMAN[i][0];
      }
    }
    return { ok: true, value: out };
  }
  function fromRoman(s) {
    var str = String(s).toUpperCase().replace(/\s+/g, '');
    if (!/^[MDCLXVI]+$/.test(str)) return { ok: false, error: 'Only the letters I V X L C D M are allowed.' };
    var map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    var total = 0;
    for (var i = 0; i < str.length; i++) {
      var cur = map[str[i]];
      var next = map[str[i + 1]] || 0;
      total += cur < next ? -cur : cur;
    }
    // 校验：来回转换一致才算合法（排除 IIII 这类写法）
    var back = toRoman(total);
    if (!back.ok || back.value !== str) return { ok: false, error: 'Not a valid Roman numeral (canonical form would be ' + (back.ok ? back.value : '?') + ').' };
    return { ok: true, value: total };
  }

  /* ---------------- 26. 文本反转 ---------------- */
  function reverseText(text, mode) {
    var s = String(text);
    if (mode === 'words') {
      return s
        .split('\n')
        .map(function (line) {
          return line.trim().split(/\s+/).filter(Boolean).reverse().join(' ');
        })
        .join('\n');
    }
    if (mode === 'lines') {
      return s.split('\n').reverse().join('\n');
    }
    // chars：按码位反转，避免把 emoji 拆坏
    return Array.from(s).reverse().join('');
  }

  /* ---------------- 27. 随机数 ---------------- */
  function randomNumbers(min, max, count, opts) {
    opts = opts || {};
    var lo = Number(min);
    var hi = Number(max);
    if (!isFinite(lo) || !isFinite(hi)) return { ok: false, error: 'Min and max must be numbers.' };
    if (lo > hi) {
      var t = lo;
      lo = hi;
      hi = t;
    }
    var n = Math.min(Math.max(Math.floor(Number(count) || 1), 1), 1000);
    var decimals = Math.min(Math.max(Math.floor(Number(opts.decimals) || 0), 0), 8);
    var unique = !!opts.unique;
    var span = hi - lo;
    if (unique && decimals === 0 && span + 1 < n) {
      return { ok: false, error: 'Range only has ' + (span + 1) + ' integers, cannot produce ' + n + ' unique values.' };
    }
    var out = [];
    var seen = Object.create(null);
    var guard = 0;
    while (out.length < n) {
      var v;
      if (decimals > 0) {
        var r = new Uint32Array(1);
        rnd32(r);
        v = lo + (r[0] / 4294967296) * span;
        v = Number(v.toFixed(decimals));
      } else {
        var ri = new Uint32Array(1);
        rnd32(ri);
        v = lo + (ri[0] % (Math.floor(span) + 1));
      }
      if (unique) {
        var key = String(v);
        if (seen[key]) {
          if (++guard > 20000) return { ok: false, error: 'Could not find enough unique values, widen the range.' };
          continue;
        }
        seen[key] = 1;
      }
      out.push(v);
      if (++guard > 200000) break;
    }
    return { ok: true, values: out, min: lo, max: hi };
  }

  /* ---------------- 28. 百分比 ---------------- */
  function percentCalc(mode, a, b) {
    var x = Number(a);
    var y = Number(b);
    if (!isFinite(x) || !isFinite(y)) return { ok: false, error: 'Both values must be numbers.' };
    var label = '';
    var value = 0;
    if (mode === 'of') {
      value = (x / 100) * y;
      label = x + '% of ' + y;
    } else if (mode === 'is') {
      if (y === 0) return { ok: false, error: 'Cannot divide by zero.' };
      value = (x / y) * 100;
      label = x + ' is what percent of ' + y;
    } else if (mode === 'change') {
      if (x === 0) return { ok: false, error: 'Starting value cannot be zero for a change calculation.' };
      value = ((y - x) / Math.abs(x)) * 100;
      label = 'change from ' + x + ' to ' + y;
    } else if (mode === 'add') {
      value = x + (x * y) / 100;
      label = x + ' increased by ' + y + '%';
    } else if (mode === 'sub') {
      value = x - (x * y) / 100;
      label = x + ' decreased by ' + y + '%';
    } else {
      return { ok: false, error: 'Unknown mode.' };
    }
    return { ok: true, value: Number(value.toPrecision(12)), label: label };
  }

  /* ---------------- 29. 年龄计算 ---------------- */
  function ageFromDate(dobISO, nowISO) {
    var dob = new Date(String(dobISO).trim());
    var now = nowISO ? new Date(String(nowISO).trim()) : new Date();
    if (isNaN(dob.getTime())) return { ok: false, error: 'Enter a valid birth date, e.g. 1996-02-23.' };
    if (isNaN(now.getTime())) return { ok: false, error: 'Reference date is invalid.' };
    if (dob > now) return { ok: false, error: 'Birth date is in the future.' };

    var years = now.getUTCFullYear() - dob.getUTCFullYear();
    var months = now.getUTCMonth() - dob.getUTCMonth();
    var days = now.getUTCDate() - dob.getUTCDate();
    if (days < 0) {
      months--;
      var prevMonthDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
      days += prevMonthDays;
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    var totalDays = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())) / 86400000);

    // 下一个生日
    var next = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
    if (next < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))) {
      next = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()));
    }
    var toBirthday = Math.round((next - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000);

    return {
      ok: true,
      years: years,
      months: months,
      days: days,
      totalDays: totalDays,
      weeks: Math.floor(totalDays / 7),
      totalMonths: years * 12 + months,
      nextBirthdayInDays: toBirthday,
      weekdayBorn: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dob.getUTCDay()],
    };
  }

  /* ---------------- 30. 日期差 ---------------- */
  function dateDiff(fromISO, toISO) {
    var a = new Date(String(fromISO).trim());
    var b = new Date(String(toISO).trim());
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return { ok: false, error: 'Enter two valid dates.' };
    var ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    var ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    var sign = ub >= ua ? 1 : -1;
    var lo = Math.min(ua, ub);
    var hi = Math.max(ua, ub);
    var days = Math.round((hi - lo) / 86400000);
    var business = 0;
    for (var t = lo; t < hi; t += 86400000) {
      var d = new Date(t).getUTCDay();
      if (d !== 0 && d !== 6) business++;
    }
    var years = Math.floor(days / 365.25);
    return {
      ok: true,
      days: days * sign,
      weeks: Number(((days / 7) * sign).toFixed(2)),
      months: Number(((days / 30.4375) * sign).toFixed(2)),
      years: Number(((days / 365.25) * sign).toFixed(2)),
      businessDays: business * sign,
      weekends: (days - business) * sign,
      hours: days * 24 * sign,
    };
  }

  /* ---------------- 31. 宽高比 ---------------- */
  function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) {
      var t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }
  function aspectRatio(w, h, newW, newH) {
    var width = Number(w);
    var height = Number(h);
    if (!(width > 0) || !(height > 0)) return { ok: false, error: 'Width and height must be positive numbers.' };
    var g = gcd(width, height);
    var rw = Math.round(width / g);
    var rh = Math.round(height / g);
    var out = {
      ok: true,
      ratio: rw + ':' + rh,
      decimal: Number((width / height).toFixed(4)),
      simplifiedFrom: width + 'x' + height,
      preset: '',
    };
    // 常见比例匹配
    var presets = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1, '3:2': 3 / 2, '9:16': 9 / 16, '2:3': 2 / 3, '4:5': 4 / 5 };
    Object.keys(presets).forEach(function (k) {
      if (!out.preset && Math.abs(width / height - presets[k]) < 0.01) out.preset = k;
    });
    if (Number(newW) > 0) out.newHeight = Math.round((Number(newW) * height) / width);
    if (Number(newH) > 0) out.newWidth = Math.round((Number(newH) * width) / height);
    return out;
  }

  /* ---------------- 32. IPv4 CIDR ---------------- */
  function ipToInt(ip) {
    var p = String(ip).trim().split('.');
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = Number(p[i]);
      if (!/^\d+$/.test(p[i]) || v < 0 || v > 255) return null;
      n = (n << 8) | v;
    }
    return n >>> 0;
  }
  function intToIp(n) {
    n = n >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  function cidrInfo(input) {
    var s = String(input).trim();
    var m = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/);
    if (!m) return { ok: false, error: 'Enter an IPv4 address with optional prefix, e.g. 192.168.1.10/24' };
    var prefix = m[2] === undefined ? 32 : Number(m[2]);
    if (prefix < 0 || prefix > 32) return { ok: false, error: 'Prefix must be between 0 and 32.' };
    var ip = ipToInt(m[1]);
    if (ip === null) return { ok: false, error: 'Each octet must be 0-255.' };

    var mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    var wildcard = (~mask >>> 0) >>> 0;
    var network = (ip & mask) >>> 0;
    var broadcast = (network | wildcard) >>> 0;
    var total = Math.pow(2, 32 - prefix);
    var hosts;
    if (prefix === 32) hosts = 1;
    else if (prefix === 31) hosts = 2;
    else hosts = total - 2;
    var first = prefix >= 31 ? network : (network + 1) >>> 0;
    var last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
    var a = (ip >>> 24) & 255;
    var b = (ip >>> 16) & 255;
    var isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127;

    return {
      ok: true,
      address: m[1],
      prefix: prefix,
      netmask: intToIp(mask),
      wildcard: intToIp(wildcard),
      network: intToIp(network),
      broadcast: intToIp(broadcast),
      cidr: intToIp(network) + '/' + prefix,
      firstHost: intToIp(first),
      lastHost: intToIp(last),
      addressCount: total,
      usableHosts: hosts,
      isPrivate: isPrivate,
      scope: isPrivate ? 'Private (RFC 1918) / loopback' : 'Public',
      binaryMask: (mask >>> 0).toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1.'),
    };
  }

  /* ---------------- 33. Unicode 检查器 ---------------- */
  function unicodePoints(text) {
    var arr = Array.from(String(text));
    var out = [];
    for (var i = 0; i < arr.length && out.length < 400; i++) {
      var ch = arr[i];
      var cp = ch.codePointAt(0);
      out.push({
        char: ch,
        codePoint: cp,
        hex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
        dec: cp,
        bytes: new TextEncoder().encode(ch).length,
        html: '&#' + cp + ';',
        type: /\s/.test(ch) ? 'whitespace' : /[\x00-\x1f\x7f]/.test(ch) ? 'control' : cp > 0xffff ? 'supplementary' : 'basic',
      });
    }
    return { ok: true, points: out, total: arr.length, truncated: arr.length > 400 };
  }

  var api = {
    escapeHtml: escapeHtml,
    fmtJson: fmtJson,
    minifyJson: minifyJson,
    b64Encode: b64Encode,
    b64Decode: b64Decode,
    b64UrlEncode: b64UrlEncode,
    b64UrlDecode: b64UrlDecode,
    urlEncode: urlEncode,
    urlDecode: urlDecode,
    parseQuery: parseQuery,
    tsToDate: tsToDate,
    uuidv4: uuidv4,
    uuidList: uuidList,
    genPassword: genPassword,
    strengthOf: strengthOf,
    hashText: hashText,
    colorConvert: colorConvert,
    textStats: textStats,
    convertCase: convertCase,
    lorem: lorem,
    regexTest: regexTest,
    diffLines: diffLines,
    UNITS: UNITS,
    convertUnits: convertUnits,
    prettyNum: prettyNum,
    htmlEncode: htmlEncode,
    htmlDecode: htmlDecode,
    numBase: numBase,
    textToBinary: textToBinary,
    binaryToText: binaryToText,
    slugify: slugify,
    processLines: processLines,
    parseCsv: parseCsv,
    jsonToCsv: jsonToCsv,
    decodeJwt: decodeJwt,
    mdToHtml: mdToHtml,
    formatBytes: formatBytes,
    b32Encode: b32Encode,
    b32Decode: b32Decode,
    toMorse: toMorse,
    fromMorse: fromMorse,
    toRoman: toRoman,
    fromRoman: fromRoman,
    reverseText: reverseText,
    randomNumbers: randomNumbers,
    percentCalc: percentCalc,
    ageFromDate: ageFromDate,
    dateDiff: dateDiff,
    aspectRatio: aspectRatio,
    cidrInfo: cidrInfo,
    unicodePoints: unicodePoints,
  };

  globalThis.ToolCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
