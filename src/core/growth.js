// 生长规则：账本里的每一代，怎样变成看得见的一层。
//
//   长在哪里   这一代的证据来自哪些类别（mix），就朝那些方向鼓。类别围在水平一圈。
//   长多厚     这一代经过的合格比较越多，这一层越厚（开平方，避免一代压倒一切）。
//   鼓多少     新的事（novelty 高）朝一侧鼓；同一件事再练（novelty 低）均匀地包一圈。
//   什么颜色   层色来自长出它的那件事；同一类事每多练一代，颜色深一点。
//   什么时候长 只有“继承”才会追加一层。时间流逝、触摸、预测都不改变结构。
//
// 形状 = 核 + 每一代的厚度之和。第 k 层的外边界是一个星形曲面 r = R_k(ω)，
// 因此可以解析地求法线，也可以对任意方向切开、剥开。

import { clamp01 } from './rng.js';
import { deepen, hexToRgb, mixHex } from './color.js';

export const RULE = Object.freeze({
  coreRadius: 0.5, // 诞生时的核，第 1 代
  baseThickness: 0.17, // 一代的基准厚度（规则单位）
  lobePower: 1.6, // 鼓包的宽窄
  verticalFalloff: 2.0, // 类别都在水平一圈：朝上下两极，定向生长减弱
  anisoMin: 0.08, // 同一件事再练：几乎均匀地包一圈
  anisoMax: 1.25, // 全新的事：明显朝那一侧鼓
  noveltyThickness: 0.5, // 新事让这一层更厚的比重
  deepenPerRepeat: 0.07, // 同类事每重复一代，层色加深
  worldScale: 0.74, // 规则单位 → 场景单位
});

export const PEARL_WHITE = '#EAE3F2';
export const PRACTICE_MINT = '#9FDCC6';

// 类别均匀围在水平一圈（可在数据里指定方位角）。y 轴朝上，+z 朝向观看者。
export function categoryIndex(categories) {
  const n = categories.length || 1;
  const map = new Map();
  categories.forEach((c, i) => {
    const deg = c.azimuth ?? (i * 360) / n;
    const az = (deg * Math.PI) / 180;
    map.set(c.id, { ...c, az, dir: [Math.cos(az), 0, Math.sin(az)] });
  });
  return map;
}

// 一代 → 一层的形状参数
export function layerSpec(gen, index, ctx) {
  const { cats, policy, rule = RULE, prior = [] } = ctx;
  if (index === 0) {
    return {
      index: 0,
      gen: gen.gen ?? 1,
      core: true,
      t: rule.coreRadius,
      a: 0,
      lobes: [],
      color: PEARL_WHITE,
      category: null,
      n: 0,
      novelty: 0,
      source: gen.source ?? '诞生',
      learned: gen.learned ?? '还没有属于你的学习历史。',
      bornAt: gen.bornAt,
      lamellae: gen.lamellae ?? [],
    };
  }
  const minC = policy.minComparisons;
  const n = Math.max(1, gen.comparisons ?? minC);
  const nov = clamp01(gen.novelty ?? 0.6);
  const t = rule.baseThickness * Math.sqrt(n / minC) * (1 - rule.noveltyThickness + rule.noveltyThickness * nov);
  const a = rule.anisoMin + (rule.anisoMax - rule.anisoMin) * nov;
  const mix = gen.mix ?? { [gen.category]: 1 };
  let sum = 0;
  for (const k in mix) if (cats.has(k)) sum += mix[k];
  const lobes = Object.entries(mix)
    .filter(([c]) => cats.has(c))
    .map(([c, w]) => ({ cat: c, dir: cats.get(c).dir, w: w / (sum || 1) }));
  const repeats = prior.filter((g) => g.category === gen.category).length;
  const baseColor = cats.get(gen.category)?.color ?? '#D9D2EA';
  return {
    index,
    gen: gen.gen ?? index + 1,
    core: false,
    t,
    a,
    lobes,
    color: deepen(baseColor, Math.min(0.28, repeats * rule.deepenPerRepeat)),
    baseColor,
    category: gen.category,
    n,
    wins: gen.wins,
    novelty: nov,
    repeats,
    source: gen.source,
    learned: gen.learned,
    bornAt: gen.bornAt,
    retiredAt: gen.retiredAt,
    lamellae: gen.lamellae ?? [],
  };
}

// 定向核 k(ω) = c^P · (1 − y²)^Q，c = (1 + ω·d)/2，峰值为 1。
// 厚度 = t · (1 + a·(k − k̄))：k̄ 是 k 在球面上的平均值，
// 所以“鼓多少”只是把同样多的厚度挪到那一侧，不会凭空变厚。
const meanCache = new Map();
export function kernel(rule = RULE) {
  const P = rule.lobePower, Q = rule.verticalFalloff;
  const key = `${P}|${Q}`;
  if (!meanCache.has(key)) {
    const n = 6000, dirs = fibonacciSphere(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const x = dirs[3 * i], y = dirs[3 * i + 1];
      s += Math.pow(0.5 * (1 + x), P) * Math.pow(Math.max(0, 1 - y * y), Q);
    }
    meanCache.set(key, s / n);
  }
  return { P, Q, mean: meanCache.get(key) };
}

// 第 k 层在方向 (x,y,z) 上的厚度；outGrad 为对方向的（环境空间）梯度
export function thicknessAt(L, x, y, z, K, outGrad) {
  if (L.core) {
    if (outGrad) outGrad[0] = outGrad[1] = outGrad[2] = 0;
    return L.t;
  }
  const { P, Q, mean } = K;
  let s = 0, gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < L.lobes.length; i++) {
    const lb = L.lobes[i], d = lb.dir;
    const c = 0.5 * (1 + x * d[0] + y * d[1] + z * d[2]);
    const cp = c > 1e-6 ? Math.pow(c, P - 1) : 0;
    s += lb.w * cp * c;
    const g = lb.w * P * cp * 0.5;
    gx += g * d[0]; gy += g * d[1]; gz += g * d[2];
  }
  const v = Math.max(0, 1 - y * y);
  const vq = Q === 0 ? 1 : Math.pow(v, Q);
  const k = L.t * L.a;
  if (outGrad) {
    const dv = Q === 0 || v <= 0 ? 0 : Q * Math.pow(v, Q - 1) * -2 * y;
    outGrad[0] = k * gx * vq;
    outGrad[1] = k * (gy * vq + s * dv);
    outGrad[2] = k * gz * vq;
  }
  return L.t + k * (s * vq - mean);
}

// 对一组方向求每一层的外边界 R、厚度 T 与梯度 G（累加）
export function radiiField(layers, dirs, rule = RULE) {
  const K = kernel(rule);
  const N = layers.length, M = dirs.length / 3;
  const R = new Float32Array(N * M), T = new Float32Array(N * M), G = new Float32Array(N * M * 3);
  const g = [0, 0, 0];
  for (let i = 0; i < M; i++) {
    const x = dirs[3 * i], y = dirs[3 * i + 1], z = dirs[3 * i + 2];
    let r = 0, gx = 0, gy = 0, gz = 0;
    for (let k = 0; k < N; k++) {
      const t = thicknessAt(layers[k], x, y, z, K, g);
      r += t; gx += g[0]; gy += g[1]; gz += g[2];
      const o = k * M + i;
      R[o] = r; T[o] = t;
      G[3 * o] = gx; G[3 * o + 1] = gy; G[3 * o + 2] = gz;
    }
  }
  return { R, T, G, N, M };
}

// 星形曲面 r = R(ω) 的法线：n ∝ R·ω − ∇ₛR
export function surfaceNormal(x, y, z, r, gx, gy, gz, out) {
  const gd = gx * x + gy * y + gz * z;
  const nx = r * x - (gx - gd * x), ny = r * y - (gy - gd * y), nz = r * z - (gz - gd * z);
  const l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
}

// 表面颜色：这个方向上是哪几代长出来的，就带哪几代的颜色（越外越新，权重越大）
export function surfaceColorAt(layerRgb, T, M, i, k, out) {
  let r = 0, g = 0, b = 0, ws = 0, wmax = 0;
  for (let j = 1; j <= k; j++) {
    const t = T[j * M + i];
    const w = t * t * (1 + 1.4 * (j / k));
    const c = layerRgb[j];
    r += c[0] * w; g += c[1] * w; b += c[2] * w; ws += w;
    if (w > wmax) wmax = w;
  }
  const white = layerRgb[0];
  if (ws <= 0) { out[0] = white[0]; out[1] = white[1]; out[2] = white[2]; return; }
  const dom = wmax / ws; // 这一侧越由一件事主导，颜色越饱满
  const s = 0.5 + 0.35 * dom;
  out[0] = white[0] + (r / ws - white[0]) * s;
  out[1] = white[1] + (g / ws - white[1]) * s;
  out[2] = white[2] + (b / ws - white[2]) * s;
}

export function layerRgbList(layers, mapColor = null) {
  return layers.map((L) => hexToRgb(mapColor ? mapColor(L.color, L.core) : L.color).map((v) => v / 255));
}

export function fibonacciSphere(n) {
  const out = new Float32Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    out[3 * i] = Math.cos(th) * r; out[3 * i + 1] = y; out[3 * i + 2] = Math.sin(th) * r;
  }
  return out;
}

// 质心决定它静止时的姿态：偏展的那一侧更重，会微微向那边低一点。
export function restPose(layers, rule = RULE) {
  const dirs = fibonacciSphere(420);
  const { R, N, M } = radiiField(layers, dirs, rule);
  let V = 0, mx = 0, my = 0, mz = 0, rs = 0, rmax = 0, rmin = Infinity;
  for (let i = 0; i < M; i++) {
    const r = R[(N - 1) * M + i];
    const r3 = r * r * r, r4 = r3 * r;
    V += r3; rs += r;
    mx += r4 * dirs[3 * i]; my += r4 * dirs[3 * i + 1]; mz += r4 * dirs[3 * i + 2];
    rmax = Math.max(rmax, r); rmin = Math.min(rmin, r);
  }
  const cx = (0.75 * mx) / V, cy = (0.75 * my) / V, cz = (0.75 * mz) / V;
  const h = Math.hypot(cx, cz), rMean = rs / M;
  const angle = h > 1e-5 ? Math.min(0.1, (h / rMean) * 0.45) : 0;
  const axis = h > 1e-5 ? [cz / h, 0, -cx / h] : [1, 0, 0];
  return { com: [cx, cy, cz], axis, angle, rMean, rMax: rmax, rMin: rmin };
}

// 候选层（倒影正在练的那一代）的颜色：类别色与练习的薄荷色之间
export function practiceTint(hex, progress) {
  return mixHex(PRACTICE_MINT, hex ?? PRACTICE_MINT, 0.18 + 0.22 * clamp01(progress));
}
