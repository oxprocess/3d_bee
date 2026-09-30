// 页面共用：一个 store、一个 3D 舞台，所有组件都绑在它们上面。
import { PearlStage } from '../three/stage.js';
import { createStore, reduce, normalizeLedger } from '../core/ledger.js';
import { LEDGERS, STORY } from '../core/demo-data.js';
import '../ui/index.js';
import { logoSvg, appIconSvg, lockupSvg, faviconHref } from '../ui/logo.js';
import { isDark, watchTheme, reducedMotion } from '../three/palette.js';

export function boot({ stageEl, ledger = 'wide', stageOpts = {} }) {
  logos();
  const store = createStore(LEDGERS[ledger]);
  const stage = new PearlStage(stageEl, stageOpts);
  stage.setView(store.view);
  store.subscribe((ch) => stage.apply(ch));
  return { store, stage };
}

export function load(store, id) {
  store.load(LEDGERS[id], { id });
}

// 把故事推进到第 i 步：前面几步静默完成，第 i 步带着形态上的变化发生
export function storyTo(store, i, { animate = true, later = setTimeout } = {}) {
  let L = normalizeLedger(LEDGERS.story);
  const upto = animate ? i : i + 1;
  for (let j = 0; j < Math.min(upto, STORY.steps.length); j++) L = reduce(L, STORY.steps[j].event).ledger;
  store.load(L, { id: 'story' });
  if (animate && i < STORY.steps.length) {
    later(() => store.dispatch(STORY.steps[i].event), 450);
  }
}

// 主题：跟随系统 → 浅 → 深
export function themeToggle(btn) {
  const order = ['system', 'light', 'dark'];
  const label = { system: '跟随系统', light: '浅色', dark: '深色' };
  let i = 0;
  try { i = Math.max(0, order.indexOf(localStorage.getItem('dbb-theme') || 'system')); } catch { /* 无痕模式 */ }
  const apply = () => {
    const t = order[i];
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    btn.textContent = label[t];
    btn.setAttribute('aria-label', `主题：${label[t]}，点击切换`);
    try { localStorage.setItem('dbb-theme', t); } catch { /* 无痕模式 */ }
  };
  btn.addEventListener('click', () => { i = (i + 1) % order.length; apply(); });
  apply();
}

// 标志：页签图标，以及页面上每一个 data-logo 的位置（值是 JSON：kind = mark | icon | lockup，其余是 logoSvg 的参数）。
// 没写 theme 的跟着页面的深浅走
export function logos() {
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.appendChild(icon);
  }
  icon.type = 'image/svg+xml';
  icon.href = faviconHref();
  const draw = () => {
    for (const el of document.querySelectorAll('[data-logo]')) {
      let o = {};
      try { o = JSON.parse(el.dataset.logo || '{}'); } catch { /* 写错了就用默认 */ }
      const { kind = 'mark', ...opts } = o;
      opts.theme ??= isDark() ? 'dark' : 'light';
      if (opts.motion && reducedMotion()) opts.motion = false;
      el.innerHTML = kind === 'icon' ? appIconSvg(opts) : kind === 'lockup' ? lockupSvg(opts) : logoSvg(opts);
    }
  };
  draw();
  watchTheme(draw);
}
