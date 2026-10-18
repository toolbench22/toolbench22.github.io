/* 广告位运行时代码。
   页面里的广告代码由构建脚本直接内联进 HTML（最稳，不会被 adblock 的 DOM 规则误伤），
   这个文件只负责三件小事：
   1) 懒加载：广告位进入视口再挂载（提升 LCP，广告网络也更喜欢）
   2) popunder 频控：同一访客 24 小时内只弹 1 次（防止用户烦、跳出率崩、被判无效流量）
   3) 埋点：把每个广告位的曝光上报到 window.__adLog，方便爸爸在控制台排查
*/
(function () {
  'use strict';

  var log = (window.__adLog = window.__adLog || []);

  function track(name, data) {
    log.push({ t: Date.now(), name: name, data: data || null });
    if (log.length > 200) log.shift();
  }

  /* ---------- 1. 广告位挂载：串行排队 ----------
     Adsterra 的 Banner 通过全局 window.atOptions 传参（key/width/height）。
     如果两个位并发挂载，第二个位的内联脚本会覆盖 atOptions，
     导致第一个位的 invoke.js 读到错误尺寸、渲染失败。
     所以：一个位一个位来，等上一个位的外链脚本 load 完再挂下一个。 */
  var queue = [];
  var draining = false;

  function enqueue(slot) {
    if (slot.dataset.adState === 'on' || slot.dataset.adState === 'queued') return;
    slot.dataset.adState = 'queued';
    queue.push(slot);
    if (!draining) drain();
  }

  function drain() {
    var slot = queue.shift();
    if (!slot) {
      draining = false;
      return;
    }
    draining = true;
    mountSlot(slot, function () {
      setTimeout(drain, 250);
    });
  }

  function mountSlot(slot, done) {
    slot.dataset.adState = 'on';
    var tpl = slot.querySelector('template[data-ad-code]');
    if (!tpl) {
      done();
      return;
    }
    var holder = document.createElement('div');
    holder.className = 'ad-holder';
    holder.appendChild(tpl.content.cloneNode(true));
    slot.appendChild(holder);

    var scripts = Array.prototype.slice.call(holder.querySelectorAll('script'));
    var i = 0;

    function step() {
      if (i >= scripts.length) {
        track('ad_impression', { slot: slot.dataset.adSlot });
        // 没填充时不留白条：6 秒后仍然几乎没有高度就整块隐藏
        setTimeout(function () {
          try {
            if (slot.getBoundingClientRect().height < 24) {
              slot.classList.add('ad-empty');
              track('ad_empty', { slot: slot.dataset.adSlot });
            }
          } catch (e) {
            /* 忽略 */
          }
        }, 6000);
        done();
        return;
      }
      var old = scripts[i++];
      var s = document.createElement('script');
      for (var a = 0; a < old.attributes.length; a++) {
        s.setAttribute(old.attributes[a].name, old.attributes[a].value);
      }
      s.text = old.textContent;
      var isExternal = !!old.getAttribute('src');
      var fired = false;
      var advance = function () {
        if (fired) return;
        fired = true;
        setTimeout(step, 120);
      };
      if (isExternal) {
        // 等它真的加载执行完，atOptions 才不会被下一个广告位覆盖
        s.onload = advance;
        s.onerror = advance;
        setTimeout(advance, 3500); // 兜底：网络卡住也别把队列堵死
      }
      old.parentNode.replaceChild(s, old);
      if (!isExternal) {
        // 内联脚本（设置 atOptions 的那段）是同步执行的，直接继续
        advance();
      }
    }
    step();
  }

  var slots = document.querySelectorAll('.ad-slot[data-ad-code="1"]');
  slots.forEach(function (s) {
    // 底部锚定条是 fixed 常驻的，必须立刻挂载，不能等 IntersectionObserver
    if (s.dataset.adSlot === 'sticky') {
      document.body.classList.add('has-sticky');
      enqueue(s);
    }
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            enqueue(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '250px 0px' }
    );
    slots.forEach(function (s) {
      if (s.dataset.adSlot === 'sticky') return; // 已单独处理
      io.observe(s);
    });
  } else {
    slots.forEach(function (s) {
      enqueue(s);
    });
  }

  /* ---------- 2. popunder：严格 24h 频控后才真正注入 ----------
     构建脚本把 Popunder 代码包在 <template data-popunder-tpl> 里（模板内容不会执行），
     这里判断距上次弹出是否超过 24 小时，通过了才把脚本真正插进 DOM。 */
  (function activatePopunder() {
    var tpl = document.querySelector('template[data-popunder-tpl]');
    if (!tpl) return;
    var KEY = '__tb_popunder_ts';
    var WINDOW_MS = 24 * 60 * 60 * 1000;
    var last = 0;
    var allowed = true;
    try {
      last = Number(localStorage.getItem(KEY) || 0);
      allowed = !last || Date.now() - last > WINDOW_MS;
    } catch (e) {
      allowed = true; // localStorage 被禁用就放行，不影响收入
    }
    if (!allowed) {
      track('popunder_skipped', { sinceLastMs: Date.now() - last });
      return;
    }
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch (e) {
      /* 忽略 */
    }
    var holder = document.createElement('div');
    holder.setAttribute('data-popunder-host', '1');
    holder.appendChild(tpl.content.cloneNode(true));
    document.body.appendChild(holder);
    // 克隆出来的 <script> 不会自动执行，必须重建
    holder.querySelectorAll('script').forEach(function (old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) {
        s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      }
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
    track('popunder_armed', { sinceLastMs: last ? Date.now() - last : null });
  })();

  /* ---------- 3. 复制按钮的通用反馈 ---------- */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-copy-target]');
    if (!btn) return;
    var el = document.querySelector(btn.dataset.copyTarget);
    if (!el) return;
    var text = 'value' in el ? el.value : el.textContent;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('ok');
      setTimeout(function () {
        btn.textContent = old;
        btn.classList.remove('ok');
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallback(el, done);
      });
    } else {
      fallback(el, done);
    }
  });

  function fallback(el, done) {
    try {
      if ('value' in el) {
        el.select();
      } else {
        var r = document.createRange();
        r.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      document.execCommand('copy');
      done();
    } catch (e) {
      /* 忽略 */
    }
  }
})();
