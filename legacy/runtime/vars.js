/* CSS variables for engines that do not have them (Android 4.4 WebView).
   Reads the :root and [data-theme="..."] blocks out of the legacy stylesheet,
   fills every var(--x) in with the current value, and re-renders when the
   theme changes or the app sets a variable (text size, line height). */
(function () {
  var css = window.__LEGACY_CSS || '', d = document, root = d.documentElement;
  var base = {}, themes = {}, over = {};

  var re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(css))) {
    var sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s+|\s+$/g, ''), t = null, mm;
    if (sel === ':root') t = base;
    else if ((mm = /^\[data-theme="?([\w-]+)"?\]$/.exec(sel))) t = themes[mm[1]] || (themes[mm[1]] = {});
    if (!t) continue;
    m[2].replace(/(--[\w-]+)\s*:\s*([^;]+)/g, function (_, k, v) { t[k] = v.replace(/^\s+|\s+$/g, ''); });
  }

  function raw(n) {
    if (over.hasOwnProperty(n)) return over[n];
    var th = themes[root.getAttribute('data-theme') || ''];
    if (th && th.hasOwnProperty(n)) return th[n];
    return base.hasOwnProperty(n) ? base[n] : null;
  }

  // replace fn(name, fallback) calls, matching parentheses properly
  function fill(s, depth) {
    if (depth > 8) return s;
    var out = '', i = 0;
    for (;;) {
      var a = s.indexOf('var(', i), b = s.indexOf('env(', i), j;
      if (a < 0 && b < 0) return out + s.slice(i);
      j = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      var isVar = j === a, k = j + 4, lvl = 1, comma = -1;
      while (k < s.length && lvl) {
        var c = s.charAt(k);
        if (c === '(') lvl++; else if (c === ')') lvl--; else if (c === ',' && lvl === 1 && comma < 0) comma = k;
        k++;
      }
      var inner = s.slice(j + 4, k - 1);
      var name = (comma < 0 ? inner : s.slice(j + 4, comma)).replace(/^\s+|\s+$/g, '');
      var fb = comma < 0 ? '' : s.slice(comma + 1, k - 1);
      var v = isVar ? raw(name) : null;
      out += s.slice(i, j) + (v != null ? fill(v, depth + 1) : fill(fb, depth + 1));
      i = k;
    }
  }

  var style = d.createElement('style');
  style.id = 'kl-legacy-css';
  (d.head || root).appendChild(style);
  function render() { style.textContent = fill(css, 0); timer = 0; }
  var timer = 0;
  function later() { if (!timer) timer = setTimeout(render, 0); }
  render();

  window.__kv = function (n) { var v = raw(n); return v == null ? '' : fill(v, 0); };

  try {
    var proto = CSSStyleDeclaration.prototype, orig = proto.setProperty;
    proto.setProperty = function (n, v) {
      if (typeof n === 'string' && n.indexOf('--') === 0 && this === root.style) { over[n] = String(v); later(); }
      return orig.apply(this, arguments);
    };
  } catch (e) {}

  var MO = window.MutationObserver || window.WebKitMutationObserver;
  if (MO) new MO(later).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
