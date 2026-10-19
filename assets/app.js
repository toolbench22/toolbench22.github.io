/* ToolBench 界面层：把每个工具挂载到 <div id="tool" data-tool="xxx"> 上。
   所有计算都在本地完成，不发任何请求（这是页面上对用户承诺的事，别偷偷加接口）。 */
(function () {
  'use strict';

  var T = globalThis.ToolCore;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return T.escapeHtml(s);
  }
  function copyBtn(target, label) {
    return '<button type="button" data-copy-target="' + target + '">' + (label || 'Copy') + '</button>';
  }
  function out(id, extra) {
    return '<pre class="out" id="' + id + '"' + (extra || '') + '></pre>';
  }
  function err(id) {
    return '<p class="err" id="' + id + '" role="alert"></p>';
  }
  function setErr(id, msg, root) {
    var el = $('#' + id, root);
    if (!el) return;
    el.textContent = msg || '';
  }
  function lines(s) {
    return String(s).split('\n').map(esc).join('\n');
  }

  /* ================= 工具定义 ================= */
  var TOOLS = {
    /* ---------- 1 JSON ---------- */
    'json-formatter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row" style="margin-bottom:10px">' +
          '<label class="field"><span>Indent</span><select id="jIndent">' +
          '<option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></label>' +
          '<label class="check"><input type="checkbox" id="jSort"> Sort keys A-Z</label>' +
          '</div>' +
          '<div class="cols">' +
          '<div class="field"><span>Input JSON</span><textarea id="jIn" spellcheck="false" placeholder=\'{"hello":"world","list":[1,2,3]}\'></textarea></div>' +
          '<div class="field"><span>Output</span><textarea id="jOut" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns">' +
          '<button class="primary" id="jFmt">Format</button>' +
          '<button id="jMin">Minify</button>' +
          '<button id="jSample">Load sample</button>' +
          '<button id="jSwap">Use output as input</button>' +
          copyBtn('#jOut') +
          '</div>' +
          err('jErr');
        var i = $('#jIn', root),
          o = $('#jOut', root);
        function run(min) {
          var r = min ? T.minifyJson(i.value) : T.fmtJson(i.value, $('#jIndent', root).value, $('#jSort', root).checked);
          if (!r.ok) {
            o.value = '';
            setErr('jErr', 'Invalid JSON — ' + r.error, root);
            return;
          }
          o.value = r.out;
          setErr('jErr', '', root);
        }
        $('#jFmt', root).onclick = function () {
          run(false);
        };
        $('#jMin', root).onclick = function () {
          run(true);
        };
        $('#jSample', root).onclick = function () {
          i.value = '{\n  "app": "ToolBench",\n  "tools": 22,\n  "free": true,\n  "tags": ["json", "dev"],\n  "nested": { "a": 1, "b": null }\n}';
          run(false);
        };
        $('#jSwap', root).onclick = function () {
          i.value = o.value;
        };
        i.addEventListener('input', function () {
          if (i.value.length < 200000) run(false);
        });
      },
    },

    /* ---------- 2 Base64 ---------- */
    'base64-encoder': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Plain text</span><textarea id="bIn" spellcheck="false" placeholder="Type text, or paste Base64 to decode."></textarea></div>' +
          '<div class="field"><span>Base64</span><textarea id="bOut" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns">' +
          '<button class="primary" id="bEnc">Encode</button>' +
          '<button id="bDec">Decode</button>' +
          '<label class="check"><input type="checkbox" id="bUrl"> URL-safe alphabet</label>' +
          copyBtn('#bOut') +
          '</div>' +
          err('bErr');
        var i = $('#bIn', root),
          o = $('#bOut', root);
        $('#bEnc', root).onclick = function () {
          try {
            o.value = $('#bUrl', root).checked ? T.b64UrlEncode(i.value) : T.b64Encode(i.value);
            setErr('bErr', '', root);
          } catch (e) {
            setErr('bErr', e.message, root);
          }
        };
        $('#bDec', root).onclick = function () {
          try {
            o.value = $('#bUrl', root).checked ? T.b64UrlDecode(i.value) : T.b64Decode(i.value);
            setErr('bErr', '', root);
          } catch (e) {
            o.value = '';
            setErr('bErr', 'Not valid Base64: ' + e.message, root);
          }
        };
      },
    },

    /* ---------- 3 URL ---------- */
    'url-encoder': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Input</span><textarea id="uIn" spellcheck="false" placeholder="a value with spaces & symbols, or a whole URL"></textarea></div>' +
          '<div class="field"><span>Output</span><textarea id="uOut" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns">' +
          '<button class="primary" id="uEnc">Encode</button>' +
          '<button id="uDec">Decode</button>' +
          '<label class="check"><input type="checkbox" id="uFull"> Treat input as a full URL</label>' +
          copyBtn('#uOut') +
          '</div>' +
          '<div id="uQuery"></div>' +
          err('uErr');
        var i = $('#uIn', root),
          o = $('#uOut', root);
        $('#uEnc', root).onclick = function () {
          o.value = T.urlEncode(i.value, $('#uFull', root).checked);
          renderQuery(i.value);
        };
        $('#uDec', root).onclick = function () {
          o.value = T.urlDecode(i.value);
          renderQuery(o.value);
        };
        function renderQuery(v) {
          var q = String(v).indexOf('?') >= 0 || /^[\w.%+-]+=/.test(String(v).trim()) ? T.parseQuery(v) : [];
          var box = $('#uQuery', root);
          if (!q.length) {
            box.innerHTML = '';
            return;
          }
          box.innerHTML =
            '<h3 style="font-size:14px;margin:16px 0 6px">Decoded query parameters</h3>' +
            '<div class="stat-grid">' +
            q
              .slice(0, 40)
              .map(function (p) {
                return '<div class="stat"><b style="font-size:13px;font-family:var(--mono);word-break:break-all">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
              })
              .join('') +
            '</div>';
        }
      },
    },

    /* ---------- 4 时间戳 ---------- */
    'timestamp-converter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field" style="flex:1"><span>Unix timestamp (seconds or ms) or a date string</span>' +
          '<input type="text" id="tIn" value="" placeholder="1700000000  ·  1700000000000  ·  2024-05-01 12:30:00Z"></label>' +
          '<button class="primary" id="tNow">Use current time</button>' +
          '</div>' +
          '<div id="tRes" style="margin-top:14px"></div>' +
          err('tErr');
        var i = $('#tIn', root);
        function run() {
          var r = T.tsToDate(i.value);
          var box = $('#tRes', root);
          if (!r.ok) {
            box.innerHTML = '';
            setErr('tErr', r.error, root);
            return;
          }
          setErr('tErr', '', root);
          var rows = [
            ['Unix seconds', r.seconds],
            ['Unix milliseconds', r.ms],
            ['ISO 8601 (UTC)', r.iso],
            ['UTC string', r.utc],
            ['Your local time', r.local],
            ['Date only', r.ymd],
            ['Time only', r.hms],
            ['Relative to now', r.relative],
          ];
          box.innerHTML =
            '<div class="stat-grid">' +
            rows
              .map(function (p) {
                return '<div class="stat"><b style="font-size:14px;font-family:var(--mono);word-break:break-all">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
              })
              .join('') +
            '</div>';
        }
        i.addEventListener('input', run);
        $('#tNow', root).onclick = function () {
          i.value = String(Math.floor(Date.now() / 1000));
          run();
        };
        i.value = String(Math.floor(Date.now() / 1000));
        run();
      },
    },

    /* ---------- 5 UUID ---------- */
    'uuid-generator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>How many</span><input type="number" id="uCount" value="10" min="1" max="500"></label>' +
          '<label class="check"><input type="checkbox" id="uUpper"> Uppercase</label>' +
          '<label class="check"><input type="checkbox" id="uBrace"> Wrap in braces</label>' +
          '<button class="primary" id="uGen">Generate</button>' +
          copyBtn('#uOutList') +
          '</div>' +
          '<textarea id="uOutList" spellcheck="false" readonly style="margin-top:12px;min-height:260px"></textarea>';
        function run() {
          $('#uOutList', root).value = T.uuidList($('#uCount', root).value, $('#uUpper', root).checked, $('#uBrace', root).checked).join('\n');
        }
        $('#uGen', root).onclick = run;
        run();
      },
    },

    /* ---------- 6 密码 ---------- */
    'password-generator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Length</span><input type="number" id="pLen" value="20" min="4" max="256"></label>' +
          '<label class="check"><input type="checkbox" id="pLower" checked> a-z</label>' +
          '<label class="check"><input type="checkbox" id="pUpper" checked> A-Z</label>' +
          '<label class="check"><input type="checkbox" id="pDigit" checked> 0-9</label>' +
          '<label class="check"><input type="checkbox" id="pSym" checked> !@#$</label>' +
          '<label class="check"><input type="checkbox" id="pAmb"> No look-alike chars</label>' +
          '<button class="primary" id="pGen">Generate</button>' +
          copyBtn('#pOut') +
          '</div>' +
          '<input type="text" id="pOut" readonly spellcheck="false" style="margin-top:12px;font-size:16px;padding:12px">' +
          '<div style="margin-top:10px;height:8px;border-radius:6px;background:var(--line);overflow:hidden">' +
          '<div id="pBar" style="height:100%;width:0;background:var(--brand);transition:width .2s"></div></div>' +
          '<p class="hint" id="pHint"></p>';
        function run() {
          var r = T.genPassword(Number($('#pLen', root).value), {
            lower: $('#pLower', root).checked,
            upper: $('#pUpper', root).checked,
            digits: $('#pDigit', root).checked,
            symbols: $('#pSym', root).checked,
            noAmbiguous: $('#pAmb', root).checked,
          });
          $('#pOut', root).value = r.password;
          var s = T.strengthOf(r.entropy);
          $('#pBar', root).style.width = s.pct + '%';
          $('#pBar', root).style.background = s.pct < 50 ? 'var(--bad)' : s.pct < 80 ? '#d68a00' : 'var(--ok)';
          $('#pHint', root).textContent = r.entropy + ' bits of entropy from a ' + r.pool + ' character pool — ' + s.label + '. Generated in your browser; nothing is sent anywhere.';
        }
        $('#pGen', root).onclick = run;
        $('#pLen', root).addEventListener('input', run);
        run();
      },
    },

    /* ---------- 7 哈希 ---------- */
    'hash-generator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="field"><span>Text to hash</span><textarea id="hIn" spellcheck="false" placeholder="Paste any text"></textarea></div>' +
          '<div class="btns"><button class="primary" id="hRun">Hash it (all algorithms)</button>' + copyBtn('#hOut') + '</div>' +
          '<div style="margin-top:12px"><pre class="out" id="hOut"></pre></div>' +
          err('hErr') +
          '<p class="hint">Implemented with the browser Web Crypto API. Hashes are one-way: this tool cannot reverse a hash.</p>';
        $('#hRun', root).onclick = function () {
          var v = $('#hIn', root).value;
          if (!v) {
            setErr('hErr', 'Type something first.', root);
            return;
          }
          setErr('hErr', '', root);
          $('#hOut', root).textContent = 'hashing...';
          var algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
          Promise.all(
            algos.map(function (a) {
              return T.hashText(v, a);
            })
          )
            .then(function (res) {
              $('#hOut', root).textContent = algos
                .map(function (a, i) {
                  return a.padEnd(10) + res[i];
                })
                .join('\n');
            })
            .catch(function (e) {
              setErr('hErr', 'Web Crypto unavailable: ' + e.message + ' (needs HTTPS or localhost).', root);
              $('#hOut', root).textContent = '';
            });
        };
      },
    },

    /* ---------- 8 颜色 ---------- */
    'color-converter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field" style="flex:1"><span>Hex color</span><input type="text" id="cIn" value="#1f6feb" spellcheck="false"></label>' +
          '<button class="primary" id="cPick">Pick random</button>' +
          '</div>' +
          '<div id="cRes"></div>' +
          err('cErr');
        function run() {
          var r = T.colorConvert($('#cIn', root).value);
          if (!r.ok) {
            $('#cRes', root).innerHTML = '';
            setErr('cErr', r.error, root);
            return;
          }
          setErr('cErr', '', root);
          var rows = [
            ['HEX', r.hex],
            ['RGB', r.rgb],
            ['HSL', r.hsl],
            ['Relative luminance', String(r.luminance)],
            ['Text color to use on it', r.textOn],
          ];
          $('#cRes', root).innerHTML =
            '<ul class="swatches">' +
            rows
              .map(function (p, i) {
                return (
                  '<li><i style="background:' + esc(i === 4 ? r.textOn : r.hex) + '"></i><b style="font-weight:600;min-width:150px;color:var(--fg-soft)">' + esc(p[0]) + '</b><span style="flex:1;word-break:break-all">' + esc(p[1]) + '</span></li>'
                );
              })
              .join('') +
            '</ul>';
        }
        $('#cIn', root).addEventListener('input', run);
        $('#cPick', root).onclick = function () {
          var hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
          $('#cIn', root).value = '#' + hex;
          run();
        };
        run();
      },
    },

    /* ---------- 9 字数 ---------- */
    'word-counter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="field"><span>Your text</span><textarea id="wIn" spellcheck="false" style="min-height:220px" placeholder="Paste or type your text — counts update as you type."></textarea></div>' +
          '<div id="wStats" style="margin-top:14px"></div>' +
          '<div class="btns"><button id="wClear">Clear</button></div>';
        function run() {
          var s = T.textStats($('#wIn', root).value);
          var rows = [
            ['Words', s.words],
            ['Characters', s.chars],
            ['Characters (no spaces)', s.charsNoSpace],
            ['Lines', s.lines],
            ['Sentences', s.sentences],
            ['Paragraphs', s.paragraphs],
            ['Reading time', Math.max(s.readingSeconds, 0) + 's'],
            ['Speaking time', Math.max(s.speakingSeconds, 0) + 's'],
          ];
          $('#wStats', root).innerHTML =
            '<div class="stat-grid">' +
            rows
              .map(function (p) {
                return '<div class="stat"><b>' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
              })
              .join('') +
            '</div>';
        }
        $('#wIn', root).addEventListener('input', run);
        $('#wClear', root).onclick = function () {
          $('#wIn', root).value = '';
          run();
        };
        run();
      },
    },

    /* ---------- 10 大小写 ---------- */
    'case-converter': {
      mount: function (root) {
        var modes = [
          ['upper', 'UPPER CASE'],
          ['lower', 'lower case'],
          ['title', 'Title Case'],
          ['sentence', 'Sentence case'],
          ['camel', 'camelCase'],
          ['pascal', 'PascalCase'],
          ['snake', 'snake_case'],
          ['kebab', 'kebab-case'],
          ['constant', 'CONSTANT_CASE'],
          ['alternating', 'aLtErNaTiNg'],
        ];
        root.innerHTML =
          '<div class="field"><span>Input</span><textarea id="kIn" spellcheck="false" placeholder="Hello World example text"></textarea></div>' +
          '<div class="btns">' +
          modes
            .map(function (m) {
              return '<button data-mode="' + m[0] + '">' + m[1] + '</button>';
            })
            .join('') +
          '</div>' +
          '<div class="field" style="margin-top:12px"><span>Result</span><textarea id="kOut" spellcheck="false" readonly></textarea></div>' +
          '<div class="btns">' + copyBtn('#kOut') + '</div>';
        $$('[data-mode]', root).forEach(function (b) {
          b.onclick = function () {
            $('#kOut', root).value = T.convertCase($('#kIn', root).value, b.dataset.mode);
          };
        });
        $('#kIn', root).value = 'Hello World example text';
        $('#kOut', root).value = 'Hello World example text';
      },
    },

    /* ---------- 11 Lorem ---------- */
    'lorem-ipsum-generator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Amount</span><input type="number" id="lCount" value="3" min="1" max="50"></label>' +
          '<label class="field"><span>Unit</span><select id="lType"><option value="paragraphs">Paragraphs</option><option value="sentences">Sentences</option><option value="words">Words</option></select></label>' +
          '<button class="primary" id="lGen">Generate</button>' +
          copyBtn('#lOut') +
          '</div>' +
          '<pre class="out" id="lOut" style="margin-top:12px;min-height:180px"></pre>';
        function run() {
          $('#lOut', root).textContent = T.lorem(Number($('#lCount', root).value), $('#lType', root).value);
        }
        $('#lGen', root).onclick = run;
        run();
      },
    },

    /* ---------- 12 正则 ---------- */
    'regex-tester': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field" style="flex:2"><span>Pattern (without slashes)</span><input type="text" id="rPat" value="\\b\\w+@\\w+\\.\\w{2,}\\b" spellcheck="false"></label>' +
          '<label class="field"><span>Flags</span><input type="text" id="rFlags" value="gi" spellcheck="false" style="max-width:90px"></label>' +
          '</div>' +
          '<div class="field" style="margin-top:10px"><span>Test string</span><textarea id="rIn" spellcheck="false" placeholder="mail me at someone@example.com">mail me at someone@example.com and also hi@test.io</textarea></div>' +
          '<div id="rCount" class="hint"></div>' +
          '<h3 style="font-size:14px;margin:14px 0 6px">Highlighted matches</h3>' +
          '<pre class="out" id="rHi" style="white-space:pre-wrap"></pre>' +
          '<h3 style="font-size:14px;margin:14px 0 6px">Match list</h3>' +
          '<pre class="out" id="rList"></pre>' +
          err('rErr');
        function run() {
          var r = T.regexTest($('#rPat', root).value, $('#rFlags', root).value, $('#rIn', root).value);
          if (!r.ok) {
            setErr('rErr', r.error, root);
            $('#rHi', root).textContent = '';
            $('#rList', root).textContent = '';
            $('#rCount', root).textContent = '';
            return;
          }
          setErr('rErr', '', root);
          $('#rHi', root).innerHTML = r.highlighted;
          $('#rCount', root).textContent = r.matches.length + ' match' + (r.matches.length === 1 ? '' : 'es');
          $('#rList', root).textContent = r.matches.length
            ? r.matches
                .slice(0, 200)
                .map(function (m, i) {
                  return '#' + (i + 1) + '  index ' + m.index + '  "' + m.text + '"' + (m.groups && m.groups.length ? '  groups: ' + JSON.stringify(m.groups) : '');
                })
                .join('\n')
            : '(no matches)';
        }
        ['rPat', 'rFlags', 'rIn'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
        });
        run();
      },
    },

    /* ---------- 13 文本对比 ---------- */
    'diff-checker': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Original</span><textarea id="dA" spellcheck="false"></textarea></div>' +
          '<div class="field"><span>Changed</span><textarea id="dB" spellcheck="false"></textarea></div>' +
          '</div>' +
          '<div class="btns"><button class="primary" id="dRun">Compare</button><button id="dClear">Clear</button></div>' +
          '<div id="dStat" class="hint"></div>' +
          '<div class="diff" id="dOut" style="margin-top:10px"></div>';
        $('#dA', root).value = 'line one\nline two\nline three\nline four';
        $('#dB', root).value = 'line one\nline two changed\nline three\nline five';
        function run() {
          var r = T.diffLines($('#dA', root).value, $('#dB', root).value);
          $('#dStat', root).textContent = '+' + r.added + ' added, −' + r.removed + ' removed';
          $('#dOut', root).innerHTML = r.lines
            .map(function (l) {
              var mark = l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  ';
              return '<span class="' + l.type + '">' + esc(mark + l.text) + '</span>';
            })
            .join('');
        }
        $('#dRun', root).onclick = run;
        $('#dClear', root).onclick = function () {
          $('#dA', root).value = '';
          $('#dB', root).value = '';
          run();
        };
        run();
      },
    },

    /* ---------- 14 单位换算 ---------- */
    'unit-converter': {
      mount: function (root) {
        var cats = Object.keys(T.UNITS);
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Category</span><select id="nCat">' +
          cats
            .map(function (c) {
              return '<option value="' + c + '">' + esc(T.UNITS[c].label) + '</option>';
            })
            .join('') +
          '</select></label>' +
          '<label class="field" style="flex:1"><span>Value</span><input type="text" id="nVal" value="1"></label>' +
          '</div>' +
          '<div class="row" style="margin-top:12px">' +
          '<label class="field" style="flex:1"><span>From</span><select id="nFrom"></select></label>' +
          '<button id="nSwap" title="Swap units">&#8646;</button>' +
          '<label class="field" style="flex:1"><span>To</span><select id="nTo"></select></label>' +
          '</div>' +
          '<div id="nRes" style="margin-top:14px"></div>' +
          err('nErr');
        function fillUnits() {
          var u = Object.keys(T.UNITS[$('#nCat', root).value].units);
          var opts = u
            .map(function (x) {
              return '<option value="' + esc(x) + '">' + esc(x) + '</option>';
            })
            .join('');
          $('#nFrom', root).innerHTML = opts;
          $('#nTo', root).innerHTML = opts;
          $('#nFrom', root).value = u[1] || u[0];
          $('#nTo', root).value = u[0];
        }
        function run() {
          var r = T.convertUnits($('#nCat', root).value, $('#nFrom', root).value, $('#nTo', root).value, $('#nVal', root).value);
          if (!r.ok) {
            $('#nRes', root).innerHTML = '';
            setErr('nErr', r.error, root);
            return;
          }
          setErr('nErr', '', root);
          $('#nRes', root).innerHTML =
            '<div class="stat" style="padding:16px"><b style="font-size:26px">' +
            esc(r.pretty) +
            ' ' +
            esc($('#nTo', root).value) +
            '</b><span>' +
            esc($('#nVal', root).value) +
            ' ' +
            esc($('#nFrom', root).value) +
            '</span></div>';
        }
        $('#nCat', root).onchange = function () {
          fillUnits();
          run();
        };
        $('#nSwap', root).onclick = function () {
          var a = $('#nFrom', root).value;
          $('#nFrom', root).value = $('#nTo', root).value;
          $('#nTo', root).value = a;
          run();
        };
        ['nVal', 'nFrom', 'nTo'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
          $('#' + id, root).addEventListener('change', run);
        });
        fillUnits();
        run();
      },
    },

    /* ---------- 15 HTML 实体 ---------- */
    'html-entity-converter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Input</span><textarea id="eIn" spellcheck="false" placeholder="<p>Hello & welcome</p>"></textarea></div>' +
          '<div class="field"><span>Output</span><textarea id="eOut" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns">' +
          '<button class="primary" id="eEnc">Encode</button>' +
          '<button id="eDec">Decode</button>' +
          '<label class="check"><input type="checkbox" id="eAll"> Encode all non-ASCII too</label>' +
          copyBtn('#eOut') +
          '</div>' +
          err('eErr');
        $('#eEnc', root).onclick = function () {
          $('#eOut', root).value = T.htmlEncode($('#eIn', root).value, $('#eAll', root).checked);
        };
        $('#eDec', root).onclick = function () {
          $('#eOut', root).value = T.htmlDecode($('#eIn', root).value);
        };
      },
    },

    /* ---------- 16 进制 ---------- */
    'number-base-converter': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>Number (decimal, 0x hex, 0b binary, or 0o octal)</span><input type="text" id="nbIn" value="255" spellcheck="false"></label>' +
          '<div id="nbRes" style="margin-top:14px"></div>' +
          err('nbErr');
        function run() {
          var r = T.numBase($('#nbIn', root).value);
          if (!r.ok) {
            $('#nbRes', root).innerHTML = '';
            setErr('nbErr', r.error, root);
            return;
          }
          setErr('nbErr', '', root);
          var rows = [
            ['Decimal', r.dec],
            ['Binary', r.bin],
            ['Octal', r.oct],
            ['Hex', r.hex],
          ];
          $('#nbRes', root).innerHTML =
            '<div class="stat-grid">' +
            rows
              .map(function (p) {
                return '<div class="stat"><b style="font-size:14px;font-family:var(--mono);word-break:break-all">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
              })
              .join('') +
            '</div>';
        }
        $('#nbIn', root).addEventListener('input', run);
        run();
      },
    },

    /* ---------- 17 文本<->二进制 ---------- */
    'text-to-binary': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Input</span><textarea id="tbIn" spellcheck="false" placeholder="Hello">Hello</textarea></div>' +
          '<div class="field"><span>Output</span><textarea id="tbOut" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns">' +
          '<button class="primary" id="tbT2B">Text to binary</button>' +
          '<button id="tbB2T">Binary to text</button>' +
          copyBtn('#tbOut') +
          '</div>';
        $('#tbT2B', root).onclick = function () {
          $('#tbOut', root).value = T.textToBinary($('#tbIn', root).value);
        };
        $('#tbB2T', root).onclick = function () {
          $('#tbOut', root).value = T.binaryToText($('#tbIn', root).value);
        };
        $('#tbOut', root).value = T.textToBinary('Hello');
      },
    },

    /* ---------- 18 Slug ---------- */
    'slug-generator': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>Title or text (one per line for batch)</span><textarea id="sIn" spellcheck="false" style="min-height:120px">10 Best Free Online Tools for Developers</textarea></label>' +
          '<div class="row" style="margin-top:10px">' +
          '<label class="field"><span>Separator</span><select id="sSep"><option value="-">hyphen -</option><option value="_">underscore _</option></select></label>' +
          '<label class="check"><input type="checkbox" id="sLower" checked> lowercase</label>' +
          copyBtn('#sOut') +
          '</div>' +
          '<pre class="out" id="sOut" style="margin-top:12px"></pre>';
        function run() {
          $('#sOut', root).textContent = $('#sIn', root)
            .value.split('\n')
            .map(function (l) {
              return T.slugify(l, $('#sSep', root).value, $('#sLower', root).checked);
            })
            .filter(Boolean)
            .join('\n');
        }
        ['sIn', 'sSep', 'sLower'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
          $('#' + id, root).addEventListener('change', run);
        });
        run();
      },
    },

    /* ---------- 19 行处理 ---------- */
    'line-sorter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Input lines</span><textarea id="qIn" spellcheck="false" style="min-height:200px"></textarea></div>' +
          '<div class="field"><span>Result</span><textarea id="qOut" spellcheck="false" readonly style="min-height:200px"></textarea></div>' +
          '</div>' +
          '<div class="row" style="margin-top:10px">' +
          '<label class="field"><span>Sort</span><select id="qSort">' +
          '<option value="">none</option><option value="alpha">A → Z</option><option value="numeric">numeric</option><option value="length">length</option><option value="shuffle">shuffle</option>' +
          '</select></label>' +
          '<label class="check"><input type="checkbox" id="qTrim"> trim spaces</label>' +
          '<label class="check"><input type="checkbox" id="qEmpty" checked> drop empty</label>' +
          '<label class="check"><input type="checkbox" id="qDedupe" checked> remove duplicates</label>' +
          '<label class="check"><input type="checkbox" id="qCI"> ignore case when deduping</label>' +
          '<label class="check"><input type="checkbox" id="qRev"> reverse</label>' +
          copyBtn('#qOut') +
          '</div>' +
          '<p class="hint" id="qStat"></p>';
        function run() {
          var out = T.processLines($('#qIn', root).value, {
            trim: $('#qTrim', root).checked,
            removeEmpty: $('#qEmpty', root).checked,
            dedupe: $('#qDedupe', root).checked,
            caseInsensitive: $('#qCI', root).checked,
            sort: $('#qSort', root).value,
            reverse: $('#qRev', root).checked,
          });
          $('#qOut', root).value = out.join('\n');
          $('#qStat', root).textContent = $('#qIn', root).value.split('\n').length + ' lines in → ' + out.length + ' lines out';
        }
        $$('input, select', root).forEach(function (el) {
          el.addEventListener('input', run);
          el.addEventListener('change', run);
        });
        $('#qIn', root).value = 'banana\nApple\napple\ncherry\n\nbanana\n123';
        run();
      },
    },

    /* ---------- 20 CSV <-> JSON ---------- */
    'csv-json-converter': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Direction</span><select id="cmDir">' +
          '<option value="c2j">CSV → JSON</option><option value="j2c">JSON → CSV</option></select></label>' +
          '<label class="field"><span>Delimiter</span><select id="cmDel"><option value=",">comma ,</option><option value=";">semicolon ;</option><option value="&#9;">tab</option></select></label>' +
          '<button class="primary" id="cmRun">Convert</button>' +
          copyBtn('#cmOut') +
          '</div>' +
          '<div class="cols" style="margin-top:12px">' +
          '<div class="field"><span>Input</span><textarea id="cmIn" spellcheck="false" style="min-height:200px"></textarea></div>' +
          '<div class="field"><span>Output</span><textarea id="cmOut" spellcheck="false" readonly style="min-height:200px"></textarea></div>' +
          '</div>' +
          '<p class="hint" id="cmOk"></p>' +
          err('cmErr');
        $('#cmIn', root).value = 'name,role,city\nAda,Engineer,London\nGrace,Admiral,NYC';
        function run() {
          var dir = $('#cmDir', root).value;
          var del = $('#cmDel', root).value;
          if (dir === 'c2j') {
            var r = T.parseCsv($('#cmIn', root).value, del);
            if (!r.ok) {
              setErr('cmErr', r.error, root);
              $('#cmOk', root).textContent = '';
              $('#cmOut', root).value = '';
              return;
            }
            setErr('cmErr', '', root);
            $('#cmOk', root).textContent = 'Parsed ' + r.objects.length + ' rows and ' + r.header.length + ' columns.';
            $('#cmOut', root).value = JSON.stringify(r.objects, null, 2);
          } else {
            var j = T.jsonToCsv($('#cmIn', root).value, del);
            if (!j.ok) {
              setErr('cmErr', j.error, root);
              $('#cmOut', root).value = '';
              return;
            }
            setErr('cmErr', '', root);
            $('#cmOk', root).textContent = '';
            $('#cmOut', root).value = j.out;
          }
        }
        $('#cmRun', root).onclick = run;
        $('#cmDir', root).onchange = run;
        run();
      },
    },

    /* ---------- 21 JWT ---------- */
    'jwt-decoder': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>JWT (paste the whole token)</span><textarea id="jwtIn" spellcheck="false" style="min-height:120px" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature"></textarea></label>' +
          '<div class="btns"><button class="primary" id="jwtRun">Decode</button>' + copyBtn('#jwtOut') + '</div>' +
          err('jwtErr') +
          '<div id="jwtClaims" style="margin-top:12px"></div>' +
          '<div class="field" style="margin-top:12px"><span>Header + payload (JSON)</span><textarea id="jwtOut" spellcheck="false" readonly style="min-height:220px"></textarea></div>' +
          '<p class="hint">Decoding only — the signature is NOT verified here. Never paste production tokens into a random website; this one never sends your token anywhere, but you cannot audit every site.</p>';
        function run() {
          var r = T.decodeJwt($('#jwtIn', root).value);
          if (!r.ok) {
            setErr('jwtErr', r.error, root);
            $('#jwtOut', root).value = '';
            $('#jwtClaims', root).innerHTML = '';
            return;
          }
          setErr('jwtErr', '', root);
          $('#jwtOut', root).value = JSON.stringify({ header: r.header, payload: r.payload }, null, 2);
          $('#jwtClaims', root).innerHTML = r.claims.length
            ? '<div class="stat-grid">' +
              r.claims
                .map(function (c) {
                  return '<div class="stat"><b style="font-size:13px;font-family:var(--mono);word-break:break-all">' + esc(c.value) + '</b><span>' + esc(c.label) + '</span></div>';
                })
                .join('') +
              '</div>'
            : '';
        }
        $('#jwtRun', root).onclick = run;
      },
    },

    /* ---------- 22 Markdown ---------- */
    'markdown-previewer': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Markdown</span><textarea id="mdIn" spellcheck="false" style="min-height:320px"></textarea></div>' +
          '<div class="field"><span>Preview</span><div class="out" id="mdOut" style="min-height:320px"></div></div>' +
          '</div>' +
          '<div class="btns"><button class="primary" id="mdCopyHtml">Copy HTML</button><button id="mdSample">Load sample</button></div>';
        var sample = [
          '# Markdown preview',
          '',
          'Type on the left, see it rendered on the right. **Bold**, *italic*, `inline code`, ~~strike~~.',
          '',
          '## Lists',
          '',
          '- one',
          '- two',
          '- three',
          '',
          '1. first',
          '2. second',
          '',
          '> Blockquotes work too.',
          '',
          '```js',
          'const tool = "toolbench";',
          '```',
          '',
          '[A link](https://example.com) and --- a rule below.',
          '',
          '---',
        ].join('\n');
        function run() {
          var html = T.mdToHtml($('#mdIn', root).value);
          $('#mdOut', root).innerHTML = html;
          $('#mdOut', root).dataset.html = html;
        }
        $('#mdIn', root).addEventListener('input', run);
        $('#mdSample', root).onclick = function () {
          $('#mdIn', root).value = sample;
          run();
        };
        $('#mdCopyHtml', root).onclick = function () {
          var html = $('#mdOut', root).dataset.html || '';
          if (navigator.clipboard) navigator.clipboard.writeText(html);
        };
        $('#mdIn', root).value = sample;
        run();
      },
    },

    /* ---------- 23 Base32 ---------- */
    'base32-encoder': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Plain text</span><textarea id="b32In" spellcheck="false" placeholder="Type text, or paste Base32 to decode"></textarea></div>' +
          '<div class="field"><span>Base32 (RFC 4648)</span><textarea id="b32Out" spellcheck="false" readonly></textarea></div>' +
          '</div>' +
          '<div class="btns"><button class="primary" id="b32Enc">Encode</button><button id="b32Dec">Decode</button>' +
          '<label class="check"><input type="checkbox" id="b32NoPad"> No padding</label>' + copyBtn('#b32Out') + '</div>' +
          err('b32Err');
        var i = $('#b32In', root),
          o = $('#b32Out', root);
        $('#b32Enc', root).onclick = function () {
          try {
            o.value = T.b32Encode(i.value, $('#b32NoPad', root).checked);
            setErr('b32Err', '', root);
          } catch (e) {
            setErr('b32Err', e.message, root);
          }
        };
        $('#b32Dec', root).onclick = function () {
          try {
            o.value = T.b32Decode(i.value);
            setErr('b32Err', '', root);
          } catch (e) {
            o.value = '';
            setErr('b32Err', e.message, root);
          }
        };
      },
    },

    /* ---------- 24 摩尔斯 ---------- */
    'morse-code-translator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="cols">' +
          '<div class="field"><span>Text</span><textarea id="morIn" spellcheck="false" style="min-height:110px">SOS help</textarea></div>' +
          '<div class="field"><span>Morse code</span><textarea id="morOut" spellcheck="false" style="min-height:110px"></textarea></div>' +
          '</div>' +
          '<div class="btns"><button class="primary" id="morTo">Text → Morse</button><button id="morFrom">Morse → Text</button>' + copyBtn('#morOut') + '</div>' +
          '<p class="hint">Letters are separated by a space, words by <code>/</code>. Both directions accept that format.</p>';
        $('#morTo', root).onclick = function () {
          $('#morOut', root).value = T.toMorse($('#morIn', root).value);
        };
        $('#morFrom', root).onclick = function () {
          $('#morOut', root).value = T.fromMorse($('#morIn', root).value);
        };
        $('#morOut', root).value = T.toMorse('SOS help');
      },
    },

    /* ---------- 25 罗马数字 ---------- */
    'roman-numeral-converter': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>Number (1–3999) or Roman numeral</span>' +
          '<input type="text" id="romIn" value="1994" spellcheck="false" placeholder="1994  or  MCMXCIV"></label>' +
          '<div id="romRes" style="margin-top:14px"></div>' + err('romErr');
        function run() {
          var v = $('#romIn', root).value.trim();
          if (!v) {
            $('#romRes', root).innerHTML = '';
            setErr('romErr', '', root);
            return;
          }
          var box = $('#romRes', root);
          if (/^\d+$/.test(v)) {
            var r = T.toRoman(v);
            if (!r.ok) {
              box.innerHTML = '';
              setErr('romErr', r.error, root);
              return;
            }
            setErr('romErr', '', root);
            box.innerHTML = '<div class="stat" style="padding:16px"><b style="font-size:26px;font-family:var(--mono)">' + esc(r.value) + '</b><span>' + esc(v) + ' in Roman numerals</span></div>';
          } else {
            var f = T.fromRoman(v);
            if (!f.ok) {
              box.innerHTML = '';
              setErr('romErr', f.error, root);
              return;
            }
            setErr('romErr', '', root);
            box.innerHTML = '<div class="stat" style="padding:16px"><b style="font-size:26px;font-family:var(--mono)">' + esc(f.value) + '</b><span>' + esc(v.toUpperCase()) + ' in decimal</span></div>';
          }
        }
        $('#romIn', root).addEventListener('input', run);
        run();
      },
    },

    /* ---------- 26 文本反转 ---------- */
    'text-reverser': {
      mount: function (root) {
        var modes = [
          ['chars', 'Reverse characters'],
          ['words', 'Reverse word order'],
          ['lines', 'Reverse line order'],
        ];
        root.innerHTML =
          '<div class="field"><span>Input</span><textarea id="revIn" spellcheck="false" style="min-height:140px"></textarea></div>' +
          '<div class="btns">' + modes.map(function (m) {
            return '<button data-rev="' + m[0] + '">' + m[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="field" style="margin-top:12px"><span>Result</span><textarea id="revOut" spellcheck="false" readonly style="min-height:140px"></textarea></div>' +
          '<div class="btns">' + copyBtn('#revOut') + '<button id="revSample">Load sample</button></div>';
        function run(mode) {
          $('#revOut', root).value = T.reverseText($('#revIn', root).value, mode);
        }
        $$('[data-rev]', root).forEach(function (b) {
          b.onclick = function () {
            run(b.dataset.rev);
          };
        });
        $('#revSample', root).onclick = function () {
          $('#revIn', root).value = 'The quick brown fox\njumps over the lazy dog\n中文也支持 😀';
          run('chars');
        };
        $('#revIn', root).value = 'The quick brown fox\njumps over the lazy dog';
        run('chars');
      },
    },

    /* ---------- 27 随机数 ---------- */
    'random-number-generator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Min</span><input type="number" id="rnMin" value="1"></label>' +
          '<label class="field"><span>Max</span><input type="number" id="rnMax" value="100"></label>' +
          '<label class="field"><span>How many</span><input type="number" id="rnCount" value="10" min="1" max="1000"></label>' +
          '<label class="field"><span>Decimals</span><input type="number" id="rnDec" value="0" min="0" max="8"></label>' +
          '<label class="check"><input type="checkbox" id="rnUnique"> Unique only</label>' +
          '<button class="primary" id="rnGo">Generate</button>' + copyBtn('#rnOut') +
          '</div>' +
          '<textarea id="rnOut" spellcheck="false" readonly style="margin-top:12px;min-height:200px"></textarea>' +
          err('rnErr');
        function run() {
          var r = T.randomNumbers($('#rnMin', root).value, $('#rnMax', root).value, $('#rnCount', root).value, {
            unique: $('#rnUnique', root).checked,
            decimals: $('#rnDec', root).value,
          });
          if (!r.ok) {
            $('#rnOut', root).value = '';
            setErr('rnErr', r.error, root);
            return;
          }
          setErr('rnErr', '', root);
          $('#rnOut', root).value = r.values.join('\n');
        }
        $('#rnGo', root).onclick = run;
        run();
      },
    },

    /* ---------- 28 百分比 ---------- */
    'percent-calculator': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>What do you want to calculate?</span><select id="pcMode">' +
          '<option value="of">X% of a number</option>' +
          '<option value="is">X is what percent of Y</option>' +
          '<option value="change">Percent change from X to Y</option>' +
          '<option value="add">Increase X by Y%</option>' +
          '<option value="sub">Decrease X by Y%</option>' +
          '</select></label>' +
          '<div class="row" style="margin-top:12px">' +
          '<label class="field"><span id="pcALabel">X (%)</span><input type="text" id="pcA" value="20"></label>' +
          '<label class="field"><span id="pcBLabel">Y (number)</span><input type="text" id="pcB" value="150"></label>' +
          '</div>' +
          '<div id="pcRes" style="margin-top:14px"></div>' + err('pcErr');
        function labels() {
          var m = $('#pcMode', root).value;
          var map = {
            of: ['Percentage (%)', 'Of number'],
            is: ['Number X', 'Number Y'],
            change: ['Starting value', 'New value'],
            add: ['Number X', 'Increase by (%)'],
            sub: ['Number X', 'Decrease by (%)'],
          };
          $('#pcALabel', root).textContent = map[m][0];
          $('#pcBLabel', root).textContent = map[m][1];
        }
        function run() {
          var r = T.percentCalc($('#pcMode', root).value, $('#pcA', root).value, $('#pcB', root).value);
          if (!r.ok) {
            $('#pcRes', root).innerHTML = '';
            setErr('pcErr', r.error, root);
            return;
          }
          setErr('pcErr', '', root);
          $('#pcRes', root).innerHTML =
            '<div class="stat" style="padding:16px"><b style="font-size:26px">' + esc(r.value) + '</b><span>' + esc(r.label) + '</span></div>';
        }
        $('#pcMode', root).onchange = function () {
          labels();
          run();
        };
        ['pcA', 'pcB'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
        });
        labels();
        run();
      },
    },

    /* ---------- 29 年龄 ---------- */
    'age-calculator': {
      mount: function (root) {
        var today = new Date().toISOString().slice(0, 10);
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Date of birth</span><input type="date" id="ageDob" value="1996-02-23"></label>' +
          '<label class="field"><span>Calculate as of</span><input type="date" id="ageAs" value="' + today + '"></label>' +
          '</div>' +
          '<div id="ageRes" style="margin-top:14px"></div>' + err('ageErr');
        function run() {
          var r = T.ageFromDate($('#ageDob', root).value, $('#ageAs', root).value);
          if (!r.ok) {
            $('#ageRes', root).innerHTML = '';
            setErr('ageErr', r.error, root);
            return;
          }
          setErr('ageErr', '', root);
          var rows = [
            ['Age', r.years + ' y ' + r.months + ' m ' + r.days + ' d'],
            ['Total days', r.totalDays.toLocaleString()],
            ['Total weeks', r.weeks.toLocaleString()],
            ['Total months', r.totalMonths.toLocaleString()],
            ['Born on a', r.weekdayBorn],
            ['Next birthday in', r.nextBirthdayInDays + ' days'],
          ];
          $('#ageRes', root).innerHTML = '<div class="stat-grid">' + rows.map(function (p) {
            return '<div class="stat"><b style="font-size:15px">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
          }).join('') + '</div>';
        }
        ['ageDob', 'ageAs'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
          $('#' + id, root).addEventListener('change', run);
        });
        run();
      },
    },

    /* ---------- 30 日期差 ---------- */
    'date-difference-calculator': {
      mount: function (root) {
        var today = new Date().toISOString().slice(0, 10);
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>From</span><input type="date" id="ddA" value="2026-01-01"></label>' +
          '<label class="field"><span>To</span><input type="date" id="ddB" value="' + today + '"></label>' +
          '<button id="ddSwap">Swap</button>' +
          '</div>' +
          '<div id="ddRes" style="margin-top:14px"></div>' + err('ddErr');
        function run() {
          var r = T.dateDiff($('#ddA', root).value, $('#ddB', root).value);
          if (!r.ok) {
            $('#ddRes', root).innerHTML = '';
            setErr('ddErr', r.error, root);
            return;
          }
          setErr('ddErr', '', root);
          var rows = [
            ['Days', r.days.toLocaleString()],
            ['Business days', r.businessDays.toLocaleString()],
            ['Weekend days', r.weekends.toLocaleString()],
            ['Weeks', r.weeks],
            ['Months (avg)', r.months],
            ['Years (avg)', r.years],
            ['Hours', r.hours.toLocaleString()],
          ];
          $('#ddRes', root).innerHTML = '<div class="stat-grid">' + rows.map(function (p) {
            return '<div class="stat"><b style="font-size:15px">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
          }).join('') + '</div>';
        }
        $('#ddSwap', root).onclick = function () {
          var a = $('#ddA', root).value;
          $('#ddA', root).value = $('#ddB', root).value;
          $('#ddB', root).value = a;
          run();
        };
        ['ddA', 'ddB'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
          $('#' + id, root).addEventListener('change', run);
        });
        run();
      },
    },

    /* ---------- 31 宽高比 ---------- */
    'aspect-ratio-calculator': {
      mount: function (root) {
        root.innerHTML =
          '<div class="row">' +
          '<label class="field"><span>Original width</span><input type="number" id="arW" value="1920"></label>' +
          '<label class="field"><span>Original height</span><input type="number" id="arH" value="1080"></label>' +
          '<label class="field"><span>New width (optional)</span><input type="number" id="arNW" value="800"></label>' +
          '<label class="field"><span>New height (optional)</span><input type="number" id="arNH" value=""></label>' +
          '</div>' +
          '<div id="arRes" style="margin-top:14px"></div>' + err('arErr');
        function run() {
          var r = T.aspectRatio($('#arW', root).value, $('#arH', root).value, $('#arNW', root).value, $('#arNH', root).value);
          if (!r.ok) {
            $('#arRes', root).innerHTML = '';
            setErr('arErr', r.error, root);
            return;
          }
          setErr('arErr', '', root);
          var rows = [['Aspect ratio', r.ratio]];
          if (r.preset) rows.push(['Common name', r.preset]);
          rows.push(['Decimal', String(r.decimal)]);
          if (r.newHeight) rows.push(['Height at new width', r.newHeight + 'px']);
          if (r.newWidth) rows.push(['Width at new height', r.newWidth + 'px']);
          $('#arRes', root).innerHTML = '<div class="stat-grid">' + rows.map(function (p) {
            return '<div class="stat"><b style="font-size:16px">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
          }).join('') + '</div>';
        }
        ['arW', 'arH', 'arNW', 'arNH'].forEach(function (id) {
          $('#' + id, root).addEventListener('input', run);
        });
        run();
      },
    },

    /* ---------- 32 CIDR ---------- */
    'cidr-calculator': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>IPv4 address with optional prefix</span>' +
          '<input type="text" id="ciIn" value="192.168.1.10/24" spellcheck="false" placeholder="192.168.1.10/24"></label>' +
          '<div id="ciRes" style="margin-top:14px"></div>' + err('ciErr');
        function run() {
          var r = T.cidrInfo($('#ciIn', root).value);
          if (!r.ok) {
            $('#ciRes', root).innerHTML = '';
            setErr('ciErr', r.error, root);
            return;
          }
          setErr('ciErr', '', root);
          var rows = [
            ['Network', r.cidr],
            ['Netmask', r.netmask],
            ['Wildcard', r.wildcard],
            ['Broadcast', r.broadcast],
            ['First host', r.firstHost],
            ['Last host', r.lastHost],
            ['Usable hosts', r.usableHosts.toLocaleString()],
            ['Addresses', r.addressCount.toLocaleString()],
            ['Scope', r.scope],
            ['Binary mask', r.binaryMask],
          ];
          $('#ciRes', root).innerHTML = '<div class="stat-grid">' + rows.map(function (p) {
            return '<div class="stat"><b style="font-size:13px;font-family:var(--mono);word-break:break-all">' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
          }).join('') + '</div>';
        }
        $('#ciIn', root).addEventListener('input', run);
        run();
      },
    },

    /* ---------- 33 Unicode ---------- */
    'unicode-inspector': {
      mount: function (root) {
        root.innerHTML =
          '<label class="field"><span>Text (first 400 characters are inspected)</span>' +
          '<textarea id="uniIn" spellcheck="false" style="min-height:100px">A 中 😀</textarea></label>' +
          '<div id="uniRes" style="margin-top:14px"></div>';
        function run() {
          var r = T.unicodePoints($('#uniIn', root).value);
          var rows = r.points.map(function (p) {
            return (
              '<div class="stat"><b style="font-size:16px;font-family:var(--mono)">' + esc(p.hex) + '</b>' +
              '<span>' + (p.char === ' ' ? '(space)' : esc(p.char)) + ' · ' + p.dec + ' · ' + p.bytes + 'B · ' + esc(p.type) + '</span></div>'
            );
          });
          $('#uniRes', root).innerHTML =
            '<p class="hint">' + r.total + ' characters' + (r.truncated ? ' (showing first 400)' : '') + '</p>' +
            '<div class="stat-grid">' + rows.join('') + '</div>';
        }
        $('#uniIn', root).addEventListener('input', run);
        run();
      },
    },
  };

  /* ================= 首页搜索 ================= */
  function initSearch() {
    var input = document.getElementById('toolSearch');
    if (!input) return;
    var cards = $$('.card[data-search]');
    var empty = document.getElementById('searchEmpty');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      cards.forEach(function (c) {
        var hit = !q || c.dataset.search.indexOf(q) >= 0;
        c.classList.toggle('hidden', !hit);
        if (hit) shown++;
      });
      if (empty) empty.classList.toggle('hidden', shown > 0);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = cards.filter(function (c) {
          return !c.classList.contains('hidden');
        })[0];
        if (first) window.location.href = first.getAttribute('href');
      }
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    var host = document.querySelector('[data-tool]');
    if (host) {
      var id = host.dataset.tool;
      var tool = TOOLS[id];
      if (tool) {
        try {
          tool.mount(host);
        } catch (e) {
          host.innerHTML = '<p class="err">This tool failed to start: ' + esc(String(e && e.message ? e.message : e)) + '</p>';
        }
      } else {
        host.innerHTML = '<p class="err">Unknown tool id: ' + esc(id) + '</p>';
      }
    }
    initSearch();
  }

  if (!T) {
    console.error('[ToolBench] tools-core.js did not load');
    return;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 给构建脚本/调试用
  globalThis.__ToolBenchTools = Object.keys(TOOLS);
})();
