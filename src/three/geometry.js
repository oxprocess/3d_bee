// 几何：把生长规则算出的形状变成网格。
// 形状是一颗菱形晶体（双锥，见 core/growth.js · diamondField）：赤道上每一类事一个角，上下两个尖。
//   外表（整颗晶体）         2n 个平的三角面（上锥 n 个、下锥 n 个），法线是面的法线
//   剖开后的每一层           上锥（盖）+ 下锥（碗）
//   剖面                     赤道面上一圈套一圈的多边形环带（晶体的生长环带），带 aLayer / aS 属性，供细纹着色
//   倒影                     最外一层 + 候选层按练习进度长出的那一部分
import * as THREE from 'three';
import { diamondField, surfaceColorAt, layerRgbList } from '../core/growth.js';
import { hexToRgb } from '../core/color.js';

export const MAX_FACES = 16; // 着色器最多认 16 个面（8 类事）

// 一次算好：每一层（含候选层）的角与尖
export function shapeField(view, { withCandidate = true, mapColor = null } = {}) {
  const D = diamondField(view, { withCandidate });
  return { ...D, rgb: layerRgbList(D.layers, mapColor) };
}

// 第 k 层外壳的顶点；extra 允许再往第 k+1 层长出 p 倍（倒影用）
export function shellVerts(F, k, extra = 0) {
  const a = F.shells[k], b = extra > 0 ? F.shells[k + 1] : null;
  const lerp = (x, y) => (b ? x + (y - x) * extra : x);
  const eq = a.eq.map((e, i) => lerp(e, b?.eq[i]));
  const top = lerp(a.top, b?.top), bottom = lerp(a.bottom, b?.bottom);
  const V = eq.map((e, i) => new THREE.Vector3(Math.cos(F.az[i]) * e, 0, Math.sin(F.az[i]) * e));
  return { V, A: new THREE.Vector3(0, top, 0), B: new THREE.Vector3(0, -bottom, 0), eq, top, bottom };
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _c = new THREE.Vector3();

// 2n 个面：每个面三个点（顶点在方向表里的序号 d：赤道 0…n−1，上尖 n，下尖 n+1），法线朝外
export function shellFaces(F, k, extra = 0) {
  const { V, A, B } = shellVerts(F, k, extra);
  const n = V.length, faces = [];
  const add = (pts, ds, up) => {
    const nrm = new THREE.Vector3().crossVectors(_e1.subVectors(pts[1], pts[0]), _e2.subVectors(pts[2], pts[0])).normalize();
    _c.copy(pts[0]).add(pts[1]).add(pts[2]);
    if (nrm.dot(_c) < 0) { pts = [pts[0], pts[2], pts[1]]; ds = [ds[0], ds[2], ds[1]]; nrm.negate(); }
    faces.push({ pts, ds, n: nrm, d: nrm.dot(pts[0]), up });
  };
  for (let i = 0; i < n; i++) add([A, V[i], V[(i + 1) % n]], [n, i, (i + 1) % n], true);
  for (let i = 0; i < n; i++) add([B, V[i], V[(i + 1) % n]], [n + 1, i, (i + 1) % n], false);
  return faces;
}

// 每个面的平面（局部坐标，法线朝外，n·p = d）：着色器用它画棱、找视线从哪里离开、画里面的幻影
export function shellPlanes(F, k, extra = 0) {
  return shellFaces(F, k, extra).map((f) => [f.n.x, f.n.y, f.n.z, f.d]);
}

// 第 k 层外壳的一部分：'full' 整颗、'upper' 上锥、'lower' 下锥
export function surfaceGeometry(F, k, part = 'full', { extra = 0, tint = null, tintAmt = 0 } = {}) {
  const faces = shellFaces(F, k, extra).filter((f) => part === 'full' || (part === 'upper') === f.up);
  const pos = new Float32Array(faces.length * 9), nor = new Float32Array(faces.length * 9), col = new Float32Array(faces.length * 9);
  const tr = tint ? hexToRgb(tint).map((v) => v / 255) : null;
  const c = [0, 0, 0];
  faces.forEach((f, fi) => {
    for (let v = 0; v < 3; v++) {
      const o = fi * 9 + v * 3, p = f.pts[v];
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      nor[o] = f.n.x; nor[o + 1] = f.n.y; nor[o + 2] = f.n.z;
      surfaceColorAt(F.rgb, F.T, F.M, f.ds[v], k, c);
      if (tr) for (let q = 0; q < 3; q++) c[q] += (tr[q] - c[q]) * tintAmt;
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// 赤道面上的剖面：每一层一圈多边形环带（核是一整块多边形）
export function capGeometry(F, upward = true, maxLayer = F.bodyN - 1) {
  const pos = [], nor = [], lay = [], ss = [];
  const ny = upward ? 1 : -1;
  const tri = (a, b, c, sa, sb, sc, k) => {
    // 朝上的一面逆时针（从上往下看），朝下的一面反过来
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if ((cross > 0) === upward) { [b, c] = [c, b]; [sb, sc] = [sc, sb]; }
    for (const [p, s] of [[a, sa], [b, sb], [c, sc]]) { pos.push(p.x, 0, p.z); nor.push(0, ny, 0); lay.push(k); ss.push(s); }
  };
  const O = new THREE.Vector3();
  for (let k = 0; k <= maxLayer; k++) {
    const out = shellVerts(F, k).V, inn = k > 0 ? shellVerts(F, k - 1).V : null, n = out.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!inn) { tri(O, out[i], out[j], 0, 1, 1, k); continue; }
      tri(inn[i], inn[j], out[j], 0, 0, 1, k);
      tri(inn[i], out[j], out[i], 0, 1, 1, k);
    }
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
  const V = shellVerts(F, k).V;
  const pts = [...V, V[0]].map((p) => new THREE.Vector3(p.x, y, p.z));
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// 某个方向上第 k 层外壳离中心多远（凸多面体：从中心出发，最先碰到的那个面）
export function radiusAt(F, k, x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  const d = new THREE.Vector3(x / l, y / l, z / l);
  let r = Infinity;
  for (const f of shellFaces(F, k)) {
    const nd = f.n.dot(d);
    if (nd > 1e-6) r = Math.min(r, f.d / nd);
  }
  return Number.isFinite(r) ? r : F.shells[k].eq[0];
}

// 外壳的尺寸：上下两个尖多高（决定它浮在水面上多高），赤道上最远的角（决定取景的宽度），以及整体最远
export function extents(F, k) {
  const s = F.shells[k];
  const max = Math.max(...s.eq);
  return { top: s.top, bottom: s.bottom, max, full: Math.max(max, s.top, s.bottom) };
}
