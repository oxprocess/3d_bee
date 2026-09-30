// 场景配色从页面的 CSS 变量读取，页面换主题，水面和光线跟着换。
// 色彩方向定为 Apple Intelligence 式：光谱在身体里，没有光晕。颜色按色相围一圈，
// 每一类事的颜色在它长出来的那一侧；中间柔、边缘浓；诞生时很淡，经历让颜色变浓。
export const LOOK = {
  id: 'apple',
  label: 'Apple Intelligence 式',
  // 颜色全在着色器里算（光谱 + 玻璃），物理材质只留最基本的一层：不算虹彩、清漆、绒光，省下手机上的算力
  material: { roughness: 0.3, metalness: 0, envMapIntensity: 0.2 },
  // 极光水晶：只有一层，五彩极光就在圆润的表面上。明暗主要跟着视线走（像宝石），朝光的面亮而透；
  // 表面抛光：头顶的光映在朝上的面上，下沿一条清楚的地平线；柔光箱是一块跟着转动走的亮。摄影棚是线性色值
  glass: {
    deep: [0.12, 0.2], // 颜色的深浅：浅色背景、深色背景
    chroma: [1.45, 0.3], // 彩度的增益与软上限：鲜艳，仍在屏幕色域里
    glaze: 1, // 抛光：表面反射的强度（菲涅耳）
    facet: [0.62, 0.55], // 跟着主光和头顶的明暗：基础、增益
    lit: 0.35, // 朝光的面朝同一个色相提亮多少（像光透过来）
    iri: 0.3, // 色相随角度偏多少（弧度）：越侧过去偏得越多，转动时颜色在曲面上流过
    gloss: 1, // 抛光：柔光箱与头顶的光映在面上的强度
    trans: [0.8, 0.35, 0.35], // 透光：映出地面时暗到多少、透过来一盏灯时亮多少、跟着主光的明暗占多少
    view: 0.7, // 侧过去的面暗到多少（明暗跟着视线走，像宝石）
    sheen: [0.28, 0.5, 0.72], // 头顶的光：强度，地平线的下沿、上沿（反射方向的高度）
    rim: 0.15, // 轮廓内侧一圈深多少
    clear: 1.4, // 两种颜色相冲时，中间清透的一段亮多少
    studio: {
      light: { sky: [0.92, 0.92, 0.95], floor: [0.62, 0.62, 0.68], key: [4, 4, 4.05] },
      dark: { sky: [0.62, 0.63, 0.7], floor: [0.05, 0.05, 0.07], key: [4, 4, 4.05] },
    },
  },
  pearl: '#F4F4F8', // 核的底色
  mirrorTint: '#FFFFFF',
  droplet: '#DCE6F2',
  // 中性的底：光谱只有在不带颜色的底上才干净
  palettes: {
    light: {
      bg: '#F2F1F6', envTop: '#FFFFFF', envHorizon: '#F2F1F6', envBottom: '#E4E3EC',
      key: '#FFFFFF', fill: '#ECEBF4', rim: '#FFFFFF', waterTint: '#FFFFFF', waterDeep: '#E8E7EF', skyHi: '#FFFFFF',
      label: '#1C1C22', sub: '#8A8A96', coreGlow: '#FFFFFF', exposure: 1.0,
    },
    dark: {
      bg: '#0E0E13', envTop: '#23232C', envHorizon: '#1A1A22', envBottom: '#101016',
      key: '#F4F4FA', fill: '#3A3A48', rim: '#2E3440', waterTint: '#15151C', waterDeep: '#08080B', skyHi: '#3A3A46',
      label: '#EEEEF3', sub: '#8E8E9A', coreGlow: '#FFFFFF', exposure: 1.0,
    },
  },
  // 上下两个尖的颜色：极光的框——上尖清亮的薄荷、下尖兰紫（色相取自 Apple Intelligence 参考图的上缘与下缘）
  spec: { top: '#6EE7D0', bottom: '#B36BE0' },
};

export function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function readPalette(el) {
  const dark = isDark();
  const base = LOOK.palettes[dark ? 'dark' : 'light'];
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
