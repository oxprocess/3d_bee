// 场景配色从页面的 CSS 变量读取，页面换主题，水面和光线跟着换。
const BASE = {
  light: {
    bg: '#F3EDF7', envTop: '#DCD3F1', envHorizon: '#EFC2AE', envBottom: '#A9A7D6',
    key: '#FFFFFF', fill: '#B9AEEB', rim: '#9FE0DA', waterTint: '#FFFFFF', waterDeep: '#E2DAEE', skyHi: '#FFFFFF',
    glow: '#FFFFFF', label: '#1E1A2E', sub: '#8E86A0', coreGlow: '#FFFFFF', baseGlow: 0, exposure: 1.0,
  },
  dark: {
    bg: '#16131F', envTop: '#3A3160', envHorizon: '#6A4A52', envBottom: '#1F2440',
    key: '#F3EEFF', fill: '#7A6CD0', rim: '#4F9C97', waterTint: '#2A2440', waterDeep: '#110E17', skyHi: '#8C82B8',
    glow: '#D9D0FF', label: '#EEE9F6', sub: '#9A92B0', coreGlow: '#FFF3E4', baseGlow: 0.05, exposure: 1.06,
  },
};

export function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function readPalette(el) {
  const dark = isDark();
  const base = dark ? BASE.dark : BASE.light;
  const cs = getComputedStyle(el);
  const pick = (name, def) => (cs.getPropertyValue(name) || '').trim() || def;
  return {
    ...base,
    dark,
    bg: pick('--dbb-scene-bg', base.bg),
    label: pick('--dbb-ink', base.label),
    sub: pick('--dbb-soft', base.sub),
  };
}

export function watchTheme(cb) {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const on = () => cb();
  mq?.addEventListener?.('change', on);
  const mo = new MutationObserver(on);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => { mq?.removeEventListener?.('change', on); mo.disconnect(); };
}

export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
