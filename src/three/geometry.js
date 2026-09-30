// 几何：把生长规则算出的形状变成网格。
// 形状是一颗圆润的菱形晶体（双锥磨圆，见 core/growth.js · diamondField、SOFT）：赤道上每一类事一个角，上下两个尖。
//   外表（整颗晶体）         经纬网格；每个点的半径和法线都按圆润外壳解析地算，没有折痕，光顺着表面流过去
//   剖开后的每一层           上半（盖）+ 下半（碗），正好在赤道面上分开
//   剖面                     赤道面上一圈套一圈的圆润环带（晶体的生长环带），带 aLayer / aS 属性，供细纹着色
//   倒影                     最外一层 + 候选层按练习进度长出的那一部分
import * as THREE from 'three';
import { diamondField, shellPlaneList, softPoint } from '../core/growth.js';

// 网格：一圈 SEG 份，从上尖到下尖 RINGS 份（偶数：赤道正好是一行，盖和碗在这里分开）
const SEG = 128;
const RINGS = 96;

// 一次算好：每一层（含候选层）的角与尖、外壳的平面，以及网格的经纬
export function shapeField(view, { withCandidate = true } = {}) {
  const D = diamondField(view, { withCandidate });
  const planes = D.shells.map((s) => shellPlaneList(D.az, s.eq, s.top, s.bottom));
  return { ...D, planes, ...lattice(planes[D.bodyN - 1]) };
}

// 经纬按表面弯的程度分布：面上几乎是平的，点疏一点；棱和尖是弯的，点密一点——同样多的点，轮廓更圆。
// 每一层、倒影、剖面都用同一套经纬：层与层对得上，形状变化时顶点一一对应
function lattice(planes) {
  const m = 1024;
  const around = new Float64Array(m), along = new Float64Array(m);
  for (const y of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const c = Math.sqrt(1 - y * y);
    bend(planes, around, (u, d) => { const a = u * 2 * Math.PI; d[0] = c * Math.cos(a); d[1] = y; d[2] = c * Math.sin(a); });
  }
  for (let a = 0; a < 16; a++) {
    const ph = (a / 16) * 2 * Math.PI;
    bend(planes, along, (u, d) => { const s = Math.sin(u * Math.PI); d[0] = s * Math.cos(ph); d[1] = Math.cos(u * Math.PI); d[2] = s * Math.sin(ph); });
  }
  const up = spread(along.subarray(0, m / 2), RINGS / 2, 0, Math.PI / 2);
  const down = spread(along.subarray(m / 2), RINGS / 2, Math.PI / 2, Math.PI);
  return { phi: spread(around, SEG, 0, 2 * Math.PI), theta: Float64Array.from([...up, ...down.subarray(1)]) };
}

// 沿一条路径走 into.length 步，每一步法线转了多少（取几条路径里最大的）
function bend(planes, into, dir) {
  const d = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0];
  dir(0, d);
  softPoint(planes, d[0], d[1], d[2], a);
  for (let i = 0; i < into.length; i++) {
    dir((i + 1) / into.length, d);
    softPoint(planes, d[0], d[1], d[2], b);
    const t = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    if (t > into[i]) into[i] = t;
    a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
  }
}

// 点的密度 ∝ √(弯的程度)：用弦逼近曲线，这样分误差最均匀；面上留一个底
function spread(bends, count, from, to) {
  const m = bends.length;
  let mean = 0;
  for (let i = 0; i < m; i++) mean += bends[i] / m;
  const cdf = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) cdf[i + 1] = cdf[i] + Math.sqrt(bends[i] + 0.4 * mean);
  const out = new Float64Array(count + 1);
  for (let s = 0, j = 0; s <= count; s++) {
    const target = (s / count) * cdf[m];
    while (j < m - 1 && cdf[j + 1] < target) j++;
    const f = Math.min(1, Math.max(0, (target - cdf[j]) / Math.max(cdf[j + 1] - cdf[j], 1e-12)));
    out[s] = from + ((j + f) / m) * (to - from);
  }
  out[0] = from;
  out[count] = to;
  return out;
}

// 第 k 层外壳的平面；extra 允许再往第 k+1 层长出 p 倍（倒影用）
function planesOf(F, k, extra = 0) {
  const a = F.shells[k], b = F.shells[k + 1];
  if (!(extra > 0) || !b) return F.planes[k];
  const lerp = (x, y) => x + (y - x) * extra;
  return shellPlaneList(F.az, a.eq.map((e, i) => lerp(e, b.eq[i])), lerp(a.top, b.top), lerp(a.bottom, b.bottom));
}

// 第 k 层外壳的一部分：'full' 整颗、'upper' 上半（盖）、'lower' 下半（碗）
export function surfaceGeometry(F, k, part = 'full', { extra = 0 } = {}) {
  const planes = planesOf(F, k, extra);
  const j0 = part === 'lower' ? RINGS / 2 : 0, j1 = part === 'upper' ? RINGS / 2 : RINGS;
  const cols = SEG + 1, rows = j1 - j0 + 1;
  const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3);
  const n = [0, 0, 0];
  for (let j = j0; j <= j1; j++) {
    const y = Math.cos(F.theta[j]), s = Math.sin(F.theta[j]);
    for (let i = 0; i <= SEG; i++) {
      const x = s * Math.cos(F.phi[i]), z = s * Math.sin(F.phi[i]);
      const r = softPoint(planes, x, y, z, n);
      const o = ((j - j0) * cols + i) * 3;
      pos[o] = x * r; pos[o + 1] = y * r; pos[o + 2] = z * r;
      nor[o] = n[0]; nor[o + 1] = n[1]; nor[o + 2] = n[2];
    }
  }
  const index = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

// 第 k 层在赤道面上的一圈（x, z）
function ring(F, k) {
  return Array.from({ length: SEG }, (_, i) => {
    const c = Math.cos(F.phi[i]), s = Math.sin(F.phi[i]);
    const r = softPoint(F.planes[k], c, 0, s);
    return [c * r, s * r];
  });
}

// 赤道面上的剖面：每一层一圈圆润的环带（核是一整块）
export function capGeometry(F, upward = true, maxLayer = F.bodyN - 1) {
  const pos = [], nor = [], lay = [], ss = [];
  const ny = upward ? 1 : -1;
  const tri = (a, b, c, sa, sb, sc, k) => {
    // 朝上的一面逆时针（从上往下看），朝下的一面反过来
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if ((cross > 0) === upward) { [b, c] = [c, b]; [sb, sc] = [sc, sb]; }
    for (const [p, s] of [[a, sa], [b, sb], [c, sc]]) { pos.push(p[0], 0, p[1]); nor.push(0, ny, 0); lay.push(k); ss.push(s); }
  };
  const O = [0, 0];
  let inn = null;
  for (let k = 0; k <= maxLayer; k++) {
    const out = ring(F, k);
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      if (!inn) { tri(O, out[i], out[j], 0, 1, 1, k); continue; }
      tri(inn[i], inn[j], out[j], 0, 0, 1, k);
      tri(inn[i], out[j], out[i], 0, 1, 1, k);
    }
    inn = out;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));
  g.computeBoundingSphere();
  return g;
}

// 剥掉的层在剖面上留下的虚线轮廓：它将来会长到这么大
export function outlineGeometry(F, k, y = 0.004) {
  const pts = ring(F, k).map(([x, z]) => new THREE.Vector3(x, y, z));
  return new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
}

// 某个方向上第 k 层外壳离中心多远
export function radiusAt(F, k, x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return softPoint(F.planes[k], x / l, y / l, z / l);
}

// 外壳的尺寸：上下两个尖多高（决定它浮在水面上多高），赤道上最远的地方（决定取景的宽度），以及整体最远
export function extents(F, k) {
  const P = F.planes[k];
  const max = Math.max(...ring(F, k).map(([x, z]) => Math.hypot(x, z)));
  const top = softPoint(P, 0, 1, 0), bottom = softPoint(P, 0, -1, 0);
  return { top, bottom, max, full: Math.max(max, top, bottom) };
}
