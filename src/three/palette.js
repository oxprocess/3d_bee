// 场景配色从页面的 CSS 变量读取，页面换主题，水面和光线跟着换。
// 另外有三个“色彩方向”（look），同一套几何与数据，只换颜色、光和极光的出现方式：
//   lit      推荐：被经历点亮的珍珠母。平时是安静的珍珠母；极光只在事情发生时出现，颜色来自你的几类事
//   aurora   Apple Intelligence 式：常亮、流动的光谱辉光
//   expanse  The Expanse 式：太空里的工程美学。一束硬朗的日光、陶瓷与金属、琥珀与青色的仪表光
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

const NACRE = { roughness: 0.26, metalness: 0.12, iridescence: 1, irRange: [220, 620], sheen: 0.6, sheenColor: '#E3D6F6', envMapIntensity: 0.95 };

export const LOOKS = {
  lit: {
    id: 'lit',
    label: '被经历点亮',
    note: '平时是安静的珍珠母；极光只在事情发生时出现，颜色来自你的几类事',
    env: 'studio',
    material: NACRE,
    aurora: 'events',
    halo: 0,
    mute: false,
    mirrorTint: '#BFEBDD',
  },
  aurora: {
    id: 'aurora',
    label: 'Apple Intelligence 式极光',
    note: '常亮、流动的光谱辉光：蓝、紫、粉、橙',
    forceDark: true,
    env: 'aurora',
    material: { roughness: 0.2, metalness: 0.08, iridescence: 1, irRange: [260, 1000], sheen: 0.9, sheenColor: '#B9A6FF', envMapIntensity: 1.25 },
    aurora: 'always',
    auroraRest: 0.5,
    auroraCols: ['#3FA9FF', '#8D5BFF', '#FF5EB8', '#FF9F43'],
    halo: 0.75,
    mute: false,
    pearl: '#EEEAFF',
    mirrorTint: '#8FE3FF',
    droplet: '#BFEFFF',
    palette: {
      bg: '#0B0A1C', envTop: '#231F4A', envHorizon: '#3B2A55', envBottom: '#0E1A2E',
      key: '#FFFFFF', fill: '#7A5CFF', rim: '#2BD9FF', waterTint: '#141231', waterDeep: '#07060F', skyHi: '#4A3C86',
      glow: '#C9B8FF', label: '#EEE9F6', sub: '#9A92B0', coreGlow: '#FFFFFF', baseGlow: 0.06, exposure: 1.1,
    },
  },
  expanse: {
    id: 'expanse',
    label: 'The Expanse 式',
    note: '一束硬朗的日光、陶瓷与金属的质感、琥珀与青色的仪表光',
    forceDark: true,
    env: 'space',
    material: { roughness: 0.36, metalness: 0.3, iridescence: 0.3, irRange: [160, 300], sheen: 0.25, sheenColor: '#9AAAB5', envMapIntensity: 1.05 },
    aurora: 'none',
    halo: 0,
    mute: true,
    pearl: '#D3D7DC',
    mirrorTint: '#A9BCC6',
    ripple: '#3FC1C9',
    droplet: '#E8A33D',
    column: '#CFF6FF',
    palette: {
      bg: '#0A0F14', envTop: '#06080B', envHorizon: '#1A140E', envBottom: '#070A0D',
      key: '#FFE3B8', fill: '#243039', rim: '#3FC1C9', waterTint: '#0D1419', waterDeep: '#05080B', skyHi: '#22313B',
      glow: '#BFEFF2', label: '#E6EDF1', sub: '#8A99A3', coreGlow: '#FFE9C9', baseGlow: 0.02, exposure: 1.0,
    },
  },
};

export function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function readPalette(el, lookId = 'lit') {
  const look = LOOKS[lookId] ?? LOOKS.lit;
  const dark = look.forceDark ? true : isDark();
  const base = look.palette ?? (dark ? BASE.dark : BASE.light);
  const cs = getComputedStyle(el);
  const pick = (name, def) => (cs.getPropertyValue(name) || '').trim() || def;
  return {
    ...base,
    dark,
    look,
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
