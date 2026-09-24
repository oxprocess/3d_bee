// 几何：把生长规则算出的 R_k(ω) 变成网格。
//   外表（整颗珍珠）         一张完整曲面，只显示最外一层
//   剖开后的每一层           上半（盖）+ 下半（碗）两张曲面
//   剖面                     赤道面上每一层的环带，带 aLayer / aS 属性，供细纹着色
//   倒影                     最外一层 + 候选层按练习进度长出的那一部分
import * as THREE from 'three';
import { radiiField, surfaceNormal, surfaceColorAt, layerRgbList } from '../core/growth.js';
import { hexToRgb } from '../core/color.js';

export const GRID = { nT: 72, nP: 144 };

export function gridDirs(nT = GRID.nT, nP = GRID.nP) {
  const dirs = new Float32Array((nT + 1) * (nP + 1) * 3);
  for (let i = 0; i <= nT; i++) {
    const th = (Math.PI * i) / nT, st = Math.sin(th), ct = Math.cos(th);
    for (let j = 0; j <= nP; j++) {
      const ph = (2 * Math.PI * j) / nP, o = 3 * (i * (nP + 1) + j);
      dirs[o] = st * Math.cos(ph); dirs[o + 1] = ct; dirs[o + 2] = st * Math.sin(ph);
    }
  }
  return dirs;
}

function gridIndex(i0, i1, nP) {
  const idx = [];
  for (let i = i0; i < i1; i++) {
    for (let j = 0; j < nP; j++) {
      const a = i * (nP + 1) + j, b = a + nP + 1, c = b + 1, d = a + 1;
      idx.push(a, d, b, d, c, b);
    }
  }
  return idx;
}

// 一次算好：网格上每个方向、每一层的外边界与梯度（含候选层）
export function shapeField(view, { nT = GRID.nT, nP = GRID.nP, withCandidate = true, mapColor = null } = {}) {
  const dirs = gridDirs(nT, nP);
  const layers = view.layers.slice();
  const cand = withCandidate && view.shadow.candidate ? view.shadow.candidate : null;
  if (cand) layers.push(cand);
  const f = radiiField(layers, dirs, view.rule);
  const rgb = layerRgbList(layers, mapColor);
  return { ...f, dirs, nT, nP, layers, rgb, hasCandidate: !!cand, bodyN: view.layers.length };
}

const _n = [0, 0, 0], _c = [0, 0, 0];

// 第 k 层外表面上 rows [i0, i1] 的一片曲面；extra 允许在其外再加 p 倍的第 k+1 层（倒影用）
export function surfaceGeometry(F, k, i0, i1, { extra = 0, tint = null, tintAmt = 0 } = {}) {
  const { nP, M, R, G, T, dirs } = F;
  const cols = nP + 1;
  const count = (i1 - i0 + 1) * cols;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const tr = tint ? hexToRgb(tint).map((v) => v / 255) : null;
  let v = 0;
  for (let i = i0; i <= i1; i++) {
    for (let j = 0; j <= nP; j++, v++) {
      const di = i * cols + j, o = k * M + di;
      const x = dirs[3 * di], y = dirs[3 * di + 1], z = dirs[3 * di + 2];
      let r = R[o], gx = G[3 * o], gy = G[3 * o + 1], gz = G[3 * o + 2];
      if (extra > 0) {
        const o2 = (k + 1) * M + di;
        r += extra * (R[o2] - R[o]);
        gx += extra * (G[3 * o2] - G[3 * o]);
        gy += extra * (G[3 * o2 + 1] - G[3 * o + 1]);
        gz += extra * (G[3 * o2 + 2] - G[3 * o + 2]);
      }
      pos[3 * v] = x * r; pos[3 * v + 1] = y * r; pos[3 * v + 2] = z * r;
      surfaceNormal(x, y, z, r, gx, gy, gz, _n);
      nor[3 * v] = _n[0]; nor[3 * v + 1] = _n[1]; nor[3 * v + 2] = _n[2];
      surfaceColorAt(F.rgb, T, M, di, k, _c);
      if (tr) {
        const w = tintAmt;
        _c[0] += (tr[0] - _c[0]) * w; _c[1] += (tr[1] - _c[1]) * w; _c[2] += (tr[2] - _c[2]) * w;
      }
      col[3 * v] = _c[0]; col[3 * v + 1] = _c[1]; col[3 * v + 2] = _c[2];
    }
  }
  const idx = gridIndex(0, i1 - i0, nP);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// 赤道面上的剖面：每一层一条环带（核是一整块圆盘）
export function capGeometry(F, upward = true, maxLayer = F.bodyN - 1) {
  const { nT, nP, M, R, dirs } = F;
  const eq = nT / 2;
  const cols = nP + 1;
  const pos = [], nor = [], lay = [], ss = [], idx = [];
  const ny = upward ? 1 : -1;
  for (let k = 0; k <= maxLayer; k++) {
    const base = pos.length / 3;
    for (let j = 0; j <= nP; j++) {
      const di = eq * cols + j;
      const x = dirs[3 * di], z = dirs[3 * di + 2];
      const rin = k === 0 ? 0 : R[(k - 1) * M + di];
      const rout = R[k * M + di];
      pos.push(x * rin, 0, z * rin, x * rout, 0, z * rout);
      nor.push(0, ny, 0, 0, ny, 0);
      lay.push(k, k);
      ss.push(0, 1);
    }
    for (let j = 0; j < nP; j++) {
      const inJ = base + 2 * j, outJ = inJ + 1, inJ1 = inJ + 2, outJ1 = inJ + 3;
      if (upward) idx.push(inJ, inJ1, outJ, outJ, inJ1, outJ1);
      else idx.push(inJ, outJ, inJ1, outJ, outJ1, inJ1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// 剥掉的层在剖面上留下的虚线轮廓：它将来会长到这么大
export function outlineGeometry(F, k, y = 0.004) {
  const { nT, nP, M, R, dirs } = F;
  const eq = nT / 2, cols = nP + 1;
  const pts = [];
  for (let j = 0; j <= nP; j++) {
    const di = eq * cols + j;
    const r = R[k * M + di];
    pts.push(new THREE.Vector3(dirs[3 * di] * r, y, dirs[3 * di + 2] * r));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return g;
}

// 某个方向上第 k 层的外边界半径（插值在网格上取最近的赤道点）
export function radiusAt(F, k, x, y, z) {
  const { nT, nP, M, R } = F;
  const th = Math.acos(Math.max(-1, Math.min(1, y)));
  let ph = Math.atan2(z, x);
  if (ph < 0) ph += Math.PI * 2;
  const i = Math.round((th / Math.PI) * nT);
  const j = Math.round((ph / (Math.PI * 2)) * nP);
  return R[k * M + i * (nP + 1) + j];
}

// 一个表面在极点方向上的半径，用来决定它浮在水面上多高
export function extents(F, k) {
  const { nT, nP, M, R } = F;
  const cols = nP + 1;
  let max = 0;
  for (let i = 0; i < (nT + 1) * cols; i++) max = Math.max(max, R[k * M + i]);
  return { top: R[k * M], bottom: R[k * M + nT * cols], max };
}
