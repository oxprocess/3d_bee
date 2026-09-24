// 显示色调：数据里存的是每一类事自己的颜色；显示时，落进当前色彩方向的色调里。
// 3D 舞台、卡片、时间轴、缩略图都经过这里，同一件事在哪里看都是同一种颜色。
// 一页一个色彩方向：舞台换方向时调用 setTone，并在 window 上发出 'dbb-tone'，组件据此重画。
import { appleTone, muted, deepen } from './color.js';
import { RULE } from './growth.js';

const TONES = {
  apple: appleTone, // Apple Intelligence 式：按色相取饱和度与亮度，暖色饱满、冷色轻透
  expanse: muted, // The Expanse 式：降饱和、压暗
  lit: (hex) => hex, // 珍珠母：数据颜色原样
};

let current = 'apple';

export function setTone(id) {
  if (!TONES[id] || id === current) return;
  current = id;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dbb-tone', { detail: { tone: id } }));
}

export function getTone() {
  return current;
}

export function tone(hex, id = current) {
  return hex ? (TONES[id] ?? TONES.lit)(hex) : hex;
}

// 一层的颜色。同一类事每多练一代深一点：在 Apple 式里先落进色调、再加深，所以“少而深”照旧成立。
export function layerTone(L, id = current) {
  if (id === 'apple' && L.baseColor) return deepen(appleTone(L.baseColor), Math.min(0.28, (L.repeats ?? 0) * RULE.deepenPerRepeat));
  return tone(L.color, id);
}
