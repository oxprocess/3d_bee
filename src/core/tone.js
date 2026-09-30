// 显示色调：数据里存的是每一类事自己的颜色；显示时，落进 Apple Intelligence 式的色调里
// （按色相取饱和度与亮度，鲜艳而明亮）。3D 舞台、卡片、时间轴、缩略图都经过这里，同一件事在哪里看都是同一种颜色。
import { appleTone, deepen } from './color.js';
import { RULE } from './growth.js';

export function tone(hex) {
  return hex ? appleTone(hex) : hex;
}

// 一层的颜色。同一类事每多练一代深一点：先落进色调、再加深，所以“少而深”照旧成立。
export function layerTone(L) {
  if (L.baseColor) return deepen(appleTone(L.baseColor), Math.min(0.28, (L.repeats ?? 0) * RULE.deepenPerRepeat));
  return tone(L.color);
}
