import { clamp, clamp01 } from './rng.js';

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// 同一类事每多练一代，层色就深一点：颜色“少而深”由此而来。
export function deepen(hex, amount) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, clamp01(s + amount * 0.9), clamp01(l - amount * 0.5)]));
}

export function hueOf(hex) {
  return rgbToHsl(hexToRgb(hex))[0];
}

// Apple Intelligence 式的色调：按色相取饱和度与亮度（色相从参考图上取样，彩度按 Apple 的系统色拉满），
// 鲜艳而明亮：琥珀、玫红最饱满，绿、蓝同样鲜亮；任何一类事的颜色都落进同一套色调里。
const APPLE_TONES = [
  // [色相°, 饱和度, 亮度]
  [3, 0.92, 0.66], [37, 0.95, 0.58], [85, 0.72, 0.56], [139, 0.62, 0.56], [165, 0.66, 0.56],
  [205, 0.9, 0.64], [226, 0.95, 0.68], [258, 0.82, 0.72], [300, 0.62, 0.62], [335, 0.86, 0.66],
];
export function appleTone(hex) {
  const h = hueOf(hex) * 360;
  const T = APPLE_TONES;
  let a = T[T.length - 1], b = T[0], ha = a[0] - 360, hb = b[0];
  for (let i = 0; i < T.length; i++) {
    const n = T[(i + 1) % T.length];
    const hn = i + 1 < T.length ? n[0] : n[0] + 360;
    if (h >= T[i][0] && h < hn) { a = T[i]; b = n; ha = T[i][0]; hb = hn; break; }
    if (h < T[0][0]) { a = T[T.length - 1]; b = T[0]; ha = a[0] - 360; hb = b[0]; break; }
  }
  const t = (h - ha) / Math.max(1e-6, hb - ha);
  const s = a[1] + (b[1] - a[1]) * t, l = a[2] + (b[2] - a[2]) * t;
  return rgbToHex(hslToRgb([h / 360, s, l]));
}

export function hslOf(hex) {
  return rgbToHsl(hexToRgb(hex));
}

// OKLab（Björn Ottosson）：感知均匀的颜色空间。光谱在这里混色：亮度、彩度线性过渡，
// 色相沿色轮走，所以两种颜色之间不会出现发灰的中间色，也不会有比两边都亮的一道亮脊。
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function oklabOf(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
