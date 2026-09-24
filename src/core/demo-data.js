// 演示数据：事情、次数、日期都是示意，用来展示生长规则，不是任何人的真实记录。
import { mulberry32, hashString, clamp } from './rng.js';
import { lerpIso, addMinutes } from './time.js';
import { lamellaStats } from './view.js';

export const CATEGORIES = [
  { id: 'work', label: '工作', color: '#F1D2A6', azimuth: 0 },
  { id: 'friends', label: '朋友', color: '#BFD5F2', azimuth: 90 },
  { id: 'family', label: '家人', color: '#EFC3CF', azimuth: 180 },
  { id: 'health', label: '健康', color: '#BFE6D6', azimuth: 270 },
];

const NOTES = {
  family: ['爸妈来电话问行程', '周末回家吃饭', '提醒爸妈带药', '爸妈问起酒店', '妈妈生日', '回家浇花', '爸爸体检', '家里网络坏了'],
  work: ['周一例会', '周报截止', '客户临时改需求', '季度汇报彩排', '评审会', '项目排期变动', '客户电话', '出差订票'],
  health: ['晚上跑步', '下雨改室内', '睡得太晚', '体检预约', '周末爬山', '颈椎不舒服'],
  friends: ['周末约饭', '朋友生日', '聚会改地点', '老同学来访', '一起看展', '借书还书'],
};

// 生成一代的细纹：每一条是一次比较。赢家的分布偏向后期——影子越练越准。
export function makeLamellae({ seed, n, wins, category, from, to }) {
  const rnd = mulberry32(seed);
  const idx = [...Array(n).keys()];
  const score = idx.map((i) => rnd() * 0.7 + (i / n) * 0.8);
  const winSet = new Set([...idx].sort((a, b) => score[b] - score[a]).slice(0, wins));
  const pool = NOTES[category] ?? ['一件事'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const outcome = rnd() < 0.68;
    const base = 0.5 + rnd() * 0.36;
    let pS = clamp(base + (rnd() - 0.5) * 0.18, 0.08, 0.95);
    let pB = clamp(base + (rnd() - 0.5) * 0.18, 0.08, 0.95);
    pS = Math.round(pS * 100) / 100;
    pB = Math.round(pB * 100) / 100;
    const o = outcome ? 1 : 0;
    const wantShadow = winSet.has(i);
    if (Math.abs(Math.abs(o - pS) - Math.abs(o - pB)) < 0.02) {
      pB = Math.round(clamp(pB + (o ? -0.06 : 0.06), 0.05, 0.97) * 100) / 100;
    }
    if (wantShadow !== Math.abs(o - pS) < Math.abs(o - pB)) [pS, pB] = [pB, pS];
    out.push({
      at: lerpIso(from, to, (i + 0.2 + rnd() * 0.6) / n),
      category,
      outcome,
      pBody: pB,
      pShadow: pS,
      note: pool[Math.floor(rnd() * pool.length)],
    });
  }
  return out;
}

function gen(g) {
  const seed = hashString(`${g.source}|${g.bornAt}|${g.category}`);
  const wins = g.wins ?? Math.ceil(g.comparisons * (0.56 + ((seed % 17) / 17) * 0.12));
  const from = g.from ?? addMinutes(g.bornAt, -26 * 24 * 60); // 这一代大约练了四周
  return {
    ...g,
    wins,
    lamellae: g.lamellae ?? makeLamellae({ seed, n: g.comparisons, wins, category: g.category, from, to: g.bornAt }),
  };
}

function shadow(s) {
  const seed = hashString(`${s.source}|${s.startedAt}`);
  return {
    ...s,
    lamellae: s.lamellae ?? makeLamellae({ seed, n: s.n, wins: s.wins, category: s.category, from: s.startedAt, to: s.until }),
  };
}

const CORE = (bornAt) => ({ gen: 1, bornAt, source: '诞生', learned: '一个完整的身份，还没有属于你的学习历史。' });

const base = (id, name, extra) => ({
  version: 1,
  id,
  name,
  demo: true,
  owner: { id: 'demo', name: '你' },
  policy: { minComparisons: 30 },
  categories: CATEGORIES,
  predictions: [],
  events: [],
  ...extra,
});

export const LEDGERS = {
  birth: base('birth', '诞生', {
    now: '2026-01-06T09:00',
    generations: [CORE('2026-01-06T09:00')],
    shadow: null,
  }),

  wide: base('wide', '宽展', {
    now: '2026-09-24T18:00',
    generations: [
      CORE('2026-01-06T09:00'),
      gen({ category: 'family', source: '爸妈出游的准备', comparisons: 34, novelty: 0.9, bornAt: '2026-03-18T21:40', learned: '出发前两天，先把酒店和药准备好。' }),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 38, novelty: 0.85, bornAt: '2026-04-22T22:10', learned: '例会前一晚，把上周的数字整理好。' }),
      gen({ category: 'health', source: '晚上的跑步', comparisons: 31, novelty: 0.9, bornAt: '2026-05-27T20:30', learned: '下雨的晚上，提前提醒换成室内。' }),
      gen({ category: 'friends', source: '朋友聚会', comparisons: 33, novelty: 0.85, bornAt: '2026-07-08T21:00', learned: '聚会前一天，先确认人数和地点。' }),
      gen({ category: 'family', source: '回家浇花的约定', comparisons: 36, novelty: 0.8, bornAt: '2026-09-02T19:20', learned: '出门超过三天，提前安排浇花。' }),
    ],
    shadow: shadow({ category: 'friends', source: '周末的约饭', learned: '约饭前两天，先问清楚大家的口味。', novelty: 0.8, n: 17, wins: 10, startedAt: '2026-09-03T08:00', until: '2026-09-23T21:00' }),
  }),

  tight: base('tight', '收束', {
    now: '2026-09-24T18:00',
    generations: [
      CORE('2026-01-06T09:00'),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 31, novelty: 0.18, bornAt: '2026-01-26T22:00', learned: '例会前一晚，把上周的数字整理好。' }),
      gen({ category: 'family', source: '给爸妈打电话', comparisons: 30, novelty: 0.15, bornAt: '2026-02-22T20:00', learned: '周日晚上提醒给爸妈打电话。' }),
      gen({ category: 'work', source: '每周五的周报', comparisons: 32, novelty: 0.12, bornAt: '2026-03-20T17:00', learned: '周五下午，先把本周要点列出来。' }),
      gen({ category: 'work', source: '客户电话', comparisons: 30, novelty: 0.2, bornAt: '2026-04-16T10:00', learned: '通话前十分钟，把上次的约定调出来。' }),
      gen({ category: 'family', source: '给爸妈打电话', comparisons: 31, novelty: 0.12, bornAt: '2026-05-17T20:00', learned: '爸妈生日前一周，提醒准备礼物。' }),
      gen({ category: 'work', source: '季度汇报', comparisons: 34, novelty: 0.22, bornAt: '2026-06-25T18:00', learned: '汇报前一周，先把材料整理齐。' }),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 30, novelty: 0.1, bornAt: '2026-07-20T22:00', learned: '例会议程提前一天发给大家。' }),
      gen({ category: 'family', source: '给爸妈打电话', comparisons: 31, novelty: 0.12, bornAt: '2026-08-16T20:00', learned: '天气变冷，提醒爸妈添衣。' }),
      gen({ category: 'work', source: '客户电话', comparisons: 33, novelty: 0.15, bornAt: '2026-09-15T11:00', learned: '客户提到的数字，当天记进项目表。' }),
    ],
    shadow: shadow({ category: 'work', source: '季度汇报', learned: '汇报前两周，先约好评审时间。', novelty: 0.2, n: 26, wins: 15, startedAt: '2026-09-16T08:00', until: '2026-09-23T21:00' }),
  }),

  lean: base('lean', '偏展', {
    now: '2026-09-24T18:00',
    generations: [
      CORE('2026-01-06T09:00'),
      gen({ category: 'family', source: '爸妈出游的准备', comparisons: 32, novelty: 0.8, bornAt: '2026-03-18T21:40', learned: '出发前两天，先把酒店和药准备好。' }),
      gen({ category: 'work', source: '新项目的立项', comparisons: 40, novelty: 0.95, bornAt: '2026-04-20T18:30', learned: '立项前，先把三个关键数字对齐。' }),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 38, novelty: 0.85, bornAt: '2026-05-25T22:10', learned: '例会前一晚，把上周的数字整理好。' }),
      gen({ category: 'work', source: '项目里程碑', comparisons: 36, novelty: 0.9, bornAt: '2026-06-29T19:00', learned: '里程碑前一周，先检查依赖项。' }),
      gen({ category: 'friends', source: '朋友聚会', comparisons: 30, novelty: 0.5, bornAt: '2026-07-20T21:00', learned: '聚会前一天，先确认人数和地点。' }),
      gen({ category: 'work', source: '客户验收', comparisons: 42, novelty: 0.95, bornAt: '2026-09-10T17:30', learned: '验收前三天，把演示环境准备好。' }),
    ],
    shadow: shadow({ category: 'work', source: '季度汇报', learned: '汇报前一周，先把材料整理齐。', novelty: 0.85, n: 12, wins: 7, startedAt: '2026-09-11T08:00', until: '2026-09-23T21:00' }),
  }),

  turn: base('turn', '转向', {
    now: '2026-09-24T18:00',
    generations: [
      CORE('2026-01-06T09:00'),
      gen({ category: 'family', source: '爸妈出游的准备', comparisons: 32, novelty: 0.4, bornAt: '2026-01-28T21:40', learned: '出发前两天，先把酒店和药准备好。' }),
      gen({ category: 'friends', source: '朋友聚会', comparisons: 33, novelty: 0.4, bornAt: '2026-02-25T21:00', learned: '聚会前一天，先确认人数和地点。' }),
      gen({ category: 'health', source: '晚上的跑步', comparisons: 31, novelty: 0.45, bornAt: '2026-03-25T20:30', learned: '下雨的晚上，提前提醒换成室内。' }),
      gen({ category: 'family', source: '回家浇花的约定', comparisons: 34, novelty: 0.35, bornAt: '2026-04-22T19:20', learned: '出门超过三天，提前安排浇花。' }),
      gen({ category: 'work', source: '新项目的立项', comparisons: 40, novelty: 0.95, bornAt: '2026-06-17T18:30', learned: '立项前，先把三个关键数字对齐。' }),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 38, novelty: 0.9, bornAt: '2026-07-22T22:10', learned: '例会前一晚，把上周的数字整理好。' }),
      gen({ category: 'work', source: '客户验收', comparisons: 42, novelty: 0.95, bornAt: '2026-09-09T17:30', learned: '验收前三天，把演示环境准备好。' }),
    ],
    shadow: shadow({ category: 'work', source: '季度汇报', learned: '汇报前一周，先把材料整理齐。', novelty: 0.85, n: 21, wins: 12, startedAt: '2026-09-10T08:00', until: '2026-09-23T21:00' }),
  }),

  // 两条线的故事：影子正在练“爸妈出游的准备”，差一次就满 30 次。
  story: base('story', '爸妈出游', {
    now: '2026-09-24T18:00',
    generations: [
      CORE('2026-01-06T09:00'),
      gen({ category: 'work', source: '每周一的项目例会', comparisons: 38, novelty: 0.85, bornAt: '2026-03-16T22:10', learned: '例会前一晚，把上周的数字整理好。' }),
      gen({ category: 'health', source: '晚上的跑步', comparisons: 31, novelty: 0.9, bornAt: '2026-04-29T20:30', learned: '下雨的晚上，提前提醒换成室内。' }),
      gen({ category: 'friends', source: '朋友聚会', comparisons: 33, novelty: 0.85, bornAt: '2026-06-10T21:00', learned: '聚会前一天，先确认人数和地点。' }),
      gen({ category: 'family', source: '回家浇花的约定', comparisons: 36, novelty: 0.8, bornAt: '2026-08-12T19:20', learned: '出门超过三天，提前安排浇花。' }),
    ],
    shadow: shadow({ category: 'family', source: '爸妈出游的准备', learned: '出发前两天，先把酒店和药准备好。', novelty: 0.9, n: 29, wins: 17, startedAt: '2026-08-13T08:00', until: '2026-09-23T21:00' }),
  }),
};

// 故事脚本：18:12 → 20:10，一件事如何同时走在事情线和形态线上。
export const STORY = {
  context: '此前，你聊过爸妈的出游安排、还没确定的酒店，以及带药和回家浇花的约定。',
  steps: [
    { key: 'observe', tab: '对话', event: { type: 'observe', at: '2026-09-24T18:12', text: '刚下班，有点累。' } },
    {
      key: 'seal', tab: '预测',
      event: {
        type: 'seal', at: '2026-09-24T18:12',
        prediction: { id: 'p-hotel', question: '今晚 22 点前，爸妈会找你确认住宿', topic: '爸妈问起酒店', category: 'family', deadline: '2026-09-24T22:00', pBody: 0.64, pShadow: 0.72 },
      },
    },
    {
      key: 'prepare', tab: '准备',
      event: { type: 'prepare', at: '2026-09-24T18:14', id: 'p-hotel', items: ['大理三天的天气', '订酒店：两晚，离古城近', '随身药盒：降压药、胃药', '家里的安排：浇花', '一键复制给爸妈'] },
    },
    { key: 'resolve', tab: '成长', event: { type: 'resolve', at: '2026-09-24T20:10', id: 'p-hotel', outcome: true, note: '爸妈来问了住宿' } },
    { key: 'iterate', tab: '成长', event: { type: 'iterate', at: '2026-09-24T23:00' } },
  ],
};

export const LEDGER_ORDER = ['wide', 'tight', 'lean', 'turn'];

// 供测试：确认演示数据自洽（每一代的次数与胜率都满足继承规则）
export function validateDemo() {
  const problems = [];
  for (const [id, L] of Object.entries(LEDGERS)) {
    L.generations.slice(1).forEach((g) => {
      if (g.comparisons < L.policy.minComparisons) problems.push(`${id} 第${g.gen ?? '?'}代 次数不足`);
      const w = g.lamellae.map(lamellaStats).filter((s) => s.winner === 'shadow').length;
      if (w / g.lamellae.length <= 0.5) problems.push(`${id} ${g.source} 胜率不足 ${w}/${g.lamellae.length}`);
    });
  }
  return problems;
}
