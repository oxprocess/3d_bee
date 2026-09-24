// 形态缩略图：从上往下看的赤道剖面。一圈是一代，颜色是长出它的事，虚线是倒影正在练的那一层。
// 和 3D 用的是同一条生长规则，所以缩略图就是数据本身，不是另画的插图。
import { DbbElement, define } from './base.js';
import { radiiField } from '../core/growth.js';

const M = 96;
let uid = 0;
const DIRS = (() => {
  const d = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) { const a = (i / M) * Math.PI * 2; d[3 * i] = Math.cos(a); d[3 * i + 2] = Math.sin(a); }
  return d;
})();

export function glyphSvg(view, size = 64) {
  const layers = view.layers.slice();
  const cand = view.shadow.mode === 'practice' ? view.shadow.candidate : null;
  if (cand) layers.push(cand);
  const f = radiiField(layers, DIRS, view.rule);
  let max = 0;
  for (let i = 0; i < f.R.length; i++) max = Math.max(max, f.R[i]);
  const c = size / 2, s = (size / 2 - 3) / max;
  const path = (k) => {
    let d = '';
    for (let i = 0; i <= M; i++) {
      const j = i % M, r = f.R[k * M + j] * s;
      // 从上往下看：+x 在右，+z（朝向观看者的一侧）在下
      d += `${i ? 'L' : 'M'}${(c + DIRS[3 * j] * r).toFixed(1)} ${(c + DIRS[3 * j + 2] * r).toFixed(1)}`;
    }
    return d + 'Z';
  };
  const N = view.layers.length;
  const gid = `dbbCore${++uid}`;
  let out = '';
  if (cand) {
    const p = view.shadow.progress;
    out += `<path d="${path(N)}" fill="${view.shadow.color}" fill-opacity="${(0.15 + 0.25 * p).toFixed(2)}" stroke="var(--dbb-mint)" stroke-width="1" stroke-dasharray="2.5 2"/>`;
  }
  for (let k = N - 1; k >= 0; k--) {
    const L = view.layers[k];
    out += `<path d="${path(k)}" fill="${L.core ? `url(#${gid})` : L.color}" stroke="#fff" stroke-opacity=".9" stroke-width=".8"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="${gid}" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E4DCF0"/></radialGradient></defs>${out}</svg>`;
}

export class ShapeGlyph extends DbbElement {
  render() {
    const v = this._data;
    this.innerHTML = v ? glyphSvg(v, +(this.getAttribute('size') || 64)) : '';
  }
}

define('dbb-shape-glyph', ShapeGlyph);
