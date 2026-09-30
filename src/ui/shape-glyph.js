// 形态缩略图：从上往下看的赤道剖面。一圈是一代（一个菱形），颜色是长出它的事，虚线是倒影正在练的那一层。
// 和 3D 用的是同一条生长规则，所以缩略图就是数据本身，不是另画的插图。
import { DbbElement, define } from './base.js';
import { tone, layerTone, getTone } from '../core/tone.js';
import { diamondField } from '../core/growth.js';

let uid = 0;

// 从上往下看的赤道剖面：每一代一个多边形（四类事是四个角），一个套一个；虚线是倒影正在练的那一层
export function glyphSvg(view, size = 64) {
  const F = diamondField(view);
  const N = view.layers.length;
  const cand = view.shadow.mode === 'practice' && F.hasCandidate;
  let max = 0;
  for (const s of F.shells) for (const e of s.eq) max = Math.max(max, e);
  const c = size / 2, sc = (size / 2 - 3) / max;
  // 从上往下看：+x 在右，+z（朝向观看者的一侧）在下
  const path = (k) => F.shells[k].eq.map((e, i) => `${i ? 'L' : 'M'}${(c + Math.cos(F.az[i]) * e * sc).toFixed(1)} ${(c + Math.sin(F.az[i]) * e * sc).toFixed(1)}`).join('') + 'Z';
  const gid = `dbbCore${++uid}`;
  let out = '';
  if (cand) {
    const p = view.shadow.progress;
    const fill = getTone() === 'lit' ? view.shadow.color : tone(view.shadow.catColor ?? view.shadow.color);
    out += `<path d="${path(N)}" fill="${fill}" fill-opacity="${(0.15 + 0.25 * p).toFixed(2)}" stroke="var(--dbb-mint)" stroke-width="1" stroke-dasharray="2.5 2" stroke-linejoin="round"/>`;
  }
  for (let k = N - 1; k >= 0; k--) {
    const L = view.layers[k];
    out += `<path d="${path(k)}" fill="${L.core ? `url(#${gid})` : layerTone(L)}" stroke="#fff" stroke-opacity=".9" stroke-width=".8" stroke-linejoin="round"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="${gid}" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${getTone() === 'lit' ? '#E4DCF0' : '#E6E6EE'}"/></radialGradient></defs>${out}</svg>`;
}

export class ShapeGlyph extends DbbElement {
  render() {
    const v = this._data;
    this.innerHTML = v ? glyphSvg(v, +(this.getAttribute('size') || 64)) : '';
  }
}

define('dbb-shape-glyph', ShapeGlyph);
