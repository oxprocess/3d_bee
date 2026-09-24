// 场景配色从页面的 CSS 变量读取，页面换主题，水面和光线跟着换。
// 色彩方向（look）：同一套几何与数据，只换颜色、光和光出现的方式。
//   apple    Apple Intelligence 式（默认）：光谱在身体里，没有光晕。颜色按色相围一圈，
//            每一类事的颜色在它长出来的那一侧；中间柔、边缘浓；诞生时很淡，经历让颜色变浓
//   lit      珍珠母：平时是安静的珍珠母，极光只在事情发生时沿轮廓出现
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
  apple: {
    id: 'apple',
    label: 'Apple Intelligence 式',
    note: '光谱在身体里，没有光晕；颜色在它长出来的那一侧',
    env: 'studio',
    material: NACRE,
    spectral: true,
    aurora: 'none',
    mute: false,
    pearl: '#F4F4F8',
    tone: 'apple',
    mirrorTint: '#FFFFFF',
    droplet: '#DCE6F2',
    // 中性的底：光谱只有在不带颜色的底上才干净
    palettes: {
      light: {
        bg: '#F2F1F6', envTop: '#FFFFFF', envHorizon: '#F2F1F6', envBottom: '#E4E3EC',
        key: '#FFFFFF', fill: '#ECEBF4', rim: '#FFFFFF', waterTint: '#FFFFFF', waterDeep: '#E8E7EF', skyHi: '#FFFFFF',
        glow: '#FFFFFF', label: '#1C1C22', sub: '#8A8A96', coreGlow: '#FFFFFF', baseGlow: 0, exposure: 1.0,
      },
      dark: {
        bg: '#0E0E13', envTop: '#23232C', envHorizon: '#1A1A22', envBottom: '#101016',
        key: '#F4F4FA', fill: '#3A3A48', rim: '#2E3440', waterTint: '#15151C', waterDeep: '#08080B', skyHi: '#3A3A46',
        glow: '#FFFFFF', label: '#EEEEF3', sub: '#8E8E9A', coreGlow: '#FFFFFF', baseGlow: 0, exposure: 1.0,
      },
    },
    // 两极的颜色：顶上清凉的薄荷、底下兰紫（取自参考图的上缘与下缘）
    spec: { top: '#A9D9C6', bottom: '#BC8FC0' },
  },
  lit: {
    id: 'lit',
    label: '珍珠母',
    note: '平时是安静的珍珠母；极光只在事情发生时沿轮廓出现',
    env: 'studio',
    material: NACRE,
    aurora: 'events',
    mute: false,
    mirrorTint: '#BFEBDD',
  },
  expanse: {
    id: 'expanse',
    label: 'The Expanse 式',
    note: '一束硬朗的日光、陶瓷与金属的质感、琥珀与青色的仪表光',
    forceDark: true,
    env: 'space',
    material: { roughness: 0.36, metalness: 0.3, iridescence: 0.3, irRange: [160, 300], sheen: 0.25, sheenColor: '#9AAAB5', envMapIntensity: 1.05 },
    aurora: 'none',
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

export function readPalette(el, lookId = 'apple') {
  const look = LOOKS[lookId] ?? LOOKS.apple;
  const dark = look.forceDark ? true : isDark();
  const base = look.palette ?? (look.palettes ? look.palettes[dark ? 'dark' : 'light'] : dark ? BASE.dark : BASE.light);
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
