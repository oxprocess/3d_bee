// 学习账本：只追加、不改写。形态上的每一处变化，都对应这里的一条记录。
//
// 事件（与 App 四个标签一一对应）：
//   observe  对话   { text }                                  观察，形成此刻的状态
//   seal     预测   { prediction: { id, question, category, deadline, pBody, pShadow } }
//   prepare  准备   { id, items: [...] }                       依据预判先行动
//   resolve  成长   { id, outcome: true|false }                结果到来 → 影子更新（一次只更新，不取舍）
//   iterate  迭代时刻 {}                                        满足规则则继承，否则继续练
//   practice 新候选 { category, source, learned, novelty }      引擎给影子一个新的方法去练
//
// 形状：见 docs/spec.md 的“账本结构”。

import { deriveView, lamellaStats, DEFAULT_POLICY } from './view.js';

// 这一代的证据来自哪些类别（与倒影上候选层的算法一致）
function mixOf(lamellae, fallback) {
  const h = {};
  for (const l of lamellae) { const c = l.category ?? fallback; if (c) h[c] = (h[c] ?? 0) + 1; }
  return Object.keys(h).length ? h : { [fallback]: 1 };
}

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function normalizeLedger(input) {
  const L = clone(input);
  L.policy = { ...DEFAULT_POLICY, ...(L.policy ?? {}) };
  L.generations = L.generations?.length ? L.generations : [{ gen: 1, bornAt: L.now ?? '2026-01-01T09:00' }];
  L.generations.forEach((g, i) => { g.gen = i + 1; });
  L.predictions = L.predictions ?? [];
  L.events = L.events ?? [];
  if (L.shadow) L.shadow.lamellae = L.shadow.lamellae ?? [];
  return L;
}

export function canInherit(ledger) {
  return deriveView(ledger).shadow.canInherit;
}

export function reduce(ledger, ev) {
  const L = clone(ledger);
  const at = ev.at ?? L.now;
  if (at) L.now = at;
  let effect = { type: ev.type };
  switch (ev.type) {
    case 'observe':
      effect.text = ev.text;
      break;
    case 'seal': {
      const p = { status: 'sealed', sealedAt: at, ...ev.prediction };
      if (!p.id) p.id = `p${L.predictions.length + 1}`;
      L.predictions.push(p);
      effect.prediction = p;
      break;
    }
    case 'prepare': {
      const p = L.predictions.find((x) => x.id === ev.id);
      if (!p) return null;
      p.prepared = ev.items;
      p.preparedAt = at;
      effect.prediction = p;
      break;
    }
    case 'resolve': {
      const p = L.predictions.find((x) => x.id === ev.id);
      if (!p || p.status !== 'sealed') return null;
      p.status = 'resolved';
      p.outcome = !!ev.outcome;
      p.resolvedAt = at;
      if (ev.note) p.note = ev.note;
      if (!L.shadow || (!L.shadow.category && !L.shadow.lamellae?.length)) {
        L.shadow = {
          startedAt: at,
          category: p.category,
          source: ev.source ?? p.topic ?? p.question,
          learned: ev.learned ?? '正在从这类事里找更好的准备时机。',
          novelty: ev.novelty ?? 0.7,
          lamellae: [],
        };
      }
      const lam = { at, category: p.category, outcome: p.outcome, pBody: p.pBody, pShadow: p.pShadow, note: ev.note ?? p.topic ?? p.question, predictionId: p.id };
      L.shadow.lamellae.push(lam);
      const st = lamellaStats(lam);
      effect = { type: 'resolve', prediction: p, lamella: lam, ...st, category: p.category };
      break;
    }
    case 'iterate': {
      const v = deriveView(L);
      const s = v.shadow;
      if (s.mode === 'mirror') return null;
      if (!s.canInherit) {
        effect = { type: 'continue', reason: s.n < v.policy.minComparisons ? 'count' : 'accuracy', n: s.n, wins: s.wins, need: s.need };
        break;
      }
      const sh = L.shadow;
      const retired = L.generations[L.generations.length - 1];
      retired.retiredAt = at;
      const gen = {
        gen: L.generations.length + 1,
        bornAt: at,
        category: sh.category,
        source: sh.source,
        learned: sh.learned,
        comparisons: sh.lamellae.length,
        wins: s.wins,
        novelty: sh.novelty ?? 0.6,
        mix: sh.mix ?? mixOf(sh.lamellae, sh.category),
        lamellae: sh.lamellae,
      };
      L.generations.push(gen);
      L.shadow = { startedAt: at, lamellae: [] };
      effect = { type: 'inherit', generation: gen, retired: retired.gen };
      break;
    }
    case 'practice':
      L.shadow = { startedAt: at, category: ev.category, source: ev.source, learned: ev.learned, novelty: ev.novelty ?? 0.6, lamellae: [] };
      break;
    default:
      return null;
  }
  const seq = (L.events[L.events.length - 1]?.seq ?? 0) + 1;
  const logged = { ...clone(ev), at, seq, result: effect.type };
  L.events.push(logged);
  return { ledger: L, event: logged, effect };
}

// 一个极小的 store：dispatch 事件，订阅变化。所有模块共享同一个 store。
export function createStore(initial) {
  let ledger = normalizeLedger(initial);
  let view = deriveView(ledger);
  const subs = new Set();
  const emit = (change) => subs.forEach((fn) => fn(change));
  return {
    get ledger() { return ledger; },
    get view() { return view; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispatch(ev) {
      const res = reduce(ledger, ev);
      if (!res) return null;
      ledger = res.ledger;
      view = deriveView(ledger);
      const change = { event: res.event, effect: res.effect, view, ledger };
      emit(change);
      return change;
    },
    // 演示用的时钟：只移动“现在”，不写账本（时间流逝不改变形态，只让水滴离期限更近）
    setNow(at) {
      ledger = { ...ledger, now: at };
      view = deriveView(ledger);
      emit({ event: { type: 'clock', at }, effect: { type: 'clock', at }, view, ledger });
    },
    load(next, meta = {}) {
      ledger = normalizeLedger(next);
      view = deriveView(ledger);
      emit({ event: { type: 'load' }, effect: { type: 'load', ...meta }, view, ledger });
    },
  };
}
