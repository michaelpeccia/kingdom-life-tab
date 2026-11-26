/* Kingdom Life Study - Tablet edition boot (ES5, runs before app.js).
   Picks the stylesheet the engine can handle and connects share/copy to Android. */

/* --- Show errors on screen instead of freezing silently ------------------- */
(function () {
  var shown = 0;
  function show(msg) {
    if (shown++ > 4) return;
    try {
      var box = document.getElementById('kl-err');
      if (!box) {
        box = document.createElement('div');
        box.id = 'kl-err';
        box.setAttribute('style', 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;' +
          'background:#7a1010;color:#fff;font:13px/1.4 sans-serif;padding:10px 12px;border-radius:8px;' +
          'white-space:pre-wrap;word-break:break-word;max-height:45%;overflow:auto');
        box.onclick = function () { box.parentNode.removeChild(box); };
        (document.body || document.documentElement).appendChild(box);
      }
      box.appendChild(document.createTextNode((shown > 1 ? '\n' : 'App error (tap to close). Send a photo of this:\n') + msg));
    } catch (e) {}
  }
  window.onerror = function (msg, src, line, col) {
    show(msg + '  [' + String(src || '').replace(/^.*\//, '') + ':' + line + ':' + (col || '') + ']');
  };
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    show('Promise: ' + (r && (r.stack || r.message) || r));
  });
})();

/* --- DOM methods Android 4.4 (Chromium 30) does not have ------------------- */
(function () {
  function toNode(args) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      frag.appendChild(a instanceof Node ? a : document.createTextNode(String(a)));
    }
    return frag;
  }
  function def(proto, name, fn) {
    if (proto && !proto[name]) {
      try { Object.defineProperty(proto, name, { value: fn, configurable: true, writable: true }); }
      catch (e) { proto[name] = fn; }
    }
  }
  var parents = [window.Element && Element.prototype, window.Document && Document.prototype,
                 window.DocumentFragment && DocumentFragment.prototype];
  var children = [window.Element && Element.prototype, window.CharacterData && CharacterData.prototype,
                  window.DocumentType && DocumentType.prototype];
  for (var i = 0; i < parents.length; i++) {
    def(parents[i], 'append', function () { this.appendChild(toNode(arguments)); });
    def(parents[i], 'prepend', function () { this.insertBefore(toNode(arguments), this.firstChild); });
    def(parents[i], 'replaceChildren', function () {
      while (this.lastChild) this.removeChild(this.lastChild);
      this.appendChild(toNode(arguments));
    });
  }
  for (var j = 0; j < children.length; j++) {
    def(children[j], 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });
    def(children[j], 'before', function () { if (this.parentNode) this.parentNode.insertBefore(toNode(arguments), this); });
    def(children[j], 'after', function () { if (this.parentNode) this.parentNode.insertBefore(toNode(arguments), this.nextSibling); });
    def(children[j], 'replaceWith', function () { if (this.parentNode) this.parentNode.replaceChild(toNode(arguments), this); });
  }
  var EP = window.Element && Element.prototype;
  if (EP) {
    def(EP, 'matches', EP.webkitMatchesSelector || EP.msMatchesSelector || function (s) {
      var all = (this.ownerDocument || document).querySelectorAll(s);
      for (var k = 0; k < all.length; k++) if (all[k] === this) return true;
      return false;
    });
    def(EP, 'closest', function (s) {
      for (var el = this; el && el.nodeType === 1; el = el.parentNode) if (el.matches(s)) return el;
      return null;
    });
    def(EP, 'toggleAttribute', function (n, force) {
      var on = force === undefined ? !this.hasAttribute(n) : !!force;
      if (on) this.setAttribute(n, ''); else this.removeAttribute(n);
      return on;
    });
  }
  def(String.prototype, 'normalize', function () { return String(this); });
})();

/* --- IndexedDB: fill in getAllKeys, and fall back to memory if the old
       WebView's database never answers (books then reinstall from the APK) --- */
(function () {
  var realIDB = null;
  try { realIDB = window.indexedDB || window.webkitIndexedDB || null; } catch (e) {}
  window.__KL_IDB = 'real';

  function later(fn) { setTimeout(fn, 0); }

  // getAllKeys arrived in Chrome 48; build it from a cursor
  try {
    var SP = window.IDBObjectStore && IDBObjectStore.prototype;
    if (SP && !SP.getAllKeys) {
      SP.getAllKeys = function () {
        var out = { result: [], readyState: 'pending', error: null };
        var c = this.openCursor();
        c.onsuccess = function (e) {
          var cur = e.target.result;
          if (cur) { out.result.push(cur.key); cur['continue'](); }
          else { out.readyState = 'done'; if (out.onsuccess) out.onsuccess({ target: out }); }
        };
        c.onerror = function () { out.error = c.error; if (out.onerror) out.onerror({ target: out }); };
        return out;
      };
    }
  } catch (e) {}

  // ---- in-memory stand-in (only what app.js uses) ----
  var mem = {};
  function memReq(v) { return { result: v, readyState: 'done', error: null }; }
  function MemStore(data) { this.d = data; }
  MemStore.prototype.get = function (k) { return memReq(this.d.hasOwnProperty(k) ? this.d[k] : undefined); };
  MemStore.prototype.put = function (v, k) { this.d[k] = v; return memReq(k); };
  MemStore.prototype['delete'] = function (k) { delete this.d[k]; return memReq(undefined); };
  MemStore.prototype.getAllKeys = function () { return memReq(Object.keys(this.d)); };
  MemStore.prototype.getAll = function () { var d = this.d; return memReq(Object.keys(d).map(function (k) { return d[k]; })); };
  MemStore.prototype.clear = function () { this.d = {}; return memReq(undefined); };
  function MemDB(name) { this.name = name; this.s = mem[name] || (mem[name] = {}); this.objectStoreNames = { contains: function () { return true; } }; }
  MemDB.prototype.createObjectStore = function (n) { this.s[n] = this.s[n] || {}; return new MemStore(this.s[n]); };
  MemDB.prototype.transaction = function (n) {
    var self = this, t = { error: null };
    n = Array.isArray(n) ? n[0] : n;
    t.objectStore = function (m) { self.s[m] = self.s[m] || {}; return new MemStore(self.s[m]); };
    later(function () { if (t.oncomplete) t.oncomplete({ target: t }); });
    return t;
  };
  MemDB.prototype.close = function () {};

  function memOpen(name, req) {
    window.__KL_IDB = 'memory';
    var fresh = !mem[name];
    var db = new MemDB(name);
    req.result = db; req.readyState = 'done';
    later(function () {
      if (fresh && req.onupgradeneeded) req.onupgradeneeded({ target: req, oldVersion: 0 });
      if (req.onsuccess) req.onsuccess({ target: req });
    });
  }

  var useMemory = !realIDB;
  var shim = {
    open: function (name, version) {
      var req = { result: null, error: null, readyState: 'pending' };
      if (useMemory) { memOpen(name, req); return req; }
      var done = false, r;
      var fallback = function () { if (done) return; done = true; useMemory = true; memOpen(name, req); };
      try { r = realIDB.open(name, version); } catch (e) { fallback(); return req; }
      var timer = setTimeout(fallback, 4000);
      r.onupgradeneeded = function (e) {
        if (done) return;
        req.result = r.result; req.transaction = r.transaction;
        if (req.onupgradeneeded) req.onupgradeneeded(e);
      };
      r.onsuccess = function () {
        if (done) { try { r.result.close(); } catch (e) {} return; }
        done = true; clearTimeout(timer);
        req.result = r.result; req.readyState = 'done';
        if (req.onsuccess) req.onsuccess({ target: req });
      };
      r.onerror = function (e) { clearTimeout(timer); if (e && e.preventDefault) e.preventDefault(); fallback(); };
      r.onblocked = function () { clearTimeout(timer); fallback(); };
      return req;
    },
    deleteDatabase: function (n) { delete mem[n]; return realIDB && realIDB.deleteDatabase ? realIDB.deleteDatabase(n) : memReq(undefined); }
  };
  try { Object.defineProperty(window, 'indexedDB', { value: shim, configurable: true, writable: true }); }
  catch (e) { try { window.indexedDB = shim; } catch (e2) {} }
})();

/* --- If startup is still on the loading screen after 25s, say where ------- */
(function () {
  setTimeout(function () {
    var m = document.getElementById('boot-msg');
    if (!m || !m.offsetParent) return;          // loading screen already gone
    var msg = 'Still loading after 25 seconds.\nStuck at: "' + (m.textContent || '') + '"' +
              '\nStorage: ' + (window.__KL_IDB || '?') + '   Build: ' + (window.__KL_VER || '?') +
              '\n' + navigator.userAgent;
    if (window.onerror) window.onerror(msg, 'boot-watchdog', 0, 0);
  }, 25000);
})();

(function () {
  var d = document, root = d.documentElement, ver = window.__KL_VER || 'tab';

  // The APK is already offline; a service worker would only fight the bundled files.
  try { if ('serviceWorker' in navigator) delete Navigator.prototype.serviceWorker; } catch (e) {}

  function sup(p, v) {
    try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; }
  }
  var force = /[?&]legacy=1/.test(location.search);
  // inset (Chrome 87) implies flex gap (84), grid, min()/clamp() and variables
  var modern = !force && sup('--kl', '0') && sup('inset', '0');
  window.__KL_LEGACY = !modern;
  root.className += modern ? ' kl-modern' : ' kl-legacy';

  if (modern) {
    window.__kv = function (n) { return 'var(' + n + ')'; };
    d.write('<link rel="stylesheet" href="styles.css?v=' + ver + '">');
  } else {
    d.write('<script src="legacy/legacy-css.js?v=' + ver + '"><\/script>' +
            '<script src="legacy/vars.js?v=' + ver + '"><\/script>');
  }

  // Android bridge (set up by the APK). WebView has no share sheet and its
  // clipboard API is unreliable, so both go through the app.
  var A = window.KLAndroid;
  if (A) {
    var share = function (data) {
      data = data || {};
      return new Promise(function (res) {
        A.share(String(data.title || ''), String(data.text || ''), String(data.url || ''));
        res();
      });
    };
    var clip = { writeText: function (t) { A.copy(String(t)); return Promise.resolve(); } };
    try { Object.defineProperty(navigator, 'share', { value: share, configurable: true }); }
    catch (e) { navigator.share = share; }
    try { Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true }); }
    catch (e) { navigator.clipboard = clip; }
  }
})();
