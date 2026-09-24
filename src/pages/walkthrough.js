// 形态走查：读到哪一段，珍珠就演到哪一段。
import { boot, load, storyTo, themeToggle } from './boot.js';
import { LEDGERS } from '../core/demo-data.js';
import { deriveView, BINDINGS } from '../core/view.js';
import { normalizeLedger } from '../core/ledger.js';
import { glyphSvg } from '../ui/shape-glyph.js';
import { esc } from '../ui/base.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const { store, stage } = boot({ stageEl: $('#stage'), ledger: 'wide' });
window.__dbb = { store, stage };
themeToggle($('#theme'));

$$('dbb-seal-card').forEach((el) => el.bind({ store }));
$$('dbb-shadow-meter').forEach((el) => el.bind({ store }));
$$('dbb-layer-card').forEach((el) => el.bind({ stage }));
$$('dbb-depth-rail').forEach((el) => el.bind({ stage }));
const lens = document.createElement('dbb-data-lens');
lens.bind({ stage });

// 形状缩略图：直接由数据算出来
const views = Object.fromEntries(['wide', 'tight', 'lean', 'turn'].map((id) => [id, deriveView(normalizeLedger(LEDGERS[id]))]));
const markShape = (id) => $$('.shape-pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ledger === id)));
$$('.shape-pick button').forEach((b) => {
  b.querySelector('.g').innerHTML = glyphSvg(views[b.dataset.ledger], 56);
  b.addEventListener('click', () => { load(store, b.dataset.ledger); markShape(b.dataset.ledger); });
});
$('#trio').innerHTML = ['wide', 'tight', 'lean', 'turn']
  .map((id) => `<figure>${glyphSvg(views[id], 104)}<figcaption>${esc(LEDGERS[id].name)}</figcaption></figure>`).join('');

// 接口对照表：当前值跟着账本变
const renderBindings = (v) => {
  $('#bindings tbody').innerHTML = BINDINGS.map((b) => `<tr><td>${esc(b.element)}</td><td>${esc(b.visual)}</td><td><code>${esc(b.field)}</code></td><td>${esc(b.when)}</td><td class="val">${esc(b.value(v))}</td></tr>`).join('');
};
store.subscribe((ch) => renderBindings(ch.view));
renderBindings(store.view);

// 每一章对应舞台上的一个场景
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const PRESETS = {
  cover: () => load(store, 'wide'),
  lines: () => load(store, 'story'),
  birth: () => load(store, 'birth'),
  observe: () => storyTo(store, 0, { later }),
  seal: () => storyTo(store, 1, { later }),
  prepare: () => { storyTo(store, 2, { later }); later(() => store.setNow('2026-09-24T19:40'), 2600); },
  resolve: () => storyTo(store, 3, { later }),
  inherit: () => storyTo(store, 4, { later }),
  dig: () => { load(store, 'wide'); later(() => stage.setDepth(1), 900); },
  interact: () => load(store, 'lean'),
  shapes: () => { load(store, 'lean'); markShape('lean'); },
  yours: () => storyTo(store, 4, { animate: false }),
  lens: () => storyTo(store, 1, { animate: false }),
  color: () => { setLook(chapterLook); storyTo(store, 4, { later }); },
  modules: () => {},
  fixes: () => {},
};

// 色彩方向：只在这一章里切换对比；其他章节都用选定的 Apple Intelligence 式
let chapterLook = 'apple';
function setLook(id) {
  stage.setLook(id);
  $$('.look-pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === id)));
}
$$('.look-pick button').forEach((b) => b.addEventListener('click', () => {
  chapterLook = b.dataset.look;
  activate($('#color'), true);
}));

let active = null;
let lensByUser = false;
const setLens = (on) => { lens.on = on; $('#lensBtn').setAttribute('aria-pressed', String(on)); };

function activate(sec, force = false) {
  if (!sec || (!force && active === sec)) return;
  active = sec;
  timers.forEach(clearTimeout);
  timers = [];
  const name = sec.dataset.preset;
  $('#stageLabel').textContent = sec.dataset.label ?? '';
  if (name !== 'dig') stage.setDepth(0);
  if (name !== 'color') setLook('apple');
  setLens(lensByUser || name === 'lens');
  PRESETS[name]?.();
}

$('#lensBtn').addEventListener('click', () => { lensByUser = !lens.on; setLens(lensByUser); });
$('#replayBtn').addEventListener('click', () => activate(active, true));
$$('[data-replay]').forEach((b) => b.addEventListener('click', () => activate(b.closest('.ch'), true)));
$$('[data-clock]').forEach((b) => b.addEventListener('click', () => store.setNow(b.dataset.clock)));

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) activate(e.target);
}, { rootMargin: '-42% 0px -52% 0px' });
$$('.ch').forEach((s) => io.observe(s));
if (!active) activate($('.ch'));
