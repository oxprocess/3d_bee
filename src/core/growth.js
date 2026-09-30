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
import { deepen, mixHex, hueOf } from './color.js';

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

// 类别围在水平一圈。y 轴朝上，+z 朝向观看者。
// 没有指定方位角时按色相排：相邻的两类事颜色也相邻，表面上颜色混合的地方是鲜亮的中间色，不会发灰。
export function categoryIndex(categories) {
  const n = categories.length || 1;
  const map = new Map();
  const order = categories.some((c) => c.azimuth == null)
    ? [...categories].sort((a, b) => hueOf(a.color) - hueOf(b.color))
    : categories;
  order.forEach((c, i) => {
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

// 菱形晶体（双锥）：赤道上每一类事一个角，上下两个尖。
// 第 k 代的外壳：朝类别 c 的角伸出 e_k(c) = R_k(d_c)（生长规则在那个方向上的半径）；
// 上下两个尖是框，不是数据：高度按赤道各角的平均远近定。轮廓参照那颗绿色的宝石：修长，上尖短、下尖长，
// 最宽的一圈在偏上的地方（高约为宽的 1.4 倍），像一颗悬着的晶体；哪一类事长得多，那个角就伸得远。
// R_k 一层比一层大，所以每一代都是一个完整的小晶体，一个套一个（像幻影水晶）。
// 类别少于 3 个时，用四个方向（0°、90°、180°、270°）撑起赤道。
export const DIAMOND = Object.freeze({ top: 1.22, bottom: 1.6 });

// 圆润：尖角让人本能地警觉，圆的轮廓让人想靠近（曲率偏好、bouba/kiki）。晶体保留菱形的身份，
// 棱和尖磨圆，用的是超椭圆——和 iOS 图标的圆角同一个道理，平的面到圆的棱曲率连续，找不到“圆角从哪里开始”：
//   把每个面到中心的相对距离 t = n·p / d 按 P 次方合起来，F(p) = (Σ max(0, t)^P)^(1/P)，表面是 F = 1
//   P 越大越接近尖锐的晶体；F 对 p 是一次齐次的，沿方向 ω 的半径直接是 r = g / F(ω)
//   几个面交在一起的地方磨得最多：两个面的棱收进去一点，四个面的角多一点；
//   上下两个尖再各加一个水平的面（在尖的高度的 tip 倍处），一起合进去，尖是一颗柔和的圆头
//   g 把磨圆时收进去的补回来：面的中间微微鼓出来，整颗更饱满（像一颗卵石，想握在手里）
//   F 对缩放不变：一代套一代的外壳，圆角也一层套一层（同心），像 Apple 的圆角与圆角之间那样对得上
export const SOFT = Object.freeze({ P: 10, g: 1.06, tip: 0.86 });

// 一层外壳的平面：上锥 n 个、下锥 n 个，再加上下两个圆头的面；每个面 n·p = d（法线朝外，d > 0），存成 [nx, ny, nz, 1/d, …]
export function shellPlaneList(az, eq, top, bottom, soft = SOFT) {
  const n = eq.length, planes = new Float64Array(n * 8 + (soft.tip ? 8 : 0));
  const V = eq.map((e, i) => [Math.cos(az[i]) * e, 0, Math.sin(az[i]) * e]);
  let o = 0;
  const face = (A, B, C) => {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    let d = nx * A[0] + ny * A[1] + nz * A[2];
    if (d < 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }
    planes.set([nx, ny, nz, 1 / Math.max(d, 1e-6)], o);
    o += 4;
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    face([0, top, 0], V[i], V[j]);
    face([0, -bottom, 0], V[i], V[j]);
  }
  if (soft.tip) {
    planes.set([0, 1, 0, 1 / (soft.tip * top)], o);
    planes.set([0, -1, 0, 1 / (soft.tip * bottom)], o + 4);
  }
  return planes;
}

// 圆润外壳在方向 (x, y, z)（单位向量）上离中心多远；给了 out，顺便写进那一点的法线（F 的梯度，朝外）
export function softPoint(planes, x, y, z, out = null, soft = SOFT) {
  const P = soft.P;
  let sum = 0, gx = 0, gy = 0, gz = 0;
  for (let o = 0; o < planes.length; o += 4) {
    const t = (planes[o] * x + planes[o + 1] * y + planes[o + 2] * z) * planes[o + 3];
    if (t <= 0) continue;
    const w = Math.pow(t, P - 1);
    sum += w * t;
    const wd = w * planes[o + 3];
    gx += wd * planes[o]; gy += wd * planes[o + 1]; gz += wd * planes[o + 2];
  }
  if (out) {
    const l = Math.hypot(gx, gy, gz) || 1;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
  }
  return sum > 0 ? soft.g / Math.pow(sum, 1 / P) : 0;
}

export function diamondField(view, { withCandidate = true, rule = view.rule ?? RULE } = {}) {
  let cats = [...view.cats.values()].sort((a, b) => a.az - b.az);
  if (cats.length < 3) cats = [0, 90, 180, 270].map((d) => ({ id: null, az: (d * Math.PI) / 180 }));
  const n = cats.length;
  const layers = view.layers.slice();
  const cand = withCandidate && view.shadow?.candidate ? view.shadow.candidate : null;
  if (cand) layers.push(cand);
  const dirs = new Float32Array((n + 2) * 3);
  cats.forEach((c, i) => dirs.set([Math.cos(c.az), 0, Math.sin(c.az)], 3 * i));
  dirs.set([0, 1, 0], 3 * n);
  dirs.set([0, -1, 0], 3 * (n + 1));
  const f = radiiField(layers, dirs, rule);
  const shells = layers.map((_, k) => {
    const eq = cats.map((_, i) => f.R[k * f.M + i]);
    const mean = eq.reduce((a, b) => a + b, 0) / n;
    return { eq, top: DIAMOND.top * mean, bottom: DIAMOND.bottom * mean };
  });
  return { n, cats, az: cats.map((c) => c.az), dirs, T: f.T, M: f.M, layers, shells, hasCandidate: !!cand, bodyN: view.layers.length };
}
