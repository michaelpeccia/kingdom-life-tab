// Kingdom Life Study - Tablet (legacy Android) build
//
// Takes the published web app (the kingdom-life-study repo) and produces a copy
// that runs inside an old Android WebView (Android 4.4 and up):
//   - app.js is transpiled to ES5 and polyfilled (fetch, Promise, AbortController...)
//   - styles.css gets a "legacy" twin with grid/gap/inset/min()/clamp() rewritten
//     for old engines; CSS variables (themes, text size) are filled in at runtime
//   - web.js and the service worker are left out (the APK is already offline)
//   - the WEB Bible text is bundled if scripture-web.json is in the site folder
//
// The original app files are never edited by hand; this runs fresh every build.
//
// usage: node build.mjs <siteDir> <outDir>

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import babel from '@babel/core';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import * as acorn from 'acorn';

const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const [, , SITE, OUT] = process.argv;
if (!SITE || !OUT) { console.error('usage: node build.mjs <siteDir> <outDir>'); process.exit(1); }

const TARGET = { chrome: '30' };          // Android 4.4.0 WebView is Chromium 30
const SKIP = new Set(['.git', '.github', 'sw.js', 'web.js', 'CNAME', 'README.md']);

// ---------------------------------------------------------------- copy ----
fs.rmSync(OUT, { recursive: true, force: true });
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (SKIP.has(name)) continue;
    const s = path.join(src, name), d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(SITE, OUT);
fs.mkdirSync(path.join(OUT, 'legacy'), { recursive: true });

// ----------------------------------------------------------------- JS ------
let app = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');

// Bundle the WEB Bible text when the workflow downloaded it
if (fs.existsSync(path.join(SITE, 'scripture-web.json'))) {
  const before = app;
  app = app.replace(/(url:\s*)'https:\/\/raw\.githubusercontent\.com\/[^']*scripture-web\.json'/,
                    "$1'scripture-web.json'");
  console.log(app !== before ? 'Bible text: bundled' : 'Bible text: url not found, left as download');
}

// CSS variables written from JS ('var(--rule)') cannot work on old engines;
// route them through __kv(), which returns the real colour there.
app = app.replace(/'([^'\n]*?)var\((--[a-z0-9-]+)\)([^'\n]*?)'/g,
  (m, a, name, b) => `'${a}'+__kv('${name}')+'${b}'`);

const es5 = babel.transformSync(app, {
  babelrc: false, configFile: false, sourceType: 'script', compact: false, comments: false,
  presets: [[require.resolve('@babel/preset-env'), { targets: TARGET, modules: false, bugfixes: true }]],
}).code;
fs.writeFileSync(path.join(OUT, 'app.js'), es5);

const polyfills = [
  require.resolve('core-js-bundle/minified.js'),
  require.resolve('regenerator-runtime/runtime.js'),
  require.resolve('whatwg-fetch/dist/fetch.umd.js'),
  require.resolve('abortcontroller-polyfill/dist/umd-polyfill.js'),
].map(f => fs.readFileSync(f, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '')).join('\n;\n');
fs.writeFileSync(path.join(OUT, 'legacy/polyfills.js'), polyfills);
for (const f of ['boot.js', 'vars.js'])
  fs.copyFileSync(path.join(HERE, 'runtime', f), path.join(OUT, 'legacy', f));

// ---------------------------------------------------------------- CSS ------
let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8') + '\n' + inlineCss;

// pick one argument out of min()/max()/clamp()
function splitArgs(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim()); return out;
}
function flattenMath(v) {
  let guard = 0;
  for (;;) {
    const m = /\b(min|max|clamp)\(/.exec(v);
    if (!m || guard++ > 50) return v;
    let i = m.index + m[0].length, depth = 1;
    while (i < v.length && depth) { if (v[i] === '(') depth++; if (v[i] === ')') depth--; i++; }
    const args = splitArgs(v.slice(m.index + m[0].length, i - 1));
    const pick = m[1] === 'min' ? args[0] : m[1] === 'max' ? args[args.length - 1] : (args[1] || args[0]);
    v = v.slice(0, m.index) + pick + v.slice(i);
  }
}
const UNSUPPORTED_SEL = /:focus-visible|:focus-within|:is\(|:where\(|:has\(|::backdrop|:placeholder-shown|:not\([^)]*,/;
const firstVal = v => v.trim().split(/\s+/)[0];
const lastVal  = v => { const p = v.trim().split(/\s+/); return p[p.length - 1]; };

function legacyPlugin() {
  return {
    postcssPlugin: 'kl-legacy',
    Once(root) {
      // selector -> merged layout facts across every rule for that selector
      const facts = new Map();
      root.walkRules(r => {
        for (const sel of r.selectors) {
          const f = facts.get(sel) || {};
          r.walkDecls(d => {
            if (['display', 'flex-direction', 'flex-wrap', 'grid-template-columns'].includes(d.prop)) f[d.prop] = d.value;
          });
          facts.set(sel, f);
        }
      });

      const generated = [];          // child rules, prepended so real rules can override them
      const add = (rule, selectors, decls) => {
        let node = postcss.rule({ selector: selectors.join(',\n') });
        for (const [prop, value] of decls) node.append({ prop, value });
        for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
          const wrap = postcss.atRule({ name: p.name, params: p.params }); wrap.append(node); node = wrap;
        }
        generated.push(node);
      };

      // split selector lists that contain something old engines reject, so one bad
      // selector does not throw away the whole rule
      root.walkRules(r => {
        if (r.selectors.length > 1 && r.selectors.some(s => UNSUPPORTED_SEL.test(s))) {
          for (const s of r.selectors.slice().reverse()) r.cloneAfter({ selector: s });
          r.remove();
        }
      });

      root.walkRules(r => {
        if (r.parent && r.parent.type === 'atrule' && /keyframes/.test(r.parent.name)) return;
        const own = {};
        r.walkDecls(d => { own[d.prop] = d; });
        const known = Object.assign({}, ...r.selectors.map(s => facts.get(s) || {}));
        const display = own.display ? own.display.value : known.display;

        // inset -> top/right/bottom/left
        if (own.inset) {
          const v = own.inset.value.split(/\s+/);
          const [t, rt = t, b = t, l = rt] = v;
          own.inset.cloneBefore({ prop: 'top', value: t });
          own.inset.cloneBefore({ prop: 'right', value: rt });
          own.inset.cloneBefore({ prop: 'bottom', value: b });
          own.inset.cloneBefore({ prop: 'left', value: l });
          own.inset.remove();
        }
        r.walkDecls(d => {
          if (/\b(min|max|clamp)\(/.test(d.value)) d.value = flattenMath(d.value);
          if (d.prop === 'aspect-ratio') {
            const [w, h = '1'] = d.value.split('/').map(Number);
            if (w === Number(h)) d.cloneBefore({ prop: 'height', value: '48px' });
            else d.cloneBefore({ prop: 'height', value: `calc((100vw - 32px) * ${(Number(h) / w).toFixed(4)})` });
            d.remove();
          }
          if (d.prop === 'position' && d.value === 'sticky') d.cloneBefore({ value: '-webkit-sticky' });
        });

        const gapDecl = own.gap, rowGapD = own['row-gap'], colGapD = own['column-gap'];
        const rowGap = rowGapD ? rowGapD.value : gapDecl ? firstVal(gapDecl.value) : null;
        const colGap = colGapD ? colGapD.value : gapDecl ? lastVal(gapDecl.value) : null;
        const kids = (suffix) => r.selectors.map(s => `${s} > *${suffix}`);

        const isGrid = display && /grid/.test(display);
        if (isGrid || own['grid-template-columns']) {
          const cols = own['grid-template-columns'] ? own['grid-template-columns'].value : known['grid-template-columns'];
          const placeCenter = own['place-items'] && /center/.test(own['place-items'].value);
          const g = colGap || '0px', rg = rowGap || '0px';
          const fixed = cols && /repeat\(\s*(\d+)\s*,\s*1fr\s*\)/.exec(cols);
          const auto = cols && /repeat\(\s*auto-(?:fill|fit)\s*,\s*minmax\(\s*([\d.]+px)/.exec(cols);
          if (own.display) own.display.value = cols ? 'flex' : placeCenter ? 'flex' : 'block';
          if (fixed) {
            const n = Number(fixed[1]);
            if (own.display || isGrid) r.append({ prop: 'flex-wrap', value: 'wrap' });
            add(r, kids(''), [['flex', 'none'], ['width', n > 1 ? `calc((100% - ${n - 1} * ${g}) / ${n})` : '100%'],
                              ['margin-right', g], ['margin-bottom', rg]]);
            add(r, kids(`:nth-child(${n}n)`), [['margin-right', '0']]);
          } else if (auto) {
            if (own.display || isGrid) r.append({ prop: 'flex-wrap', value: 'wrap' });
            add(r, kids(''), [['flex', 'none'], ['width', auto[1]], ['margin-right', g], ['margin-bottom', rg]]);
          } else if (placeCenter) {
            r.append({ prop: 'flex-direction', value: 'column' });
            r.append({ prop: 'align-items', value: 'center' });
            r.append({ prop: 'justify-content', value: 'center' });
          } else if (rowGap) {
            add(r, kids(' + *'), [['margin-top', rowGap]]);
          }
          ['grid-template-columns', 'place-items'].forEach(p => own[p] && own[p].remove());
          [gapDecl, rowGapD, colGapD].forEach(d => d && d.remove());
          return;
        }

        if (display && /flex/.test(display) && (gapDecl || rowGapD || colGapD)) {
          const dir = (own['flex-direction'] && own['flex-direction'].value) || known['flex-direction'] || 'row';
          const wrap = (own['flex-wrap'] && own['flex-wrap'].value) || known['flex-wrap'] || 'nowrap';
          if (/column/.test(dir)) add(r, kids(' + *'), [['margin-top', rowGap || colGap]]);
          else if (/wrap/.test(wrap) && wrap !== 'nowrap') add(r, kids(''), [['margin-right', colGap], ['margin-bottom', rowGap]]);
          else add(r, kids(' + *'), [['margin-left', colGap]]);
          [gapDecl, rowGapD, colGapD].forEach(d => d && d.remove());
        }
      });

      root.prepend(...generated);
    },
  };
}
legacyPlugin.postcss = true;

const legacyCss = (await postcss([legacyPlugin(), autoprefixer({ overrideBrowserslist: ['Chrome 30', 'Android 4.4'] })])
  .process(css, { from: undefined })).css;
fs.writeFileSync(path.join(OUT, 'legacy/legacy-css.js'),
  'window.__LEGACY_CSS = ' + JSON.stringify(legacyCss) + ';\n');

// --------------------------------------------------------------- HTML ------
const ver = (html.match(/styles\.css\?v=([\w]+)/) || [, 'tab'])[1];
html = html.replace(/<link rel="stylesheet" href="styles\.css[^"]*">/,
  `<script>window.__KL_VER=${JSON.stringify(ver)};</script>\n` +
  `<script src="legacy/boot.js"></script>\n<script src="legacy/polyfills.js"></script>`);
html = html.replace(/<script src="web\.js[^"]*"><\/script>\s*/g, '');
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
if (!html.includes('legacy/boot.js')) throw new Error('could not find the styles.css link in index.html');

// ---------------------------------------------------------- self-check -----
for (const f of ['app.js', 'legacy/polyfills.js', 'legacy/boot.js', 'legacy/vars.js', 'legacy/legacy-css.js']) {
  const src = fs.readFileSync(path.join(OUT, f), 'utf8');
  try { acorn.parse(src, { ecmaVersion: 5, sourceType: 'script' }); }
  catch (e) { throw new Error(`${f} is not ES5 (old Android would fail to run it): ${e.message}`); }
}
console.log('Legacy build written to', OUT);
