// 从账本推导出“看得见的状态”（FormSpec）。
// 3D 舞台和所有卡片都只读这个结构，从不直接改账本。
// 每个字段都能在 BINDINGS 里找到它驱动的视觉细节（接口透视用）。

import { RULE, categoryIndex, layerSpec, restPose, practiceTint, PRACTICE_MINT } from './growth.js';
import { clamp01 } from './rng.js';
import { minutesBetween } from './time.js';

export const DEFAULT_POLICY = Object.freeze({ minComparisons: 30 });

// 一条细纹 = 一次合格比较：同一个问题，本体和影子各给一个概率，结果来了看谁更近。
export function lamellaStats(l) {
  const o = l.outcome ? 1 : 0;
  const sS = Math.abs(o - l.pShadow), sB = Math.abs(o - l.pBody);
  const winner = sS < sB - 1e-6 ? 'shadow' : sB < sS - 1e-6 ? 'body' : 'tie';
  return { surpriseShadow: sS, surpriseBody: sB, winner };
}

function histogram(list) {
  const h = {};
  for (const k of list) if (k) h[k] = (h[k] ?? 0) + 1;
  return h;
}

function deriveShadow(ledger, ctx) {
  const { cats, policy, layers } = ctx;
  const s = ledger.shadow;
  const lam = s?.lamellae ?? [];
  const n = lam.length;
  if (!s || (!s.category && n === 0)) {
    // 刚诞生或刚继承：倒影和它一模一样
    return {
      mode: 'mirror', n: 0, wins: 0, progress: 0, winRate: null, clarity: 1, agreement: 1,
      candidate: null, color: PRACTICE_MINT, lamellae: [], canInherit: false, need: policy.minComparisons,
    };
  }
  const stats = lam.map(lamellaStats);
  const wins = stats.filter((x) => x.winner === 'shadow').length;
  const progress = clamp01(n / policy.minComparisons);
  const winRate = n ? wins / n : 0.5;
  const q = clamp01((winRate - 0.3) / 0.4);
  // 倒影清晰度：练得越多、越常比本体更准，就越清楚
  const clarity = n === 0 ? 0.55 : 0.18 + 0.82 * Math.pow(progress, 0.65) * q;
  // 同步度：最近几次，本体和影子的判断有多接近（决定倒影跟随的延迟）
  const recent = lam.slice(-8);
  const dis = recent.length ? recent.reduce((a, l) => a + Math.abs(l.pBody - l.pShadow), 0) / recent.length : 0;
  const agreement = clamp01(1 - dis * 4);
  const mix = s.mix ?? (n ? histogram(lam.map((l) => l.category ?? s.category)) : { [s.category]: 1 });
  const candidate = layerSpec(
    {
      gen: layers.length + 1,
      category: s.category,
      comparisons: Math.max(n, policy.minComparisons),
      novelty: s.novelty ?? 0.6,
      mix,
      source: s.source,
      learned: s.learned,
      lamellae: lam,
    },
    layers.length,
    { ...ctx, prior: ledger.generations.slice(1) },
  );
  const catColor = cats.get(s.category)?.color;
  return {
    mode: 'practice', n, wins, progress, winRate, clarity, agreement, candidate,
    category: s.category, categoryLabel: cats.get(s.category)?.label, source: s.source, learned: s.learned,
    startedAt: s.startedAt, color: practiceTint(catColor, progress), catColor,
    lamellae: lam.map((l, i) => ({ ...l, ...stats[i] })),
    need: Math.max(0, policy.minComparisons - n),
    canInherit: n >= policy.minComparisons && winRate > 0.5,
  };
}

export function deriveView(ledger, rule = RULE) {
  const cats = categoryIndex(ledger.categories);
  const policy = { ...DEFAULT_POLICY, ...(ledger.policy ?? {}) };
  const gens = ledger.generations;
  const layers = gens.map((g, i) => layerSpec(g, i, { cats, policy, rule, prior: gens.slice(1, i) }));
  for (const L of layers) L.lamellae = L.lamellae.map((l) => ({ ...l, ...lamellaStats(l) }));
  const shadow = deriveShadow(ledger, { cats, policy, rule, layers });
  const now = ledger.now;
  const pending = ledger.predictions
    .filter((p) => p.status === 'sealed')
    .map((p) => {
      const total = Math.max(1, minutesBetween(p.sealedAt, p.deadline));
      const left = now ? minutesBetween(now, p.deadline) : total;
      return {
        ...p,
        color: cats.get(p.category)?.color ?? '#D9D2EA',
        categoryLabel: cats.get(p.category)?.label,
        remaining: clamp01(left / total), // 水滴离水面的高度
      };
    });
  const resolved = ledger.predictions.filter((p) => p.status === 'resolved');
  const pose = restPose(layers, rule);
  return {
    id: ledger.id,
    name: ledger.name,
    owner: ledger.owner,
    demo: !!ledger.demo,
    cats,
    categories: ledger.categories,
    policy,
    rule,
    layers,
    shadow,
    pending,
    lastResolved: resolved[resolved.length - 1] ?? null,
    pose,
    now,
    events: ledger.events,
    generations: gens,
  };
}

// 接口透视：每个视觉细节 ← 哪个数据字段。3D 舞台和 data-lens 都读这张表。
export const BINDINGS = [
  { id: 'form', element: '珍珠外形', visual: '轮廓与鼓包方向', field: 'generations[].mix · comparisons · novelty', when: '继承时', value: (v) => `${v.layers.length} 代` },
  { id: 'layers', element: '层', visual: '层数 = 代数', field: 'generations.length', when: '继承时', value: (v) => `${v.layers.length} 层` },
  { id: 'outer', element: '最外一层', visual: '颜色、厚度', field: 'generations[-1].category · comparisons', when: '继承时', value: (v) => { const L = v.layers[v.layers.length - 1]; return L.core ? '核' : `${v.cats.get(L.category)?.label} · ${L.n} 次`; } },
  { id: 'lamellae', element: '细纹', visual: '每层里的细线，一条 = 一次比较', field: 'generations[k].lamellae[]', when: '继承时冻结', value: (v) => `${v.layers.reduce((a, L) => a + L.lamellae.length, 0)} 条` },
  { id: 'pose', element: '静止姿态', visual: '重的一侧微微低一点', field: '由外形算出的质心', when: '继承时', value: (v) => `${((v.pose.angle * 180) / Math.PI).toFixed(1)}°` },
  { id: 'shadowShape', element: '倒影', visual: '比珍珠多出的那一层', field: 'shadow.lamellae.length / policy.minComparisons', when: '每次结果', value: (v) => (v.shadow.mode === 'mirror' ? '一模一样' : `${v.shadow.n}/${v.policy.minComparisons}`) },
  { id: 'clarity', element: '倒影清晰度', visual: '水下的模糊程度', field: 'shadow 胜率 × 练习进度', when: '每次结果', value: (v) => v.shadow.clarity.toFixed(2) },
  { id: 'lag', element: '倒影跟随', visual: '转动时倒影慢半拍', field: '最近 8 次 |p本体 − p影子|', when: '每次结果', value: (v) => `同步 ${v.shadow.agreement.toFixed(2)}` },
  { id: 'droplet', element: '水滴', visual: '悬着 = 已封存、未揭晓；越低越接近期限', field: 'predictions[status=sealed].deadline', when: '封存时 / 时间', value: (v) => (v.pending.length ? `${v.pending.length} 个待揭晓` : '无') },
  { id: 'glow', element: '微光', visual: '本体与倒影各自的亮度', field: 'prediction.pBody · pShadow', when: '封存时', value: (v) => (v.pending[0] ? `${Math.round(v.pending[0].pBody * 100)}% / ${Math.round(v.pending[0].pShadow * 100)}%` : '—') },
  { id: 'ripple', element: '涟漪', visual: '大小 = 这一次的意外程度', field: '|结果 − p影子|', when: '结果到来', value: (v) => (v.lastResolved ? (Math.abs((v.lastResolved.outcome ? 1 : 0) - v.lastResolved.pShadow)).toFixed(2) : '—') },
  { id: 'dirs', element: '方向', visual: '工作、家人、健康、朋友各占一侧', field: 'categories[].azimuth', when: '配置', value: (v) => `${v.categories.length} 类` },
  { id: 'breath', element: '呼吸', visual: '它在，但不是数据', field: '会话在场（不是学习）', when: '一直', value: () => '在场' },
];
