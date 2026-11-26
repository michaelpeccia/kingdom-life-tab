/* Kingdom Life Study - Tablet edition boot (ES5, runs before app.js).
   Picks the stylesheet the engine can handle and connects share/copy to Android. */
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
